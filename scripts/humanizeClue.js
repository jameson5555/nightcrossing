export function humanizeClue(clue) {
    if (!clue) return '';
    let clean = clue.trim();
    
    // Remove typical dictionary prefixes
    clean = clean.replace(/^(A|An|The|To|Any of|Some|Used as|Of or|Relating to) /i, '');
    clean = clean.replace(/^(is|are|was|were) /i, '');
    
    // Remove parentheticals often found in dictionary entries
    clean = clean.replace(/\s*[\[\(][^\]\)]*[\]\)]\s*/g, ' ');
    
    // Clean up potentially missed tag prefixes
    clean = clean.replace(/^(n\t|v\t|adj\t|adv\t)/, '');
    
    clean = clean.trim();
    if (clean.length === 0) return '';
    
    // Fix space before final period
    clean = clean.replace(/\s+\.$/, '.');
    
    // Ensure capitalization
    clean = clean.charAt(0).toUpperCase() + clean.slice(1);
    
    // Handle very long entries by finding natural phrase boundaries
    const words = clean.split(/\s+/);
    if (words.length > 8) {
        // First try strong separators: semicolon, colon, dash
        const strongMatch = clean.match(/^([^;:\–\—]+)/);
        if (strongMatch && strongMatch[1].split(/\s+/).length < words.length) {
            clean = strongMatch[1].trim();
        } 
        
        // If still long, try cutting at the first comma if the first part is at least 3 words
        const currentWords = clean.split(/\s+/);
        if (currentWords.length > 10) {
            const commaMatch = clean.match(/^([^,]{10,100}),/);
            if (commaMatch && commaMatch[1]) {
                clean = commaMatch[1].trim();
            }
        }

        // Final safety cutoff: if still > 12 words, just take the first 12
        const finalWords = clean.split(/\s+/);
        if (finalWords.length > 12) {
            clean = finalWords.slice(0, 12).join(' ').trim();
        }
    }
    
    // CRITICAL: Remove trailing logic words that make a clue feel truncated
    clean = clean.replace(/\s+(and|or|is|for|with|of|e\.g\.|etc\.)$/i, '');
    
    // Remove trailing punctuation that might look weird after truncation
    clean = clean.replace(/[,;:\–\—\s]+$/, '');
    
    // Additional check: if a clue is still incredibly long (> 120 chars), it's probably noise
    if (clean.length > 100) return ''; 

    return clean;
}


