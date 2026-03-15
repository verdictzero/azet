// ============================================================================
// systems.js — Game systems for a retro ASCII roguelike
// ============================================================================

import { SeededRNG, distance } from './utils.js';
import { ItemGenerator } from './entities.js';

// ============================================================================
// CombatSystem — Handles attacks, damage, XP, loot, and initiative
// ============================================================================

export class CombatSystem {
  constructor() {
    this._hitMessages = [
      '{attacker} strikes {defender} for {damage} damage!',
      '{attacker} hits {defender} for {damage} damage!',
      '{attacker} slashes {defender} for {damage} damage!',
      '{attacker} smashes {defender} for {damage} damage!',
      '{attacker} wounds {defender} for {damage} damage!',
    ];

    this._critMessages = [
      '{attacker} lands a CRITICAL blow on {defender} for {damage} damage!',
      '{attacker} devastates {defender} with a critical strike for {damage} damage!',
      'CRITICAL HIT! {attacker} crushes {defender} for {damage} damage!',
      '{attacker} finds an opening and critically wounds {defender} for {damage} damage!',
    ];

    this._missMessages = [
      '{attacker} swings at {defender} but misses!',
      '{defender} dodges {attacker}\'s attack!',
      '{attacker}\'s attack goes wide of {defender}!',
      '{defender} nimbly avoids {attacker}\'s blow!',
      '{attacker} lunges at {defender} but strikes only air!',
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
        'Collect {ITEM} for {NPC}',
        'A Need for {ITEM}',
        '{NPC} Requires {ITEM}',
        'Foraging for {ITEM}',
        'Harvest the {ITEM}',
        '{ITEM} Shortage',
        'Supply Run: {ITEM}',
        'Stockpile {ITEM}',
        'Rare {ITEM} Needed',
        'The {ITEM} Hunt',
        'A Basketful of {ITEM}',
        '{NPC}\'s {ITEM} Request',
        'Procurement: {ITEM}',
        'Scavenging for {ITEM}',
      ],
      KILL: [
        'Slay the {MONSTER}',
        'Clear {LOCATION} of {MONSTER}',
        'Hunt the {MONSTER}',
        'Purge the {MONSTER} Threat',
        'Exterminate {MONSTER}',
        'The {MONSTER} Menace',
        '{MONSTER} Must Die',
        'End the {MONSTER} Scourge',
        'Vanquish the {MONSTER}',
        'The {LOCATION} {MONSTER} Problem',
        'Defend Against {MONSTER}',
        'No Quarter for {MONSTER}',
        'Cleanse {LOCATION}',
        '{MONSTER} Slayer Needed',
        'Drive Back the {MONSTER}',
      ],
      ESCORT: [
        'Escort {NPC} to {LOCATION}',
        'Guard {NPC} on the Road',
        'Safe Passage for {NPC}',
        '{NPC}\'s Journey to {LOCATION}',
        'Protect {NPC}',
        'The Road to {LOCATION}',
        'Bodyguard for {NPC}',
        'See {NPC} Safely Home',
        'Chaperone to {LOCATION}',
        'Guardian of {NPC}',
        'A Perilous Journey',
        '{NPC} Needs an Escort',
        'Travel Companion Wanted',
        'From Here to {LOCATION}',
        'The Dangerous Path',
      ],
      INVESTIGATE: [
        'The Mystery of {SUBJECT}',
        'Investigate {SUBJECT}',
        'Strange Happenings: {SUBJECT}',
        'Uncover the Truth of {SUBJECT}',
        'The {SUBJECT} Enigma',
        'Solve the {SUBJECT} Puzzle',
        'What Happened at {LOCATION}?',
        'The {SUBJECT} Conspiracy',
        'Secrets of {SUBJECT}',
        'The Curious Case of {SUBJECT}',
        'Look Into {SUBJECT}',
        'The {LOCATION} Mystery',
        'Whispers of {SUBJECT}',
        'Clues in {LOCATION}',
        'The {SUBJECT} Investigation',
      ],
      DELIVER: [
        'Deliver {ITEM} to {NPC}',
        'Urgent Delivery: {ITEM}',
        'A Package for {NPC}',
        'Courier: {ITEM} to {LOCATION}',
        'Rush Delivery for {NPC}',
        '{NPC} Awaits {ITEM}',
        'Special Delivery to {LOCATION}',
        'Transport the {ITEM}',
        'Bring {ITEM} to {NPC}',
        'Express Shipment: {ITEM}',
        'The {ITEM} Must Arrive',
        '{NPC}\'s Parcel',
        'Deliver Goods to {LOCATION}',
        'Carry {ITEM} Safely',
        'A Gift for {NPC}',
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
        'Outlaw: {CRIMINAL}',
        'The Price on {CRIMINAL}\'s Head',
        'Fugitive: {CRIMINAL}',
        'End {CRIMINAL}\'s Reign',
        'Manhunt: {CRIMINAL}',
      ],
    };

