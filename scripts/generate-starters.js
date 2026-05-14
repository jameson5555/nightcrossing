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
  ? Math.max(1, Math.min(10, Number(process.env.NC_MAX_LAYOUT_QUALITY_RETRIES)))
  : 5;
const MIN_LONG_TWO_PLUS_RATE = Number.isFinite(Number(process.env.NC_MIN_LONG_TWO_PLUS_RATE))
  ? Math.max(0, Math.min(1, Number(process.env.NC_MIN_LONG_TWO_PLUS_RATE)))
  : 0.82;
const MIN_VERY_LONG_THREE_PLUS_RATE = Number.isFinite(Number(process.env.NC_MIN_VERY_LONG_THREE_PLUS_RATE))
  ? Math.max(0, Math.min(1, Number(process.env.NC_MIN_VERY_LONG_THREE_PLUS_RATE)))
  : 0.62;
const MIN_HINT_COVERAGE = Number.isFinite(Number(process.env.NC_MIN_HINT_COVERAGE))
  ? Math.max(0, Math.min(1, Number(process.env.NC_MIN_HINT_COVERAGE)))
  : 0.97;
const MAX_LEXICAL_OBSCURE_SIGNAL_LOAD = Number.isFinite(Number(process.env.NC_MAX_LEXICAL_OBSCURE_SIGNAL_LOAD))
  ? Math.max(0, Math.min(1, Number(process.env.NC_MAX_LEXICAL_OBSCURE_SIGNAL_LOAD)))
  : 0.24;
const EASY_FIRST_PASS_VOLUMES_PER_THEME = Number.isFinite(Number(process.env.NC_EASY_FIRST_PASS_VOLUMES_PER_THEME))
  ? Math.max(0, Math.min(3, Number(process.env.NC_EASY_FIRST_PASS_VOLUMES_PER_THEME)))
  : 3;
const EASY_STRICT_EXTRA_RETRIES = Number.isFinite(Number(process.env.NC_EASY_STRICT_EXTRA_RETRIES))
  ? Math.max(0, Math.min(8, Number(process.env.NC_EASY_STRICT_EXTRA_RETRIES)))
  : 3;
const EASY_STRICT_ATTEMPT_MULTIPLIER = Number.isFinite(Number(process.env.NC_EASY_STRICT_ATTEMPT_MULTIPLIER))
  ? Math.max(1, Math.min(4, Number(process.env.NC_EASY_STRICT_ATTEMPT_MULTIPLIER)))
  : 1.8;
const EASY_DEFAULT_FALLBACK_ATTEMPTS = Number.isFinite(Number(process.env.NC_EASY_DEFAULT_FALLBACK_ATTEMPTS))
  ? Math.max(0, Math.min(3, Number(process.env.NC_EASY_DEFAULT_FALLBACK_ATTEMPTS)))
  : 1;

const LEXICAL_OBSCURE_SIGNAL_REGEX = /\b(goddess|god|deity|mythological|myth|constellation|kuiper|trojan|tau\s+[a-z]+|mistress\s+of\s+zeus|one\s+of\s+the\s+moons?\s+of\s+(jupiter|saturn|uranus)|aoede|elara|amalthea|hygiea|pegasi|capricorni|ursa\s+major)\b/i;

