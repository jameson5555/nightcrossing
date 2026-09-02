import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { analyzeThemeReadiness } from '../scripts/preflight-generation.js';
import { scoreWordForTheme } from '../scripts/proceduralEngine.js';

function word(index, { hint = 'Helpful hint', source = 'seed' } = {}) {
  const answers = [
    'APPLE', 'BREAD', 'CREAM', 'DISH', 'EATS', 'FLOUR',
    'GRAPE', 'HERBS', 'ICING', 'JELLY', 'KNIFE', 'LEMON',
    'MELON', 'NOODLE', 'OLIVE', 'PASTA', 'QUICHE', 'ROAST'
  ];
  return {
    answer: answers[index],
    clue: `Kitchen food item number ${index}`,
    hint,
    source,
    themeScore: 1.5
  };
}

test('treats low pool hint coverage as an advisory when generation capacity is ample', () => {
  const theme = {
    name: 'Food & Cooking',
    words: Array.from({ length: 18 }, (_, index) => word(index, {
      hint: index < 8 ? 'Helpful hint' : ''
    }))
  };

  const report = analyzeThemeReadiness(theme, new Set(), 1, {
    minFutureRunwayBatches: 0
  });

  assert.equal(report.isReady, true);
  assert.deepEqual(report.readinessFailures, []);
  assert.ok(report.readinessAdvisories.some(item => item.startsWith('hint coverage')));
});

test('matches theme signals by token prefix without substring false positives', () => {
  const natureFalsePositive = scoreWordForTheme('Nature & Wilderness', {
    answer: 'TRAM',
    clue: 'Streetcar',
    hint: 'Vehicle running on rails',
    source: 'ml',
    themeScore: 1.5
  });
  const historyFalsePositive = scoreWordForTheme('History & Civilization', {
    answer: 'PAINKILLER',
    clue: 'Medicine that relieves pain',
    hint: 'Analgesic agent',
    source: 'ml',
    themeScore: 1.5
  });
  const natureMatch = scoreWordForTheme('Nature & Wilderness', {
    answer: 'WOODLAND',
    clue: 'Land covered with trees',
    hint: 'Forest habitat',
    source: 'seed',
    themeScore: 1.5
  });

  assert.ok(natureFalsePositive < 0.75);
  assert.ok(historyFalsePositive < 0.75);
  assert.ok(natureMatch >= 1.15);
});

test('does not use a theme-related hint to excuse an unrelated displayed clue', () => {
  assert.ok(scoreWordForTheme('Nature & Wilderness', {
    answer: 'VEIN',
    clue: 'Blood vessel that transports blood to the heart',
    hint: 'Stripe in materials such as wood or marble',
    source: 'ml',
    themeScore: 1.5
  }) < 0.75);

  assert.ok(scoreWordForTheme('History & Civilization', {
    answer: 'DIKE',
    clue: 'Formalwear or other fashionable dress',
    hint: 'Greek goddess of justice',
    source: 'ml',
    themeScore: 1.5
  }) < 0.75);

  assert.ok(scoreWordForTheme('Nature & Wilderness', {
    answer: 'RESPONSE',
    clue: 'Answer or reply, or something in the nature of an answer or reply',
    hint: 'Act of responding or replying',
    source: 'rel_trg',
    themeScore: 1.5
  }) < 0.75);
});

test('does not use a thematic answer to excuse the wrong dictionary sense', () => {
  for (const [theme, entry] of [
    ['Food & Cooking', {
      answer: 'GRILL',
      clue: 'Criss-cross pieces that separate panes of glass in a window'
    }],
    ['Animals & Wildlife', {
      answer: 'FLOCKS',
      clue: 'Large number of people'
    }],
    ['Home & Tools', {
      answer: 'HOTEL',
      clue: 'Public house or pub'
    }]
  ]) {
    assert.ok(scoreWordForTheme(theme, {
      ...entry,
      hint: '',
      source: 'ml',
      themeScore: 1.5
    }) < 0.75);
  }
});

test('keeps every successor pool ready with two future batches of runway', () => {
  const successorNames = [
    'Arts & Crafts',
    'Books & Reading',
    'Science & Discovery',
    'Games & Puzzles',
    'Theater & Film',
    'Clothing & Fashion'
  ];
  const candidateThemes = JSON.parse(fs.readFileSync(
    new URL('../scripts/candidate-themes.json', import.meta.url),
    'utf8'
  ));
  const rotation = JSON.parse(fs.readFileSync(
    new URL('../scripts/theme-rotation.json', import.meta.url),
    'utf8'
  ));

  const weatherSlot = rotation.slots.find(slot => slot.currentTheme === 'Weather & Climate');
  assert.equal(weatherSlot?.nextTheme, 'Science & Discovery');
  assert.deepEqual(rotation.candidates, successorNames.filter(name => name !== 'Science & Discovery'));

  for (const themeName of successorNames) {
    const theme = candidateThemes.find(candidate => candidate.name === themeName);
    assert.ok(theme, `Missing successor pool: ${themeName}`);

    const report = analyzeThemeReadiness(theme, new Set(), 3, {
      minFutureRunwayBatches: 2
    });
    assert.equal(report.isReady, true, `${themeName}: ${report.readinessFailures.join(', ')}`);
  }
});
