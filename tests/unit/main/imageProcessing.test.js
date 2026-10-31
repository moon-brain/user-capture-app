/**
 * Contract tests for imageProcessing.js against the real sharp
 *
 * These pin what the application relies on sharp to do, so that a sharp
 * upgrade that changes any of it fails here, by name, instead of showing up as
 * a sideways photo in a card or an export that grew past its limit. Run them
 * first after upgrading sharp.
 *
 * The test photos are made here: a stored image whose left half is red and
 * right half blue. With EXIF orientation 6 it is shown turned a quarter to
 * the right, so the red half is on top; "upright" is checked by looking at
 * the pixels, not only at the size.
 *
 * @jest-environment node
 */

jest.useRealTimers();

const sharp = require('sharp');
const imaging = require('../../../src/main/imageProcessing');

const RED = { r: 255, g: 0, b: 0 };
const BLUE = { r: 0, g: 0, b: 255 };

/**
 * A JPEG of width x height stored with the left half red and the right blue
 * @param {number} width
 * @param {number} height
 * @param {{orientation?: number, make?: string}} [options]
 */
async function makePhoto(width, height, { orientation, make } = {}) {
  const half = Math.floor(width / 2);
  let image = sharp({ create: { width, height, channels: 3, background: BLUE } })
    .composite([{
      input: { create: { width: half, height, channels: 3, background: RED } },
      left: 0,
      top: 0
    }]);
  // composite() runs last, so flatten it into pixels before adding metadata
  image = sharp(await image.jpeg({ quality: 95 }).toBuffer());
  if (make) image = image.withExif({ IFD0: { Make: make } });
  if (orientation) image = image.withMetadata({ orientation });
  return image.jpeg({ quality: 95 }).toBuffer();
}

/** Colour of the pixel at (x, y) of an image, as shown */
async function pixel(buffer, x, y) {
  const { data, info } = await sharp(buffer).rotate().raw().toBuffer({ resolveWithObject: true });
  const offset = (y * info.width + x) * info.channels;
  return { r: data[offset], g: data[offset + 1], b: data[offset + 2] };
}

function isColour(actual, expected) {
  // JPEG is lossy: close, not equal
  return ['r', 'g', 'b'].every((c) => Math.abs(actual[c] - expected[c]) < 40);
}

/** Size and orientation as stored in the output file */
async function stored(buffer) {
  const m = await sharp(buffer).metadata();
  return { width: m.width, height: m.height, orientation: m.orientation || 1, format: m.format, chroma: m.chromaSubsampling, exif: m.exif };
}

