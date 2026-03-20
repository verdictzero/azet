import { COLORS, LAYOUT, Renderer, Camera, InputManager, ParticleSystem, GlowSystem } from './engine.js';
import { SeededRNG, PerlinNoise, AStar, distance, bresenhamLine } from './utils.js';
import { OverworldGenerator, ChunkManager, SettlementGenerator, BuildingInterior, DungeonGenerator, TowerGenerator, RuinGenerator } from './world.js';
import { NameGenerator, NPCGenerator, DialogueSystem, LoreGenerator, Player, ItemGenerator, CreatureGenerator } from './entities.js';
import { CombatSystem, QuestSystem, ShopSystem, FactionSystem, TimeSystem, InventorySystem, EventSystem, WeatherSystem, LightingSystem, CloudSystem } from './systems.js';
import { WorldHistoryGenerator } from './worldhistory.js';
import { UIManager } from './ui.js';
import { getMonsterArt } from './monsterart.js';

// ═══════════════════════════════════════════
//  GAME - Main controller
// ═══════════════════════════════════════════

class Game {
  constructor() {
    this.canvas = document.getElementById('game-canvas');
    this.renderer = new Renderer(this.canvas);
    this.input = new InputManager();
    this.camera = new Camera(this.renderer.cols - 2, this.renderer.rows - LAYOUT.HUD_TOTAL);
    this.locationCamera = null;
    this.ui = new UIManager(this.renderer);
    this._loadVersion();

    // Game state
    this.state = 'MENU'; // MENU, CHAR_CREATE, LOADING, OVERWORLD, LOCATION, DUNGEON, DIALOGUE, SHOP, INVENTORY, CHARACTER, QUEST_LOG, MAP, HELP, SETTINGS, GAME_OVER, COMBAT, QUEST_COMPASS

    // Settings (persisted to localStorage)
    this.settings = {
      crtEffects: false,
      crtGlow: true,
      crtScanlines: true,
      crtAberration: true,
      fontSize: 16,
      touchControls: true,
      autoSaveInterval: 100, // turns
      showQuestNav: true, // quest navigation overlay
    };
    this._loadSettings();
    this.prevState = null;

    // Quest navigation tracking
    this._trackedQuestId = null;
    this.running = true;
    this.lastFrame = 0;
    this.turnCount = 0;
    this.seed = Date.now();
    this.rng = new SeededRNG(this.seed);

    // Generators
    this.nameGen = new NameGenerator();
    this.npcGen = new NPCGenerator();
    this.dialogueSys = new DialogueSystem();
    this.loreGen = new LoreGenerator();
    this.itemGen = new ItemGenerator();
    this.creatureGen = new CreatureGenerator();
    this.overworldGen = new OverworldGenerator();
    this.settlementGen = new SettlementGenerator();
    this.buildingInterior = new BuildingInterior();
    this.dungeonGen = new DungeonGenerator();
    this.towerGen = new TowerGenerator();
    this.ruinGen = new RuinGenerator();

    // Systems
    this.combat = new CombatSystem();
    this.questSystem = new QuestSystem();
    this.shopSystem = new ShopSystem();
    this.factionSystem = new FactionSystem();
    this.timeSystem = new TimeSystem();
    this.eventSystem = new EventSystem(this.rng);
    this.weatherSystem = new WeatherSystem(this.rng);
    this.particles = new ParticleSystem();
    this.glow = new GlowSystem();
    this.ui.glow = this.glow;
    this.lighting = new LightingSystem();
    this.cloudSystem = new CloudSystem(this.seed);

    // Debug state
    this.debug = {
      invincible: false,
      noClip: false,
      revealMap: false,
      forceTimeOfDay: null, // null = normal, or hour value
      forceWeather: null,
      showLightMap: false,
      disableShadows: false,
      disableLighting: false,
      disableClouds: false,
      noEncounters: false,
      infiniteAttack: false,
      infiniteMana: false,
    };
    this._debugPanel = null;
    this._debugVisible = false;

    // World history (deep procedural history engine)
    this.worldHistoryGen = null;
    this.worldHistory = null;

    // World data
    this.overworld = null;
    this.currentSettlement = null;
    this.currentDungeon = null;
    this.currentTower = null;
    this.currentFloor = 0;
    this.npcs = [];
    this.enemies = [];
    this.items = [];
    this.player = null;

    // Active world events with consequences
    this.activeEffects = {
      encounterRateMultiplier: 1.0,
      shopPriceMultiplier: 1.0,
      undeadStrengthMultiplier: 1.0,
      potionPriceMultiplier: 1.0,
    };

    // Status effects on player
    this.statusEffects = [];

    // Transition effect
    this.transitionTimer = 0;
    this.transitionCallback = null;
    this.transitionType = 'fadeIn'; // fadeIn, fadeOut

    // Character creation state
    this.charGenState = { step: 'race', race: null, playerClass: null, name: '', historyDepth: 'medium' };

    // Game context for UI
    this.gameContext = {
      currentLocationName: 'World',
      currentLocation: null
    };

    // Combat state
    this.combatState = null;

    // Active dialogue/shop
    this.activeNPC = null;

    // Resize handler
    window.addEventListener('resize', () => this.handleResize());
    this.handleResize();
  }

  handleResize() {
    this.renderer.resize();
    this.camera.viewportCols = this.renderer.cols - 2;
    this.camera.viewportRows = this.renderer.rows - LAYOUT.HUD_TOTAL;
    if (this.locationCamera) {
      this.locationCamera.viewportCols = this.renderer.cols - 2;
      this.locationCamera.viewportRows = this.renderer.rows - LAYOUT.HUD_TOTAL;
    }
  }

  // ─── STATE MANAGEMENT ───

  setState(newState) {
    this.prevState = this.state;
    this.state = newState;
    this.ui.resetSelection();
    // Reset zoom when leaving dungeon/location states
    if (newState === 'OVERWORLD' && this.renderer.zoomLevel !== 1.0) {
      this.renderer.setZoom(1.0);
      this.camera.viewportCols = this.renderer.cols - 2;
      this.camera.viewportRows = this.renderer.rows - LAYOUT.HUD_TOTAL;
    }
    // Update touch controls layout for new state
    this.input.updateTouchLayout(newState);
  }

  _zoomIn() {
    const levels = [1.0, 1.5, 2.0];
    const cur = this.renderer.zoomLevel;
    const next = levels.find(l => l > cur) || levels[levels.length - 1];
    if (next === cur) return;
    this.renderer.setZoom(next);
    this._updateCameraAfterZoom();
    this.ui.addMessage(`Zoom: ${next}x`, COLORS.BRIGHT_CYAN);
  }

  _zoomOut() {
    const levels = [1.0, 1.5, 2.0];
    const cur = this.renderer.zoomLevel;
    const prev = [...levels].reverse().find(l => l < cur) || levels[0];
    if (prev === cur) return;
    this.renderer.setZoom(prev);
    this._updateCameraAfterZoom();
    this.ui.addMessage(`Zoom: ${prev}x`, COLORS.BRIGHT_CYAN);
  }

  _updateCameraAfterZoom() {
    const viewW = this.renderer.cols - 2;
    const viewH = this.renderer.rows - LAYOUT.HUD_TOTAL;
    if (this.state === 'LOCATION' && this.locationCamera) {
      this.locationCamera.viewportCols = viewW;
      this.locationCamera.viewportRows = viewH;
      this.locationCamera.follow(this.player);
      this.locationCamera.x = this.locationCamera.targetX;
      this.locationCamera.y = this.locationCamera.targetY;
    }
    if (this.state === 'DUNGEON') {
      this.camera.viewportCols = viewW;
      this.camera.viewportRows = viewH;
    }
    this.renderer.invalidate();
  }

  // Start a screen fade transition. Fades out, runs callback, fades in.
  startTransition(callback) {
    this.transitionTimer = 10; // frames of fade-out
    this.transitionType = 'fadeOut';
    this.transitionCallback = () => {
      if (callback) callback();
      this.transitionTimer = 10; // frames of fade-in
      this.transitionType = 'fadeIn';
      this.transitionCallback = null;
    };
  }

  updateTransition() {
    if (this.transitionTimer > 0) {
      this.transitionTimer--;
      if (this.transitionTimer <= 0 && this.transitionCallback) {
        this.transitionCallback();
      }
    }
  }

  renderTransition() {
    if (this.transitionTimer <= 0) return;
    const maxFrames = 10;
    let alpha;
    if (this.transitionType === 'fadeOut') {
      alpha = 1 - (this.transitionTimer / maxFrames); // 0→1 (darkening)
    } else {
      alpha = this.transitionTimer / maxFrames; // 1→0 (lightening)
    }
    if (alpha > 0.01) {
      this.renderer.tintOverlay('black', alpha);
    }
  }

  // ─── GAME INITIALIZATION ───

  startNewGame() {
    this.setState('LOADING');
    this._loadLog = [];
    this._loadStep = 0;
    this._worldGenEvents = [];
    this._worldGenStats = { currentYear: 0, activeCivs: 0, fallenCivs: 0, wars: 0, figures: 0, artifacts: 0, catastrophes: 0, treaties: 0, totalPop: 0 };
    this._worldGenEra = null;
    this._worldGenPhase = 'Awakening...';

    const log = (text, color) => {
      this._loadLog.push({ text, color: color || COLORS.BRIGHT_GREEN });
    };

    const flush = (header) => {
      this.ui.drawLoading(header, this._loadLog);
      this.renderer.endFrame();
      this.renderer.postProcess();
    };

    // History depth config from character creation
    const depthConfigs = {
      short:  { eras: 3, yearsPerEra: 100, eventDensity: 0.7 },
      medium: { eras: 5, yearsPerEra: 120, eventDensity: 1.0 },
      long:   { eras: 7, yearsPerEra: 150, eventDensity: 1.3 },
      epic:   { eras: 11, yearsPerEra: 180, eventDensity: 1.6 },
    };
    const depthKey = this.charGenState.historyDepth || 'medium';
    const depthCfg = depthConfigs[depthKey];

    // ─── Verbose world gen display helpers ───
    const addWorldGenEvent = (ev) => {
      this._worldGenEvents.push(ev);
      // Update live stats
      const s = this._worldGenStats;
      s.currentYear = ev.year || s.currentYear;
      if (ev.type === 'civ_founded') s.activeCivs++;
      if (ev.type === 'civ_collapsed') { s.activeCivs = Math.max(0, s.activeCivs - 1); s.fallenCivs++; }
      if (ev.type === 'war_start') s.wars++;
      if (ev.type === 'figure_born') s.figures++;
      if (ev.type === 'artifact_created') s.artifacts++;
      if (ev.type === 'catastrophe' || ev.type === 'tech_collapse' || ev.type === 'plague_spread' || ev.type === 'dark_age') s.catastrophes++;
      if (ev.type === 'treaty' || ev.type === 'golden_age') s.treaties++;
      if (ev.type === 'invasion') s.wars++;
      if (ev.type === 'faction_schism') { s.activeCivs++; }
      if (ev.type === 'era_start') this._worldGenEra = ev.description;
    };

    const flushWorldGen = (phase) => {
      this._worldGenPhase = phase || this._worldGenPhase;
      // Compute total pop from current civs
      if (this.worldHistoryGen) {
        this._worldGenStats.totalPop = this.worldHistoryGen.civilizations
          .filter(c => c.isActive)
          .reduce((sum, c) => sum + (c.population || 0), 0);
        this._worldGenStats.activeCivs = this.worldHistoryGen.civilizations.filter(c => c.isActive).length;
        this._worldGenStats.fallenCivs = this.worldHistoryGen.civilizations.filter(c => !c.isActive).length;
      }
      this.renderer.beginFrame();
      this.ui.drawWorldGen(this._worldGenEvents, this._worldGenStats, this._worldGenEra, this._worldGenPhase);
      this.renderer.endFrame();
      this.renderer.postProcess();
    };

    // Step-by-step generation with visual feedback between each step
    const steps = [
      // Step 0: Initialize seed
      () => {
        this.seed = Date.now();
        this.rng = new SeededRNG(this.seed);
        this.cloudSystem = new CloudSystem(this.seed);
        addWorldGenEvent({ year: 0, type: 'init', description: `World seed: ${this.seed}`, category: 'misc' });
        addWorldGenEvent({ year: 0, type: 'init', description: `History depth: ${depthKey} (${depthCfg.eras} eras, ~${depthCfg.eras * depthCfg.yearsPerEra} years)`, category: 'era' });
        flushWorldGen('Awakening...');
      },
      // Step 1: Generate world history with event streaming
      () => {
        this.worldHistoryGen = new WorldHistoryGenerator(this.seed);
        this.worldHistory = this.worldHistoryGen.generate({
          eras: depthCfg.eras,
          yearsPerEra: depthCfg.yearsPerEra,
          eventDensity: depthCfg.eventDensity,
          onEvent: (ev) => addWorldGenEvent(ev),
        });
        flushWorldGen('History complete');
      },
      // Step 2: Display streaming events with animated delays
      () => {
        // Stream world gen events to the display one batch at a time
        const events = this._worldGenEvents;
        const batchSize = Math.max(3, Math.floor(events.length / 20));
        let displayed = 0;
        const streamBatch = () => {
          displayed += batchSize;
          // Recalculate stats for display
          if (this.worldHistoryGen) {
            this._worldGenStats.wars = this.worldHistoryGen.wars.length;
            this._worldGenStats.figures = this.worldHistoryGen.historicalFigures.length;
            this._worldGenStats.artifacts = this.worldHistoryGen.artifacts.length;
            this._worldGenStats.catastrophes = this.worldHistoryGen.catastrophes.length;
            this._worldGenStats.treaties = this.worldHistoryGen.treaties.length;
            this._worldGenStats.currentYear = this.worldHistoryGen.currentYear;
          }
          flushWorldGen('Simulating history...');
          if (displayed < events.length) {
            setTimeout(streamBatch, 60);
          } else {
            // Add summary events
            addWorldGenEvent({ year: this.worldHistoryGen.currentYear, type: 'summary',
              description: `═══ ${this.worldHistoryGen.currentYear} years of history simulated ═══`, category: 'era' });
            addWorldGenEvent({ year: this.worldHistoryGen.currentYear, type: 'summary',
              description: `${this.worldHistoryGen.civilizations.length} civilizations rose — ${this.worldHistoryGen.civilizations.filter(c=>c.isActive).length} survive`, category: 'civ' });
            addWorldGenEvent({ year: this.worldHistoryGen.currentYear, type: 'summary',
              description: `${this.worldHistoryGen.wars.length} wars, ${this.worldHistoryGen.artifacts.length} artifacts, ${this.worldHistoryGen.historicalFigures.length} legends`, category: 'misc' });
            this._worldGenResumeStep = 3;
            this._worldGenRunStep = runStep;
            this.setState('WORLD_GEN_PAUSE');
            flushWorldGen('History woven — press any key to continue');
          }
        };
        streamBatch();
        return 'async'; // Signal that this step manages its own continuation
      },
      // Step 3: Wire history into subsystems
      () => {
        this.loreGen.setWorldHistory(this.worldHistoryGen);
        this.dialogueSys.setWorldHistory(this.worldHistoryGen);
        this.npcGen.setWorldHistory(this.worldHistoryGen);
        this.eventSystem.setWorldHistory(this.worldHistoryGen);

        // Switch to standard loading display for terrain gen
        log('History simulation complete.', COLORS.BRIGHT_CYAN);
        log(`  ${this.worldHistoryGen.currentYear} years across ${this.worldHistoryGen.eras.length} eras`, COLORS.BRIGHT_YELLOW);
        log(`  ${this.worldHistoryGen.civilizations.length} civilizations, ${this.worldHistoryGen.wars.length} wars`, COLORS.WHITE);
        log(`  ${this.worldHistoryGen.artifacts.length} artifacts, ${this.worldHistoryGen.historicalFigures.length} notable figures`, COLORS.WHITE);
        flush('Building world...');
      },
      // Step 4: Generate terrain and chunks
      () => {
        log('Charting the lands...', COLORS.BRIGHT_CYAN);
        log('  Generating Perlin noise heightmap (scale: 0.04)', COLORS.WHITE);
        log('  Computing moisture overlay for biome distribution', COLORS.WHITE);
        log('  Chunk size: 32x32 tiles, infinite procedural world', COLORS.WHITE);
        flush('Charting terrain...');
      },
      // Step 5: Create ChunkManager and generate initial chunks
      () => {
        this.overworld = new ChunkManager(this.seed);
        this.overworld.ensureChunksAround(16, 16);
        const loadedLocs = this.overworld.getLoadedLocations();
        log(`  Initial chunks generated: ${this.overworld.chunks.size} regions`, COLORS.WHITE);
        log(`  Total tiles computed: ${this.overworld.chunks.size * 32 * 32}`, COLORS.BRIGHT_BLACK);
        log(`  ${loadedLocs.length} settlements and landmarks discovered`, COLORS.BRIGHT_YELLOW);
        for (const loc of loadedLocs.slice(0, 8)) {
          const popLabel = loc.population > 0 ? ` (pop. ${loc.population})` : '';
          log(`    ${loc.type.toUpperCase()}: ${loc.name}${popLabel} at [${loc.x}, ${loc.y}]`, COLORS.WHITE);
        }
        if (loadedLocs.length > 8) {
          log(`    ...and ${loadedLocs.length - 8} more locations`, COLORS.BRIGHT_BLACK);
        }
        flush('Charting lands...');
      },
      // Step 6: Populate locations
      () => {
        log('Surveying settlements and landmarks...', COLORS.BRIGHT_CYAN);
        const typeCounts = {};
        const typePopulation = {};
        for (const loc of this.overworld.getLoadedLocations()) {
          typeCounts[loc.type] = (typeCounts[loc.type] || 0) + 1;
          typePopulation[loc.type] = (typePopulation[loc.type] || 0) + (loc.population || 0);
        }
        for (const [type, count] of Object.entries(typeCounts)) {
          const pop = typePopulation[type] || 0;
          const popStr = pop > 0 ? ` — total population: ${pop}` : '';
          log(`  ${type}: ${count}${popStr}`, COLORS.WHITE);
        }
        const totalPop = Object.values(typePopulation).reduce((s, v) => s + v, 0);
        if (totalPop > 0) {
          log(`  Total known population: ${totalPop} souls`, COLORS.BRIGHT_YELLOW);
        }
        flush('Populating world...');
      },
      // Step 7: Initialize faction system
      () => {
        log('Establishing faction allegiances...', COLORS.BRIGHT_CYAN);
        if (this.worldHistoryGen) {
          this.factionSystem.enrichWithWorldHistory(this.worldHistoryGen);
        }
        const factions = Array.from(this.factionSystem._factions.values());
        for (const f of factions) {
          const extra = f.culturalValues ? ` (values: ${f.culturalValues.join(', ')})` : '';
          log(`  ${f.name}${extra}`, COLORS.WHITE);
        }
        flush('Initializing factions...');
      },
      // Step 8: Generate world events
      () => {
        log('Weaving the threads of fate...', COLORS.BRIGHT_CYAN);
        this.eventSystem.generateWorldEvents(this.overworld);
        log('  Festivals, plagues, and monster incursions foretold', COLORS.WHITE);
        log('  Trade caravans and bandit raids scheduled', COLORS.WHITE);
        if (this.worldHistoryGen.culturalTraditions && this.worldHistoryGen.culturalTraditions.length > 0) {
          log(`  ${this.worldHistoryGen.culturalTraditions.length} cultural traditions persist`, COLORS.WHITE);
        }
        flush('Weaving fate...');
      },
      // Step 9: Generate lore
      () => {
        log('Recovering ancient lore...', COLORS.BRIGHT_CYAN);
        const factionNames = this.factionSystem.getAllFactionNames();
        const locationNames = this.overworld.getLoadedLocations().map(l => l.name);
        this.worldLore = this.loreGen.generateWorldHistory(this.rng, factionNames, locationNames);
        log(`  ${this.worldLore.length} historical records compiled`, COLORS.WHITE);
        flush('Loading lore...');
      },
      // Step 10: Initialize weather
      () => {
        log('Reading the skies...', COLORS.BRIGHT_CYAN);
        log(`  Current weather: ${this.weatherSystem.current || 'clear'}`, COLORS.WHITE);
        log('  Day/night cycle active', COLORS.WHITE);
        flush('Reading skies...');
      },
      // Step 11: Create player
      () => {
        const race = this.charGenState.race || 'human';
        const pClass = this.charGenState.playerClass || 'junk_collector';
        const name = this.charGenState.name || 'Wanderer';
        this.player = new Player(name, race, pClass);
        log('Creating player character...', COLORS.BRIGHT_CYAN);
        log(`  Name: ${this.player.name}`, COLORS.BRIGHT_WHITE);
        log(`  Race: ${race}  Class: ${pClass}`, COLORS.WHITE);
        log(`  HP: ${this.player.stats.maxHp}  MP: ${this.player.stats.maxMana}`, COLORS.WHITE);
        log(`  STR: ${this.player.stats.str}  DEX: ${this.player.stats.dex}  INT: ${this.player.stats.int}`, COLORS.WHITE);
        flush('Creating character...');
      },
      // Step 12: Place player and enter world
      () => {
        const loadedLocs = this.overworld.getLoadedLocations();
        const startLoc = loadedLocs.find(l => l.type === 'village') || loadedLocs[0];
        if (startLoc) {
          this.player.position.x = startLoc.x;
          this.player.position.y = startLoc.y;
          this.player.knownLocations = new Set([startLoc.id]);
          this.gameContext.currentLocationName = startLoc.name;
          this.gameContext.currentLocation = startLoc;
        } else {
          this.player.position.x = 16;
          this.player.position.y = 16;
          this.player.knownLocations = new Set();
        }

        this.overworld.ensureChunksAround(this.player.position.x, this.player.position.y);
        this.camera.follow(this.player);
        this.camera.x = this.player.position.x - Math.floor(this.renderer.cols / 2);
        this.camera.y = this.player.position.y - Math.floor(this.renderer.rows / 2);
        this.camera.targetX = this.camera.x;
        this.camera.targetY = this.camera.y;

        log('', COLORS.BLACK);
        log('══════════════════════════════', COLORS.BRIGHT_YELLOW);
        log('  World generation complete!', COLORS.BRIGHT_YELLOW);
        log(`  ${this.overworld.chunks.size} regions mapped`, COLORS.WHITE);
        log(`  ${this.worldHistoryGen.currentYear} years of history`, COLORS.WHITE);
        log(`  ${this.worldHistoryGen.civilizations.length} civilizations`, COLORS.WHITE);
        log(`  ${this.worldHistoryGen.artifacts.length} artifacts`, COLORS.WHITE);
        log('══════════════════════════════', COLORS.BRIGHT_YELLOW);
        log('  Entering game...', COLORS.BRIGHT_GREEN);
        flush('Ready!');

        setTimeout(() => {
          if (startLoc) {
            this.enterLocation(startLoc);
          } else {
            this.setState('OVERWORLD');
          }
          this.ui.addMessage('Welcome to ASCIIQUEST!', COLORS.BRIGHT_YELLOW);
          this.ui.addMessage(`${this.player.name} the ${this.player.race} ${this.player.playerClass} sets forth.`, COLORS.BRIGHT_CYAN);
          this.ui.addMessage('Press ? for help. Press J for quest compass.', COLORS.BRIGHT_BLACK);
        }, 400);
      },
    ];

    // Run steps sequentially with delays between each for visual effect
    const runStep = (i) => {
      if (i >= steps.length) return;
      const result = steps[i]();
      if (result === 'async') return; // Step manages its own continuation
      setTimeout(() => runStep(i + 1), 180);
    };
    setTimeout(() => runStep(0), 50);
  }

