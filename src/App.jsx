import React, { useState } from 'react';
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
      <header className="app-header glass-panel">
        {currentView === 'play' && (
          <button className="back-btn" onClick={handleBackToMenu} aria-label="Menu">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="3" y1="12" x2="21" y2="12"></line>
              <line x1="3" y1="6" x2="21" y2="6"></line>
              <line x1="3" y1="18" x2="21" y2="18"></line>
            </svg>
          </button>
        )}
        <h1 className="logo-text">Nightcrossing</h1>
      </header>

      <main className="app-main">
        {currentView === 'menu' ? (
          <PuzzleList onSelectPuzzle={handleSelectPuzzle} />
        ) : puzzleData ? (
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
            Loading Today's Puzzle...
          </div>
        )}
      </main>

      <footer className="app-footer glass-panel">
        {currentView === 'play' && puzzleData ? (
          <ClueList 
            clues={puzzleData.clues} 
            direction={direction} 
            selectedClueId={selectedClueId}
            onClueClick={handleClueClick}
          />
        ) : currentView === 'play' ? (
           <div className="placeholder-clues">
             Clues Loading...
           </div>
        ) : (
          <div className="placeholder-clues" style={{textAlign: 'center', opacity: 0.5}}>
             Select a puzzle to view clues.
          </div>
        )}
      </footer>
      {currentView === 'play' && puzzleData && (
        <div key={selectedClueId} className={`floating-active-clue ${activeClueText ? 'visible' : ''}`}>
          <span className="floating-clue-num">{activeWord?.clueNum}{direction === 'across' ? 'a' : 'd'}</span>
          <p className="floating-clue-text">{activeClueText ? activeClueText.split('. ')[1] || activeClueText : ''}</p>
        </div>
      )}
    </div>
  );
}

export default App;
