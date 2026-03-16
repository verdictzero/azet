// ============================================================================
// entities.js — Entity/NPC system for DECKBORN, a space colony roguelike
// ============================================================================

import { SeededRNG, distance, manhattanDist } from './utils.js';

let _entityIdCounter = 0;
function nextId(prefix = 'ent') {
  return `${prefix}_${++_entityIdCounter}`;
}

// ============================================================================
// NameGenerator — Produces names for NPCs and settlements
// ============================================================================

const NAME_POOLS = {
  deckborn: {
    male: [
      'Aldric', 'Marcus', 'Kael', 'Cedric', 'Gareth', 'Roland', 'Edmund',
      'Aldwin', 'Brant', 'Conrad', 'Darian', 'Edwin', 'Falric', 'Godwin',
      'Harald', 'Ivan', 'Jareth', 'Kelvin', 'Leoric', 'Malcolm', 'Neville',
      'Oswald', 'Percival', 'Quinton', 'Roderick', 'Sigmund', 'Tristan',
      'Ulric', 'Victor', 'Warren',
    ],
    female: [
      'Elena', 'Sarah', 'Lyria', 'Marian', 'Gwendolyn', 'Rowena', 'Isolde',
      'Adeline', 'Beatrice', 'Cordelia', 'Davina', 'Elspeth', 'Freya',
      'Giselle', 'Helena', 'Ingrid', 'Juliana', 'Kathryn', 'Lenora',
      'Mirabel', 'Nerissa', 'Ophelia', 'Priscilla', 'Rosalind', 'Sybil',
      'Thalia', 'Ursula', 'Vivienne', 'Winifred', 'Yseult',
    ],
    last: [
      'Deckwright', 'Ironpipe', 'Bulkholme', 'Vaultborn', 'Shellbreaker',
      'Ductrunner', 'Gridwell', 'Sealwright', 'Coilbender', 'Pipefitter',
      'Ventwalker', 'Hullmark', 'Archwright', 'Boltforge', 'Wiresmith',
      'Gasketson', 'Strutfield', 'Riveton', 'Platewell', 'Frameborn',
    ],
  },
  archborn: {
    male: [
      'Aelindor', 'Sylvain', 'Thalion', 'Celeborn', 'Elrandir', 'Faelar',
      'Galathil', 'Haldir', 'Ithilion', 'Lanthir', 'Maeglin', 'Noldir',
      'Orophin', 'Pelendur', 'Quennar', 'Rhovannion', 'Silarion', 'Tauriel',
      'Vanyar', 'Wraithion',
    ],
    female: [
      'Lirieth', 'Arwen', 'Elowen', 'Galadriel', 'Idhriel', 'Miriel',
      'Nimrodel', 'Silinde', 'Tindome', 'Vanesse', 'Aerith', 'Caladwen',
      'Elanor', 'Finduilas', 'Hithlain', 'Laurelin', 'Melian', 'Nessa',
      'Raina', 'Yavanna',
    ],
    last: [
      'Conduitson', 'Torchfield', 'Weldmark', 'Archwright', 'Gridwell',
      'Sealwright', 'Wiresmith', 'Ventwalker', 'Coilbender', 'Platewell',
      'Frameborn', 'Boltforge', 'Hullmark', 'Strutfield', 'Riveton',
      'Deckwright', 'Gasketson', 'Pipefitter', 'Shellbreaker', 'Bulkholme',
    ],
  },
  boneborn: {
    male: [
      'Thorin', 'Gimli', 'Balin', 'Durin', 'Dwalin', 'Gloin', 'Bofur',
      'Bombur', 'Nori', 'Oin', 'Kili', 'Fili', 'Dain', 'Thror', 'Fundin',
      'Grolin', 'Nain', 'Borin', 'Farin', 'Loni',
    ],
    female: [
      'Disa', 'Helga', 'Bruni', 'Thora', 'Greta', 'Hilda', 'Sigrid',
      'Brunhild', 'Dagny', 'Eira', 'Frida', 'Gudrun', 'Ingra', 'Kelda',
      'Magna', 'Riva', 'Sif', 'Thyra', 'Ulfhild', 'Yrsa',
    ],
    last: [
      'Ironpipe', 'Boltforge', 'Hullmark', 'Pipefitter', 'Coilbender',
      'Sealwright', 'Riveton', 'Platewell', 'Gasketson', 'Strutfield',
      'Wiresmith', 'Shellbreaker', 'Deckwright', 'Gridwell', 'Ventwalker',
      'Frameborn', 'Bulkholme', 'Vaultborn', 'Conduitson', 'Weldmark',
    ],
  },
  voidtouched: {
    male: [
      'Grukk', 'Throg', 'Mogash', 'Uzgul', 'Brakka', 'Durgash', 'Ghorn',
      'Kragoth', 'Lugdush', 'Muzgash', 'Nazgoth', 'Orgrim', 'Skullgar',
      'Ugroth', 'Zargoth',
    ],
    female: [
      'Gorza', 'Shagra', 'Bolgra', 'Durza', 'Gashna', 'Krella', 'Mogra',
      'Nargha', 'Rishka', 'Sharog', 'Uglasha', 'Vorgha', 'Yazga', 'Zulka',
      'Breka',
    ],
    last: [
      'Shellbreaker', 'Vaultborn', 'Hullmark', 'Weldmark', 'Boltforge',
      'Ironpipe', 'Strutfield', 'Riveton', 'Frameborn', 'Coilbender',
      'Platewell', 'Torchfield', 'Conduitson', 'Gasketson', 'Pipefitter',
    ],
  },
  crawler: {
    male: [
      'Pippin', 'Merry', 'Samwise', 'Frodo', 'Bilbo', 'Lotho', 'Folco',
      'Drogo', 'Hamfast', 'Griffo', 'Bingo', 'Largo', 'Polo', 'Hugo',
      'Cosimo',
    ],
    female: [
      'Rosie', 'Daisy', 'Petunia', 'Marigold', 'Primrose', 'Lobelia',
      'Belladonna', 'Esmeralda', 'Celandine', 'Amaranth', 'Pansy',
      'Daffodil', 'Clover', 'Ivy', 'Poppy',
    ],
    last: [
      'Ductrunner', 'Ventwalker', 'Gridwell', 'Wiresmith', 'Pipefitter',
      'Coilbender', 'Sealwright', 'Gasketson', 'Archwright', 'Boltforge',
      'Frameborn', 'Hullmark', 'Riveton', 'Strutfield', 'Conduitson',
    ],
  },
};

const NICKNAMES = [
  'the Steady', 'the Bold', 'Voidwalker', 'Truthseeker', 'the Wise',
  'Ironwill', 'Surgebringer', 'the Drifter', 'Coreheart', 'the Swift',
  'Archlight', 'the Silent', 'Breachbreaker', 'the Merciful', 'Tunnelstalker',
  'the Just', 'Oathkeeper', 'the Unyielding', 'Grimjaw', 'Steelheart',
];

const PLACE_PREFIXES = [
  'Bulk', 'Iron', 'Void', 'Arc', 'Core', 'Vent', 'Hull', 'Seal',
  'Grid', 'Bolt', 'Weld', 'Rust', 'Deep', 'Flux', 'Pipe',
];

const PLACE_SUFFIXES = [
  'hold', 'gate', 'lock', 'haven', 'port', 'ward', 'bay', 'dock',
  'keep', 'well', 'tier', 'deck', 'watch', 'frame', 'span',
];

export class NameGenerator {
  generate(rng, race = 'deckborn') {
    const pool = NAME_POOLS[race] || NAME_POOLS.deckborn;
    const isMale = rng.chance(0.5);
    const firstNames = isMale ? pool.male : pool.female;

    const first = rng.random(firstNames);
    const last = rng.random(pool.last);

    let nickname = null;
    let full = `${first} ${last}`;

    if (rng.chance(0.3)) {
      nickname = rng.random(NICKNAMES);
      full = `${first} "${nickname}" ${last}`;
    }

    return { first, last, nickname, full };
  }

  generateSettlementName(rng) {
    return rng.random(PLACE_PREFIXES) + rng.random(PLACE_SUFFIXES);
  }
}

// ============================================================================
// NPCGenerator — Creates fully-fleshed NPC objects
// ============================================================================

const PERSONALITY_TRAITS = [
  'grumpy', 'cheerful', 'suspicious', 'generous', 'greedy', 'brave',
  'cowardly', 'wise', 'foolish', 'honest', 'deceitful', 'loyal',
  'treacherous', 'patient', 'hot-tempered', 'humble', 'arrogant',
  'curious', 'reclusive', 'devout', 'pragmatic', 'idealistic',
  'stoic', 'jovial', 'sarcastic', 'grim', 'compassionate', 'ruthless',
  'scholarly', 'superstitious',
];

const ARCHETYPES = ['mentor', 'rival', 'ally', 'antagonist', 'neutral', 'comic_relief'];

const ROLE_CHARS = {
  merchant: 'M', blacksmith: 'M', barkeep: 'B', priest: 'P', guard: 'G',
  noble: 'N', farmer: 'N', miner: 'N', hunter: 'N', scholar: 'N',
  beggar: 'N', child: 'N', knight: 'K',
};

const ROLE_COLORS = {
  merchant:   '#e6c619',
  blacksmith: '#cc6633',
  barkeep:    '#d4915c',
  priest:     '#f0f0f0',
  guard:      '#7799cc',
  noble:      '#cc66cc',
  farmer:     '#88aa44',
  miner:      '#aa8855',
  hunter:     '#66aa66',
  scholar:    '#aaaaee',
  beggar:     '#888888',
  child:      '#ffaaaa',
  knight:     '#ccccdd',
};

