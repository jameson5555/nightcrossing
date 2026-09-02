#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import process from 'process';
import { fileURLToPath } from 'url';
import { RELAXED_THEME_MIN_RELEVANCE, scoreWordForTheme } from './proceduralEngine.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.join(__dirname, '..');
const PUZZLES_DIR = path.join(ROOT_DIR, 'public/data/puzzles');
const THEMES_FILE = path.join(__dirname, 'themes.json');
const CANDIDATE_THEMES_FILE = path.join(__dirname, 'candidate-themes.json');

function loadJSON(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function normalizeClue(value) {
  return String(value || '')
    .replace(/^\d+\.\s*/, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[.?!]+$/g, '')
    .trim();
}

function collectEntries(puzzle) {
  const entries = [];
  for (const direction of ['across', 'down']) {
    const clues = Array.isArray(puzzle?.clues?.[direction]) ? puzzle.clues[direction] : [];
    const answers = Array.isArray(puzzle?.answers?.[direction]) ? puzzle.answers[direction] : [];
    clues.forEach((clue, index) => {
      entries.push({
        direction,
        answer: String(answers[index] || '').trim().toUpperCase(),
        clue: String(clue || '').replace(/^\d+\.\s*/, '').trim()
      });
    });
  }
  return entries;
}

function loadThemes() {
  const themes = [
    ...loadJSON(THEMES_FILE),
    ...(fs.existsSync(CANDIDATE_THEMES_FILE) ? loadJSON(CANDIDATE_THEMES_FILE) : [])
  ];
  return new Map(themes.map(theme => [theme.name, theme]));
}

function changedPuzzleFiles() {
  const output = execFileSync('git', [
    'status', '--porcelain', '--untracked-files=all', '--', 'public/data/puzzles'
  ], { cwd: ROOT_DIR, encoding: 'utf8' });

  return output
    .split('\n')
    .map(line => line.slice(3).trim())
    .filter(file => file.startsWith('public/data/puzzles/') && file.endsWith('.json'))
    .map(file => path.basename(file));
}

function filesFromCommit(ref) {
  const output = execFileSync('git', [
    'diff-tree', '--no-commit-id', '--name-only', '-r', ref, '--', 'public/data/puzzles'
  ], { cwd: ROOT_DIR, encoding: 'utf8' });

  return output
    .split('\n')
    .filter(file => file.startsWith('public/data/puzzles/') && file.endsWith('.json'))
    .map(file => path.basename(file));
}

function selectedPuzzleFiles() {
  const args = process.argv.slice(2);
  if (args.includes('--changed-only')) return changedPuzzleFiles();

  const commitIndex = args.indexOf('--commit');
  if (commitIndex >= 0) {
    const ref = args[commitIndex + 1];
    if (!ref) throw new Error('--commit requires a git reference');
    return filesFromCommit(ref);
  }

  return fs.readdirSync(PUZZLES_DIR).filter(file => file.endsWith('.json')).sort();
}

function main() {
  const themes = loadThemes();
  const files = [...new Set(selectedPuzzleFiles())].sort();
  const violations = [];
  let entryCount = 0;
  let checkedFileCount = 0;

  for (const file of files) {
    const puzzlePath = path.join(PUZZLES_DIR, file);
    if (!fs.existsSync(puzzlePath)) continue;
    checkedFileCount++;
    const puzzle = loadJSON(puzzlePath);
    const theme = themes.get(puzzle.theme);
    if (!theme) {
      violations.push({ file, reason: `unknown theme "${puzzle.theme || ''}"` });
      continue;
    }

    const poolEntries = new Map((theme.words || []).map(word => [
      `${String(word.answer || '').toUpperCase()}\u0000${normalizeClue(word.clue)}`,
      word
    ]));

    for (const entry of collectEntries(puzzle)) {
      entryCount++;
      const key = `${entry.answer}\u0000${normalizeClue(entry.clue)}`;
      const sourceWord = poolEntries.get(key);
      if (!sourceWord) {
        violations.push({
          file,
          answer: entry.answer,
          clue: entry.clue,
          reason: 'answer/clue pair is missing from the current theme pool'
        });
        continue;
      }

      const score = scoreWordForTheme(theme.name, sourceWord);
      if (score < RELAXED_THEME_MIN_RELEVANCE) {
        violations.push({
          file,
          answer: entry.answer,
          clue: entry.clue,
          score,
          reason: `relevance score is below ${RELAXED_THEME_MIN_RELEVANCE}`
        });
      }
    }
  }

  if (violations.length > 0) {
    console.error(`Theme relevance audit failed: ${violations.length} violation(s) across ${checkedFileCount} puzzle(s).`);
    for (const violation of violations) {
      const entry = violation.answer ? ` | ${violation.answer}: "${violation.clue}"` : '';
      const score = Number.isFinite(violation.score) ? ` | score ${violation.score.toFixed(3)}` : '';
      console.error(`- ${violation.file}${entry}${score} | ${violation.reason}`);
    }
    process.exit(2);
  }

  console.log(`Theme relevance audit passed: ${entryCount} entries across ${checkedFileCount} puzzle(s).`);
}

main();
