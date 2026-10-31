/**
 * Commit message rules (.githooks/commit-msg)
 *
 * @jest-environment node
 */

const { checkCommitMessage } = require('../../../scripts/git/commitMessage.cjs');

const ok = (text) => expect(checkCommitMessage(text)).toEqual([]);
const fails = (text, pattern) => {
  const errors = checkCommitMessage(text);
  expect(errors.length).toBeGreaterThan(0);
  if (pattern) expect(errors.join('\n')).toMatch(pattern);
};

describe('checkCommitMessage', () => {
  test('should accept conventional commits as the history writes them', () => {
    ok('feat: export the photo roster as PDF\n');
    ok('fix(deps): update pdfkit to 0.20.2\n\n- None of the breaking changes touch the app\n');
    ok('chore(release): 1.24.2');
    ok('refactor!: rename the repository settings');
    ok('ci: check types, unit tests and the real app on every push');
  });

  test('should reject a header that is not a conventional commit', () => {
    fails('Add user image preview modal', /conventional commit/);
    fails('feature: something', /conventional commit/);
    fails('fix:missing space', /conventional commit/);
    fails('Fix: capital type', /conventional commit/);
    fails('security: add CSP', /conventional commit/);
  });

  test('should reject an empty message and a header over 100 characters', () => {
    fails('\n# only a comment\n', /vacío/);
    fails(`fix: ${'x'.repeat(100)}`, /caracteres/);
  });

  test('should want a blank line before the body', () => {
    fails('fix: something\n- detail right below', /línea en blanco/);
  });

  test('should reject attribution to AI tools', () => {
    fails('fix: x\n\nCo-Authored-By: Claude Opus <noreply@anthropic.com>', /IA/);
    fails('fix: x\n\nCo-authored-by: GitHub Copilot <copilot@github.com>', /IA/);
    fails('fix: x\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)', /IA/);
    fails('fix: x\n\nClaude-Session: abc123', /IA/);
  });

  test('should accept a co-author who is a person', () => {
    ok('fix: x\n\nCo-Authored-By: Ana García <ana@example.com>');
  });

  test('should leave alone the messages git writes', () => {
    ok("Merge branch 'main' into feat/shared-xml");
    ok('Revert "feat: something"\n\nThis reverts commit abc.');
    ok('fixup! fix: keep the photo');
  });

  test('should ignore comments and what is below the scissors line', () => {
    ok('fix: x\n# Please enter the commit message\n# ------------------------ >8 ------------------------\nAdd user modal');
  });
});
