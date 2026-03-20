// ═══════════════════════════════════════════
//  MONSTER ASCII ART LIBRARY
//  Earthbound-style large monster sprites
// ═══════════════════════════════════════════

// ── Tier 1: Unique Boss Art ──

const BOSS_ART = {
  'Hivemind Nexus': [
    '     ╔══════════╗     ',
    '   ╔╝░░▒▒▓▓▒▒░░╚╗   ',
    '  ║░░┌──●──┐░░░░║   ',
    '  ║▒░│◆◇◆◇◆│░▒▒░║   ',
    ' ║▓▒░└──●──┘░▒▓░░║  ',
    ' ║░▒▓░░║██║░░▓▒░░║  ',
    '  ║░▒▓░╠══╣░▓▒░░║   ',
    ' ╔╝▒░▓╔╝  ╚╗▓░▒╚╗  ',
    ' ║░░▒▓║ ●● ║▓▒░░║  ',
    '  ╚╗░▒╚╗  ╔╝▒░╔╝   ',
    '    ╚══╧════╧══╝     ',
  ],
  'Reactor Guardian': [
    '      ╔═══╗          ',
    '    ╔═╣⚡⚡╠═╗        ',
    '   ║▓▓║███║▓▓║       ',
    '  ╔╝▒▒╠═══╣▒▒╚╗     ',
    '  ║█▓▒║●●●║▒▓█║     ',
    '  ║█▓▒╠═══╣▒▓█║     ',
    '  ║▓▒░║▓▓▓║░▒▓║     ',
    '  ╚╗▒░╠═══╣░▒╔╝     ',
    '   ║░░║░▒░║░░║      ',
    '   ╚═╧╝   ╚╧═╝      ',
  ],
  'Meltdown Core': [
    '      ●●●●●          ',
    '    ▓▓░░█░░▓▓        ',
    '   ▓░░▒▓▓▒░░▓       ',
    '  ░░▒▓████▓▒░░      ',
    '  ░▒▓██⚡⚡██▓▒░     ',
    '  ░▒▓██⚡⚡██▓▒░     ',
    '  ░░▒▓████▓▒░░      ',
    '   ▓░░▒▓▓▒░░▓       ',
    '    ▓▓░░█░░▓▓        ',
    '      ●●●●●          ',
  ],
  'Root Titan': [
    '    ╱╲   ╱╲╱╲        ',
    '   ╱╱╲╲╱╱  ╲╲       ',
    '  ╱╱▓▓╲╱▓▓▓▓╲╲      ',
    ' ╱▓▓██▓▓████▓▓╲     ',
    ' │▓██●████●██▓│     ',
    ' │▓████████████▓│    ',
    ' │▓██╲════╱██▓│     ',
    '  ╲▓███████▓╱       ',
    '  │║│  ██  │║│      ',
    '  │║│  ██  │║│      ',
    ' ╱╱╲╲ ╱╲╲ ╱╱╲╲     ',
  ],
  'Fungal Colossus': [
    '   ○ ○○  ○○ ○        ',
    '  ░░▒▒▓▓▓▓▒▒░░      ',
    ' ░▒▒▓▓████▓▓▒▒░     ',
    ' ▒▓▓██●██●██▓▓▒     ',
    ' ▒▓████████████▓▒    ',
    ' ▒▓██▓╲══╱▓██▓▒     ',
    '  ▓██▓▓▓▓▓▓██▓      ',
    '   ▓████████▓        ',
    '   ░║░░██░░║░        ',
    '   ░║░░██░░║░        ',
    '  ░░╱╲░╱╲░╱╲░░      ',
  ],
  'Sludge Titan': [
    '  ░░▒▒▓▓▓▓▒▒░░      ',
    ' ░▒▒▓▓████▓▓▒▒░     ',
    ' ▒▓▓██●██●██▓▓▒     ',
    ' ▒▓████████████▓▒    ',
    ' ▒▓██▓▓▓▓▓▓██▓▒     ',
    '  ▓██████████▓       ',
    '  ▒▓████████▓▒      ',
    '  ░▒▓██████▓▒░      ',
    ' ░░▒▒▓▓▓▓▒▒░░░░     ',
    '░░░▒▒░░░░▒▒░░░░░    ',
  ],
  'Artifact Guardian': [
    '      ╔═✦═╗          ',
    '    ╔═╣◆◆◆╠═╗       ',
    '   ║▓█║●●●║█▓║      ',
    '  ╔╝▓█╠═══╣█▓╚╗     ',
    '  ║██▓║◇◆◇║▓██║     ',
    '  ║██▓╠═══╣▓██║     ',
    '  ╚╗▓█║▓▓▓║█▓╔╝     ',
    '   ║▓█╠═══╣█▓║      ',
    '   ║░░║   ║░░║      ',
    '   ╚╧═╝   ╚═╧╝      ',
  ],
  'Prism Core': [
    '        ▲            ',
    '       ╱◆╲           ',
    '      ╱◇◆◇╲          ',
    '     ╱◆◇●◇◆╲         ',
    '    ╱◇◆◇◆◇◆◇╲        ',
    '   ╱◆◇◆◇◆◇◆◇◆╲       ',
    '    ╲◇◆◇◆◇◆◇╱        ',
    '     ╲◆◇●◇◆╱         ',
    '      ╲◇◆◇╱          ',
    '       ╲◆╱           ',
    '        ▼            ',
  ],
  'Dimensional Anchor': [
    '   ╔══╗    ╔══╗      ',
    '   ║▓▓╠════╣▓▓║      ',
    '   ║▓▓║░▒▓▒║▓▓║      ',
    '   ╠══╣●══●╠══╣      ',
    '   ║░▒▓████▓▒░║      ',
    '   ║░▒▓█⚡█▓▒░║      ',
    '   ╠══╣●══●╠══╣      ',
    '   ║▓▓║░▒▓▒║▓▓║      ',
    '   ║▓▓╠════╣▓▓║      ',
    '   ╚══╝    ╚══╝      ',
  ],
  'Stack Overflow': [
    '  ┌─┐┌─┐┌─┐┌─┐      ',
    '  │█││▓││▒││░│      ',
    '  ├─┤├─┤├─┤├─┤      ',
    '  │░▒▓████▓▒░│      ',
    '  │▒▓██●●██▓▒│      ',
    '  │▒▓██●●██▓▒│      ',
    '  │░▒▓████▓▒░│      ',
    '  ├─┤├─┤├─┤├─┤      ',
    '  │░││▒││▓││█│      ',
    '  └─┘└─┘└─┘└─┘      ',
  ],
  'Grey Tide': [
    ' ░░▒▒▓▓████▓▓▒▒░░   ',
    ' ░▒▒▓▓██████▓▓▒▒░   ',
    ' ▒▓▓████●●████▓▓▒   ',
    ' ▒▓████████████▓▒   ',
    ' ▓██████████████▓   ',
    ' ▒▓████████████▓▒   ',
    ' ▒▓▓████████▓▓▒▒░   ',
    ' ░▒▒▓▓██████▓▓▒░░   ',
    ' ░░▒▒▓▓████▓▓▒▒░░   ',
    '░░░░▒▒▒▒▒▒▒▒░░░░░   ',
  ],
  'Assimilation Engine': [
    '   ╔════════════╗    ',
    '   ║▓█▓░░░░▓█▓░║    ',
    '   ║█●█░▓▓░█●█░║    ',
    '   ║▓█▓░░░░▓█▓░║    ',
    '   ╠════╗╔════╣     ',
    '   ║░▒▓█║║█▓▒░║     ',
    '   ║░▒▓█║║█▓▒░║     ',
    '   ╠════╝╚════╣     ',
    '   ║▒░▒░▒░▒░▒░║     ',
    '   ╚═╧══╧══╧═╝      ',
  ],
  'Mimic Cache': [
    '  ╔══════════════╗   ',
    '  ║◆◇◆◇◆◇◆◇◆◇◆◇║   ',
    '  ╠══════════════╣   ',
    '  ║   ┌──────┐   ║   ',
    '  ║   │ ◆◆◆◆ │   ║   ',
    '  ║▲▲▲│ ◆◆◆◆ │▲▲▲║  ',
    '  ║   └──────┘   ║   ',
    '  ╠══════════════╣   ',
    '  ║◇◆◇◆◇◆◇◆◇◆◇◆║   ',
    '  ╚══════════════╝   ',
  ],
};

