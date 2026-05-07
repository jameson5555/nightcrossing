const BANNED_CONTENT_REGEX = /\b(surname|surnames|given\s+name|given\s+names|male\s+given\s+name|male\s+given\s+names|female\s+given\s+name|female\s+given\s+names|unisex\s+given\s+name|unisex\s+given\s+names|legal\s+balls|first\s+name|first\s+names|last\s+name|last\s+names)\b/i;

const PROFANITY_REGEX = /\b(fuck|fucking|shit|shitty|bitch|asshole|cunt|slut|motherfucker|dickhead)\b/i;

const LOW_QUALITY_REGEXES = [
  /\b(initialism|acronym|abbreviation|abbr\.)\b/i,
  /\b(alternative\s+form|obsolete\s+form|obsolete\s+spelling|dated\s+spelling|misspelling\s+of|clipping\s+of|ellipsis\s+of|plural\s+of|transliteration\s+of|diminutive\s+of)\b/i,
  /\bsimilar\s+to\s*:/i,
  /\bunincorporated\s+community\b/i,
  /\bbarangay\b/i
];

function normalized(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function containsBannedContent(text) {
  return BANNED_CONTENT_REGEX.test(text || '');
}

export function containsProfanity(text) {
  return PROFANITY_REGEX.test(text || '');
}

export function isLowQualityClueText(text) {
  const value = text || '';
  return LOW_QUALITY_REGEXES.some(regex => regex.test(value));
}

export function hasAnswerLeakage(answer, clue) {
  const answerLower = (answer || '').toLowerCase();
  const clueLower = (clue || '').toLowerCase();
  if (!answerLower || !clueLower) return false;

  const escapedAnswer = answerLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const exactRegex = new RegExp(`\\b${escapedAnswer}\\b`, 'i');
  if (exactRegex.test(clueLower)) return true;

  const clueWords = clueLower.match(/\b\w+\b/g) || [];
  for (const word of clueWords) {
    if (word.startsWith(answerLower) && word.length > answerLower.length) {
      const suffix = word.substring(answerLower.length);
      if (/^(s|es|ed|ing|er|est)$/.test(suffix)) return true;
    }

    if (answerLower.endsWith('e') && answerLower.length > 3) {
      const base = answerLower.slice(0, -1);
      if (word.startsWith(base) && word.length > base.length) {
        const suffix = word.substring(base.length);
        if (/^(ing|ed|er|est)$/.test(suffix)) return true;
      }
    }
  }

  return false;
}

export function isWordEntryAcceptable(entry) {
  const answer = (entry?.answer || '').toString().trim();
  const clue = (entry?.clue || '').toString().trim();
  const hint = (entry?.hint || '').toString().trim();

  if (!/^[A-Z]{3,15}$/.test(answer.toUpperCase())) {
    return { ok: false, reason: 'invalid-answer' };
  }

  if (containsBannedContent(answer) || containsProfanity(answer)) {
    return { ok: false, reason: 'invalid-answer' };
  }

  if (clue.length < 8 || clue.length > 120) {
    return { ok: false, reason: 'invalid-clue-length' };
  }

  if (containsBannedContent(clue) || containsBannedContent(hint)) {
    return { ok: false, reason: 'banned-content' };
  }

  if (containsProfanity(clue) || containsProfanity(hint)) {
    return { ok: false, reason: 'profanity' };
  }

  if (isLowQualityClueText(clue) || isLowQualityClueText(hint)) {
    return { ok: false, reason: 'low-quality' };
  }

  if (hasAnswerLeakage(answer, clue)) {
    return { ok: false, reason: 'answer-leakage' };
  }

  if (hint && normalized(clue) === normalized(hint)) {
    return { ok: false, reason: 'hint-duplicate' };
  }

  return { ok: true, reason: null };
}
