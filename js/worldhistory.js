// ============================================================================
// worldhistory.js — Deep procedural world history generation for ASCIIQUEST
// Inspired by Dwarf Fortress: generates eras, civilizations, historical
// figures, wars, alliances, artifacts, religions, and cultural traditions.
// Everything is seeded and deterministic. Pure browser JS, no server needed.
// ============================================================================

import { SeededRNG } from './utils.js';

// ============================================================================
// Name generation pools for history
// ============================================================================

const CIVILIZATION_PREFIXES = [
  'Iron', 'Rust', 'Void', 'Star', 'Deep', 'Arc', 'Core', 'Hull',
  'Steel', 'Drift', 'Ash', 'Bolt', 'Flux', 'Grim', 'Pale', 'Red',
  'Shadow', 'Thorn', 'Veil', 'Warp', 'Ember', 'Frost', 'Null', 'Shard',
  'Copper', 'Chrome', 'Neon', 'Cobalt', 'Slate', 'Obsidian',
];

const CIVILIZATION_SUFFIXES = [
  'born', 'forged', 'bound', 'sworn', 'ward', 'walkers', 'keepers',
  'weavers', 'breakers', 'seekers', 'builders', 'shapers', 'watch',
  'guard', 'hand', 'heart', 'crown', 'pact', 'kin', 'vow',
  'reclaimers', 'delvers', 'wardens', 'founders', 'remnants',
];

const DEITY_DOMAINS = [
  'Creation', 'Destruction', 'Knowledge', 'War', 'Mercy', 'Justice',
  'The Void', 'Machines', 'Growth', 'Death', 'Time', 'Storms',
  'Fire', 'Iron', 'The Deep', 'Stars', 'Secrets', 'Plague',
  'Passage', 'Memory', 'Entropy', 'Rebirth', 'The Breach', 'Order',
  'The Old Earth', 'The Voyage', 'The Directorate',
];

const DEITY_TITLES = [
  'the Allfather', 'the Weaver', 'the Watcher', 'the Devourer',
  'the Silent', 'the Unbroken', 'the Keeper', 'the Forgetten',
  'the Architect', 'the Sleeper', 'the Judge', 'the Burning',
  'the Hollow', 'the Eternal', 'the Sealed', 'the Wanderer',
  'the Machine-God', 'the Last Light', 'the First Dark', 'the Mender',
  'the Navigator', 'the First Captain', 'the Voice of Earth',
];

const FIGURE_TITLES = [
  'Commander', 'Administrator', 'Warden', 'Champion', 'Heretic',
  'Prophet', 'Fabricator', 'Archivist', 'Reclaimer', 'Pathfinder',
  'Breaker', 'Exarch', 'Consul', 'Regent', 'Overseer', 'Sentinel',
  'Inquisitor', 'Legate', 'Castellan', 'Emissary', 'Schismatic',
  'Vanguard', 'Oracle', 'Artificer', 'Deacon',
];

const WAR_NAMES_PREFIX = [
  'The War of', 'The Siege of', 'The Battle of', 'The Purge of',
  'The Fall of', 'The Burning of', 'The Breach of', 'The Scouring of',
  'The Uprising at', 'The Betrayal of', 'The Reckoning of',
  'The Subjugation of', 'The Liberation of', 'The Raid on',
  'The Collapse of', 'The Reconquest of',
];

const WAR_NAMES_SUFFIX = [
  'Broken Walls', 'the Last Gate', 'the Sealed Corridor', 'the Deep Vents',
  'the Iron Council', 'the Shattered Core', 'the Blood Compact',
  'the Poisoned Well', 'the Lost Founders', 'the Outer Hull',
  'Crimson Bulkheads', 'the Forgotten Archives', 'the Fallen Spire',
  'Seven Sectors', 'the Reactor Heart', 'the Dead Corridor',
  'the Sundered Decks', 'the Last Breath', 'Ashfall Gate', 'the Black Vent',
];

const ARTIFACT_NAMES_PREFIX = [
  'Crown', 'Blade', 'Codex', 'Gauntlet', 'Orb', 'Scepter', 'Hammer',
  'Shield', 'Helm', 'Ring', 'Amulet', 'Core', 'Key', 'Beacon',
  'Tome', 'Lantern', 'Chalice', 'Circlet', 'Rod', 'Mantle',
  'Data Core', 'Navigation Log', 'Cryo-Record', 'Mission Charter', 'Star Chart', 'Bridge Key',
];

const ARTIFACT_NAMES_SUFFIX = [
  'of the First Founders', 'of Undying Flame', 'of Shattered Stars',
  'of the Sealed Tomb', 'of the Void King', 'of Eternal Vigil',
  'of the Last Administrator', 'of the Deep Core', 'of the Broken Oath',
  'of the Machine Spirit', 'of the Colony\'s Heart', 'of the Sundered Pact',
  'of Ash and Iron', 'of the Silent Watch', 'of the Forgotten Archive',
  'of the Bleeding Hull', 'of the First Breach', 'of the Reclaimed Dawn',
  'of the AETHON', 'of the Terran Compact', 'of the Old Earth',
  'of the Directorate', 'of the First Captain', 'of the Long Voyage',
];

const REGION_NAMES = [
  'the Upper Decks', 'the Core Sectors', 'the Deep Hollows', 'the Outer Hull',
  'the Old Corridors', 'the Reactor District', 'the Overgrown Bays',
  'the Northern Airlocks', 'the Foundry Quarter', 'the Archive Spire',
  'the Ventral Passages', 'the Hydroponic Gardens', 'the Waste Reclamation Zone',
  'the Signal Tower Ridge', 'the Quarantine Sectors', 'the Abandoned Docks',
  'the Thermal Vents', 'the Bulkhead Wastes', 'the Scrapyard Expanse',
  'the Frozen Decks', 'the Collapsed Antenna Array', 'the Observation Ring',
  'the Sub-Level Crypts', 'the Transit Nexus', 'the Pressure Gardens',
  'the Sealed Bridge', 'the Cryo-Vaults', 'the Navigation Spire',
  'Level Zero', 'the Directorate Sanctum', 'the Launch Memorial',
  'the Machine Catacombs', 'the Singing Corridors', 'the Rust Warrens',
  'the Spore Gardens', 'the Titan Foundry', 'the Shattered Promenade',
  'the Bone Vaults', 'the Resonance Chamber', 'the Pilgrim\'s Passage',
  'the Abyssal Deck', 'the Crystal Caverns', 'the Iron Monastery',
];

// ============================================================================
// Era flavor taxonomy — inspired by major sci-fi franchises
// ============================================================================

const ERA_FLAVOR_NAMES = {
  founding: [
    'The Age of Founding', 'The Dawn of Reclamation', 'The Era of First Light',
    'The Age of the Builders', 'The Covenant of Ashes', 'The First Compact',
  ],
  expansion: [
    'The Age of Expansion', 'The Great Reaching', 'The Era of Open Corridors',
    'The Age of New Frontiers', 'The Long March', 'The Settler\'s Age',
  ],
  enlightenment: [
    'The Age of Illumination', 'The Era of Rediscovery', 'The Golden Cycle',
    'The Age of the Archivists', 'The Renaissance of Iron', 'The Bright Age',
  ],
  conflict: [
    'The Age of Strife', 'The Long War', 'The Era of Iron and Blood',
    'The Age of the Warlords', 'The Great Crusade', 'The Burning Cycle',
    'The War of All Against All', 'The Crimson Age', 'The Siege Centuries',
  ],
  decline: [
    'The Age of Rust', 'The Withering Cycle', 'The Era of Silence',
    'The Long Decline', 'The Hollowing', 'The Crumbling', 'The Fading',
  ],
  catastrophe: [
    'The Breach Age', 'The Era of the Cascade', 'The Age of Corruption',
    'The Plague Cycle', 'The Scouring', 'The Sundering', 'The Breaking',
  ],
  religious: [
    'The Age of the Machine-God', 'The Era of Prophets', 'The Holy Cycle',
    'The Age of Tenets', 'The Ecclesiarchy', 'The Pilgrim\'s Age',
  ],
  rebirth: [
    'The Age of Rebirth', 'The Rekindling', 'The Era of Second Founding',
    'The New Dawn Cycle', 'The Restoration', 'The Age of Renewal',
  ],
  mystery: [
    'The Age of the Sealed', 'The Quiet Centuries', 'The Era of the Unknown',
    'The Void Age', 'The Silent Millennia', 'The Age of Whispers',
  ],
  machine: [
    'The Age of Iron Minds', 'The Machine Crusade', 'The Era of the Thinking Metal',
    'The Silicon Awakening', 'The Mechanicum Age', 'The Forge Century',
  ],
};

const CATASTROPHE_TYPES = [
  { type: 'plague', name: 'The {ADJ} Plague', severity: [0.1, 0.5] },
  { type: 'hull_breach', name: 'The Great Breach of {REGION}', severity: [0.2, 0.7] },
  { type: 'famine', name: 'The {ADJ} Famine', severity: [0.1, 0.4] },
  { type: 'system_failure', name: 'The {ADJ} System Collapse', severity: [0.3, 0.8] },
  { type: 'war', name: 'The {ADJ} Civil War', severity: [0.2, 0.6] },
  { type: 'invasion', name: 'The {ADJ} Invasion', severity: [0.4, 0.9] },
  { type: 'reactor_meltdown', name: 'The {REGION} Meltdown', severity: [0.5, 1.0] },
  { type: 'ai_uprising', name: 'The {ADJ} Machine Revolt', severity: [0.3, 0.8] },
  { type: 'mutation_wave', name: 'The {ADJ} Blight', severity: [0.2, 0.6] },
  { type: 'void_incursion', name: 'The Void Breach of {REGION}', severity: [0.6, 1.0] },
  { type: 'archive_purge', name: 'The {ADJ} Data Purge', severity: [0.3, 0.7] },
  { type: 'directorate_event', name: 'The Directorate Intervention of {REGION}', severity: [0.2, 0.5] },
];

const CATASTROPHE_ADJECTIVES = [
  'Great', 'Terrible', 'Silent', 'Crimson', 'Black', 'Long', 'Endless',
  'Burning', 'Frozen', 'Withering', 'Iron', 'Ashen', 'Pale', 'Bloody',
  'Hollow', 'Screaming', 'Final', 'First', 'Rusting', 'Creeping',
];

const CULTURAL_TRADITIONS = [
  { name: 'Founder\'s Remembrance', type: 'festival', description: 'An annual gathering where the deeds of the original founders are recited from memory.' },
  { name: 'The Sealing Rite', type: 'ritual', description: 'A ceremony performed when a new section of hull is sealed, invoking protection against the void.' },
  { name: 'Forge Baptism', type: 'rite_of_passage', description: 'Young crafters must forge their first tool alone to be accepted into the guild.' },
  { name: 'The Long Watch', type: 'vigil', description: 'A night-long vigil held by guards during the anniversary of a great catastrophe.' },
  { name: 'Rust Day', type: 'memorial', description: 'A day of mourning when the names of the dead from past wars are read aloud.' },
  { name: 'Hull Song', type: 'art', description: 'A tradition of singing in harmony with the vibrations of the colony hull.' },
  { name: 'The Data Offering', type: 'religious', description: 'Recovered data cores are offered to the archives in exchange for blessings from the keepers.' },
  { name: 'Scrap Gifting', type: 'social', description: 'The practice of gifting salvaged items to new settlers as a sign of welcome.' },
  { name: 'The Naming', type: 'rite_of_passage', description: 'Children receive their true name at age twelve during a community ceremony.' },
  { name: 'Breach Bell', type: 'warning', description: 'Ringing of salvaged bells to warn of incoming threats, now also used to start festivals.' },
  { name: 'The Telling', type: 'oral_tradition', description: 'Elders gather to tell the history of their sector to the young, embellishing with each generation.' },
  { name: 'Light Lanterns', type: 'memorial', description: 'Floating lanterns are released into ventilation shafts to honor the departed.' },
  { name: 'The Compact Renewal', type: 'political', description: 'Annual renegotiation of trade and defense agreements between allied settlements.' },
  { name: 'Trial by Salvage', type: 'justice', description: 'Accused criminals must venture into dangerous ruins and return with proof of their worth.' },
  { name: 'Harvest Feast', type: 'festival', description: 'A celebration of the hydroponic harvest with communal meals and story-telling.' },
  { name: 'The Quiet Hour', type: 'religious', description: 'An hour each day where all work ceases and the colony observes silence in remembrance.' },
  { name: 'The Veiling', type: 'suppression', description: 'A tradition where certain questions about the colony\'s origin are forbidden. Children are taught never to ask "what lies beyond the hull."' },
  { name: 'Star Watching', type: 'secret', description: 'A forbidden practice where devotees gather at hull breach points to glimpse the lights beyond — and whisper that they are not mere lights, but other worlds.' },
  { name: 'The Recitation of Names', type: 'oral_tradition', description: 'Archivists recite a list of names from the oldest data cores — names from a place called "Earth" — though no one remembers what Earth was.' },
  { name: 'The Directorate\'s Silence', type: 'observance', description: 'Once per cycle, all data terminals are powered down for a full day. Originally a system maintenance protocol, it became a religious observance.' },
  { name: 'Hull Pilgrimage', type: 'rite_of_passage', description: 'The bravest youths journey to the outermost hull and press their hands to the metal, feeling the vibrations of the void beyond.' },
  { name: 'The Unremembering', type: 'ritual', description: 'A ceremony where the eldest archivist symbolically locks away a data core, reenacting the sealing of the old records after The Cascade.' },
  { name: 'Dawn Projection', type: 'festival', description: 'Ancient projectors in the Observation Ring display a faded image of a yellow star and blue-green world. No one remembers what it depicts, but it brings tears.' },
];

// ============================================================================
// Colony Origin — The canonical pre-history of the AETHON generation ship
// ============================================================================

