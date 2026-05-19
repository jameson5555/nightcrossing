import { getMetrics } from './scripts/puzzleMetrics.js';
import fs from 'fs';
import path from 'path';

const puzzlesList = JSON.parse(fs.readFileSync('public/data/puzzles.json', 'utf8'));
const puzzles = puzzlesList.map(p => {
  const filePath = path.join('public/data/puzzles', \`\${p.id}.json\`);
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
});

const summary = {};
const easyTable = [];

puzzles.forEach(p => {
  const m = getMetrics(p);
  const diff = p.difficulty;
  
  if (!summary[diff]) {
    summary[diff] = { count: 0, placedWords: 0, longWordCount: 0, veryLongWordCount: 0, totalLen: 0 };
  }
  
  summary[diff].count++;
  summary[diff].placedWords += m.placedWords;
  summary[diff].longWordCount += m.longWordCount;
  summary[diff].veryLongWordCount += m.veryLongWordCount;
  summary[diff].totalLen += m.avgAnswerLength;

  if (diff === 'Easy') {
    easyTable.push({
      id: p.id,
      placedWords: m.placedWords,
      longWordCount: m.longWordCount,
      veryLongWordCount: m.veryLongWordCount,
      avgAnswerLength: m.avgAnswerLength.toFixed(2)
    });
  }
});

console.log('1) Difficulty counts:');
Object.entries(summary).forEach(([k, v]) => console.log(\`  \${k}: \${v.count}\`));

console.log('\\n2) Easy puzzle details:');
easyTable.forEach(row => console.log(\`  \${row.id}: placedWords=\${row.placedWords}, longWordCount=\${row.longWordCount}, veryLongWordCount=\${row.veryLongWordCount}, avgLen=\${row.avgAnswerLength}\`));

console.log('\\n3) Per-difficulty averages:');
Object.entries(summary).forEach(([k, v]) => {
  console.log(\`  \${k}: placedWords=\${(v.placedWords/v.count).toFixed(2)}, longWordCount=\${(v.longWordCount/v.count).toFixed(2)}, veryLongWordCount=\${(v.veryLongWordCount/v.count).toFixed(2)}, avgLen=\${(v.totalLen/v.count).toFixed(2)}\`);
});
