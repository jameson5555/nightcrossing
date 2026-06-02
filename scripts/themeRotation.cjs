const fs = require('fs');
const path = require('path');

const ROTATION_FILE = path.join(__dirname, 'theme-rotation.json');
const PUZZLES_DIR = path.join(__dirname, '../public/data/puzzles');
const INDEX_FILE = path.join(__dirname, '../public/data/puzzles.json');

function normalizedThemeKey(themeName) {
  return String(themeName || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function slugifyThemeName(themeName) {
  return String(themeName || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-');
}

function parseVolumeFromId(id) {
  const match = String(id || '').match(/-vol(\d+)$/);
  return match ? Number(match[1]) : null;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function loadRotation() {
  if (!fs.existsSync(ROTATION_FILE)) {
    return { slots: [], candidates: [], retired: [] };
  }

  const parsed = JSON.parse(fs.readFileSync(ROTATION_FILE, 'utf8'));
  return {
    slots: Array.isArray(parsed.slots) ? parsed.slots : [],
    candidates: Array.isArray(parsed.candidates) ? parsed.candidates : [],
    retired: Array.isArray(parsed.retired) ? parsed.retired : []
  };
}

function saveRotation(rotation) {
  fs.writeFileSync(ROTATION_FILE, `${JSON.stringify(rotation, null, 2)}\n`);
}

function findThemeByName(themes, themeName) {
  const target = normalizedThemeKey(themeName);
  return themes.find(theme => normalizedThemeKey(theme?.name) === target) || null;
}

function buildThemeNameResolver(themes) {
  const byKey = new Map();
  for (const theme of themes || []) {
    if (theme?.name) byKey.set(normalizedThemeKey(theme.name), theme.name);
  }
  return (themeName) => byKey.get(normalizedThemeKey(themeName)) || themeName;
}

function listPuzzleRecords() {
  const records = [];
  const seenIds = new Set();

  if (fs.existsSync(INDEX_FILE)) {
    try {
      const index = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8'));
      if (Array.isArray(index)) {
        for (const entry of index) {
          if (!entry?.id || seenIds.has(entry.id)) continue;
          records.push({
            id: entry.id,
            theme: entry.theme || '',
            volume: parseVolumeFromId(entry.id)
          });
          seenIds.add(entry.id);
        }
      }
    } catch {
      // Fall through to disk scan.
    }
  }

  if (fs.existsSync(PUZZLES_DIR)) {
    const files = fs.readdirSync(PUZZLES_DIR).filter(file => file.endsWith('.json'));
    for (const file of files) {
      const id = file.replace(/\.json$/, '');
      if (seenIds.has(id)) continue;
      try {
        const puzzle = JSON.parse(fs.readFileSync(path.join(PUZZLES_DIR, file), 'utf8'));
        records.push({
          id: puzzle?.id || id,
          theme: puzzle?.theme || '',
          volume: parseVolumeFromId(puzzle?.id || id)
        });
        seenIds.add(id);
      } catch {
        // Ignore malformed puzzle files for rotation accounting.
      }
    }
  }

  return records;
}

function countThemeVolumes(themeName, records = listPuzzleRecords()) {
  const target = normalizedThemeKey(themeName);
  const volumes = new Set();
  for (const record of records) {
    if (normalizedThemeKey(record.theme) !== target) continue;
    if (Number.isInteger(record.volume)) volumes.add(record.volume);
  }
  return volumes.size;
}

function getHighestThemeVolume(themeName, records = listPuzzleRecords()) {
  const target = normalizedThemeKey(themeName);
  let highest = 0;
  for (const record of records) {
    if (normalizedThemeKey(record.theme) !== target) continue;
    if (Number.isInteger(record.volume) && record.volume > highest) {
      highest = record.volume;
    }
  }
  return highest;
}

function getCurrentThemeNames(rotation = loadRotation()) {
  return rotation.slots
    .map(slot => slot?.currentTheme)
    .filter(Boolean);
}

function getNextThemeNames(rotation = loadRotation()) {
  return rotation.slots
    .map(slot => slot?.nextTheme)
    .filter(Boolean);
}

function getGenerationThemeNames(rotation = loadRotation()) {
  const names = [];
  const seen = new Set();
  for (const slot of rotation.slots) {
    const themeNames = slot?.status === 'exhausted'
      ? [slot?.nextTheme]
      : [slot?.currentTheme, slot?.nextTheme];
    for (const themeName of themeNames) {
      if (!themeName) continue;
      const key = normalizedThemeKey(themeName);
      if (seen.has(key)) continue;
      names.push(themeName);
      seen.add(key);
    }
  }
  return names;
}

function buildThemeVisibility(rotation = loadRotation()) {
  const visibility = {};
  for (const slot of rotation.slots) {
    if (!slot?.currentTheme || !slot?.nextTheme) continue;
    visibility[slot.nextTheme] = {
      lockedUntilThemeCompleted: slot.currentTheme
    };
  }
  return visibility;
}

function removeCandidate(rotation, themeName) {
  const target = normalizedThemeKey(themeName);
  rotation.candidates = (rotation.candidates || []).filter(candidate => normalizedThemeKey(candidate) !== target);
}

function markThemeExhausted(rotation, themeName, reason = 'generation-exhausted') {
  const slot = rotation.slots.find(item => normalizedThemeKey(item?.currentTheme) === normalizedThemeKey(themeName));
  if (!slot) return null;
  slot.status = 'exhausted';
  slot.exhaustedAt = new Date().toISOString();
  slot.exhaustionReason = reason;
  return slot;
}

function assignNextTheme(rotation, currentTheme, nextTheme) {
  const slot = rotation.slots.find(item => normalizedThemeKey(item?.currentTheme) === normalizedThemeKey(currentTheme));
  if (!slot) return null;
  slot.nextTheme = nextTheme;
  slot.status = 'exhausted';
  removeCandidate(rotation, nextTheme);
  return slot;
}

function retireCompletedTheme(rotation, currentTheme) {
  const idx = rotation.slots.findIndex(item => normalizedThemeKey(item?.currentTheme) === normalizedThemeKey(currentTheme));
  if (idx === -1) return false;
  const slot = rotation.slots[idx];
  if (!slot.nextTheme) return false;

  rotation.retired = Array.isArray(rotation.retired) ? rotation.retired : [];
  rotation.retired.push({
    theme: slot.currentTheme,
    replacedBy: slot.nextTheme,
    retiredAt: new Date().toISOString(),
    reason: slot.exhaustionReason || 'generation-exhausted'
  });

  rotation.slots[idx] = {
    currentTheme: slot.nextTheme,
    status: 'active',
    nextTheme: null
  };
  return true;
}

function syncRotationThemeNames(rotation, themes) {
  const resolve = buildThemeNameResolver(themes);
  const next = clone(rotation);
  next.slots = next.slots.map(slot => ({
    ...slot,
    currentTheme: slot.currentTheme ? resolve(slot.currentTheme) : slot.currentTheme,
    nextTheme: slot.nextTheme ? resolve(slot.nextTheme) : slot.nextTheme
  }));
  next.candidates = next.candidates.map(resolve);
  return next;
}

module.exports = {
  ROTATION_FILE,
  normalizedThemeKey,
  slugifyThemeName,
  parseVolumeFromId,
  loadRotation,
  saveRotation,
  findThemeByName,
  listPuzzleRecords,
  countThemeVolumes,
  getHighestThemeVolume,
  getCurrentThemeNames,
  getNextThemeNames,
  getGenerationThemeNames,
  buildThemeVisibility,
  markThemeExhausted,
  assignNextTheme,
  retireCompletedTheme,
  syncRotationThemeNames
};
