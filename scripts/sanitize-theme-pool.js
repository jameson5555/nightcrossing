import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { humanizeClue } from './humanizeClue.js';
import { isWordEntryAcceptable } from './clueQuality.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const THEMES_FILE = path.join(__dirname, 'themes.json');

function pickPreferredWord(a, b) {
  const scoreA = typeof a.themeScore === 'number' ? a.themeScore : 0;
  const scoreB = typeof b.themeScore === 'number' ? b.themeScore : 0;
  if (scoreA !== scoreB) return scoreA > scoreB ? a : b;
  if ((a.clue || '').length !== (b.clue || '').length) {
    return (a.clue || '').length > (b.clue || '').length ? a : b;
  }
  return a;
}

function run() {
  if (!fs.existsSync(THEMES_FILE)) {
    console.error('themes.json not found');
    process.exit(1);
  }

  const themes = JSON.parse(fs.readFileSync(THEMES_FILE, 'utf8'));

  let totalBefore = 0;
  let totalAfter = 0;
  let deduped = 0;
  const removedByReason = new Map();

  for (const theme of themes) {
    const selectedByAnswer = new Map();
    totalBefore += theme.words.length;

    for (const rawWord of theme.words) {
      const cleaned = {
        ...rawWord,
        answer: (rawWord.answer || '').toString().trim().toUpperCase(),
        clue: humanizeClue((rawWord.clue || '').toString().trim()),
        hint: rawWord.hint ? humanizeClue((rawWord.hint || '').toString().trim()) : null
      };

      const check = isWordEntryAcceptable(cleaned);
      if (!check.ok) {
        removedByReason.set(check.reason, (removedByReason.get(check.reason) || 0) + 1);
        continue;
      }

      if (!selectedByAnswer.has(cleaned.answer)) {
        selectedByAnswer.set(cleaned.answer, cleaned);
        continue;
      }

      deduped++;
      const existing = selectedByAnswer.get(cleaned.answer);
      selectedByAnswer.set(cleaned.answer, pickPreferredWord(existing, cleaned));
    }

    theme.words = [...selectedByAnswer.values()];
    totalAfter += theme.words.length;
  }

  fs.writeFileSync(THEMES_FILE, JSON.stringify(themes, null, 2));

  console.log('Theme pool sanitation complete.');
  console.log(`Words before: ${totalBefore}`);
  console.log(`Words after: ${totalAfter}`);
  console.log(`Removed total: ${totalBefore - totalAfter}`);
  console.log(`Deduplicated: ${deduped}`);
  if (removedByReason.size > 0) {
    console.log('Removed by reason:');
    for (const [reason, count] of [...removedByReason.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${reason}: ${count}`);
    }
  }
}

run();
