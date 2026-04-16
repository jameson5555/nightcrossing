// Badge utilities: level calculation, names, assets, and thresholds
import level1_dark_horizon from '../assets/badges/level1_dark_horizon.svg';
import level2_dusk from '../assets/badges/level2_dusk.svg';
import level3_starlight from '../assets/badges/level3_starlight.svg';
import level4_midnight from '../assets/badges/level4_midnight.svg';
import level5_deepnight from '../assets/badges/level5_deepnight.svg';
import level6_dreamer from '../assets/badges/level6_dreamer.svg';
import level7_moonwalker from '../assets/badges/level7_moonwalker.svg';
import level8_nightsage from '../assets/badges/level8_nightsage.svg';
import level9_twilight from '../assets/badges/level9_twilight.svg';

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
  3: level9_twilight,    // twilight artwork
  4: level3_starlight,
  5: level4_midnight,
  6: level5_deepnight,
  7: level6_dreamer,
  8: level7_moonwalker,
  9: level8_nightsage
};

export function getBadgeLevel(puzzlesCompleted) {
  const level = Math.floor((Number(puzzlesCompleted) || 0) / 3) + 1;
  return Math.min(Math.max(1, level), 9);
}

export function getBadgeName(level) {
  const l = Math.min(Math.max(1, Number(level) || 1), 9);
  return NAME_MAP[l] || 'Unknown';
}

export function getBadgeAsset(level) {
  const l = Math.min(Math.max(1, Number(level) || 1), 9);
  return ASSET_MAP[l] || level1_dark_horizon;
}

export function getNextLevelThreshold(level) {
  const l = Math.max(1, Number(level) || 1);
  // Total puzzles required to reach the NEXT level: level * 3
  return l * 3;
}

export default {
  getBadgeLevel,
  getBadgeName,
  getBadgeAsset,
  getNextLevelThreshold
};
