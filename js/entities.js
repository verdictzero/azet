// ============================================================================
// entities.js — Entity/NPC system for a retro ASCII roguelike game
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
      'Aldric', 'Marcus', 'Thorin', 'Cedric', 'Gareth', 'Roland', 'Edmund',
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
      'Ironforge', 'Blackwood', 'Stormwind', 'Ashford', 'Thornwall',
      'Greymane', 'Brightmore', 'Dunhaven', 'Fairweather', 'Goleli',
      'Hawkridge', 'Kingsmill', 'Langley', 'Moorfield', 'Northcott',
      'Oakenshield', 'Ravenscar', 'Silverlock', 'Whitmore', 'Yarwood',
    ],
  },
  elf: {
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
      'Moonwhisper', 'Starfall', 'Silverleaf', 'Dawnweaver', 'Nightbloom',
      'Sunfire', 'Windrunner', 'Dewdancer', 'Mistwalker', 'Thornblossom',
      'Greenvale', 'Brightwater', 'Shadowmere', 'Goldentree', 'Crystalbrook',
      'Silentglade', 'Swiftarrow', 'Moonshadow', 'Starbreeze', 'Leafwhirl',
    ],
  },
  dwarf: {
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
      'Ironbeard', 'Forgemaster', 'Stonehammer', 'Deepdelve', 'Goldvein',
      'Copperbolt', 'Anviltop', 'Granitepick', 'Runecarver', 'Blazeforge',
      'Steelhand', 'Thunderaxe', 'Orebreaker', 'Gemcutter', 'Coalheap',
      'Ironpick', 'Hammerfall', 'Mithrilbeard', 'Darkmine', 'Boulderback',
    ],
  },
  orc: {
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
      'Skullcrusher', 'Bloodfang', 'Bonegnaw', 'Deathgrip', 'Fleshrender',
      'Goreblade', 'Hellscream', 'Ironfist', 'Jawbreaker', 'Mauler',
      'Rageclaw', 'Spinebreaker', 'Warfang', 'Doomhowl', 'Blacktusk',
    ],
  },
  halfling: {
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
      'Goodbarrel', 'Underhill', 'Proudfoot', 'Baggins', 'Took',
      'Brandybuck', 'Gamgee', 'Hornblower', 'Burrows', 'Chubb',
      'Greenhand', 'Longbottom', 'Sackville', 'Rumble', 'Hayward',
    ],
  },
};

const NICKNAMES = [
  'the Brave', 'the Bold', 'Shadowblade', 'Truthseeker', 'the Wise',
  'Ironwill', 'Stormbringer', 'the Wanderer', 'Flameheart', 'the Swift',
  'Dawnbringer', 'the Silent', 'Dragonslayer', 'the Merciful', 'Nightstalker',
  'the Just', 'Oathkeeper', 'the Unyielding', 'Grimjaw', 'Thornheart',
];

const PLACE_PREFIXES = [
  'Thorn', 'Iron', 'Shadow', 'Storm', 'Oak', 'Raven', 'Wolf', 'Stone',
  'Silver', 'Black', 'White', 'Frost', 'Dark', 'Golden', 'Ember',
];

const PLACE_SUFFIXES = [
  'brook', 'hold', 'vale', 'haven', 'fall', 'gate', 'ford', 'wick',
  'keep', 'mere', 'ridge', 'dale', 'watch', 'crest', 'hollow',
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
  merchant:   ['Traveling Merchant', 'Street Vendor', 'Master Trader', 'Peddler', 'Shopkeeper'],
  blacksmith: ['Master Blacksmith', 'Apprentice Smith', 'Armorer', 'Weapon Smith', 'Tinker'],
  barkeep:    ['Innkeeper', 'Barkeep', 'Tavern Owner', 'Bartender', 'Publican'],
  priest:     ['High Priest', 'Acolyte', 'Temple Warden', 'Healer', 'Cleric'],
  guard:      ['Town Guard', 'Gate Watchman', 'Patrol Captain', 'Militia Guard', 'Sentry'],
  noble:      ['Lord', 'Lady', 'Baron', 'Baroness', 'Count'],
  farmer:     ['Farmer', 'Farmhand', 'Shepherd', 'Miller', 'Grower'],
  miner:      ['Miner', 'Tunnel Foreman', 'Ore Prospector', 'Stone Mason', 'Excavator'],
  hunter:     ['Ranger', 'Trapper', 'Big Game Hunter', 'Forester', 'Tracker'],
  scholar:    ['Scholar', 'Sage', 'Archivist', 'Lorekeeper', 'Historian'],
  beggar:     ['Beggar', 'Street Urchin', 'Vagabond', 'Drifter', 'Pauper'],
  child:      ['Child', 'Street Kid', 'Orphan', 'Young One', 'Little One'],
};

