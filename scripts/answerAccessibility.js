// Frequency is a guard against piles of obscure answers, not a difficulty label.
// Reviewed compound words can be absent from a corpus (e.g. POTPIE).
export const MIN_UNREVIEWED_ZIPF = 2.5;
export const MAX_RARE_ANSWER_SHARE = 0.5;

export function isAccessibleAnswer(word) {
  if (word?.editorialReviewed === true) return true;
  return Number.isFinite(word?.zipfFrequency) && word.zipfFrequency >= MIN_UNREVIEWED_ZIPF;
}

export function passesAnswerAccessibility(words) {
  if (!words.length || words.some(word => !isAccessibleAnswer(word))) return false;
  const rare = words.filter(word => word.editorialReviewed !== true && word.zipfFrequency < 3.1).length;
  return rare / words.length <= MAX_RARE_ANSWER_SHARE;
}
