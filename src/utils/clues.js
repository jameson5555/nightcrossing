// Strip only the leading clue number. Periods in abbreviations and sentences
// belong to the clue and must remain visible.
export const getClueText = (clue) => typeof clue === 'string'
  ? clue.replace(/^\d+\.\s*/, '')
  : null;
