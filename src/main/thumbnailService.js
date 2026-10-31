// @ts-check
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
// It loads sharp on first use: thumbnails are not needed at boot
const imaging = require('./imageProcessing');

const SUPPORTED_EXTENSIONS = new Set(['.jpg', '.jpeg']);

// Nothing was ever deleted from the cache, so it only grew. This ceiling is far
// above what it holds in real use (a few MB): it is there for when something
// goes wrong, not a size to run against. A prune goes down to KEEP_FRACTION of
// it, or every thumbnail built afterwards would trigger another one.
const DEFAULT_MAX_BYTES = 200 * 1024 * 1024;
const KEEP_FRACTION = 0.8;

// A generation writes under a temporary name: one left behind by a crash is
// rubbish, but one from a generation in flight is not
const ABANDONED_TEMP_MS = 5 * 60 * 1000;

/**
 * Whether two file times are the same moment
 *
 * `utimes` keeps whole milliseconds, so a time read back is the source's time
 * rounded. Comparing the raw values would never match, and every thumbnail
 * would be built again on every read.
 *
 * @private
 */
function sameMoment(a, b) {
  return Math.round(a) === Math.round(b);
}

/**
 * Thumbnail Service
 *
 * Builds and caches small copies of user photos.
 *
 * Photos are full resolution ID pictures, but most of the interface shows them
 * at 32 or 150 pixels. Pointing an <img> at the original makes the browser
 * decode megapixels to paint a thumbnail, once per image and again whenever the
 * row is recycled, which is the single largest cost in the user list.
 */
class ThumbnailService {
  /**
   * @param {string} cacheDir - Folder to keep generated thumbnails in
   * @param {Object} logger - Logger instance
   */
  constructor(cacheDir, logger) {
    this.cacheDir = cacheDir;
    this.logger = logger;

    // Generations in flight, so a screenful of rows asking for the same photo
    // at once produces one resize instead of many
    this.pending = new Map();
    this.cacheDirReady = null;
  }

  /**
   * @param {string} filePath
   * @returns {boolean} True if the file is a format we can resize
   */
  isSupported(filePath) {
    return SUPPORTED_EXTENSIONS.has(path.extname(filePath).toLowerCase());
  }

  /**
   * @private
   */
  ensureCacheDir() {
    if (!this.cacheDirReady) {
      this.cacheDirReady = fs.promises.mkdir(this.cacheDir, { recursive: true });
    }

    return this.cacheDirReady;
  }

  /**
   * Name a cached thumbnail after the source it came from
   *
   * Only the path and the size: one photo has one thumbnail per size, for as
   * long as the photo exists. The modification time used to be part of the
   * name, so every replacement or rotation left the previous thumbnail behind
   * for good, under a name nothing would ever ask for again. It now lives in
   * the cached file's own modification time, so a photo that changes
   * overwrites its thumbnail instead of orphaning it.
   *
   * @private
   */
  cacheKey(sourcePath, size) {
    const hash = crypto
      .createHash('sha1')
      .update(`${sourcePath.toLowerCase()}|${size}`)
      .digest('hex');

    return `${hash}.jpg`;
  }

  /**
   * Whether the cached thumbnail was built from the photo as it is now
   * @private
   */
  async isFresh(cachePath, sourceMtimeMs) {
    try {
      const cached = await fs.promises.stat(cachePath);
      return sameMoment(cached.mtimeMs, sourceMtimeMs);
    } catch (error) {
      // Not built yet
      return false;
    }
  }

  /**
   * Path to a cached thumbnail, building it if it does not exist yet
   *
   * @param {string} sourcePath - Absolute path of the original image
   * @param {number} size - Longest side, in pixels
   * @returns {Promise<string>} Path of the thumbnail on disk
   */
  async getThumbnail(sourcePath, size) {
    const stats = await fs.promises.stat(sourcePath);
    const cachePath = path.join(this.cacheDir, this.cacheKey(sourcePath, size));

    if (await this.isFresh(cachePath, stats.mtimeMs)) {
      return cachePath;
    }

    const inFlight = this.pending.get(cachePath);
    if (inFlight) {
      return inFlight;
    }

    const work = this.generate(sourcePath, cachePath, size, stats).finally(() => {
      this.pending.delete(cachePath);
    });

    this.pending.set(cachePath, work);
    return work;
  }

