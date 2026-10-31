// @ts-check
/**
 * User manual content
 *
 * The manual is a set of Markdown files in src/help, listed in pages.json in
 * the order the help window shows them. It ships inside the application, so
 * every installed version carries the manual that matches it.
 *
 * Pages are rendered here, in the main process, and the help window only
 * inserts the result. Raw HTML in the sources is escaped rather than passed
 * through, so the output is only ever what Markdown itself produces.
 */
const fs = require('fs');
const path = require('path');
const MarkdownIt = require('markdown-it');

const HELP_DIR = path.join(__dirname, '..', 'help');
const MANIFEST_FILE = 'pages.json';

const SEARCH_RESULT_LIMIT = 30;
const SNIPPET_RADIUS = 60;

/**
 * Anchor for a heading
 *
 * Page authors write links to these by hand, so the rule has to stay simple
 * enough to apply mentally: no accents, lowercase, only letters, digits and
 * hyphens. "¿Qué pasa si falta?" becomes "que-pasa-si-falta".
 *
 * @param {string} text
 * @returns {string}
 */
function slugify(text) {
  return String(text)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

/**
 * Lowercase and accent-free, for matching what the user types
 * @param {string} text
 * @returns {string}
 */
function fold(text) {
  return String(text).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

/**
 * Pages of the manual, in display order
 * @param {string} [helpDir]
 * @returns {Array<{id: string, title: string}>}
 */
function loadManifest(helpDir = HELP_DIR) {
  const pages = JSON.parse(fs.readFileSync(path.join(helpDir, MANIFEST_FILE), 'utf8'));
  return pages.map(({ id, title }) => ({ id, title }));
}

/**
 * Classify a link target written in a page
 *
 * @param {string} href
 * @returns {{type: 'page', page: string, anchor: string|null}
 *   | {type: 'anchor', anchor: string}
 *   | {type: 'external', url: string}
 *   | {type: 'unknown'}}
 */
function parseLink(href) {
  if (/^https?:\/\//i.test(href)) {
    return { type: 'external', url: href };
  }

  if (href.startsWith('#')) {
    return { type: 'anchor', anchor: href.slice(1) };
  }

  const match = /^([a-z0-9-]+)\.md(?:#([a-z0-9-]*))?$/i.exec(href);
  if (match) {
    return { type: 'page', page: match[1], anchor: match[2] || null };
  }

  return { type: 'unknown' };
}

/**
 * Text of an inline token without its Markdown marks
 * @param {Object} token - markdown-it inline token
 * @returns {string}
 */
function inlineText(token) {
  if (!token.children) return token.content;
  return token.children
    .filter((child) => child.type === 'text' || child.type === 'code_inline')
    .map((child) => child.content)
    .join('');
}

/**
 * Give every heading an id, unique within the page
 * @param {InstanceType<typeof MarkdownIt>} md
 */
function headingIds(md) {
  md.core.ruler.push('heading_ids', (state) => {
    const used = new Map();
    const tokens = state.tokens;

    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i].type !== 'heading_open') continue;

      const base = slugify(inlineText(tokens[i + 1])) || 'seccion';
      const count = used.get(base) || 0;
      used.set(base, count + 1);
      tokens[i].attrSet('id', count === 0 ? base : `${base}-${count + 1}`);
    }
  });
}

/**
 * Turn page links into data the help window can act on
 *
 * Internal links keep no usable href, so a click can never make the window
 * navigate away from the manual; external ones are opened by the main process
 * in the user's browser.
 *
 * @param {InstanceType<typeof MarkdownIt>} md
 */
function linkTargets(md) {
  md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
    const token = tokens[idx];
    const link = parseLink(String(token.attrGet('href') || ''));

    if (link.type === 'page') {
      token.attrSet('href', '#');
      token.attrSet('data-help-page', link.page);
      if (link.anchor) token.attrSet('data-help-anchor', link.anchor);
    } else if (link.type === 'anchor') {
      token.attrSet('href', '#');
      token.attrSet('data-help-anchor', link.anchor);
    } else if (link.type === 'external') {
      token.attrSet('data-help-external', link.url);
      token.attrSet('href', '#');
    } else {
      token.attrSet('href', '#');
    }

    return self.renderToken(tokens, idx, options);
  };
}

function createMarkdown() {
  const md = new MarkdownIt({ html: false, linkify: false, typographer: false });
  md.use(headingIds);
  md.use(linkTargets);
  return md;
}

const markdown = createMarkdown();

/**
 * Notes for whoever maintains the manual, never shown to the reader
 * @param {string} source
 * @returns {string}
 */
function stripComments(source) {
  return source.replace(/<!--[\s\S]*?-->/g, '');
}

/**
 * @param {string} id
 * @param {string} [helpDir]
 * @returns {{page: {id: string, title: string}, source: string}}
 */
function readPage(id, helpDir = HELP_DIR) {
  // Only ids from the manifest ever reach the filesystem
  const page = loadManifest(helpDir).find((entry) => entry.id === id);
  if (!page) {
    throw new Error(`Página de ayuda desconocida: ${id}`);
  }

  const source = fs.readFileSync(path.join(helpDir, `${page.id}.md`), 'utf8');
  return { page, source: stripComments(source) };
}

