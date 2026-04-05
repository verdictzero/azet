// ============================================================================
// entities.js — Entity/NPC system for Terminal Gradient, a colony salvage roguelike
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

// ============================================================================
// NPC Category System — determines dialogue behavior
// ============================================================================

const NPC_CATEGORIES = {
  ambient:   ['farmer', 'miner', 'hunter', 'beggar', 'child', 'noble', 'villager'],
  service:   ['merchant', 'blacksmith', 'barkeep', 'innkeeper'],
  knowledge: ['scholar', 'priest'],
  authority: ['guard', 'knight', 'guildmaster'],
};

function getNpcCategory(role) {
  for (const [cat, roles] of Object.entries(NPC_CATEGORIES)) {
    if (roles.includes(role)) return cat;
  }
  return 'ambient';
}

// ============================================================================
// Ambient Dialogue — small talk for non-consequential NPCs
// ============================================================================

const AMBIENT_DIALOGUE = {
  farmer: [
    'The grow-pods are producing well this cycle.',
    'Whatever passes for rain down here, at least the soil stays damp.',
    'Just trying to get through the season.',
    'These hydroponic rigs need constant attention. One valve sticks and you lose a whole crop.',
    'I heard the soil in the eastern terraces is going sour. Bad sign.',
    'We pull good yields when the lamps stay steady. When they flicker... not so much.',
    'My grandfather farmed this same plot. His grandfather before him. It\'s all we know.',
    'The beetles got into the grain stores again. Third time this cycle.',
    'You look like you\'ve been out in the corridors. Dangerous out there.',
    'There\'s honest work in tending the land. Safer than most things around here.',
  ],
  miner: [
    'The deep tunnels are getting unstable. I don\'t like it.',
    'Found some strange alloy down in shaft seven. Never seen anything like it.',
    'Watch yourself near the lower levels. The air gets thin.',
    'We broke through into an old sealed section last week. Foreman won\'t let anyone in.',
    'Ore quality\'s been dropping. We\'re scraping the walls at this point.',
    'Lost a good man in a cave-in two cycles back. The tunnels don\'t forgive mistakes.',
    'Sometimes you hear things in the deep shafts. Echoes, they say. I\'m not so sure.',
    'The hull metal down there is different. Older. Stamped with markings no one can read.',
    'Pays well enough, mining. If you don\'t mind the dark.',
    'My back\'s killing me. Another ten cycles and I\'ll be done.',
  ],
  hunter: [
    'The wildlife\'s been acting strange this cycle. Agitated.',
    'Tracked a razorback through three sectors yesterday. Barely got out.',
    'If you\'re heading into the wilds, watch the tree line. Things hide there.',
    'Best hunting is at dawn, when the lamps are cycling up.',
    'I sell what I catch. Meat, pelts, bone. Everything has a use.',
    'There are things out in the deep corridors that shouldn\'t exist. I\'ve seen them.',
    'Fresh tracks near the settlement wall. Something big.',
    'I know every path within five sectors. Beyond that, you\'re on your own.',
    'Used to hunt with my father. He knew trails I\'ll never find again.',
    'The scouts say there\'s new territory opening up past the old barriers.',
  ],
  child: [
    'Are you an adventurer? You look like an adventurer!',
    'My mum says I shouldn\'t talk to strangers. But you seem okay.',
    'I found a weird shiny thing in the alley. Wanna see? ...Actually, I lost it.',
    'I\'m gonna be a guard when I grow up! Or maybe a scout.',
    'The other kids say there\'s ghosts in the old tunnels. I don\'t believe them. ...Much.',
    'Do you have any sweets? I\'ll trade you a cool rock.',
    'I saw something moving on the rooftops last night. Nobody believes me though.',
    'What\'s it like out there? Beyond the walls? Is it scary?',
    'Tag! ...Oh wait, you\'re not playing. Sorry.',
    'My teacher says the world used to be different. Like, really different. But she won\'t say how.',
  ],
  noble: [
    'The council convenes soon. Politics, as always.',
    'I trust you\'re not here to cause trouble. We have enough of that.',
    'This sector runs on order. I intend to keep it that way.',
    'The common folk don\'t understand the burden of administration.',
    'If you have business here, conduct it and move along.',
    'Resources are tight. Every decision I make, someone suffers.',
    'The old families built this settlement. We\'ll be the ones to maintain it.',
    'I\'ve seen sectors fall to chaos. It starts with complacency.',
    'Trade is the lifeblood of any community. Without it, we starve.',
    'Don\'t mistake civility for weakness. I didn\'t get here by being soft.',
  ],
  beggar: [
    'Spare a shard, friend? Just one...',
    'I wasn\'t always like this, you know. I had a trade once.',
    'The shelters are full. Been sleeping in the alleys.',
    'I see things, out here on the margins. Things people in their warm homes don\'t notice.',
    'The rats and I, we have an understanding. They don\'t bite me, I don\'t eat them. ...Usually.',
    'You hear whispers in the drain grates at night. Voices from below.',
    'Nobody looks at you when you\'re down here. You become invisible.',
    'I used to work the deep tunnels before the accident. Now look at me.',
    'There\'s a kindness in this settlement, buried deep. You just have to find it.',
    'The wind through the corridors tells stories, if you know how to listen.',
  ],
  villager: [
    'Just another day in the settlement.',
    'Things have been quiet lately. That usually means trouble\'s coming.',
    'I keep my head down and do my work. Safest way to live.',
    'The market had fresh supplies this morning. First time in a while.',
    'My neighbor says they saw lights in the old quarter. Probably nothing.',
    'We manage. It\'s not much, but it\'s home.',
    'I don\'t travel much beyond the walls. No need to.',
    'Times are hard, but we\'ve had worse. We always pull through.',
    'You\'re new here, aren\'t you? Be careful who you trust.',
    'The settlement\'s been growing. New faces every cycle.',
  ],
};

// ============================================================================
// Technology Name Degradation — folk names replace forgotten tech terms
// ============================================================================

const TECH_DEGRADATION = {
  'reactor':              'the burning heart',
  'Reactor':              'the Burning Heart',
  'hull':                 'the great wall',
  'Hull':                 'the Great Wall',
  'fusion drive':         'the deep fire',
  'Fusion drive':         'the Deep Fire',
  'airlock':              'the void gate',
  'Airlock':              'the Void Gate',
  'oxygen recycler':      'the breath-giver',
  'Oxygen recycler':      'the Breath-Giver',
  'navigation core':      'the old compass',
  'Navigation core':      'the Old Compass',
  'cryo-vault':           'the sleepers\' tomb',
  'Cryo-vault':           'the Sleepers\' Tomb',
  'cryo-vaults':          'the sleepers\' tombs',
  'Cryo-Vaults':          'the Sleepers\' Tombs',
  'data core':            'memory stone',
  'Data core':            'Memory Stone',
  'data cores':           'memory stones',
  'communications relay': 'the whispering tower',
  'defense grid':         'the iron veil',
  'Defense grid':         'the Iron Veil',
  'habitat drum':         'the great wheel',
  'Habitat drum':         'the Great Wheel',
  'Directorate Protocol': 'the Old Mind',
  'observation deck':     'the sky chamber',
  'Observation deck':     'the Sky Chamber',
  'Observation Ring':     'the Sky Ring',
  'maintenance drone':    'iron sprite',
  'maintenance drones':   'iron sprites',
  'bulkhead':             'the deep door',
  'bulkheads':            'the deep doors',
  'ventilation system':   'the wind tunnels',
  'propulsion':           'the deep hum',
  'cryogenically':        'in the eternal sleep',
  'colony ship':          'the great vessel',
  'generation ship':      'the great vessel',
  'O\'Neill Cylinder':    'the Great Wheel',
  'colonists':            'the first sleepers',
};

/**
 * Replace technical terms with folk names based on lore access level.
 * loreLevel: 'common' (full degradation), 'scholar' (mix), 'forbidden' (original terms)
 */