  /**
   * @private
   */
  async generate(sourcePath, cachePath, size, stats) {
    await this.ensureCacheDir();

    // Written under a temporary name first, so an interrupted write cannot
    // leave a truncated file that later reads would accept as a thumbnail
    const tempPath = `${cachePath}.${process.pid}.tmp`;

    try {
      const thumbnail = await imaging.fitInsideJpeg(sourcePath, { box: size, quality: 80 });
      await fs.promises.writeFile(tempPath, thumbnail);

      // Stamped before the rename, so the file is never in place carrying the
      // wrong time: that time is what says which photo it was built from
      await fs.promises.utimes(tempPath, stats.atime, stats.mtime);
      await fs.promises.rename(tempPath, cachePath);
      return cachePath;
    } catch (error) {
      await fs.promises.rm(tempPath, { force: true }).catch(() => {});
      throw error;
    }
  }

  /**
   * Keep the cache under its ceiling, dropping the oldest thumbnails
   *
   * What a thumbnail belongs to cannot be told from its name, which is a hash,
   * so which ones are orphaned is unknowable: photos and whole projects get
   * deleted and their thumbnails stay behind. This does not try to know. It
   * caps the folder, and the worst it can do is drop one still in use, which
   * costs the resize that built it.
   *
   * Age here is the creation time, when the thumbnail was built, not the
   * modification time, which now carries the photo's own.
   *
   * @param {number} [maxBytes]
   * @returns {Promise<{removed: number, bytes: number, total: number}>}
   */
  async pruneCache(maxBytes = DEFAULT_MAX_BYTES) {
    const done = { removed: 0, bytes: 0, total: 0 };

    let names;
    try {
      names = await fs.promises.readdir(this.cacheDir);
    } catch (error) {
      // Nothing cached yet
      return done;
    }

    const now = Date.now();
    const entries = [];

    for (const name of names) {
      const filePath = path.join(this.cacheDir, name);
      let stats;

      try {
        stats = await fs.promises.stat(filePath);
      } catch (error) {
        continue;
      }

      if (!stats.isFile()) {
        continue;
      }

      // Eviction goes by when the thumbnail was built, since its modification
      // time now carries the photo's own. A temporary file never gets that
      // stamp (it is applied just before the rename), so its own modification
      // time is when the generation wrote it.
      const born = stats.birthtimeMs || stats.mtimeMs;

      if (name.endsWith('.tmp') && now - stats.mtimeMs > ABANDONED_TEMP_MS) {
        await this.remove(filePath, done);
        continue;
      }

      done.total += stats.size;
      entries.push({ filePath, size: stats.size, born });
    }

    if (done.total > maxBytes) {
      // Oldest first, until the folder is comfortably back under the ceiling
      entries.sort((a, b) => a.born - b.born);
      const target = maxBytes * KEEP_FRACTION;
      let held = done.total;

      for (const entry of entries) {
        if (held <= target) {
          break;
        }

        if (await this.remove(entry.filePath, done)) {
          held -= entry.size;
        }
      }
    }

    if (done.removed > 0) {
      this.logger.info(
        `Thumbnail cache pruned: ${done.removed} files, ${Math.round(done.bytes / 1024)} KB`
      );
    }

    return done;
  }

  /**
   * @private
   * @returns {Promise<boolean>} Whether the file is gone
   */
  async remove(filePath, done) {
    try {
      const { size } = await fs.promises.stat(filePath);
      await fs.promises.rm(filePath, { force: true });
      done.removed++;
      done.bytes += size;
      return true;
    } catch (error) {
      // Another window may be reading it; the next prune picks it up
      return false;
    }
  }

  /**
   * What the cache holds right now
   * @returns {Promise<{files: number, bytes: number}>}
   */
  async measureCache() {
    const measure = { files: 0, bytes: 0 };

    let names;
    try {
      names = await fs.promises.readdir(this.cacheDir);
    } catch (error) {
      return measure;
    }

    for (const name of names) {
      try {
        const stats = await fs.promises.stat(path.join(this.cacheDir, name));

        if (stats.isFile()) {
          measure.files++;
          measure.bytes += stats.size;
        }
      } catch (error) {
        // Gone between the listing and the stat
      }
    }

    return measure;
  }

  /**
   * Delete every cached thumbnail
   * @returns {Promise<void>}
   */
  async clearCache() {
    this.cacheDirReady = null;

    try {
      await fs.promises.rm(this.cacheDir, { recursive: true, force: true });
      this.logger.info('Thumbnail cache cleared');
    } catch (error) {
      this.logger.warning(`Could not clear the thumbnail cache: ${error.message}`);
    }
  }
}

module.exports = Object.assign(ThumbnailService, { DEFAULT_MAX_BYTES });