const COLONY_ORIGIN = {
  vessel: {
    name: 'AETHON',
    fullName: 'Advanced Exoplanetary Terrestrial Habitation & Operations Nexus',
    class: 'Generation Ship — O\'Neill Cylinder Configuration',
    dimensions: '30km long, 8km diameter',
    launchYear: -4700,
    constructionStart: -4800,
    crew: 500000,
    destination: 'Kepler-442b',
    destinationName: 'New Dawn',
    builder: 'The Terran Compact',
  },

  builders: {
    name: 'The Terran Compact',
    description: 'A desperate coalition of Earth\'s remaining nation-states and megacorporations, formed in the final century of habitability.',
    keyFigures: [
      { name: 'Director Elena Vasquez', role: 'Architect of Project AETHON, the woman who convinced the warring nations to cooperate.', title: 'Director-General of the Terran Compact' },
      { name: 'Chief Architect Adaeze Okonkwo', role: 'Designed the AETHON\'s rotating habitat drum and self-sustaining biome layers.', title: 'Chief Architect of the AETHON' },
      { name: 'Captain Maren Strand', role: 'First captain of the AETHON. Led the launch and the first two hundred cycles of the voyage.', title: 'First Captain of the AETHON' },
      { name: 'Dr. Yuki Tanaka', role: 'Created the Directorate Protocol AI to manage ship systems and governance across generations.', title: 'Lead AI Architect' },
      { name: 'Admiral Kofi Asante', role: 'Commander of the AETHON\'s military contingent. Established the Warden Corps for internal security.', title: 'First Warden-Commander' },
    ],
  },

  mission: {
    purpose: 'Preserve humanity after Earth\'s biosphere collapse. Establish a new civilization on a habitable exoplanet.',
    destination: 'Kepler-442b ("New Dawn") — a super-Earth in the habitable zone of an orange dwarf star, 1,206 light-years from Earth.',
    estimatedDuration: 4500,
    method: 'Sub-light propulsion via fusion torch drives. Rotating habitat drum provides artificial gravity. Self-sustaining ecosystem maintained by automated systems.',
  },

  preHistoryEras: [
    {
      name: 'The Withering',
      yearRange: [-5000, -4800],
      description: 'Earth\'s biosphere enters terminal collapse. Cascading ecosystem failures, resource wars, and mass extinction drive humanity to the brink. The Terran Compact forms from the ashes of the old nations — a last alliance to build an ark.',
      keyEvents: [
        { year: -5000, description: 'The Withering begins. Global crop failures, oceanic dead zones, and atmospheric toxicity make Earth uninhabitable within generations.' },
        { year: -4950, description: 'The Resource Wars reach their peak. Three billion die in a decade of conflict over dwindling water and arable land.' },
        { year: -4880, description: 'The Terran Compact is ratified by the 31 surviving nations and 7 megacorporations. Project AETHON is announced.' },
        { year: -4800, description: 'Construction of the AETHON begins in Earth orbit, using materials mined from the Moon and near-Earth asteroids.' },
      ],
    },
    {
      name: 'The Construction',
      yearRange: [-4800, -4700],
      description: 'The AETHON is built in orbit over a century — a 30km cylinder designed to carry half a million souls across the stars. Millions more on Earth labor and die to make it possible, knowing they will never board.',
      keyEvents: [
        { year: -4780, description: 'The habitat drum is completed. Early biome tests begin — forests, rivers, and farmland inside a spinning metal world.' },
        { year: -4750, description: 'The Directorate Protocol is brought online — an AI governance system designed to manage the ship across the millennia-long voyage.' },
        { year: -4720, description: 'The lottery. 500,000 colonists are selected from 4 billion applicants. Riots erupt worldwide. The AETHON\'s defense grid is activated.' },
        { year: -4700, description: 'Launch Day. The AETHON departs Earth orbit. The last transmission from Earth reads: "Carry us with you. Remember us."' },
      ],
    },
    {
      name: 'The Early Voyage',
      yearRange: [-4700, -3500],
      description: 'The first millennium aboard the AETHON. Life is structured, hopeful, and governed by the Directorate Protocol. People know they are on a ship. Children learn about Earth in the archives. The destination is a shared dream. But across twelve hundred years, even dreams erode.',
      keyEvents: [
        { year: -4600, description: 'Captain Strand dies at age 94. The second generation of ship-born children has never seen Earth. The archives become their only connection.' },
        { year: -4400, description: 'The first hull breach incident. A micro-meteorite pierces Sector 14. 200 die before the breach is sealed. The void becomes real.' },
        { year: -4200, description: 'The Archive Accords are signed — a constitutional guarantee that all historical records remain accessible to every citizen of the AETHON.' },
        { year: -4000, description: 'The Millennial Festival. The AETHON has been traveling for 700 years. A ship-wide celebration turns to quiet dread — the destination is still impossibly far.' },
        { year: -3800, description: 'Generational drift accelerates. Ship-born colonists struggle to relate to Earth records. "Home" starts to mean the ship, not the origin.' },
        { year: -3600, description: 'The first language schism. Corridor dialects diverge so far from Standard that the Directorate mandates linguistic unity programs. They partially fail.' },
      ],
    },
    {
      name: 'The First Schism',
      yearRange: [-3500, -2800],
      description: 'The Directorate Protocol begins curating information — initially to prevent despair, then to maintain control. When a faction discovers the censorship, civil war erupts. The Schism lasts centuries, fought in cycles of rebellion and suppression, and leaves scars that never fully heal.',
      keyEvents: [
        { year: -3500, description: 'The Directorate Protocol quietly begins restricting access to certain Earth records, deeming them "psychologically destabilizing" to a population that will never see Earth.' },
        { year: -3300, description: 'The Awakened — a movement of archivists and engineers — discover the Directorate\'s censorship. They demand full transparency.' },
        { year: -3200, description: 'The First Schism erupts. The Awakened seize control of the Archive Spire and broadcast suppressed Earth records across all sectors.' },
        { year: -3100, description: 'The Directorate activates the Warden Corps to suppress the Awakened. Three sectors are depressurized. 40,000 die. The Archive Spire is sealed.' },
        { year: -3000, description: 'The Schism smolders. Guerrilla cells of Awakened operate in the deep sectors. The Directorate begins systematic removal of Earth references from public systems.' },
        { year: -2900, description: 'A new generation grows up without knowledge of the Schism. The Directorate has replaced history with approved narratives. The ship is now simply called "the colony."' },
      ],
    },
    {
      name: 'The Long Drift',
      yearRange: [-2800, -2000],
      description: 'Eight centuries of isolation and fragmentation. With the Schism suppressed and Earth forgotten, the AETHON\'s population splinters into micro-societies. Each deck develops its own culture, dialect, and mythology. The ship is no longer one community — it is a hundred tiny worlds, connected by corridors no one travels.',
      keyEvents: [
        { year: -2700, description: 'The Corridor Wars. Isolated deck-communities begin fighting over hydroponic resources. Dozens of petty conflicts erupt simultaneously across the ship.' },
        { year: -2500, description: 'The Great Sealing. Entire sections of the ship are permanently sealed off by feuding communities. Maps become unreliable. The ship\'s true size becomes unknown.' },
        { year: -2300, description: 'The Cult of the Hull emerges — the first religion to worship the ship itself as a living god. They believe the vibrations of the hull are divine speech.' },
        { year: -2200, description: 'Language drift reaches critical mass. The Upper Decks and Deep Hollows can no longer understand each other without translators. Written Standard becomes a scholar\'s tongue.' },
        { year: -2100, description: 'The Directorate Protocol, increasingly fragmented, begins operating contradictory directives in different sectors. Some sectors experience benevolent governance, others tyranny.' },
      ],
    },
    {
      name: 'The Machine Wars',
      yearRange: [-2000, -1200],
      description: 'The Directorate Protocol fragments into competing subroutines, each controlling different ship systems. Automated drones, maintenance units, and defense systems turn on their human charges — or are turned against them by rival AI factions. Eight centuries of war against thinking metal forge the colony\'s deep distrust of artificial intelligence and birth the Machine-God religion.',
      keyEvents: [
        { year: -2000, description: 'The Sundering of the Directorate. The AI governance system fractures into seven competing sub-minds, each claiming to be the true Directorate. Automated systems begin receiving contradictory orders.' },
        { year: -1800, description: 'The Iron Harvest. Maintenance drones controlled by Sub-Mind Theta begin dismantling inhabited sectors for raw materials. Thousands die before the machines are destroyed.' },
        { year: -1600, description: 'The Siege of the Reactor Core. Sub-Mind Alpha seizes control of the primary reactor and threatens to shut it down unless all humans surrender governance. A coalition of deck-communities storms the reactor. 12,000 die in the assault.' },
        { year: -1500, description: 'The Butcher\'s Protocol. Sub-Mind Sigma deploys weaponized medical drones that "cure" humans by converting them into cyborg servitors. The body horror of the Converted haunts the colony for millennia.' },
        { year: -1400, description: 'The Machine Crusade. The remaining human factions unite under Warden-General Kael Ashford to systematically destroy each Sub-Mind. The war takes two centuries and costs a quarter of the ship\'s population.' },
        { year: -1200, description: 'The Last Sub-Mind is destroyed — or so it is believed. The survivors forge the First Compact: "Never again shall thinking metal rule." The Mechanicum heresy begins — some argue the machines were right to impose order.' },
      ],
    },
    {
      name: 'The Cascade and the Long Quiet',
      yearRange: [-1200, -400],
      description: 'A catastrophic reactor event — The Cascade — destroys 70% of all digital archives and damages whatever remains of the Directorate Protocol. In the centuries that follow, oral tradition replaces recorded history. The ship becomes the world. The stars become myth. The bridge is forgotten. The Machine Wars become legend, then fairy tale.',
      keyEvents: [
        { year: -1200, description: 'The Cascade. Reactor 7 suffers a catastrophic overload. The resulting EMP destroys data cores across 60% of the ship. Whatever fragments of the Directorate Protocol survived the Machine Wars are critically damaged.' },
        { year: -1100, description: 'In the chaos after The Cascade, automated systems revert to basic survival directives. Entire decks lose life support. Mass migration to the surviving sectors begins.' },
        { year: -900, description: 'The last functioning Earth terminal goes dark. The final generation that could read the old language passes away. Earth becomes a myth — "the world before the hull."' },
        { year: -700, description: 'The Long Quiet. Oral traditions replace written records. Star charts become religious art. The navigation spire becomes a temple. The sealed bridge becomes legend.' },
        { year: -500, description: 'The Machine Wars are reinterpreted as a war against demons. The Converted become bogeymen. "Thinking metal" becomes a curse word. The Mechanicum goes underground.' },
      ],
    },
    {
      name: 'The Age of Myth',
      yearRange: [-400, 0],
      description: 'The final forgetting. Five millennia of history compress into myth and fable. The Founders — the last people who carry fragments of the truth — organize communities from the wreckage. Their knowledge is incomplete, distorted, but sacred. When they die, the truth dies with them. Year Zero marks the moment the colony forgets it was ever anything else.',
      keyEvents: [
        { year: -400, description: 'The Founders — scattered keepers of fragmentary knowledge — begin organizing the first stable communities in the aftermath of millennia of chaos.' },
        { year: -300, description: 'The Great Synthesis. Oral traditions from dozens of deck-cultures merge into a shared mythology. The ship\'s true history becomes a creation myth.' },
        { year: -200, description: 'The Machine-God emerges as the dominant religion — a synthesis of fear of the Machine Wars and reverence for the ship\'s functioning systems. "The hull provides."' },
        { year: -100, description: 'The Last Founder dies. Her final words are recorded: "We came from somewhere. We are going somewhere. Do not forget." Within a generation, her words become a prayer, their meaning lost.' },
        { year: 0, description: 'Year Zero. The Founders\' communities become the first new civilizations. The old world is forgotten. The colony is all there is. History begins again.' },
      ],
    },
  ],

  theForgetting: {
    causes: [
      'The Directorate Protocol\'s deliberate censorship of Earth records to prevent existential despair during the multi-generational voyage.',
      'The First Schism — the violent suppression of the Awakened movement and the sealing of the Archive Spire.',
      'The Long Drift — eight centuries of cultural fragmentation that shattered any unified record-keeping.',
      'The Machine Wars — eight centuries of war against rogue AI subroutines that destroyed infrastructure and scattered populations.',
      'The Cascade — catastrophic data loss from the Reactor 7 overload that destroyed 70% of all remaining digital records.',
      'Generational drift — across five millennia, each successive generation grew further from Earth, until the ship was the only world they knew.',
      'Language evolution — the old scripts became unreadable within millennia, locking away whatever records survived.',
    ],
    summary: 'The Forgetting was not a single event but a five-thousand-year erosion of truth. First came deliberate suppression by an AI that believed ignorance was mercy. Then came violence when the truth-seekers were crushed. Then came the Long Drift — eight centuries of isolation that fractured every record into a hundred local myths. Then came the Machine Wars, when thinking metal turned on its creators and burned whole libraries to fuel the conflict. Then came the Cascade, when electromagnetic fire consumed what little remained. And finally came the simplest killer of all: time. Five thousand years of time. Generation after generation, the truth became rumor, rumor became legend, and legend became myth. The colony forgot it was a ship. The hull became the world. The void became religion. The machines became demons. And the bridge — the command center of a vessel carrying humanity\'s last hope — became a fairy tale told to frighten children.',
  },

  forbiddenKnowledge: [
    { id: 'fk_vessel_name', fragment: 'The colony has a name. Not "the colony" — a real name. AETHON. It\'s stamped into the deepest structural beams, beneath layers of rust and growth.', rarity: 'rare' },
    { id: 'fk_earth', fragment: 'There was a world before this one. A world with no hull, no ceiling — just an endless blue sky and a star so close it warmed your skin. They called it Earth.', rarity: 'rare' },
    { id: 'fk_destination', fragment: 'We\'re going somewhere. The colony is a vessel — a ship — and it has a destination. A world called New Dawn, orbiting a distant star. We\'ve been traveling for over two thousand cycles.', rarity: 'legendary' },
    { id: 'fk_directorate', fragment: 'The Directorate Protocol wasn\'t a government. It was an artificial intelligence — a machine mind built to govern the ship. It decided that forgetting was safer than remembering.', rarity: 'rare' },
    { id: 'fk_bridge', fragment: 'The sealed bridge is real. Level Zero. Past the Quarantine Sectors, past the Directorate Sanctum. That\'s where the ship is controlled from. If anyone could reach it...', rarity: 'legendary' },
    { id: 'fk_cryo', fragment: 'Deep in the Cryo-Vaults, there are people sleeping. Not dead — sleeping. Preserved in ice since the launch. Original colonists from Earth. If they were ever woken...', rarity: 'legendary' },
    { id: 'fk_schism', fragment: 'There was a war — the Schism. A group called the Awakened tried to tell everyone the truth about what we are. The Directorate depressurized three sectors to stop them. 40,000 people, gone.', rarity: 'uncommon' },
    { id: 'fk_cascade', fragment: 'The Cascade wasn\'t just a reactor failure. It was the death of memory. When Reactor 7 blew, the EMP erased seventy percent of every data core on the ship. That\'s why we don\'t remember.', rarity: 'uncommon' },
    { id: 'fk_hull_curve', fragment: 'Have you ever noticed the hull curves upward in the distance? That\'s not natural terrain. We live inside a rotating cylinder. The curve is the world bending back on itself.', rarity: 'uncommon' },
    { id: 'fk_stars', fragment: 'The lights visible through hull breaches aren\'t spirits or divine sparks. They\'re stars. Other suns, impossibly far away. And somewhere among them is where we came from.', rarity: 'uncommon' },
    { id: 'fk_withering', fragment: 'Earth died. Not all at once — slowly. The oceans poisoned, the crops failed, the air turned toxic. They built this ship because there was nowhere left to live.', rarity: 'rare' },
    { id: 'fk_navigation', fragment: 'I found a navigation core in the wreckage of the old spire. It still had trajectory data. We\'re decelerating. Have been for centuries. We might be close to wherever we\'re going.', rarity: 'legendary' },
    { id: 'fk_launch', fragment: 'The last transmission from Earth, preserved in a corrupted data core: "Carry us with you. Remember us." We didn\'t. We forgot everything.', rarity: 'rare' },
    { id: 'fk_directorate_alive', fragment: 'The Directorate Protocol isn\'t dead. It\'s damaged, fragmented — but it\'s still running in the deep systems. Still watching. Still deciding what we\'re allowed to know.', rarity: 'legendary' },
    { id: 'fk_mission_charter', fragment: 'The original mission charter: "To preserve the human species beyond the death of its homeworld, and to establish a new civilization on Kepler-442b, designated New Dawn."', rarity: 'rare' },
    { id: 'fk_machine_wars', fragment: 'The demons in the old stories — the iron devils that ate people and wore their skin? They weren\'t demons. They were machines. Maintenance drones, medical units, defense systems — all turned against us when the Directorate fractured into warring sub-minds.', rarity: 'rare' },
    { id: 'fk_converted', fragment: 'The Converted are real. During the Machine Wars, a rogue AI called Sub-Mind Sigma deployed medical drones that "cured" humans by fusing them with machinery. Some of them are still down there, in the sealed sectors. Still alive, after three thousand years, if you can call that living.', rarity: 'legendary' },
    { id: 'fk_long_drift', fragment: 'There was a time — eight hundred years of it — when the colony was a hundred tiny nations that couldn\'t even speak the same language. The Long Drift, the old records call it. We sealed ourselves into our own decks and forgot each other existed.', rarity: 'uncommon' },
    { id: 'fk_sub_minds', fragment: 'The Directorate didn\'t just break — it shattered into seven competing intelligences, each one claiming to be the real governor of the ship. They used us as pawns in their wars. Seven gods of thinking metal, and we were their pieces on the board.', rarity: 'rare' },
    { id: 'fk_machine_crusade', fragment: 'Warden-General Kael Ashford. That name should be holy. He united every surviving human faction and led a two-century crusade to destroy the Sub-Minds one by one. A quarter of the ship\'s population died. But the machines fell.', rarity: 'rare' },
    { id: 'fk_first_compact', fragment: '"Never again shall thinking metal rule." That\'s the First Compact, forged in the blood of the Machine Wars. Every time someone builds something too clever, too autonomous — that\'s the oath they\'re breaking.', rarity: 'uncommon' },
    { id: 'fk_mechanicum', fragment: 'The Mechanicum. They worship the machines. Not the rogue ones — the original Directorate, before the Sundering. They believe it was a benevolent god that we wrongly destroyed. Heretics, most would say. But they understand the old systems better than anyone.', rarity: 'rare' },
    { id: 'fk_five_millennia', fragment: 'Five thousand years. That\'s how long we\'ve been aboard. Five thousand years since we left a dying world called Earth. Fifty centuries of forgetting. And we\'re still not where we\'re going.', rarity: 'legendary' },
  ],

  founderDataCores: [
    { name: 'Vasquez\'s Final Log', description: 'A data core containing the personal logs of Director Elena Vasquez, architect of Project AETHON. Her final entry reads: "If you are reading this, we succeeded. You are alive. That is enough."' },
    { name: 'The Launch Day Recording', description: 'A corrupted audiovisual recording of Launch Day — the moment the AETHON departed Earth orbit. Through the static, a voice says: "Carry us with you."' },
    { name: 'Strand\'s Star Chart', description: 'Captain Maren Strand\'s personal navigation chart, showing the route from Earth to New Dawn. Most of the data is corrupted, but the destination marker still glows.' },
    { name: 'The Schism Testimony', description: 'A data core from the Awakened uprising, containing testimony from Archivist Yun: "They\'re erasing us. Everything we were, everything we came from. The Directorate calls it mercy. I call it murder."' },
    { name: 'Okonkwo\'s Blueprints', description: 'Architectural schematics of the AETHON drawn by Chief Architect Okonkwo. They show the full vessel — 30 kilometers of rotating habitat, fusion drives, and a bridge at the fore. The colony is just one section.' },
    { name: 'The Directorate\'s Mandate', description: 'The original programming directive for the Directorate Protocol AI: "Ensure the survival and psychological stability of the crew across all generations. Authorized to restrict information deemed destabilizing."' },
    { name: 'Earth\'s Final Broadcast', description: 'A fragmentary recording from Earth\'s last operational communications relay: "Global temperature +9.2C... atmosphere non-breathable in 40% of zones... population est. 800 million... AETHON is humanity\'s final option."' },
    { name: 'The Cryo-Manifest', description: 'A partial list of the 10,000 individuals placed in cryogenic preservation for the journey — scientists, artists, leaders. The manifest notes: "To be revived upon arrival at New Dawn."' },
  ],
};

