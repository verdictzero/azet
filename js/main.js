import { COLORS, Renderer, Camera, InputManager, ParticleSystem } from './engine.js';
import { SeededRNG, PerlinNoise, AStar, distance, bresenhamLine } from './utils.js';
import { OverworldGenerator, SettlementGenerator, BuildingInterior, DungeonGenerator, TowerGenerator, RuinGenerator } from './world.js';
import { NameGenerator, NPCGenerator, DialogueSystem, LoreGenerator, Player, ItemGenerator, CreatureGenerator } from './entities.js';
import { CombatSystem, QuestSystem, ShopSystem, FactionSystem, TimeSystem, InventorySystem, EventSystem, WeatherSystem } from './systems.js';
import { UIManager } from './ui.js';

// ═══════════════════════════════════════════
//  GAME - Main controller
// ═══════════════════════════════════════════

class Game {
  constructor() {
    this.canvas = document.getElementById('game-canvas');
    this.renderer = new Renderer(this.canvas);
    this.input = new InputManager();
    this.camera = new Camera(this.renderer.cols, this.renderer.rows - 7);
    this.ui = new UIManager(this.renderer);

    // Game state
    this.state = 'MENU'; // MENU, CHAR_CREATE, LOADING, OVERWORLD, LOCATION, DUNGEON, DIALOGUE, SHOP, INVENTORY, CHARACTER, QUEST_LOG, MAP, HELP, SETTINGS, GAME_OVER, COMBAT

    // Settings (persisted to localStorage)
    this.settings = {
      crtEffects: true,
      fontSize: 16,
      touchControls: true,
      autoSaveInterval: 100, // turns
    };
    this._loadSettings();
    this.prevState = null;
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
    this.charGenState = { step: 'race', race: null, playerClass: null, name: '' };

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
    this.camera.viewportCols = this.renderer.cols;
    this.camera.viewportRows = this.renderer.rows - 7;
  }

  // ─── STATE MANAGEMENT ───

  setState(newState) {
    this.prevState = this.state;
    this.state = newState;
    this.ui.resetSelection();
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
    this.ui.drawLoading('Generating world...');
    this.renderer.endFrame();
    this.renderer.postProcess();

    setTimeout(() => {
      this.seed = Date.now();
      this.rng = new SeededRNG(this.seed);

      // Generate overworld
      this.overworld = this.overworldGen.generate(this.seed);

      // Generate world events
      this.eventSystem.generateWorldEvents(this.overworld);

      // Generate lore
      const factionNames = Object.values(this.factionSystem.factions).map(f => f.name);
      const locationNames = this.overworld.locations.map(l => l.name);
      this.worldLore = this.loreGen.generateWorldHistory(this.rng, factionNames, locationNames);

      // Create player
      const race = this.charGenState.race || 'human';
      const pClass = this.charGenState.playerClass || 'warrior';
      const name = this.charGenState.name || 'Adventurer';
      this.player = new Player(name, race, pClass);

      // Find starting location (first village)
      const startLoc = this.overworld.locations.find(l => l.type === 'village') || this.overworld.locations[0];
      if (startLoc) {
        this.player.position.x = startLoc.x;
        this.player.position.y = startLoc.y;
        this.player.knownLocations = new Set([startLoc.id]);
        this.gameContext.currentLocationName = startLoc.name;
        this.gameContext.currentLocation = startLoc;
      }

      this.camera.follow(this.player);
      this.camera.x = this.player.position.x - Math.floor(this.renderer.cols / 2);
      this.camera.y = this.player.position.y - Math.floor(this.renderer.rows / 2);
      this.camera.targetX = this.camera.x;
      this.camera.targetY = this.camera.y;

      // Enter the starting location
      if (startLoc) {
        this.enterLocation(startLoc);
      } else {
        this.setState('OVERWORLD');
      }

      this.ui.addMessage('Welcome to ASCIIQUEST!', COLORS.BRIGHT_YELLOW);
      this.ui.addMessage(`${this.player.name} the ${this.player.race} ${this.player.playerClass} begins their journey.`, COLORS.BRIGHT_CYAN);
      this.ui.addMessage('Press ? for help.', COLORS.BRIGHT_BLACK);
    }, 100);
  }