    // ---- Description templates per type ----
    this._descTemplates = {
      FETCH: [
        '{NPC} has asked you to gather {N} {ITEM} from the surrounding area. They are essential for the village\'s survival.',
        'The local supply of {ITEM} has run dangerously low. {NPC} needs {N} as soon as possible.',
        '"I cannot continue my work without {ITEM}," says {NPC}. "Please bring me {N} of them."',
        'A shortage of {ITEM} threatens the community. {NPC} is offering a reward for {N} delivered promptly.',
        '{NPC} is preparing for the coming season and requires {N} {ITEM}. Search the wilds carefully.',
        'The healers need {ITEM} urgently. {NPC} has posted a request for {N} to be collected.',
        'Rumor has it that {ITEM} can be found in the nearby wilderness. {NPC} needs {N} for their craft.',
        'War preparations demand resources. {NPC} has placed an order for {N} {ITEM}.',
        '{NPC} is experimenting with a new recipe that requires {N} {ITEM}. Help them gather the ingredients.',
        'The guild has put out a call for {N} {ITEM}. {NPC} will pay handsomely for your trouble.',
      ],
      KILL: [
        'A dangerous {MONSTER} has been terrorizing travelers near {LOCATION}. {NPC} is offering a reward for its elimination.',
        '{LOCATION} has become overrun with {MONSTER}. The townsfolk are desperate for someone to clear them out.',
        '"That accursed {MONSTER} killed my livestock," {NPC} growls. "I want it dead."',
        'Reports indicate a {MONSTER} nest near {LOCATION}. Clear it before the creatures multiply further.',
        'The guards are stretched thin. {NPC} needs a capable warrior to deal with the {MONSTER} threat at {LOCATION}.',
        'Merchants refuse to travel through {LOCATION} due to {MONSTER} attacks. {NPC} wants the route secured.',
        'A particularly vicious {MONSTER} has made {LOCATION} its hunting ground. End the threat permanently.',
        '{NPC} has received complaints about {MONSTER} sightings. Investigate {LOCATION} and eliminate any threats.',
        'The {MONSTER} grows bolder each day, venturing closer to town. {NPC} offers gold for proof of the kill.',
        'Children dare not play near {LOCATION} since the {MONSTER} appeared. {NPC} implores you to help.',
      ],
      ESCORT: [
        '{NPC} must travel to {LOCATION} but fears the dangers of the road. Serve as their protector.',
        'Bandits have been ambushing travelers on the road to {LOCATION}. {NPC} needs a bodyguard.',
        '"I carry precious cargo that must reach {LOCATION} intact," says {NPC}. "Will you guard me?"',
        '{NPC} has important business at {LOCATION} and cannot afford to be waylaid by monsters.',
        'The path to {LOCATION} is treacherous. {NPC} is willing to pay well for safe escort.',
        'A diplomat named {NPC} must arrive at {LOCATION} unharmed. Your sword arm is needed.',
        '{NPC}, an elderly scholar, must reach {LOCATION} to deliver vital research. Protect them.',
        'The caravan to {LOCATION} departs soon. {NPC} seeks a capable guard for the journey.',
        '"My family waits for me in {LOCATION}," {NPC} says anxiously. "I just need someone to walk with me."',
        '{NPC} has been tasked with delivering tribute to {LOCATION}. Many would kill for such riches.',
      ],
      INVESTIGATE: [
        'Strange lights have been seen near {LOCATION}. {NPC} wants someone to investigate {SUBJECT}.',
        'People have been going missing, and {NPC} suspects it has something to do with {SUBJECT}.',
        '"Something is not right about {SUBJECT}," {NPC} whispers. "Look into it, but be discreet."',
        'Rumors of {SUBJECT} have spread through the taverns. {NPC} wants the truth uncovered.',
        '{NPC} has noticed disturbing patterns related to {SUBJECT}. Find out what is really going on.',
        'The elders speak of {SUBJECT} in hushed tones. {NPC} believes there is more to the story.',
        'Ancient texts reference {SUBJECT}, and {NPC} believes the answer lies somewhere in {LOCATION}.',
        'Livestock have been behaving strangely since {SUBJECT} began. {NPC} seeks answers.',
        '"I found this strange symbol related to {SUBJECT}," {NPC} says. "What does it mean?"',
        'The mystery of {SUBJECT} has baffled scholars for years. {NPC} thinks you can solve it.',
      ],
      DELIVER: [
        '{NPC} needs {ITEM} delivered to a contact in {LOCATION}. Time is of the essence.',
        'This {ITEM} must reach {LOCATION} before the end of the week. {NPC} is counting on you.',
        '"Handle the {ITEM} with care," {NPC} warns. "It is irreplaceable and must reach {LOCATION}."',
        'A critical shipment of {ITEM} needs to reach {NPC_DEST} in {LOCATION}. Deliver it safely.',
        '{NPC} has prepared the {ITEM} for transport. Take it to {LOCATION} without delay.',
        'The {ITEM} contains information vital to the war effort. {NPC} needs it delivered to {LOCATION}.',
        '"My colleague in {LOCATION} has been waiting for this {ITEM}," says {NPC}. "Please hurry."',
        'A rare {ITEM} has been acquired by {NPC}. It must be brought to {LOCATION} for safekeeping.',
        'Deliver this sealed {ITEM} to the contact in {LOCATION}. {NPC} says you must not open it.',
        'The apothecary in {LOCATION} needs this {ITEM} urgently. {NPC} is offering good coin for swift delivery.',
      ],
      BOUNTY: [
        '{CRIMINAL} has been spotted near {LOCATION}. {NPC} is offering a bounty for their capture.',
        'The notorious {CRIMINAL} has evaded justice for too long. {NPC} wants them brought in.',
        '"That villain {CRIMINAL} robbed my caravan," {NPC} seethes. "Bring me their head."',
        '{CRIMINAL} is wanted for crimes against the realm. {NPC} has posted a generous bounty.',
        'Track {CRIMINAL} to their hideout near {LOCATION} and bring them to justice.',
        'The outlaw {CRIMINAL} has a price on their head. {NPC} will pay double if taken alive.',
        '{CRIMINAL} has been terrorizing the countryside. {NPC} needs a skilled hunter to end the threat.',
        'Witnesses last saw {CRIMINAL} fleeing toward {LOCATION}. {NPC} wants them found.',
        'The crimes of {CRIMINAL} have gone unpunished. {NPC} seeks a bounty hunter worthy of the task.',
        '{NPC} mutters darkly about {CRIMINAL}. "Find them. Make them pay for what they did."',
      ],
    };

