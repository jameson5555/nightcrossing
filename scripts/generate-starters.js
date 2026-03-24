import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { generateThemedPuzzle, THEMES } from './proceduralEngine.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, '../public/data');
const PUZZLES_DIR = path.join(DATA_DIR, 'puzzles');
const INDEX_FILE = path.join(DATA_DIR, 'puzzles.json');

function generateStarters() {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(PUZZLES_DIR)) fs.mkdirSync(PUZZLES_DIR, { recursive: true });

    // Remove old starter files
    const oldIds = ['starter-5x5', 'starter-10x10', 'starter-15x15', 'starter-easy', 'starter-medium', 'starter-hard', 'starter-quick', 'starter-standard', 'starter-marathon'];
    for (const id of oldIds) {
        const f = path.join(PUZZLES_DIR, `${id}.json`);
        if (fs.existsSync(f)) fs.unlinkSync(f);
    }

    let indexData = [];
    if (fs.existsSync(INDEX_FILE)) {
        indexData = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf-8'));
    }
    // Remove old starters from index
    indexData = indexData.filter(idx => !idx.id.startsWith('starter-'));

    // Generate one puzzle per theme
    const starters = THEMES.slice(0, 4).map((theme, i) => ({
        id: `starter-${theme.name.toLowerCase().replace(/[^a-z]/g, '-')}`,
        theme
    }));

    for (const s of starters) {
        console.log(`\n--- Generating ${s.theme.name} Starter ---`);
        const puzzleData = generateThemedPuzzle(s.id, s.theme);
        puzzleData.date = "Starter Pack";

        const outFile = path.join(PUZZLES_DIR, `${s.id}.json`);
        fs.writeFileSync(outFile, JSON.stringify(puzzleData, null, 2));

        indexData.push({
            id: puzzleData.id,
            title: puzzleData.title,
            author: puzzleData.author,
            date: puzzleData.date,
            cols: puzzleData.size.cols,
            rows: puzzleData.size.rows,
            theme: puzzleData.theme
        });
        console.log(`Created: ${puzzleData.title} (${puzzleData.size.cols}x${puzzleData.size.rows})`);
    }

    fs.writeFileSync(INDEX_FILE, JSON.stringify(indexData, null, 2));
    console.log("\nAll themed starter puzzles generated!");
}

generateStarters();
