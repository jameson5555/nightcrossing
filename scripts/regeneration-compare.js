import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const METRIC_KEYS = [
  'avgProperNounLoad',
  'avgClueObscurityLoad',
  'avgFallbackHintLoad',
  'properHitRate',
  'obscureHitRate',
  'keyIdeaHintRate'
];

function parseArgs(argv) {
  const args = {
    before: path.join(__dirname, '../scratch/regeneration-baseline.before.json'),
    after: path.join(__dirname, '../scratch/regeneration-baseline.after.json'),
    out: path.join(__dirname, '../scratch/regeneration-before-after-report.md')
  };

  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--before' && argv[i + 1]) {
      args.before = path.resolve(argv[i + 1]);
      i++;
    } else if (argv[i] === '--after' && argv[i + 1]) {
      args.after = path.resolve(argv[i + 1]);
      i++;
    } else if (argv[i] === '--out' && argv[i + 1]) {
      args.out = path.resolve(argv[i + 1]);
      i++;
    }
  }

  return args;
}

function loadJSON(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function fmt(n, digits = 4) {
  return Number(n || 0).toFixed(digits);
}

function fmtPct(n) {
  return `${(Number(n || 0) * 100).toFixed(2)}%`;
}

function describeDelta(beforeValue, afterValue) {
  const delta = afterValue - beforeValue;
  const relative = beforeValue !== 0 ? (delta / beforeValue) : 0;
  return `${fmt(beforeValue)} -> ${fmt(afterValue)} (delta ${fmt(delta)}, relative ${fmtPct(relative)})`;
}

function buildSection(beforeObj, afterObj) {
  const lines = [];
  for (const key of METRIC_KEYS) {
    lines.push(`- ${key}: ${describeDelta(Number(beforeObj[key] || 0), Number(afterObj[key] || 0))}`);
  }
  return lines;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const before = loadJSON(args.before);
  const after = loadJSON(args.after);

  const md = [
    '# Regeneration Before/After Report',
    '',
    `- Baseline dataset version: ${before.datasetVersion || 'unknown'}`,
    `- Regenerated dataset version: ${after.datasetVersion || 'unknown'}`,
    `- Baseline captured: ${before.generatedAt || 'unknown'}`,
    `- After captured: ${after.generatedAt || 'unknown'}`,
    '',
    '## All Themes',
    ...buildSection(before.allThemes || {}, after.allThemes || {}),
    '',
    '## Space & Astronomy Theme',
    ...buildSection(before.astronomy || {}, after.astronomy || {}),
    '',
    '## Quick Read',
    `- Overall proper-noun signal rate moved from ${fmtPct(before.allThemes?.properHitRate)} to ${fmtPct(after.allThemes?.properHitRate)}.`,
    `- Overall obscurity signal rate moved from ${fmtPct(before.allThemes?.obscureHitRate)} to ${fmtPct(after.allThemes?.obscureHitRate)}.`,
    `- Astronomy proper-noun signal rate moved from ${fmtPct(before.astronomy?.properHitRate)} to ${fmtPct(after.astronomy?.properHitRate)}.`,
    `- Astronomy obscurity signal rate moved from ${fmtPct(before.astronomy?.obscureHitRate)} to ${fmtPct(after.astronomy?.obscureHitRate)}.`
  ].join('\n');

  fs.mkdirSync(path.dirname(args.out), { recursive: true });
  fs.writeFileSync(args.out, `${md}\n`);
  console.log(`Wrote before/after report to ${args.out}`);
}

main();