function addPuzzleAnswersToSet(puzzleData, targetSet) {
  if (!puzzleData?.answers) return;
  for (const answer of puzzleData.answers.across || []) {
    targetSet.add(String(answer).toUpperCase());
  }
  for (const answer of puzzleData.answers.down || []) {
    targetSet.add(String(answer).toUpperCase());
  }
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

function computeLexicalObscureSignalLoad(puzzle) {
  const acrossClues = Array.isArray(puzzle?.clues?.across) ? puzzle.clues.across : [];
  const downClues = Array.isArray(puzzle?.clues?.down) ? puzzle.clues.down : [];
  const hints = puzzle?.hints && typeof puzzle.hints === 'object' ? Object.values(puzzle.hints) : [];

  const texts = [...acrossClues, ...downClues, ...hints]
    .map(text => String(text || '').replace(/^\d+\.\s*/, '').trim())
    .filter(Boolean);

  if (texts.length === 0) {
    return { load: 0, hits: 0, total: 0 };
  }

  let hits = 0;
  for (const text of texts) {
    if (LEXICAL_OBSCURE_SIGNAL_REGEX.test(text)) hits++;
  }

  return {
    load: hits / texts.length,
    hits,
    total: texts.length
  };
}

function stripCluePrefix(entry) {
  return String(entry || '').replace(/^\d+\.\s*/, '').trim();
}

function likelyPluralAnswer(answer) {
  const value = String(answer || '').trim().toUpperCase();
  if (value.length < 4) return false;
  if (!value.endsWith('S')) return false;
  if (value.endsWith('SS')) return false;
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
    if (/(S|X|Z|CH|SH)$/.test(base)) {
      return base;
    }
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

function pluralizeWord(word) {
  if (!word) return word;
  if (/s$/i.test(word)) return word;
  if (/[^aeiou]y$/i.test(word)) return `${word.slice(0, -1)}ies`;
  if (/(s|x|z|ch|sh)$/i.test(word)) return `${word}es`;
  return `${word}s`;
}

function pluralizeTrailingWord(clueText) {
  const match = String(clueText || '').match(/^(.*\b)([A-Za-z]+)([^A-Za-z]*)$/);
  if (!match) return clueText;

  const [, prefix, lastWord, suffix] = match;
  const pluralized = pluralizeWord(lastWord);
  if (pluralized === lastWord) return clueText;
  return `${prefix}${pluralized}${suffix}`;
}

function collectPuzzleClueEntries(puzzle) {
  const entries = [];

  const acrossClues = Array.isArray(puzzle?.clues?.across) ? puzzle.clues.across : [];
  const downClues = Array.isArray(puzzle?.clues?.down) ? puzzle.clues.down : [];
  const acrossAnswers = Array.isArray(puzzle?.answers?.across) ? puzzle.answers.across : [];
  const downAnswers = Array.isArray(puzzle?.answers?.down) ? puzzle.answers.down : [];

  acrossClues.forEach((entry, idx) => {
    entries.push({
      direction: 'across',
      index: idx,
      originalEntry: entry,
      clueText: stripCluePrefix(entry),
      answer: String(acrossAnswers[idx] || '').trim().toUpperCase()
    });
  });

  downClues.forEach((entry, idx) => {
    entries.push({
      direction: 'down',
      index: idx,
      originalEntry: entry,
      clueText: stripCluePrefix(entry),
      answer: String(downAnswers[idx] || '').trim().toUpperCase()
    });
  });

  return entries;
}

function applyPluralizationToDuplicateClues(puzzle) {
  const entries = collectPuzzleClueEntries(puzzle);
  const byClueText = new Map();

  for (const entry of entries) {
    const key = entry.clueText.toLowerCase();
    if (!byClueText.has(key)) byClueText.set(key, []);
    byClueText.get(key).push(entry);
  }

  for (const group of byClueText.values()) {
    if (group.length < 2) continue;

    let hasSingularPluralPair = false;
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        if (areSingularPluralPair(group[i].answer, group[j].answer)) {
          hasSingularPluralPair = true;
          break;
        }
      }
      if (hasSingularPluralPair) break;
    }

    if (!hasSingularPluralPair) continue;

    for (const entry of group) {
      if (!likelyPluralAnswer(entry.answer)) continue;

      const adjustedClue = pluralizeTrailingWord(entry.clueText);
      if (!adjustedClue || adjustedClue === entry.clueText) continue;

      const prefixMatch = String(entry.originalEntry || '').match(/^(\d+\.\s*)/);
      const prefix = prefixMatch ? prefixMatch[1] : '';
      const patched = `${prefix}${adjustedClue}`;

      if (entry.direction === 'across') {
        puzzle.clues.across[entry.index] = patched;
      } else {
        puzzle.clues.down[entry.index] = patched;
      }
    }
  }
}