const ROLE_TITLES = {
  merchant:   ['Salvage Dealer', 'Parts Vendor', 'Supply Trader', 'Scrap Peddler', 'Depot Keeper'],
  blacksmith: ['Metalworker', 'Hull Welder', 'Pipe Fitter', 'Plate Smith', 'Arc Tinker'],
  barkeep:    ['Bunk Warden', 'Mess Hall Keeper', 'Ration Master', 'Canteen Boss', 'Berth Steward'],
  priest:     ['Builder Acolyte', 'Shrine Keeper', 'Builder Warden', 'Core Healer', 'Arch Cleric'],
  guard:      ['Militia Sentry', 'Bulkhead Watchman', 'Patrol Captain', 'Sector Guard', 'Gate Sentry'],
  noble:      ['Overseer', 'Sector Chief', 'Council Elder', 'Deck Marshal', 'Tier Warden'],
  farmer:     ['Hydro Farmer', 'Grow-Bay Tender', 'Fungus Grower', 'Nutrient Cycler', 'Bio-Tender'],
  miner:      ['Hull Miner', 'Tunnel Foreman', 'Ore Prospector', 'Salvage Excavator', 'Core Driller'],
  hunter:     ['Tunnel Scout', 'Pest Controller', 'Vent Trapper', 'Perimeter Ranger', 'Hull Tracker'],
  scholar:    ['Data Archivist', 'Tech Sage', 'Lore Keeper', 'Signal Analyst', 'Systems Historian'],
  beggar:     ['Drifter', 'Duct Scrounger', 'Vagabond', 'Hull Rat', 'Castoff'],
  child:      ['Deck Kid', 'Vent Runner', 'Hatchling', 'Young One', 'Little One'],
};

const SECRET_TEMPLATES = [
  'is secretly a former saboteur for a rival sector',
  'was once a council member before being disgraced',
  'knows the location of a sealed Builder cache',
  'is wanted in another sector for data theft',
  'worships a forbidden Builder AI fragment',
  'has a child hidden in a neighboring settlement',
  'poisoned the previous sector foreman',
  'can interpret Builder signal patterns in dreams',
  'stole their identity from a dead colonist',
  'is a spy for a rival faction',
  'owes a massive debt to the Salvage Guild',
  'accidentally caused a reactor leak that irradiated an entire deck',
  'possesses a forbidden Builder data core hidden in their bunk',
  'was raised by tunnel runners in the lower decks',
  'knows a secret maintenance shaft beneath the settlement',
  'made a pact with a rogue AI long ago',
  'is descended from one of the original colony founders',
  'witnessed a murder in the tunnels and never spoke of it',
  'has a twin sibling in another sector no one knows about',
  'can read the ancient Builder script language',
];

const ROLE_SCHEDULES = {
  merchant: [
    { hour: 0, location: 'home', action: 'sleeping' },
    { hour: 6, location: 'home', action: 'eating breakfast' },
    { hour: 7, location: 'market', action: 'setting up shop' },
    { hour: 8, location: 'market', action: 'selling wares' },
    { hour: 12, location: 'tavern', action: 'having lunch' },
    { hour: 13, location: 'market', action: 'selling wares' },
    { hour: 18, location: 'market', action: 'closing shop' },
    { hour: 19, location: 'tavern', action: 'having dinner' },
    { hour: 21, location: 'home', action: 'resting' },
    { hour: 22, location: 'home', action: 'sleeping' },
  ],
  blacksmith: [
    { hour: 0, location: 'home', action: 'sleeping' },
    { hour: 5, location: 'forge', action: 'lighting the forge' },
    { hour: 6, location: 'forge', action: 'smithing' },
    { hour: 12, location: 'tavern', action: 'having lunch' },
    { hour: 13, location: 'forge', action: 'smithing' },
    { hour: 18, location: 'forge', action: 'banking the forge' },
    { hour: 19, location: 'tavern', action: 'having dinner' },
    { hour: 21, location: 'home', action: 'resting' },
    { hour: 22, location: 'home', action: 'sleeping' },
  ],
  barkeep: [
    { hour: 0, location: 'tavern', action: 'cleaning up' },
    { hour: 2, location: 'home', action: 'sleeping' },
    { hour: 6, location: 'tavern', action: 'opening tavern' },
    { hour: 7, location: 'tavern', action: 'serving breakfast' },
    { hour: 10, location: 'market', action: 'buying supplies' },
    { hour: 11, location: 'tavern', action: 'serving drinks' },
    { hour: 14, location: 'tavern', action: 'cleaning' },
    { hour: 16, location: 'tavern', action: 'serving drinks' },
    { hour: 24, location: 'tavern', action: 'closing up' },
  ],
  priest: [
    { hour: 0, location: 'temple', action: 'sleeping' },
    { hour: 5, location: 'temple', action: 'morning prayers' },
    { hour: 7, location: 'temple', action: 'tending the sick' },
    { hour: 10, location: 'temple', action: 'studying scripture' },
    { hour: 12, location: 'temple', action: 'midday sermon' },
    { hour: 14, location: 'town', action: 'visiting townsfolk' },
    { hour: 17, location: 'temple', action: 'evening prayers' },
    { hour: 19, location: 'temple', action: 'meditation' },
    { hour: 21, location: 'temple', action: 'sleeping' },
  ],
  guard: [
    { hour: 0, location: 'barracks', action: 'sleeping' },
    { hour: 6, location: 'barracks', action: 'suiting up' },
    { hour: 7, location: 'gate', action: 'standing watch' },
    { hour: 10, location: 'town', action: 'patrolling' },
    { hour: 12, location: 'barracks', action: 'having lunch' },
    { hour: 13, location: 'town', action: 'patrolling' },
    { hour: 16, location: 'gate', action: 'standing watch' },
    { hour: 18, location: 'barracks', action: 'off duty' },
    { hour: 20, location: 'tavern', action: 'relaxing' },
    { hour: 22, location: 'barracks', action: 'sleeping' },
  ],
  noble: [
    { hour: 0, location: 'manor', action: 'sleeping' },
    { hour: 8, location: 'manor', action: 'having breakfast' },
    { hour: 9, location: 'manor', action: 'attending to affairs' },
    { hour: 12, location: 'manor', action: 'having lunch' },
    { hour: 13, location: 'town', action: 'inspecting the town' },
    { hour: 15, location: 'manor', action: 'meeting with advisors' },
    { hour: 18, location: 'manor', action: 'having dinner' },
    { hour: 20, location: 'manor', action: 'reading' },
    { hour: 22, location: 'manor', action: 'sleeping' },
  ],
  farmer: [
    { hour: 0, location: 'home', action: 'sleeping' },
    { hour: 4, location: 'home', action: 'waking up' },
    { hour: 5, location: 'farm', action: 'feeding animals' },
    { hour: 7, location: 'farm', action: 'working fields' },
    { hour: 12, location: 'home', action: 'having lunch' },
    { hour: 13, location: 'farm', action: 'working fields' },
    { hour: 17, location: 'farm', action: 'harvesting' },
    { hour: 19, location: 'home', action: 'having dinner' },
    { hour: 20, location: 'tavern', action: 'relaxing' },
    { hour: 21, location: 'home', action: 'sleeping' },
  ],
  miner: [
    { hour: 0, location: 'home', action: 'sleeping' },
    { hour: 5, location: 'home', action: 'waking up' },
    { hour: 6, location: 'mine', action: 'mining ore' },
    { hour: 12, location: 'mine', action: 'break' },
    { hour: 13, location: 'mine', action: 'mining ore' },
    { hour: 17, location: 'mine', action: 'leaving mine' },
    { hour: 18, location: 'tavern', action: 'having dinner' },
    { hour: 20, location: 'tavern', action: 'drinking' },
    { hour: 22, location: 'home', action: 'sleeping' },
  ],
  hunter: [
    { hour: 0, location: 'home', action: 'sleeping' },
    { hour: 4, location: 'home', action: 'preparing gear' },
    { hour: 5, location: 'wilderness', action: 'hunting' },
    { hour: 10, location: 'wilderness', action: 'tracking prey' },
    { hour: 14, location: 'town', action: 'selling pelts' },
    { hour: 16, location: 'home', action: 'repairing gear' },
    { hour: 18, location: 'tavern', action: 'telling stories' },
    { hour: 21, location: 'home', action: 'sleeping' },
  ],
  scholar: [
    { hour: 0, location: 'library', action: 'sleeping' },
    { hour: 7, location: 'library', action: 'reading' },
    { hour: 10, location: 'library', action: 'researching' },
    { hour: 12, location: 'tavern', action: 'having lunch' },
    { hour: 13, location: 'library', action: 'writing' },
    { hour: 16, location: 'town', action: 'lecturing students' },
    { hour: 18, location: 'library', action: 'cataloging' },
    { hour: 20, location: 'library', action: 'reading by candlelight' },
    { hour: 23, location: 'library', action: 'sleeping' },
  ],
  beggar: [
    { hour: 0, location: 'alley', action: 'sleeping' },
    { hour: 7, location: 'market', action: 'begging' },
    { hour: 12, location: 'temple', action: 'receiving charity' },
    { hour: 13, location: 'market', action: 'begging' },
    { hour: 17, location: 'tavern', action: 'scrounging for scraps' },
    { hour: 20, location: 'alley', action: 'sleeping' },
  ],
  child: [
    { hour: 0, location: 'home', action: 'sleeping' },
    { hour: 7, location: 'home', action: 'eating breakfast' },
    { hour: 8, location: 'town', action: 'playing' },
    { hour: 12, location: 'home', action: 'having lunch' },
    { hour: 13, location: 'town', action: 'playing' },
    { hour: 16, location: 'town', action: 'exploring' },
    { hour: 18, location: 'home', action: 'having dinner' },
    { hour: 19, location: 'home', action: 'doing chores' },
    { hour: 20, location: 'home', action: 'sleeping' },
  ],
};

const NPC_FACTIONS = [
  'Settlement Council', 'Salvage Guild', 'Tunnel Runners', 'Order of Builders',
  'Colony Militia', 'Free Traders', 'None',
];

