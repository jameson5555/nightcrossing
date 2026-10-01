import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import process from 'node:process';
import { THEMES, generateThemedPuzzle } from './proceduralEngine.js';
import { dedupeWordsByClue, isExhaustibleGenerationFailure } from './generationPolicy.js';
import { auditPuzzleQuality } from './puzzleQuality.js';

const ids = new Set(process.argv.slice(2));
if (!ids.size || [...ids].some(id => !/^[a-z0-9-]+-vol\d+$/.test(id))) {
  throw new Error('Usage: node scripts/regenerate-selected.js <puzzle-id> [...]');
}
const dir = 'public/data/puzzles';
const originals = new Map([...ids].map(id => [id, JSON.parse(fs.readFileSync(`${dir}/${id}.json`, 'utf8'))]));
const consumed = new Map();
for (const file of fs.readdirSync(dir).filter(file => file.endsWith('.json'))) {
  const puzzle = JSON.parse(fs.readFileSync(`${dir}/${file}`, 'utf8'));
  if (ids.has(puzzle.id)) continue;
  if (!consumed.has(puzzle.theme)) consumed.set(puzzle.theme, new Set());
  for (const answer of [...puzzle.answers.across, ...puzzle.answers.down]) consumed.get(puzzle.theme).add(answer);
}
const staged = new Map();
for (const [id, original] of originals) {
  const theme = THEMES.find(theme => theme.name === original.theme);
  if (!theme) throw new Error(`Missing theme: ${original.theme}`);
  const used = consumed.get(theme.name) || new Set();
  consumed.set(theme.name, used);
  const available = dedupeWordsByClue(theme.words.filter(word =>
    word.editorialReviewed === true && !used.has(word.answer)));
  let replacement;
  let issues;
  for (let attempt = 1; attempt <= 10; attempt++) {
    let puzzle;
    try {
      ({ puzzle } = generateThemedPuzzle(id, theme.name, available));
    } catch (error) {
      if (!isExhaustibleGenerationFailure(error)) throw error;
      issues = [error.message];
      console.warn(`${id} retry ${attempt}: ${error.message}`);
      continue;
    }
    issues = auditPuzzleQuality(puzzle, theme);
    if (!issues.length) {
      replacement = { ...puzzle, title: original.title, date: original.date };
      break;
    }
    console.warn(`${id} retry ${attempt}: ${issues.join(', ')}`);
  }
  if (!replacement) throw new Error(`${id}: no replacement passed quality checks: ${issues}`);
  replacement.layoutRevision = createHash('sha256')
    .update(JSON.stringify([replacement.size, replacement.grid, replacement.gridnums, replacement.answers]))
    .digest('hex').slice(0, 16);
  for (const answer of [...replacement.answers.across, ...replacement.answers.down]) used.add(answer);
  staged.set(id, replacement);
  console.log(`${id}: ${[...replacement.answers.across, ...replacement.answers.down].join(', ')}`);
}
// Nothing is changed until every selected replacement has passed validation.
for (const [id, puzzle] of staged) fs.writeFileSync(`${dir}/${id}.json`, JSON.stringify(puzzle, null, 2));
const result = spawnSync(process.execPath, ['scripts/sync-index.cjs'], { stdio: 'inherit' });
if (result.status !== 0) throw new Error('Failed to refresh puzzle metadata');
console.log(`Replaced ${staged.size} puzzles; all other layouts and the catalog count are preserved.`);
