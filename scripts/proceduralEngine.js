import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { generateLayout } from 'crossword-layout-generator';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, '../public/data');
const PUZZLES_DIR = path.join(DATA_DIR, 'puzzles');
const INDEX_FILE = path.join(DATA_DIR, 'puzzles.json');

// ─── Theme Database ────────────────────────────────────────────────────────
const THEMES = [
  {
    name: "Space & Astronomy",
    words: [
      { answer: "TELESCOPE", clue: "Instrument for viewing distant stars" },
      { answer: "PLANET", clue: "Body that orbits a star" },
      { answer: "COMET", clue: "Icy body with a glowing tail" },
      { answer: "ASTEROID", clue: "Rocky body orbiting the sun" },
      { answer: "NEBULA", clue: "Cloud of gas and dust in space" },
      { answer: "ORBIT", clue: "Curved path around a celestial body" },
      { answer: "GALAXY", clue: "Collection of billions of stars" },
      { answer: "ECLIPSE", clue: "When one celestial body blocks another" },
      { answer: "LUNAR", clue: "Relating to the moon" },
      { answer: "SOLAR", clue: "Relating to the sun" },
      { answer: "METEOR", clue: "A shooting star" },
      { answer: "SATURN", clue: "Sixth planet, known for its rings" },
      { answer: "VENUS", clue: "Second planet from the sun" },
      { answer: "MARS", clue: "The red planet" },
      { answer: "STAR", clue: "Luminous ball of gas" },
      { answer: "NOVA", clue: "Sudden brightening of a star" },
      { answer: "COSMOS", clue: "The entire universe" },
      { answer: "QUASAR", clue: "Extremely luminous galactic center" },
      { answer: "PULSAR", clue: "Rapidly rotating neutron star" },
      { answer: "CRATER", clue: "Bowl-shaped depression on a surface" },
      { answer: "PLASMA", clue: "Superheated state of matter in stars" },
      { answer: "ZENITH", clue: "Highest point in the sky directly above" },
      { answer: "ROCKET", clue: "Vehicle propelled by thrust" },
      { answer: "PROBE", clue: "Unmanned spacecraft for exploration" },
      { answer: "TITAN", clue: "Saturn's largest moon" },
      { answer: "PLUTO", clue: "Dwarf planet beyond Neptune" },
      { answer: "RINGS", clue: "Saturn's famous orbiting feature" },
      { answer: "DUST", clue: "Fine particles found in nebulae" },
      { answer: "VOID", clue: "Empty space between galaxies" },
      { answer: "BEAM", clue: "Concentrated ray of light" },
      { answer: "AXIS", clue: "Line a planet rotates around" },
      { answer: "CORE", clue: "Center of a planet or star" },
      { answer: "HALO", clue: "Ring of light around a celestial body" },
      { answer: "DAWN", clue: "First light of day" },
      { answer: "DUSK", clue: "Last light before night" },
    ]
  },
  {
    name: "Food & Cooking",
    words: [
      { answer: "SPATULA", clue: "Flat utensil for flipping" },
      { answer: "SIMMER", clue: "Cook just below boiling" },
      { answer: "BLANCH", clue: "Briefly boil then ice-bath" },
      { answer: "SAUTEE", clue: "Quick-fry in a little fat" },
      { answer: "BRAISE", clue: "Slow-cook in liquid" },
      { answer: "MINCE", clue: "Chop very finely" },
      { answer: "WHISK", clue: "Beat rapidly to mix air in" },
      { answer: "GRATER", clue: "Kitchen tool with sharp holes" },
      { answer: "FENNEL", clue: "Herb with a licorice flavor" },
      { answer: "THYME", clue: "Fragrant Mediterranean herb" },
      { answer: "BASIL", clue: "Key herb in pesto" },
      { answer: "CLOVE", clue: "Aromatic dried flower bud" },
      { answer: "CUMIN", clue: "Earthy spice used in chili" },
      { answer: "OLIVE", clue: "Mediterranean fruit for oil" },
      { answer: "FLOUR", clue: "Ground grain for baking" },
      { answer: "YEAST", clue: "Living organism that makes bread rise" },
      { answer: "KNEAD", clue: "Work dough with your hands" },
      { answer: "BROIL", clue: "Cook under direct high heat" },
      { answer: "GLAZE", clue: "Shiny coating on pastries" },
      { answer: "ZEST", clue: "Grated citrus peel" },
      { answer: "DICE", clue: "Cut into small cubes" },
      { answer: "BASTE", clue: "Pour juices over roasting meat" },
      { answer: "PUREE", clue: "Blend until smooth" },
      { answer: "STOCK", clue: "Flavorful liquid base for soups" },
      { answer: "ROUX", clue: "Flour-fat mixture for thickening" },
      { answer: "SEAR", clue: "Brown meat at high heat" },
      { answer: "SAGE", clue: "Herb common in stuffing" },
      { answer: "SALT", clue: "Most common seasoning" },
      { answer: "PEEL", clue: "Remove the skin of a fruit" },
      { answer: "CHOP", clue: "Cut into pieces" },
      { answer: "OVEN", clue: "Enclosed cooking chamber" },
      { answer: "BAKE", clue: "Cook in an oven" },
      { answer: "BOIL", clue: "Heat liquid to 212°F" },
      { answer: "WILT", clue: "Cook greens until they soften" },
      { answer: "COAT", clue: "Cover food in a layer of something" },
    ]
  },
  {
    name: "Ocean & Marine Life",
    words: [
      { answer: "DOLPHIN", clue: "Intelligent marine mammal" },
      { answer: "OCTOPUS", clue: "Eight-armed sea creature" },
      { answer: "CORAL", clue: "Colorful underwater colony organism" },
      { answer: "KELP", clue: "Large brown seaweed" },
      { answer: "WHALE", clue: "Largest mammal on Earth" },
      { answer: "SQUID", clue: "Ten-armed cephalopod" },
      { answer: "MANATEE", clue: "Gentle sea cow" },
      { answer: "URCHIN", clue: "Spiny sea floor dweller" },
      { answer: "OYSTER", clue: "Pearl-producing mollusk" },
      { answer: "TURTLE", clue: "Shelled reptile of the sea" },
      { answer: "SHARK", clue: "Apex predator of the ocean" },
      { answer: "TIDE", clue: "Rise and fall of ocean water" },
      { answer: "WAVE", clue: "Moving ridge of water" },
      { answer: "REEF", clue: "Underwater ridge of rock or coral" },
      { answer: "TRENCH", clue: "Deep underwater canyon" },
      { answer: "ABYSS", clue: "Deepest zone of the ocean" },
      { answer: "PLANKTON", clue: "Tiny drifting marine organisms" },
      { answer: "ANCHOR", clue: "Heavy device to moor a ship" },
      { answer: "SAIL", clue: "Fabric that catches the wind" },
      { answer: "HULL", clue: "Body of a ship" },
      { answer: "STERN", clue: "Rear end of a vessel" },
      { answer: "PORT", clue: "Left side of a ship" },
      { answer: "BUOY", clue: "Floating navigational marker" },
      { answer: "CRAB", clue: "Sideways-walking crustacean" },
      { answer: "CLAM", clue: "Bivalve mollusk" },
      { answer: "SHOAL", clue: "Shallow area of water" },
      { answer: "DUNE", clue: "Sand mound near the shore" },
      { answer: "SURF", clue: "Breaking waves near shore" },
      { answer: "FOAM", clue: "White mass on wave crests" },
      { answer: "BRINE", clue: "Very salty water" },
      { answer: "MAST", clue: "Tall pole on a sailing ship" },
      { answer: "GUST", clue: "Sudden burst of wind at sea" },
      { answer: "COVE", clue: "Small sheltered bay" },
      { answer: "PIER", clue: "Structure extending into water" },
      { answer: "SEAL", clue: "Flippered marine mammal" },
    ]
  },
  {
    name: "Music & Sound",
    words: [
      { answer: "HARMONY", clue: "Pleasing combination of notes" },
      { answer: "MELODY", clue: "Sequence of musical notes" },
      { answer: "RHYTHM", clue: "Pattern of beats in music" },
      { answer: "TEMPO", clue: "Speed of a musical piece" },
      { answer: "CHORUS", clue: "Repeated section of a song" },
      { answer: "VERSE", clue: "Section before the chorus" },
      { answer: "CHORD", clue: "Three or more notes played together" },
      { answer: "TREBLE", clue: "High-pitched sound range" },
      { answer: "OCTAVE", clue: "Interval of eight notes" },
      { answer: "PITCH", clue: "Highness or lowness of a sound" },
      { answer: "FORTE", clue: "Musical direction meaning loud" },
      { answer: "PIANO", clue: "Keyboard instrument" },
      { answer: "VIOLA", clue: "String instrument larger than a violin" },
      { answer: "FLUTE", clue: "Woodwind instrument held sideways" },
      { answer: "DRUM", clue: "Percussion instrument you strike" },
      { answer: "BASS", clue: "Lowest range of musical notes" },
      { answer: "ALTO", clue: "Voice range between soprano and tenor" },
      { answer: "DUET", clue: "Musical piece for two performers" },
      { answer: "MUTE", clue: "Device to soften an instrument's sound" },
      { answer: "TONE", clue: "Quality of a musical sound" },
      { answer: "NOTE", clue: "Single musical sound" },
      { answer: "REST", clue: "Silent beat in music" },
      { answer: "BEAT", clue: "Basic unit of rhythm" },
      { answer: "TUNE", clue: "A melody or song" },
      { answer: "HYMN", clue: "Religious song of praise" },
      { answer: "HARP", clue: "String instrument played by plucking" },
      { answer: "REED", clue: "Vibrating piece in a woodwind" },
      { answer: "CODA", clue: "Final passage of a musical piece" },
      { answer: "ARIA", clue: "Operatic solo" },
      { answer: "LYRE", clue: "Ancient Greek stringed instrument" },
      { answer: "RIFF", clue: "Short repeated musical phrase" },
      { answer: "SOLO", clue: "Performance by one musician" },
      { answer: "BAND", clue: "Group of musicians" },
      { answer: "GONG", clue: "Large metal percussion disc" },
      { answer: "FRET", clue: "Ridge on a guitar neck" },
    ]
  },
  {
    name: "Nature & Wilderness",
    words: [
      { answer: "CANOPY", clue: "Uppermost layer of forest trees" },
      { answer: "MEADOW", clue: "Open grassy field" },
      { answer: "RAPIDS", clue: "Fast-flowing section of a river" },
      { answer: "CANYON", clue: "Deep gorge cut by a river" },
      { answer: "THICKET", clue: "Dense group of bushes or trees" },
      { answer: "GLACIER", clue: "Slow-moving river of ice" },
      { answer: "SUMMIT", clue: "Highest point of a mountain" },
      { answer: "VALLEY", clue: "Low area between hills" },
      { answer: "FOREST", clue: "Large area covered with trees" },
      { answer: "STREAM", clue: "Small flowing body of water" },
      { answer: "CEDAR", clue: "Fragrant evergreen tree" },
      { answer: "BIRCH", clue: "Tree with white peeling bark" },
      { answer: "FERN", clue: "Non-flowering plant with fronds" },
      { answer: "MOSS", clue: "Soft green plant on rocks" },
      { answer: "VINE", clue: "Climbing or trailing plant" },
      { answer: "CLIFF", clue: "Steep rock face" },
      { answer: "RIDGE", clue: "Long narrow hilltop" },
      { answer: "BLUFF", clue: "Broad steep cliff" },
      { answer: "POND", clue: "Small body of still water" },
      { answer: "LAKE", clue: "Large inland body of water" },
      { answer: "CAVE", clue: "Natural underground chamber" },
      { answer: "PEAK", clue: "Pointed top of a mountain" },
      { answer: "PINE", clue: "Coniferous tree with needles" },
      { answer: "THORN", clue: "Sharp point on a plant stem" },
      { answer: "DUSK", clue: "Twilight, between day and night" },
      { answer: "MIST", clue: "Thin fog" },
      { answer: "HAZE", clue: "Slight atmospheric obscuration" },
      { answer: "GALE", clue: "Very strong wind" },
      { answer: "FROST", clue: "Ice crystals on surfaces" },
      { answer: "BLOOM", clue: "A flower opening" },
      { answer: "TRAIL", clue: "Path through the wilderness" },
      { answer: "GROVE", clue: "Small group of trees" },
      { answer: "MARSH", clue: "Waterlogged grassy land" },
      { answer: "STONE", clue: "Small piece of rock" },
      { answer: "DIRT", clue: "Loose earth or soil" },
    ]
  },
  {
    name: "Technology & Computing",
    words: [
      { answer: "ALGORITHM", clue: "Step-by-step procedure for solving a problem" },
      { answer: "BROWSER", clue: "Software for viewing web pages" },
      { answer: "PIXEL", clue: "Smallest unit of a digital image" },
      { answer: "SERVER", clue: "Computer that provides data to others" },
      { answer: "ROUTER", clue: "Device that directs network traffic" },
      { answer: "WIDGET", clue: "Small interactive UI component" },
      { answer: "CURSOR", clue: "On-screen pointer" },
      { answer: "CACHE", clue: "Temporary data storage for speed" },
      { answer: "CLOUD", clue: "Remote computing resources" },
      { answer: "DEBUG", clue: "Find and fix errors in code" },
      { answer: "ARRAY", clue: "Ordered collection of elements" },
      { answer: "MODAL", clue: "Pop-up dialog window" },
      { answer: "TOKEN", clue: "Digital authentication credential" },
      { answer: "QUERY", clue: "Database search request" },
      { answer: "BYTE", clue: "Eight bits of data" },
      { answer: "PORT", clue: "Network communication endpoint" },
      { answer: "NODE", clue: "Connection point in a network" },
      { answer: "CODE", clue: "Instructions written for computers" },
      { answer: "LINK", clue: "Clickable connection to a URL" },
      { answer: "DATA", clue: "Information stored digitally" },
      { answer: "HASH", clue: "Fixed-length output from input data" },
      { answer: "LOOP", clue: "Repeating block of code" },
      { answer: "CHIP", clue: "Integrated circuit" },
      { answer: "PING", clue: "Test network connectivity" },
      { answer: "SPAM", clue: "Unwanted bulk messages" },
      { answer: "SYNC", clue: "Match data across devices" },
      { answer: "BOOT", clue: "Start up a computer" },
      { answer: "ICON", clue: "Small graphical image representing an app" },
      { answer: "FONT", clue: "Set of typeface characters" },
      { answer: "DOCK", clue: "Bar for app shortcuts" },
      { answer: "WIFI", clue: "Wireless internet connection" },
      { answer: "BLOG", clue: "Personal online journal" },
      { answer: "CLIP", clue: "Short piece of media" },
      { answer: "GRID", clue: "Layout of rows and columns" },
      { answer: "SWAP", clue: "Exchange one value for another" },
    ]
  },
  {
    name: "History & Civilization",
    words: [
      { answer: "DYNASTY", clue: "Succession of rulers from one family" },
      { answer: "EMPIRE", clue: "Group of nations under one ruler" },
      { answer: "TREATY", clue: "Formal agreement between nations" },
      { answer: "COLONY", clue: "Settlement in a new territory" },
      { answer: "SENATE", clue: "Governing council in ancient Rome" },
      { answer: "CASTLE", clue: "Fortified medieval residence" },
      { answer: "KNIGHT", clue: "Armored warrior on horseback" },
      { answer: "SHIELD", clue: "Protective armor carried in battle" },
      { answer: "SCROLL", clue: "Ancient rolled-up document" },
      { answer: "BRONZE", clue: "Metal alloy that named an age" },
      { answer: "SIEGE", clue: "Military blockade of a fortress" },
      { answer: "RELIC", clue: "Surviving object from the past" },
      { answer: "REIGN", clue: "Period of a monarch's rule" },
      { answer: "TRUCE", clue: "Temporary ceasefire" },
      { answer: "REALM", clue: "Kingdom or domain" },
      { answer: "NOBLE", clue: "Person of high social rank" },
      { answer: "MOAT", clue: "Water-filled ditch around a castle" },
      { answer: "DUKE", clue: "High-ranking nobleman" },
      { answer: "LORE", clue: "Traditional knowledge passed down" },
      { answer: "FLAG", clue: "Banner representing a nation" },
      { answer: "ARCH", clue: "Stone curved structure" },
      { answer: "COIN", clue: "Metal piece of money" },
      { answer: "SERF", clue: "Medieval peasant bound to land" },
      { answer: "GUILD", clue: "Medieval trade organization" },
      { answer: "FORT", clue: "Defensive military structure" },
      { answer: "OATH", clue: "Solemn promise" },
      { answer: "CLAN", clue: "Family-based social group" },
      { answer: "HELM", clue: "Position of leadership, or a helmet" },
      { answer: "PIKE", clue: "Long infantry weapon with a point" },
      { answer: "TOME", clue: "Large scholarly book" },
      { answer: "RUNE", clue: "Ancient Germanic letter" },
      { answer: "CREST", clue: "Heraldic emblem of a family" },
      { answer: "KEEP", clue: "Strong central tower of a castle" },
      { answer: "WALL", clue: "Defensive barrier" },
      { answer: "RAID", clue: "Surprise military attack" },
    ]
  },
  {
    name: "Sports & Athletics",
    words: [
      { answer: "SPRINT", clue: "Short fast race" },
      { answer: "TACKLE", clue: "Bring down an opponent" },
      { answer: "VOLLEY", clue: "Hit before it bounces" },
      { answer: "HURDLE", clue: "Barrier jumped over in a race" },
      { answer: "STROKE", clue: "Swimming movement or tennis hit" },
      { answer: "RELAY", clue: "Race with team handoffs" },
      { answer: "VAULT", clue: "Gymnastic event using a springboard" },
      { answer: "COURT", clue: "Playing area for tennis or basketball" },
      { answer: "MATCH", clue: "Competitive game or contest" },
      { answer: "COACH", clue: "Person who trains athletes" },
      { answer: "MEDAL", clue: "Award for winning a competition" },
      { answer: "SCORE", clue: "Points earned in a game" },
      { answer: "SERVE", clue: "Start play in tennis" },
      { answer: "PITCH", clue: "Throw to the batter, or a soccer field" },
      { answer: "FIELD", clue: "Outdoor playing area" },
      { answer: "TRACK", clue: "Oval course for running" },
      { answer: "FINAL", clue: "Last competition of a tournament" },
      { answer: "RACE", clue: "Speed competition" },
      { answer: "GOAL", clue: "Target to score in soccer" },
      { answer: "FOUL", clue: "Rule violation" },
      { answer: "KICK", clue: "Strike with the foot" },
      { answer: "PASS", clue: "Throw to a teammate" },
      { answer: "PUNT", clue: "Kick ball before it touches ground" },
      { answer: "LAPS", clue: "Circuits around a track" },
      { answer: "BOUT", clue: "Boxing or wrestling match" },
      { answer: "CLUB", clue: "Golf hitting implement" },
      { answer: "PUCK", clue: "Rubber disc in ice hockey" },
      { answer: "RINK", clue: "Ice surface for skating" },
      { answer: "TEAM", clue: "Group playing together" },
      { answer: "SWIM", clue: "Move through water" },
      { answer: "DIVE", clue: "Plunge headfirst" },
      { answer: "SLED", clue: "Vehicle for snow sports" },
      { answer: "JUMP", clue: "Leave the ground" },
      { answer: "LIFT", clue: "Raise a weight overhead" },
      { answer: "GRIP", clue: "How you hold equipment" },
    ]
  },
];