  enterLocation(location) {
    const locId = typeof location.id === 'string' ? location.id.charCodeAt(0) : (location.id || 0);
    const locRng = new SeededRNG(this.seed + locId * 1000);
    this.currentSettlement = this.settlementGen.generate(locRng, location.type, location.population || 10, 'grassland');
    this.currentSettlement.name = location.name;
    this.currentSettlement.locationData = location;

    // Generate NPCs for this location
    this.npcs = [];
    if (this.currentSettlement.npcSlots) {
      for (const slot of this.currentSettlement.npcSlots) {
        const race = locRng.random(['human', 'human', 'human', 'enhanced', 'cyborg', 'human']);
        const npc = this.npcGen.generate(locRng, slot.role, race, { location: location.name });
        npc.position = { x: slot.position.x, y: slot.position.y };
        this.npcs.push(npc);
      }
    }

    // Place player at entrance (at the core area, offset if outskirts exist)
    const coreOff = this.currentSettlement.coreOffset || { x: 0, y: 0 };
    const coreW = (this.currentSettlement.tiles[0] || []).length - coreOff.x * 2;
    this.player.position.x = coreOff.x + Math.floor(coreW / 2);
    this.player.position.y = (this.currentSettlement.tiles || []).length - coreOff.y - 2;

    // Create location camera
    this.locationCamera = new Camera(
      this.renderer.cols - 2,
      this.renderer.rows - LAYOUT.HUD_TOTAL
    );
    this.locationCamera.follow(this.player);
    this.locationCamera.x = this.locationCamera.targetX;
    this.locationCamera.y = this.locationCamera.targetY;

    this.gameContext.currentLocationName = location.name;
    this.gameContext.currentLocation = location;
    this.setState('LOCATION');
    this.ui.addMessage(`You arrive at ${location.name}.`, COLORS.BRIGHT_GREEN);

    // World history flavor text on arrival
    if (this.worldHistoryGen) {
      const locHist = this.worldHistoryGen.getLocationHistory(location.name);
      if (locHist.controllingCiv) {
        this.ui.addMessage(`This area is claimed by ${locHist.controllingCiv.name}.`, COLORS.BRIGHT_CYAN);
      }
      if (locHist.artifacts.length > 0) {
        this.ui.addMessage(`Legends say the ${locHist.artifacts[0].name} was last seen near here.`, COLORS.BRIGHT_YELLOW);
      }
      if (locHist.events.length > 0) {
        const recentEvent = locHist.events[locHist.events.length - 1];
        if (recentEvent && this.rng.chance(0.4)) {
          this.ui.addMessage(`The locals whisper of past events here...`, COLORS.BRIGHT_BLACK);
        }
      }
    }

    // Show weather
    if (this.weatherSystem.current !== 'clear') {
      this.ui.addMessage(this.weatherSystem.getDescription(), COLORS.BRIGHT_CYAN);
    }

    // Check if shops closed at night
    if (!this.timeSystem.isDaytime()) {
      this.ui.addMessage('Most shops are closed for the night.', COLORS.BRIGHT_BLACK);
    }
  }

  enterTower(location) {
    const towerId = typeof location.id === 'string' ? location.id.charCodeAt(0) : (location.id || 0);
    const towerRng = new SeededRNG(this.seed + towerId * 4000);
    const purpose = towerRng.random(['research', 'corrupted', 'garrison']);
    const floors = towerRng.nextInt(5, 10);
    this.currentTower = this.towerGen.generate(towerRng, floors, purpose);
    this.currentFloor = 0;
    this.currentDungeon = this.currentTower[0];

    // Spawn enemies from tower entities
    this.enemies = [];
    if (this.currentDungeon.entities) {
      for (const ent of this.currentDungeon.entities) {
        const creature = this.creatureGen.generate(towerRng, 'ruins', this.currentFloor + 1, this.player.stats.level);
        creature.position = { x: ent.x, y: ent.y };
        this.enemies.push(creature);
      }
    }

    // Place items from tower items
    this.items = [];
    if (this.currentDungeon.items) {
      for (const spot of this.currentDungeon.items) {
        const item = this.itemGen.generate(towerRng,
          towerRng.random(['weapon', 'armor', 'potion', 'scroll']),
          this.itemGen.rollRarity(towerRng, this.currentFloor + 1),
          this.currentFloor + 1);
        item.position = { x: spot.x, y: spot.y };
        this.items.push(item);
      }
    }

    // Place player at entrance (bottom of tower)
    const tiles = this.currentDungeon.tiles;
    const cy = Math.floor(tiles.length / 2);
    const cx = Math.floor(tiles[0].length / 2);
    this.player.position.x = cx;
    this.player.position.y = cy + 5;

    this.gameContext.currentLocationName = (location.name || 'Tower') + ` (Floor ${this.currentFloor + 1})`;
    this.setState('DUNGEON');
    this.ui.addMessage(`You enter the spire...`, COLORS.BRIGHT_MAGENTA);
  }

  enterRuin(location) {
    const ruinId = typeof location.id === 'string' ? location.id.charCodeAt(0) : (location.id || 0);
    const ruinRng = new SeededRNG(this.seed + ruinId * 5000);
    const ruin = this.ruinGen.generate(ruinRng, 'settlement', ruinRng.nextInt(50, 90));
    this.currentDungeon = ruin;
    this.currentFloor = 0;
    this.currentTower = null;

    // Spawn enemies in ruins
    this.enemies = [];
    const enemyCount = ruinRng.nextInt(3, 8);
    for (let i = 0; i < enemyCount; i++) {
      const creature = this.creatureGen.generate(ruinRng, 'haunted', 1, this.player.stats.level);
      // Find walkable tile
      for (let attempts = 0; attempts < 50; attempts++) {
        const ex = ruinRng.nextInt(1, ruin.width - 2);
        const ey = ruinRng.nextInt(1, ruin.height - 2);
        if (ruin.tiles[ey] && ruin.tiles[ey][ex] && ruin.tiles[ey][ex].walkable) {
          creature.position = { x: ex, y: ey };
          this.enemies.push(creature);
          break;
        }
      }
    }

    // Place items near story elements
    this.items = [];
    if (ruin.storyElements) {
      for (const elem of ruin.storyElements) {
        if (ruinRng.chance(0.4)) {
          const item = this.itemGen.generate(ruinRng,
            ruinRng.random(['weapon', 'armor', 'potion']),
            this.itemGen.rollRarity(ruinRng, 3),
            2);
          item.position = { x: elem.x, y: elem.y };
          this.items.push(item);
        }
      }
    }

    // Place player at a walkable spot
    for (let y = ruin.height - 1; y >= 0; y--) {
      for (let x = 0; x < ruin.width; x++) {
        if (ruin.tiles[y][x].walkable) {
          this.player.position.x = x;
          this.player.position.y = y;
          y = -1; break;
        }
      }
    }

    this.gameContext.currentLocationName = location.name || 'Ruins';
    this.setState('DUNGEON');
    this.ui.addMessage(`You explore the ancient ruins...`, COLORS.BRIGHT_YELLOW);
  }

  enterDungeon(location) {
    const dungId = typeof location.id === 'string' ? location.id.charCodeAt(0) : (location.id || 0);
    const dungRng = new SeededRNG(this.seed + dungId * 2000);
    this.currentFloor = 0;
    const dungeon = this.dungeonGen.generate(dungRng, 60, 40, 1, 'standard');
    this.currentDungeon = dungeon;

    // Spawn enemies using CreatureGenerator
    this.enemies = [];
    const biome = this.gameContext.currentLocation?.biome || 'ruins';
    if (dungeon.entitySpots) {
      for (const spot of dungeon.entitySpots) {
        if (spot.type === 'enemy') {
          const creature = this.creatureGen.generate(dungRng, biome, this.currentFloor + 1, this.player.stats.level);
          creature.position = { x: spot.x, y: spot.y };
          this.enemies.push(creature);
        }
      }
    }

    // Place items
    this.items = [];
    if (dungeon.entitySpots) {
      for (const spot of dungeon.entitySpots) {
        if (spot.type === 'item') {
          const item = this.itemGen.generate(dungRng,
            dungRng.random(['weapon', 'armor', 'potion']),
            this.itemGen.rollRarity(dungRng, this.currentFloor + 1),
            this.currentFloor + 1);
          item.position = { x: spot.x, y: spot.y };
          this.items.push(item);
        }
      }
    }

    // Find entrance room for player placement
    if (dungeon.rooms && dungeon.rooms.length > 0) {
      const entrance = dungeon.rooms.find(r => r.type === 'entrance') || dungeon.rooms[0];
      this.player.position.x = entrance.x + Math.floor(entrance.w / 2);
      this.player.position.y = entrance.y + Math.floor(entrance.h / 2);
    }

    this.gameContext.currentLocationName = (location.name || 'Dungeon') + ` (Floor ${this.currentFloor + 1})`;
    this.setState('DUNGEON');
    this.ui.addMessage('You descend into the dark depths...', COLORS.BRIGHT_RED);
  }

  // ─── INPUT HANDLING ───

  handleInput(key) {
    // Debug menu toggle
    if (key === '`') {
      this.toggleDebugPanel();
      return;
    }
    switch (this.state) {
      case 'MENU': return this.handleMenuInput(key);
      case 'CHAR_CREATE': return this.handleCharCreateInput(key);
      case 'OVERWORLD': return this.handleOverworldInput(key);
      case 'LOCATION': return this.handleLocationInput(key);
      case 'DUNGEON': return this.handleDungeonInput(key);
      case 'DIALOGUE': return this.handleDialogueInput(key);
      case 'SHOP': return this.handleShopInput(key);
      case 'INVENTORY': return this.handleInventoryInput(key);
      case 'CHARACTER': return this.handleGenericClose(key);
      case 'QUEST_LOG': return this.handleQuestLogInput(key);
      case 'MAP': return this.handleGenericClose(key);
      case 'HELP': return this.handleHelpInput(key);
      case 'FACTION': return this.handleGenericClose(key);
      case 'SETTINGS': return this.handleSettingsInput(key);
      case 'GAME_OVER': return this.handleGameOverInput(key);
      case 'COMBAT': return this.handleCombatInput(key);
      case 'QUEST_COMPASS': return this.handleQuestCompassInput(key);
      case 'WORLD_GEN_PAUSE':
        this.setState('LOADING');
        this._worldGenRunStep(this._worldGenResumeStep);
        return;
    }
  }

  handleMenuInput(key) {
    const result = this.ui.handleMenuInput(key, 5);
    if (result === 'select') {
      switch (this.ui.selectedIndex) {
        case 0: // New Game
          this.charGenState = { step: 'race', race: null, playerClass: null, name: '', historyDepth: 'medium' };
          this.ui.resetSelection();
          this.setState('CHAR_CREATE');
          break;
        case 1: { // Quick Start
          const races = ['human', 'enhanced', 'cyborg'];
          const classes = ['junk_collector', 'scavenger', 'mercenary', 'engineer'];
          const race = this.rng.random(races);
          const playerClass = this.rng.random(classes);
          const nameObj = this.nameGen.generate(this.rng, race);
          this.charGenState = { step: 'history_depth', race, playerClass, name: nameObj.first, historyDepth: 'medium', quickStart: true };
          this.ui.resetSelection();
          this.ui.selectedIndex = 0; // Default to "Short" for quick start
          this.setState('CHAR_CREATE');
          break;
        }
        case 2: // Continue
          if (this.loadGame()) {
            this.ui.addMessage('Game loaded.', COLORS.BRIGHT_GREEN);
          } else {
            this.ui.addMessage('No save found.', COLORS.BRIGHT_RED);
          }
          break;
        case 3: // Settings (placeholder)
          this.ui.addMessage('Settings coming soon.', COLORS.BRIGHT_BLACK);
          break;
        case 4: // Help
          this.setState('HELP');
          break;
      }
    }
  }

