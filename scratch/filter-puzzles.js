import fs from 'fs';
import path from 'path';

const puzzlesFile = '/Users/jm/Dropbox/Sites/jamesonmacarthur.com/nightcrossing/public/data/puzzles.json';
const puzzles = JSON.parse(fs.readFileSync(puzzlesFile, 'utf8'));

const filteredPuzzles = puzzles.filter(p => {
    const volMatch = p.id.match(/-vol(\d+)$/);
    if (volMatch) {
        const vol = parseInt(volMatch[1]);
        return vol < 4;
    }
    return true;
});

fs.writeFileSync(puzzlesFile, JSON.stringify(filteredPuzzles, null, 2));
console.log(`Filtered puzzles.json. Reduced from ${puzzles.length} to ${filteredPuzzles.length} entries.`);
