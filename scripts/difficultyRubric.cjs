const DIFFICULTY_RUBRIC = {
  easy: {
    maxPlacedWords: 7,
    maxAvgWordLength: 5.6,
    maxLongWordCount: 1,
    maxVeryLongWordCount: 0,
    minAvgIntersectionsPerWord: 1.65,
    maxProperNounLoad: 0.25,
    maxClueObscurityLoad: 0.22
  },
  hard: {
    minPlacedWords: 8,
    minAvgWordLength: 5.8,
    minLongWordCount: 2,
    minVeryLongWordCount: 1,
    maxAvgIntersectionsPerWord: 1.6,
    minProperNounLoad: 0.3,
    minClueObscurityLoad: 0.28
  },
  expert: {
    minAvgWordLength: 6.8,
    minLongWordCount: 3,
    minVeryLongWordCount: 1,
    minVeryLongAvgWordLength: 7,
    minAvgWordLengthWithTwoLongWords: 7,
    autoMinAvgWordLength: 7.4,
    autoMinLongWordCount: 4
  },
  batchSpread: {
    minEasy: 2,
    minExpert: 2
  }
};

function countHardSignals(profile) {
  let signals = 0;
  if (profile.placedWords >= DIFFICULTY_RUBRIC.hard.minPlacedWords) signals++;
  if (profile.avgWordLength >= DIFFICULTY_RUBRIC.hard.minAvgWordLength) signals++;
  if (profile.longWordCount >= DIFFICULTY_RUBRIC.hard.minLongWordCount) signals++;
  if (profile.veryLongWordCount >= DIFFICULTY_RUBRIC.hard.minVeryLongWordCount) signals++;
  if (profile.avgIntersectionsPerWord <= DIFFICULTY_RUBRIC.hard.maxAvgIntersectionsPerWord) signals++;
  if (profile.properNounLoad >= DIFFICULTY_RUBRIC.hard.minProperNounLoad) signals++;
  if (profile.clueObscurityLoad >= DIFFICULTY_RUBRIC.hard.minClueObscurityLoad) signals++;
  return signals;
}

function meetsEasyRubric(profile) {
  return profile.placedWords <= DIFFICULTY_RUBRIC.easy.maxPlacedWords &&
    profile.avgWordLength <= DIFFICULTY_RUBRIC.easy.maxAvgWordLength &&
    profile.longWordCount <= DIFFICULTY_RUBRIC.easy.maxLongWordCount &&
    profile.veryLongWordCount <= DIFFICULTY_RUBRIC.easy.maxVeryLongWordCount &&
    profile.avgIntersectionsPerWord >= DIFFICULTY_RUBRIC.easy.minAvgIntersectionsPerWord &&
    profile.properNounLoad <= DIFFICULTY_RUBRIC.easy.maxProperNounLoad &&
    profile.clueObscurityLoad <= DIFFICULTY_RUBRIC.easy.maxClueObscurityLoad;
}

function meetsExpertRubric(profile) {
  return (
    profile.avgWordLength >= DIFFICULTY_RUBRIC.expert.minAvgWordLength &&
    profile.longWordCount >= DIFFICULTY_RUBRIC.expert.minLongWordCount
  ) ||
    (
      profile.veryLongWordCount >= DIFFICULTY_RUBRIC.expert.minVeryLongWordCount &&
      profile.longWordCount >= 2 &&
      profile.avgWordLength >= DIFFICULTY_RUBRIC.expert.minVeryLongAvgWordLength
    ) ||
    (
      profile.longWordCount >= 2 &&
      profile.avgWordLength >= DIFFICULTY_RUBRIC.expert.minAvgWordLengthWithTwoLongWords
    ) ||
    profile.avgWordLength >= DIFFICULTY_RUBRIC.expert.autoMinAvgWordLength ||
    profile.longWordCount >= DIFFICULTY_RUBRIC.expert.autoMinLongWordCount;
}

function meetsHardRubric(profile) {
  return countHardSignals(profile) >= 2;
}

function classifyDifficulty(profile) {
  if (meetsEasyRubric(profile)) return 'Easy';
  if (meetsExpertRubric(profile)) return 'Expert';
  if (meetsHardRubric(profile)) return 'Hard';
  return 'Normal';
}

function summarizeDifficultySpread(labels) {
  const counts = labels.reduce((acc, label) => {
    acc[label] = (acc[label] || 0) + 1;
    return acc;
  }, {});

  return {
    counts,
    meetsMinimumSpread: (counts.Easy || 0) >= DIFFICULTY_RUBRIC.batchSpread.minEasy &&
      (counts.Expert || 0) >= DIFFICULTY_RUBRIC.batchSpread.minExpert
  };
}

module.exports = {
  DIFFICULTY_RUBRIC,
  classifyDifficulty,
  meetsEasyRubric,
  meetsHardRubric,
  meetsExpertRubric,
  summarizeDifficultySpread
};