  handleCharCreateInput(key) {
    const step = this.charGenState.step;

    if (step === 'name') {
      if (key === 'Enter' && this.charGenState.name.length > 0) {
        this.input.exitTextInputMode();
        this.charGenState.step = 'history_depth';
        this.ui.resetSelection();
        this.ui.selectedIndex = 1; // Default to "Medium"
        return;
      }
      if (key === 'Backspace') {
        this.charGenState.name = this.charGenState.name.slice(0, -1);
        return;
      }
      if (key === 'Escape') {
        this.input.exitTextInputMode();
        this.charGenState.step = 'class';
        return;
      }
      if (key.toLowerCase() === 'r' && this.charGenState.name.length === 0) {
        const nameObj = this.nameGen.generate(this.rng, this.charGenState.race || 'human');
        this.charGenState.name = nameObj.first;
        return;
      }
      if (key.length === 1 && key.match(/[a-zA-Z\s'-]/) && this.charGenState.name.length < 20) {
        this.charGenState.name += key;
        return;
      }
      return;
    }

    if (step === 'history_depth') {
      const depthOptions = ['short', 'medium', 'long', 'epic'];
      const result = this.ui.handleMenuInput(key, depthOptions.length);
      if (result === 'select') {
        this.charGenState.historyDepth = depthOptions[this.ui.selectedIndex];
        if (this.charGenState.quickStart) {
          this.startNewGame();
        } else {
          this.charGenState.step = 'confirm';
          this.ui.resetSelection();
        }
      }
      if (result === 'back') {
        if (this.charGenState.quickStart) {
          this.setState('MENU');
          this.ui.resetSelection();
        } else {
          this.charGenState.step = 'name';
          this.ui.resetSelection();
          this.input.enterTextInputMode();
        }
      }
      return;
    }

    if (step === 'confirm') {
      if (key === 'Enter') {
        this.startNewGame();
        return;
      }
      if (key === 'Escape') {
        this.input.exitTextInputMode();
        this.charGenState = { step: 'race', race: null, playerClass: null, name: '', historyDepth: 'medium' };
        this.ui.resetSelection();
        return;
      }
      return;
    }

    const races = ['human', 'enhanced', 'cyborg'];
    const classes = ['junk_collector', 'scavenger', 'mercenary', 'engineer'];
    const items = step === 'race' ? races : classes;

    const result = this.ui.handleMenuInput(key, items.length);
    if (result === 'select') {
      if (step === 'race') {
        this.charGenState.race = items[this.ui.selectedIndex];
        this.charGenState.step = 'class';
        this.ui.resetSelection();
      } else if (step === 'class') {
        this.charGenState.playerClass = items[this.ui.selectedIndex];
        this.charGenState.step = 'name';
        this.ui.resetSelection();
        this.input.enterTextInputMode();
      }
    }
    if (result === 'back') {
      if (step === 'class') {
        this.charGenState.step = 'race';
        this.ui.resetSelection();
      } else if (step === 'race') {
        this.setState('MENU');
      }
    }
  }

  handleOverworldInput(key) {
    // Open panels
    if (key === 'i' || key === 'I') { this.setState('INVENTORY'); return; }
    if (key === 'c' || key === 'C') { this.setState('CHARACTER'); return; }
    if (key === 'q' || key === 'Q') { this.setState('QUEST_LOG'); return; }
    if (key === 'm' || key === 'M') { this.setState('MAP'); return; }
    if (key === 'f' || key === 'F') { this.setState('FACTION'); return; }
    if (key === 'j' || key === 'J') { this._openQuestCompass(); return; }
    if (key === 'n' || key === 'N') { this._toggleQuestNav(); return; }
    if (key === '?') { this.setState('HELP'); return; }
    if (key === 'o' || key === 'O') { this.setState('SETTINGS'); return; }
    if (key === 'p' || key === 'P') { this.saveGame(); return; }

    // Movement (with night stumble penalty)
    let dir = this.getDirection(key);
    if (dir) {
      const isNight = !this.timeSystem.isDaytime();
      const lightInfo = this.player.hasLightSource();
      if (isNight && !lightInfo.hasLight && !this.debug.invincible) {
        // 10% chance to stumble in a random direction
        if (this.rng.chance(0.10)) {
          const dirs = [{dx:1,dy:0},{dx:-1,dy:0},{dx:0,dy:1},{dx:0,dy:-1}];
          dir = this.rng.random(dirs);
          this.ui.addMessage('You stumble in the darkness!', COLORS.BRIGHT_RED);
        }
        // Periodic warning messages
        if (this.rng.chance(0.15)) {
          const warns = [
            'The darkness closes in around you...',
            'You hear something moving nearby...',
            'You can barely see your own hands...',
            'An inn would be safer than this...',
          ];
          this.ui.addMessage(this.rng.random(warns), COLORS.BRIGHT_BLACK);
        }
      }
      this.movePlayer(dir.dx, dir.dy);
    }

    // Enter location
    if (key === 'Enter' || key === 'e' || key === 'E') {
      const loc = this.overworld.getLocation(this.player.position.x, this.player.position.y);
      if (loc) {
        this.startTransition(() => {
          this.renderer.invalidate();
          if (loc.type === 'dungeon') {
            this.enterDungeon(loc);
          } else if (loc.type === 'tower') {
            this.enterTower(loc);
          } else if (loc.type === 'ruins') {
            this.enterRuin(loc);
          } else {
            this.enterLocation(loc);
          }
        });
      }
    }

    // Rest
    if (key === 'r' || key === 'R') {
      this.timeSystem.advance(8);
      this.player.stats.hp = Math.min(this.player.stats.hp + Math.floor(this.player.stats.maxHp * 0.3), this.player.stats.maxHp);
      this.player.stats.mana = Math.min(this.player.stats.mana + Math.floor(this.player.stats.maxMana * 0.5), this.player.stats.maxMana);
      this.ui.addMessage('You rest for 8 hours. HP and Mana partially restored.', COLORS.BRIGHT_GREEN);
    }
  }

  handleLocationInput(key) {
    if (key === 'i' || key === 'I') { this.setState('INVENTORY'); return; }
    if (key === 'c' || key === 'C') { this.setState('CHARACTER'); return; }
    if (key === 'q' || key === 'Q') { this.setState('QUEST_LOG'); return; }
    if (key === 'm' || key === 'M') { this.setState('MAP'); return; }
    if (key === 'f' || key === 'F') { this.setState('FACTION'); return; }
    if (key === 'j' || key === 'J') { this._openQuestCompass(); return; }
    if (key === 'n' || key === 'N') { this._toggleQuestNav(); return; }
    if (key === '?') { this.setState('HELP'); return; }
    if (key === 'o' || key === 'O') { this.setState('SETTINGS'); return; }
    if (key === 'p' || key === 'P') { this.saveGame(); return; }

    // Zoom controls
    if (key === '+' || key === '=') { this._zoomIn(); return; }
    if (key === '-') { this._zoomOut(); return; }

    if (key === 'Escape') {
      // Leave location back to overworld with transition
      this.startTransition(() => {
        if (this.gameContext.currentLocation) {
          this.player.position.x = this.gameContext.currentLocation.x;
          this.player.position.y = this.gameContext.currentLocation.y;
        }
        this.currentSettlement = null;
        this.npcs = [];
        this.gameContext.currentLocationName = 'World';
        this.gameContext.currentLocation = null;
        this.camera.follow(this.player);
        this.camera.x = this.camera.targetX;
        this.camera.y = this.camera.targetY;
        this.renderer.invalidate();
        this.setState('OVERWORLD');
        this.ui.addMessage('You leave the settlement.', COLORS.WHITE);
      });
      return;
    }

    // Movement in settlement
    const dir = this.getDirection(key);
    if (dir) {
      this.movePlayerInLocation(dir.dx, dir.dy);
    }

    // Talk to adjacent NPC
    if (key === 't' || key === 'T' || key === 'Enter') {
      const nearNPC = this.findAdjacentNPC();
      if (nearNPC) {
        this.startDialogue(nearNPC);
      } else if (key === 'Enter') {
        // Check for building entrances or other interactions
        this.ui.addMessage('Nothing to interact with here.', COLORS.BRIGHT_BLACK);
      }
    }
  }

  handleDungeonInput(key) {
    if (key === 'i' || key === 'I') { this.setState('INVENTORY'); return; }
    if (key === 'c' || key === 'C') { this.setState('CHARACTER'); return; }
    if (key === 'q' || key === 'Q') { this.setState('QUEST_LOG'); return; }
    if (key === 'j' || key === 'J') { this._openQuestCompass(); return; }
    if (key === 'n' || key === 'N') { this._toggleQuestNav(); return; }
    if (key === '?') { this.setState('HELP'); return; }
    if (key === 'o' || key === 'O') { this.setState('SETTINGS'); return; }

    // Zoom controls
    if (key === '+' || key === '=') { this._zoomIn(); return; }
    if (key === '-') { this._zoomOut(); return; }

    if (key === 'Escape') {
      this.startTransition(() => {
        this.currentDungeon = null;
        this.currentTower = null;
        this.enemies = [];
        this.items = [];
        if (this.gameContext.currentLocation) {
          this.player.position.x = this.gameContext.currentLocation.x;
          this.player.position.y = this.gameContext.currentLocation.y;
        }
        this.gameContext.currentLocationName = 'World';
        this.gameContext.currentLocation = null;
        this.camera.follow(this.player);
        this.camera.x = this.camera.targetX;
        this.camera.y = this.camera.targetY;
        this.renderer.invalidate();
        this.setState('OVERWORLD');
        this.ui.addMessage('You escape the dungeon.', COLORS.WHITE);
      });
      return;
    }

    const dir = this.getDirection(key);
    if (dir) {
      this.movePlayerInDungeon(dir.dx, dir.dy);
    }

    // Pick up items
    if (key === 'g' || key === 'G' || key === ',') {
      const item = this.items.find(i =>
        i.position && i.position.x === this.player.position.x && i.position.y === this.player.position.y);
      if (item) {
        if (this.player.inventory.length < 20) {
          this.player.addItem(item);
          this.items = this.items.filter(i => i !== item);
          this.ui.addMessage(`Picked up ${item.name}.`, COLORS.BRIGHT_GREEN);
          this.particles.emit(item.position.x, item.position.y, '+', COLORS.BRIGHT_GREEN, 3, 2, 8);

          // Update FETCH quest progress
          const activeQuests = this.questSystem.getActiveQuests();
          for (const quest of activeQuests) {
            this.questSystem.updateProgress(quest.id, 'fetch', item.name, 1);
            this.questSystem.updateProgress(quest.id, 'fetch', item.type, 1);
            if (this.questSystem.checkCompletion(quest.id)) {
              this.ui.addMessage(`Quest "${quest.title}" is ready to turn in!`, COLORS.BRIGHT_YELLOW);
            }
          }
        } else {
          this.ui.addMessage('Inventory full!', COLORS.BRIGHT_RED);
        }
      }
    }

    // Use stairs
    if (key === '>' || key === '<') {
      if (this.currentDungeon && this.currentDungeon.tiles) {
        const tile = this.currentDungeon.tiles[this.player.position.y]?.[this.player.position.x];
        if (tile && (tile.type === 'STAIRS_DOWN' || tile.char === '>')) {
          if (this.currentTower) {
            // Tower: stairs down = go up a floor (inverted)
            this.currentFloor++;
            if (this.currentFloor < this.currentTower.length) {
              this.currentDungeon = this.currentTower[this.currentFloor];
              const tiles = this.currentDungeon.tiles;
              const cy = Math.floor(tiles.length / 2);
              const cx = Math.floor(tiles[0].length / 2);
              this.player.position.x = cx;
              this.player.position.y = cy;

              // Spawn enemies for this floor
              this.enemies = [];
              if (this.currentDungeon.entities) {
                const floorRng = new SeededRNG(this.seed + this.currentFloor * 7000);
                for (const ent of this.currentDungeon.entities) {
                  const creature = this.creatureGen.generate(floorRng, 'ruins', this.currentFloor + 1, this.player.stats.level);
                  creature.position = { x: ent.x, y: ent.y };
                  this.enemies.push(creature);
                }
              }
              this.items = [];
              if (this.currentDungeon.items) {
                const floorRng = new SeededRNG(this.seed + this.currentFloor * 7001);
                for (const spot of this.currentDungeon.items) {
                  const item = this.itemGen.generate(floorRng,
                    floorRng.random(['weapon', 'armor', 'potion', 'scroll']),
                    this.itemGen.rollRarity(floorRng, this.currentFloor + 1),
                    this.currentFloor + 1);
                  item.position = { x: spot.x, y: spot.y };
                  this.items.push(item);
                }
              }

              this.gameContext.currentLocationName = `Tower (Floor ${this.currentFloor + 1})`;
              this.ui.addMessage(`You ascend to floor ${this.currentFloor + 1}.`, COLORS.BRIGHT_YELLOW);
            } else {
              // Top of tower — nothing more
              this.currentFloor = this.currentTower.length - 1;
              this.ui.addMessage('You have reached the top of the spire!', COLORS.BRIGHT_YELLOW);
            }
          } else {
            // Regular dungeon: descend
            this.currentFloor++;
            const nextRng = new SeededRNG(this.seed + this.currentFloor * 3000);
            this.currentDungeon = this.dungeonGen.generate(nextRng, 60, 40, this.currentFloor + 1, 'standard');
            if (this.currentDungeon.rooms && this.currentDungeon.rooms.length > 0) {
              const room = this.currentDungeon.rooms[0];
              this.player.position.x = room.x + Math.floor(room.w / 2);
              this.player.position.y = room.y + Math.floor(room.h / 2);
            }
            // Spawn creatures for new floor
            const biome = this.gameContext.currentLocation?.biome || 'ruins';
            this.enemies = [];
            if (this.currentDungeon.entitySpots) {
              for (const spot of this.currentDungeon.entitySpots) {
                if (spot.type === 'enemy') {
                  const creature = this.creatureGen.generate(nextRng, biome, this.currentFloor + 1, this.player.stats.level);
                  creature.position = { x: spot.x, y: spot.y };
                  this.enemies.push(creature);
                }
              }
            }
            this.gameContext.currentLocationName = `Dungeon (Floor ${this.currentFloor + 1})`;
            this.ui.addMessage(`You descend to floor ${this.currentFloor + 1}.`, COLORS.BRIGHT_YELLOW);
          }
        } else if (tile && (tile.type === 'STAIRS_UP' || tile.char === '<')) {
          if (this.currentFloor > 0) {
            this.currentFloor--;
            if (this.currentTower) {
              this.currentDungeon = this.currentTower[this.currentFloor];
              const tiles = this.currentDungeon.tiles;
              const cy = Math.floor(tiles.length / 2);
              const cx = Math.floor(tiles[0].length / 2);
              this.player.position.x = cx;
              this.player.position.y = cy;
              this.gameContext.currentLocationName = `Tower (Floor ${this.currentFloor + 1})`;
            }
            this.ui.addMessage(`You descend to floor ${this.currentFloor + 1}.`, COLORS.BRIGHT_YELLOW);
          } else {
            this.currentDungeon = null;
            this.currentTower = null;
            this.enemies = [];
            this.items = [];
            if (this.gameContext.currentLocation) {
              this.player.position.x = this.gameContext.currentLocation.x;
              this.player.position.y = this.gameContext.currentLocation.y;
            }
            this.setState('OVERWORLD');
            this.ui.addMessage('You exit to the surface.', COLORS.WHITE);
          }
        }
      }
    }
  }

  handleDialogueInput(key) {
    if (key === 'Escape') {
      this.activeNPC = null;
      this.setState(this.prevState || 'LOCATION');
      return;
    }

    if (!this.ui.dialogueState) return;

    const options = this.ui.dialogueState.options;

    // Letter shortcuts (A, B, C, D) - only for single-char keys
    if (key.length === 1) {
      const letterIndex = key.toUpperCase().charCodeAt(0) - 65;
      if (letterIndex >= 0 && letterIndex < options.length) {
        this.ui.selectedIndex = letterIndex;
        this.selectDialogueOption(letterIndex);
        return;
      }
    }

    const result = this.ui.handleMenuInput(key, options.length);
    if (result === 'select') {
      this.selectDialogueOption(this.ui.selectedIndex);
    }
    if (result === 'back') {
      this.activeNPC = null;
      this.setState(this.prevState || 'LOCATION');
    }
  }

  selectDialogueOption(index) {
    const option = this.ui.dialogueState.options[index];
    if (!option) return;

    if (option.action === 'shop' && this.activeNPC && (this.activeNPC.shop || this.activeNPC.role === 'merchant' || this.activeNPC.role === 'blacksmith')) {
      this.openShop(this.activeNPC);
      return;
    }

    if (option.action === 'heal' && this.activeNPC) {
      const cost = 10;
      if (this.player.gold >= cost) {
        this.player.gold -= cost;
        this.player.heal(this.player.stats.maxHp);
        this.ui.addMessage('The acolyte mends your wounds.', COLORS.BRIGHT_GREEN);
      } else {
        this.ui.addMessage('You don\'t have enough credits for treatment.', COLORS.BRIGHT_RED);
      }
      return;
    }

    if (option.action === 'rest' && this.activeNPC) {
      // Cost scales with settlement type
      const locType = this.gameContext.currentLocation?.type;
      const cost = locType === 'city' ? 10 : locType === 'town' ? 5 : 3;
      if (this.player.gold >= cost) {
        this.player.gold -= cost;
        this.player.heal(this.player.stats.maxHp);
        this.player.stats.mana = this.player.stats.maxMana;
        this.timeSystem.advance(8);
        // Clear negative status effects
        this.statusEffects = this.statusEffects.filter(e => e.beneficial);
        this.ui.addMessage('You rest at the inn. Fully restored! Status ailments cleared.', COLORS.BRIGHT_GREEN);
        // Auto-save
        this.saveGame();
      } else {
        this.ui.addMessage(`You can't afford a bunk. (${cost} gold)`, COLORS.BRIGHT_RED);
      }
      this.activeNPC = null;
      this.setState(this.prevState || 'LOCATION');
      return;
    }

    if (option.action === 'bounty') {
      const quest = this.questSystem.generateQuest(this.rng, this.activeNPC,
        this.player.stats.level, this.gameContext);
      this.questSystem.acceptQuest(quest.id);
      this.ui.addMessage(`Bounty accepted: ${quest.title}`, COLORS.BRIGHT_YELLOW);
      this.activeNPC = null;
      this.setState(this.prevState || 'LOCATION');
      return;
    }

    if (option.action === 'teach') {
      this.ui.addMessage('The archivist shares recovered data. +10 XP.', COLORS.BRIGHT_CYAN);
      this.player.addXP(10);
      return;
    }

    if (option.action === 'quest') {
      const quest = this.questSystem.generateQuest(this.rng, this.activeNPC,
        this.player.stats.level, this.gameContext);
      this.questSystem.acceptQuest(quest.id);
      this.ui.addMessage(`Quest accepted: ${quest.title}`, COLORS.BRIGHT_YELLOW);
      this.ui.dialogueState.text = `Here are the details: ${quest.description}`;
      this.ui.dialogueState.options = [
        { text: 'I\'ll get it done.', action: 'close' },
        { text: 'Tell me more about this place.', action: 'lore' }
      ];
      this.ui.resetSelection();
      return;
    }

    if (option.action === 'rumor') {
      const rumor = this.dialogueSys.generateRumor(this.rng, this.gameContext);
      this.ui.dialogueState.text = rumor;
      this.ui.dialogueState.options = [
        { text: 'Interesting. Anything else?', action: 'rumor' },
        { text: 'Thanks. Goodbye.', action: 'close' }
      ];
      this.ui.resetSelection();
      return;
    }

    if (option.action === 'lore') {
      const lore = this.loreGen.generateLocationHistory(this.rng,
        this.gameContext.currentLocationName, this.gameContext.currentLocation?.type || 'village');
      this.ui.dialogueState.text = lore;
      this.ui.dialogueState.options = [
        { text: 'Tell me a rumor.', action: 'rumor' },
        { text: 'Goodbye.', action: 'close' }
      ];
      this.ui.resetSelection();
      return;
    }

    if (option.action === 'secret') {
      if (this.activeNPC && this.activeNPC.secrets && this.activeNPC.secrets.length > 0) {
        const secret = this.rng.random(this.activeNPC.secrets);
        this.ui.dialogueState.text = `*leans in close* "${this.activeNPC.name.first} ${secret}"`;
        this.ui.dialogueState.options = [
          { text: 'That\'s quite a revelation...', action: 'close' },
          { text: 'Tell me more.', action: 'rumor' },
        ];
        // Remember that secret was shared
        this.activeNPC.memory.push({ type: 'secret_shared', timestamp: Date.now() });
        this.dialogueSys.modifyReputation(this.activeNPC, 5, 'shared secret');
        this.ui.resetSelection();
      }
      return;
    }

    if (option.action === 'backstory') {
      if (this.activeNPC) {
        const backstory = this.loreGen.generateNPCBackstory(this.rng, this.activeNPC);
        this.ui.dialogueState.text = backstory;
        this.ui.dialogueState.options = [
          { text: 'Fascinating. Anything else?', action: 'rumor' },
          { text: 'Thanks for sharing.', action: 'close' },
        ];
        this.dialogueSys.modifyReputation(this.activeNPC, 2, 'listened to backstory');
        this.ui.resetSelection();
      }
      return;
    }

    if (option.action === 'factionGossip') {
      if (this.activeNPC && this.activeNPC.faction) {
        const faction = this.activeNPC.faction;
        const factionIds = Array.from(this.factionSystem._factions.keys());
        const rivalId = this.rng.random(factionIds);
        const rivalFaction = this.factionSystem._factions.get(rivalId);
        const rivalName = rivalFaction ? rivalFaction.name : 'the other factions';
        const relation = this.factionSystem.getRelation(
          faction.replace(/\s+/g, '_').toUpperCase(),
          rivalId
        );
        let gossip;
        if (relation < -30) {
          gossip = `Don't get me started on ${rivalName}. They're nothing but trouble for the ${faction}.`;
        } else if (relation > 30) {
          gossip = `The ${faction} and ${rivalName} have a good working relationship. It benefits everyone.`;
        } else {
          gossip = `The ${faction} keeps a wary eye on ${rivalName}. Trust is earned, not given.`;
        }

        // Enrich with world history context
        if (this.worldHistoryGen && this.activeNPC.culturalBackground) {
          const bg = this.activeNPC.culturalBackground;
          if (bg.values && bg.values.length > 0) {
            gossip += ` We ${bg.civilizationName} value ${bg.values[0]} above all.`;
          }
          if (bg.traditions && bg.traditions.length > 0) {
            const t = this.rng.random(bg.traditions);
            gossip += ` We still observe ${t.name}.`;
          }
        }

        // NPC personal beliefs
        if (this.activeNPC.personalBeliefs && this.rng.chance(0.3)) {
          const b = this.activeNPC.personalBeliefs;
          gossip += ` I follow ${b.religionName}. "${b.tenet}"`;
        }

        // Ancestry reference
        if (this.activeNPC.ancestry && this.rng.chance(0.25)) {
          const a = this.activeNPC.ancestry;
          gossip += ` My ${a.relation} was ${a.figureName}. ${a.notableDeed || ''}`;
        }

        this.ui.dialogueState.text = `"${gossip}"`;
        this.ui.dialogueState.options = [
          { text: 'I see. Anything else?', action: 'rumor' },
          { text: 'Tell me about history.', action: 'worldHistory' },
          { text: 'Thanks.', action: 'close' },
        ];
        this.ui.resetSelection();
      }
      return;
    }

    // ── World History dialogue actions ──
    if (option.action === 'worldHistory') {
      if (this.worldHistoryGen) {
        const snippet = this.worldHistoryGen.generateLoreSnippet(this.rng);
        this.ui.dialogueState.text = `"${snippet}"`;
        this.ui.dialogueState.options = [
          { text: 'Tell me about the wars.', action: 'warLore' },
          { text: 'Tell me about lost artifacts.', action: 'artifact_lore' },
          { text: 'Tell me about great figures.', action: 'figureLore' },
          { text: 'Goodbye.', action: 'close' },
        ];
      } else {
        this.ui.dialogueState.text = '"History is long, and records are fragmented. I know little of the old times."';
        this.ui.dialogueState.options = [{ text: 'Goodbye.', action: 'close' }];
      }
      this.ui.resetSelection();
      return;
    }

    if (option.action === 'warLore') {
      if (this.worldHistoryGen) {
        const snippet = this.worldHistoryGen.generateLoreSnippet(this.rng, 'war');
        this.ui.dialogueState.text = `"${snippet}"`;
      } else {
        this.ui.dialogueState.text = '"The wars of the past are best left buried."';
      }
      this.ui.dialogueState.options = [
        { text: 'Tell me more history.', action: 'worldHistory' },
        { text: 'Goodbye.', action: 'close' },
      ];
      this.ui.resetSelection();
      return;
    }

    if (option.action === 'artifact_lore') {
      if (this.worldHistoryGen) {
        const snippet = this.worldHistoryGen.generateLoreSnippet(this.rng, 'artifact');
        this.ui.dialogueState.text = `"${snippet}"`;
      } else {
        this.ui.dialogueState.text = '"The old relics are all lost to time."';
      }
      this.ui.dialogueState.options = [
        { text: 'Tell me more history.', action: 'worldHistory' },
        { text: 'Goodbye.', action: 'close' },
      ];
      this.ui.resetSelection();
      return;
    }

    if (option.action === 'figureLore') {
      if (this.worldHistoryGen) {
        const snippet = this.worldHistoryGen.generateLoreSnippet(this.rng, 'figure');
        this.ui.dialogueState.text = `"${snippet}"`;
      } else {
        this.ui.dialogueState.text = '"No great heroes have risen in recent memory."';
      }
      this.ui.dialogueState.options = [
        { text: 'Tell me more history.', action: 'worldHistory' },
        { text: 'Goodbye.', action: 'close' },
      ];
      this.ui.resetSelection();
      return;
    }

    if (option.action === 'religionLore') {
      if (this.worldHistoryGen) {
        const snippet = this.worldHistoryGen.generateLoreSnippet(this.rng, 'religion');
        this.ui.dialogueState.text = `"${snippet}"`;
      } else {
        this.ui.dialogueState.text = '"Faith has faded in these parts."';
      }
      this.ui.dialogueState.options = [
        { text: 'Tell me more.', action: 'worldHistory' },
        { text: 'Goodbye.', action: 'close' },
      ];
      this.ui.resetSelection();
      return;
    }

    if (option.action === 'traditionLore') {
      if (this.worldHistoryGen) {
        const snippet = this.worldHistoryGen.generateLoreSnippet(this.rng, 'tradition');
        this.ui.dialogueState.text = `"${snippet}"`;
      } else {
        this.ui.dialogueState.text = '"Old customs have been forgotten."';
      }
      this.ui.dialogueState.options = [
        { text: 'Tell me more.', action: 'worldHistory' },
        { text: 'Goodbye.', action: 'close' },
      ];
      this.ui.resetSelection();
      return;
    }

    if (option.action === 'forbiddenLore') {
      let text;
      if (this.worldHistoryGen && this.worldHistoryGen.preHistory) {
        const fk = this.rng.random(this.worldHistoryGen.preHistory.forbiddenKnowledge);
        text = fk.fragment;
      } else if (this.loreGen) {
        text = this.loreGen.generateForbiddenKnowledge(this.rng);
      } else {
        text = 'Some truths are too dangerous to speak aloud.';
      }
      this.ui.dialogueState.text = `*lowers voice* "${text}"`;
      this.ui.dialogueState.options = [
        { text: 'Tell me more about the Old Truth.', action: 'forbiddenLore' },
        { text: 'What about the colony\'s origins?', action: 'colonyOriginLore' },
        { text: 'Goodbye.', action: 'close' },
      ];
      this.ui.resetSelection();
      return;
    }

    if (option.action === 'colonyOriginLore') {
      let text;
      if (this.worldHistoryGen) {
        const topic = this.rng.random(['origin', 'founders', 'forgetting', 'earth', 'mission']);
        text = this.worldHistoryGen.generateLoreSnippet(this.rng, topic);
      } else if (this.loreGen) {
        text = this.loreGen.generateColonyOriginLore(this.rng);
      } else {
        text = 'The origins of the colony are lost to time.';
      }
      this.ui.dialogueState.text = `"${text}"`;
      this.ui.dialogueState.options = [
        { text: 'Tell me more about the Old Truth.', action: 'forbiddenLore' },
        { text: 'What about the colony\'s origins?', action: 'colonyOriginLore' },
        { text: 'Goodbye.', action: 'close' },
      ];
      this.ui.resetSelection();
      return;
    }

    if (option.action === 'forbidden_lore' && option._historyResponse) {
      this.ui.dialogueState.text = `*lowers voice* "${option._historyResponse}"`;
      this.ui.dialogueState.options = [
        { text: 'Tell me more about the Old Truth.', action: 'forbiddenLore' },
        { text: 'Goodbye.', action: 'close' },
      ];
      this.ui.resetSelection();
      return;
    }

    if (option.action === 'religion_lore' && option._historyResponse) {
      this.ui.dialogueState.text = `"${option._historyResponse}"`;
      this.ui.dialogueState.options = [
        { text: 'Tell me more.', action: 'worldHistory' },
        { text: 'Goodbye.', action: 'close' },
      ];
      this.ui.resetSelection();
      return;
    }

    if (option.action === 'turnInQuest') {
      if (option.questId) {
        // Clear tracking if this was the tracked quest
        if (this._trackedQuestId === option.questId) {
          this._trackedQuestId = null;
          this.ui.addMessage('Quest completed! Navigation cleared.', COLORS.BRIGHT_CYAN);
        }
        const rewards = this.questSystem.completeQuest(option.questId);
        if (rewards) {
          if (rewards.gold) {
            this.player.gold += rewards.gold;
            this.ui.addMessage(`Received ${rewards.gold} gold!`, COLORS.BRIGHT_YELLOW);
          }
          if (rewards.xp) {
            const leveled = this.player.addXP(rewards.xp);
            this.ui.addMessage(`Received ${rewards.xp} XP!`, COLORS.BRIGHT_CYAN);
            if (leveled.length > 0) {
              this.ui.addMessage(`LEVEL UP! Level ${leveled[leveled.length - 1]}!`, COLORS.BRIGHT_YELLOW);
              this.renderer.flash('#FFFF00', 0.5);
            }
          }
          // Reputation boost
          if (this.activeNPC) {
            this.dialogueSys.modifyReputation(this.activeNPC, 15, 'completed quest');
            // Faction boost
            if (this.activeNPC.faction && this.activeNPC.faction !== 'None') {
              const factionId = this.activeNPC.faction.replace(/\s+/g, '_').toUpperCase();
              this.factionSystem.modifyPlayerStanding(factionId, 5);
            }
          }
          this.ui.addMessage('Quest completed!', COLORS.BRIGHT_GREEN);
          this.particles.emit(this.player.position.x, this.player.position.y, '*', COLORS.BRIGHT_GREEN, 8, 4, 15);
        }
      }
      this.activeNPC = null;
      this.setState(this.prevState || 'LOCATION');
      return;
    }

    if (option.action === 'close' || option.action === 'exit') {
      this.activeNPC = null;
      this.setState(this.prevState || 'LOCATION');
      return;
    }
  }

  handleShopInput(key) {
    if (key === 'Escape') {
      this.ui.shopState = null;
      this.setState('DIALOGUE');
      this.startDialogue(this.activeNPC);
      return;
    }

    if (!this.ui.shopState) return;

    if (key === 'b' || key === 'B') {
      this.ui.shopState.tab = 'buy';
      this.ui.resetSelection();
      return;
    }
    if (key === 's' || key === 'S') {
      this.ui.shopState.tab = 'sell';
      this.ui.resetSelection();
      return;
    }

    const items = this.ui.shopState.tab === 'buy' ? this.ui.shopState.shopItems : this.ui.shopState.playerItems;
    const result = this.ui.handleMenuInput(key, Math.max(items.length, 1));

    if (result === 'select' && items.length > 0) {
      const item = items[this.ui.selectedIndex];
      if (this.ui.shopState.tab === 'buy') {
        if (this.player.gold >= item.buyPrice) {
          this.player.gold -= item.buyPrice;
          const boughtItem = { ...item };
          delete boughtItem.buyPrice;
          delete boughtItem.sellPrice;
          this.player.addItem(boughtItem);
          this.ui.shopState.shopItems = this.ui.shopState.shopItems.filter((_, i) => i !== this.ui.selectedIndex);
          this.ui.shopState.playerGold = this.player.gold;
          this.ui.addMessage(`Bought ${item.name} for ${item.buyPrice}g.`, COLORS.BRIGHT_GREEN);
          if (this.ui.selectedIndex >= this.ui.shopState.shopItems.length) {
            this.ui.selectedIndex = Math.max(0, this.ui.shopState.shopItems.length - 1);
          }
        } else {
          this.ui.addMessage('Not enough gold!', COLORS.BRIGHT_RED);
        }
      } else {
        this.player.gold += item.sellPrice;
        this.player.removeItem(item.id);
        this.ui.shopState.playerItems = this.ui.shopState.playerItems.filter((_, i) => i !== this.ui.selectedIndex);
        this.ui.shopState.playerGold = this.player.gold;
        this.ui.addMessage(`Sold ${item.name} for ${item.sellPrice}g.`, COLORS.BRIGHT_GREEN);
        if (this.ui.selectedIndex >= this.ui.shopState.playerItems.length) {
          this.ui.selectedIndex = Math.max(0, this.ui.shopState.playerItems.length - 1);
        }
      }
    }

    if (result === 'back') {
      this.ui.shopState = null;
      this.setState('DIALOGUE');
      this.startDialogue(this.activeNPC);
    }
  }

  handleInventoryInput(key) {
    if (key === 'Escape') {
      this.setState(this.prevState || 'OVERWORLD');
      return;
    }

    const items = this.player.inventory;
    const result = this.ui.handleMenuInput(key, Math.max(items.length, 1));

    if (result === 'select' || key === 'e' || key === 'E') {
      if (items.length > 0 && this.ui.selectedIndex < items.length) {
        const item = items[this.ui.selectedIndex];
        if (item.type === 'potion' || item.type === 'food') {
          this.useItem(item);
        } else if (item.type === 'weapon' || item.type === 'armor') {
          this.player.equip(item);
          this.ui.addMessage(`Equipped ${item.name}.`, COLORS.BRIGHT_GREEN);
        }
      }
    }

    if (key === 'd' || key === 'D') {
      if (items.length > 0 && this.ui.selectedIndex < items.length) {
        const item = items[this.ui.selectedIndex];
        this.player.removeItem(item.id);
        this.ui.addMessage(`Dropped ${item.name}.`, COLORS.WHITE);
        if (this.ui.selectedIndex >= this.player.inventory.length) {
          this.ui.selectedIndex = Math.max(0, this.player.inventory.length - 1);
        }
      }
    }

    if (result === 'back') {
      this.setState(this.prevState || 'OVERWORLD');
    }
  }

  // Helper: spawn screen-space combat particles at monster center
  spawnCombatParticles(count, chars, color) {
    if (!this.combatState || !this.combatState.combatParticles) return;
    const cols = this.renderer.cols;
    const rows = this.renderer.rows;
    const cx = Math.floor(cols / 2);
    const cy = Math.floor(rows * 0.55 / 2) - 1;
    for (let i = 0; i < count; i++) {
      this.combatState.combatParticles.push({
        x: cx + (Math.random() - 0.5) * 4,
        y: cy + (Math.random() - 0.5) * 2,
        vx: (Math.random() - 0.5) * 2,
        vy: (Math.random() - 0.5) * 1.5 - 0.5,
        char: chars[Math.floor(Math.random() * chars.length)],
        color,
        life: 10 + Math.floor(Math.random() * 10),
      });
    }
  }

  // Helper: spawn floating damage number at monster center
  spawnDamageNumber(text, color) {
    if (!this.combatState || !this.combatState.damageNumbers) return;
    const cols = this.renderer.cols;
    const rows = this.renderer.rows;
    this.combatState.damageNumbers.push({
      x: Math.floor(cols / 2 - text.length / 2) + Math.floor((Math.random() - 0.5) * 4),
      y: Math.floor(rows * 0.55 / 2) - 2,
      text,
      color,
      life: 20,
    });
  }

  handleCombatInput(key) {
    if (!this.combatState) return;

    // FF-style cursor navigation in command menu
    if (!this.combatState.selectedAction) this.combatState.selectedAction = 0;
    const actionCount = 2 + Math.min(this.player.abilities?.length || 0, 3); // Attack, Flee, + abilities

    if (key === 'ArrowUp' || key === 'w' || key === 'W') {
      this.combatState.selectedAction = (this.combatState.selectedAction - 1 + actionCount) % actionCount;
      return;
    }
    if (key === 'ArrowDown' || key === 's' || key === 'S') {
      this.combatState.selectedAction = (this.combatState.selectedAction + 1) % actionCount;
      return;
    }

    // Determine selected action from cursor or direct key
    let action = null;
    if (key === 'Enter' || key === ' ') {
      const sel = this.combatState.selectedAction;
      if (sel === 0) action = 'attack';
      else if (sel === 1) action = 'flee';
      else action = 'ability_' + (sel - 2);
    } else if (key === 'a' || key === 'A') {
      action = 'attack';
    } else if (key === 'f' || key === 'F') {
      action = 'flee';
    } else {
      const abilityIdx = parseInt(key) - 1;
      if (abilityIdx >= 0 && abilityIdx < (this.player.abilities?.length || 0)) {
        action = 'ability_' + abilityIdx;
      }
    }

    if (!action) return;

    // Handle flee
    if (action === 'flee') {
      if (this.rng.chance(0.5)) {
        this.ui.addMessage('Escaped!', COLORS.BRIGHT_YELLOW);
        this.combatState = null;
        this.setState(this.prevState || 'DUNGEON');
      } else {
        this.ui.addMessage('Cannot escape!', COLORS.BRIGHT_RED);
        const result = this.combat.calculateAttack(this.combatState.enemy, this.player);
        if (result.hit && !this.debug.invincible) {
          this.player.stats.hp -= result.damage;
          this.ui.addMessage(result.message, COLORS.BRIGHT_RED);
          this.combatState.shake.intensity = 3;
          this.renderer.flash('#FF0000', 0.3);
        } else if (result.hit && this.debug.invincible) {
          this.ui.addMessage(`[DEBUG] Blocked ${result.damage} damage`, COLORS.BRIGHT_CYAN);
        }
        if (this.player.isDead() && !this.debug.invincible) {
          this.setState('GAME_OVER');
        }
      }
      return;
    }

    // Handle ability
    if (action.startsWith('ability_')) {
      const abilityIdx = parseInt(action.split('_')[1]);
      if (abilityIdx >= 0 && abilityIdx < (this.player.abilities?.length || 0)) {
        const ability = this.player.abilities[abilityIdx];
        if (this.debug.infiniteMana || this.player.stats.mana >= ability.manaCost) {
          if (!this.debug.infiniteMana) this.player.stats.mana -= ability.manaCost;
          const enemy = this.combatState.enemy;

          if (ability.type === 'heal') {
            const healAmount = ability.damage || 15;
            this.player.heal(healAmount);
            this.ui.addMessage(`${ability.name}! Restored ${healAmount} HP.`, COLORS.BRIGHT_GREEN);
            this.renderer.flash('#00FF44', 0.2);
          } else if (ability.damage > 0) {
            const damage = ability.damage + Math.floor(this.player.stats.int / 3);
            enemy.stats.hp -= damage;
            this.ui.addMessage(`${ability.name}! ${damage} damage to ${enemy.name}!`, COLORS.BRIGHT_MAGENTA);
            this.renderer.flash('#FF4400', 0.3);
            this.combatState.hitTimer = 3;
            this.combatState.hitRecoil = 6;
            this.combatState.shake.intensity = 2;
            this.spawnCombatParticles(8, ['*', '+', '\u00B7', '\u2219'], '#FF88FF');
            this.spawnDamageNumber(`${damage}`, '#FF88FF');
            this.particles.emit(enemy.position.x, enemy.position.y, '*', COLORS.BRIGHT_MAGENTA, 5, 3, 10);
          } else if (ability.type === 'buff') {
            this.addStatusEffect('shielded', 5, { defenseBoost: 5 });
            this.ui.addMessage(`${ability.name}! Defense boosted!`, COLORS.BRIGHT_CYAN);
          } else {
            this.ui.addMessage(`Used ${ability.name}!`, COLORS.BRIGHT_CYAN);
          }

          if (enemy.stats.hp <= 0) {
            this.ui.addMessage(`${enemy.name} defeated!`, COLORS.BRIGHT_GREEN);
            this.renderer.flash('#FFFFFF', 0.4);
            this.spawnCombatParticles(15, ['\u2588', '\u2593', '\u2592', '\u2591', '*'], '#FFAA00');
            const xp = this.combat.calculateXPReward(enemy);
            const leveled = this.player.addXP(xp);
            this.ui.addMessage(`${xp} EXP gained!`, COLORS.BRIGHT_CYAN);
            if (leveled.length > 0) {
              this.ui.addMessage(`Level up! Lv ${leveled[leveled.length - 1]}!`, COLORS.BRIGHT_YELLOW);
              this.renderer.flash('#FFFF00', 0.5);
            }
            this.enemies = this.enemies.filter(e => e !== enemy);
            this.combatState = null;
            this.setState(this.prevState || 'DUNGEON');
            return;
          }

          const counterResult = this.combat.calculateAttack(enemy, this.player);
          if (counterResult.hit && !this.debug.invincible) {
            this.player.stats.hp -= counterResult.damage;
            this.ui.addMessage(counterResult.message, COLORS.BRIGHT_RED);
            this.combatState.shake.intensity = 3;
            this.renderer.flash('#FF0000', 0.3);
            if (this.player.isDead()) {
              this.setState('GAME_OVER');
              return;
            }
          }
        } else {
          this.ui.addMessage(`Not enough MP! Need ${ability.manaCost}.`, COLORS.BRIGHT_RED);
        }
        return;
      }
    }

    // Handle attack (action === 'attack')
    if (action === 'attack') {
      const result = this.combat.resolveRound(this.player, this.combatState.enemy);
      for (const msg of result.messages) {
        this.ui.addMessage(msg, COLORS.BRIGHT_RED);
      }

      // Visual effects for player hitting enemy
      if (result.playerAction && result.playerAction.hit) {
        this.combatState.hitTimer = 3;
        this.combatState.hitRecoil = 6;
        this.renderer.flash(result.playerAction.critical ? '#FFFFFF' : '#FF4400',
          result.playerAction.critical ? 0.4 : 0.2);
        this.spawnCombatParticles(6, ['*', '+', '\u00B7'], '#FF8844');
        this.spawnDamageNumber(`${result.playerAction.damage}`, result.playerAction.critical ? '#FFFFFF' : '#FFAA00');
      }

      // Visual effects for enemy hitting player
      if (result.enemyAction && result.enemyAction.hit) {
        this.combatState.shake.intensity = result.enemyAction.critical ? 5 : 3;
        this.renderer.flash('#FF0000', result.enemyAction.critical ? 0.4 : 0.3);
      }

      if (result.battleOver) {
        if (result.winner === 'player') {
          const deadEnemy = this.combatState.enemy;
          // Death burst effect
          this.renderer.flash('#FFFFFF', 0.4);
          this.spawnCombatParticles(15, ['\u2588', '\u2593', '\u2592', '\u2591', '*'], '#FFAA00');

          const xp = this.combat.calculateXPReward(deadEnemy);
          const leveled = this.player.addXP(xp);
          const loot = this.combat.calculateLoot(this.rng, deadEnemy, this.currentFloor);
          for (const item of loot) {
            if (item.type === 'gold') {
              this.player.gold += item.amount;
              this.ui.addMessage(`Received ${item.amount}§.`, COLORS.BRIGHT_YELLOW);
            } else {
              this.player.addItem(item);
              this.ui.addMessage(`Found ${item.name}!`, COLORS.BRIGHT_GREEN);
            }
          }
          this.ui.addMessage(`${xp} EXP received.`, COLORS.BRIGHT_CYAN);

          // Level-up effects
          if (leveled.length > 0) {
            this.ui.addMessage(`Level up! Lv ${leveled[leveled.length - 1]}!`, COLORS.BRIGHT_YELLOW);
            this.renderer.flash('#FFFF00', 0.5);
            this.particles.emit(this.player.position.x, this.player.position.y, '*', COLORS.BRIGHT_YELLOW, 10, 4, 20);
          }

          // Update quest progress for KILL quests
          const activeQuests = this.questSystem.getActiveQuests();
          for (const quest of activeQuests) {
            this.questSystem.updateProgress(quest.id, 'kill', deadEnemy.name, 1);
            // Also check generic monster kills
            this.questSystem.updateProgress(quest.id, 'kill', 'any', 1);
            if (this.questSystem.checkCompletion(quest.id)) {
              this.ui.addMessage(`Quest "${quest.title}" is ready to turn in!`, COLORS.BRIGHT_YELLOW);
            }
          }

          // Faction standing changes from combat
          if (deadEnemy.faction) {
            this.factionSystem.modifyPlayerStanding(deadEnemy.faction, -5);
            if (deadEnemy.faction === 'MALFUNCTIONING') {
              this.factionSystem.modifyPlayerStanding('SALVAGE_GUILD', 1);
            }
            if (deadEnemy.faction === 'MUTANT') {
              this.factionSystem.modifyPlayerStanding('COLONY_GUARD', 2);
            }
            if (deadEnemy.faction === 'ALIEN') {
              this.factionSystem.modifyPlayerStanding('ARCHIVE_KEEPERS', 2);
              this.factionSystem.modifyPlayerStanding('COLONY_GUARD', 1);
            }
            if (deadEnemy.faction === 'ASSIMILATED') {
              this.factionSystem.modifyPlayerStanding('COLONY_GUARD', 3);
              this.factionSystem.modifyPlayerStanding('SALVAGE_GUILD', 2);
              this.factionSystem.modifyPlayerStanding('ARCHIVE_KEEPERS', 2);
            }
          }

          // Reputation boost with nearby NPCs (if in town)
          for (const npc of this.npcs) {
            if (distance(npc.position.x, npc.position.y, this.player.position.x, this.player.position.y) < 10) {
              this.dialogueSys.modifyReputation(npc, 3, 'defended settlement');
            }
          }

          // Remove dead enemy
          this.enemies = this.enemies.filter(e => e !== deadEnemy);

          // Combat hit particles
          this.particles.emit(deadEnemy.position.x, deadEnemy.position.y, '*', COLORS.BRIGHT_RED, 5, 3, 12);
        } else {
          this.setState('GAME_OVER');
          return;
        }
        this.combatState = null;
        this.setState(this.prevState || 'DUNGEON');
        return;
      }
    }
  }

  handleGenericClose(key) {
    if (key === 'Escape') {
      this.setState(this.prevState || 'OVERWORLD');
    }
  }

  // ─── QUEST LOG (with tracking) ───

  handleQuestLogInput(key) {
    const active = this.questSystem.getActiveQuests();
    const itemCount = active.length;

    if (key === 'Escape') {
      this.setState(this.prevState || 'OVERWORLD');
      return;
    }
    if (key === 'ArrowUp' || key === 'w' || key === 'W') {
      if (itemCount > 0) {
        this.ui.selectedIndex = (this.ui.selectedIndex - 1 + itemCount) % itemCount;
      }
      return;
    }
    if (key === 'ArrowDown' || key === 's' || key === 'S') {
      if (itemCount > 0) {
        this.ui.selectedIndex = (this.ui.selectedIndex + 1) % itemCount;
      }
      return;
    }
    if (key === 'Enter' || key === 't' || key === 'T') {
      if (itemCount > 0 && this.ui.selectedIndex < itemCount) {
        const quest = active[this.ui.selectedIndex];
        if (this._trackedQuestId === quest.id) {
          // Untrack
          this._trackedQuestId = null;
          this.ui.addMessage('Quest tracking cleared.', COLORS.BRIGHT_BLACK);
        } else {
          // Track
          this._trackedQuestId = quest.id;
          this.ui.addMessage(`Tracking: ${quest.title}`, COLORS.BRIGHT_CYAN);
        }
      }
      return;
    }
  }

  // ─── QUEST NAVIGATION TOGGLE ───

  _toggleQuestNav() {
    this.settings.showQuestNav = !this.settings.showQuestNav;
    this._saveSettings();
    this.ui.addMessage(
      `Quest navigation: ${this.settings.showQuestNav ? 'ON' : 'OFF'}`,
      this.settings.showQuestNav ? COLORS.BRIGHT_CYAN : COLORS.BRIGHT_BLACK
    );
  }

  // ─── QUEST COMPASS ───

  _openQuestCompass() {
    const active = this.questSystem.getActiveQuests();
    if (active.length === 0) {
      this.ui.addMessage('No active quests. Accept a quest first.', COLORS.BRIGHT_BLACK);
      return;
    }
    this._compassQuestIdx = 0;
    this.setState('QUEST_COMPASS');
  }

  handleQuestCompassInput(key) {
    const active = this.questSystem.getActiveQuests();
    if (key === 'Escape') {
      this.setState(this.prevState || 'OVERWORLD');
      return;
    }
    if (key === 'ArrowUp' || key === 'w' || key === 'W') {
      this._compassQuestIdx = (this._compassQuestIdx - 1 + active.length) % active.length;
      return;
    }
    if (key === 'ArrowDown' || key === 's' || key === 'S') {
      this._compassQuestIdx = (this._compassQuestIdx + 1) % active.length;
      return;
    }
  }

  _getQuestTargetCoords(quest) {
    // Try to find the target location in loaded overworld locations
    if (!this.overworld) return null;
    const locations = this.overworld.getLoadedLocations();

    // Check quest objectives for location references
    for (const obj of (quest.objectives || [])) {
      const desc = obj.description || '';
      // Try to match location name from the quest
      for (const loc of locations) {
        if (desc.includes(loc.name) || (quest.title && quest.title.includes(loc.name)) ||
            (quest.description && quest.description.includes(loc.name))) {
          return { x: loc.x, y: loc.y };
        }
      }
    }

    // Also check quest description and title for any location mention
    const fullText = `${quest.title || ''} ${quest.description || ''}`;
    for (const loc of locations) {
      if (fullText.includes(loc.name)) {
        return { x: loc.x, y: loc.y };
      }
    }

    // Fallback: pick a random nearby location as a hint
    if (locations.length > 0) {
      // Pick closest non-current location
      const playerX = this.player.position.x;
      const playerY = this.player.position.y;
      let closest = null;
      let closestDist = Infinity;
      for (const loc of locations) {
        const d = Math.abs(loc.x - playerX) + Math.abs(loc.y - playerY);
        if (d > 5 && d < closestDist) { // Not the location we're standing on
          closestDist = d;
          closest = loc;
        }
      }
      if (closest) return { x: closest.x, y: closest.y };
    }

    return null;
  }

  handleHelpInput(key) {
    const tabCount = 8;
    const tab = this.ui.helpTab || 0;
    if (key === 'Escape') {
      this.ui.helpTab = 0;
      this.ui.helpScroll = 0;
      this.setState(this.prevState || 'OVERWORLD');
    } else if (key === 'ArrowRight' || key === 'd' || key === 'D') {
      this.ui.helpTab = (tab + 1) % tabCount;
      this.ui.helpScroll = 0;
    } else if (key === 'ArrowLeft' || key === 'a' || key === 'A') {
      this.ui.helpTab = (tab - 1 + tabCount) % tabCount;
      this.ui.helpScroll = 0;
    } else if (key === 'ArrowDown' || key === 's') {
      this.ui.helpScroll = (this.ui.helpScroll || 0) + 1;
    } else if (key === 'ArrowUp' || key === 'w') {
      this.ui.helpScroll = Math.max(0, (this.ui.helpScroll || 0) - 1);
    } else if (key >= '1' && key <= '8') {
      this.ui.helpTab = parseInt(key) - 1;
      this.ui.helpScroll = 0;
    }
  }

  handleSettingsInput(key) {
    if (key === 'Escape') {
      this._saveSettings();
      this.setState(this.prevState || 'OVERWORLD');
      return;
    }
    if (key === '1') {
      this.settings.crtEffects = !this.settings.crtEffects;
      this._saveSettings();
    }
    if (key === '2') {
      this.settings.fontSize = this.settings.fontSize >= 20 ? 12 : this.settings.fontSize + 2;
      this.renderer.setFontSize(this.settings.fontSize);
      this.handleResize();
      this._saveSettings();
    }
    if (key === '3') {
      this.settings.touchControls = !this.settings.touchControls;
      this._saveSettings();
    }
    if (key === '4') {
      const intervals = [50, 100, 200, 500];
      const idx = intervals.indexOf(this.settings.autoSaveInterval);
      this.settings.autoSaveInterval = intervals[(idx + 1) % intervals.length];
      this._saveSettings();
    }
    if (key === '5') {
      this.settings.showQuestNav = !this.settings.showQuestNav;
      this._saveSettings();
    }
    // CRT sub-options
    if (this.settings.crtEffects) {
      if (key === '6') { this.settings.crtGlow = !this.settings.crtGlow; this._saveSettings(); }
      if (key === '7') { this.settings.crtScanlines = !this.settings.crtScanlines; this._saveSettings(); }
      if (key === '8') { this.settings.crtAberration = !this.settings.crtAberration; this._saveSettings(); }
    }
  }

  handleGameOverInput(key) {
    if (key === 'Enter') {
      this.setState('MENU');
      this.ui.resetSelection();
    }
  }

  // ─── MOVEMENT ───

  getDirection(key) {
    const dirs = {
      'ArrowUp': { dx: 0, dy: -1 }, 'ArrowDown': { dx: 0, dy: 1 },
      'ArrowLeft': { dx: -1, dy: 0 }, 'ArrowRight': { dx: 1, dy: 0 },
      'w': { dx: 0, dy: -1 }, 's': { dx: 0, dy: 1 },
      'a': { dx: -1, dy: 0 }, 'd': { dx: 1, dy: 0 },
      'W': { dx: 0, dy: -1 }, 'S': { dx: 0, dy: 1 },
      'A': { dx: -1, dy: 0 }, 'D': { dx: 1, dy: 0 },
      // Numpad
      '8': { dx: 0, dy: -1 }, '2': { dx: 0, dy: 1 },
      '4': { dx: -1, dy: 0 }, '6': { dx: 1, dy: 0 },
      '7': { dx: -1, dy: -1 }, '9': { dx: 1, dy: -1 },
      '1': { dx: -1, dy: 1 }, '3': { dx: 1, dy: 1 },
    };
    return dirs[key] || null;
  }

  movePlayer(dx, dy) {
    if (!this.overworld) return;

    const nx = this.player.position.x + dx;
    const ny = this.player.position.y + dy;

    const tile = this.overworld.getTile(nx, ny);
    if (!tile.walkable) {
      this.ui.addMessage('You can\'t go that way.', COLORS.BRIGHT_BLACK);
      return;
    }

    this.player.position.x = nx;
    this.player.position.y = ny;
    this.turnCount++;

    // Ensure surrounding chunks are loaded
    this.overworld.ensureChunksAround(nx, ny);

    // Check for location
    const loc = this.overworld.getLocation(nx, ny);
    if (loc && !this.player.knownLocations.has(loc.id)) {
      this.player.knownLocations.add(loc.id);
      this.ui.addMessage(`Discovered: ${loc.name}! (Press Enter to visit)`, COLORS.BRIGHT_YELLOW);
    }

    // Random encounter on overworld (modified by events, weather, and night/light)
    const baseEncounterRate = 0.03 * this.activeEffects.encounterRateMultiplier;
    const isNight = !this.timeSystem.isDaytime();
    const lightInfo = this.player.hasLightSource();
    let nightBonus = 1.0;
    if (isNight) {
      nightBonus = lightInfo.hasLight ? 1.3 : 2.0;
    }
    if (!this.debug.noEncounters && this.rng.chance(baseEncounterRate * nightBonus)) {
      const tileBiome = tile.biome || 'forest';
      const enemy = this.creatureGen.generate(this.rng, tileBiome, 1, this.player.stats.level);
      enemy.position = { x: nx, y: ny };

      // Night stat boost when player has no light
      if (isNight && !lightInfo.hasLight) {
        enemy.stats.attack = Math.round(enemy.stats.attack * 1.2);
        enemy.stats.hp = Math.round(enemy.stats.hp * 1.2);
        enemy.stats.maxHp = enemy.stats.hp;
      }

      // Assimilated strength boost during eclipse
      if (enemy.faction === 'ASSIMILATED') {
        enemy.stats.attack = Math.round(enemy.stats.attack * this.activeEffects.undeadStrengthMultiplier);
        enemy.stats.hp = Math.round(enemy.stats.hp * this.activeEffects.undeadStrengthMultiplier);
        enemy.stats.maxHp = enemy.stats.hp;
      }

      this.combatState = {
        enemy,
        selectedAction: 0,
        shake: { intensity: 0, decay: 0.85 },
        hitTimer: 0,
        hitRecoil: 0,
        combatParticles: [],
        damageNumbers: [],
      };
      this.ui.addMessage(`${enemy.name} appeared!`, COLORS.BRIGHT_RED);
      this.setState('COMBAT');
    }

    // Consume torch uses at night
    if (isNight && lightInfo.hasLight && lightInfo.item && lightInfo.item.lightSource.uses > 0) {
      lightInfo.item.lightSource.uses--;
      if (lightInfo.item.lightSource.uses <= 0) {
        this.ui.addMessage('Your torch has burned out!', COLORS.BRIGHT_RED);
        const idx = this.player.inventory.indexOf(lightInfo.item);
        if (idx !== -1) this.player.inventory.splice(idx, 1);
      } else if (lightInfo.item.lightSource.uses <= 10) {
        this.ui.addMessage(`Your torch flickers... (${lightInfo.item.lightSource.uses} uses left)`, COLORS.BRIGHT_YELLOW);
      }
    }

    // Check world events
    const events = this.eventSystem.checkEvents(this.timeSystem.day);
    for (const event of events) {
      const desc = this.eventSystem.getEventDescription(event);
      this.ui.addMessage(desc, COLORS.BRIGHT_MAGENTA);
      this.applyEventEffects(event);
    }

    // Update weather
    const biome = tile.biome || 'grassland';
    this.weatherSystem.update(biome);

    // Tick status effects
    this.tickStatusEffects();

    this.camera.follow(this.player);
  }

  /**
   * Apply gameplay consequences when a world event fires.
   */
  // ─── COLOR UTILITIES ───

  _hexToRGB(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!result) return { r: 200, g: 200, b: 200 };
    return { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) };
  }

