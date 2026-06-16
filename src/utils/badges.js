// Badge utilities: journey rank calculation, names, assets, and thresholds
import level1_dark_horizon from '../assets/badges/level1_dark_horizon.svg';
import level2_dusk from '../assets/badges/level2_dusk.svg';
import level3_twilight from '../assets/badges/level3_twilight.svg';
import level4_starlight from '../assets/badges/level4_starlight.svg';
import level5_midnight from '../assets/badges/level5_midnight.svg';
import level6_deepnight from '../assets/badges/level6_deepnight.svg';
import level7_dreamer from '../assets/badges/level7_dreamer.svg';
import level8_moonwalker from '../assets/badges/level8_moonwalker.svg';
import level9_nightsage from '../assets/badges/level9_nightsage.svg';

const NAME_MAP = {
  1: 'Dark Horizon',
  2: 'Dusk',
  3: 'Twilight',
  4: 'Starlight',
  5: 'Midnight',
  6: 'Deep Night',
  7: 'Dreamer',
  8: 'Moonwalker',
  9: 'Night Sage'
};

// Map logical levels to the available SVG assets by name.
const ASSET_MAP = {
  1: level1_dark_horizon,
  2: level2_dusk,
  3: level3_twilight,
  4: level4_starlight,
  5: level5_midnight,
  6: level6_deepnight,
  7: level7_dreamer,
  8: level8_moonwalker,
  9: level9_nightsage
};

const JOURNEY_THRESHOLDS = [
  { level: 1, required: 1 },
  { level: 2, required: 3 },
  { level: 3, required: 6 },
  { level: 4, required: 10 },
  { level: 5, required: 15 },
  { level: 6, required: 21 },
  { level: 7, required: 28 },
  { level: 8, required: 36 },
  { level: 9, required: 45 }
];

export function getJourneyRankLevel(puzzlesCompleted) {
  const completed = Math.max(0, Number(puzzlesCompleted) || 0);
  let level = 1;

  for (const threshold of JOURNEY_THRESHOLDS) {
    if (completed >= threshold.required) {
      level = threshold.level;
    }
  }

  return level;
}

export function getBadgeName(level) {
  const l = Math.min(Math.max(1, Number(level) || 1), 9);
  return NAME_MAP[l] || 'Unknown';
}

export function getBadgeAsset(level) {
  const l = Math.min(Math.max(1, Number(level) || 1), 9);
  return ASSET_MAP[l] || level1_dark_horizon;
}

export function getJourneyRank(puzzlesCompleted) {
  const level = getJourneyRankLevel(puzzlesCompleted);
  return {
    level,
    name: getBadgeName(level),
    asset: getBadgeAsset(level),
    completed: Math.max(0, Number(puzzlesCompleted) || 0)
  };
}

export function getNextJourneyThreshold(puzzlesCompleted) {
  const completed = Math.max(0, Number(puzzlesCompleted) || 0);
  return JOURNEY_THRESHOLDS.find(threshold => threshold.required > completed) || null;
}

export function getJourneyProgress(puzzlesCompleted) {
  const completed = Math.max(0, Number(puzzlesCompleted) || 0);
  const current = getJourneyRank(completed);
  const next = getNextJourneyThreshold(completed);
  const currentThreshold = JOURNEY_THRESHOLDS.find(threshold => threshold.level === current.level)?.required || 0;
  const nextThreshold = next?.required || currentThreshold;
  const span = Math.max(1, nextThreshold - currentThreshold);
  const progress = next ? Math.min(1, Math.max(0, (completed - currentThreshold) / span)) : 1;

  return {
    current,
    next,
    progress
  };
}

// Backward-compatible names for older imports.
export function getBadgeLevel(puzzlesCompleted) {
  return getJourneyRankLevel(puzzlesCompleted);
}

export function getNextLevelThreshold(puzzlesCompleted) {
  const next = getNextJourneyThreshold(puzzlesCompleted);
  return next ? next.required : null;
}

export default {
  getBadgeLevel,
  getJourneyRankLevel,
  getJourneyRank,
  getBadgeName,
  getBadgeAsset,
  getNextLevelThreshold,
  getNextJourneyThreshold,
  getJourneyProgress
};
