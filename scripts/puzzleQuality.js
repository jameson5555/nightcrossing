import { hasReliableHint, isWordEntryAcceptable } from './clueQuality.js';
import { passesAnswerAccessibility } from './answerAccessibility.js';
import { computePuzzleMetrics } from './puzzleMetrics.js';

export function collectPuzzleEntries(puzzle) {
  return ['across', 'down'].flatMap(direction =>
    (puzzle.answers?.[direction] || []).map((answer, index) => {
      const text = puzzle.clues?.[direction]?.[index] || '';
      const number = Number(text.match(/^(\d+)\./)?.[1]);
      return {
        answer, clue: text.replace(/^\d+\.\s*/, ''),
        hint: puzzle.hints?.[`${direction}-${number}`] || '',
        direction, number
      };
    })
  );
}

export function auditPuzzleQuality(puzzle, theme) {
  const issues = [];
  const entries = collectPuzzleEntries(puzzle);
  if (entries.length < 6) issues.push('fewer than six answers');
  const sourceWords = new Map((theme?.words || []).map(word => [
    `${word.answer.toUpperCase()}\0${word.clue}`, word
  ]));
  const placedWords = [];
  const clues = new Set();
  const answers = new Set();
  for (const entry of entries) {
    const label = `${entry.direction}-${entry.number}:${entry.answer}`;
    const validation = isWordEntryAcceptable(entry);
    if (!validation.ok) issues.push(`${label} ${validation.reason}`);
    if (!entry.hint.trim()) issues.push(`${label} missing-hint`);
    const clueKey = entry.clue.toLowerCase().replace(/[.?!]+$/, '').trim();
    if (clues.has(clueKey)) issues.push(`${label} duplicate-clue`);
    if (answers.has(entry.answer)) issues.push(`${label} duplicate-answer`);
    clues.add(clueKey);
    answers.add(entry.answer);
    const source = sourceWords.get(`${entry.answer.toUpperCase()}\0${entry.clue}`);
    if (!source) issues.push(`${label} missing-source-pair`);
    else if (!hasReliableHint(source)) issues.push(`${label} unreviewed-dictionary-hint`);
    placedWords.push(source || {});

    const start = puzzle.gridnums?.indexOf(entry.number) ?? -1;
    const cols = puzzle.size?.cols;
    const step = entry.direction === 'across' ? 1 : cols;
    if (start < 0 || !cols || !Number.isFinite(entry.number)) {
      issues.push(`${label} missing-grid-start`);
      continue;
    }
    let actual = '';
    for (let pos = start; pos < puzzle.grid.length && puzzle.grid[pos] !== '.'; pos += step) {
      if (entry.direction === 'across' && Math.floor(pos / cols) !== Math.floor(start / cols)) break;
      actual += puzzle.grid[pos];
    }
    if (actual !== entry.answer) issues.push(`${label} grid-answer-mismatch`);
  }
  if (!passesAnswerAccessibility(placedWords)) issues.push('answer-accessibility');
  const metrics = computePuzzleMetrics(puzzle);
  if (metrics.cols > 10 || metrics.rows > 10 || metrics.cols < 1 || metrics.rows < 1 ||
      puzzle.grid?.length !== metrics.cols * metrics.rows ||
      puzzle.gridnums?.length !== puzzle.grid?.length) issues.push('invalid-grid-size');
  if (!metrics.connected) issues.push('disconnected-grid');
  if (metrics.longWordCount && metrics.longWordTwoPlusRate < 0.82) issues.push('long-word-crossings');
  if (metrics.veryLongWordCount && metrics.veryLongWordThreePlusRate < 0.62) issues.push('very-long-word-crossings');
  return issues;
}
