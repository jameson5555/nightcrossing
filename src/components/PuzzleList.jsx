import React, { useEffect, useState } from 'react';
import './PuzzleList.css';
import { checkPuzzleStatus, loadPuzzleProgress, resetPuzzleDataIfDatasetChanged } from '../utils/storage';
import { getBadgeLevel, getBadgeName, getBadgeAsset } from '../utils/badges';
import { getSolvedClueIds } from '../utils/crossword';

const APPROACHABLE_DIFFICULTIES = new Set(['Easy', 'Normal']);
const THEME_DISPLAY_ORDER = [
  'Space & Sky',
  'Food & Cooking',
  'Music & Sound',
  'Ocean & Marine Life',
  'Sports & Athletics',
  'Weather & Climate',
  'Internet & Software',
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

function hashString(value) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function rotateArray(items, offset) {
  if (!Array.isArray(items) || items.length <= 1) return items;
  const safeOffset = ((offset % items.length) + items.length) % items.length;
  if (safeOffset === 0) return items;
  return [...items.slice(safeOffset), ...items.slice(0, safeOffset)];
}

const PuzzleList = ({ onSelectPuzzle }) => {
  const [puzzles, setPuzzles] = useState([]);
  const [statuses, setStatuses] = useState({});
  const [wordsLeftByPuzzle, setWordsLeftByPuzzle] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const fetchIndex = async () => {
      try {
        const baseUrl = import.meta.env.BASE_URL;

        // One-time migration: wipe stale puzzle state only when puzzle dataset changes.
        try {
          const metaRes = await fetch(`${baseUrl}data/puzzles.meta.json?t=${Date.now()}`);
          if (metaRes.ok) {
            const meta = await metaRes.json();
            await resetPuzzleDataIfDatasetChanged(meta?.version);
          }
        } catch (metaErr) {
          console.warn('Failed to check puzzle dataset version', metaErr);
        }

        const res = await fetch(`${baseUrl}data/puzzles.json?t=${Date.now()}`);
        const data = await res.json();
        // Show the list immediately and compute per-puzzle statuses in background.
        if (!mounted) return;
        setPuzzles(data);
        setLoading(false);

        // Fetch individual puzzle files in parallel and update statuses as they arrive.
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

        // Wait for all background status checks to settle but don't block the UI.
        await Promise.allSettled(tasks);
      } catch (err) {
        console.error('Failed to load puzzle list', err);
        if (mounted) setLoading(false);
      }
    };
    fetchIndex();
    return () => { mounted = false; };
  }, []);

  const [expandedTheme, setExpandedTheme] = useState(null);

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

  const renderPuzzleItem = (puzzle, options = {}) => {
    const hideStatus = !!options.hideStatus;
    const showWordsLeft = !!options.showWordsLeft;
    const status = statuses[puzzle.id] || 'New';
    const wordsLeft = wordsLeftByPuzzle[puzzle.id];
    const hasWordsLeftCount = Number.isFinite(wordsLeft);
    const useWordsLeftLabel = showWordsLeft && status === 'In Progress' && hasWordsLeftCount;
      const statusLabel = useWordsLeftLabel
        ? `${wordsLeft} left`
      : status;
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
          {Object.entries(themesMap)
            .sort(([themeA], [themeB]) => compareThemeOrder(themeA, themeB))
            .map(([theme, themePuzzles]) => {
            const isExpanded = expandedTheme === theme;
            const allCompleted = themePuzzles.filter(p => statuses[p.id] === 'Completed');
            const allActive = themePuzzles.filter(p => statuses[p.id] !== 'Completed');

            const sortedActive = [...allActive].sort((a, b) => {
              const volA = parseVolumeFromId(a.id);
              const volB = parseVolumeFromId(b.id);
              if (volA !== volB) return volA - volB;
              return String(a.id).localeCompare(String(b.id));
            });

            const inProgress = sortedActive.filter(p => statuses[p.id] === 'In Progress');
            const pendingActive = sortedActive.filter(p => statuses[p.id] !== 'In Progress');

            const dateSeed = new Date().toISOString().slice(0, 10);
            const seed = hashString(`${theme}|${dateSeed}`);
            const rotatedPending = rotateArray(pendingActive, pendingActive.length > 0 ? seed % pendingActive.length : 0);

            let orderedActive = [...inProgress, ...rotatedPending];
            if (inProgress.length === 0 && orderedActive.length > 1) {
              const approachableIdx = orderedActive.findIndex(p => APPROACHABLE_DIFFICULTIES.has(p.difficulty || 'Normal'));
              if (approachableIdx > 0) {
                orderedActive = [orderedActive[approachableIdx], ...orderedActive.slice(0, approachableIdx), ...orderedActive.slice(approachableIdx + 1)];
              }
            }
            
            // Sliding window: Show up to 3 active puzzles.
            // If fewer than 3 active ones exist, fill from the latest completed to reach 3.
            let visiblePuzzles = orderedActive.slice(0, 3);
            if (visiblePuzzles.length < 3 && allCompleted.length > 0) {
              const needed = Math.min(3 - visiblePuzzles.length, allCompleted.length);
              const padding = allCompleted.slice(-needed);
              visiblePuzzles = [...padding, ...visiblePuzzles];
            }

            // Keep the true completed count for badge calculations
            const completedCount = allCompleted.length;

            return (
              <div key={theme} className={`theme-group ${isExpanded ? 'expanded' : ''}`}>
                <div className="theme-header" onClick={() => toggleTheme(theme)}>
                      {(() => {
                        const badgeLevel = getBadgeLevel(completedCount);
                        const badgeName = getBadgeName(badgeLevel);
                        const badgeAsset = getBadgeAsset(badgeLevel);
                        return (
                          <div className="theme-header-info">
                            <img src={badgeAsset} alt={badgeName} className={`theme-badge`} />
                            <div className="theme-header-text">
                              <span className="theme-name">{theme}</span>
                              <span className="theme-progress">{`Level ${badgeLevel}: ${badgeName} (${completedCount} completed)`}</span>
                            </div>
                          </div>
                        );
                      })()}
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
                    {visiblePuzzles.map(p => renderPuzzleItem(p))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
};

export default PuzzleList;
