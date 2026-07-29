import React, { useState, useEffect, useRef } from 'react';
import './App.css';
import CrosswordGrid from './components/CrosswordGrid';
import ClueList from './components/ClueList';
import PuzzleList from './components/PuzzleList';
import { getWordAt, getSolvedClueIds } from './utils/crossword';
import { 
  loadPuzzleProgress, 
  loadHintsRemaining, 
  saveHintsRemaining, 
  loadUnlockedHints, 
  saveUnlockedHints,
  loadRevealedIndices,
  saveRevealedIndices,
  loadRewardClaimed,
  saveRewardClaimed,
  loadHintsEmptyTimestamp,
  saveHintsEmptyTimestamp,
  clearHintsEmptyTimestamp,
  loadFreeHintToastSeen,
  saveFreeHintToastSeen,
  loadFreeHintClaimed,
  saveFreeHintClaimed,
  loadBonusHintToastPending,
  saveBonusHintToastPending,
  loadBonusHintsAwardedSinceEmpty,
  saveBonusHintsAwardedSinceEmpty,
  resetPuzzleDataIfDatasetChanged,
  loadJourneyRankHighWatermark,
  saveJourneyRankHighWatermark
} from './utils/storage';
import { saveThemeProgress } from './utils/storage';
import { getJourneyRankLevel, getBadgeName, getBadgeAsset } from './utils/badges';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Capacitor } from '@capacitor/core';
import HintModal from './components/HintModal';
import { fetchPuzzleData } from './utils/puzzleData';

const TITLE_FADE_OUT_MS = 220;
const TITLE_FADE_IN_MS = 280;
const PUZZLE_REFRESH_INTERVAL_MS = 12 * 60 * 60 * 1000;

const clearTitleFadeTimers = (timersRef) => {
  const { swap, settle } = timersRef.current;
  if (swap) clearTimeout(swap);
  if (settle) clearTimeout(settle);
  timersRef.current.swap = null;
  timersRef.current.settle = null;
};

const formatApproximateWait = (remainingMs) => {
  const totalMinutes = Math.max(1, Math.ceil(remainingMs / 60000));

  if (totalMinutes < 60) {
    return `${totalMinutes}m`;
  }

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (minutes === 0) {
    return `${hours}h`;
  }

  return `${hours}h ${minutes}m`;
};

const buildOutOfHintsMessage = (
  emptyTimestamp,
  awardedCount,
  firstCooldownMs,
  incrementMs,
  maxBonusHints
) => {
  if (!emptyTimestamp) {
    return 'Free bonus hint coming soon.';
  }

  if (awardedCount >= maxBonusHints) {
    return 'Bonus hint cap reached. Complete a puzzle or spend hints to restart the bonus timer.';
  }

  const nextHintAt = awardedCount === 0
    ? emptyTimestamp + firstCooldownMs
    : emptyTimestamp + firstCooldownMs + (awardedCount * incrementMs);

  const remainingMs = nextHintAt - Date.now();

  if (remainingMs <= 0) {
    return awardedCount === 0 ? 'Free bonus hint arriving now.' : 'Bonus hint arriving now.';
  }

  return awardedCount === 0
    ? `Free bonus hint in ${formatApproximateWait(remainingMs)}.`
    : `Next bonus hint in ${formatApproximateWait(remainingMs)}.`;
};

const getEligibleBonusHintsSinceEmpty = (elapsedMs, firstCooldownMs, incrementMs, maxBonusHints) => {
  if (elapsedMs < firstCooldownMs) {
    return 0;
  }

  const additional = Math.floor((elapsedMs - firstCooldownMs) / incrementMs);
  return Math.min(maxBonusHints, 1 + additional);
};

