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
  activeWordIndices,
  revealedIndices = new Set()
}) => {
  const { id, size, grid, gridnums } = puzzleData;
  const cols = size.cols;
  const rows = size.rows;

  const inputRefs = useRef([]);
  const isComposingRef = useRef(false);
  const inputSuppressRef = useRef(false);
  const cellRefs = useRef([]);
  const correctCells = getCorrectCells(puzzleData, answers);
  const lockedCells = new Set([...correctCells, ...revealedIndices]);
  const prevCorrectWordsRef = useRef(new Set());
  const puzzleCompleteShownRef = useRef(false);
  const puzzleSequenceTimeoutsRef = useRef([]);
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

  const addFloatingWord = useCallback((wordData) => {
    const pos = getWordPosition(wordData.indices);
    if (!pos) return;

    const floater = {
      id: `${wordData.key}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      word: wordData.word,
      isVertical: wordData.dir === 'down',
      ...pos
    };

    setFloatingWords(prev => [...prev, floater]);

    const cleanupId = setTimeout(() => {
      setFloatingWords(prev => prev.filter(f => f.id !== floater.id));
    }, 3000);
    puzzleSequenceTimeoutsRef.current.push(cleanupId);
  }, []);

  const runPuzzleCompletionSequence = useCallback((allWords) => {
    const completedWords = allWords.filter(w => w.isCorrect);
    if (completedWords.length === 0) {
      setPuzzleComplete(true);
      return;
    }

    // Stable order for a readable celebration sweep across the grid.
    const orderedWords = [...completedWords].sort((a, b) => {
      const aMin = Math.min(...a.indices);
      const bMin = Math.min(...b.indices);
      return aMin - bMin;
    });

    const stepDelayMs = 220;
    orderedWords.forEach((wordData, idx) => {
      const timeoutId = setTimeout(() => {
        addFloatingWord(wordData);
      }, idx * stepDelayMs);
      puzzleSequenceTimeoutsRef.current.push(timeoutId);
    });

    const overlayDelay = orderedWords.length * stepDelayMs + 500;
    const finishId = setTimeout(() => {
      setPuzzleComplete(true);
    }, overlayDelay);
    puzzleSequenceTimeoutsRef.current.push(finishId);
  }, [addFloatingWord]);

  const isInitialMount = useRef(true);


  // Detect newly completed words and trigger animations
  useEffect(() => {
    const allWords = getAllWords();
    const currentCorrectKeys = new Set(allWords.filter(w => w.isCorrect).map(w => w.key));
    
    if (isInitialMount.current) {
      isInitialMount.current = false;
      prevCorrectWordsRef.current = currentCorrectKeys;
      
      // Still need to trigger puzzle complete if we loaded a 100% finished puzzle
      const totalLetterCells = grid.filter(c => c !== '.').length;
      if (correctCells.size === totalLetterCells && totalLetterCells > 0) {
        puzzleCompleteShownRef.current = true;
        setTimeout(() => setPuzzleComplete(true), 0);
      }
      return;
    }

    // Only fire puzzle complete ONCE, on the exact transition
    const totalLetterCells = grid.filter(c => c !== '.').length;
    if (correctCells.size === totalLetterCells && totalLetterCells > 0 && !puzzleCompleteShownRef.current) {
      puzzleCompleteShownRef.current = true;
      setTimeout(() => runPuzzleCompletionSequence(allWords), 0);
      prevCorrectWordsRef.current = currentCorrectKeys;
      return;
    }

    const prevKeys = prevCorrectWordsRef.current;
    const newlyCorrect = allWords.filter(w => w.isCorrect && !prevKeys.has(w.key));

    if (newlyCorrect.length > 0) {
      newlyCorrect.forEach(addFloatingWord);
    }

    prevCorrectWordsRef.current = currentCorrectKeys;
  }, [answers, getAllWords, correctCells, grid, addFloatingWord, runPuzzleCompletionSequence]);

  useEffect(() => {
    return () => {
      puzzleSequenceTimeoutsRef.current.forEach(timeoutId => clearTimeout(timeoutId));
      puzzleSequenceTimeoutsRef.current = [];
    };
  }, []);

  // Auto-save progress
  useEffect(() => {
    if (id && answers.length > 0) {
      savePuzzleProgress(id, answers);
    }
  }, [answers, id]);

  const handleCellClick = (index) => {
    if (grid[index] === '.') return;
    
    const acrossWord = getWordAt(index, 'across', puzzleData, answers);
    const downWord = getWordAt(index, 'down', puzzleData, answers);
    const hasAcross = acrossWord && acrossWord.clueIndex !== -1;
    const hasDown = downWord && downWord.clueIndex !== -1;

    if (selectedCell === index) {
      // Only toggle if both directions are valid
      if (hasAcross && hasDown) {
        setDirection(direction === 'across' ? 'down' : 'across');
      }
    } else {
      setSelectedCell(index);
      if (hasAcross && !hasDown) {
        setDirection('across');
      } else if (hasDown && !hasAcross) {
        setDirection('down');
      } else if (hasAcross && hasDown) {
        // Keep current direction if valid, otherwise switch
        const currentWord = getWordAt(index, direction, puzzleData, answers);
        if (!currentWord || currentWord.clueIndex === -1) {
          setDirection(direction === 'across' ? 'down' : 'across');
        }
      }
    }
  };

  useEffect(() => {
    if (selectedCell !== null && inputRefs.current[selectedCell]) {
      const inputEl = inputRefs.current[selectedCell];
      try {
        inputEl.focus({ preventScroll: true }); // Prevent browser default jumping
      } catch (err) {
        inputEl.focus();
      }

      // place caret at end for contentEditable elements
      setTimeout(() => {
        try {
          const sel = window.getSelection();
          if (sel) {
            const range = document.createRange();
            range.selectNodeContents(inputEl);
            range.collapse(false);
            sel.removeAllRanges();
            sel.addRange(range);
          }
        } catch (err) {}
      }, 0);

      // Smoothly scroll the container to center this cell
      try {
        inputEl.parentNode.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } catch (err) {}
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
        if (skipCorrect && lockedCells.has(nextIndex)) {
            continue; // Skip this locked cell
        }
        return nextIndex;
      }
    }
  };

  const moveToNextCell = (currentIndex, dir, step, skipCorrect = false) => {
    const nextIndex = getNextIndex(currentIndex, dir, step, skipCorrect);
    if (nextIndex !== -1) {
      setSelectedCell(nextIndex);
      
      const acrossWord = getWordAt(nextIndex, 'across', puzzleData, answers);
      const downWord = getWordAt(nextIndex, 'down', puzzleData, answers);
      const hasAcross = acrossWord && acrossWord.clueIndex !== -1;
      const hasDown = downWord && downWord.clueIndex !== -1;

      if (hasAcross && !hasDown) {
        setDirection('across');
      } else if (hasDown && !hasAcross) {
        setDirection('down');
      } else if (hasAcross && hasDown) {
        // Keep current direction if valid, otherwise switch
        const currentWord = getWordAt(nextIndex, direction, puzzleData, answers);
        if (!currentWord || currentWord.clueIndex === -1) {
          setDirection(direction === 'across' ? 'down' : 'across');
        }
      }
    }
  };

  const handleChange = (index, e) => {
    if (inputSuppressRef.current) {
      inputSuppressRef.current = false;
      return;
    }
    if (isComposingRef.current) return;
    const raw = e && e.target ? (e.target.value ?? e.target.innerText ?? '') : '';
    const val = String(raw).trim();
    const char = val.slice(-1);
    if (/^[a-zA-Z]$/.test(char)) {
      if (!lockedCells.has(index)) {
        const newAnswers = [...answers];
        newAnswers[index] = char.toUpperCase();
        setAnswers(newAnswers);
      }
      moveToNextCell(index, direction, 1, true);
    } else if (val === '') {
      if (!lockedCells.has(index)) {
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
      if (newAnswers[index] !== '' && !lockedCells.has(index)) {
        newAnswers[index] = '';
        setAnswers(newAnswers);
      } else {
        // Find previous cell, skipping locked ones
        const prevIndex = getNextIndex(index, direction, -1, true);
        if (prevIndex !== -1) {
          if (!lockedCells.has(prevIndex)) {
            newAnswers[prevIndex] = '';
            setAnswers(newAnswers);
          }
          setSelectedCell(prevIndex);
        }
      }
    } else if (/^[a-zA-Z]$/.test(e.key) && !isComposingRef.current) {
      e.preventDefault();
      if (!lockedCells.has(index)) {
        const newAnswers = [...answers];
        newAnswers[index] = e.key.toUpperCase();
        setAnswers(newAnswers);
      }
      // prevent the following input event from double-applying
      inputSuppressRef.current = true;
      setTimeout(() => { inputSuppressRef.current = false; }, 0);
      moveToNextCell(index, direction, 1, true);
    }
  };

  const handlePaste = (index, e) => {
    e.preventDefault();
    const text = (e.clipboardData || window.clipboardData).getData('text') || '';
    const char = String(text).trim().slice(-1);
    if (/^[a-zA-Z]$/.test(char)) {
      if (!lockedCells.has(index)) {
        const newAnswers = [...answers];
        newAnswers[index] = char.toUpperCase();
        setAnswers(newAnswers);
      }
      // prevent the following input event from double-applying
      inputSuppressRef.current = true;
      setTimeout(() => { inputSuppressRef.current = false; }, 0);
      moveToNextCell(index, direction, 1, true);
    }
  };

  const handleDismissComplete = () => {
    setPuzzleComplete(false);
  };

  return (
    <>
      <div className="crossword-grid-wrapper" ref={gridWrapperRef}>
        <div 
          className="crossword-grid animate-fade-in"
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
            const isLocked = lockedCells.has(index);
            
            let cellClass = 'crossword-cell';
            if (isBlock) cellClass += ' cell-block';
            if (isSelected) cellClass += ' cell-selected';
            else if (isActiveWord) cellClass += ' cell-in-word';
            if (isLocked) cellClass += ' cell-correct';

            return (
              <div 
                key={index}
                ref={el => cellRefs.current[index] = el}
                className={cellClass}
                onClick={() => handleCellClick(index)}
              >
                {!isBlock && <span className="cell-number">{cellNumber > 0 ? cellNumber : ''}</span>}
                {!isBlock && (
                  <div
                    ref={el => inputRefs.current[index] = el}
                    contentEditable
                    suppressContentEditableWarning
                    className="cell-input cell-input-div"
                    onInput={(e) => handleChange(index, e)}
                    onKeyDown={(e) => handleKeyDown(index, e)}
                    onPaste={(e) => handlePaste(index, e)}
                    onPointerDown={(e) => { e.preventDefault(); handleCellClick(index); const el = inputRefs.current[index]; setTimeout(() => el && el.focus(), 0); }}
                    onCompositionStart={() => { isComposingRef.current = true; }}
                    onCompositionEnd={(e) => {
                      isComposingRef.current = false;
                      const text = e.target.innerText || '';
                      const char = String(text).trim().slice(-1);
                      if (/^[a-zA-Z]$/.test(char)) {
                        if (!lockedCells.has(index)) {
                          const newAnswers = [...answers];
                          newAnswers[index] = char.toUpperCase();
                          setAnswers(newAnswers);
                        }
                        moveToNextCell(index, direction, 1, true);
                      } else if (text.trim() === '') {
                        if (!lockedCells.has(index)) {
                          const newAnswers = [...answers];
                          if (newAnswers[index] !== '') {
                            newAnswers[index] = '';
                            setAnswers(newAnswers);
                          }
                        }
                      }
                    }}
                    onBlur={(e) => { const el = inputRefs.current[index]; if (el && el.innerText !== (answers[index] || '')) { handleChange(index, { target: el }); } }}
                    spellCheck={false}
                    autoCapitalize="characters"
                    role="textbox"
                    aria-label={`Cell ${index}`}
                    tabIndex={0}
                    onFocus={() => setSelectedCell(index)}
                  >
                    {answers[index] || ''}
                  </div>
                )}
              </div>
            );
          })}
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
      </div>

      {/* Puzzle complete overlay */}
      {puzzleComplete && (
        <div className="puzzle-complete-overlay" onClick={handleDismissComplete}>
          <div className="puzzle-complete-content">
            <h2 className="puzzle-complete-title">Puzzle Complete!</h2>
            <p className="puzzle-complete-subtitle">Tap anywhere to dismiss</p>
          </div>
        </div>
      )}
    </>
  );
};

export default CrosswordGrid;
