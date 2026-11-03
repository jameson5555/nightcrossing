import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { THEMES, generateThemedPuzzle, scoreWordForTheme } from './proceduralEngine.js';
import { auditPuzzleQuality } from './puzzleQuality.js';
import { isWordEntryAcceptable, hasReliableHint } from './clueQuality.js';
import { isAccessibleAnswer } from './answerAccessibility.js';
import { isExhaustibleGenerationFailure } from './generationPolicy.js';
import { readCurrentPuzzle, publishPuzzleEdition } from './puzzleCatalog.cjs';

const args = process.argv.slice(2);
const write = args.includes('--write');
const stageIndex = args.indexOf('--staging-dir');
const staging = stageIndex >= 0 ? args[stageIndex + 1] :
  fs.mkdtempSync(path.join(os.tmpdir(), 'nightcrossing-repair-'));
if (!staging) throw new Error('--staging-dir requires a path');
fs.mkdirSync(staging, { recursive: true });
const directory = 'public/data/puzzles';
const historicalWords = JSON.parse(fs.readFileSync(new URL('./historicalWords.json', import.meta.url)));
const wordsOf = puzzle => [...puzzle.answers.across, ...puzzle.answers.down];
const themeOf = puzzle => THEMES.find(theme => theme.name === puzzle.theme);
const issuesFor = puzzle => {
  const theme = themeOf(puzzle);
  const issues = auditPuzzleQuality(puzzle, theme);
  for (const direction of ['across', 'down']) {
    for (let index = 0; index < puzzle.answers[direction].length; index++) {
      const answer = puzzle.answers[direction][index];
      const clue = puzzle.clues[direction][index].replace(/^\d+\.\s*/, '');
      const source = theme.words.find(word => word.answer === answer && word.clue === clue);
      if (!source || scoreWordForTheme(theme.name, source) < 0.75) issues.push(`${answer} theme-relevance`);
    }
  }
  return issues;
};
const plan = fs.readdirSync(directory).filter(file => file.endsWith('.json')).sort().map(file => {
  const filePath = path.join(directory, file);
  const original = readCurrentPuzzle(filePath);
  const before = issuesFor(original);
  if (!before.length) return { filePath, original, puzzle: original, mode: 'unchanged', before };
  const puzzle = structuredClone(original);
  const theme = themeOf(puzzle);
  for (const direction of ['across', 'down']) {
    puzzle.answers[direction].forEach((answer, index) => {
      const source = theme.words.find(word => word.answer === answer);
      if (!source) return;
      const number = puzzle.clues[direction][index].match(/^\d+/)?.[0];
      puzzle.clues[direction][index] = `${number}. ${source.clue}`;
      puzzle.hints[`${direction}-${number}`] = source.hint;
    });
  }
  return { filePath, original, puzzle, mode: issuesFor(puzzle).length ? 'replace' : 'reclue', before };
});

const consumed = new Map();
for (const { puzzle, mode } of plan) {
  if (!consumed.has(puzzle.theme)) consumed.set(puzzle.theme, new Set());
  if (mode !== 'replace') for (const answer of wordsOf(puzzle)) consumed.get(puzzle.theme).add(answer);
}

for (const item of plan.filter(item => item.mode === 'replace')) {
  const { original } = item;
  const theme = themeOf(original);
  const used = consumed.get(theme.name);
  const stagePath = path.join(staging, `${original.id}.json`);
  const vetted = new Set((historicalWords[theme.name] || []).map(word => word.answer));
  const available = theme.words.filter(word => !used.has(word.answer) &&
    (word.editorialReviewed || vetted.has(word.answer)) && isAccessibleAnswer(word) &&
    isWordEntryAcceptable(word).ok && hasReliableHint(word) && scoreWordForTheme(theme.name, word) >= 0.75);
  let replacement;
  if (fs.existsSync(stagePath)) {
    const cached = JSON.parse(fs.readFileSync(stagePath));
    if (cached.id === original.id && cached.theme === original.theme &&
      !wordsOf(cached).some(answer => used.has(answer)) && !issuesFor(cached).length) replacement = cached;
  }
  let lastIssues;
  for (let attempt = 0; !replacement && attempt < 12; attempt++) {
    try {
      const { puzzle } = generateThemedPuzzle(original.id, theme.name, available, {
        stopWhenValid: true, attemptMultiplier: 0.5
      });
      lastIssues = issuesFor(puzzle);
      if (!lastIssues.length) replacement = {
        ...puzzle, title: original.title, date: original.date, author: original.author
      };
    } catch (error) {
      if (!isExhaustibleGenerationFailure(error)) throw error;
      lastIssues = [error.message];
    }
  }
  if (!replacement) throw new Error(`${original.id}: ${available.length} available words; ${lastIssues?.join(', ')}`);
  fs.writeFileSync(stagePath, JSON.stringify(replacement, null, 2));
  item.puzzle = replacement;
  for (const answer of wordsOf(replacement)) used.add(answer);
  console.log(`${original.id}: ${wordsOf(replacement).join(', ')}`);
}

// Validate every result before publishing any new pointer. Original grids and
// immutable older editions remain available to players who have started them.
for (const { puzzle } of plan) {
  const issues = issuesFor(puzzle);
  if (issues.length) throw new Error(`${puzzle.id}: ${issues.join(', ')}`);
}
const report = plan.map(({ original, puzzle, mode, before }) => ({
  id: original.id, theme: original.theme, mode, before,
  answers: wordsOf(puzzle)
}));
fs.writeFileSync(path.join(staging, 'report.json'), JSON.stringify(report, null, 2));
if (write) {
  for (const { filePath, puzzle, mode } of plan) {
    if (mode !== 'unchanged') publishPuzzleEdition(filePath, puzzle);
  }
  const result = spawnSync(process.execPath, ['scripts/sync-index.cjs'], { stdio: 'inherit' });
  if (result.status !== 0) throw new Error('Failed to refresh puzzle metadata');
}
const counts = Object.fromEntries(['unchanged', 'reclue', 'replace'].map(mode =>
  [mode, plan.filter(item => item.mode === mode).length]));
console.log(`${write ? 'Published' : 'Staged'} ${JSON.stringify(counts)}; report: ${staging}/report.json`);
