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
import level10_star_guide from '../assets/badges/level10_star_guide.svg';
import level11_eclipse_walker from '../assets/badges/level11_eclipse_walker.svg';
import level12_comet_keeper from '../assets/badges/level12_comet_keeper.svg';
import level13_aurora_seer from '../assets/badges/level13_aurora_seer.svg';
import level14_constellation_weaver from '../assets/badges/level14_constellation_weaver.svg';
import level15_void_cartographer from '../assets/badges/level15_void_cartographer.svg';
import level16_dawnbringer from '../assets/badges/level16_dawnbringer.svg';
import level17_nightcrossing from '../assets/badges/level17_nightcrossing.svg';

export const JOURNEY_RANKS = [
  { level: 1, name: 'Dark Horizon', required: 1, asset: level1_dark_horizon },
  { level: 2, name: 'Dusk', required: 3, asset: level2_dusk },
  { level: 3, name: 'Twilight', required: 6, asset: level3_twilight },
  { level: 4, name: 'Starlight', required: 10, asset: level4_starlight },
  { level: 5, name: 'Midnight', required: 15, asset: level5_midnight },
  { level: 6, name: 'Deep Night', required: 21, asset: level6_deepnight },
  { level: 7, name: 'Dreamer', required: 28, asset: level7_dreamer },
  { level: 8, name: 'Moonwalker', required: 36, asset: level8_moonwalker },
  { level: 9, name: 'Night Sage', required: 45, asset: level9_nightsage },
  { level: 10, name: 'Star Guide', required: 60, asset: level10_star_guide },
  { level: 11, name: 'Eclipse Walker', required: 78, asset: level11_eclipse_walker },
  { level: 12, name: 'Comet Keeper', required: 99, asset: level12_comet_keeper },
  { level: 13, name: 'Aurora Seer', required: 123, asset: level13_aurora_seer },
  { level: 14, name: 'Constellation Weaver', required: 150, asset: level14_constellation_weaver },
  { level: 15, name: 'Void Cartographer', required: 180, asset: level15_void_cartographer },
  { level: 16, name: 'Dawnbringer', required: 215, asset: level16_dawnbringer },
  { level: 17, name: 'Nightcrossing', required: 250, asset: level17_nightcrossing }
];

const MIN_LEVEL = JOURNEY_RANKS[0].level;
const MAX_LEVEL = JOURNEY_RANKS[JOURNEY_RANKS.length - 1].level;

function clampLevel(level) {
  return Math.min(Math.max(MIN_LEVEL, Number(level) || MIN_LEVEL), MAX_LEVEL);
}

function getRankDefinition(level) {
  const safeLevel = clampLevel(level);
  return JOURNEY_RANKS.find(rank => rank.level === safeLevel) || JOURNEY_RANKS[0];
}

export function getJourneyRankLevel(puzzlesCompleted, minimumLevel = MIN_LEVEL) {
  const completed = Math.max(0, Number(puzzlesCompleted) || 0);
  let level = MIN_LEVEL;

  for (const rank of JOURNEY_RANKS) {
    if (completed >= rank.required) {
      level = rank.level;
    }
  }

  return Math.max(level, clampLevel(minimumLevel));
}

export function getBadgeName(level) {
  return getRankDefinition(level).name;
}

export function getBadgeAsset(level) {
  return getRankDefinition(level).asset;
}

export function getJourneyRank(puzzlesCompleted, minimumLevel = MIN_LEVEL) {
  const level = getJourneyRankLevel(puzzlesCompleted, minimumLevel);
  const rank = getRankDefinition(level);
  return {
    level,
    name: rank.name,
    required: rank.required,
    asset: rank.asset,
    completed: Math.max(0, Number(puzzlesCompleted) || 0)
  };
}

export function getNextJourneyThreshold(puzzlesCompleted, minimumLevel = MIN_LEVEL) {
  const completed = Math.max(0, Number(puzzlesCompleted) || 0);
  const currentLevel = getJourneyRankLevel(completed, minimumLevel);
  return JOURNEY_RANKS.find(rank => rank.level > currentLevel) || null;
}

export function getJourneyProgress(puzzlesCompleted, minimumLevel = MIN_LEVEL) {
  const completed = Math.max(0, Number(puzzlesCompleted) || 0);
  const current = getJourneyRank(completed, minimumLevel);
  const next = getNextJourneyThreshold(completed, minimumLevel);
  const currentThreshold = current.required || 0;
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
  JOURNEY_RANKS,
  getBadgeLevel,
  getJourneyRankLevel,
  getJourneyRank,
  getBadgeName,
  getBadgeAsset,
  getNextLevelThreshold,
  getNextJourneyThreshold,
  getJourneyProgress
};
