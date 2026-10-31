// @ts-check
/**
 * Image crop - crop a captured photo, keeping its original to start again
 *
 * Unlike turning (imageOrientation.js), cropping changes the pixels, so the
 * photo is compressed again. To keep that from piling up and to allow going
 * back, the first crop moves a copy of the photo as it was to Originales/
 * next to it, and every later crop starts from that copy, not from the last
 * crop. The photo keeps its name, so it stays linked to its user.
 *
 * The listing of imports only reads the files at its top level, so the
 * Originales folder never shows up as a photo.
 *
 * The rectangle is in the pixels of the photo as shown, which is after its
 * EXIF orientation: the cropped photo is written upright, with orientation 1,
 * and the rest of the EXIF data (camera, date) is kept.
 */

const fs = require('fs');
const path = require('path');
const imaging = require('./imageProcessing');

const ORIGINALS_FOLDER = 'Originales';
const JPEG_QUALITY = 95;

/**
 * Where the original of a captured photo is kept
 * @param {string} imagePath
 * @returns {string}
 */
function originalPathFor(imagePath) {
  return path.join(path.dirname(imagePath), ORIGINALS_FOLDER, path.basename(imagePath));
}

/**
 * @param {string} imagePath
 * @returns {boolean}
 */
function hasOriginal(imagePath) {
  return fs.existsSync(originalPathFor(imagePath));
}

// Width and height of a photo as shown, after its EXIF orientation. Still
// exported from here, where the crop handlers have always taken it
const { displaySize } = imaging;

/**
 * The rectangle in whole pixels, or an error if it does not fit the photo
 * @param {{left: number, top: number, width: number, height: number}} rect
 * @param {{width: number, height: number}} size
 * @returns {{left: number, top: number, width: number, height: number}}
 */
function checkRect(rect, size) {
  // Numbers only: Number(null) or Number('') would pass as 0
  const values = ['left', 'top', 'width', 'height']
    .map((key) => (rect && typeof rect[key] === 'number' ? Math.round(rect[key]) : NaN));
  const [left, top, width, height] = values;

  if (values.some((value) => !Number.isFinite(value))) {
    throw new Error('Recorte no válido');
  }
  if (left < 0 || top < 0 || width < 1 || height < 1 ||
      left + width > size.width || top + height > size.height) {
    throw new Error('El recorte se sale de la foto');
  }
  return { left, top, width, height };
}

/**
 * Write a file under a temporary name and rename it over the target, so a
 * failure halfway never leaves a truncated photo
 * @private
 */
async function replaceFile(filePath, data) {
  const temp = path.join(path.dirname(filePath), `.${path.basename(filePath)}.${process.pid}.tmp`);
  try {
    await fs.promises.writeFile(temp, data);
    await fs.promises.rename(temp, filePath);
  } catch (error) {
    await fs.promises.rm(temp, { force: true }).catch(() => {});
    throw error;
  }
}

/**
 * Crop a captured photo in place
 *
 * @param {string} imagePath
 * @param {{left: number, top: number, width: number, height: number}} rect -
 *   in pixels of the original as shown
 * @returns {Promise<{width: number, height: number}>} size of the cropped photo
 */
async function cropImageFile(imagePath, rect) {
  const originalPath = originalPathFor(imagePath);

  // Never overwritten: once kept, it is the one every crop starts from
  if (!fs.existsSync(originalPath)) {
    await fs.promises.mkdir(path.dirname(originalPath), { recursive: true });
    await fs.promises.copyFile(imagePath, originalPath, fs.constants.COPYFILE_EXCL);
  }

  const source = await fs.promises.readFile(originalPath);
  const area = checkRect(rect, await displaySize(source));

  const output = await imaging.cropJpeg(source, area, { quality: JPEG_QUALITY });

  await replaceFile(imagePath, output);
  return { width: area.width, height: area.height };
}

/**
 * Put the original back in place of the cropped photo
 *
 * The original leaves Originales, and the folder goes too when it is left
 * empty. The next crop keeps a new copy.
 *
 * @param {string} imagePath
 */
async function restoreOriginal(imagePath) {
  const originalPath = originalPathFor(imagePath);
  if (!fs.existsSync(originalPath)) {
    throw new Error('Esta foto no tiene un original guardado');
  }

  await fs.promises.rename(originalPath, imagePath);
  // The original kept its old date; the photo just changed, and the
  // thumbnail cache goes by the date
  const now = new Date();
  await fs.promises.utimes(imagePath, now, now).catch(() => {});
  await fs.promises.rmdir(path.dirname(originalPath)).catch(() => {
    // Not empty: other photos keep their originals there
  });
}

module.exports = {
  ORIGINALS_FOLDER,
  originalPathFor,
  hasOriginal,
  displaySize,
  checkRect,
  cropImageFile,
  restoreOriginal
};
