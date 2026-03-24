import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { generateLayout } from 'crossword-layout-generator';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, '../public/data');
const PUZZLES_DIR = path.join(DATA_DIR, 'puzzles');
const INDEX_FILE = path.join(DATA_DIR, 'puzzles.json');

// Free dictionary API to grab words and definitions
async function fetchRandomWordDef() {
    try {
        const res = await fetch('https://random-word-api.herokuapp.com/word');
        const [word] = await res.json();
        
        // Lookup definition 
        const defRes = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${word}`);
        if (!defRes.ok) return null;
        const definitions = await defRes.json();
        
        const meaning = definitions[0]?.meanings[0]?.definitions[0]?.definition;
        if (meaning) {
            return { answer: word.replace(/[^A-Za-z]/g, '').toLowerCase(), clue: meaning };
        }
    } catch (e) { }
    return null;
}

export async function generateProceduralPuzzle(id, title, targetWordCount) {
    console.log(`Generating procedural puzzle: ${title} (${targetWordCount} words)...`);
    
    let words = [];
    while (words.length < targetWordCount) {
        const item = await fetchRandomWordDef();
        if (item && item.answer.length >= 3 && item.answer.length <= 10) {
            // Avoid duplicates
            if (!words.find(w => w.answer === item.answer)) {
                words.push(item);
                console.log(`+ ${item.answer}: ${item.clue}`);
            }
        }
    }

    // Generator can be chatty, so mask its logs if possible
    const layout = generateLayout(words);

    const cols = layout.cols;
    const rows = layout.rows;
    const grid = Array(cols * rows).fill('.');
    const gridnums = Array(cols * rows).fill(0);
    
    // Write characters to grid
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const char = layout.table[r][c];
            if (char && char !== '-') {
                grid[r * cols + c] = char.toUpperCase();
            }
        }
    }

    const clues = { across: [], down: [] };
    const answers = { across: [], down: [] };

    // Format the result data
    layout.result.forEach(item => {
        // startx and starty are 1-indexed
        const x = item.startx - 1;
        const y = item.starty - 1;
        const index = y * cols + x;
        
        // Assign grid number
        gridnums[index] = item.position;
        
        const prefix = `${item.position}. `;
        if (item.orientation === 'across') {
            clues.across.push(prefix + item.clue);
            answers.across.push(item.answer.toUpperCase());
        } else {
            clues.down.push(prefix + item.clue);
            answers.down.push(item.answer.toUpperCase());
        }
    });

    return {
        id,
        title,
        author: "Procedural Engine",
        date: id.startsWith('starter') ? "Starter Pack" : id,
        size: { cols, rows },
        grid,
        gridnums,
        clues,
        answers
    };
}
