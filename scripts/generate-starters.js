import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { generateProceduralPuzzle } from './proceduralEngine.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, '../public/data');
const PUZZLES_DIR = path.join(DATA_DIR, 'puzzles');
const INDEX_FILE = path.join(DATA_DIR, 'puzzles.json');

async function generateStarters() {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(PUZZLES_DIR)) fs.mkdirSync(PUZZLES_DIR, { recursive: true });

    // Remove old starter files (NYT-based and dummy ones)
    const oldStarters = ['starter-5x5', 'starter-10x10', 'starter-15x15', 'starter-easy', 'starter-medium', 'starter-hard'];
    for (const id of oldStarters) {
        const f = path.join(PUZZLES_DIR, `${id}.json`);
        if (fs.existsSync(f)) fs.unlinkSync(f);
    }

    const starters = [
        { id: "starter-quick", title: "Quick Play (8 Words)", wordCount: 8 },
        { id: "starter-standard", title: "Standard Challenge (15 Words)", wordCount: 15 },
        { id: "starter-marathon", title: "Marathon Grid (25 Words)", wordCount: 25 }
    ];

    let indexData = [];
    if (fs.existsSync(INDEX_FILE)) {
        indexData = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf-8'));
    }

    // Remove old starters from index
    indexData = indexData.filter(idx => !idx.id.startsWith('starter-'));

    for (const s of starters) {
        console.log(`\n--- Generating ${s.title} ---`);
        const puzzleData = await generateProceduralPuzzle(s.id, s.title, s.wordCount);
        puzzleData.date = "Starter Pack";

        const outFile = path.join(PUZZLES_DIR, `${s.id}.json`);
        fs.writeFileSync(outFile, JSON.stringify(puzzleData, null, 2));

        indexData.push({
            id: puzzleData.id,
            title: puzzleData.title,
            author: puzzleData.author,
            date: puzzleData.date,
            cols: puzzleData.size.cols,
            rows: puzzleData.size.rows
        });
    }

    fs.writeFileSync(INDEX_FILE, JSON.stringify(indexData, null, 2));
    console.log("\nAll starter puzzles generated successfully!");
}

generateStarters();