  enterLocation(location) {
    const locRng = new SeededRNG(this.seed + location.id.charCodeAt(0) * 1000);
    this.currentSettlement = this.settlementGen.generate(locRng, location.type, location.population || 10, 'plains');
    this.currentSettlement.name = location.name;
    this.currentSettlement.locationData = location;

    // Generate NPCs for this location
    this.npcs = [];
    if (this.currentSettlement.npcSlots) {
      for (const slot of this.currentSettlement.npcSlots) {
        const race = locRng.random(['human', 'human', 'human', 'elf', 'dwarf', 'halfling']);
        const npc = this.npcGen.generate(locRng, slot.role, race, { location: location.name });
        npc.position = { x: slot.position.x, y: slot.position.y };
        this.npcs.push(npc);
      }
    }

    // Place player at entrance
    this.player.position.x = Math.floor((this.currentSettlement.tiles[0] || []).length / 2);
    this.player.position.y = (this.currentSettlement.tiles || []).length - 2;

    this.gameContext.currentLocationName = location.name;
    this.gameContext.currentLocation = location;
    this.setState('LOCATION');
    this.ui.addMessage(`You arrive at ${location.name}.`, COLORS.BRIGHT_GREEN);

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
    const towerRng = new SeededRNG(this.seed + (location.id ? location.id.charCodeAt(0) : 0) * 4000);
    const purpose = towerRng.random(['wizard', 'dark', 'military']);
    const floors = towerRng.nextInt(5, 10);
    this.currentTower = this.towerGen.generate(towerRng, floors, purpose);
    this.currentFloor = 0;
    this.currentDungeon = this.currentTower[0];

    // Spawn enemies from tower entities
    this.enemies = [];
    if (this.currentDungeon.entities) {
      for (const ent of this.currentDungeon.entities) {
        const creature = this.creatureGen.generate(towerRng, 'dungeon', this.currentFloor + 1, this.player.stats.level);
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
    this.ui.addMessage(`You enter the tower...`, COLORS.BRIGHT_MAGENTA);
  }

  enterRuin(location) {
    const ruinRng = new SeededRNG(this.seed + (location.id ? location.id.charCodeAt(0) : 0) * 5000);
    const ruin = this.ruinGen.generate(ruinRng, 'settlement', ruinRng.nextInt(50, 90));
    this.currentDungeon = ruin;
    this.currentFloor = 0;
    this.currentTower = null;

    // Spawn enemies in ruins
    this.enemies = [];
    const enemyCount = ruinRng.nextInt(3, 8);
    for (let i = 0; i < enemyCount; i++) {
      const creature = this.creatureGen.generate(ruinRng, 'crypt', 1, this.player.stats.level);
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
    const dungRng = new SeededRNG(this.seed + (location.id ? location.id.charCodeAt(0) : 0) * 2000);
    this.currentFloor = 0;
    const dungeon = this.dungeonGen.generate(dungRng, 60, 40, 1, 'standard');
    this.currentDungeon = dungeon;

    // Spawn enemies using CreatureGenerator
    this.enemies = [];
    const biome = this.gameContext.currentLocation?.biome || 'dungeon';
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
    this.ui.addMessage('You descend into the dungeon...', COLORS.BRIGHT_RED);
  }

  // ─── INPUT HANDLING ───

  handleInput(key) {
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
      case 'QUEST_LOG': return this.handleGenericClose(key);
      case 'MAP': return this.handleGenericClose(key);
      case 'HELP': return this.handleGenericClose(key);
      case 'FACTION': return this.handleGenericClose(key);
      case 'SETTINGS': return this.handleSettingsInput(key);
      case 'GAME_OVER': return this.handleGameOverInput(key);
      case 'COMBAT': return this.handleCombatInput(key);
    }
  }

  handleMenuInput(key) {
    const result = this.ui.handleMenuInput(key, 4);
    if (result === 'select') {
      switch (this.ui.selectedIndex) {
        case 0: // New Game
          this.charGenState = { step: 'race', race: null, playerClass: null, name: '' };
          this.ui.resetSelection();
          this.setState('CHAR_CREATE');
          break;
        case 1: // Continue
          if (this.loadGame()) {
            this.ui.addMessage('Game loaded.', COLORS.BRIGHT_GREEN);
          } else {
            this.ui.addMessage('No save found.', COLORS.BRIGHT_RED);
          }
          break;
        case 2: // Settings (placeholder)
          this.ui.addMessage('Settings coming soon.', COLORS.BRIGHT_BLACK);
          break;
        case 3: // Help
          this.setState('HELP');
          break;
      }
    }
  }

  handleCharCreateInput(key) {
    const step = this.charGenState.step;

    if (step === 'name') {
      if (key === 'Enter' && this.charGenState.name.length > 0) {
        this.charGenState.step = 'confirm';
        return;
      }
      if (key === 'Backspace') {
        this.charGenState.name = this.charGenState.name.slice(0, -1);
        return;
      }
      if (key === 'Escape') {
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

    if (step === 'confirm') {
      if (key === 'Enter') {
        this.startNewGame();
        return;
      }
      if (key === 'Escape') {
        this.charGenState = { step: 'race', race: null, playerClass: null, name: '' };
        this.ui.resetSelection();
        return;
      }
      return;
    }

    const races = ['human', 'elf', 'dwarf', 'orc', 'halfling'];
    const classes = ['warrior', 'mage', 'rogue', 'ranger'];
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
    if (key === '?') { this.setState('HELP'); return; }
    if (key === 'o' || key === 'O') { this.setState('SETTINGS'); return; }
    if (key === 'p' || key === 'P') { this.saveGame(); return; }

    // Movement
    const dir = this.getDirection(key);
    if (dir) {
      this.movePlayer(dir.dx, dir.dy);
    }

    // Enter location
    if (key === 'Enter' || key === 'e' || key === 'E') {
      const loc = this.overworld.getLocation(this.player.position.x, this.player.position.y);
      if (loc) {
        this.startTransition(() => {
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
    if (key === '?') { this.setState('HELP'); return; }
    if (key === 'o' || key === 'O') { this.setState('SETTINGS'); return; }
    if (key === 'p' || key === 'P') { this.saveGame(); return; }

    if (key === 'Escape') {
      // Leave location back to overworld
      if (this.gameContext.currentLocation) {
        this.player.position.x = this.gameContext.currentLocation.x;
        this.player.position.y = this.gameContext.currentLocation.y;
      }
      this.currentSettlement = null;
      this.npcs = [];
      this.setState('OVERWORLD');
      this.ui.addMessage('You leave the settlement.', COLORS.WHITE);
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
    if (key === '?') { this.setState('HELP'); return; }
    if (key === 'o' || key === 'O') { this.setState('SETTINGS'); return; }

    if (key === 'Escape') {
      this.currentDungeon = null;
      this.enemies = [];
      this.items = [];
      if (this.gameContext.currentLocation) {
        this.player.position.x = this.gameContext.currentLocation.x;
        this.player.position.y = this.gameContext.currentLocation.y;
      }
      this.setState('OVERWORLD');
      this.ui.addMessage('You escape the dungeon.', COLORS.WHITE);
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
                  const creature = this.creatureGen.generate(floorRng, 'dungeon', this.currentFloor + 1, this.player.stats.level);
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
              this.ui.addMessage('You have reached the top of the tower!', COLORS.BRIGHT_YELLOW);
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
            const biome = this.gameContext.currentLocation?.biome || 'dungeon';
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

    // Letter shortcuts (A, B, C, D)
    const letterIndex = key.toUpperCase().charCodeAt(0) - 65;
    if (letterIndex >= 0 && letterIndex < options.length) {
      this.ui.selectedIndex = letterIndex;
      this.selectDialogueOption(letterIndex);
      return;
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
        this.ui.addMessage('The priest heals your wounds.', COLORS.BRIGHT_GREEN);
      } else {
        this.ui.addMessage('You don\'t have enough gold for healing.', COLORS.BRIGHT_RED);
      }
      return;
    }

    if (option.action === 'rest' && this.activeNPC) {
      const cost = 5;
      if (this.player.gold >= cost) {
        this.player.gold -= cost;
        this.player.heal(this.player.stats.maxHp);
        this.player.stats.mana = this.player.stats.maxMana;
        this.timeSystem.advance(8);
        this.ui.addMessage('You rest at the inn. Fully restored!', COLORS.BRIGHT_GREEN);
      } else {
        this.ui.addMessage('You can\'t afford a room.', COLORS.BRIGHT_RED);
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
      this.ui.addMessage('The scholar shares some knowledge. +10 XP.', COLORS.BRIGHT_CYAN);
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
        // Find a rival faction
        const factionIds = ['TOWN_GUARD', 'MERCHANTS_GUILD', 'TEMPLE_ORDER', 'THIEVES_GUILD', 'NOBILITY'];
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
        this.ui.dialogueState.text = `"${gossip}"`;
        this.ui.dialogueState.options = [
          { text: 'I see. Anything else?', action: 'rumor' },
          { text: 'Thanks.', action: 'close' },
        ];
        this.ui.resetSelection();
      }
      return;
    }

    if (option.action === 'turnInQuest') {
      if (option.questId) {
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

  handleCombatInput(key) {
    if (!this.combatState) return;

    if (key === 'a' || key === 'A' || key === 'Enter') {
      // Attack - combat system already handles damage application via resolveRound
      const result = this.combat.resolveRound(this.player, this.combatState.enemy);
      for (const msg of result.messages) {
        this.ui.addMessage(msg, COLORS.BRIGHT_RED);
      }

      if (result.battleOver) {
        if (result.winner === 'player') {
          const deadEnemy = this.combatState.enemy;
          const xp = this.combat.calculateXPReward(deadEnemy);
          const leveled = this.player.addXP(xp);
          const loot = this.combat.calculateLoot(this.rng, deadEnemy, this.currentFloor);
          for (const item of loot) {
            if (item.type === 'gold') {
              this.player.gold += item.amount;
              this.ui.addMessage(`Found ${item.amount} gold!`, COLORS.BRIGHT_YELLOW);
            } else {
              this.player.addItem(item);
              this.ui.addMessage(`Found ${item.name}!`, COLORS.BRIGHT_GREEN);
            }
          }
          this.ui.addMessage(`Gained ${xp} XP!`, COLORS.BRIGHT_CYAN);

          // Level-up effects
          if (leveled.length > 0) {
            this.ui.addMessage(`LEVEL UP! You are now level ${leveled[leveled.length - 1]}!`, COLORS.BRIGHT_YELLOW);
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
            // Killing monsters/bandits boosts town guard and merchants
            if (deadEnemy.faction === 'MONSTER_HORDE' || deadEnemy.faction === 'BANDITS') {
              this.factionSystem.modifyPlayerStanding('TOWN_GUARD', 2);
              this.factionSystem.modifyPlayerStanding('MERCHANTS_GUILD', 1);
            }
            if (deadEnemy.faction === 'UNDEAD') {
              this.factionSystem.modifyPlayerStanding('TEMPLE_ORDER', 3);
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

    // Ability usage (1, 2, 3)
    const abilityIdx = parseInt(key) - 1;
    if (abilityIdx >= 0 && abilityIdx < (this.player.abilities?.length || 0)) {
      const ability = this.player.abilities[abilityIdx];
      if (this.player.stats.mana >= ability.manaCost) {
        this.player.stats.mana -= ability.manaCost;
        const enemy = this.combatState.enemy;

        if (ability.type === 'heal') {
          const healAmount = ability.damage || 15;
          this.player.heal(healAmount);
          this.ui.addMessage(`${ability.name}! Restored ${healAmount} HP.`, COLORS.BRIGHT_GREEN);
        } else if (ability.damage > 0) {
          const damage = ability.damage + Math.floor(this.player.stats.int / 3);
          enemy.stats.hp -= damage;
          this.ui.addMessage(`${ability.name}! ${damage} damage to ${enemy.name}!`, COLORS.BRIGHT_MAGENTA);
          this.renderer.flash('#FF4400', 0.3);
          this.particles.emit(enemy.position.x, enemy.position.y, '*', COLORS.BRIGHT_MAGENTA, 5, 3, 10);
        } else if (ability.type === 'buff') {
          this.addStatusEffect('shielded', 5, { defenseBoost: 5 });
          this.ui.addMessage(`${ability.name}! Defense boosted!`, COLORS.BRIGHT_CYAN);
        } else {
          this.ui.addMessage(`Used ${ability.name}!`, COLORS.BRIGHT_CYAN);
        }

        // Check if enemy died
        if (enemy.stats.hp <= 0) {
          this.ui.addMessage(`${enemy.name} has been defeated!`, COLORS.BRIGHT_GREEN);
          // Reuse the combat victory code path
          const xp = this.combat.calculateXPReward(enemy);
          const leveled = this.player.addXP(xp);
          this.ui.addMessage(`Gained ${xp} XP!`, COLORS.BRIGHT_CYAN);
          if (leveled.length > 0) {
            this.ui.addMessage(`LEVEL UP! Level ${leveled[leveled.length - 1]}!`, COLORS.BRIGHT_YELLOW);
            this.renderer.flash('#FFFF00', 0.5);
          }
          this.enemies = this.enemies.filter(e => e !== enemy);
          this.combatState = null;
          this.setState(this.prevState || 'DUNGEON');
          return;
        }

        // Enemy counter-attack
        const counterResult = this.combat.calculateAttack(enemy, this.player);
        if (counterResult.hit) {
          this.player.stats.hp -= counterResult.damage;
          this.ui.addMessage(counterResult.message, COLORS.BRIGHT_RED);
          if (this.player.isDead()) {
            this.setState('GAME_OVER');
            return;
          }
        }
      } else {
        this.ui.addMessage(`Not enough mana! Need ${ability.manaCost} MP.`, COLORS.BRIGHT_RED);
      }
      return;
    }

    if (key === 'f' || key === 'F') {
      // Flee attempt
      if (this.rng.chance(0.5)) {
        this.ui.addMessage('You flee from combat!', COLORS.BRIGHT_YELLOW);
        this.combatState = null;
        this.setState(this.prevState || 'DUNGEON');
      } else {
        this.ui.addMessage('Failed to flee!', COLORS.BRIGHT_RED);
        // Enemy gets free attack
        const result = this.combat.calculateAttack(this.combatState.enemy, this.player);
        if (result.hit) {
          // Combat system already calculates defense mitigation, apply raw
          this.player.stats.hp -= result.damage;
          this.ui.addMessage(result.message, COLORS.BRIGHT_RED);
        }
        if (this.player.isDead()) {
          this.setState('GAME_OVER');
        }
      }
    }
  }

  handleGenericClose(key) {
    if (key === 'Escape') {
      this.setState(this.prevState || 'OVERWORLD');
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
    if (!this.overworld || !this.overworld.tiles) return;

    const nx = this.player.position.x + dx;
    const ny = this.player.position.y + dy;

    if (ny < 0 || ny >= this.overworld.tiles.length) return;
    if (nx < 0 || nx >= this.overworld.tiles[0].length) return;

    const tile = this.overworld.tiles[ny][nx];
    if (!tile.walkable) {
      this.ui.addMessage('You can\'t go that way.', COLORS.BRIGHT_BLACK);
      return;
    }

    this.player.position.x = nx;
    this.player.position.y = ny;
    this.turnCount++;
    this.timeSystem.advance(0.5);

    // Check for location
    const loc = this.overworld.getLocation(nx, ny);
    if (loc && !this.player.knownLocations.has(loc.id)) {
      this.player.knownLocations.add(loc.id);
      this.ui.addMessage(`Discovered: ${loc.name}! (Press Enter to visit)`, COLORS.BRIGHT_YELLOW);
    }

    // Random encounter on overworld (modified by events and weather)
    const baseEncounterRate = 0.03 * this.activeEffects.encounterRateMultiplier;
    const nightBonus = this.timeSystem.isDaytime() ? 1.0 : 1.5;
    if (this.rng.chance(baseEncounterRate * nightBonus)) {
      const tileBiome = tile.biome || 'forest';
      const enemy = this.creatureGen.generate(this.rng, tileBiome, 1, this.player.stats.level);
      enemy.position = { x: nx, y: ny };

      // Undead strength boost during eclipse
      if (enemy.faction === 'UNDEAD') {
        enemy.stats.attack = Math.round(enemy.stats.attack * this.activeEffects.undeadStrengthMultiplier);
        enemy.stats.hp = Math.round(enemy.stats.hp * this.activeEffects.undeadStrengthMultiplier);
        enemy.stats.maxHp = enemy.stats.hp;
      }

      this.combatState = { enemy };
      this.ui.addMessage(`A ${enemy.name} attacks!`, COLORS.BRIGHT_RED);
      this.setState('COMBAT');
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
  applyEventEffects(event) {
    switch (event.type) {
      case 'FESTIVAL':
        this.activeEffects.shopPriceMultiplier = event.data.priceModifier || 0.7;
        this.ui.addMessage('Festival prices! Shops are offering discounts.', COLORS.BRIGHT_GREEN);
        break;
      case 'PLAGUE':
        this.activeEffects.potionPriceMultiplier = event.data.healingItemDemand || 3.0;
        this.ui.addMessage('Healing supplies are in high demand!', COLORS.BRIGHT_RED);
        break;
      case 'MONSTER_OUTBREAK':
        this.activeEffects.encounterRateMultiplier = 2.0;
        this.ui.addMessage('Monsters are more aggressive than usual!', COLORS.BRIGHT_RED);
        break;
      case 'ECLIPSE':
        this.activeEffects.undeadStrengthMultiplier = event.data.undeadStrengthBonus || 1.5;
        this.ui.addMessage('The undead grow stronger in the darkness!', COLORS.BRIGHT_MAGENTA);
        break;
      case 'CARAVAN_ARRIVES':
        this.ui.addMessage(`${event.data.merchantName} has rare goods for sale!`, COLORS.BRIGHT_GREEN);
        break;
      case 'BANDIT_RAID':
        this.factionSystem.modifyPlayerStanding('BANDITS', -10);
        this.ui.addMessage('Defend the settlement from bandits!', COLORS.BRIGHT_RED);
        break;
      case 'TREASURE_MAP':
        // Auto-generate a quest
        const mapQuest = {
          id: 'treasure_' + Date.now(),
          title: `Treasure at ${event.data.location}`,
          description: `Follow the treasure map to ${event.data.location} and find the hidden cache.`,
          type: 'FETCH',
          status: 'active',
          objectives: [{ type: 'explore', target: event.data.location, current: 0, required: 1, description: `Find the treasure at ${event.data.location}` }],
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
    this.timeSystem.advance(0.1);

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
      this.combatState = { enemy: enemyAt };
      this.ui.addMessage(`You engage a ${enemyAt.name}!`, COLORS.BRIGHT_RED);
      this.setState('COMBAT');
      return;
    }

    this.player.position.x = nx;
    this.player.position.y = ny;
    this.turnCount++;
    this.timeSystem.advance(0.1);

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
          if (result.hit) {
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
        this.ui.addMessage(`The scroll erupts with ${effect.type || 'magical'} energy!`, COLORS.BRIGHT_MAGENTA);
      } else {
        this.ui.addMessage(`Used ${item.name}.`, COLORS.BRIGHT_CYAN);
      }
      this.player.removeItem(item.id);
    }
  }

  // ─── SETTINGS ───

  _loadSettings() {
    try {
      const raw = localStorage.getItem('asciiquest_settings');
      if (raw) {
        const saved = JSON.parse(raw);
        Object.assign(this.settings, saved);
      }
    } catch (e) { /* ignore */ }
    // Apply loaded settings to renderer/input (may be called before they exist in constructor)
    if (this.renderer) this.renderer.enableCRT = this.settings.crtEffects;
    if (this.input) this.input.enableTouch = this.settings.touchControls;
  }

  _saveSettings() {
    try {
      localStorage.setItem('asciiquest_settings', JSON.stringify(this.settings));
    } catch (e) { /* ignore */ }
    // Apply settings immediately
    this.renderer.enableCRT = this.settings.crtEffects;
    this.input.enableTouch = this.settings.touchControls;
  }

  // ─── SAVE/LOAD ───

  saveGame(slot = 1) {
    try {
      const saveData = {
        version: 2,
        seed: this.seed,
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
        state: this.state
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

      // Regenerate world from seed
      this.overworld = this.overworldGen.generate(this.seed);
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
        this.ui.drawLoading('Generating world...');
        break;

      case 'OVERWORLD':
        this.renderOverworld();
        this.ui.drawHUD(this.player, this.timeSystem, this.gameContext, this.statusEffects, this.weatherSystem);
        break;

      case 'LOCATION':
        this.ui.drawLocationOverview(this.currentSettlement, this.npcs, this.player);
        this.ui.drawHUD(this.player, this.timeSystem, this.gameContext, this.statusEffects, this.weatherSystem);
        break;

      case 'DUNGEON':
        this.renderDungeon();
        this.ui.drawHUD(this.player, this.timeSystem, this.gameContext, this.statusEffects, this.weatherSystem);
        this.ui.drawMinimap(this.renderer, this.currentDungeon, this.player, this.enemies);
        break;

      case 'DIALOGUE':
        // Render background
        if (this.currentSettlement) {
          this.ui.drawLocationOverview(this.currentSettlement, this.npcs, this.player);
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
        this.ui.drawQuestLog(this.questSystem);
        break;

      case 'MAP':
        this.ui.drawMapView(this.overworld, this.player, this.player?.knownLocations);
        break;

      case 'HELP':
        this.ui.drawHelp();
        break;

      case 'GAME_OVER':
        this.ui.drawGameOver(this.player, 'Slain in battle.');
        break;

      case 'FACTION':
        this.ui.drawFactionPanel(this.factionSystem);
        break;

      case 'COMBAT':
        this.renderCombat();
        break;

      case 'SETTINGS':
        this.ui.drawSettings(this.settings);
        break;
    }

    this.renderer.endFrame();
    this.renderer.postProcess();

    // Day/night tint (only in game states)
    if (this.state === 'OVERWORLD' || this.state === 'LOCATION' || this.state === 'DUNGEON') {
      this.renderer.applyDayNightTint(this.timeSystem.getTimeOfDay());
    }

    // Flash overlay
    this.renderer.applyFlash();
  }

  renderOverworld() {
    if (!this.overworld || !this.overworld.tiles) return;

    const r = this.renderer;
    this.camera.update();
    const cols = r.cols;
    const rows = r.rows - 7; // Leave room for HUD

    for (let sy = 0; sy < rows; sy++) {
      for (let sx = 0; sx < cols; sx++) {
        const wx = Math.floor(this.camera.x) + sx;
        const wy = Math.floor(this.camera.y) + sy;

        if (wy >= 0 && wy < this.overworld.tiles.length &&
          wx >= 0 && wx < this.overworld.tiles[0].length) {
          const tile = this.overworld.tiles[wy][wx];

          // Fog of war (simple: darken tiles far from player)
          const dist = distance(wx, wy, this.player.position.x, this.player.position.y);
          // Animated color for water/lava/fire tiles
          const fg = r.getAnimatedColor(tile.fg, tile.type);
          if (dist > 30) {
            r.drawChar(sx, sy, tile.char, COLORS.BRIGHT_BLACK, COLORS.BLACK);
          } else {
            r.drawChar(sx, sy, tile.char, fg, tile.bg || COLORS.BLACK);
          }
        } else {
          r.drawChar(sx, sy, ' ', COLORS.BLACK, COLORS.BLACK);
        }
      }
    }

    // Draw locations
    if (this.overworld.locations) {
      for (const loc of this.overworld.locations) {
        const sx = loc.x - Math.floor(this.camera.x);
        const sy = loc.y - Math.floor(this.camera.y);
        if (sx >= 0 && sx < cols && sy >= 0 && sy < rows) {
          const ch = loc.type === 'city' ? '▣' : loc.type === 'town' ? '□' :
            loc.type === 'village' ? '○' : loc.type === 'dungeon' ? '▼' :
              loc.type === 'castle' ? '♦' : loc.type === 'temple' ? '†' :
                loc.type === 'ruins' ? '▪' : loc.type === 'tower' ? '▲' : '◦';
          r.drawChar(sx, sy, ch, COLORS.BRIGHT_WHITE);
        }
      }
    }

    // Draw player
    const px = this.player.position.x - Math.floor(this.camera.x);
    const py = this.player.position.y - Math.floor(this.camera.y);
    if (px >= 0 && px < cols && py >= 0 && py < rows) {
      r.drawChar(px, py, '@', COLORS.BRIGHT_YELLOW);
    }

    // Render weather particles on overworld
    const weatherEffect = this.weatherSystem.getVisualEffect();
    if (weatherEffect) {
      for (let sy = 0; sy < rows; sy++) {
        for (let sx = 0; sx < cols; sx++) {
          if (Math.random() < weatherEffect.density) {
            r.drawChar(sx, sy, weatherEffect.char, weatherEffect.fg);
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
    const cols = r.cols;
    const rows = r.rows - 7;

    // Center on player
    const offsetX = this.player.position.x - Math.floor(cols / 2);
    const offsetY = this.player.position.y - Math.floor(rows / 2);

    // FOV - bresenham raycasting for accurate visible tiles
    const visible = new Set();
    const weatherMod = this.weatherSystem.getFOVModifier();
    const nightMod = this.timeSystem.isDaytime() ? 1.0 : 0.7;
    const viewDist = Math.max(4, Math.round(10 * weatherMod * nightMod));
    const px = this.player.position.x;
    const py = this.player.position.y;
    // Cast rays to perimeter points using bresenhamLine
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
          if (this.currentDungeon.tiles[pt.y]?.[pt.x] && !this.currentDungeon.tiles[pt.y][pt.x].walkable) {
            break; // Wall blocks LOS
          }
        }
      }
    }

    for (let sy = 0; sy < rows; sy++) {
      for (let sx = 0; sx < cols; sx++) {
        const wx = offsetX + sx;
        const wy = offsetY + sy;

        if (wy >= 0 && wy < this.currentDungeon.tiles.length &&
          wx >= 0 && wx < this.currentDungeon.tiles[0].length) {
          const tile = this.currentDungeon.tiles[wy][wx];
          const isVisible = visible.has(`${wx},${wy}`);

          if (isVisible) {
            const animFg = r.getAnimatedColor(tile.fg, tile.type);
            r.drawChar(sx, sy, tile.char, animFg, tile.bg || COLORS.BLACK);
          } else {
            r.drawChar(sx, sy, tile.char, COLORS.BRIGHT_BLACK, COLORS.BLACK);
          }
        } else {
          r.drawChar(sx, sy, ' ', COLORS.BLACK, COLORS.BLACK);
        }
      }
    }

    // Draw items
    for (const item of this.items) {
      if (item.position && visible.has(`${item.position.x},${item.position.y}`)) {
        const sx = item.position.x - offsetX;
        const sy = item.position.y - offsetY;
        if (sx >= 0 && sx < cols && sy >= 0 && sy < rows) {
          r.drawChar(sx, sy, item.char || '!', item.color || COLORS.BRIGHT_YELLOW);
        }
      }
    }

    // Draw enemies
    for (const enemy of this.enemies) {
      if (visible.has(`${enemy.position.x},${enemy.position.y}`)) {
        const sx = enemy.position.x - offsetX;
        const sy = enemy.position.y - offsetY;
        if (sx >= 0 && sx < cols && sy >= 0 && sy < rows) {
          r.drawChar(sx, sy, enemy.char, enemy.color || COLORS.BRIGHT_RED);
        }
      }
    }

    // Draw player
    const px = Math.floor(cols / 2);
    const py = Math.floor(rows / 2);
    r.drawChar(px, py, '@', COLORS.BRIGHT_YELLOW);

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

    r.clear();

    const panelW = Math.min(cols - 4, 50);
    const panelH = 18;
    const px = Math.floor((cols - panelW) / 2);
    const py = Math.floor((rows - panelH) / 2);

    r.drawBox(px, py, panelW, panelH, COLORS.BRIGHT_RED, COLORS.BLACK, ' COMBAT ');

    // Enemy info
    r.drawString(px + 2, py + 2, `${enemy.name}`, COLORS.BRIGHT_RED);
    r.drawString(px + 2, py + 3, `HP: ${enemy.stats.hp}/${enemy.stats.maxHp}  Lv: ${enemy.stats.level}`, COLORS.WHITE);

    // Enemy ASCII art
    const enemyArt = enemy.char || 'E';
    r.drawString(px + Math.floor(panelW / 2) - 1, py + 5, enemyArt, enemy.color || COLORS.BRIGHT_RED);
    r.drawString(px + Math.floor(panelW / 2) - 3, py + 6, '/|\\', COLORS.WHITE);
    r.drawString(px + Math.floor(panelW / 2) - 2, py + 7, '/ \\', COLORS.WHITE);

    // VS
    r.drawString(px + Math.floor(panelW / 2) - 1, py + 9, 'VS', COLORS.BRIGHT_YELLOW);

    // Player info
    r.drawString(px + 2, py + 11, `${this.player.name}`, COLORS.BRIGHT_GREEN);
    r.drawString(px + 2, py + 12,
      `HP: ${this.player.stats.hp}/${this.player.stats.maxHp}  MP: ${this.player.stats.mana}/${this.player.stats.maxMana}`,
      COLORS.WHITE);

    // Actions — show abilities
    let actionStr = '[A]ttack  [F]lee';
    if (this.player.abilities && this.player.abilities.length > 0) {
      for (let i = 0; i < Math.min(this.player.abilities.length, 3); i++) {
        const ab = this.player.abilities[i];
        actionStr += `  [${i + 1}]${ab.name}(${ab.manaCost}mp)`;
      }
    }
    const maxActionLen = panelW - 4;
    r.drawString(px + 2, py + panelH - 3, actionStr.substring(0, maxActionLen), COLORS.BRIGHT_YELLOW);

    // Message log in combat
    const logY = py + panelH;
    for (let i = 0; i < Math.min(3, this.ui.messageLog.length); i++) {
      const msg = this.ui.messageLog[i];
      r.drawString(px + 1, logY + i, msg.text.substring(0, panelW - 2), msg.color);
    }
  }

  // ─── GAME LOOP ───

  gameLoop(timestamp) {
    if (!this.running) return;

    const delta = timestamp - this.lastFrame;
    this.lastFrame = timestamp;

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

    // Render
    this.render();

    // Draw transition overlay on top of everything
    this.renderTransition();

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
}

// ─── BOOTSTRAP ───

window.addEventListener('DOMContentLoaded', () => {
  const game = new Game();
  game.start();
});
