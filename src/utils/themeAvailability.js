export function getNextMonthlyReleaseAt(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString();
}

export function formatNextReleaseDate(nextReleaseAt, {
  now = new Date(),
  locale,
  timeZone = 'UTC'
} = {}) {
  const configuredDate = new Date(nextReleaseAt);
  const releaseDate = Number.isNaN(configuredDate.getTime())
    ? new Date(getNextMonthlyReleaseAt(now))
    : configuredDate;

  return new Intl.DateTimeFormat(locale, {
    month: 'long',
    day: 'numeric',
    timeZone
  }).format(releaseDate);
}

export function classifyThemeEntries({
  sortedThemeEntries,
  themeStatesByName,
  themeVisibility = {},
  themeAvailability = {}
}) {
  const activeThemeEntries = [];
  const completedThemeEntries = [];

  for (const [theme] of sortedThemeEntries) {
    const themeState = themeStatesByName[theme];
    const lock = themeVisibility?.[theme]?.lockedUntilThemeCompleted;

    if (lock && !themeStatesByName[lock]?.hasCompletedAllThemePuzzles) {
      continue;
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

  return { activeThemeEntries, completedThemeEntries };
}
