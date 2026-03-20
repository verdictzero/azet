// ============================================================================
// systems.js — Game systems for ASCIIQUEST, a colony salvage roguelike
// ============================================================================

import { SeededRNG, PerlinNoise, distance } from './utils.js';
import { ItemGenerator } from './entities.js';

// ============================================================================
// CombatSystem — Handles attacks, damage, XP, loot, and initiative
// ============================================================================

export class CombatSystem {
  constructor() {
    this._hitMessages = [
      '{attacker} attacks! {damage} damage to {defender}.',
      '{attacker} strikes {defender}. {damage} damage.',
      '{attacker} hits {defender} for {damage}.',
      '{damage} damage to {defender}!',
    ];

    this._critMessages = [
      'Critical hit! {attacker} deals {damage} to {defender}!',
      '{attacker} lands a critical blow! {damage} damage!',
      'Critical! {damage} damage to {defender}!',
    ];

    this._missMessages = [
      '{attacker} attacks. Miss!',
      '{defender} evades the attack.',
      '{attacker} misses {defender}!',
      'Miss!',
    ];
  }

  calculateAttack(attacker, defender) {
    const attackerName = attacker.name || 'Attacker';
    const defenderName = defender.name || 'Defender';

    const attackerDex = attacker.dex || attacker.stats?.dex || 10;
    const defenderDex = defender.dex || defender.stats?.dex || 10;

    // Hit chance: 70% base + (attacker.dex - defender.dex) * 2%
    const hitChance = Math.min(0.95, Math.max(0.05, 0.70 + (attackerDex - defenderDex) * 0.02));
    const hitRoll = Math.random();
    const hit = hitRoll <= hitChance;

    if (!hit) {
      const template = this._missMessages[Math.floor(Math.random() * this._missMessages.length)];
      const message = template
        .replace('{attacker}', attackerName)
        .replace('{defender}', defenderName);
      return { hit: false, damage: 0, critical: false, message };
    }

    // Critical chance: 5% + attacker.dex * 0.5%
    const critChance = 0.05 + attackerDex * 0.005;
    const critical = Math.random() <= critChance;

    // Damage: attacker.getAttackPower() - defender.getDefense()/2, min 1
    const attackPower = typeof attacker.getAttackPower === 'function'
      ? attacker.getAttackPower()
      : (attacker.attack || attacker.str || 5);
    const defense = typeof defender.getDefense === 'function'
      ? defender.getDefense()
      : (defender.defense || defender.con || 2);

    let damage = Math.max(1, attackPower - Math.floor(defense / 2));

    if (critical) {
      damage *= 2;
    }

    const templates = critical ? this._critMessages : this._hitMessages;
    const template = templates[Math.floor(Math.random() * templates.length)];
    const message = template
      .replace('{attacker}', attackerName)
      .replace('{defender}', defenderName)
      .replace('{damage}', String(damage));

    return { hit: true, damage, critical, message };
  }

  resolveRound(player, enemy) {
    const messages = [];
    let battleOver = false;
    let winner = null;

    // Determine initiative
    const playerInit = this.getInitiative(player);
    const enemyInit = this.getInitiative(enemy);

    let first, second, firstIsPlayer;
    if (playerInit >= enemyInit) {
      first = player;
      second = enemy;
      firstIsPlayer = true;
    } else {
      first = enemy;
      second = player;
      firstIsPlayer = false;
    }

    // First attacker's turn
    const firstAction = this.calculateAttack(first, second);
    messages.push(firstAction.message);

    if (firstAction.hit) {
      const targetHp = second.hp !== undefined ? second.hp : (second.stats?.hp ?? 10);
      const newHp = targetHp - firstAction.damage;

      if (second.hp !== undefined) {
        second.hp = newHp;
      } else if (second.stats) {
        second.stats.hp = newHp;
      }

      if (newHp <= 0) {
        battleOver = true;
        winner = firstIsPlayer ? 'player' : 'enemy';
        const loserName = second.name || (firstIsPlayer ? 'Enemy' : 'Player');
        messages.push(`${loserName} has been defeated!`);

        return {
          playerAction: firstIsPlayer ? firstAction : null,
          enemyAction: firstIsPlayer ? null : firstAction,
          messages,
          battleOver,
          winner,
        };
      }
    }

    // Second attacker's turn
    const secondAction = this.calculateAttack(second, first);
    messages.push(secondAction.message);

    if (secondAction.hit) {
      const targetHp = first.hp !== undefined ? first.hp : (first.stats?.hp ?? 10);
      const newHp = targetHp - secondAction.damage;

      if (first.hp !== undefined) {
        first.hp = newHp;
      } else if (first.stats) {
        first.stats.hp = newHp;
      }

      if (newHp <= 0) {
        battleOver = true;
        winner = firstIsPlayer ? 'enemy' : 'player';
        const loserName = first.name || (firstIsPlayer ? 'Player' : 'Enemy');
        messages.push(`${loserName} has been defeated!`);
      }
    }

    return {
      playerAction: firstIsPlayer ? firstAction : secondAction,
      enemyAction: firstIsPlayer ? secondAction : firstAction,
      messages,
      battleOver,
      winner,
    };
  }

  calculateXPReward(enemy) {
    const level = enemy.level || 1;
    const str = enemy.str || enemy.stats?.str || 10;
    const dex = enemy.dex || enemy.stats?.dex || 10;
    const con = enemy.con || enemy.stats?.con || 10;

    const statBonus = Math.floor((str + dex + con) / 6);
    const baseXP = level * 15 + statBonus;

    // Bosses and elites give bonus XP
    const multiplier = enemy.isBoss ? 3 : (enemy.isElite ? 2 : 1);

    return Math.floor(baseXP * multiplier);
  }

  calculateLoot(rng, enemy, depth) {
    const drops = [];
    const level = enemy.level || 1;

    // Drop chance: 30% base, scales with enemy level
    const dropChance = Math.min(0.80, 0.30 + level * 0.03);

    // Gold drop: enemy.level * 5-15
    if (rng.chance(0.7)) {
      const gold = rng.nextInt(level * 5, level * 15);
      drops.push({ type: 'gold', amount: gold, name: `${gold} gold` });
    }

    // Item drop based on drop chance — weighted rarity distribution
    if (rng.chance(dropChance)) {
      const itemGen = new ItemGenerator();
      const rarity = itemGen.rollRarity(rng, depth);
      const item = itemGen.generate(rng, { depth, rarity, level });
      if (item) {
        drops.push(item);
      }
    }

    // Rare second item for elites/bosses — boosted rarity
    if ((enemy.isBoss || enemy.isElite) && rng.chance(0.5)) {
      const itemGen = new ItemGenerator();
      const rarity = itemGen.rollRarity(rng, depth + (enemy.isBoss ? 5 : 2));
      const item = itemGen.generate(rng, { depth, rarity, level });
      if (item) {
        drops.push(item);
      }
    }

    return drops;
  }

  getInitiative(entity) {
    const dex = entity.dex || entity.stats?.dex || 10;
    const roll = Math.floor(Math.random() * 20) + 1;
    return dex + roll;
  }
}

// ============================================================================
// QuestSystem — Quest generation, tracking, and completion
// ============================================================================