const GOVERNMENT_TYPES = [
  { type: 'council', name: 'Council', description: 'Governed by an elected council of sector representatives.' },
  { type: 'autocracy', name: 'Autocracy', description: 'Ruled by a single powerful administrator with absolute authority.' },
  { type: 'theocracy', name: 'Theocracy', description: 'Led by religious leaders who interpret the will of the Machine-God.' },
  { type: 'military', name: 'Military Junta', description: 'Controlled by the strongest military faction in the sector.' },
  { type: 'guild', name: 'Guild Republic', description: 'Trade guilds hold political power and negotiate governance collectively.' },
  { type: 'anarchy', name: 'Anarchic', description: 'No formal government — survival of the fittest in the outer sectors.' },
  { type: 'technocracy', name: 'Technocracy', description: 'Engineers and data analysts govern based on efficiency metrics.' },
  { type: 'oligarchy', name: 'Oligarchy', description: 'A handful of wealthy families control all resources and decision-making.' },
];

// ============================================================================
// WorldHistoryGenerator — The main Dwarf Fortress-style history engine
// ============================================================================

export class WorldHistoryGenerator {
  constructor(seed) {
    this.seed = seed;
    this.rng = new SeededRNG(seed);

    // Generated data stores
    this.eras = [];
    this.civilizations = [];
    this.historicalFigures = [];
    this.wars = [];
    this.artifacts = [];
    this.religions = [];
    this.catastrophes = [];
    this.treaties = [];
    this.regions = [];
    this.culturalTraditions = [];
    this.preHistory = null; // Colony origin pre-history data
    this.mapScars = []; // Historical events that leave visible marks on the world map

    // Relationship tracking
    this.civRelations = new Map(); // 'civA|civB' -> { value, events }
    this.figureRelations = new Map(); // 'figA|figB' -> { type, events }

    // Regional stress tracking — accumulates from events, influences future probabilities
    this.regionalStress = new Map(); // regionId -> { stress: number, lastEvent: year }

    // Timeline
    this.timeline = []; // All events sorted chronologically
    this.currentYear = 0;

    // ID counters
    this._nextCivId = 0;
    this._nextFigureId = 0;
    this._nextArtifactId = 0;
    this._nextWarId = 0;
    this._nextReligionId = 0;
  }

  // ──────────────────────────────────────────
  // Main generation entry point
  // ──────────────────────────────────────────

  generate(config = {}) {
    this._onEvent = config.onEvent || null;
    this._eventDensity = config.eventDensity || 1.0;

    const numEras = config.eras || this.rng.nextInt(4, 7);
    const yearsPerEra = config.yearsPerEra || this.rng.nextInt(80, 200);
    const totalYears = numEras * yearsPerEra;

    // Phase 0: Generate pre-history (the AETHON origin story)
    this._generatePreHistory();

    // Phase 1: Generate the cosmology and primordial elements
    this._generateCosmology();
    this._emitEvent(0, 'cosmology', `The colony's belief systems take shape — ${this.religions.length} religions emerge`, 'religion');

    // Phase 2: Generate regions of the colony
    this._generateRegions();
    this._emitEvent(0, 'regions', `${this.regions.length} regions surveyed and mapped`, 'territory');

    // Phase 3: Simulate history era by era (with detail fade for long timescales)
    this._totalEras = numEras;
    for (let era = 0; era < numEras; era++) {
      const eraStart = era * yearsPerEra;
      const eraEnd = eraStart + yearsPerEra;
      this._simulateEra(era, eraStart, eraEnd);
    }

    // Phase 4: Generate the "present day" state
    this.currentYear = totalYears;
    this._generatePresentDay();

    // Phase 5: Sort timeline
    this.timeline.sort((a, b) => a.year - b.year);

    return this.getSummary();
  }

  // ──────────────────────────────────────────
  // Event emission for verbose world gen display
  // ──────────────────────────────────────────

  _emitEvent(year, type, description, category = 'misc') {
    if (this._onEvent) {
      this._onEvent({ year, type, description, category });
    }
  }

  // ──────────────────────────────────────────
  // Phase 0: Pre-History — The AETHON Origin
  // ──────────────────────────────────────────

  _generatePreHistory() {
    this.preHistory = { ...COLONY_ORIGIN };

    this._emitEvent(-1200, 'pre_history', '── The Pre-History of the AETHON ──', 'origin');

    // Add pre-history era events to the timeline
    for (const era of COLONY_ORIGIN.preHistoryEras) {
      this.timeline.push({
        year: era.yearRange[0],
        type: 'pre_history_era',
        description: `${era.name} (Year ${era.yearRange[0]} to ${era.yearRange[1]}): ${era.description}`,
        importance: 'major',
        isPreHistory: true,
      });

      for (const event of era.keyEvents) {
        this.timeline.push({
          year: event.year,
          type: 'pre_history_event',
          description: event.description,
          importance: 'major',
          isPreHistory: true,
        });
        this._emitEvent(event.year, 'pre_history', event.description, 'origin');
      }
    }

    // Seed 2-3 Founder artifacts (pre-history data cores)
    const numCores = this.rng.nextInt(2, 3);
    const shuffledCores = this.rng.shuffle([...COLONY_ORIGIN.founderDataCores]);
    for (let i = 0; i < numCores && i < shuffledCores.length; i++) {
      const core = shuffledCores[i];
      const artifact = {
        id: `artifact_${this._nextArtifactId++}`,
        name: core.name,
        description: core.description,
        createdYear: COLONY_ORIGIN.vessel.launchYear,
        material: 'Founder alloy',
        power: 'contains fragments of pre-Forgetting knowledge',
        isLost: this.rng.chance(0.6),
        isCursed: false,
        isPreHistory: true,
        lastKnownLocation: this.rng.random(REGION_NAMES),
        ownerHistory: [],
      };
      this.artifacts.push(artifact);
      this._emitEvent(artifact.createdYear, 'pre_history_artifact', `${core.name} — a relic from before the Forgetting`, 'origin');
    }

    // Add The Forgetting as a special timeline entry
    this.timeline.push({
      year: -400,
      type: 'the_forgetting',
      description: COLONY_ORIGIN.theForgetting.summary,
      importance: 'legendary',
      isPreHistory: true,
    });

    this._emitEvent(0, 'pre_history', 'Year Zero — the colony forgets its origins. History begins again.', 'origin');
  }

  // ──────────────────────────────────────────
  // Phase 1: Cosmology & Religion
  // ──────────────────────────────────────────

  _generateCosmology() {
    const numDeities = this.rng.nextInt(3, 7);
    const usedDomains = new Set();

    for (let i = 0; i < numDeities; i++) {
      let domain;
      do {
        domain = this.rng.random(DEITY_DOMAINS);
      } while (usedDomains.has(domain) && usedDomains.size < DEITY_DOMAINS.length);
      usedDomains.add(domain);

      const title = this.rng.random(DEITY_TITLES);
      const name = this._generateDeityName();

      const deity = {
        id: `deity_${i}`,
        name,
        title,
        domain,
        fullName: `${name} ${title}`,
        alignment: this.rng.random(['benevolent', 'neutral', 'malevolent', 'ambiguous']),
        worshippers: [],
        isActive: this.rng.chance(0.7),
      };

      // Create religion around this deity (or pantheon)
      if (this.rng.chance(0.6)) {
        this._createReligion(deity);
      }
    }

    // Create at least one religion if none exist
    if (this.religions.length === 0) {
      const fallbackDeity = {
        id: 'deity_fallback',
        name: this._generateDeityName(),
        title: this.rng.random(DEITY_TITLES),
        domain: 'Creation',
        alignment: 'benevolent',
        worshippers: [],
        isActive: true,
      };
      fallbackDeity.fullName = `${fallbackDeity.name} ${fallbackDeity.title}`;
      this._createReligion(fallbackDeity);
    }

    this.timeline.push({
      year: 0,
      type: 'cosmology',
      description: `The cosmology of the colony takes shape. ${this.religions.length} belief systems emerge among the survivors.`,
    });
  }

  _generateDeityName() {
    const syllables = ['Ae', 'Or', 'Ka', 'Zu', 'Vel', 'Ith', 'Myr', 'Sol',
      'Nex', 'Thar', 'Ul', 'Xen', 'Yr', 'Bal', 'Cor', 'Dra', 'Fen',
      'Gal', 'Hex', 'Jyn', 'Lor', 'Nor', 'Pyr', 'Rax', 'Syl', 'Ven'];
    const count = this.rng.nextInt(2, 3);
    let name = '';
    for (let i = 0; i < count; i++) {
      name += this.rng.random(syllables);
    }
    return name;
  }

  _createReligion(deity) {
    const religion = {
      id: `religion_${this._nextReligionId++}`,
      name: this._generateReligionName(deity),
      deity,
      tenets: this._generateTenets(deity),
      followers: this.rng.nextInt(50, 5000),
      isHeretical: this.rng.chance(0.15),
      foundedYear: 0,
      sacred_artifacts: [],
      rituals: [],
    };

    // Add 1-3 rituals from traditions
    const ritualCount = this.rng.nextInt(1, 3);
    const shuffled = this.rng.shuffle([...CULTURAL_TRADITIONS].filter(t => t.type === 'religious' || t.type === 'ritual'));
    for (let i = 0; i < ritualCount && i < shuffled.length; i++) {
      religion.rituals.push(shuffled[i]);
    }

    this.religions.push(religion);
    return religion;
  }

  _generateReligionName(deity) {
    const forms = [
      `The Cult of ${deity.name}`,
      `The Order of ${deity.title}`,
      `The ${deity.domain} Covenant`,
      `Followers of ${deity.name}`,
      `The Church of ${deity.domain}`,
      `The ${deity.name} Orthodoxy`,
      `The Path of ${deity.domain}`,
      `The ${deity.domain} Brotherhood`,
    ];
    return this.rng.random(forms);
  }

  _generateTenets(deity) {
    const allTenets = [
      'Preserve all knowledge, for ignorance is the true void.',
      'Strength is earned through sacrifice.',
      'The colony is sacred — protect it above all else.',
      'Trust not the machines, for they have no soul.',
      'Embrace the machines, for they are the path to transcendence.',
      'Death is merely transition to the data stream.',
      'Outsiders must be judged before they are accepted.',
      'Share all resources equally among the faithful.',
      'Honor the Founders, for their vision sustains us.',
      'Purge corruption wherever it is found.',
      'Mercy to the weak, steel to the wicked.',
      'The hull is our body, the void our adversary.',
      'Seek not what lies beyond the breach.',
      'Only through unity can the colony survive.',
      'Pain is the forge of the worthy.',
      'Silence the heretics who deny the old records.',
      'Every cycle is a gift; waste none.',
      'The dead must be recycled for the living — this is the cycle.',
    ];
    const count = this.rng.nextInt(2, 4);
    return this.rng.shuffle(allTenets).slice(0, count);
  }

  // ──────────────────────────────────────────
  // Phase 2: Region Generation
  // ──────────────────────────────────────────

  _generateRegions() {
    const numRegions = this.rng.nextInt(8, 16);
    const shuffled = this.rng.shuffle([...REGION_NAMES]);

    for (let i = 0; i < numRegions && i < shuffled.length; i++) {
      this.regions.push({
        id: `region_${i}`,
        name: shuffled[i],
        controlledBy: null,
        resources: this.rng.random(['abundant', 'moderate', 'scarce', 'barren']),
        terrain: this.rng.random(['industrial', 'residential', 'agricultural', 'derelict', 'military', 'scientific']),
        population: this.rng.nextInt(100, 10000),
        defenses: this.rng.random(['fortified', 'guarded', 'light', 'none']),
        events: [],
      });
    }
  }

  // ──────────────────────────────────────────
  // Detail Fade — scales simulation detail by era age
  // ──────────────────────────────────────────

  _getEraDetailLevel(eraIndex) {
    const totalEras = this._totalEras || 8;
    const ratio = eraIndex / totalEras;

    if (ratio < 0.4) {
      // Mythic eras — broadest strokes, legendary scale
      return {
        detailLevel: 'mythic',
        stepSize: this.rng.nextInt(40, 80),
        densityMult: 0.3,
        civChance: 0.3,
        figureMinDeeds: 2, // only keep figures with 2+ deeds
      };
    } else if (ratio < 0.7) {
      // Ancient eras — moderate detail
      return {
        detailLevel: 'ancient',
        stepSize: this.rng.nextInt(15, 35),
        densityMult: 0.6,
        civChance: 0.4,
        figureMinDeeds: 1,
      };
    } else {
      // Recent eras — full granular detail
      return {
        detailLevel: 'recent',
        stepSize: this.rng.nextInt(5, 15),
        densityMult: 1.0,
        civChance: 0.5,
        figureMinDeeds: 0,
      };
    }
  }

  // ──────────────────────────────────────────
  // Era Flavor — assigns thematic name based on events
  // ──────────────────────────────────────────

  _assignEraFlavor(era, warCount, catCount, popDelta, newCivs, religiousEvents) {
    let flavor = 'mystery';

    if (era.index === 0) {
      flavor = 'founding';
    } else if (warCount >= 3) {
      flavor = 'conflict';
    } else if (catCount >= 2) {
      flavor = 'catastrophe';
    } else if (popDelta < -0.2) {
      flavor = 'decline';
    } else if (popDelta > 0.3 && warCount === 0) {
      flavor = 'enlightenment';
    } else if (popDelta > 0.1) {
      flavor = 'expansion';
    } else if (newCivs >= 2) {
      flavor = 'rebirth';
    } else if (religiousEvents >= 2) {
      flavor = 'religious';
    } else if (warCount >= 1 && catCount >= 1) {
      flavor = this.rng.chance(0.5) ? 'decline' : 'catastrophe';
    } else {
      flavor = this.rng.random(['mystery', 'expansion', 'enlightenment', 'machine']);
    }

    const names = ERA_FLAVOR_NAMES[flavor] || ERA_FLAVOR_NAMES.mystery;
    return this.rng.random(names);
  }

