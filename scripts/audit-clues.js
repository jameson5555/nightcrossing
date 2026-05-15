#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { isWordEntryAcceptable } from './clueQuality.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, '../public/data');
const PUZZLES_DIR = path.join(DATA_DIR, 'puzzles');

function loadJSON(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function stripCluePrefix(entry) {
  if (typeof entry !== 'string') return '';
  return entry.replace(/^\d+\.\s*/, '').trim();
}

function extractClueNumber(entry) {
  if (typeof entry !== 'string') return null;
  const match = entry.match(/^(\d+)\.\s*/);
  return match ? Number(match[1]) : null;
}

function normalizeClue(clueText) {
  return String(clueText || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[.?!]+$/g, '')
    .trim();
}

function likelyPluralAnswer(answer) {
  const value = String(answer || '').trim().toUpperCase();
  if (value.length < 4) return false;
  if (!value.endsWith('S')) return false;
  if (value.endsWith('SS')) return false;
  if (value === 'MARS') return false;
  return true;
}

function toSingularStem(answer) {
  const value = String(answer || '').trim().toUpperCase();
  if (!value) return value;

  if (value.endsWith('IES') && value.length > 4) {
    return `${value.slice(0, -3)}Y`;
  }

  if (value.endsWith('ES') && value.length > 4) {
    const base = value.slice(0, -2);
    if (/(S|X|Z|CH|SH)$/.test(base)) return base;
  }

  if (value.endsWith('S') && !value.endsWith('SS')) {
    return value.slice(0, -1);
  }

  return value;
}

function areSingularPluralPair(a, b) {
  const aVal = String(a || '').trim().toUpperCase();
  const bVal = String(b || '').trim().toUpperCase();
  if (!aVal || !bVal || aVal === bVal) return false;

  if (likelyPluralAnswer(aVal) && toSingularStem(aVal) === bVal) return true;
  if (likelyPluralAnswer(bVal) && toSingularStem(bVal) === aVal) return true;
  return false;
}

function likelyPluralWord(word) {
  const token = String(word || '').toLowerCase();
  if (!token || token.length < 3) return false;
  if (!token.endsWith('s')) return false;
  if (token.endsWith('ss')) return false;
  if (token.endsWith('wards')) return false;
  if (token.endsWith('ics')) return false;
  if (token.endsWith('us')) return false;
  if (token.endsWith('is')) return false;
  if (token === 'news') return false;
  return true;
}

function extractLastWord(clueText) {
  const match = String(clueText || '').match(/([A-Za-z]+)[^A-Za-z]*$/);
  return match ? match[1].toLowerCase() : '';
}

function clueLooksSimpleNounPhrase(clueText) {
  const text = String(clueText || '').trim();
  if (!text) return false;
  if (/[,:;()]/.test(text)) return false;

  const tokens = text.toLowerCase().match(/[a-z]+/g) || [];
  if (tokens.length < 2 || tokens.length > 4) return false;

  const blockers = new Set([
    'who', 'which', 'that', 'when', 'where',
    'used', 'using', 'to', 'for', 'of', 'with', 'without', 'between', 'into',
     'from', 'as', 'by', 'on', 'in', 'at', 'across'
  ]);

  return !tokens.some(token => blockers.has(token));
}

function collectEntries(puzzle) {
  const entries = [];

  const acrossClues = Array.isArray(puzzle?.clues?.across) ? puzzle.clues.across : [];
  const downClues = Array.isArray(puzzle?.clues?.down) ? puzzle.clues.down : [];
  const acrossAnswers = Array.isArray(puzzle?.answers?.across) ? puzzle.answers.across : [];
  const downAnswers = Array.isArray(puzzle?.answers?.down) ? puzzle.answers.down : [];
  const hints = puzzle?.hints && typeof puzzle.hints === 'object' ? puzzle.hints : {};

  acrossClues.forEach((entry, idx) => {
    const clueNumber = extractClueNumber(entry);
    const clueId = `across-${clueNumber ?? idx + 1}`;
    entries.push({
      clueId,
      clueText: stripCluePrefix(entry),
      normalizedClue: normalizeClue(stripCluePrefix(entry)),
      answer: String(acrossAnswers[idx] || '').trim().toUpperCase(),
      hint: String(hints[clueId] || '').trim()
    });
  });

  downClues.forEach((entry, idx) => {
    const clueNumber = extractClueNumber(entry);
    const clueId = `down-${clueNumber ?? idx + 1}`;
    entries.push({
      clueId,
      clueText: stripCluePrefix(entry),
      normalizedClue: normalizeClue(stripCluePrefix(entry)),
      answer: String(downAnswers[idx] || '').trim().toUpperCase(),
      hint: String(hints[clueId] || '').trim()
    });
  });

  return entries;
}

function auditPuzzle(puzzleId, puzzle) {
  const entries = collectEntries(puzzle);
  const violations = [];

  const byNormalizedClue = new Map();
  for (const entry of entries) {
    if (!entry.normalizedClue) continue;
    if (!byNormalizedClue.has(entry.normalizedClue)) byNormalizedClue.set(entry.normalizedClue, []);
    byNormalizedClue.get(entry.normalizedClue).push(entry);
  }

  for (const [normalizedClue, group] of byNormalizedClue.entries()) {
    if (group.length < 2) continue;

    const distinctAnswers = new Set(group.map(entry => entry.answer));
    if (distinctAnswers.size > 1) {
      violations.push({
        type: 'duplicate-clue-text',
        puzzleId,
        clue: normalizedClue,
        entries: group.map(entry => ({ clueId: entry.clueId, answer: entry.answer }))
      });
    }

    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        if (areSingularPluralPair(group[i].answer, group[j].answer)) {
          violations.push({
            type: 'singular-plural-clue-collision',
            puzzleId,
            clue: normalizedClue,
            entries: [
              { clueId: group[i].clueId, answer: group[i].answer },
              { clueId: group[j].clueId, answer: group[j].answer }
            ]
          });
        }
      }
    }
  }

  for (const entry of entries) {
    if (!entry.answer || !entry.clueText) continue;
    if (!clueLooksSimpleNounPhrase(entry.clueText)) continue;

    const answerIsPlural = likelyPluralAnswer(entry.answer);
    const clueLastWord = extractLastWord(entry.clueText);
    if (!clueLastWord) continue;
    const clueLooksPlural = likelyPluralWord(clueLastWord);

    if (answerIsPlural && !clueLooksPlural) {
      violations.push({
        type: 'plural-answer-singular-clue',
        puzzleId,
        clue: entry.clueText,
        entry: { clueId: entry.clueId, answer: entry.answer }
      });
    }

    if (!answerIsPlural && clueLooksPlural) {
      violations.push({
        type: 'singular-answer-plural-clue',
        puzzleId,
        clue: entry.clueText,
        entry: { clueId: entry.clueId, answer: entry.answer }
      });
    }
  }

  for (const entry of entries) {
    if (!entry.answer || !entry.clueText) continue;

    const validation = isWordEntryAcceptable({
      answer: entry.answer,
      clue: entry.clueText,
      hint: entry.hint || ''
    });

    if (!validation.ok && validation.reason === 'repetitive-reentry-clue') {
      violations.push({
        type: 'repetitive-reentry-clue',
        puzzleId,
        clue: entry.clueText,
        entry: { clueId: entry.clueId, answer: entry.answer }
      });
    }

    if (entry.hint && !validation.ok && validation.reason === 'hint-duplicate') {
      violations.push({
        type: 'clue-hint-echo',
        puzzleId,
        clue: `${entry.clueText} || ${entry.hint}`,
        entry: { clueId: entry.clueId, answer: entry.answer }
      });
    }
  }

  return violations;
}