export class NPCGenerator {
  constructor() {
    this.nameGen = new NameGenerator();
  }

  generate(rng, role = 'farmer', race = 'deckborn', locationContext = null) {
    const name = this.nameGen.generate(rng, race);
    const title = rng.random(ROLE_TITLES[role] || ROLE_TITLES.farmer);
    const char = ROLE_CHARS[role] || 'N';
    const color = ROLE_COLORS[role] || '#cccccc';

    // Stats scale by role
    const isCombat = role === 'guard' || role === 'knight';
    const baseHp = isCombat ? 40 : 20;
    const baseAtk = isCombat ? 8 : 3;
    const baseDef = isCombat ? 6 : 2;
    const level = rng.nextInt(1, 5);
    const hp = baseHp + level * 5 + rng.nextInt(-3, 3);

    // Personality: pick 3 unique traits
    const shuffledTraits = rng.shuffle(PERSONALITY_TRAITS);
    const traits = shuffledTraits.slice(0, 3);
    const mood = rng.random(['neutral', 'happy', 'angry', 'suspicious']);
    const archetype = rng.random(ARCHETYPES);

    // Schedule
    const schedule = (ROLE_SCHEDULES[role] || ROLE_SCHEDULES.farmer).map(s => ({ ...s }));

    // Faction
    let faction = rng.random(NPC_FACTIONS);
    if (role === 'merchant' || role === 'blacksmith') faction = 'Salvage Guild';
    if (role === 'guard' || role === 'knight') faction = 'Settlement Council';
    if (role === 'priest') faction = 'Order of Builders';

    // Secrets (1-2)
    const shuffledSecrets = rng.shuffle(SECRET_TEMPLATES);
    const secretCount = rng.nextInt(1, 2);
    const secrets = shuffledSecrets.slice(0, secretCount);

    // Position from location context
    const position = locationContext
      ? { x: locationContext.x || 0, y: locationContext.y || 0 }
      : { x: 0, y: 0 };

    // Shop data for merchant-type roles
    let shop = null;
    if (role === 'merchant' || role === 'blacksmith' || role === 'barkeep') {
      shop = {
        inventory: [],
        buyMultiplier: 0.5 + rng.nextFloat(0, 0.3),
        sellMultiplier: 1.0 + rng.nextFloat(0, 0.5),
        restockInterval: rng.nextInt(50, 150),
        lastRestock: 0,
        specialization: role === 'blacksmith'
          ? rng.random(['weapons', 'armor', 'tools'])
          : role === 'barkeep'
            ? 'tavern'
            : rng.random(['general', 'potions', 'scrolls', 'food']),
      };
    }

    return {
      id: nextId('npc'),
      name: { first: name.first, last: name.last, full: name.full },
      race,
      role,
      title,
      char,
      color,
      position,
      stats: {
        hp,
        maxHp: hp,
        attack: baseAtk + level + rng.nextInt(0, 2),
        defense: baseDef + Math.floor(level / 2) + rng.nextInt(0, 2),
        level,
      },
      personality: { traits, mood, archetype },
      schedule,
      faction,
      playerReputation: 0,
      memory: [],
      secrets,
      shop,
      quests: [],
      dialogue: {},
    };
  }
}

// ============================================================================
// DialogueSystem — Generates dialogue, greetings, options, and rumors
// ============================================================================

const GREETINGS = {
  friendly: [
    'By the Builders, good to see you again!',
    'Arch light guide you! How goes the venture?',
    'Ah, my favorite visitor returns!',
    'Well met, friend! What can I do for you today?',
    'May the Breath hold steady! Come in, come in.',
    'You look well! The tunnels have treated you kindly.',
    'Welcome, welcome! I was hoping you would stop by.',
    'The Builders watch over us! Good to see a friendly face.',
    'Ho there! Pull up a crate and rest your legs.',
    'The survivor returns! What news from the sectors?',
  ],
  neutral: [
    'What brings you to this deck?',
    'State your business.',
    "I don't believe we've met.",
    'Can I help you with something?',
    'Yes? What do you need?',
    'Hmm. You look like a tunnel runner.',
    'Another drifter. What do you want?',
    "If you're looking for trouble, try the lower decks.",
    'Speak up, I have not got all cycle.',
    'Well? Spit it out.',
  ],
  hostile: [
    'Stay back!',
    'Not you again...',
    'I thought I told you to leave this sector!',
    "Get out of my sight before I call the militia!",
    "You've got some nerve showing your face on this deck.",
  ],
};

const RUMOR_TEMPLATES = [
  'They say {LOCATION} has been sealed since the last contamination sweep...',
  'I heard {NPC_NAME} used to be a {PROFESSION} before settling in this sector.',
  'The corridor lights on Deck Seven have been flickering for weeks. Nobody knows why.',
  'The lower tunnels have been sealed ever since the collapse. Some say it was no accident.',
  'A scavenger was found dead near the outer hull last cycle. Raiders, they say.',
  "There's talk of pressure loss spreading through the eastern bulkheads.",
  "The metalworker's apprentice vanished three cycles ago. Nobody's talking about it.",
  'They say strange signals were picked up from below the reactor level.',
  "The water recyclers have tasted strange lately. Some folk won't drink from them.",
  'An old hermit in the maintenance tunnels supposedly knows how to fix any system.',
  'I overheard the militia talking about something sealed in the sub-levels.',
  "The Builder shrine has been collecting more offerings than usual. Wonder what for.",
  'A strange drifter was asking questions about the original colony charter last cycle.',
  "They say there's Builder tech buried beneath {LOCATION}, if you dare to look.",
  'The hydro harvest has been poor. Some blame the recyclers, others blame the overgrowth.',
  'I saw an unmarked cargo pod docked at the outer ring at midnight.',
  "The overseer's daughter has been secretly meeting someone outside the bulkheads.",
  'A tremor opened a fissure near the old decompression zone. Best stay away.',
  "Word is, the Tunnel Runners are recruiting. Not that I'd know anything about that.",
  'Some say the overgrowth is spreading... creeping closer to the settlement each cycle.',
];

const TOPIC_DIALOGUE = {
  self: [
    "I've been living on this deck for as long as I can remember.",
    'My work keeps me busy, but I cannot complain.',
    "I used to run the tunnels, but those days are behind me now.",
    "There's not much to tell, really. I'm just a simple {ROLE}.",
    'I learned my trade from my parent, and they from theirs.',
    "Name's {FIRST}. {TITLE} is what they call me around here.",
  ],
  location: [
    "This sector has seen better days, but it's home.",
    'The settlement was founded generations ago by the first colonists.',
    "Watch yourself around here. Not everyone's as friendly as me.",
    "We're a small community, but we look out for each other.",
    'The grow-bays around here are productive, if you know how to work them.',
    'Travelers pass through here on their way to the core sectors.',
  ],
  faction: [
    'The {FACTION} keeps things running around here, for better or worse.',
    "I'm loyal to the {FACTION}, and they've done right by me.",
    'Between you and me, the {FACTION} has too much power.',
    'Without the {FACTION}, this settlement would fall apart.',
    'The {FACTION}? I stay out of politics, friend.',
  ],
  quest: [
    'Actually, now that you mention it, I could use some help.',
    "There's a task I've been meaning to find someone for.",
    "I might have something, but it won't be easy.",
    'If you are looking for work, talk to the {FACTION}.',
    'Nothing right now, but check back later.',
  ],
};

export class DialogueSystem {
  generateGreeting(npc, playerRep = 0) {
    let templates;
    let tone;
    if (playerRep > 30) {
      templates = GREETINGS.friendly;
      tone = 'friendly';
    } else if (playerRep < -30) {
      templates = GREETINGS.hostile;
      tone = 'hostile';
    } else {
      templates = GREETINGS.neutral;
      tone = 'neutral';
    }

    const text = templates[Math.floor(Math.random() * templates.length)];
    const options = this.generateOptions(npc, playerRep);

    return { text, tone, options };
  }

  generateOptions(npc, playerRep = 0, gameContext = null) {
    const options = [];

    options.push({
      text: 'Tell me about this place.',
      action: 'lore',
      consequence: null,
    });

    if (playerRep >= -10) {
      options.push({
        text: 'Any work available?',
        action: 'quest',
        consequence: null,
      });
    }

    if ((npc.role === 'merchant' || npc.role === 'blacksmith') && playerRep >= -20) {
      options.push({
        text: 'Let me see your wares.',
        action: 'shop',
        consequence: null,
      });
    }

    if (playerRep >= 0) {
      options.push({
        text: 'Heard any rumors?',
        action: 'rumor',
        consequence: null,
      });
    }

    if (npc.role === 'priest' && playerRep >= -10) {
      options.push({
        text: 'I need healing.',
        action: 'heal',
        consequence: null,
      });
    }

    if (npc.role === 'scholar' && playerRep >= 0) {
      options.push({
        text: 'What can you teach me?',
        action: 'teach',
        consequence: null,
      });
    }

    if (npc.role === 'barkeep') {
      options.push({
        text: 'I need a bunk for the night.',
        action: 'rest',
        consequence: null,
      });
    }

    if (npc.role === 'guard' && playerRep >= 10) {
      options.push({
        text: 'Any trouble in the sector?',
        action: 'bounty',
        consequence: null,
      });
    }

    // Secret revelation at high rep
    if (playerRep > 50 && npc.secrets && npc.secrets.length > 0) {
      options.push({
        text: 'You can trust me... tell me something secret.',
        action: 'secret',
        consequence: null,
        hint: 'High reputation required',
      });
    }

    // Ask about their backstory
    if (playerRep >= 10) {
      options.push({
        text: 'Tell me about yourself.',
        action: 'backstory',
        consequence: null,
      });
    }

    // Quest turn-in (checked dynamically in main.js)
    // Faction gossip at moderate rep
    if (playerRep >= 0 && npc.faction && npc.faction !== 'None') {
      options.push({
        text: `What about the ${npc.faction}?`,
        action: 'factionGossip',
        consequence: null,
      });
    }

    options.push({
      text: 'Goodbye.',
      action: 'exit',
      consequence: null,
    });

    return options;
  }

