/**
 * Checks a commit message against the project's rules (CLAUDE.md, «Política
 * de control de versiones»)
 *
 * - The first line is a conventional commit: type(scope)!: description. The
 *   CHANGELOG and the next version are computed from it (feat raises the
 *   minor, fix and perf the patch), so a wrong type is a wrong release.
 * - At most 100 characters on it, and a blank line before any body.
 * - No attribution to Claude or other AI tools: no Co-Authored-By trailer
 *   naming one, no "Generated with" line.
 *
 * Messages git writes itself (merges, reverts, fixup!/squash!/amend!) pass.
 * Used by .githooks/commit-msg; the checks live here so they can be tested.
 */

const TYPES = ['feat', 'fix', 'perf', 'refactor', 'docs', 'test', 'build', 'ci', 'chore', 'style', 'revert'];
const HEADER = new RegExp(`^(${TYPES.join('|')})(\\([a-z0-9][a-z0-9._/-]*\\))?!?: \\S`);
const MAX_HEADER = 100;

// Made by git, not typed
const GENERATED = /^(Merge |Revert "|(fixup|squash|amend)! )/;

const AI_TOOLS = /claude|anthropic|copilot|openai|chatgpt|gpt-\d|gemini|cursor|codeium|tabnine|devin/i;

/**
 * The message as git will store it: without comment lines and without
 * anything below the scissors line of `git commit -v`
 * @param {string} text
 * @returns {string[]}
 */
function messageLines(text) {
  const lines = [];
  for (const line of text.replace(/\r\n/g, '\n').split('\n')) {
    if (/^# -+ >8 -+/.test(line)) break;
    if (line.startsWith('#')) continue;
    lines.push(line);
  }
  while (lines.length && lines[0].trim() === '') lines.shift();
  while (lines.length && lines[lines.length - 1].trim() === '') lines.pop();
  return lines;
}

/**
 * @param {string} text - the commit message file's contents
 * @returns {string[]} what is wrong, in Spanish for whoever is committing; empty if nothing
 */
function checkCommitMessage(text) {
  const lines = messageLines(text);
  if (lines.length === 0) return ['El mensaje está vacío.'];

  const [header] = lines;
  const errors = [];

  if (!GENERATED.test(header)) {
    if (!HEADER.test(header)) {
      errors.push(
        `La primera línea no es un conventional commit: «${header}».\n` +
        `  Forma: tipo(ámbito opcional): descripción en inglés, p. ej. «fix: keep the photo when updating the XML».\n` +
        `  Tipos: ${TYPES.join(', ')}.`
      );
    }
    if (header.length > MAX_HEADER) {
      errors.push(`La primera línea tiene ${header.length} caracteres; como mucho ${MAX_HEADER}.`);
    }
    if (lines.length > 1 && lines[1].trim() !== '') {
      errors.push('Deja una línea en blanco entre la primera línea y el cuerpo.');
    }
  }

  for (const line of lines) {
    if (/^co-authored-by:/i.test(line) && AI_TOOLS.test(line)) {
      errors.push(`Sin atribución a herramientas de IA: «${line.trim()}».`);
    } else if (/generated (with|by)/i.test(line) && AI_TOOLS.test(line)) {
      errors.push(`Sin atribución a herramientas de IA: «${line.trim()}».`);
    } else if (/^claude-session:/i.test(line)) {
      errors.push(`Sin atribución a herramientas de IA: «${line.trim()}».`);
    }
  }

  return errors;
}

module.exports = { checkCommitMessage, TYPES, MAX_HEADER };