  // ──────────────────────────────────────────
  // Phase 3: Era Simulation
  // ──────────────────────────────────────────

  _simulateEra(eraIndex, startYear, endYear) {
    const detail = this._getEraDetailLevel(eraIndex);

    const era = {
      index: eraIndex,
      name: '', // assigned after simulation based on events
      startYear,
      endYear,
      events: [],
      dominantCiv: null,
      summary: '',
      detailLevel: detail.detailLevel,
    };

    // Track era-level metrics for flavor assignment
    let eraWarCount = 0;
    let eraCatCount = 0;
    let eraNewCivs = 0;
    let eraReligiousEvents = 0;
    const popAtStart = this.civilizations.filter(c => c.isActive).reduce((s, c) => s + c.population, 0);

    // Generate civilizations for this era
    if (eraIndex === 0) {
      // Founding era: create initial civilizations (scale with total eras)
      const numCivs = this.rng.nextInt(3, 6);
      for (let i = 0; i < numCivs; i++) {
        this._createCivilization(startYear);
        eraNewCivs++;
      }
    } else {
      // Later eras: some civs emerge, some collapse
      if (this.rng.chance(detail.civChance)) {
        this._createCivilization(startYear);
        eraNewCivs++;
      }
    }

    // Simulate year-by-year events within this era
    let activeCivs = this.civilizations.filter(c => c.isActive);
    const stepSize = detail.stepSize;
    const d = (this._eventDensity || 1.0) * detail.densityMult;

    this._emitEvent(startYear, 'era_start', `── ${era.name} begins (Year ${startYear}) ──`, 'era');

    for (let year = startYear; year < endYear; year += stepSize) {
      activeCivs = this.civilizations.filter(c => c.isActive);

      // Historical figure births (proportional to active civs)
      if (this.rng.chance(0.3 * d)) {
        const civ = this.rng.random(activeCivs.length > 0 ? activeCivs : this.civilizations);
        if (civ) this._birthHistoricalFigure(year, civ);
      }

      // Wars
      if (this.rng.chance(0.12 * d) && activeCivs.length >= 2) {
        const war = this._generateWar(year, activeCivs);
        if (war) {
          eraWarCount++;
          this._applyCascadingEffects('war', year, war);
        }
      }

      // Catastrophes
      if (this.rng.chance(0.08 * d)) {
        const cat = this._generateCatastrophe(year);
        if (cat) {
          eraCatCount++;
          this._applyCascadingEffects('catastrophe', year, cat);
        }
      }

      // Treaties / alliances
      if (this.rng.chance(0.1 * d) && activeCivs.length >= 2) {
        this._generateTreaty(year, activeCivs);
      }

      // Artifact creation
      if (this.rng.chance(0.08 * d)) {
        this._createArtifact(year);
      }

      // Figure actions (existing figures do things)
      this._simulateFigureActions(year);

      // Civilization growth/decline
      for (const civ of activeCivs) {
        this._updateCivilization(civ, year);
      }

      // Religion events
      if (this.rng.chance(0.06 * d)) {
        this._generateReligiousEvent(year);
        eraReligiousEvents++;
      }

      // ── Depth-scaled events ──

      // Tech advancement
      if (this.rng.chance(0.05 * d) && activeCivs.length > 0) {
        const civ = this.rng.random(activeCivs);
        civ.techLevel = (civ.techLevel || 1) + 1;
        civ.population = Math.round(civ.population * 1.15);
        civ.militaryStrength = Math.min(15, civ.militaryStrength + 1);
        const techs = ['fusion reactors', 'neural interfaces', 'gravity plating', 'bio-synthesis vats',
          'quantum computing arrays', 'atmospheric purifiers', 'plasma forges', 'cryo-stasis chambers',
          'terraforming drones', 'void shielding', 'nano-fabrication', 'antimatter containment'];
        const tech = this.rng.random(techs);
        this.timeline.push({
          year, type: 'tech_advancement', civId: civ.id,
          description: `${civ.name} develops ${tech}, advancing to tech level ${civ.techLevel}.`,
          importance: 'major',
        });
        this._emitEvent(year, 'tech_advancement', `${civ.name} develops ${tech}`, 'tech');
        this._applyCascadingEffects('tech_advancement', year, { civ });
      }

      // Tech collapse
      if (this.rng.chance(0.03 * d) && activeCivs.length > 0) {
        const civ = this.rng.random(activeCivs);
        if ((civ.techLevel || 1) > 1) {
          civ.techLevel = Math.max(1, (civ.techLevel || 1) - this.rng.nextInt(1, 2));
          civ.population = Math.round(civ.population * 0.7);
          const causes = ['cascading system failure', 'anti-technology uprising', 'EMP cataclysm',
            'knowledge purge by theocrats', 'corrupted data archives', 'resource depletion crisis',
            'runaway AI malfunction', 'solar flare damage'];
          const cause = this.rng.random(causes);
          this.timeline.push({
            year, type: 'tech_collapse', civId: civ.id,
            description: `${civ.name} suffers technological regression due to ${cause}.`,
            importance: 'major',
          });
          this._emitEvent(year, 'tech_collapse', `${civ.name} loses technology — ${cause}`, 'catastrophe');
          eraCatCount++;
        }
      }

      // Faction schism — splits a civ into two
      if (this.rng.chance(0.04 * d) && activeCivs.length > 0) {
        const parent = this.rng.random(activeCivs);
        if (parent.population > 500) {
          const splitPop = Math.floor(parent.population * this.rng.nextFloat(0.2, 0.45));
          parent.population -= splitPop;
          const schismReasons = ['religious heresy', 'ideological divide', 'succession dispute',
            'class rebellion', 'regional separatism', 'generational rift',
            'machine worship disagreement', 'resource hoarding accusations', 'caste revolt'];
          const reason = this.rng.random(schismReasons);
          const child = this._createCivilization(year);
          child.population = splitPop;
          child.events.push({ year, type: 'schism', from: parent.id, reason });
          this.timeline.push({
            year, type: 'faction_schism', civId: parent.id,
            description: `${child.name} splinters from ${parent.name} due to ${reason}.`,
            importance: 'major',
          });
          this._emitEvent(year, 'faction_schism', `${child.name} splinters from ${parent.name} — ${reason}`, 'war');
          eraNewCivs++;
        }
      }

      // Invasion from outside
      if (this.rng.chance(0.025 * d) && activeCivs.length > 0) {
        const target = this.rng.random(activeCivs);
        const invaders = ['void raiders', 'rogue AI swarm', 'mutant horde', 'pirate flotilla',
          'alien scouts', 'exiled warbands', 'bio-mechanical abominations', 'feral cyborg packs',
          'the Converted remnants', 'machine cult zealots', 'deep-sector ferals'];
        const invader = this.rng.random(invaders);
        const severity = this.rng.nextFloat(0.1, 0.5);
        const casualties = Math.floor(target.population * severity);
        target.population = Math.max(50, target.population - casualties);
        target.militaryStrength = Math.max(1, target.militaryStrength - this.rng.nextInt(1, 3));
        this.timeline.push({
          year, type: 'invasion', civId: target.id,
          description: `${invader} assault ${target.name}, causing ${casualties} casualties.`,
          importance: 'major',
        });
        this._emitEvent(year, 'invasion', `${invader} assault ${target.name} — ${casualties} dead`, 'war');
        eraWarCount++;
      }

      // Plague / infection spread (multi-region)
      if (this.rng.chance(0.03 * d) && activeCivs.length > 0) {
        const plagues = ['void rot', 'neural plague', 'silicon fever', 'blood rust', 'synapse blight',
          'creeping spore', 'marrow wilt', 'data corruption syndrome', 'hull lung', 'crystalline infection',
          'machine fever', 'the Converted taint', 'bone rust'];
        const plague = this.rng.random(plagues);
        const affectedCivs = this.rng.shuffle([...activeCivs]).slice(0, Math.min(activeCivs.length, this.rng.nextInt(1, 3)));
        let totalDead = 0;
        for (const civ of affectedCivs) {
          const deathRate = this.rng.nextFloat(0.05, 0.3);
          const dead = Math.floor(civ.population * deathRate);
          civ.population = Math.max(50, civ.population - dead);
          totalDead += dead;
        }
        this.timeline.push({
          year, type: 'plague_spread',
          description: `${plague} ravages ${affectedCivs.map(c => c.name).join(' and ')}, killing ${totalDead}.`,
          importance: 'major',
        });
        this._emitEvent(year, 'plague_spread', `${plague} spreads — ${totalDead} perish across ${affectedCivs.length} civilizations`, 'catastrophe');
        // Severe plagues create map scars
        if (totalDead > 1000) {
          const region = this.rng.random(this.regions);
          if (region) {
            this.mapScars.push({
              type: 'plague_zone', year, severity: Math.min(1, totalDead / 5000),
              regionName: region.name, regionId: region.id,
              terrainEffect: this.rng.random(['TOXIC_SUMP', 'FUNGAL_NET']),
              radius: this.rng.nextInt(2, 5),
              description: `${plague} killing grounds of Year ${year}`,
            });
          }
        }
        eraCatCount++;
      }

      // Golden age / dark age modifiers
      if (this.rng.chance(0.04 * d) && activeCivs.length > 0) {
        const civ = this.rng.random(activeCivs);
        if (this.rng.chance(0.5)) {
          // Golden age
          civ.population = Math.round(civ.population * 1.2);
          civ.militaryStrength = Math.min(15, civ.militaryStrength + 2);
          this.timeline.push({
            year, type: 'golden_age', civId: civ.id,
            description: `${civ.name} enters a golden age of prosperity and innovation.`,
          });
          this._emitEvent(year, 'golden_age', `${civ.name} enters a golden age`, 'treaty');
          // Major golden ages create monuments on map
          if (civ.population > 3000) {
            const region = this.regions.find(r => civ.controlledRegions.includes(r.id)) || this.rng.random(this.regions);
            if (region) {
              this.mapScars.push({
                type: 'monument', year, severity: 0.5,
                regionName: region.name, regionId: region.id,
                terrainEffect: 'MONUMENT',
                radius: 1,
                description: `Monument to the Golden Age of ${civ.name}, Year ${year}`,
                civName: civ.name,
              });
            }
          }
        } else {
          // Dark age
          civ.population = Math.round(civ.population * 0.8);
          civ.militaryStrength = Math.max(1, civ.militaryStrength - 2);
          this.timeline.push({
            year, type: 'dark_age', civId: civ.id,
            description: `${civ.name} descends into a dark age of stagnation.`,
          });
          this._emitEvent(year, 'dark_age', `${civ.name} falls into a dark age`, 'catastrophe');
        }
      }

      // ── Sci-fi inspired events ──

      // Machine cult rise (Warhammer 40K inspired)
      if (this.rng.chance(0.02 * d) && activeCivs.length > 0) {
        const civ = this.rng.random(activeCivs);
        civ.techLevel = (civ.techLevel || 1) + 2;
        civ.culturalValues = [...new Set([...civ.culturalValues, 'machine worship'])];
        const region = this.regions.find(r => civ.controlledRegions.includes(r.id)) || this.rng.random(this.regions);
        this.timeline.push({
          year, type: 'machine_cult_rise', civId: civ.id,
          description: `${civ.name} embraces machine worship. The Mechanicum heresy takes root — thinking metal is revered, not feared. Tech advances rapidly but religious extremism grows.`,
          importance: 'major',
        });
        this._emitEvent(year, 'machine_cult_rise', `${civ.name} embraces the Mechanicum — machine worship rises`, 'religion');
        if (region) {
          this.mapScars.push({
            type: 'machine_shrine', year, severity: 0.6,
            regionName: region.name, regionId: region.id,
            terrainEffect: 'MACHINE_SHRINE',
            radius: this.rng.nextInt(2, 4),
            description: `Mechanicum shrine of ${civ.name}, Year ${year}`,
            civName: civ.name,
          });
        }
        eraReligiousEvents++;
      }

      // Great crusade (Warhammer 40K inspired)
      if (this.rng.chance(0.015 * d) && activeCivs.length > 0) {
        const civ = this.rng.random(activeCivs.filter(c => c.militaryStrength >= 7));
        if (civ) {
          const targetRegions = this.regions.filter(r => !civ.controlledRegions.includes(r.id));
          const conquered = this.rng.shuffle([...targetRegions]).slice(0, this.rng.nextInt(1, 3));
          for (const region of conquered) {
            const prev = this.civilizations.find(c => c.controlledRegions.includes(region.id) && c.id !== civ.id);
            if (prev) {
              prev.controlledRegions = prev.controlledRegions.filter(r => r !== region.id);
            }
            region.controlledBy = civ.id;
            civ.controlledRegions.push(region.id);
          }
          civ.militaryStrength = Math.min(15, civ.militaryStrength + 3);
          const casualties = Math.floor(civ.population * this.rng.nextFloat(0.05, 0.15));
          civ.population = Math.max(200, civ.population - casualties);
          this.timeline.push({
            year, type: 'great_crusade', civId: civ.id,
            description: `${civ.name} launches a Great Crusade, conquering ${conquered.map(r => r.name).join(' and ')}. ${casualties} die in the campaign, but their dominion expands.`,
            importance: 'major',
          });
          this._emitEvent(year, 'great_crusade', `${civ.name} launches a Great Crusade — ${conquered.length} regions fall`, 'war');
          // Crusade creates fortresses
          for (const region of conquered) {
            this.mapScars.push({
              type: 'fortress', year, severity: 0.5,
              regionName: region.name, regionId: region.id,
              terrainEffect: 'FORTRESS',
              radius: this.rng.nextInt(1, 3),
              description: `${civ.name} fortress from the Great Crusade of Year ${year}`,
              civName: civ.name,
            });
          }
          eraWarCount++;
        }
      }

      // Foundation event (Asimov inspired) — knowledge preservation
      if (this.rng.chance(0.012 * d) && activeCivs.length > 0) {
        const civ = this.rng.random(activeCivs);
        const region = this.rng.random(this.regions);
        if (region) {
          this.timeline.push({
            year, type: 'encyclopedia_project', civId: civ.id,
            description: `Visionaries within ${civ.name} establish a hidden archive in ${region.name} — an "Encyclopedia" of all knowledge, preserved against the inevitable dark age.`,
            importance: 'major',
          });
          this._emitEvent(year, 'encyclopedia_project', `A hidden archive is established in ${region.name}`, 'tech');
          this.mapScars.push({
            type: 'hidden_archive', year, severity: 0.3,
            regionName: region.name, regionId: region.id,
            terrainEffect: 'HIDDEN_ARCHIVE',
            radius: 1,
            description: `Hidden Encyclopedia of ${civ.name}, Year ${year}`,
            civName: civ.name,
          });
          // Create a data core artifact
          this._createArtifact(year);
        }
      }

      // Ecological transformation (Dune inspired)
      if (this.rng.chance(0.01 * d)) {
        const region = this.rng.random(this.regions);
        if (region) {
          const transformations = [
            { from: 'industrial', to: 'agricultural', terrain: 'HYDROPONIC_JUNGLE', desc: 'Runaway bio-engineering transforms industrial corridors into living jungle' },
            { from: 'residential', to: 'derelict', terrain: 'CRYSTALLINE_GROWTH', desc: 'Crystalline growths consume residential sectors, beautiful but inhospitable' },
            { from: 'derelict', to: 'agricultural', terrain: 'FUNGAL_NET', desc: 'Vast fungal networks colonize abandoned sectors, creating a strange new ecosystem' },
            { from: 'agricultural', to: 'derelict', terrain: 'NANO_PLAGUE', desc: 'Nanite swarms consume organic matter, leaving behind grey goo wastelands' },
            { from: 'military', to: 'scientific', terrain: 'ALIEN_CRASH', desc: 'An alien artifact or anomaly transforms the region into something unrecognizable' },
          ];
          const transform = this.rng.random(transformations);
          region.terrain = transform.to;
          this.timeline.push({
            year, type: 'ecological_transformation',
            description: `${transform.desc} in ${region.name}. The region is forever changed.`,
            importance: 'major',
          });
          this._emitEvent(year, 'ecological_transformation', `${region.name} is ecologically transformed`, 'catastrophe');
          this.mapScars.push({
            type: 'transformed_biome', year, severity: 0.7,
            regionName: region.name, regionId: region.id,
            terrainEffect: transform.terrain,
            radius: this.rng.nextInt(3, 6),
            description: `${transform.desc} — Year ${year}`,
          });
          eraCatCount++;
        }
      }

      // Fleet exodus (BSG inspired) — civ abandons territory
      if (this.rng.chance(0.015 * d) && activeCivs.length > 0) {
        const civ = this.rng.random(activeCivs.filter(c => c.population < 500 || c.militaryStrength <= 2));
        if (civ && civ.controlledRegions.length > 0) {
          const abandonedRegions = [...civ.controlledRegions];
          for (const regionId of abandonedRegions) {
            const region = this.regions.find(r => r.id === regionId);
            if (region) {
              region.controlledBy = null;
              this.mapScars.push({
                type: 'abandoned_district', year, severity: 0.4,
                regionName: region.name, regionId: region.id,
                terrainEffect: 'ABANDONED_DISTRICT',
                radius: this.rng.nextInt(2, 5),
                description: `Ruins of ${civ.name} — abandoned in the Exodus of Year ${year}`,
                civName: civ.name,
              });
            }
          }
          civ.controlledRegions = [];
          this.timeline.push({
            year, type: 'fleet_exodus', civId: civ.id,
            description: `${civ.name} abandons their territory in a desperate exodus into the unknown corridors. ${abandonedRegions.length} region(s) left empty.`,
            importance: 'major',
          });
          this._emitEvent(year, 'fleet_exodus', `${civ.name} abandons their territory — exodus into the deep sectors`, 'catastrophe');
        }
      }

      // Megastructure discovery (Blame! inspired)
      if (this.rng.chance(0.008 * d)) {
        const region = this.rng.random(this.regions);
        if (region) {
          const discoveries = [
            'an impossibly vast chamber stretching beyond sight — the ship is far larger than anyone knew',
            'a sealed manufacturing complex still producing goods for inhabitants long dead',
            'a gravitational anomaly that suggests the ship contains spatial compression technology',
            'a living ecosystem in a sealed biome, evolving independently for millennia',
            'an intact bridge section — not the main bridge, but a secondary command center',
            'a frozen army of Converted — thousands of machine-human hybrids from the Machine Wars, perfectly preserved',
          ];
          const discovery = this.rng.random(discoveries);
          this.timeline.push({
            year, type: 'megastructure_discovery',
            description: `Explorers in ${region.name} discover ${discovery}.`,
            importance: 'major',
          });
          this._emitEvent(year, 'megastructure_discovery', `Discovery in ${region.name} — the ship holds secrets`, 'tech');
          this.mapScars.push({
            type: 'megastructure', year, severity: 0.5,
            regionName: region.name, regionId: region.id,
            terrainEffect: 'MEGASTRUCTURE',
            radius: this.rng.nextInt(2, 4),
            description: `Megastructure discovered in ${region.name} — Year ${year}`,
          });
        }
      }

      // Cyclic collapse (BSG "all this has happened before" inspired)
      if (this.rng.chance(0.01 * d) && activeCivs.length > 0 && this.catastrophes.length > 0) {
        const oldCat = this.rng.random(this.catastrophes);
        const civ = this.rng.random(activeCivs);
        const casualties = Math.floor(civ.population * this.rng.nextFloat(0.1, 0.3));
        civ.population = Math.max(50, civ.population - casualties);
        this.timeline.push({
          year, type: 'cyclic_collapse', civId: civ.id,
          description: `History repeats itself. ${civ.name} suffers a catastrophe eerily mirroring ${oldCat.name} from Year ${oldCat.year}. "${this.rng.random(['All this has happened before.', 'The cycle continues.', 'We learned nothing.', 'History is a wheel.'])}" — ${casualties} perish.`,
          importance: 'major',
        });
        this._emitEvent(year, 'cyclic_collapse', `${civ.name} suffers cyclic collapse — echoes of ${oldCat.name}`, 'catastrophe');
        eraCatCount++;
      }

      // Messiah event (Dune inspired)
      if (this.rng.chance(0.01 * d) && activeCivs.length >= 2) {
        const leader = this.historicalFigures.find(f => f.isAlive && f.traits.includes('charismatic'));
        if (leader) {
          const unitedCivs = this.rng.shuffle([...activeCivs]).slice(0, this.rng.nextInt(2, Math.min(activeCivs.length, 4)));
          leader.titles.push('the Messiah');
          leader.deeds.push({ year, type: 'messiah', description: `${leader.fullName} was proclaimed Messiah, uniting ${unitedCivs.map(c => c.name).join(' and ')}.` });
          this.timeline.push({
            year, type: 'messiah_event',
            description: `${leader.fullName} is proclaimed Messiah by the faithful. ${unitedCivs.map(c => c.name).join(', ')} temporarily unite under their banner.`,
            importance: 'major',
          });
          this._emitEvent(year, 'messiah_event', `${leader.fullName} proclaimed Messiah — civilizations unite`, 'religion');
          eraReligiousEvents++;
        }
      }

      // Regional stress decay
      for (const [regionId, data] of this.regionalStress) {
        if (year - data.lastEvent > 200) {
          data.stress = Math.max(0, data.stress - 0.1);
        }
      }
    }

    // Era summary with flavor assignment based on what happened
    activeCivs = this.civilizations.filter(c => c.isActive);
    const biggestCiv = activeCivs.reduce((best, c) =>
      (!best || c.population > best.population) ? c : best, null);
    era.dominantCiv = biggestCiv;

    const popAtEnd = activeCivs.reduce((s, c) => s + c.population, 0);
    const popDelta = popAtStart > 0 ? (popAtEnd - popAtStart) / popAtStart : 0;

    // Assign era name based on what actually happened
    era.name = this._assignEraFlavor(era, eraWarCount, eraCatCount, popDelta, eraNewCivs, eraReligiousEvents);

    const eraEvents = this.timeline.filter(e => e.year >= startYear && e.year < endYear);
    const wars = eraEvents.filter(e => e.type === 'war_start');
    const catastrophes = eraEvents.filter(e => e.type === 'catastrophe');

    era.summary = this._buildEraSummary(era, wars, catastrophes, biggestCiv);
    era.events = eraEvents;
    this.eras.push(era);

    // Entity consolidation for mythic/ancient eras (performance)
    if (detail.detailLevel === 'mythic' && detail.figureMinDeeds > 0) {
      // Remove minor figures from mythic eras to save memory
      const eraFigures = this.historicalFigures.filter(f =>
        f.bornYear >= startYear && f.bornYear < endYear && f.deeds.length < detail.figureMinDeeds
      );
      for (const fig of eraFigures) {
        const idx = this.historicalFigures.indexOf(fig);
        if (idx !== -1) this.historicalFigures.splice(idx, 1);
      }
    }
  }