export class QuestSystem {
  constructor() {
    this._activeQuests = new Map();
    this._completedQuests = new Map();
    this._availableQuests = new Map();
    this._nextId = 1;

    this._questTypes = ['FETCH', 'KILL', 'ESCORT', 'INVESTIGATE', 'DELIVER', 'BOUNTY'];

    // ---- Title templates per type ----
    this._titleTemplates = {
      FETCH: [
        'Gather {N} {ITEM}',
        'Recover {ITEM} for {NPC}',
        'Critical Need: {ITEM}',
        '{NPC} Requires {ITEM}',
        'Foraging for {ITEM}',
        'Reclaim the {ITEM}',
        '{ITEM} Shortage',
        'Supply Errand: {ITEM}',
        'Stockpile {ITEM}',
        'Rare {ITEM} Needed',
        'The {ITEM} Search',
        'A Chest of {ITEM}',
        '{NPC}\'s {ITEM} Request',
        'Procurement: {ITEM}',
        'Deep Ruins: {ITEM}',
      ],
      KILL: [
        'Neutralize the {MONSTER}',
        'Clear {LOCATION} of {MONSTER}',
        'Hunt the {MONSTER}',
        'Purge the {MONSTER} Threat',
        'Exterminate {MONSTER}',
        'The {MONSTER} Menace',
        '{MONSTER} Must Be Destroyed',
        'End the {MONSTER} Infestation',
        'Eliminate the {MONSTER}',
        'The {LOCATION} {MONSTER} Problem',
        'Defend Against {MONSTER}',
        'No Quarter for {MONSTER}',
        'Cleanse {LOCATION}',
        '{MONSTER} Threat: Champions Needed',
        'Drive Back the {MONSTER}',
      ],
      ESCORT: [
        'Escort {NPC} to {LOCATION}',
        'Guard {NPC} Through the Wilds',
        'Safe Passage for {NPC}',
        '{NPC}\'s Transit to {LOCATION}',
        'Protect {NPC}',
        'The Route to {LOCATION}',
        'Bodyguard for {NPC}',
        'See {NPC} Safely Back',
        'Escort Detail to {LOCATION}',
        'Guardian of {NPC}',
        'A Dangerous Transit',
        '{NPC} Needs an Escort',
        'Combat Escort Wanted',
        'From Here to {LOCATION}',
        'The Perilous Road',
      ],
      INVESTIGATE: [
        'The Mystery of {SUBJECT}',
        'Investigate {SUBJECT}',
        'Strange Signal: {SUBJECT}',
        'Uncover the Truth of {SUBJECT}',
        'The {SUBJECT} Enigma',
        'Unravel the {SUBJECT} Curse',
        'What Happened at {LOCATION}?',
        'The {SUBJECT} Conspiracy',
        'Secrets of {SUBJECT}',
        'The Curious Case of {SUBJECT}',
        'Divine {SUBJECT}',
        'The {LOCATION} Haunting',
        'Whispers of {SUBJECT}',
        'Portents in {LOCATION}',
        'The {SUBJECT} Investigation',
      ],
      DELIVER: [
        'Deliver {ITEM} to {NPC}',
        'Urgent Delivery: {ITEM}',
        'A Crate for {NPC}',
        'Courier: {ITEM} to {LOCATION}',

        'Rush Delivery for {NPC}',
        '{NPC} Awaits {ITEM}',
        'Priority Delivery to {LOCATION}',
        'Transport the {ITEM}',
        'Bring {ITEM} to {NPC}',
        'Urgent Parcel: {ITEM}',
        'The {ITEM} Must Arrive',
        '{NPC}\'s Requisition',
        'Deliver Supplies to {LOCATION}',
        'Carry {ITEM} Safely',
        'Materials for {NPC}',
      ],
      BOUNTY: [
        'Wanted: {CRIMINAL}',
        'Bounty on {CRIMINAL}',
        'Bring {CRIMINAL} to Justice',
        'The Hunt for {CRIMINAL}',
        'Track Down {CRIMINAL}',
        'Dead or Alive: {CRIMINAL}',
        '{CRIMINAL} Must Be Stopped',
        'Capture {CRIMINAL}',
        'The {CRIMINAL} Bounty',
        'Justice for {CRIMINAL}\'s Crimes',
        'Fugitive: {CRIMINAL}',
        'The Price on {CRIMINAL}\'s Head',
        'Rogue Element: {CRIMINAL}',
        'End {CRIMINAL}\'s Reign',
        'Manhunt: {CRIMINAL}',
      ],
    };

    // ---- Description templates per type ----
    this._descTemplates = {
      FETCH: [
        '{NPC} has asked you to gather {N} {ITEM} from the surrounding sectors. They are essential for the colony\'s survival.',
        'The settlement supply of {ITEM} has run dangerously low. {NPC} needs {N} as soon as possible.',
        '"I cannot continue my work without {ITEM}," says {NPC}. "Please bring me {N} of them."',
        'A shortage of {ITEM} threatens the colony. {NPC} is offering a reward for {N} delivered promptly.',
        '{NPC} is preparing a critical repair and requires {N} {ITEM}. Search the collapsed levels carefully.',
        'The healers need {ITEM} urgently. {NPC} has posted a requisition for {N} to be recovered.',
        'Scouts report that {ITEM} can be found in the old infrastructure. {NPC} needs {N} for their project.',
        'Colony defense preparations demand resources. {NPC} has placed an order for {N} {ITEM}.',
        '{NPC} is fabricating a new device that requires {N} {ITEM}. Help them source the materials.',
        'The Salvage Guild has put out a call for {N} {ITEM}. {NPC} will pay handsomely for your trouble.',
      ],
      KILL: [
        'A dangerous {MONSTER} has been menacing folk near {LOCATION}. {NPC} is offering a reward for its elimination.',
        '{LOCATION} has become overrun with {MONSTER}. The colonists are desperate for someone to clear them out.',
        '"That wretched {MONSTER} destroyed our stores," {NPC} growls. "I want it destroyed."',
        'Scouts report a {MONSTER} nest near {LOCATION}. Clear it before the creatures multiply further.',
        'The guard is stretched thin. {NPC} needs a capable adventurer to deal with the {MONSTER} threat at {LOCATION}.',
        'Convoys refuse to pass through {LOCATION} due to {MONSTER} attacks. {NPC} wants the route secured.',
        'A particularly vicious {MONSTER} has claimed {LOCATION} as its territory. End the threat permanently.',
        '{NPC} has received reports of {MONSTER} activity. Investigate {LOCATION} and eliminate any threats.',
        'The {MONSTER} grows bolder each cycle, venturing closer to the settlement bulkheads. {NPC} offers credits for proof of the kill.',
        'Workers refuse to enter {LOCATION} since the {MONSTER} appeared. {NPC} implores you to help.',
      ],
      ESCORT: [
        '{NPC} must travel to {LOCATION} but fears the dangers of the road. Serve as their protector.',
        'Raiders have been ambushing travelers on the way to {LOCATION}. {NPC} needs a bodyguard.',
        '"I carry precious salvage that must reach {LOCATION} intact," says {NPC}. "Will you guard me?"',
        '{NPC} has important business at {LOCATION} and cannot afford to be waylaid by raiders.',
        'The route to {LOCATION} is hazardous. {NPC} is willing to pay well for safe escort.',
        'An envoy named {NPC} must arrive at {LOCATION} unharmed. Your combat skills are needed.',
        '{NPC}, a senior data analyst, must reach {LOCATION} to deliver vital research. Protect them.',
        'The supply caravan to {LOCATION} departs soon. {NPC} seeks a capable guard for the journey.',
        '"My companions wait for me in {LOCATION}," {NPC} says anxiously. "I just need someone to walk with me."',
        '{NPC} has been tasked with delivering Founder tech to {LOCATION}. Many would kill for such salvage.',
      ],
      INVESTIGATE: [
        'Strange anomalies have been detected near {LOCATION}. {NPC} wants someone to investigate {SUBJECT}.',
        'People have been going missing, and {NPC} suspects it has something to do with {SUBJECT}.',
        '"Something is not right about {SUBJECT}," {NPC} whispers. "Look into it, but be discreet."',
        'Rumors of {SUBJECT} have spread through the quarters. {NPC} wants the truth uncovered.',
        '{NPC} has noticed disturbing patterns related to {SUBJECT}. Find out what is really going on.',
        'The Colony Council speaks of {SUBJECT} in hushed tones. {NPC} believes there is more to the story.',
        'Old colony records reference {SUBJECT}, and {NPC} believes the answer lies somewhere in {LOCATION}.',
        'The systems have been failing since {SUBJECT} began. {NPC} seeks answers.',
        '"I found this strange data fragment related to {SUBJECT}," {NPC} says. "What does it mean?"',
        'The mystery of {SUBJECT} has baffled researchers for ages. {NPC} thinks you can solve it.',
      ],
      DELIVER: [
        '{NPC} needs {ITEM} delivered to a contact in {LOCATION}. Time is of the essence.',
        'This {ITEM} must reach {LOCATION} before the next cycle. {NPC} is counting on you.',
        '"Handle the {ITEM} with care," {NPC} warns. "It is irreplaceable and must reach {LOCATION}."',
        'A critical shipment of {ITEM} needs to reach {NPC_DEST} in {LOCATION}. Deliver it safely.',
        '{NPC} has prepared the {ITEM} for transport. Take it to {LOCATION} without delay.',
        'The {ITEM} contains data vital to the colony\'s defense. {NPC} needs it delivered to {LOCATION}.',
        '"My colleague in {LOCATION} has been waiting for this {ITEM}," says {NPC}. "Please hurry."',
        'A rare {ITEM} has been recovered by {NPC}. It must be brought to {LOCATION} for study.',
        'Deliver this sealed {ITEM} to the contact in {LOCATION}. {NPC} says you must not open it.',
        'The healer in {LOCATION} needs this {ITEM} urgently. {NPC} is offering good coin for swift delivery.',
      ],
      BOUNTY: [
        '{CRIMINAL} has been spotted near {LOCATION}. {NPC} is offering a bounty for their capture.',
        'The notorious {CRIMINAL} has evaded justice for too long. {NPC} wants them brought in.',
        '"That rogue {CRIMINAL} raided our supply cache," {NPC} seethes. "Bring me their head."',
        '{CRIMINAL} is wanted for crimes against the colony. {NPC} has posted a generous bounty.',
        'Track {CRIMINAL} to their hideout near {LOCATION} and bring them to justice.',
        'The fugitive {CRIMINAL} has a price on their head. {NPC} will pay double if taken alive.',
        '{CRIMINAL} has been terrorizing the outer sectors. {NPC} needs a skilled hunter to end the threat.',
        'Witnesses last saw {CRIMINAL} fleeing toward {LOCATION}. {NPC} wants them found.',
        'The crimes of {CRIMINAL} have gone unpunished. {NPC} seeks a bounty hunter worthy of the task.',
        '{NPC} mutters darkly about {CRIMINAL}. "Find them. Make them pay for what they did."',
      ],
    };

    // ---- Name pools for template substitution ----
    this._itemNames = [
      'Data Cores', 'Power Cells', 'Founder Relics', 'Circuit Boards',
      'Med-Packs', 'Composite Thread', 'Energy Crystals',
      'Sensor Arrays', 'Coolant Vials', 'Memory Shards',
      'Purification Filters', 'Insulated Wiring', 'Silver Wire', 'Iron Ingots',
      'Shield Emitters', 'Void Shards', 'Chemical Reagents',
    ];

    this._monsterNames = [
      'Feral Hounds', 'Rogue Security Bots', 'Rust Raiders', 'Tunnel Rats',
      'Maintenance Spiders', 'Corrupted Wardens', 'Hull Wraiths', 'Acid Crawlers',
      'Shadow Stalkers', 'Defense Drones', 'Swarm Beetles', 'Malfunctioning Sentries',
      'Blight Molds', 'Void Leeches', 'Stone Borers', 'Storm Elementals',
    ];

    this._locationNames = [
      'the Sealed Sub-Levels', 'the Maintenance Tunnels', 'the Collapsed Antenna',
      'the Lower Quarter', 'the Abandoned Reactor', 'the Flooded Ducts',
      'the Northern Airlock', 'the Winding Corridors', 'the Old Storehouse',
      'the Forgotten Archives', 'the High Catwalks', 'the Scrapheap Warrens',
      'the Deep Passages', 'the Hydroponic Quarter', 'the Outer Hull Breach',
    ];

    this._subjectNames = [
      'the Disappearances', 'the Flickering Lights', 'the Contaminated Water',
      'the Strange Transmissions', 'the Founder Prophecy', 'the Missing Convoy',
      'the Malfunctioning Reclaimer', 'the Sealed Sub-Level', 'the Phantom Sightings',
      'the Power Surges', 'the Failing Harvests', 'the Lost Expedition',
    ];

    this._criminalNames = [
      'Red Fang', 'the Shadow', 'Blackthorn', 'Iron Mask',
      'Scarface Morel', 'the Viper', 'One-Eye Grask',
      'Silvertongue', 'the Butcher', 'Rustjaw Kade',
      'Nightclaw', 'the Phantom of the Deck', 'Mad Helga',
      'Grimblade', 'the Data Thief',
    ];

    this._npcNames = [
      'Elder Tobin', 'Healer Mira', 'Smithmaster Havel',
      'Captain Rhea', 'Quartermaster Loris', 'Archivist Endrin',
      'Hydroponist Giles', 'Founder Adept Yara', 'Trader Kael',
      'Scout Theron', 'Alchemist Voss', 'Guard Sergeant Bram',
    ];
  }

