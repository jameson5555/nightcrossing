import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, '../public/data');
const PUZZLES_DIR = path.join(DATA_DIR, 'puzzles');
const INDEX_FILE = path.join(DATA_DIR, 'puzzles.json');
const META_FILE = path.join(DATA_DIR, 'puzzles.meta.json');

const PROPER_NOUN_HINT_REGEX = /\b(god|goddess|deity|constellation|moon|planet|star|satellite|asteroid|myth|mythological|roman|greek)\b/i;
const CLUE_OBSCURITY_REGEX = /[;:()]|\b(archaic|obsolete|mythological|technical|primordial|kuiper|trojan|alpha\s+[a-z]+|beta\s+[a-z]+)\b/i;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function safeRatio(numerator, denominator) {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) return 0;
  return numerator / denominator;
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

function stripCluePrefix(entry) {
  if (typeof entry !== 'string') return '';
  return entry.replace(/^\d+\.\s*/, '').trim();
}

function collectLexicalSignals(puzzle) {
  const acrossClues = Array.isArray(puzzle?.clues?.across) ? puzzle.clues.across : [];
  const downClues = Array.isArray(puzzle?.clues?.down) ? puzzle.clues.down : [];
  const hintsObj = puzzle?.hints && typeof puzzle.hints === 'object' ? puzzle.hints : {};

  const clueTexts = [...acrossClues, ...downClues].map(stripCluePrefix).filter(Boolean);
  const hintTexts = Object.values(hintsObj).map(value => String(value || '').trim()).filter(Boolean);

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

  const keyIdeaHints = hintTexts.filter(text => /^Key idea:/i.test(text)).length;

  return {
    properNounHits,
    obscureTextHits,
    keyIdeaHints,
    totalTextItems,
    totalHints: hintTexts.length,
    properNounLoad: clamp(safeRatio(properNounHits, totalTextItems) / 0.55, 0, 1),
    clueObscurityLoad: clamp(safeRatio(obscureTextHits, totalTextItems) / 0.55, 0, 1),
    fallbackHintLoad: clamp(safeRatio(keyIdeaHints, Math.max(1, hintTexts.length)) / 0.45, 0, 1)
  };
}

function aggregateMetrics(items) {
  if (items.length === 0) {
    return {
      puzzleCount: 0,
      avgProperNounLoad: 0,
      avgClueObscurityLoad: 0,
      avgFallbackHintLoad: 0,
      properHitRate: 0,
      obscureHitRate: 0,
      keyIdeaHintRate: 0
    };
  }

  const totals = items.reduce((acc, item) => {
    acc.properNounHits += item.properNounHits;
    acc.obscureTextHits += item.obscureTextHits;
    acc.keyIdeaHints += item.keyIdeaHints;
    acc.totalTextItems += item.totalTextItems;
    acc.totalHints += item.totalHints;
    acc.properNounLoad += item.properNounLoad;
    acc.clueObscurityLoad += item.clueObscurityLoad;
    acc.fallbackHintLoad += item.fallbackHintLoad;
    return acc;
  }, {
    properNounHits: 0,
    obscureTextHits: 0,
    keyIdeaHints: 0,
    totalTextItems: 0,
    totalHints: 0,
    properNounLoad: 0,
    clueObscurityLoad: 0,
    fallbackHintLoad: 0
  });

  const count = items.length;
  return {
    puzzleCount: count,
    avgProperNounLoad: Number((totals.properNounLoad / count).toFixed(4)),
    avgClueObscurityLoad: Number((totals.clueObscurityLoad / count).toFixed(4)),
    avgFallbackHintLoad: Number((totals.fallbackHintLoad / count).toFixed(4)),
    properHitRate: Number(safeRatio(totals.properNounHits, totals.totalTextItems).toFixed(4)),
    obscureHitRate: Number(safeRatio(totals.obscureTextHits, totals.totalTextItems).toFixed(4)),
    keyIdeaHintRate: Number(safeRatio(totals.keyIdeaHints, Math.max(1, totals.totalHints)).toFixed(4))
  };
}

function parseArgs(argv) {
  const args = {
    out: path.join(__dirname, '../scratch/regeneration-baseline.current.json')
  };

  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--out' && argv[i + 1]) {
      args.out = path.resolve(argv[i + 1]);
      i++;
    }
  }

  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  const index = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8'));
  const meta = JSON.parse(fs.readFileSync(META_FILE, 'utf8'));

  const allSignals = [];
  const astronomySignals = [];

  for (const item of index) {
    const puzzlePath = path.join(PUZZLES_DIR, `${item.id}.json`);
    if (!fs.existsSync(puzzlePath)) continue;

    const puzzle = JSON.parse(fs.readFileSync(puzzlePath, 'utf8'));
    const signals = collectLexicalSignals(puzzle);
    allSignals.push(signals);

    const theme = String(item.theme || puzzle.theme || '').toLowerCase();
    if (theme.includes('space') && theme.includes('astronomy')) {
      astronomySignals.push(signals);
    }
  }

  const output = {
    generatedAt: new Date().toISOString(),
    datasetVersion: meta?.version || 'unknown',
    allThemes: aggregateMetrics(allSignals),
    astronomy: aggregateMetrics(astronomySignals)
  };

  fs.mkdirSync(path.dirname(args.out), { recursive: true });
  fs.writeFileSync(args.out, JSON.stringify(output, null, 2));
  console.log(`Wrote regeneration metrics to ${args.out}`);
}

main();
