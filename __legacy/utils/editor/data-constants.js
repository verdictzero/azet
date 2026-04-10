// data-constants.js — Barrel file re-exporting all game data constants
// Data is split by domain area in the data/ subdirectory.
// Mirrored from js/entities.js — keep in sync when game data changes.

// NPC data
export {
  NAME_POOLS, NICKNAMES, PERSONALITY_TRAITS, ARCHETYPES,
  ROLE_CHARS, ROLE_COLORS, ROLE_TITLES, SECRET_TEMPLATES,
  ROLE_SCHEDULES, NPC_FACTIONS, NPC_CATEGORIES,
} from './data/npc-constants.js';

// Dialogue data
export {
  AMBIENT_DIALOGUE, GREETINGS, RUMOR_TEMPLATES, TOPIC_DIALOGUE,
} from './data/dialogue-constants.js';

// Item data
export {
  WEAPON_SUBTYPES, ARMOR_SUBTYPES, ITEM_PREFIXES, ITEM_SUFFIXES,
  RARITY_MULTIPLIERS, RARITY_COLORS,
  POTION_BASES, SCROLL_BASES, FOOD_BASES, MATERIAL_BASES, ARTIFACT_BASES,
} from './data/item-constants.js';

// Creature ability data
export { ABILITY_EFFECTS } from './data/ability-constants.js';

// Creature tables (split by biome group)
import { CREATURES_CORE } from './data/creatures-core.js';
import { CREATURES_HAZARD } from './data/creatures-hazard.js';
import { CREATURES_EXTREME } from './data/creatures-extreme.js';

export const CREATURE_TABLES = {
  ...CREATURES_CORE,
  ...CREATURES_HAZARD,
  ...CREATURES_EXTREME,
};

// ── Editor-specific constants ──

export const QUEST_TYPES = ['FETCH', 'KILL', 'ESCORT', 'INVESTIGATE', 'DELIVER', 'BOUNTY', 'CLEAR', 'SURVEY'];
export const FACTION_IDS = ['COLONY_GUARD', 'SALVAGE_GUILD', 'ARCHIVE_KEEPERS', 'SYNDICATE', 'COLONY_COUNCIL'];
export const RACES = ['human', 'enhanced', 'cyborg'];
export const MOODS = ['neutral', 'happy', 'angry', 'suspicious'];
export const BEHAVIORS = ['patrol', 'aggressive', 'ambush', 'coward'];
export const CREATURE_FACTIONS = ['MALFUNCTIONING', 'MUTANT', 'ASSIMILATED', 'ALIEN'];
export const ITEM_TYPES = ['weapon', 'armor', 'potion', 'scroll', 'food', 'ring', 'amulet', 'material', 'artifact', 'light'];
export const RARITIES = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
export const STAT_KEYS = ['hp', 'maxHp', 'attack', 'defense', 'str', 'dex', 'con', 'int', 'wis', 'cha', 'mana', 'coldResist', 'heatResist'];
export const BIOME_KEYS = Object.keys(CREATURE_TABLES);
