// ============================================================================
// entities.js — Entity/NPC system for ASCIIQUEST, a colony salvage roguelike
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
  human: {
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
      'Ashford', 'Ironwood', 'Thornwall', 'Greymoor', 'Stonebridge',
      'Misthollow', 'Oakhart', 'Shadowmere', 'Frostborn', 'Emberglow',
      'Ravencroft', 'Briarstone', 'Driftwood', 'Glenward', 'Moorfield',
      'Brookshire', 'Aldenmere', 'Holloway', 'Wrenfield', 'Hearthstone',
    ],
  },
  enhanced: {
    male: [
      'Axion', 'Cael', 'Dex', 'Eris', 'Fen', 'Hex', 'Jace', 'Kai',
      'Lux', 'Nyx', 'Orion', 'Pax', 'Quill', 'Riven', 'Sol',
      'Talon', 'Vex', 'Wynd', 'Zale', 'Aether',
    ],
    female: [
      'Aria', 'Nova', 'Lyra', 'Selene', 'Vela', 'Zara', 'Iris',
      'Astra', 'Cira', 'Elara', 'Freya', 'Helia', 'Juno', 'Kira',
      'Mira', 'Naia', 'Phoebe', 'Rhea', 'Seren', 'Thea',
    ],
    last: [
      'Strand', 'Lumen', 'Helix', 'Prism', 'Voss', 'Crest', 'Flux',
      'Gale', 'Haze', 'Drift', 'Shear', 'Bloom', 'Frost', 'Gleam',
      'Thorn', 'Pale', 'Stark', 'Veil', 'Wynn', 'Bright',
    ],
  },
  cyborg: {
    male: [
      'Bolt', 'Crank', 'Gauge', 'Rivet', 'Solder', 'Arc', 'Clamp',
      'Drill', 'Forge', 'Grind', 'Jack', 'Knox', 'Mech', 'Pike',
      'Rust', 'Slag', 'Tank', 'Weld', 'CY-7', 'RK-12',
    ],
    female: [
      'Sparks', 'Nixie', 'Torque', 'Chrome', 'Zinc', 'Ada', 'Chip',
      'Dynamo', 'Fuse', 'Gear', 'Iris-9', 'Jolt', 'Kev', 'Link',
      'Magnet', 'Neon', 'Ohm', 'Pulse', 'Relay', 'Switch',
    ],
    last: [
      'Ironcore', 'Steelhand', 'Deepweld', 'Coalarm', 'Anvilborn',
      'Copperlung', 'Forgeheart', 'Goldwire', 'Hammerlock', 'Rockstead',
      'Shalebreak', 'Tinderfoot', 'Gritspur', 'Brassframe', 'Grudgebane',
      'Orekeeper', 'Circuitbend', 'Slagworth', 'Cragborn', 'Dusthewn',
    ],
  },
};

const NICKNAMES = [
  'the Reliable', 'the Bold', 'Voidwalker', 'Datakeeper', 'the Wise',
  'Ironwill', 'Stormcaller', 'the Drifter', 'Steelnerve', 'the Swift',
  'Deckrunner', 'the Silent', 'Wallbreaker', 'the Merciful', 'Nightcrawler',
  'the Just', 'Oathkeeper', 'the Unyielding', 'Rustjaw', 'Circuitheart',
];

const PLACE_PREFIXES = [
  'Rust', 'Iron', 'Hull', 'Grey', 'Steel', 'Vent', 'Deck', 'Arc',
  'Core', 'Drift', 'Junk', 'Wire', 'Bolt', 'Hatch', 'Pipe',
];

const PLACE_SUFFIXES = [
  'hold', 'gate', 'bay', 'haven', 'lock', 'ward', 'sector', 'block',
  'well', 'den', 'works', 'port', 'watch', 'bridge', 'stack',
];