    // ---- Name pools for template substitution ----
    this._itemNames = [
      'Moonpetal Herbs', 'Iron Ore', 'Spider Silk', 'Wolf Pelts',
      'Glowshroom Caps', 'Dragon Scales', 'Enchanted Crystals',
      'Phoenix Feathers', 'Shadow Essence', 'Ancient Runes',
      'Healing Moss', 'Fire Opals', 'Starlight Dew', 'Bone Dust',
      'Thunder Stones', 'Void Shards', 'Mandrake Roots',
    ];

    this._monsterNames = [
      'Goblins', 'Skeleton Warriors', 'Giant Spiders', 'Cave Trolls',
      'Dire Wolves', 'Undead Knights', 'Shadow Wraiths', 'Basilisks',
      'Harpies', 'Ogres', 'Wyverns', 'Necromancers',
      'Kobolds', 'Banshees', 'Minotaurs', 'Gargoyles',
    ];

    this._locationNames = [
      'the Old Mine', 'Darkwood Forest', 'the Cursed Ruins',
      'Hollow Ridge', 'the Sunken Temple', 'Blackwater Swamp',
      'the Northern Pass', 'Ashen Caves', 'Thornvale',
      'the Forgotten Crypt', 'Misty Peaks', 'Iron Gorge',
      'Duskhollow', 'the Whispering Glade', 'Stormbreak Cliffs',
    ];