/**
 * Headings of a page, with the ids the rendered HTML gives them
 * @param {Array} tokens - markdown-it tokens after parsing
 * @returns {Array<{level: number, text: string, anchor: string}>}
 */
function collectHeadings(tokens) {
  const headings = [];
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].type === 'heading_open') {
      headings.push({
        level: Number(tokens[i].tag.slice(1)),
        text: inlineText(tokens[i + 1]),
        anchor: tokens[i].attrGet('id')
      });
    }
  }
  return headings;
}

/**
 * Links a page makes to other pages or to its own headings
 * @param {Array} tokens
 * @returns {Array<{href: string, link: ReturnType<typeof parseLink>}>}
 */
function collectLinks(tokens) {
  const links = [];
  for (const token of tokens) {
    if (token.type !== 'inline' || !token.children) continue;
    for (const child of token.children) {
      if (child.type === 'link_open') {
        const href = child.attrGet('href') || '';
        links.push({ href, link: parseLink(href) });
      }
    }
  }
  return links;
}

/**
 * Parse a page without rendering it
 * @param {string} id
 * @param {string} [helpDir]
 */
function parsePage(id, helpDir = HELP_DIR) {
  const { page, source } = readPage(id, helpDir);
  const env = {};
  const tokens = markdown.parse(source, env);
  return { page, source, tokens, env };
}

/**
 * Render a page of the manual
 * @param {string} id
 * @param {string} [helpDir]
 * @returns {{id: string, title: string, html: string, headings: Array}}
 */
function renderPage(id, helpDir = HELP_DIR) {
  const { page, tokens, env } = parsePage(id, helpDir);
  return {
    id: page.id,
    title: page.title,
    html: markdown.renderer.render(tokens, markdown.options, env),
    headings: collectHeadings(tokens)
  };
}

/**
 * Plain text of each section of a page, split at every heading
 * @param {string} id
 * @param {string} [helpDir]
 * @returns {Array<{title: string, anchor: string|null, text: string}>}
 */
function pageSections(id, helpDir = HELP_DIR) {
  const { page, tokens } = parsePage(id, helpDir);
  const sections = [];
  let current = { title: page.title, anchor: null, parts: [] };

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token.type === 'heading_open') {
      sections.push(current);
      current = { title: inlineText(tokens[i + 1]), anchor: token.attrGet('id'), parts: [] };
      i++;
      continue;
    }
    if (token.type === 'inline') {
      current.parts.push(inlineText(token));
    }
  }
  sections.push(current);

  return sections
    .map(({ title, anchor, parts }) => ({ title, anchor, text: parts.join(' ') }))
    .filter((section) => section.text || section.anchor);
}

/**
 * Text around the first match, cut at word boundaries
 * @param {string} text
 * @param {number} index - Position of the match in the folded text
 * @param {number} length
 * @returns {string}
 */
function snippetAround(text, index, length) {
  let start = Math.max(0, index - SNIPPET_RADIUS);
  let end = Math.min(text.length, index + length + SNIPPET_RADIUS);
  if (start > 0) {
    const space = text.indexOf(' ', start);
    if (space !== -1 && space < index) start = space + 1;
  }
  if (end < text.length) {
    const space = text.lastIndexOf(' ', end);
    if (space > index + length) end = space;
  }
  return `${start > 0 ? '…' : ''}${text.slice(start, end)}${end < text.length ? '…' : ''}`;
}

/**
 * Sections of the manual that mention every word of the query
 *
 * Case and accents are ignored, so "exportacion" finds "Exportación". Titles
 * count more than body text.
 *
 * @param {string} query
 * @param {string} [helpDir]
 * @returns {Array<{page: string, pageTitle: string, section: string, anchor: string|null, snippet: string}>}
 */
function searchPages(query, helpDir = HELP_DIR) {
  const words = fold(query).split(/\s+/).filter((word) => word.length >= 2);
  if (words.length === 0) return [];

  const results = [];

  for (const page of loadManifest(helpDir)) {
    for (const section of pageSections(page.id, helpDir)) {
      const title = fold(section.title);
      const body = fold(section.text);

      if (!words.every((word) => title.includes(word) || body.includes(word))) continue;

      const score = words.reduce(
        (total, word) => total + (title.includes(word) ? 10 : 0) + body.split(word).length - 1,
        0
      );
      const firstIndex = Math.max(0, body.indexOf(words[0]));

      results.push({
        page: page.id,
        pageTitle: page.title,
        section: section.title,
        anchor: section.anchor,
        snippet: section.text ? snippetAround(section.text, firstIndex, words[0].length) : '',
        score
      });
    }
  }

  return results
    .sort((a, b) => b.score - a.score)
    .slice(0, SEARCH_RESULT_LIMIT)
    .map(({ score, ...result }) => result);
}

module.exports = {
  HELP_DIR,
  slugify,
  parseLink,
  loadManifest,
  parsePage,
  renderPage,
  collectHeadings,
  collectLinks,
  searchPages
};