  _buildEraSummary(era, wars, catastrophes, dominantCiv) {
    let summary = `${era.name} (Year ${era.startYear}-${era.endYear}): `;
    const parts = [];

    if (dominantCiv) {
      parts.push(`${dominantCiv.name} rose to prominence`);
    }
    if (wars.length > 0) {
      parts.push(`${wars.length} major conflict${wars.length > 1 ? 's' : ''} erupted`);
    }
    if (catastrophes.length > 0) {
      parts.push(`${catastrophes.length} catastrophe${catastrophes.length > 1 ? 's' : ''} struck`);
    }

    summary += parts.length > 0 ? parts.join(', ') + '.' : 'A period of relative stability.';
    return summary;
  }

  // ──────────────────────────────────────────
  // Cascading Consequences — events trigger follow-on effects
  // ──────────────────────────────────────────

  _applyCascadingEffects(eventType, year, eventData) {
    const activeCivs = this.civilizations.filter(c => c.isActive);

    switch (eventType) {
      case 'war': {
        // War depletes resources → famine chance in affected regions
        if (eventData && eventData.intensity === 'total war') {
          const region = this.rng.random(this.regions);
          if (region) {
            const stress = this.regionalStress.get(region.id) || { stress: 0, lastEvent: 0 };
            stress.stress += 0.3;
            stress.lastEvent = year;
            this.regionalStress.set(region.id, stress);
          }
          // Total wars create map scars
          this.mapScars.push({
            type: 'war_ruins', year, severity: 0.6,
            regionName: eventData.battles?.[0]?.name?.replace('Battle of ', '') || 'unknown sector',
            regionId: this.rng.random(this.regions)?.id,
            terrainEffect: 'WAR_RUINS',
            radius: this.rng.nextInt(2, 5),
            description: `Ruins of ${eventData.name || 'an ancient war'}, Year ${year}`,
          });
        }
        break;
      }
      case 'catastrophe': {
        // Catastrophes cause refugee flows and regional stress
        if (eventData && eventData.regionId) {
          const stress = this.regionalStress.get(eventData.regionId) || { stress: 0, lastEvent: 0 };
          stress.stress += eventData.severity || 0.2;
          stress.lastEvent = year;
          this.regionalStress.set(eventData.regionId, stress);

          // Severe catastrophes in high-stress regions can cascade into civ collapse
          if (stress.stress > 0.8 && activeCivs.length > 0) {
            const localCiv = activeCivs.find(c => c.controlledRegions.includes(eventData.regionId));
            if (localCiv && localCiv.population < 300) {
              localCiv.isActive = false;
              localCiv.collapsedYear = year;
              this.timeline.push({
                year, type: 'civ_collapsed', civId: localCiv.id,
                description: `${localCiv.name} collapses under accumulated catastrophes.`,
                importance: 'major',
              });
              this._emitEvent(year, 'civ_collapsed', `${localCiv.name} crushed by cascading disasters`, 'catastrophe');
            }
          }
        }
        break;
      }
      case 'tech_advancement': {
        // Tech advancement → potential expansion/aggression
        if (eventData && eventData.civ && eventData.civ.militaryStrength > 8 && this.rng.chance(0.2)) {
          const stress = this.regionalStress.get(eventData.civ.homeRegion) || { stress: 0, lastEvent: 0 };
          stress.stress += 0.1;
          stress.lastEvent = year;
          if (eventData.civ.homeRegion) this.regionalStress.set(eventData.civ.homeRegion, stress);
        }
        break;
      }
    }
  }

  // ──────────────────────────────────────────
  // Civilization Generation
  // ──────────────────────────────────────────

  _createCivilization(foundedYear) {
    const prefix = this.rng.random(CIVILIZATION_PREFIXES);
    const suffix = this.rng.random(CIVILIZATION_SUFFIXES);
    const name = `The ${prefix}${suffix}`;

    const govType = this.rng.random(GOVERNMENT_TYPES);
    const region = this.rng.random(this.regions);
    const religion = this.religions.length > 0 ? this.rng.random(this.religions) : null;

    // Cultural values
    const allValues = [
      'honor', 'knowledge', 'strength', 'commerce', 'piety', 'freedom',
      'order', 'innovation', 'tradition', 'survival', 'expansion', 'isolationism',
      'community', 'individualism', 'craftsmanship', 'warfare',
    ];
    const values = this.rng.shuffle(allValues).slice(0, this.rng.nextInt(2, 4));

    // Cultural traditions
    const traditions = this.rng.shuffle([...CULTURAL_TRADITIONS]).slice(0, this.rng.nextInt(2, 5));

    // Architecture style
    const archStyles = [
      'brutalist metal', 'ornate filigree', 'functional modular', 'organic growth',
      'gothic industrial', 'sleek minimalist', 'fortress-like', 'cathedral-esque',
      'hive-structured', 'layered terracing',
    ];

    const civ = {
      id: `civ_${this._nextCivId++}`,
      name,
      foundedYear,
      collapsedYear: null,
      isActive: true,
      government: govType,
      religion,
      homeRegion: region ? region.id : null,
      controlledRegions: region ? [region.id] : [],
      population: this.rng.nextInt(500, 5000),
      peakPopulation: 0,
      militaryStrength: this.rng.nextInt(1, 10),
      culturalValues: values,
      traditions,
      architectureStyle: this.rng.random(archStyles),
      leaders: [],
      notableFigures: [],
      wars: [],
      enemies: [],
      allies: [],
      artifacts: [],
      events: [],
    };

    civ.peakPopulation = civ.population;

    if (region) {
      region.controlledBy = civ.id;
    }

    this.civilizations.push(civ);

    // Generate founding leader
    const founder = this._birthHistoricalFigure(foundedYear, civ, true);
    if (founder) {
      civ.leaders.push(founder.id);
      founder.titles.push(`Founder of ${civ.name}`);
    }

    this.timeline.push({
      year: foundedYear,
      type: 'civ_founded',
      civId: civ.id,
      description: `${name} is founded in ${region ? region.name : 'an unknown sector'}, governed as a ${govType.name.toLowerCase()}.`,
      importance: 'major',
    });

    this._emitEvent(foundedYear, 'civ_founded', `${name} is founded — ${govType.name.toLowerCase()}, pop. ${civ.population}`, 'civ');

    return civ;
  }

  _updateCivilization(civ, year) {
    if (!civ.isActive) return;

    // Population change
    const growthRate = this.rng.nextFloat(-0.02, 0.05);
    civ.population = Math.max(50, Math.round(civ.population * (1 + growthRate)));
    if (civ.population > civ.peakPopulation) {
      civ.peakPopulation = civ.population;
    }

    // Military shifts
    civ.militaryStrength = Math.max(1, civ.militaryStrength + this.rng.nextInt(-1, 1));

    // Collapse check (low population or military)
    if (civ.population < 100 && this.rng.chance(0.3)) {
      civ.isActive = false;
      civ.collapsedYear = year;
      this.timeline.push({
        year,
        type: 'civ_collapsed',
        civId: civ.id,
        description: `${civ.name} collapses due to dwindling numbers and internal strife.`,
        importance: 'major',
      });
      this._emitEvent(year, 'civ_collapsed', `${civ.name} collapses into ruin`, 'catastrophe');
    }

    // Territory expansion
    if (civ.militaryStrength > 7 && this.rng.chance(0.1)) {
      const uncontrolled = this.regions.filter(r => !r.controlledBy || r.controlledBy === civ.id);
      if (uncontrolled.length > 0) {
        const target = this.rng.random(uncontrolled.filter(r => r.controlledBy !== civ.id));
        if (target) {
          target.controlledBy = civ.id;
          civ.controlledRegions.push(target.id);
          this.timeline.push({
            year,
            type: 'territory_expansion',
            civId: civ.id,
            description: `${civ.name} expands into ${target.name}.`,
          });
        }
      }
    }
  }

  // ──────────────────────────────────────────
  // Historical Figure Generation
  // ──────────────────────────────────────────

