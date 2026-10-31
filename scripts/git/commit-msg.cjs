/**
 * commit-msg hook: refuses the commit if the message breaks the rules in
 * commitMessage.cjs. To skip it once (never for main): git commit --no-verify
 */
const fs = require('fs');
const { checkCommitMessage } = require('./commitMessage.cjs');

const errors = checkCommitMessage(fs.readFileSync(process.argv[2], 'utf8'));
if (errors.length > 0) {
  console.error('\nCommit rechazado:\n');
  for (const error of errors) console.error(`- ${error}`);
  console.error('\nCorrige el mensaje y vuelve a hacer el commit (ver CLAUDE.md, «Flujo de git»).\n');
  process.exit(1);
}
