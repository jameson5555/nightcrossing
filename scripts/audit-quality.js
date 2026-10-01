import fs from 'node:fs';
import process from 'node:process';
import { execFileSync } from 'node:child_process';
import { THEMES } from './proceduralEngine.js';
import { auditPuzzleQuality } from './puzzleQuality.js';

const args = process.argv.slice(2);
const commitIndex = args.indexOf('--commit');
let files;
if (args.includes('--all')) {
  files = fs.readdirSync('public/data/puzzles').map(file => `public/data/puzzles/${file}`);
} else if (commitIndex >= 0) {
  if (!args[commitIndex + 1]) throw new Error('--commit requires a reference');
  files = execFileSync('git', ['diff-tree', '--no-commit-id', '--name-only', '-r',
    args[commitIndex + 1], '--', 'public/data/puzzles'], { encoding: 'utf8' }).trim().split('\n');
} else {
  files = execFileSync('git', ['status', '--porcelain', '--untracked-files=all', '--',
    'public/data/puzzles'], { encoding: 'utf8' }).split('\n').map(line => line.slice(3).trim());
}
let checked = 0;
let failures = 0;
for (const file of new Set(files.filter(file => file.endsWith('.json') && fs.existsSync(file)))) {
  const puzzle = JSON.parse(fs.readFileSync(file, 'utf8'));
  const issues = auditPuzzleQuality(puzzle, THEMES.find(theme => theme.name === puzzle.theme));
  checked++;
  if (issues.length) {
    failures++;
    console.error(`${puzzle.id}: ${issues.join(', ')}`);
  }
}
console.log(`Full quality audit: ${checked} selected puzzles, ${failures} failures.`);
if (failures) process.exitCode = 2;
