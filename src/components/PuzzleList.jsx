import React, { useEffect, useState } from 'react';
import './PuzzleList.css';
import { checkPuzzleStatus, loadPuzzleProgress, resetPuzzleDataIfDatasetChanged } from '../utils/storage';
import { getBadgeLevel, getBadgeName, getBadgeAsset } from '../utils/badges';
import { getSolvedClueIds } from '../utils/crossword';

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

const PuzzleList = ({ onSelectPuzzle }) => {
  const [puzzles, setPuzzles] = useState([]);
  const [statuses, setStatuses] = useState({});
  const [wordsLeftByPuzzle, setWordsLeftByPuzzle] = useState({});
  const [loading, setLoading] = useState(true);
  const [expandedTheme, setExpandedTheme] = useState(null);
  const [themeVisibility, setThemeVisibility] = useState({});

  useEffect(() => {
    let mounted = true;
    const fetchIndex = async () => {
      try {
        const baseUrl = import.meta.env.BASE_URL;

        try {
          const metaRes = await fetch(`${baseUrl}data/puzzles.meta.json?t=${Date.now()}`);
          if (metaRes.ok) {
            const meta = await metaRes.json();
            if (mounted) setThemeVisibility(meta?.themeVisibility || {});
            await resetPuzzleDataIfDatasetChanged(meta?.resetVersion || meta?.version);
          }
        } catch (metaErr) {
          console.warn('Failed to check puzzle dataset version', metaErr);
        }

        const res = await fetch(`${baseUrl}data/puzzles.json?t=${Date.now()}`);
        const data = await res.json();
        if (!mounted) return;
        setPuzzles(data);
        setLoading(false);

        const tasks = data.map(async (p) => {
          try {
            const puzzleRes = await fetch(`${baseUrl}data/puzzles/${p.id}.json`);
            if (!puzzleRes.ok) throw new Error(`HTTP ${puzzleRes.status}`);
            const puzzleData = await puzzleRes.json();

            const progress = await loadPuzzleProgress(p.id);
            const currentAnswers = Array.isArray(progress) ? progress : [];
            const status = await checkPuzzleStatus(p.id, puzzleData.grid);

            if (status === 'In Progress') {
              const totalClues = (puzzleData?.clues?.across?.length || 0) + (puzzleData?.clues?.down?.length || 0);
              const solvedClues = getSolvedClueIds(puzzleData, currentAnswers).size;
              const wordsLeft = Math.max(0, totalClues - solvedClues);
              if (!mounted) return;
              setWordsLeftByPuzzle(prev => ({ ...prev, [p.id]: wordsLeft }));
            }

            if (!mounted) return;
            setStatuses(prev => ({ ...prev, [p.id]: status }));
          } catch (err) {
            console.error(`Failed to resolve status for puzzle ${p.id}`, err);
            if (!mounted) return;
            setStatuses(prev => ({ ...prev, [p.id]: 'New' }));
          }
        });

        await Promise.allSettled(tasks);
      } catch (err) {
        console.error('Failed to load puzzle list', err);
        if (mounted) setLoading(false);
      }
    };
    fetchIndex();
    return () => { mounted = false; };
  }, []);

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
      hasCompletedAllThemePuzzles,
      visiblePuzzles
    };
  };

  const sortedThemeEntries = Object.entries(themesMap)
    .sort(([themeA], [themeB]) => compareThemeOrder(themeA, themeB));
  const themeStatesByName = Object.fromEntries(
    sortedThemeEntries.map(([theme, themePuzzles]) => [theme, getThemeGroupState(themePuzzles)])
  );
  const activeThemeEntries = [];
  const completedThemeEntries = [];

  for (const [theme] of sortedThemeEntries) {
    const themeState = themeStatesByName[theme];
    const lock = themeVisibility?.[theme]?.lockedUntilThemeCompleted;
    if (lock && !themeStatesByName[lock]?.hasCompletedAllThemePuzzles) {
      continue;
    }

    if (themeState.hasCompletedAllThemePuzzles) {
      completedThemeEntries.push([theme, themeState]);
    } else {
      activeThemeEntries.push([theme, themeState]);
    }
  }

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
    const badgeLevel = getBadgeLevel(themeState.completedCount);
    const badgeName = getBadgeName(badgeLevel);
    const badgeAsset = getBadgeAsset(badgeLevel);
    const renderedPuzzles = archived ? themeState.allCompleted : themeState.visiblePuzzles;

    return (
      <div key={theme} className={`theme-group ${isExpanded ? 'expanded' : ''} ${archived ? 'theme-group-archived' : ''}`}>
        <div className="theme-header" onClick={() => toggleTheme(theme)}>
          <div className="theme-header-info">
            <img src={badgeAsset} alt={badgeName} className={`theme-badge ${archived ? 'glow' : ''}`} />
            <div className="theme-header-text">
              <span className="theme-name">{theme}</span>
              <span className="theme-progress">
                {archived
                  ? `Archived • Level ${badgeLevel}: ${badgeName} (${themeState.completedCount} completed)`
                  : `Level ${badgeLevel}: ${badgeName} (${themeState.completedCount} completed)`}
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
          <ul className="puzzle-list">
            {renderedPuzzles.map(p => renderPuzzleItem(p))}
          </ul>
        )}
      </div>
    );
  };

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
          {activeThemeEntries.map(([theme, themeState]) => renderThemeGroup(theme, themeState))}
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

