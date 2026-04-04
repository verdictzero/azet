import { COLORS, LAYOUT, Renderer, Camera, InputManager, ParticleSystem, GlowSystem } from './engine.js';
import { SeededRNG, PerlinNoise, AStar, distance, bresenhamLine } from './utils.js';
import { OverworldGenerator, ChunkManager, SectionManager, SettlementGenerator, BuildingInterior, DungeonGenerator, TowerGenerator, RuinGenerator, BridgeDungeonGenerator } from './world.js';
import { NameGenerator, NPCGenerator, DialogueSystem, LoreGenerator, Player, ItemGenerator, CreatureGenerator, degradeTechTerms, QUEST_CHAIN_DEFINITIONS } from './entities.js';
import { CombatSystem, QuestSystem, ShopSystem, FactionSystem, TimeSystem, InventorySystem, EventSystem, WeatherSystem, LightingSystem, CloudSystem } from './systems.js';
import { WorldHistoryGenerator } from './worldhistory.js';
import { UIManager } from './ui.js';
import { getMonsterArt } from './monsterart.js';
import { expandTile, clearTileCache } from './tileExpansion.js';
import { MusicManager, TRACKS } from './music.js';
import { AsciiCutscenePlayer } from './ascii-cutscene.js';
import { SpriteManager } from './sprites.js';
import { CutsceneLoader } from './cutscene-loader.js';
import { VideoCutscenePlayer } from './video-cutscene.js';

// ─── Save Export/Import Cipher ───
const SAVE_CIPHER_KEY = 'AETHEON-ASCIIQUEST-2024';
const SAVE_HEADER = '--- ASCIIQUEST SAVE FILE ---';
const SAVE_FOOTER = '--- END ASCIIQUEST SAVE ---';

function xorCipher(str, key) {
  let result = '';
  for (let i = 0; i < str.length; i++) {
    result += String.fromCharCode(str.charCodeAt(i) ^ key.charCodeAt(i % key.length));
  }
  return result;
}

function exportSaveToText(saveDataJson) {
  const xored = xorCipher(saveDataJson, SAVE_CIPHER_KEY);
  const b64 = btoa(unescape(encodeURIComponent(xored)));
  return `${SAVE_HEADER}\n${b64}\n${SAVE_FOOTER}`;
}

function importSaveFromText(text) {
  const lines = text.trim().split('\n');
  if (lines[0].trim() !== SAVE_HEADER || lines[lines.length - 1].trim() !== SAVE_FOOTER) {
    return null;
  }
  const b64 = lines.slice(1, -1).join('');
  try {
    const xored = decodeURIComponent(escape(atob(b64)));
    const json = xorCipher(xored, SAVE_CIPHER_KEY);
    const data = JSON.parse(json);
    if (!data.seed || !data.player || !data.version) return null;
    return data;
  } catch (e) {
    return null;
  }
}

// ─── Dungeon Circuitry Background Effect ───
// Procedural grid-aligned circuit traces with animated energy pulses
// for non-visible / out-of-bounds dungeon areas.

function _circuitHash(x, y) {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = h ^ (h >>> 16);
  return (h >>> 0) / 4294967296; // 0..1
}

function _hasTrace(x, y) {
  return _circuitHash(x, y) < 0.35;
}

// Connectivity bitmask → box-drawing character
// Bits: up=8, down=4, left=2, right=1
const _CIRCUIT_CONN = [
  '·',  // 0000 isolated
  '─',  // 0001 right
  '─',  // 0010 left
  '─',  // 0011 left+right
  '│',  // 0100 down
  '┌',  // 0101 down+right
  '┐',  // 0110 down+left
  '┬',  // 0111 down+left+right
  '│',  // 1000 up
  '└',  // 1001 up+right
  '┘',  // 1010 up+left
  '┴',  // 1011 up+left+right
  '│',  // 1100 up+down
  '├',  // 1101 up+down+right
  '┤',  // 1110 up+down+left
  '○',  // 1111 all four — junction node
];

const _circuitResult = { char: ' ', fg: '#000000', bg: '#000000' };

function getCircuitryCell(wx, wy) {
  if (!_hasTrace(wx, wy)) {
    _circuitResult.char = ' ';
    _circuitResult.fg = '#000000';
    _circuitResult.bg = '#000000';
    return _circuitResult;
  }

  // Determine connectivity from cardinal neighbors
  const conn = (_hasTrace(wx, wy - 1) ? 8 : 0)
             | (_hasTrace(wx, wy + 1) ? 4 : 0)
             | (_hasTrace(wx - 1, wy) ? 2 : 0)
             | (_hasTrace(wx + 1, wy) ? 1 : 0);

  _circuitResult.char = _CIRCUIT_CONN[conn];

  // Animated energy pulse — two overlapping diagonal waves
  const t = Date.now() / 1000;
  const wave = Math.sin((wx * 0.3 + wy * 0.2) - t * 1.5) * 0.5 + 0.5;
  const pulse2 = Math.sin((wx * 0.1 - wy * 0.15) + t * 0.7) * 0.5 + 0.5;
  const energy = wave * 0.7 + pulse2 * 0.3;

  // Very dark cyan/blue-green palette
  const cr = Math.floor(6 + energy * 10);   // 6..16
  const cg = Math.floor(6 + energy * 50);   // 6..56
  const cb = Math.floor(18 + energy * 62);  // 18..80
  _circuitResult.fg = `rgb(${cr},${cg},${cb})`;
  _circuitResult.bg = '#000000';
  return _circuitResult;
}

// ─── Umbilical Void Noise Background ───
// Subtle noise field for the empty space surrounding the umbilical tube.
// Very dark palette with sparse characters and slow animated drift.

const _noiseChars = [' ', ' ', ' ', ' ', ' ', ' ', '·', '·', '░', '▒'];
const _noiseResult = { char: ' ', fg: '#000000', bg: '#000000' };