    this._subjectNames = [
      'the Disappearances', 'the Strange Lights', 'the Cursed Well',
      'the Whispering Walls', 'the Ancient Prophecy', 'the Missing Shipment',
      'the Poisoned River', 'the Sealed Door', 'the Ghost Sightings',
      'the Blood Moon', 'the Withering Fields', 'the Lost Expedition',
    ];

    this._criminalNames = [
      'Red Fang', 'the Shadow', 'Blackthorn', 'Iron Mask',
      'Scarface Morel', 'the Viper', 'One-Eye Grask',
      'Silvertongue', 'the Butcher', 'Darkwater Jack',
      'Nightclaw', 'the Wraith of Duskhollow', 'Mad Helga',
      'Grimblade', 'the Phantom Thief',
    ];

    this._npcNames = [
      'Elder Tobin', 'Mira the Healer', 'Blacksmith Havel',
      'Captain Rhea', 'Innkeeper Loris', 'Scholar Endrin',
      'Farmer Giles', 'Priestess Yara', 'Merchant Kael',
      'Ranger Theron', 'Alchemist Voss', 'Guard Sergeant Bram',
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
    const npcName = giverNPC?.name || rng.random(this._npcNames);
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

    // Build objectives
    const objectives = this._buildObjectives(type, { item, monster, location, subject, criminal, destNpc, n, npcName }, rng);

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
      'Word of your deeds spreads throughout the region.',
      'The grateful townsfolk offer you hospitality.',
      `${npcName} promises to remember this favor.`,
    ];
    const failureConsequences = [
      `${npcName} will be disappointed but understanding.`,
      'Your reputation may suffer slightly.',
      'The situation worsens without intervention.',
      'Others may question your reliability.',
      `${npcName} will seek another adventurer for the task.`,
    ];

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

