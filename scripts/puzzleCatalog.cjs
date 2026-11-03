const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

// The original URL stays compatible with installed clients and saved grids.
// New clients follow this pointer only for puzzles they have not started.
function readCurrentPuzzle(filePath) {
  const original = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if (!original.currentEdition) return original;
  if (!/^editions\/[a-z0-9-]+\.json$/.test(original.currentEdition)) {
    throw new Error(`Invalid edition path for ${original.id}`);
  }
  const current = JSON.parse(fs.readFileSync(path.join(path.dirname(filePath), original.currentEdition), 'utf8'));
  if (current.id !== original.id || current.theme !== original.theme) {
    throw new Error(`Edition identity mismatch for ${original.id}`);
  }
  return current;
}

function publishPuzzleEdition(filePath, puzzle) {
  const original = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if (puzzle.id !== original.id || puzzle.theme !== original.theme) {
    throw new Error(`Edition identity mismatch for ${original.id}`);
  }
  const content = { ...puzzle };
  delete content.currentEdition;
  const raw = JSON.stringify(content, null, 2);
  const revision = createHash('sha256').update(raw).digest('hex').slice(0, 16);
  const edition = `editions/${original.id}-${revision}.json`;
  const destination = path.join(path.dirname(filePath), edition);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  if (fs.existsSync(destination) && fs.readFileSync(destination, 'utf8') !== raw) {
    throw new Error(`Refusing to overwrite immutable edition ${edition}`);
  }
  fs.writeFileSync(destination, raw);
  fs.writeFileSync(filePath, JSON.stringify({ ...original, currentEdition: edition }, null, 2));
  return edition;
}

module.exports = { readCurrentPuzzle, publishPuzzleEdition };