  generateQuest(rng, giverNPC, playerLevel, worldContext) {
    const type = rng.random(this._questTypes);

    // Determine difficulty
    const diffRoll = rng.next();
    let difficulty;
    if (diffRoll < 0.4) difficulty = 'easy';
    else if (diffRoll < 0.8) difficulty = 'medium';
    else difficulty = 'hard';

    const diffMultiplier = difficulty === 'easy' ? 1 : difficulty === 'medium' ? 1.5 : 2.5;
    const rawName = giverNPC?.name;
    const npcName = (rawName && typeof rawName === 'object' ? rawName.full : rawName) || rng.random(this._npcNames);
    const npcId = giverNPC?.id || npcName;

    // Build substitution context
    const item = (worldContext?.items && worldContext.items.length > 0)
      ? rng.random(worldContext.items)
      : rng.random(this._itemNames);
    const monster = (worldContext?.monsters && worldContext.monsters.length > 0)
      ? rng.random(worldContext.monsters)
      : rng.random(this._monsterNames);
    const location = (worldContext?.locations && worldContext.locations.length > 0)
      ? rng.random(worldContext.locations)
      : rng.random(this._locationNames);
    const subject = rng.random(this._subjectNames);
    const criminal = rng.random(this._criminalNames);
    const destNpc = rng.random(this._npcNames);
    const n = rng.nextInt(3, 8 + Math.floor(playerLevel / 2));

    // Pick title
    const titleTemplates = this._titleTemplates[type];
    let title = rng.random(titleTemplates);
    title = this._substitute(title, { npcName, item, monster, location, subject, criminal, destNpc, n });

    // Pick description
    const descTemplates = this._descTemplates[type];
    let description = rng.random(descTemplates);
    description = this._substitute(description, { npcName, item, monster, location, subject, criminal, destNpc, n });

    // Build objectives (targetSettlementName resolved below, use location as placeholder)
    const objectives = this._buildObjectives(type, { item, monster, location, subject, criminal, destNpc, n, npcName }, rng, worldContext);

    // Determine rewards
    const baseGold = Math.floor((10 + playerLevel * 5) * diffMultiplier);
    const baseXP = Math.floor((20 + playerLevel * 10) * diffMultiplier);
    const reputation = Math.floor(5 * diffMultiplier);

    const rewardItems = [];
    if (rng.chance(0.3)) {
      const itemGen = new ItemGenerator();
      const rewardItem = itemGen.generate(rng, { level: playerLevel, rarity: difficulty === 'hard' ? 'rare' : 'uncommon' });
      if (rewardItem) {
        rewardItems.push(rewardItem);
      }
    }

    const timeLimit = rng.chance(0.3) ? rng.nextInt(5, 15) : null;

    // Success/failure consequences
    const successConsequences = [
      `${npcName} will speak highly of you to others.`,
      'Your reputation with the local faction improves.',
      'Word of your deeds spreads throughout the colony.',
      'The grateful colonists offer you supplies.',
      `${npcName} promises to remember this favor.`,
    ];
    const failureConsequences = [
      `${npcName} will be disappointed but understanding.`,
      'Your reputation may suffer slightly.',
      'The situation worsens without intervention.',
      'Others may question your reliability.',
      `${npcName} will seek another adventurer for the task.`,
    ];

    // Determine actual target location from world data based on quest type
    let targetCoords = null;
    let targetSettlementName = location; // fallback to template location name
    const nearbyLocs = worldContext?.nearbyLocations || [];
    const currentCoords = worldContext?.settlementCoords;
    if (nearbyLocs.length > 0 && currentCoords) {
      const dungeonTypes = new Set(['dungeon', 'ruins', 'tower']);
      const settlementTypes = new Set(['village', 'town', 'city', 'castle']);
      let candidates;
      if (type === 'KILL' || type === 'BOUNTY') {
        // Prefer dungeons/ruins for combat quests
        candidates = nearbyLocs.filter(l => dungeonTypes.has(l.type) && (Math.abs(l.x - currentCoords.x) > 5 || Math.abs(l.y - currentCoords.y) > 5));
        if (candidates.length === 0) candidates = nearbyLocs.filter(l => Math.abs(l.x - currentCoords.x) > 5 || Math.abs(l.y - currentCoords.y) > 5);
      } else if (type === 'ESCORT' || type === 'DELIVER') {
        // Pick a different settlement
        candidates = nearbyLocs.filter(l => settlementTypes.has(l.type) && (Math.abs(l.x - currentCoords.x) > 5 || Math.abs(l.y - currentCoords.y) > 5));
      } else {
        // FETCH, INVESTIGATE — any nearby location
        candidates = nearbyLocs.filter(l => Math.abs(l.x - currentCoords.x) > 5 || Math.abs(l.y - currentCoords.y) > 5);
      }
      if (candidates.length > 0) {
        // Sort by distance, pick one of the closest
        candidates.sort((a, b) => {
          const da = Math.abs(a.x - currentCoords.x) + Math.abs(a.y - currentCoords.y);
          const db = Math.abs(b.x - currentCoords.x) + Math.abs(b.y - currentCoords.y);
          return da - db;
        });
        const pick = rng.random(candidates.slice(0, Math.min(3, candidates.length)));
        targetCoords = { x: pick.x, y: pick.y };
        targetSettlementName = pick.name;
      }
    }

    const quest = {
      id: `quest_${this._nextId++}`,
      type,
      title,
      description,
      giver: npcId,
      objectives,
      rewards: {
        gold: baseGold,
        xp: baseXP,
        items: rewardItems,
        reputation,
      },
      difficulty,
      status: 'available',
      timeLimit,
      targetLocationName: targetSettlementName,
      targetCoords,
      consequences: {
        success: rng.random(successConsequences),
        failure: rng.random(failureConsequences),
      },
    };

    this._availableQuests.set(quest.id, quest);
    return quest;
  }

  _substitute(text, ctx) {
    return text
      .replace(/\{NPC\}/g, ctx.npcName)
      .replace(/\{NPC_DEST\}/g, ctx.destNpc)
      .replace(/\{ITEM\}/g, ctx.item)
      .replace(/\{MONSTER\}/g, ctx.monster)
      .replace(/\{MONSTERS\}/g, ctx.monster)
      .replace(/\{LOCATION\}/g, ctx.location)
      .replace(/\{SUBJECT\}/g, ctx.subject)
      .replace(/\{CRIMINAL\}/g, ctx.criminal)
      .replace(/\{N\}/g, String(ctx.n));
  }

  _buildObjectives(type, ctx, rng, worldContext) {
    // Resolve a real target location name if available
    const nearbyLocs = worldContext?.nearbyLocations || [];
    const currentCoords = worldContext?.settlementCoords;
    let targetName = ctx.location;
    if (nearbyLocs.length > 0 && currentCoords) {
      const dungeonTypes = new Set(['dungeon', 'ruins', 'tower']);
      const settlementTypes = new Set(['village', 'town', 'city', 'castle']);
      let candidates;
      if (type === 'KILL' || type === 'BOUNTY') {
        candidates = nearbyLocs.filter(l => dungeonTypes.has(l.type) && (Math.abs(l.x - currentCoords.x) > 5 || Math.abs(l.y - currentCoords.y) > 5));
        if (candidates.length === 0) candidates = nearbyLocs.filter(l => Math.abs(l.x - currentCoords.x) > 5 || Math.abs(l.y - currentCoords.y) > 5);
      } else if (type === 'ESCORT' || type === 'DELIVER') {
        candidates = nearbyLocs.filter(l => settlementTypes.has(l.type) && (Math.abs(l.x - currentCoords.x) > 5 || Math.abs(l.y - currentCoords.y) > 5));
      } else {
        candidates = nearbyLocs.filter(l => Math.abs(l.x - currentCoords.x) > 5 || Math.abs(l.y - currentCoords.y) > 5);
      }
      if (candidates.length > 0) {
        candidates.sort((a, b) => {
          const da = Math.abs(a.x - currentCoords.x) + Math.abs(a.y - currentCoords.y);
          const db = Math.abs(b.x - currentCoords.x) + Math.abs(b.y - currentCoords.y);
          return da - db;
        });
        targetName = rng.random(candidates.slice(0, Math.min(3, candidates.length))).name;
      }
    }

    switch (type) {
      case 'FETCH':
        return [{
          type: 'collect',
          target: ctx.item,
          current: 0,
          required: ctx.n,
          description: `Collect ${ctx.n} ${ctx.item} near ${targetName}`,
        }];

      case 'KILL': {
        const count = rng.nextInt(1, 5);
        return [{
          type: 'kill',
          target: ctx.monster,
          current: 0,
          required: count,
          description: count === 1
            ? `Slay the ${ctx.monster} near ${targetName}`
            : `Defeat ${count} ${ctx.monster} near ${targetName}`,
        }];
      }

      case 'ESCORT':
        return [
          {
            type: 'escort',
            target: ctx.npcName,
            current: 0,
            required: 1,
            description: `Escort ${ctx.npcName} to ${targetName}`,
          },
          {
            type: 'protect',
            target: ctx.npcName,
            current: 0,
            required: 1,
            description: `Keep ${ctx.npcName} alive during the journey`,
          },
        ];

      case 'INVESTIGATE': {
        const cluesNeeded = rng.nextInt(2, 4);
        return [{
          type: 'investigate',
          target: ctx.subject,
          current: 0,
          required: cluesNeeded,
          description: `Find ${cluesNeeded} clues about ${ctx.subject} near ${targetName}`,
        }];
      }

      case 'DELIVER':
        return [{
          type: 'deliver',
          target: ctx.destNpc,
          current: 0,
          required: 1,
          description: `Deliver ${ctx.item} to ${ctx.destNpc} at ${targetName}`,
        }];

      case 'BOUNTY':
        return [
          {
            type: 'find',
            target: ctx.criminal,
            current: 0,
            required: 1,
            description: `Track down ${ctx.criminal} near ${targetName}`,
          },
          {
            type: 'kill',
            target: ctx.criminal,
            current: 0,
            required: 1,
            description: `Defeat ${ctx.criminal}`,
          },
        ];

      default:
        return [];
    }
  }