// ─── Puzzle Generation Engine ──────────────────────────────────────────────
function generateBestLayout(words, attempts = 100) {
  let best = null;
  let bestScore = -1;

  for (let i = 0; i < attempts; i++) {
    const shuffled = [...words].sort(() => Math.random() - 0.5);
    const input = shuffled.map(w => ({ answer: w.answer.toLowerCase(), clue: w.clue }));
    const layout = generateLayout(input);

    // Score: prioritize density * wordsPlaced
    let filled = 0;
    for (let r = 0; r < layout.rows; r++) {
      for (let c = 0; c < layout.cols; c++) {
        if (layout.table[r][c] !== '-') filled++;
      }
    }
    const total = layout.rows * layout.cols;
    const density = filled / total;
    const placedRatio = layout.result.length / words.length;
    const score = density * 0.6 + placedRatio * 0.4;

    if (score > bestScore) {
      bestScore = score;
      best = layout;
    }
  }
  return best;
}

function trimGrid(layout) {
  const table = layout.table;
  const rows = table.length;
  const cols = table[0].length;

  let minR = rows, maxR = 0, minC = cols, maxC = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (table[r][c] !== '-') {
        minR = Math.min(minR, r);
        maxR = Math.max(maxR, r);
        minC = Math.min(minC, c);
        maxC = Math.max(maxC, c);
      }
    }
  }

  const trimmed = [];
  for (let r = minR; r <= maxR; r++) {
    const row = [];
    for (let c = minC; c <= maxC; c++) {
      row.push(table[r][c]);
    }
    trimmed.push(row);
  }

  // Update word positions
  const result = layout.result.map(item => ({
    ...item,
    startx: item.startx - minC,
    starty: item.starty - minR
  }));

  return {
    table: trimmed,
    result,
    rows: trimmed.length,
    cols: trimmed[0].length
  };
}

