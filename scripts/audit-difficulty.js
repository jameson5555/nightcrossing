#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { computePuzzleMetrics } from './puzzleMetrics.js';
import difficultyRubric from './difficultyRubric.cjs';
import { computeLexicalStatsForAnswers, getDefaultLexicalStats } from './lexicalDifficulty.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, '../public/data');
const PUZZLES_DIR = path.join(DATA_DIR, 'puzzles');
const INDEX_FILE = path.join(DATA_DIR, 'puzzles.json');
const { classifyDifficulty } = difficultyRubric;
const EASY_LONG_WORD_LENGTH = 7;

const PROPER_NOUN_HINT_REGEX = /\b(god|goddess|deity|constellation|myth|mythological|roman|greek)\b/i;
const COMMON_CAPITALIZED_THEME_WORDS = new Set(['earth', 'sun', 'moon']);
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
    if (COMMON_CAPITALIZED_THEME_WORDS.has(token.toLowerCase())) {
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

function collectAnswerTexts(puzzle) {
  const acrossAnswers = Array.isArray(puzzle?.answers?.across) ? puzzle.answers.across : [];
  const downAnswers = Array.isArray(puzzle?.answers?.down) ? puzzle.answers.down : [];
  return [...acrossAnswers, ...downAnswers]
    .map(value => String(value || '').trim())
    .filter(Boolean);
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

function getEasyLongWordCount(puzzle) {
  const acrossAnswers = Array.isArray(puzzle?.answers?.across) ? puzzle.answers.across : [];
  const downAnswers = Array.isArray(puzzle?.answers?.down) ? puzzle.answers.down : [];
  return [...acrossAnswers, ...downAnswers]
    .map(value => String(value || '').trim())
    .filter(Boolean)
    .filter(word => word.length >= EASY_LONG_WORD_LENGTH)
    .length;
}

async function buildDifficultyProfile(puzzle) {
  const metrics = computePuzzleMetrics(puzzle);
  const lexical = collectLexicalLoads(puzzle);
  const answers = collectAnswerTexts(puzzle);
  const lexicalDifficulty = answers.length > 0
    ? await computeLexicalStatsForAnswers(answers)
    : getDefaultLexicalStats();

  return {
    placedWords: metrics.placedWords,
    avgWordLength: getAvgWordLength(puzzle),
    easyLongWordCount: getEasyLongWordCount(puzzle),
    longWordCount: metrics.longWordCount,
    veryLongWordCount: metrics.veryLongWordCount,
    avgIntersectionsPerWord: metrics.avgIntersectionsPerWord,
    properNounLoad: lexical.properNounLoad,
    clueObscurityLoad: lexical.clueObscurityLoad,
    lexicalDifficultyLoad: lexicalDifficulty.lexicalDifficultyLoad,
    avgZipfFrequency: lexicalDifficulty.avgZipfFrequency,
    rareAnswerShare: lexicalDifficulty.rareAnswerShare,
    difficultAnswerShare: lexicalDifficulty.difficultAnswerShare
  };
}

async function auditDifficultyLabel(item, puzzle) {
  const metrics = await buildDifficultyProfile(puzzle);
  return {
    id: item.id,
    actualDifficulty: item.difficulty || '',
    expectedDifficulty: classifyDifficulty(metrics),
    metrics
  };
}

function formatMetric(value) {
  if (!Number.isFinite(value)) return 'n/a';
  return value.toFixed(3);
}

async function main() {
  const index = loadJSON(INDEX_FILE);
  const labeledItems = Array.isArray(index)
    ? index.filter(item => typeof item?.difficulty === 'string' && item.difficulty.trim() !== '')
    : [];

  if (labeledItems.length === 0) {
    console.log('No difficulty-labeled puzzles found in index. Audit passed.');
    return;
  }

  const violations = [];

  for (const item of labeledItems) {
    const filePath = path.join(PUZZLES_DIR, `${item.id}.json`);
    if (!fs.existsSync(filePath)) {
      violations.push({
        id: item.id,
        actualDifficulty: item.difficulty || '',
        expectedDifficulty: 'missing',
        metrics: {}
      });
      continue;
    }

    const puzzle = loadJSON(filePath);
    const result = await auditDifficultyLabel(item, puzzle);
    if (result.actualDifficulty !== result.expectedDifficulty) {
      violations.push(result);
    }
  }

  if (violations.length === 0) {
    console.log(`Difficulty audit passed for ${labeledItems.length} labeled puzzles.`);
    return;
  }

  console.error(`Difficulty audit failed for ${violations.length} puzzle(s):`);
  for (const violation of violations) {
    console.error(
      `- ${violation.id}: labeled ${violation.actualDifficulty || 'unlabeled'} but rubric says ${violation.expectedDifficulty} ` +
      `(placedWords=${violation.metrics.placedWords}, avgWordLength=${formatMetric(violation.metrics.avgWordLength)}, ` +
      `easyLongWordCount=${violation.metrics.easyLongWordCount}, ` +
      `longWordCount=${violation.metrics.longWordCount}, veryLongWordCount=${violation.metrics.veryLongWordCount}, ` +
      `avgIntersectionsPerWord=${formatMetric(violation.metrics.avgIntersectionsPerWord)}, ` +
      `properNounLoad=${formatMetric(violation.metrics.properNounLoad)}, ` +
      `clueObscurityLoad=${formatMetric(violation.metrics.clueObscurityLoad)}, ` +
      `lexicalDifficultyLoad=${formatMetric(violation.metrics.lexicalDifficultyLoad)})`
    );
  }

  process.exit(2);
}

main().catch((err) => {
  console.error('Difficulty audit failed unexpectedly.', err);
  process.exit(1);
});
