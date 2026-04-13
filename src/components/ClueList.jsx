import React, { useRef, useEffect } from 'react';
import './ClueList.css';

const ClueList = ({ clues, direction, selectedClueId, solvedClueIds, onClueClick, puzzleTitle }) => {
  const selectedClueRef = useRef(null);

  useEffect(() => {
    if (selectedClueRef.current) {
      selectedClueRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [selectedClueId]);

  return (
    <div className="clue-list-root">
      <div className="clue-list-container">
        <div className={`clue-column ${direction === 'across' ? 'active-column' : ''}`}>
        <h3 className="clue-column-title">Across</h3>
        <ul className="clue-list">
          {clues.across.map((clue, idx) => {
            const num = clue.split('.')[0];
            const id = `across-${num}`;
            const isSelected = selectedClueId === id;
            const isSolved = solvedClueIds?.has(id);
            
            return (
               <li 
                key={idx} 
                ref={isSelected ? selectedClueRef : null}
                className={`clue-item ${isSelected ? 'clue-selected' : ''} ${isSolved ? 'clue-solved' : ''}`}
                onClick={() => onClueClick && onClueClick('across', num)}
              >
                {clue}
              </li>
            );
          })}
        </ul>
      </div>

      <div className={`clue-column ${direction === 'down' ? 'active-column' : ''}`}>
        <h3 className="clue-column-title">Down</h3>
        <ul className="clue-list">
          {clues.down.map((clue, idx) => {
            const num = clue.split('.')[0];
            const id = `down-${num}`;
            const isSelected = selectedClueId === id;
            const isSolved = solvedClueIds?.has(id);
            
            return (
              <li 
                key={idx} 
                ref={isSelected ? selectedClueRef : null}
                className={`clue-item ${isSelected ? 'clue-selected' : ''} ${isSolved ? 'clue-solved' : ''}`}
                onClick={() => onClueClick && onClueClick('down', num)}
              >
                {clue}
              </li>
            );
          })}
        </ul>
      </div>

      {puzzleTitle && (
        <div className="clue-list-footer" aria-hidden={puzzleTitle ? 'false' : 'true'}>
          {puzzleTitle}
        </div>
      )}
    </div>
  </div>
  );
};

export default ClueList;
