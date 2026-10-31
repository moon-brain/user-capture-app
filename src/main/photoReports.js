// @ts-check
/**
 * PDF reports on who still lacks a photo
 *
 * Two kinds: the list of users without a photo (captured or in the
 * repository), a page per group so each one can be handed to its tutor, and
 * the photos by group statistics, the Ver > Fotografías por grupo window on
 * paper. This module groups and draws; exportHandlers.js gathers the users,
 * reads the repository and decides where the file goes.
 */

const fs = require('fs');
const { compareUsersByName } = require('./utils/nameOrder');
// The window's own rules, so the paper and the screen agree on what 100 %
// means and which colour a group gets
const {
  coverageRatio,
  coveragePercent,
  heatHue,
  sortGroups,
  summarize
} = require('../renderer/group-coverage');

const DELETED_GROUP = 'ELIMINADOS';

const PAGE_MARGIN = 50;
// Below the logo, which addLogoToPDFPage puts at y=30 and 60 pt tall
const CONTENT_TOP = 110;
const ROW_HEIGHT = 18;
const HEADER_ROW_HEIGHT = 20;
const TEXT_PADDING = 4;

const MUTED = '#555555';
const RULE = '#cccccc';
const HEADER_FILL = '#eeeeee';

/**
 * Users grouped for the missing photos list
 *
 * Deleted users are left out, as in the photos by group window: nobody is
 * going to photograph them. Groups where everyone has a photo stay in, with
 * nothing missing, because the summary table counts them.
 *
 * @param {Array} users
 * @param {(user: Object) => boolean} hasPhoto
 * @param {Map<string, string>} groupNames - code → name
 * @returns {Array<{code: string, name: string, total: number, withImage: number, withoutImage: number, missing: Array}>}
 */
function groupMissingPhotos(users, hasPhoto, groupNames = new Map()) {
  const groups = new Map();

  for (const user of users || []) {
    const code = user.group_code || '';
    if (code === DELETED_GROUP) continue;

    let group = groups.get(code);
    if (!group) {
      group = { code, name: groupNames.get(code) || code || 'Sin grupo', total: 0, withImage: 0, missing: [] };
      groups.set(code, group);
    }

    group.total += 1;
    if (hasPhoto(user)) {
      group.withImage += 1;
    } else {
      group.missing.push(user);
    }
  }

  return sortGroups(Array.from(groups.values()), 'code').map((group) => ({
    ...group,
    withoutImage: group.missing.length,
    missing: group.missing.slice().sort(compareUsersByName)
  }));
}

/**
 * "Apellido1 Apellido2, Nombre", as in the paid users list
 * @param {Object} user
 * @returns {string}
 */
function fullName(user) {
  const surnames = [user.last_name1, user.last_name2].filter(Boolean).join(' ');
  return surnames ? `${surnames}, ${user.first_name || ''}`.trim() : (user.first_name || '');
}

/**
 * The identifier the rest of the application uses: NIA for students, the
 * document for everyone else
 * @param {Object} user
 * @returns {string}
 */
function userIdentifier(user) {
  return (user.type === 'student' ? user.nia : user.document) || '';
}

/**
 * @param {Date} date
 * @returns {string} "23/09/2026 a las 10:05"
 */