  /**
   * Get current schedule activity for an NPC at the given hour.
   */
  getScheduleActivity(npc, hour) {
    if (!npc.schedule || npc.schedule.length === 0) return null;
    let current = npc.schedule[0];
    for (const entry of npc.schedule) {
      if (hour >= entry.hour) {
        current = entry;
      }
    }
    return current;
  }

  /**
   * Generate a schedule-aware greeting modifier.
   */
  getScheduleGreeting(npc, hour) {
    const activity = this.getScheduleActivity(npc, hour);
    if (!activity) return '';
    if (activity.action === 'sleeping') {
      return '*yawn* You woke me up... ';
    }
    if (activity.action.includes('eating') || activity.action.includes('lunch') || activity.action.includes('dinner') || activity.action.includes('breakfast')) {
      return '*chewing* Sorry, in the middle of a meal. ';
    }
    return '';
  }

  generateRumor(rng, worldContext = null) {
    let template = rng.random(RUMOR_TEMPLATES);

    const location = worldContext && worldContext.locations
      ? rng.random(worldContext.locations)
      : 'the sealed sector';
    const npcName = worldContext && worldContext.npcNames
      ? rng.random(worldContext.npcNames)
      : 'Old Kael';
    const profession = rng.random([
      'militia officer', 'scavenger', 'technomancer', 'overseer', 'smuggler', 'tunnel runner', 'saboteur',
      'sentinel', 'salvage boss', 'vent crawler',
    ]);

    template = template.replace('{LOCATION}', location);
    template = template.replace('{NPC_NAME}', npcName);
    template = template.replace('{PROFESSION}', profession);

    return template;
  }

  modifyReputation(npc, amount, reason = '') {
    npc.playerReputation = Math.max(-100, Math.min(100, (npc.playerReputation || 0) + amount));
    npc.memory.push({
      type: 'reputation_change',
      amount,
      reason,
      timestamp: Date.now(),
    });
  }

  getDialogue(npc, topic, playerRep = 0) {
    const templates = TOPIC_DIALOGUE[topic];
    if (!templates) return 'I have nothing to say about that.';

    let text = templates[Math.floor(Math.random() * templates.length)];
    text = text.replace('{ROLE}', npc.role || 'person');
    text = text.replace('{FACTION}', npc.faction || 'the powers that be');
    text = text.replace('{FIRST}', npc.name ? npc.name.first : 'stranger');
    text = text.replace('{TITLE}', npc.title || npc.role || 'worker');

    return text;
  }
}

// ============================================================================
// LoreGenerator — Generates colony history, backstories, and artifact lore
// ============================================================================

const WORLD_HISTORY_TEMPLATES = [
  'The colony was overrun by {ENEMY} {YEARS} cycles ago, and the decks have never fully recovered.',
  'A contamination sweep through {REGION} killed nearly half the population.',
  'The alliance between {FACTION1} and {FACTION2} was forged in desperation during the Breach at {LOCATION}.',
  'Long ago, a Builder engineer sealed a rogue AI beneath {LOCATION}, but the containment is weakening.',
  '{FACTION1} and {FACTION2} fought a bitter war over control of the reactor core, leaving scars on every deck.',
  'The original Overseer vanished mysteriously {YEARS} cycles ago. Some say they still walk the tunnels.',
  'A strange signal was detected from deep space {YEARS} cycles ago, heralding an age of turmoil and change.',
  'The great data archive of {LOCATION} was purged by zealots who feared forbidden Builder knowledge.',
  'The lower deck tunnels were sealed after something was unearthed in the deep hull.',
  'A catastrophic decompression reshaped the outer ring {YEARS} cycles ago, swallowing entire habitation blocks.',
  'The archborn retreated to the upper tiers after the betrayal at {LOCATION}, and few have been seen since.',
  'An order of sentinels once protected the colony, but they were disbanded under accusations of conspiracy.',
  'The Builder data cores were stolen {YEARS} cycles ago and never recovered. Some say they hold great power.',
  'A reactor breach buried the ancient core sector of {LOCATION} under slag and debris.',
  'The treaty that ended the Sector Wars is said to have been signed in the blood of both overseers.',
  'Legends speak of a colonist who sealed the First Breach at {LOCATION}, but archivists debate whether it truly happened.',
  'A cult of rogue technomancers nearly activated a dormant Builder weapon before they were stopped by {FACTION1}.',
  'The trade corridors were established {YEARS} cycles ago, bringing prosperity but also new dangers.',
];

const ARTIFACT_TEMPLATES = [
  'This device was assembled by {SMITH} in the core forges of Sector {MOUNTAIN}.',
  'Legend says it grants {POWER} to its operator, but at a terrible cost.',
  'It was last seen in the hands of {HERO}, who carried it into the final breach.',
  'The circuitry etched along its surface glows faintly in the presence of rogue signals.',
  'Crafted from Builder alloy recovered from the outer hull {YEARS} cycles ago.',
  'It is said to be one of seven devices created by the Builders to maintain the colony.',
  'The programming was laid into it by {SMITH}, the last of the great Builder engineers.',
  'Those who carry it long enough begin to hear transmissions from another era.',
  'It was believed destroyed during the fall of {LOCATION}, yet here it remains.',
  'The crystal set in its housing is said to contain a trapped AI fragment.',
  'Colonists have fought and died for generations over possession of this relic.',
  'It was a gift from the archborn council to a deckborn champion, ages past.',
  'Archivists believe it predates the colony founding by thousands of cycles.',
  'Its true function can only be unlocked when brought to {LOCATION}.',
  'The inscription reads: "May this instrument serve the just and shield the colony."',
  'It hums with a strange energy, as though it has a will of its own.',
  'According to legend, it cannot be destroyed by any known means.',
];

const LOCATION_TEMPLATES = [
  'Built as a {PURPOSE}, it has served the colony for {YEARS} cycles.',
  'The remains here date back to the Builder Era, when the colony was first constructed.',
  'This place was once a thriving trade hub, before the corridors were rerouted.',
  'The locals avoid this sector after lights-out, whispering of static ghosts and worse.',
  'A fierce battle was fought here {YEARS} cycles ago, and the bulkheads still bear the scars.',
  'It was constructed by Builder engineers, renowned for their mastery of alloy and circuitry.',
  'The reservoir at its center is said to grant clarity to those who drink from it.',
  'Travelers have reported strange sounds emanating from deep below the deck plating.',
  'Once the seat of a powerful overseer, it fell into disrepair after the uprising.',
  'The overgrowth around it is unnaturally dense, as if the vines themselves guard a secret.',
  'Built atop a sealed containment zone, it has always had a dark reputation.',
  'The walls bear faded schematics depicting systems from a forgotten Builder blueprint.',
  'It served as a refuge during the Last Breach, sheltering hundreds of survivors.',
  'The architecture suggests archborn influence, though no archborn live here now.',
  'A geothermal tap beneath the foundation keeps the plating warm even in cold cycles.',
  'According to legend, a powerful Builder device lies hidden somewhere within.',
  'The display panels depict the rise and fall of a civilization long gone.',
  'It was abandoned after a mysterious sickness swept through its inhabitants.',
];

const NPC_BACKSTORY_TEMPLATES = [
  'I used to be a {PROFESSION} before I settled on this deck.',
  'My family was from {PLACE}, but we had to flee when the breaches came.',
  'I lost everything in the reactor leak and had to start over from nothing.',
  'My parent taught me this trade, and their parent before them.',
  'I came here seeking salvage, but found something more valuable: stability.',
  'I served in the militia during the Sector Wars. Saw things I wish I could forget.',
  'I was an orphan, raised by the acolytes at the Builder shrine.',
  'I traveled the outer sectors for ten cycles before settling in this quiet corner.',
  "There's a reason I left my old life behind, and I'd rather not speak of it.",
  'I was apprenticed to a master tech who taught me everything I know.',
  'My mother was a medic, and she passed her knowledge on to me.',
  'I made my fortune in the salvage trade, but lost it all to bad luck and worse partners.',
  'I ran from my home deck as a child and never looked back.',
  'I once served an overseer, but they fell from grace and I had to find my own way.',
  'I found this sector by accident and decided it was as good as anywhere to stay.',
  'I survived a hull breach and crawled through the vents until I found civilization.',
  'My family has lived on this deck for seven generations. This colony is in my blood.',
  'I came here to escape a blood feud. So far, no one has found me.',
  'I won this establishment in a game of cards. Best hand I ever played.',
  'I was once an archivist, but the politics of the council drove me away.',
];

const LORE_ENEMIES = [
  'a feral swarm', 'corrupted drones', 'scrap raiders', 'a rogue AI',
  'hull breakers', 'the Void Cult', 'tunnel reavers',
  'a malfunctioning defense grid', 'the Crimson Salvagers',
];

const LORE_REGIONS = [
  'the Upper Tiers', 'the Core Sectors', 'the Lower Decks', 'the Outer Rim',
  'the Maintenance Tunnels', 'the Reactor Ring', 'the Overgrowth Zones',
];

const LORE_POWERS = [
  'immense strength', 'the gift of foresight', 'phased cloaking', 'radiation resistance',
  'the ability to interface with Builder systems', 'enhanced reflexes', 'an energy barrier',
  'dominion over drones', 'immunity to toxins',
];

const LORE_SMITHS = [
  'Chief Engineer Durin', 'Master Aelindor', 'the Blind Forgemaster', 'Overseer Isolde',
  'Thargrim Steelhand', 'the ancient Builders', 'an unnamed archborn engineer',
];