  _dimColor(hex, brightness) {
    if (brightness >= 1) return hex;
    const { r, g, b } = this._hexToRGB(hex);
    const dr = Math.round(r * brightness);
    const dg = Math.round(g * brightness);
    const db = Math.round(b * brightness);
    return '#' + [dr, dg, db].map(v => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('');
  }

  applyEventEffects(event) {
    switch (event.type) {
      case 'FOUNDERS_DAY':
        this.activeEffects.shopPriceMultiplier = event.data.priceModifier || 0.7;
        this.ui.addMessage('Harvest Festival! Merchants are offering discounts.', COLORS.BRIGHT_GREEN);
        break;
      case 'CONTAMINATION':
        this.activeEffects.potionPriceMultiplier = event.data.healingItemDemand || 3.0;
        this.ui.addMessage('Healing potions are in high demand — plague spreading!', COLORS.BRIGHT_RED);
        break;
      case 'BREACH_SWARM':
        this.activeEffects.encounterRateMultiplier = 2.0;
        this.ui.addMessage('Monsters pouring through the walls!', COLORS.BRIGHT_RED);
        break;
      case 'BLACKOUT':
        this.activeEffects.undeadStrengthMultiplier = event.data.undeadStrengthBonus || 1.5;
        this.ui.addMessage('The undead grow bolder in the darkness!', COLORS.BRIGHT_MAGENTA);
        break;
      case 'SALVAGE_CONVOY':
        this.ui.addMessage(`${event.data.merchantName} has rare goods for trade!`, COLORS.BRIGHT_GREEN);
        break;
      case 'RAIDER_INCURSION':
        this.factionSystem.modifyPlayerStanding('RUST_RAIDERS', -10);
        this.ui.addMessage('Bandits are attacking the settlement!', COLORS.BRIGHT_RED);
        break;
      case 'SCHEMATIC_FOUND':
        // Auto-generate a quest
        const mapQuest = {
          id: 'schematic_' + Date.now(),
          title: `Hidden Treasure at ${event.data.location}`,
          description: `Follow the ancient map to ${event.data.location} and recover the hidden treasure.`,
          type: 'FETCH',
          status: 'active',
          objectives: [{ type: 'explore', target: event.data.location, current: 0, required: 1, description: `Recover the cache at ${event.data.location}` }],
          rewards: { gold: event.data.treasureTier === 'major' ? 200 : event.data.treasureTier === 'moderate' ? 100 : 50, xp: 50 },
        };
        this.questSystem._activeQuests.set(mapQuest.id, mapQuest);
        this.ui.addMessage(`New quest: ${mapQuest.title}`, COLORS.BRIGHT_YELLOW);
        break;
    }
  }

  movePlayerInLocation(dx, dy) {
    if (!this.currentSettlement || !this.currentSettlement.tiles) return;

    const nx = this.player.position.x + dx;
    const ny = this.player.position.y + dy;

    if (ny < 0 || ny >= this.currentSettlement.tiles.length) return;
    if (nx < 0 || nx >= this.currentSettlement.tiles[0].length) return;

    const tile = this.currentSettlement.tiles[ny][nx];
    if (tile.solid) return;

    // Check NPC collision
    const npcAt = this.npcs.find(n => n.position.x === nx && n.position.y === ny);
    if (npcAt) {
      this.startDialogue(npcAt);
      return;
    }

    this.player.position.x = nx;
    this.player.position.y = ny;
    this.turnCount++;

    // Update NPC schedules — move NPCs based on time of day
    this.updateNPCSchedules();
  }

  /**
   * Move NPCs toward their scheduled location.
   */
  updateNPCSchedules() {
    if (!this.currentSettlement || !this.npcs.length) return;
    const hour = this.timeSystem.hour;

    for (const npc of this.npcs) {
      const activity = this.dialogueSys.getScheduleActivity(npc, hour);
      if (!activity) continue;

      // Simple movement: move one step toward a target area
      // NPCs wander slightly based on their schedule location
      if (this.rng.chance(0.3)) {
        const dx = this.rng.nextInt(-1, 1);
        const dy = this.rng.nextInt(-1, 1);
        const nx = npc.position.x + dx;
        const ny = npc.position.y + dy;

        if (this.currentSettlement.tiles &&
          ny >= 0 && ny < this.currentSettlement.tiles.length &&
          nx >= 0 && nx < this.currentSettlement.tiles[0].length &&
          !this.currentSettlement.tiles[ny][nx].solid &&
          !(nx === this.player.position.x && ny === this.player.position.y) &&
          !this.npcs.some(n => n !== npc && n.position.x === nx && n.position.y === ny)) {
          npc.position.x = nx;
          npc.position.y = ny;
        }
      }
    }
  }

  movePlayerInDungeon(dx, dy) {
    if (!this.currentDungeon || !this.currentDungeon.tiles) return;

    const nx = this.player.position.x + dx;
    const ny = this.player.position.y + dy;

    if (ny < 0 || ny >= this.currentDungeon.tiles.length) return;
    if (nx < 0 || nx >= this.currentDungeon.tiles[0].length) return;

    const tile = this.currentDungeon.tiles[ny][nx];
    if (!tile.walkable) return;

    // Check enemy collision -> combat
    const enemyAt = this.enemies.find(e => e.position.x === nx && e.position.y === ny);
    if (enemyAt) {
      this.combatState = {
        enemy: enemyAt,
        selectedAction: 0,
        shake: { intensity: 0, decay: 0.85 },
        hitTimer: 0,
        hitRecoil: 0,
        combatParticles: [],
        damageNumbers: [],
      };
      this.ui.addMessage(`${enemyAt.name} appeared!`, COLORS.BRIGHT_RED);
      this.setState('COMBAT');
      return;
    }

    this.player.position.x = nx;
    this.player.position.y = ny;
    this.turnCount++;

    // Check for items on ground
    const itemAt = this.items.find(i =>
      i.position && i.position.x === nx && i.position.y === ny);
    if (itemAt) {
      this.ui.addMessage(`You see ${itemAt.name} here. Press G to pick up.`, COLORS.BRIGHT_CYAN);
    }

    // Check for story elements in ruins
    if (this.currentDungeon?.storyElements) {
      const story = this.currentDungeon.storyElements.find(s => s.x === nx && s.y === ny);
      if (story) {
        if (story.type === 'INSCRIPTION') {
          const lore = this.loreGen.generateLocationHistory(this.rng, story.name, 'ruins');
          this.ui.addMessage(`You read: "${lore}"`, COLORS.BRIGHT_CYAN);
        } else if (story.type === 'BONES') {
          this.ui.addMessage('Scattered bones lie here... someone met a grim fate.', COLORS.BRIGHT_BLACK);
        } else if (story.type === 'BROKEN_FURNITURE') {
          this.ui.addMessage('Broken furniture hints at violence or hasty abandonment.', COLORS.BRIGHT_BLACK);
        }
      }
    }

    // Update FETCH quest progress for item pickups
    // (actual pickup is in handleDungeonInput, but location-based quests check here)

    // Tick status effects
    this.tickStatusEffects();

    // Move enemies (AStar-powered AI)
    this.updateEnemyAI();
  }

  updateEnemyAI() {
    for (const enemy of this.enemies) {
      const dist = distance(enemy.position.x, enemy.position.y,
        this.player.position.x, this.player.position.y);

      // Behavior-based detection range
      const detectRange = enemy.behavior === 'ambush' ? 4 :
        enemy.behavior === 'coward' ? 6 :
        enemy.behavior === 'patrol' ? 7 : 8;

      if (dist < detectRange) {
        // Cowards flee if low HP
        if (enemy.behavior === 'coward' && enemy.stats.hp < enemy.stats.maxHp * 0.3) {
          const dx = Math.sign(enemy.position.x - this.player.position.x);
          const dy = Math.sign(enemy.position.y - this.player.position.y);
          const nx = enemy.position.x + dx;
          const ny = enemy.position.y + dy;
          if (this.currentDungeon?.tiles?.[ny]?.[nx]?.walkable &&
            !(nx === this.player.position.x && ny === this.player.position.y) &&
            !this.enemies.some(e => e !== enemy && e.position.x === nx && e.position.y === ny)) {
            enemy.position.x = nx;
            enemy.position.y = ny;
          }
          continue;
        }

        // Use AStar pathfinding for intelligent movement
        if (dist > 1.5) {
          const dungeonTiles = this.currentDungeon?.tiles;
          if (dungeonTiles) {
            const path = AStar.findPath(
              enemy.position.x, enemy.position.y,
              this.player.position.x, this.player.position.y,
              (x, y) => {
                if (y < 0 || y >= dungeonTiles.length || x < 0 || x >= dungeonTiles[0].length) return false;
                if (!dungeonTiles[y][x].walkable) return false;
                if (x === this.player.position.x && y === this.player.position.y) return true;
                return !this.enemies.some(e => e !== enemy && e.position.x === x && e.position.y === y);
              },
              50
            );

            if (path && path.length > 1) {
              const next = path[1];
              if (!(next.x === this.player.position.x && next.y === this.player.position.y)) {
                enemy.position.x = next.x;
                enemy.position.y = next.y;
              }
            }
          }
        }

        // Adjacent? Attack player
        if (dist <= 1.5) {
          const result = this.combat.calculateAttack(enemy, this.player);
          if (result.hit && !this.debug.invincible) {
            this.player.stats.hp -= result.damage;
            this.ui.addMessage(result.message, COLORS.BRIGHT_RED);
            this.renderer.triggerGlitch();
            this.particles.emit(this.player.position.x, this.player.position.y, '*', COLORS.BRIGHT_RED, 3, 2, 8);
            if (this.player.isDead()) {
              this.combatState = { enemy };
              this.setState('GAME_OVER');
              return;
            }
          }

          // Apply creature abilities
          if (enemy.ability && this.rng.chance(0.3)) {
            this.applyCreatureAbility(enemy);
          }
        }
      } else if (enemy.behavior === 'patrol') {
        // Patrol: random movement when player not detected
        if (this.rng.chance(0.2)) {
          const dx = this.rng.nextInt(-1, 1);
          const dy = this.rng.nextInt(-1, 1);
          const nx = enemy.position.x + dx;
          const ny = enemy.position.y + dy;
          if (this.currentDungeon?.tiles?.[ny]?.[nx]?.walkable &&
            !this.enemies.some(e => e !== enemy && e.position.x === nx && e.position.y === ny)) {
            enemy.position.x = nx;
            enemy.position.y = ny;
          }
        }
      }
    }
  }

  /**
   * Apply a creature's special ability in combat.
   */
  applyCreatureAbility(enemy) {
    const ability = enemy.ability;
    if (!ability) return;

    switch (ability.type) {
      case 'dot':
        this.addStatusEffect('poisoned', ability.duration, { damage: ability.damage });
        this.ui.addMessage(`${enemy.name} poisons you! (-${ability.damage} HP/turn for ${ability.duration} turns)`, COLORS.BRIGHT_GREEN);
        break;
      case 'drain':
        this.player.stats.hp -= ability.damage;
        enemy.stats.hp = Math.min(enemy.stats.maxHp, enemy.stats.hp + ability.heal);
        this.ui.addMessage(`${enemy.name} drains your life force!`, COLORS.BRIGHT_MAGENTA);
        break;
      case 'magic':
        this.player.stats.hp -= ability.damage;
        this.ui.addMessage(`${enemy.name} casts ${ability.name} for ${ability.damage} damage!`, COLORS.BRIGHT_MAGENTA);
        this.renderer.flash('#FF4400', 0.3);
        break;
      case 'debuff':
        if (ability.attackReduce) {
          this.addStatusEffect('weakened', 5, { attackReduce: ability.attackReduce });
          this.ui.addMessage(`${enemy.name} weakens you! (-${ability.attackReduce} ATK)`, COLORS.BRIGHT_YELLOW);
        }
        if (ability.defenseReduce) {
          this.addStatusEffect('exposed', 5, { defenseReduce: ability.defenseReduce });
          this.ui.addMessage(`${enemy.name} exposes your defenses! (-${ability.defenseReduce} DEF)`, COLORS.BRIGHT_YELLOW);
        }
        break;
      case 'control':
        this.addStatusEffect('rooted', 2, { immobile: true });
        this.ui.addMessage(`${enemy.name} roots you in place!`, COLORS.BRIGHT_GREEN);
        break;
      case 'heal':
        enemy.stats.hp = Math.min(enemy.stats.maxHp, enemy.stats.hp + ability.healSelf);
        this.ui.addMessage(`${enemy.name} regenerates!`, COLORS.BRIGHT_GREEN);
        break;
    }
  }

  /**
   * Add a status effect to the player.
   */
  addStatusEffect(name, duration, data = {}) {
    // Replace existing effect of same type
    this.statusEffects = this.statusEffects.filter(e => e.name !== name);
    this.statusEffects.push({ name, duration, ...data });
  }

  /**
   * Process status effects each turn.
   */
  tickStatusEffects() {
    for (let i = this.statusEffects.length - 1; i >= 0; i--) {
      const effect = this.statusEffects[i];
      effect.duration--;

      if (effect.damage) {
        this.player.stats.hp -= effect.damage;
        this.ui.addMessage(`You take ${effect.damage} ${effect.name} damage!`, COLORS.GREEN);
      }

      if (effect.duration <= 0) {
        this.ui.addMessage(`${effect.name} wears off.`, COLORS.BRIGHT_BLACK);
        this.statusEffects.splice(i, 1);
      }
    }

    // Check death from DoT
    if (this.player.isDead()) {
      this.setState('GAME_OVER');
    }
  }

  // ─── NPC INTERACTION ───

  findAdjacentNPC() {
    const px = this.player.position.x;
    const py = this.player.position.y;
    for (const npc of this.npcs) {
      if (Math.abs(npc.position.x - px) <= 1 && Math.abs(npc.position.y - py) <= 1) {
        return npc;
      }
    }
    return null;
  }

  startDialogue(npc) {
    this.activeNPC = npc;
    const greeting = this.dialogueSys.generateGreeting(npc, npc.playerReputation || 0);
    const options = this.dialogueSys.generateOptions(npc, npc.playerReputation || 0, this.gameContext);

    // Schedule-aware greeting modifier
    const schedulePrefix = this.dialogueSys.getScheduleGreeting(npc, this.timeSystem.hour);

    // Check for completable quests to add turn-in option
    const activeQuests = this.questSystem.getActiveQuests();
    for (const quest of activeQuests) {
      if (this.questSystem.checkCompletion(quest.id)) {
        // Add turn-in option at the top
        options.unshift({
          text: `[TURN IN] ${quest.title}`,
          action: 'turnInQuest',
          questId: quest.id,
          hint: 'Quest completed!',
        });
      }
    }

    // NPC memory-based greeting
    let memoryNote = '';
    if (npc.memory && npc.memory.length > 0) {
      const lastInteraction = npc.memory[npc.memory.length - 1];
      if (lastInteraction.type === 'secret_shared') {
        memoryNote = ' Remember... keep what I told you between us.';
      } else if (lastInteraction.type === 'reputation_change' && lastInteraction.amount > 0) {
        memoryNote = ' Good to see you again, friend.';
      }
    }

    this.ui.dialogueState = {
      npcName: npc.name.full || npc.name.first || npc.title || 'NPC',
      reputation: npc.playerReputation || 0,
      text: schedulePrefix + greeting.text + memoryNote,
      options: options
    };
    this.ui.resetSelection();
    this.setState('DIALOGUE');
  }

  openShop(npc) {
    const shopType = (npc.shop && (npc.shop.type || npc.shop.specialization)) || (npc.role === 'blacksmith' ? 'blacksmith' : 'general');
    const locTier = this.gameContext.currentLocation?.type || 'village';
    const inventory = this.shopSystem.generateInventory(this.rng, shopType, locTier, 1);

    this.ui.shopState = {
      shopName: npc.shop?.name || `${npc.name.first}'s Shop`,
      tab: 'buy',
      shopItems: inventory.map(item => ({
        ...item,
        buyPrice: this.shopSystem.getPrice(item, npc.playerReputation || 0),
        sellPrice: this.shopSystem.getSellPrice(item)
      })),
      playerItems: this.player.inventory.map(item => ({
        ...item,
        buyPrice: item.value || 10,
        sellPrice: this.shopSystem.getSellPrice(item)
      })),
      playerGold: this.player.gold
    };
    this.ui.resetSelection();
    this.setState('SHOP');
  }

  // ─── ITEM USE ───

  useItem(item) {
    if (item.type === 'potion') {
      const effect = item.effect || item.stats || {};
      if (item.subtype === 'mana' || item.name.toLowerCase().includes('mana')) {
        const restore = effect.mana || 20;
        this.player.stats.mana = Math.min(this.player.stats.mana + restore, this.player.stats.maxMana);
        this.ui.addMessage(`Restored ${restore} mana!`, COLORS.BRIGHT_BLUE);
      } else if (item.subtype === 'healing' || effect.heal) {
        const restore = effect.heal || 15;
        this.player.heal(restore);
        this.ui.addMessage(`Restored ${restore} HP!`, COLORS.BRIGHT_GREEN);
      } else {
        this.ui.addMessage(`Used ${item.name}.`, COLORS.BRIGHT_CYAN);
      }
      this.player.removeItem(item.id);
    } else if (item.type === 'food') {
      const heal = (item.effect && item.effect.heal) || (item.stats && item.stats.hp) || 5;
      this.player.heal(heal);
      this.player.removeItem(item.id);
      this.ui.addMessage(`Ate ${item.name}. Feel a bit better.`, COLORS.BRIGHT_GREEN);
    } else if (item.type === 'scroll') {
      const effect = item.effect || {};
      if (effect.damage) {
        this.ui.addMessage(`The charge erupts with ${effect.type || 'electrical'} energy!`, COLORS.BRIGHT_MAGENTA);
      } else {
        this.ui.addMessage(`Used ${item.name}.`, COLORS.BRIGHT_CYAN);
      }
      this.player.removeItem(item.id);
    }
  }

  // ─── SETTINGS ───

  _loadVersion() {
    fetch('version.json')
      .then(r => r.json())
      .then(data => {
        const label = `${data.phase} ${data.version}`;
        document.title = `ASCIIQUEST [${label}]`;
        this.ui.versionString = label;
      })
      .catch(() => { /* version.json not found, use defaults */ });
  }

  _loadSettings() {
    try {
      const raw = localStorage.getItem('asciiquest_settings');
      if (raw) {
        const saved = JSON.parse(raw);
        Object.assign(this.settings, saved);
      }
    } catch (e) { /* ignore */ }
    // Apply loaded settings to renderer/input (may be called before they exist in constructor)
    if (this.renderer) {
      this.renderer.enableCRT = this.settings.crtEffects;
      this.renderer.crtOptions = this.settings;
    }
    if (this.input) this.input.enableTouch = this.settings.touchControls;
  }

  _saveSettings() {
    try {
      localStorage.setItem('asciiquest_settings', JSON.stringify(this.settings));
    } catch (e) { /* ignore */ }
    // Apply settings immediately
    this.renderer.enableCRT = this.settings.crtEffects;
    this.renderer.crtOptions = this.settings;
    this.input.enableTouch = this.settings.touchControls;
  }

  // ─── SAVE/LOAD ───

  saveGame(slot = 1) {
    try {
      const saveData = {
        version: 4,
        seed: this.seed,
        exploredChunks: [...this.overworld.exploredChunks],
        player: {
          name: this.player.name,
          race: this.player.race,
          playerClass: this.player.playerClass,
          stats: this.player.stats,
          position: this.player.position,
          inventory: this.player.inventory,
          equipment: this.player.equipment,
          gold: this.player.gold,
          abilities: this.player.abilities,
          knownLocations: [...this.player.knownLocations]
        },
        time: {
          hour: this.timeSystem.hour,
          day: this.timeSystem.day,
          year: this.timeSystem.year
        },
        quests: {
          active: this.questSystem.getActiveQuests(),
          completed: this.questSystem.getCompletedQuests()
        },
        factions: {
          standings: Object.fromEntries(this.factionSystem._playerStanding),
        },
        weather: {
          current: this.weatherSystem.current,
          intensity: this.weatherSystem.intensity,
          duration: this.weatherSystem.duration,
        },
        events: this.eventSystem.scheduledEvents.map(e => ({
          type: e.type,
          triggerDay: e.triggerDay,
          fired: e.fired,
          data: e.data,
        })),
        statusEffects: this.statusEffects,
        activeEffects: this.activeEffects,
        turnCount: this.turnCount,
        state: this.state,
        trackedQuestId: this._trackedQuestId
      };

      // Compress dungeon tiles with RLE if in dungeon
      if (this.currentDungeon && this.currentDungeon.tiles) {
        saveData.dungeon = {
          floor: this.currentFloor,
          tiles: this._compressTiles(this.currentDungeon.tiles),
          width: this.currentDungeon.tiles[0]?.length || 0,
          height: this.currentDungeon.tiles.length,
        };
        saveData.enemies = this.enemies.map(e => ({
          id: e.id, name: e.name, char: e.char, color: e.color,
          position: e.position, stats: e.stats, faction: e.faction,
          behavior: e.behavior, ability: e.ability,
          isBoss: e.isBoss, isElite: e.isElite,
        }));
        saveData.items = this.items.map(i => ({ ...i }));
      }

      // NPC state
      if (this.npcs.length > 0) {
        saveData.npcs = this.npcs.map(n => ({
          id: n.id, position: n.position,
          playerReputation: n.playerReputation,
          memory: n.memory.slice(-10), // Keep last 10 memories
        }));
      }

      localStorage.setItem(`asciiquest_save_${slot}`, JSON.stringify(saveData));
      // Also keep backwards-compatible key
      localStorage.setItem('asciiquest_save', JSON.stringify(saveData));
      this.ui.addMessage('Game saved.', COLORS.BRIGHT_GREEN);
      return true;
    } catch (e) {
      this.ui.addMessage('Save failed!', COLORS.BRIGHT_RED);
      return false;
    }
  }

  _compressTiles(tiles) {
    // RLE encoding: [type, char, fg, count] runs
    const runs = [];
    let prev = null;
    let count = 0;
    for (let y = 0; y < tiles.length; y++) {
      for (let x = 0; x < tiles[0].length; x++) {
        const t = tiles[y][x];
        const key = `${t.type}|${t.char}|${t.fg}|${t.bg}|${t.walkable ? 1 : 0}`;
        if (key === prev) {
          count++;
        } else {
          if (prev !== null) {
            runs.push([prev, count]);
          }
          prev = key;
          count = 1;
        }
      }
    }
    if (prev !== null) runs.push([prev, count]);
    return runs;
  }

  _decompressTiles(runs, width, height) {
    const tiles = [];
    let row = [];
    for (const [key, count] of runs) {
      const [type, char, fg, bg, walkStr] = key.split('|');
      for (let i = 0; i < count; i++) {
        row.push({ type, char, fg, bg, walkable: walkStr === '1' });
        if (row.length >= width) {
          tiles.push(row);
          row = [];
        }
      }
    }
    if (row.length > 0) tiles.push(row);
    return tiles;
  }

  loadGame(slot = 1) {
    try {
      // Try slot-based first, then fallback to legacy key
      let data = localStorage.getItem(`asciiquest_save_${slot}`);
      if (!data) data = localStorage.getItem('asciiquest_save');
      if (!data) return false;

      const save = JSON.parse(data);
      this.seed = save.seed;
      this.rng = new SeededRNG(this.seed);
      this.cloudSystem = new CloudSystem(this.seed);

      // Regenerate world from seed using chunk manager
      this.overworld = new ChunkManager(this.seed);
      if (save.exploredChunks) {
        this.overworld.exploredChunks = new Set(save.exploredChunks);
      }
      this.eventSystem.generateWorldEvents(this.overworld);

      // Restore player
      this.player = new Player(save.player.name, save.player.race, save.player.playerClass);
      Object.assign(this.player.stats, save.player.stats);
      this.player.position = save.player.position;
      this.player.inventory = save.player.inventory || [];
      this.player.equipment = save.player.equipment || {};
      this.player.gold = save.player.gold;
      this.player.knownLocations = new Set(save.player.knownLocations || []);
      if (save.player.abilities) this.player.abilities = save.player.abilities;

      // Restore time
      this.timeSystem.hour = save.time.hour;
      this.timeSystem.day = save.time.day;
      this.timeSystem.year = save.time.year;

      // Restore faction standings
      if (save.factions && save.factions.standings) {
        for (const [id, standing] of Object.entries(save.factions.standings)) {
          this.factionSystem._playerStanding.set(id, standing);
        }
      }

      // Restore weather
      if (save.weather) {
        this.weatherSystem.current = save.weather.current;
        this.weatherSystem.intensity = save.weather.intensity;
        this.weatherSystem.duration = save.weather.duration;
      }

      // Restore events
      if (save.events) {
        this.eventSystem.scheduledEvents = save.events;
      }

      // Restore status effects
      this.statusEffects = save.statusEffects || [];
      this.activeEffects = save.activeEffects || this.activeEffects;

      // Restore dungeon state
      if (save.dungeon) {
        this.currentFloor = save.dungeon.floor;
        this.currentDungeon = {
          tiles: this._decompressTiles(save.dungeon.tiles, save.dungeon.width, save.dungeon.height),
        };
        this.enemies = (save.enemies || []).map(e => ({
          ...e,
          getAttackPower() { return this.stats.attack; },
          getDefense() { return this.stats.defense; },
        }));
        this.items = save.items || [];
      }

      this.turnCount = save.turnCount;
      this._trackedQuestId = save.trackedQuestId || null;

      // Generate chunks around player position
      this.overworld.ensureChunksAround(this.player.position.x, this.player.position.y);

      this.camera.follow(this.player);
      this.setState(save.state || 'OVERWORLD');
      return true;
    } catch (e) {
      return false;
    }
  }

  // ─── RENDERING ───

  render() {
    this.renderer.beginFrame();

    switch (this.state) {
      case 'MENU':
        this.ui.drawMainMenu(this.renderer.cols, this.renderer.rows);
        break;

      case 'CHAR_CREATE':
        this.ui.drawCharCreation(this.charGenState);
        break;

      case 'LOADING':
        if (this._worldGenEvents && this._worldGenEvents.length > 0) {
          this.ui.drawWorldGen(this._worldGenEvents, this._worldGenStats || {}, this._worldGenEra, this._worldGenPhase);
        } else {
          this.ui.drawLoading('Generating world...');
        }
        break;

      case 'WORLD_GEN_PAUSE':
        this.ui.drawWorldGen(this._worldGenEvents, this._worldGenStats || {}, this._worldGenEra, this._worldGenPhase);
        break;

      case 'OVERWORLD':
        this.renderOverworld();
        this.ui.drawHUD(this.player, this.timeSystem, this.gameContext, this.statusEffects, this.weatherSystem);
        this._renderQuestNavIndicator();
        break;

      case 'LOCATION':
        if (this.locationCamera) { this.locationCamera.follow(this.player); this.locationCamera.update(); }
        this.ui.drawLocationOverview(this.currentSettlement, this.npcs, this.player, this.locationCamera);
        this.ui.drawHUD(this.player, this.timeSystem, this.gameContext, this.statusEffects, this.weatherSystem);
        this._renderQuestNavIndicator();
        break;

      case 'DUNGEON':
        this.renderDungeon();
        this.ui.drawHUD(this.player, this.timeSystem, this.gameContext, this.statusEffects, this.weatherSystem);
        this.ui.drawMinimap(this.renderer, this.currentDungeon, this.player, this.enemies);
        this._renderQuestNavIndicator();
        break;

      case 'DIALOGUE':
        // Render background
        if (this.currentSettlement) {
          this.ui.drawLocationOverview(this.currentSettlement, this.npcs, this.player, this.locationCamera);
        }
        if (this.ui.dialogueState) this.ui.drawDialogue(this.ui.dialogueState);
        break;

      case 'SHOP':
        if (this.ui.shopState) this.ui.drawShop(this.ui.shopState, this.player);
        break;

      case 'INVENTORY':
        this.ui.drawInventory(this.player);
        break;

      case 'CHARACTER':
        this.ui.drawCharacterSheet(this.player, this.factionSystem);
        break;

      case 'QUEST_LOG':
        this.ui.drawQuestLog(this.questSystem, this._trackedQuestId);
        break;

      case 'MAP':
        this.ui.drawMapView(this.overworld, this.player, this.player?.knownLocations);
        break;

      case 'HELP':
        this.ui.drawHelp();
        break;

      case 'GAME_OVER':
        this.ui.drawGameOver(this.player, 'Lost to the wilds.');
        break;

      case 'FACTION':
        this.ui.drawFactionPanel(this.factionSystem);
        break;

      case 'QUEST_COMPASS': {
        const activeQuests = this.questSystem.getActiveQuests();
        const idx = Math.min(this._compassQuestIdx || 0, activeQuests.length - 1);
        const quest = activeQuests[idx] || null;
        const playerPos = this.player ? { x: this.player.position.x, y: this.player.position.y } : { x: 0, y: 0 };
        const targetPos = quest ? this._getQuestTargetCoords(quest) : null;
        this.ui.drawQuestCompass(quest, playerPos, targetPos, activeQuests, idx, Date.now());
        break;
      }

      case 'COMBAT':
        this.renderCombat();
        break;

      case 'SETTINGS':
        this.ui.drawSettings(this.settings);
        break;
    }

    // Force full redraw when post-processing, transitions, or flash
    // will modify the canvas after buffer snapshot — otherwise dirty
    // tracking leaves stale post-processed pixels on unchanged cells
    const hasTimeTint = ['OVERWORLD', 'LOCATION', 'DUNGEON'].includes(this.state);
    const isAnimatedScreen = this.state === 'QUEST_COMPASS' || this.state === 'MENU' || this.state === 'LOADING' || this.state === 'WORLD_GEN_PAUSE' || this.state === 'COMBAT';
    const needsFullRedraw = this.renderer.effectsEnabled
      || this.transitionTimer > 0
      || hasTimeTint
      || isAnimatedScreen
      || (this.renderer._flashAlpha && this.renderer._flashAlpha > 0);
    this.renderer.endFrame(needsFullRedraw);
    this.renderer.postProcess();

    // Day/night tint — viewport only (not HUD)
    if (hasTimeTint) {
      const viewLeft = 1;
      const viewTop = LAYOUT.VIEWPORT_TOP;
      const viewW = this.renderer.cols - 2;
      const viewH = this.renderer.rows - LAYOUT.HUD_TOTAL;

      // Get smooth tint from TimeSystem
      const effectiveHour = this.debug.forceTimeOfDay != null ? this.debug.forceTimeOfDay : this.timeSystem.hour;
      const origHour = this.timeSystem.hour;
      this.timeSystem.hour = effectiveHour;
      const tint = this.timeSystem.getTimeTint();
      this.timeSystem.hour = origHour;
      this.renderer.tintViewport(tint.color, tint.alpha, viewLeft, viewTop, viewW, viewH);

      // Apply shadow darkening in overworld (post-process on canvas)
      if (this.state === 'OVERWORLD' && this._shadowCells) {
        for (const [key, alpha] of this._shadowCells) {
          const [sx, sy] = key.split(',').map(Number);
          this.renderer.darkenCell(viewLeft + sx, viewTop + sy, alpha);
        }
      }

      // Apply cloud overlay and cloud shadows in overworld
      if (this.state === 'OVERWORLD' && this.cloudSystem && !this.debug.disableClouds) {
        const camX = Math.floor(this.camera.x);
        const camY = Math.floor(this.camera.y);
        const sunDir = this.timeSystem.getSunDirection();
        const isDay = this.timeSystem.isDaytime();

        // Shadow offset: high sun → close shadow, low sun → far shadow
        const shadowDist = sunDir.elevation > 0.05
          ? Math.min(8, Math.round(2.0 / sunDir.elevation))
          : 8;
        const shOffX = Math.round(sunDir.dx * shadowDist);
        const shOffY = Math.round(sunDir.dy * shadowDist);

        for (let sy = 0; sy < viewH; sy++) {
          for (let sx = 0; sx < viewW; sx++) {
            const wx = camX + sx;
            const wy = camY + sy;
            const density = this.cloudSystem.getCloudDensity(wx, wy);

            if (density > 0) {
              // Cloud visual: white tint (brighter/whiter hue shift)
              const cloudAlpha = isDay ? density * 0.18 : density * 0.06;
              this.renderer.tintCell(viewLeft + sx, viewTop + sy, '#CCCCEE', cloudAlpha);

              // Cloud shadow: darkened ground offset by sun direction
              if (isDay && sunDir.elevation > 0.05) {
                const shsx = sx + shOffX;
                const shsy = sy + shOffY;
                if (shsx >= 0 && shsx < viewW && shsy >= 0 && shsy < viewH) {
                  const shadowAlpha = density * 0.20;
                  this.renderer.darkenCell(viewLeft + shsx, viewTop + shsy, shadowAlpha);
                }
              }
            }
          }
        }
      }

      // Apply colored light glow for player light source at night
      if (!this.timeSystem.isDaytime()) {
        const lightInfo = this.player?.hasLightSource();
        if (lightInfo?.hasLight && this.state === 'OVERWORLD') {
          const camX = Math.floor(this.camera.x);
          const camY = Math.floor(this.camera.y);
          const plx = this.player.position.x - camX;
          const ply = this.player.position.y - camY;
          const rad = lightInfo.radius;
          for (let dy = -rad; dy <= rad; dy++) {
            for (let dx = -rad; dx <= rad; dx++) {
              const dist = Math.sqrt(dx * dx + dy * dy);
              if (dist <= rad) {
                const falloff = (1 - dist / rad) * 0.15;
                const cx = plx + dx;
                const cy = ply + dy;
                if (cx >= 0 && cx < viewW && cy >= 0 && cy < viewH) {
                  this.renderer.tintCell(viewLeft + cx, viewTop + cy, lightInfo.color, falloff);
                }
              }
            }
          }
        }
      }
    }

    // Transition overlay (fade in/out between scenes)
    this.renderTransition();

    // Flash overlay
    this.renderer.applyFlash();
  }

  // Tile height lookup for shadow casting
  static TILE_HEIGHTS = {
    TREE: 2, PINE: 2, PALM: 2, CACTUS: 1,
    WALL: 3, BUILDING: 3, TOWER: 4, CASTLE: 4,
    MOUNTAIN: 4, HILL: 2, RUINS: 2,
    FENCE: 1, COLUMN: 2, STATUE: 2,
    // Structure tiles
    OBELISK: 4, OBELISK_TOP: 5, OBELISK_BASE: 2,
    REACTOR_WALL: 3, REACTOR_CORE: 1,
    ALIEN_PILLAR: 5, ALIEN_NODE: 3,
    CRYO_HOUSING: 2, CRYO_EMITTER: 3, CRYO_BASE: 1,
    FUNGAL_MASS: 3, DATA_FRAME: 2, DATA_CORE: 1,
    VOID_ARCH: 4, VOID_BASE: 2, VOID_CENTER: 0,
    // Anomaly biome tiles
    CRYSTAL_ZONE: 2, HYDRO_JUNGLE: 2,
    // Wetland & vegetation
    MARSH_REEDS: 1, TALL_GRASS: 1,
    // Forest types
    SPARSE_TREES: 1, FOREST: 2, DEEP_FOREST: 2,
    CANOPY: 3, PINE_STAND: 2,
    // Hills & foothills
    FOOTHILL: 1, ROLLING_HILLS: 2, RIDGE: 3,
    ROCKY_SLOPE: 2, HIGHLAND: 2,
    BOULDER_FIELD: 2, ANCIENT_RUINS: 2,
    // Mountain types
    MOUNTAIN_BASE: 3, CRAG: 4,
    HIGH_PEAK: 5, SUMMIT: 5, SNOWCAP: 5,
    CAVE_MOUTH: 3,
  };

  _renderQuestNavIndicator() {
    if (!this._trackedQuestId || !this.settings.showQuestNav || !this.player) return;
    const trackedQuest = this.questSystem._activeQuests.get(this._trackedQuestId);
    if (!trackedQuest) return;
    const targetPos = this._getQuestTargetCoords(trackedQuest);
    if (!targetPos) return;
    const playerPos = { x: this.player.position.x, y: this.player.position.y };
    this.ui.drawQuestNavIndicator(trackedQuest.title, playerPos, targetPos, Date.now());
  }

  renderOverworld() {
    if (!this.overworld) return;

    const r = this.renderer;
    this.camera.update();
    const viewLeft = 1;
    const viewTop = LAYOUT.VIEWPORT_TOP;
    const viewW = r.cols - 2;
    const viewH = r.rows - LAYOUT.HUD_TOTAL;

    const isNight = !this.timeSystem.isDaytime();
    const lightInfo = this.player.hasLightSource();
    const sunDir = this.timeSystem.getSunDirection();

    // FOV range adjusted by night and light source
    let viewRange = 30;
    if (isNight) {
      viewRange = lightInfo.hasLight ? (lightInfo.radius + 2) : 3;
    }

    // Collect shadow cells if daytime or moonlit
    const shadowCells = new Map(); // "sx,sy" -> alpha
    if (!this.debug.disableShadows) {
      for (let sy = 0; sy < viewH; sy++) {
        for (let sx = 0; sx < viewW; sx++) {
          const wx = Math.floor(this.camera.x) + sx;
          const wy = Math.floor(this.camera.y) + sy;
          const tile = this.overworld.getTile(wx, wy);
          const height = Game.TILE_HEIGHTS[tile.type] || 0;
          if (height > 0) {
            const len = Math.min(height, Math.round(sunDir.shadowLength * height * 0.4));
            const shadowAlpha = sunDir.isDay ? 0.25 : 0.12;
            for (let i = 1; i <= len; i++) {
              const shx = sx + sunDir.dx * i;
              const shy = sy + Math.round(sunDir.dy) * i;
              if (shx >= 0 && shx < viewW && shy >= 0 && shy < viewH) {
                const key = `${shx},${shy}`;
                const existing = shadowCells.get(key) || 0;
                shadowCells.set(key, Math.min(0.5, existing + shadowAlpha));
              }
            }
          }
        }
      }
    }

    for (let sy = 0; sy < viewH; sy++) {
      for (let sx = 0; sx < viewW; sx++) {
        const wx = Math.floor(this.camera.x) + sx;
        const wy = Math.floor(this.camera.y) + sy;

        const tile = this.overworld.getTile(wx, wy);

        // Fog of war
        const dist = distance(wx, wy, this.player.position.x, this.player.position.y);
        const fg = r.getAnimatedColor(tile.fg, tile.type);
        if (dist > viewRange) {
          r.drawChar(viewLeft + sx, viewTop + sy, tile.char, COLORS.BRIGHT_BLACK, COLORS.BLACK);
        } else {
          r.drawChar(viewLeft + sx, viewTop + sy, tile.char, fg, tile.bg || COLORS.BLACK);
        }
      }
    }

    // Draw locations
    for (const loc of this.overworld.getLoadedLocations()) {
      const sx = loc.x - Math.floor(this.camera.x);
      const sy = loc.y - Math.floor(this.camera.y);
      if (sx >= 0 && sx < viewW && sy >= 0 && sy < viewH) {
        const ch = loc.type === 'city' ? '▣' : loc.type === 'town' ? '□' :
          loc.type === 'village' ? '○' : loc.type === 'dungeon' ? '▼' :
            loc.type === 'castle' ? '♦' : loc.type === 'temple' ? '†' :
              loc.type === 'ruins' ? '▪' : loc.type === 'tower' ? '▲' : '◦';
        const isDungeon = loc.type === 'dungeon' || loc.type === 'tower' || loc.type === 'ruins';
        const glowCat = isDungeon ? 'DUNGEON_ENTRANCE' : 'SETTLEMENT';
        r.drawChar(viewLeft + sx, viewTop + sy, ch, this.glow.getGlowColor(glowCat, COLORS.BRIGHT_WHITE));
      }
    }

    // Draw player
    const px = this.player.position.x - Math.floor(this.camera.x);
    const py = this.player.position.y - Math.floor(this.camera.y);
    if (px >= 0 && px < viewW && py >= 0 && py < viewH) {
      r.drawChar(viewLeft + px, viewTop + py, '@', this.glow.getGlowColor('PLAYER', COLORS.BRIGHT_YELLOW));
    }

    // Quest navigation line overlay
    if (this._trackedQuestId && this.settings.showQuestNav) {
      const trackedQuest = this.questSystem._activeQuests.get(this._trackedQuestId);
      if (trackedQuest) {
        const navTarget = this._getQuestTargetCoords(trackedQuest);
        if (navTarget) {
          const playerX = this.player.position.x;
          const playerY = this.player.position.y;
          const camX = Math.floor(this.camera.x);
          const camY = Math.floor(this.camera.y);
          const navPoints = bresenhamLine(playerX, playerY, navTarget.x, navTarget.y);
          const now = Date.now();

          for (const pt of navPoints) {
            if (pt.x === playerX && pt.y === playerY) continue;
            const sx = pt.x - camX;
            const sy = pt.y - camY;
            if (sx < 0 || sx >= viewW || sy < 0 || sy >= viewH) continue;
            const d = Math.abs(pt.x - playerX) + Math.abs(pt.y - playerY);
            const pulse = Math.sin(now / 400 + d * 0.4) * 0.5 + 0.5;
            const navChar = (d % 3 === 0) ? '\u00b7' : '\u2219';
            const navColor = pulse > 0.5 ? COLORS.BRIGHT_CYAN : COLORS.CYAN;
            r.drawChar(viewLeft + sx, viewTop + sy, navChar, navColor);
          }

          // Draw target marker
          const tx = navTarget.x - camX;
          const ty = navTarget.y - camY;
          if (tx >= 0 && tx < viewW && ty >= 0 && ty < viewH) {
            const tPulse = Math.sin(now / 250) * 0.5 + 0.5;
            r.drawChar(viewLeft + tx, viewTop + ty, '\u2726',
              tPulse > 0.5 ? COLORS.BRIGHT_YELLOW : COLORS.YELLOW);
          }
        }
      }
    }

    // Render structure light glow on overworld at night
    if (isNight && this.overworld.chunkManager) {
      const camX = Math.floor(this.camera.x);
      const camY = Math.floor(this.camera.y);
      const cm = this.overworld.chunkManager;
      // Check visible chunks for structures with lights
      const cx1 = Math.floor(camX / 32) - 1;
      const cy1 = Math.floor(camY / 32) - 1;
      const cx2 = Math.floor((camX + viewW) / 32) + 1;
      const cy2 = Math.floor((camY + viewH) / 32) + 1;
      for (let ccx = cx1; ccx <= cx2; ccx++) {
        for (let ccy = cy1; ccy <= cy2; ccy++) {
          const chunk = cm.chunks.get(`${ccx},${ccy}`);
          if (!chunk || !chunk.structures) continue;
          for (const struct of chunk.structures) {
            for (const light of struct.lights) {
              const rad = light.radius;
              for (let dy = -rad; dy <= rad; dy++) {
                for (let dx = -rad; dx <= rad; dx++) {
                  const dist = Math.sqrt(dx * dx + dy * dy);
                  if (dist > rad) continue;
                  const sx = light.x + dx - camX;
                  const sy = light.y + dy - camY;
                  if (sx < 0 || sx >= viewW || sy < 0 || sy >= viewH) continue;
                  const falloff = Math.max(0, 1 - dist / rad);
                  const alpha = falloff * falloff * light.intensity * 0.4;
                  const hexR = Math.round(light.r * 255).toString(16).padStart(2, '0');
                  const hexG = Math.round(light.g * 255).toString(16).padStart(2, '0');
                  const hexB = Math.round(light.b * 255).toString(16).padStart(2, '0');
                  r.tintCell(viewLeft + sx, viewTop + sy, `#${hexR}${hexG}${hexB}`, alpha);
                }
              }
            }
          }
        }
      }
    }

    // Store shadow data for post-process tinting pass
    this._shadowCells = shadowCells;

    // Render weather particles
    const weatherEffect = this.weatherSystem.getVisualEffect();
    if (weatherEffect) {
      for (let sy = 0; sy < viewH; sy++) {
        for (let sx = 0; sx < viewW; sx++) {
          if (Math.random() < weatherEffect.density) {
            r.drawChar(viewLeft + sx, viewTop + sy, weatherEffect.char, weatherEffect.fg);
          }
        }
      }
    }

    // Render particle effects
    this.particles.update();
    this.particles.render(r, Math.floor(this.camera.x), Math.floor(this.camera.y));
  }

  renderDungeon() {
    if (!this.currentDungeon || !this.currentDungeon.tiles) return;

    const r = this.renderer;
    const viewLeft = 1;
    const viewTop = LAYOUT.VIEWPORT_TOP;
    const viewW = r.cols - 2;
    const viewH = r.rows - LAYOUT.HUD_TOTAL;

    // Center on player
    const offsetX = this.player.position.x - Math.floor(viewW / 2);
    const offsetY = this.player.position.y - Math.floor(viewH / 2);

    const dw = this.currentDungeon.tiles[0]?.length || 0;
    const dh = this.currentDungeon.tiles.length;

    // Build light sources for LightingSystem
    const lightSources = [];
    const lightInfo = this.player.hasLightSource();
    const px = this.player.position.x;
    const py = this.player.position.y;

    if (!this.debug.disableLighting) {
      // Player light
      const playerRadius = lightInfo.hasLight ? lightInfo.radius : 6;
      const plColor = lightInfo.hasLight ? this._hexToRGB(lightInfo.color) : { r: 200, g: 200, b: 200 };
      lightSources.push({
        x: px, y: py,
        radius: playerRadius,
        r: plColor.r / 255, g: plColor.g / 255, b: plColor.b / 255,
        intensity: lightInfo.hasLight ? 1.0 : 0.7,
      });

      // Static light sources (fireplaces, lava, etc)
      for (let ty = Math.max(0, offsetY); ty < Math.min(dh, offsetY + viewH); ty++) {
        for (let tx = Math.max(0, offsetX); tx < Math.min(dw, offsetX + viewW); tx++) {
          const tile = this.currentDungeon.tiles[ty]?.[tx];
          if (!tile) continue;
          if (tile.type === 'FIREPLACE' || tile.type === 'CAMPFIRE') {
            lightSources.push({ x: tx, y: ty, radius: 4, r: 1.0, g: 0.5, b: 0.15, intensity: 0.8 });
          } else if (tile.type === 'LAVA') {
            lightSources.push({ x: tx, y: ty, radius: 3, r: 1.0, g: 0.13, b: 0.0, intensity: 0.6 });
          } else if (tile.type === 'TORCH_SCONCE') {
            lightSources.push({ x: tx, y: ty, radius: 5, r: 1.0, g: 0.7, b: 0.3, intensity: 0.7 });
          }
        }
      }

      // Compute light map
      const isOpaque = (x, y) => {
        if (y < 0 || y >= dh || x < 0 || x >= dw) return true;
        return this.currentDungeon.tiles[y]?.[x] && !this.currentDungeon.tiles[y][x].walkable;
      };
      this.lighting.compute(lightSources, isOpaque, dw, dh);
    }

    // FOV - use lighting system for visibility if active, else fallback to raycasting
    const visible = new Set();
    if (this.debug.disableLighting) {
      // Legacy FOV
      const weatherMod = this.weatherSystem.getFOVModifier();
      const nightMod = this.timeSystem.isDaytime() ? 1.0 : 0.7;
      const viewDist = Math.max(4, Math.round(10 * weatherMod * nightMod));
      const perimeter = new Set();
      for (let dx = -viewDist; dx <= viewDist; dx++) {
        perimeter.add(`${px + dx},${py - viewDist}`);
        perimeter.add(`${px + dx},${py + viewDist}`);
      }
      for (let dy = -viewDist + 1; dy < viewDist; dy++) {
        perimeter.add(`${px - viewDist},${py + dy}`);
        perimeter.add(`${px + viewDist},${py + dy}`);
      }
      for (const pKey of perimeter) {
        const [tx, ty] = pKey.split(',').map(Number);
        const ray = bresenhamLine(px, py, tx, ty);
        for (const pt of ray) {
          visible.add(`${pt.x},${pt.y}`);
          if (pt.x !== px || pt.y !== py) {
            if (this.currentDungeon.tiles[pt.y]?.[pt.x] && !this.currentDungeon.tiles[pt.y][pt.x].walkable) break;
          }
        }
      }
    }

    for (let sy = 0; sy < viewH; sy++) {
      for (let sx = 0; sx < viewW; sx++) {
        const wx = offsetX + sx;
        const wy = offsetY + sy;

        if (wy >= 0 && wy < dh && wx >= 0 && wx < dw) {
          const tile = this.currentDungeon.tiles[wy][wx];
          let isVisible, brightness;

          if (!this.debug.disableLighting) {
            const light = this.lighting.getLight(wx, wy);
            brightness = light.brightness;
            isVisible = brightness > 0.02;
          } else {
            isVisible = visible.has(`${wx},${wy}`);
            brightness = isVisible ? 1.0 : 0;
          }

          if (isVisible) {
            let animFg = r.getAnimatedColor(tile.fg, tile.type);
            // Apply glow to interactive dungeon tiles
            const iType = tile.type;
            if (iType === 'STAIRS_DOWN' || iType === 'STAIRS_UP' || iType === 'DOOR' || iType === 'CHEST' || iType === 'BRIDGE') {
              animFg = this.glow.getGlowColor('INTERACTIVE', animFg);
            }
            // Dim fg/bg based on light brightness
            const dimFg = this._dimColor(animFg, Math.max(0.15, brightness));
            const dimBg = this._dimColor(tile.bg || COLORS.BLACK, brightness);
            r.drawChar(viewLeft + sx, viewTop + sy, tile.char, dimFg, dimBg);
          } else {
            r.drawChar(viewLeft + sx, viewTop + sy, ' ', COLORS.BLACK, COLORS.BLACK);
          }
        } else {
          r.drawChar(viewLeft + sx, viewTop + sy, ' ', COLORS.BLACK, COLORS.BLACK);
        }
      }
    }

    // Draw items
    for (const item of this.items) {
      if (item.position) {
        const light = this.debug.disableLighting ? { brightness: visible.has(`${item.position.x},${item.position.y}`) ? 1 : 0 }
          : this.lighting.getLight(item.position.x, item.position.y);
        if (light.brightness > 0.02) {
          const sx = item.position.x - offsetX;
          const sy = item.position.y - offsetY;
          if (sx >= 0 && sx < viewW && sy >= 0 && sy < viewH) {
            r.drawChar(viewLeft + sx, viewTop + sy, item.char || '!', this.glow.getGlowColor('LOOT', item.color || COLORS.BRIGHT_YELLOW));
          }
        }
      }
    }

    // Draw enemies
    for (const enemy of this.enemies) {
      const light = this.debug.disableLighting ? { brightness: visible.has(`${enemy.position.x},${enemy.position.y}`) ? 1 : 0 }
        : this.lighting.getLight(enemy.position.x, enemy.position.y);
      if (light.brightness > 0.02) {
        const sx = enemy.position.x - offsetX;
        const sy = enemy.position.y - offsetY;
        if (sx >= 0 && sx < viewW && sy >= 0 && sy < viewH) {
          r.drawChar(viewLeft + sx, viewTop + sy, enemy.char, enemy.color || COLORS.BRIGHT_RED);
        }
      }
    }

    // Draw player
    const playerScreenX = viewLeft + Math.floor(viewW / 2);
    const playerScreenY = viewTop + Math.floor(viewH / 2);
    r.drawChar(playerScreenX, playerScreenY, '@', this.glow.getGlowColor('PLAYER', COLORS.BRIGHT_YELLOW));

    // Render particles in dungeon
    this.particles.update();
    this.particles.render(r, offsetX, offsetY);
  }

  renderCombat() {
    if (!this.combatState) return;

    const r = this.renderer;
    const cols = r.cols;
    const rows = r.rows;
    const enemy = this.combatState.enemy;
    const bg = COLORS.FF_BLUE_DARK;
    const cs = this.combatState;

    r.clear();

    // ── Earthbound-style battle layout ──
    const battleH = Math.floor(rows * 0.55);
    const statusH = rows - battleH;

    // ── Fire Voronoi animated background ──
    const t = Date.now() / 1000;
    const fireChars = [' ', '.', '\u00B7', ':', '\u2219', '\u2591', '\u2592', '\u2593'];
    const fireFg = ['#FF2200', '#FF4400', '#FF6600', '#FF8800', '#FFAA00', '#FFCC00', '#FFDD44'];
    const fireBg = ['#1a0800', '#2a0e00', '#3a1500', '#4a1a00', '#5a2200', '#6a2800'];
    const numSeeds = 10;

    // Screen shake offset
    let shakeX = 0, shakeY = 0;
    if (cs.shake && cs.shake.intensity > 0.1) {
      shakeX = Math.round((Math.random() - 0.5) * cs.shake.intensity * 2);
      shakeY = Math.round((Math.random() - 0.5) * cs.shake.intensity);
      cs.shake.intensity *= cs.shake.decay;
    } else if (cs.shake) {
      cs.shake.intensity = 0;
    }

    // Store bg colors for compositing
    const bgColors = [];
    for (let row = 0; row < battleH; row++) {
      bgColors[row] = [];
      for (let col = 0; col < cols; col++) {
        let minDist = Infinity;
        let secondDist = Infinity;
        for (let s = 0; s < numSeeds; s++) {
          const sx = (cols / 2) + Math.sin(t * 0.45 + s * 2.09) * (cols * 0.4) + Math.sin(t * 0.26 + s * 1.3) * (cols * 0.15);
          const sy = (battleH / 2) + Math.cos(t * 0.375 + s * 1.88) * (battleH * 0.4) + Math.cos(t * 0.195 + s * 0.9) * (battleH * 0.15);
          const dx = col - sx;
          const dy = (row - sy) * 2;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < minDist) { secondDist = minDist; minDist = d; }
          else if (d < secondDist) { secondDist = d; }
        }
        const edge = secondDist - minDist;
        const pulse = Math.sin(minDist * 0.15 - t * 1.8) * 0.5 + 0.5;
        const edgePulse = Math.sin(edge * 0.5 - t * 1.2) * 0.5 + 0.5;
        const val = pulse * 0.6 + edgePulse * 0.4;
        const ci = Math.min(Math.floor(val * fireChars.length), fireChars.length - 1);
        const fi = Math.min(Math.floor((val * 0.7 + edge * 0.02) * fireFg.length), fireFg.length - 1);
        const bi = Math.min(Math.floor(val * fireBg.length), fireBg.length - 1);
        const drawCol = col + shakeX;
        const drawRow = row + shakeY;
        if (drawCol >= 0 && drawCol < cols && drawRow >= 0 && drawRow < battleH) {
          r.drawChar(drawCol, drawRow, fireChars[ci], fireFg[fi], fireBg[bi]);
        }
        bgColors[row][col] = fireBg[bi];
      }
    }

    // ── Centered Monster Art ──
    const art = getMonsterArt(enemy);
    const artLines = art.lines;
    const artH = artLines.length;
    const artW = Math.max(...artLines.map(l => l.length));

    // Hit recoil offset
    let recoilX = 0;
    if (cs.hitRecoil > 0) {
      recoilX = cs.hitRecoil > 3 ? 1 : 0;
      cs.hitRecoil--;
    }

    const artX = Math.floor(cols / 2 - artW / 2) + shakeX + recoilX;
    const artY = Math.floor(battleH / 2 - artH / 2) - 1 + shakeY;

    // Determine monster draw color (flash white on hit)
    let drawColor = art.color;
    if (cs.hitTimer > 0) {
      drawColor = '#FFFFFF';
      cs.hitTimer--;
    }

    // Draw monster art - spaces show fire bg through
    for (let row = 0; row < artH; row++) {
      const line = artLines[row];
      for (let col = 0; col < line.length; col++) {
        const ch = line[col];
        const dx = artX + col;
        const dy = artY + row;
        if (dx < 0 || dx >= cols || dy < 0 || dy >= battleH) continue;
        if (ch === ' ') continue; // fire bg shows through
        const cellBg = (bgColors[dy - shakeY] && bgColors[dy - shakeY][dx - shakeX]) || '#1a0800';
        r.drawChar(dx, dy, ch, drawColor, cellBg);
      }
    }

    // Monster name plate centered above art
    const eName = enemy.name;
    const nameX = Math.floor(cols / 2 - eName.length / 2) + shakeX;
    const nameY = artY - 2;
    if (nameY >= 0 && nameY < battleH) {
      // Dark background strip for readability
      for (let i = -1; i <= eName.length; i++) {
        const nx = nameX + i;
        if (nx >= 0 && nx < cols) r.drawChar(nx, nameY, ' ', '#000000', '#0a0500');
      }
      r.drawString(Math.max(0, nameX), nameY, eName, COLORS.BRIGHT_WHITE, '#0a0500');
    }

    // Monster HP bar centered below art
    const eHpW = Math.min(20, artW + 4);
    const eHpX = Math.floor(cols / 2 - eHpW / 2) + shakeX;
    const eHpY = artY + artH + 1;
    if (eHpY < battleH) {
      const eHpFrac = Math.max(0, enemy.stats.hp / enemy.stats.maxHp);
      const eHpFilled = Math.round(eHpFrac * eHpW);
      const eHpColor = eHpFrac < 0.25 ? COLORS.BRIGHT_RED : eHpFrac < 0.5 ? COLORS.BRIGHT_YELLOW : COLORS.BRIGHT_GREEN;
      for (let i = 0; i < eHpW; i++) {
        const hx = eHpX + i;
        if (hx >= 0 && hx < cols) {
          r.drawChar(hx, eHpY, i < eHpFilled ? '\u2588' : '\u2591', eHpColor, '#0a0500');
        }
      }
      const eHpStr = `${enemy.stats.hp}/${enemy.stats.maxHp}`;
      const hpStrX = Math.floor(cols / 2 - eHpStr.length / 2) + shakeX;
      if (eHpY + 1 < battleH) {
        r.drawString(Math.max(0, hpStrX), eHpY + 1, eHpStr, COLORS.WHITE, '#0a0500');
      }
    }

    // ── Combat Particles ──
    if (cs.combatParticles) {
      for (let i = cs.combatParticles.length - 1; i >= 0; i--) {
        const p = cs.combatParticles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.05; // gravity
        p.life--;
        if (p.life <= 0) {
          cs.combatParticles.splice(i, 1);
          continue;
        }
        const px = Math.round(p.x) + shakeX;
        const py = Math.round(p.y) + shakeY;
        if (px >= 0 && px < cols && py >= 0 && py < battleH) {
          const alpha = Math.min(1, p.life / 10);
          const color = alpha > 0.5 ? p.color : '#666666';
          r.drawChar(px, py, p.char, color, null);
        }
      }
    }

    // ── Floating Damage Numbers ──
    if (cs.damageNumbers) {
      for (let i = cs.damageNumbers.length - 1; i >= 0; i--) {
        const dn = cs.damageNumbers[i];
        dn.y -= 0.15;
        dn.life--;
        if (dn.life <= 0) {
          cs.damageNumbers.splice(i, 1);
          continue;
        }
        const dx = Math.round(dn.x) + shakeX;
        const dy = Math.round(dn.y) + shakeY;
        if (dx >= 0 && dx < cols && dy >= 0 && dy < battleH) {
          const alpha = dn.life / 20;
          const color = alpha > 0.5 ? dn.color : '#888888';
          r.drawString(Math.max(0, dx), dy, dn.text, color, null);
        }
      }
    }

    // ── Bottom status area (FF-style windows) ──

    // Message/battle log window (left side)
    const logW = Math.floor(cols * 0.55);
    const logH = statusH;
    r.drawBox(0, battleH, logW, logH, COLORS.FF_BORDER, bg);

    for (let i = 0; i < Math.min(logH - 2, this.ui.messageLog.length); i++) {
      const msg = this.ui.messageLog[i];
      r.drawString(2, battleH + 1 + i, msg.text.substring(0, logW - 4), msg.color, bg);
    }

    // Player status window (right side)
    const statusW = cols - logW;
    const statusBoxH = Math.floor(statusH * 0.45);
    r.drawBox(logW, battleH, statusW, statusBoxH, COLORS.FF_BORDER, bg);

    const p = this.player;
    r.drawString(logW + 2, battleH + 1, p.name, COLORS.BRIGHT_WHITE, bg);

    // HP gauge
    const hpFrac = p.stats.hp / p.stats.maxHp;
    const hpColor = hpFrac < 0.25 ? COLORS.BRIGHT_RED : hpFrac < 0.5 ? COLORS.BRIGHT_YELLOW : COLORS.BRIGHT_WHITE;
    r.drawString(logW + 2, battleH + 2, 'HP', COLORS.BRIGHT_WHITE, bg);
    const sGaugeW = Math.min(10, statusW - 12);
    for (let i = 0; i < sGaugeW; i++) {
      r.drawChar(logW + 5 + i, battleH + 2, i < Math.round(hpFrac * sGaugeW) ? '\u2588' : '\u2591',
        hpFrac < 0.25 ? COLORS.BRIGHT_RED : COLORS.BRIGHT_GREEN, bg);
    }
    r.drawString(logW + 6 + sGaugeW, battleH + 2, `${p.stats.hp}`, hpColor, bg);

    // MP gauge
    const mpFrac = p.stats.maxMana > 0 ? p.stats.mana / p.stats.maxMana : 0;
    r.drawString(logW + 2, battleH + 3, 'MP', COLORS.BRIGHT_WHITE, bg);
    for (let i = 0; i < sGaugeW; i++) {
      r.drawChar(logW + 5 + i, battleH + 3, i < Math.round(mpFrac * sGaugeW) ? '\u2588' : '\u2591',
        COLORS.BRIGHT_CYAN, bg);
    }
    r.drawString(logW + 6 + sGaugeW, battleH + 3, `${p.stats.mana}`, COLORS.BRIGHT_CYAN, bg);

    // Command window (bottom-right, FF-style action menu)
    const cmdY = battleH + statusBoxH;
    const cmdH = statusH - statusBoxH;
    r.drawBox(logW, cmdY, statusW, cmdH, COLORS.FF_BORDER, bg);

    // Build action list
    const actions = ['Attack', 'Flee'];
    if (p.abilities && p.abilities.length > 0) {
      for (let i = 0; i < Math.min(p.abilities.length, 3); i++) {
        actions.push(`${p.abilities[i].name}`);
      }
    }

    const combatSel = this.combatState.selectedAction || 0;
    for (let i = 0; i < actions.length && i < cmdH - 2; i++) {
      const sel = i === combatSel;
      const cursor = sel ? '\u25BA' : ' '; // ►
      r.drawString(logW + 2, cmdY + 1 + i, cursor + ' ' + actions[i],
        sel ? COLORS.BRIGHT_WHITE : COLORS.WHITE, bg);
      // Show MP cost for abilities
      if (i >= 2 && p.abilities[i - 2]) {
        const cost = `${p.abilities[i - 2].manaCost}`;
        r.drawString(logW + statusW - cost.length - 3, cmdY + 1 + i, cost, COLORS.BRIGHT_CYAN, bg);
      }
    }
  }