// ── Tier 2: Archetype Art Templates ──

const ARCHETYPE_ART = {
  drone: [
    '    ┌───┐    ',
    '   ╱│ ● │╲   ',
    '  ╱ └─┬─┘ ╲  ',
    ' ╱────┼────╲ ',
    ' ╲────┼────╱ ',
    '  ╲ ┌─┴─┐ ╱  ',
    '   ╲│░░░│╱   ',
    '    └───┘    ',
  ],
  mech: [
    '   ╔═════╗    ',
    '   ║●═══●║    ',
    '   ╠═════╣    ',
    '  ╔╣▓▓▓▓▓╠╗   ',
    '  ║║█████║║   ',
    '  ║╠═════╣║   ',
    '  ║║▒▒▒▒▒║║   ',
    '  ╚╣░░░░░╠╝   ',
    '   ║║   ║║    ',
    '   ╚╝   ╚╝    ',
  ],
  vine: [
    '  ╱╲  ╱╱╲╲   ',
    ' ╱╱╲╲╱╱  ╲╲  ',
    ' ║▓▓╲╱▓▓▓▓║  ',
    ' ║▓██▓████▓║  ',
    ' ║▓█●████●█║  ',
    ' ║▓██╲══╱██║  ',
    '  ╲▓███████╱  ',
    '   ╲╲║██║╱╱   ',
    '    ╲║██║╱    ',
  ],
  slime: [
    '    ░░░░░░    ',
    '  ░░▒▒▒▒▒▒░  ',
    ' ░▒▒▓▓▓▓▓▒▒░ ',
    ' ▒▓▓●▓▓●▓▓▒░ ',
    ' ▒▓▓▓▓▓▓▓▓▒░ ',
    ' ░▒▓▓▓▓▓▓▒░░ ',
    ' ░░▒▒▒▒▒▒░░░ ',
    '░░░░░░░░░░░░░',
  ],
  critter: [
    '   ╱╲ ╱╲     ',
    '  │● ▼ ●│    ',
    '  │  ▼  │    ',
    '  ╲╲═══╱╱    ',
    '   ╲▓▓▓╱     ',
    '  ╱╱▓▓▓╲╲    ',
    ' ╱╱ ╱╱╲╲ ╲╲  ',
  ],
  swarm: [
    '  ∙ · ∙  · ∙ ',
    ' · ╱╲·╱╲ · ∙ ',
    ' ∙╱●╲╱●╲∙  · ',
    '  ╲╱╲╱╲╱╲╱   ',
    ' ·╱●╲╱●╲· ∙  ',
    ' ∙╲╱·╲╱ ∙ ·  ',
    '  · ∙  · ∙   ',
    ' ∙  · ∙  ·   ',
  ],
  humanoid: [
    '     ╔═╗      ',
    '     ║●║      ',
    '    ╔╣═╠╗     ',
    '   ╱║▓▓▓║╲    ',
    '  ╱ ║███║ ╲   ',
    '    ║▒▒▒║     ',
    '    ╠═══╣     ',
    '    ║░ ░║     ',
    '    ╚╧ ╧╝     ',
  ],
  wraith: [
    '    ░░░░░     ',
    '   ░▒▒▒▒▒░   ',
    '  ░▒●▒▒●▒▒░  ',
    '  ░▒▒▒▒▒▒▒░  ',
    '   ░▒▓▓▓▒░   ',
    '  ░░▒▒▒▒▒░░  ',
    '  ░ ░▒▒▒░ ░  ',
    '     ░░░     ',
    '    ░ ░ ░    ',
  ],
  scorpion: [
    '        ╱╲   ',
    '  ╱╲   ╱▓╲   ',
    ' ╱●●╲ ╱▓▓╲   ',
    ' ╲══╱╱▓▓▓╱   ',
    '  ╲╱╱▓▓▓╱    ',
    '   ║█████║    ',
    '  ╱╱╲╱╲╱╲╲   ',
    ' ╱╱ ╱╱ ╲╲ ╲╲ ',
  ],
  sentinel: [
    '    ╔═══╗     ',
    '   ╔╣▓▓▓╠╗    ',
    '   ║║●═●║║    ',
    '   ║╠═══╣║    ',
    '  ╔╝║▓▓▓║╚╗   ',
    '  ║█║███║█║   ',
    '  ╚╗║▓▓▓║╔╝   ',
    '   ║╠═══╣║    ',
    '   ║║░░░║║    ',
    '   ╚╝   ╚╝    ',
  ],
  golem: [
    '   ╔═══════╗  ',
    '   ║▓●▓▓●▓║  ',
    '   ╠═══════╣  ',
    '  ╔╝▓█████╚╗  ',
    ' ╔╝▓███████╚╗ ',
    ' ║▓█████████║ ',
    ' ╚╗▓█████▓╔╝  ',
    '  ║▓█████▓║   ',
    '  ║░║   ║░║   ',
    '  ╚═╝   ╚═╝   ',
  ],
  wisp: [
    '      ∙       ',
    '    · ● ·     ',
    '   ∙ ░▒░ ∙   ',
    '  · ░▒▓▒░ ·  ',
    '   ∙ ░▒░ ∙   ',
    '    · ● ·     ',
    '      ∙       ',
  ],
  spider: [
    '  ╲╲    ╱╱   ',
    '   ╲╲  ╱╱    ',
    '  ╔═╗══╔═╗   ',
    '  ║●║▓▓║●║   ',
    '  ╚═╝══╚═╝   ',
    '  ╱╱▓▓▓▓╲╲   ',
    ' ╱╱  ▓▓  ╲╲  ',
    '╱╱   ╱╲   ╲╲ ',
  ],
  parasite: [
    '     ╱╲      ',
    '    ╱●●╲     ',
    '   ╱════╲    ',
    '  ═╲▓▓▓▓╱═   ',
    '    ║████║    ',
    '   ═╲▓▓▓╱═   ',
    '    ║▒▒▒▒║   ',
    '    ╲░░░░╱   ',
    '     ╲══╱    ',
  ],
  wall: [
    ' ▓█▓█▓█▓█▓█▓ ',
    ' █▓█●█▓█●█▓█ ',
    ' ▓████████▓█▓ ',
    ' █▓████████▓█ ',
    ' ▓█▓████▓█▓█▓ ',
    ' █▓█████▓█▓█ ',
    ' ▓█▓█▓█▓█▓█▓ ',
    ' █▓█▓█▓█▓█▓█ ',
  ],
  walker: [
    '     ╱══╲     ',
    '    ╱●══●╲    ',
    '    ╲═════╱   ',
    '   ╔╝▓▓▓▓╚╗  ',
    '  ╱║██████║╲  ',
    '  ╲║▓▓▓▓▓▓║╱  ',
    '   ║░║  ║░║   ',
    '   ╚═╝  ╚═╝   ',
  ],
};

