import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { humanizeClue } from './humanizeClue.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const THEMES_FILE = path.join(__dirname, 'themes.json');

async function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchWithRetry(url, retries = 3) {
    for (let i = 0; i < retries; i++) {
        try {
            const res = await fetch(url);
            if (!res.ok) throw new Error(`Status ${res.status}`);
            return await res.json();
        } catch (err) {
            if (i === retries - 1) throw err;
            await delay(500 * (i + 1));
        }
    }
}

async function enrichHints() {
    if (!fs.existsSync(THEMES_FILE)) {
        console.error('themes.json not found!');
        process.exit(1);
    }

    const themes = JSON.parse(fs.readFileSync(THEMES_FILE, 'utf8'));
    let totalUpdated = 0;

    for (const theme of themes) {
        console.log(`\nEnriching theme: ${theme.name}`);
        let themeUpdated = 0;

        for (const wordObj of theme.words) {
            // We'll skip if it has a good hint already (not a synonym fallback or empty)
            if (wordObj.hint && !wordObj.hint.startsWith('Similar to:')) continue;

            const word = wordObj.answer.toLowerCase();
            process.stdout.write(`  Fetching: ${word}... `);

            try {
                // Fetch definitions
                const data = await fetchWithRetry(`https://api.datamuse.com/words?sp=${encodeURIComponent(word)}&md=d&max=1`);
                
                let hint = null;

                if (data && data.length > 0) {
                    const d = data[0];
                    
                    // 1. Look for a second definition that isn't too short or weird
                    if (d.defs && d.defs.length > 1) {
                        for (let i = 1; i < d.defs.length; i++) {
                            const rawDef = d.defs[i];
                            const parts = rawDef.split('\t');
                            const cleanDef = parts.length > 1 ? parts[1].trim() : parts[0].trim();
                            
                            // Skip "construed with" or very short meta-definitions
                            if (cleanDef.toLowerCase().includes('construed with')) continue;
                            if (cleanDef.length < 10) continue;

                            hint = humanizeClue(cleanDef);
                            if (hint) {
                                process.stdout.write(`Found Def[${i}]`);
                                break;
                            }
                        }
                    }
                }

                // 2. Fallback to synonyms if no good definition found
                if (!hint) {
                  const synData = await fetchWithRetry(`https://api.datamuse.com/words?ml=${encodeURIComponent(word)}&max=5`);
                  if (synData && synData.length > 0) {
                      // Filter out the word itself and too long/short ones
                      const filteredSyns = synData
                        .map(s => s.word)
                        .filter(s => s.toLowerCase() !== word.toLowerCase() && s.length > 2)
                        .slice(0, 3);
                      
                      if (filteredSyns.length > 0) {
                          hint = `Similar to: ${filteredSyns.join(', ')}`;
                          process.stdout.write(`Found Synonyms`);
                      }
                  }
                }

                if (hint) {
                    wordObj.hint = hint;
                    themeUpdated++;
                    totalUpdated++;
                } else {
                    process.stdout.write(`No hint found`);
                }
                process.stdout.write('\n');
                
                // Rate limiting protection
                await delay(150); 
            } catch (err) {
                console.error(`\n    Error fetching ${word}:`, err.message);
            }
        }
        console.log(`  Added ${themeUpdated} hints to ${theme.name}`);
        
        // Save after each theme
        fs.writeFileSync(THEMES_FILE, JSON.stringify(themes, null, 2));
    }

    console.log(`\nFinished! Total updated: ${totalUpdated}`);
}

enrichHints();
