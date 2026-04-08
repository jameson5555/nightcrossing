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
    
    return clean;
}



