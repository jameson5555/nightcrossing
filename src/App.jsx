import React, { useState, useEffect, useRef } from 'react';
import './App.css';
import CrosswordGrid from './components/CrosswordGrid';
import ClueList from './components/ClueList';
import PuzzleList from './components/PuzzleList';
import { getWordAt } from './utils/crossword';
import { loadPuzzleProgress } from './utils/storage';

function App() {
  const [currentView, setCurrentView] = useState('menu'); // 'menu' | 'play'
  const [puzzleData, setPuzzleData] = useState(null);
  const [direction, setDirection] = useState('across');
  const [selectedCell, setSelectedCell] = useState(null);
  const [answers, setAnswers] = useState([]);
  const [clueAnimPlayed, setClueAnimPlayed] = useState(false);

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
  
  let activeClueText = null;
  if (puzzleData && activeWord && activeWord.clueIndex !== -1) {
    activeClueText = puzzleData.clues[direction][activeWord.clueIndex];
  }

  // Displayed clue state used to control cross-fade when switching clues
  const [displayedClue, setDisplayedClue] = useState({ num: null, text: null, dir: null });
  const [isContentFading, setIsContentFading] = useState(false);
  const prevSelectedClueIdRef = useRef(null);

  useEffect(() => {
    const newNum = activeWord?.clueNum ?? null;
    const newDir = direction;
    const newText = activeClueText ? (activeClueText.split('. ')[1] || activeClueText) : null;

    // If nothing is displayed yet and we have new text, show immediately (initial appear)
    if (!displayedClue.text && newText) {
      setDisplayedClue({ num: newNum, text: newText, dir: newDir });
      return;
    }

    // If already visible and the clue changed, cross-fade the content
    if (displayedClue.text && newText) {
      const same = displayedClue.num === newNum && displayedClue.text === newText;
      if (!same) {
        setIsContentFading(true);
        const t = setTimeout(() => {
          setDisplayedClue({ num: newNum, text: newText, dir: newDir });
          setIsContentFading(false);
        }, 200);
        return () => clearTimeout(t);
      }
      return;
    }

    // If newText is empty/cleared, hide displayed
    if (!newText) {
      setDisplayedClue({ num: null, text: null, dir: null });
    }

    prevSelectedClueIdRef.current = selectedClueId;
  }, [selectedClueId, activeClueText, direction, displayedClue, activeWord]);

  const handleClueClick = (dir, numStr) => {
    setDirection(dir);
    const num = parseInt(numStr, 10);
    if (puzzleData) {
      const index = puzzleData.gridnums.findIndex(n => n === num);
      if (index !== -1) setSelectedCell(index);
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
              </div>
            )}
          </header>

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
                onClueClick={handleClueClick}
              />
            ) : (
              <div className="placeholder-clues">
                Clues Loading...
              </div>
            )}
          </footer>
        </>
      )}
    </div>
  );
}

export default App;