// ── Archetype Mapping ──

const NAME_TO_ARCHETYPE = {
  // Drones / bots
  'Patrol Drone': 'drone', 'Stray Service Bot': 'drone', 'Rogue Courier Drone': 'drone',
  'Hull Breach Drone': 'drone', 'Beacon Drone': 'drone', 'Feral Welder Bot': 'drone',
  'Assimilated Drone': 'drone',
  // Mechs
  'Loader Mech': 'mech', 'Mining Automaton': 'mech', 'Frost Automaton': 'mech',
  'Overgrown Harvester': 'mech', 'Waste Processor': 'mech',
  // Vine / plant
  'Creeping Vine-Maw': 'vine', 'Apex Vine-Maw': 'vine', 'Mycelium Tendril': 'vine',
  'Void Tendril': 'vine',
  // Slime / gel
  'Coolant Gel': 'slime', 'Acid Slime': 'slime', 'Sludge Crawler': 'slime',
  'Dissolving Hulk': 'slime', 'Dissolving Rat': 'slime',
  // Critters
  'Duct Rat': 'critter', 'Feral Colony Cat': 'critter', 'Mutant Amphibian': 'critter',
  'Feral Livestock': 'critter', 'Char Crawler': 'critter',
  // Swarms / insects
  'Bioluminescent Moth': 'swarm', 'Pollinator Swarm': 'swarm', 'Shard Swarm': 'swarm',
  'Nanite Swarm': 'swarm', 'Puffball Mine': 'swarm',
  // Humanoids
  'Scavenger': 'humanoid', 'Scrap Raider': 'humanoid', 'Glitched Colonist': 'humanoid',
  'Frozen Colonist': 'humanoid', 'Shambling Host': 'humanoid', 'Raider Captain': 'humanoid',
  'Toxic Reclaimer': 'humanoid', 'Assimilated Marine': 'humanoid',
  // Wraiths / ghosts
  'Nano-Wraith': 'wraith', 'Cryo Specter': 'wraith', 'Phase Horror': 'wraith',
  'Glitch Phantom': 'wraith', 'Pressure Wraith': 'wraith', 'Radiation Shade': 'wraith',
  'Resonance Phantom': 'wraith', 'Phase Stalker': 'wraith', 'Null Entity': 'wraith',
  // Scorpion / borer
  'Hull Scorpion': 'scorpion', 'Hull Borer': 'scorpion', 'Ice Borer': 'scorpion',
  // Sentinels / guardians
  'Void Sentinel': 'sentinel', 'Alien Sentinel': 'sentinel', 'Derelict Sentry': 'sentinel',
  'Hive Coordinator': 'sentinel',
  // Golems / titans
  'Crystal Golem': 'golem', 'Slag Golem': 'golem', 'Thermal Creeper': 'golem',
  // Wisps / energy
  'Vent Gas Wisp': 'wisp', 'Plasma Wisp': 'wisp', 'Reality Fragment': 'wisp',
  // Spiders
  'Spore Spider': 'spider', 'Bioluminescent Stalker': 'spider',
  // Parasites / worms
  'Conduit Parasite': 'parasite', 'Vacuum Leech': 'parasite', 'Tunnel Sensor': 'parasite',
  // Walls / nodes
  'Flesh Wall': 'wall', 'Assembler Node': 'wall', 'Corrupted Process': 'wall',
  'Spore Carrier': 'wall',
  // Walkers / xenos
  'Void Walker': 'walker', 'Xenomorph Scout': 'walker',
};

