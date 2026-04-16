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
  revealedIndices = new Set(),
  onCompleteDismiss
}) => {
  const { id, size, grid, gridnums } = puzzleData;
  const cols = size.cols;
  const rows = size.rows;

  const hiddenInputRef = useRef(null);
  const cellRefs = useRef([]);
  const INITIAL_INPUT_VALUE = " ";
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

    // Get computed font size from the actual cell
    const firstCell = cellRefs.current[indices[0]];
    const cellInput = firstCell?.querySelector('.cell-input');
    const fontSize = cellInput
      ? window.getComputedStyle(cellInput).fontSize
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

    const stepDelayMs = 160;
    orderedWords.forEach((wordData, idx) => {
      const timeoutId = setTimeout(() => {
        addFloatingWord(wordData);
      }, idx * stepDelayMs);
      puzzleSequenceTimeoutsRef.current.push(timeoutId);
    });

    const overlayDelay = orderedWords.length * stepDelayMs + 1200;
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

    // Focus the hidden input synchronously to capture keystrokes / open mobile keyboard.
    // MUST be synchronous (no setTimeout) to preserve the user gesture chain on Android.
    if (!lockedCells.has(index)) {
      const inp = hiddenInputRef.current;
      if (inp) {
        try {
          inp.value = INITIAL_INPUT_VALUE;
          inp.focus({ preventScroll: true });
        } catch (err) {
          inp.focus();
        }
      }
    }
  };

  // Scroll and focus when selectedCell changes
  useEffect(() => {
    if (selectedCell !== null) {
      // Focus hidden input
      if (!lockedCells.has(selectedCell)) {
        const inp = hiddenInputRef.current;
        if (inp) {
          try {
            inp.value = INITIAL_INPUT_VALUE;
            inp.focus({ preventScroll: true });
          } catch (err) {
            inp.focus();
          }
        }
      }

      // Scroll into view
      const cell = cellRefs.current[selectedCell];
      if (cell) {
        try {
          cell.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } catch (err) {}
      }
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

  // ─── Hidden Input Handlers ──────────────────────────────────────────────
  // A single offscreen <input> captures all keyboard events reliably across
  // all platforms (including Android Samsung keyboard), then we apply the
  // character to the currently selected cell and advance.

  const handleHiddenInput = (e) => {
    const index = selectedCell;
    if (index === null || lockedCells.has(index)) {
      e.target.value = " ";
      return;
    }

    const val = e.target.value;
    
    // Deletion detection: if value is empty, it means our placeholder space was deleted
    if (val === "") {
      const newAnswers = [...answers];
      if (newAnswers[index] !== '') {
        newAnswers[index] = '';
        setAnswers(newAnswers);
      } else {
        const prevIndex = getNextIndex(index, direction, -1, true);
        if (prevIndex !== -1) {
          if (!lockedCells.has(prevIndex)) {
            newAnswers[prevIndex] = '';
            setAnswers(newAnswers);
          }
          setSelectedCell(prevIndex);
        }
      }
      e.target.value = INITIAL_INPUT_VALUE;
      return;
    }

    // Input detection: something was added to our placeholder
    const char = val.charAt(val.length - 1);
    
    if (/^[a-zA-Z]$/.test(char)) {
      const nextChar = char.toUpperCase();
      const newAnswers = [...answers];
      newAnswers[index] = nextChar;
      setAnswers(newAnswers);
      moveToNextCell(index, direction, 1, true);
    }
    
    // Always reset to placeholder
    e.target.value = INITIAL_INPUT_VALUE;
  };

  const handleHiddenKeyDown = (e) => {
    const index = selectedCell;
    if (index === null) return;
    const key = e.key;
    const code = e.code;

    // Space bar for toggling direction
    if (key === ' ' || code === 'Space' || e.which === 32) {
      e.preventDefault();
      e.stopPropagation();
      const acrossWord = getWordAt(index, 'across', puzzleData, answers);
      const downWord = getWordAt(index, 'down', puzzleData, answers);
      const hasAcross = acrossWord && acrossWord.clueIndex !== -1;
      const hasDown = downWord && downWord.clueIndex !== -1;
      if (hasAcross && hasDown) {
        setDirection(prev => prev === 'across' ? 'down' : 'across');
      }
      return;
    }

    if (key === 'ArrowUp') {
      e.preventDefault();
      const nextIdx = getNextIndex(index, 'down', -1);
      if (nextIdx !== -1) {
        setSelectedCell(nextIdx);
        const word = getWordAt(nextIdx, 'down', puzzleData, answers);
        if (word && word.clueIndex !== -1) setDirection('down');
      }
    } else if (key === 'ArrowDown') {
      e.preventDefault();
      const nextIdx = getNextIndex(index, 'down', 1);
      if (nextIdx !== -1) {
        setSelectedCell(nextIdx);
        const word = getWordAt(nextIdx, 'down', puzzleData, answers);
        if (word && word.clueIndex !== -1) setDirection('down');
      }
    } else if (key === 'ArrowLeft') {
      e.preventDefault();
      const nextIdx = getNextIndex(index, 'across', -1);
      if (nextIdx !== -1) {
        setSelectedCell(nextIdx);
        const word = getWordAt(nextIdx, 'across', puzzleData, answers);
        if (word && word.clueIndex !== -1) setDirection('across');
      }
    } else if (key === 'ArrowRight') {
      e.preventDefault();
      const nextIdx = getNextIndex(index, 'across', 1);
      if (nextIdx !== -1) {
        setSelectedCell(nextIdx);
        const word = getWordAt(nextIdx, 'across', puzzleData, answers);
        if (word && word.clueIndex !== -1) setDirection('across');
      }
    } else if (key === 'Backspace') {
      // We don't preventDefault here so that onInput can catch the deletion of our placeholder space
      if (lockedCells.has(index)) {
        e.preventDefault();
        return;
      }
    } else if (key === 'Tab') {
      e.preventDefault();
      // Tab advances to next word
      moveToNextCell(index, direction, 1, true);
    } else if (/^[a-zA-Z]$/.test(key)) {
      // We also don't preventDefault here to allow the character to be typed into the input,
      // handled by onInput. This is more robust for mobile keyboards.
      if (lockedCells.has(index)) {
        e.preventDefault();
      }
    }
  };

  const handleHiddenPaste = (e) => {
    e.preventDefault();
    const index = selectedCell;
    if (index === null || lockedCells.has(index)) return;
    const text = (e.clipboardData || window.clipboardData).getData('text') || '';
    const char = String(text).trim().slice(-1);
    if (/^[a-zA-Z]$/.test(char)) {
      const nextChar = char.toUpperCase();
      const newAnswers = [...answers];
      newAnswers[index] = nextChar;
      setAnswers(newAnswers);
      moveToNextCell(index, direction, 1, true);
    }
  };

  const handleDismissComplete = () => {
    setPuzzleComplete(false);
    if (onCompleteDismiss) onCompleteDismiss();
  };

  return (
    <>
      {/* Single hidden input captures all keyboard events */}
      <input
        ref={hiddenInputRef}
        className="crossword-hidden-input"
        type="text"
        autoCapitalize="characters"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        enterKeyHint="next"
        aria-label="Crossword input"
        onInput={handleHiddenInput}
        onKeyDown={handleHiddenKeyDown}
        onPaste={handleHiddenPaste}
        onBlur={() => {
          // If the user taps within the grid, we'll re-focus via handleCellClick.
          // Otherwise, let it blur naturally so the keyboard can dismiss.
        }}
      />

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
                    className={`cell-input${isLocked ? ' cell-locked' : ''}`}
                    aria-label={`Cell ${index}`}
                    aria-readonly={isLocked}
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
            <div className="puzzle-complete-reward">
              <span className="reward-icon">💡</span>
              <span className="reward-text">Earned 3 hints</span>
            </div>
            <p className="puzzle-complete-subtitle">Tap anywhere to return to menu</p>
          </div>
        </div>
      )}
    </>
  );
};

export default CrosswordGrid;
