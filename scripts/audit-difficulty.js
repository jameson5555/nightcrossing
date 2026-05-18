#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { computePuzzleMetrics } from './puzzleMetrics.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, '../public/data');
const PUZZLES_DIR = path.join(DATA_DIR, 'puzzles');
const INDEX_FILE = path.join(DATA_DIR, 'puzzles.json');

const EASY_ABSOLUTE_GATES = {
  maxAvgWordLength: 5.5,
  maxLongWordCount: 1,
  maxVeryLongWordCount: 0,
  minAvgIntersectionsPerWord: 1.75,
  maxProperNounLoad: 0.22,
  maxClueObscurityLoad: 0.22,
  maxPlacedWords: 7
};

const PROPER_NOUN_HINT_REGEX = /\b(god|goddess|deity|constellation|moon|planet|star|satellite|asteroid|myth|mythological|roman|greek)\b/i;
const CLUE_OBSCURITY_REGEX = /[;:()]|\b(archaic|obsolete|mythological|technical|primordial|kuiper|trojan|alpha\s+[a-z]+|beta\s+[a-z]+)\b/i;

function loadJSON(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function safeRatio(numerator, denominator) {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) return 0;
  return numerator / denominator;
}

function stripCluePrefix(entry) {
  if (typeof entry !== 'string') return '';
  return entry.replace(/^\d+\.\s*/, '').trim();
}

function hasInnerCapitalizedToken(text) {
  const value = String(text || '').trim();
  if (!value) return false;

  let firstWordSkipped = false;
  const matches = value.match(/\b[A-Z][a-z]{2,}\b/g) || [];
  for (const token of matches) {
    if (!firstWordSkipped) {
      firstWordSkipped = true;
      continue;
    }
    return true;
  }

  return false;
}

function collectLexicalLoads(puzzle) {
  const acrossClues = Array.isArray(puzzle?.clues?.across) ? puzzle.clues.across : [];
  const downClues = Array.isArray(puzzle?.clues?.down) ? puzzle.clues.down : [];
  const hints = puzzle?.hints && typeof puzzle.hints === 'object' ? puzzle.hints : {};

  const clueTexts = [...acrossClues, ...downClues].map(stripCluePrefix).filter(Boolean);
  const hintTexts = Object.values(hints).map(value => String(value || '').trim()).filter(Boolean);
  const totalTextItems = clueTexts.length + hintTexts.length;

  let properNounHits = 0;
  let obscureTextHits = 0;

  for (const text of [...clueTexts, ...hintTexts]) {
    if (PROPER_NOUN_HINT_REGEX.test(text) || hasInnerCapitalizedToken(text)) {
      properNounHits += 1;
    }
    if (CLUE_OBSCURITY_REGEX.test(text)) {
      obscureTextHits += 1;
    }
  }

  return {
    properNounLoad: clamp(safeRatio(properNounHits, totalTextItems) / 0.55, 0, 1),
    clueObscurityLoad: clamp(safeRatio(obscureTextHits, totalTextItems) / 0.55, 0, 1)
  };
}

function getAvgWordLength(puzzle) {
  const acrossAnswers = Array.isArray(puzzle?.answers?.across) ? puzzle.answers.across : [];
  const downAnswers = Array.isArray(puzzle?.answers?.down) ? puzzle.answers.down : [];
  const words = [...acrossAnswers, ...downAnswers]
    .map(value => String(value || '').trim())
    .filter(Boolean);

  if (words.length === 0) return 0;
  return words.reduce((sum, word) => sum + word.length, 0) / words.length;
}

function auditEasyPuzzle(item, puzzle) {
  const metrics = computePuzzleMetrics(puzzle);
  const lexical = collectLexicalLoads(puzzle);
  const avgWordLength = getAvgWordLength(puzzle);

  const checks = {
    maxPlacedWords: metrics.placedWords <= EASY_ABSOLUTE_GATES.maxPlacedWords,
    maxAvgWordLength: avgWordLength <= EASY_ABSOLUTE_GATES.maxAvgWordLength,
    maxLongWordCount: metrics.longWordCount <= EASY_ABSOLUTE_GATES.maxLongWordCount,
    maxVeryLongWordCount: metrics.veryLongWordCount <= EASY_ABSOLUTE_GATES.maxVeryLongWordCount,
    minAvgIntersectionsPerWord: metrics.avgIntersectionsPerWord >= EASY_ABSOLUTE_GATES.minAvgIntersectionsPerWord,
    maxProperNounLoad: lexical.properNounLoad <= EASY_ABSOLUTE_GATES.maxProperNounLoad,
    maxClueObscurityLoad: lexical.clueObscurityLoad <= EASY_ABSOLUTE_GATES.maxClueObscurityLoad
  };

  const failedChecks = Object.entries(checks)
    .filter(([, passes]) => !passes)
    .map(([key]) => key);

  return {
    id: item.id,
    failedChecks,
    metrics: {
      placedWords: metrics.placedWords,
      avgWordLength,
      longWordCount: metrics.longWordCount,
      veryLongWordCount: metrics.veryLongWordCount,
      avgIntersectionsPerWord: metrics.avgIntersectionsPerWord,
      properNounLoad: lexical.properNounLoad,
      clueObscurityLoad: lexical.clueObscurityLoad
    }
  };
}

function formatMetric(value) {
  if (!Number.isFinite(value)) return 'n/a';
  return value.toFixed(3);
}

function main() {
  const index = loadJSON(INDEX_FILE);
  const easyItems = Array.isArray(index)
    ? index.filter(item => item?.difficulty === 'Easy')
    : [];

  if (easyItems.length === 0) {
    console.log('No Easy-labeled puzzles found in index. Audit passed (no gate violations).');
    return;
  }

  const violations = [];

  for (const item of easyItems) {
    const filePath = path.join(PUZZLES_DIR, `${item.id}.json`);
    if (!fs.existsSync(filePath)) {
      violations.push({
        id: item.id,
        failedChecks: ['missingPuzzleFile'],
        metrics: {}
      });
      continue;
    }

    const puzzle = loadJSON(filePath);
    const result = auditEasyPuzzle(item, puzzle);
    if (result.failedChecks.length > 0) {
      violations.push(result);
    }
  }

  if (violations.length > 0) {
    console.error(`Easy difficulty audit failed: ${violations.length} violation(s) across ${easyItems.length} Easy puzzle(s).`);
    for (const violation of violations) {
      console.error(`- ${violation.id}: failed [${violation.failedChecks.join(', ')}]`);
      if (Object.keys(violation.metrics).length > 0) {
        console.error(
          `  placed=${formatMetric(violation.metrics.placedWords)}, avgLen=${formatMetric(violation.metrics.avgWordLength)}, ` +
          `long=${formatMetric(violation.metrics.longWordCount)}, veryLong=${formatMetric(violation.metrics.veryLongWordCount)}, ` +
          `avgX=${formatMetric(violation.metrics.avgIntersectionsPerWord)}, proper=${formatMetric(violation.metrics.properNounLoad)}, ` +
          `obscure=${formatMetric(violation.metrics.clueObscurityLoad)}`
        );
      }
    }
    process.exit(2);
  }

  console.log(`Easy difficulty audit passed: ${easyItems.length} Easy puzzle(s) satisfy all absolute gates.`);
}

main();
