import React, { useState } from 'react';
import './App.css';
import CrosswordGrid from './components/CrosswordGrid';
import ClueList from './components/ClueList';
import dummyPuzzle from './data/dummy-puzzle.json';

function App() {
  const [puzzleData, setPuzzleData] = useState(dummyPuzzle);
  const [direction, setDirection] = useState('across');
  const [selectedClueId, setSelectedClueId] = useState('across-1');

  return (
    <div className="app-container animate-fade-in">
      <header className="app-header glass-panel">
        <h1 className="logo-text">Nightcrossing</h1>
      </header>

      <main className="app-main">
        {puzzleData ? (
          <CrosswordGrid puzzleData={puzzleData} />
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
