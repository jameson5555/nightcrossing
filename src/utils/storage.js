import { Preferences } from '@capacitor/preferences';
import { createGameStorage } from './gameStorage.js';

// Guest-only compatibility API. React players receive a bound account scope.
export const {
  resetReplacedPuzzleProgress,
  recordPuzzleDatasetVersion,
  savePuzzleProgress,
  loadPuzzleProgress,
  checkPuzzleStatus,
  loadHintsRemaining,
  changeHintsRemaining,
  awardHints,
  saveUnlockedHints,
  loadUnlockedHints,
  saveRewardClaimed,
  loadRewardClaimed,
  saveRevealedIndices,
  loadRevealedIndices,
  saveHintsEmptyTimestamp,
  loadHintsEmptyTimestamp,
  clearHintsEmptyTimestamp,
  saveBonusHintsAwardedSinceEmpty,
  loadBonusHintsAwardedSinceEmpty,
  saveFreeHintToastSeen,
  loadFreeHintToastSeen,
  saveFreeHintClaimed,
  loadFreeHintClaimed,
  saveBonusHintToastPending,
  loadBonusHintToastPending,
  saveThemeProgress,
  loadThemeProgress,
  loadJourneyRankHighWatermark,
  saveJourneyRankHighWatermark
} = createGameStorage(Preferences);