export class NameGenerator {
  generate(rng, race = 'human') {
    const pool = NAME_POOLS[race] || NAME_POOLS.human;
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
  merchant:   ['Supply Trader', 'Parts Dealer', 'Salvage Broker', 'Junk Peddler', 'Market Keeper'],
  blacksmith: ['Fabricator', 'Armorer', 'Weld Smith', 'Metalworker', 'Forge Operator'],
  barkeep:    ['Bar Operator', 'Canteen Keeper', 'Brew Master', 'Hydro Warden', 'Host'],
  priest:     ['Archivist', 'Data Keeper', 'Med-Tech', 'Record Warden', 'Lore Keeper'],
  guard:      ['Sector Guard', 'Gate Watchman', 'Patrol Captain', 'Sentry', 'Ward Keeper'],
  noble:      ['Administrator', 'Steward', 'Council Elder', 'Magistrate', 'Sector Chief'],
  farmer:     ['Agri-Tech', 'Field Tender', 'Hydroponist', 'Greenhouse Op', 'Soil Tech'],
  miner:      ['Excavator', 'Tunnel Foreman', 'Ore Prospector', 'Hull Cutter', 'Deep Salvager'],
  hunter:     ['Scout', 'Trapper', 'Recon Specialist', 'Patrol Runner', 'Zone Walker'],
  scholar:    ['Researcher', 'Lorekeeper', 'Data Analyst', 'Chronicler', 'Archivist'],
  beggar:     ['Drifter', 'Vagabond', 'Scrap Beggar', 'Wanderer', 'Wretch'],
  child:      ['Youngster', 'Urchin', 'Young One', 'Little One', 'Apprentice'],
};

const SECRET_TEMPLATES = [
  'is secretly a former operative for a rival sector chief',
  'was once a council member before being disgraced',
  'knows the location of a hidden pre-collapse data vault',
  'is wanted in another sector for theft of colony supplies',
  'worships a forbidden AI construct from the old systems',
  'has a child hidden in a neighboring sector',
  'sabotaged the previous sector administrator',
  'can interpret ancient colony schematics that appear in corrupted data',
  'stole their identity from a dead colonist',
  'is a spy for a rival faction',
  'owes a massive debt to the Salvage Guild',
  'accidentally caused the hull breach that depressurized an entire quarter',
  'possesses a forbidden data core hidden beneath their bunk',
  'was raised by scavengers in the outer hull',
  'knows a secret maintenance tunnel beneath the sector',
  'made a deal with a rogue AI long ago',
  'is descended from one of the original colony founders',
  'witnessed a murder in the maintenance tunnels and never spoke of it',
  'has a twin sibling in another sector no one knows about',
  'can read the ancient colony programming language',
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
  'The Colony Guard', 'The Salvage Guild', 'The Syndicate', 'The Archive Keepers',
  'The Colony Guard', 'Free Traders', 'The Colony Council', 'None',
];

export class NPCGenerator {
  constructor() {
    this.nameGen = new NameGenerator();
  }

