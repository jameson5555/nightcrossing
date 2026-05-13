import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { generateThemedPuzzle, THEMES, scoreWordForTheme } from './proceduralEngine.js';
import { runGenerationPreflight } from './preflight-generation.js';
import { fetchThemeWords } from './fetch-theme-words.js';
import { computePuzzleMetrics } from './puzzleMetrics.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, '../public/data');
const PUZZLES_DIR = path.join(DATA_DIR, 'puzzles');
const INDEX_FILE = path.join(DATA_DIR, 'puzzles.json');
const PUZZLES_PER_SET = 3;

function slugifyThemeName(themeName) {
  return String(themeName || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-');
}

function buildPuzzleId(themeName, volume, legacyPrefix = false) {
  const prefix = legacyPrefix ? 'starter-' : '';
  return `${prefix}${slugifyThemeName(themeName)}-vol${volume}`;
}

function formatWaveLabel(volume) {
  const safeVolume = Number(volume);
  if (!Number.isFinite(safeVolume) || safeVolume < 1) return '';
  const waveNumber = Math.floor((safeVolume - 1) / PUZZLES_PER_SET) + 1;
  return `Wave ${waveNumber}`;
}

// Ensure directories exist
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(PUZZLES_DIR)) fs.mkdirSync(PUZZLES_DIR, { recursive: true });

const REGENERATE = process.argv.includes('--regenerate');
const ALLOW_WEAK_THEMES = process.argv.includes('--allow-weak-themes');
const SKIP_PREFLIGHT = process.argv.includes('--skip-preflight');
const SKIP_ENRICHMENT = process.argv.includes('--skip-enrichment');
const ALLOW_REPEAT_ANSWERS = process.argv.includes('--allow-repeat-answers');
const MAX_LAYOUT_QUALITY_RETRIES = Number.isFinite(Number(process.env.NC_MAX_LAYOUT_QUALITY_RETRIES))
  ? Math.max(1, Math.min(8, Number(process.env.NC_MAX_LAYOUT_QUALITY_RETRIES)))
  : 3;
const MIN_LONG_TWO_PLUS_RATE = Number.isFinite(Number(process.env.NC_MIN_LONG_TWO_PLUS_RATE))
  ? Math.max(0, Math.min(1, Number(process.env.NC_MIN_LONG_TWO_PLUS_RATE)))
  : 0.78;
const MIN_VERY_LONG_THREE_PLUS_RATE = Number.isFinite(Number(process.env.NC_MIN_VERY_LONG_THREE_PLUS_RATE))
  ? Math.max(0, Math.min(1, Number(process.env.NC_MIN_VERY_LONG_THREE_PLUS_RATE)))
  : 0.58;
const MIN_HINT_COVERAGE = Number.isFinite(Number(process.env.NC_MIN_HINT_COVERAGE))
  ? Math.max(0, Math.min(1, Number(process.env.NC_MIN_HINT_COVERAGE)))
  : 0.95;

function addPuzzleAnswersToSet(puzzleData, targetSet) {
  if (!puzzleData?.answers) return;
  for (const answer of puzzleData.answers.across || []) {
    targetSet.add(String(answer).toUpperCase());
  }
  for (const answer of puzzleData.answers.down || []) {
    targetSet.add(String(answer).toUpperCase());
  }
}

function scoreWordRelevance(wordObj) {
  return typeof wordObj.themeScore === 'number' ? wordObj.themeScore : 0;
}

function computeHintCoverage(puzzle) {
  const clueCount = (puzzle?.answers?.across?.length || 0) + (puzzle?.answers?.down?.length || 0);
  const hintCount = Object.keys(puzzle?.hints || {}).length;
  if (clueCount <= 0) {
    return { clueCount, hintCount, coverage: 1 };
  }
  return {
    clueCount,
    hintCount,
    coverage: hintCount / clueCount
  };
}

function passesLayoutQualityGate(metrics, puzzle) {
  const longWordGate = metrics.longWordCount === 0 || metrics.longWordTwoPlusRate >= MIN_LONG_TWO_PLUS_RATE;
  const veryLongWordGate =
    metrics.veryLongWordCount === 0 ||
    metrics.veryLongWordThreePlusRate >= MIN_VERY_LONG_THREE_PLUS_RATE;
  const hintCoverage = computeHintCoverage(puzzle);
  const hintGate = hintCoverage.coverage >= MIN_HINT_COVERAGE;
  return {
    accepted: longWordGate && veryLongWordGate && hintGate,
    hintCoverage,
    longWordGate,
    veryLongWordGate,
    hintGate
  };
}