  acceptQuest(questId) {
    const quest = this._availableQuests.get(questId);
    if (!quest) return false;
    quest.status = 'active';
    this._activeQuests.set(questId, quest);
    this._availableQuests.delete(questId);
    return true;
  }

  updateProgress(questId, objectiveType, target, amount = 1) {
    const quest = this._activeQuests.get(questId);
    if (!quest) return false;

    let updated = false;
    for (const obj of quest.objectives) {
      if (obj.type === objectiveType && obj.target === target) {
        obj.current = Math.min(obj.current + amount, obj.required);
        updated = true;
      }
    }
    return updated;
  }

  checkCompletion(questId) {
    const quest = this._activeQuests.get(questId);
    if (!quest) return false;
    return quest.objectives.every(obj => obj.current >= obj.required);
  }

  completeQuest(questId) {
    const quest = this._activeQuests.get(questId);
    if (!quest) return null;
    if (!this.checkCompletion(questId)) return null;

    quest.status = 'completed';
    this._completedQuests.set(questId, quest);
    this._activeQuests.delete(questId);

    return { ...quest.rewards };
  }

  getActiveQuests() {
    return Array.from(this._activeQuests.values());
  }

  getCompletedQuests() {
    return Array.from(this._completedQuests.values());
  }

  getAvailableQuests() {
    return Array.from(this._availableQuests.values());
  }
}

// ============================================================================
// ShopSystem — Shop inventory generation, pricing, buying, and selling
// ============================================================================

export class ShopSystem {
  constructor() {
    this._shopInventories = new Map();

    this._tierConfig = {
      village: { minItems: 5, maxItems: 8, maxRarity: 'common' },
      town: { minItems: 8, maxItems: 12, maxRarity: 'uncommon' },
      city: { minItems: 12, maxItems: 18, maxRarity: 'rare' },
    };

    this._shopItemTypes = {
      armory: ['weapon', 'armor', 'shield', 'helmet'],
      chemist: ['potion', 'scroll', 'reagent', 'elixir'],
      general: ['weapon', 'armor', 'potion', 'scroll', 'food', 'torch', 'light'],
      enchanter: ['ring', 'amulet', 'gem', 'enchanted_accessory'],
    };
  }

  generateInventory(rng, shopType, locationTier, depth = 1) {
    const tier = this._tierConfig[locationTier] || this._tierConfig.village;
    const itemCount = rng.nextInt(tier.minItems, tier.maxItems);
    const allowedTypes = this._shopItemTypes[shopType] || this._shopItemTypes.general;

    const rarityPool = this._buildRarityPool(tier.maxRarity);
    const itemGen = new ItemGenerator();
    const inventory = [];

    for (let i = 0; i < itemCount; i++) {
      const itemType = rng.random(allowedTypes);
      const rarity = rng.random(rarityPool);
      const item = itemGen.generate(rng, { type: itemType, rarity, depth, level: depth });
      if (item) {
        inventory.push(item);
      }
    }

    const shopKey = `${shopType}_${locationTier}_${depth}`;
    this._shopInventories.set(shopKey, inventory);

    return inventory;
  }

  _buildRarityPool(maxRarity) {
    const pool = ['common', 'common', 'common', 'common'];
    if (maxRarity === 'uncommon' || maxRarity === 'rare' || maxRarity === 'legendary') {
      pool.push('uncommon', 'uncommon');
    }
    if (maxRarity === 'rare' || maxRarity === 'legendary') {
      pool.push('rare');
    }
    if (maxRarity === 'legendary') {
      pool.push('legendary');
    }
    return pool;
  }

  getPrice(item, merchantRep = 0) {
    const baseValue = item.value || 10;
    const repDiscount = Math.min(25, Math.max(0, merchantRep)) / 100;
    return Math.max(1, Math.floor(baseValue * (1 - repDiscount)));
  }

  getSellPrice(item) {
    const baseValue = item.value || 10;
    return Math.max(1, Math.floor(baseValue * 0.6));
  }

  haggle(rng, playerCha, merchantInsight) {
    const cha = playerCha || 10;
    const insight = merchantInsight || 12;
    const roll = rng.nextInt(1, 20);
    const success = (cha + roll) > (insight + 10);

    if (success) {
      const discount = Math.min(25, Math.floor((cha + roll - insight - 10) * 2) + 5);
      return discount;
    }
    return 0;
  }

  buyItem(player, item, price) {
    const gold = player.gold !== undefined ? player.gold : (player.stats?.gold ?? 0);
    if (gold < price) {
      return { success: false, message: 'Not enough gold.' };
    }

    if (player.gold !== undefined) {
      player.gold -= price;
    } else if (player.stats) {
      player.stats.gold -= price;
    }

    const inventory = player.inventory || player.items || [];
    inventory.push(item);

    if (player.inventory) {
      player.inventory = inventory;
    } else if (player.items) {
      player.items = inventory;
    }

    return { success: true, message: `Purchased ${item.name || 'item'} for ${price} gold.` };
  }

  sellItem(player, item, price) {
    const inventory = player.inventory || player.items || [];
    const idx = inventory.findIndex(i => (i.id || i) === (item.id || item));

    if (idx === -1) {
      return { success: false, message: 'Item not found in inventory.' };
    }

    inventory.splice(idx, 1);

    if (player.gold !== undefined) {
      player.gold += price;
    } else if (player.stats) {
      player.stats.gold = (player.stats.gold || 0) + price;
    }

    return { success: true, message: `Sold ${item.name || 'item'} for ${price} gold.` };
  }

  refreshStock(rng, shopType, tier, depth = 1) {
    return this.generateInventory(rng, shopType, tier, depth);
  }
}

// ============================================================================
// FactionSystem — Faction relations and player standing
// ============================================================================

export class FactionSystem {
  constructor() {
    this._factions = new Map();
    this._relations = new Map();
    this._playerStanding = new Map();

    // Initialize default factions
    this._initFaction('COLONY_GUARD', { name: 'The Colony Guard', color: '#5555FF' });
    this._initFaction('SALVAGE_GUILD', { name: 'The Salvage Guild', color: '#FFAA00' });
    this._initFaction('ARCHIVE_KEEPERS', { name: 'The Archive Keepers', color: '#FFFFFF' });
    this._initFaction('SYNDICATE', { name: 'The Syndicate', color: '#AA00AA' });
    this._initFaction('FERAL_SWARM', { name: 'The Feral Swarm', color: '#FF0000' });
    this._initFaction('THE_VOID', { name: 'The Void', color: '#555555' });
    this._initFaction('RUST_RAIDERS', { name: 'The Rust Raiders', color: '#AA5500' });
    this._initFaction('COLONY_COUNCIL', { name: 'The Colony Council', color: '#FFFF55' });
    this._initFaction('MALFUNCTIONING', { name: 'Malfunctioning Systems', color: '#AAAAAA' });
    this._initFaction('MUTANT', { name: 'Mutated Organisms', color: '#44CC44' });
    this._initFaction('ALIEN', { name: 'Alien Infiltrators', color: '#AA44FF' });
    this._initFaction('ASSIMILATED', { name: 'The Assimilated', color: '#FF4444' });

    // Default inter-faction relations
    this._setDefaultRelation('COLONY_GUARD', 'SALVAGE_GUILD', 70);
    this._setDefaultRelation('COLONY_GUARD', 'ARCHIVE_KEEPERS', 60);
    this._setDefaultRelation('COLONY_GUARD', 'COLONY_COUNCIL', 65);
    this._setDefaultRelation('COLONY_GUARD', 'SYNDICATE', -60);
    this._setDefaultRelation('COLONY_GUARD', 'RUST_RAIDERS', -90);
    this._setDefaultRelation('COLONY_GUARD', 'FERAL_SWARM', -100);
    this._setDefaultRelation('COLONY_GUARD', 'THE_VOID', -100);

    this._setDefaultRelation('SALVAGE_GUILD', 'ARCHIVE_KEEPERS', 40);
    this._setDefaultRelation('SALVAGE_GUILD', 'COLONY_COUNCIL', 50);
    this._setDefaultRelation('SALVAGE_GUILD', 'SYNDICATE', -40);
    this._setDefaultRelation('SALVAGE_GUILD', 'RUST_RAIDERS', -80);
    this._setDefaultRelation('SALVAGE_GUILD', 'FERAL_SWARM', -90);
    this._setDefaultRelation('SALVAGE_GUILD', 'THE_VOID', -80);

    this._setDefaultRelation('ARCHIVE_KEEPERS', 'COLONY_COUNCIL', 30);
    this._setDefaultRelation('ARCHIVE_KEEPERS', 'SYNDICATE', -30);
    this._setDefaultRelation('ARCHIVE_KEEPERS', 'RUST_RAIDERS', -50);
    this._setDefaultRelation('ARCHIVE_KEEPERS', 'FERAL_SWARM', -70);
    this._setDefaultRelation('ARCHIVE_KEEPERS', 'THE_VOID', -100);

    this._setDefaultRelation('COLONY_COUNCIL', 'SYNDICATE', -50);
    this._setDefaultRelation('COLONY_COUNCIL', 'RUST_RAIDERS', -70);
    this._setDefaultRelation('COLONY_COUNCIL', 'FERAL_SWARM', -80);
    this._setDefaultRelation('COLONY_COUNCIL', 'THE_VOID', -90);

    this._setDefaultRelation('SYNDICATE', 'RUST_RAIDERS', 20);
    this._setDefaultRelation('SYNDICATE', 'FERAL_SWARM', -60);
    this._setDefaultRelation('SYNDICATE', 'THE_VOID', -70);

    this._setDefaultRelation('RUST_RAIDERS', 'FERAL_SWARM', -50);
    this._setDefaultRelation('RUST_RAIDERS', 'THE_VOID', -60);

    this._setDefaultRelation('FERAL_SWARM', 'THE_VOID', -30);

    // Enemy faction relations with friendly factions
    for (const enemy of ['MALFUNCTIONING', 'MUTANT', 'ALIEN', 'ASSIMILATED']) {
      for (const friendly of ['COLONY_GUARD', 'SALVAGE_GUILD', 'ARCHIVE_KEEPERS', 'COLONY_COUNCIL']) {
        this._setDefaultRelation(enemy, friendly, -80);
      }
    }
    // Enemy factions hostile to each other
    this._setDefaultRelation('MALFUNCTIONING', 'MUTANT', -30);
    this._setDefaultRelation('MALFUNCTIONING', 'ALIEN', -60);
    this._setDefaultRelation('MALFUNCTIONING', 'ASSIMILATED', -90);
    this._setDefaultRelation('MUTANT', 'ALIEN', -50);
    this._setDefaultRelation('MUTANT', 'ASSIMILATED', -70);
    this._setDefaultRelation('ALIEN', 'ASSIMILATED', -40);

    // Default player standings (neutral with most, hostile with swarm/void)
    this._playerStanding.set('COLONY_GUARD', 10);
    this._playerStanding.set('SALVAGE_GUILD', 0);
    this._playerStanding.set('ARCHIVE_KEEPERS', 5);
    this._playerStanding.set('SYNDICATE', 0);
    this._playerStanding.set('FERAL_SWARM', -80);
    this._playerStanding.set('THE_VOID', -100);
    this._playerStanding.set('RUST_RAIDERS', -40);
    this._playerStanding.set('COLONY_COUNCIL', 0);
    this._playerStanding.set('MALFUNCTIONING', -20);
    this._playerStanding.set('MUTANT', -40);
    this._playerStanding.set('ALIEN', -60);
    this._playerStanding.set('ASSIMILATED', -80);
  }