const SECRET_TEMPLATES = [
  'is secretly a former assassin',
  'was once nobility before being disgraced',
  'knows the location of a hidden treasure',
  'is wanted in another province',
  'worships a forbidden deity',
  'has an illegitimate child in another town',
  'poisoned the previous guild master',
  'can see glimpses of the future in dreams',
  'stole their identity from a dead traveler',
  'is a spy for a rival faction',
  'owes a massive debt to a crime lord',
  'accidentally caused a fire that burned down a village',
  'possesses a forbidden artifact hidden in their home',
  'was raised by a monster in the wilds',
  'knows a secret passage beneath the town',
  'made a pact with a demon long ago',
  'is descended from an ancient royal bloodline',
  'witnessed a murder and never spoke of it',
  'has a twin sibling no one knows about',
  'can speak an ancient dead language',
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
  'Town Council', 'Merchants Guild', 'Thieves Guild', 'Temple of Light',
  'Rangers Order', 'Miners Union', 'Farmers Collective', 'Noble Court',
  'Adventurers League', 'None',
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
    if (role === 'merchant' || role === 'blacksmith') faction = 'Merchants Guild';
    if (role === 'guard' || role === 'knight') faction = 'Town Council';
    if (role === 'priest') faction = 'Temple of Light';

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
    'Hail, friend! Welcome back.',
    'Good to see you! How goes the adventure?',
    'Ah, my favorite visitor returns!',
    'Well met, companion! What can I do for you today?',
    'A pleasure, as always! Come in, come in.',
    'You look well! The road has treated you kindly.',
    'Welcome, welcome! I was hoping you would stop by.',
    'By the gods, it is good to see a friendly face!',
    'Ho there! Pull up a seat and rest your bones.',
    'The hero returns! What news do you bring?',
  ],
  neutral: [
    'What brings you here?',
    'State your business.',
    "I don't believe we've met.",
    'Can I help you with something?',
    'Yes? What do you need?',
    'Hmm. You look like an adventurer.',
    'Another traveler. What do you want?',
    "If you're looking for trouble, look elsewhere.",
    'Speak up, I have not got all day.',
    'Well? Spit it out.',
  ],
  hostile: [
    'Stay back!',
    'Not you again...',
    'I thought I told you to leave!',
    "Get out of my sight before I call the guards!",
    "You've got some nerve showing your face here.",
  ],
};

const RUMOR_TEMPLATES = [
  'They say {LOCATION} is cursed by an ancient evil...',
  'I heard {NPC_NAME} used to be a {PROFESSION} before settling here.',
  'Strange lights have been seen near the old ruins at night.',
  'The mine has been closed ever since the cave-in. Some say it was no accident.',
  'A merchant was found dead on the road last week. Bandits, they say.',
  "There's talk of war brewing in the eastern kingdoms.",
  "The blacksmith's apprentice vanished three nights ago. Nobody's talking about it.",
  'They say a dragon was spotted flying over the mountains.',
  "The well water has tasted strange lately. Some folk won't drink it.",
  'An old hermit in the forest supposedly knows the cure for any ailment.',
  'I overheard the guards talking about something in the dungeon below the keep.',
  "The temple's been collecting more donations than usual. Wonder what for.",
  'A strange traveler was asking questions about the old king last week.',
  "They say there's treasure buried beneath {LOCATION}, if you dare to look.",
  'The harvest has been poor. Some blame witchcraft, others blame the weather.',
  'I saw a ship with black sails anchored in the bay at midnight.',
  "The noble's daughter has been secretly meeting someone outside the walls.",
  'An earthquake opened a fissure near the old cemetery. Best stay away.',
  "Word is, the thieves' guild is recruiting. Not that I'd know anything about that.",
  'Some say the forest is growing... expanding toward the village each year.',
];

