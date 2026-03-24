import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, '../public/data');
const PUZZLES_DIR = path.join(DATA_DIR, 'puzzles');
const INDEX_FILE = path.join(DATA_DIR, 'puzzles.json');

// Fetch real past puzzles to act as the starter pack
// NYT puzzles get progressively harder throughout the week.
// Monday = Easy, Wednesday = Medium, Friday = Hard
const starterUrls = [
    { id: "starter-easy", displayDate: "Easy (Monday) Starter", url: "https://raw.githubusercontent.com/doshea/nyt_crosswords/master/2011/01/03.json" }, 
    { id: "starter-medium", displayDate: "Medium (Wednesday) Starter", url: "https://raw.githubusercontent.com/doshea/nyt_crosswords/master/2011/01/05.json" }, 
    { id: "starter-hard", displayDate: "Hard (Friday) Starter", url: "https://raw.githubusercontent.com/doshea/nyt_crosswords/master/2011/01/07.json" }  
];

async function generateStarters() {
    let indexData = [];
    if (fs.existsSync(INDEX_FILE)) {
        indexData = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf-8'));
    }
    
    // Remove the old dummy starters from the index if they exist
    indexData = indexData.filter(idx => !idx.id.startsWith('starter-') || ['starter-easy', 'starter-medium', 'starter-hard'].includes(idx.id));

    for (const starter of starterUrls) {
        try {
            const res = await fetch(starter.url);
            if (!res.ok) throw new Error("Failed to fetch");
            const puzzleData = await res.json();
            
            puzzleData.id = starter.id;
            puzzleData.date = starter.displayDate;
            
            const outFile = path.join(PUZZLES_DIR, `${starter.id}.json`);
            fs.writeFileSync(outFile, JSON.stringify(puzzleData, null, 2));
            
            if (!indexData.find(idx => idx.id === starter.id)) {
                indexData.push({
                    id: puzzleData.id,
                    title: puzzleData.title || `Classic Puzzle`,
                    author: puzzleData.author || "Unknown",
                    date: puzzleData.date,
                    cols: puzzleData.size.cols,
                    rows: puzzleData.size.rows
                });
            }
        } catch (e) {
            console.error(`Failed to generate ${starter.id}:`, e);
        }
    }

    fs.writeFileSync(INDEX_FILE, JSON.stringify(indexData, null, 2));
    console.log("Real NYT Starter puzzles successfully fetched and indexed!");
}

generateStarters();
