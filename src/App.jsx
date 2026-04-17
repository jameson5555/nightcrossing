import React, { useState, useEffect } from 'react';
import './App.css';
import CrosswordGrid from './components/CrosswordGrid';
import ClueList from './components/ClueList';
import PuzzleList from './components/PuzzleList';
import { getWordAt, getSolvedClueIds } from './utils/crossword';
import { 
  loadPuzzleProgress, 
  savePuzzleProgress,
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
  clearHintsEmptyTimestamp
} from './utils/storage';
import { loadThemeProgress, saveThemeProgress } from './utils/storage';
import { getBadgeLevel, getBadgeName, getBadgeAsset } from './utils/badges';
import { LocalNotifications } from '@capacitor/local-notifications';
import HintModal from './components/HintModal';

function App() {
  const [currentView, setCurrentView] = useState('menu'); // 'menu' | 'play'
  const [puzzleData, setPuzzleData] = useState(null);
  const [direction, setDirection] = useState('across');
  const [selectedCell, setSelectedCell] = useState(null);
  const [answers, setAnswers] = useState([]);
  const [hintsRemaining, setHintsRemaining] = useState(3);
  const [unlockedHints, setUnlockedHints] = useState(new Set());
  const [revealedIndices, setRevealedIndices] = useState(new Set());
  const [isHintModalOpen, setIsHintModalOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);
  const [badgeUnlockInfo, setBadgeUnlockInfo] = useState(null);
  const [isPuzzleAlreadyCompleted, setIsPuzzleAlreadyCompleted] = useState(false);

  // Helper to handle bonus hint timeout
  const checkAndAwardBonusHint = async () => {
    const emptyTs = await loadHintsEmptyTimestamp();
    if (!emptyTs) return;
    
    const now = Date.now();
    const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
    
    if (now - emptyTs >= TWENTY_FOUR_HOURS) {
      setHintsRemaining(prev => {
        const newCount = prev + 1;
        saveHintsRemaining(newCount);
        return newCount;
      });
      await clearHintsEmptyTimestamp();
      
      setToastMessage("Your bonus hint has arrived! 💡");
      setTimeout(() => setToastMessage(null), 4000);
    }
  };

  // Load global hints on mount
  useEffect(() => {
    const initHints = async () => {
      const count = await loadHintsRemaining();
      setHintsRemaining(count);
      checkAndAwardBonusHint();
    };
    initHints();
    
    const interval = setInterval(checkAndAwardBonusHint, 60000);
    return () => clearInterval(interval);
  }, []);

  const handleSelectPuzzle = async (id) => {
    try {
      // Show loading or transition
      const baseUrl = import.meta.env.BASE_URL;
      const res = await fetch(`${baseUrl}data/puzzles/${id}.json?t=${Date.now()}`);
      const data = await res.json();
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
      
      const revealed = await loadRevealedIndices(id);
      setRevealedIndices(revealed);
      
      const claimed = await loadRewardClaimed(id);
      setIsPuzzleAlreadyCompleted(claimed);
      
      setCurrentView('play');
    } catch (e) {
      console.error('Failed to load puzzle', e);
      alert('Error loading puzzle data.');
    }
  };

  const handleBackToMenu = () => {
    setCurrentView('menu');
    setPuzzleData(null);
    setBadgeUnlockInfo(null);
  };

  const activeWord = puzzleData && selectedCell !== null
    ? getWordAt(selectedCell, direction, puzzleData, answers) 
    : null;
  
  const selectedClueId = activeWord ? `${direction}-${activeWord.clueNum}` : null;
  
  const activeClueText = puzzleData && activeWord && activeWord.clueIndex !== -1
    ? puzzleData.clues[direction][activeWord.clueIndex]
    : null;
    
  const solvedClueIds = puzzleData ? getSolvedClueIds(puzzleData, answers) : new Set();
  const isPuzzleComplete = puzzleData && solvedClueIds.size === (puzzleData.answers.across.length + puzzleData.answers.down.length);

  // Handle reward on completion
  useEffect(() => {
    if (isPuzzleComplete && puzzleData) {
      const checkAndReward = async () => {
        const alreadyClaimed = await loadRewardClaimed(puzzleData.id);
        if (alreadyClaimed) return;

        setHintsRemaining(prev => {
          const newCount = prev + 3;
          saveHintsRemaining(newCount); // Side effect inside state update is usually avoided, but here we need the exact new value
          return newCount;
        });
        
        await clearHintsEmptyTimestamp();
        try {
          await LocalNotifications.cancel({ notifications: [{ id: 1 }] });
        } catch (e) {
          // Ignore if Native API is unavailable
        }
        // Update theme progress and detect badge unlocks.
        try {
          const themeId = puzzleData.theme || 'Other';
          const prevProgress = await loadThemeProgress(themeId);
          const prevCompleted = prevProgress?.puzzlesCompleted || 0;
          const prevLevel = prevProgress?.badgeLevel || getBadgeLevel(prevCompleted);
          const newCompleted = prevCompleted + 1;
          const newLevel = getBadgeLevel(newCompleted);
          await saveThemeProgress(themeId, { themeId, puzzlesCompleted: newCompleted, badgeLevel: newLevel });

          if (newLevel > prevLevel) {
            setBadgeUnlockInfo({
              level: newLevel,
              name: getBadgeName(newLevel),
              asset: getBadgeAsset(newLevel),
              puzzlesCompleted: newCompleted
            });
          } else {
            setBadgeUnlockInfo(null);
          }
        } catch (err) {
          console.warn('Failed to update theme progress', err);
        }

        await saveRewardClaimed(puzzleData.id);
      };
      checkAndReward();
    }
  }, [isPuzzleComplete, puzzleData]); // Removed hintsRemaining

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
    if (hintsRemaining > 0 && selectedClueId && !unlockedHints.has(selectedClueId)) {
      const hintText = puzzleData?.hints?.[selectedClueId];
      
      // If no hint available, don't charge the user
      if (!hintText) {
        const newUnlocked = new Set(unlockedHints);
        newUnlocked.add(selectedClueId);
        setUnlockedHints(newUnlocked);
        await saveUnlockedHints(puzzleData.id, newUnlocked);
        return;
      }

      const newCount = hintsRemaining - 1;
      setHintsRemaining(newCount);
      await saveHintsRemaining(newCount);
      
      if (newCount === 0) {
        await handleHintsDepleted();
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

    try {
      const permStatus = await LocalNotifications.checkPermissions();
      if (permStatus.display !== 'granted') {
        await LocalNotifications.requestPermissions();
      }

      await LocalNotifications.schedule({
        notifications: [
          {
            title: "Bonus Hint Available!",
            body: "Looks like you were stuck. A bonus hint is waiting for you in Nightcrossing! 💡",
            id: 1,
            schedule: { at: new Date(now + 24 * 60 * 60 * 1000) },
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

  const handleRevealLetter = async () => {
    if (hintsRemaining > 0 && activeWord && puzzleData) {
      const { clueIndex, indices } = activeWord;
      if (clueIndex === -1) return;
      
      const solution = puzzleData.answers[direction][clueIndex];
      if (!solution) return;
      
      // Find cells in this word that are incorrect or empty
      const candidates = indices.filter((idx, i) => {
        const currentVal = (answers[idx] || '').toUpperCase();
        const correctVal = solution[i].toUpperCase();
        return currentVal !== correctVal;
      });

      if (candidates.length === 0) return;
      
      // Close modal immediately so user can see the revealed letter
      setIsHintModalOpen(false);

      // Deduct hint
      const newCount = hintsRemaining - 1;
      setHintsRemaining(newCount);
      await saveHintsRemaining(newCount);

      if (newCount === 0) {
        await handleHintsDepleted();
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
    }
  };

  return (
    <div className="app-container animate-fade-in">
      {currentView === 'menu' ? (
        <div className="menu-container">
          <header className="menu-header">
            <h1 className="logo-text">Nightcrossing</h1>
          </header>
          <PuzzleList onSelectPuzzle={handleSelectPuzzle} />
        </div>
      ) : (
        <>
          <header className="app-header glass-panel">
            <button className="back-btn" onClick={handleBackToMenu} aria-label="Menu">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="3" y1="12" x2="21" y2="12"></line>
                <line x1="3" y1="6" x2="21" y2="6"></line>
                <line x1="3" y1="18" x2="21" y2="18"></line>
              </svg>
            </button>
            <h1 className="logo-text">Nightcrossing</h1>
            
            {puzzleData && (
              <div className={`floating-active-clue ${activeClueText ? 'visible' : ''} ${isContentFading ? 'content-fade' : ''}`}>
                <span className="floating-clue-num">{displayedClue.num ? `${displayedClue.num}${displayedClue.dir === 'across' ? 'a' : 'd'}` : ''}</span>
                <p className="floating-clue-text">{displayedClue.text || ''}</p>
                {activeClueText && (
                  <button 
                    className={`hint-btn ${unlockedHints.has(selectedClueId) ? 'unlocked' : ''}`} 
                    onClick={() => setIsHintModalOpen(true)}
                    aria-label="Hint"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10"></circle>
                      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path>
                      <line x1="12" y1="17" x2="12.01" y2="17"></line>
                    </svg>
                  </button>
                )}
              </div>
            )}
          </header>

          {toastMessage && (
            <div className="toast-notification animate-slide-up">
              {toastMessage}
            </div>
          )}

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
                badgeUnlockInfo={badgeUnlockInfo}
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
                puzzleTitle={puzzleData.title}
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
            hintText={puzzleData?.hints?.[selectedClueId]}
            isUnlocked={unlockedHints.has(selectedClueId)}
            onUnlock={handleUnlockHint}
            onRevealLetter={handleRevealLetter}
            isWordSolved={activeWord?.isCorrect}
            hintsRemaining={hintsRemaining}
          />
        </>
      )}
    </div>
  );
}

export default App;