function _noiseHash(x, y) {
  let h = Math.imul(x, 2654435761) + Math.imul(y, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = h ^ (h >>> 16);
  return (h >>> 0) / 4294967296;
}

function getNoiseBackgroundCell(wx, wy) {
  const h = _noiseHash(wx, wy);

  // Sparse — most cells are empty black
  if (h > 0.12) {
    _noiseResult.char = ' ';
    _noiseResult.fg = '#000000';
    _noiseResult.bg = '#000000';
    return _noiseResult;
  }

  // Slow drifting animation
  const t = Date.now() / 4000;
  const drift = Math.sin(wx * 0.08 + wy * 0.06 + t) * 0.5 + 0.5;
  const drift2 = Math.sin(wx * 0.05 - wy * 0.09 - t * 0.6) * 0.5 + 0.5;
  const intensity = drift * 0.6 + drift2 * 0.4;

  // Pick character based on hash
  const ci = Math.floor(h * _noiseChars.length * 10) % _noiseChars.length;
  _noiseResult.char = _noiseChars[ci];

  // Very dark purple/blue/gray palette
  const r = Math.floor(4 + intensity * 12);    // 4..16
  const g = Math.floor(3 + intensity * 8);     // 3..11
  const b = Math.floor(8 + intensity * 24);    // 8..32
  _noiseResult.fg = `rgb(${r},${g},${b})`;
  _noiseResult.bg = '#000000';
  return _noiseResult;
}

// ═══════════════════════════════════════════
//  GAME - Main controller
// ═══════════════════════════════════════════

class Game {
  constructor() {
    this.canvas = document.getElementById('game-canvas');
    this.renderer = new Renderer(this.canvas);
    this.input = new InputManager();
    const initDensity = this.renderer.densityLevel;
    this.camera = new Camera(
      Math.floor((this.renderer.cols - 2) / initDensity),
      Math.floor((this.renderer.rows - LAYOUT.HUD_TOTAL) / initDensity)
    );
    this.locationCamera = null;
    this._bumpState = { dx: 0, dy: 0, count: 0, lastTime: 0 };
    this.playerFacingDir = { dx: 1, dy: 0 }; // default facing right
    this.spriteManager = new SpriteManager();
    this.ui = new UIManager(this.renderer, this.spriteManager);
    this.music = new MusicManager();
    this.videoCutscene = new VideoCutscenePlayer(document.getElementById('cutscene-video'));
    this._loadVersion();

    // Auto-refresh: version polling
    this._currentVersion = null; // set by _loadVersion
    this._updateAvailable = false;
    this._updateDetectedAt = null;
    this._startVersionPolling();

    // Game state
    this.state = 'PREAMBLE'; // PREAMBLE, MENU, CHAR_CREATE, LOADING, OVERWORLD, LOCATION, DUNGEON, DIALOGUE, SHOP, INVENTORY, CHARACTER, QUEST_LOG, MAP, HELP, SETTINGS, GAME_OVER, COMBAT, BATTLE_ENTER, BATTLE_RESULTS, QUEST_COMPASS, DEBUG_MENU, CONSOLE_LOG, ALMANAC, GAMEPAD_MENU, REST_ITEM_SELECT, TRANSIT_MAP, VIDEO_CUTSCENE

    // ── FF-style Gamepad Menu ──
    this.gamepadMenuCursor = 0;

    // ── Rest Item Selection ──
    this.restItemSelectCursor = 0;
    this.restItemSelectList = [];
    this._restItemSelectReturnState = null;
    this.GAMEPAD_MENU_ITEMS = [
      { label: 'Items',     icon: '\u2666', state: 'INVENTORY'     },
      { label: 'Equipment', icon: '\u2620', action: 'equipment'    },
      { label: 'Rest',      icon: '\u25B2', action: 'rest'         },
      { label: 'Character', icon: '\u263A', state: 'CHARACTER'     },
      { label: 'Quests',    icon: '!',      state: 'QUEST_LOG'     },
      { label: 'Map',       icon: '\u2593', state: 'MAP'           },
      { label: 'Journal',   icon: '\u2663', state: 'ALMANAC'       },
      { label: 'Factions',  icon: '\u2691', state: 'FACTION'       },
      { label: 'Compass',   icon: '\u25CA', state: 'QUEST_COMPASS' },
      { label: 'Save',      icon: '\u25AA', action: 'save'         },
      { label: 'Settings',  icon: '\u2660', state: 'SETTINGS'      },
      { label: 'Help',      icon: '?',      state: 'HELP'          },
    ];

    // Settings (persisted to localStorage)
    this.settings = {
      crtEffects: false,
      crtGlow: true,
      crtScanlines: true,
      crtAberration: true,
      crtQuality: 'auto', // 'auto', 'low', 'medium', 'high', 'full'
      crtResolution: 'auto', // 'auto', 'quarter', 'half', 'three-quarter', 'full' – CRT filter resolution
      fontSize: 16,
      touchControls: true,
      autoSaveInterval: 100, // turns
      showQuestNav: true, // quest navigation overlay
      musicVolume: 0.5,
      musicMuted: false,
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
    this.bridgeGen = new BridgeDungeonGenerator();
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

    // Register quest chain definitions
    for (const chainDef of QUEST_CHAIN_DEFINITIONS) {
      this.questSystem.registerChain(chainDef);
    }

    // Performance: god ray frame throttle cache
    this._godRayFrame = 0;
    this._godRayCachedCells = null;
    this._godRayCacheCamX = null;
    this._godRayCacheCamY = null;

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
      walkReallyReallyFast: false,
    };
    this._debugPanel = null;      // legacy HTML panel (unused)
    this._debugVisible = false;    // legacy (unused)
    this._debugReturnState = null; // state to return to when closing debug menu
    this.showDebugButtons = false; // toggle debug button bar
    this._debugButtonRects = [];   // hit areas for debug buttons

    // Wire game state provider so input can adjust repeat speed per state
    this.input._gameStateProvider = () => this.state;

    // Wire debug state provider so touch buttons can show toggle indicators
    this.input._debugStateProvider = () => ({
      invincible: this.debug.invincible,
      noClip: this.debug.noClip,
      noEncounters: this.debug.noEncounters,
      infiniteAttack: this.debug.infiniteAttack,
      infiniteMana: this.debug.infiniteMana,
      disableShadows: this.debug.disableShadows,
      disableLighting: this.debug.disableLighting,
      disableClouds: this.debug.disableClouds,
      crtEffects: this.renderer?.effectsEnabled ?? false,
      revealMap: this.debug.revealMap,
      walkReallyReallyFast: this.debug.walkReallyReallyFast,
    });

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
    this.testArea = null;
    this._debugAdvMode = false;

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
      currentLocation: null,
      currentSection: null,
    };

    // Combat state
    this.combatState = null;
    this.battleEnterTimer = 0;  // frames for battle enter animation
    this.battleResults = null;  // stored results for BATTLE_RESULTS screen
    this.battleResultsTimer = 0; // animation timer for results screen

    // Active dialogue/shop
    this.activeNPC = null;
    this.dialogueReturnState = null;

    // Resize handler
    window.addEventListener('resize', () => this.handleResize());
    this.handleResize();

    // Canvas click handler for debug buttons
    this.canvas.addEventListener('click', (e) => this._handleCanvasClick(e));
    this.canvas.addEventListener('touchstart', (e) => {
      if (this.state === 'PREAMBLE' || (this._debugButtonRects && this._debugButtonRects.length > 0)) {
        const touch = e.touches[0];
        if (touch) this._handleCanvasClickAt(touch.clientX, touch.clientY, e);
      }
    }, { passive: false });
  }

  handleResize() {
    this.renderer.resize();
    this._applyCrtQuality();
    this.camera.viewportCols = this.renderer.cols - 2;
    this.camera.viewportRows = this.renderer.rows - LAYOUT.HUD_TOTAL;
    if (this.locationCamera) {
      this.locationCamera.viewportCols = this.renderer.cols - 2;
      this.locationCamera.viewportRows = this.renderer.rows - LAYOUT.HUD_TOTAL;
    }
  }

  _applyCrtQuality() {
    // crtResolution is the primary user-facing resolution control
    const res = this.settings.crtResolution || 'auto';
    const resMap = { quarter: 0.25, half: 0.5, 'three-quarter': 0.75, full: 1.0 };
    let scale;
    if (res === 'auto') {
      const totalPixels = this.renderer.canvas.width * this.renderer.canvas.height;
      const targetPixels = 800 * 600;
      scale = Math.min(1.0, Math.max(0.25, Math.sqrt(targetPixels / totalPixels)));
    } else {
      scale = resMap[res] || 0.5;
    }
    this.renderer.setCrtScale(scale);
  }

  _handleCanvasClick(e) {
    this._handleCanvasClickAt(e.clientX, e.clientY, e);
  }

  _handleCanvasClickAt(clientX, clientY, e) {
    // Preamble: any click/touch transitions to title screen
    if (this.state === 'PREAMBLE') {
      e.preventDefault();
      this.setState('MENU');
      return;
    }
    if (!this._debugButtonRects || this._debugButtonRects.length === 0) return;
    const rect = this.canvas.getBoundingClientRect();
    const cellW = this.renderer.cellWidth;
    const cellH = this.renderer.cellHeight;
    if (!cellW || !cellH) return;
    const col = Math.floor((clientX - rect.left) / cellW);
    const row = Math.floor((clientY - rect.top) / cellH);

    for (const btn of this._debugButtonRects) {
      if (col >= btn.x && col < btn.x + btn.w && row === btn.y) {
        e.preventDefault();
        this._executeDebugButton(btn.action);
        return;
      }
    }
  }

  _executeDebugButton(action) {
    const weatherOptions = ['auto','clear','rain','storm','fog','snow','sandstorm','acid_rain','coolant_mist','ember_rain','data_storm','nano_haze','ion_storm','blood_rain'];
    switch (action) {
      case 'hourInc':
        if (this.timeSystem) this.timeSystem.hour = (this.timeSystem.hour + 1) % 24;
        break;
      case 'hourDec':
        if (this.timeSystem) this.timeSystem.hour = (this.timeSystem.hour + 23) % 24;
        break;
      case 'weatherNext': {
        if (this.weatherSystem) {
          const idx = weatherOptions.indexOf(this.weatherSystem.current);
          const next = weatherOptions[(idx + 1) % weatherOptions.length];
          if (next === 'auto') { this.debug.forceWeather = null; this.weatherSystem.current = 'clear'; }
          else { this.debug.forceWeather = next; this.weatherSystem.current = next; }
        }
        break;
      }
      case 'weatherPrev': {
        if (this.weatherSystem) {
          const idx = weatherOptions.indexOf(this.weatherSystem.current);
          const prev = weatherOptions[(idx - 1 + weatherOptions.length) % weatherOptions.length];
          if (prev === 'auto') { this.debug.forceWeather = null; this.weatherSystem.current = 'clear'; }
          else { this.debug.forceWeather = prev; this.weatherSystem.current = prev; }
        }
        break;
      }
      case 'disableShadows': this.debug.disableShadows = !this.debug.disableShadows; break;
      case 'disableLighting': this.debug.disableLighting = !this.debug.disableLighting; break;
      case 'disableClouds': this.debug.disableClouds = !this.debug.disableClouds; break;
      case 'crtEffects': this.renderer.effectsEnabled = !this.renderer.effectsEnabled; break;
      case 'noEncounters': this.debug.noEncounters = !this.debug.noEncounters; break;
      case 'noClip': this.debug.noClip = !this.debug.noClip; break;
      case 'invincible': this.debug.invincible = !this.debug.invincible; break;
      case 'infiniteAttack':
        this.debug.infiniteAttack = !this.debug.infiniteAttack;
        if (this.player) this.player._debugInfiniteAttack = this.debug.infiniteAttack;
        break;
      case 'infiniteMana': this.debug.infiniteMana = !this.debug.infiniteMana; break;
      case 'walkReallyReallyFast': this.debug.walkReallyReallyFast = !this.debug.walkReallyReallyFast; break;
      case 'fullHeal':
        if (this.player) {
          this.player.stats.hp = this.player.stats.maxHp;
          this.player.stats.mana = this.player.stats.maxMana;
          this.ui.addMessage('[DEBUG] Full heal!', COLORS.BRIGHT_GREEN);
        }
        break;
      case 'giveXP':
        if (this.player) {
          const leveled = this.player.addXP(100);
          if (leveled.length) this.ui.addMessage(`[DEBUG] Level up! Lv ${leveled[leveled.length - 1]}`, COLORS.BRIGHT_YELLOW);
          else this.ui.addMessage('[DEBUG] +100 XP', COLORS.BRIGHT_CYAN);
        }
        break;
      case 'giveGold':
        if (this.player) { this.player.gold += 100; this.ui.addMessage('[DEBUG] +100 Gold', COLORS.BRIGHT_YELLOW); }
        break;
      case 'levelUp':
        if (this.player) {
          const needed = this.player.stats.xpToNext - this.player.stats.xp;
          this.player.addXP(needed);
          this.ui.addMessage(`[DEBUG] Level up! Lv ${this.player.stats.level}`, COLORS.BRIGHT_YELLOW);
        }
        break;
      case 'advanceDay':
        this.timeSystem.advance(24);
        this.ui.addMessage('[DEBUG] Advanced 24 hours', COLORS.BRIGHT_CYAN);
        break;
      case 'revealMap':
        if (this.overworld) {
          for (const loc of this.overworld.getLoadedLocations()) {
            this.player.knownLocations.add(loc.id);
          }
          this.debug.revealMap = true;
          this.ui.addMessage('[DEBUG] Map revealed', COLORS.BRIGHT_GREEN);
        }
        break;
      case 'teleport':
        if (this.player) {
          this.player.position.x = 50;
          this.player.position.y = 30;
          if (this.overworld) this.overworld.ensureChunksAround(50, 30);
          this.camera.follow(this.player);
          this.ui.addMessage('[DEBUG] Teleported to 50,30', COLORS.BRIGHT_CYAN);
        }
        break;
    }
  }

  // ─── STATE MANAGEMENT ───

  setState(newState) {
    this.prevState = this.state;
    this.state = newState;
    this.ui.resetSelection();
    // Update camera viewport for density zoom when switching states
    if (newState === 'OVERWORLD') {
      const density = this.renderer.densityLevel;
      this.camera.viewportCols = Math.floor((this.renderer.cols - 2) / density);
      this.camera.viewportRows = Math.floor((this.renderer.rows - LAYOUT.HUD_TOTAL) / density);
    }
    // Update touch controls layout for new state
    this.input.updateTouchLayout(newState);
    this._updateMusic(newState);
  }

  _updateMusic(newState) {
    if (!this.music) return;
    const overlayStates = [
      'INVENTORY', 'CHARACTER', 'QUEST_LOG', 'MAP', 'HELP',
      'SETTINGS', 'DIALOGUE', 'SHOP', 'FACTION', 'ALMANAC',
      'CONSOLE_LOG', 'DEBUG_MENU', 'QUEST_COMPASS', 'GAMEPAD_MENU', 'TRANSIT_MAP',
      'REST_ITEM_SELECT'
    ];
    if (overlayStates.includes(newState)) return;

    // Use near-instant fade when leaving battle/fanfare
    const battleStates = ['BATTLE_ENTER', 'COMBAT', 'ENEMY_DEATH', 'BATTLE_RESULTS'];
    const leavingBattle = battleStates.includes(this.prevState);

    switch (newState) {
      case 'PREAMBLE':
        break;
      case 'MENU':
      case 'CHAR_CREATE':
        this.music.play(TRACKS.TITLE);
        break;
      case 'LOADING':
      case 'WORLD_GEN_PAUSE':
        break;
      case 'OVERWORLD':
        this._currentTownTrack = null;
        this._currentRuinsTrack = null;
        if (this.timeSystem) {
          this.music.play(this.timeSystem.isDaytime() ? TRACKS.OVERWORLD_DAY : TRACKS.OVERWORLD_NIGHT, leavingBattle ? { fadeDuration: 50 } : undefined);
        }
        break;
      case 'LOCATION':
        if (!this._currentTownTrack) {
          this._currentTownTrack = TRACKS.TOWN[Math.floor(Math.random() * TRACKS.TOWN.length)];
        }
        this.music.play(this._currentTownTrack, leavingBattle ? { fadeDuration: 50 } : undefined);
        break;
      case 'DUNGEON':
        if (!this._currentRuinsTrack) {
          this._currentRuinsTrack = TRACKS.RUINS[Math.floor(Math.random() * TRACKS.RUINS.length)];
        }
        this.music.play(this._currentRuinsTrack, leavingBattle ? { fadeDuration: 50 } : undefined);
        break;
      case 'BATTLE_ENTER':
      case 'COMBAT':
        if (!this.music.currentTrack || !this.music.currentTrack.includes('battle')) {
          this.music.play(TRACKS.BATTLE, { fadeDuration: 50 });
        }
        break;
      case 'ENEMY_DEATH':
        break;
      case 'BATTLE_RESULTS':
        this.music.play(TRACKS.FANFARE, { loop: false, fadeDuration: 50 });
        break;
      case 'GAME_OVER':
        this.music.stop();
        break;
    }
  }

  _zoomIn() {
    const levels = [1, 2, 3];
    const cur = this.renderer.densityLevel;
    const next = levels.find(l => l > cur) || levels[levels.length - 1];
    if (next === cur) return;
    this.renderer.setZoom(next);
    this._updateCameraAfterZoom();
    this.ui.addMessage(`Zoom: ${next}x density`, COLORS.BRIGHT_CYAN);
  }

  _zoomOut() {
    const levels = [1, 2, 3];
    const cur = this.renderer.densityLevel;
    const prev = [...levels].reverse().find(l => l < cur) || levels[0];
    if (prev === cur) return;
    this.renderer.setZoom(prev);
    this._updateCameraAfterZoom();
    this.ui.addMessage(`Zoom: ${prev}x density`, COLORS.BRIGHT_CYAN);
  }

  _updateCameraAfterZoom() {
    const density = this.renderer.densityLevel;
    const viewW = this.renderer.cols - 2;
    const viewH = this.renderer.rows - LAYOUT.HUD_TOTAL;
    // Camera viewport is in world tiles, so divide screen size by density
    const worldW = Math.floor(viewW / density);
    const worldH = Math.floor(viewH / density);
    if (this.state === 'OVERWORLD') {
      this.camera.viewportCols = worldW;
      this.camera.viewportRows = worldH;
      this.camera.follow(this.player);
      this.camera.x = this.camera.targetX;
      this.camera.y = this.camera.targetY;
    }
    if (this.state === 'LOCATION' && this.locationCamera) {
      this.locationCamera.viewportCols = worldW;
      this.locationCamera.viewportRows = worldH;
      this.locationCamera.follow(this.player);
      this.locationCamera.x = this.locationCamera.targetX;
      this.locationCamera.y = this.locationCamera.targetY;
    }
    if (this.state === 'DUNGEON') {
      this.camera.viewportCols = worldW;
      this.camera.viewportRows = worldH;
    }
    this.renderer.invalidate();
  }

  // Clear cached rendering data to prevent stale artifacts across state transitions.
  _clearRenderCaches() {
    this._shadowCacheKey = null;
    this._shadowBuf = null;
    this._highlightBuf = null;
    this._shadowBufData = null;
    clearTileCache();
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

  // Start battle with enter animation
  startBattleTransition(enemy) {
    this._battleReturnState = this.state; // remember pre-battle state before state chain
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
    this.battleEnterTimer = 0;
    this.music.play(enemy.isBoss ? TRACKS.BOSS_BATTLE : TRACKS.BATTLE, { fadeDuration: 50 });
    this.setState('BATTLE_ENTER');
  }

  renderBattleEnter() {
    const r = this.renderer;
    const cols = r.cols;
    const rows = r.rows;
    const frame = this.battleEnterTimer;

    if (frame < 4) {
      // Phase 1: white flash
      const alpha = 0.6 - frame * 0.1;
      r.tintOverlay('#FFFFFF', alpha);
    } else if (frame < 14) {
      // Phase 2: horizontal swoosh wipe
      const progress = (frame - 4) / 10; // 0 to 1
      const wipeRow = Math.floor(progress * rows);
      // Black below wipe line
      for (let sy = 0; sy < rows; sy++) {
        for (let sx = 0; sx < cols; sx++) {
          if (sy < wipeRow) {
            r.drawChar(sx, sy, ' ', '#000000', '#000000');
          }
        }
      }
      // Bright swoosh line
      const lineY = wipeRow;
      if (lineY >= 0 && lineY < rows) {
        for (let sx = 0; sx < cols; sx++) {
          const sparkChar = Math.random() < 0.3 ? '*' : Math.random() < 0.5 ? '=' : '-';
          r.drawChar(sx, lineY, sparkChar, '#FFFFFF', '#4488FF');
        }
      }
      // Secondary trailing line
      if (lineY - 1 >= 0) {
        for (let sx = 0; sx < cols; sx++) {
          r.drawChar(sx, lineY - 1, '~', '#88BBFF', '#001133');
        }
      }
    } else {
      // Phase 3: fade from black into battle
      const fadeProgress = (frame - 14) / 6; // 0 to 1 over 6 frames
      this.renderCombat();
      if (fadeProgress < 1) {
        r.tintOverlay('#000000', 1 - fadeProgress);
      }
    }

    this.battleEnterTimer++;
    if (this.battleEnterTimer >= 20) {
      this.setState('COMBAT');
    }
  }

  // ─── GAME INITIALIZATION ───

  startNewGame() {
    this.setState('LOADING');
    // Kick off non-blocking sprite preload (PNG files; missing files silently fallback)
    this.spriteManager.preloadAll();
    this._loadLog = [];
    this._loadStep = 0;
    this._loadingStep = null; // {current, total, label} for post-history loading modal
    this._worldGenEvents = [];
    this._worldGenStats = { currentYear: 0, activeCivs: 0, fallenCivs: 0, wars: 0, figures: 0, artifacts: 0, catastrophes: 0, treaties: 0, totalPop: 0 };
    this._worldGenEra = null;
    this._worldGenPhase = 'Awakening...';

    const log = (text, color) => {
      this._loadLog.push({ text, color: color || COLORS.BRIGHT_GREEN });
    };

    const flush = (header) => {
      this.renderer.beginFrame();
      if (this._loadingStep) {
        this.ui.drawLoadingModal(this._loadingStep);
      } else {
        this.ui.drawLoading(header, this._loadLog);
      }
      this.renderer.endFrame();
      this.renderer.postProcess();
    };

    // History depth config from character creation
    // Timescales: short ~2,000y, medium ~4,000y, long ~8,000y, epic ~20,000y
    const depthConfigs = {
      short:  { eras: 8,  yearsPerEra: 250,  eventDensity: 0.6 },
      medium: { eras: 12, yearsPerEra: 333,  eventDensity: 0.8 },
      long:   { eras: 16, yearsPerEra: 500,  eventDensity: 1.0 },
      epic:   { eras: 20, yearsPerEra: 1000, eventDensity: 1.2 },
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
              description: `═══ ${this.worldHistoryGen.currentYear.toLocaleString()} years of history simulated ═══`, category: 'era' });
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
        this._loadingStep = { current: 1, total: 10, label: 'Weaving history into the world...' };
        this.loreGen.setWorldHistory(this.worldHistoryGen);
        this.dialogueSys.setWorldHistory(this.worldHistoryGen);
        this.npcGen.setWorldHistory(this.worldHistoryGen);
        this.eventSystem.setWorldHistory(this.worldHistoryGen);

        // Switch to standard loading display for terrain gen
        log('History simulation complete.', COLORS.BRIGHT_CYAN);
        log(`  ${this.worldHistoryGen.currentYear.toLocaleString()} years across ${this.worldHistoryGen.eras.length} eras`, COLORS.BRIGHT_YELLOW);
        log(`  ${this.worldHistoryGen.civilizations.length} civilizations, ${this.worldHistoryGen.wars.length} wars`, COLORS.WHITE);
        log(`  ${this.worldHistoryGen.artifacts.length} artifacts, ${this.worldHistoryGen.historicalFigures.length} notable figures`, COLORS.WHITE);
        if (this.worldHistoryGen.mapScars.length > 0) {
          log(`  ${this.worldHistoryGen.mapScars.length} historical scars will mark the world`, COLORS.BRIGHT_RED);
        }
        flush('Building world...');
      },
      // Step 4: Generate terrain and chunks
      () => {
        this._loadingStep = { current: 2, total: 10, label: 'Charting the terrain...' };
        log('Charting the lands...', COLORS.BRIGHT_CYAN);
        log('  Generating Perlin noise heightmap (scale: 0.04)', COLORS.WHITE);
        log('  Computing moisture overlay for biome distribution', COLORS.WHITE);
        log('  Chunk size: 32x32 tiles, infinite procedural world', COLORS.WHITE);
        flush('Charting terrain...');
      },
      // Step 5: Create SectionManager and ChunkManager for the O'Neill cylinder
      () => {
        this._loadingStep = { current: 3, total: 10, label: 'Mapping the cylinder sections...' };
        this.debugMode = !!(this.charGenState && this.charGenState.debugMode);
        if (this.debugMode) {
          this.debug.invincible = true;
          this.debug.infiniteMana = true;
          this.debug.noEncounters = true;
        }
        this.sectionManager = new SectionManager(this.seed, { debugMode: this.debugMode });
        this.overworld = new ChunkManager(this.seed, this.sectionManager);
        // Wire historical map scars into terrain generation
        if (this.worldHistoryGen && this.worldHistoryGen.mapScars && this.worldHistoryGen.mapScars.length > 0) {
          this.overworld.setMapScars(this.worldHistoryGen.mapScars, this.worldHistoryGen.regions);
          log(`  ${this.worldHistoryGen.mapScars.length} historical scars will mark the landscape`, COLORS.BRIGHT_YELLOW);
        }

        // Log section biome assignments
        log('O\'Neill Cylinder Section Layout:', COLORS.BRIGHT_CYAN);
        const biomes = this.sectionManager.getHabitatBiomes();
        for (const { id, biome } of biomes) {
          const marker = id === 'H4' ? ' ← HOME' : '';
          log(`  ${id}: ${biome}${marker}`, id === 'H4' ? COLORS.BRIGHT_GREEN : COLORS.WHITE);
        }

        // Spawn in H4 center
        const h4Center = this.sectionManager.getSectionCenter('H4');
        this.overworld.ensureChunksAround(h4Center.x, h4Center.y);
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
        flush('Charting cylinder sections...');
      },
      // Step 6: Populate locations
      () => {
        this._loadingStep = { current: 4, total: 10, label: 'Populating the world...' };
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
        this._loadingStep = { current: 5, total: 10, label: 'Forming factions...' };
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
        this._loadingStep = { current: 6, total: 10, label: 'Seeding events...' };
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
        this._loadingStep = { current: 7, total: 10, label: 'Recovering ancient lore...' };
        log('Recovering ancient lore...', COLORS.BRIGHT_CYAN);
        const factionNames = this.factionSystem.getAllFactionNames();
        const locationNames = this.overworld.getLoadedLocations().map(l => l.name);
        this.worldLore = this.loreGen.generateWorldHistory(this.rng, factionNames, locationNames);
        log(`  ${this.worldLore.length} historical records compiled`, COLORS.WHITE);
        flush('Loading lore...');
      },
      // Step 10: Initialize weather
      () => {
        this._loadingStep = { current: 8, total: 10, label: 'Reading the skies...' };
        log('Reading the skies...', COLORS.BRIGHT_CYAN);
        log(`  Current weather: ${this.weatherSystem.current || 'clear'}`, COLORS.WHITE);
        log('  Day/night cycle active', COLORS.WHITE);
        flush('Reading skies...');
      },
      // Step 11: Create player
      () => {
        this._loadingStep = { current: 9, total: 10, label: 'Creating your character...' };
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
      // Step 12: Place player in H4 and enter world
      () => {
        this._loadingStep = { current: 10, total: 10, label: 'Entering the cylinder...' };
        const h4Center = this.sectionManager.getSectionCenter('H4');
        const loadedLocs = this.overworld.getLoadedLocations();
        const startLoc = loadedLocs.find(l => l.type === 'village') || loadedLocs[0];
        if (startLoc) {
          startLoc.name = 'Broken Arm';
          startLoc.type = 'town';  // Upgrade to town for bigger settlement
          this.player.position.x = startLoc.x;
          this.player.position.y = startLoc.y;
          this.player.knownLocations = new Set([startLoc.id]);
          this.gameContext.currentLocationName = startLoc.name;
          this.gameContext.currentLocation = startLoc;
        } else {
          // Fallback: center of H4
          this.player.position.x = h4Center.x;
          this.player.position.y = h4Center.y;
          this.player.knownLocations = new Set();
        }

        // Initialize section tracking
        this.player.currentSection = 'H4';
        this.player.unlockedSections = new Set(['H4']);
        this.player.discoveredSections = new Set(['H4']);
        this.gameContext.currentSection = 'H4';

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

  // ─── DEBUG ADVENTURE MODE ───

  startDebugAdventure() {
    // Create a minimal debug player without world generation
    this.seed = Date.now();
    this.rng = new SeededRNG(this.seed);
    this.player = new Player('Debug', 'human', 'engineer');
    this.player.position = { x: 0, y: 0 };

    // Enable all debug flags
    this.debug.invincible = true;
    this.debug.noEncounters = true;
    this.debug.noClip = false;
    this.debug.infiniteAttack = true;
    this.debug.infiniteMana = true;
    this.debug.disableLighting = true;
    this.debug.disableShadows = true;
    this.debug.disableClouds = true;

    // Clear world state
    this.overworld = null;
    this.currentSettlement = null;
    this.currentDungeon = null;
    this.currentTower = null;
    this.enemies = [];
    this.items = [];
    this.npcs = [];
    this.testArea = null;
    this._debugAdvMode = true;

    // Open debug menu on Test Areas tab
    this._debugReturnState = 'MENU';
    this.ui.debugTab = 4;
    this.ui.debugCursor = 0;
    this.ui.debugScroll = 0;
    this.setState('DEBUG_MENU');
  }

  enterTestMaze() {
    const CHUNK = 80;
    this.testArea = { type: 'maze', chunks: new Map(), seed: this.seed, chunkSize: CHUNK };

    // Generate initial chunks in a 5x5 area around origin
    for (let cy = -2; cy <= 2; cy++) {
      for (let cx = -2; cx <= 2; cx++) {
        this._generateMazeChunk(cx, cy);
      }
    }

    // Build tile array from chunks
    this._rebuildTestAreaTiles();

    // Place player at the first walkable cell near world origin
    const originChunk = this.testArea.chunks.get('0,0');
    if (originChunk) {
      // Place at top-left of first passage block (blocks start at 0)
      this.player.position.x = -this.testArea.worldOffsetX;
      this.player.position.y = -this.testArea.worldOffsetY;
    }

    // Lock zoom to density 1 (closest)
    this.renderer.setZoom(1);
    this._preLocationZoom = 1;

    // Clear entities
    this.enemies = [];
    this.items = [];
    this.npcs = [];
    this.currentDungeonLocation = null;
    this.currentFloor = 0;
    this._mazeSlowTurns = 0;
    this.gameContext.currentLocationName = 'Test: Infinite Maze A';

    this.setState('DUNGEON');
    this.ui.addMessage('[DEBUG] Entered Infinite Maze A test area.', COLORS.BRIGHT_GREEN);
    this.ui.addMessage('Use arrow keys to explore. Esc to return.', COLORS.BRIGHT_CYAN);
  }

  enterTestMazeB() {
    const CHUNK = 80;
    this.testArea = { type: 'mazeB', chunks: new Map(), seed: this.seed, chunkSize: CHUNK };

    // Generate initial chunks in a 5x5 area around origin
    for (let cy = -2; cy <= 2; cy++) {
      for (let cx = -2; cx <= 2; cx++) {
        this._generateMazeChunkB(cx, cy);
      }
    }

    // Build tile array from chunks
    this._rebuildTestAreaTiles();

    // Place player at the first walkable cell near world origin
    const originChunk = this.testArea.chunks.get('0,0');
    if (originChunk) {
      this.player.position.x = -this.testArea.worldOffsetX;
      this.player.position.y = -this.testArea.worldOffsetY;
    }

    // Lock zoom to density 1 (closest)
    this.renderer.setZoom(1);
    this._preLocationZoom = 1;

    // Clear entities
    this.enemies = [];
    this.items = [];
    this.npcs = [];
    this.currentDungeonLocation = null;
    this.currentFloor = 0;
    this._mazeSlowTurns = 0;
    this.gameContext.currentLocationName = 'Test: Infinite Maze B';

    this.setState('DUNGEON');
    this.ui.addMessage('[DEBUG] Entered Infinite Maze B test area.', COLORS.BRIGHT_GREEN);
    this.ui.addMessage('Use arrow keys to explore. Esc to return.', COLORS.BRIGHT_CYAN);
  }

  _generateMazeChunkB(cx, cy) {
    const key = `${cx},${cy}`;
    if (this.testArea.chunks.has(key)) return;

    const CHUNK = this.testArea.chunkSize;
    const CW = 5;         // corridor width — same as Maze A
    const GAP = 15;       // wall region — same as Maze A
    const STEP = CW + GAP; // 20 cells per grid unit — same as Maze A
    const GRID = CHUNK / STEP; // 4 tiles per axis
    const seed = this.testArea.seed;
    const PAD = CW;       // padding for adjacent tiles' border gradients

    // Deterministic hash for any coordinate tuple
    const hash = (a, b, c) => {
      let h = (a * 374761393 + b * 668265263 + c) | 0;
      h = Math.imul(h ^ (h >>> 15), 2246822519);
      h = Math.imul(h ^ (h >>> 13), 3266489917);
      return (h ^ (h >>> 16)) >>> 0;
    };
    const rand = (a, b, c) => (hash(a, b, c) % 10000) / 10000;

    // Per-row horizontal density — each world row has its own corridor probability
    // so some rows are near-solid runs, others have occasional breaks
    const rowHDensity = (wy) => 0.75 + 0.20 * rand(0, wy, seed + 300); // 0.75–0.95

    // Vertical connection density — varies by column region for variety
    const colVDensity = (wx) => 0.25 + 0.20 * rand(wx, 0, seed + 301); // 0.25–0.45

    // Horizontal corridors: high probability, creating long meandering runs
    const hasHCorridor = (wx, wy) => rand(wx, wy, seed + 500) < rowHDensity(wy);
    // Vertical corridors: lower probability, linking horizontal lanes
    const hasVCorridor = (wx, wy) => rand(wx, wy, seed + 400) < colVDensity(wx);

    // Padded grid for BFS
    const BFSW = CHUNK + 2 * PAD;
    const grid = [];
    for (let y = 0; y < BFSW; y++) {
      grid[y] = new Array(BFSW).fill(false);
    }

    // Carve helper — same as Maze A
    const carve = (gy, gx, h, w) => {
      for (let dy = 0; dy < h; dy++) {
        for (let dx = 0; dx < w; dx++) {
          const py = PAD + gy + dy, px = PAD + gx + dx;
          if (py >= 0 && py < BFSW && px >= 0 && px < BFSW) {
            grid[py][px] = true;
          }
        }
      }
    };

    // Same 6x6 ring (-1..GRID) as Maze A for seamless chunk borders
    for (let gy = -1; gy <= GRID; gy++) {
      for (let gx = -1; gx <= GRID; gx++) {
        const wx = cx * CHUNK + gx * STEP;
        const wy = cy * CHUNK + gy * STEP;
        const y = gy * STEP;
        const x = gx * STEP;

        // Every cell gets a passage block — no voids
        carve(y, x, CW, CW);

        // Carve east corridor (horizontal runs)
        if (hasHCorridor(wx, wy)) {
          carve(y, x + CW, CW, GAP);
        }

        // Carve south corridor (vertical connections)
        if (hasVCorridor(wx, wy)) {
          carve(y + CW, x, GAP, CW);
        }

        // Prevent isolated blocks: check full NSEW connectivity
        const hasNorth = hasVCorridor(wx, wy - STEP);
        const hasSouth = hasVCorridor(wx, wy);
        const hasWest  = hasHCorridor(wx - STEP, wy);
        const hasEast  = hasHCorridor(wx, wy);

        if (!hasNorth && !hasSouth && !hasWest && !hasEast) {
          // Force east connection (prefer extending horizontal runs)
          carve(y, x + CW, CW, GAP);
        }
      }
    }

    // BFS distance field on padded grid (Chebyshev, 3 wall layers)
    // Identical to Maze A
    const bfs = [];
    const queue = [];
    for (let y = 0; y < BFSW; y++) {
      bfs[y] = [];
      for (let x = 0; x < BFSW; x++) {
        if (grid[y][x]) { bfs[y][x] = 0; queue.push(y, x); }
        else bfs[y][x] = 255;
      }
    }
    let qi = 0;
    while (qi < queue.length) {
      const by = queue[qi++], bx = queue[qi++];
      const d = bfs[by][bx];
      if (d >= 3) continue;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const ny = by + dy, nx = bx + dx;
          if (ny >= 0 && ny < BFSW && nx >= 0 && nx < BFSW && bfs[ny][nx] > d + 1) {
            bfs[ny][nx] = d + 1;
            queue.push(ny, nx);
          }
        }
      }
    }

    // Extract center CHUNK x CHUNK from the padded BFS result
    const dist = [];
    for (let y = 0; y < CHUNK; y++) {
      dist[y] = [];
      for (let x = 0; x < CHUNK; x++) {
        dist[y][x] = bfs[PAD + y][PAD + x];
      }
    }

    this.testArea.chunks.set(key, dist);
  }

  _generateMazeChunk(cx, cy) {
    const key = `${cx},${cy}`;
    if (this.testArea.chunks.has(key)) return;

    const CHUNK = this.testArea.chunkSize;
    const CW = 5;         // corridor width (5 cells wide)
    const GAP = 15;       // wall region between passage blocks
    const STEP = CW + GAP; // 20 cells per grid unit
    const GRID = CHUNK / STEP; // 4 tiles per axis
    const seed = this.testArea.seed;
    const PAD = CW;       // padding for adjacent tiles' border gradients

    // Deterministic per-cell direction choice (binary tree: north 70% / west 30%)
    const choosesNorth = (wx, wy) =>
      Math.abs(wx * 48611 + wy * 22769 + seed) % 100 < 70;

    // Padded grid for BFS — includes one ring of adjacent tiles so border
    // gradients are computed correctly across chunk boundaries
    const BFSW = CHUNK + 2 * PAD;
    const grid = [];
    for (let y = 0; y < BFSW; y++) {
      grid[y] = new Array(BFSW).fill(false);
    }

    // Carve helper — coordinates are chunk-relative, offset by PAD internally
    const carve = (gy, gx, h, w) => {
      for (let dy = 0; dy < h; dy++) {
        for (let dx = 0; dx < w; dx++) {
          const py = PAD + gy + dy, px = PAD + gx + dx;
          if (py >= 0 && py < BFSW && px >= 0 && px < BFSW) {
            grid[py][px] = true;
          }
        }
      }
    };

    // Stamp pre-defined tile types into the floor grid.
    // 16 tile types from 4-bit NSEW mask:
    //   0=VOID  1=DEAD_N  2=DEAD_S  3=STRAIGHT_V  4=DEAD_E  5=CORNER_NE
    //   6=CORNER_SE  7=T_EAST  8=DEAD_W  9=CORNER_NW  10=CORNER_SW
    //   11=T_WEST  12=STRAIGHT_H  13=T_NORTH  14=T_SOUTH  15=CROSS
    // Binary tree produces 8 types:
    //   Chose N → DEAD_N(1), STRAIGHT_V(3), CORNER_NE(5), T_EAST(7)
    //   Chose W → DEAD_W(8), CORNER_SW(10), STRAIGHT_H(12), T_SOUTH(14)
    //
    // Loop covers a 6x6 ring (-1..GRID) to include one layer of adjacent
    // tiles from neighboring chunks. The carve() function clips to the
    // padded grid bounds, so only border-adjacent portions are included.
    for (let gy = -1; gy <= GRID; gy++) {
      for (let gx = -1; gx <= GRID; gx++) {
        const wx = cx * CHUNK + gx * STEP;
        const wy = cy * CHUNK + gy * STEP;
        const y = gy * STEP;
        const x = gx * STEP;

        // Carve passage block (always present in every tile type)
        carve(y, x, CW, CW);

        // Carve south corridor
        if (choosesNorth(wx, wy + STEP)) carve(y + CW, x, GAP, CW);

        // Carve east corridor
        if (!choosesNorth(wx + STEP, wy)) carve(y, x + CW, CW, GAP);
      }
    }

    // BFS distance field on padded grid (Chebyshev, 3 wall layers)
    // 0 = floor, 1-3 = wall gradient (▒▓█), 255 = deep void
    const bfs = [];
    const queue = [];
    for (let y = 0; y < BFSW; y++) {
      bfs[y] = [];
      for (let x = 0; x < BFSW; x++) {
        if (grid[y][x]) { bfs[y][x] = 0; queue.push(y, x); }
        else bfs[y][x] = 255;
      }
    }
    let qi = 0;
    while (qi < queue.length) {
      const by = queue[qi++], bx = queue[qi++];
      const d = bfs[by][bx];
      if (d >= 3) continue;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const ny = by + dy, nx = bx + dx;
          if (ny >= 0 && ny < BFSW && nx >= 0 && nx < BFSW && bfs[ny][nx] > d + 1) {
            bfs[ny][nx] = d + 1;
            queue.push(ny, nx);
          }
        }
      }
    }

    // Extract center CHUNK x CHUNK from the padded BFS result
    const dist = [];
    for (let y = 0; y < CHUNK; y++) {
      dist[y] = [];
      for (let x = 0; x < CHUNK; x++) {
        dist[y][x] = bfs[PAD + y][PAD + x];
      }
    }

    this.testArea.chunks.set(key, dist);
  }

  _rebuildTestAreaTiles() {
    if (!this.testArea) return;
    const CHUNK = this.testArea.chunkSize;

    // Find bounding box of all generated chunks
    let minCX = Infinity, maxCX = -Infinity, minCY = Infinity, maxCY = -Infinity;
    for (const key of this.testArea.chunks.keys()) {
      const [cx, cy] = key.split(',').map(Number);
      if (cx < minCX) minCX = cx;
      if (cx > maxCX) maxCX = cx;
      if (cy < minCY) minCY = cy;
      if (cy > maxCY) maxCY = cy;
    }

    const tilesW = (maxCX - minCX + 1) * CHUNK;
    const tilesH = (maxCY - minCY + 1) * CHUNK;

    // Store the world offset so we can convert world coords to tile indices
    this.testArea.worldOffsetX = minCX * CHUNK;
    this.testArea.worldOffsetY = minCY * CHUNK;

    // Build tile array
    const tiles = [];
    for (let y = 0; y < tilesH; y++) {
      tiles[y] = [];
      for (let x = 0; x < tilesW; x++) {
        const worldX = x + this.testArea.worldOffsetX;
        const worldY = y + this.testArea.worldOffsetY;
        const cx = Math.floor(worldX / CHUNK);
        const cy = Math.floor(worldY / CHUNK);
        const lx = ((worldX % CHUNK) + CHUNK) % CHUNK;
        const ly = ((worldY % CHUNK) + CHUNK) % CHUNK;

        const chunk = this.testArea.chunks.get(`${cx},${cy}`);
        const d = chunk ? chunk[ly][lx] : 255;

        if (d === 0) {
          tiles[y][x] = { type: 'FLOOR', char: '\u25D8', fg: '#338833', bg: '#000000', walkable: true };
        } else if (d === 1) {
          tiles[y][x] = { type: 'WALL', char: '\u2592', fg: '#226622', bg: '#000000', walkable: false };
        } else if (d === 2) {
          tiles[y][x] = { type: 'WALL', char: '\u2593', fg: '#1a4d1a', bg: '#000000', walkable: false };
        } else if (d === 3) {
          tiles[y][x] = { type: 'WALL', char: '\u2588', fg: '#113311', bg: '#000000', walkable: false };
        } else {
          // Check for cap characters where walls meet void
          const getDist = (tx, ty) => {
            const wx = tx + this.testArea.worldOffsetX;
            const wy = ty + this.testArea.worldOffsetY;
            const tcx = Math.floor(wx / CHUNK);
            const tcy = Math.floor(wy / CHUNK);
            const tlx = ((wx % CHUNK) + CHUNK) % CHUNK;
            const tly = ((wy % CHUNK) + CHUNK) % CHUNK;
            const tc = this.testArea.chunks.get(`${tcx},${tcy}`);
            return tc ? tc[tly][tlx] : 255;
          };
          const dBelow = y < tilesH - 1 ? getDist(x, y + 1) : 255;
          const dAbove = y > 0 ? getDist(x, y - 1) : 255;
          if (dBelow <= 3) {
            tiles[y][x] = { type: 'WALL', char: '\u2584', fg: '#113311', bg: '#000000', walkable: false };
          } else if (dAbove <= 3) {
            tiles[y][x] = { type: 'WALL', char: '\u2580', fg: '#113311', bg: '#000000', walkable: false };
          } else {
            tiles[y][x] = { type: 'WALL', char: ' ', fg: '#000000', bg: '#000000', walkable: false };
          }
        }
      }
    }

    this.currentDungeon = {
      tiles,
      width: tilesW,
      height: tilesH,
      rooms: [],
      corridors: [],
      entitySpots: [],
      depth: 1,
    };

    // Adjust player position from world coords to tile array coords
    if (this.player) {
      this.player.position.x = this.player.position.x - this.testArea.worldOffsetX;
      this.player.position.y = this.player.position.y - this.testArea.worldOffsetY;
    }
  }

  _expandTestAreaIfNeeded() {
    if (!this.testArea) return;
    const CHUNK = this.testArea.chunkSize;

    // Convert player tile-array position back to world coords
    const worldX = this.player.position.x + this.testArea.worldOffsetX;
    const worldY = this.player.position.y + this.testArea.worldOffsetY;
    const pcx = Math.floor(worldX / CHUNK);
    const pcy = Math.floor(worldY / CHUNK);

    // Check if we need new chunks (generate 3 chunks ahead in each direction)
    let needsRebuild = false;
    for (let cy = pcy - 3; cy <= pcy + 3; cy++) {
      for (let cx = pcx - 3; cx <= pcx + 3; cx++) {
        const key = `${cx},${cy}`;
        if (!this.testArea.chunks.has(key)) {
          if (this.testArea.type === 'mazeB') {
            this._generateMazeChunkB(cx, cy);
          } else {
            this._generateMazeChunk(cx, cy);
          }
          needsRebuild = true;
        }
      }
    }

    if (needsRebuild) {
      // Save world-space position before rebuild
      const savedWorldX = worldX;
      const savedWorldY = worldY;

      // Temporarily set player to world coords for rebuild
      this.player.position.x = savedWorldX;
      this.player.position.y = savedWorldY;
      this._rebuildTestAreaTiles();
      // _rebuildTestAreaTiles converts from world to tile coords
    }
  }

  enterLocation(location) {
    const locId = typeof location.id === 'string' ? location.id.charCodeAt(0) : (location.id || 0);
    const locRng = new SeededRNG(this.seed + locId * 1000);
    this.currentSettlement = this.settlementGen.generate(locRng, location.type, location.population || 10, 'grassland');
    this.currentSettlement.name = location.name;
    this.currentSettlement.locationData = location;

    // Apply historical scars to settlement if applicable
    if (this.worldHistoryGen && this.worldHistoryGen.mapScars && this.worldHistoryGen.mapScars.length > 0) {
      const nearbyScars = this.worldHistoryGen.mapScars.filter(s => {
        // Match scars by checking if the location is in a scarred region
        const locName = (location.name || '').toLowerCase();
        const scarRegion = (s.regionName || '').toLowerCase();
        // Match if location name contains region name or vice versa, or random chance for scars without region names
        return locName.includes(scarRegion) || scarRegion.includes(locName) ||
          (s.severity > 0.6 && locRng.chance(0.15));
      });
      if (nearbyScars.length > 0) {
        this.settlementGen.applyHistoricalContext(this.currentSettlement, locRng, { scars: nearbyScars });
      }
    }

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

    // Save current zoom and set max zoom for town view
    this._preLocationZoom = this.renderer.densityLevel;
    this.renderer.setZoom(3);

    // Create location camera (sized for max zoom density)
    const density = this.renderer.densityLevel;
    this.locationCamera = new Camera(
      Math.floor((this.renderer.cols - 2) / density),
      Math.floor((this.renderer.rows - LAYOUT.HUD_TOTAL) / density)
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

    this.currentDungeonLocation = location;
    this.gameContext.currentLocationName = (location.name || 'Tower') + ` (Floor ${this.currentFloor + 1})`;
    this.setState('DUNGEON');
    this.ui.addMessage(`You enter the spire...`, COLORS.BRIGHT_MAGENTA);
    this._tryLocationQuest(location);
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

    this.currentDungeonLocation = location;
    this.gameContext.currentLocationName = location.name || 'Ruins';
    this.setState('DUNGEON');
    this.ui.addMessage(`You explore the ancient ruins...`, COLORS.BRIGHT_YELLOW);
    this._tryLocationQuest(location);
  }

  enterDungeon(location) {
    this.ui.addMessage('This area is not yet accessible.', COLORS.BRIGHT_YELLOW);
    return;
  }

  enterMechanicalRuin(location) {
    this.ui.addMessage('This area is not yet accessible.', COLORS.BRIGHT_YELLOW);
    return;
  }

  enterBridgeDungeon(location) {
    this.ui.addMessage('This area is not yet accessible.', COLORS.BRIGHT_YELLOW);
    return;
    // --- Stubbed out below ---
    const id = typeof location.id === 'string' ? location.id.charCodeAt(0) : (location.id || 0);
    const rng = new SeededRNG(this.seed + id * 9000 + 77777);

    // Determine which side the player approaches from (north/top or south/bottom)
    const py = this.player.position.y;
    const bridgeMidY = location.bridgeStartY != null
      ? Math.floor((location.bridgeStartY + location.bridgeEndY) / 2)
      : location.bridgeY;
    const enterFromNorth = py <= bridgeMidY;

    const bridge = this.bridgeGen.generate(rng, location);
    this.currentSettlement = bridge;
    this.currentSettlement.name = location.name || 'Ancient Bridge';
    this.currentSettlement.locationData = location;
    this.currentSettlement.isBridge = true;
    this.currentBridgeLocation = location;

    // Spawn enemies
    this.enemies = [];
    if (bridge.entitySpots) {
      for (const spot of bridge.entitySpots) {
        if (spot.type === 'enemy') {
          const creature = this.creatureGen.generate(rng, 'ruins', location.difficulty, this.player.stats.level);
          creature.position = { x: spot.x, y: spot.y };
          this.enemies.push(creature);
        }
      }
    }

    // Place items
    this.items = [];
    if (bridge.entitySpots) {
      for (const spot of bridge.entitySpots) {
        if (spot.type === 'item') {
          const item = this.itemGen.generate(rng,
            rng.random(['weapon', 'armor', 'potion']),
            this.itemGen.rollRarity(rng, location.difficulty),
            location.difficulty);
          item.position = { x: spot.x, y: spot.y };
          this.items.push(item);
        }
      }
    }

    // Spawn shop NPCs for bridge state 0
    this.npcs = [];
    if (bridge.entitySpots) {
      for (const spot of bridge.entitySpots) {
        if (spot.type === 'shop_npc') {
          const npc = {
            name: this.nameGen ? this.nameGen.generate(rng) : 'Bridge Merchant',
            role: 'merchant',
            char: '\u263A', // ☺ merchant character
            position: { x: spot.x, y: spot.y },
            dialogue: { greeting: 'Wares for the weary traveler... this bridge has seen better days.' },
            inventory: this._generateShopInventory(rng, location.difficulty),
          };
          this.npcs.push(npc);
        }
      }
    }

    // Place player at the correct end based on approach direction
    const bridgeCenterX = bridge.bridgeX || Math.floor(bridge.width / 2);
    if (enterFromNorth) {
      // Entered from north on world map → start at top of sublevel
      this.player.position.x = bridgeCenterX;
      this.player.position.y = 2;
    } else {
      // Entered from south on world map → start at bottom of sublevel
      this.player.position.x = bridgeCenterX;
      this.player.position.y = bridge.height - 3;
    }

    // Mark the bridge as discovered
    location.discovered = true;

    // Set up LOCATION state (same as enterLocation — outdoor rendering with day/night)
    this._preLocationZoom = this.renderer.densityLevel;
    this.renderer.setZoom(3);

    const density = this.renderer.densityLevel;
    this.locationCamera = new Camera(
      Math.floor((this.renderer.cols - 2) / density),
      Math.floor((this.renderer.rows - LAYOUT.HUD_TOTAL) / density)
    );
    this.locationCamera.follow(this.player);
    this.locationCamera.x = this.locationCamera.targetX;
    this.locationCamera.y = this.locationCamera.targetY;

    this.gameContext.currentLocationName = location.name || 'Ancient Bridge';
    this.gameContext.currentLocation = location;
    this.setState('LOCATION');

    // Flavor messages based on state
    if (location.bridgeState === 3) {
      this.ui.addMessage('You approach the ancient bridge. The structure groans ominously.', COLORS.BRIGHT_YELLOW);
      this.ui.addMessage('Massive sections have collapsed into the water below. There is no way across.', COLORS.BRIGHT_RED);
    } else if (location.bridgeState === 0) {
      this.ui.addMessage('You arrive at the bridge crossing. The old metalwork gleams in the light.', COLORS.BRIGHT_CYAN);
      this.ui.addMessage('Merchants have set up stalls near the bridge approach.', COLORS.BRIGHT_WHITE);
    } else if (location.bridgeState === 1) {
      this.ui.addMessage('You arrive at the bridge crossing. Something watches from the far shore...', COLORS.BRIGHT_RED);
    } else {
      this.ui.addMessage('You arrive at the abandoned bridge crossing. Wind whistles through the old metalwork.', COLORS.BRIGHT_CYAN);
    }
  }

  _exitBridgeDungeon(bridgeLoc, exitSide) {
    this.startTransition(() => {
      // If the bridge is broken and player discovered it, mark it on the world map
      if (bridgeLoc && bridgeLoc.bridgeState === 3 && !bridgeLoc.markedBroken) {
        bridgeLoc.markedBroken = true;
        this._markBridgeBroken(bridgeLoc);
      }

      this.currentSettlement = null;
      this.currentBridgeLocation = null;
      this.enemies = [];
      this.items = [];
      this.npcs = [];

      // Restore zoom level from before entering the bridge
      if (this._preLocationZoom) {
        this.renderer.setZoom(this._preLocationZoom);
        this._preLocationZoom = null;
      }

      // Place player on the correct side of the bridge on the overworld
      if (bridgeLoc) {
        const bx = bridgeLoc.bridgeX != null ? bridgeLoc.bridgeX : bridgeLoc.x;
        if (exitSide === 'east') {
          // Exit on south side — one tile south of bridge end
          this.player.position.x = bx;
          this.player.position.y = (bridgeLoc.bridgeEndY != null ? bridgeLoc.bridgeEndY : bridgeLoc.bridgeY) + 1;
        } else {
          // Exit on north side — one tile north of bridge start
          this.player.position.x = bx;
          this.player.position.y = (bridgeLoc.bridgeStartY != null ? bridgeLoc.bridgeStartY : bridgeLoc.bridgeY) - 1;
        }
      } else if (this.gameContext.currentLocation) {
        this.player.position.x = this.gameContext.currentLocation.x;
        this.player.position.y = this.gameContext.currentLocation.y;
      }

      this.gameContext.currentLocationName = 'World';
      this.gameContext.currentLocation = null;
      // Update camera viewport dimensions for restored zoom level
      const density = this.renderer.densityLevel;
      const viewW = this.renderer.cols - 2;
      const viewH = this.renderer.rows - LAYOUT.HUD_TOTAL;
      this.camera.viewportCols = Math.floor(viewW / density);
      this.camera.viewportRows = Math.floor(viewH / density);
      this.camera.follow(this.player);
      this.camera.x = this.camera.targetX;
      this.camera.y = this.camera.targetY;
      this._clearRenderCaches();
      this.renderer.invalidate();
      this.setState('OVERWORLD');

      if (exitSide === 'east') {
        this.ui.addMessage('You emerge from the south side of the bridge.', COLORS.WHITE);
      } else {
        this.ui.addMessage('You emerge from the north side of the bridge.', COLORS.WHITE);
      }
    });
  }

  _markBridgeBroken(bridgeLoc) {
    // Replace bridge tiles on the world map with red X markers
    if (!this.overworld) return;
    if (bridgeLoc.bridgeStartY != null) {
      // Vertical bridge (new horizontal river system)
      const x = bridgeLoc.bridgeX;
      for (let wy = bridgeLoc.bridgeStartY; wy <= bridgeLoc.bridgeEndY; wy++) {
        const cx = Math.floor(x / 32);
        const cy = Math.floor(wy / 32);
        const key = `${cx},${cy}`;
        const chunk = this.overworld.chunks.get(key);
        if (chunk) {
          const lx = ((x % 32) + 32) % 32;
          const ly = ((wy % 32) + 32) % 32;
          if (chunk.tiles[ly] && chunk.tiles[ly][lx]) {
            chunk.tiles[ly][lx] = {
              type: 'BROKEN_BRIDGE', char: 'X', fg: '#FF2222', bg: '#220000',
              walkable: false, biome: 'bridge', broken: true,
            };
          }
        }
      }
    } else {
      // Legacy horizontal bridge
      const y = bridgeLoc.bridgeY;
      for (let wx = bridgeLoc.bridgeStartX; wx <= bridgeLoc.bridgeEndX; wx++) {
        const cx = Math.floor(wx / 32);
        const cy = Math.floor(y / 32);
        const key = `${cx},${cy}`;
        const chunk = this.overworld.chunks.get(key);
        if (chunk) {
          const lx = ((wx % 32) + 32) % 32;
          const ly = ((y % 32) + 32) % 32;
          if (chunk.tiles[ly] && chunk.tiles[ly][lx]) {
            chunk.tiles[ly][lx] = {
              type: 'BROKEN_BRIDGE', char: 'X', fg: '#FF2222', bg: '#220000',
              walkable: false, biome: 'bridge', broken: true,
            };
          }
        }
      }
    }
  }

  _generateShopInventory(rng, difficulty) {
    const items = [];
    const count = rng.nextInt(3, 6);
    for (let i = 0; i < count; i++) {
      const type = rng.random(['weapon', 'armor', 'potion', 'potion']);
      const rarity = this.itemGen.rollRarity(rng, difficulty);
      items.push(this.itemGen.generate(rng, type, rarity, difficulty));
    }
    return items;
  }

  // ─── INPUT HANDLING ───

  handleInput(key) {
    // Handle debug quick-commands from touch UI
    if (typeof key === 'string' && key.startsWith('debug:')) {
      this._executeDebugButton(key.slice(6));
      this.input.updateTouchLayout(this.state); // refresh toggle indicators
      return;
    }
    // Toggle debug button bar with F2
    if (key === 'F2') {
      this.showDebugButtons = !this.showDebugButtons;
      return;
    }
    // Debug menu toggle
    if (key === '`') {
      if (this.state === 'DEBUG_MENU') {
        this.setState(this._debugReturnState || 'OVERWORLD');
      } else if (this.state === 'CONSOLE_LOG') {
        this.setState('DEBUG_MENU');
      } else {
        this._debugReturnState = this.state;
        this.ui.debugTab = 0;
        this.ui.debugCursor = 0;
        this.ui.debugScroll = 0;
        this.setState('DEBUG_MENU');
      }
      return;
    }
    // ── Gamepad Start Menu ──
    if (key === 'gamepad:menu') {
      const menuStates = ['OVERWORLD', 'LOCATION', 'DUNGEON'];
      if (menuStates.includes(this.state)) {
        this._gamepadMenuReturnState = this.state;
        this.gamepadMenuCursor = 0;
        this.setState('GAMEPAD_MENU');
      } else if (this.state === 'GAMEPAD_MENU') {
        this.setState(this._gamepadMenuReturnState || 'OVERWORLD');
      }
      return;
    }

    switch (this.state) {
      case 'PREAMBLE': return this.handlePreambleInput(key);
      case 'MENU': return this.handleMenuInput(key);
      case 'CHAR_CREATE': return this.handleCharCreateInput(key);
      case 'OVERWORLD': return this.handleOverworldInput(key);
      case 'LOCATION': return this.handleLocationInput(key);
      case 'DUNGEON': return this.handleDungeonInput(key);
      case 'DIALOGUE': return this.handleDialogueInput(key);
      case 'SHOP': return this.handleShopInput(key);
      case 'INVENTORY': return this.handleInventoryInput(key);
      case 'EQUIPMENT': return this.handleEquipmentInput(key);
      case 'CHARACTER': return this.handleGenericClose(key);
      case 'QUEST_LOG': return this.handleQuestLogInput(key);
      case 'MAP': return this.handleMapInput(key);
      case 'HELP': return this.handleHelpInput(key);
      case 'FACTION': return this.handleFactionInput(key);
      case 'SETTINGS': return this.handleSettingsInput(key);
      case 'GAME_OVER': return this.handleGameOverInput(key);
      case 'COMBAT': return this.handleCombatInput(key);
      case 'BATTLE_ENTER': return; // no input during enter animation
      case 'ENEMY_DEATH': return; // no input during death animation
      case 'BATTLE_RESULTS': return this.handleBattleResultsInput(key);
      case 'QUEST_COMPASS': return this.handleQuestCompassInput(key);
      case 'TRANSIT_MAP': return this.handleTransitMapInput(key);
      case 'DEBUG_MENU': return this.handleDebugMenuInput(key);
      case 'ASCII_CUTSCENE': return this.handleCutsceneInput(key);
      case 'VIDEO_CUTSCENE': return this.handleVideoCutsceneInput(key);
      case 'CONSOLE_LOG': return this.handleConsoleLogInput(key);
      case 'ALMANAC': return this.handleAlmanacInput(key);
      case 'GAMEPAD_MENU': return this.handleGamepadMenuInput(key);
      case 'REST_ITEM_SELECT': return this.handleRestItemSelectInput(key);
      case 'WORLD_GEN_PAUSE':
        this.setState('LOADING');
        this._worldGenRunStep(this._worldGenResumeStep);
        return;
    }
  }

  handlePreambleInput(key) {
    // Any key press transitions to the title screen
    this.setState('MENU');
  }

  handleMenuInput(key) {
    const result = this.ui.handleHorizontalMenuInput(key, 8);
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
          this.startNewGame();
          break;
        }
        case 2: { // Debug Start — tiny microcosm world for testing
          this.charGenState = {
            step: 'history_depth', race: 'human', playerClass: 'engineer',
            name: 'Debug', historyDepth: 'short', quickStart: true, debugMode: true,
          };
          this.startNewGame();
          break;
        }
        case 3: // Continue
          if (this.loadGame()) {
            this.ui.addMessage('Game loaded.', COLORS.BRIGHT_GREEN);
          } else {
            this.ui.addMessage('No save found.', COLORS.BRIGHT_RED);
          }
          break;
        case 4: // Import Save
          this.importSave();
          break;
        case 5: // Settings
          this.setState('SETTINGS');
          break;
        case 6: // Help
          this.setState('HELP');
          break;
        case 7: // Debug Adv — skip world gen, go to test area selector
          this.startDebugAdventure();
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
    // Airlock confirmation prompt — Y to proceed into vacuum, N to cancel
    if (this._pendingAirlockConfirm) {
      if (key === 'y' || key === 'Y') {
        const conf = this._pendingAirlockConfirm;
        if (!this.player._confirmedAirlocks) this.player._confirmedAirlocks = new Set();
        this.player._confirmedAirlocks.add(conf.key);
        this._pendingAirlockConfirm = null;
        this.ui.addMessage('You override the safety lock and open the airlock...', COLORS.BRIGHT_RED);
        // Re-attempt movement into that tile
        this.movePlayer(conf.x - this.player.position.x, conf.y - this.player.position.y);
        return;
      }
      this._pendingAirlockConfirm = null;
      this.ui.addMessage('You step back from the airlock. Find an EVA suit before proceeding.', COLORS.BRIGHT_CYAN);
      return;
    }

    // Open panels
    if (key === 'i' || key === 'I') { this.setState('INVENTORY'); return; }
    if (key === 'g' || key === 'G') { this.openEquipmentMenu(); return; }
    if (key === 'c' || key === 'C') { this.setState('CHARACTER'); return; }
    if (key === 'q' || key === 'Q') { this.setState('QUEST_LOG'); return; }
    if (key === 'm' || key === 'M') { this.setState('MAP'); return; }
    if (key === 'f' || key === 'F') { this.setState('FACTION'); return; }
    if (key === 'j' || key === 'J') { this._openQuestCompass(); return; }
    if (key === 'n' || key === 'N') { this._toggleQuestNav(); return; }
    if (key === '?') { this.setState('HELP'); return; }
    if (key === 'o' || key === 'O') { this.setState('SETTINGS'); return; }
    if (key === 'p' || key === 'P') { this.saveGame(1, { exportFile: true }); return; }
    if (key === 'l' || key === 'L') { this.setState('ALMANAC'); return; }
    if (key === 't' || key === 'T') { this._openTransitMap(); return; }

    // Zoom controls
    if (key === '+' || key === '=') { this._zoomIn(); return; }
    if (key === '-') { this._zoomOut(); return; }

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
          } else if (loc.type === 'mechanical_ruin') {
            this.enterMechanicalRuin(loc);
          } else if (loc.type === 'bridge_dungeon') {
            this.enterBridgeDungeon(loc);
          } else {
            this.enterLocation(loc);
          }
        });
      }
    }

    // Rest
    if (key === 'r' || key === 'R') {
      this.openRestItemSelect('OVERWORLD');
    }
  }

  handleLocationInput(key) {
    if (key === 'i' || key === 'I') { this.setState('INVENTORY'); return; }
    if (key === 'g' || key === 'G') { this.openEquipmentMenu(); return; }
    if (key === 'c' || key === 'C') { this.setState('CHARACTER'); return; }
    if (key === 'q' || key === 'Q') { this.setState('QUEST_LOG'); return; }
    if (key === 'm' || key === 'M') { this.setState('MAP'); return; }
    if (key === 'f' || key === 'F') { this.setState('FACTION'); return; }
    if (key === 'j' || key === 'J') { this._openQuestCompass(); return; }
    if (key === 'n' || key === 'N') { this._toggleQuestNav(); return; }
    if (key === '?') { this.setState('HELP'); return; }
    if (key === 'o' || key === 'O') { this.setState('SETTINGS'); return; }
    if (key === 'p' || key === 'P') { this.saveGame(1, { exportFile: true }); return; }
    if (key === 'l' || key === 'L') { this.setState('ALMANAC'); return; }

    // Zoom controls
    if (key === '+' || key === '=') { this._zoomIn(); return; }
    if (key === '-') { this._zoomOut(); return; }

    if (key === 'Escape') {
      // Bridge crossing: exit based on player Y position
      if (this.currentSettlement && this.currentSettlement.isBridge) {
        const bridgeLoc = this.currentBridgeLocation;
        const midY = Math.floor(this.currentSettlement.height / 2);
        const side = this.player.position.y < midY ? 'west' : 'east'; // west=north, east=south
        this._exitBridgeDungeon(bridgeLoc, side);
        return;
      }
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
        // Restore zoom level from before entering the town
        if (this._preLocationZoom) {
          this.renderer.setZoom(this._preLocationZoom);
          this._preLocationZoom = null;
        }
        // Update camera viewport dimensions for restored zoom level
        const density = this.renderer.densityLevel;
        const viewW = this.renderer.cols - 2;
        const viewH = this.renderer.rows - LAYOUT.HUD_TOTAL;
        this.camera.viewportCols = Math.floor(viewW / density);
        this.camera.viewportRows = Math.floor(viewH / density);
        this.camera.follow(this.player);
        this.camera.x = this.camera.targetX;
        this.camera.y = this.camera.targetY;
        this._clearRenderCaches();
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

    // Item pickup (direct shortcut)
    if (key === 'g' || key === 'G' || key === ',') {
      this._tryPickupItem();
    }

    // Talk to adjacent NPC (direct shortcut)
    if (key === 't' || key === 'T') {
      const nearNPC = this.findAdjacentNPC();
      if (nearNPC) { this.startDialogue(nearNPC); }
      return;
    }

    // Context-sensitive interact (Enter / A / ACT button)
    if (key === 'Enter') {
      // Priority 1: Talk to adjacent NPC
      const nearNPC = this.findAdjacentNPC();
      if (nearNPC) { this.startDialogue(nearNPC); return; }
      // Priority 2: Pick up item at feet
      if (this._tryPickupItem()) return;
      // Priority 3: Nothing nearby
      this.ui.addMessage('Nothing to interact with here.', COLORS.BRIGHT_BLACK);
    }
  }

  handleDungeonInput(key) {
    // Test area: simplified input handling
    if (this.testArea) {
      if (key === 'Escape') {
        this.currentDungeon = null;
        this.testArea = null;
        this.enemies = [];
        this.items = [];
        this._debugReturnState = this._debugAdvMode ? 'MENU' : 'OVERWORLD';
        this.ui.debugTab = 4;
        this.ui.debugCursor = 0;
        this.ui.debugScroll = 0;
        this.setState('DEBUG_MENU');
        this.ui.addMessage('[DEBUG] Returned to test area selector.', COLORS.BRIGHT_GREEN);
        return;
      }
      if (key === '?') { this.setState('HELP'); return; }
      // No zoom controls in test areas (locked to density 1)
      const dir = this.getDirection(key);
      if (dir) {
        this.movePlayerInDungeon(dir.dx, dir.dy);
      }
      return;
    }

    if (key === 'i' || key === 'I') { this.setState('INVENTORY'); return; }
    if (key === 'g' || key === 'G') { this.openEquipmentMenu(); return; }
    if (key === 'c' || key === 'C') { this.setState('CHARACTER'); return; }
    if (key === 'q' || key === 'Q') { this.setState('QUEST_LOG'); return; }
    if (key === 'j' || key === 'J') { this._openQuestCompass(); return; }
    if (key === 'n' || key === 'N') { this._toggleQuestNav(); return; }
    if (key === '?') { this.setState('HELP'); return; }
    if (key === 'o' || key === 'O') { this.setState('SETTINGS'); return; }
    if (key === 'l' || key === 'L') { this.setState('ALMANAC'); return; }

    // Zoom controls
    if (key === '+' || key === '=') { this._zoomIn(); return; }
    if (key === '-') { this._zoomOut(); return; }

    if (key === 'Escape') {
      this.startTransition(() => {
        this.currentDungeon = null;
        this.currentTower = null;
        this.currentSettlement = null;
        this.enemies = [];
        this.items = [];
        this.npcs = [];
        if (this.gameContext.currentLocation) {
          this.player.position.x = this.gameContext.currentLocation.x;
          this.player.position.y = this.gameContext.currentLocation.y;
        }
        this.gameContext.currentLocationName = 'World';
        this.gameContext.currentLocation = null;
        // Restore zoom level from before entering
        if (this._preLocationZoom) {
          this.renderer.setZoom(this._preLocationZoom);
          this._preLocationZoom = null;
        }
        // Update camera viewport dimensions for restored zoom level
        const density = this.renderer.densityLevel;
        const viewW = this.renderer.cols - 2;
        const viewH = this.renderer.rows - LAYOUT.HUD_TOTAL;
        this.camera.viewportCols = Math.floor(viewW / density);
        this.camera.viewportRows = Math.floor(viewH / density);
        this.camera.follow(this.player);
        this.camera.x = this.camera.targetX;
        this.camera.y = this.camera.targetY;
        this._clearRenderCaches();
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

    // Pick up items (direct shortcut)
    if (key === 'g' || key === 'G' || key === ',') {
      this._tryPickupItem();
    }

    // Context-sensitive interact (Enter / A / ACT button)
    if (key === 'Enter') {
      // Priority 1: Pick up item at feet
      if (this._tryPickupItem()) return;
      // Priority 2: Use stairs if standing on them
      if (this.currentDungeon && this.currentDungeon.tiles) {
        const tile = this.currentDungeon.tiles[this.player.position.y]?.[this.player.position.x];
        if (tile && (tile.type === 'STAIRS_DOWN' || tile.char === '>' || tile.type === 'STAIRS_UP' || tile.char === '<')) {
          const stairKey = (tile.type === 'STAIRS_DOWN' || tile.char === '>') ? '>' : '<';
          this.handleDungeonInput(stairKey);
          return;
        }
      }
      // Priority 3: Nothing nearby
      this.ui.addMessage('Nothing to interact with here.', COLORS.BRIGHT_BLACK);
      return;
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
            this.currentSettlement = null;
            this.enemies = [];
            this.items = [];
            this.npcs = [];
            if (this.gameContext.currentLocation) {
              this.player.position.x = this.gameContext.currentLocation.x;
              this.player.position.y = this.gameContext.currentLocation.y;
            }
            this.gameContext.currentLocationName = 'World';
            this.gameContext.currentLocation = null;
            // Restore zoom level from before entering
            if (this._preLocationZoom) {
              this.renderer.setZoom(this._preLocationZoom);
              this._preLocationZoom = null;
            }
            // Update camera viewport dimensions for restored zoom level
            const density = this.renderer.densityLevel;
            const viewW = this.renderer.cols - 2;
            const viewH = this.renderer.rows - LAYOUT.HUD_TOTAL;
            this.camera.viewportCols = Math.floor(viewW / density);
            this.camera.viewportRows = Math.floor(viewH / density);
            this.camera.follow(this.player);
            this.camera.x = this.camera.targetX;
            this.camera.y = this.camera.targetY;
            this._clearRenderCaches();
            this.renderer.invalidate();
            this.setState('OVERWORLD');
            this.ui.addMessage('You exit to the surface.', COLORS.WHITE);
          }
        }
      }
    }
  }

  handleDialogueInput(key) {
    if (key === '?') { this.setState('HELP'); return; }
    if (key === 'Escape') {
      this.activeNPC = null;
      this.setState(this.dialogueReturnState || 'LOCATION');
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
      this.setState(this.dialogueReturnState || 'LOCATION');
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
      this.setState(this.dialogueReturnState || 'LOCATION');
      return;
    }

    // ── Chain Quest handler (Bethesda faction questline) ──
    if (option.action === 'chainQuest') {
      const factionId = option._factionId || (this.activeNPC?.faction?.replace(/\s+/g, '_').toUpperCase());
      if (factionId) {
        const rank = this.factionSystem.getPlayerRank(factionId);
        const available = this.questSystem.getAvailableChainQuests(factionId, rank.rank, this.player.stats.level);
        // Also check non-faction chains (main quest)
        const mainChains = this.questSystem.getAvailableChainQuests(null, 0, this.player.stats.level);
        const allAvailable = [...available, ...mainChains];

        if (allAvailable.length > 0) {
          const pick = allAvailable[0]; // offer the first available chain quest
          const locData = this.currentSettlement?.locationData;
          const questCtx = { ...this.gameContext,
            settlementCoords: locData ? { x: locData.x, y: locData.y } : null,
            nearbyLocations: this.overworld?.getLoadedLocations() || [] };
          const quest = this.questSystem.generateChainQuest(this.rng, pick.chainId,
            this.activeNPC, this.player.stats.level, questCtx);
          if (quest) {
            this.questSystem.acceptQuest(quest.id);
            this.ui.addMessage(`Chain quest accepted: ${quest.title}`, COLORS.BRIGHT_YELLOW);
            this.ui.dialogueState.text = quest.description;
            this.ui.dialogueState.options = [
              { text: 'I\'ll see it done.', action: 'close' },
              { text: 'Tell me more about this place.', action: 'lore' },
            ];
            this.ui.resetSelection();
            return;
          }
        }
        // No chain quests available
        this.ui.dialogueState.text = rank.rank < 2
          ? `"You need to prove yourself more before I trust you with that kind of work. You're just a ${rank.name} to us."`
          : '"There\'s nothing for you right now. Check back later."';
        this.ui.dialogueState.options = [
          { text: 'Any other work?', action: 'quest' },
          { text: 'Goodbye.', action: 'close' },
        ];
        this.ui.resetSelection();
        return;
      }
    }

    // ── Faction Rank inquiry ──
    if (option.action === 'factionRank') {
      const factionId = option._factionId || (this.activeNPC?.faction?.replace(/\s+/g, '_').toUpperCase());
      if (factionId) {
        const rank = this.factionSystem.getPlayerRank(factionId);
        const faction = this.factionSystem._factions.get(factionId);
        const factionName = faction ? faction.name : factionId;
        this.ui.dialogueState.text = `Your standing with ${factionName}: ${rank.name} (Rank ${rank.rank}, Standing: ${rank.standing})`;
        this.ui.dialogueState.options = [
          { text: 'How do I advance?', action: 'close' },
          { text: 'Goodbye.', action: 'close' },
        ];
        this.ui.resetSelection();
        return;
      }
    }

    if (option.action === 'bounty') {
      const locData = this.currentSettlement?.locationData;
      const questCtx = { ...this.gameContext,
        settlementCoords: locData ? { x: locData.x, y: locData.y } : null,
        nearbyLocations: this.overworld?.getLoadedLocations() || [] };
      const quest = this.questSystem.generateQuest(this.rng, this.activeNPC,
        this.player.stats.level, questCtx);
      this.questSystem.acceptQuest(quest.id);
      this.ui.addMessage(`Bounty accepted: ${quest.title}`, COLORS.BRIGHT_YELLOW);
      this.activeNPC = null;
      this.setState(this.dialogueReturnState || 'LOCATION');
      return;
    }

    if (option.action === 'teach') {
      this.ui.addMessage('The archivist shares recovered data. +10 XP.', COLORS.BRIGHT_CYAN);
      this.player.addXP(10);
      return;
    }

    if (option.action === 'quest') {
      const locData = this.currentSettlement?.locationData;
      const questCtx = { ...this.gameContext,
        settlementCoords: locData ? { x: locData.x, y: locData.y } : null,
        nearbyLocations: this.overworld?.getLoadedLocations() || [] };
      const quest = this.questSystem.generateQuest(this.rng, this.activeNPC,
        this.player.stats.level, questCtx);
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
      const rumorCtx = {
        ...this.gameContext,
        nearbyLocations: this.overworld?.getLoadedLocations() || [],
        exploredLocations: this.player?.knownLocations || new Set(),
      };
      const { text: rawRumor, lead } = this.dialogueSys.generateRumorWithLead(this.rng, rumorCtx);
      const rumor = degradeTechTerms(rawRumor, 'common');
      let displayText = rumor;

      // If a quest lead was generated, register it
      if (lead) {
        const added = this.questSystem.addQuestLead(lead);
        if (added) {
          displayText += `\n\n"${lead.text}"`;
          this.ui.addMessage(`New lead discovered: ${lead.targetLocation}`, COLORS.BRIGHT_CYAN);
        }
      }

      this.ui.dialogueState.text = displayText;
      this.player.recordLore('rumors', rumor, this.activeNPC?.name?.full || 'Unknown');
      this.ui.dialogueState.options = [
        { text: 'Interesting. Anything else?', action: 'rumor' },
        { text: 'Thanks. Goodbye.', action: 'close' }
      ];
      this.ui.resetSelection();
      return;
    }

    if (option.action === 'lore') {
      const rawLore = this.loreGen.generateLocationHistory(this.rng,
        this.gameContext.currentLocationName, this.gameContext.currentLocation?.type || 'village');
      const loreLevel = (this.activeNPC?.category === 'knowledge') ? 'scholar' : 'common';
      const lore = degradeTechTerms(rawLore, loreLevel);
      this.ui.dialogueState.text = lore;
      this.player.recordLore('locations', lore, this.activeNPC?.name?.full || 'Unknown');
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
        const snippet = degradeTechTerms(this.worldHistoryGen.generateLoreSnippet(this.rng), 'scholar');
        this.ui.dialogueState.text = `"${snippet}"`;
        this.player.recordLore('history', snippet, this.activeNPC?.name?.full || 'Unknown');
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
        const snippet = degradeTechTerms(this.worldHistoryGen.generateLoreSnippet(this.rng, 'war'), 'scholar');
        this.ui.dialogueState.text = `"${snippet}"`;
        this.player.recordLore('history', snippet, this.activeNPC?.name?.full || 'Unknown');
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
        const snippet = degradeTechTerms(this.worldHistoryGen.generateLoreSnippet(this.rng, 'artifact'), 'scholar');
        this.ui.dialogueState.text = `"${snippet}"`;
        this.player.recordLore('artifacts', snippet, this.activeNPC?.name?.full || 'Unknown');
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
        const snippet = degradeTechTerms(this.worldHistoryGen.generateLoreSnippet(this.rng, 'figure'), 'scholar');
        this.ui.dialogueState.text = `"${snippet}"`;
        this.player.recordLore('figures', snippet, this.activeNPC?.name?.full || 'Unknown');
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
        const snippet = degradeTechTerms(this.worldHistoryGen.generateLoreSnippet(this.rng, 'religion'), 'scholar');
        this.ui.dialogueState.text = `"${snippet}"`;
        this.player.recordLore('religions', snippet, this.activeNPC?.name?.full || 'Unknown');
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
        const snippet = degradeTechTerms(this.worldHistoryGen.generateLoreSnippet(this.rng, 'tradition'), 'scholar');
        this.ui.dialogueState.text = `"${snippet}"`;
        this.player.recordLore('traditions', snippet, this.activeNPC?.name?.full || 'Unknown');
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
      this.player.recordLore('forbidden', text, this.activeNPC?.name?.full || 'Unknown');
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
      // Colony origin lore uses real terms — this IS the revelation
      this.ui.dialogueState.text = `"${text}"`;
      this.player.recordLore('forbidden', text, this.activeNPC?.name?.full || 'Unknown');
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
          // Lore reward from knowledge NPCs
          if (rewards.loreReward && this.worldHistoryGen) {
            const lr = rewards.loreReward;
            let loreText;
            if (lr.category === 'forbidden' && this.worldHistoryGen.preHistory) {
              const fk = this.rng.random(this.worldHistoryGen.preHistory.forbiddenKnowledge);
              loreText = fk.fragment;
            } else {
              loreText = this.worldHistoryGen.generateLoreSnippet(this.rng);
            }
            if (loreText) {
              this.player.recordLore(lr.category || 'history', loreText, this.activeNPC?.name?.full || 'Quest Reward');
              this.ui.addMessage('New lore discovered! Check your Journal.', COLORS.BRIGHT_MAGENTA);
            }
          }

          // ── Chain quest advancement ──
          if (rewards.chainAdvance) {
            if (rewards.chainAdvance.completed) {
              this.ui.addMessage(`Quest chain complete: ${rewards.chainAdvance.chainName}!`, COLORS.BRIGHT_YELLOW);
              this.renderer.flash('#FFD700', 0.8);
            } else {
              this.ui.addMessage(`${rewards.chainAdvance.chainName} continues... (Stage ${rewards.chainAdvance.nextStage + 1})`, COLORS.BRIGHT_CYAN);
            }
          }

          // ── Faction reputation consequences (Bethesda-style spillover) ──
          if (rewards.factionConsequences) {
            const changes = this.factionSystem.applyQuestFactionConsequences(rewards.factionConsequences);
            for (const change of changes) {
              if (change.rankChanged) {
                this.ui.addMessage(`${change.factionName}: Rank changed to ${change.newRankName}!`, change.amount > 0 ? COLORS.BRIGHT_GREEN : COLORS.BRIGHT_RED);
              } else if (Math.abs(change.amount) >= 5) {
                const sign = change.amount > 0 ? '+' : '';
                this.ui.addMessage(`${change.factionName}: ${sign}${change.amount} reputation`, change.amount > 0 ? COLORS.GREEN : COLORS.RED);
              }
            }
          } else if (rewards.factionRep && this.activeNPC?.faction && this.activeNPC.faction !== 'None') {
            // Standard faction rep with auto-calculated spillover
            const factionId = this.activeNPC.faction.replace(/\s+/g, '_').toUpperCase();
            const spillover = this.factionSystem.calculateFactionSpillover(factionId, rewards.factionRep);
            const changes = this.factionSystem.applyQuestFactionConsequences(spillover);
            for (const change of changes) {
              if (change.rankChanged) {
                this.ui.addMessage(`${change.factionName}: Rank changed to ${change.newRankName}!`, change.amount > 0 ? COLORS.BRIGHT_GREEN : COLORS.BRIGHT_RED);
              }
            }
          }

          // ── Reward items ──
          if (rewards.items && rewards.items.length > 0) {
            for (const item of rewards.items) {
              this.player.inventory.push(item);
              const rarityColor = item.rarity === 'legendary' ? COLORS.BRIGHT_YELLOW :
                item.rarity === 'epic' ? COLORS.BRIGHT_MAGENTA :
                item.rarity === 'rare' ? COLORS.BRIGHT_CYAN : COLORS.WHITE;
              this.ui.addMessage(`Received: ${item.name}${item.isUnique ? ' (Unique)' : ''}`, rarityColor);
            }
          }

          this.ui.addMessage('Quest completed!', COLORS.BRIGHT_GREEN);
          this.particles.emit(this.player.position.x, this.player.position.y, '*', COLORS.BRIGHT_GREEN, 8, 4, 15);
        }
      }
      this.activeNPC = null;
      this.setState(this.dialogueReturnState || 'LOCATION');
      return;
    }

    // ── Ambient NPC: small talk ──
    if (option.action === 'smallTalk') {
      const lines = [
        'Mm. Anyway...',
        '*nods*',
        'That\'s how it is around here.',
        'Take care of yourself out there.',
        'Well, you know how it goes.',
      ];
      const response = lines[Math.floor(Math.random() * lines.length)];
      this.ui.dialogueState.text = `"${option.text}"\n\n${this.activeNPC?.name?.first || 'They'}: "${response}"`;
      this.ui.dialogueState.options = [
        { text: 'Goodbye.', action: 'close' },
      ];
      this.ui.resetSelection();
      return;
    }

    // ── Ambient NPC: hint toward knowledge NPCs ──
    if (option.action === 'ambientHint') {
      const hints = [
        'I heard the scholar in the temple knows things most folk don\'t.',
        'If you want real answers, talk to the archivist. They spend all day in the old records.',
        'The priest mutters strange things sometimes. About the "old truth" or something. I don\'t ask.',
        'Word is the lorekeeper has been digging through sealed archives lately.',
        'There\'s a researcher who claims to know things about the deep levels. Spooky stuff.',
        'The guards know what\'s happening in the sector better than anyone. Ask them if you need work.',
      ];
      const hint = hints[Math.floor(Math.random() * hints.length)];
      this.ui.dialogueState.text = `"${hint}"`;
      this.ui.dialogueState.options = [
        { text: 'Thanks for the tip.', action: 'close' },
      ];
      this.dialogueSys.modifyReputation(this.activeNPC, 1, 'friendly chat');
      this.ui.resetSelection();
      return;
    }

    // ── Service NPC: trade tip ──
    if (option.action === 'tradeTip') {
      const tips = [
        'Salvaged alloy from the deep tunnels? Worth triple in the eastern settlements. Folks there can\'t mine it themselves.',
        'Don\'t buy potions from traveling merchants. The temple makes better ones for half the price.',
        'If you find old tech, bring it to a blacksmith before you sell it. Some of it can be reforged into something useful.',
        'The best gear comes from the ruins. Dangerous to get, but worth every shard.',
        'Buy food in farming settlements, sell it in mining towns. Basic, but it works.',
        'Armor from the old forges is worth a fortune if you can find it intact.',
      ];
      const tip = tips[Math.floor(Math.random() * tips.length)];
      this.ui.dialogueState.text = `*leans in* "${tip}"`;
      this.ui.dialogueState.options = [
        { text: 'Good to know. Thanks.', action: 'close' },
      ];
      this.dialogueSys.modifyReputation(this.activeNPC, 2, 'trade talk');
      this.ui.resetSelection();
      return;
    }

    if (option.action === 'close' || option.action === 'exit') {
      this.activeNPC = null;
      this.setState(this.dialogueReturnState || 'LOCATION');
      return;
    }
  }

  handleShopInput(key) {
    if (key === '?') { this.setState('HELP'); return; }
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
    if (key === '?') { this.setState('HELP'); return; }
    if (key === 'Escape') {
      this.setState(this.prevState || 'OVERWORLD');
      return;
    }

    // Build grouped items (same logic as drawInventory)
    const grouped = [];
    const seen = new Map();
    for (const item of this.player.inventory) {
      if (seen.has(item.name)) {
        grouped[seen.get(item.name)].count++;
      } else {
        seen.set(item.name, grouped.length);
        grouped.push({ item, count: 1 });
      }
    }

    const result = this.ui.handleMenuInput(key, Math.max(grouped.length, 1));

    if (result === 'select' || key === 'u' || key === 'U') {
      if (grouped.length > 0 && this.ui.selectedIndex < grouped.length) {
        const { item } = grouped[this.ui.selectedIndex];
        if (item.type === 'potion' || item.type === 'food' || item.type === 'rest') {
          this.useItem(item);
        }
      }
    }

    if (key === 'd' || key === 'D') {
      if (grouped.length > 0 && this.ui.selectedIndex < grouped.length) {
        const { item } = grouped[this.ui.selectedIndex];
        this.player.removeItem(item.id);
        this.ui.addMessage(`Dropped ${item.name}.`, COLORS.WHITE);
        // Rebuild grouped to check new length
        const newGrouped = [];
        const newSeen = new Map();
        for (const it of this.player.inventory) {
          if (newSeen.has(it.name)) {
            newGrouped[newSeen.get(it.name)].count++;
          } else {
            newSeen.set(it.name, newGrouped.length);
            newGrouped.push({ item: it, count: 1 });
          }
        }
        if (this.ui.selectedIndex >= newGrouped.length) {
          this.ui.selectedIndex = Math.max(0, newGrouped.length - 1);
        }
      }
    }

    if (result === 'back') {
      this.setState(this.prevState || 'OVERWORLD');
    }
  }

  // ─── EQUIPMENT MENU ───

  openEquipmentMenu() {
    this.equipmentMenuState = { level: 'slots', slotIndex: 0, itemIndex: 0 };
    this.setState('EQUIPMENT');
  }

  handleEquipmentInput(key) {
    if (key === '?') { this.setState('HELP'); return; }

    const SLOT_KEYS = ['head', 'chest', 'hands', 'legs', 'feet', 'mainHand', 'offHand', 'ring', 'amulet'];
    const SLOT_ITEMS = {
      head: ['helmet'], chest: ['chestplate'], hands: ['gloves'],
      legs: ['leggings'], feet: ['boots'],
      mainHand: ['sword', 'axe', 'mace', 'dagger', 'staff', 'bow'],
      offHand: ['shield'], ring: ['ring'], amulet: ['amulet'],
    };

    const st = this.equipmentMenuState;

    if (st.level === 'slots') {
      if (key === 'Escape') {
        this.setState(this.prevState || 'OVERWORLD');
        return;
      }
      if (key === 'ArrowUp' || key === 'w' || key === 'W') {
        st.slotIndex = (st.slotIndex - 1 + SLOT_KEYS.length) % SLOT_KEYS.length;
      } else if (key === 'ArrowDown' || key === 's' || key === 'S') {
        st.slotIndex = (st.slotIndex + 1) % SLOT_KEYS.length;
      } else if (key === 'Enter' || key === ' ') {
        // Open item sub-menu for this slot
        st.level = 'items';
        st.itemIndex = 0;
      } else if (key === 'u' || key === 'U') {
        // Unequip current slot
        const slot = SLOT_KEYS[st.slotIndex];
        if (this.player.equipment[slot]) {
          const item = this.player.equipment[slot];
          if (this.player.unequip(slot)) {
            this.ui.addMessage(`Unequipped ${item.name}.`, COLORS.WHITE);
          } else {
            this.ui.addMessage('Inventory full!', COLORS.BRIGHT_RED);
          }
        }
      }
    } else if (st.level === 'items') {
      const slot = SLOT_KEYS[st.slotIndex];
      const compatible = this.player.inventory.filter(i =>
        SLOT_ITEMS[slot].includes(i.subtype) || SLOT_ITEMS[slot].includes(i.type)
      );

      if (key === 'Escape') {
        st.level = 'slots';
        return;
      }
      // itemIndex 0 = [Back], 1+ = compatible items
      const totalItems = compatible.length + 1; // +1 for Back option
      if (key === 'ArrowUp' || key === 'w' || key === 'W') {
        st.itemIndex = (st.itemIndex - 1 + totalItems) % totalItems;
      } else if (key === 'ArrowDown' || key === 's' || key === 'S') {
        st.itemIndex = (st.itemIndex + 1) % totalItems;
      } else if (key === 'Enter' || key === ' ') {
        if (st.itemIndex === 0) {
          // Back
          st.level = 'slots';
        } else {
          const item = compatible[st.itemIndex - 1];
          if (item) {
            this.player.equip(item);
            this.ui.addMessage(`Equipped ${item.name}.`, COLORS.BRIGHT_GREEN);
            st.level = 'slots';
          }
        }
      }
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
    if (key === '?') { this.setState('HELP'); return; }

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
        this.setState(this._battleReturnState || 'DUNGEON');
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
            const deadEnemy = enemy;
            this.ui.addMessage(`${deadEnemy.name} defeated!`, COLORS.BRIGHT_GREEN);
            this.renderer.flash('#FFFFFF', 0.4);

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

            if (leveled.length > 0) {
              this.ui.addMessage(`Level up! Lv ${leveled[leveled.length - 1]}!`, COLORS.BRIGHT_YELLOW);
              this.renderer.flash('#FFFF00', 0.5);
              this.particles.emit(this.player.position.x, this.player.position.y, '*', COLORS.BRIGHT_YELLOW, 10, 4, 20);
            }

            const activeQuests = this.questSystem.getActiveQuests();
            for (const quest of activeQuests) {
              this.questSystem.updateProgress(quest.id, 'kill', deadEnemy.name, 1);
              this.questSystem.updateProgress(quest.id, 'kill', 'any', 1);
              if (this.questSystem.checkCompletion(quest.id)) {
                this.ui.addMessage(`Quest "${quest.title}" is ready to turn in!`, COLORS.BRIGHT_YELLOW);
              }
            }

            if (deadEnemy.faction) {
              this.factionSystem.modifyPlayerStanding(deadEnemy.faction, -5);
              if (deadEnemy.faction === 'MALFUNCTIONING') this.factionSystem.modifyPlayerStanding('SALVAGE_GUILD', 1);
              if (deadEnemy.faction === 'MUTANT') this.factionSystem.modifyPlayerStanding('COLONY_GUARD', 2);
              if (deadEnemy.faction === 'ALIEN') { this.factionSystem.modifyPlayerStanding('ARCHIVE_KEEPERS', 2); this.factionSystem.modifyPlayerStanding('COLONY_GUARD', 1); }
              if (deadEnemy.faction === 'ASSIMILATED') { this.factionSystem.modifyPlayerStanding('COLONY_GUARD', 3); this.factionSystem.modifyPlayerStanding('SALVAGE_GUILD', 2); this.factionSystem.modifyPlayerStanding('ARCHIVE_KEEPERS', 2); }
            }

            for (const npc of this.npcs) {
              if (distance(npc.position.x, npc.position.y, this.player.position.x, this.player.position.y) < 10) {
                this.dialogueSys.modifyReputation(npc, 3, 'defended settlement');
              }
            }

            this.enemies = this.enemies.filter(e => e !== deadEnemy);
            this.particles.emit(deadEnemy.position.x, deadEnemy.position.y, '*', COLORS.BRIGHT_RED, 5, 3, 12);

            this.battleResults = {
              enemyName: deadEnemy.name,
              xp,
              gold: loot.filter(i => i.type === 'gold').reduce((s, i) => s + i.amount, 0),
              items: loot.filter(i => i.type !== 'gold'),
              leveled,
            };
            this.battleResultsTimer = 0;
            // Start death disintegration animation (combatState kept alive)
            this.startEnemyDeath();
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
          this.renderer.flash('#FFFFFF', 0.4);

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

          if (leveled.length > 0) {
            this.ui.addMessage(`Level up! Lv ${leveled[leveled.length - 1]}!`, COLORS.BRIGHT_YELLOW);
            this.renderer.flash('#FFFF00', 0.5);
            this.particles.emit(this.player.position.x, this.player.position.y, '*', COLORS.BRIGHT_YELLOW, 10, 4, 20);
          }

          const activeQuests = this.questSystem.getActiveQuests();
          for (const quest of activeQuests) {
            this.questSystem.updateProgress(quest.id, 'kill', deadEnemy.name, 1);
            this.questSystem.updateProgress(quest.id, 'kill', 'any', 1);
            if (this.questSystem.checkCompletion(quest.id)) {
              this.ui.addMessage(`Quest "${quest.title}" is ready to turn in!`, COLORS.BRIGHT_YELLOW);
            }
          }

          if (deadEnemy.faction) {
            this.factionSystem.modifyPlayerStanding(deadEnemy.faction, -5);
            if (deadEnemy.faction === 'MALFUNCTIONING') this.factionSystem.modifyPlayerStanding('SALVAGE_GUILD', 1);
            if (deadEnemy.faction === 'MUTANT') this.factionSystem.modifyPlayerStanding('COLONY_GUARD', 2);
            if (deadEnemy.faction === 'ALIEN') { this.factionSystem.modifyPlayerStanding('ARCHIVE_KEEPERS', 2); this.factionSystem.modifyPlayerStanding('COLONY_GUARD', 1); }
            if (deadEnemy.faction === 'ASSIMILATED') { this.factionSystem.modifyPlayerStanding('COLONY_GUARD', 3); this.factionSystem.modifyPlayerStanding('SALVAGE_GUILD', 2); this.factionSystem.modifyPlayerStanding('ARCHIVE_KEEPERS', 2); }
          }

          for (const npc of this.npcs) {
            if (distance(npc.position.x, npc.position.y, this.player.position.x, this.player.position.y) < 10) {
              this.dialogueSys.modifyReputation(npc, 3, 'defended settlement');
            }
          }

          this.enemies = this.enemies.filter(e => e !== deadEnemy);
          this.particles.emit(deadEnemy.position.x, deadEnemy.position.y, '*', COLORS.BRIGHT_RED, 5, 3, 12);

          this.battleResults = {
            enemyName: deadEnemy.name,
            xp,
            gold: loot.filter(i => i.type === 'gold').reduce((s, i) => s + i.amount, 0),
            items: loot.filter(i => i.type !== 'gold'),
            leveled,
          };
          this.battleResultsTimer = 0;
          // Start death disintegration animation (combatState kept alive)
          this.startEnemyDeath();
        } else {
          this.setState('GAME_OVER');
          return;
        }
        return;
      }
    }
  }

  handleGenericClose(key) {
    if (key === '?') { this.setState('HELP'); return; }
    if (key === 'Escape') {
      this.setState(this.prevState || 'OVERWORLD');
    }
  }

  handleMapInput(key) {
    if (key === '?') { this.setState('HELP'); return; }
    if (key === 'Escape') {
      this.setState(this.prevState || 'OVERWORLD');
    } else if (key === '+' || key === '=') {
      this._zoomIn();
    } else if (key === '-') {
      this._zoomOut();
    }
  }

  handleFactionInput(key) {
    if (key === '?') { this.setState('HELP'); return; }
    if (key === 'Escape') {
      this.ui.factionScroll = 0;
      this.setState(this.prevState || 'OVERWORLD');
    } else if (key === 'ArrowUp' || key === 'w' || key === 'W') {
      this.ui.factionScroll = Math.max(0, (this.ui.factionScroll || 0) - 1);
    } else if (key === 'ArrowDown' || key === 's' || key === 'S') {
      this.ui.factionScroll = (this.ui.factionScroll || 0) + 1;
    }
  }

  // ─── QUEST LOG (with tracking) ───

  handleQuestLogInput(key) {
    if (key === '?') { this.setState('HELP'); return; }
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
    if (key === '?') { this.setState('HELP'); return; }
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

  // ─── RAPID TRANSIT SYSTEM ───

  _openTransitMap() {
    if (!this.sectionManager) {
      this.ui.addMessage('Transit system not available.', COLORS.BRIGHT_BLACK);
      return;
    }
    if (this.player.activatedTransitStations.size === 0) {
      this.ui.addMessage('No transit stations activated. Find a station in the inner hull corridors.', COLORS.BRIGHT_BLACK);
      return;
    }
    this._transitSelectedIdx = 0;
    this._transitDestinations = this._getTransitDestinations();
    if (this._transitDestinations.length === 0) {
      this.ui.addMessage('No destinations available.', COLORS.BRIGHT_BLACK);
      return;
    }
    this.setState('TRANSIT_MAP');
  }

  _getTransitDestinations() {
    const destinations = [];
    const sections = this.sectionManager.sections.filter(s => s.type !== 'inner_hull');
    for (const section of sections) {
      // Can only travel to sections connected by activated corridors
      const isAccessible = this.player.unlockedSections.has(section.id) ||
        this.player.activatedTransitStations.has(`HULL_${this.player.currentSection}_${section.id}`) ||
        this.player.activatedTransitStations.has(`HULL_${section.id}_${this.player.currentSection}`);

      if (section.id === this.player.currentSection) continue; // can't travel to self

      const biome = this.sectionManager.getBiome(section.id);
      const isVacuum = biome === 'vacuum';

      destinations.push({
        sectionId: section.id,
        label: section.label,
        type: section.type,
        biome: biome,
        accessible: isAccessible,
        blocked: isVacuum && !this.player.hasEVA,
        color: section.color || this._getBiomeColor(biome),
      });
    }
    return destinations;
  }

  _getBiomeColor(biome) {
    const colors = {
      lush: '#33DD44', desert: '#CCAA55', boreal_frozen: '#88BBDD',
      damaged: '#AA4422', vacuum: '#334455', swamp_toxic: '#44AA44',
      overgrown: '#22AA22',
    };
    return colors[biome] || '#888888';
  }

  handleTransitMapInput(key) {
    if (key === 'Escape' || key === 't' || key === 'T') {
      this.setState(this.prevState || 'OVERWORLD');
      return;
    }
    const dests = this._transitDestinations;
    if (!dests || dests.length === 0) return;

    if (key === 'ArrowUp' || key === 'w' || key === 'W') {
      this._transitSelectedIdx = (this._transitSelectedIdx - 1 + dests.length) % dests.length;
    }
    if (key === 'ArrowDown' || key === 's' || key === 'S') {
      this._transitSelectedIdx = (this._transitSelectedIdx + 1) % dests.length;
    }
    if (key === 'Enter' || key === 'e' || key === 'E') {
      const dest = dests[this._transitSelectedIdx];
      if (!dest.accessible) {
        this.ui.addMessage('Station not activated. Find the corridor station first.', COLORS.BRIGHT_RED);
        return;
      }
      if (dest.blocked) {
        this.ui.addMessage('VACUUM WARNING: EVA equipment required for this section.', COLORS.BRIGHT_RED);
        return;
      }
      // Teleport player to section center
      const center = this.sectionManager.getSectionCenter(dest.sectionId);
      if (center) {
        this.player.position.x = center.x;
        this.player.position.y = center.y;
        this.player.currentSection = dest.sectionId;
        if (!this.player.unlockedSections.has(dest.sectionId)) {
          this.player.unlockedSections.add(dest.sectionId);
        }
        if (!this.player.discoveredSections.has(dest.sectionId)) {
          this.player.discoveredSections.add(dest.sectionId);
        }
        this.overworld.ensureChunksAround(center.x, center.y);
        this.camera.x = center.x - Math.floor(this.renderer.cols / 2);
        this.camera.y = center.y - Math.floor(this.renderer.rows / 2);
        this.camera.targetX = this.camera.x;
        this.camera.targetY = this.camera.y;
        this.setState('OVERWORLD');
        this.ui.addMessage(`Transit complete. Arrived at ${dest.label}.`, COLORS.BRIGHT_CYAN);
        const biome = this.sectionManager.getBiome(dest.sectionId);
        if (biome === 'vacuum') this.ui.addMessage('WARNING: No atmosphere detected!', COLORS.BRIGHT_RED);
      }
    }
  }

  _renderTransitMap() {
    const r = this.renderer;
    const cols = r.cols;
    const rows = r.rows;

    // Draw background
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        r.drawChar(x, y, ' ', '#000000', '#0A0A14');
      }
    }

    const title = '═══ RAPID TRANSIT SYSTEM ═══';
    const titleX = Math.floor((cols - title.length) / 2);
    r.drawString(titleX, 2, title, '#FF6600');

    // Draw the ship diagram
    const diagramY = 5;
    const sectionLabels = ['C2', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'H7', 'ENG'];
    const sectionWidth = Math.min(7, Math.floor((cols - 4) / sectionLabels.length));
    const startX = Math.floor((cols - sectionLabels.length * sectionWidth) / 2);

    // Top bar (inner hull engineering)
    const barLabel = 'INNER HULL ENGINEERING / RAPID TRANSIT';
    const barX = Math.floor((cols - barLabel.length) / 2);
    r.drawString(barX, diagramY, barLabel, '#FF6600');

    // Section boxes
    for (let i = 0; i < sectionLabels.length; i++) {
      const label = sectionLabels[i];
      const x = startX + i * sectionWidth;
      const y = diagramY + 2;

      const sectionDef = this.sectionManager ? this.sectionManager.getSection(label) : null;
      const biome = this.sectionManager ? this.sectionManager.getBiome(label) : null;
      const isCurrent = this.player && this.player.currentSection === label;
      const isDiscovered = this.player && this.player.discoveredSections.has(label);

      // Color based on biome/type
      let bg = '#333333';
      let fg = '#AAAAAA';
      if (isCurrent) { bg = '#33AA33'; fg = '#FFFFFF'; }
      else if (label === 'C2') { bg = '#5544AA'; fg = '#CCBBFF'; }
      else if (label === 'ENG') { bg = '#991155'; fg = '#FFAACC'; }
      else if (biome === 'lush') { bg = '#226622'; fg = '#88FF88'; }
      else if (biome === 'desert') { bg = '#664400'; fg = '#DDAA55'; }
      else if (biome === 'boreal_frozen') { bg = '#224466'; fg = '#88BBDD'; }
      else if (biome === 'damaged') { bg = '#662200'; fg = '#FF6633'; }
      else if (biome === 'vacuum') { bg = '#111122'; fg = '#445566'; }
      else if (biome === 'swamp_toxic') { bg = '#114411'; fg = '#44FF44'; }
      else if (biome === 'overgrown') { bg = '#115511'; fg = '#33CC33'; }

      if (!isDiscovered) { bg = '#1A1A1A'; fg = '#444444'; }

      // Draw box
      for (let dy = 0; dy < 3; dy++) {
        for (let dx = 0; dx < sectionWidth - 1; dx++) {
          r.drawChar(x + dx, y + dy, ' ', fg, bg);
        }
      }

      // Label
      const labelX = x + Math.floor((sectionWidth - 1 - label.length) / 2);
      r.drawString(labelX, y + 1, isDiscovered ? label : '??', fg);

      // Current indicator
      if (isCurrent) {
        r.drawString(x + Math.floor((sectionWidth - 1) / 2), y - 1, '▼', '#FFFF00');
      }
    }

    // Bottom bar
    r.drawString(barX, diagramY + 6, barLabel, '#FF6600');

    // Destination list
    const dests = this._transitDestinations || [];
    const listY = diagramY + 9;
    r.drawString(3, listY, 'Select Destination:', '#FFFFFF');

    for (let i = 0; i < dests.length; i++) {
      const d = dests[i];
      const y = listY + 2 + i;
      const selected = i === (this._transitSelectedIdx || 0);
      const prefix = selected ? '► ' : '  ';

      let statusText = '';
      let statusColor = '#888888';
      if (!d.accessible) { statusText = ' [OFFLINE]'; statusColor = '#FF4444'; }
      else if (d.blocked) { statusText = ' [VACUUM - EVA REQ]'; statusColor = '#FF4444'; }
      else { statusText = ' [ONLINE]'; statusColor = '#44FF44'; }

      const biomeText = d.biome ? ` (${d.biome})` : '';
      const fg = selected ? '#FFFFFF' : '#AAAAAA';
      const bg = selected ? '#333344' : '#0A0A14';

      for (let x = 2; x < cols - 2; x++) r.drawChar(x, y, ' ', fg, bg);
      r.drawString(3, y, `${prefix}${d.label}${biomeText}`, fg);
      r.drawString(cols - 3 - statusText.length, y, statusText, statusColor);
    }

    // Controls
    const ctrlY = rows - 3;
    r.drawString(3, ctrlY, '↑↓ Navigate  Enter: Travel  Esc: Close', '#888888');

    // Section info
    if (dests.length > 0) {
      const sel = dests[this._transitSelectedIdx || 0];
      if (sel) {
        const infoY = listY + 2 + dests.length + 2;
        if (sel.biome === 'vacuum') {
          r.drawString(3, infoY, 'This section has been vented to space. Alien activity detected.', '#FF4444');
        } else if (sel.biome === 'boreal_frozen') {
          r.drawString(3, infoY, 'Hull breach caused catastrophic freezing. Boreal conditions persist.', '#88BBDD');
        } else if (sel.biome === 'damaged') {
          r.drawString(3, infoY, 'Severe structural damage. Fires and exposed infrastructure.', '#FF6633');
        } else if (sel.biome === 'swamp_toxic') {
          r.drawString(3, infoY, 'Life support malfunction. Biolab contamination and toxic atmosphere.', '#44FF44');
        } else if (sel.biome === 'lush') {
          r.drawString(3, infoY, 'Healthy ecosystem. Settlements and civilization thrive here.', '#33DD44');
        } else if (sel.biome === 'desert') {
          r.drawString(3, infoY, 'Deliberate arid biome for biodiversity. Sparse but habitable.', '#CCAA55');
        } else if (sel.biome === 'overgrown') {
          r.drawString(3, infoY, 'Nature has reclaimed this section. Dense jungle covers everything.', '#22AA22');
        } else if (sel.type === 'facility') {
          r.drawString(3, infoY, `Ship ${sel.label}. Technical facility — corridors, systems, data terminals.`, '#AAAAAA');
        }
      }
    }
  }

  _getQuestTargetCoords(quest) {
    // Use stored coordinates if available (new quests)
    if (quest.targetCoords) return quest.targetCoords;

    // Legacy fallback: text matching for old saves
    if (!this.overworld) return null;
    const locations = this.overworld.getLoadedLocations();

    // Check quest objectives for location references
    for (const obj of (quest.objectives || [])) {
      const desc = obj.description || '';
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

    return null;
  }

  handleHelpInput(key) {
    const tabCount = 8;
    const tab = this.ui.helpTab || 0;
    if (key === 'Escape') {
      this.ui.helpTab = 0;
      this.ui.helpScroll = 0;
      this.setState(this.prevState || 'OVERWORLD');
    } else if (key === 'ArrowRight' || key === 'd' || key === 'D' || key === '+') {
      this.ui.helpTab = (tab + 1) % tabCount;
      this.ui.helpScroll = 0;
    } else if (key === 'ArrowLeft' || key === 'a' || key === 'A' || key === '-') {
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
    if (key === '?') { this.setState('HELP'); return; }
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
    // Music controls
    if (key === 'v' || key === 'V') {
      const steps = [0, 0.25, 0.5, 0.75, 1.0];
      const curIdx = steps.indexOf(this.settings.musicVolume);
      this.settings.musicVolume = steps[(curIdx + 1) % steps.length];
      this.music.setVolume(this.settings.musicVolume);
      this._saveSettings();
    }
    if (key === 'm' || key === 'M') {
      this.settings.musicMuted = !this.settings.musicMuted;
      this.music.setMuted(this.settings.musicMuted);
      this._saveSettings();
    }
    // Export/Import
    if (key === '9') { this.exportSave(); }
    if (key === '0') { this.importSave(); }
    // CRT sub-options
    if (this.settings.crtEffects) {
      if (key === '6') { this.settings.crtGlow = !this.settings.crtGlow; this._saveSettings(); }
      if (key === '7') { this.settings.crtScanlines = !this.settings.crtScanlines; this._saveSettings(); }
      if (key === '8') { this.settings.crtAberration = !this.settings.crtAberration; this._saveSettings(); }
      if (key === '`' || key === '~') {
        const modes = ['auto', 'quarter', 'half', 'three-quarter', 'full'];
        const idx = modes.indexOf(this.settings.crtResolution);
        this.settings.crtResolution = modes[(idx + 1) % modes.length];
        this._applyCrtQuality();
        this._saveSettings();
      }
    }
  }

  handleDebugMenuInput(key) {
    if (key === '?') { this.setState('HELP'); return; }
    const ui = this.ui;
    const tab = ui.debugTab || 0;
    const entries = ui.getDebugEntries(this.debug, this.timeSystem, this.weatherSystem, this.renderer);
    const entryCount = entries.length;

    if (key === 'Escape') {
      this.setState(this._debugReturnState || 'OVERWORLD');
      return;
    }

    // Tab switching
    if (key >= '1' && key <= '6') {
      ui.debugTab = parseInt(key) - 1;
      ui.debugCursor = 0;
      ui.debugScroll = 0;
      return;
    }
    if (key === 'ArrowRight' || key === 'Tab') {
      ui.debugTab = (tab + 1) % 6;
      ui.debugCursor = 0;
      ui.debugScroll = 0;
      return;
    }
    if (key === 'ArrowLeft') {
      ui.debugTab = (tab - 1 + 6) % 6;
      ui.debugCursor = 0;
      ui.debugScroll = 0;
      return;
    }

    // Console log shortcut
    if (key === 'l' || key === 'L') {
      ui.consoleLogScroll = Math.max(0, this.ui.messageLog.length - (Math.min(this.renderer.rows - 2, 40) - 3));
      this.setState('CONSOLE_LOG');
      return;
    }

    // Info tab has no selectable entries
    if (tab === 3) return;

    // Cursor navigation
    if (key === 'ArrowDown' || key === 's' || key === 'S') {
      ui.debugCursor = Math.min((ui.debugCursor || 0) + 1, entryCount - 1);
      return;
    }
    if (key === 'ArrowUp' || key === 'w' || key === 'W') {
      ui.debugCursor = Math.max((ui.debugCursor || 0) - 1, 0);
      return;
    }

    // Activate current entry
    if (key === 'Enter' || key === ' ') {
      const entry = entries[ui.debugCursor || 0];
      if (!entry) return;
      this._executeDebugAction(entry);
      return;
    }
  }

  _executeDebugAction(entry) {
    if (entry.type === 'toggle') {
      switch (entry.key) {
        case 'invincible': this.debug.invincible = !this.debug.invincible; break;
        case 'noEncounters': this.debug.noEncounters = !this.debug.noEncounters; break;
        case 'infiniteAttack':
          this.debug.infiniteAttack = !this.debug.infiniteAttack;
          if (this.player) this.player._debugInfiniteAttack = this.debug.infiniteAttack;
          break;
        case 'infiniteMana': this.debug.infiniteMana = !this.debug.infiniteMana; break;
        case 'noClip': this.debug.noClip = !this.debug.noClip; break;
        case 'walkReallyReallyFast': this.debug.walkReallyReallyFast = !this.debug.walkReallyReallyFast; break;
        case 'disableShadows': this.debug.disableShadows = !this.debug.disableShadows; break;
        case 'disableLighting': this.debug.disableLighting = !this.debug.disableLighting; break;
        case 'disableClouds': this.debug.disableClouds = !this.debug.disableClouds; break;
        case 'crtEffects':
          this.renderer.enableCRT = !this.renderer.enableCRT;
          this.settings.crtEffects = this.renderer.enableCRT;
          break;
      }
    } else if (entry.type === 'action') {
      switch (entry.key) {
        case 'fullHeal':
          if (this.player) {
            this.player.stats.hp = this.player.stats.maxHp;
            this.player.stats.mana = this.player.stats.maxMana;
            this.ui.addMessage('[DEBUG] Full heal!', COLORS.BRIGHT_GREEN);
          }
          break;
        case 'giveXP':
          if (this.player) {
            const leveled = this.player.addXP(100);
            if (leveled.length) this.ui.addMessage(`[DEBUG] Level up! Lv ${leveled[leveled.length - 1]}`, COLORS.BRIGHT_YELLOW);
            else this.ui.addMessage('[DEBUG] +100 XP', COLORS.BRIGHT_CYAN);
          }
          break;
        case 'giveGold':
          if (this.player) { this.player.gold += 100; this.ui.addMessage('[DEBUG] +100 Gold', COLORS.BRIGHT_YELLOW); }
          break;
        case 'levelUp':
          if (this.player) {
            const needed = this.player.stats.xpToNext - this.player.stats.xp;
            this.player.addXP(needed);
            this.ui.addMessage(`[DEBUG] Level up! Lv ${this.player.stats.level}`, COLORS.BRIGHT_YELLOW);
          }
          break;
        case 'giveTorch':
          if (this.player) this.player.addItem(this.itemGen.generate(this.rng, 'light', 'common'));
          break;
        case 'giveLantern':
          if (this.player) this.player.addItem(this.itemGen.generate(this.rng, 'light', 'uncommon'));
          break;
        case 'giveWeapon':
          if (this.player) this.player.addItem(this.itemGen.generate(this.rng, 'weapon', 'rare', 5));
          break;
        case 'givePotion':
          if (this.player) this.player.addItem(this.itemGen.generate(this.rng, 'potion', 'uncommon'));
          break;
        case 'giveScroll':
          if (this.player) this.player.addItem(this.itemGen.generate(this.rng, 'scroll', 'rare', 5));
          break;
        case 'giveFood':
          if (this.player) this.player.addItem(this.itemGen.generate(this.rng, 'food', 'common'));
          break;
        case 'giveHelmet': this._giveDebugArmor('helmet'); break;
        case 'giveChest': this._giveDebugArmor('chestplate'); break;
        case 'giveGloves': this._giveDebugArmor('gloves'); break;
        case 'giveLegs': this._giveDebugArmor('leggings'); break;
        case 'giveBoots': this._giveDebugArmor('boots'); break;
        case 'giveShield': this._giveDebugArmor('shield'); break;
        case 'giveRing':
          if (this.player) this.player.addItem(this.itemGen.generate(this.rng, 'ring', 'rare', 5));
          break;
        case 'giveAmulet':
          if (this.player) this.player.addItem(this.itemGen.generate(this.rng, 'amulet', 'rare', 5));
          break;
        case 'giveArtifact':
          if (this.player) this.player.addItem(this.itemGen.generate(this.rng, 'artifact', 'rare', 5));
          break;
        case 'clearInv':
          if (this.player) { this.player.inventory = []; this.ui.addMessage('[DEBUG] Inventory cleared', COLORS.BRIGHT_RED); }
          break;
        case 'revealMap':
          if (this.overworld) {
            for (const loc of this.overworld.getLoadedLocations()) {
              this.player.knownLocations.add(loc.id);
            }
            this.debug.revealMap = true;
            this.ui.addMessage('[DEBUG] Map revealed', COLORS.BRIGHT_GREEN);
          }
          break;
        case 'advanceDay':
          this.timeSystem.advance(24);
          this.ui.addMessage('[DEBUG] Advanced 24 hours', COLORS.BRIGHT_CYAN);
          break;
        case 'teleport':
          if (this.player) {
            this.player.position.x = 50;
            this.player.position.y = 30;
            if (this.overworld) this.overworld.ensureChunksAround(50, 30);
            this.camera.follow(this.player);
            this.ui.addMessage('[DEBUG] Teleported to 50,30', COLORS.BRIGHT_CYAN);
          }
          break;
        // Test Areas
        case 'testMaze':
          this.enterTestMaze();
          break;
        case 'testMazeB':
          this.enterTestMazeB();
          break;
        // Hi-Res cutscene demos
        case 'cutscenePlasma':
        case 'cutsceneMatrix':
        case 'cutsceneNoise':
          this._startCutsceneDemo(entry.key.replace('cutscene', '').toLowerCase());
          break;
        case 'cutsceneVideo':
          this._promptVideoCutscene();
          break;
        case 'playVideoFile':
          this._pickAndPlayVideoCutscene();
          break;
        case 'playVideoUrl': {
          const name = prompt('Enter video filename in data/cutscenes/ (e.g. intro.webm):');
          if (name && name.trim()) {
            this._playVideoCutscene(`data/cutscenes/${name.trim()}`, 'DEBUG_MENU');
          }
          break;
        }
      }
    } else if (entry.type === 'slider') {
      if (entry.key === 'hour' && this.timeSystem) {
        this.timeSystem.hour = (this.timeSystem.hour + 1) % 24;
        this.debug.forceTimeOfDay = null;
      }
    } else if (entry.type === 'select') {
      if (entry.key === 'weather' && this.weatherSystem) {
        const opts = entry.options;
        const cur = this.weatherSystem.current;
        let idx = opts.indexOf(cur);
        idx = (idx + 1) % opts.length;
        const val = opts[idx];
        if (val === 'auto') {
          this.weatherSystem.duration = 0;
        } else {
          this.weatherSystem.current = val;
          this.weatherSystem.intensity = 0.7;
          this.weatherSystem.duration = 999;
        }
      }
    }
  }

  _giveDebugArmor(subtypeKey) {
    if (!this.player) return;
    const ARMOR_SUBTYPES = {
      helmet: { char: '^', name: 'Helmet' }, chestplate: { char: '[', name: 'Chestplate' },
      gloves: { char: '{', name: 'Gloves' }, leggings: { char: '=', name: 'Leggings' },
      boots: { char: '_', name: 'Boots' }, shield: { char: ']', name: 'Shield' },
    };
    const item = this.itemGen.generate(this.rng, 'armor', 'rare', 5);
    const st = ARMOR_SUBTYPES[subtypeKey];
    item.name = item.name.replace(/Helmet|Chestplate|Gloves|Leggings|Boots|Shield/, st.name);
    item.subtype = subtypeKey;
    item.char = st.char;
    this.player.addItem(item);
  }

  _startCutsceneDemo(name) {
    if (!this.cutscenePlayer) {
      this.cutscenePlayer = new AsciiCutscenePlayer();
    }
    // Save current font size, switch to half for 2x density
    this._cutsceneOrigFontSize = this.renderer.fontSize;
    this._cutsceneOrigUserFont = this.renderer._userFontSize;
    this.renderer.setFontSize(Math.max(7, Math.floor(this.renderer.fontSize / 2)));
    this.cutscenePlayer.start(name);
    this._cutsceneReturnState = 'DEBUG_MENU';
    this.setState('ASCII_CUTSCENE');
  }

  /**
   * Load and play a pre-rendered ASCII video cutscene (.azcut file).
   * @param {string} cutsceneId - Filename without extension in data/cutscenes/
   * @param {string} [returnState] - State to return to after playback
   * @param {boolean} [loop] - Whether to loop the cutscene
   */
  async _startVideoCutscene(cutsceneId, returnState, loop = false) {
    try {
      const data = await CutsceneLoader.load(`data/cutscenes/${cutsceneId}.azcut`);
      if (!this.cutscenePlayer) {
        this.cutscenePlayer = new AsciiCutscenePlayer();
      }
      // Save current font size, switch to half for 2x density
      this._cutsceneOrigFontSize = this.renderer.fontSize;
      this._cutsceneOrigUserFont = this.renderer._userFontSize;
      this.renderer.setFontSize(Math.max(7, Math.floor(this.renderer.fontSize / 2)));
      this.cutscenePlayer.startFrames(data, {
        onComplete: () => this.handleCutsceneInput('Escape'),
        loop,
      });
      this._cutsceneReturnState = returnState || this.state;
      this.setState('ASCII_CUTSCENE');
    } catch (e) {
      console.error(`Failed to load cutscene "${cutsceneId}":`, e);
      this.ui.addMessage(`Cutscene "${cutsceneId}" not found.`, '#ff6060');
    }
  }

  /**
   * Prompt for a cutscene filename via the browser prompt dialog,
   * then attempt to load and play it from data/cutscenes/.
   */
  _promptVideoCutscene() {
    const id = prompt('Enter cutscene filename (without .azcut extension):');
    if (id && id.trim()) {
      this._startVideoCutscene(id.trim(), 'DEBUG_MENU');
    }
  }

  handleCutsceneInput(key) {
    if (key === 'Escape') {
      if (this.cutscenePlayer) this.cutscenePlayer.stop();
      // Restore original font size
      if (this._cutsceneOrigFontSize) {
        this.renderer.setFontSize(this._cutsceneOrigFontSize);
        this.renderer._userFontSize = this._cutsceneOrigUserFont || false;
      }
      this.setState(this._cutsceneReturnState || 'DEBUG_MENU');
    }
  }

  // ─── Video Cutscene (WebM/MP4 playback) ────────────────

  /**
   * Play a pre-rendered ASCII video cutscene file.
   * @param {string} url - Full path or object URL of the video file
   * @param {string} [returnState] - State to return to after playback
   * @param {boolean} [loop] - Loop playback
   */
  async _playVideoCutscene(url, returnState, loop = false) {
    this._cutsceneReturnState = returnState || this.state;
    this.setState('VIDEO_CUTSCENE');
    await this.videoCutscene.play(url, {
      onComplete: () => this._endVideoCutscene(),
      loop,
    });
  }

  _endVideoCutscene() {
    this.videoCutscene.stop();
    this.setState(this._cutsceneReturnState || 'DEBUG_MENU');
  }

  handleVideoCutsceneInput(key) {
    if (key === 'Escape') {
      this._endVideoCutscene();
    }
  }

  /**
   * Open a file picker to select and play a local video file as a cutscene.
   */
  async _pickAndPlayVideoCutscene() {
    const url = await this.videoCutscene.pickLocalFile();
    if (url) {
      this._playVideoCutscene(url, 'DEBUG_MENU');
    }
  }

  handleConsoleLogInput(key) {
    if (key === '?') { this.setState('HELP'); return; }
    const total = this.ui.messageLog.length;
    const panelH = Math.min(this.renderer.rows - 2, 40);
    const contentH = panelH - 3;
    const maxScroll = Math.max(0, total - contentH);

    if (key === 'Escape') {
      this.setState('DEBUG_MENU');
      return;
    }
    if (key === 'ArrowDown' || key === 's' || key === 'S') {
      this.ui.consoleLogScroll = Math.min((this.ui.consoleLogScroll || 0) + 1, maxScroll);
      return;
    }
    if (key === 'ArrowUp' || key === 'w' || key === 'W') {
      this.ui.consoleLogScroll = Math.max((this.ui.consoleLogScroll || 0) - 1, 0);
      return;
    }
    if (key === 'PageDown') {
      this.ui.consoleLogScroll = Math.min((this.ui.consoleLogScroll || 0) + contentH, maxScroll);
      return;
    }
    if (key === 'PageUp') {
      this.ui.consoleLogScroll = Math.max((this.ui.consoleLogScroll || 0) - contentH, 0);
      return;
    }
    if (key === 'Home') {
      this.ui.consoleLogScroll = 0;
      return;
    }
    if (key === 'End') {
      this.ui.consoleLogScroll = maxScroll;
      return;
    }
  }

  handleAlmanacInput(key) {
    if (key === '?') { this.setState('HELP'); return; }
    const tabCount = 5;
    const tab = this.ui.almanacTab || 0;
    if (key === 'Escape') {
      this.ui.almanacTab = 0;
      this.ui.almanacScroll = 0;
      this.setState(this.prevState || 'OVERWORLD');
    } else if (key === 'ArrowRight' || key === 'd' || key === 'D') {
      this.ui.almanacTab = (tab + 1) % tabCount;
      this.ui.almanacScroll = 0;
    } else if (key === 'ArrowLeft' || key === 'a' || key === 'A') {
      this.ui.almanacTab = (tab - 1 + tabCount) % tabCount;
      this.ui.almanacScroll = 0;
    } else if (key === 'ArrowDown' || key === 's') {
      this.ui.almanacScroll = (this.ui.almanacScroll || 0) + 1;
    } else if (key === 'ArrowUp' || key === 'w') {
      this.ui.almanacScroll = Math.max(0, (this.ui.almanacScroll || 0) - 1);
    } else if (key === 'PageDown') {
      this.ui.almanacScroll = (this.ui.almanacScroll || 0) + 20;
    } else if (key === 'PageUp') {
      this.ui.almanacScroll = Math.max(0, (this.ui.almanacScroll || 0) - 20);
    } else if (key >= '1' && key <= '5') {
      this.ui.almanacTab = parseInt(key) - 1;
      this.ui.almanacScroll = 0;
    }
  }

  // ── FF-Style Gamepad Start Menu ──────────────────

  handleGamepadMenuInput(key) {
    const items = this.GAMEPAD_MENU_ITEMS;
    const count = items.length;

    if (key === 'Escape' || key === 'gamepad:menu') {
      // Close menu, return to gameplay
      this.setState(this._gamepadMenuReturnState || 'OVERWORLD');
      return;
    }
    if (key === 'ArrowUp' || key === 'w' || key === 'W') {
      this.gamepadMenuCursor = (this.gamepadMenuCursor - 1 + count) % count;
    } else if (key === 'ArrowDown' || key === 's' || key === 'S') {
      this.gamepadMenuCursor = (this.gamepadMenuCursor + 1) % count;
    } else if (key === 'Enter' || key === ' ') {
      const item = items[this.gamepadMenuCursor];
      if (item.action === 'save') {
        this.saveGame(1, { exportFile: true });
        this.setState(this._gamepadMenuReturnState || 'OVERWORLD');
      } else if (item.action === 'equipment') {
        this.openEquipmentMenu();
      } else if (item.action === 'rest') {
        this.openRestItemSelect(this._gamepadMenuReturnState || 'OVERWORLD');
      } else if (item.state) {
        this.setState(item.state);
      }
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

  _registerBump(dx, dy) {
    const now = performance.now();
    if (this._bumpState.dx === dx && this._bumpState.dy === dy
        && (now - this._bumpState.lastTime) < 800) {
      this._bumpState.count++;
    } else {
      this._bumpState.dx = dx;
      this._bumpState.dy = dy;
      this._bumpState.count = 1;
    }
    this._bumpState.lastTime = now;
    if (this._bumpState.count >= 3) {
      this._triggerBumpEffect();
    }
  }

  _triggerBumpEffect() {
    const extra = Math.min(this._bumpState.count - 3, 4);
    const intensity = 1.0 + extra * 0.3;
    // Shake whichever camera is active for the current state
    const cam = (this.state === 'LOCATION' && this.locationCamera)
      ? this.locationCamera : this.camera;
    cam.shake(intensity);
    this.renderer.flash('#FF4400', 0.12 + extra * 0.03);
  }

  movePlayer(dx, dy) {
    if (!this.overworld) return;

    const nx = this.player.position.x + dx;
    const ny = this.player.position.y + dy;

    const tile = this.overworld.getTile(nx, ny);

    // Section wall interaction
    if (tile.sectionWall) {
      const adjacent = this.sectionManager ? this.sectionManager.getAdjacentSections(this.player.currentSection) : {};
      const direction = dx > 0 ? 'east' : dx < 0 ? 'west' : (dy !== 0 ? null : null);
      const neighborId = direction === 'east' ? adjacent.east : direction === 'west' ? adjacent.west : null;

      if (neighborId) {
        const neighborBiome = this.sectionManager.getBiome(neighborId);
        const neighborSection = this.sectionManager.getSection(neighborId);
        const biomeDesc = neighborBiome === 'vacuum' ? 'vented to space' :
                          neighborBiome === 'boreal_frozen' ? 'frozen solid' :
                          neighborBiome === 'damaged' ? 'heavily damaged' :
                          neighborBiome === 'swamp_toxic' ? 'contaminated' :
                          neighborBiome === 'overgrown' ? 'overgrown' :
                          neighborBiome === 'desert' ? 'arid' :
                          neighborBiome === 'lush' ? 'green and alive' : 'unknown';

        this.ui.addMessage('A massive hull wall stretches from floor to sky. Find an airlock to pass through.', COLORS.BRIGHT_WHITE);
        this.ui.addMessage(`Beyond this wall lies ${neighborSection ? neighborSection.label : neighborId} — sensors indicate it is ${biomeDesc}.`, COLORS.BRIGHT_CYAN);

        if (!this.player.discoveredSections.has(neighborId)) {
          this.player.discoveredSections.add(neighborId);
          this.ui.addMessage(`Section ${neighborId} discovered!`, COLORS.BRIGHT_YELLOW);
        }

        if (neighborBiome === 'vacuum' && !this.player.hasEVA) {
          this.ui.addMessage('WARNING: Vacuum beyond. EVA equipment required.', COLORS.BRIGHT_RED);
        }
      } else {
        this.ui.addMessage('A massive hull wall stretches endlessly. This is the outer hull of the ship.', COLORS.BRIGHT_WHITE);
      }
      this._registerBump(dx, dy);
      return;
    }

    // Transit station interaction
    if (tile.transitStation) {
      const corridorId = tile.corridorId;
      if (!this.player.activatedTransitStations.has(corridorId)) {
        this.player.activatedTransitStations.add(corridorId);
        this.ui.addMessage('You\'ve found a Rapid Transit station!', COLORS.BRIGHT_YELLOW);
        this.ui.addMessage('Station activated. Press T to open the transit map.', COLORS.BRIGHT_GREEN);
      }
    }

    if (!tile.walkable) {
      this.ui.addMessage('You can\'t go that way.', COLORS.BRIGHT_BLACK);
      this._registerBump(dx, dy);
      return;
    }

    // Vacuum hazard check
    if (tile.biome === 'vacuum' && !tile.atmosphere && !tile.sealed) {
      if (!this.player.hasEVA) {
        const dmg = 10;
        this.player.stats.hp = Math.max(0, this.player.stats.hp - dmg);
        this.ui.addMessage(`VACUUM EXPOSURE! You can't breathe! (-${dmg} HP)`, COLORS.BRIGHT_RED);
        if (this.player.stats.hp <= 0) {
          this.setState('GAME_OVER');
          return;
        }
      }
    }

    // Toxic hazard check
    if (tile.hazard === 'toxic' || tile.hazard === 'toxic_gas') {
      const dmg = tile.hazard === 'toxic' ? 5 : 3;
      this.player.stats.hp = Math.max(1, this.player.stats.hp - dmg);
      this.ui.addMessage(`Toxic exposure! (-${dmg} HP)`, COLORS.BRIGHT_GREEN);
    }

    // Fire hazard check
    if (tile.hazard === 'fire') {
      const dmg = 4;
      this.player.stats.hp = Math.max(1, this.player.stats.hp - dmg);
      this.ui.addMessage(`The flames burn you! (-${dmg} HP)`, COLORS.BRIGHT_RED);
    }

    this.player.position.x = nx;
    this.player.position.y = ny;
    this._bumpState.count = 0;
    this.turnCount++;

    // Track current section
    if (this.sectionManager) {
      const currentSection = this.overworld.getSectionAtWorld(nx);
      if (currentSection && currentSection.id !== this.player.currentSection) {
        const prevSection = this.player.currentSection;
        this.player.currentSection = currentSection.id;
        this.gameContext.currentSection = currentSection.id;

        if (currentSection.type === 'inner_hull') {
          this.ui.addMessage('You enter the inner hull engineering corridor.', COLORS.BRIGHT_CYAN);
          this.ui.addMessage('Pipes and machinery hum around you. The air smells of ozone.', COLORS.WHITE);
        } else if (currentSection.type === 'facility') {
          this.ui.addMessage(`Entering ${currentSection.label}.`, COLORS.BRIGHT_MAGENTA);
        } else if (currentSection.type === 'habitat') {
          const biome = this.sectionManager.getBiome(currentSection.id);
          this.ui.addMessage(`Entering ${currentSection.label}.`, COLORS.BRIGHT_YELLOW);
          if (biome === 'vacuum') this.ui.addMessage('WARNING: No atmosphere detected!', COLORS.BRIGHT_RED);
          if (biome === 'boreal_frozen') this.ui.addMessage('The air is freezing cold.', COLORS.BRIGHT_CYAN);
          if (biome === 'damaged') this.ui.addMessage('Structural damage everywhere. Watch your step.', COLORS.BRIGHT_RED);
          if (biome === 'swamp_toxic') this.ui.addMessage('Toxic fumes fill the air.', COLORS.BRIGHT_GREEN);
          if (!this.player.unlockedSections.has(currentSection.id)) {
            this.player.unlockedSections.add(currentSection.id);
          }
          if (!this.player.discoveredSections.has(currentSection.id)) {
            this.player.discoveredSections.add(currentSection.id);
          }
        }
      }
    }

    // Ensure surrounding chunks are loaded
    this.overworld.ensureChunksAround(nx, ny);

    // Check for location
    const loc = this.overworld.getLocation(nx, ny);
    if (loc && !this.player.knownLocations.has(loc.id)) {
      this.player.knownLocations.add(loc.id);
      this.ui.addMessage(`Discovered: ${loc.name}! (Press Enter to visit)`, COLORS.BRIGHT_YELLOW);
    }

    // ── Temperature damage check ──
    const tileTemp = tile.temperature;
    if (tileTemp) {
      // Sum player's temperature resistance from equipped items
      let heatResist = 0, coldResist = 0;
      const equipped = this.player.equipment || {};
      for (const slotKey of Object.keys(equipped)) {
        const item = equipped[slotKey];
        if (item && item.stats) {
          heatResist += item.stats.heatResist || 0;
          coldResist += item.stats.coldResist || 0;
        }
      }
      let tempDmg = 0;
      let tempMsg = '';
      if (tileTemp === 'extreme_cold') {
        tempDmg = Math.max(1, 5 - coldResist);
        if (coldResist < 5) tempMsg = `The extreme cold bites into you! (-${tempDmg} HP)`;
      } else if (tileTemp === 'cold') {
        tempDmg = Math.max(0, 2 - coldResist);
        if (tempDmg > 0) tempMsg = `The freezing air chills you! (-${tempDmg} HP)`;
      } else if (tileTemp === 'extreme_hot') {
        tempDmg = Math.max(1, 5 - heatResist);
        if (heatResist < 5) tempMsg = `The scorching heat burns you! (-${tempDmg} HP)`;
      } else if (tileTemp === 'hot') {
        tempDmg = Math.max(0, 2 - heatResist);
        if (tempDmg > 0) tempMsg = `The intense heat saps your strength! (-${tempDmg} HP)`;
      }
      if (tempDmg > 0) {
        this.player.stats.hp = Math.max(1, this.player.stats.hp - tempDmg);
        this.ui.addMessage(tempMsg, tileTemp.includes('cold') ? COLORS.BRIGHT_CYAN : COLORS.BRIGHT_RED);
        if (this.player.stats.hp <= 1) {
          this.ui.addMessage('You need protective gear to survive here!', COLORS.BRIGHT_YELLOW);
        }
      }
      // First-entry warning
      if (!this.player._tempWarnings) this.player._tempWarnings = new Set();
      if (!this.player._tempWarnings.has(tileTemp)) {
        this.player._tempWarnings.add(tileTemp);
        const warnMsg = tileTemp.includes('cold')
          ? 'WARNING: You are entering a dangerously cold zone. Equip cold-resistant gear!'
          : 'WARNING: You are entering a dangerously hot zone. Equip heat-resistant gear!';
        this.ui.addMessage(warnMsg, COLORS.BRIGHT_YELLOW);
      }
    }

    // Random encounter on overworld (modified by events, weather, and night/light)
    // Reduced base rate + cooldown to prevent frustrating back-to-back encounters
    if (!this._encounterCooldown) this._encounterCooldown = 0;
    if (this._encounterCooldown > 0) this._encounterCooldown--;
    const baseEncounterRate = 0.03 * this.activeEffects.encounterRateMultiplier;
    const isNight = !this.timeSystem.isDaytime();
    const lightInfo = this.player.hasLightSource();
    let nightBonus = 1.0;
    if (isNight) {
      nightBonus = lightInfo.hasLight ? 1.3 : 2.0;
    }
    // Special events (e.g. BREACH_SWARM with encounterRateMultiplier >= 2) bypass cooldown
    const bypassCooldown = this.activeEffects.encounterRateMultiplier >= 2;
    if (!this.debug.noEncounters && (bypassCooldown || this._encounterCooldown <= 0) && this.rng.chance(baseEncounterRate * nightBonus)) {
      this._encounterCooldown = 8; // suppress encounters for ~8 steps after one
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

      this.startBattleTransition(enemy);
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

    // Bridge edge exit: walking off top or bottom exits the bridge zone
    if (this.currentSettlement.isBridge) {
      if (ny < 0) {
        // Walked off the top → exit north
        const bridgeLoc = this.currentBridgeLocation;
        this._exitBridgeDungeon(bridgeLoc, 'west'); // west = north side
        return;
      }
      if (ny >= this.currentSettlement.tiles.length) {
        // Walked off the bottom → exit south
        const bridgeLoc = this.currentBridgeLocation;
        this._exitBridgeDungeon(bridgeLoc, 'east'); // east = south side
        return;
      }
    }

    if (ny < 0 || ny >= this.currentSettlement.tiles.length) { this._registerBump(dx, dy); return; }
    if (nx < 0 || nx >= this.currentSettlement.tiles[0].length) { this._registerBump(dx, dy); return; }

    const tile = this.currentSettlement.tiles[ny][nx];
    if (tile.solid) { this._registerBump(dx, dy); return; }

    // NPCs block movement — player must press interact to talk
    const npcAt = this.npcs.find(n => n.position.x === nx && n.position.y === ny);
    if (npcAt) { this._registerBump(dx, dy); return; }

    // Bridge-specific: enemy collision triggers combat
    if (this.currentSettlement.isBridge) {
      const enemyAt = this.enemies.find(e => e.position.x === nx && e.position.y === ny);
      if (enemyAt) {
        this.startBattleTransition(enemyAt);
        return;
      }
    }

    this.player.position.x = nx;
    this.player.position.y = ny;
    this._bumpState.count = 0;
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

    if (ny < 0 || ny >= this.currentDungeon.tiles.length) { this._registerBump(dx, dy); return; }
    if (nx < 0 || nx >= this.currentDungeon.tiles[0].length) { this._registerBump(dx, dy); return; }

    const tile = this.currentDungeon.tiles[ny][nx];
    if (!tile.walkable) {
      this._registerBump(dx, dy);
      // Maze wall collision: apply speed reduction
      if (this.testArea) {
        this._mazeSlowTurns = 3;
        this.ui.addMessage('Wall impact! Speed reduced.', '#FF6644');
      }
      return;
    }

    // Test areas: skip combat, items, story, status, AI
    if (this.testArea) {
      // Wall collision slowdown: skip every other move input
      if (this._mazeSlowTurns > 0) {
        this._mazeSlowTurns--;
        if (this.turnCount % 2 === 1) return; // skip odd turns while slowed
      }
      this.player.position.x = nx;
      this.player.position.y = ny;
      this._bumpState.count = 0;
      this.playerFacingDir = { dx, dy };
      this.turnCount++;
      this._expandTestAreaIfNeeded();
      return;
    }

    // Check enemy collision -> combat
    const enemyAt = this.enemies.find(e => e.position.x === nx && e.position.y === ny);
    if (enemyAt) {
      this.startBattleTransition(enemyAt);
      return;
    }

    this.player.position.x = nx;
    this.player.position.y = ny;
    this._bumpState.count = 0;
    this.playerFacingDir = { dx, dy };
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

  // ─── CONTEXT-SENSITIVE INTERACT HELPERS ───

  /**
   * Try to pick up an item at the player's current position.
   * Returns true if an item interaction occurred (pickup or inventory full).
   */
  _tryPickupItem() {
    const px = this.player.position.x;
    const py = this.player.position.y;
    const item = this.items.find(i =>
      i.position && i.position.x === px && i.position.y === py);
    if (!item) return false;
    if (this.player.inventory.length >= 20) {
      this.ui.addMessage('Inventory full!', COLORS.BRIGHT_RED);
      return true;
    }
    this.player.addItem(item);
    this.items = this.items.filter(i => i !== item);
    this.ui.addMessage(`Picked up ${item.name}.`, COLORS.BRIGHT_GREEN);
    this.particles.emit(px, py, '+', COLORS.BRIGHT_GREEN, 3, 2, 8);
    // Update FETCH quest progress
    const activeQuests = this.questSystem.getActiveQuests();
    for (const quest of activeQuests) {
      this.questSystem.updateProgress(quest.id, 'fetch', item.name, 1);
      this.questSystem.updateProgress(quest.id, 'fetch', item.type, 1);
      if (this.questSystem.checkCompletion(quest.id)) {
        this.ui.addMessage(`Quest "${quest.title}" is ready to turn in!`, COLORS.BRIGHT_YELLOW);
      }
    }
    return true;
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

  // ── Location Quest Trigger — auto-generate quest on dungeon/ruin entry ──
  _tryLocationQuest(location) {
    // Quests are disabled for now
    return;
  }

  startDialogue(npc) {
    this.activeNPC = npc;
    // Save return state only on fresh dialogue entry (not when returning from shop)
    if (this.state !== 'DIALOGUE' && this.state !== 'SHOP') {
      this.dialogueReturnState = this.state;
    }
    const greeting = this.dialogueSys.generateGreeting(npc, npc.playerReputation || 0);
    // Enrich game context with faction rank for dialogue generation
    const npcFactionId = npc.faction && npc.faction !== 'None'
      ? npc.faction.replace(/\s+/g, '_').toUpperCase()
      : null;
    const dialogueContext = {
      ...this.gameContext,
      factionRank: npcFactionId ? this.factionSystem.getPlayerRank(npcFactionId) : null,
    };
    const options = this.dialogueSys.generateOptions(npc, npc.playerReputation || 0, dialogueContext);

    // Schedule-aware greeting modifier
    const schedulePrefix = this.dialogueSys.getScheduleGreeting(npc, this.timeSystem.hour);

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
      options: options,
      portrait: this.spriteManager.getPortrait(npc),
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
    } else if (item.type === 'rest') {
      if (item.subtype === 'cottage') {
        this.player.heal(this.player.stats.maxHp);
        this.player.stats.mana = this.player.stats.maxMana;
        this.statusEffects = this.statusEffects.filter(e => e.beneficial);
        this.ui.addMessage(`Used ${item.name}. Fully restored! Status ailments cleared.`, COLORS.BRIGHT_GREEN);
      } else {
        const restore = item.effect?.heal || 20;
        this.player.heal(restore);
        this.ui.addMessage(`Used ${item.name}. Restored ${restore} HP.`, COLORS.BRIGHT_GREEN);
      }
      this.timeSystem.advance(8);
      this.player.removeItem(item.id);
      this.saveGame();
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

  // ─── REST ITEM SELECTION ───

  openRestItemSelect(returnState) {
    const restItems = this.player.inventory.filter(i => i.type === 'rest');
    if (restItems.length === 0) {
      this.ui.addMessage('You have no rest items! (Tent, Sleeping Bag, or Cottage required)', COLORS.BRIGHT_RED);
      return;
    }
    this.restItemSelectList = restItems;
    this.restItemSelectCursor = 0;
    this._restItemSelectReturnState = returnState;
    this.setState('REST_ITEM_SELECT');
  }

  handleRestItemSelectInput(key) {
    const items = this.restItemSelectList;
    if (key === 'Escape') {
      this.setState(this._restItemSelectReturnState || 'OVERWORLD');
      return;
    }
    if (key === 'ArrowUp' || key === 'w' || key === 'W') {
      this.restItemSelectCursor = (this.restItemSelectCursor - 1 + items.length) % items.length;
    } else if (key === 'ArrowDown' || key === 's' || key === 'S') {
      this.restItemSelectCursor = (this.restItemSelectCursor + 1) % items.length;
    } else if (key === 'Enter' || key === ' ') {
      const chosen = items[this.restItemSelectCursor];
      this.useRestItemChosen(chosen);
      this.setState(this._restItemSelectReturnState || 'OVERWORLD');
    }
  }

  useRestItemChosen(chosen) {
    // Apply rest effects based on subtype
    if (chosen.subtype === 'cottage') {
      this.player.heal(this.player.stats.maxHp);
      this.player.stats.mana = this.player.stats.maxMana;
      this.statusEffects = this.statusEffects.filter(e => e.beneficial);
      this.ui.addMessage(`Used ${chosen.name}. Fully restored! Status ailments cleared.`, COLORS.BRIGHT_GREEN);
    } else if (chosen.subtype === 'tent') {
      const restore = chosen.effect?.heal || 20;
      this.player.heal(restore);
      this.ui.addMessage(`Used ${chosen.name}. Restored ${restore} HP.`, COLORS.BRIGHT_GREEN);
    } else if (chosen.subtype === 'sleeping_bag') {
      const restore = chosen.effect?.heal || 10;
      this.player.heal(restore);
      this.ui.addMessage(`Used ${chosen.name}. Restored ${restore} HP.`, COLORS.BRIGHT_GREEN);
    } else {
      const restore = chosen.effect?.heal || 10;
      this.player.heal(restore);
      this.ui.addMessage(`Used ${chosen.name}. Restored ${restore} HP.`, COLORS.BRIGHT_GREEN);
    }

    // Advance time
    this.timeSystem.advance(8);

    // Consume the item
    this.player.removeItem(chosen.id);

    // Auto-save
    this.saveGame();
  }

  // ─── SETTINGS ───

  _loadVersion() {
    fetch('version.json', { cache: 'no-store' })
      .then(r => r.json())
      .then(data => {
        const label = `${data.phase} ${data.version}`;
        document.title = `ASCIIQUEST [${label}]`;
        this.ui.versionString = label;
        this._currentVersion = data.version;
      })
      .catch(() => { /* version.json not found, use defaults */ });
  }

  _startVersionPolling() {
    const POLL_INTERVAL = 300000; // 5 minutes
    const AUTO_RELOAD_DELAY = 300000; // 5 minutes after detection
    setInterval(() => {
      fetch('version.json', { cache: 'no-store' })
        .then(r => r.json())
        .then(data => {
          if (this._currentVersion && data.version !== this._currentVersion && !this._updateAvailable) {
            this._updateAvailable = true;
            this._updateDetectedAt = Date.now();
            this._newVersion = `${data.phase} ${data.version}`;
          }
        })
        .catch(() => { /* ignore fetch errors */ });
    }, POLL_INTERVAL);
    this._autoReloadDelay = AUTO_RELOAD_DELAY;
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
      this._applyCrtQuality();
    }
    if (this.input) {
      this.input.enableTouch = this.settings.touchControls;
      if (this.settings.gamepadMode) this.input.setGamepadLayout(this.settings.gamepadMode);
    }
    if (this.music) {
      this.music.setVolume(this.settings.musicVolume);
      this.music.setMuted(this.settings.musicMuted);
    }
  }

  _saveSettings() {
    try {
      localStorage.setItem('asciiquest_settings', JSON.stringify(this.settings));
    } catch (e) { /* ignore */ }
    // Apply settings immediately
    this.renderer.enableCRT = this.settings.crtEffects;
    this.renderer.crtOptions = this.settings;
    this._applyCrtQuality();
    this.input.enableTouch = this.settings.touchControls;
    if (this.music) {
      this.music.setVolume(this.settings.musicVolume);
      this.music.setMuted(this.settings.musicMuted);
    }
  }

  // ─── SAVE/LOAD ───

  saveGame(slot = 1, { exportFile = false } = {}) {
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
          knownLocations: [...this.player.knownLocations],
          discoveredLore: this.player.discoveredLore,
        },
        time: {
          hour: this.timeSystem.hour,
          day: this.timeSystem.day,
          year: this.timeSystem.year
        },
        quests: this.questSystem.serialize(),
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
        trackedQuestId: this._trackedQuestId,
        historyDepth: this.charGenState ? this.charGenState.historyDepth : 'medium',
        messageLog: this.ui.messageLog.slice(-500),
        // O'Neill cylinder section state
        sectionData: this.sectionManager ? this.sectionManager.toSaveData() : null,
        playerSections: {
          currentSection: this.player.currentSection,
          unlockedSections: [...this.player.unlockedSections],
          discoveredSections: [...this.player.discoveredSections],
          activatedTransitStations: [...this.player.activatedTransitStations],
          hasEVA: this.player.hasEVA,
        },
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

      const saveJson = JSON.stringify(saveData);
      localStorage.setItem(`asciiquest_save_${slot}`, saveJson);
      // Also keep backwards-compatible key
      localStorage.setItem('asciiquest_save', saveJson);

      if (exportFile) {
        try {
          const text = exportSaveToText(saveJson);
          const blob = new Blob([text], { type: 'text/plain' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `asciiquest_save_${this.player ? this.player.name : 'unknown'}.txt`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          this.ui.addMessage('Game saved + backup file downloaded.', COLORS.BRIGHT_GREEN);
        } catch (exportErr) {
          this.ui.addMessage('File backup failed, but game saved locally.', COLORS.BRIGHT_YELLOW);
        }
      } else {
        this.ui.addMessage('Game saved.', COLORS.BRIGHT_GREEN);
      }
      return true;
    } catch (e) {
      this.ui.addMessage('Save failed!', COLORS.BRIGHT_RED);
      return false;
    }
  }

  exportSave(slot = 1) {
    try {
      const data = localStorage.getItem(`asciiquest_save_${slot}`);
      if (!data) {
        this.ui.addMessage('No save to export!', COLORS.BRIGHT_RED);
        return;
      }
      const text = exportSaveToText(data);
      const blob = new Blob([text], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `asciiquest_save_${this.player ? this.player.name : 'unknown'}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      this.ui.addMessage('Save exported!', COLORS.BRIGHT_GREEN);
    } catch (e) {
      this.ui.addMessage('Export failed!', COLORS.BRIGHT_RED);
    }
  }

  importSave() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.txt';
    input.style.display = 'none';
    input.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        const text = ev.target.result;
        const saveData = importSaveFromText(text);
        if (saveData) {
          localStorage.setItem('asciiquest_save_1', JSON.stringify(saveData));
          localStorage.setItem('asciiquest_save', JSON.stringify(saveData));
          if (this.loadGame()) {
            this.ui.addMessage('Save imported successfully!', COLORS.BRIGHT_GREEN);
          } else {
            this.ui.addMessage('Import failed: corrupted data.', COLORS.BRIGHT_RED);
          }
        } else {
          this.ui.addMessage('Invalid save file!', COLORS.BRIGHT_RED);
        }
      };
      reader.readAsText(file);
      document.body.removeChild(input);
    });
    document.body.appendChild(input);
    input.click();
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
      // Ensure sprites are loading
      this.spriteManager.preloadAll();
      // Try slot-based first, then fallback to legacy key
      let data = localStorage.getItem(`asciiquest_save_${slot}`);
      if (!data) data = localStorage.getItem('asciiquest_save');
      if (!data) return false;

      const save = JSON.parse(data);
      this.seed = save.seed;
      this.rng = new SeededRNG(this.seed);
      this.cloudSystem = new CloudSystem(this.seed);

      // Regenerate section manager and world from seed
      const savedDebugMode = !!(save.sectionData && save.sectionData.debugMode);
      this.debugMode = savedDebugMode;
      this.sectionManager = new SectionManager(this.seed, { debugMode: savedDebugMode });
      if (save.sectionData) {
        this.sectionManager.loadSaveData(save.sectionData);
      }
      this.overworld = new ChunkManager(this.seed, this.sectionManager);
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
      if (save.player.discoveredLore) this.player.discoveredLore = save.player.discoveredLore;

      // Restore section tracking
      if (save.playerSections) {
        this.player.currentSection = save.playerSections.currentSection || 'H4';
        this.player.unlockedSections = new Set(save.playerSections.unlockedSections || ['H4']);
        this.player.discoveredSections = new Set(save.playerSections.discoveredSections || ['H4']);
        this.player.activatedTransitStations = new Set(save.playerSections.activatedTransitStations || []);
        this.player.hasEVA = save.playerSections.hasEVA || false;
        this.gameContext.currentSection = this.player.currentSection;
      }

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

      // Restore quest system (new serialized format)
      if (save.quests) {
        if (save.quests.activeQuests) {
          // New format: full serialized quest system
          this.questSystem.deserialize(save.quests);
        } else if (save.quests.active) {
          // Legacy format: just active/completed arrays
          for (const q of save.quests.active) {
            this.questSystem._activeQuests.set(q.id, q);
          }
          for (const q of (save.quests.completed || [])) {
            this.questSystem._completedQuests.set(q.id, q);
          }
        }
        // Re-register chain definitions (chains are code-defined, not saved)
        for (const chainDef of QUEST_CHAIN_DEFINITIONS) {
          if (!this.questSystem._questChains.has(chainDef.id)) {
            this.questSystem._questChains.set(chainDef.id, chainDef);
          }
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

      // Restore message log
      if (save.messageLog) {
        this.ui.messageLog = save.messageLog;
      }

      // Regenerate world history from seed for almanac access
      if (!this.worldHistoryGen) {
        const depthConfigs = {
          short:  { eras: 3, yearsPerEra: 80, eventDensity: 0.7 },
          medium: { eras: 5, yearsPerEra: 120, eventDensity: 1.0 },
          long:   { eras: 7, yearsPerEra: 150, eventDensity: 1.3 },
          epic:   { eras: 11, yearsPerEra: 180, eventDensity: 1.6 },
        };
        const depthKey = save.historyDepth || 'medium';
        const depthCfg = depthConfigs[depthKey] || depthConfigs.medium;
        this.worldHistoryGen = new WorldHistoryGenerator(this.seed);
        this.worldHistory = this.worldHistoryGen.generate(depthCfg);
      }

      // Generate chunks around player position
      this.overworld.ensureChunksAround(this.player.position.x, this.player.position.y);

      this.camera.follow(this.player);
      // Engineering space is not persisted — fall back to overworld on load
      const loadState = save.state === 'ENGINEERING_SPACE' ? 'OVERWORLD' : (save.state || 'OVERWORLD');
      this.setState(loadState);
      return true;
    } catch (e) {
      return false;
    }
  }

  // ─── RENDERING ───

  render() {
    this.renderer.beginFrame();

    switch (this.state) {
      case 'PREAMBLE':
        this.ui.drawPreamble(this.renderer.cols, this.renderer.rows);
        break;

      case 'MENU':
        this.ui.drawMainMenu(this.renderer.cols, this.renderer.rows);
        break;

      case 'CHAR_CREATE':
        this.ui.drawCharCreation(this.charGenState);
        break;

      case 'LOADING':
        if (this._loadingStep) {
          this.ui.drawLoadingModal(this._loadingStep);
        } else if (this._worldGenEvents && this._worldGenEvents.length > 0) {
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
        this.ui.drawLocationOverview(this.currentSettlement, this.npcs, this.player, this.locationCamera, this.timeSystem.getSunDirection(), this.timeSystem.hour, this.currentSettlement && this.currentSettlement.isBridge ? this.enemies : null, this.currentSettlement && this.currentSettlement.isBridge ? this.items : null);
        this.ui.drawHUD(this.player, this.timeSystem, this.gameContext, this.statusEffects, this.weatherSystem);
        this._renderQuestNavIndicator();
        break;

      case 'DUNGEON':
        this.renderDungeon();
        this.ui.drawHUD(this.player, this.timeSystem, this.gameContext, this.statusEffects, this.weatherSystem);
        this._renderQuestNavIndicator();
        break;

      case 'DIALOGUE':
        // Animated dialogue background
        this.ui.drawDialogueBackground();
        if (this.ui.dialogueState) this.ui.drawDialogue(this.ui.dialogueState);
        break;

      case 'SHOP':
        if (this.ui.shopState) this.ui.drawShop(this.ui.shopState, this.player);
        break;

      case 'INVENTORY':
        this.ui.drawInventory(this.player);
        break;

      case 'EQUIPMENT':
        this.ui.drawEquipmentMenu(this.player, this.equipmentMenuState);
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

      case 'TRANSIT_MAP':
        this._renderTransitMap();
        break;

      case 'COMBAT':
        this.renderCombat();
        break;

      case 'BATTLE_ENTER':
        this.renderBattleEnter();
        break;

      case 'ENEMY_DEATH':
        this.renderEnemyDeath();
        break;

      case 'BATTLE_RESULTS':
        this.renderBattleResults();
        break;

      case 'SETTINGS':
        this.ui.drawSettings(this.settings);
        break;

      case 'DEBUG_MENU':
        this.ui.drawDebugMenu(this.debug, this.player, this.timeSystem, this.weatherSystem, this._debugReturnState || 'MENU', this.turnCount);
        break;

      case 'ASCII_CUTSCENE':
        if (this.cutscenePlayer) {
          this.cutscenePlayer.update(performance.now());
          this.cutscenePlayer.render(this.renderer);
        }
        break;

      case 'VIDEO_CUTSCENE':
        // Video element handles display — just draw ESC hint on canvas
        this.renderer.drawString(
          this.renderer.cols - 13, this.renderer.rows - 1,
          ' [ESC] Exit ', '#586078', '#000000'
        );
        break;

      case 'CONSOLE_LOG':
        this.ui.drawConsoleLog();
        break;

      case 'ALMANAC':
        this.ui.drawAlmanac(this.worldHistoryGen, this.ui.messageLog, this.player);
        break;

      case 'GAMEPAD_MENU': {
        // Render the underlying gameplay state first
        const returnSt = this._gamepadMenuReturnState || 'OVERWORLD';
        if (returnSt === 'OVERWORLD') {
          this.renderOverworld();
        } else if (returnSt === 'LOCATION') {
          if (this.locationCamera) { this.locationCamera.follow(this.player); this.locationCamera.update(); }
          this.ui.drawLocationOverview(this.currentSettlement, this.npcs, this.player, this.locationCamera, this.timeSystem.getSunDirection(), this.timeSystem.hour, this.currentSettlement && this.currentSettlement.isBridge ? this.enemies : null, this.currentSettlement && this.currentSettlement.isBridge ? this.items : null);
        } else if (returnSt === 'DUNGEON') {
          this.renderDungeon();
        }
        // Draw HUD over the gameplay render
        this.ui.drawHUD(this.player, this.timeSystem, this.gameContext, this.statusEffects, this.weatherSystem);
        // Greyscale the play area so the menu stands out
        this.renderer.applyGreyscale();
        // Overlay the FF-style menu
        this.ui.drawGamepadMenu(this.renderer, this.player, this.GAMEPAD_MENU_ITEMS, this.gamepadMenuCursor);
        break;
      }

      case 'REST_ITEM_SELECT': {
        // Render the underlying gameplay state first
        const returnSt = this._restItemSelectReturnState || 'OVERWORLD';
        if (returnSt === 'OVERWORLD') {
          this.renderOverworld();
        } else if (returnSt === 'LOCATION') {
          if (this.locationCamera) { this.locationCamera.follow(this.player); this.locationCamera.update(); }
          this.ui.drawLocationOverview(this.currentSettlement, this.npcs, this.player, this.locationCamera, this.timeSystem.getSunDirection(), this.timeSystem.hour, this.currentSettlement && this.currentSettlement.isBridge ? this.enemies : null, this.currentSettlement && this.currentSettlement.isBridge ? this.items : null);
        } else if (returnSt === 'DUNGEON') {
          this.renderDungeon();
        }
        this.ui.drawHUD(this.player, this.timeSystem, this.gameContext, this.statusEffects, this.weatherSystem);
        // Greyscale the play area so the menu stands out
        this.renderer.applyGreyscale();
        this.ui.drawRestItemSelect(this.renderer, this.restItemSelectList, this.restItemSelectCursor);
        break;
      }
    }

    // Debug button bar overlay (when toggled with F2)
    if (this.showDebugButtons && this.state !== 'MENU' && this.state !== 'DEBUG_MENU') {
      this._debugButtonRects = this.ui.drawDebugButtons(this.debug, this.timeSystem, this.weatherSystem, this.renderer);
    } else {
      this._debugButtonRects = [];
    }

    // Force full redraw when post-processing, transitions, or flash
    // will modify the canvas after buffer snapshot — otherwise dirty
    // tracking leaves stale post-processed pixels on unchanged cells
    const hasTimeTint = ['OVERWORLD', 'LOCATION', 'DUNGEON', 'GAMEPAD_MENU'].includes(this.state);
    const isAnimatedScreen = this.state === 'QUEST_COMPASS' || this.state === 'MENU' || this.state === 'LOADING' || this.state === 'WORLD_GEN_PAUSE' || this.state === 'COMBAT' || this.state === 'BATTLE_ENTER' || this.state === 'ENEMY_DEATH' || this.state === 'BATTLE_RESULTS' || this.state === 'ASCII_CUTSCENE' || this.state === 'VIDEO_CUTSCENE' || this.state === 'DIALOGUE';
    const needsFullRedraw = this.renderer.effectsEnabled
      || this.transitionTimer > 0
      || hasTimeTint
      || isAnimatedScreen
      || (this.renderer._flashAlpha && this.renderer._flashAlpha > 0);
    this.renderer.endFrame(needsFullRedraw);

    // ── Pixel art overlays (rendered after character grid, before CRT) ──
    if (this.state === 'DIALOGUE' && this.ui.dialogueState && this.ui.dialogueState.portrait) {
      this.ui.drawPortraitOverlay(this.ui.dialogueState);
    }
    if (this.state === 'COMBAT' && this.ui._enemySpriteOverlay) {
      const eso = this.ui._enemySpriteOverlay;
      const ctx = this.renderer.ctx;
      const cw = this.renderer.cellWidth;
      const ch = this.renderer.cellHeight;
      // Use exact integer-scaled pixel dims when available for crisp pixel art
      const pw = eso.pxW || Math.round(eso.w * cw);
      const ph = eso.pxH || Math.round(eso.h * ch);
      // Center the pixel-precise size within the cell region
      const px = Math.round(eso.col * cw + (eso.w * cw - pw) / 2);
      const py = Math.round(eso.row * ch + (eso.h * ch - ph) / 2);

      // Draw sprite
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(eso.img, px, py, pw, ph);

      // Hit flash: re-draw sprite with lighter compositing to tint white
      if (eso.flash) {
        ctx.globalAlpha = 0.7;
        ctx.globalCompositeOperation = 'lighter';
        ctx.drawImage(eso.img, px, py, pw, ph);
        ctx.globalAlpha = 1;
      }
      ctx.restore();
      this.ui._enemySpriteOverlay = null;
    }

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

      // Apply weather ambient lighting (skip in overworld — weather disabled there)
      if (this.state !== 'OVERWORLD') {
        const weatherAmbient = this.weatherSystem.getAmbientEffect();
        if (weatherAmbient) {
          let wAlpha = weatherAmbient.tintAlpha;
          if (weatherAmbient.pulseSpeed > 0) {
            const pulse = Math.sin((this.renderer._frameTimeSec || Date.now() / 1000) * weatherAmbient.pulseSpeed) * weatherAmbient.pulseAmount;
            wAlpha = Math.max(0, Math.min(1, wAlpha + pulse));
          }
          this.renderer.tintViewport(weatherAmbient.tintColor, wAlpha, viewLeft, viewTop, viewW, viewH);

          // Brightness shift across viewport (single tint call instead of per-cell)
          const bShift = weatherAmbient.brightnessShift;
          if (bShift < 0) {
            this.renderer.tintViewport('#000000', Math.abs(bShift), viewLeft, viewTop, viewW, viewH);
          } else if (bShift > 0) {
            // Screen-blend bright tint over viewport
            const ctx = this.renderer.ctx;
            const x = viewLeft * this.renderer.cellWidth;
            const y = viewTop * this.renderer.cellHeight;
            const w = viewW * this.renderer.cellWidth;
            const h = viewH * this.renderer.cellHeight;
            ctx.save();
            ctx.globalCompositeOperation = 'screen';
            ctx.globalAlpha = bShift;
            ctx.fillStyle = '#FFEEAA';
            ctx.fillRect(x, y, w, h);
            ctx.restore();
          }

          // Lightning flashes for high-energy weather
          const weather = this.weatherSystem.current;
          const wIntensity = this.weatherSystem.intensity;
          let flashChance = 0, flashColor = '#FFFFFF';
          if (weather === 'storm') { flashChance = wIntensity * 0.005; flashColor = '#FFFFFF'; }
          else if (weather === 'ion_storm') { flashChance = wIntensity * 0.008; flashColor = '#FFFF44'; }
          else if (weather === 'data_storm') { flashChance = wIntensity * 0.006; flashColor = '#FF0088'; }
          if (flashChance > 0 && Math.random() < flashChance) {
            this.renderer.flash(flashColor, 0.6 + Math.random() * 0.3);
          }
        }
      }

      // Apply shadow darkening in overworld (post-process on canvas)
      if (this.state === 'OVERWORLD' && this._shadowBufData) {
        const sBuf = this._shadowBufData;
        const sW = this._shadowViewW;
        const sH = this._shadowViewH;
        for (let sy = 0; sy < sH; sy++) {
          const rowOff = sy * sW;
          for (let sx = 0; sx < sW; sx++) {
            const alpha = sBuf[rowOff + sx];
            if (alpha > 0) {
              this.renderer.darkenCell(viewLeft + sx, viewTop + sy, alpha);
            }
          }
        }

        // Gradient directional darkening on forest/object interiors
        if (this._highlightBuf) {
          const gBuf = this._highlightBuf;
          for (let gy = 0; gy < sH; gy++) {
            const rowOff = gy * sW;
            for (let gx = 0; gx < sW; gx++) {
              const alpha = gBuf[rowOff + gx];
              if (alpha > 0) {
                this.renderer.darkenCell(viewLeft + gx, viewTop + gy, alpha);
              }
            }
          }
        }

        // God rays / sunbeams in unshadowed areas (throttled: recompute every 3rd frame)
        // Works for both sun (day) and moon (night)
        const owSunDir = this.timeSystem.getSunDirection();
        const hasShadows = sBuf.some(v => v > 0);
        if (hasShadows && this.renderer._godRayNoise) {
          this._godRayFrame++;
          const camX = Math.floor(this.camera.getRenderX());
          const camY = Math.floor(this.camera.getRenderY());
          const cameraMoved = camX !== this._godRayCacheCamX || camY !== this._godRayCacheCamY;
          if (!this._godRayCachedCells || this._godRayFrame % 3 === 0 || cameraMoved) {
            // Recompute god rays
            this._godRayCacheCamX = camX;
            this._godRayCacheCamY = camY;
            const cells = [];
            const perpX = -(owSunDir.dy || 0);
            const perpY = owSunDir.dx || 0;
            const ts = (this.renderer._frameTimeSec || Date.now() / 1000);
            // Along-ray direction (shadow direction = away from sun)
            const alongX = owSunDir.dx || 0;
            const alongY = owSunDir.dy || 0;
            // Compute projection range across viewport for normalization
            const c0 = 0, c1 = (viewW - 1) * alongX, c2 = (viewH - 1) * alongY, c3 = c1 + c2;
            const minAlong = Math.min(c0, c1, c2, c3);
            const maxAlong = Math.max(c0, c1, c2, c3);
            const alongRange = maxAlong - minAlong || 1;
            for (let sy = 0; sy < sH; sy++) {
              const rowOff = sy * sW;
              for (let sx = 0; sx < sW; sx++) {
                if (sBuf[rowOff + sx] > 0) continue;
                let nearShadow = false;
                for (let nd = 1; nd <= 2; nd++) {
                  const ckx = sx + Math.round(alongX * nd);
                  const cky = sy + Math.round(alongY * nd);
                  if (ckx >= 0 && ckx < sW && cky >= 0 && cky < sH && sBuf[cky * sW + ckx] > 0) {
                    nearShadow = true; break;
                  }
                }
                const proj = sx * perpX + sy * perpY;
                const thinN = this.renderer._godRayNoise.noise2D(proj * 0.25 + ts * 0.03, ts * 0.02);
                const wideN = this.renderer._godRayNoise.noise2D(proj * 0.08 + ts * 0.02, ts * 0.015 + 50.0);
                const rayN = thinN * 0.5 + wideN * 0.5;
                if (rayN > 0.18) {
                  let intensity = (rayN - 0.18) / 0.82 * 0.20 + (nearShadow ? 0.054 : 0);
                  // Temporal fade in/out for sparse sun rays
                  const fadeCycle = Math.sin(ts * 0.15 + proj * 0.1) * 0.35 + 0.65;
                  intensity *= fadeCycle;
                  const alongProj = sx * alongX + sy * alongY;
                  const rayT = (alongProj - minAlong) / alongRange;
                  cells.push(sx, sy, Math.min(0.34, intensity), rayT);
                }
              }
            }
            this._godRayCachedCells = cells;
          }
          // Replay cached cells with color temperature gradient
          const gc = this._godRayCachedCells;
          const isGodRayDay = owSunDir.isDay;
          for (let i = 0; i < gc.length; i += 4) {
            const t = gc[i + 3]; // 0=near source (cool/bright), 1=far (warm/dim)
            let cR, cG, cB;
            if (isGodRayDay) {
              cR = Math.round(221 + t * 34);
              cG = Math.round(238 - t * 34);
              cB = Math.round(255 - t * 153);
            } else {
              cR = Math.round(170 - t * 34);
              cG = Math.round(187 - t * 34);
              cB = Math.round(221 - t * 17);
            }
            const tint = '#' + [cR, cG, cB].map(v => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('');
            const dimFactor = isGodRayDay ? (1.0 - t * 0.35) : (0.6 - t * 0.2);
            this.renderer.brightenCell(viewLeft + gc[i], viewTop + gc[i + 1], gc[i + 2] * dimFactor, tint);
          }
        }
      }

      // Apply town/settlement lighting effects (deferred past endFrame so they survive)
      if (this.state === 'LOCATION' && this.ui._locationLighting) {
        this.ui.applyLocationLighting(this.renderer);
      }

      // Cloud overlay and shadows disabled — focus on clean lighting

      // Apply colored light glow for player light source at night
      if (!this.timeSystem.isDaytime()) {
        const lightInfo = this.player?.hasLightSource();
        if (lightInfo?.hasLight && this.state === 'OVERWORLD') {
          const camX = Math.floor(this.camera.getRenderX());
          const camY = Math.floor(this.camera.getRenderY());
          const dLevel = this.renderer.densityLevel;
          const plx = this.player.position.x - camX;
          const ply = this.player.position.y - camY;
          const rad = lightInfo.radius;
          for (let ldy = -rad; ldy <= rad; ldy++) {
            for (let ldx = -rad; ldx <= rad; ldx++) {
              const dist = Math.sqrt(ldx * ldx + ldy * ldy);
              if (dist <= rad) {
                const falloff = (1 - dist / rad) * 0.15;
                const wx_off = plx + ldx;
                const wy_off = ply + ldy;
                const worldW = Math.ceil(viewW / dLevel);
                const worldH = Math.ceil(viewH / dLevel);
                if (wx_off >= 0 && wx_off < worldW && wy_off >= 0 && wy_off < worldH) {
                  for (let sdy = 0; sdy < dLevel; sdy++) {
                    for (let sdx = 0; sdx < dLevel; sdx++) {
                      const screenX = wx_off * dLevel + sdx;
                      const screenY = wy_off * dLevel + sdy;
                      if (screenX < viewW && screenY < viewH) {
                        this.renderer.tintCell(viewLeft + screenX, viewTop + screenY, lightInfo.color, falloff);
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }

    // Flush all batched overlay operations (darken/brighten/tint) in one go
    this.renderer.flushOverlayBatches();

    // Update-available banner overlay
    if (this._updateAvailable) {
      const elapsed = Date.now() - this._updateDetectedAt;
      const remaining = Math.max(0, this._autoReloadDelay - elapsed);
      if (remaining <= 0) {
        // Auto-save and reload
        if (this.player) this.saveGame();
        location.reload();
        return;
      }
      const mins = Math.floor(remaining / 60000);
      const secs = Math.floor((remaining % 60000) / 1000);
      const timeStr = `${mins}:${secs.toString().padStart(2, '0')}`;
      const cols = this.renderer.cols;
      const msg = `Update ${this._newVersion || ''} available! F5 to refresh (auto in ${timeStr})`;
      const x = Math.floor((cols - msg.length) / 2);
      const ctx = this.renderer.ctx;
      const cw = this.renderer.cellW;
      const ch = this.renderer.cellH;
      // Draw banner background directly on canvas
      ctx.fillStyle = 'rgba(180, 120, 0, 0.85)';
      ctx.fillRect(0, 0, cols * cw, ch + 4);
      ctx.font = `${ch}px monospace`;
      ctx.fillStyle = '#FFFFFF';
      ctx.textBaseline = 'top';
      ctx.fillText(msg, x * cw, 2);
    }

    // Transition overlay (fade in/out between scenes)
    this.renderTransition();

    // Flash overlay
    this.renderer.applyFlash();
  }

  // Tile height lookup for shadow casting
  static TILE_HEIGHTS = {
    TREE: 2, PINE: 2, PALM: 2, CACTUS: 1, TREE_CANOPY: 4, TREE_TRUNK: 2,
    WALL: 3, BUILDING: 3, TOWER: 4, CASTLE: 4,
    MOUNTAIN: 4, HILL: 2, RUINS: 2,
    FENCE: 1, COLUMN: 2, STATUE: 2,
    // Structure tiles
    OBELISK: 4, OBELISK_TOP: 5, OBELISK_BASE: 2,
    REACTOR_WALL: 3, REACTOR_CORE: 1,
    ALIEN_PILLAR: 5, ALIEN_NODE: 3,
    CRYO_HOUSING: 2, CRYO_EMITTER: 3, CRYO_BASE: 1,
    DATA_FRAME: 2, DATA_CORE: 1,
    VOID_ARCH: 4, VOID_BASE: 2, VOID_CENTER: 0,
    MECH_ARM: 2,
    // Mechanical mega-structure tiles
    MANUFACTORY_WALL: 3, MANUFACTORY_STACK: 5, MANUFACTORY_STACK_TOP: 6,
    MANUFACTORY_GEAR: 2, MANUFACTORY_CONVEYOR: 1, MANUFACTORY_FURNACE: 2, MANUFACTORY_FLOOR: 0,
    BORE_DRILL: 3, BORE_SHAFT: 5, BORE_HOUSING: 3, BORE_CROSSBRACE: 4,
    BORE_PLATFORM: 1, BORE_GEAR: 2, BORE_EXHAUST: 2, BORE_SLAG: 0,
    CLOCKWORK_WALL: 3, CLOCKWORK_TOWER: 6, CLOCKWORK_TURRET: 7,
    CLOCKWORK_GEAR: 2, CLOCKWORK_FLYWHEEL: 3, CLOCKWORK_PLATFORM: 1, CLOCKWORK_GATE: 2, CLOCKWORK_FLOOR: 0,
    PIPE_HORIZONTAL: 2, PIPE_VERTICAL: 2, PIPE_JUNCTION: 2, PIPE_VALVE: 2,
    TURBINE_BLADE: 3, TURBINE_NACELLE: 4, TURBINE_TOWER: 5,
    TURBINE_HOUSING: 3, TURBINE_PLATFORM: 1, TURBINE_BRACKET: 2,
    CRANE_BOOM: 6, CRANE_SUPPORT: 5, CRANE_HOOK: 2, CRANE_CROSSBEAM: 4,
    CRANE_MACHINERY: 3, CRANE_BASIN: 0, CRANE_PLATFORM: 1, CRANE_FRAME: 2,
    MECH_GEAR: 2, MECH_PIPE: 2, MECH_VALVE: 1, MECH_CONDUIT: 2,
    // Colony substructure tears (negative = recessed, receives shadow)
    TEAR_GRID: -2, TEAR_DARK_METAL: -2,
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
    // Use world coordinates for player position regardless of state
    let playerPos;
    if (this.state === 'LOCATION' && this.currentSettlement?.locationData) {
      playerPos = { x: this.currentSettlement.locationData.x, y: this.currentSettlement.locationData.y };
    } else if (this.state === 'DUNGEON' && this.currentDungeonLocation) {
      playerPos = { x: this.currentDungeonLocation.x, y: this.currentDungeonLocation.y };
    } else {
      playerPos = { x: this.player.position.x, y: this.player.position.y };
    }
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

    const density = r.densityLevel;
    const camX = Math.floor(this.camera.getRenderX());
    const camY = Math.floor(this.camera.getRenderY());
    const worldW = Math.ceil(viewW / density);
    const worldH = Math.ceil(viewH / density);
    // Center offset for entities within their expanded tile (0 for d=1, 0 for d=2, 1 for d=3)
    const entityOff = Math.floor(density / 2);

    // Shadow and highlight buffers (flat Float32Arrays indexed by screen coords)
    // Cache: only recompute when camera moves or sun direction changes
    const shadowKey = `${camX},${camY},${sunDir.dx.toFixed(2)},${sunDir.dy.toFixed(2)},${density},${viewW},${viewH}`;
    let shadowBuf, highlightBuf;
    if (!this.debug.disableShadows && this._shadowCacheKey === shadowKey && this._shadowBuf) {
      shadowBuf = this._shadowBuf;
      highlightBuf = this._highlightBuf;
    } else if (!this.debug.disableShadows) {
      shadowBuf = new Float32Array(viewW * viewH);
      highlightBuf = new Float32Array(viewW * viewH);

      // Normalized shadow direction for ray marching
      const sdMag = Math.sqrt(sunDir.dx * sunDir.dx + sunDir.dy * sunDir.dy) || 1;
      const sdx = sunDir.dx / sdMag;
      const sdy = sunDir.dy / sdMag;
      // Max ray steps: 5 blocks for short, soft shadows
      const maxRayLen = 6;

      for (let wy_off = 0; wy_off < worldH; wy_off++) {
        for (let wx_off = 0; wx_off < worldW; wx_off++) {
          const wx = camX + wx_off;
          const wy = camY + wy_off;
          const tile = this.overworld.getTile(wx, wy);
          const height = Game.TILE_HEIGHTS[tile.type] || (tile.depth || 0);
          // Recessed tiles (negative depth) receive permanent self-shadow
          if (height < 0) {
            const recessShadow = Math.min(0.625, Math.abs(height) * 0.25);
            for (let dy = 0; dy < density; dy++) {
              for (let dx = 0; dx < density; dx++) {
                const px = wx_off * density + dx;
                const py = wy_off * density + dy;
                if (px >= 0 && px < viewW && py >= 0 && py < viewH) {
                  const idx = py * viewW + px;
                  shadowBuf[idx] = Math.min(0.8125, shadowBuf[idx] + recessShadow);
                }
              }
            }
          }
          if (height > 0) {
            // Halve shadow alpha for vegetation to soften forest edge contrast
            const isVegetation = tile.type === 'TREE' || tile.type === 'PINE' || tile.type === 'PALM' ||
              tile.type === 'TREE_CANOPY' || tile.type === 'TREE_TRUNK' || tile.type === 'FOREST' ||
              tile.type === 'DEEP_FOREST' || tile.type === 'CANOPY' || tile.type === 'PINE_STAND' ||
              tile.type === 'SPARSE_TREES';
            const baseShadow = sunDir.isDay ? 0.3125 : 0.1875;
            const shadowAlpha = (isVegetation ? baseShadow * 0.5 : baseShadow) + Math.min(0.1875, height * 0.0375);
            const shadowMax = sunDir.isDay ? 0.8125 : 0.5625;
            // Cast infinitely linear shadow ray from this object to viewport edge
            for (let i = 1; i <= maxRayLen; i++) {
              const shBaseX = wx_off * density + sdx * i * density;
              const shBaseY = wy_off * density + sdy * i * density;
              let anyInBounds = false;
              for (let sdy2 = 0; sdy2 < density; sdy2++) {
                for (let sdx2 = 0; sdx2 < density; sdx2++) {
                  const shx = Math.floor(shBaseX) + sdx2;
                  const shy = Math.floor(shBaseY) + sdy2;
                  if (shx >= 0 && shx < viewW && shy >= 0 && shy < viewH) {
                    anyInBounds = true;
                    const idx = shy * viewW + shx;
                    // Quadratic fade for soft gradient shadow edge
                    const dist = i / maxRayLen;
                    const fadedAlpha = shadowAlpha * Math.pow(1.0 - dist, 2);
                    shadowBuf[idx] = Math.min(shadowMax, shadowBuf[idx] + fadedAlpha);
                  }
                }
              }
              if (!anyInBounds) break; // past viewport edge
            }

            // Gradient directional lighting: depth-based darkening for forest interiors
            // Walk backward toward sun to count consecutive raised neighbors
            let depth = 0;
            for (let d = 1; d <= 5; d++) {
              const checkX = wx - Math.round(sdx * d);
              const checkY = wy - Math.round(sdy * d);
              const checkTile = this.overworld.getTile(checkX, checkY);
              const checkH = Game.TILE_HEIGHTS[checkTile.type] || 0;
              if (checkH > 0) depth++;
              else break;
            }
            if (depth > 0) {
              const darkenAlpha = Math.min(0.12, depth * 0.025);
              for (let dy = 0; dy < density; dy++) {
                for (let dx = 0; dx < density; dx++) {
                  const px = wx_off * density + dx;
                  const py = wy_off * density + dy;
                  if (px >= 0 && px < viewW && py >= 0 && py < viewH) {
                    const idx = py * viewW + px;
                    highlightBuf[idx] = darkenAlpha;
                  }
                }
              }
            }
          }
        }
      }
      this._shadowCacheKey = shadowKey;
      this._shadowBuf = shadowBuf;
      this._highlightBuf = highlightBuf;
    } else {
      shadowBuf = null;
      highlightBuf = null;
      this._shadowCacheKey = null;
      this._shadowBuf = null;
      this._highlightBuf = null;
    }
    this._highlightBuf = highlightBuf;

    // Render tiles with density expansion
    for (let wy_off = 0; wy_off < worldH; wy_off++) {
      for (let wx_off = 0; wx_off < worldW; wx_off++) {
        const wx = camX + wx_off;
        const wy = camY + wy_off;
        const tile = this.overworld.getTile(wx, wy);

        // Beyond habitat — draw circuitry background instead of void
        if (tile.type === 'VOID_SPACE') {
          const circuit = getCircuitryCell(wx, wy);
          if (density === 1) {
            r.drawChar(viewLeft + wx_off, viewTop + wy_off, circuit.char, circuit.fg, circuit.bg);
          } else {
            for (let dy = 0; dy < density; dy++) {
              for (let dx = 0; dx < density; dx++) {
                const screenX = viewLeft + wx_off * density + dx;
                const screenY = viewTop + wy_off * density + dy;
                if (screenX < viewLeft + viewW && screenY < viewTop + viewH) {
                  r.drawChar(screenX, screenY, circuit.char, circuit.fg, circuit.bg);
                }
              }
            }
          }
          continue;
        }

        // Inner hull corridor — overlay circuit pattern on non-walkable machinery tiles
        if (tile.biome === 'inner_hull' && !tile.walkable && !tile.airlockFrame) {
          // Use circuit pattern as animated background, tile char as foreground
          const circuit = getCircuitryCell(wx, wy);
          const useTile = circuit.char === ' '; // no circuit trace here — use tile's own char
          const ch = useTile ? tile.char : circuit.char;
          const fg = useTile ? tile.fg : circuit.fg;
          if (density === 1) {
            r.drawChar(viewLeft + wx_off, viewTop + wy_off, ch, fg, '#000000');
          } else {
            for (let dy = 0; dy < density; dy++) {
              for (let dx = 0; dx < density; dx++) {
                const screenX = viewLeft + wx_off * density + dx;
                const screenY = viewTop + wy_off * density + dy;
                if (screenX < viewLeft + viewW && screenY < viewTop + viewH) {
                  r.drawChar(screenX, screenY, ch, fg, '#000000');
                }
              }
            }
          }
          continue;
        }

        // Fog of war — only at night; daytime has full visibility
        const dist = distance(wx, wy, this.player.position.x, this.player.position.y);
        const isFogged = isNight && dist > viewRange;

        if (density === 1) {
          const ch = r.getAnimatedChar(tile.char, tile.type, wx, wy);
          const fg = isFogged ? COLORS.BRIGHT_BLACK : r.getAnimatedColor(tile.fg, tile.type);
          const bg = isFogged ? COLORS.BLACK : (tile.bg || COLORS.BLACK);
          r.drawChar(viewLeft + wx_off, viewTop + wy_off, ch, fg, bg);
        } else {
          const expanded = expandTile(tile, density, wx, wy);
          for (let dy = 0; dy < density; dy++) {
            for (let dx = 0; dx < density; dx++) {
              const screenX = viewLeft + wx_off * density + dx;
              const screenY = viewTop + wy_off * density + dy;
              if (screenX < viewLeft + viewW && screenY < viewTop + viewH) {
                const ch = r.getAnimatedChar(expanded.chars[dy][dx], tile.type, wx + dx / density, wy + dy / density);
                const fg = isFogged ? COLORS.BRIGHT_BLACK : r.getAnimatedColor(expanded.fgs[dy][dx], tile.type);
                const bg = isFogged ? COLORS.BLACK : expanded.bgs[dy][dx];
                r.drawChar(screenX, screenY, ch, fg, bg);
              }
            }
          }
        }
      }
    }

    // Draw locations
    for (const loc of this.overworld.getLoadedLocations()) {
      const wx_off = loc.x - camX;
      const wy_off = loc.y - camY;
      if (wx_off >= 0 && wx_off < worldW && wy_off >= 0 && wy_off < worldH) {
        const ch = loc.type === 'city' ? '▣' : loc.type === 'town' ? '□' :
          loc.type === 'village' ? '○' : loc.type === 'dungeon' ? '▼' :
            loc.type === 'castle' ? '♦' : loc.type === 'temple' ? '†' :
              loc.type === 'ruins' ? '▪' : loc.type === 'tower' ? '▲' : '◦';
        const isDungeon = loc.type === 'dungeon' || loc.type === 'tower' || loc.type === 'ruins';
        const glowCat = isDungeon ? 'DUNGEON_ENTRANCE' : 'SETTLEMENT';
        const screenX = viewLeft + wx_off * density + entityOff;
        const screenY = viewTop + wy_off * density + entityOff;
        r.drawChar(screenX, screenY, ch, this.glow.getGlowColor(glowCat, COLORS.BRIGHT_WHITE));
      }
    }

    // Draw player
    const ppx = this.player.position.x - camX;
    const ppy = this.player.position.y - camY;
    if (ppx >= 0 && ppx < worldW && ppy >= 0 && ppy < worldH) {
      const screenX = viewLeft + ppx * density + entityOff;
      const screenY = viewTop + ppy * density + entityOff;
      r.drawChar(screenX, screenY, '@', this.glow.getGlowColor('PLAYER', COLORS.BRIGHT_YELLOW));

      // Player targeting reticle (4 corners, pulsing)
      const t = Date.now() % 1000;
      const reticleColor = t < 500 ? COLORS.BRIGHT_CYAN : COLORS.CYAN;
      r.drawChar(screenX - 1, screenY - 1, '\u250C', reticleColor);
      r.drawChar(screenX + 1, screenY - 1, '\u2510', reticleColor);
      r.drawChar(screenX - 1, screenY + 1, '\u2514', reticleColor);
      r.drawChar(screenX + 1, screenY + 1, '\u2518', reticleColor);
    }

    // Quest navigation line overlay
    if (this._trackedQuestId && this.settings.showQuestNav) {
      const trackedQuest = this.questSystem._activeQuests.get(this._trackedQuestId);
      if (trackedQuest) {
        const navTarget = this._getQuestTargetCoords(trackedQuest);
        if (navTarget) {
          const playerX = this.player.position.x;
          const playerY = this.player.position.y;
          const navPoints = bresenhamLine(playerX, playerY, navTarget.x, navTarget.y);
          const now = Date.now();

          for (const pt of navPoints) {
            if (pt.x === playerX && pt.y === playerY) continue;
            const wx_off = pt.x - camX;
            const wy_off = pt.y - camY;
            if (wx_off < 0 || wx_off >= worldW || wy_off < 0 || wy_off >= worldH) continue;
            const d = Math.abs(pt.x - playerX) + Math.abs(pt.y - playerY);
            const pulse = Math.sin(now / 400 + d * 0.4) * 0.5 + 0.5;
            const navChar = (d % 3 === 0) ? '\u00b7' : '\u2219';
            const navColor = pulse > 0.5 ? COLORS.BRIGHT_CYAN : COLORS.CYAN;
            r.drawChar(viewLeft + wx_off * density + entityOff, viewTop + wy_off * density + entityOff, navChar, navColor);
          }

          // Draw target marker
          const tx = navTarget.x - camX;
          const ty = navTarget.y - camY;
          if (tx >= 0 && tx < worldW && ty >= 0 && ty < worldH) {
            const tPulse = Math.sin(now / 250) * 0.5 + 0.5;
            r.drawChar(viewLeft + tx * density + entityOff, viewTop + ty * density + entityOff, '\u2726',
              tPulse > 0.5 ? COLORS.BRIGHT_YELLOW : COLORS.YELLOW);
          }
        }
      }
    }

    // MECH_ARM overlay — draw on top of all entities
    for (let wy_off = 0; wy_off < worldH; wy_off++) {
      for (let wx_off = 0; wx_off < worldW; wx_off++) {
        const wx = camX + wx_off;
        const wy = camY + wy_off;
        const tile = this.overworld.getTile(wx, wy);
        if (tile.type !== 'MECH_ARM') continue;

        const dist = distance(wx, wy, this.player.position.x, this.player.position.y);
        const isFogged = isNight && dist > viewRange;

        if (density === 1) {
          const ch = r.getAnimatedChar(tile.char, tile.type, wx, wy);
          const fg = isFogged ? COLORS.BRIGHT_BLACK : r.getAnimatedColor(tile.fg, tile.type);
          const bg = isFogged ? COLORS.BLACK : (tile.bg || COLORS.BLACK);
          r.drawChar(viewLeft + wx_off, viewTop + wy_off, ch, fg, bg);
        } else {
          const expanded = expandTile(tile, density, wx, wy);
          for (let dy = 0; dy < density; dy++) {
            for (let dx = 0; dx < density; dx++) {
              const screenX = viewLeft + wx_off * density + dx;
              const screenY = viewTop + wy_off * density + dy;
              if (screenX < viewLeft + viewW && screenY < viewTop + viewH) {
                const ch = r.getAnimatedChar(expanded.chars[dy][dx], tile.type, wx + dx / density, wy + dy / density);
                const fg = isFogged ? COLORS.BRIGHT_BLACK : r.getAnimatedColor(expanded.fgs[dy][dx], tile.type);
                const bg = isFogged ? COLORS.BLACK : expanded.bgs[dy][dx];
                r.drawChar(screenX, screenY, ch, fg, bg);
              }
            }
          }
        }
      }
    }

    // Render structure light glow on overworld at night
    if (isNight && this.overworld.chunkManager) {
      const cm = this.overworld.chunkManager;
      // Check visible chunks for structures with lights
      const cx1 = Math.floor(camX / 32) - 1;
      const cy1 = Math.floor(camY / 32) - 1;
      const cx2 = Math.floor((camX + worldW) / 32) + 1;
      const cy2 = Math.floor((camY + worldH) / 32) + 1;
      for (let ccx = cx1; ccx <= cx2; ccx++) {
        for (let ccy = cy1; ccy <= cy2; ccy++) {
          const chunk = cm.chunks.get(`${ccx},${ccy}`);
          if (!chunk || !chunk.structures) continue;
          for (const struct of chunk.structures) {
            for (const light of struct.lights) {
              const rad = light.radius;
              const radSq = rad * rad;
              // Precompute color string once per light (not per cell!)
              const tintColor = `#${Math.round(light.r * 255).toString(16).padStart(2, '0')}${Math.round(light.g * 255).toString(16).padStart(2, '0')}${Math.round(light.b * 255).toString(16).padStart(2, '0')}`;
              const intensityFactor = light.intensity * 0.4;
              for (let ldy = -rad; ldy <= rad; ldy++) {
                for (let ldx = -rad; ldx <= rad; ldx++) {
                  const distSq = ldx * ldx + ldy * ldy;
                  if (distSq > radSq) continue;
                  const wx_off = light.x + ldx - camX;
                  const wy_off = light.y + ldy - camY;
                  if (wx_off < 0 || wx_off >= worldW || wy_off < 0 || wy_off >= worldH) continue;
                  const dist = Math.sqrt(distSq);
                  const falloff = 1 - dist / rad;
                  const alpha = falloff * falloff * intensityFactor;
                  // Tint all screen cells for this world tile
                  for (let sdy = 0; sdy < density; sdy++) {
                    for (let sdx = 0; sdx < density; sdx++) {
                      r.tintCell(viewLeft + wx_off * density + sdx, viewTop + wy_off * density + sdy, tintColor, alpha);
                    }
                  }
                }
              }
            }
          }
        }
      }
    }

    // ── Night glow for flowing/luminous tiles (pulsating, color-shifting, organic) ──
    if (isNight) {
      const NIGHT_GLOW = {
        RIVER_WATER: { hMin: 175, hMax: 210, int: 0.13, spd: 0.9,  rad: 1, pat: 'wave' },
        TIDAL_POOL:  { hMin: 175, hMax: 220, int: 0.16, spd: 1.2,  rad: 1, pat: 'wave' },
        RIVER:       { hMin: 180, hMax: 210, int: 0.13, spd: 0.9,  rad: 1, pat: 'wave' },
        STREAM:      { hMin: 180, hMax: 210, int: 0.11, spd: 0.9,  rad: 1, pat: 'wave' },
        LAVA:        { hMin: 0,   hMax: 35,  int: 0.28, spd: 1.5,  rad: 2, pat: 'flicker' },
        REACTOR_SLAG:{ hMin: 5,   hMax: 40,  int: 0.25, spd: 1.4,  rad: 2, pat: 'flicker' },
        TOXIC_SUMP:  { hMin: 85,  hMax: 130, int: 0.18, spd: 1.0,  rad: 1, pat: 'pulse' },
        BOG:         { hMin: 90,  hMax: 120, int: 0.10, spd: 0.7,  rad: 1, pat: 'pulse' },
        MARSH_REEDS: { hMin: 80,  hMax: 110, int: 0.08, spd: 0.6,  rad: 1, pat: 'pulse' },
        CRYSTAL_ZONE:{ hMin: 165, hMax: 200, int: 0.22, spd: 1.2,  rad: 2, pat: 'wave' },
        VOID_RIFT:   { hMin: 260, hMax: 310, int: 0.20, spd: 0.5,  rad: 2, pat: 'pulse' },
        GLITCH_ZONE: { hMin: 300, hMax: 360, int: 0.24, spd: 2.0,  rad: 1, pat: 'flicker' },
        ABYSS:       { hMin: 240, hMax: 280, int: 0.08, spd: 0.3,  rad: 1, pat: 'pulse' },
        TEAR_GRID:       { hMin: 180, hMax: 220, int: 0.20, spd: 0.6, rad: 1, pat: 'tear_pulse' },
        TEAR_DARK_METAL: { hMin: 190, hMax: 230, int: 0.15, spd: 0.5, rad: 1, pat: 'tear_pulse' },
        TEAR_LIGHT_METAL:{ hMin: 170, hMax: 210, int: 0.10, spd: 0.4, rad: 0, pat: 'tear_pulse' },
      };
      const now = r._frameTimeSec || Date.now() / 1000;
      // HSL to hex helper (hoisted out of loop)
      const _hue2rgb = (p, q, t2) => { if (t2 < 0) t2++; if (t2 > 1) t2--; return t2 < 1/6 ? p + (q-p)*6*t2 : t2 < 1/2 ? q : t2 < 2/3 ? p + (q-p)*(2/3-t2)*6 : p; };
      const _hex2 = new Array(256);
      for (let i = 0; i < 256; i++) _hex2[i] = i.toString(16).padStart(2, '0');

      // Precompute distance table for radius 2 (max glow radius)
      // distTable[dy+2][dx+2] = sqrt(dx*dx + dy*dy)
      if (!this._glowDistTable) {
        this._glowDistTable = [];
        for (let dy = -2; dy <= 2; dy++) {
          const row = [];
          for (let dx = -2; dx <= 2; dx++) row.push(Math.sqrt(dx * dx + dy * dy));
          this._glowDistTable.push(row);
        }
      }
      const distTable = this._glowDistTable;
      const playerX = this.player.position.x, playerY = this.player.position.y;

      for (let wy_off = 0; wy_off < worldH; wy_off++) {
        for (let wx_off = 0; wx_off < worldW; wx_off++) {
          const wx = camX + wx_off;
          const wy = camY + wy_off;
          const tile = this.overworld.getTile(wx, wy);
          const prof = NIGHT_GLOW[tile.type];
          if (!prof) continue;

          // Per-tile phase offset for organic feel (positional hash)
          const phaseOff = (wx * 0.137 + wy * 0.293) % 6.28;
          const t = now * prof.spd + phaseOff;
          let hue, sat, lit;
          if (prof.pat === 'wave') {
            const phase = Math.sin(t * 1.8) * 0.5 + 0.5;
            hue = prof.hMin + (prof.hMax - prof.hMin) * phase;
            sat = 70 + phase * 25;
            lit = 55 + Math.sin(t * 2.2) * 15;
          } else if (prof.pat === 'pulse') {
            const phase = Math.sin(t * 2.5) * 0.5 + 0.5;
            hue = (prof.hMin + prof.hMax) * 0.5;
            sat = 75 + phase * 20;
            lit = 50 + phase * 25;
          } else if (prof.pat === 'tear_pulse') {
            // Noise-distributed pulse: each tile gets its own random frequency/phase
            const noiseFreq = 0.7 + ((wx * 13 + wy * 7) % 17) / 17 * 0.8; // 0.7–1.5
            const noisePhase = ((wx * 31 + wy * 53) % 97) / 97 * 6.28;
            const pulse = Math.sin(t * noiseFreq * 2.0 + noisePhase) * 0.5 + 0.5;
            const secondary = Math.sin(t * noiseFreq * 0.7 + noisePhase * 1.3) * 0.3;
            const combined = Math.max(0, Math.min(1, pulse + secondary));
            hue = (prof.hMin + prof.hMax) * 0.5;
            sat = 60 + combined * 30;
            lit = 35 + combined * 35;
          } else { // flicker
            const base = Math.sin(t * 3.0) * 0.5 + 0.5;
            const jitter = Math.sin(t * 7.3) * 0.15 + Math.sin(t * 13.1) * 0.1;
            const phase = Math.max(0, Math.min(1, base + jitter));
            hue = prof.hMin + (prof.hMax - prof.hMin) * phase;
            sat = 85;
            lit = 45 + phase * 30;
          }
          // Convert HSL to hex for tintCell
          const h = hue / 360, s = sat / 100, l = lit / 100;
          const q = l < 0.5 ? l*(1+s) : l+s-l*s, pp = 2*l-q;
          const glowColor = `#${_hex2[Math.round(_hue2rgb(pp,q,h+1/3)*255)]}${_hex2[Math.round(_hue2rgb(pp,q,h)*255)]}${_hex2[Math.round(_hue2rgb(pp,q,h-1/3)*255)]}`;
          // Apply glow to tile itself + bleed to surrounding tiles
          const rad = prof.rad;
          for (let ldy = -rad; ldy <= rad; ldy++) {
            for (let ldx = -rad; ldx <= rad; ldx++) {
              const dist = distTable[ldy + 2][ldx + 2];
              if (dist > rad) continue;
              const tx = wx_off + ldx;
              const ty = wy_off + ldy;
              if (tx < 0 || tx >= worldW || ty < 0 || ty >= worldH) continue;
              // Check fog: skip if this target cell is fogged
              const twx = camX + tx, twy = camY + ty;
              const ddx = twx - playerX, ddy = twy - playerY;
              const tdist = Math.abs(ddx) + Math.abs(ddy); // Manhattan distance (cheaper)
              if (tdist > viewRange * 1.4) continue; // Approximate with manhattan
              const falloff = Math.max(0, 1 - dist / Math.max(rad, 1));
              const alpha = falloff * falloff * prof.int;
              for (let sdy = 0; sdy < density; sdy++) {
                for (let sdx = 0; sdx < density; sdx++) {
                  r.tintCell(viewLeft + tx * density + sdx, viewTop + ty * density + sdy, glowColor, alpha);
                }
              }
            }
          }
        }
      }
    }

    // Store shadow data for post-process tinting pass
    this._shadowBufData = shadowBuf;
    this._shadowViewW = viewW;
    this._shadowViewH = viewH;

    // Render particle effects
    this.particles.update();
    this.particles.render(r, camX, camY);
  }

  renderDungeon() {
    if (!this.currentDungeon || !this.currentDungeon.tiles) return;

    // Test area: simplified rendering — no lighting, no FOV, full brightness
    if (this.testArea) {
      this._renderTestArea();
      return;
    }

    // Tick camera shake decay (dungeon doesn't use camera for rendering but needs shake)
    this.camera.update();

    const r = this.renderer;
    const viewLeft = 1;
    const viewTop = LAYOUT.VIEWPORT_TOP;
    const viewW = r.cols - 2;
    const viewH = r.rows - LAYOUT.HUD_TOTAL;

    const density = r.densityLevel;
    const worldW = Math.ceil(viewW / density);
    const worldH = Math.ceil(viewH / density);
    const entityOff = Math.floor(density / 2);

    // Center on player (in world tiles), include camera shake offset
    const shakeX = this.camera.shakeOffsetX || 0;
    const shakeY = this.camera.shakeOffsetY || 0;
    const offsetX = this.player.position.x - Math.floor(worldW / 2) + Math.round(shakeX);
    const offsetY = this.player.position.y - Math.floor(worldH / 2) + Math.round(shakeY);

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

      // Dynamic light sources (fireplaces, lava, ruins crystals, etc.)
      // Time-based modulation for organic flickering/pulsing
      const lt = (r._frameTimeSec || Date.now() / 1000);
      for (let ty = Math.max(0, offsetY); ty < Math.min(dh, offsetY + worldH); ty++) {
        for (let tx = Math.max(0, offsetX); tx < Math.min(dw, offsetX + worldW); tx++) {
          const tile = this.currentDungeon.tiles[ty]?.[tx];
          if (!tile) continue;
          // Per-tile phase offset for organic variation
          const ph = (tx * 0.731 + ty * 0.419) % 6.28;
          let lr, lg, lb, li, lrad;
          let flickerType = 'none'; // none, torch, crystal, ember, pulse
          if (tile.type === 'FIREPLACE' || tile.type === 'CAMPFIRE') {
            lr = 1.0; lg = 0.5; lb = 0.15; li = 0.8; lrad = 4; flickerType = 'torch';
          } else if (tile.type === 'LAVA') {
            lr = 1.0; lg = 0.13; lb = 0.0; li = 0.6; lrad = 3; flickerType = 'ember';
          } else if (tile.type === 'TORCH_SCONCE' || tile.type === 'TORCH') {
            lr = 1.0; lg = 0.7; lb = 0.3; li = 0.7; lrad = 5; flickerType = 'torch';
          } else if (tile.type === 'MECH_CONDUIT') {
            lr = 0.2; lg = 0.6; lb = 1.0; li = 0.65; lrad = 4; flickerType = 'pulse';
          } else if (tile.type === 'GLOWING_RUNE') {
            lr = 0.6; lg = 0.2; lb = 1.0; li = 0.7; lrad = 5; flickerType = 'crystal';
          } else if (tile.type === 'ANCIENT_CRYSTAL') {
            lr = 0.15; lg = 0.9; lb = 1.0; li = 0.75; lrad = 6; flickerType = 'crystal';
          } else if (tile.type === 'EMBER_PIT') {
            lr = 1.0; lg = 0.35; lb = 0.08; li = 0.65; lrad = 4; flickerType = 'ember';
          } else if (tile.type === 'BIOLUM_MOSS') {
            lr = 0.15; lg = 1.0; lb = 0.5; li = 0.5; lrad = 3; flickerType = 'pulse';
          } else { continue; }
          // Apply time-based modulation
          if (flickerType === 'torch') {
            // Fast jittery flicker like a flame
            const f = Math.sin(lt * 3.0 + ph) * 0.5 + 0.5;
            const j = Math.sin(lt * 7.3 + ph) * 0.15 + Math.sin(lt * 13.1 + ph * 2) * 0.1;
            const mod = Math.max(0.6, Math.min(1.0, 0.7 + 0.3 * f + j));
            li *= mod;
            // Slight warmth shift
            lg *= (0.9 + 0.1 * f);
          } else if (flickerType === 'crystal') {
            // Slow, mesmerizing wave with color shift
            const wave = Math.sin(lt * 1.2 + ph) * 0.5 + 0.5;
            const wave2 = Math.sin(lt * 0.7 + ph * 1.5) * 0.5 + 0.5;
            li *= (0.65 + 0.35 * wave);
            // Hue rotation: shift RGB components
            lr = lr * (0.7 + 0.3 * wave2);
            lg = lg * (0.8 + 0.2 * (1 - wave));
            lb = lb * (0.75 + 0.25 * wave);
            lrad = lrad + Math.round(wave * 1.5);
          } else if (flickerType === 'ember') {
            // Medium pulse with occasional flare
            const pulse = Math.sin(lt * 2.0 + ph) * 0.5 + 0.5;
            const flare = Math.max(0, Math.sin(lt * 0.4 + ph) - 0.7) * 3.3; // occasional bright flare
            li *= (0.6 + 0.3 * pulse + 0.15 * flare);
            lg *= (0.8 + 0.4 * pulse); // shifts more orange when brighter
          } else if (flickerType === 'pulse') {
            // Smooth, steady pulse
            const pulse = Math.sin(lt * 1.8 + ph) * 0.5 + 0.5;
            li *= (0.7 + 0.3 * pulse);
          }
          lightSources.push({ x: tx, y: ty, radius: lrad, r: lr, g: lg, b: lb, intensity: li });
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

    // Render dungeon tiles with density expansion
    for (let wy_off = 0; wy_off < worldH; wy_off++) {
      for (let wx_off = 0; wx_off < worldW; wx_off++) {
        const wx = offsetX + wx_off;
        const wy = offsetY + wy_off;

        if (wy >= 0 && wy < dh && wx >= 0 && wx < dw) {
          const tile = this.currentDungeon.tiles[wy][wx];

          // Umbilical void — draw noise background instead of circuitry
          if (tile.type === 'UMBILICAL_VOID') {
            const noise = getNoiseBackgroundCell(wx, wy);
            if (density === 1) {
              r.drawChar(viewLeft + wx_off, viewTop + wy_off, noise.char, noise.fg, noise.bg);
            } else {
              for (let dy = 0; dy < density; dy++) {
                for (let dx = 0; dx < density; dx++) {
                  const screenX = viewLeft + wx_off * density + dx;
                  const screenY = viewTop + wy_off * density + dy;
                  if (screenX < viewLeft + viewW && screenY < viewTop + viewH) {
                    // Use per-sub-cell noise for denser fill at higher zoom
                    const subNoise = getNoiseBackgroundCell(wx * density + dx, wy * density + dy);
                    r.drawChar(screenX, screenY, subNoise.char, subNoise.fg, subNoise.bg);
                  }
                }
              }
            }
            continue;
          }

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
            const iType = tile.type;
            if (iType === 'STAIRS_DOWN' || iType === 'STAIRS_UP' || iType === 'DOOR' || iType === 'CHEST' || iType === 'BRIDGE') {
              animFg = this.glow.getGlowColor('INTERACTIVE', animFg);
            }

            if (density === 1) {
              const dimFg = this._dimColor(animFg, Math.max(0.15, brightness));
              const dimBg = this._dimColor(tile.bg || COLORS.BLACK, brightness);
              r.drawChar(viewLeft + wx_off, viewTop + wy_off, tile.char, dimFg, dimBg);
            } else {
              const expanded = expandTile(tile, density, wx, wy);
              for (let dy = 0; dy < density; dy++) {
                for (let dx = 0; dx < density; dx++) {
                  const screenX = viewLeft + wx_off * density + dx;
                  const screenY = viewTop + wy_off * density + dy;
                  if (screenX < viewLeft + viewW && screenY < viewTop + viewH) {
                    const eFg = r.getAnimatedColor(expanded.fgs[dy][dx], tile.type);
                    const dimFg = this._dimColor(eFg, Math.max(0.15, brightness));
                    const dimBg = this._dimColor(expanded.bgs[dy][dx], brightness);
                    r.drawChar(screenX, screenY, expanded.chars[dy][dx], dimFg, dimBg);
                  }
                }
              }
            }
          } else {
            // Not visible — draw circuitry background
            const circuit = getCircuitryCell(wx, wy);
            if (density === 1) {
              r.drawChar(viewLeft + wx_off, viewTop + wy_off, circuit.char, circuit.fg, circuit.bg);
            } else {
              for (let dy = 0; dy < density; dy++) {
                for (let dx = 0; dx < density; dx++) {
                  const screenX = viewLeft + wx_off * density + dx;
                  const screenY = viewTop + wy_off * density + dy;
                  if (screenX < viewLeft + viewW && screenY < viewTop + viewH) {
                    r.drawChar(screenX, screenY, circuit.char, circuit.fg, circuit.bg);
                  }
                }
              }
            }
          }
        } else {
          // Out of bounds — draw circuitry background
          const circuit = getCircuitryCell(wx, wy);
          if (density === 1) {
            r.drawChar(viewLeft + wx_off, viewTop + wy_off, circuit.char, circuit.fg, circuit.bg);
          } else {
            for (let dy = 0; dy < density; dy++) {
              for (let dx = 0; dx < density; dx++) {
                const screenX = viewLeft + wx_off * density + dx;
                const screenY = viewTop + wy_off * density + dy;
                if (screenX < viewLeft + viewW && screenY < viewTop + viewH) {
                  r.drawChar(screenX, screenY, circuit.char, circuit.fg, circuit.bg);
                }
              }
            }
          }
        }
      }
    }

    // Draw items
    for (const item of this.items) {
      if (item.position) {
        const light = this.debug.disableLighting ? { brightness: visible.has(`${item.position.x},${item.position.y}`) ? 1 : 0 }
          : this.lighting.getLight(item.position.x, item.position.y);
        if (light.brightness > 0.02) {
          const wx_off = item.position.x - offsetX;
          const wy_off = item.position.y - offsetY;
          if (wx_off >= 0 && wx_off < worldW && wy_off >= 0 && wy_off < worldH) {
            r.drawChar(viewLeft + wx_off * density + entityOff, viewTop + wy_off * density + entityOff,
              item.char || '!', this.glow.getGlowColor('LOOT', item.color || COLORS.BRIGHT_YELLOW));
          }
        }
      }
    }

    // Draw enemies
    for (const enemy of this.enemies) {
      const light = this.debug.disableLighting ? { brightness: visible.has(`${enemy.position.x},${enemy.position.y}`) ? 1 : 0 }
        : this.lighting.getLight(enemy.position.x, enemy.position.y);
      if (light.brightness > 0.02) {
        const wx_off = enemy.position.x - offsetX;
        const wy_off = enemy.position.y - offsetY;
        if (wx_off >= 0 && wx_off < worldW && wy_off >= 0 && wy_off < worldH) {
          r.drawChar(viewLeft + wx_off * density + entityOff, viewTop + wy_off * density + entityOff,
            enemy.char, enemy.color || COLORS.BRIGHT_RED);
        }
      }
    }

    // Draw player at center
    const playerScreenX = viewLeft + Math.floor(worldW / 2) * density + entityOff;
    const playerScreenY = viewTop + Math.floor(worldH / 2) * density + entityOff;
    r.drawChar(playerScreenX, playerScreenY, '@', this.glow.getGlowColor('PLAYER', COLORS.BRIGHT_YELLOW));

    // Player targeting reticle (4 corners, pulsing)
    {
      const t = Date.now() % 1000;
      const reticleColor = t < 500 ? COLORS.BRIGHT_CYAN : COLORS.CYAN;
      r.drawChar(playerScreenX - 1, playerScreenY - 1, '\u250C', reticleColor);
      r.drawChar(playerScreenX + 1, playerScreenY - 1, '\u2510', reticleColor);
      r.drawChar(playerScreenX - 1, playerScreenY + 1, '\u2514', reticleColor);
      r.drawChar(playerScreenX + 1, playerScreenY + 1, '\u2518', reticleColor);
    }

    // MECH_ARM overlay — draw on top of all entities
    for (let wy_off = 0; wy_off < worldH; wy_off++) {
      for (let wx_off = 0; wx_off < worldW; wx_off++) {
        const wx = offsetX + wx_off;
        const wy = offsetY + wy_off;
        if (wy < 0 || wy >= dh || wx < 0 || wx >= dw) continue;
        const tile = this.currentDungeon.tiles[wy][wx];
        if (tile.type !== 'MECH_ARM') continue;

        let brightness;
        if (!this.debug.disableLighting) {
          const light = this.lighting.getLight(wx, wy);
          brightness = light.brightness;
          if (brightness <= 0.02) continue;
        } else {
          if (!visible.has(`${wx},${wy}`)) continue;
          brightness = 1.0;
        }

        const animFg = r.getAnimatedColor(tile.fg, tile.type);

        if (density === 1) {
          const dimFg = this._dimColor(animFg, Math.max(0.15, brightness));
          const dimBg = this._dimColor(tile.bg || COLORS.BLACK, brightness);
          r.drawChar(viewLeft + wx_off, viewTop + wy_off, tile.char, dimFg, dimBg);
        } else {
          const expanded = expandTile(tile, density, wx, wy);
          for (let dy = 0; dy < density; dy++) {
            for (let dx = 0; dx < density; dx++) {
              const screenX = viewLeft + wx_off * density + dx;
              const screenY = viewTop + wy_off * density + dy;
              if (screenX < viewLeft + viewW && screenY < viewTop + viewH) {
                const eFg = r.getAnimatedColor(expanded.fgs[dy][dx], tile.type);
                const dimFg = this._dimColor(eFg, Math.max(0.15, brightness));
                const dimBg = this._dimColor(expanded.bgs[dy][dx], brightness);
                r.drawChar(screenX, screenY, expanded.chars[dy][dx], dimFg, dimBg);
              }
            }
          }
        }
      }
    }

    // Render particles in dungeon
    this.particles.update();
    this.particles.render(r, offsetX, offsetY);
  }

  _renderTestArea() {
    const r = this.renderer;
    const viewLeft = 1;
    const viewTop = LAYOUT.VIEWPORT_TOP;
    const viewW = r.cols - 2;
    const viewH = r.rows - LAYOUT.HUD_TOTAL;

    // Always density 1 for test areas
    const worldW = viewW;
    const worldH = viewH;

    const offsetX = this.player.position.x - Math.floor(worldW / 2);
    const offsetY = this.player.position.y - Math.floor(worldH / 2);

    const dw = this.currentDungeon.tiles[0]?.length || 0;
    const dh = this.currentDungeon.tiles.length;

    // Render tiles at full brightness, no FOV
    for (let wy_off = 0; wy_off < worldH; wy_off++) {
      for (let wx_off = 0; wx_off < worldW; wx_off++) {
        const wx = offsetX + wx_off;
        const wy = offsetY + wy_off;

        if (wy >= 0 && wy < dh && wx >= 0 && wx < dw) {
          const tile = this.currentDungeon.tiles[wy][wx];
          r.drawChar(viewLeft + wx_off, viewTop + wy_off, tile.char, tile.fg, tile.bg);
        } else {
          // Out of bounds — dark
          r.drawChar(viewLeft + wx_off, viewTop + wy_off, ' ', '#000000', '#000000');
        }
      }
    }

    // Draw player
    const playerScreenX = viewLeft + Math.floor(worldW / 2);
    const playerScreenY = viewTop + Math.floor(worldH / 2);
    r.drawChar(playerScreenX, playerScreenY, '@', COLORS.BRIGHT_YELLOW);

    // Player reticle
    const t = Date.now() % 1000;
    const reticleColor = t < 500 ? COLORS.BRIGHT_CYAN : COLORS.CYAN;
    r.drawChar(playerScreenX - 1, playerScreenY - 1, '\u250C', reticleColor);
    r.drawChar(playerScreenX + 1, playerScreenY - 1, '\u2510', reticleColor);
    r.drawChar(playerScreenX - 1, playerScreenY + 1, '\u2514', reticleColor);
    r.drawChar(playerScreenX + 1, playerScreenY + 1, '\u2518', reticleColor);
  }

  renderBattleResults() {
    if (!this.battleResults) return;
    const r = this.renderer;
    const cols = r.cols;
    const rows = r.rows;
    const res = this.battleResults;
    this.battleResultsTimer++;

    // Dark background
    for (let sy = 0; sy < rows; sy++) {
      for (let sx = 0; sx < cols; sx++) {
        r.drawChar(sx, sy, ' ', '#000000', '#0A0A1A');
      }
    }

    const panelW = Math.min(cols - 4, 50);
    const panelH = Math.min(rows - 4, 18);
    const px = Math.floor((cols - panelW) / 2);
    const py = Math.floor((rows - panelH) / 2);

    // FF-style bordered window
    r.drawBox(px, py, panelW, panelH, COLORS.FF_BORDER || '#AAAAFF', COLORS.FF_BLUE_DARK || '#000044', ' Victory! ');

    let line = py + 2;
    const bg = COLORS.FF_BLUE_DARK || '#000044';
    const w = panelW - 4;

    // Victory header with pulse
    const pulse = Math.sin(this.battleResultsTimer * 0.15) * 0.3 + 0.7;
    const victoryColor = pulse > 0.8 ? '#FFFFFF' : '#FFDD44';
    const victoryText = '*** VICTORY! ***';
    r.drawString(px + Math.floor((panelW - victoryText.length) / 2), line, victoryText, victoryColor, bg);
    line += 2;

    // Enemy defeated
    r.drawString(px + 2, line, `Defeated: ${res.enemyName}`, '#FFAAAA', bg, w);
    line += 2;

    // EXP with animated count-up
    const maxCountFrames = 30;
    const countProgress = Math.min(1, this.battleResultsTimer / maxCountFrames);
    const displayXP = Math.floor(res.xp * countProgress);
    r.drawString(px + 2, line, `EXP: +${displayXP}`, COLORS.BRIGHT_CYAN || '#00FFFF', bg, w);
    line++;

    // Gold
    if (res.gold > 0) {
      const displayGold = Math.floor(res.gold * countProgress);
      r.drawString(px + 2, line, `Gold: +${displayGold}\u00A7`, COLORS.BRIGHT_YELLOW || '#FFFF00', bg, w);
      line++;
    }

    // Loot items
    if (res.items && res.items.length > 0) {
      line++;
      r.drawString(px + 2, line, 'Loot:', '#AAAAAA', bg, w);
      line++;
      for (const item of res.items) {
        if (line >= py + panelH - 3) break;
        r.drawString(px + 3, line, `\u2022 ${item.name}`, COLORS.BRIGHT_GREEN || '#00FF00', bg, w - 1);
        line++;
      }
    }

    // Level up
    if (res.leveled && res.leveled.length > 0) {
      line++;
      if (line < py + panelH - 2) {
        r.drawString(px + 2, line, `LEVEL UP! Lv ${res.leveled[res.leveled.length - 1]}!`, '#FFFF00', bg, w);
      }
    }

    // Press enter prompt (blink)
    if (this.battleResultsTimer > 20) {
      const blink = Math.floor(this.battleResultsTimer / 15) % 2 === 0;
      if (blink) {
        const promptText = 'Press Enter to continue';
        r.drawString(px + Math.floor((panelW - promptText.length) / 2), py + panelH - 2, promptText, '#888888', bg);
      }
    }
  }

  handleBattleResultsInput(key) {
    if (key === 'Enter' || key === ' ' || key === 'Escape') {
      const returnState = this._battleReturnState || 'DUNGEON';
      this.battleResults = null;
      this.startTransition(() => {
        this.setState(returnState);
      });
    }
  }

  // ── Reusable: render animated Voronoi fire background ──
  renderFireBackground(r, cols, battleH, shakeX, shakeY) {
    const t = Date.now() / 1000;
    const fireChars = [' ', '.', '\u00B7', ':', '\u2219', '\u2591', '\u2592', '\u2593'];
    const fireFg = ['#FF2200', '#FF4400', '#FF6600', '#FF8800', '#FFAA00', '#FFCC00', '#FFDD44'];
    const fireBg = ['#1a0800', '#2a0e00', '#3a1500', '#4a1a00', '#5a2200', '#6a2800'];
    const numSeeds = 10;
    // Pre-compute seed positions once per frame (was 4 trig ops × 10 seeds × every pixel)
    const seedX = new Float64Array(numSeeds);
    const seedY = new Float64Array(numSeeds);
    const halfCols = cols / 2;
    const halfH = battleH / 2;
    for (let s = 0; s < numSeeds; s++) {
      seedX[s] = halfCols + Math.sin(t * 0.45 + s * 2.09) * (cols * 0.4) + Math.sin(t * 0.26 + s * 1.3) * (cols * 0.15);
      seedY[s] = halfH + Math.cos(t * 0.375 + s * 1.88) * (halfH * 0.8) + Math.cos(t * 0.195 + s * 0.9) * (halfH * 0.3);
    }
    // Pre-compute time-dependent sin values used in pulse calculations
    const tPulse = t * 1.8;
    const tEdgePulse = t * 1.2;
    const fcLen = fireChars.length;
    const ffLen = fireFg.length;
    const fbLen = fireBg.length;
    for (let row = 0; row < battleH; row++) {
      for (let col = 0; col < cols; col++) {
        let minDist = Infinity;
        let secondDist = Infinity;
        for (let s = 0; s < numSeeds; s++) {
          const dx = col - seedX[s];
          const dy = (row - seedY[s]) * 2;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < minDist) { secondDist = minDist; minDist = d; }
          else if (d < secondDist) { secondDist = d; }
        }
        const edge = secondDist - minDist;
        const pulse = Math.sin(minDist * 0.15 - tPulse) * 0.5 + 0.5;
        const edgePulse = Math.sin(edge * 0.5 - tEdgePulse) * 0.5 + 0.5;
        const val = pulse * 0.6 + edgePulse * 0.4;
        const ci = Math.min((val * fcLen) | 0, fcLen - 1);
        const fi = Math.min(((val * 0.7 + edge * 0.02) * ffLen) | 0, ffLen - 1);
        const bi = Math.min((val * fbLen) | 0, fbLen - 1);
        const drawCol = col + shakeX;
        const drawRow = row + shakeY;
        if (drawCol >= 0 && drawCol < cols && drawRow >= 0 && drawRow < battleH) {
          r.drawChar(drawCol, drawRow, fireChars[ci], fireFg[fi], fireBg[bi]);
        }
      }
    }
  }

  // ── Reusable: render combat bottom HUD (message log, player stats, command menu) ──
  renderCombatHUD(r, cols, rows, battleH, bg) {
    const statusH = rows - battleH;
    const logW = Math.floor(cols * 0.55);
    const logH = statusH;
    r.drawBox(0, battleH, logW, logH, COLORS.FF_BORDER, bg);
    for (let i = 0; i < Math.min(logH - 2, this.ui.messageLog.length); i++) {
      const msg = this.ui.messageLog[i];
      r.drawString(2, battleH + 1 + i, msg.text.substring(0, logW - 4), msg.color, bg);
    }
    const statusW = cols - logW;
    const statusBoxH = Math.floor(statusH * 0.45);
    r.drawBox(logW, battleH, statusW, statusBoxH, COLORS.FF_BORDER, bg);
    const p = this.player;
    r.drawString(logW + 2, battleH + 1, p.name, COLORS.BRIGHT_WHITE, bg);
    const hpFrac = p.stats.hp / p.stats.maxHp;
    r.drawString(logW + 2, battleH + 2, 'HP', COLORS.BRIGHT_WHITE, bg);
    const sGaugeW = Math.min(10, statusW - 12);
    for (let i = 0; i < sGaugeW; i++) {
      r.drawChar(logW + 5 + i, battleH + 2, i < Math.round(hpFrac * sGaugeW) ? '\u2588' : '\u2591',
        hpFrac < 0.25 ? COLORS.BRIGHT_RED : COLORS.BRIGHT_GREEN, bg);
    }
    const hpColor = hpFrac < 0.25 ? COLORS.BRIGHT_RED : hpFrac < 0.5 ? COLORS.BRIGHT_YELLOW : COLORS.BRIGHT_WHITE;
    r.drawString(logW + 6 + sGaugeW, battleH + 2, `${p.stats.hp}`, hpColor, bg);
    const mpFrac = p.stats.maxMana > 0 ? p.stats.mana / p.stats.maxMana : 0;
    r.drawString(logW + 2, battleH + 3, 'MP', COLORS.BRIGHT_WHITE, bg);
    for (let i = 0; i < sGaugeW; i++) {
      r.drawChar(logW + 5 + i, battleH + 3, i < Math.round(mpFrac * sGaugeW) ? '\u2588' : '\u2591',
        COLORS.BRIGHT_CYAN, bg);
    }
    r.drawString(logW + 6 + sGaugeW, battleH + 3, `${p.stats.mana}`, COLORS.BRIGHT_CYAN, bg);
    const cmdY = battleH + statusBoxH;
    const cmdH = statusH - statusBoxH;
    r.drawBox(logW, cmdY, statusW, cmdH, COLORS.FF_BORDER, bg);
    const actions = ['Attack', 'Flee'];
    if (p.abilities && p.abilities.length > 0) {
      for (let i = 0; i < Math.min(p.abilities.length, 3); i++) {
        actions.push(`${p.abilities[i].name}`);
      }
    }
    const combatSel = (this.combatState && this.combatState.selectedAction) || 0;
    for (let i = 0; i < actions.length && i < cmdH - 2; i++) {
      const sel = i === combatSel;
      const cursor = sel ? '\u25BA' : ' ';
      r.drawString(logW + 2, cmdY + 1 + i, cursor + ' ' + actions[i],
        sel ? COLORS.BRIGHT_WHITE : COLORS.WHITE, bg);
      if (i >= 2 && p.abilities[i - 2]) {
        const cost = `${p.abilities[i - 2].manaCost}`;
        r.drawString(logW + statusW - cost.length - 3, cmdY + 1 + i, cost, COLORS.BRIGHT_CYAN, bg);
      }
    }
  }

  // ── Color interpolation utility ──
  _lerpColor(c1, c2, t) {
    const r1 = parseInt(c1.slice(1, 3), 16), g1 = parseInt(c1.slice(3, 5), 16), b1 = parseInt(c1.slice(5, 7), 16);
    const r2 = parseInt(c2.slice(1, 3), 16), g2 = parseInt(c2.slice(3, 5), 16), b2 = parseInt(c2.slice(5, 7), 16);
    const ri = Math.round(r1 + (r2 - r1) * t), gi = Math.round(g1 + (g2 - g1) * t), bi = Math.round(b1 + (b2 - b1) * t);
    return '#' + ((1 << 24) + (ri << 16) + (gi << 8) + bi).toString(16).slice(1);
  }

  // ── Character decay sequence for death animation ──
  _getDecaySequence(ch) {
    const heavy = ['\u2588', '\u2593', '\u2592', '\u2591', '\u00B7', ' '];
    const medium = ['\u2592', '\u2591', '\u00B7', ' '];
    const light = ['\u00B7', '.', ' '];
    if ('\u2588\u2593\u2554\u2551\u2557\u255A\u255D\u2560\u2563\u2550\u2500\u2502\u250C\u2510\u2514\u2518\u251C\u2524\u2534\u252C\u253C\u2580\u2584\u258C\u2590\u256C\u256B\u256A'.includes(ch)) return heavy;
    if ('\u2592\u2591'.includes(ch)) return medium;
    return light;
  }

  // ── Start enemy death disintegration animation ──
  startEnemyDeath() {
    const enemy = this.combatState.enemy;
    const art = getMonsterArt(enemy);
    const artLines = art.lines;
    const artH = artLines.length;
    const artW = Math.max(...artLines.map(l => l.length));
    const r = this.renderer;
    const cols = r.cols;
    const rows = r.rows;
    const battleH = Math.floor(rows * 0.55);
    const artX = Math.floor(cols / 2 - artW / 2);
    const artY = Math.floor(battleH / 2 - artH / 2) - 1;
    const centerX = artX + artW / 2;
    const centerY = artY + artH / 2;

    // Build debris particles from every non-space character
    const debris = [];
    for (let row = 0; row < artH; row++) {
      const line = artLines[row];
      for (let col = 0; col < line.length; col++) {
        const ch = line[col];
        if (ch === ' ') continue;
        const px = artX + col;
        const py = artY + row;
        // Direction outward from center
        const dx = px - centerX;
        const dy = py - centerY;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const nx = dx / dist;
        const ny = dy / dist;
        const speed = 0.3 + Math.random() * 1.2;
        debris.push({
          ch,
          origCh: ch,
          x: px,
          y: py,
          origX: px,
          origY: py,
          vx: nx * speed + (Math.random() - 0.5) * 0.4,
          vy: ny * speed * 0.6 - 0.3 - Math.random() * 0.4,
          color: art.color,
          delay: Math.floor(Math.random() * 10),
          alpha: 1.0,
          decayStage: 0,
          decaySeq: this._getDecaySequence(ch),
        });
      }
    }

    // Generate 2-3 crack seed points within art bounds
    const crackSeeds = [];
    const numCracks = 2 + Math.floor(Math.random() * 2);
    for (let i = 0; i < numCracks; i++) {
      crackSeeds.push({
        x: artX + Math.floor(Math.random() * artW),
        y: artY + Math.floor(Math.random() * artH),
        branches: [],
      });
    }

    this.enemyDeathState = {
      frame: 0,
      debris,
      crackSeeds,
      crackCells: new Set(),
      artColor: art.color,
      artLines,
      artX, artY, artW, artH,
      centerX, centerY,
      defeatedY: centerY,
      enemyName: enemy.name,
    };
    // Keep combatState alive for HUD rendering
    this.setState('ENEMY_DEATH');
  }

  // ── Enemy death disintegration animation renderer ──
  renderEnemyDeath() {
    const ds = this.enemyDeathState;
    if (!ds) return;
    const r = this.renderer;
    const cols = r.cols;
    const rows = r.rows;
    const bg = COLORS.FF_BLUE_DARK;
    const frame = ds.frame;

    r.clear();

    const battleH = Math.floor(rows * 0.55);

    // Screen shake — strong initial jolt, decaying
    let shakeX = 0, shakeY = 0;
    if (frame < 30) {
      const intensity = frame < 8 ? 4 : Math.max(0, 3 - (frame - 8) * 0.15);
      if (intensity > 0.1) {
        shakeX = Math.round((Math.random() - 0.5) * intensity * 2);
        shakeY = Math.round((Math.random() - 0.5) * intensity);
      }
    }

    // Fire background (keeps animating throughout)
    this.renderFireBackground(r, cols, battleH, shakeX, shakeY);

    // ═══ PHASE 1: FREEZE + FLASH (frames 0-7) ═══
    if (frame < 8) {
      const strobeColors = ['#FFFFFF', '#FFFFFF', ds.artColor, ds.artColor, '#FFFFFF', '#FFFFFF', '#FF4400', '#FF4400'];
      const drawColor = strobeColors[frame] || ds.artColor;
      const monsterBg = '#0a0500';
      for (let row = 0; row < ds.artH; row++) {
        const line = ds.artLines[row];
        let firstNonSpace = -1, lastNonSpace = -1;
        for (let col = 0; col < line.length; col++) {
          if (line[col] !== ' ') {
            if (firstNonSpace === -1) firstNonSpace = col;
            lastNonSpace = col;
          }
        }
        for (let col = 0; col < line.length; col++) {
          const ch = line[col];
          const dx = ds.artX + col + shakeX;
          const dy = ds.artY + row + shakeY;
          if (dx < 0 || dx >= cols || dy < 0 || dy >= battleH) continue;
          if (ch === ' ') {
            if (col > firstNonSpace && col < lastNonSpace) {
              r.drawChar(dx, dy, ' ', monsterBg, monsterBg);
            }
            continue;
          }
          r.drawChar(dx, dy, ch, drawColor, monsterBg, true);
        }
      }
    }

    // ═══ PHASE 2: CRACK + SHATTER (frames 8-22) ═══
    else if (frame < 23) {
      const phaseFrame = frame - 8;
      const monsterBg = '#0a0500';

      // Propagate cracks — extend each seed's random walk
      for (const seed of ds.crackSeeds) {
        if (seed.branches.length === 0) {
          seed.branches.push({ x: seed.x, y: seed.y });
        }
        // Extend 1-2 branches per frame
        const extensions = 1 + Math.floor(Math.random() * 2);
        for (let e = 0; e < extensions; e++) {
          const tip = seed.branches[seed.branches.length - 1];
          const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]];
          const dir = dirs[Math.floor(Math.random() * dirs.length)];
          const nx = tip.x + dir[0];
          const ny = tip.y + dir[1];
          if (nx >= ds.artX && nx < ds.artX + ds.artW && ny >= ds.artY && ny < ds.artY + ds.artH) {
            seed.branches.push({ x: nx, y: ny });
            ds.crackCells.add(`${nx},${ny}`);
          }
        }
        // Occasionally fork
        if (Math.random() < 0.3 && seed.branches.length > 2) {
          const forkPoint = seed.branches[Math.floor(Math.random() * seed.branches.length)];
          seed.branches.push({ x: forkPoint.x, y: forkPoint.y });
        }
      }

      // Draw monster art with jitter and crack overlay
      for (let row = 0; row < ds.artH; row++) {
        const line = ds.artLines[row];
        let firstNonSpace = -1, lastNonSpace = -1;
        for (let col = 0; col < line.length; col++) {
          if (line[col] !== ' ') {
            if (firstNonSpace === -1) firstNonSpace = col;
            lastNonSpace = col;
          }
        }
        for (let col = 0; col < line.length; col++) {
          const ch = line[col];
          const baseX = ds.artX + col;
          const baseY = ds.artY + row;
          // Jitter increases over phase
          const jitter = phaseFrame > 3 ? (Math.random() - 0.5) * Math.min(1.5, phaseFrame * 0.15) : 0;
          const dx = Math.round(baseX + jitter) + shakeX;
          const dy = Math.round(baseY + (Math.random() - 0.5) * Math.min(0.8, phaseFrame * 0.08)) + shakeY;
          if (dx < 0 || dx >= cols || dy < 0 || dy >= battleH) continue;
          if (ch === ' ') {
            if (col > firstNonSpace && col < lastNonSpace) {
              r.drawChar(dx, dy, ' ', monsterBg, monsterBg);
            }
            continue;
          }
          // Crack overlay
          const crackKey = `${baseX},${baseY}`;
          if (ds.crackCells.has(crackKey)) {
            const crackChars = ['\u2571', '\u2572', '\u2502', '\u2500', '\u2573'];
            const crackCh = crackChars[Math.floor(Math.random() * crackChars.length)];
            r.drawChar(dx, dy, crackCh, '#FFFFFF', monsterBg, true);
          } else {
            // Color shifting toward orange
            const t = phaseFrame / 14;
            const color = this._lerpColor(ds.artColor, '#FF6600', t);
            r.drawChar(dx, dy, ch, color, monsterBg, true);
          }
        }
      }

      // Activate early debris near cracks
      for (const p of ds.debris) {
        const key = `${p.origX},${p.origY}`;
        if (ds.crackCells.has(key) && phaseFrame > 5) {
          p.delay = 0;
        }
      }
    }

    // ═══ PHASE 3: CRUMBLE + SCATTER (frames 23-45) ═══
    else if (frame < 46) {
      const phaseFrame = frame - 23;

      // Spawn extra ember particles at intervals
      if (this.combatState && (phaseFrame === 2 || phaseFrame === 7 || phaseFrame === 12)) {
        this.spawnCombatParticles(6, ['*', '\u00B7', '+', '\u2219'], '#FFAA00');
      }

      // Update and draw debris
      for (const p of ds.debris) {
        if (p.alpha <= 0) continue;
        // Force-activate all debris
        if (p.delay > 0) { p.delay--; continue; }

        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.06; // gravity
        p.vx *= 0.98; // air friction

        // Decay characters every ~5 frames
        if (phaseFrame % 5 === 0 && p.decayStage < p.decaySeq.length - 1) {
          p.decayStage++;
          p.ch = p.decaySeq[p.decayStage];
        }

        // Color progression: orange → red → ash
        const t = phaseFrame / 22;
        if (t < 0.5) {
          p.color = this._lerpColor('#FF6600', '#FF2200', t * 2);
        } else {
          p.color = this._lerpColor('#FF2200', '#888888', (t - 0.5) * 2);
        }

        const dx = Math.round(p.x) + shakeX;
        const dy = Math.round(p.y) + shakeY;
        if (p.ch !== ' ' && dx >= 0 && dx < cols && dy >= 0 && dy < battleH) {
          r.drawChar(dx, dy, p.ch, p.color, null);
        }
      }

      // "Defeated!" text fades in and floats up
      if (phaseFrame > 5) {
        const textAlpha = Math.min(1, (phaseFrame - 5) / 8);
        ds.defeatedY -= 0.08;
        const defText = `${ds.enemyName} defeated!`;
        const textColor = textAlpha > 0.7 ? '#FFFFFF' : '#AAAAAA';
        const tx = Math.floor(cols / 2 - defText.length / 2) + shakeX;
        const ty = Math.round(ds.defeatedY) + shakeY;
        if (ty >= 0 && ty < battleH) {
          r.drawString(Math.max(0, tx), ty, defText, textColor, null);
        }
      }
    }

    // ═══ PHASE 4: DISSOLVE + FADE (frames 46-65) ═══
    else if (frame < 66) {
      const phaseFrame = frame - 46;

      // Continue debris falling and fading
      for (const p of ds.debris) {
        if (p.alpha <= 0 || p.ch === ' ') continue;
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.06;
        p.vx *= 0.97;
        p.alpha -= 0.05;

        // Continue decay
        if (phaseFrame % 3 === 0 && p.decayStage < p.decaySeq.length - 1) {
          p.decayStage++;
          p.ch = p.decaySeq[p.decayStage];
        }

        p.color = this._lerpColor('#555555', '#222222', phaseFrame / 19);

        const dx = Math.round(p.x) + shakeX;
        const dy = Math.round(p.y) + shakeY;
        if (p.alpha > 0 && p.ch !== ' ' && dx >= 0 && dx < cols && dy >= 0 && dy < battleH) {
          r.drawChar(dx, dy, p.ch, p.color, null);
        }
      }

      // Floating "defeated" text still visible
      ds.defeatedY -= 0.04;
      const defText = `${ds.enemyName} defeated!`;
      const tx = Math.floor(cols / 2 - defText.length / 2);
      const ty = Math.round(ds.defeatedY);
      if (ty >= 0 && ty < battleH) {
        const textFade = Math.max(0, 1 - phaseFrame / 19);
        const textColor = textFade > 0.5 ? '#FFFFFF' : '#888888';
        r.drawString(Math.max(0, tx), ty, defText, textColor, null);
      }

      // Gradual dark tint
      const tintAlpha = phaseFrame * 0.015;
      if (tintAlpha > 0.01) r.tintOverlay('#000000', tintAlpha);
    }

    // ═══ PHASE 5: TRANSITION (frames 66-75) ═══
    else {
      const phaseFrame = frame - 66;
      const tintAlpha = 0.3 + phaseFrame * 0.07;
      r.tintOverlay('#000000', Math.min(0.95, tintAlpha));
    }

    // Render combat particles (ember sparks throughout)
    if (this.combatState && this.combatState.combatParticles) {
      const parts = this.combatState.combatParticles;
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.05;
        p.life--;
        if (p.life <= 0) {
          parts[i] = parts[parts.length - 1]; parts.pop(); // swap-and-pop
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

    // Bottom HUD
    this.renderCombatHUD(r, cols, rows, battleH, bg);

    ds.frame++;

    // Animation complete — transition to battle results
    if (ds.frame >= 75) {
      this.combatState = null;
      this.enemyDeathState = null;
      this.setState('BATTLE_RESULTS');
    }
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

    // Screen shake offset
    let shakeX = 0, shakeY = 0;
    if (cs.shake && cs.shake.intensity > 0.1) {
      shakeX = Math.round((Math.random() - 0.5) * cs.shake.intensity * 2);
      shakeY = Math.round((Math.random() - 0.5) * cs.shake.intensity);
      cs.shake.intensity *= cs.shake.decay;
    } else if (cs.shake) {
      cs.shake.intensity = 0;
    }

    // ── Fire Voronoi animated background ──
    this.renderFireBackground(r, cols, battleH, shakeX, shakeY);

    // ── Centered Monster Art ──
    // Hit recoil offset
    let recoilX = 0;
    if (cs.hitRecoil > 0) {
      recoilX = cs.hitRecoil > 3 ? 1 : 0;
      cs.hitRecoil--;
    }

    // Check for pixel art sprite first, fall back to ASCII art
    const enemySprite = this.spriteManager.getEnemySprite(enemy);
    const usePixelSprite = !!enemySprite;

    // ASCII art (used for layout metrics even when pixel sprite exists)
    const art = getMonsterArt(enemy);
    const artLines = art.lines;
    const artH = artLines.length;
    const artW = Math.max(...artLines.map(l => l.length));

    let artX, artY, layoutW, layoutH;

    if (usePixelSprite) {
      // Pixel sprite: integer nearest-neighbor scaling for crisp pixel art.
      // Compute the largest integer scale factor that fits the battle area,
      // with a minimum of 3x so sprites are always prominently sized.
      const cw = this.renderer.cellWidth;
      const ch = this.renderer.cellHeight;
      const imgW = enemySprite.naturalWidth || enemySprite.width;
      const imgH = enemySprite.naturalHeight || enemySprite.height;

      // Guard: fall back to ASCII art if dimensions are invalid (avoids NaN/Infinity)
      if (!cw || !ch || !imgW || !imgH) {
        this.ui._enemySpriteOverlay = null;
        artX = Math.floor(cols / 2 - artW / 2) + shakeX + recoilX;
        artY = Math.floor(battleH / 2 - artH / 2) - 1 + shakeY;
        layoutW = artW;
        layoutH = artH;
      } else {

      const availPxW = Math.floor(cols * cw * 0.70);
      const availPxH = Math.floor(battleH * ch * 0.80);
      // Integer scale factor: largest N where imgW*N fits, minimum 3
      const scaleFactor = Math.max(3, Math.floor(Math.min(availPxW / imgW, availPxH / imgH)));
      const destPxW = imgW * scaleFactor;
      const destPxH = imgH * scaleFactor;

      // Convert to fractional cell units for centering
      const spriteW = destPxW / cw;
      const spriteH = destPxH / ch;
      const spriteCol = Math.floor(cols / 2 - spriteW / 2) + shakeX + recoilX;
      const spriteRow = Math.floor(battleH / 2 - spriteH / 2) - 1 + shakeY;

      // Queue for overlay rendering after endFrame (drawn directly as pixels)
      this.ui._enemySpriteOverlay = {
        img: enemySprite,
        col: spriteCol,
        row: spriteRow,
        w: spriteW,
        h: spriteH,
        pxW: destPxW,
        pxH: destPxH,
      };

      // Use sprite center for name plate / HP bar positioning
      artX = spriteCol;
      artY = spriteRow;
      // Override artW/artH for layout
      layoutW = Math.ceil(spriteW);
      layoutH = Math.ceil(spriteH);

      // Hit flash: apply a white tint overlay via canvas compositing
      // (handled in the overlay pass — store flash state)
      if (cs.hitTimer > 0) {
        this.ui._enemySpriteOverlay.flash = true;
        cs.hitTimer--;
      }
      } // end valid-dimensions else
    } else {
      // ASCII art path (original)
      this.ui._enemySpriteOverlay = null;
      artX = Math.floor(cols / 2 - artW / 2) + shakeX + recoilX;
      artY = Math.floor(battleH / 2 - artH / 2) - 1 + shakeY;
      layoutW = artW;
      layoutH = artH;

      // Determine monster draw color (flash white on hit)
      let drawColor = art.color;
      if (cs.hitTimer > 0) {
        drawColor = '#FFFFFF';
        cs.hitTimer--;
      }

      // Draw monster art - internal spaces filled, external spaces show fire bg
      const monsterBg = '#0a0500';
      for (let row = 0; row < artH; row++) {
        const line = artLines[row];
        // Find internal bounds (leftmost and rightmost non-space)
        let firstNonSpace = -1, lastNonSpace = -1;
        for (let col = 0; col < line.length; col++) {
          if (line[col] !== ' ') {
            if (firstNonSpace === -1) firstNonSpace = col;
            lastNonSpace = col;
          }
        }
        for (let col = 0; col < line.length; col++) {
          const ch = line[col];
          const dx = artX + col;
          const dy = artY + row;
          if (dx < 0 || dx >= cols || dy < 0 || dy >= battleH) continue;
          if (ch === ' ') {
            // Internal space: fill with monster bg so fire doesn't bleed through
            if (col > firstNonSpace && col < lastNonSpace) {
              r.drawChar(dx, dy, ' ', monsterBg, monsterBg);
            }
            continue; // External space: fire bg shows through
          }
          r.drawChar(dx, dy, ch, drawColor, monsterBg, true);
        }
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
    const eHpW = Math.min(20, layoutW + 4);
    const eHpX = Math.floor(cols / 2 - eHpW / 2) + shakeX;
    const eHpY = artY + layoutH + 1;
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
      const cparts = cs.combatParticles;
      for (let i = cparts.length - 1; i >= 0; i--) {
        const p = cparts[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.05; // gravity
        p.life--;
        if (p.life <= 0) {
          cparts[i] = cparts[cparts.length - 1]; cparts.pop(); // swap-and-pop
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
      const dnums = cs.damageNumbers;
      for (let i = dnums.length - 1; i >= 0; i--) {
        const dn = dnums[i];
        dn.y -= 0.15;
        dn.life--;
        if (dn.life <= 0) {
          dnums[i] = dnums[dnums.length - 1]; dnums.pop(); // swap-and-pop
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
    this.renderCombatHUD(r, cols, rows, battleH, bg);
  }

  // ─── GAME LOOP ───

  gameLoop(timestamp) {
    if (!this.running) return;

    try {
      const delta = timestamp - this.lastFrame;
      this.lastFrame = timestamp;

      // Advance real-time clock during gameplay states
      const gameplayStates = ['OVERWORLD', 'LOCATION', 'DUNGEON', 'DIALOGUE', 'SHOP', 'INVENTORY', 'CHARACTER', 'QUEST_LOG', 'MAP', 'COMBAT', 'QUEST_COMPASS', 'GAMEPAD_MENU'];
      const isGameplay = gameplayStates.includes(this.state);
      if (this.timeSystem) {
        this.timeSystem.setRealTimePaused(!isGameplay);
        if (isGameplay) {
          this.timeSystem.updateRealTime(timestamp);
        }
      }

      // Check for overworld day/night music crossfade
      if (this.state === 'OVERWORLD' && this.music && this.timeSystem) {
        const wantTrack = this.timeSystem.isDaytime() ? TRACKS.OVERWORLD_DAY : TRACKS.OVERWORLD_NIGHT;
        if (this.music.currentTrack !== wantTrack) {
          this.music.play(wantTrack);
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
    } catch (e) {
      console.error('Game loop error:', e);
      _drawErrorToCanvas(this.canvas, e);
      return; // stop the loop — error is shown on canvas
    }

    requestAnimationFrame((ts) => this.gameLoop(ts));
  }

  start() {
    this.lastFrame = performance.now();
    this.setState('PREAMBLE');
    requestAnimationFrame((ts) => this.gameLoop(ts));
  }

  // ─── DEBUG PANEL (legacy stub — now uses in-game canvas screen) ───

  toggleDebugPanel() {
    // Hide old HTML panel if it exists
    if (this._debugPanel) {
      this._debugPanel.style.display = 'none';
      this._debugVisible = false;
    }
    // Route to the new in-game debug menu state
    if (this.state === 'DEBUG_MENU') {
      this.setState(this._debugReturnState || 'OVERWORLD');
    } else {
      this._debugReturnState = this.state;
      this.ui.debugTab = 0;
      this.ui.debugCursor = 0;
      this.ui.debugScroll = 0;
      this.setState('DEBUG_MENU');
    }
  }
}

// ─── ERROR DISPLAY ───

function _drawErrorToCanvas(canvas, err) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.fillStyle = '#1a0000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.font = '16px monospace';
  ctx.fillStyle = '#ff4444';
  ctx.fillText('ASCIIQUEST — Fatal Error', 20, 40);
  ctx.fillStyle = '#ffaaaa';
  ctx.font = '14px monospace';
  const msg = String(err && err.stack ? err.stack : err);
  const lines = msg.split('\n');
  for (let i = 0; i < Math.min(lines.length, 20); i++) {
    ctx.fillText(lines[i], 20, 70 + i * 18);
  }
  ctx.fillStyle = '#888888';
  ctx.fillText('Check browser console (F12) for details.', 20, 70 + Math.min(lines.length, 20) * 18 + 20);
}

// ─── BOOTSTRAP ───

window.addEventListener('DOMContentLoaded', () => {
  try {
    const game = new Game();
    game.start();
  } catch (e) {
    console.error('Game failed to initialize:', e);
    _drawErrorToCanvas(document.getElementById('game-canvas'), e);
  }
});

// Catch uncaught errors that occur during module evaluation or async init
window.addEventListener('error', (event) => {
  console.error('Uncaught error:', event.error || event.message);
  const canvas = document.getElementById('game-canvas');
  if (canvas) _drawErrorToCanvas(canvas, event.error || event.message);
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled promise rejection:', event.reason);
  const canvas = document.getElementById('game-canvas');
  if (canvas) _drawErrorToCanvas(canvas, event.reason);
});
