import { SeededRNG, distance, manhattanDist } from './utils.js';

// ═══════════════════════════════════════════
//  NAME GENERATOR
// ═══════════════════════════════════════════

const NAME_POOLS = {
  human: {
    male: ['Aldric','Marcus','Roland','Garrett','Cedric','Edmund','Roderick','Bran','Osric','Leoric','Godwin','Alaric','Beorn','Cyrus','Drake','Elric','Fenris','Gareth','Hector','Isen'],
    female: ['Elena','Sarah','Miriel','Rowena','Elara','Cordelia','Isolde','Lyra','Maren','Nessa','Brynn','Cassandra','Daria','Freya','Gwen','Helena','Iris','Jocelyn','Kara','Liana'],
    last: ['Ironforge','Blackwood','Stormwind','Ashford','Whitehall','Greymane','Thornwall','Ravencrest','Coldwell','Brightmore','Dunbar','Fairfax','Grimshaw','Holt','Kingswood','Marsh','Northcott','Oakheart','Redfield','Stone']
  },
  elf: {
    male: ['Aelindor','Sylvain','Thalion','Caelum','Faelar','Galathil','Ithilien','Lorien','Maedhros','Noldor','Orophin','Quellon','Rilien','Silaen','Tauriel','Ulmo','Vaelen','Xael','Yavien','Zephael'],
    female: ['Lirieth','Arwen','Celeste','Elanor','Faenya','Galadria','Haleth','Idril','Jessiel','Kethiel','Luthien','Miriel','Naeriel','Olwen','Phaedra','Quelara','Rienne','Silivren','Tinuviel','Undomiel'],
    last: ['Moonwhisper','Starfall','Silverleaf','Dawnstrider','Nightbloom','Sunweaver','Windwalker','Dewdrop','Mistwood','Thornrose','Brightwater','Crystalvale','Everglade','Fernheart','Glimmerstone']
  },
  dwarf: {
    male: ['Thorin','Gimli','Balin','Durin','Dwalin','Fili','Kili','Nori','Ori','Gloin','Bombur','Bofur','Bifur','Dain','Fundin','Groin','Thror','Thrain','Nain','Oin'],
    female: ['Disa','Hilda','Inga','Bruni','Dagny','Helga','Astrid','Sigrid','Frida','Gudrun','Thyra','Ragna','Solveig','Toril','Ylva'],
    last: ['Ironbeard','Forgemaster','Stonehammer','Deepdelver','Goldvein','Battleaxe','Copperkettle','Darkmine','Emberheart','Flintlock','Granitehold','Hammerfall','Ironfist','Keenedge','Longbeard']
  },
  orc: {
    male: ['Grukk','Throg','Mogash','Zugthar','Gorbag','Lurtz','Azog','Bolg','Ugluk','Shagrat','Muzgash','Narzug','Gothmog','Grishnakh','Snaga'],
    female: ['Gashna','Threka','Mogra','Urzul','Borkha','Lagash','Nazgha','Shelob','Grisha','Murga','Karsha','Zorga','Thraga','Bulgha','Durza'],
    last: ['Skullcrusher','Bloodfang','Bonegnawer','Deathgrip','Fleshrender','Goreclaw','Hellscream','Ironjaw','Killshot','Maneater','Nightstalker','Poisontooth','Rageclaw','Soulripper','Warbringer']
  },
  halfling: {
    male: ['Pippin','Merry','Samwise','Frodo','Bilbo','Drogo','Hamfast','Lotho','Odo','Ponto','Rufus','Sancho','Tolman','Wilcome','Bandobras'],
    female: ['Rosie','Peony','Daisy','Lobelia','Primula','Amaranth','Belladonna','Celandine','Dora','Eglantine','Goldilocks','Hilda','Iris','Jasmine','Lily'],
    last: ['Goodbarrel','Underhill','Thornberry','Brandybuck','Gamgee','Baggins','Took','Proudfoot','Burrows','Chubb','Grubb','Hornblower','Sackville','Whitfoot','Boffin']
  }
};

const NICKNAMES = [
  'the Brave','the Bold','the Wise','the Cunning','Shadowblade','Truthseeker',
  'Ironwill','the Fierce','Lightbringer','Doomhammer','the Swift','Silvertongue',
  'the Wanderer','Stormcaller','Flameheart','the Silent','the Just','Voidwalker',
  'the Unyielding','Bonecrusher'
];

const PLACE_PREFIXES = ['Thorn','Iron','Shadow','Storm','Silver','Dark','White','Red','Green','Black','Stone','Frost','Dawn','Amber','Raven'];
const PLACE_SUFFIXES = ['brook','hold','vale','haven','dale','ford','mere','wick','gate','crest','fell','moor','stead','watch','hollow'];

