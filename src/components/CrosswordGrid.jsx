import React, { useRef, useEffect, useState, useCallback } from 'react';
import './CrosswordGrid.css';
import { getCorrectCells, getWordAt } from '../utils/crossword';
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
  const cellRefs = useRef([]);
  const correctCells = getCorrectCells(puzzleData, answers);
  const prevCorrectWordsRef = useRef(new Set());
  const puzzleCompleteShownRef = useRef(false);
  const [floatingWords, setFloatingWords] = useState([]);
  const [puzzleComplete, setPuzzleComplete] = useState(false);

  // Gather all words and their correctness
  const getAllWords = useCallback(() => {
    const words = [];
    for (let i = 0; i < grid.length; i++) {
      if (gridnums[i] > 0 && grid[i] !== '.') {
        const prevAcross = i - 1;
        const isStartAcross = prevAcross < 0 || grid[prevAcross] === '.' || Math.floor(prevAcross/cols) !== Math.floor(i/cols);
        if (isStartAcross) {
          const wd = getWordAt(i, 'across', puzzleData, answers);
          if (wd && wd.clueIndex !== -1) {
            const answer = puzzleData.answers.across[wd.clueIndex];
            words.push({ key: `across-${wd.clueNum}`, word: answer, isCorrect: wd.isCorrect, indices: wd.indices, dir: 'across' });
          }
        }
        const prevDown = i - cols;
        const isStartDown = prevDown < 0 || grid[prevDown] === '.';
        if (isStartDown) {
          const wd = getWordAt(i, 'down', puzzleData, answers);
          if (wd && wd.clueIndex !== -1) {
            const answer = puzzleData.answers.down[wd.clueIndex];
            words.push({ key: `down-${wd.clueNum}`, word: answer, isCorrect: wd.isCorrect, indices: wd.indices, dir: 'down' });
          }
        }
      }
    }
    return words;
  }, [grid, gridnums, cols, puzzleData, answers]);

  const gridWrapperRef = useRef(null);

  // Calculate the exact bounding box of a word's cells relative to the grid wrapper
  const getWordPosition = (indices) => {
    const rects = indices
      .map(i => cellRefs.current[i]?.getBoundingClientRect())
      .filter(Boolean);
    if (rects.length === 0) return null;

    const wrapperRect = gridWrapperRef.current?.getBoundingClientRect();
    if (!wrapperRect) return null;

    const minX = Math.min(...rects.map(r => r.left));
    const maxX = Math.max(...rects.map(r => r.right));
    const minY = Math.min(...rects.map(r => r.top));
    const maxY = Math.max(...rects.map(r => r.bottom));

    // Get computed font size from the actual cell input
    const firstInput = inputRefs.current[indices[0]];
    const fontSize = firstInput
      ? window.getComputedStyle(firstInput).fontSize
      : '1.8rem';

    return {
      top: `${minY - wrapperRect.top}px`,
      left: `${minX - wrapperRect.left}px`,
      width: `${maxX - minX}px`,
      height: `${maxY - minY}px`,
      fontSize
    };
  };

  // Detect newly completed words and trigger animations
  useEffect(() => {
    const allWords = getAllWords();
    const currentCorrectKeys = new Set(allWords.filter(w => w.isCorrect).map(w => w.key));
    const prevKeys = prevCorrectWordsRef.current;

    const newlyCorrect = allWords.filter(w => w.isCorrect && !prevKeys.has(w.key));

    if (newlyCorrect.length > 0) {
      const newFloaters = newlyCorrect.map(w => {
        const pos = getWordPosition(w.indices);
        if (!pos) return null;
        return {
          id: `${w.key}-${Date.now()}`,
          word: w.word,
          isVertical: w.dir === 'down',
          ...pos
        };
      }).filter(Boolean);
      setFloatingWords(prev => [...prev, ...newFloaters]);

      setTimeout(() => {
        setFloatingWords(prev => prev.filter(f => !newFloaters.some(nf => nf.id === f.id)));
      }, 1000);
    }

    // Only fire puzzle complete ONCE, on the exact transition
    const totalLetterCells = grid.filter(c => c !== '.').length;
    if (correctCells.size === totalLetterCells && totalLetterCells > 0 && !puzzleCompleteShownRef.current) {
      puzzleCompleteShownRef.current = true;
      // Delay so the final word animation plays first
      setTimeout(() => setPuzzleComplete(true), 600);
    }

    prevCorrectWordsRef.current = currentCorrectKeys;
  }, [answers, getAllWords, correctCells, grid]);

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
      // Auto-select the correct direction if the current one has no clue for this cell
      const currentWord = getWordAt(index, direction, puzzleData, answers);
      if (currentWord && currentWord.clueIndex === -1) {
        setDirection(direction === 'across' ? 'down' : 'across');
      }
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
      // Auto-select the correct direction if the current one has no clue for this cell
      // We must check if `direction` is currently valid. If not, switch it.
      const currentWord = getWordAt(nextIndex, direction, puzzleData, answers);
      if (currentWord && currentWord.clueIndex === -1) {
        setDirection(direction === 'across' ? 'down' : 'across');
      }
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

  const handleDismissComplete = () => {
    setPuzzleComplete(false);
  };

  // Get all words for puzzle-complete animation
  const allCorrectWords = puzzleComplete ? getAllWords().filter(w => w.isCorrect) : [];

  return (
    <>
      <div className="crossword-grid-wrapper" ref={gridWrapperRef}>
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
                ref={el => cellRefs.current[index] = el}
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

        {/* Floating word-complete animations */}
        {floatingWords.map(fw => (
          <div
            key={fw.id}
            className={`word-complete-float${fw.isVertical ? ' word-float-vertical' : ''}`}
            style={{
              top: fw.top,
              left: fw.left,
              width: fw.width,
              height: fw.height,
              fontSize: fw.fontSize
            }}
          >
            {fw.word.split('').map((letter, i) => (
              <span key={i} className="word-float-letter">{letter}</span>
            ))}
          </div>
        ))}
      </div>

      {/* Puzzle complete overlay */}
      {puzzleComplete && (
        <div className="puzzle-complete-overlay" onClick={handleDismissComplete}>
          <div className="puzzle-complete-content">
            <div className="puzzle-complete-words">
              {allCorrectWords.map((w, i) => (
                <span
                  key={w.key}
                  className="puzzle-complete-word"
                  style={{ animationDelay: `${i * 0.08}s` }}
                >
                  {w.word}
                </span>
              ))}
            </div>
            <h2 className="puzzle-complete-title">Puzzle Complete!</h2>
            <p className="puzzle-complete-subtitle">Tap anywhere to dismiss</p>
          </div>
        </div>
      )}
    </>
  );
};

export default CrosswordGrid;
