// content-loader.js — Loads hand-authored game content from data/game-content.json
// This module fetches authored content created by the Structure Editor tool
// and returns it for integration with the game's procedural systems.

/**
 * Load authored game content from JSON.
 * Returns null if the file doesn't exist or is empty.
 * @returns {Promise<Object|null>}
 */
export async function loadAuthoredContent() {
  try {
    const response = await fetch('../data/game-content.json');
    if (!response.ok) return null;

    const data = await response.json();
    if (!data || data.version !== '1.0') return null;

    return {
      npcs: data.npcs || [],
      items: data.items || [],
      creatures: data.creatures || [],
      questChains: data.questChains || [],
      dialogueTrees: data.dialogueTrees || [],
      causeEffectChains: data.causeEffectChains || [],
    };
  } catch (_e) {
    // File not found or invalid JSON — not an error, just no authored content
    return null;
  }
}

/**
 * Register authored quest chains with the QuestSystem.
 * Converts editor format to match QUEST_CHAIN_DEFINITIONS shape.
 */
export function registerAuthoredQuestChains(questSystem, questChains, authoredItems) {
  for (const chain of questChains) {
    // Resolve uniqueItemId to actual item data
    let uniqueItem = null;
    if (chain.finalReward && chain.finalReward.uniqueItemId) {
      uniqueItem = authoredItems.find(i => i.id === chain.finalReward.uniqueItemId) || null;
    }

    const def = {
      id: chain.id,
      name: chain.name,
      faction: chain.faction || null,
      requiredRank: chain.requiredRank || 0,
      minLevel: chain.minLevel || 1,
      stages: (chain.stages || []).map(s => ({
        stageIndex: s.stageIndex,
        questType: s.questType,
        titleTemplate: s.titleTemplate,
        descTemplate: s.descTemplate,
        rewardMultiplier: s.rewardMultiplier || 1.0,
      })),
      finalReward: {
        uniqueItem,
        factionRep: chain.finalReward?.factionRep || 0,
        loreReward: chain.finalReward?.loreReward || null,
      },
      factionConsequences: chain.factionConsequences || null,
      _authored: true, // mark as hand-authored
    };

    questSystem.registerChain(def);
  }
}

/**
 * Find authored NPCs that should be placed in a settlement.
 * @param {Array} authoredNpcs - All authored NPCs
 * @param {string} placementHint - Settlement location hint to match
 * @returns {Array} Matching NPCs
 */
export function getAuthoredNpcsForPlacement(authoredNpcs, placementHint) {
  if (!authoredNpcs || !placementHint) return [];
  return authoredNpcs.filter(npc =>
    npc.placementHint && npc.placementHint === placementHint
  );
}

/**
 * Get authored dialogue tree for an NPC.
 * @param {Array} dialogueTrees - All authored dialogue trees
 * @param {string} npcId - The NPC's id
 * @returns {Object|null} The dialogue tree or null
 */
export function getAuthoredDialogue(dialogueTrees, npcId) {
  if (!dialogueTrees || !npcId) return null;
  return dialogueTrees.find(t => t.npcId === npcId) || null;
}

/**
 * Get authored creatures for a biome.
 * @param {Array} authoredCreatures - All authored creatures
 * @param {string} biome - Biome name
 * @returns {Array} Creatures assigned to this biome
 */
export function getAuthoredCreatures(authoredCreatures, biome) {
  if (!authoredCreatures || !biome) return [];
  return authoredCreatures.filter(c =>
    c.biomes && c.biomes.includes(biome)
  );
}

/**
 * Check if a spawn condition is met.
 * @param {string} condition - Condition string like "quest_complete:chain_guard_01"
 * @param {Object} gameState - Current game state with quest/flag data
 * @returns {boolean}
 */
export function checkSpawnCondition(condition, gameState) {
  if (!condition) return true;

  const parts = condition.split(':');
  const type = parts[0];

  switch (type) {
    case 'quest_complete':
      return gameState.completedQuests?.has(parts[1]) || false;
    case 'quest_stage': {
      const chainId = parts[1];
      const stage = parseInt(parts[2], 10);
      const progress = gameState.chainProgress?.get(chainId);
      return progress && progress.currentStage >= stage;
    }
    case 'flag_set':
      return gameState.flags?.get(parts[1]) === (parts[2] || 'true');
    case 'level_above':
      return (gameState.playerLevel || 1) >= parseInt(parts[1], 10);
    default:
      return true;
  }
}
