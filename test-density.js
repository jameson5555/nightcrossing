import { generateLayout } from 'crossword-layout-generator';

// Strategy: Generate multiple layouts, pick the densest one, then trim whitespace
const testWords = [
  { answer: "telescope", clue: "Views distant stars" },
  { answer: "planet", clue: "Orbits a star" },
  { answer: "comet", clue: "Icy body with a tail" },
  { answer: "asteroid", clue: "Rocky space object" },
  { answer: "nebula", clue: "Cloud of gas in space" },
  { answer: "orbit", clue: "Path around a celestial body" },
  { answer: "galaxy", clue: "Collection of billions of stars" },
  { answer: "eclipse", clue: "Shadowing of one body by another" },
  { answer: "lunar", clue: "Related to the moon" },
  { answer: "solar", clue: "Related to the sun" },
  { answer: "meteor", clue: "Shooting star" },
  { answer: "saturn", clue: "Ringed planet" },
  { answer: "venus", clue: "Second planet from the sun" },
  { answer: "mars", clue: "The red planet" },
  { answer: "star", clue: "Luminous celestial body" },
  { answer: "nova", clue: "Exploding star event" },
  { answer: "cosmos", clue: "The universe as a whole" },
  { answer: "quasar", clue: "Extremely luminous galactic nucleus" },
  { answer: "pulsar", clue: "Rotating neutron star" },
  { answer: "crater", clue: "Bowl-shaped depression" },
  { answer: "plasma", clue: "Fourth state of matter found in stars" },
  { answer: "zenith", clue: "Point directly overhead" },
  { answer: "apogee", clue: "Farthest point in orbit" },
  { answer: "rocket", clue: "Vehicle that uses thrust to fly" },
  { answer: "probe", clue: "Unmanned space explorer" },
  { answer: "titan", clue: "Saturn's largest moon" },
  { answer: "europa", clue: "Jupiter's icy moon" },
  { answer: "pluto", clue: "Demoted dwarf planet" },
  { answer: "rings", clue: "Saturn's famous feature" },
  { answer: "stellar", clue: "Relating to stars" },
  // Add filler short words for density
  { answer: "sun", clue: "Our star" },
  { answer: "sky", clue: "Above us" },
  { answer: "gas", clue: "Not solid or liquid" },
  { answer: "ice", clue: "Frozen water" },
  { answer: "red", clue: "Color of Mars" },
  { answer: "air", clue: "We breathe it" },
  { answer: "arc", clue: "Curved path" },
  { answer: "era", clue: "Period of time" },
  { answer: "orb", clue: "Sphere" },
  { answer: "ray", clue: "Beam of light" },
  { answer: "dim", clue: "Not bright" },
  { answer: "ion", clue: "Charged particle" },
  { answer: "axe", clue: "Cutting tool" },
  { answer: "ore", clue: "Metal-bearing rock" },
  { answer: "gap", clue: "Space between" },
];

function densityScore(layout) {
  let filled = 0;
  const total = layout.rows * layout.cols;
  for (let r = 0; r < layout.rows; r++) {
    for (let c = 0; c < layout.cols; c++) {
      if (layout.table[r][c] !== '-') filled++;
    }
  }
  return filled / total;
}

// Run N attempts with shuffled word order, pick densest
let bestLayout = null;
let bestDensity = 0;

for (let attempt = 0; attempt < 50; attempt++) {
  // Shuffle words
  const shuffled = [...testWords].sort(() => Math.random() - 0.5);
  const layout = generateLayout(shuffled);
  const d = densityScore(layout);
  if (d > bestDensity) {
    bestDensity = d;
    bestLayout = layout;
  }
}

console.log(`Best density after 50 attempts: ${(bestDensity*100).toFixed(1)}%`);
console.log(`Grid: ${bestLayout.cols}x${bestLayout.rows}`);
console.log(`Words placed: ${bestLayout.result.length}/${testWords.length}`);
console.log();

// Print
for (let r = 0; r < bestLayout.rows; r++) {
  let line = '';
  for (let c = 0; c < bestLayout.cols; c++) {
    const ch = bestLayout.table[r][c];
    line += ch === '-' ? '█' : ch.toUpperCase();
  }
  console.log(line);
}
