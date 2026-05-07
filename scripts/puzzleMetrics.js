function parseClueNumber(entry) {
  if (typeof entry !== 'string') return null;
  const match = entry.match(/^(\d+)\./);
  return match ? Number(match[1]) : null;
}

function collectWordPathFromStart(grid, cols, rows, startIndex, direction) {
  const indices = [];

  if (direction === 'across') {
    const row = Math.floor(startIndex / cols);
    for (let col = startIndex % cols; col < cols; col++) {
      const idx = row * cols + col;
      if (grid[idx] === '.') break;
      indices.push(idx);
    }
  } else {
    for (let row = Math.floor(startIndex / cols); row < rows; row++) {
      const idx = row * cols + (startIndex % cols);
      if (grid[idx] === '.') break;
      indices.push(idx);
    }
  }

  return indices;
}

export function collectWordPaths(puzzle) {
  const cols = puzzle.size.cols;
  const rows = puzzle.size.rows;
  const grid = puzzle.grid;
  const gridnums = puzzle.gridnums;

  const acrossByNumber = new Map();
  const downByNumber = new Map();

  (puzzle.clues?.across || []).forEach(entry => {
    const number = parseClueNumber(entry);
    if (number !== null) acrossByNumber.set(number, true);
  });

  (puzzle.clues?.down || []).forEach(entry => {
    const number = parseClueNumber(entry);
    if (number !== null) downByNumber.set(number, true);
  });

  const wordPaths = [];

  for (let i = 0; i < gridnums.length; i++) {
    const clueNum = gridnums[i];
    if (!clueNum || grid[i] === '.') continue;

    if (acrossByNumber.has(clueNum)) {
      const indices = collectWordPathFromStart(grid, cols, rows, i, 'across');
      if (indices.length > 0) {
        wordPaths.push({ direction: 'across', clueNum, indices });
      }
    }

    if (downByNumber.has(clueNum)) {
      const indices = collectWordPathFromStart(grid, cols, rows, i, 'down');
      if (indices.length > 0) {
        wordPaths.push({ direction: 'down', clueNum, indices });
      }
    }
  }

  return wordPaths;
}

export function computePuzzleMetrics(puzzle) {
  const rows = puzzle.size.rows;
  const cols = puzzle.size.cols;
  const totalCells = rows * cols;
  const filledCells = puzzle.grid.filter(cell => cell !== '.').length;
  const density = totalCells > 0 ? filledCells / totalCells : 0;

  const paths = collectWordPaths(puzzle);
  const occupancy = new Map();

  for (const path of paths) {
    for (const idx of path.indices) {
      occupancy.set(idx, (occupancy.get(idx) || 0) + 1);
    }
  }

  let intersectionCells = 0;
  let totalIntersections = 0;
  for (const count of occupancy.values()) {
    if (count > 1) {
      intersectionCells++;
      totalIntersections += (count - 1);
    }
  }

  const intersectionsPerWord = paths.map(path => {
    let count = 0;
    for (const idx of path.indices) {
      if ((occupancy.get(idx) || 0) > 1) count++;
    }
    return count;
  });

  const minIntersectionsPerWord = intersectionsPerWord.length > 0
    ? Math.min(...intersectionsPerWord)
    : 0;

  const avgIntersectionsPerWord = intersectionsPerWord.length > 0
    ? intersectionsPerWord.reduce((a, b) => a + b, 0) / intersectionsPerWord.length
    : 0;

  const adjacency = paths.map(() => new Set());
  const indexToWords = new Map();

  paths.forEach((path, wordIdx) => {
    for (const idx of path.indices) {
      if (!indexToWords.has(idx)) indexToWords.set(idx, []);
      indexToWords.get(idx).push(wordIdx);
    }
  });

  for (const wordIndexes of indexToWords.values()) {
    for (let i = 0; i < wordIndexes.length; i++) {
      for (let j = i + 1; j < wordIndexes.length; j++) {
        const a = wordIndexes[i];
        const b = wordIndexes[j];
        adjacency[a].add(b);
        adjacency[b].add(a);
      }
    }
  }

  let connected = true;
  if (paths.length > 1) {
    const visited = new Set();
    const stack = [0];
    while (stack.length > 0) {
      const node = stack.pop();
      if (visited.has(node)) continue;
      visited.add(node);
      for (const next of adjacency[node]) {
        if (!visited.has(next)) stack.push(next);
      }
    }
    connected = visited.size === paths.length;
  }

  return {
    rows,
    cols,
    totalCells,
    filledCells,
    density,
    placedWords: paths.length,
    intersectionCells,
    totalIntersections,
    minIntersectionsPerWord,
    avgIntersectionsPerWord,
    connected
  };
}

export function summarizeMetrics(items) {
  if (items.length === 0) {
    return {
      count: 0,
      avgRows: 0,
      avgCols: 0,
      avgDensity: 0,
      avgPlacedWords: 0,
      avgIntersections: 0,
      avgMinIntersectionsPerWord: 0,
      connectedRate: 0
    };
  }

  const sum = (key) => items.reduce((acc, item) => acc + item[key], 0);

  return {
    count: items.length,
    avgRows: sum('rows') / items.length,
    avgCols: sum('cols') / items.length,
    avgDensity: sum('density') / items.length,
    avgPlacedWords: sum('placedWords') / items.length,
    avgIntersections: sum('totalIntersections') / items.length,
    avgMinIntersectionsPerWord: sum('minIntersectionsPerWord') / items.length,
    connectedRate: items.filter(item => item.connected).length / items.length
  };
}