export class NameGenerator {
  generate(rng, race) {
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

// ═══════════════════════════════════════════
//  NPC GENERATOR
// ═══════════════════════════════════════════

const PERSONALITY_TRAITS = [
  'grumpy','cheerful','suspicious','generous','greedy','brave','cowardly',
  'wise','foolish','honest','deceitful','loyal','treacherous','patient',
  'hot-tempered','humble','arrogant','curious','reclusive','kind',
  'stern','jovial','cautious','reckless','scholarly','superstitious',
  'devout','cynical','romantic','pragmatic'
];

const ARCHETYPES = ['mentor','rival','ally','antagonist','neutral','comic_relief'];

const ROLE_CHARS = {
  merchant: 'M', blacksmith: 'M', barkeep: 'B', priest: 'P', guard: 'G',
  noble: 'N', farmer: 'F', miner: 'W', hunter: 'H', scholar: 'S',
  beggar: 'b', child: 'c'
};

const ROLE_COLORS = {
  merchant: '#FFFF55', blacksmith: '#FF5555', barkeep: '#AAAA00',
  priest: '#FFFFFF', guard: '#5555FF', noble: '#FF55FF',
  farmer: '#55FF55', miner: '#AAAAAA', hunter: '#00AA00',
  scholar: '#55FFFF', beggar: '#555555', child: '#55FF55'
};

const ROLE_TITLES = {
  merchant: ['Traveling Merchant','Shopkeeper','Trader','Peddler'],
  blacksmith: ['Master Blacksmith','Weapon Smith','Armor Smith','Forge Worker'],
  barkeep: ['Innkeeper','Barkeep','Tavern Owner','Alewife'],
  priest: ['High Priest','Temple Cleric','Healer','Acolyte'],
  guard: ['Town Guard','Watch Captain','Sentinel','Gate Keeper'],
  noble: ['Lord','Lady','Baron','Count'],
  farmer: ['Farmer','Rancher','Miller','Shepherd'],
  miner: ['Miner','Prospector','Tunneler','Gem Cutter'],
  hunter: ['Hunter','Tracker','Trapper','Ranger'],
  scholar: ['Scholar','Sage','Librarian','Lorekeeper'],
  beggar: ['Beggar','Vagabond','Wanderer','Drifter'],
  child: ['Child','Youngster','Urchin','Kid']
};

const SECRET_TEMPLATES = [
  'hiding a cursed artifact in their basement',
  'was once a soldier in the great war',
  'has a long-lost sibling in a distant city',
  'knows the location of a hidden treasure',
  'is secretly working for the thieves guild',
  'was cursed by a witch years ago',
  'witnessed a murder and never spoke of it',
  'is heir to a forgotten noble house',
  'made a deal with a demon',
  'knows the true history of this settlement'
];

export class NPCGenerator {
  constructor() {
    this.nameGen = new NameGenerator();
    this.nextId = 1;
  }

  generate(rng, role, race, locationContext) {
    const name = this.nameGen.generate(rng, race);
    const id = `npc_${this.nextId++}`;

    const traits = [];
    const traitPool = [...PERSONALITY_TRAITS];
    const traitCount = rng.nextInt(2, 4);
    for (let i = 0; i < traitCount; i++) {
      const idx = rng.nextInt(0, traitPool.length - 1);
      traits.push(traitPool.splice(idx, 1)[0]);
    }

    const level = rng.nextInt(1, 10);
    const titles = ROLE_TITLES[role] || ['Villager'];
    const title = rng.random(titles);

    const schedule = this.generateSchedule(role);
    const secrets = [rng.random(SECRET_TEMPLATES)];
    if (rng.chance(0.3)) secrets.push(rng.random(SECRET_TEMPLATES));

    const npc = {
      id,
      name,
      race,
      role,
      title,
      char: ROLE_CHARS[role] || 'N',
      color: ROLE_COLORS[role] || '#AAAAAA',
      position: { x: 0, y: 0 },
      stats: {
        hp: 20 + level * 5,
        maxHp: 20 + level * 5,
        attack: 2 + level,
        defense: 1 + Math.floor(level / 2),
        level
      },
      personality: {
        traits,
        mood: rng.random(['happy', 'neutral', 'neutral', 'neutral', 'angry', 'suspicious']),
        archetype: rng.random(ARCHETYPES)
      },
      schedule,
      faction: this.getFaction(role),
      playerReputation: 0,
      memory: [],
      secrets,
      shop: this.generateShopData(rng, role),
      quests: [],
      dialogue: {}
    };

    // Combat methods for NPC
    npc.getAttackPower = function() { return this.stats.attack; };
    npc.getDefense = function() { return this.stats.defense; };

    return npc;
  }

  generateSchedule(role) {
    const schedules = {
      merchant: [
        { hour: 7, location: 'home', action: 'wake' },
        { hour: 8, location: 'shop', action: 'open_shop' },
        { hour: 12, location: 'tavern', action: 'lunch' },
        { hour: 13, location: 'shop', action: 'work' },
        { hour: 18, location: 'tavern', action: 'dinner' },
        { hour: 21, location: 'home', action: 'sleep' }
      ],
      blacksmith: [
        { hour: 6, location: 'smithy', action: 'wake' },
        { hour: 7, location: 'smithy', action: 'work' },
        { hour: 12, location: 'tavern', action: 'lunch' },
        { hour: 13, location: 'smithy', action: 'work' },
        { hour: 17, location: 'tavern', action: 'dinner' },
        { hour: 20, location: 'home', action: 'sleep' }
      ],
      barkeep: [
        { hour: 9, location: 'home', action: 'wake' },
        { hour: 10, location: 'tavern', action: 'open' },
        { hour: 23, location: 'tavern', action: 'close' },
        { hour: 0, location: 'home', action: 'sleep' }
      ],
      guard: [
        { hour: 6, location: 'barracks', action: 'wake' },
        { hour: 7, location: 'gate', action: 'patrol' },
        { hour: 12, location: 'barracks', action: 'lunch' },
        { hour: 13, location: 'square', action: 'patrol' },
        { hour: 18, location: 'barracks', action: 'off_duty' },
        { hour: 22, location: 'barracks', action: 'sleep' }
      ],
      priest: [
        { hour: 5, location: 'temple', action: 'morning_prayer' },
        { hour: 8, location: 'temple', action: 'services' },
        { hour: 12, location: 'temple', action: 'meditation' },
        { hour: 15, location: 'square', action: 'bless' },
        { hour: 18, location: 'temple', action: 'evening_prayer' },
        { hour: 21, location: 'temple', action: 'sleep' }
      ]
    };
    return schedules[role] || [
      { hour: 7, location: 'home', action: 'wake' },
      { hour: 8, location: 'work', action: 'work' },
      { hour: 18, location: 'tavern', action: 'relax' },
      { hour: 21, location: 'home', action: 'sleep' }
    ];
  }

  getFaction(role) {
    const map = {
      guard: 'TOWN_GUARD', merchant: 'MERCHANTS_GUILD', blacksmith: 'MERCHANTS_GUILD',
      priest: 'TEMPLE_ORDER', noble: 'NOBILITY', barkeep: 'MERCHANTS_GUILD'
    };
    return map[role] || 'CIVILIAN';
  }

  generateShopData(rng, role) {
    const shopRoles = ['merchant', 'blacksmith', 'barkeep'];
    if (!shopRoles.includes(role)) return null;

    const types = { merchant: 'general', blacksmith: 'blacksmith', barkeep: 'tavern' };
    return {
      type: types[role] || 'general',
      name: role === 'blacksmith' ? 'The Forge' : role === 'barkeep' ? 'The Tavern' : 'General Store',
      specialty: role
    };
  }
}

// ═══════════════════════════════════════════
//  DIALOGUE SYSTEM
// ═══════════════════════════════════════════

const GREETINGS = {
  friendly: [
    "Hail, friend! Welcome back.",
    "Good to see you! How goes the adventure?",
    "Ah, a familiar face! Come in, come in.",
    "Welcome back! I was hoping you'd return.",
    "Well met, friend! What can I do for you today?",
    "It's good to see you again. What brings you by?",
    "Ah, my favorite customer! How can I help?",
    "Glad you're here. I could use a hand with something.",
    "The hero returns! What news do you bring?",
    "Always a pleasure. What do you need?"
  ],
  neutral: [
    "What brings you here?",
    "State your business.",
    "I don't believe we've met. What do you want?",
    "Can I help you with something?",
    "Hmm? What is it?",
    "Looking for something specific?",
    "You're not from around here, are you?",
    "Speak, traveler. I'm busy.",
    "Another adventurer. What do you seek?",
    "Welcome to our settlement. Mind your manners."
  ],
  hostile: [
    "Stay back! I don't trust you.",
    "Not you again...",
    "I thought I told you to leave!",
    "You have some nerve showing your face here.",
    "Get lost before I call the guards."
  ]
};

const RUMOR_TEMPLATES = [
  "They say {LOCATION} is cursed ever since the old war...",
  "I heard strange lights in the mountains last night.",
  "The merchants won't travel the eastern road anymore.",
  "Word is a dragon was spotted near the northern peaks.",
  "They say the old ruins hold treasures beyond imagining.",
  "Bandits have been raiding caravans on the trade route.",
  "The temple priests have been acting strangely lately.",
  "I hear the king is looking for brave adventurers.",
  "Someone found ancient runes in the caves to the south.",
  "The blacksmith says he can forge legendary weapons... for a price.",
  "A mysterious stranger arrived last week. Nobody knows who they are.",
  "The guards found tracks of something large near the village.",
  "An old prophecy speaks of a hero who will save these lands.",
  "The tavern owner says ghosts haunt the cellar at night.",
  "Miners broke through to a new cavern full of crystals.",
  "A traveling bard sang of a hidden kingdom underground.",
  "The harvest this year was poor. Some blame dark magic.",
  "There's a bounty on a criminal who escaped the dungeon.",
  "Sailors report sea monsters in the coastal waters.",
  "An ancient tower appeared overnight in the forest..."
];

export class DialogueSystem {
  generateGreeting(npc, playerRep) {
    let pool;
    if (playerRep > 30) pool = GREETINGS.friendly;
    else if (playerRep < -30) pool = GREETINGS.hostile;
    else pool = GREETINGS.neutral;

    const rng = new SeededRNG(Date.now());
    return { text: rng.random(pool), options: [] };
  }

  generateOptions(npc, playerRep, gameContext) {
    const options = [];

    options.push({
      text: 'Tell me about this place.',
      action: 'lore',
      hint: 'Learn about the area'
    });

    if (npc.role !== 'child' && npc.role !== 'beggar') {
      options.push({
        text: 'Any work available?',
        action: 'quest',
        hint: 'Get a quest'
      });
    }

    if (npc.shop) {
      options.push({
        text: 'Let me see your wares.',
        action: 'shop',
        hint: 'Open shop'
      });
    }

    options.push({
      text: 'Heard any rumors?',
      action: 'rumor',
      hint: 'Hear a rumor'
    });

    options.push({
      text: 'Goodbye.',
      action: 'close'
    });

    return options;
  }

  generateRumor(rng, worldContext) {
    let rumor = rng.random(RUMOR_TEMPLATES);
    const locName = worldContext?.currentLocationName || 'this place';
    rumor = rumor.replace('{LOCATION}', locName);
    return rumor;
  }

  modifyReputation(npc, amount, reason) {
    npc.playerReputation = (npc.playerReputation || 0) + amount;
    npc.memory.push({ date: Date.now(), event: reason, repChange: amount });
  }

  getDialogue(npc, topic, playerRep) {
    const rng = new SeededRNG(Date.now());
    const topics = {
      self: [
        `I'm ${npc.name.first}, the ${npc.title}. Been here for years.`,
        `Name's ${npc.name.first}. I work as a ${npc.role} around here.`,
        `${npc.title} is my trade. It's honest work.`
      ],
      location: [
        "This settlement has stood for generations.",
        "It's a quiet place, mostly. Except when monsters show up.",
        "We're a small community, but we look after our own."
      ],
      faction: [
        "The factions around here are always squabbling.",
        "Best to stay neutral, if you ask me.",
        "Pick your allies carefully in these parts."
      ]
    };
    const pool = topics[topic] || topics.self;
    return rng.random(pool);
  }
}

// ═══════════════════════════════════════════
//  LORE GENERATOR
// ═══════════════════════════════════════════

const WORLD_HISTORY_TEMPLATES = [
  "The kingdom fell to {ENEMY} {YEARS} years ago, and we've never fully recovered.",
  "A great plague swept through {REGION} a century past. Some say it was no natural sickness.",
  "{FACTION_A} betrayed {FACTION_B} in the War of Shadows. The scars remain.",
  "An ancient prophecy speaks of a hero who will unite the scattered realms.",
  "The old gods abandoned these lands when the last temple was desecrated.",
  "Long ago, a great wizard sealed an evil beneath the mountains.",
  "The last dragon was slain {YEARS} years ago. Or so they say.",
  "War between the northern and southern kingdoms shaped this land.",
  "A meteor fell from the sky ages ago, creating the great crater lake.",
  "The forest was once a thriving kingdom, before the curse took hold."
];

const ARTIFACT_TEMPLATES = [
  "This {ITEM} was forged by the legendary smith {SMITH}.",
  "Legend says {ITEM} grants its wielder {POWER}.",
  "Warning: {ITEM} is said to be cursed by an ancient sorcerer.",
  "This relic dates back to the First Age of this world.",
  "Many have sought {ITEM}. Few have survived the quest."
];

const LOCATION_HISTORY_TEMPLATES = [
  "{LOCATION} was built as a {PURPOSE} over {YEARS} years ago.",
  "They say {LOCATION} is haunted by the spirits of its founders.",
  "The ruins of {LOCATION} hold secrets from a forgotten civilization.",
  "{LOCATION} has changed hands many times. Each ruler left their mark.",
  "Once a thriving hub, {LOCATION} fell into decline after the war.",
  "Travelers have long known {LOCATION} as a safe haven on the road.",
  "{LOCATION} was established by refugees fleeing the Great Calamity.",
  "The founders of {LOCATION} chose this site for its natural defenses."
];

const NPC_BACKSTORY_TEMPLATES = [
  "I used to be a soldier, before an injury forced me to settle down.",
  "My family came from a distant land. We fled the troubles there.",
  "I've lived here all my life. Wouldn't have it any other way.",
  "Before this, I was an adventurer like you. Then I took an arrow...",
  "I came here seeking fortune. Found something better — a home.",
  "The road was my life for many years. I've seen things you wouldn't believe.",
  "I was trained in the capital, but the politics drove me away.",
  "My parents were {PROFESSION}s. I followed in their footsteps."
];

const LEGENDARY_SMITHS = ['Volundr','Durendal','Mjolnar','Caliburn','Hephaestus'];
const POWERS = ['unmatched strength','true sight','immunity to fire','eternal youth','dominion over shadows'];
const PURPOSES = ['fortress','trading post','monastery','watchtower','mining outpost','sanctuary','prison'];
const PROFESSIONS = ['blacksmith','farmer','soldier','scholar','merchant','healer','hunter'];

export class LoreGenerator {
  generateWorldHistory(rng, factionNames, locationNames) {
    const entries = [];
    const count = rng.nextInt(5, 10);

    for (let i = 0; i < count; i++) {
      let template = rng.random(WORLD_HISTORY_TEMPLATES);
      template = template.replace('{ENEMY}', rng.random(factionNames.length ? factionNames : ['an ancient evil']));
      template = template.replace('{YEARS}', rng.nextInt(50, 500).toString());
      template = template.replace('{REGION}', rng.random(locationNames.length ? locationNames : ['the land']));
      template = template.replace('{FACTION_A}', rng.random(factionNames.length ? factionNames : ['The Alliance']));
      template = template.replace('{FACTION_B}', rng.random(factionNames.length ? factionNames : ['The Order']));
      entries.push(template);
    }
    return entries;
  }

  generateArtifactLore(rng, itemName) {
    let template = rng.random(ARTIFACT_TEMPLATES);
    template = template.replace(/{ITEM}/g, itemName);
    template = template.replace('{SMITH}', rng.random(LEGENDARY_SMITHS));
    template = template.replace('{POWER}', rng.random(POWERS));
    return template;
  }

  generateLocationHistory(rng, locationName, locationType) {
    let template = rng.random(LOCATION_HISTORY_TEMPLATES);
    template = template.replace(/{LOCATION}/g, locationName || 'This place');
    template = template.replace('{PURPOSE}', rng.random(PURPOSES));
    template = template.replace('{YEARS}', rng.nextInt(50, 300).toString());
    return template;
  }

  generateNPCBackstory(rng, npc) {
    let template = rng.random(NPC_BACKSTORY_TEMPLATES);
    template = template.replace('{PROFESSION}', rng.random(PROFESSIONS));
    return template;
  }
}

// ═══════════════════════════════════════════
//  PLAYER
// ═══════════════════════════════════════════

const CLASS_STATS = {
  warrior: { str: 16, dex: 12, con: 15, int: 8, wis: 10, cha: 10, hp: 50, mana: 10 },
  mage:    { str: 8, dex: 10, con: 10, int: 16, wis: 14, cha: 10, hp: 30, mana: 50 },
  rogue:   { str: 10, dex: 16, con: 11, int: 12, wis: 10, cha: 14, hp: 35, mana: 20 },
  ranger:  { str: 13, dex: 14, con: 13, int: 10, wis: 13, cha: 10, hp: 40, mana: 25 }
};

const RACE_BONUSES = {
  human:    { str: 1, dex: 1, con: 1, int: 1, wis: 1, cha: 1 },
  elf:      { str: -1, dex: 2, con: -1, int: 2, wis: 1, cha: 1 },
  dwarf:    { str: 2, dex: -1, con: 2, int: 0, wis: 1, cha: -1 },
  orc:      { str: 3, dex: 0, con: 2, int: -2, wis: -1, cha: -2 },
  halfling: { str: -2, dex: 3, con: 0, int: 1, wis: 1, cha: 2 }
};

const CLASS_ABILITIES = {
  warrior: [{ name: 'Power Strike', manaCost: 5, damage: 1.5, cooldown: 2, description: 'A mighty blow dealing 150% damage.' }],
  mage:    [{ name: 'Fireball', manaCost: 15, damage: 2.0, cooldown: 3, description: 'Hurl a ball of flame for 200% damage.' }],
  rogue:   [{ name: 'Backstab', manaCost: 8, damage: 2.5, cooldown: 3, description: 'Strike from shadows for 250% damage.' }],
  ranger:  [{ name: 'Arrow Rain', manaCost: 10, damage: 1.3, cooldown: 2, description: 'Rain arrows for 130% damage.' }]
};

const STARTING_GEAR = {
  warrior: { mainHand: { id: 'start_sword', name: 'Iron Sword', type: 'weapon', subType: 'sword', char: '/', color: '#AAAAAA', value: 30, stats: { attack: 5 }, description: 'A sturdy iron sword.' } },
  mage:    { mainHand: { id: 'start_staff', name: 'Wooden Staff', type: 'weapon', subType: 'staff', char: '|', color: '#AAAA00', value: 20, stats: { attack: 2, int: 3 }, description: 'A simple wooden staff.' } },
  rogue:   { mainHand: { id: 'start_dagger', name: 'Steel Dagger', type: 'weapon', subType: 'dagger', char: '-', color: '#AAAAAA', value: 25, stats: { attack: 4 }, description: 'A sharp steel dagger.' } },
  ranger:  { mainHand: { id: 'start_bow', name: 'Short Bow', type: 'weapon', subType: 'bow', char: '}', color: '#AAAA00', value: 25, stats: { attack: 4 }, description: 'A reliable short bow.' } }
};

export class Player {
  constructor(name, race, playerClass) {
    this.name = name;
    this.race = race;
    this.playerClass = playerClass;
    this.char = '@';
    this.color = playerClass === 'warrior' ? '#FF5555' : playerClass === 'mage' ? '#5555FF' :
      playerClass === 'rogue' ? '#55FF55' : '#FFFF55';

    this.position = { x: 0, y: 0 };

    const base = CLASS_STATS[playerClass] || CLASS_STATS.warrior;
    const bonus = RACE_BONUSES[race] || RACE_BONUSES.human;

    this.stats = {
      hp: base.hp, maxHp: base.hp,
      mana: base.mana, maxMana: base.mana,
      str: base.str + bonus.str,
      dex: base.dex + bonus.dex,
      con: base.con + bonus.con,
      int: base.int + bonus.int,
      wis: base.wis + bonus.wis,
      cha: base.cha + bonus.cha,
      level: 1, xp: 0, xpToNext: 100
    };

    this.equipment = {
      head: null, chest: null, hands: null, legs: null,
      feet: null, mainHand: null, offHand: null, ring: null, amulet: null
    };

    // Equip starting gear
    const gear = STARTING_GEAR[playerClass];
    if (gear) {
      for (const [slot, item] of Object.entries(gear)) {
        this.equipment[slot] = { ...item };
      }
    }

    this.inventory = [];
    this.abilities = [...(CLASS_ABILITIES[playerClass] || [])];
    this.quests = { active: [], completed: [] };
    this.knownLocations = new Set();
    this.gold = 50;
  }

  getAttackPower() {
    let atk = Math.floor(this.stats.str / 2);
    if (this.equipment.mainHand && this.equipment.mainHand.stats) {
      atk += this.equipment.mainHand.stats.attack || 0;
    }
    return atk;
  }

  getDefense() {
    let def = Math.floor(this.stats.con / 3);
    for (const slot of ['head', 'chest', 'hands', 'legs', 'feet', 'offHand']) {
      const item = this.equipment[slot];
      if (item && item.stats) {
        def += item.stats.defense || 0;
      }
    }
    return def;
  }

  heal(amount) {
    this.stats.hp = Math.min(this.stats.hp + amount, this.stats.maxHp);
  }

  takeDamage(amount) {
    this.stats.hp = Math.max(0, this.stats.hp - amount);
  }

  isDead() {
    return this.stats.hp <= 0;
  }

  addXP(amount) {
    this.stats.xp += amount;
    while (this.stats.xp >= this.stats.xpToNext) {
      this.stats.xp -= this.stats.xpToNext;
      this.stats.level++;
      this.stats.xpToNext = this.stats.level * 100;
      this.stats.maxHp += 5 + Math.floor(this.stats.con / 3);
      this.stats.hp = this.stats.maxHp;
      this.stats.maxMana += 3 + Math.floor(this.stats.int / 4);
      this.stats.mana = this.stats.maxMana;
      this.stats.str += 1;
      this.stats.dex += 1;
    }
  }

  addItem(item) {
    if (this.inventory.length >= 20) return false;
    this.inventory.push(item);
    return true;
  }

  removeItem(itemId) {
    this.inventory = this.inventory.filter(i => i.id !== itemId);
  }

  equip(item) {
    let slot = null;
    if (item.type === 'weapon') slot = 'mainHand';
    else if (item.type === 'armor') {
      const subSlots = { helmet: 'head', chestplate: 'chest', gloves: 'hands', leggings: 'legs', boots: 'feet', shield: 'offHand' };
      slot = subSlots[item.subType] || 'chest';
    }
    if (!slot) return;

    // Unequip current
    if (this.equipment[slot]) {
      this.inventory.push(this.equipment[slot]);
    }
    this.equipment[slot] = item;
    this.removeItem(item.id);
  }

  unequip(slot) {
    if (this.equipment[slot]) {
      if (this.inventory.length >= 20) return false;
      this.inventory.push(this.equipment[slot]);
      this.equipment[slot] = null;
      return true;
    }
    return false;
  }

  isEquipped(item) {
    return Object.values(this.equipment).some(e => e && e.id === item.id);
  }
}

// ═══════════════════════════════════════════
//  ITEM GENERATOR
// ═══════════════════════════════════════════

const ITEM_PREFIXES = [
  { name: 'Rusty', stats: { attack: -1 }, valueMod: 0.5 },
  { name: 'Iron', stats: { attack: 1 }, valueMod: 1.0 },
  { name: 'Steel', stats: { attack: 2 }, valueMod: 1.5 },
  { name: 'Blessed', stats: { attack: 2, defense: 1 }, valueMod: 2.0 },
  { name: 'Cursed', stats: { attack: 3 }, valueMod: 1.2 },
  { name: 'Flaming', stats: { attack: 3 }, valueMod: 2.5 },
  { name: 'Frost', stats: { attack: 2, defense: 1 }, valueMod: 2.5 },
  { name: 'Keen', stats: { attack: 2 }, valueMod: 1.8 },
  { name: 'Brutal', stats: { attack: 4 }, valueMod: 2.0 },
  { name: 'Ancient', stats: { attack: 3, defense: 2 }, valueMod: 3.0 },
  { name: 'Enchanted', stats: { attack: 2, int: 2 }, valueMod: 2.5 },
  { name: 'Masterwork', stats: { attack: 3 }, valueMod: 2.0 },
  { name: 'Shadow', stats: { attack: 2, dex: 1 }, valueMod: 2.0 },
  { name: 'Gilded', stats: { attack: 1 }, valueMod: 3.0 },
  { name: 'Crude', stats: { attack: -2 }, valueMod: 0.3 }
];

const ITEM_SUFFIXES = [
  { name: 'of Might', stats: { str: 2 }, valueMod: 1.5 },
  { name: 'of Speed', stats: { dex: 2 }, valueMod: 1.5 },
  { name: 'of Wisdom', stats: { wis: 2 }, valueMod: 1.5 },
  { name: 'of the Bear', stats: { con: 3, str: 1 }, valueMod: 2.0 },
  { name: 'of Flames', stats: { attack: 2 }, valueMod: 1.8 },
  { name: 'of the Eagle', stats: { dex: 2, wis: 1 }, valueMod: 1.8 },
  { name: 'of Protection', stats: { defense: 3 }, valueMod: 2.0 },
  { name: 'of the Magi', stats: { int: 3 }, valueMod: 2.0 },
  { name: 'of Stealth', stats: { dex: 3 }, valueMod: 1.8 },
  { name: 'of Valor', stats: { str: 2, con: 1 }, valueMod: 1.5 },
  { name: 'of the Phoenix', stats: { hp: 10 }, valueMod: 2.5 },
  { name: 'of Life', stats: { hp: 5, con: 1 }, valueMod: 1.8 },
  { name: 'of the Storm', stats: { attack: 3 }, valueMod: 2.0 },
  { name: 'of Shadow', stats: { dex: 2 }, valueMod: 1.5 },
  { name: 'of the Void', stats: { int: 2, wis: 2 }, valueMod: 2.5 }
];

const WEAPON_BASES = [
  { name: 'Sword', subType: 'sword', char: '/', attack: 5, value: 30 },
  { name: 'Axe', subType: 'axe', char: '\\', attack: 6, value: 35 },
  { name: 'Mace', subType: 'mace', char: '!', attack: 5, value: 28 },
  { name: 'Dagger', subType: 'dagger', char: '-', attack: 3, value: 15 },
  { name: 'Staff', subType: 'staff', char: '|', attack: 3, value: 20 },
  { name: 'Bow', subType: 'bow', char: '}', attack: 4, value: 25 },
  { name: 'Spear', subType: 'spear', char: '/', attack: 5, value: 30 },
  { name: 'Hammer', subType: 'hammer', char: 'T', attack: 7, value: 40 }
];

const ARMOR_BASES = [
  { name: 'Helmet', subType: 'helmet', char: '^', defense: 2, value: 20 },
  { name: 'Chestplate', subType: 'chestplate', char: '[', defense: 5, value: 50 },
  { name: 'Gloves', subType: 'gloves', char: '{', defense: 1, value: 12 },
  { name: 'Leggings', subType: 'leggings', char: '=', defense: 3, value: 30 },
  { name: 'Boots', subType: 'boots', char: '_', defense: 2, value: 18 },
  { name: 'Shield', subType: 'shield', char: ']', defense: 4, value: 35 }
];

const POTION_TYPES = [
  { name: 'Healing Potion', subType: 'healing', char: '!', color: '#FF5555', stats: { hp: 20 }, value: 15 },
  { name: 'Mana Potion', subType: 'mana', char: '!', color: '#5555FF', stats: { mana: 20 }, value: 15 },
  { name: 'Strength Potion', subType: 'strength', char: '!', color: '#FFAA00', stats: { str: 3 }, value: 25 },
  { name: 'Speed Potion', subType: 'speed', char: '!', color: '#55FF55', stats: { dex: 3 }, value: 25 },
  { name: 'Antidote', subType: 'antidote', char: '!', color: '#55FFFF', stats: { hp: 10 }, value: 10 },
  { name: 'Greater Healing Potion', subType: 'healing', char: '!', color: '#FF5555', stats: { hp: 50 }, value: 40 }
];

export class ItemGenerator {
  constructor() {
    this.nextId = 1;
  }

  generate(rng, type, rarity, depth) {
    const id = `item_${this.nextId++}_${rng.nextInt(1000, 9999)}`;
    rarity = rarity || 'common';
    depth = depth || 1;

    switch (type) {
      case 'weapon': return this.generateWeapon(rng, rarity, depth, id);
      case 'armor': return this.generateArmor(rng, rarity, depth, id);
      case 'potion': return this.generatePotion(rng, depth, id);
      default: return this.generateMisc(rng, depth, id);
    }
  }

  generateWeapon(rng, rarity, depth, id) {
    const base = rng.random(WEAPON_BASES);
    const depthScale = 1 + (depth - 1) * 0.2;

    let name = base.name;
    let value = Math.round(base.value * depthScale);
    const stats = { attack: Math.round(base.attack * depthScale) };
    let color = '#AAAAAA';

    if (rarity !== 'common' && rng.chance(0.7)) {
      const prefix = rng.random(ITEM_PREFIXES);
      name = prefix.name + ' ' + name;
      value = Math.round(value * prefix.valueMod);
      Object.entries(prefix.stats).forEach(([k, v]) => stats[k] = (stats[k] || 0) + v);
      color = '#55FF55';
    }

    if ((rarity === 'rare' || rarity === 'epic' || rarity === 'legendary') && rng.chance(0.6)) {
      const suffix = rng.random(ITEM_SUFFIXES);
      name = name + ' ' + suffix.name;
      value = Math.round(value * suffix.valueMod);
      Object.entries(suffix.stats).forEach(([k, v]) => stats[k] = (stats[k] || 0) + v);
      color = rarity === 'rare' ? '#5555FF' : rarity === 'epic' ? '#FF55FF' : '#FFFF55';
    }

    return {
      id, name, type: 'weapon', subType: base.subType,
      char: base.char, color, rarity, value, stats,
      description: `A ${rarity} ${base.name.toLowerCase()}. Attack: ${stats.attack}`
    };
  }

  generateArmor(rng, rarity, depth, id) {
    const base = rng.random(ARMOR_BASES);
    const depthScale = 1 + (depth - 1) * 0.2;

    let name = base.name;
    let value = Math.round(base.value * depthScale);
    const stats = { defense: Math.round(base.defense * depthScale) };
    let color = '#AAAAAA';

    if (rarity !== 'common' && rng.chance(0.7)) {
      const prefix = rng.random(ITEM_PREFIXES);
      name = prefix.name + ' ' + name;
      value = Math.round(value * prefix.valueMod);
      Object.entries(prefix.stats).forEach(([k, v]) => stats[k] = (stats[k] || 0) + v);
      color = '#55FF55';
    }

    if ((rarity === 'rare' || rarity === 'epic') && rng.chance(0.6)) {
      const suffix = rng.random(ITEM_SUFFIXES);
      name = name + ' ' + suffix.name;
      value = Math.round(value * suffix.valueMod);
      Object.entries(suffix.stats).forEach(([k, v]) => stats[k] = (stats[k] || 0) + v);
      color = rarity === 'rare' ? '#5555FF' : '#FF55FF';
    }

    return {
      id, name, type: 'armor', subType: base.subType,
      char: base.char, color, rarity, value, stats,
      description: `A ${rarity} ${base.name.toLowerCase()}. Defense: ${stats.defense}`
    };
  }

  generatePotion(rng, depth, id) {
    const base = rng.random(POTION_TYPES);
    const stats = { ...base.stats };

    // Scale with depth
    if (stats.hp) stats.hp = Math.round(stats.hp * (1 + (depth - 1) * 0.15));
    if (stats.mana) stats.mana = Math.round(stats.mana * (1 + (depth - 1) * 0.15));

    return {
      id, name: base.name, type: 'potion', subType: base.subType,
      char: base.char, color: base.color, rarity: 'common',
      value: base.value, stats,
      description: `${base.name}. ${Object.entries(stats).map(([k, v]) => `+${v} ${k}`).join(', ')}`
    };
  }

  generateMisc(rng, depth, id) {
    const miscItems = [
      { name: 'Torch', char: '/', color: '#FFAA00', value: 3, description: 'A simple torch.' },
      { name: 'Rope', char: '~', color: '#AAAA00', value: 5, description: 'A coil of rope.' },
      { name: 'Lockpick', char: '-', color: '#AAAAAA', value: 10, description: 'For picking locks.' },
      { name: 'Gemstone', char: '*', color: '#55FFFF', value: 50, description: 'A valuable gemstone.' },
      { name: 'Ancient Coin', char: '$', color: '#FFFF55', value: 25, description: 'A coin from a lost era.' },
      { name: 'Bread', char: '%', color: '#AAAA00', value: 3, stats: { hp: 5 }, description: 'A loaf of bread.' },
      { name: 'Dried Meat', char: '%', color: '#AA0000', value: 5, stats: { hp: 8 }, description: 'Salted meat.' }
    ];
    const base = rng.random(miscItems);
    return {
      id, ...base, type: base.stats ? 'food' : 'material', subType: 'misc', rarity: 'common'
    };
  }
}