describe('imageProcessing (contract with sharp)', () => {
  let upright;
  let turned; // stored 400 x 200, shown 200 x 400 with red on top

  beforeAll(async () => {
    upright = await makePhoto(400, 200);
    turned = await makePhoto(400, 200, { orientation: 6, make: 'TestCam' });
  });

  describe('readImageInfo()', () => {
    it('should give the size and orientation as stored', async () => {
      expect(await imaging.readImageInfo(turned)).toEqual({ width: 400, height: 200, orientation: 6, format: 'jpeg' });
    });

    it('should give orientation 1 when the photo has none', async () => {
      expect((await imaging.readImageInfo(upright)).orientation).toBe(1);
    });

    it('should throw on a truncated file', async () => {
      await expect(imaging.readImageInfo(turned.subarray(0, 50))).rejects.toThrow();
    });

    it('should accept a file path as well as a buffer', async () => {
      const os = require('os');
      const path = require('path');
      const fs = require('fs');
      const file = path.join(os.tmpdir(), `imaging-contract-${process.pid}.jpg`);
      fs.writeFileSync(file, upright);
      try {
        expect((await imaging.readImageInfo(file)).width).toBe(400);
      } finally {
        fs.rmSync(file, { force: true });
      }
    });
  });

  describe('displaySize()', () => {
    it('should swap width and height for a photo turned a quarter', async () => {
      expect(await imaging.displaySize(turned)).toEqual({ width: 200, height: 400 });
    });

    it('should keep them for an upright photo', async () => {
      expect(await imaging.displaySize(upright)).toEqual({ width: 400, height: 200 });
    });
  });

  describe('encodeUprightJpeg()', () => {
    it('should turn the pixels and drop the orientation', async () => {
      const out = await stored(await imaging.encodeUprightJpeg(turned, { quality: 95 }));

      expect(out).toMatchObject({ width: 200, height: 400, orientation: 1, format: 'jpeg' });
    });

    it('should leave the red half on top', async () => {
      const buffer = await imaging.encodeUprightJpeg(turned, { quality: 95 });

      expect(isColour(await pixel(buffer, 100, 50), RED)).toBe(true);
      expect(isColour(await pixel(buffer, 100, 350), BLUE)).toBe(true);
    });
  });

  describe('fitInsideJpeg()', () => {
    it('should fit the photo, upright, inside the square', async () => {
      const out = await stored(await imaging.fitInsideJpeg(turned, { box: 100, quality: 80 }));

      expect(out).toMatchObject({ width: 50, height: 100, orientation: 1, format: 'jpeg' });
    });

    it('should never enlarge a photo already inside the square', async () => {
      const out = await stored(await imaging.fitInsideJpeg(upright, { box: 1000, quality: 80 }));

      expect(out).toMatchObject({ width: 400, height: 200 });
    });

    it('should turn a photo even when it needs no resizing', async () => {
      const buffer = await imaging.fitInsideJpeg(turned, { box: 1000, quality: 90 });

      expect(await stored(buffer)).toMatchObject({ width: 200, height: 400, orientation: 1 });
      expect(isColour(await pixel(buffer, 100, 50), RED)).toBe(true);
    });

    it('should give a smaller file at a lower quality', async () => {
      // The export steps the quality down until the file fits its limit
      const noisy = await sharp({ create: { width: 600, height: 600, channels: 3, noise: { type: 'gaussian', mean: 128, sigma: 60 } } })
        .jpeg({ quality: 95 }).toBuffer();

      const high = await imaging.fitInsideJpeg(noisy, { box: 600, quality: 90 });
      const low = await imaging.fitInsideJpeg(noisy, { box: 600, quality: 60 });

      expect(low.length).toBeLessThan(high.length);
    });
  });

  describe('coverJpeg()', () => {
    it('should give exactly the size asked for, upright', async () => {
      const buffer = await imaging.coverJpeg(turned, { width: 90, height: 120, quality: 80 });

      expect(await stored(buffer)).toMatchObject({ width: 90, height: 120, orientation: 1, format: 'jpeg' });
      expect(isColour(await pixel(buffer, 45, 10), RED)).toBe(true);
      expect(isColour(await pixel(buffer, 45, 110), BLUE)).toBe(true);
    });
  });

  describe('cropJpeg()', () => {
    // The top quarter of the photo as shown: all red
    const area = { left: 0, top: 0, width: 200, height: 100 };

    it('should cut the rectangle in pixels of the photo as shown', async () => {
      const buffer = await imaging.cropJpeg(turned, area, { quality: 95 });

      expect(await stored(buffer)).toMatchObject({ width: 200, height: 100, orientation: 1 });
      expect(isColour(await pixel(buffer, 100, 50), RED)).toBe(true);
    });

    it('should keep the camera data', async () => {
      const { exif } = await stored(await imaging.cropJpeg(turned, area, { quality: 95 }));

      expect(exif && exif.includes('TestCam')).toBe(true);
    });

    it('should not subsample the colour', async () => {
      expect((await stored(await imaging.cropJpeg(turned, area, { quality: 95 }))).chroma).toBe('4:4:4');
    });

    it('should reject a rectangle outside the photo', async () => {
      await expect(imaging.cropJpeg(turned, { left: 150, top: 0, width: 100, height: 100 }, { quality: 95 }))
        .rejects.toThrow();
    });
  });

  describe('fitHeightPng()', () => {
    let logo;

    beforeAll(async () => {
      // A logo with a transparent background, as schools usually have
      logo = await sharp({ create: { width: 600, height: 300, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
        .png().toBuffer();
    });

    it('should bring it down to the height, keeping its proportions', async () => {
      const result = await imaging.fitHeightPng(logo, { height: 180 });

      expect(result).toMatchObject({ width: 360, height: 180 });
      expect((await stored(result.buffer)).format).toBe('png');
    });

    it('should keep the transparency', async () => {
      const { buffer } = await imaging.fitHeightPng(logo, { height: 180 });

      expect((await sharp(buffer).metadata()).hasAlpha).toBe(true);
    });

    it('should never enlarge a small logo', async () => {
      const small = await sharp({ create: { width: 100, height: 50, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer();

      expect(await imaging.fitHeightPng(small, { height: 180 })).toMatchObject({ width: 100, height: 50 });
    });
  });
});
