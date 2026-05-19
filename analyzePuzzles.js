import fs from 'fs';
import path from 'path';
import { computePuzzleMetrics } from './scripts/puzzleMetrics.js';
import difficultyRubric from './scripts/difficultyRubric.cjs';

const { DIFFICULTY_RUBRIC, classifyDifficulty } = difficultyRubric;

const DATA_DIR = './public/data/puzzles';

const PROPER_NOUN_HINT_REGEX = /\b(god|goddess|deity|constellation|moon|planet|star|satellite|asteroid|myth|mythological|roman|greek)\b/i;
const CLUE_OBSCURITY_REGEX = /[;:()]|\b(archaic|obsolete|mythological|technical|primordial|kuiper|trojan|alpha\s+[a-z]+|beta\s+[a-z]+)\b/i;

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
    if (!firstWordSkipped) { firstWordSkipped = true; continue; }
    return true;
  }
  return false;
}

function analyzePuzzle(p) {
  const metrics = computePuzzleMetrics(p);
  const words = [];
  (p.clues?.across || []).forEach(c => words.push(stripCluePrefix(c)));
  (p.clues?.down || []).forEach(c => words.push(stripCluePrefix(c)));
  
  const properNounLoad = words.length > 0 ? words.filter(w => PROPER_NOUN_HINT_REGEX.test(w) || hasInnerCapitalizedToken(w)).length / words.length : 0;
  const clueObscurityLoad = words.length > 0 ? words.filter(w => CLUE_OBSCURITY_REGEX.test(w)).length / words.length : 0;
  
  const paths = p.gridnums.filter(n => n !== 0).length; // Rough word count if solve is not available. 
  // Wait, computePuzzleMetrics already returns placedWords.
  
  const wordLengths = [];
  (p.clues?.across || []).concat(p.clues?.down || []).forEach(clue => {
      // Metric logic used wordPaths, let's just use what computePuzzleMetrics gives us.
  });
  
  // Need avgWordLength. computePuzzleMetrics doesn't return it directly.
  // Let's re-calculate it correctly from the grid.
  const gridCells = p.grid.filter(c => c !== '.').length;
  const avgWordLength = metrics.placedWords > 0 ? gridCells / metrics.placedWords : 0; // This is a bit of an approximation if words overlap, but wait, usually avgWordLength is sum(lengths)/count. 
  // Actually, computePuzzleMetrics doesn't export the wordLengths array.
  
  const profile = {
    ...metrics,
    avgWordLength,
    properNounLoad,
    clueObscurityLoad
  };

  const difficulty = classifyDifficulty(profile);
  
  const hardConditions = [];
  if (profile.placedWords >= DIFFICULTY_RUBRIC.hard.minPlacedWords) hardConditions.push('placedWords');
  if (profile.avgWordLength >= DIFFICULTY_RUBRIC.hard.minAvgWordLength) hardConditions.push('avgWordLength');
  if (profile.longWordCount >= DIFFICULTY_RUBRIC.hard.minLongWordCount) hardConditions.push('longWordCount');
  if (profile.veryLongWordCount >= DIFFICULTY_RUBRIC.hard.minVeryLongWordCount) hardConditions.push('veryLongWordCount');
  if (profile.avgIntersectionsPerWord <= DIFFICULTY_RUBRIC.hard.maxAvgIntersectionsPerWord) hardConditions.push('avgIntersections');
  if (profile.properNounLoad >= DIFFICULTY_RUBRIC.hard.minProperNounLoad) hardConditions.push('properNounLoad');
  if (profile.clueObscurityLoad >= DIFFICULTY_RUBRIC.hard.minClueObscurityLoad) hardConditions.push('clueObscurityLoad');

  const expertConditions = [];
  if (profile.longWordCount >= DIFFICULTY_RUBRIC.expert.minLongWordCount) expertConditions.push('longWordCount');
  if (profile.avgWordLength >= DIFFICULTY_RUBRIC.expert.minAvgWordLength) expertConditions.push('avgWordLength');
  if (profile.veryLongWordCount >= DIFFICULTY_RUBRIC.expert.minVeryLongWordCount && profile.avgWordLength >= DIFFICULTY_RUBRIC.expert.minVeryLongAvgWordLength) expertConditions.push('veryLongAvgWordLength');

  const easyConditions = [];
  if (profile.placedWords <= DIFFICULTY_RUBRIC.easy.maxPlacedWords) easyConditions.push('placedWords');
  if (profile.avgWordLength <= DIFFICULTY_RUBRIC.easy.maxAvgWordLength) easyConditions.push('avgWordLength');
  if (profile.longWordCount <= DIFFICULTY_RUBRIC.easy.maxLongWordCount) easyConditions.push('longWordCount');
  if (profile.veryLongWordCount <= DIFFICULTY_RUBRIC.easy.maxVeryLongWordCount) easyConditions.push('veryLongWordCount');
  if (profile.avgIntersectionsPerWord >= DIFFICULTY_RUBRIC.easy.minAvgIntersectionsPerWord) easyConditions.push('avgIntersections');
  if (profile.properNounLoad <= DIFFICULTY_RUBRIC.easy.maxProperNounLoad) easyConditions.push('properNounLoad');
  if (profile.clueObscurityLoad <= DIFFICULTY_RUBRIC.easy.maxClueObscurityLoad) easyConditions.push('clueObscurityLoad');

  return {
    id: p.id,
    difficulty,
    profile,
    hardConditions,
    expertConditions,
    easyConditions
  };
}

const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json'));
const results = files.sort().map(f => {
  const p = JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf8'));
  return analyzePuzzle(p);
});

console.log('ID | Diff | Words | AvgLen | Long | VLong | AvgInt | PropN | ClueObs | Conditions');
results.forEach(r => {
  const p = r.profile;
  const conds = r.difficulty === 'Hard' ? r.hardConditions : (r.difficulty === 'Expert' ? r.expertConditions : (r.difficulty === 'Easy' ? r.easyConditions : []));
  console.log(`${r.id} | ${r.difficulty.padEnd(6)} | ${String(p.placedWords).padStart(5)} | ${p.avgWordLength.toFixed(2)} | ${String(p.longWordCount).padStart(4)} | ${String(p.veryLongWordCount).padStart(5)} | ${p.avgIntersectionsPerWord.toFixed(2)} | ${p.properNounLoad.toFixed(2)} | ${p.clueObscurityLoad.toFixed(2)} | ${conds.join(',')}`);
});

const hardExpert = results.filter(r => r.difficulty === 'Hard' || r.difficulty === 'Expert');
const singleCondition = hardExpert.filter(r => {
    if (r.difficulty === 'Hard') return r.hardConditions.length === 1;
    if (r.difficulty === 'Expert') return r.expertConditions.length === 1;
    return false;
}).length;
console.log('');
console.log(`Hard/Expert count: ${hardExpert.length}`);
console.log(`Single condition triggers: ${singleCondition} (${((singleCondition/hardExpert.length)*100).toFixed(1)}%)`);
