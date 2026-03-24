import React, { useEffect, useState } from 'react';
import './PuzzleList.css';
import { checkPuzzleStatus } from '../utils/storage';

const PuzzleList = ({ onSelectPuzzle }) => {
  const [puzzles, setPuzzles] = useState([]);
  const [statuses, setStatuses] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchIndex = async () => {
      try {
        const baseUrl = import.meta.env.BASE_URL;
        const res = await fetch(`${baseUrl}data/puzzles.json`);
        const data = await res.json();
        setPuzzles(data);
        
        const statusMap = {};
        for (const p of data) {
          const totalCells = p.cols * p.rows;
          statusMap[p.id] = await checkPuzzleStatus(p.id, totalCells);
        }
        setStatuses(statusMap);
        
      } catch (err) {
        console.error('Failed to load puzzle list', err);
      } finally {
        setLoading(false);
      }
    };
    fetchIndex();
  }, []);

  if (loading) return <div className="puzzle-list-loading">Loading Puzzles...</div>;

  return (
    <div className="puzzle-list-container glass-panel animate-fade-in">
      <h2>Available Puzzles</h2>
      <ul className="puzzle-list">
        {puzzles.map(puzzle => {
          const status = statuses[puzzle.id] || 'New';
          const gridSize = `${puzzle.cols}x${puzzle.rows}`;
          
          return (
            <li 
              key={puzzle.id} 
              className="puzzle-list-item"
              onClick={() => onSelectPuzzle(puzzle.id)}
            >
              <div className="puzzle-info">
                <div className="puzzle-meta">
                  <span className="puzzle-date">{puzzle.date}</span>
                  <span className="puzzle-size-badge">{gridSize}</span>
                  {puzzle.theme && <span className="puzzle-theme-badge">{puzzle.theme}</span>}
                </div>
                <span className="puzzle-title">{puzzle.title}</span>
              </div>
              <div className={`puzzle-status status-${status.replace(' ', '')}`}>
                {status}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

export default PuzzleList;
