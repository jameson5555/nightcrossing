import React, { useState, useRef, useEffect } from 'react';
import './CrosswordGrid.css';

const CrosswordGrid = ({ puzzleData }) => {
  const [selectedCell, setSelectedCell] = useState(null);
  const [direction, setDirection] = useState('across'); // 'across' or 'down'

  const { size, grid, gridnums } = puzzleData;
  const cols = size.cols;
  const rows = size.rows;

  const [answers, setAnswers] = useState(Array(grid.length).fill(''));
  const inputRefs = useRef([]);

  const handleCellClick = (index) => {
    if (grid[index] === '.') return;
    
    if (selectedCell === index) {
      setDirection(direction === 'across' ? 'down' : 'across');
    } else {
      setSelectedCell(index);
    }
  };

  useEffect(() => {
    if (selectedCell !== null && inputRefs.current[selectedCell]) {
      inputRefs.current[selectedCell].focus();
    }
  }, [selectedCell]);

  const getNextIndex = (currentIndex, dir, step) => {
    let nextIndex = currentIndex;
    while (true) {
      if (dir === 'across') {
        const currentRow = Math.floor(nextIndex / cols);
        nextIndex += step;
        const newRow = Math.floor(nextIndex / cols);
        if (newRow !== currentRow || nextIndex < 0 || nextIndex >= grid.length) return -1;
      } else {
        nextIndex += step * cols;
        if (nextIndex < 0 || nextIndex >= grid.length) return -1;
      }

      if (grid[nextIndex] !== '.') {
        return nextIndex;
      }
    }
  };

  const moveToNextCell = (currentIndex, dir, step) => {
    const nextIndex = getNextIndex(currentIndex, dir, step);
    if (nextIndex !== -1) {
      setSelectedCell(nextIndex);
    }
  };

  const handleKeyDown = (index, e) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      moveToNextCell(index, 'down', -1);
      if (direction === 'across') setDirection('down');
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      moveToNextCell(index, 'down', 1);
      if (direction === 'across') setDirection('down');
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      moveToNextCell(index, 'across', -1);
      if (direction === 'down') setDirection('across');
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      moveToNextCell(index, 'across', 1);
      if (direction === 'down') setDirection('across');
    } else if (e.key === 'Backspace') {
      e.preventDefault();
      const newAnswers = [...answers];
      if (newAnswers[index] !== '') {
        newAnswers[index] = '';
        setAnswers(newAnswers);
      } else {
        const prevIndex = getNextIndex(index, direction, -1);
        if (prevIndex !== -1) {
          newAnswers[prevIndex] = '';
          setAnswers(newAnswers);
          setSelectedCell(prevIndex);
        }
      }
    } else if (/^[a-zA-Z]$/.test(e.key)) {
      e.preventDefault();
      const newAnswers = [...answers];
      newAnswers[index] = e.key.toUpperCase();
      setAnswers(newAnswers);
      moveToNextCell(index, direction, 1);
    }
  };

  return (
    <div 
      className="crossword-grid glass-panel animate-fade-in"
      style={{
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
        gridTemplateRows: `repeat(${rows}, 1fr)`
      }}
    >
      {grid.map((cellChar, index) => {
        const isBlock = cellChar === '.';
        const cellNumber = gridnums[index];
        const isSelected = selectedCell === index;
        
        let cellClass = 'crossword-cell';
        if (isBlock) cellClass += ' cell-block';
        if (isSelected) cellClass += ' cell-selected';

        return (
          <div 
            key={index} 
            className={cellClass}
            onClick={() => handleCellClick(index)}
          >
            {!isBlock && <span className="cell-number">{cellNumber > 0 ? cellNumber : ''}</span>}
            {!isBlock && (
              <input 
                ref={el => inputRefs.current[index] = el}
                type="text" 
                className="cell-input" 
                maxLength={1} 
                value={answers[index] || ''} 
                onChange={() => {}}
                onKeyDown={(e) => handleKeyDown(index, e)}
                autoComplete="off"
                spellCheck="false"
              />
            )}
          </div>
        );
      })}
    </div>
  );
};

export default CrosswordGrid;
