# CLAUDE.md - Notes for Claude Code

## TODO: Structure Editor (utils/editor/)

### BLOCKING: `utils/editor/data-constants.js` is MISSING
This file must be created before the editor will work. It needs to:
1. Read `/home/user/azet/js/entities.js` and copy ALL static data constants as `export const`
2. Required constants (copy EXACTLY from entities.js):
   - `NAME_POOLS` (lines 16-74) — human/enhanced/cyborg name pools
   - `NICKNAMES` (lines 76-81)
   - `PERSONALITY_TRAITS` (lines 122-129) — 30 traits
   - `ARCHETYPES` (line 131)
   - `ROLE_CHARS` (lines 133-137), `ROLE_COLORS` (lines 139-153)
   - `ROLE_TITLES` (lines 155-168)
   - `SECRET_TEMPLATES` (lines 170-191)
   - `ROLE_SCHEDULES` (lines 193-325) — all 12 role schedules
   - `NPC_FACTIONS` (lines 327-330), `NPC_CATEGORIES` (lines 336-341)
   - `AMBIENT_DIALOGUE` (lines 354-438)
   - `GREETINGS` (lines 668-698), `RUMOR_TEMPLATES` (lines 701-721)
   - `TOPIC_DIALOGUE` (lines 724-755)
   - `WEAPON_SUBTYPES` (lines 1930-1937), `ARMOR_SUBTYPES` (lines 1939-1946)
   - `ITEM_PREFIXES` (lines 1948-1964), `ITEM_SUFFIXES` (lines 1966-1988)
   - `RARITY_MULTIPLIERS` (lines 1990-1996), `RARITY_COLORS` (lines 1998-2004)
   - `POTION_BASES` (lines 2006-2013), `SCROLL_BASES` (lines 2015-2022)
   - `FOOD_BASES` (lines 2024-2031), `MATERIAL_BASES` (lines 2033-2040)
   - `ARTIFACT_BASES` (lines 2042-2048)
   - `CREATURE_TABLES` (lines 2763-3070) — ALL biome creature arrays
   - `ABILITY_EFFECTS` (lines 3072-3100)
3. Also add these new constants:
   ```js
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
   ```

### After data-constants.js is created:
- Test editor by opening `utils/editor/index.html` in browser
- Wire main.js to load authored content (import content-loader.js, call loadAuthoredContent() at startup)
- Wire world.js settlement generator to check authored NPCs
- Wire DialogueSystem to check for authored dialogue trees