  // ─── GAME LOOP ───

  gameLoop(timestamp) {
    if (!this.running) return;

    const delta = timestamp - this.lastFrame;
    this.lastFrame = timestamp;

    // Advance real-time clock during gameplay states
    const gameplayStates = ['OVERWORLD', 'LOCATION', 'DUNGEON', 'DIALOGUE', 'SHOP', 'INVENTORY', 'CHARACTER', 'QUEST_LOG', 'MAP', 'COMBAT', 'QUEST_COMPASS'];
    const isGameplay = gameplayStates.includes(this.state);
    if (this.timeSystem) {
      this.timeSystem.setRealTimePaused(!isGameplay);
      if (isGameplay) {
        this.timeSystem.updateRealTime(timestamp);
      }
    }

    // Update glow system
    this.glow.update(delta / 1000);

    // Update cloud drift
    if (this.cloudSystem) {
      this.cloudSystem.update(delta / 1000, this.weatherSystem.current);
    }

    // Update transitions
    this.updateTransition();

    // Process queued input (block during transitions)
    if (this.transitionTimer <= 0) {
      const action = this.input.consumeAction();
      if (action) {
        this.handleInput(action);
      }
    } else {
      this.input.consumeAction(); // discard input during transitions
    }

    // Render (includes transition overlay and post-processing)
    this.render();

    // Auto-save periodically
    if (this.turnCount > 0 && this.turnCount % this.settings.autoSaveInterval === 0 && this.player) {
      this.saveGame();
    }

    requestAnimationFrame((ts) => this.gameLoop(ts));
  }