/**
 * Get monster ASCII art for a creature.
 * @param {object} creature - creature with .name and .color
 * @returns {{ lines: string[], color: string }}
 */
export function getMonsterArt(creature) {
  const name = creature.name;
  const color = creature.color || '#FF4444';

  // Strip "Elite " prefix for lookup
  const baseName = name.startsWith('Elite ') ? name.slice(6) : name;

  // Tier 1: exact boss match
  if (BOSS_ART[baseName]) {
    return { lines: BOSS_ART[baseName], color };
  }

  // Tier 2: name-based archetype lookup
  if (NAME_TO_ARCHETYPE[baseName]) {
    return { lines: ARCHETYPE_ART[NAME_TO_ARCHETYPE[baseName]], color };
  }

  // Fallback: keyword-based guessing
  const lower = baseName.toLowerCase();
  if (lower.includes('drone') || lower.includes('bot')) return { lines: ARCHETYPE_ART.drone, color };
  if (lower.includes('mech') || lower.includes('automaton') || lower.includes('harvester')) return { lines: ARCHETYPE_ART.mech, color };
  if (lower.includes('vine') || lower.includes('tendril') || lower.includes('root')) return { lines: ARCHETYPE_ART.vine, color };
  if (lower.includes('slime') || lower.includes('gel') || lower.includes('sludge') || lower.includes('ooze')) return { lines: ARCHETYPE_ART.slime, color };
  if (lower.includes('rat') || lower.includes('cat') || lower.includes('amphibian') || lower.includes('livestock')) return { lines: ARCHETYPE_ART.critter, color };
  if (lower.includes('swarm') || lower.includes('moth') || lower.includes('pollinator')) return { lines: ARCHETYPE_ART.swarm, color };
  if (lower.includes('wraith') || lower.includes('specter') || lower.includes('phantom') || lower.includes('ghost') || lower.includes('shade')) return { lines: ARCHETYPE_ART.wraith, color };
  if (lower.includes('scorpion') || lower.includes('borer')) return { lines: ARCHETYPE_ART.scorpion, color };
  if (lower.includes('sentinel') || lower.includes('sentry') || lower.includes('guardian')) return { lines: ARCHETYPE_ART.sentinel, color };
  if (lower.includes('golem') || lower.includes('titan') || lower.includes('colossus')) return { lines: ARCHETYPE_ART.golem, color };
  if (lower.includes('wisp') || lower.includes('fragment') || lower.includes('plasma')) return { lines: ARCHETYPE_ART.wisp, color };
  if (lower.includes('spider') || lower.includes('stalker')) return { lines: ARCHETYPE_ART.spider, color };
  if (lower.includes('parasite') || lower.includes('leech') || lower.includes('worm') || lower.includes('sensor')) return { lines: ARCHETYPE_ART.parasite, color };
  if (lower.includes('wall') || lower.includes('node') || lower.includes('process') || lower.includes('carrier')) return { lines: ARCHETYPE_ART.wall, color };
  if (lower.includes('walker') || lower.includes('xenomorph') || lower.includes('scout')) return { lines: ARCHETYPE_ART.walker, color };
  if (lower.includes('colonist') || lower.includes('scavenger') || lower.includes('raider') || lower.includes('marine') || lower.includes('host')) return { lines: ARCHETYPE_ART.humanoid, color };

  // Ultimate fallback - humanoid
  return { lines: ARCHETYPE_ART.humanoid, color };
}
