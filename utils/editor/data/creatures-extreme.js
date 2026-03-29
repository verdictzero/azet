// data/creatures-extreme.js — Extreme biome creature tables from js/entities.js

export const CREATURES_EXTREME = {
  // NANO-PLAGUE ZONE — Grey goo dissolving everything
  nano_plague: [
    { name: 'Nanite Swarm', char: 's', color: '#999999', behavior: 'aggressive', hp: 8, attack: 5, defense: 0, xpBase: 12, faction: 'ASSIMILATED' },
    { name: 'Dissolving Hulk', char: 'H', color: '#777777', behavior: 'patrol', hp: 35, attack: 7, defense: 6, xpBase: 35, faction: 'ASSIMILATED' },
    { name: 'Assembler Node', char: 'A', color: '#AAAAAA', behavior: 'coward', hp: 18, attack: 3, defense: 4, xpBase: 20, ability: 'selfRepair', faction: 'ASSIMILATED' },
    { name: 'Grey Tide', char: 'T', color: '#BBBBBB', behavior: 'aggressive', hp: 70, attack: 12, defense: 8, xpBase: 120, ability: 'naniteInjection', isBoss: true, faction: 'ASSIMILATED' },
    { name: 'Grey Centipede', char: '~', color: '#888888', behavior: 'ambush', hp: 20, attack: 6, defense: 4, xpBase: 22, ability: 'naniteInjection', faction: 'ASSIMILATED' },
    { name: 'Disassembler Eye', char: '@', color: '#999999', behavior: 'patrol', hp: 22, attack: 5, defense: 5, xpBase: 25, ability: 'entropyField', faction: 'ASSIMILATED' },
    { name: 'Nano Repair Drone', char: 'r', color: '#AAAAAA', behavior: 'aggressive', hp: 16, attack: 8, defense: 2, xpBase: 22, faction: 'ASSIMILATED' },
  ],

  // ASSIMILATION FRONT — Alien biomass consuming colony structure
  assimilated: [
    { name: 'Assimilated Marine', char: 'M', color: '#AA0044', behavior: 'aggressive', hp: 22, attack: 8, defense: 5, xpBase: 30, faction: 'ASSIMILATED' },
    { name: 'Flesh Wall', char: 'W', color: '#880033', behavior: 'ambush', hp: 40, attack: 6, defense: 10, xpBase: 35, faction: 'ASSIMILATED' },
    { name: 'Hive Coordinator', char: 'C', color: '#CC2255', behavior: 'patrol', hp: 25, attack: 5, defense: 4, xpBase: 28, ability: 'signalJam', faction: 'ASSIMILATED' },
    { name: 'Assimilation Engine', char: 'E', color: '#FF0044', behavior: 'aggressive', hp: 80, attack: 14, defense: 7, xpBase: 130, ability: 'assimilate', isBoss: true, faction: 'ASSIMILATED' },
    { name: 'Bone Amalgam', char: 'A', color: '#CC1144', behavior: 'aggressive', hp: 35, attack: 10, defense: 6, xpBase: 42, ability: 'symbioticBurst', faction: 'ASSIMILATED' },
    { name: 'Neural Watcher', char: '@', color: '#DD2255', behavior: 'patrol', hp: 28, attack: 6, defense: 7, xpBase: 35, ability: 'psionicLash', faction: 'ASSIMILATED' },
    { name: 'Assimilated Repair Drone', char: 'r', color: '#BB1144', behavior: 'aggressive', hp: 20, attack: 9, defense: 4, xpBase: 30, ability: 'assimilate', faction: 'ASSIMILATED' },
  ],

  // TUNDRA — Frozen grassland near hull breaches, creeping cold
  tundra: [
    { name: 'Frost Stalker', char: 'F', color: '#88CCEE', behavior: 'ambush', hp: 18, attack: 7, defense: 3, xpBase: 22, faction: 'MUTANT' },
    { name: 'Blizzard Drone', char: 'd', color: '#99BBDD', behavior: 'patrol', hp: 14, attack: 5, defense: 4, xpBase: 18, faction: 'MALFUNCTIONING' },
    { name: 'Frozen Shambler', char: 'z', color: '#77AABB', behavior: 'patrol', hp: 20, attack: 4, defense: 6, xpBase: 15, faction: 'ASSIMILATED' },
    { name: 'Ice Mite', char: 'm', color: '#AADDFF', behavior: 'coward', hp: 6, attack: 3, defense: 1, xpBase: 8, faction: 'MUTANT' },
    { name: 'Tundra Repair Drone', char: 'r', color: '#88AACC', behavior: 'aggressive', hp: 16, attack: 8, defense: 2, xpBase: 20, faction: 'MALFUNCTIONING' },
    { name: 'Permafrost Sentinel', char: 'S', color: '#6699BB', behavior: 'patrol', hp: 28, attack: 6, defense: 8, xpBase: 30, faction: 'MALFUNCTIONING' },
    { name: 'Frost Monarch', char: 'K', color: '#AAEEFF', behavior: 'aggressive', hp: 65, attack: 12, defense: 8, xpBase: 100, ability: 'empPulse', isBoss: true, faction: 'ALIEN' },
  ],

  // PERMAFROST — Deep frozen, cryogenics cascade failure
  permafrost: [
    { name: 'Cryo Beetle', char: 'b', color: '#66AADD', behavior: 'patrol', hp: 20, attack: 6, defense: 8, xpBase: 25, faction: 'MUTANT' },
    { name: 'Glacial Worm', char: '~', color: '#88CCEE', behavior: 'ambush', hp: 24, attack: 8, defense: 4, xpBase: 30, faction: 'MUTANT' },
    { name: 'Frozen Core', char: 'C', color: '#AADDFF', behavior: 'patrol', hp: 30, attack: 5, defense: 10, xpBase: 32, ability: 'empPulse', faction: 'MALFUNCTIONING' },
    { name: 'Ice Phantom', char: 'p', color: '#99CCEE', behavior: 'ambush', hp: 14, attack: 9, defense: 1, xpBase: 28, ability: 'phaseShift', faction: 'ALIEN' },
    { name: 'Absolute Zero', char: 'Z', color: '#BBDDFF', behavior: 'aggressive', hp: 70, attack: 13, defense: 9, xpBase: 110, ability: 'timeFracture', isBoss: true, faction: 'ALIEN' },
  ],

  // VOID EXPOSURE — Near hull breach edge, can see stars
  void_exposure: [
    { name: 'Void Drifter', char: 'V', color: '#4466AA', behavior: 'patrol', hp: 20, attack: 6, defense: 4, xpBase: 25, ability: 'voidDrain', faction: 'ALIEN' },
    { name: 'Star Phantom', char: 'P', color: '#6688CC', behavior: 'ambush', hp: 16, attack: 10, defense: 1, xpBase: 32, ability: 'phaseShift', faction: 'ALIEN' },
    { name: 'Vacuum Stalker', char: 's', color: '#5577AA', behavior: 'aggressive', hp: 22, attack: 8, defense: 5, xpBase: 28, faction: 'ALIEN' },
    { name: 'Null Sentinel', char: 'N', color: '#3355AA', behavior: 'patrol', hp: 30, attack: 7, defense: 9, xpBase: 35, ability: 'signalJam', faction: 'ALIEN' },
    { name: 'Event Horizon', char: 'O', color: '#2244AA', behavior: 'ambush', hp: 12, attack: 14, defense: 0, xpBase: 38, ability: 'gravCrush', faction: 'ALIEN' },
    { name: 'Void Sovereign', char: '$', color: '#7799EE', behavior: 'aggressive', hp: 85, attack: 15, defense: 8, xpBase: 150, ability: 'voidDrain', isBoss: true, faction: 'ALIEN' },
  ],

  // STRUCTURAL GRID — Exposed colony substructure
  structural_grid: [
    { name: 'Grid Crawler', char: 'c', color: '#556677', behavior: 'patrol', hp: 14, attack: 5, defense: 4, xpBase: 15, faction: 'MALFUNCTIONING' },
    { name: 'Conduit Worm', char: '~', color: '#667788', behavior: 'ambush', hp: 18, attack: 7, defense: 3, xpBase: 22, faction: 'MUTANT' },
    { name: 'Structural Sentinel', char: 'S', color: '#778899', behavior: 'patrol', hp: 25, attack: 6, defense: 8, xpBase: 28, ability: 'empPulse', faction: 'MALFUNCTIONING' },
    { name: 'Cable Strangler', char: 'C', color: '#5566AA', behavior: 'ambush', hp: 16, attack: 9, defense: 2, xpBase: 25, faction: 'MALFUNCTIONING' },
    { name: 'Foundation Golem', char: 'G', color: '#889999', behavior: 'patrol', hp: 45, attack: 8, defense: 12, xpBase: 45, faction: 'MALFUNCTIONING' },
  ],

  // DESERT — Arid heated terrain, synthetic dunes
  desert: [
    { name: 'Sand Crawler', char: 'c', color: '#CCAA44', behavior: 'ambush', hp: 16, attack: 6, defense: 3, xpBase: 18, faction: 'MUTANT' },
    { name: 'Heat Mirage', char: '?', color: '#FFCC66', behavior: 'coward', hp: 10, attack: 8, defense: 0, xpBase: 20, ability: 'phaseShift', faction: 'MUTANT' },
    { name: 'Dune Scorpion', char: 's', color: '#AA8833', behavior: 'aggressive', hp: 22, attack: 8, defense: 5, xpBase: 25, faction: 'MUTANT' },
    { name: 'Sun Bleached Sentinel', char: 'S', color: '#DDCC88', behavior: 'patrol', hp: 28, attack: 6, defense: 7, xpBase: 28, ability: 'thermalOverload', faction: 'MALFUNCTIONING' },
    { name: 'Desert Raider', char: 'R', color: '#BB9944', behavior: 'aggressive', hp: 18, attack: 7, defense: 3, xpBase: 22 },
    { name: 'Dust Devil', char: '@', color: '#DDBB66', behavior: 'patrol', hp: 12, attack: 5, defense: 2, xpBase: 15, ability: 'entropyField', faction: 'MUTANT' },
    { name: 'Sand Wurm King', char: 'W', color: '#EEDD88', behavior: 'aggressive', hp: 70, attack: 14, defense: 6, xpBase: 110, ability: 'gravCrush', isBoss: true, faction: 'MUTANT' },
  ],

  // SCORCHED WASTE — Super-heated, cracked earth
  scorched_waste: [
    { name: 'Cinder Repair Drone', char: 'r', color: '#DD6622', behavior: 'aggressive', hp: 20, attack: 8, defense: 3, xpBase: 25, faction: 'MALFUNCTIONING' },
    { name: 'Scorched Raider', char: 'R', color: '#CC5511', behavior: 'aggressive', hp: 24, attack: 9, defense: 4, xpBase: 30 },
    { name: 'Ember Swarm', char: 's', color: '#FF8844', behavior: 'patrol', hp: 10, attack: 6, defense: 0, xpBase: 18, faction: 'MUTANT' },
    { name: 'Heat Warden', char: 'W', color: '#EE7733', behavior: 'patrol', hp: 30, attack: 7, defense: 8, xpBase: 35, ability: 'thermalOverload', faction: 'MALFUNCTIONING' },
    { name: 'Ash Wraith', char: 'a', color: '#CC6644', behavior: 'ambush', hp: 16, attack: 10, defense: 1, xpBase: 28, ability: 'entropyField', faction: 'MUTANT' },
  ],

  // MAGMA FIELDS — Pools and streams of molten material
  magma_fields: [
    { name: 'Lava Serpent', char: 'S', color: '#FF4400', behavior: 'aggressive', hp: 28, attack: 10, defense: 4, xpBase: 35, faction: 'MUTANT' },
    { name: 'Magma Beetle', char: 'b', color: '#FF6622', behavior: 'patrol', hp: 24, attack: 7, defense: 10, xpBase: 30, faction: 'MUTANT' },
    { name: 'Cinder Wraith', char: 'w', color: '#FF8844', behavior: 'ambush', hp: 18, attack: 12, defense: 1, xpBase: 32, ability: 'thermalOverload', faction: 'MUTANT' },
    { name: 'Molten Sentinel', char: 'M', color: '#FF5522', behavior: 'patrol', hp: 35, attack: 8, defense: 9, xpBase: 38, ability: 'thermalOverload', faction: 'MALFUNCTIONING' },
    { name: 'Lava Jellyfish', char: 'J', color: '#FFAA22', behavior: 'patrol', hp: 16, attack: 8, defense: 2, xpBase: 25, ability: 'corrosiveSpit', faction: 'MUTANT' },
    { name: 'Magma Colossus', char: 'C', color: '#FF3300', behavior: 'aggressive', hp: 75, attack: 14, defense: 8, xpBase: 120, ability: 'thermalOverload', isBoss: true, faction: 'MUTANT' },
  ],

  // INFERNO CORE — Hellish reactor meltdown zone
  inferno_core: [
    { name: 'Hellfire Golem', char: 'G', color: '#FF2200', behavior: 'patrol', hp: 50, attack: 12, defense: 10, xpBase: 55, faction: 'MALFUNCTIONING' },
    { name: 'Inferno Wurm', char: 'W', color: '#FF4400', behavior: 'aggressive', hp: 40, attack: 14, defense: 5, xpBase: 50, ability: 'thermalOverload', faction: 'MUTANT' },
    { name: 'Flame Phantom', char: 'p', color: '#FF6600', behavior: 'ambush', hp: 20, attack: 15, defense: 1, xpBase: 40, ability: 'phaseShift', faction: 'MUTANT' },
    { name: 'Core Meltdown', char: 'M', color: '#FF0000', behavior: 'patrol', hp: 35, attack: 10, defense: 8, xpBase: 42, ability: 'chainLightning', faction: 'MALFUNCTIONING' },
    { name: 'Ember Centipede', char: '~', color: '#FF5500', behavior: 'ambush', hp: 28, attack: 11, defense: 4, xpBase: 38, faction: 'MUTANT' },
    { name: 'Ash Titan', char: 'T', color: '#FF1100', behavior: 'aggressive', hp: 90, attack: 16, defense: 9, xpBase: 160, ability: 'thermalOverload', isBoss: true, faction: 'MUTANT' },
  ],
};
