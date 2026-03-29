// data/creatures-core.js — Core biome creature tables from js/entities.js

export const CREATURES_CORE = {
  // BIODOME — Overgrown agricultural sectors with rogue agri-bots and mutated crop organisms
  forest: [
    { name: 'Patrol Drone', char: 'd', color: '#AAAAAA', behavior: 'patrol', hp: 12, attack: 4, defense: 2, xpBase: 15, faction: 'MALFUNCTIONING' },
    { name: 'Creeping Vine-Maw', char: 'V', color: '#44AA44', behavior: 'ambush', hp: 10, attack: 5, defense: 1, xpBase: 18, ability: 'toxinSpray', faction: 'MUTANT' },
    { name: 'Overgrown Harvester', char: 'H', color: '#226622', behavior: 'patrol', hp: 30, attack: 6, defense: 5, xpBase: 40, ability: 'sporeCloud', faction: 'MALFUNCTIONING' },
    { name: 'Scavenger', char: 'S', color: '#AA8844', behavior: 'aggressive', hp: 15, attack: 5, defense: 3, xpBase: 20, faction: 'MUTANT' },
    { name: 'Feral Livestock', char: 'b', color: '#886644', behavior: 'coward', hp: 14, attack: 4, defense: 3, xpBase: 12, faction: 'MUTANT' },
    { name: 'Bioluminescent Moth', char: 'f', color: '#44FF44', behavior: 'coward', hp: 6, attack: 2, defense: 1, xpBase: 8, faction: 'MUTANT' },
    { name: 'Soil Centipede', char: '~', color: '#886644', behavior: 'ambush', hp: 16, attack: 6, defense: 2, xpBase: 22, ability: 'toxinSpray', faction: 'MUTANT' },
    { name: 'Irrigation Turret', char: 'T', color: '#6688AA', behavior: 'patrol', hp: 20, attack: 7, defense: 6, xpBase: 30, ability: 'chainLightning', faction: 'MALFUNCTIONING' },
    { name: 'Crop Mimic', char: '?', color: '#66AA44', behavior: 'ambush', hp: 14, attack: 8, defense: 1, xpBase: 25, faction: 'MUTANT' },
  ],
  // MAINTENANCE TUNNELS — Service corridors with malfunctioning industrial machines
  underground: [
    { name: 'Tunnel Sensor', char: 'o', color: '#886688', behavior: 'aggressive', hp: 8, attack: 3, defense: 1, xpBase: 10, faction: 'MALFUNCTIONING' },
    { name: 'Coolant Gel', char: 's', color: '#44AAAA', behavior: 'patrol', hp: 20, attack: 2, defense: 4, xpBase: 15, ability: 'corrosiveSpit', faction: 'MUTANT' },
    { name: 'Loader Mech', char: 'L', color: '#668866', behavior: 'aggressive', hp: 35, attack: 8, defense: 4, xpBase: 50, ability: 'selfRepair', faction: 'MALFUNCTIONING' },
    { name: 'Duct Rat', char: 'r', color: '#AA6644', behavior: 'coward', hp: 8, attack: 3, defense: 2, xpBase: 8, faction: 'MUTANT' },
    { name: 'Mining Automaton', char: 'M', color: '#888888', behavior: 'patrol', hp: 40, attack: 6, defense: 8, xpBase: 45, faction: 'MALFUNCTIONING' },
    { name: 'Pipe Worm', char: 'w', color: '#997755', behavior: 'ambush', hp: 18, attack: 5, defense: 3, xpBase: 20, ability: 'corrosiveSpit', faction: 'MUTANT' },
    { name: 'Echo Bat', char: 'e', color: '#AA88CC', behavior: 'coward', hp: 7, attack: 3, defense: 0, xpBase: 10, ability: 'echoScream', faction: 'MUTANT' },
    { name: 'Cable Strangler', char: 'C', color: '#556677', behavior: 'ambush', hp: 22, attack: 7, defense: 2, xpBase: 28, ability: 'gravCrush', faction: 'MALFUNCTIONING' },
  ],
  // QUARANTINE ZONE — Sealed sectors overrun by nano-fungal assimilation
  haunted: [
    { name: 'Assimilated Drone', char: 'd', color: '#CC4444', behavior: 'aggressive', hp: 12, attack: 4, defense: 2, xpBase: 15, faction: 'ASSIMILATED' },
    { name: 'Nano-Wraith', char: 'W', color: '#8888FF', behavior: 'aggressive', hp: 18, attack: 7, defense: 1, xpBase: 35, ability: 'assimilate', faction: 'ASSIMILATED' },
    { name: 'Shambling Host', char: 'z', color: '#668866', behavior: 'patrol', hp: 20, attack: 3, defense: 3, xpBase: 12, faction: 'ASSIMILATED' },
    { name: 'Hivemind Nexus', char: 'N', color: '#AA00FF', behavior: 'aggressive', hp: 50, attack: 12, defense: 5, xpBase: 100, ability: 'thermalOverload', isBoss: true, faction: 'ASSIMILATED' },
    { name: 'Phase Stalker', char: 'p', color: '#AAAAFF', behavior: 'ambush', hp: 10, attack: 5, defense: 0, xpBase: 20, ability: 'phaseShift', faction: 'ALIEN' },
    { name: 'Memory Phantom', char: 'm', color: '#9988BB', behavior: 'aggressive', hp: 14, attack: 6, defense: 1, xpBase: 22, ability: 'memoryLeech', faction: 'ASSIMILATED' },
    { name: 'Grief Echo', char: 'e', color: '#7766AA', behavior: 'coward', hp: 9, attack: 4, defense: 0, xpBase: 15, ability: 'echoScream', faction: 'ASSIMILATED' },
  ],
  // WASTE PROCESSING — Recycling sectors with toxic mutations and broken reclamation bots
  swamp: [
    { name: 'Toxic Reclaimer', char: 'R', color: '#448844', behavior: 'ambush', hp: 22, attack: 6, defense: 3, xpBase: 30, ability: 'signalJam', faction: 'MALFUNCTIONING' },
    { name: 'Sludge Crawler', char: 'C', color: '#446644', behavior: 'ambush', hp: 25, attack: 5, defense: 5, xpBase: 25, faction: 'MUTANT' },
    { name: 'Mutant Amphibian', char: 't', color: '#66AA44', behavior: 'coward', hp: 8, attack: 2, defense: 2, xpBase: 8, ability: 'toxinSpray', faction: 'MUTANT' },
    { name: 'Vent Gas Wisp', char: '*', color: '#88FFFF', behavior: 'coward', hp: 5, attack: 3, defense: 0, xpBase: 12, faction: 'MUTANT' },
    { name: 'Acid Jellyfish', char: 'J', color: '#44CCAA', behavior: 'patrol', hp: 15, attack: 5, defense: 1, xpBase: 18, ability: 'corrosiveSpit', faction: 'MUTANT' },
    { name: 'Sewer Centipede', char: '~', color: '#557744', behavior: 'ambush', hp: 20, attack: 6, defense: 4, xpBase: 25, ability: 'toxinSpray', faction: 'MUTANT' },
    { name: 'Waste Amalgam', char: 'A', color: '#668855', behavior: 'aggressive', hp: 28, attack: 7, defense: 5, xpBase: 35, ability: 'symbioticBurst', faction: 'MUTANT' },
  ],
  // EXTERIOR HULL — Exposed outer surface where alien organisms board the colony
  badlands: [
    { name: 'Hull Scorpion', char: 'S', color: '#AA8844', behavior: 'aggressive', hp: 16, attack: 6, defense: 4, xpBase: 22, ability: 'toxinSpray', faction: 'ALIEN' },
    { name: 'Void Sentinel', char: 'V', color: '#AAAA88', behavior: 'patrol', hp: 28, attack: 5, defense: 6, xpBase: 35, ability: 'signalJam', faction: 'ASSIMILATED' },
    { name: 'Hull Borer', char: 'B', color: '#CCAA66', behavior: 'ambush', hp: 40, attack: 10, defense: 3, xpBase: 55, faction: 'ALIEN' },
    { name: 'Radiation Shade', char: 'h', color: '#CCAA88', behavior: 'patrol', hp: 12, attack: 4, defense: 1, xpBase: 15, faction: 'ALIEN' },
    { name: 'Rogue Hull Repair Drone', char: 'r', color: '#BB9966', behavior: 'aggressive', hp: 18, attack: 7, defense: 3, xpBase: 25, faction: 'MALFUNCTIONING' },
    { name: 'Gravity Leech', char: 'g', color: '#8877AA', behavior: 'ambush', hp: 12, attack: 5, defense: 2, xpBase: 20, ability: 'gravCrush', faction: 'ALIEN' },
    { name: 'Stellar Jellyfish', char: 'J', color: '#AABBDD', behavior: 'patrol', hp: 20, attack: 6, defense: 1, xpBase: 28, ability: 'entropyField', faction: 'ALIEN' },
  ],
  // REACTOR/INDUSTRIAL — Power generation and heavy industry sectors
  mountain: [
    { name: 'Feral Welder Bot', char: 'w', color: '#CCAA66', behavior: 'aggressive', hp: 18, attack: 6, defense: 3, xpBase: 25, faction: 'MALFUNCTIONING' },
    { name: 'Conduit Parasite', char: 'c', color: '#AA88CC', behavior: 'aggressive', hp: 14, attack: 5, defense: 2, xpBase: 20, ability: 'empPulse', faction: 'ALIEN' },
    { name: 'Reactor Guardian', char: 'G', color: '#FF8844', behavior: 'patrol', hp: 50, attack: 10, defense: 8, xpBase: 60, ability: 'overcharge', isBoss: true, faction: 'MALFUNCTIONING' },
    { name: 'Thermal Creeper', char: 'T', color: '#FF4444', behavior: 'aggressive', hp: 30, attack: 8, defense: 4, xpBase: 45, ability: 'naniteInjection', faction: 'ASSIMILATED' },
    { name: 'Watcher Node', char: '@', color: '#88AACC', behavior: 'patrol', hp: 16, attack: 4, defense: 5, xpBase: 22, ability: 'chainLightning', faction: 'MALFUNCTIONING' },
    { name: 'Plasma Jellyfish', char: 'J', color: '#FFAA44', behavior: 'aggressive', hp: 15, attack: 9, defense: 0, xpBase: 28, ability: 'thermalOverload', faction: 'MUTANT' },
    { name: 'Forge Amalgam', char: 'A', color: '#CC8844', behavior: 'aggressive', hp: 35, attack: 9, defense: 6, xpBase: 50, ability: 'mirrorShield', faction: 'MALFUNCTIONING' },
  ],
  // ABANDONED SECTORS — Derelict colony modules with mixed threats
  ruins: [
    { name: 'Glitched Colonist', char: 'g', color: '#55AA55', behavior: 'coward', hp: 10, attack: 3, defense: 2, xpBase: 10, faction: 'ASSIMILATED' },
    { name: 'Derelict Sentry', char: 's', color: '#CCCCCC', behavior: 'aggressive', hp: 12, attack: 4, defense: 2, xpBase: 15, faction: 'MALFUNCTIONING' },
    { name: 'Duct Rat', char: 'r', color: '#886644', behavior: 'coward', hp: 5, attack: 2, defense: 1, xpBase: 5, faction: 'MUTANT' },
    { name: 'Spore Spider', char: 'a', color: '#448844', behavior: 'ambush', hp: 10, attack: 5, defense: 1, xpBase: 18, ability: 'toxinSpray', faction: 'MUTANT' },
    { name: 'Scrap Raider', char: 'z', color: '#668866', behavior: 'patrol', hp: 20, attack: 3, defense: 3, xpBase: 12 },
    { name: 'Raider Captain', char: 'B', color: '#AA8844', behavior: 'aggressive', hp: 15, attack: 5, defense: 3, xpBase: 20 },
    { name: 'Mimic Cache', char: '!', color: '#FFDD44', behavior: 'ambush', hp: 22, attack: 6, defense: 4, xpBase: 35, faction: 'ALIEN' },
    { name: 'Corridor Creeper', char: 'c', color: '#776655', behavior: 'ambush', hp: 12, attack: 5, defense: 2, xpBase: 15, faction: 'MUTANT' },
    { name: 'Broken Watcher', char: '@', color: '#999999', behavior: 'patrol', hp: 10, attack: 3, defense: 3, xpBase: 12, ability: 'signalJam', faction: 'MALFUNCTIONING' },
    { name: 'Loot Mimic', char: '$', color: '#FFCC44', behavior: 'ambush', hp: 18, attack: 8, defense: 3, xpBase: 30, faction: 'ALIEN' },
  ],
  // COLONY COMMONS — Open habitation areas with low-level strays
  grassland: [
    { name: 'Stray Service Bot', char: 'd', color: '#AAAAAA', behavior: 'patrol', hp: 8, attack: 3, defense: 2, xpBase: 8, faction: 'MALFUNCTIONING' },
    { name: 'Rogue Multiped Repair Drone', char: 'r', color: '#AA8866', behavior: 'patrol', hp: 8, attack: 3, defense: 2, xpBase: 8, faction: 'MALFUNCTIONING' },
    { name: 'Rogue Courier Drone', char: 'q', color: '#8888CC', behavior: 'aggressive', hp: 10, attack: 4, defense: 1, xpBase: 12, faction: 'MALFUNCTIONING' },
    { name: 'Scavenger', char: 'S', color: '#AA8844', behavior: 'aggressive', hp: 14, attack: 4, defense: 3, xpBase: 15 },
    { name: 'Rogue Repair Drone Pack', char: 'r', color: '#AA7755', behavior: 'aggressive', hp: 12, attack: 5, defense: 3, xpBase: 14, faction: 'MALFUNCTIONING' },
    { name: 'Sparking Junction', char: 'j', color: '#AABB44', behavior: 'patrol', hp: 12, attack: 4, defense: 4, xpBase: 15, ability: 'chainLightning', faction: 'MALFUNCTIONING' },
    { name: 'Lost Child Echo', char: 'e', color: '#8888CC', behavior: 'coward', hp: 5, attack: 1, defense: 0, xpBase: 8, ability: 'memoryLeech', faction: 'ASSIMILATED' },
  ],
};