  start() {
    this.lastFrame = performance.now();
    this.setState('MENU');
    requestAnimationFrame((ts) => this.gameLoop(ts));
  }

  // ─── DEBUG PANEL ───

  toggleDebugPanel() {
    this._debugVisible = !this._debugVisible;
    if (!this._debugPanel) {
      this._initDebugPanel();
    }
    this._debugPanel.style.display = this._debugVisible ? 'block' : 'none';
    if (this._debugVisible) this._refreshDebugPanel();
  }

  _initDebugPanel() {
    const panel = document.createElement('div');
    panel.id = 'debug-panel';
    panel.innerHTML = `
      <div class="debug-header">DEBUG MENU <span class="debug-close">[X]</span></div>
      <div class="debug-section">
        <div class="debug-title">TIME & WEATHER</div>
        <label>Hour: <input type="range" id="dbg-hour" min="0" max="23" step="1" value="8"> <span id="dbg-hour-val">8</span></label>
        <button id="dbg-advance-day">Advance Day</button>
        <label>Weather: <select id="dbg-weather">
          <option value="">Auto</option>
          <option value="clear">Clear</option><option value="rain">Rain</option>
          <option value="storm">Storm</option><option value="fog">Fog</option>
          <option value="snow">Snow</option><option value="sandstorm">Sandstorm</option>
          <option value="acid_rain">Acid Rain</option><option value="coolant_mist">Coolant Mist</option>
          <option value="spore_fall">Spore Fall</option><option value="ember_rain">Ember Rain</option>
          <option value="data_storm">Data Storm</option><option value="nano_haze">Nano Haze</option>
          <option value="ion_storm">Ion Storm</option><option value="blood_rain">Blood Rain</option>
        </select></label>
      </div>
      <div class="debug-section">
        <div class="debug-title">PLAYER</div>
        <label><input type="checkbox" id="dbg-invincible"> Invincible</label>
        <label><input type="checkbox" id="dbg-no-encounters"> No Encounters</label>
        <label><input type="checkbox" id="dbg-infinite-attack"> Infinite Attack</label>
        <label><input type="checkbox" id="dbg-infinite-mana"> Infinite Mana</label>
        <button id="dbg-full-heal">Full Heal</button>
        <button id="dbg-give-xp">+100 XP</button>
        <button id="dbg-give-gold">+100 Gold</button>
        <button id="dbg-level-up">Level Up</button>
      </div>
      <div class="debug-section">
        <div class="debug-title">INVENTORY</div>
        <button id="dbg-give-torch">Give Torch</button>
        <button id="dbg-give-lantern">Give Lantern</button>
        <button id="dbg-give-weapon">Give Weapon</button>
        <button id="dbg-give-potion">Give Potion</button>
        <button id="dbg-give-scroll">Give Scroll</button>
        <button id="dbg-give-food">Give Food</button>
        <button id="dbg-give-helmet">Give Helmet</button>
        <button id="dbg-give-chest">Give Chestplate</button>
        <button id="dbg-give-gloves">Give Gloves</button>
        <button id="dbg-give-legs">Give Leggings</button>
        <button id="dbg-give-boots">Give Boots</button>
        <button id="dbg-give-shield">Give Shield</button>
        <button id="dbg-give-ring">Give Ring</button>
        <button id="dbg-give-amulet">Give Amulet</button>
        <button id="dbg-give-artifact">Give Artifact</button>
        <button id="dbg-clear-inv">Clear Inventory</button>
      </div>
      <div class="debug-section">
        <div class="debug-title">WORLD</div>
        <button id="dbg-reveal-map">Reveal Map</button>
        <label>Teleport X: <input type="number" id="dbg-tp-x" value="50" style="width:50px"></label>
        <label>Y: <input type="number" id="dbg-tp-y" value="30" style="width:50px"></label>
        <button id="dbg-teleport">Teleport</button>
      </div>
      <div class="debug-section">
        <div class="debug-title">VISUAL</div>
        <label><input type="checkbox" id="dbg-no-shadows"> Disable Shadows</label>
        <label><input type="checkbox" id="dbg-no-lighting"> Disable Lighting</label>
        <label><input type="checkbox" id="dbg-crt"> CRT Effects</label>
      </div>
      <div class="debug-section">
        <div class="debug-title">INFO</div>
        <div id="dbg-info" style="font-size:11px;color:#8f8;white-space:pre"></div>
      </div>
    `;
    document.body.appendChild(panel);
    this._debugPanel = panel;

    // Close button
    panel.querySelector('.debug-close').addEventListener('click', () => this.toggleDebugPanel());

    // Time controls
    const hourSlider = panel.querySelector('#dbg-hour');
    const hourVal = panel.querySelector('#dbg-hour-val');
    hourSlider.addEventListener('input', () => {
      const h = parseInt(hourSlider.value);
      hourVal.textContent = h;
      this.timeSystem.hour = h;
      this.debug.forceTimeOfDay = null;
    });
    panel.querySelector('#dbg-advance-day').addEventListener('click', () => {
      this.timeSystem.advance(24);
      hourSlider.value = this.timeSystem.hour;
      hourVal.textContent = this.timeSystem.hour;
    });
    panel.querySelector('#dbg-weather').addEventListener('change', (e) => {
      if (e.target.value) {
        this.weatherSystem.current = e.target.value;
        this.weatherSystem.intensity = 0.7;
        this.weatherSystem.duration = 999;
      } else {
        this.weatherSystem.duration = 0;
      }
    });

    // Player controls
    panel.querySelector('#dbg-invincible').addEventListener('change', (e) => {
      this.debug.invincible = e.target.checked;
    });
    panel.querySelector('#dbg-no-encounters').addEventListener('change', (e) => {
      this.debug.noEncounters = e.target.checked;
    });
    panel.querySelector('#dbg-infinite-attack').addEventListener('change', (e) => {
      this.debug.infiniteAttack = e.target.checked;
      if (this.player) this.player._debugInfiniteAttack = e.target.checked;
    });
    panel.querySelector('#dbg-infinite-mana').addEventListener('change', (e) => {
      this.debug.infiniteMana = e.target.checked;
    });
    panel.querySelector('#dbg-full-heal').addEventListener('click', () => {
      if (this.player) {
        this.player.stats.hp = this.player.stats.maxHp;
        this.player.stats.mana = this.player.stats.maxMana;
      }
    });
    panel.querySelector('#dbg-give-xp').addEventListener('click', () => {
      if (this.player) {
        const leveled = this.player.addXP(100);
        if (leveled.length) this.ui.addMessage(`[DEBUG] Level up! Lv ${leveled[leveled.length - 1]}`, COLORS.BRIGHT_YELLOW);
      }
    });
    panel.querySelector('#dbg-give-gold').addEventListener('click', () => {
      if (this.player) this.player.gold += 100;
    });
    panel.querySelector('#dbg-level-up').addEventListener('click', () => {
      if (this.player) {
        const needed = this.player.stats.xpToNext - this.player.stats.xp;
        this.player.addXP(needed);
      }
    });

    // Inventory controls
    panel.querySelector('#dbg-give-torch').addEventListener('click', () => {
      if (this.player) this.player.addItem(this.itemGen.generate(this.rng, 'light', 'common'));
    });
    panel.querySelector('#dbg-give-lantern').addEventListener('click', () => {
      if (this.player) this.player.addItem(this.itemGen.generate(this.rng, 'light', 'uncommon'));
    });
    panel.querySelector('#dbg-give-weapon').addEventListener('click', () => {
      if (this.player) this.player.addItem(this.itemGen.generate(this.rng, 'weapon', 'rare', 5));
    });
    panel.querySelector('#dbg-give-potion').addEventListener('click', () => {
      if (this.player) this.player.addItem(this.itemGen.generate(this.rng, 'potion', 'uncommon'));
    });
    panel.querySelector('#dbg-give-scroll').addEventListener('click', () => {
      if (this.player) this.player.addItem(this.itemGen.generate(this.rng, 'scroll', 'rare', 5));
    });
    panel.querySelector('#dbg-give-food').addEventListener('click', () => {
      if (this.player) this.player.addItem(this.itemGen.generate(this.rng, 'food', 'common'));
    });
    // Armor helpers — generate armor then override subtype to the desired piece
    const ARMOR_SUBTYPES = {
      helmet: { char: '^', name: 'Helmet' }, chestplate: { char: '[', name: 'Chestplate' },
      gloves: { char: '{', name: 'Gloves' }, leggings: { char: '=', name: 'Leggings' },
      boots: { char: '_', name: 'Boots' }, shield: { char: ']', name: 'Shield' },
    };
    const giveArmor = (subtypeKey) => {
      if (!this.player) return;
      const item = this.itemGen.generate(this.rng, 'armor', 'rare', 5);
      const st = ARMOR_SUBTYPES[subtypeKey];
      item.name = item.name.replace(/Helmet|Chestplate|Gloves|Leggings|Boots|Shield/, st.name);
      item.subtype = subtypeKey;
      item.char = st.char;
      this.player.addItem(item);
    };
    panel.querySelector('#dbg-give-helmet').addEventListener('click', () => giveArmor('helmet'));
    panel.querySelector('#dbg-give-chest').addEventListener('click', () => giveArmor('chestplate'));
    panel.querySelector('#dbg-give-gloves').addEventListener('click', () => giveArmor('gloves'));
    panel.querySelector('#dbg-give-legs').addEventListener('click', () => giveArmor('leggings'));
    panel.querySelector('#dbg-give-boots').addEventListener('click', () => giveArmor('boots'));
    panel.querySelector('#dbg-give-shield').addEventListener('click', () => giveArmor('shield'));
    panel.querySelector('#dbg-give-ring').addEventListener('click', () => {
      if (this.player) this.player.addItem(this.itemGen.generate(this.rng, 'ring', 'rare', 5));
    });
    panel.querySelector('#dbg-give-amulet').addEventListener('click', () => {
      if (this.player) this.player.addItem(this.itemGen.generate(this.rng, 'amulet', 'rare', 5));
    });
    panel.querySelector('#dbg-give-artifact').addEventListener('click', () => {
      if (this.player) this.player.addItem(this.itemGen.generate(this.rng, 'artifact', 'rare', 5));
    });
    panel.querySelector('#dbg-clear-inv').addEventListener('click', () => {
      if (this.player) this.player.inventory = [];
    });

    // World controls
    panel.querySelector('#dbg-reveal-map').addEventListener('click', () => {
      if (this.overworld) {
        for (const loc of this.overworld.getLoadedLocations()) {
          this.player.knownLocations.add(loc.id);
        }
        this.debug.revealMap = true;
      }
    });
    panel.querySelector('#dbg-teleport').addEventListener('click', () => {
      if (this.player) {
        const x = parseInt(panel.querySelector('#dbg-tp-x').value) || 0;
        const y = parseInt(panel.querySelector('#dbg-tp-y').value) || 0;
        this.player.position.x = x;
        this.player.position.y = y;
        if (this.overworld) this.overworld.ensureChunksAround(x, y);
        this.camera.follow(this.player);
      }
    });

    // Visual controls
    panel.querySelector('#dbg-no-shadows').addEventListener('change', (e) => {
      this.debug.disableShadows = e.target.checked;
    });
    panel.querySelector('#dbg-no-lighting').addEventListener('change', (e) => {
      this.debug.disableLighting = e.target.checked;
    });
    panel.querySelector('#dbg-crt').addEventListener('change', (e) => {
      this.renderer.enableCRT = e.target.checked;
      this.settings.crtEffects = e.target.checked;
    });

    // Update info periodically
    this._debugInfoInterval = setInterval(() => {
      if (this._debugVisible) this._refreshDebugPanel();
    }, 500);
  }

