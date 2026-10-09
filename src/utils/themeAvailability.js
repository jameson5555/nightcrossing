export function getNextMonthlyReleaseAt(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString();
}

export function formatNextReleaseDate(nextReleaseAt, {
  now = new Date(),
  locale,
  timeZone = 'UTC'
} = {}) {
  const configuredDate = new Date(nextReleaseAt);
  const releaseDate = Number.isNaN(configuredDate.getTime()) || configuredDate <= now
    ? new Date(getNextMonthlyReleaseAt(now))
    : configuredDate;

  return new Intl.DateTimeFormat(locale, {
    month: 'long',
    day: 'numeric',
    timeZone
  }).format(releaseDate);
}

export const MAX_VISIBLE_THEMES = 5;

export function selectVisibleThemeEntries(
  activeThemeEntries,
  maxThemes = MAX_VISIBLE_THEMES
) {
  const limit = Math.max(0, Number(maxThemes) || 0);
  const prioritizedThemes = [
    ...activeThemeEntries.filter(([, themeState]) => themeState.hasInProgressPuzzle),
    ...activeThemeEntries.filter(([, themeState]) => !themeState.hasInProgressPuzzle)
  ];
  const visibleThemes = new Set(
    prioritizedThemes.slice(0, limit).map(([theme]) => theme)
  );

  return activeThemeEntries.filter(([theme]) => visibleThemes.has(theme));
}

export function classifyThemeEntries({
  sortedThemeEntries,
  themeStatesByName,
  themeVisibility = {},
  themeAvailability = {}
}) {
  const activeThemeEntries = [];
  const completedThemeEntries = [];
  const themeOrder = new Map(sortedThemeEntries.map(([theme], index) => [theme, index]));
  const getProgressionOrder = (theme) => {
    const visited = new Set([theme]);
    let parent = themeVisibility?.[theme]?.lockedUntilThemeCompleted;
    while (themeOrder.has(parent) && !visited.has(parent)) {
      // Successors inherit their original parent's slot, including across
      // multiple generations, so an unrelated theme cannot take the reward's place.
      visited.add(parent);
      theme = parent;
      parent = themeVisibility?.[theme]?.lockedUntilThemeCompleted;
    }
    return themeOrder.get(theme);
  };

  for (const [theme] of sortedThemeEntries) {
    const themeState = themeStatesByName[theme];
    const lock = themeVisibility?.[theme]?.lockedUntilThemeCompleted;

    if (lock) {
      // A successor replaces its parent only after the parent is both complete
      // for this player and confirmed unable to receive another generated batch.
      const lockThemeIsCompleted = themeStatesByName[lock]?.hasCompletedAllThemePuzzles;
      const lockThemeIsExhausted = themeAvailability?.[lock]?.receivesNextBatch === false;
      if (!lockThemeIsCompleted || !lockThemeIsExhausted) {
        continue;
      }
    }

    // Missing availability metadata is intentionally treated as scheduled.
    // This keeps a caught-up theme waiting instead of exposing an unrelated lock.
    const receivesNextBatch = themeAvailability?.[theme]?.receivesNextBatch !== false;
    if (themeState.hasCompletedAllThemePuzzles && !receivesNextBatch) {
      completedThemeEntries.push([theme, themeState]);
    } else {
      activeThemeEntries.push([theme, themeState]);
    }
  }

  activeThemeEntries.sort(([themeA], [themeB]) => (
    getProgressionOrder(themeA) - getProgressionOrder(themeB)
  ));

  return { activeThemeEntries, completedThemeEntries };
}

export function getThemeCompletionOutcome({
  theme,
  completed,
  availableThemes = [],
  previouslyCompletedThemes = [],
  themeVisibility = {},
  themeAvailability = {}
}) {
  const willArchive = Boolean(completed) && themeAvailability?.[theme]?.receivesNextBatch === false;
  if (!willArchive) {
    return { willArchive: false, unlockedThemes: [] };
  }

  const available = new Set(availableThemes);
  const previouslyCompleted = new Set(previouslyCompletedThemes);
  const unlockedThemes = Object.entries(themeVisibility)
    .filter(([candidate, visibility]) => (
      candidate !== theme &&
      visibility?.lockedUntilThemeCompleted === theme &&
      available.has(candidate) &&
      !previouslyCompleted.has(candidate)
    ))
    .map(([candidate]) => candidate);

  return { willArchive: true, unlockedThemes };
}
