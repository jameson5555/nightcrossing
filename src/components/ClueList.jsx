import React from 'react';
import './ClueList.css';

const ClueList = ({ clues, direction, selectedClueId }) => {
  return (
    <div className="clue-list-container">
      <div className={`clue-column ${direction === 'across' ? 'active-column' : ''}`}>
        <h3 className="clue-column-title">Across</h3>
        <ul className="clue-list">
          {clues.across.map((clue, idx) => {
            const num = clue.split('.')[0];
            const isSelected = selectedClueId === `across-${num}`;
            return (
              <li 
                key={idx} 
                className={`clue-item ${isSelected ? 'clue-selected' : ''}`}
                onClick={() => {/* will map to grid cell later */}}
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
            const isSelected = selectedClueId === `down-${num}`;
            return (
              <li 
                key={idx} 
                className={`clue-item ${isSelected ? 'clue-selected' : ''}`}
                onClick={() => {/* will map to grid cell later */}}
              >
                {clue}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
};

export default ClueList;
