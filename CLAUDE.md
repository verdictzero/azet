# CLAUDE.md - Notes for Claude Code

## Structure Editor (utils/editor/)

### Status: All files created, needs browser testing

### File layout:
```
utils/editor/
  index.html                    -- Entry point
  style.css                     -- Dark theme, CGA green accents
  app.js                        -- Tab routing, save/load, undo/redo
  state.js                      -- Central state store with event emitter
  data-constants.js             -- Barrel re-export from data/ subdirectory
  data/
    npc-constants.js            -- NAME_POOLS, NICKNAMES, TRAITS, ROLES, SCHEDULES, etc.
    item-constants.js           -- WEAPON/ARMOR_SUBTYPES, PREFIXES, SUFFIXES, RARITY, BASES
    dialogue-constants.js       -- AMBIENT_DIALOGUE, GREETINGS, RUMOR_TEMPLATES, TOPIC_DIALOGUE
    ability-constants.js        -- ABILITY_EFFECTS (22 abilities)
    creatures-core.js           -- CREATURE_TABLES for 8 core biomes
    creatures-hazard.js         -- CREATURE_TABLES for 11 hazard biomes
    creatures-extreme.js        -- CREATURE_TABLES for 10 extreme biomes
  components/
    form-fields.js              -- Reusable form controls
    json-preview.js             -- Live JSON preview panel
    node-canvas.js              -- Canvas node graph for cause/effect chains
  tabs/
    npc-editor.js, item-editor.js, creature-editor.js
    quest-editor.js, dialogue-editor.js, chain-editor.js
    randomizer.js
```

### TODO: Next steps
- Test editor by opening `utils/editor/index.html` in browser, fix any import/runtime errors
- Verify creatures-core.js has all 8 biomes populated correctly (was built by agent)
- Wire main.js to load authored content (import content-loader.js, call loadAuthoredContent() at startup)
- Wire world.js settlement generator to check authored NPCs by placementHint
- Wire DialogueSystem to check for authored dialogue trees by dialogueTreeId