  _initFaction(id, data) {
    this._factions.set(id, { id, relations: {}, ...data });
  }

  _relationKey(a, b) {
    return a < b ? `${a}|${b}` : `${b}|${a}`;
  }

  _setDefaultRelation(factionA, factionB, value) {
    const key = this._relationKey(factionA, factionB);
    this._relations.set(key, Math.max(-100, Math.min(100, value)));
  }

  getRelation(factionA, factionB) {
    if (factionA === factionB) return 100;
    const key = this._relationKey(factionA, factionB);
    return this._relations.has(key) ? this._relations.get(key) : 0;
  }

  modifyRelation(factionA, factionB, amount) {
    if (factionA === factionB) return;
    const key = this._relationKey(factionA, factionB);
    const current = this._relations.has(key) ? this._relations.get(key) : 0;
    this._relations.set(key, Math.max(-100, Math.min(100, current + amount)));
  }

  areHostile(factionA, factionB) {
    return this.getRelation(factionA, factionB) < -50;
  }

  getPlayerStanding(factionId) {
    return this._playerStanding.has(factionId) ? this._playerStanding.get(factionId) : 0;
  }

  modifyPlayerStanding(factionId, amount) {
    const current = this.getPlayerStanding(factionId);
    this._playerStanding.set(factionId, Math.max(-100, Math.min(100, current + amount)));
  }

  // Integrate world history civilizations as enriched faction data
  enrichWithWorldHistory(worldHistory) {
    if (!worldHistory) return;
    this._worldHistory = worldHistory;

    const civFactions = worldHistory.mapToGameFactions();

    // Merge historical civilizations into game factions
    for (const civData of civFactions) {
      const existingIds = Array.from(this._factions.keys());
      // Try to map to an existing faction or create a new enrichment entry
      let matched = false;

      for (const fId of existingIds) {
        const faction = this._factions.get(fId);
        // Simple name match
        if (faction.name.toLowerCase().includes(civData.name.replace('The ', '').toLowerCase().split(/\s/)[0])) {
          faction.history = civData;
          faction.culturalValues = civData.values;
          faction.traditions = civData.traditions;
          faction.architectureStyle = civData.architectureStyle;
          faction.government = civData.government;
          faction.historicalPopulation = civData.population;
          faction.militaryStrength = civData.militaryStrength;
          faction.religion = civData.religion;
          matched = true;
          break;
        }
      }

      // If no match, add the historical civ as extra lore data accessible via the system
      if (!matched) {
        const id = civData.civId.toUpperCase().replace(/[^A-Z0-9_]/g, '_');
        if (!this._factions.has(id)) {
          this._initFaction(id, {
            name: civData.name,
            color: '#CCAA44',
            isHistorical: true,
            history: civData,
            culturalValues: civData.values,
            traditions: civData.traditions,
            architectureStyle: civData.architectureStyle,
            government: civData.government,
            historicalPopulation: civData.population,
            militaryStrength: civData.militaryStrength,
            religion: civData.religion,
          });
          this._playerStanding.set(id, 0);
        }
      }
    }

    // Modify inter-faction relations based on historical wars/alliances
    for (const civ of worldHistory.civilizations.filter(c => c.isActive)) {
      const civKey = civ.id.toUpperCase().replace(/[^A-Z0-9_]/g, '_');
      for (const enemyId of civ.enemies) {
        const enemyKey = enemyId.toUpperCase().replace(/[^A-Z0-9_]/g, '_');
        if (this._factions.has(civKey) && this._factions.has(enemyKey)) {
          this._setDefaultRelation(civKey, enemyKey, -50);
        }
      }
      for (const allyId of civ.allies) {
        const allyKey = allyId.toUpperCase().replace(/[^A-Z0-9_]/g, '_');
        if (this._factions.has(civKey) && this._factions.has(allyKey)) {
          this._setDefaultRelation(civKey, allyKey, 60);
        }
      }
    }
  }

  // Get faction lore summary for UI display
  getFactionLore(factionId) {
    const faction = this._factions.get(factionId);
    if (!faction) return null;

    const lore = {
      name: faction.name,
      color: faction.color,
      values: faction.culturalValues || [],
      traditions: faction.traditions || [],
      government: faction.government || null,
      architectureStyle: faction.architectureStyle || null,
      religion: faction.religion || null,
      history: faction.history || null,
    };

    return lore;
  }

  // Get all faction names including historical ones
  getAllFactionNames() {
    return Array.from(this._factions.values()).map(f => f.name);
  }
}

// ============================================================================
// TimeSystem — In-game time tracking with day/night cycles
// ============================================================================

export class TimeSystem {
  constructor() {
    this.hour = 8;
    this.day = 1;
    this.year = 1;
    this.onDayChange = null;
    // Real-time advancement: 1 game minute = 0.5 real seconds
    // => 1 game hour = 30 real seconds = 30000 ms
    this._hoursPerMs = 1 / 30000;
    this._lastRealTime = null;
    this._paused = false;
  }

  // Start real-time clock (call once when gameplay begins)
  startRealTime() {
    this._lastRealTime = performance.now();
  }

  // Pause/unpause real-time advancement (e.g. during menus)
  setRealTimePaused(paused) {
    if (!paused && this._paused) {
      // Reset timestamp so we don't accumulate time spent paused
      this._lastRealTime = performance.now();
    }
    this._paused = paused;
  }

  // Call each frame with current timestamp to advance time continuously
  updateRealTime(now) {
    if (this._paused) return;
    if (this._lastRealTime === null) {
      this._lastRealTime = now;
      return;
    }
    const elapsed = now - this._lastRealTime;
    this._lastRealTime = now;
    if (elapsed > 0 && elapsed < 5000) { // cap at 5s to avoid jumps on tab-away
      this.advance(elapsed * this._hoursPerMs);
    }
  }

  advance(hours) {
    this.hour += hours;

    while (this.hour >= 24) {
      this.hour -= 24;
      this.day += 1;

      if (this.day > 365) {
        this.day = 1;
        this.year += 1;
      }

      if (typeof this.onDayChange === 'function') {
        this.onDayChange(this.day, this.year);
      }
    }
  }

  getTimeOfDay() {
    const h = this.hour;
    if (h >= 5 && h < 7) return 'dawn';
    if (h >= 7 && h < 12) return 'morning';
    if (h >= 12 && h < 17) return 'afternoon';
    if (h >= 17 && h < 20) return 'evening';
    return 'night';
  }

  isDaytime() {
    return this.hour >= 6 && this.hour < 20;
  }

  getTimeString() {
    const hh = String(this.hour).padStart(2, '0');
    return `Day ${this.day}, ${hh}:00`;
  }

  getDayPhase() {
    return this.hour / 24;
  }