async function generateStarters() {
  const NEW_PUZZLES_PER_THEME = 3;
  const historicalConsumedByTheme = new Map();

  if (!SKIP_ENRICHMENT) {
    console.log('Enrichment step: updating theme pools before generation...');
    await fetchThemeWords();

    // proceduralEngine caches THEMES at import time, so rerun once with --skip-enrichment.
    const rerunArgs = [...process.argv.slice(1), '--skip-enrichment'];
    const rerun = spawnSync(process.execPath, rerunArgs, { stdio: 'inherit' });
    process.exit(rerun.status ?? 1);
  }

  if (!SKIP_PREFLIGHT) {
    const preflight = runGenerationPreflight({
      targetPuzzles: NEW_PUZZLES_PER_THEME,
      ignoreConsumed: REGENERATE
    });
    if (!preflight.ok && !ALLOW_WEAK_THEMES) {
      console.error('❌ Generation preflight failed. Weak themes detected:');
      for (const weak of preflight.weakThemes) {
        console.error(`  - ${weak.theme} (projected ${weak.projectedPuzzles}/${weak.targetPuzzles}, core ${weak.coreWords})`);
      }
      console.error('Use --allow-weak-themes to override, or strengthen theme pools first.');
      process.exit(2);
    }
  }

  let index = [];
  
  if (REGENERATE) {
    if (!ALLOW_REPEAT_ANSWERS) {
      const existingFiles = fs.readdirSync(PUZZLES_DIR).filter(f => f.endsWith('.json'));
      for (const file of existingFiles) {
        try {
          const puzzle = JSON.parse(fs.readFileSync(path.join(PUZZLES_DIR, file), 'utf8'));
          const themeName = puzzle?.theme;
          if (!themeName) continue;

          if (!historicalConsumedByTheme.has(themeName)) {
            historicalConsumedByTheme.set(themeName, new Set());
          }
          addPuzzleAnswersToSet(puzzle, historicalConsumedByTheme.get(themeName));
        } catch {
          // Ignore malformed legacy files while collecting history.
        }
      }
    }

    console.log('🔄 REGENERATE MODE: Wiping existing puzzles and starting fresh...');
    // Delete all existing puzzle JSON files
    const existingFiles = fs.readdirSync(PUZZLES_DIR).filter(f => f.endsWith('.json'));
    for (const f of existingFiles) {
      fs.unlinkSync(path.join(PUZZLES_DIR, f));
    }
    console.log(`  Deleted ${existingFiles.length} existing puzzle files.`);
    if (!ALLOW_REPEAT_ANSWERS) {
      let historicalCount = 0;
      for (const set of historicalConsumedByTheme.values()) historicalCount += set.size;
      console.log(`  Preserved ${historicalCount} historical answers as exclusions.`);
    }
  } else {
    console.log('Generating incremental new puzzles...');
    if (fs.existsSync(INDEX_FILE)) {
      try {
        index = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8'));
      } catch(e) {
        console.warn("Could not parse existing puzzles.json, starting fresh.");
      }
    }
  }

  for (const theme of THEMES) {
    const consumedWords = new Set();
    if (REGENERATE && !ALLOW_REPEAT_ANSWERS) {
      const historical = historicalConsumedByTheme.get(theme.name);
      if (historical) {
        for (const answer of historical) consumedWords.add(answer);
      }
    }
    
    // Calculate the current highest volume for this theme from the index
    const existingThemePuzzles = index.filter(p => p.theme === theme.name);
    let highestVol = 0;
    
    // Also scan disk for puzzle files not yet in the index
    const themeSlug = slugifyThemeName(theme.name);
    const themePrefix = `${themeSlug}-vol`;
    const legacyThemePrefix = `starter-${themeSlug}-vol`;
    const diskFiles = fs.readdirSync(PUZZLES_DIR)
      .filter(f => f.startsWith(themePrefix) || f.startsWith(legacyThemePrefix));
    for (const f of diskFiles) {
      const m = f.match(/-vol(\d+)\.json$/);
      if (m && parseInt(m[1]) > highestVol) highestVol = parseInt(m[1]);
    }
    
    for (const p of existingThemePuzzles) {
      const match = p.id.match(/-vol(\d+)$/);
      if (match && parseInt(match[1]) > highestVol) {
        highestVol = parseInt(match[1]);
      }
      
      // Load the actual JSON to see what words were used, to add to consumedWords
      try {
        const fileData = JSON.parse(fs.readFileSync(path.join(PUZZLES_DIR, `${p.id}.json`), 'utf8'));
        if (fileData.answers) {
            fileData.answers.across.forEach(ans => consumedWords.add(ans.toUpperCase()));
            fileData.answers.down.forEach(ans => consumedWords.add(ans.toUpperCase()));
        }
      } catch (err) {
        // file missing or corrupt, ignore
      }
    }
    
    // Also load consumed words from any disk-only puzzle files
    for (const f of diskFiles) {
      try {
        const fileData = JSON.parse(fs.readFileSync(path.join(PUZZLES_DIR, f), 'utf8'));
        if (fileData.answers) {
          fileData.answers.across.forEach(ans => consumedWords.add(ans.toUpperCase()));
          fileData.answers.down.forEach(ans => consumedWords.add(ans.toUpperCase()));
        }
      } catch (err) { /* ignore */ }
    }
    
    const startVol = highestVol + 1;
    const endVol = highestVol + NEW_PUZZLES_PER_THEME;
    console.log(`\nTheme: [${theme.name}] currently has ${highestVol} volumes. Generating vol${startVol}-${endVol}...`);

    try {
        for (let i = startVol; i <= endVol; i++) {
            const id = buildPuzzleId(theme.name, i);
            const legacyId = buildPuzzleId(theme.name, i, true);
            
            // Skip if this puzzle already exists on disk (from a previous partial run)
            const existingFile = path.join(PUZZLES_DIR, `${id}.json`);
            const legacyFile = path.join(PUZZLES_DIR, `${legacyId}.json`);
            if ((fs.existsSync(existingFile) || fs.existsSync(legacyFile)) && !index.find(p => p.id === id || p.id === legacyId)) {
              const existingPath = fs.existsSync(existingFile) ? existingFile : legacyFile;
              try {
                const existing = JSON.parse(fs.readFileSync(existingPath, 'utf8'));
                if (existing.answers) {
                  existing.answers.across.forEach(a => consumedWords.add(a.toUpperCase()));
                  existing.answers.down.forEach(a => consumedWords.add(a.toUpperCase()));
                }
                index.push({ id: existing.id, title: existing.title, author: existing.author, date: existing.date, cols: existing.size.cols, rows: existing.size.rows, theme: existing.theme });
                console.log(`  ⏩ ${id} already exists on disk, added to index.`);
                continue;
              } catch(e) { /* corrupt file, regenerate */ }
            } else if (index.find(p => p.id === id || p.id === legacyId)) {
              console.log(`  ⏩ ${id} already in index, skipping.`);
              continue;
            }
            
            const availableWords = theme.words
              .filter(w => !consumedWords.has(w.answer.toUpperCase()))
              .sort((a, b) => {
                const aScore = scoreWordRelevance(a) || scoreWordForTheme(theme.name, a);
                const bScore = scoreWordRelevance(b) || scoreWordForTheme(theme.name, b);
                if (aScore === bScore) return Math.random() - 0.5;
                return bScore - aScore;
              });
            
            if (availableWords.length < 10) {
               console.log(`Not enough available words pool for ${theme.name} to generate Vol ${i}. Add more words to themes.json!`);
               break;
            }

            let generated = null;
            let generatedMetrics = null;
            let generatedHintCoverage = null;
            let generatedQuality = null;
            let bestFallbackCandidate = null;
            let bestFallbackMetrics = null;
            let bestFallbackQuality = null;
            for (let attempt = 1; attempt <= MAX_LAYOUT_QUALITY_RETRIES; attempt++) {
              const candidate = generateThemedPuzzle(id, theme.name, availableWords);
              const candidateMetrics = computePuzzleMetrics(candidate.puzzle);
              const quality = passesLayoutQualityGate(candidateMetrics, candidate.puzzle);

              const fallbackScore =
                (quality.hintCoverage.coverage * 1000) +
                (candidateMetrics.longWordTwoPlusRate * 100) +
                (candidateMetrics.veryLongWordThreePlusRate * 80);
              const bestFallbackScore = bestFallbackQuality
                ? (bestFallbackQuality.hintCoverage.coverage * 1000) +
                  (bestFallbackMetrics.longWordTwoPlusRate * 100) +
                  (bestFallbackMetrics.veryLongWordThreePlusRate * 80)
                : -Infinity;

              if (fallbackScore > bestFallbackScore) {
                bestFallbackCandidate = candidate;
                bestFallbackMetrics = candidateMetrics;
                bestFallbackQuality = quality;
              }

              if (quality.accepted) {
                generated = candidate;
                generatedMetrics = candidateMetrics;
                generatedHintCoverage = quality.hintCoverage;
                generatedQuality = quality;
                break;
              }

              if (attempt === MAX_LAYOUT_QUALITY_RETRIES && bestFallbackCandidate) {
                generated = bestFallbackCandidate;
                generatedMetrics = bestFallbackMetrics;
                generatedHintCoverage = bestFallbackQuality.hintCoverage;
                generatedQuality = bestFallbackQuality;
              }
            }

            const { puzzle, usedWords: placedWords } = generated;

            if (!generatedQuality?.accepted) {
              const hintPct = ((generatedHintCoverage?.coverage || 0) * 100).toFixed(0);
              console.warn(
                `  ⚠️ ${id} accepted below quality gates after ${MAX_LAYOUT_QUALITY_RETRIES} attempts (hint coverage ${hintPct}%, long gate ${generatedQuality?.longWordGate ? 'ok' : 'fail'}, very long gate ${generatedQuality?.veryLongWordGate ? 'ok' : 'fail'}).`
              );
            }
            
            // Track the newly placed words so they aren't used in subsequent volumes
            placedWords.forEach(w => consumedWords.add(w));

            puzzle.title = `${theme.name} ${i}`;
            puzzle.date = formatWaveLabel(i) || `Wave ${i}`;
            
            // Save individual file
            fs.writeFileSync(
              path.join(PUZZLES_DIR, `${id}.json`), 
              JSON.stringify(puzzle, null, 2)
            );
            
            // Add to index
            index.push({
              id: puzzle.id,
              title: puzzle.title,
              author: puzzle.author,
              date: puzzle.date,
              cols: puzzle.size.cols,
              rows: puzzle.size.rows,
              theme: puzzle.theme
            });
            
            const longRatePct = (generatedMetrics.longWordTwoPlusRate * 100).toFixed(0);
            const veryLongRatePct = (generatedMetrics.veryLongWordThreePlusRate * 100).toFixed(0);
            const hintCoveragePct = ((generatedHintCoverage?.coverage || 0) * 100).toFixed(0);
            const longCount = generatedMetrics.longWordCount;
            const veryLongCount = generatedMetrics.veryLongWordCount;
            console.log(
              `--> Saved ${id} (used ${placedWords.length} words, pool remaining: ${availableWords.length - placedWords.length}, long words: ${longCount}, very long: ${veryLongCount}, long 2+ cross: ${longRatePct}%, very long 3+ cross: ${veryLongRatePct}%, hint coverage: ${hintCoveragePct}% [${generatedHintCoverage?.hintCount || 0}/${generatedHintCoverage?.clueCount || 0}])`
            );
        }
    } catch (themeErr) {
        console.error(`\n❌ Failed to generate batch for theme [${theme.name}]:`, themeErr.message);
    }
  }

  // Reconcile: add any disk-only puzzle files not yet in the index
  const allDiskFiles = fs.readdirSync(PUZZLES_DIR).filter(f => f.endsWith('.json'));
  const indexedIds = new Set(index.map(p => p.id));
  for (const f of allDiskFiles) {
    const fId = f.replace('.json', '');
    if (!indexedIds.has(fId)) {
      try {
        const p = JSON.parse(fs.readFileSync(path.join(PUZZLES_DIR, f), 'utf8'));
        index.push({ id: p.id, title: p.title, author: p.author, date: p.date, cols: p.size.cols, rows: p.size.rows, theme: p.theme });
        console.log(`  📎 Reconciled ${fId} into index.`);
      } catch(e) { /* skip corrupt */ }
    }
  }

  // Sort index by canonical theme order, then by volume number
  const themeOrder = THEMES.map(t => t.name);
  index.sort((a, b) => {
    const themeIdxA = themeOrder.indexOf(a.theme);
    const themeIdxB = themeOrder.indexOf(b.theme);
    if (themeIdxA !== themeIdxB) return themeIdxA - themeIdxB;
    
    const volA = parseInt((a.id.match(/-vol(\d+)$/) || [0, 0])[1]);
    const volB = parseInt((b.id.match(/-vol(\d+)$/) || [0, 0])[1]);
    return volA - volB;
  });

  // Write index
  fs.writeFileSync(INDEX_FILE, JSON.stringify(index, null, 2));
  console.log(`\nSuccess. Total puzzles tracked in index: ${index.length}`);

  // Always refresh dataset version metadata so clients can auto-reset stale progress.
  const syncIndexScript = path.join(__dirname, 'sync-index.cjs');
  const sync = spawnSync(process.execPath, [syncIndexScript], { stdio: 'inherit' });
  if (sync.status !== 0) {
    console.error('❌ Failed to refresh dataset metadata via sync-index.cjs');
    process.exit(sync.status ?? 1);
  }
}

generateStarters();
