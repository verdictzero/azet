// data/creatures-hazard.js — Hazard biome creature tables from js/entities.js

export const CREATURES_HAZARD = {
  // HULL BREACH — Exposed outer hull, vacuum-adjacent sectors
  hull_breach: [
    { name: 'Void Walker', char: 'W', color: '#6688AA', behavior: 'patrol', hp: 22, attack: 4, defense: 7, xpBase: 28, faction: 'ALIEN' },
    { name: 'Hull Breach Drone', char: 'd', color: '#8899AA', behavior: 'aggressive', hp: 16, attack: 6, defense: 3, xpBase: 20, faction: 'MALFUNCTIONING' },
    { name: 'Pressure Wraith', char: 'p', color: '#AABBCC', behavior: 'ambush', hp: 12, attack: 8, defense: 1, xpBase: 30, ability: 'phaseShift', faction: 'ALIEN' },
    { name: 'Vacuum Leech', char: 'l', color: '#445566', behavior: 'coward', hp: 8, attack: 2, defense: 2, xpBase: 10, faction: 'ALIEN' },
    { name: 'Vacuum Jellyfish', char: 'J', color: '#6688BB', behavior: 'patrol', hp: 18, attack: 6, defense: 2, xpBase: 25, ability: 'gravCrush', faction: 'ALIEN' },
    { name: 'Hull Centipede', char: '~', color: '#778899', behavior: 'ambush', hp: 25, attack: 7, defense: 5, xpBase: 32, faction: 'ALIEN' },
    { name: 'Breach Turret', char: 'T', color: '#8899AA', behavior: 'patrol', hp: 22, attack: 8, defense: 7, xpBase: 35, ability: 'chainLightning', faction: 'MALFUNCTIONING' },
  ],

  // REACTOR SLAG — Molten areas around failed reactors
  reactor_slag: [
    { name: 'Slag Golem', char: 'G', color: '#FF8844', behavior: 'patrol', hp: 55, attack: 8, defense: 10, xpBase: 60, faction: 'MALFUNCTIONING' },
    { name: 'Plasma Wisp', char: '*', color: '#FFAA22', behavior: 'aggressive', hp: 10, attack: 10, defense: 0, xpBase: 25, ability: 'thermalOverload', faction: 'MUTANT' },
    { name: 'Meltdown Core', char: 'M', color: '#FF4400', behavior: 'aggressive', hp: 70, attack: 14, defense: 6, xpBase: 120, ability: 'thermalOverload', isBoss: true, faction: 'MALFUNCTIONING' },
    { name: 'Char Crawler', char: 'c', color: '#CC6622', behavior: 'coward', hp: 8, attack: 4, defense: 2, xpBase: 10, faction: 'MUTANT' },
    { name: 'Molten Amalgam', char: 'A', color: '#FF6622', behavior: 'aggressive', hp: 40, attack: 10, defense: 7, xpBase: 55, ability: 'symbioticBurst', faction: 'MUTANT' },
    { name: 'Heat Shimmer', char: '~', color: '#FFCC88', behavior: 'coward', hp: 8, attack: 6, defense: 0, xpBase: 15, ability: 'entropyField', faction: 'MUTANT' },
  ],

  // FROZEN DECK — Cryogenics failure, frost-covered corridors
  frozen_deck: [
    { name: 'Frost Automaton', char: 'A', color: '#88BBDD', behavior: 'patrol', hp: 35, attack: 7, defense: 8, xpBase: 40, faction: 'MALFUNCTIONING' },
    { name: 'Cryo Specter', char: 'C', color: '#AADDFF', behavior: 'ambush', hp: 18, attack: 6, defense: 2, xpBase: 25, ability: 'empPulse', faction: 'ALIEN' },
    { name: 'Ice Borer', char: 'B', color: '#6699BB', behavior: 'aggressive', hp: 20, attack: 8, defense: 4, xpBase: 30, faction: 'MUTANT' },
    { name: 'Frozen Colonist', char: 'z', color: '#88AACC', behavior: 'coward', hp: 12, attack: 3, defense: 3, xpBase: 8, faction: 'ASSIMILATED' },
    { name: 'Cryo Repair Drone', char: 'r', color: '#88BBDD', behavior: 'aggressive', hp: 22, attack: 7, defense: 4, xpBase: 28, faction: 'MALFUNCTIONING' },
    { name: 'Temporal Frost', char: '?', color: '#AACCEE', behavior: 'ambush', hp: 14, attack: 5, defense: 3, xpBase: 22, ability: 'timeFracture', faction: 'ALIEN' },
    { name: 'Frozen Watcher', char: '@', color: '#99BBDD', behavior: 'patrol', hp: 20, attack: 4, defense: 8, xpBase: 25, ability: 'empPulse', faction: 'MALFUNCTIONING' },
  ],

  // RIVERBANK — Eroded coolant channels with amphibious threats
  shore: [
    { name: 'Shore Crawler', char: 'c', color: '#5588AA', behavior: 'ambush', hp: 14, attack: 5, defense: 3, xpBase: 18, faction: 'MUTANT' },
    { name: 'Rusted Fisher Bot', char: 'F', color: '#8899AA', behavior: 'patrol', hp: 20, attack: 6, defense: 5, xpBase: 25, faction: 'MALFUNCTIONING' },
    { name: 'Mud Lurker', char: 'L', color: '#667755', behavior: 'ambush', hp: 16, attack: 7, defense: 2, xpBase: 22, ability: 'toxinSpray', faction: 'MUTANT' },
    { name: 'Coolant Eel', char: 'e', color: '#44AACC', behavior: 'aggressive', hp: 10, attack: 6, defense: 1, xpBase: 15, faction: 'MUTANT' },
    { name: 'Drift Scavenger', char: 'S', color: '#779988', behavior: 'coward', hp: 12, attack: 4, defense: 3, xpBase: 12, faction: 'MUTANT' },
    { name: 'Bank Turret', char: 'T', color: '#6688AA', behavior: 'patrol', hp: 22, attack: 7, defense: 6, xpBase: 30, ability: 'chainLightning', faction: 'MALFUNCTIONING' },
    { name: 'Bilge Amalgam', char: 'A', color: '#558877', behavior: 'aggressive', hp: 30, attack: 8, defense: 5, xpBase: 38, ability: 'corrosiveSpit', faction: 'MUTANT' },
  ],

  // COOLANT RIVER — Flooded corridors with aquatic mutations
  river: [
    { name: 'Current Jellyfish', char: 'J', color: '#4488DD', behavior: 'patrol', hp: 12, attack: 5, defense: 1, xpBase: 15, ability: 'chainLightning', faction: 'MUTANT' },
    { name: 'Pipe Leviathan', char: 'P', color: '#336699', behavior: 'aggressive', hp: 45, attack: 10, defense: 6, xpBase: 60, ability: 'gravCrush', isBoss: true, faction: 'MUTANT' },
    { name: 'Flooded Sentry', char: 's', color: '#5577AA', behavior: 'aggressive', hp: 18, attack: 6, defense: 4, xpBase: 22, faction: 'MALFUNCTIONING' },
    { name: 'Depth Worm', char: 'w', color: '#335577', behavior: 'ambush', hp: 16, attack: 7, defense: 2, xpBase: 20, ability: 'corrosiveSpit', faction: 'MUTANT' },
    { name: 'Aquatic Drone', char: 'd', color: '#6699BB', behavior: 'patrol', hp: 14, attack: 5, defense: 3, xpBase: 16, faction: 'MALFUNCTIONING' },
    { name: 'Brine Spider', char: 'a', color: '#447788', behavior: 'ambush', hp: 10, attack: 6, defense: 1, xpBase: 14, ability: 'toxinSpray', faction: 'MUTANT' },
  ],

  // HYDROPONIC JUNGLE — Agri-domes gone wild with rampant growth
  hydro_jungle: [
    { name: 'Apex Vine-Maw', char: 'V', color: '#00FF66', behavior: 'aggressive', hp: 28, attack: 10, defense: 3, xpBase: 40, ability: 'toxinSpray', faction: 'MUTANT' },
    { name: 'Pollinator Swarm', char: 's', color: '#FFDD00', behavior: 'patrol', hp: 14, attack: 5, defense: 1, xpBase: 18, ability: 'toxinSpray', faction: 'MUTANT' },
    { name: 'Root Titan', char: 'R', color: '#228844', behavior: 'aggressive', hp: 65, attack: 12, defense: 8, xpBase: 100, ability: 'selfRepair', isBoss: true, faction: 'MUTANT' },
    { name: 'Bioluminescent Stalker', char: 'b', color: '#44FF88', behavior: 'ambush', hp: 16, attack: 7, defense: 2, xpBase: 22, faction: 'MUTANT' },
    { name: 'Canopy Jellyfish', char: 'J', color: '#66DDAA', behavior: 'patrol', hp: 12, attack: 4, defense: 1, xpBase: 15, ability: 'toxinSpray', faction: 'MUTANT' },
    { name: 'Symbiotic Cluster', char: '&', color: '#44CC66', behavior: 'aggressive', hp: 24, attack: 8, defense: 3, xpBase: 30, ability: 'symbioticBurst', faction: 'MUTANT' },
  ],

  // TOXIC SUMP — Waste processing overflow, acid pools
  toxic_sump: [
    { name: 'Acid Slime', char: 's', color: '#44FF00', behavior: 'patrol', hp: 25, attack: 6, defense: 5, xpBase: 25, ability: 'corrosiveSpit', faction: 'MUTANT' },
    { name: 'Waste Processor', char: 'W', color: '#668844', behavior: 'aggressive', hp: 30, attack: 7, defense: 6, xpBase: 35, faction: 'MALFUNCTIONING' },
    { name: 'Sludge Titan', char: 'T', color: '#33AA00', behavior: 'aggressive', hp: 55, attack: 11, defense: 8, xpBase: 80, ability: 'corrosiveSpit', isBoss: true, faction: 'MUTANT' },
    { name: 'Dissolving Rat', char: 'r', color: '#88AA44', behavior: 'coward', hp: 6, attack: 3, defense: 1, xpBase: 8, ability: 'toxinSpray', faction: 'MUTANT' },
    { name: 'Acid Centipede', char: '~', color: '#55CC22', behavior: 'ambush', hp: 22, attack: 7, defense: 4, xpBase: 28, ability: 'corrosiveSpit', faction: 'MUTANT' },
    { name: 'Toxic Amalgam', char: 'A', color: '#44AA22', behavior: 'aggressive', hp: 38, attack: 9, defense: 7, xpBase: 45, ability: 'entropyField', faction: 'MUTANT' },
  ],

  // ALIEN CRASH SITE — Embedded xeno-vessel wreckage with xenotech
  alien_crash: [
    { name: 'Alien Sentinel', char: 'S', color: '#FF44FF', behavior: 'patrol', hp: 30, attack: 8, defense: 6, xpBase: 40, ability: 'signalJam', faction: 'ALIEN' },
    { name: 'Xenomorph Scout', char: 'x', color: '#DD22DD', behavior: 'aggressive', hp: 18, attack: 10, defense: 3, xpBase: 35, faction: 'ALIEN' },
    { name: 'Artifact Guardian', char: 'G', color: '#FF88FF', behavior: 'aggressive', hp: 75, attack: 14, defense: 8, xpBase: 130, ability: 'empPulse', isBoss: true, faction: 'ALIEN' },
    { name: 'Beacon Drone', char: 'b', color: '#CC66CC', behavior: 'coward', hp: 10, attack: 3, defense: 2, xpBase: 12, ability: 'signalJam', faction: 'ALIEN' },
    { name: 'Xeno Repair Drone', char: 'r', color: '#DD44DD', behavior: 'aggressive', hp: 24, attack: 9, defense: 4, xpBase: 35, ability: 'voidDrain', faction: 'ALIEN' },
    { name: 'Beacon Eye', char: '@', color: '#EE66EE', behavior: 'patrol', hp: 20, attack: 6, defense: 5, xpBase: 28, ability: 'psionicLash', faction: 'ALIEN' },
    { name: 'Temporal Sentry', char: 'T', color: '#CC88DD', behavior: 'patrol', hp: 28, attack: 7, defense: 8, xpBase: 40, ability: 'timeFracture', faction: 'ALIEN' },
  ],

  // CRYSTALLINE GROWTH — Alien mineral formations, refractive
  crystal_zone: [
    { name: 'Crystal Golem', char: 'G', color: '#44FFFF', behavior: 'patrol', hp: 40, attack: 6, defense: 12, xpBase: 45, faction: 'ALIEN' },
    { name: 'Resonance Phantom', char: 'R', color: '#22DDDD', behavior: 'ambush', hp: 15, attack: 9, defense: 2, xpBase: 30, ability: 'empPulse', faction: 'ALIEN' },
    { name: 'Shard Swarm', char: 's', color: '#66FFFF', behavior: 'aggressive', hp: 8, attack: 12, defense: 0, xpBase: 20, faction: 'ALIEN' },
    { name: 'Prism Core', char: 'P', color: '#88FFFF', behavior: 'aggressive', hp: 60, attack: 10, defense: 10, xpBase: 100, ability: 'overcharge', isBoss: true, faction: 'ALIEN' },
    { name: 'Crystal Repair Drone', char: 'r', color: '#55EEFF', behavior: 'aggressive', hp: 20, attack: 8, defense: 6, xpBase: 28, faction: 'ALIEN' },
    { name: 'Resonance Eye', char: '@', color: '#44DDEE', behavior: 'patrol', hp: 16, attack: 7, defense: 4, xpBase: 25, ability: 'echoScream', faction: 'ALIEN' },
    { name: 'Lattice Amalgam', char: 'A', color: '#66EEFF', behavior: 'aggressive', hp: 35, attack: 8, defense: 10, xpBase: 42, ability: 'mirrorShield', faction: 'ALIEN' },
  ],

  // VOID RIFT — Tears in reality, dimensional anomalies
  void_rift: [
    { name: 'Phase Horror', char: 'H', color: '#8844CC', behavior: 'aggressive', hp: 25, attack: 11, defense: 2, xpBase: 40, ability: 'phaseShift', faction: 'ALIEN' },
    { name: 'Void Tendril', char: 'v', color: '#6622AA', behavior: 'ambush', hp: 18, attack: 8, defense: 3, xpBase: 28, faction: 'ALIEN' },
    { name: 'Reality Fragment', char: '?', color: '#AA66FF', behavior: 'patrol', hp: 20, attack: 7, defense: 5, xpBase: 25, faction: 'ALIEN' },
    { name: 'Dimensional Anchor', char: 'D', color: '#CC88FF', behavior: 'aggressive', hp: 80, attack: 15, defense: 7, xpBase: 140, ability: 'phaseShift', isBoss: true, faction: 'ALIEN' },
    { name: 'Time Loop Entity', char: '8', color: '#BB66EE', behavior: 'aggressive', hp: 22, attack: 9, defense: 3, xpBase: 35, ability: 'timeFracture', faction: 'ALIEN' },
    { name: 'Gravity Maw', char: 'O', color: '#9944CC', behavior: 'ambush', hp: 30, attack: 10, defense: 4, xpBase: 40, ability: 'gravCrush', faction: 'ALIEN' },
    { name: 'Void Jellyfish', char: 'J', color: '#AA55DD', behavior: 'patrol', hp: 16, attack: 7, defense: 1, xpBase: 25, ability: 'voidDrain', faction: 'ALIEN' },
  ],

  // DATA CORRUPTION — Ship systems haywire, glitched reality
  glitch_zone: [
    { name: 'Glitch Phantom', char: 'g', color: '#FF0088', behavior: 'aggressive', hp: 16, attack: 9, defense: 1, xpBase: 28, ability: 'phaseShift', faction: 'ASSIMILATED' },
    { name: 'Corrupted Process', char: 'p', color: '#DD0066', behavior: 'patrol', hp: 20, attack: 6, defense: 4, xpBase: 22, faction: 'ASSIMILATED' },
    { name: 'Null Entity', char: 'n', color: '#FF44AA', behavior: 'ambush', hp: 14, attack: 8, defense: 2, xpBase: 25, ability: 'empPulse', faction: 'ASSIMILATED' },
    { name: 'Stack Overflow', char: 'O', color: '#FF66CC', behavior: 'aggressive', hp: 65, attack: 13, defense: 5, xpBase: 110, ability: 'overcharge', isBoss: true, faction: 'ASSIMILATED' },
    { name: 'Recursive Entity', char: 'R', color: '#EE4499', behavior: 'aggressive', hp: 18, attack: 8, defense: 3, xpBase: 28, ability: 'mirrorShield', faction: 'ASSIMILATED' },
    { name: 'Memory Overflow', char: 'm', color: '#DD3388', behavior: 'ambush', hp: 20, attack: 7, defense: 2, xpBase: 25, ability: 'memoryLeech', faction: 'ASSIMILATED' },
    { name: 'Pixel Storm', char: '#', color: '#FF55BB', behavior: 'aggressive', hp: 12, attack: 11, defense: 0, xpBase: 22, ability: 'chainLightning', faction: 'ASSIMILATED' },
  ],
};