function App() {
  const [currentView, setCurrentView] = useState('menu'); // 'menu' | 'play'
  const [puzzleData, setPuzzleData] = useState(null);
  const [direction, setDirection] = useState('across');
  const [selectedCell, setSelectedCell] = useState(null);
  const [answers, setAnswers] = useState([]);
  const [hintsRemaining, setHintsRemaining] = useState(5);
  const [unlockedHints, setUnlockedHints] = useState(new Set());
  const [revealedIndices, setRevealedIndices] = useState(new Set());
  const [isHintModalOpen, setIsHintModalOpen] = useState(false);
  const [toastInfo, setToastInfo] = useState(null);
  const [isPuzzleAlreadyCompleted, setIsPuzzleAlreadyCompleted] = useState(false);
  const [puzzlesIndex, setPuzzlesIndex] = useState([]);
  const [puzzleMeta, setPuzzleMeta] = useState({});
  const [puzzleListState, setPuzzleListState] = useState(null);
  const [puzzleListRefreshToken, setPuzzleListRefreshToken] = useState(0);
  const [completionRewardInfo, setCompletionRewardInfo] = useState(null);
  const [hasUsedFreeHint, setHasUsedFreeHint] = useState(false);
  const [outOfHintsMessage, setOutOfHintsMessage] = useState('Free bonus hint coming soon.');
  const [headerTitle, setHeaderTitle] = useState('Nightcrossing');
  const [titleAnimState, setTitleAnimState] = useState('idle'); // idle | out | in
  // Award five bonus hints across the first 23 hours without paid hints:
  // at 3h, 8h, 13h, 18h, and 23h after depletion.
  const BONUS_HINT_FIRST_COOLDOWN_MS = 3 * 60 * 60 * 1000;
  const BONUS_HINT_INCREMENT_MS = 5 * 60 * 60 * 1000;
  const MAX_BONUS_HINTS_PER_EMPTY = 5;
  const titleFadeTimersRef = useRef({ swap: null, settle: null });
  const bonusHintCheckInFlightRef = useRef(false);
  const puzzleRefreshInFlightRef = useRef(false);
  const puzzleVersionRef = useRef(null);

  const triggerHeaderTitleMorph = (nextTitle) => {
    const target = nextTitle || 'Nightcrossing';

    if (headerTitle === target && titleAnimState === 'idle') {
      return;
    }

    clearTitleFadeTimers(titleFadeTimersRef);
    setTitleAnimState('out');

    titleFadeTimersRef.current.swap = setTimeout(() => {
      setHeaderTitle(target);
      setTitleAnimState('in');
      titleFadeTimersRef.current.swap = null;

      titleFadeTimersRef.current.settle = setTimeout(() => {
        setTitleAnimState('idle');
        titleFadeTimersRef.current.settle = null;
      }, TITLE_FADE_IN_MS);
    }, TITLE_FADE_OUT_MS);
  };

  // Helper to handle bonus hint timeout
  const checkAndAwardBonusHint = async () => {
    if (bonusHintCheckInFlightRef.current) {
      return;
    }

    bonusHintCheckInFlightRef.current = true;

    try {
      const emptyTs = await loadHintsEmptyTimestamp();
      if (!emptyTs) return;

      const now = Date.now();
      const elapsedMs = now - emptyTs;
      const eligibleHints = getEligibleBonusHintsSinceEmpty(
        elapsedMs,
        BONUS_HINT_FIRST_COOLDOWN_MS,
        BONUS_HINT_INCREMENT_MS,
        MAX_BONUS_HINTS_PER_EMPTY
      );

      const alreadyAwardedHints = await loadBonusHintsAwardedSinceEmpty();
      if (eligibleHints <= alreadyAwardedHints) {
        return;
      }

      const newlyEarnedHints = eligibleHints - alreadyAwardedHints;
      const currentCount = await loadHintsRemaining();
      const newCount = currentCount + newlyEarnedHints;

      await saveHintsRemaining(newCount);
      await saveBonusHintsAwardedSinceEmpty(eligibleHints);
      await saveBonusHintToastPending(true);

      setHintsRemaining(newCount);
      setToastInfo({
        message: newlyEarnedHints === 1
          ? 'Your bonus hint has arrived!'
          : `${newlyEarnedHints} bonus hints have arrived!`,
        icon: '💡',
        type: 'bonus',
        id: 'bonus-hint-arrived'
      });
    } finally {
      bonusHintCheckInFlightRef.current = false;
    }
  };

  const handleOpenHintModal = async () => {
    await checkAndAwardBonusHint();

    const latestHints = await loadHintsRemaining();
    setHintsRemaining(latestHints);

    if (latestHints <= 0 && hasUsedFreeHint) {
      const emptyTs = await loadHintsEmptyTimestamp();
      const awardedCount = await loadBonusHintsAwardedSinceEmpty();
      setOutOfHintsMessage(
        buildOutOfHintsMessage(
          emptyTs,
          awardedCount,
          BONUS_HINT_FIRST_COOLDOWN_MS,
          BONUS_HINT_INCREMENT_MS,
          MAX_BONUS_HINTS_PER_EMPTY
        )
      );
    }

    setIsHintModalOpen(true);
  };

  // Load initial data on mount
  useEffect(() => {
    const initHints = async () => {
      const shouldShowPendingBonusToast = await loadBonusHintToastPending();
      if (shouldShowPendingBonusToast) {
        setToastInfo({
          message: 'Your bonus hint has arrived!',
          icon: '💡',
          type: 'bonus',
          id: 'bonus-hint-arrived'
        });
      }

      const count = await loadHintsRemaining();
      setHintsRemaining(count);
      await checkAndAwardBonusHint();
    };
    initHints();

    const refreshPuzzles = async () => {
      if (puzzleRefreshInFlightRef.current) return;
      puzzleRefreshInFlightRef.current = true;

      try {
        const meta = await fetchPuzzleData('puzzles.meta.json');
        const nextVersion = meta?.version || meta?.generatedAt || '';
        const datasetChanged = puzzleVersionRef.current !== nextVersion;

        setPuzzleMeta(meta || {});
        await resetPuzzleDataIfDatasetChanged(meta?.resetVersion || nextVersion);

        if (!datasetChanged) return;

        const data = await fetchPuzzleData('puzzles.json');
        setPuzzlesIndex(data);
        puzzleVersionRef.current = nextVersion;
      } catch (e) {
        console.error('Failed to refresh puzzle catalog', e);
      } finally {
        puzzleRefreshInFlightRef.current = false;
      }
    };
    refreshPuzzles();

    const handleAppResume = () => {
      checkAndAwardBonusHint();
      refreshPuzzles();
    };

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        handleAppResume();
      }
    };

    window.addEventListener('focus', handleAppResume);
    window.addEventListener('online', refreshPuzzles);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    const hintInterval = setInterval(checkAndAwardBonusHint, 60000);
    const puzzleInterval = setInterval(() => {
      if (!document.hidden) refreshPuzzles();
    }, PUZZLE_REFRESH_INTERVAL_MS);
    return () => {
      clearInterval(hintInterval);
      clearInterval(puzzleInterval);
      window.removeEventListener('focus', handleAppResume);
      window.removeEventListener('online', refreshPuzzles);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  useEffect(() => {
    return () => {
      clearTitleFadeTimers(titleFadeTimersRef);
    };
  }, []);

  useEffect(() => {
    if (toastInfo?.id === 'bonus-hint-arrived') {
      saveBonusHintToastPending(false);
    }
  }, [toastInfo]);

  const handleSelectPuzzle = async (id) => {
    try {
      // Show loading or transition
      const data = await fetchPuzzleData(`puzzles/${encodeURIComponent(id)}.json`);
      setPuzzleData(data);

      const cachedAnswers = await loadPuzzleProgress(id);
      if (cachedAnswers) {
        setAnswers(cachedAnswers);
      } else {
        setAnswers(Array(data.grid.length).fill(''));
      }
      
      setSelectedCell(null);
      setDirection('across');
      
      const unlocked = await loadUnlockedHints(id);
      setUnlockedHints(unlocked);

      const freeHintClaimed = await loadFreeHintClaimed(id);
      setHasUsedFreeHint(freeHintClaimed);
      
      const revealed = await loadRevealedIndices(id);
      setRevealedIndices(revealed);
      
      const claimed = await loadRewardClaimed(id);
      setIsPuzzleAlreadyCompleted(claimed);

      triggerHeaderTitleMorph(data.title || 'Nightcrossing');
      
      setCurrentView('play');
    } catch (e) {
      console.error('Failed to load puzzle', e);
      alert('Error loading puzzle data.');
    }
  };

  const handleBackToMenu = () => {
    triggerHeaderTitleMorph('Nightcrossing');
    setCurrentView('menu');
    setPuzzleData(null);
    setCompletionRewardInfo(null);
    setHasUsedFreeHint(false);
    setPuzzleListRefreshToken(prev => prev + 1);
  };

  const activeWord = puzzleData && selectedCell !== null
    ? getWordAt(selectedCell, direction, puzzleData, answers) 
    : null;
  
  const selectedClueId = activeWord ? `${direction}-${activeWord.clueNum}` : null;
  
  const activeClueText = puzzleData && activeWord && activeWord.clueIndex !== -1
    ? puzzleData.clues[direction][activeWord.clueIndex]
    : null;

  const authoredHintTextRaw = selectedClueId ? puzzleData?.hints?.[selectedClueId] : null;
  const authoredHintText = typeof authoredHintTextRaw === 'string' && authoredHintTextRaw.trim()
    ? authoredHintTextRaw.trim()
    : null;
  const selectedHintText = authoredHintText;
  const canUnlockSelectedClueHint = Boolean(selectedHintText) || !hasUsedFreeHint;
  const canShowHintButton = Boolean(activeClueText);
    
  const solvedClueIds = puzzleData ? getSolvedClueIds(puzzleData, answers) : new Set();
  const isPuzzleComplete = puzzleData && solvedClueIds.size === (puzzleData.answers.across.length + puzzleData.answers.down.length);

  // Handle reward on completion
  useEffect(() => {
    if (isPuzzleComplete && puzzleData) {
      const checkAndReward = async () => {
        const alreadyClaimed = await loadRewardClaimed(puzzleData.id);
        if (alreadyClaimed) return;

        setHintsRemaining(prev => {
          const newCount = prev + 5;
          saveHintsRemaining(newCount); // Side effect inside state update is usually avoided, but here we need the exact new value
          return newCount;
        });
        
        await clearHintsEmptyTimestamp();
        if (Capacitor.isNativePlatform()) {
          try {
            await LocalNotifications.cancel({ notifications: [{ id: 1 }] });
          } catch {
            // Ignore if Native API is unavailable
          }
        }
        
        // Update journey/theme progress and detect unlocks using global index for robustness.
        try {
          const themeId = puzzleData.theme || 'Other';
          const themePuzzles = puzzlesIndex.filter(p => (p.theme || 'Other') === themeId);
          const previousCompletedStatuses = await Promise.all(puzzlesIndex.map(async p => {
            if (p.id === puzzleData.id) return false;
            return await loadRewardClaimed(p.id);
          }));
          const previousTotalCompleted = previousCompletedStatuses.filter(Boolean).length;
          const newTotalCompleted = previousTotalCompleted + 1;
          const previousJourneyHighWatermark = await loadJourneyRankHighWatermark();
          const previousJourneyLevel = getJourneyRankLevel(previousTotalCompleted, previousJourneyHighWatermark);
          const newJourneyLevel = getJourneyRankLevel(newTotalCompleted);
          const nextJourneyHighWatermark = await saveJourneyRankHighWatermark(newJourneyLevel);
          
          // Calculate true completed count by checking storage for all puzzles in this theme
          const completedStatuses = await Promise.all(themePuzzles.map(async p => {
            if (p.id === puzzleData.id) return true; // Current one is definitely done
            return await loadRewardClaimed(p.id);
          }));
          
          const newCompleted = completedStatuses.filter(Boolean).length;
          const completedTheme = themePuzzles.length > 0 && newCompleted === themePuzzles.length;
          const unlockedThemes = completedTheme
            ? Object.entries(puzzleMeta?.themeVisibility || {})
                .filter(([, visibility]) => visibility?.lockedUntilThemeCompleted === themeId)
                .map(([theme]) => theme)
                .filter(theme => puzzlesIndex.some(p => (p.theme || 'Other') === theme))
            : [];
          const rankUnlockInfo = nextJourneyHighWatermark > previousJourneyLevel
            ? {
                level: nextJourneyHighWatermark,
                name: getBadgeName(nextJourneyHighWatermark),
                asset: getBadgeAsset(nextJourneyHighWatermark),
                puzzlesCompleted: newTotalCompleted
              }
            : null;

          await saveThemeProgress(themeId, {
            themeId,
            puzzlesCompleted: newCompleted,
            completed: completedTheme
          });

          setCompletionRewardInfo({
            rankUnlock: rankUnlockInfo,
            totalCompleted: newTotalCompleted,
            themeComplete: completedTheme ? themeId : null,
            unlockedThemes
          });

          if (completedTheme) {
            const unlockCopy = unlockedThemes.length > 0
              ? ` New theme unlocked: ${unlockedThemes.join(', ')}.`
              : '';
            setToastInfo({
              message: `${themeId} complete. This theme is now archived in Completed Themes.${unlockCopy}`,
              icon: '🏁',
              type: 'bonus',
              id: `theme-complete-${themeId}`
            });
          }
        } catch (err) {
          console.warn('Failed to update theme progress', err);
        }
        
        await saveRewardClaimed(puzzleData.id);
      };
      checkAndReward();
    }
  }, [isPuzzleComplete, puzzleData, puzzleMeta, puzzlesIndex]); // Removed hintsRemaining

  // Displayed clue state used to control cross-fade when switching clues
  const [displayedClue, setDisplayedClue] = useState({ num: null, text: null, dir: null });
  const [isContentFading, setIsContentFading] = useState(false);

  useEffect(() => {
    const newNum = activeWord?.clueNum ?? null;
    const newDir = direction;
    const newText = activeClueText ? (activeClueText.split('. ')[1] || activeClueText) : null;

    // If nothing is displayed yet and we have new text, show immediately (initial appear)
    if (!displayedClue.text && newText) {
      const t = setTimeout(() => {
        setDisplayedClue({ num: newNum, text: newText, dir: newDir });
      }, 0);
      return () => clearTimeout(t);
    }

    // If already visible and the clue changed, cross-fade the content
    if (displayedClue.text && newText) {
      const same = displayedClue.num === newNum && displayedClue.text === newText && displayedClue.dir === newDir;
      if (!same) {
        const fadeStart = setTimeout(() => {
          setIsContentFading(true);
        }, 0);
        const t = setTimeout(() => {
          setDisplayedClue({ num: newNum, text: newText, dir: newDir });
          setIsContentFading(false);
        }, 200);
        return () => {
          clearTimeout(fadeStart);
          clearTimeout(t);
        };
      }
      return;
    }

    // If newText is empty/cleared, hide displayed
    if (!newText) {
      const t = setTimeout(() => {
        setDisplayedClue({ num: null, text: null, dir: null });
      }, 0);
      return () => clearTimeout(t);
    }
  }, [selectedClueId, activeClueText, direction, displayedClue, activeWord]);

  const handleClueClick = (dir, numStr) => {
    setDirection(dir);
    const num = parseInt(numStr, 10);
    if (puzzleData) {
      const index = puzzleData.gridnums.findIndex(n => n === num);
      if (index !== -1) setSelectedCell(index);
    }
  };

  const handleUnlockHint = async () => {
    if (selectedClueId && !unlockedHints.has(selectedClueId)) {
      const isFirstFreeHintUse = !hasUsedFreeHint;
      const hasAuthoredHint = Boolean(authoredHintText);
      const hasSeenFreeHintToast = await loadFreeHintToastSeen();

      if (!isFirstFreeHintUse && hintsRemaining <= 0) {
        return;
      }

      // If no word-hint exists, spend the free hint on a letter reveal instead.
      if (!hasAuthoredHint && isFirstFreeHintUse) {
        const revealed = await handleRevealLetter({ chargeHint: false, closeModal: true });
        if (revealed) {
          setHasUsedFreeHint(true);
          await saveFreeHintClaimed(puzzleData.id, true);
          if (!hasSeenFreeHintToast) {
            setToastInfo({
              message: 'Every puzzle includes one free hint. This puzzle used yours to reveal a letter.',
              icon: '✨',
              type: 'bonus'
            });
            await saveFreeHintToastSeen(true);
          }
        }
        return;
      }

      // If we still have no authored hint text, do not charge and keep state unchanged.
      if (!selectedHintText) {
        return;
      }

      if (isFirstFreeHintUse) {
        setHasUsedFreeHint(true);
        await saveFreeHintClaimed(puzzleData.id, true);
        if (!hasSeenFreeHintToast) {
          setToastInfo({
            message: 'Every puzzle includes one free hint.',
            icon: '✨',
            type: 'bonus'
          });
          await saveFreeHintToastSeen(true);
        }
      } else {
        const newCount = hintsRemaining - 1;
        setHintsRemaining(newCount);
        await saveHintsRemaining(newCount);

        if (newCount === 0) {
          await handleHintsDepleted();
        }
      }

      const newUnlocked = new Set(unlockedHints);
      newUnlocked.add(selectedClueId);
      setUnlockedHints(newUnlocked);
      await saveUnlockedHints(puzzleData.id, newUnlocked);
    }
  };

  const handleHintsDepleted = async () => {
    const now = Date.now();
    await saveHintsEmptyTimestamp(now);
    await saveBonusHintsAwardedSinceEmpty(0);

    if (!Capacitor.isNativePlatform()) {
      return;
    }

    try {
      const permStatus = await LocalNotifications.checkPermissions();
      if (permStatus.display !== 'granted') {
        await LocalNotifications.requestPermissions();
      }

      await LocalNotifications.schedule({
        notifications: [
          {
            title: "Bonus Hint Available!",
            body: "A bonus hint is ready for your next Nightcrossing clue.",
            id: 1,
            schedule: { at: new Date(now + BONUS_HINT_FIRST_COOLDOWN_MS) },
            sound: null,
            attachments: null,
            actionTypeId: "",
            extra: null
          }
        ]
      });
    } catch (err) {
      console.warn('LocalNotifications API not available', err);
    }
  };

  const handleRevealLetter = async ({ chargeHint = true, closeModal = true } = {}) => {
    if ((!chargeHint || hintsRemaining > 0) && activeWord && puzzleData) {
      const { clueIndex, indices } = activeWord;
      if (clueIndex === -1) return false;

      const solution = puzzleData.answers[direction][clueIndex];
      if (!solution) return false;

      // Find cells in this word that are incorrect or empty
      const candidates = indices.filter((idx, i) => {
        const currentVal = (answers[idx] || '').toUpperCase();
        const correctVal = solution[i].toUpperCase();
        return currentVal !== correctVal;
      });

      if (candidates.length === 0) return false;

      if (closeModal) {
        // Close modal immediately so user can see the revealed letter
        setIsHintModalOpen(false);
      }

      if (chargeHint) {
        // Deduct hint
        const newCount = hintsRemaining - 1;
        setHintsRemaining(newCount);
        await saveHintsRemaining(newCount);

        if (newCount === 0) {
          await handleHintsDepleted();
        }
      }

      // Pick a random candidate cell and reveal it
      const randomIdx = candidates[Math.floor(Math.random() * candidates.length)];
      const charInSolution = solution[indices.indexOf(randomIdx)];

      const newAnswers = [...answers];
      newAnswers[randomIdx] = charInSolution.toUpperCase();
      setAnswers(newAnswers);

      const newRevealed = new Set(revealedIndices);
      newRevealed.add(randomIdx);
      setRevealedIndices(newRevealed);
      await saveRevealedIndices(puzzleData.id, newRevealed);
      // savePuzzleProgress is handled by useEffect in CrosswordGrid
      return true;
    }

    return false;
  };

  const isPlayView = currentView === 'play';
  const hasVisibleTopClue = Boolean(displayedClue.text);
  const shouldCompactHeaderTitle = isPlayView && hasVisibleTopClue;
  const titleClueLabel = displayedClue.num ? `${displayedClue.num}${displayedClue.dir === 'across' ? 'a' : 'd'}` : '';
  const titleModeClass = isPlayView ? 'puzzle-title' : 'menu-title';

  return (
    <div className="app-container animate-fade-in">
      <header className={`app-header ${isPlayView ? 'app-header-play' : 'app-header-menu'} ${shouldCompactHeaderTitle ? 'header-compact' : ''}`}>
        {isPlayView && (
          <button className="back-btn" onClick={handleBackToMenu} aria-label="Menu">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="3" y1="12" x2="21" y2="12"></line>
              <line x1="3" y1="6" x2="21" y2="6"></line>
              <line x1="3" y1="18" x2="21" y2="18"></line>
            </svg>
          </button>
        )}

        <div className={`header-title-stack ${shouldCompactHeaderTitle ? 'compact' : 'expanded'}`}>
          <div className="title-row">
            <h1 className={`logo-text top-logo-text ${titleModeClass} title-anim-${titleAnimState}`}>
              {headerTitle}
            </h1>
            {isPlayView && hasVisibleTopClue && titleClueLabel && (
              <span className={`title-clue-id ${isContentFading ? 'fading' : ''}`}>
                {titleClueLabel}
              </span>
            )}
          </div>

          {isPlayView && (
            <div className={`floating-active-clue ${hasVisibleTopClue ? 'visible' : ''} ${isContentFading ? 'content-fade' : ''}`}>
              <p className="floating-clue-text">{displayedClue.text || ''}</p>
                {canShowHintButton ? (
                <button
                  className={`hint-btn ${unlockedHints.has(selectedClueId) ? 'unlocked' : ''}`}
                  onClick={handleOpenHintModal}
                  aria-label="Hint"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"></circle>
                    <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path>
                    <line x1="12" y1="17" x2="12.01" y2="17"></line>
                  </svg>
                </button>
                ) : (
                  <span className="clue-side-spacer" aria-hidden="true"></span>
              )}
            </div>
          )}
        </div>
      </header>

      {isPlayView ? (
        <>
          <main className="app-main">
            {puzzleData ? (
              <CrosswordGrid 
                puzzleData={puzzleData} 
                answers={answers}
                setAnswers={setAnswers}
                selectedCell={selectedCell}
                setSelectedCell={setSelectedCell}
                direction={direction}
                setDirection={setDirection}
                activeWordIndices={activeWord ? activeWord.indices : []}
                revealedIndices={revealedIndices}
                onCompleteDismiss={handleBackToMenu}
                completionRewardInfo={completionRewardInfo}
                isAlreadyCompleted={isPuzzleAlreadyCompleted}
              />
            ) : (
              <div className="placeholder-board">
                Loading...
              </div>
            )}
          </main>

          <footer className="app-footer glass-panel">
            {puzzleData ? (
              <ClueList 
                clues={puzzleData.clues} 
                direction={direction} 
                selectedClueId={selectedClueId}
                solvedClueIds={solvedClueIds}
                onClueClick={handleClueClick}
              />
            ) : (
              <div className="placeholder-clues">
                Clues Loading...
              </div>
            )}
          </footer>

          <HintModal 
            isOpen={isHintModalOpen}
            onClose={() => setIsHintModalOpen(false)}
            hintText={selectedHintText}
            isUnlocked={unlockedHints.has(selectedClueId)}
            onUnlock={handleUnlockHint}
            onRevealLetter={handleRevealLetter}
            isWordSolved={activeWord?.isCorrect}
            hintsRemaining={hintsRemaining}
            hasFreeHintAvailable={!hasUsedFreeHint}
            canUnlockHint={canUnlockSelectedClueHint}
            outOfHintsMessage={outOfHintsMessage}
          />
        </>
      ) : (
        <div className="menu-container">
          <PuzzleList
            onSelectPuzzle={handleSelectPuzzle}
            puzzles={puzzlesIndex}
            puzzleMeta={puzzleMeta}
            listState={puzzleListState}
            onListStateChange={setPuzzleListState}
            refreshToken={puzzleListRefreshToken}
          />
        </div>
      )}

      {toastInfo && (
        <div className={`toast-notification animate-slide-up ${toastInfo.type || ''}`} onClick={() => setToastInfo(null)}>
          <div className="toast-content">
            {toastInfo.icon && <span className="toast-icon">{toastInfo.icon}</span>}
            <span className="toast-message">{toastInfo.message}</span>
            <button className="toast-close" aria-label="Dismiss">&times;</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
