import React from 'react';
import './HintModal.css';

const HintModal = ({ 
  isOpen, 
  onClose, 
  hintText, 
  isUnlocked, 
  onUnlock, 
  onRevealLetter,
  isWordSolved,
  hintsRemaining 
}) => {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content glass-panel animate-pop-in" onClick={e => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>&times;</button>
        
        <div className="modal-header">
          <div className="title-container">
            <h2 className="modal-title">Word Hint</h2>
            <div className="hint-counter">
              <span className="hint-icon">💡</span>
              <span className="hint-count">{hintsRemaining}</span>
            </div>
          </div>
        </div>

        <div className="modal-body">
          {isUnlocked ? (
            <div className="hint-reveal">
              <p className="hint-label">Clue:</p>
              <p className="hint-text">{hintText || "No additional info available for this word."}</p>
            </div>
          ) : (
            <div className="hint-locked">
              <p className="hint-description">
                Stuck? Unlock a hint to help you solve this word. You can earn more hints by solving puzzles!
              </p>
              <button 
                className="unlock-btn" 
                onClick={onUnlock}
                disabled={hintsRemaining <= 0}
              >
                Unlock Hint (-1 💡)
              </button>
            </div>
          )}

          {!isWordSolved && (
            <div className="reveal-letter-section">
              <div className="divider"></div>
              <p className="hint-description">
                Can't quite get it? Populate a random correct letter in this word.
              </p>
              <button 
                className="reveal-btn" 
                onClick={onRevealLetter}
                disabled={hintsRemaining <= 0}
              >
                Reveal a Letter (-1 💡)
              </button>
            </div>
          )}

          {hintsRemaining <= 0 && (
            <p className="hint-error">You're out of hints! Complete a puzzle to earn more.</p>
          )}
        </div>

        <div className="modal-footer">
          <button className="modal-btn-primary" onClick={onClose}>Got it</button>
        </div>
      </div>
    </div>
  );
};

export default HintModal;
