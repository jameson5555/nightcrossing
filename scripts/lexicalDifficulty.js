import { Cromulence, loadWordlist } from 'cromulence';

const COMMON_ZIPF = 4.5;
const RARE_ZIPF = 1.5;
let lexicalDifficultyPromise = null;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeAnswer(answer) {
  return String(answer || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z]/g, '');
}

function roundZipf(zipfFrequency) {
  return Number(zipfFrequency.toFixed(2));
}

export function getFrequencyBand(zipfFrequency) {
  if (!Number.isFinite(zipfFrequency)) return 'unknown';
  if (zipfFrequency >= 4.5) return 'common';
  if (zipfFrequency >= 3.8) return 'familiar';
  if (zipfFrequency >= 3.1) return 'uncommon';
  if (zipfFrequency >= 0) return 'rare';
  return 'obscure';
}

async function getLexicalDifficultyService() {
  if (!lexicalDifficultyPromise) {
    lexicalDifficultyPromise = loadWordlist().then(wordlist => new Cromulence(wordlist));
  }

  return lexicalDifficultyPromise;
}

export function getDefaultLexicalStats() {
  return {
    lexicalDifficultyLoad: 0,
    avgZipfFrequency: 0,
    rareAnswerShare: 0,
    difficultAnswerShare: 0,
    answerCount: 0,
    scoredAnswerCount: 0
  };
}

export async function getLexicalMetadataForAnswer(answer) {
  const normalizedAnswer = normalizeAnswer(answer);
  if (!normalizedAnswer) {
    return {
      zipfFrequency: 0,
      frequencyBand: 'unknown',
      lexicalSource: 'cromulence'
    };
  }

  let lexicalDifficulty;
  try {
    lexicalDifficulty = await getLexicalDifficultyService();
  } catch {
    return {
      zipfFrequency: 0,
      frequencyBand: 'unknown',
      lexicalSource: 'cromulence'
    };
  }

  const info = lexicalDifficulty.info(normalizedAnswer);
  const rawZipf = Number(info?.zipf);
  const zipfFrequency = Number.isFinite(rawZipf) ? rawZipf : RARE_ZIPF;

  return {
    zipfFrequency: roundZipf(zipfFrequency),
    frequencyBand: getFrequencyBand(zipfFrequency),
    lexicalSource: 'cromulence'
  };
}

export async function annotateWordEntry(word) {
  const lexicalMetadata = await getLexicalMetadataForAnswer(word?.answer);
  return {
    ...word,
    ...lexicalMetadata
  };
}

export async function annotateWordEntries(words = []) {
  return Promise.all(words.map(word => annotateWordEntry(word)));
}

export async function computeLexicalStatsForAnswers(answers = []) {
  const normalizedAnswers = answers
    .map(normalizeAnswer)
    .filter(Boolean);

  if (normalizedAnswers.length === 0) {
    return getDefaultLexicalStats();
  }

  let lexicalDifficulty;
  try {
    lexicalDifficulty = await getLexicalDifficultyService();
  } catch {
    return {
      ...getDefaultLexicalStats(),
      answerCount: normalizedAnswers.length
    };
  }

  let totalDifficultyLoad = 0;
  let totalZipfFrequency = 0;
  let rareAnswers = 0;
  let difficultAnswers = 0;

  for (const answer of normalizedAnswers) {
    const metadata = await getLexicalMetadataForAnswer(answer);
    const zipfFrequency = metadata.zipfFrequency;
    const boundedZipf = clamp(zipfFrequency, RARE_ZIPF, COMMON_ZIPF);
    const difficultyLoad = (COMMON_ZIPF - boundedZipf) / (COMMON_ZIPF - RARE_ZIPF);

    totalDifficultyLoad += difficultyLoad;
    totalZipfFrequency += zipfFrequency;
    if (zipfFrequency < 3.7) difficultAnswers++;
    if (zipfFrequency < 3.1) rareAnswers++;
  }

  const answerCount = normalizedAnswers.length;
  const avgZipfFrequency = totalZipfFrequency / answerCount;

  return {
    lexicalDifficultyLoad: totalDifficultyLoad / answerCount,
    avgZipfFrequency,
    rareAnswerShare: rareAnswers / answerCount,
    difficultAnswerShare: difficultAnswers / answerCount,
    answerCount,
    scoredAnswerCount: answerCount
  };
}