function layoutToNightcrossing(layout, id, title, themeName) {
  const trimmed = trimGrid(layout);
  const { table, result, rows, cols } = trimmed;

  const grid = Array(rows * cols).fill('.');
  const gridnums = Array(rows * cols).fill(0);

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const ch = table[r][c];
      if (ch && ch !== '-') {
        grid[r * cols + c] = ch.toUpperCase();
      }
    }
  }

  const clues = { across: [], down: [] };
  const answers = { across: [], down: [] };

  // Sort by position number
  result.sort((a, b) => a.position - b.position);

  result.forEach(item => {
    const x = item.startx - 1;
    const y = item.starty - 1;
    const idx = y * cols + x;
    gridnums[idx] = item.position;

    const prefix = `${item.position}. `;
    if (item.orientation === 'across') {
      clues.across.push(prefix + item.clue);
      answers.across.push(item.answer.toUpperCase());
    } else {
      clues.down.push(prefix + item.clue);
      answers.down.push(item.answer.toUpperCase());
    }
  });

  return {
    id,
    title,
    theme: themeName,
    author: "Nightcrossing Engine",
    date: id,
    size: { cols, rows },
    grid,
    gridnums,
    clues,
    answers
  };
}

export function generateThemedPuzzle(id, overrideTheme) {
  const theme = overrideTheme || THEMES[Math.floor(Math.random() * THEMES.length)];
  console.log(`Theme: ${theme.name}`);

  const layout = generateBestLayout(theme.words, 150);
  const title = `${theme.name} Crossword`;

  return layoutToNightcrossing(layout, id, title, theme.name);
}

export { THEMES };