  /**
   * Get smooth day/night tint color and alpha based on current hour.
   * Returns {color, alpha} with interpolation between keyframes.
   */
  getTimeTint() {
    const h = this.hour;
    // Keyframes: [hour, r, g, b, alpha]
    const keys = [
      [0,   0,   0,   34,  0.45],  // deep night
      [4,   17,  0,   34,  0.40],  // pre-dawn
      [5,   68,  51,  0,   0.20],  // dawn golden
      [7,   34,  25,  0,   0.05],  // sunrise end
      [10,  0,   0,   0,   0.00],  // morning clear
      [14,  0,   0,   0,   0.00],  // midday clear
      [17,  34,  17,  0,   0.08],  // afternoon warm
      [18,  68,  34,  0,   0.15],  // dusk orange
      [19,  51,  0,   51,  0.25],  // sunset purple
      [20,  17,  0,   51,  0.35],  // twilight
      [21,  0,   0,   34,  0.42],  // early night
      [24,  0,   0,   34,  0.45],  // deep night (wraps)
    ];

    // Find bounding keyframes
    let lo = keys[0], hi = keys[1];
    for (let i = 0; i < keys.length - 1; i++) {
      if (h >= keys[i][0] && h < keys[i + 1][0]) {
        lo = keys[i];
        hi = keys[i + 1];
        break;
      }
    }

    const range = hi[0] - lo[0];
    const t = range > 0 ? (h - lo[0]) / range : 0;
    const r = Math.round(lo[1] + (hi[1] - lo[1]) * t);
    const g = Math.round(lo[2] + (hi[2] - lo[2]) * t);
    const b = Math.round(lo[3] + (hi[3] - lo[3]) * t);
    const alpha = lo[4] + (hi[4] - lo[4]) * t;

    const hex = '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
    return { color: hex, alpha };
  }

  /**
   * Get sun/moon direction for shadow casting.
   * Returns {dx, dy, elevation (0-1), shadowLength (multiplier)}.
   */
  getSunDirection() {
    const h = this.hour;
    // Sun rises at 6, sets at 20. Moon opposite.
    const isDay = h >= 6 && h < 20;
    let angle, elevation;

    if (isDay) {
      // Map 6-20 to 0-PI (sunrise east to sunset west)
      const t = (h - 6) / 14; // 0 at sunrise, 1 at sunset
      angle = t * Math.PI; // 0=east, PI=west
      elevation = Math.sin(t * Math.PI); // peaks at noon
    } else {
      // Moon: map 20-6 (next day) to 0-PI
      const nightH = h >= 20 ? h - 20 : h + 4;
      const t = nightH / 10;
      angle = t * Math.PI;
      elevation = Math.sin(t * Math.PI) * 0.4; // moon lower
    }

    // Shadow direction is opposite the light source
    const dx = -Math.cos(angle);
    const dy = -0.5; // slight downward bias (isometric feel)
    const shadowLength = elevation > 0.05 ? Math.min(6, 1.0 / elevation) : 6;

    return { dx: Math.round(dx), dy: Math.round(dy), elevation, shadowLength, isDay };
  }
}

// ============================================================================
// InventorySystem — Item storage with slot limits
// ============================================================================

export class InventorySystem {
  constructor(maxSlots = 20) {
    this.maxSlots = maxSlots;
    this.items = [];
  }

  addItem(item) {
    if (this.isFull()) return false;
    this.items.push(item);
    return true;
  }

  removeItem(itemId) {
    const idx = this.items.findIndex(i => i.id === itemId);
    if (idx === -1) return false;
    this.items.splice(idx, 1);
    return true;
  }

  getItem(itemId) {
    return this.items.find(i => i.id === itemId) || null;
  }

  getItemsByType(type) {
    return this.items.filter(i => i.type === type);
  }

  isFull() {
    return this.items.length >= this.maxSlots;
  }

  sortByType() {
    const typeOrder = {
      weapon: 0, armor: 1, shield: 2, helmet: 3,
      ring: 4, amulet: 5, potion: 6, scroll: 7,
      food: 8, tool: 9, gem: 10, reagent: 11,
      key: 12, quest: 13, gold: 14,
    };

    this.items.sort((a, b) => {
      const orderA = typeOrder[a.type] !== undefined ? typeOrder[a.type] : 99;
      const orderB = typeOrder[b.type] !== undefined ? typeOrder[b.type] : 99;
      if (orderA !== orderB) return orderA - orderB;
      return (a.name || '').localeCompare(b.name || '');
    });
  }

  getWeight() {
    let total = 0;
    for (const item of this.items) {
      total += item.weight !== undefined ? item.weight : 1;
    }
    return total;
  }
}

// ============================================================================
// EventSystem — Scheduled world events with flavor text
// ============================================================================

export class EventSystem {
  constructor(rng) {
    this._rng = rng;
    this.scheduledEvents = [];

    this._eventTypes = [
      'CARAVAN_ARRIVAL',
      'MONSTER_INCURSION',
      'HARVEST_FESTIVAL',
      'BANDIT_RAID',
      'PLAGUE_OUTBREAK',
      'MAGICAL_DARKNESS',
      'TREASURE_MAP_FOUND',
    ];

    this._eventDayRanges = {
      CARAVAN_ARRIVAL: [3, 5],
      MONSTER_INCURSION: [7, 10],
      HARVEST_FESTIVAL: [5, 8],
      BANDIT_RAID: [10, 15],
      PLAGUE_OUTBREAK: [15, 20],
      MAGICAL_DARKNESS: [12, 18],
      TREASURE_MAP_FOUND: [8, 12],
    };

    this._eventDescriptions = {
      CARAVAN_ARRIVAL: [
        'A salvage convoy arrives at the settlement, their cargo sleds loaded with recovered tech from the outer sectors. They set up shop in the trade hub, offering rare goods not normally available.',
        'Alarms chime at the airlock as a trade convoy arrives. Merchants from the eastern sectors have come, bringing fabricated weapons, composite cloth, and strange Founder artifacts.',
        'The hum of cargo sleds announces the arrival of the Far Drifters Trading Company. Their crates overflow with exotic salvage.',
        'A weathered convoy leader guides her sleds through the main gate. "Fresh goods!" she calls. "Weapons, med-kits, and Founder relics from beyond the collapsed levels!"',
        'Reports indicate a large trade convoy has arrived at the outer market. Word spreads quickly, and eager buyers crowd the newly opened stalls.',
      ],
      MONSTER_INCURSION: [
        'Klaxons blare across the settlement: creatures are pouring from the sealed sub-levels in unprecedented numbers. The guard is overwhelmed and calling for aid.',
        'The bulkheads shudder as something stirs beneath the lower quarter. Feral creatures pour through breached barriers, threatening the colonists and workers alike.',
        'Scouts return with grim news: a nest has erupted in the collapsed levels, and the surrounding passages teem with hostile creatures. Travel has become perilous.',
        'Shrieks echo through the corridors as swarms of creatures breach from below. The Colony Guard has sounded the alarm across all sectors.',
        'Toxic gas seeps from the deep passages, and with it come creatures that should have stayed sealed away. The breach must be contained.',
      ],
      HARVEST_FESTIVAL: [
        'The annual Harvest Cycle begins! Colorful banners line every corridor, traders slash their prices, and the smell of hydroponic produce and synth-bread fills the air.',
        'Today marks the Festival of the Founders, a celebration held once a generation. The colonists are in high spirits, and traders offer generous discounts.',
        'Music and laughter fill the trade hub as the Harvest Cycle gets underway. Vendors compete for customers with special festival pricing.',
        'The Luminary Festival has arrived! Lights shine in every viewport, children play in the commons, and shopkeepers offer holiday bargains.',
        'A traveling troupe of performers has arrived, transforming the hub into a spectacle of wonders. The festive mood has traders offering deals to attract the crowds.',
      ],
      BANDIT_RAID: [
        'Smoke rises from the eastern airlock. Raiders have ambushed a supply convoy, and now they threaten the settlement itself. The guard captain calls for volunteers.',
        'A breathless runner stumbles through the airlock: raiders have breached the outer quarter. Without immediate help, the settlers will be overrun.',
        'Under cover of a blackout cycle, raiders have seized the trade corridor, cutting off supply routes. Prices soar as supplies dwindle.',
        'The notorious Red Fang crew has been spotted near the perimeter. They hit a supply convoy at dawn and show no signs of pulling back.',
        'Raider scouts have been detected watching the settlement defenses. An attack seems imminent. The guard prepares for the worst.',
      ],
      PLAGUE_OUTBREAK: [
        'A foul sickness spreads through the settlement. The afflicted develop fever, chills, and dark welts. Med-techs are overwhelmed, and medicinal supplies are worth their weight in credits.',
        'Vermin have been seen in unusual numbers near the water reclaimers, and sickness has spread. Several colonists have fallen ill, and the med-techs work tirelessly.',
        'A device recovered from the outer sectors carried more than dust: a pathogen now spreads through the quarter. Quarantine barriers are raised to prevent further exposure.',
        'The water reclaimer has been contaminated. Those who drank from it have fallen gravely ill. Med-techs demand premium prices for purification treatments.',
        'Whispers of plague spread faster than the sickness itself. Traders hoard medical supplies, and prices for antidotes and curative compounds triple overnight.',
      ],
      MAGICAL_DARKNESS: [
        'The lights flicker and die as a wave of system failure sweeps the sector. Faint glimmers are all that remain. In the darkness, the Void creatures grow restless and bold.',
        'Engineers predicted the power grid failure, but none foresaw total blackout. As shadow blankets the habitat, hostile creatures emerge from the deep places, emboldened by the gloom.',
        'A cascade of failed systems ripples through the settlement. Temperatures drop. Heating vents gutter and die. And from the sealed sub-levels, the Void creatures begin to stir.',
        'The Great Blackout has begun. Old folk say the barrier between the inhabited sectors and the sealed depths weakens during such events. The warning klaxons sound.',
        'Darkness falls across every quarter. Only emergency lights remain. The Void creatures, empowered by the darkness, surge from their sealed depths with terrible purpose.',
      ],
      TREASURE_MAP_FOUND: [
        'While searching through an old storage locker, you discover a sealed data chip — a schematic! The faded markings indicate a cache of salvage hidden somewhere in the collapsed levels.',
        'A dying scavenger presses a battered data pad into your hands. "Find it," they gasp. "Before they do." The map reveals the location of a hidden Founder vault.',
        'You notice strange markings etched into a crumbling bulkhead. Following the pattern, you piece together directions from an ancient colony schematic.',
        'An old data core in the archives contains a hidden file — a schematic with coordinates pointing to a spot in the lower quarter. Fortune favors the bold.',
        'A fellow scavenger bets a schematic in a card game and loses. The data chip, now yours, traces a path to a forgotten vault deep in the sub-levels.',
      ],
    };
  }