const TOPIC_DIALOGUE = {
  self: [
    "I've been living here for as long as I can remember.",
    'My work keeps me busy, but I cannot complain.',
    "I used to travel, but those days are behind me now.",
    "There's not much to tell, really. I'm just a simple {ROLE}.",
    'I learned my trade from my father, and he from his.',
    "Name's {FIRST}. {TITLE} is what they call me around here.",
  ],
  location: [
    "This place has seen better days, but it's home.",
    'The town was founded generations ago by settlers from the east.',
    "Watch yourself around here. Not everyone's as friendly as me.",
    "We're a small community, but we look out for each other.",
    'The land around here is rich, if you know how to work it.',
    'Travelers pass through here on their way to the capital.',
  ],
  faction: [
    'The {FACTION} keeps things running around here, for better or worse.',
    "I'm loyal to the {FACTION}, and they've done right by me.",
    'Between you and me, the {FACTION} has too much power.',
    'Without the {FACTION}, this place would fall apart.',
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
        text: 'I need a room for the night.',
        action: 'rest',
        consequence: null,
      });
    }

    if (npc.role === 'guard' && playerRep >= 10) {
      options.push({
        text: 'Any trouble in the area?',
        action: 'bounty',
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

  generateRumor(rng, worldContext = null) {
    let template = rng.random(RUMOR_TEMPLATES);

    const location = worldContext && worldContext.locations
      ? rng.random(worldContext.locations)
      : 'the old ruins';
    const npcName = worldContext && worldContext.npcNames
      ? rng.random(worldContext.npcNames)
      : 'Old Tom';
    const profession = rng.random([
      'soldier', 'thief', 'wizard', 'noble', 'pirate', 'monk', 'assassin',
      'knight', 'merchant prince', 'gladiator',
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
  'The kingdom fell to {ENEMY} {YEARS} years ago, and the land has never fully recovered.',
  'A great plague swept through {REGION}, killing nearly half the population.',
  'The alliance between {FACTION1} and {FACTION2} was forged in blood during the Battle of {LOCATION}.',
  'Long ago, a powerful wizard sealed an ancient evil beneath {LOCATION}, but the seals are weakening.',
  '{FACTION1} and {FACTION2} fought a bitter war over control of the mines, leaving scars on the land.',
  'The old king vanished mysteriously {YEARS} years ago. Some say he still walks the earth.',
  'A comet streaked across the sky {YEARS} years ago, heralding an age of turmoil and change.',
  'The great library of {LOCATION} burned in a fire set by zealots who feared forbidden knowledge.',
  'The dwarven tunnels beneath the mountains were sealed after something was unearthed in the deep.',
  'A great flood reshaped the coastline {YEARS} years ago, swallowing entire villages beneath the waves.',
  'The elves retreated from the world after the betrayal at {LOCATION}, and few have been seen since.',
  'An order of knights once protected the realm, but they were disbanded under accusations of treason.',
  'The crown jewels were stolen {YEARS} years ago and never recovered. Some say they hold great power.',
  'A volcanic eruption buried the ancient city of {LOCATION} under ash and stone.',
  'The treaty that ended the Border Wars is said to have been signed in the blood of both kings.',
  'Legends speak of a hero who slew a dragon at {LOCATION}, but scholars debate whether it truly happened.',
  'A sect of dark cultists nearly opened a portal to the abyss before they were stopped by {FACTION1}.',
  'The trade routes were established {YEARS} years ago, bringing prosperity but also new dangers.',
];

const ARTIFACT_TEMPLATES = [
  'This blade was forged by {SMITH} in the fires of Mount {MOUNTAIN}.',
  'Legend says it grants {POWER} to its wielder, but at a terrible cost.',
  'It was last seen in the hands of {HERO}, who carried it into the final battle.',
  'The runes etched along its surface glow faintly in the presence of evil.',
  'Crafted from star-metal that fell from the heavens {YEARS} years ago.',
  'It is said to be one of seven artifacts created to hold back the darkness.',
  'The enchantment was laid upon it by {SMITH}, the last of the great enchanters.',
  'Those who carry it long enough begin to hear whispers from another age.',
  'It was believed destroyed during the fall of {LOCATION}, yet here it remains.',
  'The gem set in its hilt is said to contain the soul of a trapped demon.',
  'Warriors have fought and died for centuries over possession of this relic.',
  'It was a gift from the elven queen to a mortal champion, ages past.',
  'Scholars believe it predates the current age by thousands of years.',
  'Its true power can only be unlocked when brought to {LOCATION}.',
  'The inscription reads: "May this weapon serve the just and smite the wicked."',
  'It hums with a strange energy, as though it has a will of its own.',
  'According to legend, it cannot be destroyed by any mortal means.',
];

const LOCATION_TEMPLATES = [
  'Built as a {PURPOSE}, it has served the realm for {YEARS} years.',
  'The ruins here date back to the First Age, when giants walked the earth.',
  'This place was once a thriving hub of trade, before the roads shifted.',
  'The locals avoid this area after dark, whispering of ghosts and worse.',
  'A great battle was fought here {YEARS} years ago, and the land still bears the scars.',
  'It was constructed by dwarven architects, renowned for their mastery of stone.',
  'The well at its center is said to grant visions to those who drink from it.',
  'Travelers have reported strange sounds emanating from deep underground.',
  'Once the seat of a powerful lord, it fell into disrepair after the uprising.',
  'The forest around it is unnaturally dense, as if the trees themselves guard a secret.',
  'Built atop an ancient burial site, it has always had a dark reputation.',
  'The walls bear faded murals depicting scenes from a forgotten mythology.',
  'It served as a refuge during the Last War, sheltering hundreds of survivors.',
  'The architecture suggests elven influence, though no elves live here now.',
  'A natural hot spring beneath the foundation keeps the stone warm even in winter.',
  'According to legend, a powerful artifact lies hidden somewhere within.',
  'The stained glass windows depict the rise and fall of a civilization long gone.',
  'It was abandoned after a mysterious illness swept through its inhabitants.',
];

const NPC_BACKSTORY_TEMPLATES = [
  'I used to be a {PROFESSION} before I settled down here.',
  'My family was from {PLACE}, but we had to flee when the wars came.',
  'I lost everything in the great fire and had to start over from nothing.',
  'My father taught me this trade, and his father before him.',
  'I came here seeking fortune, but found something more valuable: peace.',
  'I served in the militia during the Border Wars. Saw things I wish I could forget.',
  'I was an orphan, raised by the priests at the temple.',
  'I traveled the world for ten years before settling in this quiet corner.',
  "There's a reason I left my old life behind, and I'd rather not speak of it.",
  'I was apprenticed to a master craftsman who taught me everything I know.',
  'My mother was a healer, and she passed her knowledge on to me.',
  'I made my fortune in the gem trade, but lost it all to bad luck and worse friends.',
  'I ran away from home as a child and never looked back.',
  'I once served a noble house, but they fell from grace and I had to find my own way.',
  'I found this place by accident and decided it was as good as anywhere to stay.',
  'I was shipwrecked on the coast and wandered inland until I found civilization.',
  'My family has lived here for seven generations. This land is in my blood.',
  'I came here to escape a blood feud. So far, no one has found me.',
  'I won this establishment in a game of cards. Best hand I ever played.',
  'I was once a scholar, but the politics of the academy drove me away.',
];

const LORE_ENEMIES = [
  'the Dark Horde', 'an undead army', 'the Orc Clans', 'a dragon',
  'a demonic incursion', 'the Shadow King', 'barbarian raiders',
  'a powerful lich', 'the Crimson Legion',
];

const LORE_REGIONS = [
  'the Northlands', 'the Eastern Reach', 'the Heartlands', 'the Southern Coast',
  'the Western Marches', 'the Ironfoot Mountains', 'the Whisperwood',
];

const LORE_POWERS = [
  'immense strength', 'the gift of foresight', 'invisibility', 'fire resistance',
  'the ability to speak with the dead', 'enhanced speed', 'magical shielding',
  'dominion over beasts', 'immunity to poison',
];

const LORE_SMITHS = [
  'Durin the Elder', 'Master Aelindor', 'the Blind Forgemaster', 'Queen Isolde',
  'Thargrim Steelhand', 'the ancient dwarves', 'an unnamed elven smith',
];

const LORE_HEROES = [
  'King Aldric the Bold', 'the Champion of Dawn', 'Selene the Wanderer',
  'Sir Roderick Ashford', 'the last Paladin', 'the legendary Thorin Stonehammer',
];

const LORE_MOUNTAINS = [
  'Erebus', 'Ashfall', 'Thunderpeak', 'Dragonspire', 'Ironcrags', 'Frostholm',
];

const LORE_PURPOSES = [
  'fortress', 'temple', 'trading post', 'mining outpost', 'watch tower',
  'monastery', 'prison', 'royal retreat', 'sanctuary', 'library',
];

const LORE_PROFESSIONS = [
  'soldier', 'sailor', 'thief', 'scholar', 'merchant', 'gladiator',
  'monk', 'ranger', 'bard', 'knight', 'pirate', "wizard's apprentice",
];

const LORE_PLACES = [
  'the capital city', 'a small fishing village', 'the northern frontier',
  'across the sea', 'the elven forests', 'the dwarven holds', 'a faraway kingdom',
  'the borderlands', 'the desert oasis', 'the mountain passes',
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
      text = text.replace('{FACTION1}', 'the Old Guard');
      text = text.replace('{FACTION2}', 'the Northern Alliance');
    }

    if (locationNames && locationNames.length > 0) {
      text = text.replace(/{LOCATION}/g, rng.random(locationNames));
    } else {
      text = text.replace(/{LOCATION}/g, 'the ancient ruins');
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
  warrior: '#dd4444',
  mage:    '#6666ee',
  rogue:   '#aaaa22',
  ranger:  '#44aa44',
};

const CLASS_BASE_STATS = {
  warrior: { str: 16, dex: 10, con: 14, int: 8,  wis: 10, cha: 10 },
  mage:    { str: 8,  dex: 10, con: 10, int: 16, wis: 14, cha: 10 },
  rogue:   { str: 10, dex: 16, con: 10, int: 10, wis: 8,  cha: 14 },
  ranger:  { str: 12, dex: 14, con: 12, int: 10, wis: 12, cha: 10 },
};

const CLASS_ABILITIES = {
  warrior: [
    { name: 'Power Strike', manaCost: 5, damage: 8, type: 'melee', description: 'A devastating melee blow.' },
    { name: 'Shield Bash', manaCost: 3, damage: 4, type: 'melee', description: 'Stun an enemy with your shield.' },
  ],
  mage: [
    { name: 'Fireball', manaCost: 8, damage: 12, type: 'ranged', description: 'Hurl a ball of fire at your foes.' },
    { name: 'Frost Nova', manaCost: 6, damage: 6, type: 'aoe', description: 'Freeze nearby enemies.' },
    { name: 'Arcane Shield', manaCost: 4, damage: 0, type: 'buff', description: 'Create a magical barrier.' },
  ],
  rogue: [
    { name: 'Backstab', manaCost: 5, damage: 14, type: 'melee', description: 'Strike from the shadows for massive damage.' },
    { name: 'Smoke Bomb', manaCost: 4, damage: 0, type: 'utility', description: 'Vanish in a cloud of smoke.' },
  ],
  ranger: [
    { name: 'Aimed Shot', manaCost: 5, damage: 10, type: 'ranged', description: 'A carefully aimed arrow.' },
    { name: 'Trap', manaCost: 3, damage: 6, type: 'utility', description: 'Set a trap for unsuspecting enemies.' },
    { name: "Nature's Mend", manaCost: 6, damage: 0, type: 'heal', description: 'Call upon nature to heal wounds.' },
  ],
};

const CLASS_STARTING_GEAR = {
  warrior: {
    mainHand: { id: 'start_sword', name: 'Worn Longsword', type: 'weapon', subtype: 'sword', char: '/', color: '#aaaaaa', rarity: 'common', value: 10, stats: { attack: 4 }, description: 'A battered but serviceable longsword.' },
    chest: { id: 'start_chain', name: 'Rusty Chainmail', type: 'armor', subtype: 'chestplate', char: '[', color: '#888888', rarity: 'common', value: 15, stats: { defense: 3 }, description: 'Old chainmail with a few missing links.' },
  },
  mage: {
    mainHand: { id: 'start_staff', name: 'Gnarled Staff', type: 'weapon', subtype: 'staff', char: '~', color: '#8866aa', rarity: 'common', value: 8, stats: { attack: 2, mana: 10 }, description: 'A twisted wooden staff that hums with faint magic.' },
  },
  rogue: {
    mainHand: { id: 'start_dagger', name: 'Chipped Dagger', type: 'weapon', subtype: 'dagger', char: '-', color: '#aaaaaa', rarity: 'common', value: 6, stats: { attack: 3 }, description: 'A small but sharp dagger.' },
    chest: { id: 'start_leather', name: 'Worn Leather Armor', type: 'armor', subtype: 'chestplate', char: '[', color: '#886644', rarity: 'common', value: 10, stats: { defense: 1 }, description: 'Cracked leather armor offering modest protection.' },
  },
  ranger: {
    mainHand: { id: 'start_bow', name: 'Short Bow', type: 'weapon', subtype: 'bow', char: '}', color: '#aa8844', rarity: 'common', value: 8, stats: { attack: 3 }, description: 'A simple but reliable short bow.' },
    chest: { id: 'start_hide', name: 'Hide Tunic', type: 'armor', subtype: 'chestplate', char: '[', color: '#886644', rarity: 'common', value: 8, stats: { defense: 2 }, description: 'A sturdy tunic made from animal hides.' },
  },
};

export class Player {
  constructor(name, race = 'human', playerClass = 'warrior') {
    this.name = name;
    this.race = race;
    this.playerClass = playerClass;
    this.char = '@';
    this.color = CLASS_COLORS[playerClass] || '#ffffff';
    this.position = { x: 0, y: 0 };

    const base = CLASS_BASE_STATS[playerClass] || CLASS_BASE_STATS.warrior;
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
  { name: 'Rusty',     statMul: 0.7 },
  { name: 'Iron',      statMul: 1.0 },
  { name: 'Steel',     statMul: 1.2 },
  { name: 'Blessed',   statMul: 1.3 },
  { name: 'Cursed',    statMul: 1.1 },
  { name: 'Flaming',   statMul: 1.4 },
  { name: 'Frost',     statMul: 1.4 },
  { name: 'Keen',      statMul: 1.3 },
  { name: 'Brutal',    statMul: 1.5 },
  { name: 'Radiant',   statMul: 1.6 },
  { name: 'Shadow',    statMul: 1.5 },
  { name: 'Ancient',   statMul: 1.7 },
  { name: 'Gilded',    statMul: 1.3 },
  { name: 'Volcanic',  statMul: 1.8 },
  { name: 'Celestial', statMul: 2.0 },
];

const ITEM_SUFFIXES = [
  { name: 'of Might',       bonus: { str: 2 } },
  { name: 'of Speed',       bonus: { dex: 2 } },
  { name: 'of Wisdom',      bonus: { wis: 2 } },
  { name: 'of the Bear',    bonus: { con: 3 } },
  { name: 'of Flames',      bonus: { attack: 3 } },
  { name: 'of Frost',       bonus: { defense: 2 } },
  { name: 'of the Eagle',   bonus: { dex: 3 } },
  { name: 'of the Ox',      bonus: { str: 3 } },
  { name: 'of Intellect',   bonus: { int: 2 } },
  { name: 'of Vitality',    bonus: { hp: 10 } },
  { name: 'of the Wolf',    bonus: { attack: 2 } },
  { name: 'of Warding',     bonus: { defense: 3 } },
  { name: 'of the Ages',    bonus: { wis: 3, int: 2 } },
  { name: 'of Slaying',     bonus: { attack: 5 } },
  { name: 'of the Phoenix', bonus: { hp: 15, str: 1 } },
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
  { name: 'Healing Potion',  subtype: 'healing',  color: '#ff4444', effect: { heal: 20 },              value: 15, description: 'A vial of crimson liquid that restores health.' },
  { name: 'Mana Potion',     subtype: 'mana',     color: '#4444ff', effect: { mana: 20 },              value: 15, description: 'A vial of glowing blue liquid that restores mana.' },
  { name: 'Strength Potion', subtype: 'strength', color: '#ff8800', effect: { str: 3, duration: 50 },  value: 25, description: 'An orange brew that temporarily boosts strength.' },
  { name: 'Poison Vial',     subtype: 'poison',   color: '#44ff44', effect: { damage: 15 },            value: 20, description: 'A sickly green liquid. Probably not for drinking.' },
];

const SCROLL_BASES = [
  { name: 'Scroll of Fireball',    effect: 'fireball',  damage: 20, value: 30, description: 'Unleash a burst of flame upon reading.' },
  { name: 'Scroll of Teleport',    effect: 'teleport',  damage: 0,  value: 40, description: 'Instantly relocate to a random position on the map.' },
  { name: 'Scroll of Identify',    effect: 'identify',  damage: 0,  value: 20, description: 'Reveals the true nature of an item.' },
  { name: 'Scroll of Enchantment', effect: 'enchant',   damage: 0,  value: 50, description: 'Enhance an item with magical properties.' },
  { name: 'Scroll of Mapping',     effect: 'map',       damage: 0,  value: 25, description: 'Reveals the layout of the current floor.' },
  { name: 'Scroll of Lightning',   effect: 'lightning', damage: 25, value: 35, description: 'A bolt of lightning strikes the nearest enemy.' },
];

const FOOD_BASES = [
  { name: 'Bread Loaf',      heal: 5,  value: 3,  description: 'A simple loaf of bread. Filling enough.' },
  { name: 'Cheese Wheel',    heal: 8,  value: 5,  description: 'A hearty wedge of aged cheese.' },
  { name: 'Dried Meat',      heal: 10, value: 6,  description: 'Salted and preserved strips of meat.' },
  { name: 'Elven Waybread',  heal: 20, value: 15, description: 'Light and nourishing. A single bite sustains for a day.' },
  { name: 'Mushroom Stew',   heal: 12, value: 8,  description: 'A warm bowl of earthy mushroom stew.' },
];

const MATERIAL_BASES = [
  { name: 'Iron Ore',       value: 5,  description: 'A chunk of raw iron ore.' },
  { name: 'Gold Nugget',    value: 25, description: 'A gleaming nugget of gold.' },
  { name: 'Gemstone',       value: 40, description: 'An uncut gemstone with potential.' },
  { name: 'Dragon Scale',   value: 80, description: 'A scale from a mighty dragon. Very rare.' },
  { name: 'Mithril Shard',  value: 60, description: 'A fragment of the legendary mithril metal.' },
  { name: 'Leather Hide',   value: 8,  description: 'A cured animal hide, ready for crafting.' },
  { name: 'Enchanted Dust', value: 30, description: 'Sparkling dust infused with magical energy.' },
  { name: 'Bone Fragment',  value: 3,  description: 'A bleached piece of bone. Might be useful.' },
];

const ARTIFACT_BASES = [
  { name: 'Crown of the Forgotten King', stats: { int: 5, wis: 5, cha: 5 },  description: 'A crown worn by a king whose name has been lost to time.' },
  { name: 'Orb of Eternal Night',        stats: { int: 8, attack: 5 },       description: 'A sphere of pure darkness that pulses with malevolent energy.' },
  { name: 'Blade of the First Dawn',     stats: { attack: 12, str: 4 },      description: 'A radiant sword said to have been forged at the dawn of creation.' },
  { name: 'Amulet of the Void',          stats: { defense: 6, wis: 6 },      description: 'An amulet that seems to absorb light around it.' },
  { name: 'Ring of the Undying',         stats: { hp: 30, con: 5 },           description: 'A ring that pulses with life force, warding off death itself.' },
  { name: 'Gauntlets of the Titan',      stats: { str: 8, attack: 4 },       description: 'Massive gauntlets that grant the strength of a giant.' },
];

export class ItemGenerator {
  generate(rng, type = 'weapon', rarity = 'common', depth = 1) {
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
    stats.attack = baseAttack;

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
    stats.defense = baseDef;

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
