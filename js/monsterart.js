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
    '    ╔═══╗    ',
    '  ╔═╣⚡⚡╠═╗  ',
    ' ║▓▓║███║▓▓║ ',
    '╔╝▒▒╠═══╣▒▒╚╗',
    '║█▓▒║●●●║▒▓█║',
    '║█▓▒╠═══╣▒▓█║',
    '║▓▒░║▓▓▓║░▒▓║',
    '╚╗▒░╠═══╣░▒╔╝',
    ' ║░░║░▒░║░░║ ',
    ' ╚═╧╝   ╚╧═╝ ',
  ],
  'Meltdown Core': [
    '     ●●●●●     ',
    '   ▓▓░░█░░▓▓   ',
    '  ▓░░▒▓▓▒░░▓  ',
    ' ░░▒▓████▓▒░░ ',
    ' ░▒▓██⚡⚡██▓▒░',
    ' ░▒▓██⚡⚡██▓▒░',
    ' ░░▒▓████▓▒░░ ',
    '  ▓░░▒▓▓▒░░▓  ',
    '   ▓▓░░█░░▓▓   ',
    '     ●●●●●     ',
  ],
  'Root Titan': [
    '   ╱╲   ╱╲╱╲   ',
    '  ╱╱╲╲╱╱  ╲╲  ',
    ' ╱╱▓▓╲╱▓▓▓▓╲╲ ',
    '╱▓▓██▓▓████▓▓╲',
    '│▓██●████●██▓│',
    '│▓████████████▓│',
    '│▓██╲════╱██▓│',
    ' ╲▓███████▓╱  ',
    ' │║│  ██  │║│ ',
    ' │║│  ██  │║│ ',
    '╱╱╲╲ ╱╲╲ ╱╱╲╲',
  ],
  'Fungal Colossus': [
    '  ○ ○○  ○○ ○  ',
    ' ░░▒▒▓▓▓▓▒▒░░ ',
    '░▒▒▓▓████▓▓▒▒░',
    '▒▓▓██●██●██▓▓▒',
    '▒▓████████████▓▒',
    '▒▓██▓╲══╱▓██▓▒',
    ' ▓██▓▓▓▓▓▓██▓ ',
    '  ▓████████▓   ',
    '  ░║░░██░░║░  ',
    '  ░║░░██░░║░  ',
    ' ░░╱╲░╱╲░╱╲░░ ',
  ],
  'Sludge Titan': [
    ' ░░▒▒▓▓▓▓▒▒░░  ',
    '░▒▒▓▓████▓▓▒▒░ ',
    '▒▓▓██●██●██▓▓▒ ',
    '▒▓████████████▓▒',
    '▒▓██▓▓▓▓▓▓██▓▒ ',
    ' ▓██████████▓   ',
    ' ▒▓████████▓▒  ',
    ' ░▒▓██████▓▒░  ',
    '░░▒▒▓▓▓▓▒▒░░░░ ',
    '░░▒▒░░░░▒▒░░░░░',
  ],
  'Artifact Guardian': [
    '    ╔═✦═╗    ',
    '  ╔═╣◆◆◆╠═╗  ',
    ' ║▓█║●●●║█▓║ ',
    '╔╝▓█╠═══╣█▓╚╗',
    '║██▓║◇◆◇║▓██║',
    '║██▓╠═══╣▓██║',
    '╚╗▓█║▓▓▓║█▓╔╝',
    ' ║▓█╠═══╣█▓║ ',
    ' ║░░║   ║░░║ ',
    ' ╚╧═╝   ╚═╧╝ ',
  ],
  'Prism Core': [
    '     ▲     ',
    '    ╱◆╲    ',
    '   ╱◇◆◇╲   ',
    '  ╱◆◇●◇◆╲  ',
    ' ╱◇◆◇◆◇◆◇╲ ',
    '╱◆◇◆◇◆◇◆◇◆╲',
    ' ╲◇◆◇◆◇◆◇╱ ',
    '  ╲◆◇●◇◆╱  ',
    '   ╲◇◆◇╱   ',
    '    ╲◆╱    ',
    '     ▼     ',
  ],
  'Dimensional Anchor': [
    '╔══╗    ╔══╗',
    '║▓▓╠════╣▓▓║',
    '║▓▓║░▒▓▒║▓▓║',
    '╠══╣●══●╠══╣',
    '║░▒▓████▓▒░║',
    '║░▒▓█⚡█▓▒░║',
    '╠══╣●══●╠══╣',
    '║▓▓║░▒▓▒║▓▓║',
    '║▓▓╠════╣▓▓║',
    '╚══╝    ╚══╝',
  ],
  'Stack Overflow': [
    '┌─┐┌─┐┌─┐┌─┐',
    '│█││▓││▒││░│',
    '├─┤├─┤├─┤├─┤',
    '│░▒▓████▓▒░│',
    '│▒▓██●●██▓▒│',
    '│▒▓██●●██▓▒│',
    '│░▒▓████▓▒░│',
    '├─┤├─┤├─┤├─┤',
    '│░││▒││▓││█│',
    '└─┘└─┘└─┘└─┘',
  ],
  'Grey Tide': [
    ' ░░▒▒▓▓████▓▓▒▒░░ ',
    ' ░▒▒▓▓██████▓▓▒▒░ ',
    ' ▒▓▓████●●████▓▓▒ ',
    ' ▒▓████████████▓▒ ',
    ' ▓██████████████▓ ',
    ' ▒▓████████████▓▒ ',
    ' ▒▓▓████████▓▓▒▒░ ',
    ' ░▒▒▓▓██████▓▓▒░░ ',
    ' ░░▒▒▓▓████▓▓▒▒░░ ',
    '░░░░▒▒▒▒▒▒▒▒░░░░░ ',
  ],
  'Assimilation Engine': [
    '╔════════════╗',
    '║▓█▓░░░░▓█▓░║',
    '║█●█░▓▓░█●█░║',
    '║▓█▓░░░░▓█▓░║',
    '╠════╗╔════╣ ',
    '║░▒▓█║║█▓▒░║ ',
    '║░▒▓█║║█▓▒░║ ',
    '╠════╝╚════╣ ',
    '║▒░▒░▒░▒░▒░║ ',
    '╚═╧══╧══╧═╝  ',
  ],
  'Mimic Cache': [
    '╔══════════════╗ ',
    '║◆◇◆◇◆◇◆◇◆◇◆◇║ ',
    '╠══════════════╣ ',
    '║   ┌──────┐   ║',
    '║   │ ◆◆◆◆ │   ║',
    '║▲▲▲│ ◆◆◆◆ │▲▲▲║',
    '║   └──────┘   ║',
    '╠══════════════╣ ',
    '║◇◆◇◆◇◆◇◆◇◆◇◆║ ',
    '╚══════════════╝ ',
  ],
  // ── Temperature biome bosses ──
  'Frost Monarch': [
    '     ╱▲▲▲╲     ',
    '    ╱◇◆◇◆◇╲    ',
    '   ╔╝░░░░░╚╗   ',
    '   ║░●░░░●░║   ',
    '   ║░░═══░░║   ',
    '  ╔╝░▓▓▓▓░╚╗   ',
    '  ║░▓█████▓░║  ',
    '  ║░▓█████▓░║  ',
    '  ╚╗░▓▓▓▓░╔╝   ',
    '   ║░║  ║░║    ',
    '   ╚═╝  ╚═╝    ',
  ],
  'Void Sovereign': [
    '      ●●●       ',
    '   ╔══════════╗  ',
    '  ╔╝ ░▒▓▓▒░  ╚╗ ',
    '  ║  ▒▓●▓●▓▒  ║ ',
    '  ║  ░▒▓▓▓▒░  ║ ',
    ' ╔╝  ▓█████▓  ╚╗',
    ' ║  ▓███████▓  ║',
    ' ║  ▓███████▓  ║',
    ' ╚╗  ▓█████▓  ╔╝',
    '  ║  ░▒▓▓▓▒░  ║ ',
    '  ╚══════════╝   ',
  ],
  'Sand Wurm King': [
    '    ╱████╲     ',
    '   ╱●████●╲   ',
    '  ╱══════════╲ ',
    '  ║▓▓▓████▓▓▓║ ',
    '  ╲▓▓▓▓▓▓▓▓▓╱ ',
    '   ║▓█████▓║  ',
    '  ╱▓▓█████▓▓╲ ',
    '  ║▓▓▓████▓▓▓║ ',
    '  ╲▓▓▓▓▓▓▓▓▓╱ ',
    '   ╲════════╱  ',
    '    ╲╱╲╱╲╱╲╱   ',
  ],
  'Magma Colossus': [
    '    ╔══════╗    ',
    '   ╔╝▓●▓●▓╚╗   ',
    '   ║▓█═══█▓║   ',
    '  ╔╝▓█████▓╚╗  ',
    ' ╔╝▓███████▓╚╗ ',
    ' ║▓█████████▓║ ',
    ' ║▓█████████▓║ ',
    ' ╚╗▓███████▓╔╝ ',
    '  ║▓██║ ║██▓║  ',
    '  ╚══╝  ╚══╝   ',
  ],
  'Ash Titan': [
    '   ╱╲ ●●● ╱╲   ',
    '  ╱▓▓╲═══╱▓▓╲  ',
    '  ║▓●▓▓▓▓▓●▓║  ',
    ' ╔╝▓▓═════▓▓╚╗ ',
    ' ║▓█████████▓║ ',
    '╔╝▓███████████╚╗',
    '║▓█████████████▓║',
    '╚╗▓███████████╔╝',
    ' ║▓██║   ║██▓║ ',
    ' ║▓██║   ║██▓║ ',
    ' ╚══╝     ╚══╝ ',
  ],
  'Absolute Zero': [
    '    ◇◆◇◆◇◆◇     ',
    '   ╔═══════╗    ',
    '  ╔╝░░●░●░░╚╗   ',
    '  ║░░═════░░║   ',
    ' ╔╝░▓▓▓▓▓▓░╚╗  ',
    ' ║░▓████████░║  ',
    ' ║░▓████████░║  ',
    ' ╚╗░▓▓▓▓▓▓░╔╝  ',
    '  ╚╗░░░░░░╔╝   ',
    '   ║░║  ║░║    ',
    '   ╚═╝  ╚═╝    ',
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
    '  ╱╲ ╱╲  ',
    ' │● ▼ ●│ ',
    ' │  ▼  │ ',
    ' ╲╲═══╱╱ ',
    '  ╲▓▓▓╱  ',
    ' ╱╱▓▓▓╲╲ ',
    '╱╱ ╱╱╲╲ ╲╲',
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
    ' ▓██████████▓ ',
    ' █▓████████▓█ ',
    ' ▓█▓████▓█▓█▓',
    ' █▓█████▓█▓█▓',
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
  jellyfish: [
    '     ╱══╲     ',
    '   ╱▒▓▓▓▒╲   ',
    '  ║▓●▓▓●▓║   ',
    '  ║▒▓▓▓▓▒║   ',
    '   ╲▒▓▓▒╱    ',
    '   │║│║│║│   ',
    '  │ ║│║│ ║   ',
    '   │ │ │ │   ',
  ],
  centipede: [
    '    ╱●●╲     ',
    '   ║▓▓▓▓║    ',
    '   ╱╲▓▓╱╲    ',
    '  ║▓▓▓▓▓▓║   ',
    '   ╱╲▓▓╱╲    ',
    '  ║▓▓▓▓▓▓║   ',
    '   ╱╲▓▓╱╲    ',
    '   ╲▒▒▒▒╱    ',
    '    ╲══╱     ',
  ],
  eye: [
    '    ╔═══╗     ',
    '   ╱░▒▓▒░╲   ',
    '  ║░▒▓●▓▒░║  ',
    '  ║░▒▓▓▓▒░║  ',
    '   ╲░▒▓▒░╱   ',
    '    ╚═══╝    ',
    '   ╱│ │ │╲   ',
    '  ╱ │ │ │ ╲  ',
  ],
  turret: [
    '     ║║║      ',
    '   ╔═╣●╠═╗   ',
    '   ║▓████▓║   ',
    '   ╠══════╣   ',
    '  ╔╝▒▒▒▒▒╚╗  ',
    '  ║████████║  ',
    '  ╚╗▓▓▓▓▓╔╝  ',
    '   ╚══════╝   ',
  ],
  amalgam: [
    '  ▓█╔═╗█▓    ',
    ' ▓█▒║●║▒█▓   ',
    ' █▓▒╠═╣▒▓█   ',
    ' ▓▒░║▓▓║░▒▓  ',
    ' █▓▒║██║▒▓█  ',
    ' ▓█▒╠═╣▒█▓   ',
    '  ▓█║░░║█▓   ',
    '  ░▒╚══╝▒░   ',
  ],
  crystal_entity: [
    '      ▲       ',
    '     ╱◆╲      ',
    '    ╱◇◆◇╲     ',
    '   ╱◆●◆●◆╲   ',
    '    ╲◇◆◇╱    ',
    '    ║◆◇◆║     ',
    '    ║◇◆◇║     ',
    '    ╱╲ ╱╲     ',
    '   ╱  ╲╱  ╲  ',
  ],
  swirl: [
    '   · ∙ · ∙   ',
    '  ∙ ╱░▒╲ ·   ',
    ' · ╱▒▓█▓╲ ∙  ',
    ' ∙ ║▓█●█▓║ · ',
    ' · ╲▓█▓▒╱ ∙  ',
    '  ∙ ╲▒░╱ ·   ',
    '   · ∙ · ∙   ',
  ],
  hound: [
    '   ╱╲  ╱╲    ',
    '  ╱●╲╲╱╱●╲   ',
    '  ╲══╲╱══╱   ',
    '  ║▓████▓║   ',
    '  ║██████║   ',
    '  ║▓▓▓▓▓▓║   ',
    ' ╱╱║    ║╲╲  ',
    ' ╱╱ ║  ║ ╲╲  ',
  ],
  // ── New archetypes for temperature biomes ──
  serpent: [
    '     ╱╲     ',
    '    ╱●●╲    ',
    '   ╱════╲   ',
    '  ║▓▓▓▓▓▓║  ',
    '   ╲▓▓▓▓╱   ',
    '    ║▓▓║    ',
    '   ╱▓▓▓▓╲   ',
    '  ║▓▓▓▓▓▓║  ',
    '   ╲════╱   ',
    '    ╲╱╲╱    ',
  ],
  beetle: [
    '   ╱════╲   ',
    '  ╱▓████▓╲  ',
    ' ╱▓██●●██▓╲ ',
    ' ║▓██████▓║ ',
    ' ║▓██████▓║ ',
    ' ╲▓██████▓╱ ',
    '  ╲▓████▓╱  ',
    '  ╱╱╱  ╲╲╲  ',
    ' ╱╱╱    ╲╲╲ ',
  ],
  elemental: [
    '    · ∙ ·    ',
    '  ∙ ░▒▓▒░ ∙ ',
    ' · ░▒▓▓▓▒░ · ',
    ' ∙ ▒▓●▓●▓▒ ∙ ',
    ' · ░▒▓▓▓▒░ · ',
    '  ∙ ░▒▓▒░ ∙ ',
    '   · ░▒░ ·  ',
    '    ∙ · ∙    ',
  ],
  worm: [
    '   ╱●●╲    ',
    '  ║▓▓▓▓║   ',
    '  ╲▓▓▓▓╱   ',
    '   ║▓▓║    ',
    '  ╱▓▓▓▓╲   ',
    '  ║▓▓▓▓║   ',
    '  ╲▓▓▓▓╱   ',
    '   ║▓▓║    ',
    '   ╲══╱    ',
  ],
  crab: [
    '  ╱╲    ╱╲  ',
    ' ╱  ╲  ╱  ╲ ',
    ' ╲══╗╔══╗══╱ ',
    '  ║●║║║●║   ',
    '  ╠══╣══╣   ',
    '  ║██████║  ',
    '  ╚╗▓▓▓▓╔╝  ',
    '  ╱╱╱  ╲╲╲  ',
  ],
  bat: [
    ' ╱╲      ╱╲ ',
    '╱▓▓╲ ╱╲ ╱▓▓╲',
    '║▓▓▓╲║║╱▓▓▓║',
    '╲▓▓▓║●●║▓▓▓╱',
    ' ╲▓▓║▓▓║▓▓╱ ',
    '  ╲▓║▓▓║▓╱  ',
    '   ╲╲▓▓╱╱   ',
    '    ╲╲╱╱    ',
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
  // Jellyfish / floaters
  'Acid Jellyfish': 'jellyfish', 'Stellar Jellyfish': 'jellyfish', 'Plasma Jellyfish': 'jellyfish',
  'Vacuum Jellyfish': 'jellyfish', 'Canopy Jellyfish': 'jellyfish', 'Void Jellyfish': 'jellyfish',
  // Centipedes / segmented
  'Soil Centipede': 'centipede', 'Sewer Centipede': 'centipede', 'Hull Centipede': 'centipede',
  'Acid Centipede': 'centipede', 'Grey Centipede': 'centipede', 'Pipe Worm': 'centipede',
  'Heat Shimmer': 'swirl',
  // Eyes / watchers
  'Watcher Node': 'eye', 'Broken Watcher': 'eye', 'Frozen Watcher': 'eye',
  'Mycelium Eye': 'eye', 'Beacon Eye': 'eye', 'Resonance Eye': 'eye',
  'Disassembler Eye': 'eye', 'Neural Watcher': 'eye',
  // Turrets / emitters
  'Irrigation Turret': 'turret', 'Breach Turret': 'turret', 'Temporal Sentry': 'turret',
  'Sparking Junction': 'turret',
  // Amalgams / fusions
  'Waste Amalgam': 'amalgam', 'Forge Amalgam': 'amalgam', 'Molten Amalgam': 'amalgam',
  'Toxic Amalgam': 'amalgam', 'Lattice Amalgam': 'amalgam', 'Bone Amalgam': 'amalgam',
  'Symbiotic Cluster': 'amalgam',
  // Crystal entities
  'Temporal Frost': 'crystal_entity',
  // Swirl / temporal anomalies
  'Time Loop Entity': 'swirl', 'Gravity Maw': 'swirl',
  'Recursive Entity': 'swirl', 'Memory Overflow': 'swirl', 'Pixel Storm': 'swirl',
  // Hounds / pack predators
  'Hull Hound': 'hound', 'Cryo Hound': 'hound', 'Feral Hound Pack': 'hound',
  'Spore Hound': 'hound', 'Xeno Hound': 'hound', 'Crystal Hound': 'hound',
  'Nano Hound': 'hound', 'Assimilated Hound': 'hound',
  // Existing archetypes for new enemies
  'Cable Strangler': 'parasite', 'Echo Bat': 'swarm', 'Memory Phantom': 'wraith',
  'Grief Echo': 'wraith', 'Gravity Leech': 'parasite', 'Corridor Creeper': 'critter',
  'Loot Mimic': 'wall', 'Lost Child Echo': 'wraith', 'Crop Mimic': 'wall',
  // Temperature biome enemies — cold
  'Frost Stalker': 'hound', 'Blizzard Drone': 'drone', 'Frozen Shambler': 'humanoid',
  'Ice Mite': 'critter', 'Tundra Wolf': 'hound', 'Permafrost Sentinel': 'sentinel',
  'Cryo Beetle': 'beetle', 'Glacial Worm': 'worm', 'Frozen Core': 'golem',
  'Ice Phantom': 'wraith', 'Void Drifter': 'walker', 'Star Phantom': 'wraith',
  'Vacuum Stalker': 'hound', 'Null Sentinel': 'sentinel', 'Event Horizon': 'swirl',
  'Grid Crawler': 'critter', 'Conduit Worm': 'worm', 'Structural Sentinel': 'sentinel',
  'Foundation Golem': 'golem',
  // Temperature biome enemies — hot
  'Sand Crawler': 'scorpion', 'Heat Mirage': 'swirl', 'Dune Scorpion': 'scorpion',
  'Sun Bleached Sentinel': 'sentinel', 'Desert Raider': 'humanoid', 'Dust Devil': 'elemental',
  'Cinder Hound': 'hound', 'Scorched Raider': 'humanoid', 'Ember Swarm': 'swarm',
  'Heat Warden': 'sentinel', 'Ash Wraith': 'wraith',
  'Lava Serpent': 'serpent', 'Magma Beetle': 'beetle', 'Cinder Wraith': 'wraith',
  'Molten Sentinel': 'sentinel', 'Lava Jellyfish': 'jellyfish',
  'Hellfire Golem': 'golem', 'Inferno Wurm': 'worm', 'Flame Phantom': 'wraith',
  'Core Meltdown': 'turret', 'Ember Centipede': 'centipede',
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

  let lines;

  // Tier 1: exact boss match
  if (BOSS_ART[baseName]) {
    lines = BOSS_ART[baseName];
  }
  // Tier 2: name-based archetype lookup
  else if (NAME_TO_ARCHETYPE[baseName]) {
    lines = ARCHETYPE_ART[NAME_TO_ARCHETYPE[baseName]];
  }
  // Fallback: keyword-based guessing
  else {
    const lower = baseName.toLowerCase();
    if (lower.includes('drone') || lower.includes('bot')) lines = ARCHETYPE_ART.drone;
    else if (lower.includes('mech') || lower.includes('automaton') || lower.includes('harvester')) lines = ARCHETYPE_ART.mech;
    else if (lower.includes('vine') || lower.includes('tendril') || lower.includes('root')) lines = ARCHETYPE_ART.vine;
    else if (lower.includes('slime') || lower.includes('gel') || lower.includes('sludge') || lower.includes('ooze')) lines = ARCHETYPE_ART.slime;
    else if (lower.includes('rat') || lower.includes('cat') || lower.includes('amphibian') || lower.includes('livestock')) lines = ARCHETYPE_ART.critter;
    else if (lower.includes('swarm') || lower.includes('moth') || lower.includes('pollinator')) lines = ARCHETYPE_ART.swarm;
    else if (lower.includes('wraith') || lower.includes('specter') || lower.includes('phantom') || lower.includes('ghost') || lower.includes('shade')) lines = ARCHETYPE_ART.wraith;
    else if (lower.includes('scorpion') || lower.includes('borer')) lines = ARCHETYPE_ART.scorpion;
    else if (lower.includes('sentinel') || lower.includes('sentry') || lower.includes('guardian')) lines = ARCHETYPE_ART.sentinel;
    else if (lower.includes('golem') || lower.includes('titan') || lower.includes('colossus')) lines = ARCHETYPE_ART.golem;
    else if (lower.includes('wisp') || lower.includes('fragment') || lower.includes('plasma')) lines = ARCHETYPE_ART.wisp;
    else if (lower.includes('spider') || lower.includes('stalker')) lines = ARCHETYPE_ART.spider;
    else if (lower.includes('parasite') || lower.includes('leech') || lower.includes('worm') || lower.includes('sensor')) lines = ARCHETYPE_ART.parasite;
    else if (lower.includes('wall') || lower.includes('node') || lower.includes('process') || lower.includes('carrier')) lines = ARCHETYPE_ART.wall;
    else if (lower.includes('walker') || lower.includes('xenomorph') || lower.includes('scout')) lines = ARCHETYPE_ART.walker;
    else if (lower.includes('colonist') || lower.includes('scavenger') || lower.includes('raider') || lower.includes('marine') || lower.includes('host')) lines = ARCHETYPE_ART.humanoid;
    else if (lower.includes('jellyfish')) lines = ARCHETYPE_ART.jellyfish;
    else if (lower.includes('centipede') || lower.includes('pipe worm')) lines = ARCHETYPE_ART.centipede;
    else if (lower.includes('eye') || lower.includes('watcher')) lines = ARCHETYPE_ART.eye;
    else if (lower.includes('turret') || lower.includes('junction') || lower.includes('sentry')) lines = ARCHETYPE_ART.turret;
    else if (lower.includes('amalgam') || lower.includes('cluster')) lines = ARCHETYPE_ART.amalgam;
    else if (lower.includes('hound')) lines = ARCHETYPE_ART.hound;
    else if (lower.includes('shimmer') || lower.includes('loop') || lower.includes('recursive') || lower.includes('overflow') || lower.includes('pixel storm') || lower.includes('gravity maw')) lines = ARCHETYPE_ART.swirl;
    else if (lower.includes('mimic')) lines = ARCHETYPE_ART.wall;
    else if (lower.includes('echo') || lower.includes('grief')) lines = ARCHETYPE_ART.wraith;
    else if (lower.includes('serpent') || lower.includes('snake') || lower.includes('wyrm')) lines = ARCHETYPE_ART.serpent;
    else if (lower.includes('beetle') || lower.includes('carapace')) lines = ARCHETYPE_ART.beetle;
    else if (lower.includes('elemental') || lower.includes('devil') || lower.includes('mirage')) lines = ARCHETYPE_ART.elemental;
    else if (lower.includes('worm') || lower.includes('wurm') || lower.includes('burrower')) lines = ARCHETYPE_ART.worm;
    else if (lower.includes('crab') || lower.includes('crustacean')) lines = ARCHETYPE_ART.crab;
    else if (lower.includes('bat') || lower.includes('wing')) lines = ARCHETYPE_ART.bat;
    else lines = ARCHETYPE_ART.humanoid; // Ultimate fallback
  }

  // Normalize: trim trailing whitespace, center content, pad all lines to same width
  // Step 1: trim trailing spaces from each line
  const trimmed = lines.map(l => l.replace(/\s+$/, ''));
  // Step 2: find the content bounding box (min leading spaces, max content end)
  let minLead = Infinity;
  let maxEnd = 0;
  for (const l of trimmed) {
    if (l.length === 0) continue;
    const lead = l.search(/\S/);
    if (lead >= 0 && lead < minLead) minLead = lead;
    if (l.length > maxEnd) maxEnd = l.length;
  }
  if (minLead === Infinity) minLead = 0;
  // Step 3: strip common leading whitespace and recenter
  const stripped = trimmed.map(l => l.length > 0 ? l.substring(minLead) : '');
  const contentW = Math.max(...stripped.map(l => l.length));
  // Add 2-char margin on each side for clean framing
  const totalW = contentW + 4;
  const normalized = stripped.map(l => {
    const pad = Math.floor((contentW - l.length) / 2);
    return ('  ' + ' '.repeat(pad) + l).padEnd(totalW);
  });
  return { lines: normalized, color };
}