function computeDuplicateClueSummary(puzzle) {
  const entries = collectPuzzleClueEntries(puzzle);
  const byClueText = new Map();

  for (const entry of entries) {
    const key = entry.clueText.toLowerCase().trim();
    if (!key) continue;
    if (!byClueText.has(key)) byClueText.set(key, []);
    byClueText.get(key).push(entry);
  }

  let duplicateCount = 0;
  for (const group of byClueText.values()) {
    if (group.length < 2) continue;
    const distinctAnswers = new Set(group.map(item => item.answer));
    if (distinctAnswers.size > 1) duplicateCount++;
  }

  return { duplicateCount };
}

function passesLayoutQualityGate(metrics, puzzle) {
  applyPluralizationToDuplicateClues(puzzle);

  const longWordGate = metrics.longWordCount === 0 || metrics.longWordTwoPlusRate >= MIN_LONG_TWO_PLUS_RATE;
  const veryLongWordGate =
    metrics.veryLongWordCount === 0 ||
    metrics.veryLongWordThreePlusRate >= MIN_VERY_LONG_THREE_PLUS_RATE;
  const hintCoverage = computeHintCoverage(puzzle);
  const lexicalSignals = computeLexicalObscureSignalLoad(puzzle);
  const duplicateClues = computeDuplicateClueSummary(puzzle);
  const hintGate = hintCoverage.coverage >= MIN_HINT_COVERAGE;
  const lexicalGate = lexicalSignals.load <= MAX_LEXICAL_OBSCURE_SIGNAL_LOAD;
  const duplicateClueGate = duplicateClues.duplicateCount === 0;

  return {
    accepted: longWordGate && veryLongWordGate && hintGate && lexicalGate && duplicateClueGate,
    hintCoverage,
    lexicalSignals,
    duplicateClues,
    longWordGate,
    veryLongWordGate,
    hintGate,
    lexicalGate,
    duplicateClueGate
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

  console.log(
    `Approachable generation mode: easy-first for first ${EASY_FIRST_PASS_VOLUMES_PER_THEME} volume(s) per theme in this run.`
  );
  console.log(
    `Easy strict retries: +${EASY_STRICT_EXTRA_RETRIES}, attempt multiplier: ${EASY_STRICT_ATTEMPT_MULTIPLIER.toFixed(2)}, default fallback attempts: ${EASY_DEFAULT_FALLBACK_ATTEMPTS}.`
  );
  
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
                const aScore = scoreWordForTheme(theme.name, a);
                const bScore = scoreWordForTheme(theme.name, b);
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
            let generatedProfileUsed = 'default';
            let bestFallbackCandidate = null;
            let bestFallbackMetrics = null;
            let bestFallbackQuality = null;
            let bestFallbackProfile = 'default';
            const volumeOffset = i - startVol;
            const isEasyTargetVolume = volumeOffset < EASY_FIRST_PASS_VOLUMES_PER_THEME;
            const easyStrictAttempts = isEasyTargetVolume
              ? MAX_LAYOUT_QUALITY_RETRIES + EASY_STRICT_EXTRA_RETRIES
              : 0;
            const totalAttempts = isEasyTargetVolume
              ? easyStrictAttempts + EASY_DEFAULT_FALLBACK_ATTEMPTS
              : MAX_LAYOUT_QUALITY_RETRIES;
            const requestedProfile = isEasyTargetVolume ? 'easy' : 'default';

            for (let attempt = 1; attempt <= totalAttempts; attempt++) {
              const inStrictEasyPhase = isEasyTargetVolume && attempt <= easyStrictAttempts;
              const candidateProfile = inStrictEasyPhase ? 'easy' : 'default';
              const candidateOptions = inStrictEasyPhase
                ? {
                    profile: 'easy',
                    allowEasyFallbackToDefault: false,
                    attemptMultiplier: EASY_STRICT_ATTEMPT_MULTIPLIER
                  }
                : { profile: 'default' };

              let candidate;
              try {
                candidate = generateThemedPuzzle(id, theme.name, availableWords, candidateOptions);
              } catch (err) {
                const hasMoreAttempts = attempt < totalAttempts;
                if (inStrictEasyPhase && hasMoreAttempts) {
                  if (attempt === easyStrictAttempts && EASY_DEFAULT_FALLBACK_ATTEMPTS > 0) {
                    console.warn(
                      `  ⚠️ ${id} exhausted strict easy retries (${easyStrictAttempts}); trying default fallback generation.`
                    );
                  }
                  continue;
                }
                throw err;
              }

              const candidateMetrics = computePuzzleMetrics(candidate.puzzle);
              const quality = passesLayoutQualityGate(candidateMetrics, candidate.puzzle);

              if (!quality.duplicateClueGate) {
                continue;
              }

              const fallbackScore =
                (quality.hintCoverage.coverage * 1000) +
                (candidateMetrics.longWordTwoPlusRate * 100) +
                (candidateMetrics.veryLongWordThreePlusRate * 80) +
                ((1 - quality.lexicalSignals.load) * 140) +
                (candidateProfile === 'easy' ? 20 : 0);
              const bestFallbackScore = bestFallbackQuality
                ? (bestFallbackQuality.hintCoverage.coverage * 1000) +
                  (bestFallbackMetrics.longWordTwoPlusRate * 100) +
                  (bestFallbackMetrics.veryLongWordThreePlusRate * 80) +
                  ((1 - bestFallbackQuality.lexicalSignals.load) * 140) +
                  (bestFallbackProfile === 'easy' ? 20 : 0)
                : -Infinity;

              if (fallbackScore > bestFallbackScore) {
                bestFallbackCandidate = candidate;
                bestFallbackMetrics = candidateMetrics;
                bestFallbackQuality = quality;
                bestFallbackProfile = candidate.profileUsed || candidateProfile;
              }

              if (quality.accepted) {
                generated = candidate;
                generatedMetrics = candidateMetrics;
                generatedHintCoverage = quality.hintCoverage;
                generatedQuality = quality;
                generatedProfileUsed = candidate.profileUsed || candidateProfile;
                break;
              }

              if (attempt === totalAttempts && bestFallbackCandidate) {
                generated = bestFallbackCandidate;
                generatedMetrics = bestFallbackMetrics;
                generatedHintCoverage = bestFallbackQuality.hintCoverage;
                generatedQuality = bestFallbackQuality;
                generatedProfileUsed = bestFallbackProfile;
              }
            }

            if (!generated) {
              throw new Error(`No candidate generated for ${id}.`);
            }

            const { puzzle, usedWords: placedWords } = generated;

            if (!generatedQuality?.accepted) {
              const hintPct = ((generatedHintCoverage?.coverage || 0) * 100).toFixed(0);
              const lexicalPct = ((generatedQuality?.lexicalSignals?.load || 0) * 100).toFixed(0);
              console.warn(
                `  ⚠️ ${id} accepted below quality gates after ${totalAttempts} attempts (hint coverage ${hintPct}%, lexical signal ${lexicalPct}%, long gate ${generatedQuality?.longWordGate ? 'ok' : 'fail'}, very long gate ${generatedQuality?.veryLongWordGate ? 'ok' : 'fail'}, lexical gate ${generatedQuality?.lexicalGate ? 'ok' : 'fail'}, duplicate clue gate ${generatedQuality?.duplicateClueGate ? 'ok' : 'fail'}).`
              );
            }

            if (requestedProfile === 'easy' && generatedProfileUsed !== 'easy') {
              console.warn(`  ⚠️ ${id} used default profile after strict easy retries.`);
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
            const lexicalSignalPct = ((generatedQuality?.lexicalSignals?.load || 0) * 100).toFixed(0);
            const longCount = generatedMetrics.longWordCount;
            const veryLongCount = generatedMetrics.veryLongWordCount;
            console.log(
              `--> Saved ${id} [requested=${requestedProfile}, used=${generatedProfileUsed}] (used ${placedWords.length} words, pool remaining: ${availableWords.length - placedWords.length}, long words: ${longCount}, very long: ${veryLongCount}, long 2+ cross: ${longRatePct}%, very long 3+ cross: ${veryLongRatePct}%, hint coverage: ${hintCoveragePct}% [${generatedHintCoverage?.hintCount || 0}/${generatedHintCoverage?.clueCount || 0}], lexical signal: ${lexicalSignalPct}%)`
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