  generateWorldEvents(worldData) {
    this.scheduledEvents = [];

    // Schedule 5-10 events across the first 30 days
    const eventCount = this._rng.nextInt(5, 10);
    const availableTypes = this._eventTypes.slice();
    const usedDays = new Set();

    for (let i = 0; i < eventCount; i++) {
      const typeIndex = this._rng.nextInt(0, availableTypes.length - 1);
      const type = availableTypes[typeIndex];

      // Allow event types to repeat if we run out
      if (availableTypes.length > 1 && i < this._eventTypes.length) {
        availableTypes.splice(typeIndex, 1);
      }

      const range = this._eventDayRanges[type] || [1, 30];
      let triggerDay;
      let attempts = 0;

      // Find a day that is not already taken
      do {
        triggerDay = this._rng.nextInt(range[0], range[1]);
        attempts++;
      } while (usedDays.has(triggerDay) && attempts < 20);

      usedDays.add(triggerDay);

      this.scheduledEvents.push({
        triggerDay,
        type,
        data: this._buildEventData(type, worldData),
        fired: false,
      });
    }

    // Sort by trigger day
    this.scheduledEvents.sort((a, b) => a.triggerDay - b.triggerDay);

    return this.scheduledEvents;
  }

  _buildEventData(type, worldData) {
    switch (type) {
      case 'CARAVAN_ARRIVAL':
        return {
          merchantName: this._rng.random([
            'Merchant Jorin', 'Caravan Leader Sela', 'Trader Vex',
            'The Far Wanderers Trading Company', 'Peddler Orli',
          ]),
          specialItems: true,
          duration: this._rng.nextInt(2, 4),
        };

      case 'MONSTER_INCURSION':
        return {
          monsterType: this._rng.random([
            'Dire Wolves', 'Swarm Beetles', 'Skeletal Knights', 'Cave Rats', 'Giant Spiders',
          ]),
          intensity: this._rng.random(['moderate', 'severe', 'critical']),
          region: worldData?.region || 'the surrounding wilds',
          duration: this._rng.nextInt(3, 6),
        };

      case 'HARVEST_FESTIVAL':
        return {
          festivalName: this._rng.random([
            'Harvest Festival', 'Festival of the Makers', 'Founding Day',
            'Luminary Festival', 'Reclamation Day',
          ]),
          priceModifier: 0.7 + this._rng.next() * 0.15,
          duration: this._rng.nextInt(2, 3),
        };

      case 'BANDIT_RAID':
        return {
          banditLeader: this._rng.random([
            'Red Fang', 'Blackthorn', 'Iron Mask', 'the Viper', 'Grimblade',
          ]),
          targetLocation: worldData?.settlement || 'the settlement',
          severity: this._rng.random(['minor', 'major', 'devastating']),
        };

      case 'PLAGUE_OUTBREAK':
        return {
          diseaseName: this._rng.random([
            'the Grey Rot', 'Blacklung Plague', 'the Wasting', 'Duct Fever',
            'the Shivering Sickness',
          ]),
          healingItemDemand: 3.0,
          duration: this._rng.nextInt(4, 8),
        };

      case 'MAGICAL_DARKNESS':
        return {
          duration: this._rng.nextInt(1, 3),
          undeadStrengthBonus: 1.5 + this._rng.next() * 0.5,
          darknessLevel: this._rng.random(['partial', 'total']),
        };

      case 'TREASURE_MAP_FOUND':
        return {
          location: this._rng.random([
            'the Abandoned Reactor', 'the Lower Quarter Vaults', 'beneath the Old Catwalks',
            'the Sealed Sub-Level', 'the Forgotten Archives',
          ]),
          treasureTier: this._rng.random(['minor', 'moderate', 'major']),
        };

      default:
        return {};
    }
  }

  checkEvents(currentDay) {
    const triggered = [];

    for (const event of this.scheduledEvents) {
      if (!event.fired && event.triggerDay <= currentDay) {
        event.fired = true;
        triggered.push(event);
      }
    }

    return triggered;
  }

  getEventDescription(event) {
    const templates = this._eventDescriptions[event.type];
    if (!templates || templates.length === 0) {
      return `An event of type ${event.type} has occurred.`;
    }
    let desc = this._rng.random(templates);

    // Enrich with world history context
    if (this._worldHistory && event.data) {
      desc = this._enrichEventDescription(desc, event);
    }

    return desc;
  }

  setWorldHistory(worldHistory) {
    this._worldHistory = worldHistory;
  }

  _enrichEventDescription(desc, event) {
    const wh = this._worldHistory;
    if (!wh) return desc;

    // Add historical context to the event description
    switch (event.type) {
      case 'HARVEST_FESTIVAL': {
        const civs = wh.civilizations.filter(c => c.isActive);
        if (civs.length > 0) {
          const civ = this._rng.random(civs);
          const tradition = civ.traditions.find(t => t.type === 'festival');
          if (tradition) {
            desc += ` The colonists also observe ${tradition.name} — ${tradition.description}`;
          }
        }
        break;
      }
      case 'MONSTER_INCURSION': {
        if (wh.catastrophes.length > 0) {
          const cat = this._rng.random(wh.catastrophes);
          desc += ` Elders mutter that this is reminiscent of ${cat.name} from Year ${cat.year}.`;
        }
        break;
      }
      case 'BANDIT_RAID': {
        if (wh.wars.length > 0) {
          const war = this._rng.random(wh.wars);
          desc += ` The raiders are said to be remnants of forces from ${war.name}.`;
        }
        break;
      }
      case 'PLAGUE_OUTBREAK': {
        const plagues = wh.catastrophes.filter(c => c.type === 'plague' || c.type === 'mutation_wave');
        if (plagues.length > 0) {
          const p = this._rng.random(plagues);
          desc += ` Historians recall ${p.name} — this may be a resurgence.`;
        }
        break;
      }
      case 'TREASURE_MAP_FOUND': {
        if (wh.artifacts.filter(a => a.isLost).length > 0) {
          const art = this._rng.random(wh.artifacts.filter(a => a.isLost));
          desc += ` Could this lead to the legendary ${art.name}? It ${art.power}...`;
        }
        break;
      }
    }

    return desc;
  }
}

// ============================================================================
// WeatherSystem — Biome-aware weather with visual and mechanical effects
// ============================================================================

export class WeatherSystem {
  constructor(rng) {
    this._rng = rng;
    this.current = 'clear';
    this.intensity = 0;      // 0-1
    this.duration = 0;       // turns remaining
    this._turnsSinceChange = 0;

    this._biomeWeather = {
      desert:       ['clear', 'clear', 'sandstorm'],
      tundra:       ['clear', 'snow', 'snow', 'storm'],
      swamp:        ['fog', 'rain', 'rain', 'cloudy', 'acid_rain'],
      forest:       ['clear', 'cloudy', 'rain', 'fog', 'spore_fall'],
      grassland:    ['clear', 'clear', 'cloudy', 'rain'],
      mountain:     ['clear', 'cloudy', 'snow', 'storm', 'ion_storm'],
      ocean:        ['clear', 'rain', 'storm'],
      lake:         ['clear', 'rain', 'storm', 'fog'],
      // Colony infrastructure biomes
      hull_breach:  ['clear', 'ion_storm', 'storm', 'ion_storm'],
      reactor_slag: ['ember_rain', 'ember_rain', 'clear', 'ember_rain'],
      frozen_deck:  ['snow', 'snow', 'coolant_mist', 'clear', 'coolant_mist'],
      // Environmental failure biomes
      hydro_jungle: ['rain', 'rain', 'spore_fall', 'fog', 'rain'],
      fungal_net:   ['spore_fall', 'spore_fall', 'fog', 'spore_fall'],
      toxic_sump:   ['acid_rain', 'acid_rain', 'fog', 'acid_rain'],
      // Anomaly/alien biomes
      alien_crash:  ['data_storm', 'ion_storm', 'clear', 'ion_storm'],
      crystal_zone: ['clear', 'ion_storm', 'coolant_mist', 'clear'],
      void_rift:    ['data_storm', 'data_storm', 'fog', 'data_storm'],
      // Corruption biomes
      glitch_zone:  ['data_storm', 'data_storm', 'data_storm', 'data_storm'],
      nano_plague:  ['nano_haze', 'nano_haze', 'fog', 'nano_haze'],
      assimilated:  ['blood_rain', 'spore_fall', 'fog', 'blood_rain'],
      // Temperature gradient biomes — cold
      tundra:          ['snow', 'snow', 'storm', 'clear', 'snow'],
      permafrost:      ['snow', 'coolant_mist', 'storm', 'snow', 'snow'],
      void_exposure:   ['clear', 'ion_storm', 'clear', 'clear'],
      structural_grid: ['clear', 'ion_storm', 'coolant_mist', 'clear'],
      // Temperature gradient biomes — hot
      desert:          ['clear', 'clear', 'sandstorm', 'clear', 'clear'],
      scorched_waste:  ['ember_rain', 'clear', 'sandstorm', 'clear'],
      magma_fields:    ['ember_rain', 'ember_rain', 'clear', 'ember_rain'],
      inferno_core:    ['ember_rain', 'ember_rain', 'ember_rain', 'clear'],
    };
  }

