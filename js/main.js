import { COLORS, Renderer, Camera, InputManager } from './engine.js';
import { SeededRNG, PerlinNoise, AStar, distance } from './utils.js';
import { OverworldGenerator, SettlementGenerator, BuildingInterior, DungeonGenerator } from './world.js';
import { NameGenerator, NPCGenerator, DialogueSystem, LoreGenerator, Player, ItemGenerator } from './entities.js';
import { CombatSystem, QuestSystem, ShopSystem, FactionSystem, TimeSystem, InventorySystem, EventSystem } from './systems.js';
import { UIManager } from './ui.js';

// ═══════════════════════════════════════════
//  GAME - Main controller
// ═══════════════════════════════════════════

class Game {
  constructor() {
    this.canvas = document.getElementById('game-canvas');
    this.renderer = new Renderer(this.canvas);
    this.input = new InputManager();
    this.camera = new Camera();
    this.ui = new UIManager(this.renderer);

    // Game state
    this.state = 'MENU'; // MENU, CHAR_CREATE, LOADING, OVERWORLD, LOCATION, DUNGEON, DIALOGUE, SHOP, INVENTORY, CHARACTER, QUEST_LOG, MAP, HELP, GAME_OVER, COMBAT
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
    this.overworldGen = new OverworldGenerator();
    this.settlementGen = new SettlementGenerator();
    this.buildingInterior = new BuildingInterior();
    this.dungeonGen = new DungeonGenerator();

    // Systems
    this.combat = new CombatSystem();
    this.questSystem = new QuestSystem();
    this.shopSystem = new ShopSystem();
    this.factionSystem = new FactionSystem();
    this.timeSystem = new TimeSystem();
    this.eventSystem = new EventSystem(this.rng);

    // World data
    this.overworld = null;
    this.currentSettlement = null;
    this.currentDungeon = null;
    this.currentFloor = 0;
    this.npcs = [];
    this.enemies = [];
    this.items = [];
    this.player = null;

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
  }

  // ─── STATE MANAGEMENT ───

  setState(newState) {
    this.prevState = this.state;
    this.state = newState;
    this.ui.resetSelection();
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
  }

