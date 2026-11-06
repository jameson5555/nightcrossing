const hasLetters = answers => Array.isArray(answers) && answers.some(cell =>
  typeof cell === 'string' && cell.trim() !== '');
const text = value => typeof value === 'string' ? value.slice(0, 100) : undefined;

// Only these fields reach the data layer. Account IDs and saved answers are
// used locally to classify activity, never included in the event payload.
const parameterNames = ['puzzle_id', 'level_name', 'puzzle_theme', 'puzzle_difficulty', 'success', 'method'];
const eventNames = new Set(['level_start', 'puzzle_resume', 'level_end', 'sign_up', 'login']);

export function createAnalytics({ enabled = false, browser = globalThis.window } = {}) {
  const memory = new Map();
  const read = key => {
    if (memory.has(key)) return memory.get(key);
    try { return browser?.localStorage.getItem(key); } catch { return null; }
  };
  const remember = (key, value) => {
    if (!enabled) return;
    memory.set(key, value);
    try { browser?.localStorage.setItem(key, value); } catch { /* Optional analytics storage. */ }
  };
  const send = (event, parameters) => {
    if (!enabled || !browser || !eventNames.has(event)) return;
    try {
      browser.dataLayer ||= [];
      // Clear unused parameters on every event so GTM cannot reuse values from
      // an earlier puzzle when processing an account event (or vice versa).
      const payload = Object.fromEntries(parameterNames.map(name => [name, parameters[name]]));
      browser.dataLayer.push({ ...payload, event });
    } catch { /* Analytics must never interrupt play or account access. */ }
  };

  return {
    openPuzzle(puzzle, { answers, completed = false, profile = 'guest' } = {}) {
      const key = `nc_analytics_v1:puzzle:${encodeURIComponent(profile)}:${encodeURIComponent(puzzle.id)}`;
      const marker = enabled ? read(key) : null;
      let finished = completed || marker === 'completed';
      let started = hasLetters(answers) || marker === 'started';
      let closed = false;
      const parameters = {
        puzzle_id: text(puzzle.id), level_name: text(puzzle.id),
        puzzle_theme: text(puzzle.theme || 'Other'),
        puzzle_difficulty: text(puzzle.difficulty || 'Normal'),
      };
      if (finished) remember(key, 'completed');
      else if (started) {
        remember(key, 'started');
        send('puzzle_resume', parameters);
      }
      return {
        update(nextAnswers, complete) {
          if (closed || finished) return;
          if (!started && hasLetters(nextAnswers)) {
            started = true;
            remember(key, 'started');
            send('level_start', parameters);
          }
          if (started && complete) {
            finished = true;
            remember(key, 'completed');
            send('level_end', { ...parameters, success: true });
          }
        },
        close() { closed = true; },
      };
    },
    accountAuth(event, attempt) {
      if (!enabled || !['sign_up', 'login'].includes(event) || typeof attempt !== 'string' || !attempt) return;
      const key = 'nc_analytics_v1:last_auth';
      if (read(key) === attempt) return;
      remember(key, attempt);
      send(event, { method: 'Google' });
    },
  };
}
