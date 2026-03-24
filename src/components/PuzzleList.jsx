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
        // Due to the base path being /nightcrossing/ in vite.config.js,
        // absolute fetches in production need to reflect that.
        // For local dev, import.meta.env.BASE_URL handles it.
        const baseUrl = import.meta.env.BASE_URL;
        const res = await fetch(`${baseUrl}data/puzzles.json`);
        const data = await res.json();
        setPuzzles(data);
        
        // Fetch statuses for all puzzles
        const statusMap = {};
        for (const p of data) {
          // Calculate max possible answers for "Completed" check
          const totalCells = p.cols * p.rows; // Very rough via total footprint
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
          return (
            <li 
              key={puzzle.id} 
              className="puzzle-list-item"
              onClick={() => onSelectPuzzle(puzzle.id)}
            >
              <div className="puzzle-info">
                <span className="puzzle-date">{puzzle.date}</span>
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