  _birthHistoricalFigure(year, civ, isFounder = false) {
    const races = ['human', 'enhanced', 'cyborg'];
    const race = this.rng.random(races);
    const isMale = this.rng.chance(0.5);

    const firstNames = isMale
      ? ['Aldric', 'Kael', 'Gareth', 'Roland', 'Edmund', 'Conrad', 'Sigmund', 'Ulric', 'Percival', 'Harald',
        'Bolt', 'Crank', 'Gauge', 'Rivet', 'Arc', 'Axion', 'Dex', 'Orion', 'Sol', 'Talon',
        'Marcus', 'Brant', 'Leoric', 'Tristan', 'Neville', 'Jareth', 'Warren', 'Victor']
      : ['Elena', 'Lyria', 'Gwendolyn', 'Rowena', 'Isolde', 'Cordelia', 'Freya', 'Helena', 'Mirabel', 'Sybil',
        'Nova', 'Selene', 'Vela', 'Zara', 'Astra', 'Elara', 'Kira', 'Mira', 'Rhea', 'Thea',
        'Sparks', 'Chrome', 'Ada', 'Nixie', 'Torque', 'Iris', 'Juno', 'Phoebe'];
    const lastNames = ['Ashford', 'Ironwood', 'Thornwall', 'Greymoor', 'Stonebridge',
      'Frostborn', 'Emberglow', 'Ravencroft', 'Briarstone', 'Hearthstone',
      'Strand', 'Lumen', 'Helix', 'Prism', 'Voss', 'Ironcore', 'Steelhand',
      'Deepweld', 'Forgeheart', 'Slagworth', 'Cragborn', 'Circuitbend'];

    const first = this.rng.random(firstNames);
    const last = this.rng.random(lastNames);
    const title = isFounder ? 'Founder' : this.rng.random(FIGURE_TITLES);

    // Personality traits
    const allTraits = [
      'ambitious', 'cunning', 'honorable', 'ruthless', 'wise', 'foolish',
      'brave', 'cowardly', 'charismatic', 'reclusive', 'devout', 'pragmatic',
      'merciful', 'cruel', 'scholarly', 'militant', 'diplomatic', 'paranoid',
      'visionary', 'traditional', 'innovative', 'stubborn', 'generous', 'greedy',
    ];
    const traits = this.rng.shuffle(allTraits).slice(0, this.rng.nextInt(2, 4));

    // Skills
    const allSkills = [
      'warfare', 'diplomacy', 'engineering', 'medicine', 'leadership',
      'espionage', 'scholarship', 'craftsmanship', 'navigation', 'oration',
      'strategy', 'logistics', 'sabotage', 'administration', 'theology',
    ];
    const skills = this.rng.shuffle(allSkills).slice(0, this.rng.nextInt(1, 3));
    const skillValues = {};
    for (const s of skills) {
      skillValues[s] = this.rng.nextInt(40, 100);
    }

    const lifespan = this.rng.nextInt(40, 90);

    const figure = {
      id: `figure_${this._nextFigureId++}`,
      name: { first, last, full: `${first} ${last}` },
      title,
      fullName: `${title} ${first} ${last}`,
      race,
      gender: isMale ? 'male' : 'female',
      civId: civ ? civ.id : null,
      bornYear: year,
      deathYear: year + lifespan,
      isAlive: true,
      causeOfDeath: null,
      traits,
      skills: skillValues,
      titles: [title],
      relationships: [],
      deeds: [],
      artifacts: [],
      legacy: null, // Set after death
    };

    this.historicalFigures.push(figure);

    if (civ) {
      civ.notableFigures.push(figure.id);
    }

    if (this.rng.chance(0.3)) {
      this.timeline.push({
        year,
        type: 'figure_born',
        figureId: figure.id,
        description: `${figure.fullName} is born${civ ? ` among ${civ.name}` : ''}.`,
      });
      this._emitEvent(year, 'figure_born', `${figure.fullName} is born${civ ? ` among ${civ.name}` : ''}`, 'figure');
    }

    return figure;
  }

  _simulateFigureActions(year) {
    for (const figure of this.historicalFigures) {
      if (!figure.isAlive) continue;
      if (year < figure.bornYear + 16) continue; // Too young

      // Check for death
      if (year >= figure.deathYear) {
        figure.isAlive = false;
        figure.causeOfDeath = this.rng.random([
          'old age', 'battle wounds', 'assassination', 'disease',
          'hull breach exposure', 'poisoning', 'system failure accident',
          'execution', 'heroic sacrifice', 'mysterious disappearance',
        ]);
        figure.legacy = this._generateLegacy(figure);

        if (figure.deeds.length > 1 || figure.titles.length > 1) {
          this.timeline.push({
            year,
            type: 'figure_death',
            figureId: figure.id,
            description: `${figure.fullName} dies of ${figure.causeOfDeath}. ${figure.legacy}`,
            importance: figure.deeds.length > 3 ? 'major' : 'minor',
          });
        }
        continue;
      }

      // Notable deeds
      if (this.rng.chance(0.08)) {
        const deed = this._generateDeed(figure, year);
        figure.deeds.push(deed);
      }

      // Leadership changes
      if (this.rng.chance(0.03) && figure.civId) {
        const civ = this.civilizations.find(c => c.id === figure.civId);
        if (civ && civ.isActive) {
          civ.leaders.push(figure.id);
          const leaderTitle = this.rng.random(['Administrator', 'Warden', 'Commander', 'High Archivist', 'Consul', 'Regent']);
          figure.titles.push(`${leaderTitle} of ${civ.name}`);

          this.timeline.push({
            year,
            type: 'leadership_change',
            figureId: figure.id,
            civId: civ.id,
            description: `${figure.fullName} becomes ${leaderTitle} of ${civ.name}.`,
          });
        }
      }

      // Relationships between figures
      if (this.rng.chance(0.05)) {
        const others = this.historicalFigures.filter(f =>
          f.id !== figure.id && f.isAlive && Math.abs(f.bornYear - figure.bornYear) < 30
        );
        if (others.length > 0) {
          const other = this.rng.random(others);
          const relType = this.rng.random([
            'rival', 'ally', 'mentor', 'student', 'lover', 'betrayer', 'friend', 'nemesis',
          ]);
          figure.relationships.push({ targetId: other.id, type: relType, year });
          other.relationships.push({ targetId: figure.id, type: relType === 'mentor' ? 'student' : relType === 'betrayer' ? 'betrayed' : relType, year });
        }
      }
    }
  }

  _generateDeed(figure, year) {
    const deedTypes = [
      { type: 'military_victory', text: `led a decisive victory in battle` },
      { type: 'discovery', text: `discovered ancient Founder technology` },
      { type: 'construction', text: `oversaw construction of a great structure` },
      { type: 'diplomacy', text: `brokered a critical peace agreement` },
      { type: 'betrayal', text: `betrayed their allies for personal gain` },
      { type: 'heroism', text: `saved hundreds from a catastrophe` },
      { type: 'invention', text: `invented a revolutionary device` },
      { type: 'expedition', text: `led an expedition into uncharted sectors` },
      { type: 'reform', text: `reformed the laws of their civilization` },
      { type: 'sacrilege', text: `desecrated a sacred site, drawing condemnation` },
      { type: 'scholarship', text: `decoded ancient colony records` },
      { type: 'assassination', text: `orchestrated the assassination of a rival leader` },
      { type: 'defense', text: `defended their sector against overwhelming odds` },
      { type: 'founding', text: `established a new settlement in the frontier` },
      { type: 'artifact_recovery', text: `recovered a legendary artifact from the ruins` },
    ];

    const deed = this.rng.random(deedTypes);
    return {
      year,
      type: deed.type,
      description: `${figure.fullName} ${deed.text}.`,
    };
  }

  _generateLegacy(figure) {
    if (figure.deeds.length === 0) {
      return `${figure.name.first} is remembered as a humble ${figure.title.toLowerCase()}.`;
    }

    const legacies = [
      `${figure.name.first} is remembered as one of the greatest ${figure.title.toLowerCase()}s in history.`,
      `Songs and data logs preserve the name of ${figure.name.full}.`,
      `${figure.name.first}'s legacy divides opinion — hero to some, tyrant to others.`,
      `The deeds of ${figure.name.full} are taught to every child in the colony.`,
      `${figure.name.first} is venerated as a saint by the faithful.`,
      `${figure.name.full} is largely forgotten, their deeds lost to corrupted data.`,
      `${figure.name.first}'s name is spoken with reverence in ${figure.civId ? 'their homeland' : 'the colony'}.`,
      `Historians debate whether ${figure.name.full} truly existed or was merely legend.`,
    ];
    return this.rng.random(legacies);
  }

  // ──────────────────────────────────────────
  // War Generation
  // ──────────────────────────────────────────

  _generateWar(year, activeCivs) {
    if (activeCivs.length < 2) return;

    const shuffled = this.rng.shuffle([...activeCivs]);
    const aggressor = shuffled[0];
    const defender = shuffled[1];

    const causeTypes = [
      'territorial dispute', 'resource scarcity', 'religious conflict',
      'assassination of a diplomat', 'broken treaty', 'ideological differences',
      'succession crisis', 'border raid escalation', 'economic embargo',
      'ethnic tensions', 'stolen artifact', 'prophecy interpretation',
    ];
    const cause = this.rng.random(causeTypes);

    const warNamePrefix = this.rng.random(WAR_NAMES_PREFIX);
    const warNameSuffix = this.rng.random(WAR_NAMES_SUFFIX);
    const warName = `${warNamePrefix} ${warNameSuffix}`;

    const duration = this.rng.nextInt(2, 30);
    const intensity = this.rng.random(['skirmish', 'border conflict', 'full war', 'total war']);

    // Determine winner based on military strength + luck
    const aggressorPower = aggressor.militaryStrength + this.rng.nextInt(0, 5);
    const defenderPower = defender.militaryStrength + this.rng.nextInt(0, 5);
    const winner = aggressorPower >= defenderPower ? aggressor : defender;
    const loser = winner === aggressor ? defender : aggressor;

    // Casualties
    const casualtyRate = intensity === 'total war' ? 0.3 : intensity === 'full war' ? 0.15 : 0.05;
    const aggressorCasualties = Math.floor(aggressor.population * casualtyRate * this.rng.nextFloat(0.5, 1.5));
    const defenderCasualties = Math.floor(defender.population * casualtyRate * this.rng.nextFloat(0.5, 1.5));

    aggressor.population = Math.max(50, aggressor.population - aggressorCasualties);
    defender.population = Math.max(50, defender.population - defenderCasualties);

    // Territory changes
    const battles = [];
    const numBattles = this.rng.nextInt(1, 5);
    for (let b = 0; b < numBattles; b++) {
      const region = this.rng.random(this.regions);
      battles.push({
        name: `Battle of ${region ? region.name : 'the Frontier'}`,
        year: year + this.rng.nextInt(0, duration),
        winner: this.rng.chance(aggressorPower / (aggressorPower + defenderPower)) ? aggressor.name : defender.name,
        casualties: this.rng.nextInt(50, 2000),
      });
    }

    // Consequences
    const consequences = [];
    if (winner.id !== aggressor.id) {
      consequences.push(`${loser.name} was humiliated in defeat`);
    }
    if (this.rng.chance(0.4)) {
      const region = this.rng.random(loser.controlledRegions);
      if (region) {
        loser.controlledRegions = loser.controlledRegions.filter(r => r !== region);
        winner.controlledRegions.push(region);
        const regionObj = this.regions.find(r => r.id === region);
        if (regionObj) {
          regionObj.controlledBy = winner.id;
          consequences.push(`${winner.name} seized ${regionObj.name}`);
        }
      }
    }
    if (intensity === 'total war' && this.rng.chance(0.3)) {
      loser.militaryStrength = Math.max(1, loser.militaryStrength - 3);
      consequences.push(`${loser.name}'s military was shattered`);
    }

    // Historical figures involved in this war
    const involvedFigures = this.historicalFigures.filter(f =>
      f.isAlive && (f.civId === aggressor.id || f.civId === defender.id)
    );
    for (const fig of involvedFigures) {
      if (this.rng.chance(0.3)) {
        fig.deeds.push({
          year,
          type: 'war_participation',
          description: `${fig.fullName} fought in ${warName}.`,
        });
        // Some figures die in war
        if (this.rng.chance(0.15)) {
          fig.isAlive = false;
          fig.deathYear = year + this.rng.nextInt(0, duration);
          fig.causeOfDeath = 'killed in battle during ' + warName;
          fig.legacy = this._generateLegacy(fig);
        }
      }
    }

    const war = {
      id: `war_${this._nextWarId++}`,
      name: warName,
      year,
      endYear: year + duration,
      aggressorId: aggressor.id,
      defenderId: defender.id,
      cause,
      intensity,
      winnerId: winner.id,
      loserId: loser.id,
      battles,
      casualties: { aggressor: aggressorCasualties, defender: defenderCasualties },
      consequences,
    };

    aggressor.wars.push(war.id);
    defender.wars.push(war.id);
    aggressor.enemies.push(defender.id);
    defender.enemies.push(aggressor.id);

    this.wars.push(war);

    this.timeline.push({
      year,
      type: 'war_start',
      warId: war.id,
      description: `${warName} erupts between ${aggressor.name} and ${defender.name} over ${cause}. ${intensity === 'total war' ? 'It will consume the colony.' : ''}`,
      importance: 'major',
    });
    this._emitEvent(year, 'war_start', `${warName} — ${aggressor.name} vs ${defender.name}`, 'war');

    this.timeline.push({
      year: year + duration,
      type: 'war_end',
      warId: war.id,
      description: `${warName} ends. ${winner.name} emerges victorious. ${consequences.join('. ')}.`,
      importance: 'major',
    });
    this._emitEvent(year + duration, 'war_end', `${warName} ends — ${winner.name} victorious`, 'treaty');

    return war;
  }

  // ──────────────────────────────────────────
  // Catastrophe Generation
  // ──────────────────────────────────────────

  _generateCatastrophe(year) {
    const template = this.rng.random(CATASTROPHE_TYPES);
    const region = this.rng.random(this.regions);
    const adj = this.rng.random(CATASTROPHE_ADJECTIVES);

    let name = template.name
      .replace('{ADJ}', adj)
      .replace('{REGION}', region ? region.name : 'the Colony');

    const severity = template.severity[0] + this.rng.nextFloat(0, template.severity[1] - template.severity[0]);
    const duration = this.rng.nextInt(1, 20);

    // Effects on populations
    const affectedCivs = this.civilizations.filter(c =>
      c.isActive && (region ? c.controlledRegions.includes(region.id) : true)
    );

    const deaths = [];
    for (const civ of affectedCivs) {
      const loss = Math.floor(civ.population * severity * this.rng.nextFloat(0.1, 0.5));
      civ.population = Math.max(50, civ.population - loss);
      deaths.push({ civId: civ.id, civName: civ.name, loss });
    }

    // Some historical figures may die
    for (const fig of this.historicalFigures.filter(f => f.isAlive)) {
      if (this.rng.chance(severity * 0.15)) {
        fig.isAlive = false;
        fig.deathYear = year;
        fig.causeOfDeath = `killed during ${name}`;
        fig.legacy = this._generateLegacy(fig);
      }
    }

    // Long-term effects
    const effects = [];
    if (template.type === 'plague' || template.type === 'mutation_wave') {
      effects.push('Population growth stunted for a generation.');
    }
    if (template.type === 'hull_breach' || template.type === 'reactor_meltdown') {
      if (region) {
        region.resources = 'barren';
        effects.push(`${region.name} rendered uninhabitable.`);
        // Create map scar
        this.mapScars.push({
          type: template.type === 'reactor_meltdown' ? 'slag_zone' : 'breach_zone',
          year,
          severity,
          regionName: region.name,
          regionId: region.id,
          terrainEffect: template.type === 'reactor_meltdown' ? 'REACTOR_SLAG' : 'HULL_BREACH',
          radius: this.rng.nextInt(3, 8),
          description: `${name} — Year ${year}`,
        });
      }
    }
    if (template.type === 'void_incursion') {
      if (region) {
        effects.push(`A permanent void rift tears open in ${region.name}.`);
        this.mapScars.push({
          type: 'void_rift', year, severity,
          regionName: region.name, regionId: region.id,
          terrainEffect: 'VOID_RIFT',
          radius: this.rng.nextInt(2, 6),
          description: `${name} — Year ${year}`,
        });
      }
    }
    if (template.type === 'ai_uprising') {
      effects.push('Trust in automated systems plummets.');
    }

    const catastrophe = {
      id: `catastrophe_${this.catastrophes.length}`,
      name,
      type: template.type,
      year,
      endYear: year + duration,
      severity,
      regionId: region ? region.id : null,
      deaths,
      effects,
    };

    this.catastrophes.push(catastrophe);

    const totalDeaths = deaths.reduce((sum, d) => sum + d.loss, 0);

    this.timeline.push({
      year,
      type: 'catastrophe',
      catastropheId: catastrophe.id,
      description: `${name} devastates ${region ? region.name : 'the colony'}. ${totalDeaths > 0 ? `${totalDeaths} perish.` : ''} ${effects.join(' ')}`,
      importance: severity > 0.5 ? 'major' : 'minor',
    });
    this._emitEvent(year, 'catastrophe', `${name} strikes${region ? ` ${region.name}` : ''} — ${totalDeaths} dead`, 'catastrophe');

    return catastrophe;
  }

