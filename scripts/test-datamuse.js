import { humanizeClue } from './humanizeClue.js';

async function test() {
    const word = 'planet';
    const res = await fetch(`https://api.datamuse.com/words?sp=${encodeURIComponent(word)}&md=d&max=1`);
    const data = await res.json();
    console.log('Data:', JSON.stringify(data, null, 2));

    if (data && data.length > 0) {
        const d = data[0];
        console.log('Defs length:', d.defs?.length);
        if (d.defs && d.defs.length > 1) {
            const rawDef = d.defs[1];
            console.log('Raw Def 1:', rawDef);
            const parts = rawDef.split('\t');
            const cleanDef = parts.length > 1 ? parts[1].trim() : parts[0].trim();
            const hint = humanizeClue(cleanDef);
            console.log('Clean Hint:', hint);
        }
    }
}

test();
