import test from 'node:test';
import assert from 'node:assert/strict';
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
