import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { computePuzzleMetrics, summarizeMetrics } from './puzzleMetrics.js';
import difficultyRubric from './difficultyRubric.cjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const { summarizeDifficultySpread } = difficultyRubric;

function parseArgs(argv) {
  const args = { input: path.join(__dirname, '../public/data/puzzles') };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--input' && argv[i + 1]) {
      args.input = path.resolve(argv[i + 1]);
      i++;
    }
  }
  return args;
}

function formatNum(value, digits = 2) {
  return Number(value).toFixed(digits);
}

function loadDifficultySpread(puzzlesDir, files) {
  const indexPath = path.join(path.dirname(puzzlesDir), 'puzzles.json');
  if (!fs.existsSync(indexPath)) return null;

  const indexed = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  if (!Array.isArray(indexed)) return null;

  const fileIds = new Set(files.map(file => file.replace(/\.json$/, '')));
  const labels = indexed
    .filter(item => fileIds.has(String(item?.id || '')))
    .map(item => item.difficulty)
    .filter(label => typeof label === 'string' && label.trim() !== '');

  if (labels.length === 0) return null;
  return summarizeDifficultySpread(labels);
}

function run() {
  const args = parseArgs(process.argv.slice(2));
  if (!fs.existsSync(args.input)) {
    console.error(`Input folder does not exist: ${args.input}`);
    process.exit(1);
  }

  const files = fs.readdirSync(args.input)
    .filter(name => name.endsWith('.json'))
    .sort();

  if (files.length === 0) {
    console.log('No puzzle files found.');
    return;
  }

  const metrics = [];
  const sizeDist = new Map();
  const failures = [];

  for (const file of files) {
    const fullPath = path.join(args.input, file);
    try {
      const puzzle = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
      const m = computePuzzleMetrics(puzzle);
      metrics.push({ file, ...m });
      const key = `${m.cols}x${m.rows}`;
      sizeDist.set(key, (sizeDist.get(key) || 0) + 1);
    } catch (err) {
      failures.push({ file, error: err.message });
    }
  }

  const summary = summarizeMetrics(metrics);
  const rows = metrics.map(m => m.rows);
  const cols = metrics.map(m => m.cols);
  const words = metrics.map(m => m.placedWords);
  const difficultySpread = loadDifficultySpread(args.input, files);

  console.log(`Analyzed ${metrics.length} puzzles from ${args.input}`);
  console.log(`Rows min/avg/max: ${Math.min(...rows)}/${formatNum(summary.avgRows)}/${Math.max(...rows)}`);
  console.log(`Cols min/avg/max: ${Math.min(...cols)}/${formatNum(summary.avgCols)}/${Math.max(...cols)}`);
  console.log(`Words min/avg/max: ${Math.min(...words)}/${formatNum(summary.avgPlacedWords)}/${Math.max(...words)}`);
  console.log(`Avg density: ${formatNum(summary.avgDensity * 100)}%`);
  console.log(`Avg intersections: ${formatNum(summary.avgIntersections)}`);
  console.log(`Avg min intersections/word: ${formatNum(summary.avgMinIntersectionsPerWord)}`);
  console.log(`Avg long words (>=8): ${formatNum(summary.avgLongWordCount)}`);
  console.log(`Avg very long words (>=10): ${formatNum(summary.avgVeryLongWordCount)}`);
  console.log(`Long words with 2+ crossings: ${formatNum(summary.avgLongWordTwoPlusRate * 100)}%`);
  console.log(`Very long words with 3+ crossings: ${formatNum(summary.avgVeryLongWordThreePlusRate * 100)}%`);
  console.log(`Connected layouts: ${formatNum(summary.connectedRate * 100)}%`);

  if (difficultySpread) {
    console.log(
      `Difficulty spread: Easy ${difficultySpread.counts.Easy || 0}, Normal ${difficultySpread.counts.Normal || 0}, Hard ${difficultySpread.counts.Hard || 0}, Expert ${difficultySpread.counts.Expert || 0}`
    );
    if (!difficultySpread.meetsMinimumSpread) {
      console.log('Difficulty spread misses the target minimum of 2 Easy and 2 Expert puzzles.');
    }
  }

  console.log('\nGrid size distribution:');
  [...sizeDist.entries()]
    .sort((a, b) => b[1] - a[1])
    .forEach(([size, count]) => {
      console.log(`  ${size}: ${count}`);
    });

  const invalidSize = metrics.filter(m => m.rows > 10 || m.cols > 10);
  if (invalidSize.length > 0) {
    console.log(`\nFound ${invalidSize.length} puzzles larger than 10x10:`);
    invalidSize.slice(0, 20).forEach(item => {
      console.log(`  ${item.file}: ${item.cols}x${item.rows}`);
    });
  }

  if (failures.length > 0) {
    console.log(`\nFailed to parse ${failures.length} files:`);
    failures.forEach(f => console.log(`  ${f.file}: ${f.error}`));
  }
}

run();