  enterDungeon(location) {
    const dungRng = new SeededRNG(this.seed + (location.id ? location.id.charCodeAt(0) : 0) * 2000);
    this.currentFloor = 0;
    const dungeon = this.dungeonGen.generate(dungRng, 60, 40, 1, 'standard');
    this.currentDungeon = dungeon;

    // Spawn enemies in dungeon
    this.enemies = [];
    if (dungeon.entitySpots) {
      for (const spot of dungeon.entitySpots) {
        if (spot.type === 'enemy') {
          const enemy = {
            id: 'enemy_' + Math.random().toString(36).substr(2, 6),
            name: dungRng.random(['Goblin', 'Skeleton', 'Rat', 'Spider', 'Zombie', 'Bandit']),
            char: dungRng.random(['g', 's', 'r', 'S', 'z', 'B']),
            color: dungRng.random([COLORS.GREEN, COLORS.WHITE, COLORS.YELLOW, COLORS.RED]),
            position: { x: spot.x, y: spot.y },
            stats: {
              hp: 10 + this.currentFloor * 5,
              maxHp: 10 + this.currentFloor * 5,
              attack: 3 + this.currentFloor * 2,
              defense: 1 + this.currentFloor,
              level: 1 + this.currentFloor
            },
            faction: 'monsters',
            getAttackPower() { return this.stats.attack; },
            getDefense() { return this.stats.defense; }
          };
          this.enemies.push(enemy);
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
            dungRng.random(['common', 'common', 'uncommon']),
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
    if (key === '?') { this.setState('HELP'); return; }

    // Movement
    const dir = this.getDirection(key);
    if (dir) {
      this.movePlayer(dir.dx, dir.dy);
    }

    // Enter location
    if (key === 'Enter' || key === 'e' || key === 'E') {
      const loc = this.overworld.getLocation(this.player.position.x, this.player.position.y);
      if (loc) {
        if (loc.type === 'dungeon') {
          this.enterDungeon(loc);
        } else {
          this.enterLocation(loc);
        }
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
    if (key === '?') { this.setState('HELP'); return; }

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
          this.currentFloor++;
          const nextRng = new SeededRNG(this.seed + this.currentFloor * 3000);
          this.currentDungeon = this.dungeonGen.generate(nextRng, 60, 40, this.currentFloor + 1, 'standard');
          if (this.currentDungeon.rooms && this.currentDungeon.rooms.length > 0) {
            const room = this.currentDungeon.rooms[0];
            this.player.position.x = room.x + Math.floor(room.w / 2);
            this.player.position.y = room.y + Math.floor(room.h / 2);
          }
          this.gameContext.currentLocationName = `Dungeon (Floor ${this.currentFloor + 1})`;
          this.ui.addMessage(`You descend to floor ${this.currentFloor + 1}.`, COLORS.BRIGHT_YELLOW);
        } else if (tile && (tile.type === 'STAIRS_UP' || tile.char === '<')) {
          if (this.currentFloor > 0) {
            this.currentFloor--;
            this.ui.addMessage(`You ascend to floor ${this.currentFloor + 1}.`, COLORS.BRIGHT_YELLOW);
          } else {
            this.currentDungeon = null;
            this.enemies = [];
            this.items = [];
            this.setState('OVERWORLD');
            this.ui.addMessage('You escape the dungeon.', COLORS.WHITE);
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

    if (option.action === 'shop' && this.activeNPC && this.activeNPC.shop) {
      this.openShop(this.activeNPC);
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

    if (option.action === 'close') {
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
      // Attack
      const result = this.combat.resolveRound(this.player, this.combatState.enemy);
      for (const msg of result.messages) {
        this.ui.addMessage(msg, COLORS.BRIGHT_RED);
      }

      if (result.battleOver) {
        if (result.winner === 'player') {
          const xp = this.combat.calculateXPReward(this.combatState.enemy);
          this.player.addXP(xp);
          const loot = this.combat.calculateLoot(this.rng, this.combatState.enemy, this.currentFloor);
          for (const item of loot) {
            if (typeof item === 'number') {
              this.player.gold += item;
              this.ui.addMessage(`Found ${item} gold!`, COLORS.BRIGHT_YELLOW);
            } else {
              this.player.addItem(item);
              this.ui.addMessage(`Found ${item.name}!`, COLORS.BRIGHT_GREEN);
            }
          }
          this.ui.addMessage(`Gained ${xp} XP!`, COLORS.BRIGHT_CYAN);
          // Remove dead enemy
          this.enemies = this.enemies.filter(e => e !== this.combatState.enemy);
        } else {
          this.setState('GAME_OVER');
          return;
        }
        this.combatState = null;
        this.setState(this.prevState || 'DUNGEON');
        return;
      }
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
          this.player.takeDamage(result.damage);
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

    // Random encounter on overworld
    if (this.rng.chance(0.03)) {
      const enemy = {
        id: 'enc_' + Math.random().toString(36).substr(2, 6),
        name: this.rng.random(['Wolf', 'Bandit', 'Wild Boar', 'Giant Spider', 'Goblin Scout']),
        char: this.rng.random(['w', 'B', 'b', 'S', 'g']),
        color: COLORS.BRIGHT_RED,
        position: { x: nx, y: ny },
        stats: {
          hp: 8 + this.player.stats.level * 3,
          maxHp: 8 + this.player.stats.level * 3,
          attack: 2 + this.player.stats.level,
          defense: 1 + Math.floor(this.player.stats.level / 2),
          level: Math.max(1, this.player.stats.level - 1)
        },
        faction: 'monsters',
        getAttackPower() { return this.stats.attack; },
        getDefense() { return this.stats.defense; }
      };
      this.combatState = { enemy };
      this.ui.addMessage(`A ${enemy.name} attacks!`, COLORS.BRIGHT_RED);
      this.setState('COMBAT');
    }

    // Check world events
    const events = this.eventSystem.checkEvents(this.timeSystem.day);
    for (const event of events) {
      const desc = this.eventSystem.getEventDescription(event);
      this.ui.addMessage(desc, COLORS.BRIGHT_MAGENTA);
    }

    this.camera.follow(this.player);
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

    // Check for items on ground
    const itemAt = this.items.find(i =>
      i.position && i.position.x === nx && i.position.y === ny);
    if (itemAt) {
      this.ui.addMessage(`You see ${itemAt.name} here. Press G to pick up.`, COLORS.BRIGHT_CYAN);
    }

    // Move enemies (simple AI: move toward player if visible)
    this.updateEnemyAI();
  }

  updateEnemyAI() {
    for (const enemy of this.enemies) {
      const dist = distance(enemy.position.x, enemy.position.y,
        this.player.position.x, this.player.position.y);

      if (dist < 8) {
        // Move toward player
        const dx = Math.sign(this.player.position.x - enemy.position.x);
        const dy = Math.sign(this.player.position.y - enemy.position.y);
        const nx = enemy.position.x + dx;
        const ny = enemy.position.y + dy;

        if (this.currentDungeon && this.currentDungeon.tiles &&
          ny >= 0 && ny < this.currentDungeon.tiles.length &&
          nx >= 0 && nx < this.currentDungeon.tiles[0].length &&
          this.currentDungeon.tiles[ny][nx].walkable &&
          !(nx === this.player.position.x && ny === this.player.position.y)) {
          // Check no other enemy there
          const blocked = this.enemies.some(e => e !== enemy && e.position.x === nx && e.position.y === ny);
          if (!blocked) {
            enemy.position.x = nx;
            enemy.position.y = ny;
          }
        }

        // Adjacent? Attack player
        if (dist <= 1.5) {
          const result = this.combat.calculateAttack(enemy, this.player);
          if (result.hit) {
            this.player.takeDamage(result.damage);
            this.ui.addMessage(result.message, COLORS.BRIGHT_RED);
            if (this.player.isDead()) {
              this.combatState = { enemy };
              this.setState('GAME_OVER');
              return;
            }
          }
        }
      }
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

    this.ui.dialogueState = {
      npcName: npc.name.full || npc.name.first || npc.title || 'NPC',
      reputation: npc.playerReputation || 0,
      text: greeting.text,
      options: options
    };
    this.ui.resetSelection();
    this.setState('DIALOGUE');
  }

  openShop(npc) {
    const shopType = npc.shop?.type || 'general';
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
      if (item.subType === 'mana' || item.name.toLowerCase().includes('mana')) {
        const restore = item.stats?.mana || 20;
        this.player.stats.mana = Math.min(this.player.stats.mana + restore, this.player.stats.maxMana);
        this.ui.addMessage(`Restored ${restore} mana!`, COLORS.BRIGHT_BLUE);
      } else {
        const restore = item.stats?.hp || 15;
        this.player.heal(restore);
        this.ui.addMessage(`Restored ${restore} HP!`, COLORS.BRIGHT_GREEN);
      }
      this.player.removeItem(item.id);
    } else if (item.type === 'food') {
      this.player.heal(item.stats?.hp || 5);
      this.player.removeItem(item.id);
      this.ui.addMessage(`Ate ${item.name}. Feel a bit better.`, COLORS.BRIGHT_GREEN);
    }
  }

  // ─── SAVE/LOAD ───

  saveGame() {
    try {
      const saveData = {
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
        turnCount: this.turnCount,
        state: this.state
      };
      localStorage.setItem('asciiquest_save', JSON.stringify(saveData));
      this.ui.addMessage('Game saved.', COLORS.BRIGHT_GREEN);
      return true;
    } catch (e) {
      this.ui.addMessage('Save failed!', COLORS.BRIGHT_RED);
      return false;
    }
  }

  loadGame() {
    try {
      const data = localStorage.getItem('asciiquest_save');
      if (!data) return false;

      const save = JSON.parse(data);
      this.seed = save.seed;
      this.rng = new SeededRNG(this.seed);

      // Regenerate world from seed
      this.overworld = this.overworldGen.generate(this.seed);

      // Restore player
      this.player = new Player(save.player.name, save.player.race, save.player.playerClass);
      Object.assign(this.player.stats, save.player.stats);
      this.player.position = save.player.position;
      this.player.inventory = save.player.inventory || [];
      this.player.equipment = save.player.equipment || {};
      this.player.gold = save.player.gold;
      this.player.knownLocations = new Set(save.player.knownLocations || []);

      // Restore time
      this.timeSystem.hour = save.time.hour;
      this.timeSystem.day = save.time.day;
      this.timeSystem.year = save.time.year;

      this.turnCount = save.turnCount;
      this.camera.follow(this.player);
      this.setState('OVERWORLD');
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
        this.ui.drawHUD(this.player, this.timeSystem, this.gameContext);
        break;

      case 'LOCATION':
        this.ui.drawLocationOverview(this.currentSettlement, this.npcs, this.player);
        this.ui.drawHUD(this.player, this.timeSystem, this.gameContext);
        break;

      case 'DUNGEON':
        this.renderDungeon();
        this.ui.drawHUD(this.player, this.timeSystem, this.gameContext);
        break;

      case 'DIALOGUE':
        // Render background
        if (this.currentSettlement) {
          this.ui.drawLocationOverview(this.currentSettlement, this.npcs, this.player);
        }
        if (this.ui.dialogueState) this.ui.drawDialogue(this.ui.dialogueState);
        break;

      case 'SHOP':
        if (this.ui.shopState) this.ui.drawShop(this.ui.shopState);
        break;

      case 'INVENTORY':
        this.ui.drawInventory(this.player);
        break;

      case 'CHARACTER':
        this.ui.drawCharacterSheet(this.player);
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

      case 'COMBAT':
        this.renderCombat();
        break;
    }

    this.renderer.endFrame();
    this.renderer.postProcess();
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
          if (dist > 30) {
            r.drawChar(sx, sy, tile.char, COLORS.BRIGHT_BLACK, COLORS.BLACK);
          } else {
            r.drawChar(sx, sy, tile.char, tile.fg, tile.bg || COLORS.BLACK);
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
  }

  renderDungeon() {
    if (!this.currentDungeon || !this.currentDungeon.tiles) return;

    const r = this.renderer;
    const cols = r.cols;
    const rows = r.rows - 7;

    // Center on player
    const offsetX = this.player.position.x - Math.floor(cols / 2);
    const offsetY = this.player.position.y - Math.floor(rows / 2);

    // FOV - simple raycasting for visible tiles
    const visible = new Set();
    const viewDist = 10;
    for (let angle = 0; angle < 360; angle += 1) {
      const rad = angle * Math.PI / 180;
      for (let d = 0; d <= viewDist; d++) {
        const vx = Math.round(this.player.position.x + Math.cos(rad) * d);
        const vy = Math.round(this.player.position.y + Math.sin(rad) * d);
        visible.add(`${vx},${vy}`);
        if (this.currentDungeon.tiles[vy]?.[vx] && !this.currentDungeon.tiles[vy][vx].walkable) {
          break; // Wall blocks LOS
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
            r.drawChar(sx, sy, tile.char, tile.fg, tile.bg || COLORS.BLACK);
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

    // Actions
    r.drawString(px + 2, py + panelH - 3, '[A]ttack  [F]lee', COLORS.BRIGHT_YELLOW);

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

    // Process queued input
    const action = this.input.consumeAction();
    if (action) {
      this.handleInput(action);
    }

    // Render
    this.render();

    // Auto-save periodically
    if (this.turnCount > 0 && this.turnCount % 100 === 0 && this.player) {
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

  // Prevent default on game keys
  window.addEventListener('keydown', (e) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'Tab'].includes(e.key)) {
      e.preventDefault();
    }
  });
});