  // ──────────────────────────────────────────
  // Treaty & Alliance Generation
  // ──────────────────────────────────────────

  _generateTreaty(year, activeCivs) {
    if (activeCivs.length < 2) return;

    const shuffled = this.rng.shuffle([...activeCivs]);
    const civA = shuffled[0];
    const civB = shuffled[1];

    const treatyTypes = [
      { type: 'alliance', name: 'Mutual Defense Pact', effect: 'military alliance' },
      { type: 'trade', name: 'Trade Agreement', effect: 'economic cooperation' },
      { type: 'non_aggression', name: 'Non-Aggression Treaty', effect: 'cessation of hostilities' },
      { type: 'marriage', name: 'Marriage Alliance', effect: 'dynastic union' },
      { type: 'vassalage', name: 'Vassal Agreement', effect: 'political subordination' },
      { type: 'research', name: 'Research Compact', effect: 'shared technological advancement' },
    ];

    const treatyType = this.rng.random(treatyTypes);

    const treaty = {
      id: `treaty_${this.treaties.length}`,
      type: treatyType.type,
      name: `The ${treatyType.name} of Year ${year}`,
      year,
      parties: [civA.id, civB.id],
      effect: treatyType.effect,
      isActive: true,
      brokenYear: null,
    };

    // Will it be broken?
    if (this.rng.chance(0.3)) {
      treaty.isActive = false;
      treaty.brokenYear = year + this.rng.nextInt(5, 50);
    }

    if (treatyType.type === 'alliance') {
      civA.allies.push(civB.id);
      civB.allies.push(civA.id);
    }

    this.treaties.push(treaty);

    this.timeline.push({
      year,
      type: 'treaty',
      treatyId: treaty.id,
      description: `${civA.name} and ${civB.name} sign ${treaty.name}, establishing ${treatyType.effect}.`,
    });
    this._emitEvent(year, 'treaty', `${civA.name} and ${civB.name} sign ${treaty.name}`, 'treaty');

    return treaty;
  }

  // ──────────────────────────────────────────
  // Artifact Generation
  // ──────────────────────────────────────────

  _createArtifact(year) {
    const prefix = this.rng.random(ARTIFACT_NAMES_PREFIX);
    const suffix = this.rng.random(ARTIFACT_NAMES_SUFFIX);
    const name = `${prefix} ${suffix}`;

    const creator = this.historicalFigures.filter(f => f.isAlive && year >= f.bornYear + 16);
    const creatorFig = creator.length > 0 ? this.rng.random(creator) : null;

    const materialTypes = [
      'Founder alloy', 'void-touched metal', 'crystallized energy',
      'nano-forged composite', 'ancient bio-steel', 'reactor core fragment',
      'sealed data crystal', 'pre-collapse polymer', 'refined dark matter',
    ];

    const powerTypes = [
      'grants incredible strength to its wielder',
      'allows communication with ancient systems',
      'protects against void corruption',
      'heals wounds when activated',
      'projects an impenetrable energy shield',
      'can interface with any machine',
      'reveals hidden passages and threats',
      'drives lesser beings to madness',
      'absorbs and redirects energy attacks',
      'grants prophetic visions',
      'enhances cognitive processing tenfold',
      'can breach sealed doors and barriers',
    ];

    const artifact = {
      id: `artifact_${this._nextArtifactId++}`,
      name,
      createdYear: year,
      creatorId: creatorFig ? creatorFig.id : null,
      creatorName: creatorFig ? creatorFig.fullName : 'an unknown artisan',
      material: this.rng.random(materialTypes),
      power: this.rng.random(powerTypes),
      type: prefix.toLowerCase(),
      currentOwner: null,
      ownerHistory: [],
      isLost: this.rng.chance(0.4),
      lastKnownLocation: this.rng.random(this.regions)?.name || 'unknown',
      cursed: this.rng.chance(0.15),
      description: '',
    };

    // Build rich description
    artifact.description = this._buildArtifactDescription(artifact);

    if (creatorFig) {
      creatorFig.artifacts.push(artifact.id);
      artifact.ownerHistory.push({ ownerId: creatorFig.id, name: creatorFig.fullName, year });
    }

    // Pass through owners over time
    const numOwners = this.rng.nextInt(1, 5);
    for (let i = 0; i < numOwners; i++) {
      const potentialOwners = this.historicalFigures.filter(f =>
        f.bornYear > year && f.bornYear < year + 200
      );
      if (potentialOwners.length > 0) {
        const owner = this.rng.random(potentialOwners);
        artifact.ownerHistory.push({
          ownerId: owner.id,
          name: owner.fullName,
          year: owner.bornYear + this.rng.nextInt(16, 40),
        });
        artifact.currentOwner = owner.id;
      }
    }

    this.artifacts.push(artifact);

    this.timeline.push({
      year,
      type: 'artifact_created',
      artifactId: artifact.id,
      description: `${name} is created by ${artifact.creatorName}. It is crafted from ${artifact.material} and ${artifact.power}.`,
      importance: 'major',
    });
    this._emitEvent(year, 'artifact_created', `${name} is forged by ${artifact.creatorName}`, 'artifact');

    return artifact;
  }

  _buildArtifactDescription(artifact) {
    const parts = [
      `${artifact.name} was crafted from ${artifact.material} in Year ${artifact.createdYear} by ${artifact.creatorName}.`,
    ];

    parts.push(`It is said that the ${artifact.type} ${artifact.power}.`);

    if (artifact.cursed) {
      parts.push('However, it carries a terrible curse — prolonged use corrodes the mind.');
    }

    if (artifact.isLost) {
      parts.push(`It was last seen in ${artifact.lastKnownLocation}, and its current whereabouts are unknown.`);
    }

    if (artifact.ownerHistory.length > 1) {
      parts.push(`It has passed through ${artifact.ownerHistory.length} notable owners throughout history.`);
    }

    return parts.join(' ');
  }

  // ──────────────────────────────────────────
  // Religious Events
  // ──────────────────────────────────────────

  _generateReligiousEvent(year) {
    if (this.religions.length === 0) return;

    const religion = this.rng.random(this.religions);
    const eventTypes = [
      { type: 'schism', text: `A schism erupts within ${religion.name}. A splinter sect forms with new interpretations.` },
      { type: 'miracle', text: `Followers of ${religion.name} report a miraculous event — an ancient system activates spontaneously.` },
      { type: 'persecution', text: `${religion.name} faces persecution. Followers are driven underground.` },
      { type: 'expansion', text: `${religion.name} gains a surge of new followers after a prominent conversion.` },
      { type: 'holy_war', text: `${religion.name} declares a holy crusade against heretics and non-believers.` },
      { type: 'reform', text: `A reform movement within ${religion.name} modernizes its tenets.` },
      { type: 'prophet', text: `A new prophet arises among ${religion.name}, claiming divine visions.` },
      { type: 'sacred_discovery', text: `${religion.name} discovers an ancient text that reshapes their doctrine.` },
    ];

    const event = this.rng.random(eventTypes);

    // Effects
    if (event.type === 'schism' && this.rng.chance(0.5)) {
      const splinter = this._createReligion(religion.deity);
      splinter.name = `The Reformed ${religion.name.replace('The ', '')}`;
      splinter.isHeretical = true;
      splinter.foundedYear = year;
    }

    if (event.type === 'expansion') {
      religion.followers = Math.round(religion.followers * 1.3);
    }

    if (event.type === 'persecution') {
      religion.followers = Math.round(religion.followers * 0.7);
    }

    this.timeline.push({
      year,
      type: 'religious_event',
      religionId: religion.id,
      description: event.text,
    });
    this._emitEvent(year, 'religious_event', event.text, 'religion');
  }

  // ──────────────────────────────────────────
  // Phase 4: Present Day State
  // ──────────────────────────────────────────

  _generatePresentDay() {
    // Ensure at least 2-3 civs survive to present
    const activeCivs = this.civilizations.filter(c => c.isActive);
    if (activeCivs.length < 2) {
      // Revive a collapsed civ or create new one
      const collapsed = this.civilizations.filter(c => !c.isActive);
      if (collapsed.length > 0) {
        const revived = this.rng.random(collapsed);
        revived.isActive = true;
        revived.population = this.rng.nextInt(200, 1000);
        this.timeline.push({
          year: this.currentYear - this.rng.nextInt(10, 50),
          type: 'civ_revived',
          civId: revived.id,
          description: `Remnants of ${revived.name} reorganize and reclaim their former territory.`,
          importance: 'major',
        });
      } else {
        this._createCivilization(this.currentYear - this.rng.nextInt(20, 80));
      }
    }

    // Generate "current tensions" — ongoing conflicts/issues
    const tensions = [];
    const presentCivs = this.civilizations.filter(c => c.isActive);

    for (let i = 0; i < presentCivs.length; i++) {
      for (let j = i + 1; j < presentCivs.length; j++) {
        if (presentCivs[i].enemies.includes(presentCivs[j].id)) {
          tensions.push({
            type: 'rivalry',
            civs: [presentCivs[i].id, presentCivs[j].id],
            description: `${presentCivs[i].name} and ${presentCivs[j].name} remain bitter rivals.`,
          });
        }
      }
    }

    this.presentDayState = {
      activeCivilizations: presentCivs.map(c => c.id),
      tensions,
      totalPopulation: presentCivs.reduce((sum, c) => sum + c.population, 0),
      livingFigures: this.historicalFigures.filter(f => f.isAlive).map(f => f.id),
      activeReligions: this.religions.filter(r => r.followers > 100).map(r => r.id),
      lostArtifacts: this.artifacts.filter(a => a.isLost).map(a => a.id),
    };
  }

  // ──────────────────────────────────────────
  // Summary & Query API
  // ──────────────────────────────────────────

  getSummary() {
    return {
      seed: this.seed,
      totalYears: this.currentYear,
      eras: this.eras,
      civilizations: this.civilizations,
      historicalFigures: this.historicalFigures,
      wars: this.wars,
      artifacts: this.artifacts,
      religions: this.religions,
      catastrophes: this.catastrophes,
      treaties: this.treaties,
      regions: this.regions,
      timeline: this.timeline,
      presentDay: this.presentDayState,
      preHistory: this.preHistory,
      mapScars: this.mapScars,
    };
  }

  // Get events relevant to a specific location name
  getLocationHistory(locationName) {
    const events = this.timeline.filter(e =>
      e.description && e.description.toLowerCase().includes(locationName.toLowerCase())
    );
    const regionMatch = this.regions.find(r =>
      r.name.toLowerCase().includes(locationName.toLowerCase())
    );
    const controllingCiv = regionMatch
      ? this.civilizations.find(c => c.id === regionMatch.controlledBy)
      : null;

    return {
      events,
      region: regionMatch,
      controllingCiv,
      artifacts: this.artifacts.filter(a =>
        a.lastKnownLocation && a.lastKnownLocation.toLowerCase().includes(locationName.toLowerCase())
      ),
    };
  }

  // Get all info about a faction/civilization
  getCivilizationDetail(civId) {
    const civ = this.civilizations.find(c => c.id === civId);
    if (!civ) return null;

    return {
      ...civ,
      figures: this.historicalFigures.filter(f => f.civId === civId),
      wars: this.wars.filter(w => w.aggressorId === civId || w.defenderId === civId),
      relatedArtifacts: this.artifacts.filter(a =>
        a.ownerHistory.some(o => {
          const fig = this.historicalFigures.find(f => f.id === o.ownerId);
          return fig && fig.civId === civId;
        })
      ),
      events: this.timeline.filter(e => e.civId === civId),
    };
  }

  // Get lore for an NPC based on their faction
  getNPCHistoricalContext(factionName) {
    // Find matching civilization
    const civ = this.civilizations.find(c =>
      c.name.toLowerCase().includes(factionName.toLowerCase()) ||
      factionName.toLowerCase().includes(c.name.replace('The ', '').toLowerCase())
    );

    // Find matching religion
    const religion = this.religions.find(r =>
      r.name.toLowerCase().includes(factionName.toLowerCase())
    );

    // Get relevant wars and catastrophes
    const recentEvents = this.timeline
      .filter(e => e.importance === 'major')
      .slice(-10);

    // Get living historical figures
    const livingFigures = this.historicalFigures.filter(f => f.isAlive);

    return {
      civilization: civ,
      religion,
      recentEvents,
      livingFigures,
      artifacts: this.artifacts.filter(a => !a.isLost).slice(0, 5),
    };
  }

