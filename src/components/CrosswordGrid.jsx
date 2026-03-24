import React, { useMemo, useState } from 'react';
import './CrosswordGrid.css';

const CrosswordGrid = ({ puzzleData }) => {
  const [selectedCell, setSelectedCell] = useState(null);
  const [direction, setDirection] = useState('across'); // 'across' or 'down'

  // The grid is a 1D array of strings. Convert to 2D for easier rendering
  const { size, grid, gridnums } = puzzleData;
  const cols = size.cols;
  const rows = size.rows;

  const handleCellClick = (index) => {
    if (grid[index] === '.') return; // Block cell
    
    if (selectedCell === index) {
      // Toggle direction if clicking same cell
      setDirection(direction === 'across' ? 'down' : 'across');
    } else {
      setSelectedCell(index);
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
        
        // Very basic styling logic for now
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
                type="text" 
                className="cell-input" 
                maxLength={1} 
                defaultValue="" // To do: handle state
                readOnly
              />
            )}
          </div>
        );
      })}
    </div>
  );
};

export default CrosswordGrid;
