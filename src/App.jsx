import React, { useState } from 'react';
import './App.css';
import CrosswordGrid from './components/CrosswordGrid';
import ClueList from './components/ClueList';
import dummyPuzzle from './data/dummy-puzzle.json';
import { getWordAt } from './utils/crossword';

function App() {
  const [puzzleData, setPuzzleData] = useState(dummyPuzzle);
  const [direction, setDirection] = useState('across');
  const [selectedCell, setSelectedCell] = useState(null);
  const [answers, setAnswers] = useState(() => Array(puzzleData ? puzzleData.grid.length : 0).fill(''));

  const activeWord = puzzleData && selectedCell !== null
    ? getWordAt(selectedCell, direction, puzzleData, answers) 
    : null;
  
  const selectedClueId = activeWord ? `${direction}-${activeWord.clueNum}` : null;

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
        <h1 className="logo-text">Nightcrossing</h1>
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
            Loading Today's Puzzle...
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
    </div>
  );
}

export default App;