  _buildObjectives(type, ctx, rng) {
    switch (type) {
      case 'FETCH':
        return [{
          type: 'collect',
          target: ctx.item,
          current: 0,
          required: ctx.n,
          description: `Collect ${ctx.n} ${ctx.item}`,
        }];

      case 'KILL': {
        const count = rng.nextInt(1, 5);
        return [{
          type: 'kill',
          target: ctx.monster,
          current: 0,
          required: count,
          description: count === 1
            ? `Slay the ${ctx.monster}`
            : `Defeat ${count} ${ctx.monster}`,
        }];
      }

      case 'ESCORT':
        return [
          {
            type: 'escort',
            target: ctx.npcName,
            current: 0,
            required: 1,
            description: `Escort ${ctx.npcName} to ${ctx.location}`,
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
          description: `Find ${cluesNeeded} clues about ${ctx.subject}`,
        }];
      }

      case 'DELIVER':
        return [{
          type: 'deliver',
          target: ctx.destNpc,
          current: 0,
          required: 1,
          description: `Deliver ${ctx.item} to ${ctx.destNpc}`,
        }];

      case 'BOUNTY':
        return [
          {
            type: 'find',
            target: ctx.criminal,
            current: 0,
            required: 1,
            description: `Track down ${ctx.criminal}`,
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
      blacksmith: ['weapon', 'armor', 'shield', 'helmet'],
      alchemist: ['potion', 'scroll', 'reagent', 'elixir'],
      general: ['weapon', 'armor', 'potion', 'scroll', 'tool', 'food', 'torch'],
      jeweler: ['ring', 'amulet', 'gem', 'enchanted_accessory'],
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
    this._initFaction('TOWN_GUARD', { name: 'Town Guard', color: '#5555FF' });
    this._initFaction('MERCHANTS_GUILD', { name: 'Merchants Guild', color: '#FFAA00' });
    this._initFaction('TEMPLE_ORDER', { name: 'Temple Order', color: '#FFFFFF' });
    this._initFaction('THIEVES_GUILD', { name: 'Thieves Guild', color: '#AA00AA' });
    this._initFaction('MONSTER_HORDE', { name: 'Monster Horde', color: '#FF0000' });
    this._initFaction('UNDEAD', { name: 'The Undead', color: '#555555' });
    this._initFaction('BANDITS', { name: 'Bandits', color: '#AA5500' });
    this._initFaction('NOBILITY', { name: 'Nobility', color: '#FFFF55' });

    // Default inter-faction relations
    this._setDefaultRelation('TOWN_GUARD', 'MERCHANTS_GUILD', 70);
    this._setDefaultRelation('TOWN_GUARD', 'TEMPLE_ORDER', 60);
    this._setDefaultRelation('TOWN_GUARD', 'NOBILITY', 65);
    this._setDefaultRelation('TOWN_GUARD', 'THIEVES_GUILD', -60);
    this._setDefaultRelation('TOWN_GUARD', 'BANDITS', -90);
    this._setDefaultRelation('TOWN_GUARD', 'MONSTER_HORDE', -100);
    this._setDefaultRelation('TOWN_GUARD', 'UNDEAD', -100);

    this._setDefaultRelation('MERCHANTS_GUILD', 'TEMPLE_ORDER', 40);
    this._setDefaultRelation('MERCHANTS_GUILD', 'NOBILITY', 50);
    this._setDefaultRelation('MERCHANTS_GUILD', 'THIEVES_GUILD', -40);
    this._setDefaultRelation('MERCHANTS_GUILD', 'BANDITS', -80);
    this._setDefaultRelation('MERCHANTS_GUILD', 'MONSTER_HORDE', -90);
    this._setDefaultRelation('MERCHANTS_GUILD', 'UNDEAD', -80);

    this._setDefaultRelation('TEMPLE_ORDER', 'NOBILITY', 30);
    this._setDefaultRelation('TEMPLE_ORDER', 'THIEVES_GUILD', -30);
    this._setDefaultRelation('TEMPLE_ORDER', 'BANDITS', -50);
    this._setDefaultRelation('TEMPLE_ORDER', 'MONSTER_HORDE', -70);
    this._setDefaultRelation('TEMPLE_ORDER', 'UNDEAD', -100);

    this._setDefaultRelation('NOBILITY', 'THIEVES_GUILD', -50);
    this._setDefaultRelation('NOBILITY', 'BANDITS', -70);
    this._setDefaultRelation('NOBILITY', 'MONSTER_HORDE', -80);
    this._setDefaultRelation('NOBILITY', 'UNDEAD', -90);

    this._setDefaultRelation('THIEVES_GUILD', 'BANDITS', 20);
    this._setDefaultRelation('THIEVES_GUILD', 'MONSTER_HORDE', -60);
    this._setDefaultRelation('THIEVES_GUILD', 'UNDEAD', -70);

    this._setDefaultRelation('BANDITS', 'MONSTER_HORDE', -50);
    this._setDefaultRelation('BANDITS', 'UNDEAD', -60);

    this._setDefaultRelation('MONSTER_HORDE', 'UNDEAD', -30);

    // Default player standings (neutral with most, hostile with monsters/undead)
    this._playerStanding.set('TOWN_GUARD', 10);
    this._playerStanding.set('MERCHANTS_GUILD', 0);
    this._playerStanding.set('TEMPLE_ORDER', 5);
    this._playerStanding.set('THIEVES_GUILD', 0);
    this._playerStanding.set('MONSTER_HORDE', -80);
    this._playerStanding.set('UNDEAD', -100);
    this._playerStanding.set('BANDITS', -40);
    this._playerStanding.set('NOBILITY', 0);
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
      'CARAVAN_ARRIVES',
      'MONSTER_OUTBREAK',
      'FESTIVAL',
      'BANDIT_RAID',
      'PLAGUE',
      'ECLIPSE',
      'TREASURE_MAP',
    ];

    this._eventDayRanges = {
      CARAVAN_ARRIVES: [3, 5],
      MONSTER_OUTBREAK: [7, 10],
      FESTIVAL: [5, 8],
      BANDIT_RAID: [10, 15],
      PLAGUE: [15, 20],
      ECLIPSE: [12, 18],
      TREASURE_MAP: [8, 12],
    };

    this._eventDescriptions = {
      CARAVAN_ARRIVES: [
        'A merchant caravan rolls into town, its wagons laden with exotic goods from distant lands. The traders set up their stalls in the market square, offering rare wares not normally available.',
        'Dust rises on the horizon as a long caravan approaches. Merchants from the eastern provinces have arrived, bringing spices, silks, and strange artifacts.',
        'The sound of jingling harnesses announces the arrival of the Golden Wheel Trading Company. Their wagons overflow with unusual items.',
        'A weathered caravan master guides her wagons through the gates. "Fresh stock!" she calls. "Weapons, potions, and curiosities from beyond the mountains!"',
        'Travelers report a large merchant caravan has camped outside the walls. Word spreads quickly, and eager shoppers crowd the newly erected stalls.',
      ],
      MONSTER_OUTBREAK: [
        'Reports flood in from the outskirts: creatures are emerging from the deep places in unprecedented numbers. Guards are overwhelmed and calling for aid.',
        'The earth trembles as something stirs beneath the nearby caves. Monsters pour forth like a plague, threatening farms and travelers alike.',
        'Scouts return with grim news: a monster nest has hatched, and the surrounding area teems with hostile creatures. Travel has become perilous.',
        'Howls echo through the night as packs of beasts emerge from the wilderness. The local militia has sounded the alarm across all settlements.',
        'An unnatural fog rolls in from the wilds, and with it come creatures that should dwell only in nightmares. The outbreak must be contained.',
      ],
      FESTIVAL: [
        'The annual Harvest Festival begins! Colorful banners hang from every building, merchants slash their prices, and the smell of roasted meat fills the air.',
        'Today marks the Festival of Stars, a celebration held once a generation. The townsfolk are in high spirits, and traders offer generous discounts.',
        'Music and laughter fill the streets as the Founder\'s Day celebration gets underway. Merchants compete for customers with special festival pricing.',
        'The Moon Festival has arrived! Lanterns glow in every window, children dance in the streets, and shopkeepers offer holiday bargains.',
        'A traveling circus has arrived, transforming the town square into a spectacle of wonders. The festive mood has merchants offering deals to attract the crowds.',
      ],
      BANDIT_RAID: [
        'Smoke rises from the eastern road. Bandits have ambushed a supply convoy, and now they threaten the settlement itself. The guard captain calls for volunteers.',
        'A breathless messenger stumbles through the gates: bandits have surrounded a nearby farmstead. Without immediate help, the settlers will be overrun.',
        'Under cover of darkness, bandits have seized the bridge, cutting off trade routes. Merchant prices soar as supplies dwindle.',
        'The notorious Red Fang gang has been spotted near the walls. They struck a merchant convoy at dawn and show no signs of moving on.',
        'Bandit scouts have been seen surveying the town defenses. An attack seems imminent. The militia prepares for the worst.',
      ],
      PLAGUE: [
        'A mysterious illness sweeps through the settlement. The afflicted develop a high fever and dark blemishes. Healers are overwhelmed, and healing supplies are worth their weight in gold.',
        'Rats have been seen in unusual numbers, and with them comes sickness. Several townsfolk have fallen ill, and the temple healers work tirelessly.',
        'A trader from the south brought more than goods: a virulent plague now spreads through the population. The gates are sealed to prevent it from reaching other towns.',
        'The water has gone bad. Those who drank from the well have fallen gravely ill. Herbalists pay premium prices for curative ingredients.',
        'Whispers of plague spread faster than the disease itself. Shopkeepers hoard healing supplies, and prices for potions and herbs triple overnight.',
      ],
      ECLIPSE: [
        'The sky darkens as the sun is slowly consumed by shadow. An unnatural twilight falls over the land. In the gloom, the undead grow restless and bold.',
        'Scholars predicted the eclipse, but none foresaw its effects. As darkness blankets the world, creatures of the night emerge hours early, emboldened by the endless dark.',
        'A black disc slides across the sun. The temperature drops. Animals cower. And from the crypts and barrows, the dead begin to stir.',
        'The Great Eclipse has begun. Old legends say the boundary between life and death weakens during such events. The temple bells ring in warning.',
        'Darkness falls at midday. Stars appear in the sky. The undead, empowered by the eclipse, surge from their lairs with terrible purpose.',
      ],
      TREASURE_MAP: [
        'While rummaging through an old chest, you discover a weathered parchment — a treasure map! The markings indicate a cache hidden somewhere in the nearby wilderness.',
        'A dying traveler presses a crumpled map into your hands. "Find it," they gasp. "Before they do." The map reveals the location of a hidden treasure.',
        'You notice strange markings scratched into the wall of the tavern. Following the pattern, you piece together a crude treasure map.',
        'An old book in the library contains a loose page — a hand-drawn map with an X marking a spot in the nearby ruins. Fortune favors the bold.',
        'A drunk adventurer bets a treasure map in a card game and loses. The map, now yours, depicts a path to a forgotten hoard deep in the wilds.',
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
      case 'CARAVAN_ARRIVES':
        return {
          merchantName: this._rng.random([
            'Traveling Merchant Jorin', 'Caravan Master Sela', 'Trader Vex',
            'The Golden Wheel Company', 'Wandering Peddler Orli',
          ]),
          specialItems: true,
          duration: this._rng.nextInt(2, 4),
        };

      case 'MONSTER_OUTBREAK':
        return {
          monsterType: this._rng.random([
            'Goblins', 'Giant Spiders', 'Skeletons', 'Kobolds', 'Dire Wolves',
          ]),
          intensity: this._rng.random(['moderate', 'severe', 'critical']),
          region: worldData?.region || 'the surrounding area',
          duration: this._rng.nextInt(3, 6),
        };

      case 'FESTIVAL':
        return {
          festivalName: this._rng.random([
            'Harvest Festival', 'Festival of Stars', 'Founder\'s Day',
            'Moon Festival', 'Day of the Sun',
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

      case 'PLAGUE':
        return {
          diseaseName: this._rng.random([
            'the Gray Rot', 'Blackvein Fever', 'the Wasting', 'Swamp Sickness',
            'the Crimson Shakes',
          ]),
          healingItemDemand: 3.0,
          duration: this._rng.nextInt(4, 8),
        };

      case 'ECLIPSE':
        return {
          duration: this._rng.nextInt(1, 3),
          undeadStrengthBonus: 1.5 + this._rng.next() * 0.5,
          darknessLevel: this._rng.random(['partial', 'total']),
        };

      case 'TREASURE_MAP':
        return {
          location: this._rng.random([
            'the Abandoned Mine', 'Hollow Ridge Cave', 'beneath the Old Oak',
            'the Sunken Temple', 'the Forgotten Crypt',
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
    return this._rng.random(templates);
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
      desert:    ['clear', 'clear', 'sandstorm'],
      tundra:    ['clear', 'snow', 'snow', 'storm'],
      swamp:     ['fog', 'rain', 'rain', 'cloudy'],
      forest:    ['clear', 'cloudy', 'rain', 'fog'],
      grassland: ['clear', 'clear', 'cloudy', 'rain'],
      mountain:  ['clear', 'cloudy', 'snow', 'storm'],
      ocean:     ['clear', 'rain', 'storm'],
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
      case 'fog':       return 0.5;
      case 'storm':     return 0.6;
      case 'sandstorm': return 0.4;
      case 'rain':      return 0.85;
      case 'snow':      return 0.75;
      default:          return 1.0;
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
    };
    return descs[this.current] || '';
  }
}
