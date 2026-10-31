// @ts-check
const { protocol } = require('electron');
const fs = require('fs');
const path = require('path');

const SCHEME = 'app-img';

// Long enough for the browser to keep images across scrolling and re-renders.
// Safe because a URL only ever refers to one version of an image: captured
// files get a unique name, and repository URLs carry a version that changes
// whenever the repository does.
const CACHE_CONTROL = 'public, max-age=3600';

/**
 * Declare the scheme before the app is ready
 *
 * Must run at load time: Electron only accepts privileged scheme registration
 * before the ready event.
 */
function registerImageProtocolScheme() {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        stream: true
      }
    }
  ]);
}

/**
 * @private
 */
function isInsideAllowedRoot(candidate, roots) {
  // Windows paths differ only by case, so compare case-insensitively
  const target = path.resolve(candidate).toLowerCase();

  return roots.some((root) => {
    if (!root) {
      return false;
    }

    const base = path.resolve(root).toLowerCase();
    return target === base || target.startsWith(base + path.sep);
  });
}

/**
 * Serve user photos over a custom scheme
 *
 * Images are requested as app-img://img/?path=<encoded>&size=<pixels>. Passing
 * the path as an encoded query parameter is what makes characters that break a
 * file:// URL (#, %, spaces, accents) survive, and the optional size selects a
 * cached thumbnail instead of the full resolution original.
 *
 * @param {Object} context
 * @param {InstanceType<typeof import('../thumbnailService')>} context.thumbnailService
 * @param {Function} context.getAllowedRoots - Folders images may be served from
 * @param {Object} context.logger
 */
function registerImageProtocol({ thumbnailService, getAllowedRoots, logger }) {
  protocol.handle(SCHEME, async (request) => {
    let requestedPath = null;

    try {
      const url = new URL(request.url);
      requestedPath = url.searchParams.get('path');

      if (!requestedPath) {
        return new Response('Missing path', { status: 400 });
      }

      const sourcePath = path.resolve(requestedPath);

      // The renderer should only ever ask for project images. Anything else is
      // a bug or worse, so it is refused rather than read off disk.
      if (!isInsideAllowedRoot(sourcePath, getAllowedRoots())) {
        logger.warning(`[Images] Refused a path outside the project: ${sourcePath}`);
        return new Response('Forbidden', { status: 403 });
      }

      if (!thumbnailService.isSupported(sourcePath)) {
        return new Response('Unsupported image type', { status: 415 });
      }

      const size = Number.parseInt(url.searchParams.get('size'), 10);
      let filePath = sourcePath;

      if (Number.isFinite(size) && size > 0) {
        try {
          filePath = await thumbnailService.getThumbnail(sourcePath, size);
        } catch (error) {
          // A thumbnail is an optimisation. If it cannot be built, showing the
          // original beats showing a broken image.
          logger.warning(`[Images] Falling back to the original for ${sourcePath}: ${error.message}`);
          filePath = sourcePath;
        }
      }

      const body = await fs.promises.readFile(filePath);

      return new Response(body, {
        status: 200,
        headers: {
          'Content-Type': 'image/jpeg',
          'Cache-Control': CACHE_CONTROL
        }
      });
    } catch (error) {
      if (error.code !== 'ENOENT') {
        logger.warning(`[Images] Could not serve ${requestedPath}: ${error.message}`);
      }

      return new Response('Image not found', { status: 404 });
    }
  });
}

module.exports = { SCHEME, registerImageProtocolScheme, registerImageProtocol, isInsideAllowedRoot };
