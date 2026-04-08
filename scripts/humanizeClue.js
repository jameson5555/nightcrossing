export function humanizeClue(clue) {
    if (!clue) return '';
    let clean = clue.trim();
    
    // Remove typical dictionary prefixes
    clean = clean.replace(/^(A|An|The|To|Any of|Some|Used as|Of or|Relating to) /i, '');
    clean = clean.replace(/^(is|are|was|were) /i, '');
    
    // Clean up potentially missed tag prefixes
    clean = clean.replace(/^(n\t|v\t|adj\t|adv\t)/, '');
    
    clean = clean.trim();
    if (clean.length === 0) return '';
    
    // Ensure capitalization
    clean = clean.charAt(0).toUpperCase() + clean.slice(1);
    
    // Some clues are very long Dictionary entries.
    // Datamuse often separates separate meanings/clauses with semicolons or colons.
    // Instead of cutting off by word count and adding '...', we find the first natural phrase boundary.
    const words = clean.split(/\s+/);
    if (words.length > 8) {
        const match = clean.match(/^([^;:\–\—]+)/);
        if (match && match[1]) {
            clean = match[1].trim();
            // Remove trailing commas if any
            clean = clean.replace(/[,]+$/, '');
        }
    }
    
    return clean;
}