const LORE_HEROES = [
  'Overseer Aldric the Bold', 'the Champion of the Arch', 'Selene the Drifter',
  'Commander Roderick Ashford', 'the last Sentinel', 'the legendary Thorin Hullmark',
];

const LORE_MOUNTAINS = [
  'Erebus', 'Ashfall', 'Thundercore', 'Reactor Spire', 'Ironframe', 'Frosthold',
];

const LORE_PURPOSES = [
  'defense bulkhead', 'Builder shrine', 'trade depot', 'mining outpost', 'watch station',
  'research lab', 'containment cell', 'command quarters', 'med-bay', 'data archive',
];

const LORE_PROFESSIONS = [
  'militia officer', 'vent crawler', 'scavenger', 'archivist', 'salvage dealer', 'pit fighter',
  'Builder acolyte', 'pathfinder', 'signal keeper', 'sentinel', 'smuggler', "technomancer's apprentice",
];

const LORE_PLACES = [
  'the central hub', 'a small hydro-bay settlement', 'the outer hull frontier',
  'across the void', 'the archborn tiers', 'the boneborn holds', 'a distant sector',
  'the border bulkheads', 'the scorched zones', 'the upper passages',
];

export class LoreGenerator {
  _fillTemplate(rng, template, factionNames, locationNames) {
    let text = template;

    text = text.replace('{ENEMY}', rng.random(LORE_ENEMIES));
    text = text.replace('{YEARS}', String(rng.nextInt(50, 500)));
    text = text.replace('{REGION}', rng.random(LORE_REGIONS));
    text = text.replace('{POWER}', rng.random(LORE_POWERS));
    text = text.replace('{SMITH}', rng.random(LORE_SMITHS));
    text = text.replace('{HERO}', rng.random(LORE_HEROES));
    text = text.replace('{MOUNTAIN}', rng.random(LORE_MOUNTAINS));
    text = text.replace('{PURPOSE}', rng.random(LORE_PURPOSES));
    text = text.replace('{PROFESSION}', rng.random(LORE_PROFESSIONS));
    text = text.replace('{PLACE}', rng.random(LORE_PLACES));

    if (factionNames && factionNames.length > 0) {
      text = text.replace('{FACTION1}', rng.random(factionNames));
      text = text.replace('{FACTION2}', rng.random(factionNames));
    } else {
      text = text.replace('{FACTION1}', 'the Settlement Council');
      text = text.replace('{FACTION2}', 'the Tunnel Runners');
    }

    if (locationNames && locationNames.length > 0) {
      text = text.replace(/{LOCATION}/g, rng.random(locationNames));
    } else {
      text = text.replace(/{LOCATION}/g, 'the sealed sector');
    }

    return text;
  }

  generateWorldHistory(rng, factionNames = [], locationNames = []) {
    const count = rng.nextInt(5, 10);
    const shuffled = rng.shuffle(WORLD_HISTORY_TEMPLATES);
    const entries = [];

    for (let i = 0; i < count && i < shuffled.length; i++) {
      entries.push({
        era: rng.nextInt(1, 5),
        text: this._fillTemplate(rng, shuffled[i], factionNames, locationNames),
      });
    }

    entries.sort((a, b) => a.era - b.era);
    return entries;
  }

  generateArtifactLore(rng, itemName = 'this artifact') {
    const template = rng.random(ARTIFACT_TEMPLATES);
    const text = this._fillTemplate(rng, template, [], []);
    return `${itemName}: ${text}`;
  }

  generateLocationHistory(rng, locationName = 'this place', locationType = 'ruins') {
    const template = rng.random(LOCATION_TEMPLATES);
    const text = this._fillTemplate(rng, template, [], [locationName]);
    return `${locationName}: ${text}`;
  }

  generateNPCBackstory(rng, npc) {
    const template = rng.random(NPC_BACKSTORY_TEMPLATES);
    const text = this._fillTemplate(rng, template, [], []);
    const name = npc && npc.name ? npc.name.full : 'Unknown';
    return `${name}: "${text}"`;
  }
}

// ============================================================================
// Player — The player character entity
// ============================================================================

const CLASS_COLORS = {
  sentinel:     '#dd4444',
  technomancer: '#6666ee',
  scavenger:    '#aaaa22',
  pathfinder:   '#44aa44',
};

const CLASS_BASE_STATS = {
  sentinel:     { str: 16, dex: 10, con: 14, int: 8,  wis: 10, cha: 10 },
  technomancer: { str: 8,  dex: 10, con: 10, int: 16, wis: 14, cha: 10 },
  scavenger:    { str: 10, dex: 16, con: 10, int: 10, wis: 8,  cha: 14 },
  pathfinder:   { str: 12, dex: 14, con: 12, int: 10, wis: 12, cha: 10 },
};

const CLASS_ABILITIES = {
  sentinel: [
    { name: 'Overclocked Strike', manaCost: 5, damage: 8, type: 'melee', description: 'A devastating power-assisted blow.' },
    { name: 'Bulkhead Stance', manaCost: 3, damage: 4, type: 'melee', description: 'Brace behind cover and stun an enemy.' },
  ],
  technomancer: [
    { name: 'Arc Discharge', manaCost: 8, damage: 12, type: 'ranged', description: 'Unleash a crackling arc of electricity at your foes.' },
    { name: 'Cryo Pulse', manaCost: 6, damage: 6, type: 'aoe', description: 'Flash-freeze nearby enemies.' },
    { name: 'Energy Barrier', manaCost: 4, damage: 0, type: 'buff', description: 'Project a shimmering energy shield.' },
  ],
  scavenger: [
    { name: 'Ambush Strike', manaCost: 5, damage: 14, type: 'melee', description: 'Strike from the shadows for massive damage.' },
    { name: 'Flash Charge', manaCost: 4, damage: 0, type: 'utility', description: 'Deploy a blinding flash charge and vanish.' },
  ],
  pathfinder: [
    { name: 'Aimed Shot', manaCost: 5, damage: 10, type: 'ranged', description: 'A carefully aimed projectile.' },
    { name: 'Spread Shot', manaCost: 3, damage: 6, type: 'utility', description: 'Fire a spread of projectiles at multiple targets.' },
    { name: 'Field Repair', manaCost: 6, damage: 0, type: 'heal', description: 'Patch wounds with salvaged supplies.' },
  ],
};

const CLASS_STARTING_GEAR = {
  sentinel: {
    mainHand: { id: 'start_sword', name: 'Battered Pipe Blade', type: 'weapon', subtype: 'sword', char: '/', color: '#aaaaaa', rarity: 'common', value: 10, stats: { attack: 4 }, description: 'A length of sharpened pipe, crude but effective.' },
    chest: { id: 'start_chain', name: 'Patched Plate Vest', type: 'armor', subtype: 'chestplate', char: '[', color: '#888888', rarity: 'common', value: 15, stats: { defense: 3 }, description: 'Welded plate segments bolted over a padded vest.' },
  },
  technomancer: {
    mainHand: { id: 'start_staff', name: 'Flickering Conduit Rod', type: 'weapon', subtype: 'staff', char: '~', color: '#8866aa', rarity: 'common', value: 8, stats: { attack: 2, mana: 10 }, description: 'A salvaged conduit rod that crackles with unstable energy.' },
  },
  scavenger: {
    mainHand: { id: 'start_dagger', name: 'Sharpened Shard', type: 'weapon', subtype: 'dagger', char: '-', color: '#aaaaaa', rarity: 'common', value: 6, stats: { attack: 3 }, description: 'A jagged shard of hull plating honed to a keen edge.' },
    chest: { id: 'start_leather', name: "Duct Runner's Jacket", type: 'armor', subtype: 'chestplate', char: '[', color: '#886644', rarity: 'common', value: 10, stats: { defense: 1 }, description: 'A patched jacket favored by those who crawl the maintenance ducts.' },
  },
  pathfinder: {
    mainHand: { id: 'start_bow', name: 'Tension Launcher', type: 'weapon', subtype: 'bow', char: '}', color: '#aa8844', rarity: 'common', value: 8, stats: { attack: 3 }, description: 'A spring-loaded launcher cobbled together from scrap.' },
    chest: { id: 'start_hide', name: 'Padded Vest', type: 'armor', subtype: 'chestplate', char: '[', color: '#886644', rarity: 'common', value: 8, stats: { defense: 2 }, description: 'A sturdy vest layered with impact-absorbing padding.' },
  },
};

export class Player {
  constructor(name, race = 'deckborn', playerClass = 'sentinel') {
    this.name = name;
    this.race = race;
    this.playerClass = playerClass;
    this.char = '@';
    this.color = CLASS_COLORS[playerClass] || '#ffffff';
    this.position = { x: 0, y: 0 };

    const base = CLASS_BASE_STATS[playerClass] || CLASS_BASE_STATS.sentinel;
    this.stats = {
      hp: 20 + base.con,
      maxHp: 20 + base.con,
      mana: 10 + base.int,
      maxMana: 10 + base.int,
      str: base.str,
      dex: base.dex,
      con: base.con,
      int: base.int,
      wis: base.wis,
      cha: base.cha,
      level: 1,
      xp: 0,
      xpToNext: 100,
    };

    this.equipment = {
      head: null,
      chest: null,
      hands: null,
      legs: null,
      feet: null,
      mainHand: null,
      offHand: null,
      ring: null,
      amulet: null,
    };

    // Equip starting gear
    const startGear = CLASS_STARTING_GEAR[playerClass] || {};
    for (const slot of Object.keys(startGear)) {
      this.equipment[slot] = { ...startGear[slot] };
    }

    this.inventory = [];
    this.abilities = (CLASS_ABILITIES[playerClass] || []).map(a => ({ ...a }));
    this.quests = { active: [], completed: [] };
    this.knownLocations = new Set();
    this.gold = 50;
  }

