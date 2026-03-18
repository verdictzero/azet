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
];

const DEITY_TITLES = [
  'the Allfather', 'the Weaver', 'the Watcher', 'the Devourer',
  'the Silent', 'the Unbroken', 'the Keeper', 'the Forgetten',
  'the Architect', 'the Sleeper', 'the Judge', 'the Burning',
  'the Hollow', 'the Eternal', 'the Sealed', 'the Wanderer',
  'the Machine-God', 'the Last Light', 'the First Dark', 'the Mender',
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
];

const ARTIFACT_NAMES_SUFFIX = [
  'of the First Founders', 'of Undying Flame', 'of Shattered Stars',
  'of the Sealed Tomb', 'of the Void King', 'of Eternal Vigil',
  'of the Last Administrator', 'of the Deep Core', 'of the Broken Oath',
  'of the Machine Spirit', 'of the Colony\'s Heart', 'of the Sundered Pact',
  'of Ash and Iron', 'of the Silent Watch', 'of the Forgotten Archive',
  'of the Bleeding Hull', 'of the First Breach', 'of the Reclaimed Dawn',
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
];

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
];

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

    // Relationship tracking
    this.civRelations = new Map(); // 'civA|civB' -> { value, events }
    this.figureRelations = new Map(); // 'figA|figB' -> { type, events }

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
    const numEras = config.eras || this.rng.nextInt(4, 7);
    const yearsPerEra = config.yearsPerEra || this.rng.nextInt(80, 200);
    const totalYears = numEras * yearsPerEra;

    // Phase 1: Generate the cosmology and primordial elements
    this._generateCosmology();

    // Phase 2: Generate regions of the colony
    this._generateRegions();

    // Phase 3: Simulate history era by era
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
  // Phase 3: Era Simulation
  // ──────────────────────────────────────────

  _simulateEra(eraIndex, startYear, endYear) {
    const eraNames = [
      'The Age of Founding', 'The Age of Expansion', 'The Age of Conflict',
      'The Age of Reformation', 'The Age of Decline', 'The Age of Reckoning',
      'The Age of Rebirth', 'The Age of Silence', 'The Age of Iron',
      'The Age of the Breach',
    ];

    const era = {
      index: eraIndex,
      name: eraIndex < eraNames.length ? eraNames[eraIndex] : `The ${this.rng.random(CATASTROPHE_ADJECTIVES)} Age`,
      startYear,
      endYear,
      events: [],
      dominantCiv: null,
      summary: '',
    };

    // Generate civilizations for this era
    if (eraIndex === 0) {
      // Founding era: create initial civilizations
      const numCivs = this.rng.nextInt(3, 6);
      for (let i = 0; i < numCivs; i++) {
        this._createCivilization(startYear);
      }
    } else {
      // Later eras: some civs emerge, some collapse
      if (this.rng.chance(0.5)) {
        this._createCivilization(startYear);
      }
    }

    // Simulate year-by-year events within this era
    const activeCivs = this.civilizations.filter(c => c.isActive);
    const stepSize = this.rng.nextInt(5, 15);

    for (let year = startYear; year < endYear; year += stepSize) {
      // Historical figure births (proportional to active civs)
      if (this.rng.chance(0.3)) {
        const civ = this.rng.random(activeCivs.length > 0 ? activeCivs : this.civilizations);
        if (civ) this._birthHistoricalFigure(year, civ);
      }

      // Wars
      if (this.rng.chance(0.12) && activeCivs.length >= 2) {
        this._generateWar(year, activeCivs);
      }

      // Catastrophes
      if (this.rng.chance(0.08)) {
        this._generateCatastrophe(year);
      }

      // Treaties / alliances
      if (this.rng.chance(0.1) && activeCivs.length >= 2) {
        this._generateTreaty(year, activeCivs);
      }

      // Artifact creation
      if (this.rng.chance(0.08)) {
        this._createArtifact(year);
      }

      // Figure actions (existing figures do things)
      this._simulateFigureActions(year);

      // Civilization growth/decline
      for (const civ of activeCivs) {
        this._updateCivilization(civ, year);
      }

      // Religion events
      if (this.rng.chance(0.06)) {
        this._generateReligiousEvent(year);
      }
    }

    // Era summary
    const biggestCiv = activeCivs.reduce((best, c) =>
      (!best || c.population > best.population) ? c : best, null);
    era.dominantCiv = biggestCiv;

    const eraEvents = this.timeline.filter(e => e.year >= startYear && e.year < endYear);
    const wars = eraEvents.filter(e => e.type === 'war_start');
    const catastrophes = eraEvents.filter(e => e.type === 'catastrophe');

    era.summary = this._buildEraSummary(era, wars, catastrophes, biggestCiv);
    era.events = eraEvents;
    this.eras.push(era);
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

    this.timeline.push({
      year: year + duration,
      type: 'war_end',
      warId: war.id,
      description: `${warName} ends. ${winner.name} emerges victorious. ${consequences.join('. ')}.`,
      importance: 'major',
    });

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
      default: {
        // General — pick randomly from all types
        const topics = ['war', 'artifact', 'figure', 'religion', 'catastrophe', 'civilization', 'tradition'];
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
    lines.push(`World history spans ${this.currentYear} cycles across ${this.eras.length} eras.`);
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
