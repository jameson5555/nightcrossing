import React, { useEffect, useRef, useState } from 'react';
import './PuzzleList.css';
import { checkPuzzleStatus, loadJourneyRankHighWatermark, loadPuzzleProgress } from '../utils/storage';
import { getJourneyProgress } from '../utils/badges';
import { getSolvedClueIds } from '../utils/crossword';
import {
  classifyThemeEntries,
  formatNextReleaseDate,
  selectVisibleThemeEntries
} from '../utils/themeAvailability';
import { fetchPuzzleData } from '../utils/puzzleData';

const THEME_DISPLAY_ORDER = [
  'Space & Sky',
  'Food & Cooking',
  'Music & Sound',
  'Ocean & Marine Life',
  'Sports & Athletics',
  'Weather & Climate',
  'Internet & Software',
  'Plants & Gardens',
  'Animals & Wildlife',
  'Transportation & Vehicles',
  'Home & Tools',
  'Space & Astronomy',
  'Technology & Computing',
  'Nature & Wilderness',
  'History & Civilization'
];
function compareThemeOrder(a, b) {
  const indexA = THEME_DISPLAY_ORDER.indexOf(a);
  const indexB = THEME_DISPLAY_ORDER.indexOf(b);
  const safeIndexA = indexA === -1 ? Number.MAX_SAFE_INTEGER : indexA;
  const safeIndexB = indexB === -1 ? Number.MAX_SAFE_INTEGER : indexB;
  if (safeIndexA !== safeIndexB) return safeIndexA - safeIndexB;
  return String(a).localeCompare(String(b));
}