  addXP(amount) {
    this.stats.xp += amount;
    const leveled = [];
    while (this.stats.xp >= this.stats.xpToNext) {
      this.stats.xp -= this.stats.xpToNext;
      this.stats.level++;
      this.stats.xpToNext = this.stats.level * 100;

      // Stat gains on level up
      this.stats.maxHp += 5 + Math.floor(this.stats.con / 4);
      this.stats.hp = this.stats.maxHp;
      this.stats.maxMana += 2 + Math.floor(this.stats.int / 4);
      this.stats.mana = this.stats.maxMana;
      this.stats.str += 1;
      this.stats.dex += 1;
      this.stats.con += 1;
      this.stats.int += 1;
      this.stats.wis += 1;
      this.stats.cha += 1;

      leveled.push(this.stats.level);
    }
    return leveled;
  }

  getAttackPower() {
    let power = Math.floor(this.stats.str / 2);
    for (const slot of Object.values(this.equipment)) {
      if (slot && slot.stats && slot.stats.attack) {
        power += slot.stats.attack;
      }
    }
    return power;
  }

  getDefense() {
    let defense = Math.floor(this.stats.con / 4);
    for (const slot of Object.values(this.equipment)) {
      if (slot && slot.stats && slot.stats.defense) {
        defense += slot.stats.defense;
      }
    }
    return defense;
  }

  heal(amount) {
    this.stats.hp = Math.min(this.stats.maxHp, this.stats.hp + amount);
  }

  takeDamage(amount) {
    const mitigated = Math.max(1, amount - this.getDefense());
    this.stats.hp -= mitigated;
    return mitigated;
  }

  addItem(item) {
    if (this.inventory.length >= 20) {
      return false;
    }
    this.inventory.push(item);
    return true;
  }

  removeItem(itemId) {
    const idx = this.inventory.findIndex(i => i.id === itemId);
    if (idx === -1) return null;
    return this.inventory.splice(idx, 1)[0];
  }

  equip(item) {
    const slotMap = {
      sword: 'mainHand', axe: 'mainHand', mace: 'mainHand', dagger: 'mainHand',
      staff: 'mainHand', bow: 'mainHand',
      helmet: 'head', chestplate: 'chest', gloves: 'hands', leggings: 'legs',
      boots: 'feet', shield: 'offHand',
      ring: 'ring', amulet: 'amulet',
    };

    const slot = slotMap[item.subtype] || slotMap[item.type];
    if (!slot) return false;

    // Unequip current item in that slot back to inventory
    const current = this.equipment[slot];
    if (current) {
      if (!this.addItem(current)) return false;
    }

    // Remove new item from inventory and equip it
    this.removeItem(item.id);
    this.equipment[slot] = item;
    return true;
  }

  unequip(slot) {
    const item = this.equipment[slot];
    if (!item) return false;
    if (!this.addItem(item)) return false;
    this.equipment[slot] = null;
    return true;
  }

  isDead() {
    return this.stats.hp <= 0;
  }
}

// ============================================================================
// ItemGenerator — Generates weapons, armor, potions, scrolls, and more
// ============================================================================

const WEAPON_SUBTYPES = {
  sword:  { char: '/', baseDmg: 5, name: 'Sword' },
  axe:    { char: '\\', baseDmg: 6, name: 'Axe' },
  mace:   { char: '|', baseDmg: 5, name: 'Mace' },
  dagger: { char: '-', baseDmg: 3, name: 'Dagger' },
  staff:  { char: '~', baseDmg: 3, name: 'Staff' },
  bow:    { char: '}', baseDmg: 4, name: 'Bow' },
};

const ARMOR_SUBTYPES = {
  helmet:     { char: '^', baseDef: 2, name: 'Helmet' },
  chestplate: { char: '[', baseDef: 4, name: 'Chestplate' },
  gloves:     { char: '{', baseDef: 1, name: 'Gloves' },
  leggings:   { char: '=', baseDef: 3, name: 'Leggings' },
  boots:      { char: '_', baseDef: 1, name: 'Boots' },
  shield:     { char: ']', baseDef: 3, name: 'Shield' },
};

const ITEM_PREFIXES = [
  { name: 'Corroded',       statMul: 0.7 },
  { name: 'Tempered',       statMul: 1.0 },
  { name: 'Reinforced',     statMul: 1.2 },
  { name: 'Salvaged',       statMul: 1.3 },
  { name: 'Jury-Rigged',    statMul: 1.1 },
  { name: 'Reactor-Forged', statMul: 1.4 },
  { name: 'Welded',         statMul: 1.4 },
  { name: 'Polished',       statMul: 1.3 },
  { name: 'Overclocked',    statMul: 1.5 },
  { name: "Builder's",      statMul: 1.6 },
  { name: 'Void-Touched',   statMul: 1.5 },
  { name: 'Ancient',        statMul: 1.7 },
  { name: 'Plated',         statMul: 1.3 },
  { name: 'Core-Tempered',  statMul: 1.8 },
  { name: 'Arch-Blessed',   statMul: 2.0 },
];

const ITEM_SUFFIXES = [
  { name: 'of the Piston',    bonus: { str: 2 } },
  { name: 'of Circuitry',     bonus: { dex: 2 } },
  { name: 'of the Builders',  bonus: { wis: 2 } },
  { name: 'of the Hull',      bonus: { con: 3 } },
  { name: 'of the Reactor',   bonus: { attack: 3 } },
  { name: 'of the Conduit',   bonus: { defense: 2 } },
  { name: 'of the Arch',      bonus: { dex: 3 } },
  { name: 'of the Void',      bonus: { str: 3 } },
  { name: 'of the Grid',      bonus: { int: 2 } },
  { name: 'of the Core',      bonus: { hp: 10 } },
  { name: 'of the Forge',     bonus: { attack: 2 } },
  { name: 'of Plating',       bonus: { defense: 3 } },
  { name: 'of the Archives',  bonus: { wis: 3, int: 2 } },
  { name: 'of Breaching',     bonus: { attack: 5 } },
  { name: 'of the Furnace',   bonus: { hp: 15, str: 1 } },
];

const RARITY_MULTIPLIERS = {
  common:    { stat: 1.0, value: 1.0 },
  uncommon:  { stat: 1.3, value: 2.0 },
  rare:      { stat: 1.7, value: 4.0 },
  epic:      { stat: 2.2, value: 8.0 },
  legendary: { stat: 3.0, value: 16.0 },
};

const RARITY_COLORS = {
  common:    '#aaaaaa',
  uncommon:  '#44cc44',
  rare:      '#4488ff',
  epic:      '#bb44ee',
  legendary: '#ffaa00',
};

const POTION_BASES = [
  { name: 'Medi-Stim',        subtype: 'healing',  color: '#ff4444', effect: { heal: 20 },              value: 15, description: 'A pressurized stim that restores health.' },
  { name: 'Focus Serum',      subtype: 'mana',     color: '#4444ff', effect: { mana: 20 },              value: 15, description: 'A blue serum that sharpens focus and restores mana.' },
  { name: 'Strength Stim',    subtype: 'strength', color: '#ff8800', effect: { str: 3, duration: 50 },  value: 25, description: 'An orange stimulant that temporarily boosts strength.' },
  { name: 'Vigor Injection',  subtype: 'poison',   color: '#44ff44', effect: { damage: 15 },            value: 20, description: 'A sickly green injection. Probably not for self-use.' },
  { name: 'Chem Flask',       subtype: 'healing',  color: '#ff6666', effect: { heal: 15 },              value: 12, description: 'A flask of medicinal chemicals.' },
  { name: 'Nano-Salve',       subtype: 'healing',  color: '#ffaaaa', effect: { heal: 25 },              value: 20, description: 'A paste infused with repair nanites.' },
];

const SCROLL_BASES = [
  { name: 'Arc Blast Charge',      effect: 'fireball',  damage: 20, value: 30, description: 'Unleash a burst of electrical energy upon activation.' },
  { name: 'Phase Shift Module',    effect: 'teleport',  damage: 0,  value: 40, description: 'Instantly phase-shift to a random position on the deck.' },
  { name: 'Diagnostic Pulse',      effect: 'identify',  damage: 0,  value: 20, description: 'Reveals the true properties of a piece of equipment.' },
  { name: 'Cryo Burst Cell',       effect: 'enchant',   damage: 0,  value: 50, description: 'Enhance an item with cryo-infused properties.' },
  { name: 'Energy Spike',          effect: 'map',       damage: 0,  value: 25, description: 'Sends out an energy pulse that maps the current level.' },
  { name: 'Shield Emitter',        effect: 'lightning', damage: 25, value: 35, description: 'A directed energy bolt strikes the nearest enemy.' },
];

const FOOD_BASES = [
  { name: 'Ration Bar',      heal: 5,  value: 3,  description: 'A dense nutrient bar. Filling enough.' },
  { name: 'Protein Block',   heal: 8,  value: 5,  description: 'A hearty block of compressed protein.' },
  { name: 'Dried Fungus',    heal: 10, value: 6,  description: 'Preserved strips of tunnel-grown fungus.' },
  { name: 'Synth Bread',     heal: 20, value: 15, description: 'Light and nourishing. A single slice sustains for a cycle.' },
  { name: 'Nutrient Paste',  heal: 12, value: 8,  description: 'A tube of nutrient-rich paste. Tasteless but effective.' },
  { name: 'Hydro-Fruit',     heal: 8,  value: 6,  description: 'A plump fruit grown in the hydro-bays.' },
];

