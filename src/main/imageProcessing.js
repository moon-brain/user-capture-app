// @ts-check
/**
 * Every image operation the application does, in one place
 *
 * This is the only module that uses sharp (dependencyBoundaries.test.js checks
 * it). Each function is one thing the application needs, named after it
 * rather than after sharp's API, so an upgrade of sharp is checked by
 * imageProcessing.test.js, which runs these against the real library, instead
 * of by reading every caller.
 *
 * All of them respect the EXIF orientation: what comes out is upright, the
 * way the photo is shown.
 */

// Loaded on first use rather than at startup. sharp is a native module built
// on libvips and loading it is slow enough to be worth deferring until an
// image is actually processed
/** @type {typeof import('sharp') | null} */
let sharpModule = null;

/**
 * @param {Buffer|string} input - file contents or path
 * @returns {import('sharp').Sharp}
 */
function sharp(input) {
  if (!sharpModule) {
    sharpModule = require('sharp');
  }
  return sharpModule(input);
}

/**
 * Size, orientation and format as stored, read from the header
 *
 * Throws on a file that is not an image or is truncated, which is worth
 * knowing before it is copied anywhere.
 *
 * @param {Buffer|string} input
 * @returns {Promise<{width: number, height: number, orientation: number, format: string}>}
 *   orientation is the EXIF value, 1 when there is none
 */
async function readImageInfo(input) {
  const metadata = await sharp(input).metadata();
  return {
    width: metadata.width,
    height: metadata.height,
    orientation: metadata.orientation || 1,
    format: metadata.format
  };
}

/**
 * Width and height of a photo as shown, after its EXIF orientation
 * @param {Buffer|string} input
 * @returns {Promise<{width: number, height: number}>}
 */
async function displaySize(input) {
  const { width, height, orientation } = await readImageInfo(input);
  // Orientations 5 to 8 turn the photo a quarter: width and height swap
  const swapped = orientation >= 5 && orientation <= 8;
  return swapped ? { width: height, height: width } : { width, height };
}

/**
 * The photo upright as a JPEG, at its own size
 *
 * Turning the pixels cannot be done without re-encoding, so it is only for a
 * photo whose orientation tag says it is not upright, or that is not a JPEG.
 *
 * @param {Buffer|string} input
 * @param {{quality: number}} options
 * @returns {Promise<Buffer>}
 */
async function encodeUprightJpeg(input, { quality }) {
  return sharp(input).rotate().jpeg({ quality }).toBuffer();
}

/**
 * The photo upright as a JPEG that fits in a square, never enlarged
 *
 * Used for exports with a size limit and for thumbnails. A photo already
 * inside the square keeps its size.
 *
 * @param {Buffer|string} input
 * @param {{box: number, quality: number}} options - box: side of the square, in pixels
 * @returns {Promise<Buffer>}
 */
async function fitInsideJpeg(input, { box, quality }) {
  const { width, height } = await readImageInfo(input);
  const instance = sharp(input).rotate();

  if (width > box || height > box) {
    instance.resize(box, box, { fit: 'inside', withoutEnlargement: true });
  }

  return instance.jpeg({ quality }).toBuffer();
}

/**
 * The photo upright as a JPEG of exactly this size, filling it and cutting
 * what is left over, centred (the cells of the photo roster PDF)
 *
 * @param {Buffer|string} input
 * @param {{width: number, height: number, quality: number}} options
 * @returns {Promise<Buffer>}
 */
async function coverJpeg(input, { width, height, quality }) {
  return sharp(input)
    .rotate()
    .resize(width, height, { fit: 'cover' })
    .jpeg({ quality })
    .toBuffer();
}

/**
 * A rectangle of the photo, as a JPEG that keeps the camera's data
 *
 * The rectangle is in pixels of the photo as shown (see displaySize()). The
 * EXIF data and the colour profile are kept, with the orientation set to 1
 * since the pixels come out upright, and the colour is not subsampled (4:4:4)
 * so the one loss of a crop stays small.
 *
 * @param {Buffer|string} input
 * @param {{left: number, top: number, width: number, height: number}} area - whole pixels
 * @param {{quality: number}} options
 * @returns {Promise<Buffer>}
 */
async function cropJpeg(input, area, { quality }) {
  return sharp(input)
    .rotate()
    .extract(area)
    .keepExif()
    .keepIccProfile()
    .jpeg({ quality, chromaSubsampling: '4:4:4' })
    .toBuffer();
}

/**
 * An image as a PNG no taller than this, never enlarged, keeping its
 * transparency (the school logo in the PDFs)
 *
 * @param {Buffer|string} input
 * @param {{height: number}} options
 * @returns {Promise<{buffer: Buffer, width: number, height: number}>}
 */
async function fitHeightPng(input, { height }) {
  const buffer = await sharp(input)
    .resize({ height, withoutEnlargement: true })
    .png()
    .toBuffer();
  const info = await readImageInfo(buffer);
  return { buffer, width: info.width, height: info.height };
}

module.exports = {
  readImageInfo,
  displaySize,
  encodeUprightJpeg,
  fitInsideJpeg,
  coverJpeg,
  cropJpeg,
  fitHeightPng
};
