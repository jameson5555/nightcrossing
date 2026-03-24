export function getWordAt(index, direction, puzzleData, currentAnswers) {
  if (index === null || index < 0) return null;
  const { size, grid, gridnums, answers: puzzleAnswers } = puzzleData;
  const cols = size.cols;
  
  if (grid[index] === '.') return null;

  let current = index;
  let step = direction === 'across' ? -1 : -cols;
  
  // find start cell
  while (true) {
    let prev = current + step;
    if (prev < 0 || prev >= grid.length || grid[prev] === '.') break;
    if (direction === 'across' && Math.floor(prev / cols) !== Math.floor(current / cols)) break;
    current = prev;
  }
  
  const startCellIndex = current;
  const clueNum = gridnums[startCellIndex];
  
  // find all indices in this word
  const indices = [];
  current = startCellIndex;
  step = direction === 'across' ? 1 : cols;
  while (current < grid.length && grid[current] !== '.') {
    if (direction === 'across' && Math.floor(current / cols) !== Math.floor(startCellIndex / cols)) break;
    indices.push(current);
    current += step;
  }

  const cluesArray = puzzleData.clues[direction];
  const cluePrefix = String(clueNum) + '.';
  const clueIndex = cluesArray ? cluesArray.findIndex(c => c.startsWith(cluePrefix)) : -1;

  let isFilled = true;
  let isCorrect = true;
  let currentWordStr = '';

  for (let i = 0; i < indices.length; i++) {
    const char = currentAnswers ? currentAnswers[indices[i]] : '';
    if (!char) isFilled = false;
    currentWordStr += char || ' ';
  }

  if (clueIndex !== -1 && currentAnswers && puzzleAnswers) {
    const correctAnswer = puzzleAnswers[direction][clueIndex];
    if (currentWordStr !== correctAnswer) {
      isCorrect = false;
    }
  } else {
    isCorrect = false;
  }

  return {
    startCellIndex,
    indices,
    clueNum,
    clueIndex,
    isCorrect,
    isFilled
  };
}

export function getCorrectCells(puzzleData, currentAnswers) {
  const correctIndices = new Set();
  if (!currentAnswers) return correctIndices;
  
  const cols = puzzleData.size.cols;
  
  puzzleData.gridnums.forEach((num, index) => {
    if (num > 0 && puzzleData.grid[index] !== '.') {
      // Check if start of across word
      const prevAcross = index - 1;
      const isStartAcross = prevAcross < 0 || puzzleData.grid[prevAcross] === '.' || Math.floor(prevAcross/cols) !== Math.floor(index/cols);
      if (isStartAcross) {
         const wd = getWordAt(index, 'across', puzzleData, currentAnswers);
         if (wd && wd.isCorrect) {
             wd.indices.forEach(idx => correctIndices.add(idx));
         }
      }

      // Check if start of down word
      const prevDown = index - cols;
      const isStartDown = prevDown < 0 || puzzleData.grid[prevDown] === '.';
      if (isStartDown) {
         const wd = getWordAt(index, 'down', puzzleData, currentAnswers);
         if (wd && wd.isCorrect) {
             wd.indices.forEach(idx => correctIndices.add(idx));
         }
      }
    }
  });

  return correctIndices;
}
