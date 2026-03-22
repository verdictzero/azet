import { COLORS, LAYOUT, Renderer, Camera, InputManager, ParticleSystem, GlowSystem } from './engine.js';
import { SeededRNG, PerlinNoise, AStar, distance, bresenhamLine } from './utils.js';
import { OverworldGenerator, ChunkManager, SettlementGenerator, BuildingInterior, DungeonGenerator, TowerGenerator, RuinGenerator } from './world.js';
import { NameGenerator, NPCGenerator, DialogueSystem, LoreGenerator, Player, ItemGenerator, CreatureGenerator } from './entities.js';
import { CombatSystem, QuestSystem, ShopSystem, FactionSystem, TimeSystem, InventorySystem, EventSystem, WeatherSystem, LightingSystem, CloudSystem } from './systems.js';
import { WorldHistoryGenerator } from './worldhistory.js';
import { UIManager } from './ui.js';
import { getMonsterArt } from './monsterart.js';
import { expandTile } from './tileExpansion.js';
import { MusicManager, TRACKS } from './music.js';

// ─── Save Export/Import Cipher ───
const SAVE_CIPHER_KEY = 'AETHON-ASCIIQUEST-2024';
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
    this.music = new MusicManager();
    this._loadVersion();

    // Auto-refresh: version polling
    this._currentVersion = null; // set by _loadVersion
    this._updateAvailable = false;
    this._updateDetectedAt = null;
    this._startVersionPolling();

    // Game state
    this.state = 'PREAMBLE'; // PREAMBLE, MENU, CHAR_CREATE, LOADING, OVERWORLD, LOCATION, DUNGEON, DIALOGUE, SHOP, INVENTORY, CHARACTER, QUEST_LOG, MAP, HELP, SETTINGS, GAME_OVER, COMBAT, BATTLE_ENTER, BATTLE_RESULTS, QUEST_COMPASS, DEBUG_MENU, CONSOLE_LOG, ALMANAC

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
    };
    this._debugPanel = null;      // legacy HTML panel (unused)
    this._debugVisible = false;    // legacy (unused)
    this._debugReturnState = null; // state to return to when closing debug menu
    this.showDebugButtons = false; // toggle debug button bar
    this._debugButtonRects = [];   // hit areas for debug buttons

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
    this.battleEnterTimer = 0;  // frames for battle enter animation
    this.battleResults = null;  // stored results for BATTLE_RESULTS screen
    this.battleResultsTimer = 0; // animation timer for results screen

    // Active dialogue/shop
    this.activeNPC = null;

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
    this.camera.viewportCols = this.renderer.cols - 2;
    this.camera.viewportRows = this.renderer.rows - LAYOUT.HUD_TOTAL;
    if (this.locationCamera) {
      this.locationCamera.viewportCols = this.renderer.cols - 2;
      this.locationCamera.viewportRows = this.renderer.rows - LAYOUT.HUD_TOTAL;
    }
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
      'CONSOLE_LOG', 'DEBUG_MENU', 'QUEST_COMPASS'
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
      // Step 5: Create ChunkManager and generate initial chunks (with historical map scars)
      () => {
        this._loadingStep = { current: 3, total: 10, label: 'Mapping the regions...' };
        this.overworld = new ChunkManager(this.seed);
        // Wire historical map scars into terrain generation
        if (this.worldHistoryGen && this.worldHistoryGen.mapScars && this.worldHistoryGen.mapScars.length > 0) {
          this.overworld.setMapScars(this.worldHistoryGen.mapScars, this.worldHistoryGen.regions);
          log(`  ${this.worldHistoryGen.mapScars.length} historical scars will mark the landscape`, COLORS.BRIGHT_YELLOW);
        }
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
      // Step 12: Place player and enter world
      () => {
        this._loadingStep = { current: 10, total: 10, label: 'Entering the world...' };
        const loadedLocs = this.overworld.getLoadedLocations();
        const startLoc = loadedLocs.find(l => l.type === 'village') || loadedLocs[0];
        if (startLoc) {
          startLoc.name = 'Broken Arm';
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

    this.currentDungeonLocation = location;
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

    this.currentDungeonLocation = location;
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

    this.currentDungeonLocation = location;
    this.gameContext.currentLocationName = (location.name || 'Dungeon') + ` (Floor ${this.currentFloor + 1})`;
    this.setState('DUNGEON');
    this.ui.addMessage('You descend into the dark depths...', COLORS.BRIGHT_RED);
  }

  enterMechanicalRuin(location) {
    const id = typeof location.id === 'string' ? location.id.charCodeAt(0) : (location.id || 0);
    const rng = new SeededRNG(this.seed + id * 6000);
    this.currentFloor = 0;
    const dungeon = this.dungeonGen.generate(rng, 60, 40, 1, 'mechanical');
    this.currentDungeon = dungeon;

    // Spawn enemies
    this.enemies = [];
    if (dungeon.entitySpots) {
      for (const spot of dungeon.entitySpots) {
        if (spot.type === 'enemy') {
          const creature = this.creatureGen.generate(rng, 'mechanical', this.currentFloor + 1, this.player.stats.level);
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
          const item = this.itemGen.generate(rng,
            rng.random(['weapon', 'armor', 'potion']),
            this.itemGen.rollRarity(rng, this.currentFloor + 1),
            this.currentFloor + 1);
          item.position = { x: spot.x, y: spot.y };
          this.items.push(item);
        }
      }
    }

    // Place player at entrance
    if (dungeon.rooms && dungeon.rooms.length > 0) {
      const entrance = dungeon.rooms.find(r => r.type === 'entrance') || dungeon.rooms[0];
      this.player.position.x = entrance.x + Math.floor(entrance.w / 2);
      this.player.position.y = entrance.y + Math.floor(entrance.h / 2);
    }

    this.gameContext.currentLocationName = (location.name || 'Mechanical Ruin') + ` (Floor ${this.currentFloor + 1})`;
    this.setState('DUNGEON');
    this.ui.addMessage('You enter the dormant machinery... gears creak in the darkness.', COLORS.BRIGHT_YELLOW);
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
      case 'DEBUG_MENU': return this.handleDebugMenuInput(key);
      case 'CONSOLE_LOG': return this.handleConsoleLogInput(key);
      case 'ALMANAC': return this.handleAlmanacInput(key);
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
    const result = this.ui.handleHorizontalMenuInput(key, 6);
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
        case 2: // Continue
          if (this.loadGame()) {
            this.ui.addMessage('Game loaded.', COLORS.BRIGHT_GREEN);
          } else {
            this.ui.addMessage('No save found.', COLORS.BRIGHT_RED);
          }
          break;
        case 3: // Import Save
          this.importSave();
          break;
        case 4: // Settings
          this.setState('SETTINGS');
          break;
        case 5: // Help
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
    if (key === 'l' || key === 'L') { this.setState('ALMANAC'); return; }

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
    if (key === 'l' || key === 'L') { this.setState('ALMANAC'); return; }

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
    if (key === 'l' || key === 'L') { this.setState('ALMANAC'); return; }

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
    if (key === '?') { this.setState('HELP'); return; }
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
      const locData = this.currentSettlement?.locationData;
      const questCtx = { ...this.gameContext,
        settlementCoords: locData ? { x: locData.x, y: locData.y } : null,
        nearbyLocations: this.overworld?.getLoadedLocations() || [] };
      const quest = this.questSystem.generateQuest(this.rng, this.activeNPC,
        this.player.stats.level, questCtx);
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
    if (key >= '1' && key <= '4') {
      ui.debugTab = parseInt(key) - 1;
      ui.debugCursor = 0;
      ui.debugScroll = 0;
      return;
    }
    if (key === 'ArrowRight' || key === 'Tab') {
      ui.debugTab = (tab + 1) % 4;
      ui.debugCursor = 0;
      ui.debugScroll = 0;
      return;
    }
    if (key === 'ArrowLeft') {
      ui.debugTab = (tab - 1 + 4) % 4;
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
    const tabCount = 7;
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
    } else if (key >= '1' && key <= '7') {
      this.ui.almanacTab = parseInt(key) - 1;
      this.ui.almanacScroll = 0;
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
    const baseEncounterRate = 0.015 * this.activeEffects.encounterRateMultiplier;
    const isNight = !this.timeSystem.isDaytime();
    const lightInfo = this.player.hasLightSource();
    let nightBonus = 1.0;
    if (isNight) {
      nightBonus = lightInfo.hasLight ? 1.3 : 2.0;
    }
    // Special events (e.g. BREACH_SWARM with encounterRateMultiplier >= 2) bypass cooldown
    const bypassCooldown = this.activeEffects.encounterRateMultiplier >= 2;
    if (!this.debug.noEncounters && (bypassCooldown || this._encounterCooldown <= 0) && this.rng.chance(baseEncounterRate * nightBonus)) {
      this._encounterCooldown = 18; // suppress encounters for ~18 steps after one
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
      this.startBattleTransition(enemyAt);
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
    }
    if (this.input) this.input.enableTouch = this.settings.touchControls;
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
    this.input.enableTouch = this.settings.touchControls;
    if (this.music) {
      this.music.setVolume(this.settings.musicVolume);
      this.music.setMuted(this.settings.musicMuted);
    }
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
        trackedQuestId: this._trackedQuestId,
        historyDepth: this.charGenState ? this.charGenState.historyDepth : 'medium',
        messageLog: this.ui.messageLog.slice(-500)
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
        this.ui.drawLocationOverview(this.currentSettlement, this.npcs, this.player, this.locationCamera, this.timeSystem.getSunDirection(), this.timeSystem.hour);
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

      case 'CONSOLE_LOG':
        this.ui.drawConsoleLog();
        break;

      case 'ALMANAC':
        this.ui.drawAlmanac(this.worldHistoryGen, this.ui.messageLog);
        break;
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
    const hasTimeTint = ['OVERWORLD', 'LOCATION', 'DUNGEON'].includes(this.state);
    const isAnimatedScreen = this.state === 'QUEST_COMPASS' || this.state === 'MENU' || this.state === 'LOADING' || this.state === 'WORLD_GEN_PAUSE' || this.state === 'COMBAT' || this.state === 'BATTLE_ENTER' || this.state === 'ENEMY_DEATH' || this.state === 'BATTLE_RESULTS';
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

      // Apply weather ambient lighting
      const weatherAmbient = this.weatherSystem.getAmbientEffect();
      if (weatherAmbient) {
        let wAlpha = weatherAmbient.tintAlpha;
        if (weatherAmbient.pulseSpeed > 0) {
          const pulse = Math.sin(Date.now() / 1000 * weatherAmbient.pulseSpeed) * weatherAmbient.pulseAmount;
          wAlpha = Math.max(0, Math.min(1, wAlpha + pulse));
        }
        this.renderer.tintViewport(weatherAmbient.tintColor, wAlpha, viewLeft, viewTop, viewW, viewH);

        // Brightness shift across viewport
        const bShift = weatherAmbient.brightnessShift;
        if (bShift < 0) {
          const darkAlpha = Math.abs(bShift);
          for (let sy = 0; sy < viewH; sy++)
            for (let sx = 0; sx < viewW; sx++)
              this.renderer.darkenCell(viewLeft + sx, viewTop + sy, darkAlpha);
        } else if (bShift > 0) {
          for (let sy = 0; sy < viewH; sy++)
            for (let sx = 0; sx < viewW; sx++)
              this.renderer.brightenCell(viewLeft + sx, viewTop + sy, bShift);
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

      // Apply shadow darkening in overworld (post-process on canvas)
      if (this.state === 'OVERWORLD' && this._shadowCells) {
        for (const [key, alpha] of this._shadowCells) {
          const [sx, sy] = key.split(',').map(Number);
          this.renderer.darkenCell(viewLeft + sx, viewTop + sy, alpha);
        }

        // Render sun-facing highlights on raised object edges
        if (this._highlightCells) {
          const owDir = this.timeSystem.getSunDirection();
          const hlTint = owDir.isDay ? '#FFEEAA' : '#AABBDD';
          for (const [key, intensity] of this._highlightCells) {
            const [hx, hy] = key.split(',').map(Number);
            this.renderer.brightenCell(viewLeft + hx, viewTop + hy, intensity, hlTint);
          }
        }

        // God rays / sunbeams in unshadowed areas (throttled: recompute every 3rd frame)
        // Works for both sun (day) and moon (night)
        const owSunDir = this.timeSystem.getSunDirection();
        if (this._shadowCells.size > 0 && this.renderer._godRayNoise) {
          this._godRayFrame++;
          const camX = Math.floor(this.camera.x);
          const camY = Math.floor(this.camera.y);
          const cameraMoved = camX !== this._godRayCacheCamX || camY !== this._godRayCacheCamY;
          if (!this._godRayCachedCells || this._godRayFrame % 3 === 0 || cameraMoved) {
            // Recompute god rays
            this._godRayCacheCamX = camX;
            this._godRayCacheCamY = camY;
            const cells = [];
            const perpX = -(owSunDir.dy || 0);
            const perpY = owSunDir.dx || 0;
            const ts = Date.now() / 1000;
            // Along-ray direction (shadow direction = away from sun)
            const alongX = owSunDir.dx || 0;
            const alongY = owSunDir.dy || 0;
            // Compute projection range across viewport for normalization
            const c0 = 0, c1 = (viewW - 1) * alongX, c2 = (viewH - 1) * alongY, c3 = c1 + c2;
            const minAlong = Math.min(c0, c1, c2, c3);
            const maxAlong = Math.max(c0, c1, c2, c3);
            const alongRange = maxAlong - minAlong || 1;
            for (let sy = 0; sy < viewH; sy++) {
              for (let sx = 0; sx < viewW; sx++) {
                const key = `${sx},${sy}`;
                if (this._shadowCells.has(key)) continue;
                let nearShadow = false;
                for (let nd = 1; nd <= 2; nd++) {
                  const ckx = sx + Math.round((owSunDir.dx || 0) * nd);
                  const cky = sy + Math.round((owSunDir.dy || 0) * nd);
                  if (this._shadowCells.has(`${ckx},${cky}`)) { nearShadow = true; break; }
                }
                const proj = sx * perpX + sy * perpY;
                const rayN = this.renderer._godRayNoise.noise2D(proj * 0.25 + ts * 0.03, ts * 0.02);
                if (rayN > 0.05) {
                  const intensity = (rayN - 0.05) / 0.95 * 0.15 + (nearShadow ? 0.08 : 0);
                  // Along-ray factor: 0 = near sun (cool/bright), 1 = far from sun (warm/dim)
                  const alongProj = sx * alongX + sy * alongY;
                  const rayT = (alongProj - minAlong) / alongRange;
                  cells.push(sx, sy, Math.min(0.25, intensity), rayT);
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
              // Sunlight: Cool origin #DDEEFF → Warm far end #FFCC66
              cR = Math.round(221 + t * 34);   // 221→255
              cG = Math.round(238 - t * 34);   // 238→204
              cB = Math.round(255 - t * 153);  // 255→102
            } else {
              // Moonlight: Cool silver #AABBDD → Pale blue #8899CC
              cR = Math.round(170 - t * 34);   // 170→136
              cG = Math.round(187 - t * 34);   // 187→153
              cB = Math.round(221 - t * 17);   // 221→204
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

      // Apply cloud overlay and cloud shadows in overworld
      if (this.state === 'OVERWORLD' && this.cloudSystem && !this.debug.disableClouds) {
        const camX = Math.floor(this.camera.x);
        const camY = Math.floor(this.camera.y);
        const dLevel = this.renderer.densityLevel;
        const cloudWorldW = Math.ceil(viewW / dLevel);
        const cloudWorldH = Math.ceil(viewH / dLevel);
        const sunDir = this.timeSystem.getSunDirection();
        const isDay = this.timeSystem.isDaytime();

        // Shadow offset: high sun → close shadow, low sun → far shadow
        const shadowDist = sunDir.elevation > 0.05
          ? Math.min(8, Math.round(2.0 / sunDir.elevation))
          : 8;
        const shOffX = Math.round(sunDir.dx * shadowDist);
        const shOffY = Math.round(sunDir.dy * shadowDist);

        const castShadows = isDay && sunDir.elevation > 0.05;
        const alphaMul = isDay ? 0.18 : 0.06;
        const rr = this.renderer;
        if (dLevel === 1) {
          // Fast path: no inner density loops needed
          for (let wy_off = 0; wy_off < cloudWorldH; wy_off++) {
            for (let wx_off = 0; wx_off < cloudWorldW; wx_off++) {
              const cDensity = this.cloudSystem.getCloudDensity(camX + wx_off, camY + wy_off);
              if (cDensity > 0) {
                if (wx_off < viewW && wy_off < viewH) {
                  rr.tintCell(viewLeft + wx_off, viewTop + wy_off, '#CCCCEE', cDensity * alphaMul);
                }
                if (castShadows) {
                  const shwx = wx_off + shOffX;
                  const shwy = wy_off + shOffY;
                  if (shwx >= 0 && shwx < cloudWorldW && shwy >= 0 && shwy < cloudWorldH
                      && shwx < viewW && shwy < viewH) {
                    rr.darkenCell(viewLeft + shwx, viewTop + shwy, cDensity * 0.20);
                  }
                }
              }
            }
          }
        } else {
          for (let wy_off = 0; wy_off < cloudWorldH; wy_off++) {
            for (let wx_off = 0; wx_off < cloudWorldW; wx_off++) {
              const cDensity = this.cloudSystem.getCloudDensity(camX + wx_off, camY + wy_off);
              if (cDensity > 0) {
                const cloudAlpha = cDensity * alphaMul;
                const baseX = wx_off * dLevel;
                const baseY = wy_off * dLevel;
                for (let sdy = 0; sdy < dLevel; sdy++) {
                  const screenY = baseY + sdy;
                  if (screenY >= viewH) break;
                  for (let sdx = 0; sdx < dLevel; sdx++) {
                    const screenX = baseX + sdx;
                    if (screenX < viewW) {
                      rr.tintCell(viewLeft + screenX, viewTop + screenY, '#CCCCEE', cloudAlpha);
                    }
                  }
                }
                if (castShadows) {
                  const shwx = wx_off + shOffX;
                  const shwy = wy_off + shOffY;
                  if (shwx >= 0 && shwx < cloudWorldW && shwy >= 0 && shwy < cloudWorldH) {
                    const shadowAlpha = cDensity * 0.20;
                    const shBaseX = shwx * dLevel;
                    const shBaseY = shwy * dLevel;
                    for (let sdy = 0; sdy < dLevel; sdy++) {
                      const screenY = shBaseY + sdy;
                      if (screenY >= viewH) break;
                      for (let sdx = 0; sdx < dLevel; sdx++) {
                        const screenX = shBaseX + sdx;
                        if (screenX < viewW) {
                          rr.darkenCell(viewLeft + screenX, viewTop + screenY, shadowAlpha);
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

      // Apply colored light glow for player light source at night
      if (!this.timeSystem.isDaytime()) {
        const lightInfo = this.player?.hasLightSource();
        if (lightInfo?.hasLight && this.state === 'OVERWORLD') {
          const camX = Math.floor(this.camera.x);
          const camY = Math.floor(this.camera.y);
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
    const camX = Math.floor(this.camera.x);
    const camY = Math.floor(this.camera.y);
    const worldW = Math.ceil(viewW / density);
    const worldH = Math.ceil(viewH / density);
    // Center offset for entities within their expanded tile (0 for d=1, 0 for d=2, 1 for d=3)
    const entityOff = Math.floor(density / 2);

    // Collect shadow cells with infinitely linear shadow rays (in screen coords)
    const shadowCells = new Map(); // "sx,sy" -> alpha
    // Collect highlight cells on sun-facing edges of raised objects
    const highlightCells = new Map(); // "sx,sy" -> intensity
    if (!this.debug.disableShadows) {
      // Normalized shadow direction for ray marching
      const sdMag = Math.sqrt(sunDir.dx * sunDir.dx + sunDir.dy * sunDir.dy) || 1;
      const sdx = sunDir.dx / sdMag;
      const sdy = sunDir.dy / sdMag;
      // Max ray steps to reach viewport edge
      const maxRayLen = viewW + viewH;

      for (let wy_off = 0; wy_off < worldH; wy_off++) {
        for (let wx_off = 0; wx_off < worldW; wx_off++) {
          const wx = camX + wx_off;
          const wy = camY + wy_off;
          const tile = this.overworld.getTile(wx, wy);
          const height = Game.TILE_HEIGHTS[tile.type] || 0;
          if (height > 0) {
            // Shadow alpha scales with height
            const shadowAlpha = (sunDir.isDay ? 0.25 : 0.15) + Math.min(0.15, height * 0.03);
            const shadowMax = sunDir.isDay ? 0.65 : 0.45;
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
                    const key = `${shx},${shy}`;
                    const existing = shadowCells.get(key) || 0;
                    // Fade shadow slightly over distance
                    const dist = i / maxRayLen;
                    const fadedAlpha = shadowAlpha * (1.0 - dist * 0.5);
                    shadowCells.set(key, Math.min(shadowMax, existing + fadedAlpha));
                  }
                }
              }
              if (!anyInBounds) break; // past viewport edge
            }

            // Highlight sun-facing edges (opposite side from shadow direction)
            const hlLen = Math.max(1, Math.round(height * 0.5));
            const hlIntensity = sunDir.isDay ? 0.18 : 0.08;
            for (let i = 1; i <= hlLen; i++) {
              // Only highlight ground-level tiles — skip if destination is also raised
              const destWxOff = wx_off - Math.round(sdx * i);
              const destWyOff = wy_off - Math.round(sdy * i);
              const destTile = this.overworld.getTile(camX + destWxOff, camY + destWyOff);
              const destHeight = Game.TILE_HEIGHTS[destTile.type] || 0;
              if (destHeight >= height) continue;
              const hlBaseX = wx_off * density - sdx * i * density;
              const hlBaseY = wy_off * density - sdy * i * density;
              for (let hdy = 0; hdy < density; hdy++) {
                for (let hdx = 0; hdx < density; hdx++) {
                  const hlx = Math.floor(hlBaseX) + hdx;
                  const hly = Math.floor(hlBaseY) + hdy;
                  if (hlx >= 0 && hlx < viewW && hly >= 0 && hly < viewH) {
                    const key = `${hlx},${hly}`;
                    const existing = highlightCells.get(key) || 0;
                    highlightCells.set(key, Math.min(0.3, existing + hlIntensity / i));
                  }
                }
              }
            }
          }
        }
      }
    }
    this._highlightCells = highlightCells;

    // Render tiles with density expansion
    for (let wy_off = 0; wy_off < worldH; wy_off++) {
      for (let wx_off = 0; wx_off < worldW; wx_off++) {
        const wx = camX + wx_off;
        const wy = camY + wy_off;
        const tile = this.overworld.getTile(wx, wy);

        // Fog of war — only at night; daytime has full visibility
        const dist = distance(wx, wy, this.player.position.x, this.player.position.y);
        const isFogged = isNight && dist > viewRange;

        if (density === 1) {
          const ch = r.getAnimatedChar(tile.char, tile.type, wx, wy);
          const fg = isFogged ? COLORS.BRIGHT_BLACK : (r.getAnimatedColorWithPos ? r.getAnimatedColorWithPos(tile.fg, tile.type, wx, wy) : r.getAnimatedColor(tile.fg, tile.type));
          const bg = isFogged ? COLORS.BLACK : (tile.bg || COLORS.BLACK);
          r.drawChar(viewLeft + wx_off, viewTop + wy_off, ch, fg, bg);
        } else {
          const expanded = expandTile(tile, density, wx, wy);
          for (let dy = 0; dy < density; dy++) {
            for (let dx = 0; dx < density; dx++) {
              const screenX = viewLeft + wx_off * density + dx;
              const screenY = viewTop + wy_off * density + dy;
              if (screenX < viewLeft + viewW && screenY < viewTop + viewH) {
                const ch = r.getAnimatedChar(expanded.chars[dy][dx], tile.type, wx, wy);
                const fg = isFogged ? COLORS.BRIGHT_BLACK : (r.getAnimatedColorWithPos ? r.getAnimatedColorWithPos(expanded.fgs[dy][dx], tile.type, wx, wy) : r.getAnimatedColor(expanded.fgs[dy][dx], tile.type));
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
    const px = this.player.position.x - camX;
    const py = this.player.position.y - camY;
    if (px >= 0 && px < worldW && py >= 0 && py < worldH) {
      const screenX = viewLeft + px * density + entityOff;
      const screenY = viewTop + py * density + entityOff;
      r.drawChar(screenX, screenY, '@', this.glow.getGlowColor('PLAYER', COLORS.BRIGHT_YELLOW));
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
              for (let ldy = -rad; ldy <= rad; ldy++) {
                for (let ldx = -rad; ldx <= rad; ldx++) {
                  const dist = Math.sqrt(ldx * ldx + ldy * ldy);
                  if (dist > rad) continue;
                  const wx_off = light.x + ldx - camX;
                  const wy_off = light.y + ldy - camY;
                  if (wx_off < 0 || wx_off >= worldW || wy_off < 0 || wy_off >= worldH) continue;
                  const falloff = Math.max(0, 1 - dist / rad);
                  const alpha = falloff * falloff * light.intensity * 0.4;
                  const hexR = Math.round(light.r * 255).toString(16).padStart(2, '0');
                  const hexG = Math.round(light.g * 255).toString(16).padStart(2, '0');
                  const hexB = Math.round(light.b * 255).toString(16).padStart(2, '0');
                  const tintColor = `#${hexR}${hexG}${hexB}`;
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
        OCEAN:       { hMin: 190, hMax: 220, int: 0.12, spd: 0.8,  rad: 1, pat: 'wave' },
        DEEP_OCEAN:  { hMin: 200, hMax: 240, int: 0.10, spd: 0.6,  rad: 1, pat: 'wave' },
        DEEP_LAKE:   { hMin: 200, hMax: 240, int: 0.10, spd: 0.6,  rad: 1, pat: 'wave' },
        SHALLOWS:    { hMin: 170, hMax: 210, int: 0.14, spd: 1.0,  rad: 1, pat: 'wave' },
        WATER:       { hMin: 180, hMax: 215, int: 0.12, spd: 0.8,  rad: 1, pat: 'wave' },
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
      };
      const now = Date.now() / 1000;
      // Collect glow sources then apply (allows light-bleed to neighbours)
      const glowCells = []; // {wx_off, wy_off, profile, wx, wy}
      for (let wy_off = 0; wy_off < worldH; wy_off++) {
        for (let wx_off = 0; wx_off < worldW; wx_off++) {
          const wx = camX + wx_off;
          const wy = camY + wy_off;
          const tile = this.overworld.getTile(wx, wy);
          const prof = NIGHT_GLOW[tile.type];
          if (prof) glowCells.push({ wx_off, wy_off, prof, wx, wy });
        }
      }
      for (const gc of glowCells) {
        const { wx_off, wy_off, prof, wx, wy } = gc;
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
        const hue2rgb = (p, q, t2) => { if (t2 < 0) t2++; if (t2 > 1) t2--; return t2 < 1/6 ? p + (q-p)*6*t2 : t2 < 1/2 ? q : t2 < 2/3 ? p + (q-p)*(2/3-t2)*6 : p; };
        const q = l < 0.5 ? l*(1+s) : l+s-l*s, p = 2*l-q;
        const rr = Math.round(hue2rgb(p,q,h+1/3)*255).toString(16).padStart(2,'0');
        const gg = Math.round(hue2rgb(p,q,h)*255).toString(16).padStart(2,'0');
        const bb = Math.round(hue2rgb(p,q,h-1/3)*255).toString(16).padStart(2,'0');
        const glowColor = `#${rr}${gg}${bb}`;
        // Apply glow to tile itself + bleed to surrounding tiles
        const rad = prof.rad;
        for (let ldy = -rad; ldy <= rad; ldy++) {
          for (let ldx = -rad; ldx <= rad; ldx++) {
            const dist = Math.sqrt(ldx * ldx + ldy * ldy);
            if (dist > rad) continue;
            const tx = wx_off + ldx;
            const ty = wy_off + ldy;
            if (tx < 0 || tx >= worldW || ty < 0 || ty >= worldH) continue;
            // Check fog: skip if this target cell is fogged
            const twx = camX + tx, twy = camY + ty;
            const tdist = distance(twx, twy, this.player.position.x, this.player.position.y);
            if (tdist > viewRange) continue;
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

    // Store shadow data for post-process tinting pass
    this._shadowCells = shadowCells;

    // Render weather particles (screen-space, works at any density)
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
    this.particles.render(r, camX, camY);
  }

  renderDungeon() {
    if (!this.currentDungeon || !this.currentDungeon.tiles) return;

    const r = this.renderer;
    const viewLeft = 1;
    const viewTop = LAYOUT.VIEWPORT_TOP;
    const viewW = r.cols - 2;
    const viewH = r.rows - LAYOUT.HUD_TOTAL;

    const density = r.densityLevel;
    const worldW = Math.ceil(viewW / density);
    const worldH = Math.ceil(viewH / density);
    const entityOff = Math.floor(density / 2);

    // Center on player (in world tiles)
    const offsetX = this.player.position.x - Math.floor(worldW / 2);
    const offsetY = this.player.position.y - Math.floor(worldH / 2);

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
      const lt = Date.now() / 1000;
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

    // Render particles in dungeon
    this.particles.update();
    this.particles.render(r, offsetX, offsetY);
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

// ─── BOOTSTRAP ───

window.addEventListener('DOMContentLoaded', () => {
  const game = new Game();
  game.start();
});