  update(biome = 'grassland') {
    this._turnsSinceChange++;
    if (this.duration > 0) {
      this.duration--;
      return;
    }

    // Change weather every 20-60 turns
    if (this._turnsSinceChange < 20) return;
    if (!this._rng.chance(0.05)) return;

    const pool = this._biomeWeather[biome] || this._biomeWeather.grassland;
    this.current = this._rng.random(pool);
    this.intensity = 0.3 + this._rng.next() * 0.7;
    this.duration = this._rng.nextInt(15, 50);
    this._turnsSinceChange = 0;
  }

  /**
   * Get FOV modifier: 1.0 = normal, < 1.0 = reduced visibility.
   */
  getFOVModifier() {
    switch (this.current) {
      case 'fog':          return 0.5;
      case 'storm':        return 0.6;
      case 'sandstorm':    return 0.4;
      case 'rain':         return 0.85;
      case 'snow':         return 0.75;
      case 'acid_rain':    return 0.8;
      case 'coolant_mist': return 0.45;
      case 'spore_fall':   return 0.7;
      case 'ember_rain':   return 0.75;
      case 'data_storm':   return 0.55;
      case 'nano_haze':    return 0.5;
      case 'ion_storm':    return 0.5;
      case 'blood_rain':   return 0.8;
      default:             return 1.0;
    }
  }

  /**
   * Get visual particles for weather rendering.
   * Returns array of { char, fg, density }.
   */
  getVisualEffect() {
    switch (this.current) {
      case 'rain':
        return { char: '|', fg: '#4466AA', density: this.intensity * 0.08 };
      case 'snow':
        return { char: '.', fg: '#CCCCCC', density: this.intensity * 0.05 };
      case 'storm':
        return { char: '/', fg: '#6688CC', density: this.intensity * 0.12 };
      case 'sandstorm':
        return { char: '.', fg: '#AA8844', density: this.intensity * 0.1 };
      case 'fog':
        return { char: '~', fg: '#666666', density: this.intensity * 0.03 };
      case 'acid_rain':
        return { char: '|', fg: '#88FF00', density: this.intensity * 0.08 };
      case 'coolant_mist':
        return { char: '.', fg: '#88DDFF', density: this.intensity * 0.04 };
      case 'spore_fall':
        return { char: '*', fg: '#CC88FF', density: this.intensity * 0.06 };
      case 'ember_rain':
        return { char: ',', fg: '#FF6622', density: this.intensity * 0.07 };
      case 'data_storm':
        return { char: '#', fg: '#FF0088', density: this.intensity * 0.1 };
      case 'nano_haze':
        return { char: '.', fg: '#AAAAAA', density: this.intensity * 0.05 };
      case 'ion_storm':
        return { char: '/', fg: '#FFFF44', density: this.intensity * 0.12 };
      case 'blood_rain':
        return { char: '|', fg: '#AA2244', density: this.intensity * 0.08 };
      default:
        return null;
    }
  }

  getDescription() {
    const descs = {
      clear: 'The sky is clear.',
      cloudy: 'Clouds gather overhead.',
      rain: 'Rain falls steadily.',
      storm: 'A fierce storm rages!',
      snow: 'Snow drifts down softly.',
      fog: 'A thick fog blankets the land.',
      sandstorm: 'Sand whips through the air!',
      acid_rain: 'Corrosive droplets hiss against the hull plating.',
      coolant_mist: 'Cryogenic coolant vents into the air, freezing everything.',
      spore_fall: 'Bioluminescent spores drift down like toxic snow.',
      ember_rain: 'Glowing embers rain from overloaded reactor vents.',
      data_storm: 'Holographic noise crackles through corrupted systems.',
      nano_haze: 'A grey haze of nanites hangs in the air, dissolving everything.',
      ion_storm: 'Electrical discharges arc between damaged power conduits!',
      blood_rain: 'Dark bio-matter drips from assimilated ceiling panels.',
    };
    return descs[this.current] || '';
  }
}

// ============================================================================
// LightingSystem — Ray-traced light propagation for dungeons and overworld
// ============================================================================

export class LightingSystem {
  constructor() {
    this._lightMap = null;
    this._width = 0;
    this._height = 0;
  }

  /**
   * Compute a light map from multiple light sources.
   * @param {Array} sources - [{x, y, radius, r, g, b, intensity}]
   * @param {Function} isOpaque - (x, y) => boolean, true if tile blocks light
   * @param {number} width - map width
   * @param {number} height - map height
   * @returns {Float32Array[]} - 2D array [y][x] of {brightness, r, g, b}
   */
  compute(sources, isOpaque, width, height) {
    this._width = width;
    this._height = height;

    // Allocate flat arrays for brightness and color channels
    const size = width * height;
    const bright = new Float32Array(size);
    const cr = new Float32Array(size);
    const cg = new Float32Array(size);
    const cb = new Float32Array(size);

    for (const src of sources) {
      this._castLight(src, isOpaque, width, height, bright, cr, cg, cb);
    }

    // Build result
    this._lightMap = { bright, cr, cg, cb, width, height };
    return this._lightMap;
  }

  /**
   * Get light value at a position.
   */
  getLight(x, y) {
    if (!this._lightMap) return { brightness: 0, r: 0, g: 0, b: 0 };
    const { bright, cr, cg, cb, width, height } = this._lightMap;
    if (x < 0 || x >= width || y < 0 || y >= height) return { brightness: 0, r: 0, g: 0, b: 0 };
    const idx = y * width + x;
    return {
      brightness: Math.min(1, bright[idx]),
      r: Math.min(255, cr[idx]),
      g: Math.min(255, cg[idx]),
      b: Math.min(255, cb[idx]),
    };
  }

  /**
   * Cast light from a single source using Bresenham rays.
   */
  _castLight(src, isOpaque, w, h, bright, cr, cg, cb) {
    const { x: sx, y: sy, radius, r, g, b, intensity } = src;
    const rad = Math.ceil(radius);

    // Cast rays to perimeter of a circle
    const perimeter = new Set();
    for (let dx = -rad; dx <= rad; dx++) {
      perimeter.add(`${sx + dx},${sy - rad}`);
      perimeter.add(`${sx + dx},${sy + rad}`);
    }
    for (let dy = -rad + 1; dy < rad; dy++) {
      perimeter.add(`${sx - rad},${sy + dy}`);
      perimeter.add(`${sx + rad},${sy + dy}`);
    }

    for (const key of perimeter) {
      const [tx, ty] = key.split(',').map(Number);
      const points = this._bresenham(sx, sy, tx, ty);

      for (const pt of points) {
        if (pt.x < 0 || pt.x >= w || pt.y < 0 || pt.y >= h) break;

        const dist = Math.sqrt((pt.x - sx) ** 2 + (pt.y - sy) ** 2);
        if (dist > radius) break;

        // Inverse-square-ish falloff
        const falloff = Math.max(0, 1 - (dist / radius));
        const lightVal = falloff * falloff * intensity;

        const idx = pt.y * w + pt.x;
        bright[idx] += lightVal;
        cr[idx] += r * lightVal;
        cg[idx] += g * lightVal;
        cb[idx] += b * lightVal;

        // Walls block light but are themselves illuminated
        if (pt.x !== sx || pt.y !== sy) {
          if (isOpaque(pt.x, pt.y)) break;
        }
      }
    }
  }

  _bresenham(x0, y0, x1, y1) {
    const points = [];
    let dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
    let sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;
    let x = x0, y = y0;

    while (true) {
      points.push({ x, y });
      if (x === x1 && y === y1) break;
      const e2 = 2 * err;
      if (e2 > -dy) { err -= dy; x += sx; }
      if (e2 < dx) { err += dx; y += sy; }
    }
    return points;
  }
}

// ============================================================================
// CloudSystem — Procedural drifting clouds with sun-responsive shadows
// ============================================================================

export class CloudSystem {
  constructor(seed) {
    this._noise = new PerlinNoise(new SeededRNG((seed + 7777) | 0));
    this._detailNoise = new PerlinNoise(new SeededRNG((seed + 8888) | 0));
    this.windX = 0;
    this.windY = 0;
    this.windSpeedX = 0.4;   // tiles/sec eastward drift
    this.windSpeedY = 0.1;   // tiles/sec slight southward drift
    this.coverage = 0.3;     // 0-1, driven by weather
  }

  // Coverage mapping from weather type
  static WEATHER_COVERAGE = {
    clear: 0.15, cloudy: 0.55, rain: 0.70, storm: 0.85,
    snow: 0.50, fog: 0.60, acid_rain: 0.70, ion_storm: 0.80,
    sandstorm: 0.40, coolant_mist: 0.45, spore_fall: 0.50,
    ember_rain: 0.35, data_storm: 0.65, nano_haze: 0.55,
    blood_rain: 0.65,
  };

  update(dt, weatherType) {
    this.windX += this.windSpeedX * dt;
    this.windY += this.windSpeedY * dt;
    this.coverage = CloudSystem.WEATHER_COVERAGE[weatherType] ?? 0.30;
  }

  /**
   * Get cloud density at a world position.
   * Returns 0 (clear sky) to 1 (thick cloud).
   */
  getCloudDensity(worldX, worldY) {
    const freq1 = 0.018;  // large billowy shapes
    const freq2 = 0.055;  // detail/edge breakup
    const wx = worldX + this.windX;
    const wy = worldY + this.windY;

    // Two-octave noise, weighted blend
    const n1 = this._noise.noise2D(wx * freq1, wy * freq1);       // -1..1
    const n2 = this._detailNoise.noise2D(wx * freq2, wy * freq2); // -1..1
    const raw = n1 * 0.7 + n2 * 0.3; // -1..1

    // Map to 0..1 and apply coverage threshold
    // Higher coverage → lower threshold → more cloud
    const threshold = 1.0 - this.coverage; // e.g. coverage 0.55 → threshold 0.45
    const mapped = (raw + 1) * 0.5;        // 0..1
    if (mapped < threshold) return 0;

    // Smooth density ramp above threshold
    const density = (mapped - threshold) / (1.0 - threshold);
    return Math.min(1, density);
  }
}