export function degradeTechTerms(text, loreLevel = 'common') {
  if (loreLevel === 'forbidden') return text; // High-rep forbidden lore uses real names
  let result = text;
  for (const [tech, folk] of Object.entries(TECH_DEGRADATION)) {
    if (loreLevel === 'scholar') {
      // Scholars use a bridging form: "what the ancients called X — we say Y"
      const regex = new RegExp(tech.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
      if (regex.test(result)) {
        result = result.replace(regex, `${folk} — what the old texts call "${tech}"`);
      }
    } else {
      result = result.split(tech).join(folk);
    }
  }
  return result;
}

// Portrait pools keyed by appearance type
const PORTRAITS_FEMALE = [
  'sprites/portraits/npc_female_1.png',
  'sprites/portraits/npc_female_2.png',
  'sprites/portraits/npc_female_3.png',
  'sprites/portraits/npc_female_4.png',
  'sprites/portraits/npc_female_5.png',
];
const PORTRAITS_MALE = [
  'sprites/portraits/npc_male_1.png',
  'sprites/portraits/npc_male_2.png',
];
const PORTRAITS_CHILD = [
  'sprites/portraits/npc_female_child_1.png',
  'sprites/portraits/npc_male_child_1.png',
];

export class NPCGenerator {
  constructor() {
    this.nameGen = new NameGenerator();
    this._worldHistory = null;
  }

  setWorldHistory(worldHistory) {
    this._worldHistory = worldHistory;
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

    // Portrait assignment based on role and deterministic hash
    let portraitPool;
    if (role === 'child') {
      portraitPool = PORTRAITS_CHILD;
    } else {
      // Use name hash to deterministically pick male/female appearance
      const nameHash = (name.full || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0);
      portraitPool = nameHash % 2 === 0 ? PORTRAITS_FEMALE : PORTRAITS_MALE;
    }
    const portraitIdx = Math.abs((name.full || '').split('').reduce((a, c) => a * 31 + c.charCodeAt(0), 0)) % portraitPool.length;
    const portrait = portraitPool[portraitIdx];

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

    // World history enrichment
    let ancestry = null;
    let culturalBackground = null;
    let historicalKnowledge = [];
    let personalBeliefs = null;

    if (this._worldHistory) {
      // Assign NPC to a historical civilization
      const activeCivs = this._worldHistory.civilizations.filter(c => c.isActive);
      if (activeCivs.length > 0) {
        const civMatch = rng.random(activeCivs);
        culturalBackground = {
          civilizationId: civMatch.id,
          civilizationName: civMatch.name,
          values: civMatch.culturalValues,
          architectureStyle: civMatch.architectureStyle,
          traditions: civMatch.traditions.slice(0, 2),
        };

        // Ancestry: did an ancestor do something notable?
        const civFigures = this._worldHistory.historicalFigures.filter(
          f => f.civId === civMatch.id && !f.isAlive && f.deeds.length > 0
        );
        if (civFigures.length > 0 && rng.chance(0.25)) {
          const ancestor = rng.random(civFigures);
          ancestry = {
            figureId: ancestor.id,
            figureName: ancestor.fullName,
            relation: rng.random(['ancestor', 'great-grandparent', 'distant kin', 'namesake']),
            notableDeed: ancestor.deeds.length > 0 ? rng.random(ancestor.deeds).description : null,
          };
        }
      }

      // Personal beliefs from world religions
      if (this._worldHistory.religions.length > 0 && rng.chance(0.6)) {
        const rel = rng.random(this._worldHistory.religions);
        personalBeliefs = {
          religionId: rel.id,
          religionName: rel.name,
          tenet: rng.random(rel.tenets),
          devotion: rng.random(['devout', 'casual', 'questioning', 'lapsed']),
        };
      }

      // Historical knowledge — what this NPC can tell the player
      const majorEvents = this._worldHistory.timeline.filter(e => e.importance === 'major');
      if (majorEvents.length > 0) {
        const known = rng.shuffle([...majorEvents]).slice(0, rng.nextInt(1, 4));
        historicalKnowledge = known.map(e => e.description);
      }
    }

    return {
      id: nextId('npc'),
      name: { first: name.first, last: name.last, full: name.full },
      race,
      role,
      title,
      char,
      color,
      portrait,
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
      // Deep world history data
      ancestry,
      culturalBackground,
      historicalKnowledge,
      personalBeliefs,
      // NPC category for dialogue behavior
      category: getNpcCategory(role),
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
  constructor() {
    this._worldHistory = null;
  }

  setWorldHistory(worldHistory) {
    this._worldHistory = worldHistory;
  }

  generateGreeting(npc, playerRep = 0) {
    const text = "Hi! There isn't any dialogue here yet.";
    const options = this.generateOptions(npc, playerRep);
    return { text, tone: 'neutral', options };
  }

  generateOptions(npc, playerRep = 0, gameContext = null) {
    const options = [];
    // Keep shop access for merchant/blacksmith NPCs
    if (npc.role === 'merchant' || npc.role === 'blacksmith') {
      options.push({ text: 'Let me see your wares.', action: 'shop', consequence: null });
    }
    // Keep rest for barkeep/innkeeper NPCs
    if (npc.role === 'barkeep' || npc.role === 'innkeeper') {
      options.push({ text: 'I need a room for the night.', action: 'rest', consequence: null });
    }
    options.push({ text: 'Goodbye.', action: 'exit', consequence: null });
    return options;
  }

  // ── Ambient NPCs: townspeople, small talk only ──
  _ambientOptions(npc, playerRep) {
    const options = [];

    // Small talk — their primary interaction
    const lines = AMBIENT_DIALOGUE[npc.role] || AMBIENT_DIALOGUE.villager;
    const lineIdx = Math.abs((npc.id || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0)) % lines.length;
    options.push({
      text: lines[lineIdx],
      action: 'smallTalk',
      consequence: null,
      _isSmallTalk: true,
    });

    // Backstory at moderate rep
    if (playerRep >= 10) {
      options.push({
        text: 'Tell me about yourself.',
        action: 'backstory',
        consequence: null,
      });
    }

    // At high rep, hint toward knowledge NPCs
    if (playerRep >= 20) {
      options.push({
        text: 'Heard anything interesting lately?',
        action: 'ambientHint',
        consequence: null,
      });
    }

    options.push({ text: 'Goodbye.', action: 'exit', consequence: null });
    return options;
  }

  // ── Service NPCs: shops, inns, trade ──
  _serviceOptions(npc, playerRep) {
    const options = [];

    // Shop access (merchant/blacksmith)
    if ((npc.role === 'merchant' || npc.role === 'blacksmith') && playerRep >= -20) {
      options.push({
        text: 'Let me see your wares.',
        action: 'shop',
        consequence: null,
      });
    }

    // Inn services (barkeep/innkeeper)
    if (npc.role === 'barkeep' || npc.role === 'innkeeper') {
      options.push({
        text: 'I need a room for the night.',
        action: 'rest',
        consequence: null,
      });
    }

    // Gossip — service NPCs hear things
    if (playerRep >= 0) {
      options.push({
        text: 'What\'s the gossip around here?',
        action: 'rumor',
        consequence: null,
      });
    }

    // Trade tip at high rep
    if (playerRep >= 30) {
      options.push({
        text: 'Any tips for a seasoned trader?',
        action: 'tradeTip',
        consequence: null,
      });
    }

    // Secret at very high rep
    if (playerRep > 50 && npc.secrets && npc.secrets.length > 0) {
      options.push({
        text: 'Between us... anything I should know?',
        action: 'secret',
        consequence: null,
      });
    }

    options.push({ text: 'Goodbye.', action: 'exit', consequence: null });
    return options;
  }

  // ── Knowledge NPCs: scholars, priests — the lore dispensers ──
  _knowledgeOptions(npc, playerRep, gameContext) {
    const options = [];

    // Archive Keepers chain quest access (knowledge NPCs are the Archive Keepers quest givers)
    const factionRank = gameContext?.factionRank;
    if (factionRank && factionRank.rank >= 2 && npc.faction === 'ARCHIVE_KEEPERS') {
      options.push({
        text: `I seek deeper knowledge, Keeper. [${factionRank.name}]`,
        action: 'chainQuest',
        consequence: null,
        _factionId: 'ARCHIVE_KEEPERS',
      });
    }

    // Healing (priest only)
    if (npc.role === 'priest' && playerRep >= -10) {
      options.push({
        text: 'I need healing.',
        action: 'heal',
        consequence: null,
      });
    }

    // Teaching (scholar)
    if (npc.role === 'scholar' && playerRep >= 0) {
      options.push({
        text: 'What can you teach me?',
        action: 'teach',
        consequence: null,
      });
    }

    // Location lore
    options.push({
      text: 'Tell me about this place.',
      action: 'lore',
      consequence: null,
    });

    // Quests — knowledge NPCs give investigation/artifact quests
    if (playerRep >= -10) {
      options.push({
        text: 'Is there anything that needs investigating?',
        action: 'quest',
        consequence: null,
      });
    }

    // World history options (only knowledge NPCs get these)
    if (this._worldHistory && playerRep >= -10) {
      const histCtx = this._worldHistory.getDialogueContext(npc, playerRep);

      options.push({
        text: 'Tell me about the history of this world.',
        action: 'worldHistory',
        consequence: null,
      });

      if (histCtx.additionalTopics) {
        for (const topic of histCtx.additionalTopics.slice(0, 2)) {
          options.push({
            text: topic.text,
            action: topic.action,
            consequence: null,
            _historyResponse: topic.response,
          });
        }
      }

      if (playerRep >= 0) {
        options.push({
          text: 'What do people believe in around here?',
          action: 'religionLore',
          consequence: null,
        });
      }

      if (playerRep >= 10 && npc.role === 'scholar') {
        options.push({
          text: 'Who were the great figures of history?',
          action: 'figureLore',
          consequence: null,
        });
      }

      if (playerRep >= 5) {
        options.push({
          text: 'What wars or disasters shaped this place?',
          action: 'warLore',
          consequence: null,
        });
      }

      if (playerRep >= 0) {
        options.push({
          text: 'What traditions do your people keep?',
          action: 'traditionLore',
          consequence: null,
        });
      }

      // Forbidden history — the deep truth
      if (playerRep >= 30) {
        options.push({
          text: 'What do you know about the Old Truth?',
          action: 'forbiddenLore',
          consequence: null,
        });
      }
    }

    // Backstory
    if (playerRep >= 10) {
      options.push({
        text: 'Tell me about yourself.',
        action: 'backstory',
        consequence: null,
      });
    }

    // Secret at high rep
    if (playerRep > 50 && npc.secrets && npc.secrets.length > 0) {
      options.push({
        text: 'You can trust me... tell me something secret.',
        action: 'secret',
        consequence: null,
      });
    }

    // Faction gossip
    if (playerRep >= 0 && npc.faction && npc.faction !== 'None') {
      options.push({
        text: `What about the ${npc.faction}?`,
        action: 'factionGossip',
        consequence: null,
      });
    }

    options.push({ text: 'Goodbye.', action: 'exit', consequence: null });
    return options;
  }

  // ── Authority NPCs: guards, knights, guildmasters — quest givers ──
  _authorityOptions(npc, playerRep, gameContext) {
    const options = [];

    // Faction rank display and chain quests (Bethesda-style faction questlines)
    const factionRank = gameContext?.factionRank;
    if (factionRank && factionRank.rank >= 1 && npc.faction && npc.faction !== 'None') {
      // Show rank-specific greeting option
      options.push({
        text: `I'm ready for a real assignment. [${factionRank.name}]`,
        action: 'chainQuest',
        consequence: null,
        _factionId: npc.faction,
      });
    }

    // Bounties (guard)
    if (npc.role === 'guard' && playerRep >= 10) {
      options.push({
        text: 'Any trouble in the sector?',
        action: 'bounty',
        consequence: null,
      });
    }

    // General quests (radiant)
    if (playerRep >= -10) {
      options.push({
        text: 'Any work available?',
        action: 'quest',
        consequence: null,
      });
    }

    // Location info (basic, not deep lore)
    options.push({
      text: 'Tell me about this place.',
      action: 'lore',
      consequence: null,
    });

    // Faction gossip — authority NPCs know faction politics
    if (playerRep >= 0 && npc.faction && npc.faction !== 'None') {
      options.push({
        text: `What about the ${npc.faction}?`,
        action: 'factionGossip',
        consequence: null,
      });
    }

    // Faction rank inquiry
    if (npc.faction && npc.faction !== 'None') {
      options.push({
        text: 'What is my standing with your faction?',
        action: 'factionRank',
        consequence: null,
        _factionId: npc.faction,
      });
    }

    // Rumors from their patrols/network
    if (playerRep >= 0) {
      options.push({
        text: 'Heard any reports?',
        action: 'rumor',
        consequence: null,
      });
    }

    // Secret at high rep
    if (playerRep > 50 && npc.secrets && npc.secrets.length > 0) {
      options.push({
        text: 'Off the record... anything I should know?',
        action: 'secret',
        consequence: null,
      });
    }

    options.push({ text: 'Goodbye.', action: 'exit', consequence: null });
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
    // Use world history for grounded rumors (50% chance if available)
    if (this._worldHistory && rng.chance(0.5)) {
      return this._worldHistory.generateHistoricalRumor(rng);
    }

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

  /**
   * Generate a rumor that may also produce a quest lead.
   * Returns { text, lead } where lead is null or a quest lead object.
   */
  generateRumorWithLead(rng, worldContext = null) {
    const text = this.generateRumor(rng, worldContext);
    let lead = null;

    // 30% chance a rumor becomes a quest lead
    if (rng.chance(0.3) && worldContext) {
      const nearbyLocs = worldContext.nearbyLocations || [];
      const exploredLocations = worldContext.exploredLocations || new Set();

      // Prefer unexplored locations for leads
      const unexplored = nearbyLocs.filter(l => !exploredLocations.has(`${l.x},${l.y}`));
      const targetLoc = unexplored.length > 0 ? rng.random(unexplored) : (nearbyLocs.length > 0 ? rng.random(nearbyLocs) : null);

      if (targetLoc) {
        const leadTemplates = [
          `They say ${targetLoc.name} holds something valuable...`,
          `I heard strange sounds coming from ${targetLoc.name}. Someone should check it out.`,
          `A scavenger found something unusual near ${targetLoc.name} before disappearing.`,
          `The old maps show a route to ${targetLoc.name} that nobody uses anymore.`,
          `Someone claims to have seen lights in ${targetLoc.name}. Probably nothing... probably.`,
        ];

        lead = {
          id: `lead_${Date.now()}_${rng.nextInt(0, 9999)}`,
          text: rng.random(leadTemplates),
          targetLocation: targetLoc.name,
          targetCoords: { x: targetLoc.x, y: targetLoc.y },
          locationType: targetLoc.type,
          followed: false,
          source: 'rumor',
        };
      }
    }

    return { text, lead };
  }

  modifyReputation(npc, amount, reason = '') {
    npc.playerReputation = Math.max(-100, Math.min(100, (npc.playerReputation || 0) + amount));
    npc.memory.push({
      type: 'reputation_change',
      amount,
      reason,
      timestamp: Date.now(),
    });
    // Cap memory to prevent unbounded growth
    if (npc.memory.length > 20) npc.memory.splice(0, npc.memory.length - 20);
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
  'Before Year Zero, they say the colony had a different name — a designation, like a vessel. But such talk is considered heresy.',
  'The Directorate Protocol once governed everything — an intelligence that managed the colony across centuries. What remains of it sleeps in the deep systems.',
  'The Cascade destroyed seventy percent of all data cores in a single day. Everything we knew before that moment is fragments and hearsay.',
  'A group called the Awakened once tried to reveal a forbidden truth about the colony. They were silenced, and three sectors were lost.',
  'The oldest structural beams bear a word stamped in pre-collapse script: AETHEON. Archivists argue endlessly about what it means.',
  'In the Observation Ring, ancient projectors sometimes flicker to life, displaying an image of a blue-green world beneath a yellow star.',
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
  'a rogue drone swarm', 'malfunctioning security turrets', 'marauding scrap raiders',
  'a corrupted maintenance AI', 'mutated hull parasites', 'alien infiltrators from the outer hull',
  'nano-fungal growths consuming Sector 7', 'assimilated colonists from the quarantine zone',
  'an awakened reactor guardian', 'void sentinels patrolling the breach points',
  'Directorate enforcement drones reactivated from before the Forgetting',
  'corrupted Warden Corps automatons still executing centuries-old suppression orders',
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
  'Chief Engineer Durin', 'Founder Vasquez', 'the Blind Fabricator', 'Director Isolde',
  'Kira Steelhand', 'the ancient Founders', 'an unnamed Enhanced artisan',
  'Director Elena Vasquez', 'Architect Okonkwo', 'the Terran Compact engineers',
  'the Directorate Protocol', 'Dr. Yuki Tanaka, the AI Architect',
];

const LORE_HEROES = [
  'Administrator Aldric the Bold', 'the Champion of the Colony', 'Selene the Wanderer',
  'Commander Roderick Ashford', 'the last Warden', 'the legendary Bolt Ironcore',
  'Captain Maren Strand, First Captain of the AETHEON', 'the First Warden of the AETHEON',
  'Archivist Yun, Keeper of the Old Truth', 'Admiral Kofi Asante, founder of the Warden Corps',
];

const LORE_MOUNTAINS = [
  'Erebus', 'Ashfall', 'Thunderpeak', 'Dragon Spire', 'Ironholme', 'Frosthold',
];

const LORE_PURPOSES = [
  'sector garrison', 'data archive', 'trade depot', 'mining outpost', 'watch station',
  "engineer's workshop", 'containment cell', "administrator's office", 'med-bay', 'server vault',
  'cryo-vault', 'navigation array', 'bridge access corridor', 'Directorate monitoring station',
  'colony ship manifest archive', 'launch memorial hall',
];

const LORE_PROFESSIONS = [
  'sector guard', 'deep salvager', 'smuggler', 'data analyst', 'parts dealer', 'pit fighter',
  'archive assistant', 'scout', 'hydroponist', 'patrol runner', 'contraband runner', "engineer's apprentice",
];

const LORE_PLACES = [
  'the central hub', 'a small agri-sector', 'the frontier beyond the outer hull',
  'the sealed sections', 'the Enhanced quarters', 'the Cyborg workshops', 'a distant sector',
  'the border checkpoints', 'the scorched reactor district', 'the upper deck passages',
  'the sealed bridge on Level Zero', 'the Cryo-Vaults', 'the Navigation Spire',
  'the Directorate Sanctum', 'the Launch Memorial', 'the ruins of the Archive Spire',
];

// ============================================================================
// Colony Origin & Forbidden Knowledge lore templates
// ============================================================================

const COLONY_ORIGIN_TEMPLATES = [
  'The oldest data cores speak of a place called "Earth" — a world under an open sky, whatever that means.',
  'The Founders didn\'t build the colony. They merely inherited it. The true builders are lost to time.',
  'Have you ever wondered why the hull curves upward in the distance? The old schematics show a cylinder — a vessel. But that\'s heresy to say aloud.',
  'There\'s a word etched into the deepest bulkheads: AETHEON. No one knows what it means anymore.',
  'The Directorate Protocol — some say it was an AI that governed the colony before the factions arose. Others say it still watches from the deep systems.',
  'My grandmother told me her grandmother spoke of "stars" — not the patterns on the archive walls, but lights in an infinite darkness outside the hull.',
  'The colony wasn\'t always called "the colony." It had a name once. A designation. Like a vessel has a designation.',
  'Before the Forgetting, people knew where they came from and where they were going. Can you imagine? Having a destination?',
  'The Terran Compact — that\'s who built all of this. A coalition of nations from a dying world. They built a ship to carry their children to the stars.',
  'The reactors aren\'t just power sources. They\'re engines. The whole colony is a vessel, and it\'s still moving. Listen to the hull — you can feel it.',
  'There\'s a memorial near Level Zero. Faded names, thousands of them. People who built the colony but never got to board. They knew they were building their own grave.',
  'The sealed bridge — some say it\'s where the colony is actually controlled from. Not by any faction. By the ship itself.',
  'Five hundred thousand souls boarded the AETHEON when it launched. That was over two thousand cycles ago. Everything since has been the voyage.',
  'The old archives mention something called "rain" — water falling from the sky, not recycled through pipes. Imagine a world where water just... falls on you.',
  'Chief Architect Okonkwo designed the habitat drum. A rotating cylinder 30 kilometers long. We don\'t live in a world. We live inside a machine she built.',
];

const FORBIDDEN_KNOWLEDGE_TEMPLATES = [
  'I found a data core in the sub-levels. It showed images — a blue sphere with white swirls. Oceans of water under a burning light. They called it "home."',
  'The sealed bridge — it\'s real. Level Zero, past the Quarantine Sectors. The Directorate locked it after The Cascade. No one\'s been there in centuries.',
  'We\'re moving. The whole colony. I ran the numbers from a salvaged navigation core — we\'ve been moving for over two thousand cycles. We\'re a ship.',
  'The Directorate Protocol wasn\'t a government. It was a machine — an artificial intelligence built to manage the colony across millennia. It decided we were better off not knowing.',
  'There are people in the Cryo-Vaults. Frozen, not dead. Preserved since before Year Zero. Original passengers from Earth. Ten thousand of them, sleeping.',
  'The Cascade wasn\'t just a reactor failure. It was an EMP that erased seventy percent of every data core on the ship. That\'s why we don\'t remember who we are.',
  'The Schism — before Year Zero, a group called the Awakened tried to tell everyone the truth. The Directorate vented three sectors to stop them. Forty thousand people, dead for knowing too much.',
  'I found the original mission charter: "To preserve the human species beyond the death of its homeworld, and to establish a new civilization on Kepler-442b, designated New Dawn."',
  'Earth didn\'t just decline. It died. Global temperature up nine degrees, oceans acidified, atmosphere toxic. Eight hundred million people left when the AETHEON launched. They\'re all dead now.',
  'The last transmission from Earth: "Carry us with you. Remember us." That was over two thousand cycles ago. We forgot. We forgot everything.',
  'Navigation data from the old spire shows we\'re decelerating. We\'ve been slowing down for centuries. Whatever destination the builders chose — we might be close.',
  'The word "AETHEON" — it\'s an acronym. Arcology Engine Transgenerational Habitat for Extra-solar Operations and Navigation. It\'s not a colony. It\'s a generation ship.',
];

export class LoreGenerator {
  constructor() {
    this._worldHistory = null;
  }

  setWorldHistory(worldHistory) {
    this._worldHistory = worldHistory;
  }

  _fillTemplate(rng, template, factionNames, locationNames) {
    let text = template;

    // If world history is available, pull names from actual history
    if (this._worldHistory) {
      const figures = this._worldHistory.historicalFigures || [];
      const artifacts = this._worldHistory.artifacts || [];
      const regions = this._worldHistory.regions || [];
      const notableFig = figures.filter(f => f.deeds.length > 0);

      if (notableFig.length > 0) {
        const hero = rng.random(notableFig);
        text = text.replace('{HERO}', hero.fullName);
        text = text.replace('{SMITH}', hero.fullName);
      }

      if (regions.length > 0) {
        text = text.replace('{REGION}', rng.random(regions).name);
        text = text.replace('{MOUNTAIN}', rng.random(regions).name);
        text = text.replace('{PLACE}', rng.random(regions).name);
      }
    }

    // Fallback replacements for anything not yet substituted
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
    // If deep world history is available, build entries from actual timeline
    if (this._worldHistory && this._worldHistory.eras && this._worldHistory.eras.length > 0) {
      const entries = [];
      for (const era of this._worldHistory.eras) {
        entries.push({
          era: era.index + 1,
          text: era.summary,
        });
        // Add major events from this era
        const majorEvents = (era.events || []).filter(e => e.importance === 'major');
        for (const evt of majorEvents.slice(0, 3)) {
          entries.push({
            era: era.index + 1,
            text: evt.description,
          });
        }
      }
      return entries;
    }

    // Fallback: template-based generation
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
    // Use actual artifact history if available
    if (this._worldHistory && this._worldHistory.artifacts.length > 0) {
      const art = rng.random(this._worldHistory.artifacts);
      return `${itemName}: ${art.description}`;
    }
    const template = rng.random(ARTIFACT_TEMPLATES);
    const text = this._fillTemplate(rng, template, [], []);
    return `${itemName}: ${text}`;
  }

  generateLocationHistory(rng, locationName = 'this place', locationType = 'ruins') {
    // Use actual location history if available
    if (this._worldHistory) {
      const locHist = this._worldHistory.getLocationHistory(locationName);
      if (locHist.events.length > 0) {
        const parts = [`${locationName}:`];
        if (locHist.controllingCiv) {
          parts.push(`Controlled by ${locHist.controllingCiv.name}.`);
        }
        if (locHist.region) {
          parts.push(`Resources: ${locHist.region.resources}. Terrain: ${locHist.region.terrain}.`);
        }
        for (const evt of locHist.events.slice(0, 3)) {
          parts.push(evt.description);
        }
        if (locHist.artifacts.length > 0) {
          parts.push(`The legendary ${locHist.artifacts[0].name} was last seen here.`);
        }
        return parts.join(' ');
      }
    }
    const template = rng.random(LOCATION_TEMPLATES);
    const text = this._fillTemplate(rng, template, [], [locationName]);
    return `${locationName}: ${text}`;
  }

  generateNPCBackstory(rng, npc) {
    const name = npc && npc.name ? npc.name.full : 'Unknown';

    // Tie backstory to world history if available
    if (this._worldHistory) {
      const backstoryParts = [];
      const template = rng.random(NPC_BACKSTORY_TEMPLATES);
      backstoryParts.push(this._fillTemplate(rng, template, [], []));

      // Reference a historical event the NPC or their ancestors witnessed
      if (rng.chance(0.5) && this._worldHistory.catastrophes.length > 0) {
        const cat = rng.random(this._worldHistory.catastrophes);
        backstoryParts.push(`My grandparents survived ${cat.name}. They never spoke of it without trembling.`);
      }

      if (rng.chance(0.4) && this._worldHistory.wars.length > 0) {
        const war = rng.random(this._worldHistory.wars);
        backstoryParts.push(`The family lost everything during ${war.name}. We've been rebuilding ever since.`);
      }

      if (rng.chance(0.3) && this._worldHistory.civilizations.filter(c => c.isActive).length > 0) {
        const civ = rng.random(this._worldHistory.civilizations.filter(c => c.isActive));
        backstoryParts.push(`I was raised under ${civ.name}'s traditions. We value ${civ.culturalValues[0] || 'survival'} above all.`);
      }

      if (rng.chance(0.2) && this._worldHistory.religions.length > 0) {
        const rel = rng.random(this._worldHistory.religions);
        backstoryParts.push(`I follow ${rel.name}. "${rng.random(rel.tenets)}" — those words guide me.`);
      }

      return `${name}: "${backstoryParts.join(' ')}"`;
    }

    const template = rng.random(NPC_BACKSTORY_TEMPLATES);
    const text = this._fillTemplate(rng, template, [], []);
    return `${name}: "${text}"`;
  }

  // Generate a rumor grounded in actual world history
  generateHistoricalRumor(rng) {
    if (this._worldHistory) {
      return this._worldHistory.generateHistoricalRumor(rng);
    }
    // Fallback to template rumor
    return rng.random(RUMOR_TEMPLATES).replace('{LOCATION}', 'the old ruins').replace('{NPC_NAME}', 'Old Kael').replace('{PROFESSION}', 'scavenger');
  }

  // Generate a lore snippet on a specific topic from world history
  generateLoreSnippet(rng, topic = 'general') {
    if (this._worldHistory) {
      return this._worldHistory.generateLoreSnippet(rng, topic);
    }
    return this._fillTemplate(rng, rng.random(WORLD_HISTORY_TEMPLATES), [], []);
  }

  // Generate a forbidden knowledge fragment about the colony's true origins
  generateForbiddenKnowledge(rng) {
    // Use deep world history pre-history data if available
    if (this._worldHistory && this._worldHistory.preHistory) {
      const fk = rng.random(this._worldHistory.preHistory.forbiddenKnowledge);
      return fk.fragment;
    }
    // Fallback to template
    return rng.random(FORBIDDEN_KNOWLEDGE_TEMPLATES);
  }

  // Generate a colony origin lore snippet (less secret than forbidden knowledge)
  generateColonyOriginLore(rng) {
    // Use deep world history if available for richer content
    if (this._worldHistory && this._worldHistory.preHistory) {
      if (rng.chance(0.5)) {
        return this._worldHistory.generateLoreSnippet(rng, rng.random(['origin', 'founders', 'forgetting', 'earth', 'mission']));
      }
    }
    // Fallback to template
    return rng.random(COLONY_ORIGIN_TEMPLATES);
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

    // Start with 10 Tents
    for (let i = 0; i < 10; i++) {
      this.inventory.push({
        id: `start_tent_${i}`,
        name: 'Tent',
        type: 'rest',
        subtype: 'tent',
        char: '\u25B2',
        color: '#8B6914',
        rarity: 'common',
        value: 15,
        effect: { heal: 20 },
        description: 'A portable shelter. Rest to restore 20 HP.',
      });
    }

    this.abilities = (CLASS_ABILITIES[playerClass] || []).map(a => ({ ...a }));
    this.quests = { active: [], completed: [] };
    this.knownLocations = new Set();
    this.gold = 50;

    // O'Neill cylinder section tracking
    this.currentSection = 'H4';                      // Section the player is currently in
    this.unlockedSections = new Set(['H4']);          // Sections the player can access
    this.discoveredSections = new Set(['H4']);        // Sections the player knows about
    this.activatedTransitStations = new Set();       // Transit stations the player has activated
    this.hasEVA = false;                             // Can survive vacuum sections

    // Lore discovery tracking — only discovered lore appears in the Almanac
    this.discoveredLore = {
      locations: [],     // { id, text, source, discoveredAt }
      history: [],       // { id, text, source, discoveredAt }
      figures: [],       // { id, text, source, discoveredAt }
      artifacts: [],     // { id, text, source, discoveredAt }
      civilizations: [], // { id, text, source, discoveredAt }
      forbidden: [],     // { id, text, source, discoveredAt }
      rumors: [],        // { id, text, source, discoveredAt }
      traditions: [],    // { id, text, source, discoveredAt }
      religions: [],     // { id, text, source, discoveredAt }
    };
  }

  /**
   * Record a piece of discovered lore in the player's journal.
   * Deduplicates by text content hash.
   */
  recordLore(category, text, sourceName = 'Unknown') {
    if (!this.discoveredLore[category]) return;
    // Simple hash for dedup
    const id = text.slice(0, 80).replace(/\s+/g, '_').toLowerCase();
    if (this.discoveredLore[category].some(e => e.id === id)) return;
    this.discoveredLore[category].push({
      id,
      text,
      source: sourceName,
      discoveredAt: Date.now(),
    });
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
    if (this._debugInfiniteAttack) return 9999;
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

  /**
   * Check if the player has a light source (torch or lantern) in inventory or equipped.
   * Returns {hasLight, type, radius, color} or {hasLight: false}.
   */
  hasLightSource() {
    // Check equipment first
    for (const slot of Object.values(this.equipment)) {
      if (slot && slot.lightSource) {
        return { hasLight: true, type: slot.lightSource.type, radius: slot.lightSource.radius, color: slot.lightSource.color, item: slot };
      }
    }
    // Check inventory
    for (const item of this.inventory) {
      if (item.lightSource) {
        return { hasLight: true, type: item.lightSource.type, radius: item.lightSource.radius, color: item.lightSource.color, item };
      }
    }
    return { hasLight: false };
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
  { name: 'Plasma-Forged',   statMul: 1.4 },
  { name: 'Hardened',        statMul: 1.4 },
  { name: 'Polished',        statMul: 1.3 },
  { name: 'Nano-Enhanced',   statMul: 1.5 },
  { name: 'Founder-Era',     statMul: 1.6 },
  { name: 'Void-Touched',    statMul: 1.5 },
  { name: 'Masterwork',      statMul: 1.7 },
  { name: 'Plated',          statMul: 1.3 },
  { name: 'Alloy-Tempered',  statMul: 1.8 },
  { name: 'Prototype',       statMul: 2.0 },
];

const ITEM_SUFFIXES = [
  { name: 'of Might',           bonus: { str: 2 } },
  { name: 'of Swiftness',       bonus: { dex: 2 } },
  { name: 'of the Founders',    bonus: { wis: 2 } },
  { name: 'of Endurance',       bonus: { con: 3 } },
  { name: 'of Fury',            bonus: { attack: 3 } },
  { name: 'of Shielding',       bonus: { defense: 2 } },
  { name: 'of Precision',       bonus: { dex: 3 } },
  { name: 'of the Void',        bonus: { str: 3 } },
  { name: 'of Processing',      bonus: { int: 2 } },
  { name: 'of Vitality',        bonus: { hp: 10 } },
  { name: 'of the Fabricator',  bonus: { attack: 2 } },
  { name: 'of the Bulkhead',    bonus: { defense: 3 } },
  { name: 'of the Archive',     bonus: { wis: 3, int: 2 } },
  { name: 'of Breaching',       bonus: { attack: 5 } },
  { name: 'of the Reactor',     bonus: { hp: 15, str: 1 } },
  // Temperature resistance suffixes
  { name: 'of Insulation',      bonus: { coldResist: 3 } },
  { name: 'of Cooling',         bonus: { heatResist: 3 } },
  { name: 'of the Frost',       bonus: { coldResist: 5, defense: 1 } },
  { name: 'of the Forge',       bonus: { heatResist: 5, defense: 1 } },
  { name: 'of Thermal Balance', bonus: { heatResist: 2, coldResist: 2 } },
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
  { name: 'Med-Gel Injector',    subtype: 'healing',  color: '#ff4444', effect: { heal: 20 },              value: 15, description: 'A pressurized gel capsule that accelerates tissue repair.' },
  { name: 'Stim Cartridge',      subtype: 'mana',     color: '#4444ff', effect: { mana: 20 },              value: 15, description: 'A neural stimulant that restores focus and energy.' },
  { name: 'Adrenal Booster',     subtype: 'strength', color: '#ff8800', effect: { str: 3, duration: 50 },  value: 25, description: 'A synthetic hormone shot that temporarily amplifies strength.' },
  { name: 'Corrosive Vial',      subtype: 'poison',   color: '#44ff44', effect: { damage: 15 },            value: 20, description: 'A capsule of concentrated industrial solvent.' },
  { name: 'Bio-Patch',           subtype: 'healing',  color: '#ff6666', effect: { heal: 15 },              value: 12, description: 'An adhesive patch that delivers slow-release healing agents.' },
  { name: 'Trauma Foam',         subtype: 'healing',  color: '#ffaaaa', effect: { heal: 25 },              value: 20, description: 'Expanding medical foam that seals and heals deep wounds.' },
];

const SCROLL_BASES = [
  { name: 'Thermal Grenade',         effect: 'fireball',  damage: 20, value: 30, description: 'Deploys a concentrated thermal charge on nearby targets.' },
  { name: 'Emergency Translocator',  effect: 'teleport',  damage: 0,  value: 40, description: 'Single-use spatial displacement device. Random destination.' },
  { name: 'Diagnostic Scanner',      effect: 'identify',  damage: 0,  value: 20, description: 'Reveals the true specifications of a piece of equipment.' },
  { name: 'Nano-Forge Kit',          effect: 'enchant',   damage: 0,  value: 50, description: 'Nanite assembly kit that upgrades equipment properties.' },
  { name: 'Sector Map Chip',         effect: 'map',       damage: 0,  value: 25, description: 'Data chip that reveals the layout of the current level.' },
  { name: 'Arc Discharge',           effect: 'lightning', damage: 25, value: 35, description: 'Fires a high-voltage arc at the nearest hostile contact.' },
];

const FOOD_BASES = [
  { name: 'Ration Bar',        heal: 5,  value: 3,  description: 'A compressed nutrient block. Filling enough.' },
  { name: 'Protein Strip',     heal: 8,  value: 5,  description: 'A hearty strip of vat-grown protein.' },
  { name: 'Dried Myco-Fiber',  heal: 10, value: 6,  description: 'Preserved strips of colony-grown fungal fiber.' },
  { name: 'Nutrient Paste',    heal: 20, value: 15, description: 'Calorie-dense bioengineered paste. A single tube sustains for a day.' },
  { name: 'Synth Porridge',    heal: 12, value: 8,  description: 'A bowl of reconstituted grain substitute. Tasteless but filling.' },
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

// ============================================================================
// Unique Quest Reward Items — Special named items from quest chains
// ============================================================================

export const UNIQUE_QUEST_ITEMS = {
  founders_torch: {
    name: "Founder's Torch",
    type: 'light',
    subtype: 'torch',
    rarity: 'legendary',
    char: '!',
    color: '#FFFF55',
    stats: { attack: 5, int: 3, wis: 3 },
    value: 500,
    description: 'A light source carried by the original AETHEON crew. It never dims.',
    isUnique: true,
  },
  directors_keycard: {
    name: "Director's Keycard",
    type: 'artifact',
    subtype: 'key',
    rarity: 'legendary',
    char: '¥',
    color: '#FF55FF',
    stats: { int: 5, wis: 5 },
    value: 750,
    description: 'A keycard from the original Directorate. Opens doors sealed for millennia.',
    isUnique: true,
  },
  salvage_kings_hammer: {
    name: "Salvage King's Hammer",
    type: 'weapon',
    subtype: 'mace',
    rarity: 'legendary',
    char: ')',
    color: '#FFAA00',
    stats: { attack: 14, str: 6, con: 3 },
    value: 600,
    description: 'The legendary hammer of the first Salvage Guildmaster. It can break through anything.',
    isUnique: true,
  },
  voidwalker_cloak: {
    name: "Voidwalker's Cloak",
    type: 'armor',
    subtype: 'chestplate',
    rarity: 'legendary',
    char: '[',
    color: '#555555',
    stats: { defense: 10, dex: 5, coldResist: 20 },
    value: 700,
    description: 'A cloak woven from hull insulation. Renders the wearer nearly invisible in darkness.',
    isUnique: true,
  },
  archivists_codex: {
    name: "Archivist's Codex",
    type: 'artifact',
    subtype: 'scroll',
    rarity: 'legendary',
    char: '?',
    color: '#FFFFFF',
    stats: { int: 8, wis: 6, mana: 30 },
    value: 800,
    description: 'A data tablet containing fragments of Earth\'s history. Knowledge is power.',
    isUnique: true,
  },
  syndicate_blade: {
    name: "The Whisper",
    type: 'weapon',
    subtype: 'dagger',
    rarity: 'legendary',
    char: ')',
    color: '#AA00AA',
    stats: { attack: 10, dex: 7, cha: 3 },
    value: 650,
    description: 'The Syndicate\'s most prized blade. Kills silently and without trace.',
    isUnique: true,
  },
  hull_wardens_shield: {
    name: "Hull Warden's Bulwark",
    type: 'armor',
    subtype: 'shield',
    rarity: 'legendary',
    char: '0',
    color: '#5555FF',
    stats: { defense: 14, con: 5, hp: 25 },
    value: 700,
    description: 'A shield forged from AETHEON hull plating. Nearly indestructible.',
    isUnique: true,
  },
  reactor_heart: {
    name: "Reactor Heart",
    type: 'artifact',
    subtype: 'amulet',
    rarity: 'legendary',
    char: '"',
    color: '#FF5555',
    stats: { str: 4, int: 4, attack: 6, hp: 20, mana: 20 },
    value: 1000,
    description: 'A miniaturized fusion core from Reactor 7. It pulses with impossible heat.',
    isUnique: true,
  },
};

// ============================================================================
// Quest Chain Definitions — Multi-stage quest arcs per faction
// ============================================================================

export const QUEST_CHAIN_DEFINITIONS = [
  // ── Colony Guard Questline ──
  {
    id: 'chain_guard_01',
    name: 'The Wall Must Hold',
    faction: 'COLONY_GUARD',
    requiredRank: 1,
    minLevel: 2,
    stages: [
      {
        stageIndex: 0,
        questType: 'KILL',
        titleTemplate: 'Perimeter Breach',
        descTemplate: 'Hostile creatures have breached the outer bulkheads. {NPC} needs someone to eliminate the {MONSTER} before they reach the inner decks.',
        rewardMultiplier: 1.0,
      },
      {
        stageIndex: 1,
        questType: 'INVESTIGATE',
        titleTemplate: 'Source of the Breach',
        descTemplate: 'The breach was no accident. {NPC} wants you to investigate how the creatures got through the sealed sections.',
        rewardMultiplier: 1.3,
      },
      {
        stageIndex: 2,
        questType: 'FETCH',
        titleTemplate: 'Seal the Wall',
        descTemplate: '{NPC} needs materials to reinforce the breach. Gather {N} {ITEM} from the maintenance bays.',
        rewardMultiplier: 1.5,
      },
      {
        stageIndex: 3,
        questType: 'KILL',
        titleTemplate: 'The Thing Behind the Wall',
        descTemplate: 'Something massive lurks in the sealed section. {NPC} says it must be destroyed before the wall can hold.',
        rewardMultiplier: 2.0,
      },
    ],
    finalReward: {
      uniqueItem: UNIQUE_QUEST_ITEMS.hull_wardens_shield,
      factionRep: 25,
      loreReward: { category: 'forbidden', hint: 'The breach reveals what lies beyond the colony walls.' },
    },
    factionConsequences: { 'COLONY_GUARD': 15, 'COLONY_COUNCIL': 5, 'RUST_RAIDERS': -10 },
  },

  // ── Salvage Guild Questline ──
  {
    id: 'chain_salvage_01',
    name: 'The Lost Expedition',
    faction: 'SALVAGE_GUILD',
    requiredRank: 1,
    minLevel: 3,
    stages: [
      {
        stageIndex: 0,
        questType: 'INVESTIGATE',
        titleTemplate: 'The Missing Team',
        descTemplate: 'A salvage team went into the deep levels and never returned. {NPC} wants you to find out what happened.',
        rewardMultiplier: 1.0,
      },
      {
        stageIndex: 1,
        questType: 'FETCH',
        titleTemplate: 'Recovery Operation',
        descTemplate: 'You found signs of the lost team. {NPC} needs you to recover their equipment — {N} {ITEM} — before scavengers take it.',
        rewardMultiplier: 1.3,
      },
      {
        stageIndex: 2,
        questType: 'ESCORT',
        titleTemplate: 'The Survivor',
        descTemplate: 'One member of the lost team is still alive. Escort them back to {NPC} through hostile territory.',
        rewardMultiplier: 1.5,
      },
      {
        stageIndex: 3,
        questType: 'CLEAR',
        titleTemplate: 'Reclaim the Deep',
        descTemplate: 'The deep levels hold salvage worth a fortune. Clear the area so the Guild can move in.',
        rewardMultiplier: 2.0,
      },
    ],
    finalReward: {
      uniqueItem: UNIQUE_QUEST_ITEMS.salvage_kings_hammer,
      factionRep: 25,
      loreReward: { category: 'history', hint: 'The deep levels hold secrets from before the Long Drift.' },
    },
    factionConsequences: { 'SALVAGE_GUILD': 15, 'COLONY_GUARD': 5, 'SYNDICATE': -5 },
  },

  // ── Archive Keepers Questline ──
  {
    id: 'chain_archive_01',
    name: 'The Forbidden Archive',
    faction: 'ARCHIVE_KEEPERS',
    requiredRank: 2,
    minLevel: 4,
    stages: [
      {
        stageIndex: 0,
        questType: 'FETCH',
        titleTemplate: 'Lost Data Cores',
        descTemplate: '{NPC} has discovered references to pre-Cascade data cores. Find {N} {ITEM} from the sealed archive vaults.',
        rewardMultiplier: 1.0,
      },
      {
        stageIndex: 1,
        questType: 'INVESTIGATE',
        titleTemplate: 'The Encrypted Records',
        descTemplate: 'The data cores contain encrypted records from before the Cascade. {NPC} needs you to find clues to decrypt them.',
        rewardMultiplier: 1.5,
      },
      {
        stageIndex: 2,
        questType: 'DELIVER',
        titleTemplate: 'A Dangerous Truth',
        descTemplate: 'The decrypted data reveals something the Colony Council may not want known. Deliver the findings to {NPC} in {LOCATION}.',
        rewardMultiplier: 1.5,
      },
      {
        stageIndex: 3,
        questType: 'INVESTIGATE',
        titleTemplate: 'The Name of the Ship',
        descTemplate: 'The records speak of AETHEON — the true name of the colony vessel. {NPC} needs you to find the original launch records.',
        rewardMultiplier: 2.5,
      },
    ],
    finalReward: {
      uniqueItem: UNIQUE_QUEST_ITEMS.archivists_codex,
      factionRep: 30,
      loreReward: { category: 'forbidden', hint: 'You now know AETHEON\'s true name and purpose.' },
    },
    factionConsequences: { 'ARCHIVE_KEEPERS': 20, 'COLONY_COUNCIL': -10, 'SYNDICATE': -5 },
  },

  // ── Syndicate Questline ──
  {
    id: 'chain_syndicate_01',
    name: 'Shadow Operations',
    faction: 'SYNDICATE',
    requiredRank: 1,
    minLevel: 3,
    stages: [
      {
        stageIndex: 0,
        questType: 'DELIVER',
        titleTemplate: 'The Drop',
        descTemplate: 'A simple job. Deliver {ITEM} to a contact in {LOCATION}. No questions asked, says {NPC}.',
        rewardMultiplier: 1.0,
      },
      {
        stageIndex: 1,
        questType: 'BOUNTY',
        titleTemplate: 'Loose Ends',
        descTemplate: 'Someone talked. {NPC} wants {CRIMINAL} silenced before the Guard gets involved.',
        rewardMultiplier: 1.5,
      },
      {
        stageIndex: 2,
        questType: 'FETCH',
        titleTemplate: 'The Heist',
        descTemplate: '{NPC} has identified a Colony Council vault. Acquire {N} {ITEM} from inside — discretely.',
        rewardMultiplier: 2.0,
      },
      {
        stageIndex: 3,
        questType: 'INVESTIGATE',
        titleTemplate: 'The Syndicate\'s Secret',
        descTemplate: '{NPC} reveals the Syndicate has been searching for something specific. Investigate {SUBJECT} to find it.',
        rewardMultiplier: 2.5,
      },
    ],
    finalReward: {
      uniqueItem: UNIQUE_QUEST_ITEMS.syndicate_blade,
      factionRep: 25,
      loreReward: { category: 'forbidden', hint: 'The Syndicate knows something about the Bridge that no one else does.' },
    },
    factionConsequences: { 'SYNDICATE': 15, 'COLONY_GUARD': -15, 'COLONY_COUNCIL': -10 },
  },

  // ── Colony Council Questline ──
  {
    id: 'chain_council_01',
    name: 'The Governance Crisis',
    faction: 'COLONY_COUNCIL',
    requiredRank: 2,
    minLevel: 5,
    stages: [
      {
        stageIndex: 0,
        questType: 'INVESTIGATE',
        titleTemplate: 'Political Tensions',
        descTemplate: 'Factions within the Council are at each other\'s throats. {NPC} needs someone outside politics to investigate {SUBJECT}.',
        rewardMultiplier: 1.0,
      },
      {
        stageIndex: 1,
        questType: 'ESCORT',
        titleTemplate: 'The Envoy',
        descTemplate: 'A diplomatic envoy must reach {LOCATION} safely. The journey is dangerous and enemies are watching.',
        rewardMultiplier: 1.5,
      },
      {
        stageIndex: 2,
        questType: 'BOUNTY',
        titleTemplate: 'The Saboteur',
        descTemplate: 'Someone is sabotaging the Council from within. {NPC} has identified {CRIMINAL} as the traitor. Bring them in.',
        rewardMultiplier: 2.0,
      },
    ],
    finalReward: {
      uniqueItem: UNIQUE_QUEST_ITEMS.directors_keycard,
      factionRep: 20,
      loreReward: { category: 'forbidden', hint: 'The Council hides knowledge of the Directorate Protocol.' },
    },
    factionConsequences: { 'COLONY_COUNCIL': 15, 'COLONY_GUARD': 10, 'SYNDICATE': -15 },
  },

  // ── Main Questline (no faction requirement) ──
  {
    id: 'chain_main_01',
    name: 'The Truth of AETHEON',
    faction: null,
    requiredRank: 0,
    minLevel: 1,
    stages: [
      {
        stageIndex: 0,
        questType: 'INVESTIGATE',
        titleTemplate: 'Strange Signals',
        descTemplate: 'You\'ve been hearing strange transmissions on abandoned frequencies. Investigate {SUBJECT} to find the source.',
        rewardMultiplier: 1.0,
      },
      {
        stageIndex: 1,
        questType: 'FETCH',
        titleTemplate: 'The Old Technology',
        descTemplate: 'The signal leads to pre-Cascade technology. Recover {N} {ITEM} to piece together the message.',
        rewardMultiplier: 1.3,
      },
      {
        stageIndex: 2,
        questType: 'INVESTIGATE',
        titleTemplate: 'The Founder\'s Message',
        descTemplate: 'The technology contains a message from the original crew. Investigate {SUBJECT} to decode it.',
        rewardMultiplier: 1.5,
      },
      {
        stageIndex: 3,
        questType: 'DELIVER',
        titleTemplate: 'A Light in the Dark',
        descTemplate: 'The decoded message reveals the location of a Founder artifact. Retrieve it and bring it to {NPC}.',
        rewardMultiplier: 2.0,
      },
      {
        stageIndex: 4,
        questType: 'CLEAR',
        titleTemplate: 'The Path to the Bridge',
        descTemplate: 'The artifact points to the Bridge — the sealed command center of AETHEON. Clear the path through hostile territory.',
        rewardMultiplier: 3.0,
      },
    ],
    finalReward: {
      uniqueItem: UNIQUE_QUEST_ITEMS.reactor_heart,
      factionRep: 10,
      loreReward: { category: 'forbidden', hint: 'You have found the path to the Bridge. The truth of AETHEON awaits.' },
    },
    factionConsequences: null,
  },

  // ── Standalone: Founder's Torch (exploration-focused) ──
  {
    id: 'chain_explorer_01',
    name: 'Light of the Founders',
    faction: null,
    requiredRank: 0,
    minLevel: 2,
    stages: [
      {
        stageIndex: 0,
        questType: 'SURVEY',
        titleTemplate: 'The Old Maps',
        descTemplate: 'An old cartographic record shows locations that don\'t appear on modern maps. Survey unknown sectors to find them.',
        rewardMultiplier: 1.0,
      },
      {
        stageIndex: 1,
        questType: 'INVESTIGATE',
        titleTemplate: 'The Shrine',
        descTemplate: 'One of the locations you surveyed contains an ancient shrine. Investigate {SUBJECT} within.',
        rewardMultiplier: 1.5,
      },
      {
        stageIndex: 2,
        questType: 'CLEAR',
        titleTemplate: 'Guardian of the Light',
        descTemplate: 'The shrine is protected by automated defenses from the original crew. Clear them to claim the artifact.',
        rewardMultiplier: 2.0,
      },
    ],
    finalReward: {
      uniqueItem: UNIQUE_QUEST_ITEMS.founders_torch,
      factionRep: 10,
      loreReward: { category: 'artifacts', hint: 'The Founder\'s Torch burns with light from Earth.' },
    },
    factionConsequences: null,
  },
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
      case 'light':    return this._generateLightSource(rng, rarity);
      case 'torch':    return this._generateLightSource(rng, rarity);
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

  _generateLightSource(rng, rarity = 'common') {
    const isLantern = rarity !== 'common' && rng.chance(0.5);
    if (isLantern) {
      return {
        id: nextId('item'),
        name: 'Jury-Rigged Lantern',
        type: 'light',
        subtype: 'lantern',
        rarity: 'uncommon',
        char: '~',
        color: '#FFDD66',
        value: 25,
        stats: {},
        lightSource: { type: 'lantern', radius: 14, color: '#FFDD66', uses: -1 },
        description: 'A cobbled-together lantern. Provides steady light. Never runs out.',
      };
    }
    return {
      id: nextId('item'),
      name: 'Salvaged Torch',
      type: 'light',
      subtype: 'torch',
      rarity: 'common',
      char: '~',
      color: '#FFAA44',
      value: 8,
      stats: {},
      lightSource: { type: 'torch', radius: 10, color: '#FFAA44', uses: 50 },
      description: 'A makeshift torch. Provides light for 50 moves before burning out.',
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

// Ag drone enemy set — all biomes share the same rogue agricultural drones
const AG_DRONES = [
  { name: 'Ag Driller Drone', char: 'd', color: '#C9A24A', behavior: 'aggressive', hp: 18, attack: 6, defense: 3, xpBase: 20, ability: 'overcharge', faction: 'MALFUNCTIONING', sprite: 'sprites/enemies/ag_drone_driller_normal.png' },
  { name: 'Ag Grabber Drone', char: 'g', color: '#8FAF5F', behavior: 'ambush', hp: 14, attack: 5, defense: 2, xpBase: 18, faction: 'MALFUNCTIONING', sprite: 'sprites/enemies/ag_drone_grabber_normal.png' },
  { name: 'Ag Sprayer Drone', char: 's', color: '#6FBF6F', behavior: 'patrol', hp: 12, attack: 4, defense: 2, xpBase: 17, ability: 'toxinSpray', faction: 'MALFUNCTIONING', sprite: 'sprites/enemies/ag_drone_sprayer_normal.png' },
  { name: 'Pogo Drone', char: 'p', color: '#D96F3F', behavior: 'aggressive', hp: 10, attack: 5, defense: 1, xpBase: 16, faction: 'MALFUNCTIONING', sprite: 'sprites/enemies/pogo_drone.png' },
];

const CREATURE_TABLES = {
  forest: AG_DRONES,
  underground: AG_DRONES,
  haunted: AG_DRONES,
  swamp: AG_DRONES,
  badlands: AG_DRONES,
  mountain: AG_DRONES,
  ruins: AG_DRONES,
  grassland: AG_DRONES,
  hull_breach: AG_DRONES,
  reactor_slag: AG_DRONES,
  frozen_deck: AG_DRONES,
  shore: AG_DRONES,
  river: AG_DRONES,
  hydro_jungle: AG_DRONES,
  toxic_sump: AG_DRONES,
  alien_crash: AG_DRONES,
  crystal_zone: AG_DRONES,
  void_rift: AG_DRONES,
  glitch_zone: AG_DRONES,
  nano_waste: AG_DRONES,
  assimilated: AG_DRONES,
  tundra: AG_DRONES,
  permafrost: AG_DRONES,
  void_exposure: AG_DRONES,
  structural_grid: AG_DRONES,
  desert: AG_DRONES,
  scorched_waste: AG_DRONES,
  magma_fields: AG_DRONES,
  inferno_core: AG_DRONES,
};

const ABILITY_EFFECTS = {
  // Tier 1 — Machine abilities
  empPulse:       { name: 'EMP Pulse', damage: 0, attackReduce: 2, type: 'debuff', description: 'Electromagnetic pulse disrupts your equipment.' },
  overcharge:     { name: 'Overcharge', damage: 8, type: 'magic', description: 'Releases a surge of stored electrical energy.' },
  selfRepair:     { name: 'Self-Repair', damage: 0, healSelf: 5, type: 'heal', description: 'Activates onboard repair subroutines.' },
  // Tier 2 — Mutant abilities
  toxinSpray:     { name: 'Toxin Spray', damage: 3, duration: 3, type: 'dot', description: 'Sprays mutagenic toxin that burns for 3 turns.' },
  corrosiveSpit:  { name: 'Corrosive Spit', damage: 4, armorReduce: 1, defenseReduce: 2, type: 'debuff', description: 'Acid corrodes armor plating.' },
  sporeCloud:     { name: 'Spore Cloud', damage: 2, stun: true, type: 'control', description: 'Releases disorienting spores that root you in place.' },
  // Tier 3 — Alien abilities
  psionicLash:    { name: 'Psionic Lash', damage: 10, type: 'magic', description: 'A wave of alien psychic force.' },
  voidDrain:      { name: 'Void Drain', damage: 5, heal: 5, type: 'drain', description: 'Siphons life energy through an alien organ.' },
  signalJam:      { name: 'Signal Jam', damage: 0, attackReduce: 2, defenseReduce: 2, type: 'debuff', description: 'Disrupts neural interface, weakening attack and defense.' },
  phaseShift:     { name: 'Phase Shift', damage: 0, type: 'utility', description: 'Shifts partially out of phase with local spacetime.' },
  // Tier 4 — Assimilated abilities (nano-fungus hybrids)
  naniteInjection:{ name: 'Nanite Injection', damage: 4, duration: 4, type: 'dot', description: 'Injects self-replicating nanites that consume tissue for 4 turns.' },
  thermalOverload:{ name: 'Thermal Overload', damage: 12, type: 'magic', description: 'Superheated nanite swarm detonation.' },
  assimilate:     { name: 'Assimilate', damage: 6, heal: 6, type: 'drain', description: 'Absorbs biomass to fuel nano-organic growth.' },
  fungalSnare:    { name: 'Fungal Snare', damage: 2, stun: true, type: 'control', description: 'Nano-fungal tendrils lock you in place.' },
  // Tier 5 — Exotic abilities
  gravCrush:      { name: 'Gravity Crush', damage: 6, defenseReduce: 3, type: 'debuff', description: 'Localized gravity spike crushes armor plating.' },
  echoScream:     { name: 'Echo Scream', damage: 5, stun: true, type: 'control', description: 'Sonic blast reverberates through hull corridors.' },
  memoryLeech:    { name: 'Memory Leech', damage: 4, attackReduce: 3, type: 'debuff', description: 'Drains combat knowledge, weakening your attacks.' },
  mirrorShield:   { name: 'Mirror Shield', damage: 0, healSelf: 8, type: 'heal', description: 'Absorbs incoming energy and converts it to self-repair.' },
  chainLightning: { name: 'Chain Lightning', damage: 9, type: 'magic', description: 'Arc of electricity jumps through conductive hull surfaces.' },
  entropyField:   { name: 'Entropy Field', damage: 3, duration: 5, armorReduce: 1, type: 'dot', description: 'Accelerates material decay, corroding equipment over time.' },
  symbioticBurst: { name: 'Symbiotic Burst', damage: 7, heal: 4, type: 'drain', description: 'Paired organism detonates and is rapidly regrown.' },
  timeFracture:   { name: 'Time Fracture', damage: 0, attackReduce: 2, defenseReduce: 2, stun: true, type: 'control', description: 'Temporal stutter freezes you in a causal loop.' },
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
      sprite: template.sprite || null,
      position: { x: 0, y: 0 },
      behavior: template.behavior,
      stats: {
        hp,
        maxHp: hp,
        attack: Math.round(template.attack * scale),
        defense: Math.round(template.defense * scale),
        level: Math.max(1, Math.floor(depth + playerLevel * 0.5)),
      },
      faction: template.faction || 'MALFUNCTIONING',
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
