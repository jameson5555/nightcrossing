import React, { useRef, useEffect } from 'react';
import './CrosswordGrid.css';
import { getCorrectCells } from '../utils/crossword';
import { savePuzzleProgress } from '../utils/storage';

const CrosswordGrid = ({ 
  puzzleData, 
  answers, 
  setAnswers, 
  selectedCell, 
  setSelectedCell, 
  direction, 
  setDirection,
  activeWordIndices 
}) => {
  const { id, size, grid, gridnums } = puzzleData;
  const cols = size.cols;
  const rows = size.rows;

  const inputRefs = useRef([]);
  const correctCells = getCorrectCells(puzzleData, answers);

  // Auto-save progress
  useEffect(() => {
    if (id && answers.length > 0) {
      savePuzzleProgress(id, answers);
    }
  }, [answers, id]);

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
      const inputEl = inputRefs.current[selectedCell];
      inputEl.focus({ preventScroll: true }); // Prevent browser default jumping
      // Smoothly scroll the container to center this cell
      inputEl.parentNode.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [selectedCell]);

  const getNextIndex = (currentIndex, dir, step, skipCorrect = false) => {
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
        if (skipCorrect && correctCells.has(nextIndex)) {
            continue; // Skip this correctly solved cell
        }
        return nextIndex;
      }
    }
  };

  const moveToNextCell = (currentIndex, dir, step, skipCorrect = false) => {
    const nextIndex = getNextIndex(currentIndex, dir, step, skipCorrect);
    if (nextIndex !== -1) {
      setSelectedCell(nextIndex);
    }
  };

  const handleChange = (index, e) => {
    const val = e.target.value;
    const char = val.slice(-1);
    if (/^[a-zA-Z]$/.test(char)) {
      if (!correctCells.has(index)) {
        const newAnswers = [...answers];
        newAnswers[index] = char.toUpperCase();
        setAnswers(newAnswers);
      }
      moveToNextCell(index, direction, 1, true);
    } else if (val === '') {
      if (!correctCells.has(index)) {
        const newAnswers = [...answers];
        if (newAnswers[index] !== '') {
          newAnswers[index] = '';
          setAnswers(newAnswers);
        }
      }
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
      if (newAnswers[index] !== '' && !correctCells.has(index)) {
        newAnswers[index] = '';
        setAnswers(newAnswers);
      } else {
        // Find previous cell, skipping correctly solved ones
        const prevIndex = getNextIndex(index, direction, -1, true);
        if (prevIndex !== -1) {
          if (!correctCells.has(prevIndex)) {
            newAnswers[prevIndex] = '';
            setAnswers(newAnswers);
          }
          setSelectedCell(prevIndex);
        }
      }
    } else if (/^[a-zA-Z]$/.test(e.key)) {
      e.preventDefault();
      if (!correctCells.has(index)) {
        const newAnswers = [...answers];
        newAnswers[index] = e.key.toUpperCase();
        setAnswers(newAnswers);
      }
      moveToNextCell(index, direction, 1, true);
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
        const isActiveWord = activeWordIndices.includes(index);
        const isCorrectWord = correctCells.has(index);
        
        let cellClass = 'crossword-cell';
        if (isBlock) cellClass += ' cell-block';
        if (isSelected) cellClass += ' cell-selected';
        else if (isActiveWord) cellClass += ' cell-in-word';
        if (isCorrectWord) cellClass += ' cell-correct';

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
                value={answers[index] || ''} 
                onChange={(e) => handleChange(index, e)}
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