function main() {
  const puzzleFiles = fs.existsSync(PUZZLES_DIR)
    ? fs.readdirSync(PUZZLES_DIR).filter(file => file.endsWith('.json')).sort()
    : [];

  const allViolations = [];

  for (const file of puzzleFiles) {
    const puzzlePath = path.join(PUZZLES_DIR, file);
    const puzzle = loadJSON(puzzlePath);
    const puzzleId = String(puzzle?.id || file.replace(/\.json$/, ''));
    const violations = auditPuzzle(puzzleId, puzzle);
    allViolations.push(...violations);
  }

  if (allViolations.length > 0) {
    console.error(`Clue audit failed: ${allViolations.length} violation(s) across ${puzzleFiles.length} puzzle(s).`);
    for (const violation of allViolations) {
      if (violation.type === 'duplicate-clue-text' || violation.type === 'singular-plural-clue-collision') {
        const detail = (violation.entries || []).map(entry => `${entry.clueId}:${entry.answer}`).join(', ');
        console.error(`- [${violation.type}] ${violation.puzzleId} | "${violation.clue}" | ${detail}`);
      } else {
        const detail = violation.entry ? `${violation.entry.clueId}:${violation.entry.answer}` : 'unknown';
        console.error(`- [${violation.type}] ${violation.puzzleId} | "${violation.clue}" | ${detail}`);
      }
    }
    process.exit(2);
  }

  console.log(`Clue audit passed: ${puzzleFiles.length} puzzle(s) checked, no clue-agreement violations.`);
}

main();