  _refreshDebugPanel() {
    const info = this._debugPanel?.querySelector('#dbg-info');
    if (!info) return;
    const p = this.player;
    const t = this.timeSystem;
    const lines = [
      `State: ${this.state}`,
      `Turn: ${this.turnCount}`,
      `Time: ${t.getTimeString()} (${t.getTimeOfDay()})`,
      `Weather: ${this.weatherSystem.current}`,
    ];
    if (p) {
      lines.push(`Pos: (${p.position.x}, ${p.position.y})`);
      lines.push(`HP: ${p.stats.hp}/${p.stats.maxHp} MP: ${p.stats.mana}/${p.stats.maxMana}`);
      lines.push(`Lv: ${p.stats.level} XP: ${p.stats.xp}/${p.stats.xpToNext}`);
      lines.push(`Gold: ${p.gold} Items: ${p.inventory.length}/20`);
      lines.push(`Light: ${p.hasLightSource().hasLight ? p.hasLightSource().type : 'none'}`);
    }
    lines.push(`Invincible: ${this.debug.invincible}`);
    lines.push(`No Encounters: ${this.debug.noEncounters}`);
    lines.push(`Inf Attack: ${this.debug.infiniteAttack}`);
    lines.push(`Inf Mana: ${this.debug.infiniteMana}`);
    info.textContent = lines.join('\n');
  }
}

// ─── BOOTSTRAP ───

window.addEventListener('DOMContentLoaded', () => {
  const game = new Game();
  game.start();
});