const MATERIAL_BASES = [
  { name: 'Scrap Metal',       value: 5,  description: 'A chunk of salvageable scrap metal.' },
  { name: 'Copper Coil',       value: 25, description: 'A coil of refined copper wire.' },
  { name: 'Reactor Shard',     value: 40, description: 'A fragment of reactor core material. Highly valuable.' },
  { name: 'Circuit Board',     value: 80, description: 'An intact circuit board from a Builder system. Very rare.' },
  { name: 'Hull Fragment',     value: 60, description: 'A piece of the original Builder hull alloy.' },
  { name: 'Fiber Optic Cable', value: 8,  description: 'A length of fiber optic cable, ready for use.' },
];

const ARTIFACT_BASES = [
  { name: 'Crown of the Lost Overseer',       stats: { int: 5, wis: 5, cha: 5 },  description: 'A circlet worn by an overseer whose name has been lost to the archives.' },
  { name: 'Blade of the First Light',         stats: { attack: 12, str: 4 },      description: 'A radiant blade said to have been forged when the colony first powered on.' },
  { name: 'Gauntlets of the Titan Frame',     stats: { str: 8, attack: 4 },       description: 'Massive powered gauntlets that grant the strength of a loader mech.' },
  { name: 'Amulet of the Core',               stats: { defense: 6, wis: 6 },      description: 'An amulet that pulses with reactor energy, absorbing harmful radiation.' },
  { name: 'Ring of the Sealed Sector',        stats: { hp: 30, con: 5 },           description: 'A ring recovered from a sealed sector, pulsing with life-sustaining energy.' },
];

export class ItemGenerator {
  // Roll a rarity using weighted probabilities, influenced by depth
  rollRarity(rng, depth = 1) {
    const depthBonus = Math.min(depth * 0.02, 0.15); // deeper = slightly better loot
    return rng.weighted([
      { value: 'common',    weight: Math.max(0.1, 0.50 - depthBonus) },
      { value: 'uncommon',  weight: 0.28 },
      { value: 'rare',      weight: 0.14 + depthBonus * 0.5 },
      { value: 'epic',      weight: 0.06 + depthBonus * 0.3 },
      { value: 'legendary', weight: 0.02 + depthBonus * 0.2 },
    ]);
  }

  // Roll a stat value using gaussian distribution (bell curve centered on base)
  rollStat(rng, base, spread = 0.2) {
    const raw = rng.gaussian(base, base * spread);
    return Math.max(1, Math.round(raw));
  }

  generate(rng, typeOrOpts = 'weapon', rarity = 'common', depth = 1) {
    // Accept either positional args or an options object
    let type = typeOrOpts;
    if (typeOrOpts && typeof typeOrOpts === 'object') {
      type = typeOrOpts.type || 'weapon';
      rarity = typeOrOpts.rarity || 'common';
      depth = typeOrOpts.depth || typeOrOpts.level || 1;
    }
    const rarityMul = RARITY_MULTIPLIERS[rarity] || RARITY_MULTIPLIERS.common;
    const depthScale = 1 + depth * 0.1;

    switch (type) {
      case 'weapon':   return this._generateWeapon(rng, rarity, rarityMul, depthScale);
      case 'armor':    return this._generateArmor(rng, rarity, rarityMul, depthScale);
      case 'potion':   return this._generatePotion(rng, rarity);
      case 'scroll':   return this._generateScroll(rng, rarity);
      case 'food':     return this._generateFood(rng);
      case 'ring':     return this._generateAccessory(rng, 'ring', '=', rarity, rarityMul, depthScale);
      case 'amulet':   return this._generateAccessory(rng, 'amulet', '"', rarity, rarityMul, depthScale);
      case 'material': return this._generateMaterial(rng);
      case 'artifact': return this._generateArtifact(rng, depthScale);
      default:         return this._generateWeapon(rng, rarity, rarityMul, depthScale);
    }
  }

  _generateWeapon(rng, rarity, rarityMul, depthScale) {
    const subtypeKeys = Object.keys(WEAPON_SUBTYPES);
    const subtypeKey = rng.random(subtypeKeys);
    const subtype = WEAPON_SUBTYPES[subtypeKey];

    let name = subtype.name;
    let prefix = null;
    let suffix = null;
    const stats = {};

    const baseAttack = Math.round(subtype.baseDmg * rarityMul.stat * depthScale);
    stats.attack = this.rollStat(rng, baseAttack);

    if (rarity !== 'common') {
      if (rng.chance(0.7)) {
        prefix = rng.random(ITEM_PREFIXES);
        stats.attack = Math.round(stats.attack * prefix.statMul);
      }
      if (rng.chance(0.5)) {
        suffix = rng.random(ITEM_SUFFIXES);
        for (const [k, v] of Object.entries(suffix.bonus)) {
          stats[k] = (stats[k] || 0) + v;
        }
      }
    }

    if (prefix) name = `${prefix.name} ${name}`;
    if (suffix) name = `${name} ${suffix.name}`;

    const value = Math.round(10 * rarityMul.value * depthScale);

    return {
      id: nextId('item'),
      name,
      type: 'weapon',
      subtype: subtypeKey,
      rarity,
      char: subtype.char,
      color: RARITY_COLORS[rarity],
      value,
      stats,
      description: `A ${rarity} ${subtypeKey} suitable for combat.`,
    };
  }

  _generateArmor(rng, rarity, rarityMul, depthScale) {
    const subtypeKeys = Object.keys(ARMOR_SUBTYPES);
    const subtypeKey = rng.random(subtypeKeys);
    const subtype = ARMOR_SUBTYPES[subtypeKey];

    let name = subtype.name;
    let prefix = null;
    let suffix = null;
    const stats = {};

    const baseDef = Math.round(subtype.baseDef * rarityMul.stat * depthScale);
    stats.defense = this.rollStat(rng, baseDef);

    if (rarity !== 'common') {
      if (rng.chance(0.7)) {
        prefix = rng.random(ITEM_PREFIXES);
        stats.defense = Math.round(stats.defense * prefix.statMul);
      }
      if (rng.chance(0.5)) {
        suffix = rng.random(ITEM_SUFFIXES);
        for (const [k, v] of Object.entries(suffix.bonus)) {
          stats[k] = (stats[k] || 0) + v;
        }
      }
    }

    if (prefix) name = `${prefix.name} ${name}`;
    if (suffix) name = `${name} ${suffix.name}`;

    const value = Math.round(12 * rarityMul.value * depthScale);

    return {
      id: nextId('item'),
      name,
      type: 'armor',
      subtype: subtypeKey,
      rarity,
      char: subtype.char,
      color: RARITY_COLORS[rarity],
      value,
      stats,
      description: `A ${rarity} piece of ${subtypeKey} armor.`,
    };
  }

  _generateAccessory(rng, type, char, rarity, rarityMul, depthScale) {
    const suffix = rng.random(ITEM_SUFFIXES);
    const stats = {};
    for (const [k, v] of Object.entries(suffix.bonus)) {
      stats[k] = v;
    }
    const materialName = rng.random(['Golden', 'Silver', 'Bronze', 'Crystal', 'Obsidian', 'Jade']);
    const typeName = type === 'ring' ? 'Ring' : 'Amulet';
    const name = `${materialName} ${typeName} ${suffix.name}`;
    const value = Math.round(20 * rarityMul.value * depthScale);

    return {
      id: nextId('item'),
      name,
      type,
      subtype: type,
      rarity,
      char,
      color: RARITY_COLORS[rarity],
      value,
      stats,
      description: `A ${rarity} ${type} shimmering with enchantment.`,
    };
  }

  _generatePotion(rng, rarity) {
    const base = rng.random(POTION_BASES);
    const mul = rarity === 'common' ? 1 : rarity === 'uncommon' ? 1.5 : 2;
    const effect = {};
    for (const [k, v] of Object.entries(base.effect)) {
      effect[k] = typeof v === 'number' ? Math.round(v * mul) : v;
    }

    return {
      id: nextId('item'),
      name: mul > 1 ? `Greater ${base.name}` : base.name,
      type: 'potion',
      subtype: base.subtype,
      rarity,
      char: '!',
      color: base.color,
      value: Math.round(base.value * mul),
      stats: {},
      effect,
      description: base.description,
    };
  }

  _generateScroll(rng, rarity) {
    const base = rng.random(SCROLL_BASES);
    const mul = rarity === 'common' ? 1 : rarity === 'uncommon' ? 1.5 : 2;

    return {
      id: nextId('item'),
      name: base.name,
      type: 'scroll',
      subtype: base.effect,
      rarity,
      char: '?',
      color: '#f0f0cc',
      value: Math.round(base.value * mul),
      stats: {},
      effect: { type: base.effect, damage: Math.round(base.damage * mul) },
      description: base.description,
    };
  }

  _generateFood(rng) {
    const base = rng.random(FOOD_BASES);

    return {
      id: nextId('item'),
      name: base.name,
      type: 'food',
      subtype: 'food',
      rarity: 'common',
      char: '%',
      color: '#cc8844',
      value: base.value,
      stats: {},
      effect: { heal: base.heal },
      description: base.description,
    };
  }

  _generateMaterial(rng) {
    const mat = rng.random(MATERIAL_BASES);

    return {
      id: nextId('item'),
      name: mat.name,
      type: 'material',
      subtype: 'material',
      rarity: 'common',
      char: '*',
      color: '#ddcc88',
      value: mat.value,
      stats: {},
      description: mat.description,
    };
  }

  _generateArtifact(rng, depthScale) {
    const art = rng.random(ARTIFACT_BASES);
    const scaledStats = {};
    for (const [k, v] of Object.entries(art.stats)) {
      scaledStats[k] = Math.round(v * depthScale);
    }

    return {
      id: nextId('item'),
      name: art.name,
      type: 'artifact',
      subtype: 'artifact',
      rarity: 'legendary',
      char: '&',
      color: RARITY_COLORS.legendary,
      value: Math.round(200 * depthScale),
      stats: scaledStats,
      description: art.description,
    };
  }
}

// ============================================================================
// CreatureGenerator — Biome-specific enemy generation with abilities
// ============================================================================

