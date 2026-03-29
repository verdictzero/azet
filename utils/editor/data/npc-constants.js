// data/npc-constants.js — NPC-related data mirrored from js/entities.js
// Keep in sync with source when game data changes.

export const NAME_POOLS = {
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

export const NICKNAMES = [
  'the Reliable', 'the Bold', 'Voidwalker', 'Datakeeper', 'the Wise',
  'Ironwill', 'Stormcaller', 'the Drifter', 'Steelnerve', 'the Swift',
  'Deckrunner', 'the Silent', 'Wallbreaker', 'the Merciful', 'Nightcrawler',
  'the Just', 'Oathkeeper', 'the Unyielding', 'Rustjaw', 'Circuitheart',
];

export const PERSONALITY_TRAITS = [
  'grumpy', 'cheerful', 'suspicious', 'generous', 'greedy', 'brave',
  'cowardly', 'wise', 'foolish', 'honest', 'deceitful', 'loyal',
  'treacherous', 'patient', 'hot-tempered', 'humble', 'arrogant',
  'curious', 'reclusive', 'devout', 'pragmatic', 'idealistic',
  'stoic', 'jovial', 'sarcastic', 'grim', 'compassionate', 'ruthless',
  'scholarly', 'superstitious',
];

export const ARCHETYPES = ['mentor', 'rival', 'ally', 'antagonist', 'neutral', 'comic_relief'];

export const ROLE_CHARS = {
  merchant: 'M', blacksmith: 'M', barkeep: 'B', priest: 'P', guard: 'G',
  noble: 'N', farmer: 'N', miner: 'N', hunter: 'N', scholar: 'N',
  beggar: 'N', child: 'N', knight: 'K',
};

export const ROLE_COLORS = {
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

export const ROLE_TITLES = {
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

export const SECRET_TEMPLATES = [
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

export const ROLE_SCHEDULES = {
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

export const NPC_FACTIONS = [
  'The Colony Guard', 'The Salvage Guild', 'The Syndicate', 'The Archive Keepers',
  'The Colony Guard', 'Free Traders', 'The Colony Council', 'None',
];

export const NPC_CATEGORIES = {
  ambient:   ['farmer', 'miner', 'hunter', 'beggar', 'child', 'noble', 'villager'],
  service:   ['merchant', 'blacksmith', 'barkeep', 'innkeeper'],
  knowledge: ['scholar', 'priest'],
  authority: ['guard', 'knight', 'guildmaster'],
};
