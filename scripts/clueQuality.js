const BANNED_CONTENT_REGEX = /\b(surname|surnames|given\s+name|given\s+names|male\s+given\s+name|male\s+given\s+names|female\s+given\s+name|female\s+given\s+names|unisex\s+given\s+name|unisex\s+given\s+names|legal\s+balls|first\s+name|first\s+names|last\s+name|last\s+names)\b/i;

const PROFANITY_REGEX = /\b(fuck|fucking|shit|shitty|bitch|asshole|cunt|slut|motherfucker|dickhead|porn|pornography|masturbat|flatus|anal\s+sex|oral\s+sex)\b/i;

const LOW_QUALITY_REGEXES = [
  /\b(initialism|acronym|abbreviation|abbr\.)\b/i,
  /\b(alternative\s+form|obsolete\s+form|obsolete\s+spelling|dated\s+spelling|misspelling\s+of|clipping\s+of|ellipsis\s+of|plural\s+of|transliteration\s+of|diminutive\s+of)\b/i,
  /\bsimilar\s+to\s*:/i,
  /\bunincorporated\s+community\b/i,
  /\bbarangay\b/i,
  /theme-related\s+term\s+in\b/i,
  /commonly\s+associated\s+with\b/i,
  /\bkey\s+idea\s*:/i,
  /\b(television\s+series|episode\s+\d+|season\s+\d+|syndicated)\b/i,
  /\b(commune\s+of|county\b|capital\s+city\s+of|north\s+korea)\b/i
];

const REPETITIVE_REENTRY_REGEXES = [
  /\bagain\b/i,
  /\banew\b/i,
  /\bafresh\b/i,
  /\bonce\s+more\b/i,
  /\byet\s+again\b/i,
  /\bone\s+more\s+time\b/i,
  /\bfor\s+(?:the\s+)?(?:second|another)\s+time\b/i
];

const COMPLEX_CLUE_REGEXES = [
  /[;:]/,
  /\([^)]*\)/,
  /,.+,/,
  /\b(archaic|obsolete|technical\s+term|mythological)\b/i
];

function normalized(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

const HINT_STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'that', 'this', 'into', 'over', 'under',
  'about', 'often', 'used', 'type', 'kind', 'form', 'term', 'word', 'words',
  'idea', 'ideas', 'related', 'concept', 'concepts', 'similar', 'another'
]);

function contentTokens(str) {
  return (str || '')
    .toLowerCase()
    .match(/[a-z0-9]+/g)
    ?.filter(token => token.length >= 3 && !HINT_STOPWORDS.has(token)) || [];
}

function ngrams(str, size = 4) {
  const compact = normalized(str);
  if (compact.length < size) return [];

  const grams = [];
  for (let i = 0; i <= compact.length - size; i++) {
    grams.push(compact.slice(i, i + size));
  }
  return grams;
}

function hintEchoesClue(clue, hint) {
  if (!hint) return false;

  const clueNorm = normalized(clue);
  const hintNorm = normalized(hint);
  if (!clueNorm || !hintNorm) return false;
  if (clueNorm === hintNorm) return true;

  if (clueNorm.length >= 8 && hintNorm.length >= 8) {
    if (clueNorm.includes(hintNorm) || hintNorm.includes(clueNorm)) {
      return true;
    }
  }

  const clueTokens = contentTokens(clue);
  const clueTokenSet = new Set(clueTokens);
  const hintTokens = contentTokens(hint);
  if (hintTokens.length > 0) {
    const shared = hintTokens.filter(token => clueTokenSet.has(token));
    const sharedRatio = shared.length / hintTokens.length;
    const clueCoverage = clueTokens.length > 0 ? shared.length / clueTokens.length : 0;
    if ((shared.length >= 3 && sharedRatio >= 0.7) || (shared.length >= 2 && (sharedRatio >= 0.6 || clueCoverage >= 0.6))) {
      return true;
    }
  }

  const clueNgrams = new Set(ngrams(clue, 4));
  const hintNgrams = ngrams(hint, 4);
  if (hintNgrams.length > 0) {
    const overlap = hintNgrams.filter(gram => clueNgrams.has(gram)).length;
    const overlapRatio = overlap / hintNgrams.length;
    if (overlapRatio >= 0.66) {
      return true;
    }
  }

  return false;
}

function isRepetitiveReentryClue(answer, clue) {
  const answerUpper = String(answer || '').trim().toUpperCase();
  const clueText = String(clue || '').trim();
  if (!answerUpper || !clueText) return false;
  if (!answerUpper.startsWith('RE') || answerUpper.length < 5) return false;

  return REPETITIVE_REENTRY_REGEXES.some(regex => regex.test(clueText));
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

export function isComplexClueText(text) {
  const value = text || '';
  return COMPLEX_CLUE_REGEXES.some(regex => regex.test(value));
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

  if (clue.length < 8 || clue.length > 96) {
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

  if (isComplexClueText(clue)) {
    return { ok: false, reason: 'clue-complexity' };
  }

  if (isRepetitiveReentryClue(answer, clue)) {
    return { ok: false, reason: 'repetitive-reentry-clue' };
  }

  if (hasAnswerLeakage(answer, clue)) {
    return { ok: false, reason: 'answer-leakage' };
  }

  if (hint && hintEchoesClue(clue, hint)) {
    return { ok: false, reason: 'hint-duplicate' };
  }

  return { ok: true, reason: null };
}