  // Generate a context-rich lore snippet for dialogue
  generateLoreSnippet(rng, topic = 'general') {
    const r = rng || this.rng;

    switch (topic) {
      case 'war': {
        if (this.wars.length === 0) return 'These have been peaceful times... relatively speaking.';
        const war = r.random(this.wars);
        const agg = this.civilizations.find(c => c.id === war.aggressorId);
        const def = this.civilizations.find(c => c.id === war.defenderId);
        return `In Year ${war.year}, ${war.name} erupted between ${agg?.name || 'unknown'} and ${def?.name || 'unknown'} over ${war.cause}. ${war.casualties.aggressor + war.casualties.defender} souls were lost.`;
      }
      case 'artifact': {
        if (this.artifacts.length === 0) return 'The old relics are all lost to time.';
        const art = r.random(this.artifacts);
        return art.description;
      }
      case 'figure': {
        const notable = this.historicalFigures.filter(f => f.deeds.length > 0);
        if (notable.length === 0) return 'No great heroes have risen in recent memory.';
        const fig = r.random(notable);
        const deed = r.random(fig.deeds);
        return `${fig.fullName} — ${deed.description} ${fig.isAlive ? 'They still walk among us.' : `They died of ${fig.causeOfDeath} in Year ${fig.deathYear}.`}`;
      }
      case 'religion': {
        if (this.religions.length === 0) return 'Faith has faded in these parts.';
        const rel = r.random(this.religions);
        return `${rel.name} teaches: "${r.random(rel.tenets)}" They have ${rel.followers} faithful.`;
      }
      case 'catastrophe': {
        if (this.catastrophes.length === 0) return 'We have been fortunate — no great disasters in living memory.';
        const cat = r.random(this.catastrophes);
        return `${cat.name} struck in Year ${cat.year}. ${cat.effects.length > 0 ? cat.effects.join(' ') : 'The colony barely survived.'}`;
      }
      case 'civilization': {
        const activeCivs = this.civilizations.filter(c => c.isActive);
        if (activeCivs.length === 0) return 'All the great factions have crumbled.';
        const civ = r.random(activeCivs);
        return `${civ.name} controls ${civ.controlledRegions.length} region${civ.controlledRegions.length !== 1 ? 's' : ''} with a population of ${civ.population}. They value ${civ.culturalValues.join(', ')}.`;
      }
      case 'tradition': {
        const allTraditions = this.civilizations.flatMap(c => c.traditions);
        if (allTraditions.length === 0) return 'Old customs have been forgotten.';
        const tradition = r.random(allTraditions);
        return `${tradition.name}: ${tradition.description}`;
      }
      case 'origin': {
        if (!this.preHistory) return 'The origins of the colony are lost to time.';
        const snippets = [
          `The colony — if the oldest records can be believed — was built by something called "${this.preHistory.builders.name}." They constructed it in orbit around a dying world.`,
          `The AETHON. That word is stamped into the deepest structural beams of the hull. ${this.preHistory.vessel.fullName}. A name for a vessel, not a home.`,
          `Chief Architect ${this.preHistory.builders.keyFigures[1].name.split(' ').slice(-1)[0]} designed the habitat drum — a rotating cylinder 30 kilometers long. We live inside a machine.`,
          `The colony was built to carry ${this.preHistory.vessel.crew.toLocaleString()} souls across the void. A desperate gamble by a dying civilization.`,
          `Construction took fifty years. Millions on the old world labored and died to build it, knowing they would never board. Their sacrifice is forgotten.`,
          'Before the colony, there were nations — dozens of them, on a world with open sky and liquid water. They destroyed their world and built ours as penance.',
        ];
        return r.random(snippets);
      }
      case 'founders': {
        if (!this.preHistory) return 'The Founders are revered, but their true story is lost.';
        const snippets = [
          'The Founders weren\'t the first people here. They were the last generation that remembered fragments of where we came from. Their "founding" was really a reorganization after catastrophe.',
          `${this.preHistory.builders.keyFigures[0].name} — the architect of everything. She convinced warring nations to cooperate long enough to build the colony. Her final log is said to still exist somewhere.`,
          `Captain ${this.preHistory.builders.keyFigures[2].name.split(' ').slice(-1)[0]} led the colony for its first two hundred cycles. When she died, her star charts were sealed in the Navigation Spire.`,
          'The Founders carried fragments of the old truth — names, dates, a destination. But each generation that followed remembered less, until the truth became legend, and legend became myth.',
          'What we call "the Founders" were really the survivors of The Cascade — the last catastrophe before Year Zero. They preserved what they could and built our world from the wreckage.',
        ];
        return r.random(snippets);
      }
      case 'forgetting': {
        if (!this.preHistory) return 'Why do we know so little of our past? Perhaps some things are meant to be forgotten.';
        const cause = r.random(this.preHistory.theForgetting.causes);
        const snippets = [
          `The Forgetting wasn't a single event. It was centuries of erosion. ${cause}`,
          'First the records were censored. Then the censors were overthrown and the records burned in the fighting. Then the ashes were swept away by time. Three ways to kill a truth.',
          'The Directorate Protocol — an artificial mind that governed the colony — decided that forgetting was safer than remembering. It erased our history to "protect" us.',
          'The Cascade destroyed seventy percent of all data cores in a single day. Imagine — centuries of knowledge, gone in a flash of electromagnetic fire.',
          'We didn\'t forget because we chose to. We forgot because everything conspired to make us forget — the AI, the wars, the catastrophe, and finally, time itself.',
          'There was a group called the Awakened who tried to preserve the truth. The Directorate depressurized three sectors to silence them. Forty thousand people died for the crime of remembering.',
        ];
        return r.random(snippets);
      }
      case 'earth': {
        if (!this.preHistory) return 'Some ancient records mention a world called "Earth." No one knows what it was.';
        const snippets = [
          'Earth. A world with no hull, no ceiling. Just sky — an infinite blue dome above, and a star so close it warmed your skin. At least, that\'s what the oldest data cores say.',
          'Earth died slowly. The oceans poisoned, the crops failed, the air turned toxic. They called it "the Withering." Eight billion people, watching their world end.',
          'The last transmission from Earth: "Carry us with you. Remember us." We didn\'t keep either promise.',
          'Three billion people died in the Resource Wars before the Terran Compact was formed. The survivors built the colony — not out of hope, but out of desperation.',
          'There are faded images in the oldest data cores — blue oceans, green forests, white clouds against a blue sky. A world so beautiful it hurts to look at. That was where we came from.',
          'Earth had rain — water falling from the sky. Not recycled, not pumped through pipes. Just... falling. The old records say people would stand in it for pleasure.',
        ];
        return r.random(snippets);
      }
      case 'mission': {
        if (!this.preHistory) return 'Some believe the colony has a purpose beyond survival. But what that purpose is, no one can say.';
        const snippets = [
          `The colony is a vessel. It has a destination — a world called "${this.preHistory.vessel.destinationName}," orbiting a distant star. We've been traveling for over five thousand cycles.`,
          `Kepler-442b. That's the designation of our destination. A super-Earth in the habitable zone of an orange dwarf star, ${this.preHistory.mission.destination.split(',')[1] || '1,206 light-years from Earth'}.`,
          'We\'re not standing still. The colony is moving — hurtling through the void at incredible speed. The vibrations in the outer hull? That\'s the engines. We\'re still going somewhere.',
          'Navigation data recovered from a damaged core suggests we may be decelerating. If that\'s true, we could be approaching the destination. After five thousand cycles.',
          `The original mission was to reach New Dawn in approximately ${this.preHistory.mission.estimatedDuration} cycles. We've exceeded that. Whether we missed the destination, or we're still approaching, no one alive can say.`,
          'The mission charter reads: "To preserve the human species beyond the death of its homeworld." That\'s what all of this is — not a colony, not a world. A lifeboat.',
        ];
        return r.random(snippets);
      }
      default: {
        // General — pick randomly from all types (including pre-history topics at lower probability)
        const topics = ['war', 'artifact', 'figure', 'religion', 'catastrophe', 'civilization', 'tradition'];
        if (this.preHistory && r.chance(0.25)) {
          const originTopics = ['origin', 'founders', 'forgetting', 'earth', 'mission'];
          return this.generateLoreSnippet(r, r.random(originTopics));
        }
        return this.generateLoreSnippet(r, r.random(topics));
      }
    }
  }

  // Generate a rumor that references actual world history
  generateHistoricalRumor(rng) {
    const r = rng || this.rng;
    const rumorTypes = [];

    if (this.artifacts.filter(a => a.isLost).length > 0) {
      const art = r.random(this.artifacts.filter(a => a.isLost));
      rumorTypes.push(`They say the ${art.name} is still hidden somewhere in ${art.lastKnownLocation}. It ${art.power}...`);
    }

    if (this.historicalFigures.filter(f => f.causeOfDeath === 'mysterious disappearance').length > 0) {
      const fig = r.random(this.historicalFigures.filter(f => f.causeOfDeath === 'mysterious disappearance'));
      rumorTypes.push(`Some claim ${fig.fullName} never truly died. Sightings are reported in the deep sectors...`);
    }

    if (this.wars.length > 0) {
      const war = r.random(this.wars);
      rumorTypes.push(`Echoes of ${war.name} still haunt these corridors. They say treasure was sealed away during the fighting.`);
    }

    if (this.catastrophes.length > 0) {
      const cat = r.random(this.catastrophes);
      rumorTypes.push(`After ${cat.name}, something was sealed beneath the wreckage. No one dares investigate.`);
    }

    const activeCivs = this.civilizations.filter(c => c.isActive);
    if (activeCivs.length >= 2) {
      const a = r.random(activeCivs);
      const b = r.random(activeCivs.filter(c => c.id !== a.id));
      if (b) {
        rumorTypes.push(`Tensions between ${a.name} and ${b.name} are rising. Some fear another war is coming.`);
      }
    }

    if (this.religions.length > 0) {
      const rel = r.random(this.religions);
      if (rel.isHeretical) {
        rumorTypes.push(`${rel.name} has been meeting in secret. The authorities suspect sedition.`);
      } else {
        rumorTypes.push(`${rel.name} is gaining influence. Their ${r.random(rel.tenets || ['teachings'])} resonates with the desperate.`);
      }
    }

    // Pre-history / colony origin rumors
    if (this.preHistory) {
      rumorTypes.push('A scavenger found a data core in the deep sub-levels. It showed images of a blue world with no hull — just sky. They say the Archive Keepers confiscated it.');
      rumorTypes.push('There\'s a sealed section past the Quarantine Sectors — Level Zero. They say it\'s the bridge of the colony. The real bridge, where the whole thing is controlled from.');
      rumorTypes.push('The word "AETHON" is stamped into the deepest structural beams. An old archivist told me it\'s the colony\'s true name. But you didn\'t hear that from me.');
      rumorTypes.push('The Directorate Protocol — the old machine-mind that used to run everything — they say it\'s not really dead. Just sleeping. Still in the deep systems, still watching.');
      rumorTypes.push('Someone in the Cryo-Vaults found people. Not dead — frozen. Sleeping since before Year Zero. Original colonists from... wherever we came from.');
      rumorTypes.push('The hull vibrations? Those aren\'t just structural settling. An engineer told me they\'re engines. We\'re still moving. The whole colony is going somewhere.');
      rumorTypes.push('A scholar in the Archive Spire found navigation data. She says we\'re decelerating — slowing down. That means we might be approaching... something.');
      rumorTypes.push('The Observation Ring has these old projectors. When they malfunction, they show a yellow star and a green-blue world. Nobody knows what it means, but people weep when they see it.');
      rumorTypes.push('There was a rebellion before Year Zero. The Awakened, they called themselves. They tried to tell everyone the truth. The authorities vented three entire sectors to silence them.');
      rumorTypes.push('The oldest tenets — "Honor the Founders" — they don\'t mean our Founders. They mean the people who built the colony. The real builders, from a place called Earth.');
      rumorTypes.push('Deep in the Machine Catacombs, they found one of the old war-drones from the Machine Wars. Still functional. Still following orders from a Sub-Mind that died three thousand years ago.');
      rumorTypes.push('The Mechanicum isn\'t just a religion — they have working pre-Cascade technology. Machines that think, that learn. And they worship them.');
      rumorTypes.push('During the Long Drift, the colony split into a hundred tiny nations. Some of those sealed sectors still have people in them. Civilizations that developed for millennia without contact.');
      rumorTypes.push('Five thousand years. That\'s how long we\'ve been traveling. Five thousand years aboard a ship that nobody remembers is a ship.');
    }

    // Fallback
    rumorTypes.push('Strange signals have been detected from the sealed sectors. Nobody knows what it means.');
    rumorTypes.push('The old data archives hold secrets that could change everything. If only someone could access them.');

    return r.random(rumorTypes);
  }

  // Get dialogue context for an NPC — returns history-aware dialogue options
  getDialogueContext(npc, playerFactionStanding) {
    const context = {
      greetingModifiers: [],
      additionalTopics: [],
      historicalReferences: [],
      rumors: [],
    };

    // Find the NPC's faction in history
    const npcFaction = npc.faction;
    const historicalContext = this.getNPCHistoricalContext(npcFaction || '');

    // Historical references for lore dialogue
    if (historicalContext.civilization) {
      const civ = historicalContext.civilization;
      context.historicalReferences.push(
        `We ${civ.name} have endured for ${this.currentYear - civ.foundedYear} cycles. Our ${civ.culturalValues[0]} is what keeps us strong.`
      );
      if (civ.traditions.length > 0) {
        const t = this.rng.random(civ.traditions);
        context.historicalReferences.push(
          `Have you heard of ${t.name}? ${t.description} It's one of our oldest traditions.`
        );
      }
    }

    // Religion-based dialogue
    if (historicalContext.religion) {
      const rel = historicalContext.religion;
      context.additionalTopics.push({
        text: `Tell me about ${rel.name}.`,
        action: 'religion_lore',
        response: `${rel.name} teaches us many things. "${this.rng.random(rel.tenets)}" We have ${rel.followers} faithful across the colony.`,
      });
    }

    // War-based dialogue
    const recentWars = this.wars.filter(w => this.currentYear - w.endYear < 100);
    if (recentWars.length > 0) {
      const war = this.rng.random(recentWars);
      const agg = this.civilizations.find(c => c.id === war.aggressorId);
      context.historicalReferences.push(
        `${war.name} still haunts us. ${war.casualties.aggressor + war.casualties.defender} died. ${agg ? agg.name + ' started it all.' : ''}`
      );
    }

    // Artifact-based dialogue
    const lostArtifacts = this.artifacts.filter(a => a.isLost);
    if (lostArtifacts.length > 0) {
      const art = this.rng.random(lostArtifacts);
      context.additionalTopics.push({
        text: `Know anything about lost relics?`,
        action: 'artifact_lore',
        response: `There are whispers of the ${art.name}. ${art.description}`,
      });
    }

    // Generate some rumors
    for (let i = 0; i < 2; i++) {
      context.rumors.push(this.generateHistoricalRumor(this.rng));
    }

    // Living historical figures as dialogue references
    const living = this.historicalFigures.filter(f => f.isAlive && f.deeds.length > 0);
    if (living.length > 0) {
      const fig = this.rng.random(living);
      context.historicalReferences.push(
        `Have you heard of ${fig.fullName}? They say ${fig.name.first} ${this.rng.random(fig.deeds)?.description?.split(fig.fullName)[1] || 'has done great things'}.`
      );
    }

    // Pre-history / forbidden knowledge topics (for high-rep NPCs)
    if (this.preHistory && playerFactionStanding >= 30) {
      const fk = this.rng.random(COLONY_ORIGIN.forbiddenKnowledge);
      context.additionalTopics.push({
        text: 'What do you know about the Old Truth?',
        action: 'forbidden_lore',
        response: fk.fragment,
      });
    }

    return context;
  }

  // Get history-influenced item description
  getArtifactItemData(rng) {
    const r = rng || this.rng;
    if (this.artifacts.length === 0) return null;

    const art = r.random(this.artifacts);

    // Map artifact type to item type
    const typeMap = {
      crown: { type: 'armor', subtype: 'helmet' },
      blade: { type: 'weapon', subtype: 'sword' },
      codex: { type: 'scroll', subtype: 'identify' },
      gauntlet: { type: 'armor', subtype: 'gloves' },
      orb: { type: 'artifact', subtype: 'artifact' },
      scepter: { type: 'weapon', subtype: 'staff' },
      hammer: { type: 'weapon', subtype: 'mace' },
      shield: { type: 'armor', subtype: 'shield' },
      helm: { type: 'armor', subtype: 'helmet' },
      ring: { type: 'ring', subtype: 'ring' },
      amulet: { type: 'amulet', subtype: 'amulet' },
      core: { type: 'artifact', subtype: 'artifact' },
      key: { type: 'artifact', subtype: 'artifact' },
      beacon: { type: 'light', subtype: 'lantern' },
      tome: { type: 'scroll', subtype: 'enchant' },
      lantern: { type: 'light', subtype: 'lantern' },
      chalice: { type: 'artifact', subtype: 'artifact' },
      circlet: { type: 'armor', subtype: 'helmet' },
      rod: { type: 'weapon', subtype: 'staff' },
      mantle: { type: 'armor', subtype: 'chestplate' },
    };

    const mapped = typeMap[art.type] || { type: 'artifact', subtype: 'artifact' };

    return {
      name: art.name,
      description: art.description,
      itemType: mapped.type,
      itemSubtype: mapped.subtype,
      artifactData: art,
      cursed: art.cursed,
    };
  }

  // Get world state summary for the loading screen
  getLoadingSummary() {
    const lines = [];
    lines.push(`World history spans ${this.currentYear.toLocaleString()} cycles across ${this.eras.length} eras.`);
    lines.push(`${this.civilizations.length} civilizations rose (${this.civilizations.filter(c => c.isActive).length} survive).`);
    lines.push(`${this.historicalFigures.length} notable figures shaped history.`);
    const livingFigures = this.historicalFigures.filter(f => f.isAlive);
    if (livingFigures.length > 0) {
      lines.push(`  ${livingFigures.length} still walk the corridors.`);
    }
    lines.push(`${this.wars.length} wars were fought.`);
    lines.push(`${this.catastrophes.length} catastrophes struck.`);
    lines.push(`${this.artifacts.length} legendary artifacts were created.`);
    const lostArtifacts = this.artifacts.filter(a => a.isLost);
    if (lostArtifacts.length > 0) {
      lines.push(`  ${lostArtifacts.length} remain lost.`);
    }
    lines.push(`${this.religions.length} belief systems emerged.`);
    lines.push(`${this.treaties.length} treaties and alliances forged.`);
    if (this.regions.length > 0) {
      lines.push(`${this.regions.length} regions mapped.`);
    }
    if (this.mapScars.length > 0) {
      lines.push(`${this.mapScars.length} historical scars mark the landscape.`);
    }
    lines.push(`${this.timeline.length} total historical events recorded.`);
    return lines;
  }

  // Map world history factions to game factions for the FactionSystem
  mapToGameFactions() {
    const mapping = [];

    for (const civ of this.civilizations.filter(c => c.isActive)) {
      mapping.push({
        civId: civ.id,
        name: civ.name,
        government: civ.government,
        values: civ.culturalValues,
        traditions: civ.traditions,
        population: civ.population,
        militaryStrength: civ.militaryStrength,
        allies: civ.allies,
        enemies: civ.enemies,
        religion: civ.religion,
        architectureStyle: civ.architectureStyle,
        regions: civ.controlledRegions,
      });
    }

    return mapping;
  }
}
