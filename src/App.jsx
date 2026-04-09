import React, { useState, useEffect } from 'react';
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
  loadRewardClaimed,
  saveRewardClaimed
} from './utils/storage';
import HintModal from './components/HintModal';

function App() {
  const [currentView, setCurrentView] = useState('menu'); // 'menu' | 'play'
  const [puzzleData, setPuzzleData] = useState(null);
  const [direction, setDirection] = useState('across');
  const [selectedCell, setSelectedCell] = useState(null);
  const [answers, setAnswers] = useState([]);
  const [hintsRemaining, setHintsRemaining] = useState(3);
  const [unlockedHints, setUnlockedHints] = useState(new Set());
  const [isHintModalOpen, setIsHintModalOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);

  // Load global hints on mount
  useEffect(() => {
    const initHints = async () => {
      const count = await loadHintsRemaining();
      setHintsRemaining(count);
    };
    initHints();
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
      
      setCurrentView('play');
    } catch (e) {
      console.error('Failed to load puzzle', e);
      alert('Error loading puzzle data.');
    }
  };

  const handleBackToMenu = () => {
    setCurrentView('menu');
    setPuzzleData(null);
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

        const newCount = hintsRemaining + 3;
        setHintsRemaining(newCount);
        await saveHintsRemaining(newCount);
        await saveRewardClaimed(puzzleData.id);
        
        setToastMessage("Puzzle Complete! Earned 3 hints 💡");
        setTimeout(() => setToastMessage(null), 4000);
      };
      checkAndReward();
    }
  }, [isPuzzleComplete, puzzleData, hintsRemaining]);

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
      const same = displayedClue.num === newNum && displayedClue.text === newText;
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
      const newCount = hintsRemaining - 1;
      setHintsRemaining(newCount);
      await saveHintsRemaining(newCount);
      
      const newUnlocked = new Set(unlockedHints);
      newUnlocked.add(selectedClueId);
      setUnlockedHints(newUnlocked);
      await saveUnlockedHints(puzzleData.id, newUnlocked);
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
            hintText={puzzleData?.hints?.[selectedClueId]}
            isUnlocked={unlockedHints.has(selectedClueId)}
            onUnlock={handleUnlockHint}
            hintsRemaining={hintsRemaining}
          />
        </>
      )}
    </div>
  );
}

export default App;