const CREATURE_TABLES = {
  overgrowth: [
    { name: 'Feral Hound', char: 'w', color: '#888888', behavior: 'aggressive', hp: 12, attack: 4, defense: 2, xpBase: 15 },
    { name: 'Vine Crawler', char: 'S', color: '#448844', behavior: 'ambush', hp: 10, attack: 5, defense: 1, xpBase: 18, ability: 'poison' },
    { name: 'Overgrown Sentinel', char: 'T', color: '#226622', behavior: 'patrol', hp: 30, attack: 6, defense: 5, xpBase: 40, ability: 'rootGrab' },
    { name: 'Raider', char: 'B', color: '#AA8844', behavior: 'aggressive', hp: 15, attack: 5, defense: 3, xpBase: 20, faction: 'RAIDERS' },
    { name: 'Tunnel Boar', char: 'b', color: '#886644', behavior: 'coward', hp: 14, attack: 4, defense: 3, xpBase: 12 },
    { name: 'Glow Moth', char: 'f', color: '#44FF44', behavior: 'coward', hp: 6, attack: 2, defense: 1, xpBase: 8 },
  ],
  maintenance: [
    { name: 'Tunnel Bat', char: 'b', color: '#886688', behavior: 'aggressive', hp: 8, attack: 3, defense: 1, xpBase: 10 },
    { name: 'Gel Mass', char: 's', color: '#44AA44', behavior: 'patrol', hp: 20, attack: 2, defense: 4, xpBase: 15, ability: 'acidSplash' },
    { name: 'Hull Brute', char: 'T', color: '#668866', behavior: 'aggressive', hp: 35, attack: 8, defense: 4, xpBase: 50, ability: 'regenerate' },
    { name: 'Cable Rat', char: 'k', color: '#AA6644', behavior: 'coward', hp: 8, attack: 3, defense: 2, xpBase: 8 },
    { name: 'Structural Golem', char: 'G', color: '#888888', behavior: 'patrol', hp: 40, attack: 6, defense: 8, xpBase: 45 },
  ],
  sealed_sector: [
    { name: 'Corroded Drone', char: 's', color: '#CCCCCC', behavior: 'aggressive', hp: 12, attack: 4, defense: 2, xpBase: 15, faction: 'ROGUE_MACHINES' },
    { name: 'Static Wraith', char: 'W', color: '#8888FF', behavior: 'aggressive', hp: 18, attack: 7, defense: 1, xpBase: 35, ability: 'lifeDrain', faction: 'ROGUE_MACHINES' },
    { name: 'Depressurized Husk', char: 'z', color: '#668866', behavior: 'patrol', hp: 20, attack: 3, defense: 3, xpBase: 12, faction: 'ROGUE_MACHINES' },
    { name: 'Rogue AI Node', char: 'L', color: '#AA00FF', behavior: 'aggressive', hp: 50, attack: 12, defense: 5, xpBase: 100, ability: 'necroBolt', isBoss: true, faction: 'ROGUE_MACHINES' },
    { name: 'Phantom Signal', char: 'g', color: '#AAAAFF', behavior: 'ambush', hp: 10, attack: 5, defense: 0, xpBase: 20, ability: 'phaseThrough', faction: 'ROGUE_MACHINES' },
  ],
  waste: [
    { name: 'Sludge Hag', char: 'H', color: '#448844', behavior: 'ambush', hp: 22, attack: 6, defense: 3, xpBase: 30, ability: 'curse' },
    { name: 'Pipe Lurker', char: 'L', color: '#446644', behavior: 'ambush', hp: 25, attack: 5, defense: 5, xpBase: 25 },
    { name: 'Toxic Toad', char: 't', color: '#66AA44', behavior: 'coward', hp: 8, attack: 2, defense: 2, xpBase: 8, ability: 'poison' },
    { name: 'Waste Wisp', char: '*', color: '#88FFFF', behavior: 'coward', hp: 5, attack: 3, defense: 0, xpBase: 12 },
  ],
  scorched: [
    { name: 'Slag Scorpion', char: 'S', color: '#AA8844', behavior: 'aggressive', hp: 16, attack: 6, defense: 4, xpBase: 22, ability: 'poison' },
    { name: 'Fused Walker', char: 'M', color: '#AAAA88', behavior: 'patrol', hp: 28, attack: 5, defense: 6, xpBase: 35, ability: 'curse', faction: 'ROGUE_MACHINES' },
    { name: 'Bore Worm', char: 'W', color: '#CCAA66', behavior: 'ambush', hp: 40, attack: 10, defense: 3, xpBase: 55 },
    { name: 'Heat Vent Shade', char: 'd', color: '#CCAA88', behavior: 'patrol', hp: 12, attack: 4, defense: 1, xpBase: 15 },
  ],
  bulkhead: [
    { name: 'Conduit Beast', char: 'l', color: '#CCAA66', behavior: 'aggressive', hp: 18, attack: 6, defense: 3, xpBase: 25 },
    { name: 'Vent Screamer', char: 'h', color: '#AA88CC', behavior: 'aggressive', hp: 14, attack: 5, defense: 2, xpBase: 20, ability: 'screech' },
    { name: 'Hull Titan', char: 'G', color: '#888888', behavior: 'patrol', hp: 50, attack: 10, defense: 8, xpBase: 60, isBoss: true },
    { name: 'Strut Crawler', char: 'W', color: '#448844', behavior: 'aggressive', hp: 30, attack: 8, defense: 4, xpBase: 45 },
  ],
  derelict: [
    { name: 'Feral Colonist', char: 'g', color: '#55AA55', behavior: 'coward', hp: 10, attack: 3, defense: 2, xpBase: 10 },
    { name: 'Corroded Drone', char: 's', color: '#CCCCCC', behavior: 'aggressive', hp: 12, attack: 4, defense: 2, xpBase: 15, faction: 'ROGUE_MACHINES' },
    { name: 'Tunnel Rat', char: 'r', color: '#886644', behavior: 'coward', hp: 5, attack: 2, defense: 1, xpBase: 5 },
    { name: 'Cable Parasite', char: 'S', color: '#448844', behavior: 'ambush', hp: 10, attack: 5, defense: 1, xpBase: 18, ability: 'poison' },
    { name: 'Scrap Raider', char: 'z', color: '#668866', behavior: 'patrol', hp: 20, attack: 3, defense: 3, xpBase: 12, faction: 'RAIDERS' },
    { name: 'Rogue Technician', char: 'B', color: '#AA8844', behavior: 'aggressive', hp: 15, attack: 5, defense: 3, xpBase: 20, faction: 'RAIDERS' },
    { name: 'Salvage Mimic', char: '!', color: '#FFDD44', behavior: 'ambush', hp: 22, attack: 6, defense: 4, xpBase: 35 },
  ],
};

const ABILITY_EFFECTS = {
  poison:      { name: 'Toxin Leak', damage: 3, duration: 3, type: 'dot', description: 'Leaks corrosive toxin for 3 turns.' },
  lifeDrain:   { name: 'Energy Siphon', damage: 5, heal: 5, type: 'drain', description: 'Siphons energy from the target.' },
  fireball:    { name: 'Arc Blast', damage: 8, type: 'magic', description: 'Fires a concentrated arc of electricity.' },
  necroBolt:   { name: 'Disruptor Bolt', damage: 10, type: 'magic', description: 'A bolt of scrambling energy.' },
  acidSplash:  { name: 'Acid Splash', damage: 4, armorReduce: 1, type: 'debuff', description: 'Corrodes plating and armor.' },
  rootGrab:    { name: 'Vine Snare', damage: 2, stun: true, type: 'control', description: 'Overgrown vines hold the target in place.' },
  curse:       { name: 'System Glitch', damage: 0, attackReduce: 2, type: 'debuff', description: 'Disrupts targeting systems.' },
  screech:     { name: 'Vent Scream', damage: 0, defenseReduce: 2, type: 'debuff', description: 'A deafening scream reverberates through the vents.' },
  regenerate:  { name: 'Auto-Repair', damage: 0, healSelf: 5, type: 'heal', description: 'Slowly regenerates structural integrity.' },
  phaseThrough:{ name: 'Phase Shift', damage: 0, type: 'utility', description: 'Can phase through bulkheads.' },
};

export class CreatureGenerator {
  generate(rng, biome = 'derelict', depth = 1, playerLevel = 1) {
    const table = CREATURE_TABLES[biome] || CREATURE_TABLES.derelict;
    const template = rng.random(table);
    const depthScale = 1 + depth * 0.15;
    const levelScale = 1 + (playerLevel - 1) * 0.1;
    const scale = depthScale * levelScale;

    const hp = Math.round(template.hp * scale);
    const creature = {
      id: nextId('creature'),
      name: template.name,
      char: template.char,
      color: template.color,
      position: { x: 0, y: 0 },
      behavior: template.behavior,
      stats: {
        hp,
        maxHp: hp,
        attack: Math.round(template.attack * scale),
        defense: Math.round(template.defense * scale),
        level: Math.max(1, Math.floor(depth + playerLevel * 0.5)),
      },
      faction: template.faction || 'HOSTILE_FAUNA',
      isBoss: template.isBoss || false,
      isElite: rng.chance(0.1),
      xpBase: Math.round(template.xpBase * scale),
      ability: template.ability ? { ...ABILITY_EFFECTS[template.ability] } : null,
      getAttackPower() { return this.stats.attack; },
      getDefense() { return this.stats.defense; },
    };

    // Elite boost
    if (creature.isElite && !creature.isBoss) {
      creature.name = 'Elite ' + creature.name;
      creature.stats.hp = Math.round(creature.stats.hp * 1.5);
      creature.stats.maxHp = creature.stats.hp;
      creature.stats.attack = Math.round(creature.stats.attack * 1.3);
      creature.xpBase = Math.round(creature.xpBase * 2);
    }

    return creature;
  }
}