  generate(rng, role = 'farmer', race = 'human', locationContext = null) {
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
    if (role === 'merchant' || role === 'blacksmith') faction = 'The Salvage Guild';
    if (role === 'guard' || role === 'knight') faction = 'The Colony Guard';
    if (role === 'priest') faction = 'The Archive Keepers';

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
    'By the Founders, good to see you again!',
    'Safe corridors! How goes the salvage?',
    'Ah, my favorite visitor returns!',
    'Well met, friend! What can I do for you today?',
    'May the hull hold! Come in, come in.',
    'You look well! The outer decks treated you kindly.',
    'Welcome, welcome! I was hoping you would stop by.',
    'The old systems watch over us! Good to see a friendly face.',
    'Ho there! Pull up a crate and rest your legs.',
    'The wanderer returns! What news from the sectors?',
  ],
  neutral: [
    'What brings you to this sector?',
    'State your business.',
    "I don't believe we've met.",
    'Can I help you with something?',
    'Yes? What do you need?',
    'Hmm. You look like a drifter.',
    'Another scavenger. What do you want?',
    "If you're looking for trouble, try the collapsed levels.",
    'Speak up, I have not got all day.',
    'Well? Spit it out.',
  ],
  hostile: [
    'Stay back!',
    'Not you again...',
    'I thought I told you to leave this sector!',
    "Get out of my sight before I call the guard!",
    "You've got some nerve showing your face around here.",
  ],
};

const RUMOR_TEMPLATES = [
  'They say {LOCATION} has been sealed since the last system failure...',
  'I heard {NPC_NAME} used to be a {PROFESSION} before settling in this sector.',
  'The lights on the old corridor have been flickering for weeks. Nobody knows why.',
  'The deep tunnels have been sealed ever since the collapse. Some say it was no accident.',
  'A scavenger was found dead near the outer bulkheads last cycle. Feral drones, they say.',
  "There's talk of system malfunctions spreading through the eastern sectors.",
  "The fabricator's apprentice vanished three cycles ago. Nobody's talking about it.",
  'They say strange signals were detected coming from beneath the old infrastructure.',
  "The recycled water has tasted strange lately. Some folk won't drink from the taps.",
  'An old hermit in the lower decks supposedly knows ancient repair techniques.',
  'I overheard the guard talking about something sealed in the sub-levels.',
  "The archive has been collecting more data cores than usual. Wonder what for.",
  'A strange drifter was asking questions about the original colony blueprints last cycle.',
  "They say there's Founder tech buried beneath {LOCATION}, if you dare to look.",
  'The harvest pods have been underproducing. Some blame the grid, others blame sabotage.',
  'I saw a hooded figure enter the collapsed levels at curfew.',
  "The administrator's daughter has been secretly meeting someone beyond the bulkheads.",
  'A tremor opened a breach near the old storage bay. Best stay away.',
  "Word is, the Syndicate is recruiting. Not that I'd know anything about that.",
  'Some say the rust is spreading... creeping further into the habitat each cycle.',
];

const TOPIC_DIALOGUE = {
  self: [
    "I've been living in this sector for as long as I can remember.",
    'My work keeps me busy, but I cannot complain.',
    "I used to wander the outer decks, but those days are behind me now.",
    "There's not much to tell, really. I'm just a simple {ROLE}.",
    'I learned my trade from my parent, and they from theirs.',
    "Name's {FIRST}. {TITLE} is what they call me around here.",
  ],
  location: [
    "This sector has seen better days, but it's home.",
    'The settlement was founded generations ago by the first colonists.',
    "Watch yourself around here. Not everyone's as friendly as me.",
    "We're a small community, but we look out for each other.",
    'The grow-pods around here are productive, if you know how to work them.',
    'Scavengers pass through here on their way to the core sectors.',
  ],
  faction: [
    'The {FACTION} keeps things running around here, for better or worse.',
    "I'm loyal to the {FACTION}, and they've done right by me.",
    'Between you and me, the {FACTION} has too much power.',
    'Without the {FACTION}, this sector would fall apart.',
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
      : 'the old ruins';
    const npcName = worldContext && worldContext.npcNames
      ? rng.random(worldContext.npcNames)
      : 'Old Kael';
    const profession = rng.random([
      'sector guard', 'smuggler', 'engineer', 'administrator', 'scavenger', 'scout', 'hydroponist',
      'patrol runner', 'parts dealer', 'deep salvager',
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
// LoreGenerator — Generates world history, backstories, and artifact lore
// ============================================================================

const WORLD_HISTORY_TEMPLATES = [
  'The colony was overrun by {ENEMY} {YEARS} cycles ago, and the habitat has never fully recovered.',
  'A terrible system failure swept through {REGION}, killing nearly half the population.',
  'The alliance between {FACTION1} and {FACTION2} was forged in desperation during the Siege of {LOCATION}.',
  'Long ago, a Founder engineer sealed a dangerous system beneath {LOCATION}, but the safeguards are weakening.',
  '{FACTION1} and {FACTION2} fought a bitter war over control of the colony council, leaving scars across the habitat.',
  'The old administrator vanished mysteriously {YEARS} cycles ago. Some say they still wander the outer decks.',
  'A dark anomaly appeared on the sensors {YEARS} cycles ago, heralding an age of system failures and change.',
  'The great data archive of {LOCATION} was purged by zealots who feared forbidden pre-collapse knowledge.',
  'The deep excavation tunnels were sealed after something was unearthed in the infrastructure below.',
  'A catastrophic hull breach reshaped the lower sectors {YEARS} cycles ago, depressurizing entire blocks.',
  'The Enhanced retreated to the upper decks after the betrayal at {LOCATION}, and few have been seen since.',
  'An order of colony wardens once protected the habitat, but they were disbanded under accusations of conspiracy.',
  'The ancient data cores were stolen {YEARS} cycles ago and never recovered. Some say they hold vital colony records.',
  'A reactor overload buried the old quarter of {LOCATION} under debris and toxic gas.',
  'The treaty that ended the Sector Wars is said to have been negotiated at the cost of both leaders.',
  'Legends speak of a Founder who sealed the First Breach at {LOCATION}, but scholars debate whether it truly happened.',
  'A cult of rogue engineers nearly reactivated a dormant defense system before they were stopped by {FACTION1}.',
  'The trade corridors were established {YEARS} cycles ago, bringing prosperity but also new dangers.',
];

const ARTIFACT_TEMPLATES = [
  'This device was fabricated by {SMITH} in the deep foundries of Sector {MOUNTAIN}.',
  'Legend says it grants {POWER} to its user, but at a terrible cost.',
  'It was last seen in the hands of {HERO}, who carried it into the final breach.',
  'The circuitry etched along its surface glows faintly in the presence of active colony systems.',
  'Crafted from salvaged alloy recovered from the old infrastructure {YEARS} cycles ago.',
  'It is said to be one of seven devices created by the Founders to sustain the colony.',
  'The programming was embedded by {SMITH}, the last of the great Founder engineers.',
  'Those who carry it long enough begin to hear transmissions from another era.',
  'It was believed destroyed during the fall of {LOCATION}, yet here it remains.',
  'The crystal set in its housing is said to contain a trapped AI fragment.',
  'Colonists have fought and died for generations over possession of this device.',
  'It was a gift from the Enhanced council to a human champion, ages past.',
  'Researchers believe it predates the founding of the colony by centuries.',
  'Its true function can only be unlocked when brought to {LOCATION}.',
  'The inscription reads: "May this tool serve the builders and shield the colony."',
  'It hums with a strange energy, as though it has a will of its own.',
  'According to legend, it cannot be destroyed by any known means.',
];

const LOCATION_TEMPLATES = [
  'Built as a {PURPOSE}, it has served the colony for {YEARS} cycles.',
  'The remains here date back to the Age of Founders, when the habitat was first built.',
  'This place was once a thriving trade hub, before the corridors fell into ruin.',
  'The locals avoid this place after lights-out, whispering of malfunctions and worse.',
  'A fierce battle was fought here {YEARS} cycles ago, and the bulkheads still bear the scars.',
  'It was constructed by Founder engineers, renowned for their mastery of alloy and circuitry.',
  'The water reclaimer at its center is said to produce the purest water in the colony.',
  'Scavengers have reported strange sounds emanating from deep below the decking.',
  'Once the seat of a powerful administrator, it fell into disrepair after the uprising.',
  'The corridor around it is unnaturally overgrown, as if the hydroponics have gone feral.',
  'Built atop a sealed maintenance shaft, it has always had a dark reputation.',
  'The walls bear faded schematics depicting a forgotten era of the colony.',
  'It served as a refuge during the Last Breach, sheltering hundreds of survivors.',
  'The architecture suggests Enhanced influence, though no Enhanced live here now.',
  'A thermal vent beneath the foundation keeps the deck warm even in the cold sectors.',
  'According to legend, a powerful Founder device lies hidden somewhere within.',
  'The displays depict the construction and expansion of the colony over generations.',
  'It was abandoned after a mysterious system failure swept through its inhabitants.',
];

const NPC_BACKSTORY_TEMPLATES = [
  'I used to be a {PROFESSION} before I settled in this sector.',
  'My family was from {PLACE}, but we had to evacuate when the breach came.',
  'I lost everything in the great hull failure and had to start over from nothing.',
  'My parent taught me this trade, and their parent before them.',
  'I came here seeking opportunity, but found something more valuable: stability.',
  'I served in the guard during the Sector Wars. Saw things I wish I could forget.',
  'I was an orphan, raised by the archivists at the old data center.',
  'I traveled the outer sectors for ten cycles before settling in this quiet corner.',
  "There's a reason I left my old life behind, and I'd rather not speak of it.",
  'I was apprenticed to a master fabricator who taught me everything I know.',
  'My mother was a med-tech, and she passed her knowledge on to me.',
  'I made my fortune in the trade corridors, but lost it all to bad luck and worse partners.',
  'I ran from my home sector as a child and never looked back.',
  'I once served an administrator, but they fell from grace and I had to find my own way.',
  'I found this sector by accident and decided it was as good as anywhere to stay.',
  'I survived a feral drone ambush and wandered the maintenance tunnels until I found civilization.',
  'My family has lived here for seven generations. This sector is in my blood.',
  'I came here to escape a feud. So far, no one has found me.',
  'I won this establishment in a game of cards. Best hand I ever played.',
  'I was once a researcher, but the politics of the council drove me away.',
];

const LORE_ENEMIES = [
  'a rogue drone swarm', 'reactivated defense bots', 'marauding scavengers', 'a rogue AI',
  'mutated vermin', 'the Rust Raiders', 'hull breach survivors gone feral',
  'an ancient defense grid awakened', 'the Syndicate enforcers',
];

const LORE_REGIONS = [
  'the Upper Decks', 'the Core Sectors', 'the Deep Hollows', 'the Outer Hull',
  'the Old Corridors', 'the Reactor District', 'the Overgrown Bays',
];

const LORE_POWERS = [
  'immense strength', 'predictive processing', 'optical camouflage', 'toxin resistance',
  'the ability to interface with dead systems', 'enhanced reflexes', 'an unbreakable energy shield',
  'control over maintenance drones', 'thermal immunity',
];

const LORE_SMITHS = [
  'Chief Engineer Durin', 'Founder Aelindor', 'the Blind Fabricator', 'Director Isolde',
  'Thargrim Steelhand', 'the ancient Founders', 'an unnamed Enhanced artisan',
];

const LORE_HEROES = [
  'Administrator Aldric the Bold', 'the Champion of the Colony', 'Selene the Wanderer',
  'Commander Roderick Ashford', 'the last Warden', 'the legendary Bolt Ironcore',
];

const LORE_MOUNTAINS = [
  'Erebus', 'Ashfall', 'Thunderpeak', 'Dragon Spire', 'Ironholme', 'Frosthold',
];

const LORE_PURPOSES = [
  'sector garrison', 'data archive', 'trade depot', 'mining outpost', 'watch station',
  "engineer's workshop", 'containment cell', "administrator's office", 'med-bay', 'server vault',
];

const LORE_PROFESSIONS = [
  'sector guard', 'deep salvager', 'smuggler', 'data analyst', 'parts dealer', 'pit fighter',
  'archive assistant', 'scout', 'hydroponist', 'patrol runner', 'contraband runner', "engineer's apprentice",
];

const LORE_PLACES = [
  'the central hub', 'a small agri-sector', 'the frontier beyond the outer hull',
  'the sealed sections', 'the Enhanced quarters', 'the Cyborg workshops', 'a distant sector',
  'the border checkpoints', 'the scorched reactor district', 'the upper deck passages',
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
      text = text.replace('{FACTION1}', 'the Colony Guard');
      text = text.replace('{FACTION2}', 'the Syndicate');
    }

    if (locationNames && locationNames.length > 0) {
      text = text.replace(/{LOCATION}/g, rng.random(locationNames));
    } else {
      text = text.replace(/{LOCATION}/g, 'the old ruins');
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
  junk_collector: '#aa8855',
  scavenger:      '#6666ee',
  mercenary:      '#dd4444',
  engineer:       '#44aa44',
};

const CLASS_BASE_STATS = {
  junk_collector: { str: 16, dex: 10, con: 14, int: 8,  wis: 10, cha: 10 },
  scavenger:      { str: 8,  dex: 10, con: 10, int: 16, wis: 14, cha: 10 },
  mercenary:      { str: 10, dex: 16, con: 10, int: 10, wis: 8,  cha: 14 },
  engineer:       { str: 12, dex: 14, con: 12, int: 10, wis: 12, cha: 10 },
};

const CLASS_ABILITIES = {
  junk_collector: [
    { name: 'Scrap Shield', manaCost: 5, damage: 8, type: 'melee', description: 'Raise a wall of salvaged metal to bash and block.' },
    { name: 'Junk Toss', manaCost: 3, damage: 4, type: 'ranged', description: 'Hurl a chunk of scrap metal at a distant target.' },
  ],
  scavenger: [
    { name: 'Stun Charge', manaCost: 8, damage: 12, type: 'ranged', description: 'Fire a charged capacitor bolt that stuns on impact.' },
    { name: 'Smoke Screen', manaCost: 6, damage: 0, type: 'utility', description: 'Deploy a smoke canister to obscure the area.' },
    { name: 'Adaptive Plating', manaCost: 4, damage: 0, type: 'buff', description: 'Activate salvaged armor plating for temporary defense.' },
  ],
  mercenary: [
    { name: 'Power Strike', manaCost: 5, damage: 14, type: 'melee', description: 'A brutal close-range strike with maximum force.' },
    { name: 'Suppressive Fire', manaCost: 4, damage: 6, type: 'aoe', description: 'Lay down a spread of fire to pin down enemies.' },
  ],
  engineer: [
    { name: 'Plasma Cutter', manaCost: 5, damage: 10, type: 'ranged', description: 'Fire a focused plasma beam that cuts through armor.' },
    { name: 'Deploy Turret', manaCost: 3, damage: 6, type: 'utility', description: 'Set up a small automated turret to provide cover fire.' },
    { name: 'Field Repair', manaCost: 6, damage: 0, type: 'heal', description: 'Repair damaged equipment and patch up wounds with salvaged med-tech.' },
  ],
};

const CLASS_STARTING_GEAR = {
  junk_collector: {
    mainHand: { id: 'start_pipe', name: 'Scrap Pipe', type: 'weapon', subtype: 'sword', char: '/', color: '#aaaaaa', rarity: 'common', value: 10, stats: { attack: 4 }, description: 'A heavy pipe ripped from a wall. Gets the job done.' },
    chest: { id: 'start_plate', name: 'Welded Plate Vest', type: 'armor', subtype: 'chestplate', char: '[', color: '#888888', rarity: 'common', value: 15, stats: { defense: 3 }, description: 'Plates of salvaged hull metal welded into crude armor.' },
  },
  scavenger: {
    mainHand: { id: 'start_pistol', name: 'Salvaged Pistol', type: 'weapon', subtype: 'bow', char: '}', color: '#8866aa', rarity: 'common', value: 8, stats: { attack: 3 }, description: 'A battered sidearm rebuilt from scavenged parts.' },
    chest: { id: 'start_jacket', name: 'Patched Jacket', type: 'armor', subtype: 'chestplate', char: '[', color: '#886644', rarity: 'common', value: 10, stats: { defense: 1 }, description: 'A jacket covered in patches and crude repairs.' },
  },
  mercenary: {
    mainHand: { id: 'start_blade', name: 'Combat Blade', type: 'weapon', subtype: 'dagger', char: '-', color: '#aaaaaa', rarity: 'common', value: 6, stats: { attack: 4 }, description: 'A sharp blade favored by hired guns across the colony.' },
    chest: { id: 'start_ballistic', name: 'Ballistic Vest', type: 'armor', subtype: 'chestplate', char: '[', color: '#886644', rarity: 'common', value: 10, stats: { defense: 2 }, description: 'A reinforced vest designed to stop small arms fire.' },
  },
  engineer: {
    mainHand: { id: 'start_tool', name: 'Multi-tool', type: 'weapon', subtype: 'staff', char: '~', color: '#44aa44', rarity: 'common', value: 8, stats: { attack: 2, mana: 10 }, description: 'A versatile engineering tool that doubles as a weapon in a pinch.' },
  },
};

export class Player {
  constructor(name, race = 'human', playerClass = 'junk_collector') {
    this.name = name;
    this.race = race;
    this.playerClass = playerClass;
    this.char = '@';
    this.color = CLASS_COLORS[playerClass] || '#ffffff';
    this.position = { x: 0, y: 0 };

    const base = CLASS_BASE_STATS[playerClass] || CLASS_BASE_STATS.junk_collector;
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
  { name: 'Rusted',          statMul: 0.7 },
  { name: 'Tempered',        statMul: 1.0 },
  { name: 'Reinforced',      statMul: 1.2 },
  { name: 'Reclaimed',       statMul: 1.3 },
  { name: 'Crude',           statMul: 1.1 },
  { name: 'Fire-Forged',     statMul: 1.4 },
  { name: 'Hammered',        statMul: 1.4 },
  { name: 'Polished',        statMul: 1.3 },
  { name: 'Enchanted',       statMul: 1.5 },
  { name: 'Ancient',         statMul: 1.6 },
  { name: 'Shadow-Touched',  statMul: 1.5 },
  { name: 'Masterwork',      statMul: 1.7 },
  { name: 'Plated',          statMul: 1.3 },
  { name: 'Rune-Tempered',   statMul: 1.8 },
  { name: 'Hallowed',        statMul: 2.0 },
];

const ITEM_SUFFIXES = [
  { name: 'of Might',         bonus: { str: 2 } },
  { name: 'of Swiftness',     bonus: { dex: 2 } },
  { name: 'of the Ancients',  bonus: { wis: 2 } },
  { name: 'of Endurance',     bonus: { con: 3 } },
  { name: 'of Fury',          bonus: { attack: 3 } },
  { name: 'of Warding',       bonus: { defense: 2 } },
  { name: 'of Grace',         bonus: { dex: 3 } },
  { name: 'of the Void',      bonus: { str: 3 } },
  { name: 'of Insight',       bonus: { int: 2 } },
  { name: 'of Vitality',      bonus: { hp: 10 } },
  { name: 'of the Forge',     bonus: { attack: 2 } },
  { name: 'of the Rampart',   bonus: { defense: 3 } },
  { name: 'of Lore',          bonus: { wis: 3, int: 2 } },
  { name: 'of Rending',       bonus: { attack: 5 } },
  { name: 'of the Inferno',   bonus: { hp: 15, str: 1 } },
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
  { name: 'Healing Potion',     subtype: 'healing',  color: '#ff4444', effect: { heal: 20 },              value: 15, description: 'A ruby-red potion that mends wounds.' },
  { name: 'Mana Elixir',        subtype: 'mana',     color: '#4444ff', effect: { mana: 20 },              value: 15, description: 'A shimmering blue elixir that restores magical energy.' },
  { name: 'Strength Draught',   subtype: 'strength', color: '#ff8800', effect: { str: 3, duration: 50 },  value: 25, description: 'An amber draught that temporarily boosts strength.' },
  { name: 'Venom Flask',        subtype: 'poison',   color: '#44ff44', effect: { damage: 15 },            value: 20, description: 'A sickly green flask of concentrated poison.' },
  { name: 'Herbal Tonic',       subtype: 'healing',  color: '#ff6666', effect: { heal: 15 },              value: 12, description: 'A flask of soothing herbal remedy.' },
  { name: 'Healing Salve',      subtype: 'healing',  color: '#ffaaaa', effect: { heal: 25 },              value: 20, description: 'A thick paste infused with restorative herbs.' },
];

const SCROLL_BASES = [
  { name: 'Scroll of Fireball',       effect: 'fireball',  damage: 20, value: 30, description: 'Unleash a burst of flame upon your enemies.' },
  { name: 'Scroll of Teleportation',  effect: 'teleport',  damage: 0,  value: 40, description: 'Instantly teleport to a random location on this floor.' },
  { name: 'Scroll of Identification', effect: 'identify',  damage: 0,  value: 20, description: 'Reveals the true properties of a piece of equipment.' },
  { name: 'Scroll of Enchantment',    effect: 'enchant',   damage: 0,  value: 50, description: 'Enhance an item with magical properties.' },
  { name: 'Scroll of Revelation',     effect: 'map',       damage: 0,  value: 25, description: 'Reveals the layout of the current level.' },
  { name: 'Scroll of Lightning',      effect: 'lightning', damage: 25, value: 35, description: 'A bolt of lightning strikes the nearest enemy.' },
];

const FOOD_BASES = [
  { name: 'Hardtack',         heal: 5,  value: 3,  description: 'A dense, dry biscuit. Filling enough.' },
  { name: 'Salted Meat',      heal: 8,  value: 5,  description: 'A hearty strip of cured meat.' },
  { name: 'Dried Mushrooms',  heal: 10, value: 6,  description: 'Preserved strips of cave-grown mushroom.' },
  { name: 'Elven Bread',      heal: 20, value: 15, description: 'Light and nourishing. A single piece sustains for a day.' },
  { name: 'Gruel',            heal: 12, value: 8,  description: 'A bowl of thick porridge. Tasteless but filling.' },
  { name: 'Wild Berry',       heal: 8,  value: 6,  description: 'A plump berry gathered from the forest.' },
];

const MATERIAL_BASES = [
  { name: 'Iron Scraps',           value: 5,  description: 'A chunk of salvageable scrap iron.' },
  { name: 'Copper Ingot',          value: 25, description: 'A bar of refined copper.' },
  { name: 'Fire Crystal',          value: 40, description: 'A glowing crystal infused with elemental fire. Highly valuable.' },
  { name: 'Enchanted Rune Plate',  value: 80, description: 'A plate inscribed with ancient runes. Very rare.' },
  { name: 'Ancient Alloy Shard',   value: 60, description: 'A piece of metal from the Maker era, impossibly strong.' },
  { name: 'Silken Cord',           value: 8,  description: 'A length of magically strengthened silk.' },
];

const ARTIFACT_BASES = [
  { name: 'Crown of the Forgotten King',      stats: { int: 5, wis: 5, cha: 5 },  description: 'A circlet worn by a king whose name has been lost to history.' },
  { name: 'Blade of the First Dawn',          stats: { attack: 12, str: 4 },      description: 'A radiant blade said to have been forged at the beginning of the world.' },
  { name: 'Gauntlets of the Giant',           stats: { str: 8, attack: 4 },       description: 'Massive gauntlets imbued with giant strength.' },
  { name: 'Amulet of the Makers',             stats: { defense: 6, wis: 6 },      description: 'An amulet that pulses with ancient magic, warding off dark forces.' },
  { name: 'Ring of the Sealed Tomb',          stats: { hp: 30, con: 5 },           description: 'A ring recovered from a sealed crypt, pulsing with restorative power.' },
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
  forest: [
    { name: 'Feral Hound', char: 'w', color: '#888888', behavior: 'aggressive', hp: 12, attack: 4, defense: 2, xpBase: 15 },
    { name: 'Vine Crawler', char: 'S', color: '#448844', behavior: 'ambush', hp: 10, attack: 5, defense: 1, xpBase: 18, ability: 'poison' },
    { name: 'Treant', char: 'T', color: '#226622', behavior: 'patrol', hp: 30, attack: 6, defense: 5, xpBase: 40, ability: 'rootGrab' },
    { name: 'Bandit', char: 'B', color: '#AA8844', behavior: 'aggressive', hp: 15, attack: 5, defense: 3, xpBase: 20, faction: 'RAIDERS' },
    { name: 'Wild Boar', char: 'b', color: '#886644', behavior: 'coward', hp: 14, attack: 4, defense: 3, xpBase: 12 },
    { name: 'Glow Moth', char: 'f', color: '#44FF44', behavior: 'coward', hp: 6, attack: 2, defense: 1, xpBase: 8 },
  ],
  underground: [
    { name: 'Cave Bat', char: 'b', color: '#886688', behavior: 'aggressive', hp: 8, attack: 3, defense: 1, xpBase: 10 },
    { name: 'Gel Mass', char: 's', color: '#44AA44', behavior: 'patrol', hp: 20, attack: 2, defense: 4, xpBase: 15, ability: 'acidSplash' },
    { name: 'Cave Troll', char: 'T', color: '#668866', behavior: 'aggressive', hp: 35, attack: 8, defense: 4, xpBase: 50, ability: 'regenerate' },
    { name: 'Dungeon Rat', char: 'k', color: '#AA6644', behavior: 'coward', hp: 8, attack: 3, defense: 2, xpBase: 8 },
    { name: 'Stone Golem', char: 'G', color: '#888888', behavior: 'patrol', hp: 40, attack: 6, defense: 8, xpBase: 45 },
  ],
  haunted: [
    { name: 'Skeletal Warrior', char: 's', color: '#CCCCCC', behavior: 'aggressive', hp: 12, attack: 4, defense: 2, xpBase: 15, faction: 'UNDEAD' },
    { name: 'Wraith', char: 'W', color: '#8888FF', behavior: 'aggressive', hp: 18, attack: 7, defense: 1, xpBase: 35, ability: 'lifeDrain', faction: 'UNDEAD' },
    { name: 'Shambling Corpse', char: 'z', color: '#668866', behavior: 'patrol', hp: 20, attack: 3, defense: 3, xpBase: 12, faction: 'UNDEAD' },
    { name: 'Lich', char: 'L', color: '#AA00FF', behavior: 'aggressive', hp: 50, attack: 12, defense: 5, xpBase: 100, ability: 'necroBolt', isBoss: true, faction: 'UNDEAD' },
    { name: 'Phantom', char: 'g', color: '#AAAAFF', behavior: 'ambush', hp: 10, attack: 5, defense: 0, xpBase: 20, ability: 'phaseThrough', faction: 'UNDEAD' },
  ],
  swamp: [
    { name: 'Swamp Hag', char: 'H', color: '#448844', behavior: 'ambush', hp: 22, attack: 6, defense: 3, xpBase: 30, ability: 'curse' },
    { name: 'Bog Lurker', char: 'L', color: '#446644', behavior: 'ambush', hp: 25, attack: 5, defense: 5, xpBase: 25 },
    { name: 'Toxic Toad', char: 't', color: '#66AA44', behavior: 'coward', hp: 8, attack: 2, defense: 2, xpBase: 8, ability: 'poison' },
    { name: 'Swamp Wisp', char: '*', color: '#88FFFF', behavior: 'coward', hp: 5, attack: 3, defense: 0, xpBase: 12 },
  ],
  badlands: [
    { name: 'Sand Scorpion', char: 'S', color: '#AA8844', behavior: 'aggressive', hp: 16, attack: 6, defense: 4, xpBase: 22, ability: 'poison' },
    { name: 'Iron Revenant', char: 'M', color: '#AAAA88', behavior: 'patrol', hp: 28, attack: 5, defense: 6, xpBase: 35, ability: 'curse', faction: 'UNDEAD' },
    { name: 'Sandworm', char: 'W', color: '#CCAA66', behavior: 'ambush', hp: 40, attack: 10, defense: 3, xpBase: 55 },
    { name: 'Desert Shade', char: 'd', color: '#CCAA88', behavior: 'patrol', hp: 12, attack: 4, defense: 1, xpBase: 15 },
  ],
  mountain: [
    { name: 'Mountain Lion', char: 'l', color: '#CCAA66', behavior: 'aggressive', hp: 18, attack: 6, defense: 3, xpBase: 25 },
    { name: 'Harpy', char: 'h', color: '#AA88CC', behavior: 'aggressive', hp: 14, attack: 5, defense: 2, xpBase: 20, ability: 'screech' },
    { name: 'Stone Titan', char: 'G', color: '#888888', behavior: 'patrol', hp: 50, attack: 10, defense: 8, xpBase: 60, isBoss: true },
    { name: 'Mountain Spider', char: 'W', color: '#448844', behavior: 'aggressive', hp: 30, attack: 8, defense: 4, xpBase: 45 },
  ],
  ruins: [
    { name: 'Feral Peasant', char: 'g', color: '#55AA55', behavior: 'coward', hp: 10, attack: 3, defense: 2, xpBase: 10 },
    { name: 'Skeletal Warrior', char: 's', color: '#CCCCCC', behavior: 'aggressive', hp: 12, attack: 4, defense: 2, xpBase: 15, faction: 'UNDEAD' },
    { name: 'Dungeon Rat', char: 'r', color: '#886644', behavior: 'coward', hp: 5, attack: 2, defense: 1, xpBase: 5 },
    { name: 'Venomous Spider', char: 'S', color: '#448844', behavior: 'ambush', hp: 10, attack: 5, defense: 1, xpBase: 18, ability: 'poison' },
    { name: 'Bandit', char: 'z', color: '#668866', behavior: 'patrol', hp: 20, attack: 3, defense: 3, xpBase: 12, faction: 'RAIDERS' },
    { name: 'Bandit Captain', char: 'B', color: '#AA8844', behavior: 'aggressive', hp: 15, attack: 5, defense: 3, xpBase: 20, faction: 'RAIDERS' },
    { name: 'Mimic', char: '!', color: '#FFDD44', behavior: 'ambush', hp: 22, attack: 6, defense: 4, xpBase: 35 },
  ],
};

const ABILITY_EFFECTS = {
  poison:      { name: 'Venom', damage: 3, duration: 3, type: 'dot', description: 'Injects burning venom for 3 turns.' },
  lifeDrain:   { name: 'Life Drain', damage: 5, heal: 5, type: 'drain', description: 'Drains the life force of the target.' },
  fireball:    { name: 'Fire Bolt', damage: 8, type: 'magic', description: 'Hurls a bolt of searing flame.' },
  necroBolt:   { name: 'Death Bolt', damage: 10, type: 'magic', description: 'A bolt of necrotic energy.' },
  acidSplash:  { name: 'Acid Splash', damage: 4, armorReduce: 1, type: 'debuff', description: 'Corrodes armor with caustic slime.' },
  rootGrab:    { name: 'Vine Snare', damage: 2, stun: true, type: 'control', description: 'Grasping vines hold the target in place.' },
  curse:       { name: 'Hex', damage: 0, attackReduce: 2, type: 'debuff', description: 'A dark hex weakens the target.' },
  screech:     { name: 'Banshee Wail', damage: 0, defenseReduce: 2, type: 'debuff', description: 'A piercing wail that shatters resolve.' },
  regenerate:  { name: 'Regeneration', damage: 0, healSelf: 5, type: 'heal', description: 'Slowly regenerates health.' },
  phaseThrough:{ name: 'Ethereal Step', damage: 0, type: 'utility', description: 'Can pass through solid walls.' },
};

export class CreatureGenerator {
  generate(rng, biome = 'ruins', depth = 1, playerLevel = 1) {
    const table = CREATURE_TABLES[biome] || CREATURE_TABLES.ruins;
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