function formatGeneratedAt(date) {
  const pad = (value) => String(value).padStart(2, '0');
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ` +
    `a las ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * @param {number} count
 * @param {string} singular
 * @param {string} plural
 * @returns {string}
 */
function plural(count, singular, plural) {
  return `${count} ${count === 1 ? singular : plural}`;
}

/**
 * RGB for a CSS-style hsl(), which is how the window writes its colours
 * @param {number} hue - 0..360
 * @param {number} saturation - 0..100
 * @param {number} lightness - 0..100
 * @returns {number[]} [r, g, b], 0..255
 */
function hslToRgb(hue, saturation, lightness) {
  const s = saturation / 100;
  const l = lightness / 100;
  const k = (n) => (n + hue / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const channel = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [channel(0), channel(8), channel(4)].map((value) => Math.round(value * 255));
}

/**
 * Cut a text to fit a column, marking the cut
 * @param {PDFKit.PDFDocument} doc - with the font already set
 * @param {string} text
 * @param {number} width
 * @returns {string}
 */
function fitText(doc, text, width) {
  const value = String(text == null ? '' : text);
  if (doc.widthOfString(value) <= width) return value;

  let cut = value;
  while (cut.length > 0 && doc.widthOfString(`${cut}...`) > width) {
    cut = cut.slice(0, -1);
  }
  return `${cut.trimEnd()}...`;
}

/**
 * Wait for a PDF to reach the disk
 * @param {fs.WriteStream} stream
 * @returns {Promise<void>}
 */
function finished(stream) {
  return new Promise((resolve, reject) => {
    stream.on('finish', resolve);
    stream.on('error', reject);
  });
}

/**
 * A table column. The header is only needed by table(), which draws it.
 * @typedef {{header?: string, width: number, align?: 'left'|'center'|'right'|'justify'}} ReportColumn
 */

/**
 * Drawing helpers shared by both reports
 */
class ReportWriter {
  /**
   * @param {Object} options
   * @param {string} options.filePath
   * @param {string} options.projectName - top right of every page
   * @param {Date} options.generatedAt
   * @param {(doc: PDFKit.PDFDocument) => Promise<void>} [options.drawLogo]
   */
  constructor({ filePath, projectName, generatedAt, drawLogo }) {
    const PDFDocument = require('pdfkit');

    this.doc = new PDFDocument({
      size: 'A4',
      margins: { top: PAGE_MARGIN, bottom: PAGE_MARGIN, left: PAGE_MARGIN, right: PAGE_MARGIN },
      bufferPages: true
    });
    this.stream = fs.createWriteStream(filePath);
    this.done = finished(this.stream);
    this.doc.pipe(this.stream);

    this.projectName = projectName || '';
    this.generatedAt = generatedAt || new Date();
    this.drawLogo = drawLogo || (async () => {});
  }

  get left() { return this.doc.page.margins.left; }
  get width() { return this.doc.page.width - this.doc.page.margins.left - this.doc.page.margins.right; }
  get bottom() { return this.doc.page.height - this.doc.page.margins.bottom; }

  /**
   * Logo and project name, and the cursor under them. The first page already
   * exists when the document is created, so it only needs the header.
   * @param {boolean} [newPage]
   */
  async startPage(newPage = true) {
    const { doc } = this;
    if (newPage) doc.addPage();

    await this.drawLogo(doc);

    doc.font('Helvetica').fontSize(9).fillColor(MUTED)
      .text(this.projectName, this.left, 40, { width: this.width, align: 'right', lineBreak: false });
    doc.fillColor('black');

    doc.x = this.left;
    doc.y = CONTENT_TOP;
  }

  /**
   * Room for this much more on the page, starting a new one if not
   * @param {number} height
   * @returns {Promise<boolean>} Whether a page was added
   */
  async ensureSpace(height) {
    if (this.doc.y + height <= this.bottom) return false;
    await this.startPage();
    return true;
  }

  title(text) {
    this.doc.font('Helvetica-Bold').fontSize(18).fillColor('black')
      .text(text, this.left, this.doc.y, { width: this.width, align: 'center' });
    this.doc.moveDown(0.6);
  }

  heading(text) {
    this.doc.font('Helvetica-Bold').fontSize(14).fillColor('black')
      .text(text, this.left, this.doc.y, { width: this.width });
    this.doc.moveDown(0.2);
  }

  line(text, { bold = false, color = 'black', size = 10 } = {}) {
    this.doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(size).fillColor(color)
      .text(text, this.left, this.doc.y, { width: this.width });
    this.doc.fillColor('black');
  }

  /**
   * Draw one row of cells
   * @param {Array<ReportColumn>} columns
   * @param {Array<string|{text?: string, draw?: Function}>} cells
   * @param {Object} [options]
   */
  row(columns, cells, { bold = false, fill = null, height = ROW_HEIGHT } = {}) {
    const { doc } = this;
    const top = doc.y;
    let x = this.left;

    if (fill) {
      doc.rect(this.left, top, this.width, height).fill(fill);
      doc.fillColor('black');
    }

    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(10);

    columns.forEach((column, index) => {
      const cell = cells[index];
      const inner = column.width - 2 * TEXT_PADDING;

      if (cell && typeof cell === 'object' && cell.draw) {
        cell.draw(doc, { x, y: top, width: column.width, height });
        doc.fillColor('black').font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(10);
      }

      const text = typeof cell === 'string' ? cell : cell && cell.text;
      if (text !== undefined && text !== null && text !== '') {
        doc.text(fitText(doc, text, inner), x + TEXT_PADDING, top + (height - 10) / 2 + 1, {
          width: inner,
          align: column.align || 'left',
          lineBreak: false
        });
      }

      x += column.width;
    });

    doc.moveTo(this.left, top + height).lineTo(this.left + this.width, top + height)
      .lineWidth(0.5).strokeColor(RULE).stroke();

    doc.x = this.left;
    doc.y = top + height;
  }

  /**
   * A table that carries on over as many pages as it needs, repeating the
   * column headers on each one
   * @param {Array<ReportColumn>} columns
   * @param {Array<Array>} rows
   * @param {Object} [options]
   * @param {Function} [options.continuation] - draws a line above the headers on a continued page
   * @param {Array} [options.footer] - a last row in bold
   */
  async table(columns, rows, { continuation = null, footer = null } = {}) {
    const headers = () => this.row(columns, columns.map((column) => column.header),
      { bold: true, fill: HEADER_FILL, height: HEADER_ROW_HEIGHT });

    headers();

    const all = footer ? [...rows, footer] : rows;
    for (let index = 0; index < all.length; index++) {
      if (await this.ensureSpace(ROW_HEIGHT)) {
        if (continuation) continuation();
        headers();
      }
      this.row(columns, all[index], { bold: footer !== null && index === all.length - 1 });
    }
  }

  /**
   * "Página n de m" at the foot of every page, and close the file
   * @returns {Promise<void>}
   */
  async end() {
    const { doc } = this;
    const range = doc.bufferedPageRange();

    for (let index = range.start; index < range.start + range.count; index++) {
      doc.switchToPage(index);
      // Writing inside the bottom margin would make pdfkit add a page
      const bottomMargin = doc.page.margins.bottom;
      doc.page.margins.bottom = 0;
      doc.font('Helvetica').fontSize(8).fillColor(MUTED)
        .text(`Generado el ${formatGeneratedAt(this.generatedAt)}`, this.left, doc.page.height - 35,
          { width: this.width / 2, lineBreak: false });
      doc.text(`Página ${index - range.start + 1} de ${range.count}`, this.left + this.width / 2, doc.page.height - 35,
        { width: this.width / 2, align: 'right', lineBreak: false });
      doc.page.margins.bottom = bottomMargin;
    }

    doc.fillColor('black');
    doc.end();
    await this.done;
  }
}

const MISSING_SOURCES = {
  captured: {
    title: 'Usuarios sin foto capturada',
    missingNoun: 'sin foto capturada'
  },
  repository: {
    title: 'Usuarios sin foto en el depósito',
    missingNoun: 'sin foto en el depósito'
  }
};

/**
 * The missing photos list: a summary of every group on the first page, then
 * a page per group with someone missing
 * @param {string} filePath
 * @param {Object} options
 * @param {'captured'|'repository'} options.source
 * @param {Array} options.groups - from groupMissingPhotos
 * @param {string} [options.scopeLabel] - which users the list covers
 * @param {string} [options.projectName]
 * @param {Date} [options.generatedAt]
 * @param {(doc: PDFKit.PDFDocument) => Promise<void>} [options.drawLogo]
 * @returns {Promise<void>}
 */
async function writeMissingPhotosPdf(filePath, { source, groups, scopeLabel, projectName, generatedAt, drawLogo }) {
  const texts = MISSING_SOURCES[source] || MISSING_SOURCES.captured;
  const report = new ReportWriter({ filePath, projectName, generatedAt, drawLogo });
  const totals = summarize(groups);
  const missing = totals.total - totals.withImage;
  const groupsMissing = groups.filter((group) => group.withoutImage > 0);

  await report.startPage(false);
  report.title(texts.title);
  if (scopeLabel) report.line(`Alcance: ${scopeLabel}`, { color: MUTED });
  report.line(`${plural(missing, 'usuario', 'usuarios')} ${texts.missingNoun} de ${totals.total} ` +
    `(${plural(groupsMissing.length, 'grupo', 'grupos')} con alguno pendiente)`, { bold: true });
  report.doc.moveDown(1);

  await report.table(
    [
      { header: 'Grupo', width: 80 },
      { header: 'Nombre', width: 235 },
      { header: 'Usuarios', width: 90, align: 'right' },
      { header: 'Sin foto', width: 90, align: 'right' }
    ],
    groups.map((group) => [group.code || '-', group.name, String(group.total), String(group.withoutImage)]),
    { footer: ['Total', '', String(totals.total), String(missing)] }
  );

  for (const group of groupsMissing) {
    await report.startPage();
    const heading = group.code && group.name !== group.code ? `${group.code} · ${group.name}` : group.name;
    report.heading(heading);
    report.line(`${group.withoutImage} de ${plural(group.total, 'usuario', 'usuarios')} ${texts.missingNoun}`,
      { color: MUTED });
    report.doc.moveDown(0.8);

    await report.table(
      [
        { header: 'Nº', width: 35, align: 'right' },
        { header: 'Apellidos y nombre', width: 330 },
        { header: 'NIA / Documento', width: 130 }
      ],
      group.missing.map((user, index) => [String(index + 1), fullName(user), userIdentifier(user)]),
      { continuation: () => { report.line(`${heading} (continuación)`, { color: MUTED }); report.doc.moveDown(0.4); } }
    );
  }

  await report.end();
}

/**
 * A percentage cell with a bar in the window's colours behind the figure
 * @param {{total: number, withImage: number}} group
 * @returns {{text: string, draw: Function}}
 */
function coverageCell(group) {
  const ratio = coverageRatio(group);
  return {
    text: `${coveragePercent(ratio)} %`,
    draw: (doc, { x, y, width, height }) => {
      const barWidth = (width - 2 * TEXT_PADDING) * ratio;
      doc.rect(x + TEXT_PADDING, y + 3, width - 2 * TEXT_PADDING, height - 6).fill(hslToRgb(0, 0, 94));
      if (barWidth > 0) {
        doc.rect(x + TEXT_PADDING, y + 3, barWidth, height - 6).fill(hslToRgb(heatHue(ratio), 70, 72));
      }
    }
  };
}

/**
 * Photos by group statistics: users, captured photos and, when the repository
 * could be read, its photos, per group and in total
 * @param {string} filePath
 * @param {Object} options
 * @param {Array} options.captured - getGroupPhotoCoverage() with the linked photos
 * @param {Array|null} options.repository - the same with the repository photos, or null
 * @param {string} [options.repositoryNote] - why the repository is missing
 * @param {string} [options.projectName]
 * @param {Date} [options.generatedAt]
 * @param {(doc: PDFKit.PDFDocument) => Promise<void>} [options.drawLogo]
 * @returns {Promise<void>}
 */
async function writeGroupCoveragePdf(filePath, { captured, repository, repositoryNote, projectName, generatedAt, drawLogo }) {
  const report = new ReportWriter({ filePath, projectName, generatedAt, drawLogo });
  const groups = sortGroups(captured, 'code');
  const repositoryByCode = repository ? new Map(repository.map((group) => [group.code, group])) : null;

  await report.startPage(false);
  report.title('Estadísticas de fotografías por grupo');

  const capturedTotals = summarize(captured);
  const percentOf = (totals) => (totals.total ? coveragePercent(totals.withImage / totals.total) : 0);
  report.line(`Capturadas: ${capturedTotals.withImage} de ${capturedTotals.total} usuarios con foto enlazada ` +
    `(${percentOf(capturedTotals)} %), ${capturedTotals.complete} de ${plural(capturedTotals.groups, 'grupo completo', 'grupos completos')}`);
  if (repository) {
    const repositoryTotals = summarize(repository);
    report.line(`Depósito: ${repositoryTotals.withImage} de ${repositoryTotals.total} usuarios con foto en el depósito ` +
      `(${percentOf(repositoryTotals)} %), ${repositoryTotals.complete} de ${plural(repositoryTotals.groups, 'grupo completo', 'grupos completos')}`);
  } else if (repositoryNote) {
    report.line(`No se incluye el depósito: ${repositoryNote}`, { color: MUTED });
  }
  report.doc.moveDown(1);

  /** @type {Array<ReportColumn>} */
  const columns = [
    { header: 'Grupo', width: 75 },
    { header: 'Nombre', width: repository ? 130 : 200 },
    { header: 'Usuarios', width: 55, align: 'right' },
    { header: 'Capturadas', width: 65, align: 'right' },
    { header: '%', width: repository ? 55 : 100, align: 'right' }
  ];
  if (repository) {
    columns.push({ header: 'Depósito', width: 60, align: 'right' }, { header: '%', width: 55, align: 'right' });
  }

  const rows = groups.map((group) => {
    const cells = [group.code || '-', group.name, String(group.total), String(group.withImage), coverageCell(group)];
    if (repositoryByCode) {
      const inRepository = repositoryByCode.get(group.code) || { total: group.total, withImage: 0 };
      cells.push(String(inRepository.withImage), coverageCell(inRepository));
    }
    return cells;
  });

  const footer = ['Total', '', String(capturedTotals.total), String(capturedTotals.withImage), `${percentOf(capturedTotals)} %`];
  if (repository) {
    const repositoryTotals = summarize(repository);
    footer.push(String(repositoryTotals.withImage), `${percentOf(repositoryTotals)} %`);
  }

  await report.table(columns, rows, { footer });
  await report.end();
}

module.exports = {
  groupMissingPhotos,
  writeMissingPhotosPdf,
  writeGroupCoveragePdf,
  // Exported for tests
  fullName,
  userIdentifier,
  hslToRgb,
  formatGeneratedAt
};
