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
        const res = await fetch(`${baseUrl}data/puzzles.json?t=${Date.now()}`);
        const data = await res.json();
        // Populate puzzles and compute statuses using index metadata.
        setPuzzles(data);

        const statusMap = {};
        for (const p of data) {
          const totalCells = typeof p.letterCells === 'number' ? p.letterCells : (p.cols * p.rows);
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

  const [expandedTheme, setExpandedTheme] = useState(null);

  if (loading) return <div className="puzzle-list-loading">Loading Puzzles...</div>;

  const inProgressPuzzles = puzzles.filter(p => statuses[p.id] === 'In Progress');
  
  const themesMap = {};
  puzzles.forEach(p => {
    const theme = p.theme || 'Other';
    if (!themesMap[theme]) themesMap[theme] = [];
    themesMap[theme].push(p);
  });
  
  const toggleTheme = (theme) => {
    setExpandedTheme(expandedTheme === theme ? null : theme);
  };

  const renderPuzzleItem = (puzzle) => {
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
          </div>
          <span className="puzzle-title">{puzzle.title}</span>
        </div>
        <div className={`puzzle-status status-${status.replace(' ', '')}`}>
          {status}
        </div>
      </li>
    );
  };

  return (
    <div className="puzzle-list-wrapper animate-fade-in">
      {inProgressPuzzles.length > 0 && (
        <section className="puzzle-section">
          <h2 className="section-title">In Progress</h2>
          <ul className="puzzle-list">
            {inProgressPuzzles.map(renderPuzzleItem)}
          </ul>
        </section>
      )}

      <section className="puzzle-section theme-section">
        <h2 className="section-title">Themes</h2>
        <div className="theme-list">
          {Object.entries(themesMap).map(([theme, themePuzzles]) => {
            const isExpanded = expandedTheme === theme;
            const completedCount = themePuzzles.filter(p => statuses[p.id] === 'Completed').length;
            
            // Progressive unlock logic: 3 base + 1 for each completed
            const unlockedCount = 3 + completedCount;
            const visiblePuzzles = themePuzzles.slice(0, unlockedCount);
            
            const totalCount = themePuzzles.length;

            return (
              <div key={theme} className={`theme-group ${isExpanded ? 'expanded' : ''}`}>
                <div className="theme-header" onClick={() => toggleTheme(theme)}>
                  <div className="theme-header-info">
                    <span className="theme-name">{theme}</span>
                    <span className="theme-progress">{completedCount} / {totalCount} Available Completed</span>
                  </div>
                  <div className="theme-expand-icon">
                    <svg 
                      viewBox="0 0 24 24" 
                      fill="none" 
                      stroke="currentColor" 
                      strokeWidth="2" 
                      style={{ transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}
                    >
                      <polyline points="6 9 12 15 18 9"></polyline>
                    </svg>
                  </div>
                </div>
                {isExpanded && (
                  <ul className="puzzle-list theme-puzzles">
                    {visiblePuzzles.map(renderPuzzleItem)}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
};

export default PuzzleList;