function parseVolumeFromId(id) {
  const match = String(id || '').match(/-vol(\d+)$/);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

function comparePuzzleOrder(a, b) {
  const volA = parseVolumeFromId(a.id);
  const volB = parseVolumeFromId(b.id);
  if (volA !== volB) return volA - volB;
  return String(a.id).localeCompare(String(b.id));
}

const PuzzleList = ({
  onSelectPuzzle,
  puzzles,
  puzzleMeta,
  listState,
  onListStateChange,
  refreshToken
}) => {
  const [statuses, setStatuses] = useState(() => listState?.statuses || {});
  const [wordsLeftByPuzzle, setWordsLeftByPuzzle] = useState(() => listState?.wordsLeftByPuzzle || {});
  const [loading, setLoading] = useState(() => !listState?.statuses);
  const [expandedTheme, setExpandedTheme] = useState(null);
  const [moonAnimationReady, setMoonAnimationReady] = useState(false);
  const [journeyRankHighWatermark, setJourneyRankHighWatermark] = useState(1);
  const statusesRef = useRef(statuses);
  const onListStateChangeRef = useRef(onListStateChange);
  const themeVisibility = puzzleMeta?.themeVisibility || {};
  const themeAvailability = puzzleMeta?.themeAvailability || {};
  const nextReleaseAt = puzzleMeta?.nextReleaseAt || '';

  useEffect(() => {
    statusesRef.current = statuses;
  }, [statuses]);

  useEffect(() => {
    onListStateChangeRef.current = onListStateChange;
  }, [onListStateChange]);

  useEffect(() => {
    let cancelled = false;

    const loadRankHighWatermark = async () => {
      try {
        const level = await loadJourneyRankHighWatermark();
        if (!cancelled) setJourneyRankHighWatermark(level);
      } catch (err) {
        console.warn('Failed to load journey rank high watermark', err);
      }
    };

    loadRankHighWatermark();
    return () => {
      cancelled = true;
    };
  }, [refreshToken]);

  useEffect(() => {
    if (loading) return;

    const timer = setTimeout(() => {
      setMoonAnimationReady(true);
    }, 120);

    return () => clearTimeout(timer);
  }, [loading, statuses, refreshToken]);

  useEffect(() => {
    let mounted = true;
    const resolveStatuses = async () => {
      if (!Array.isArray(puzzles)) return;
      if (puzzles.length === 0) {
        if (mounted) setLoading(false);
        return;
      }

      try {
        const hasCachedStatuses = puzzles.every(p => Object.prototype.hasOwnProperty.call(statusesRef.current, p.id));
        if (mounted) setLoading(!hasCachedStatuses);

        const results = await Promise.allSettled(puzzles.map(async (p) => {
          try {
            const puzzleData = await fetchPuzzleData(
              `puzzles/${encodeURIComponent(p.id)}.json`,
              { fresh: false }
            );

            const progress = await loadPuzzleProgress(p.id);
            const currentAnswers = Array.isArray(progress) ? progress : [];
            const status = await checkPuzzleStatus(p.id, puzzleData.grid);
            let wordsLeft = null;

            if (status === 'In Progress') {
              const totalClues = (puzzleData?.clues?.across?.length || 0) + (puzzleData?.clues?.down?.length || 0);
              const solvedClues = getSolvedClueIds(puzzleData, currentAnswers).size;
              wordsLeft = Math.max(0, totalClues - solvedClues);
            }

            return { id: p.id, status, wordsLeft };
          } catch (err) {
            console.error(`Failed to resolve status for puzzle ${p.id}`, err);
            return { id: p.id, status: 'New', wordsLeft: null };
          }
        }));

        if (!mounted) return;

        const nextStatuses = {};
        const nextWordsLeft = {};

        results.forEach(result => {
          if (result.status !== 'fulfilled' || !result.value) return;
          nextStatuses[result.value.id] = result.value.status;
          if (Number.isFinite(result.value.wordsLeft)) {
            nextWordsLeft[result.value.id] = result.value.wordsLeft;
          }
        });

        setStatuses(nextStatuses);
        setWordsLeftByPuzzle(nextWordsLeft);
        setLoading(false);
        onListStateChangeRef.current?.({
          statuses: nextStatuses,
          wordsLeftByPuzzle: nextWordsLeft
        });
      } catch (err) {
        console.error('Failed to load puzzle list', err);
        if (mounted) setLoading(false);
      }
    };
    resolveStatuses();
    return () => { mounted = false; };
  }, [puzzles, refreshToken]);

  if (loading) {
    return (
      <div className="puzzle-list-loading-wrapper">
        <div className="puzzle-loader" role="status" aria-live="polite" aria-busy="true">
          <div className="puzzle-loader-ring"></div>
        </div>
      </div>
    );
  }

  const inProgressPuzzles = puzzles.filter(p => statuses[p.id] === 'In Progress');

  const themesMap = {};
  puzzles.forEach(p => {
    const theme = p.theme || 'Other';
    if (!themesMap[theme]) themesMap[theme] = [];
    themesMap[theme].push(p);
  });

  const toggleTheme = (theme) => {
    setExpandedTheme(expandedTheme === theme ? null : theme);
  };

  const getThemeProgressRatio = (themeState) => {
    const total = Number(themeState.totalCount) || 0;
    if (total <= 0) return 0;
    return Math.min(1, Math.max(0, themeState.completedCount / total));
  };

  const getThemeMoonPhase = (themeState, archived) => {
    if (archived || themeState.hasCompletedAllThemePuzzles) return 'full';

    const progressRatio = getThemeProgressRatio(themeState);
    if (progressRatio <= 0) return 'thin-crescent';
    if (progressRatio < 0.34) return 'crescent';
    if (progressRatio < 0.67) return 'half';
    if (progressRatio < 1) return 'gibbous';
    return 'full';
  };

  const getThemeGroupState = (themePuzzles) => {
    const allCompleted = themePuzzles
      .filter(p => statuses[p.id] === 'Completed')
      .sort(comparePuzzleOrder);
    const allActive = themePuzzles.filter(p => statuses[p.id] !== 'Completed');
    const sortedActive = [...allActive].sort(comparePuzzleOrder);
    const inProgress = sortedActive.filter(p => statuses[p.id] === 'In Progress');
    const pendingActive = sortedActive.filter(p => statuses[p.id] !== 'In Progress');
    const orderedActive = [...inProgress, ...pendingActive];

    let visiblePuzzles = orderedActive.slice(0, 3);
    if (visiblePuzzles.length < 3 && allCompleted.length > 0) {
      const needed = Math.min(3 - visiblePuzzles.length, allCompleted.length);
      const padding = allCompleted.slice(-needed);
      visiblePuzzles = [...padding, ...visiblePuzzles];
    }

    const completedCount = allCompleted.length;
    const hasCompletedAllThemePuzzles = themePuzzles.length > 0 && completedCount === themePuzzles.length;

    return {
      allCompleted,
      completedCount,
      hasInProgressPuzzle: inProgress.length > 0,
      hasCompletedAllThemePuzzles,
      totalCount: themePuzzles.length,
      visiblePuzzles
    };
  };

  const sortedThemeEntries = Object.entries(themesMap)
    .sort(([themeA], [themeB]) => compareThemeOrder(themeA, themeB));
  const themeStatesByName = Object.fromEntries(
    sortedThemeEntries.map(([theme, themePuzzles]) => [theme, getThemeGroupState(themePuzzles)])
  );
  const { activeThemeEntries, completedThemeEntries } = classifyThemeEntries({
    sortedThemeEntries,
    themeStatesByName,
    themeVisibility,
    themeAvailability
  });
  const visibleActiveThemeEntries = selectVisibleThemeEntries(activeThemeEntries);
  const nextReleaseDateLabel = formatNextReleaseDate(nextReleaseAt);

  const renderPuzzleItem = (puzzle, options = {}) => {
    const hideStatus = !!options.hideStatus;
    const showWordsLeft = !!options.showWordsLeft;
    const status = statuses[puzzle.id] || 'New';
    const wordsLeft = wordsLeftByPuzzle[puzzle.id];
    const hasWordsLeftCount = Number.isFinite(wordsLeft);
    const useWordsLeftLabel = showWordsLeft && status === 'In Progress' && hasWordsLeftCount;
    const statusLabel = useWordsLeftLabel ? `${wordsLeft} left` : status;
    const statusClass = status.replace(' ', '');
    const difficultyLabel = puzzle.difficulty || 'Normal';

    return (
      <li
        key={puzzle.id}
        className="puzzle-list-item"
        onClick={() => onSelectPuzzle(puzzle.id)}
      >
        <div className="puzzle-info">
          <div className="puzzle-meta">
            <span className="puzzle-date">{puzzle.date}</span>
            <span className="puzzle-difficulty-badge">{difficultyLabel}</span>
          </div>
          <span className="puzzle-title">{puzzle.title}</span>
        </div>
        {!hideStatus && (
          <div className={`puzzle-status status-${statusClass}`}>
            {statusLabel}
          </div>
        )}
      </li>
    );
  };

  const renderThemeGroup = (theme, themeState, { archived = false } = {}) => {
    const isExpanded = expandedTheme === theme;
    const renderedPuzzles = archived ? themeState.allCompleted : themeState.visiblePuzzles;
    const moonPhase = getThemeMoonPhase(themeState, archived);
    const targetMoonProgressRatio = archived ? 1 : getThemeProgressRatio(themeState);
    const moonProgressRatio = moonAnimationReady ? targetMoonProgressRatio : 0;
    const moonShadowOffset = `${4 + (moonProgressRatio * 32)}px`;
    const moonShadowOpacity = moonProgressRatio >= 1 ? 0 : 1;
    const progressLabel = `${themeState.completedCount} of ${themeState.totalCount} complete`;

    return (
      <div key={theme} className={`theme-group ${isExpanded ? 'expanded' : ''} ${archived ? 'theme-group-archived' : ''}`}>
        <div className="theme-header" onClick={() => toggleTheme(theme)}>
          <div className="theme-header-info">
            <span
              className={`theme-moon theme-moon-${moonPhase} ${archived ? 'theme-moon-archived' : ''}`}
              style={{
                '--moon-shadow-x': moonShadowOffset,
                '--moon-shadow-opacity': moonShadowOpacity
              }}
              aria-hidden="true"
            ></span>
            <div className="theme-header-text">
              <span className="theme-name">{theme}</span>
              <span className="theme-progress">
                {archived
                  ? `Archived • ${progressLabel}`
                  : progressLabel}
              </span>
            </div>
          </div>
          <div className="theme-expand-icon">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              style={{ transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}
            >
              <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
          </div>
        </div>
        {isExpanded && (
          <>
            <ul className="puzzle-list">
              {renderedPuzzles.map(p => renderPuzzleItem(p))}
            </ul>
            {!archived && themeState.hasCompletedAllThemePuzzles && (
              <div className="theme-completion-note">
                More puzzles coming on {nextReleaseDateLabel}!
              </div>
            )}
          </>
        )}
      </div>
    );
  };

  const completedPuzzleCount = puzzles.filter(p => statuses[p.id] === 'Completed').length;
  const journey = getJourneyProgress(completedPuzzleCount, journeyRankHighWatermark);
  const journeyPercent = `${Math.round(journey.progress * 100)}%`;
  const nextRankCopy = journey.next
    ? `${Math.max(0, journey.next.required - completedPuzzleCount)} to ${journey.next.name}`
    : 'Final rank reached';
  const catalogCompletionCopy = `${completedPuzzleCount} of ${puzzles.length} available puzzles complete`;

  return (
    <div className="puzzle-list-wrapper animate-fade-in">
      {inProgressPuzzles.length > 0 && (
        <section className="puzzle-section">
          <h2 className="section-title">In Progress</h2>
          <ul className="puzzle-list">
            {inProgressPuzzles.map(p => renderPuzzleItem(p, { showWordsLeft: true }))}
          </ul>
        </section>
      )}

      <section className="puzzle-section theme-section">
        <h2 className="section-title">Themes</h2>
        <div className="theme-list">
          {visibleActiveThemeEntries.map(([theme, themeState]) => renderThemeGroup(theme, themeState))}
        </div>
      </section>

      <section className="journey-section">
        <div className="journey-rank">
          <div
            className="journey-badge-frame"
            data-rank-tier={journey.current.level === 17 ? 'final' : journey.current.level >= 8 ? 'advanced' : 'early'}
          >
            <img src={journey.current.asset} alt={journey.current.name} className="journey-badge" />
            <span className="journey-badge-level">{String(journey.current.level).padStart(2, '0')}</span>
          </div>
          <div className="journey-copy">
            <span className="journey-eyebrow">Journey Rank</span>
            <span className="journey-title">{journey.current.name}</span>
            <span className="journey-progress-copy">{`${completedPuzzleCount} completed • ${nextRankCopy}`}</span>
          </div>
        </div>
        <div className="journey-meter" aria-hidden="true">
          <span style={{ width: journeyPercent }}></span>
        </div>
      </section>

      {completedThemeEntries.length > 0 && (
        <section className="puzzle-section theme-section completed-theme-section">
          <h2 className="section-title">Completed Themes</h2>
          <div className="theme-list">
            {completedThemeEntries.map(([theme, themeState]) => renderThemeGroup(theme, themeState, { archived: true }))}
          </div>
        </section>
      )}
    </div>
  );
};

export default PuzzleList;
