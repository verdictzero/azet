// data/item-constants.js — Item-related data mirrored from js/entities.js

export const WEAPON_SUBTYPES = {
  sword:  { char: '/', baseDmg: 5, name: 'Sword' },
  axe:    { char: '\\', baseDmg: 6, name: 'Axe' },
  mace:   { char: '|', baseDmg: 5, name: 'Mace' },
  dagger: { char: '-', baseDmg: 3, name: 'Dagger' },
  staff:  { char: '~', baseDmg: 3, name: 'Staff' },
  bow:    { char: '}', baseDmg: 4, name: 'Bow' },
};

export const ARMOR_SUBTYPES = {
  helmet:     { char: '^', baseDef: 2, name: 'Helmet' },
  chestplate: { char: '[', baseDef: 4, name: 'Chestplate' },
  gloves:     { char: '{', baseDef: 1, name: 'Gloves' },
  leggings:   { char: '=', baseDef: 3, name: 'Leggings' },
  boots:      { char: '_', baseDef: 1, name: 'Boots' },
  shield:     { char: ']', baseDef: 3, name: 'Shield' },
};

export const ITEM_PREFIXES = [
  { name: 'Rusted',          statMul: 0.7 },
  { name: 'Tempered',        statMul: 1.0 },
  { name: 'Reinforced',      statMul: 1.2 },
  { name: 'Reclaimed',       statMul: 1.3 },
  { name: 'Crude',           statMul: 1.1 },
  { name: 'Plasma-Forged',   statMul: 1.4 },
  { name: 'Hardened',        statMul: 1.4 },
  { name: 'Polished',        statMul: 1.3 },
  { name: 'Nano-Enhanced',   statMul: 1.5 },
  { name: 'Founder-Era',     statMul: 1.6 },
  { name: 'Void-Touched',    statMul: 1.5 },
  { name: 'Masterwork',      statMul: 1.7 },
  { name: 'Plated',          statMul: 1.3 },
  { name: 'Alloy-Tempered',  statMul: 1.8 },
  { name: 'Prototype',       statMul: 2.0 },
];

export const ITEM_SUFFIXES = [
  { name: 'of Might',           bonus: { str: 2 } },
  { name: 'of Swiftness',       bonus: { dex: 2 } },
  { name: 'of the Founders',    bonus: { wis: 2 } },
  { name: 'of Endurance',       bonus: { con: 3 } },
  { name: 'of Fury',            bonus: { attack: 3 } },
  { name: 'of Shielding',       bonus: { defense: 2 } },
  { name: 'of Precision',       bonus: { dex: 3 } },
  { name: 'of the Void',        bonus: { str: 3 } },
  { name: 'of Processing',      bonus: { int: 2 } },
  { name: 'of Vitality',        bonus: { hp: 10 } },
  { name: 'of the Fabricator',  bonus: { attack: 2 } },
  { name: 'of the Bulkhead',    bonus: { defense: 3 } },
  { name: 'of the Archive',     bonus: { wis: 3, int: 2 } },
  { name: 'of Breaching',       bonus: { attack: 5 } },
  { name: 'of the Reactor',     bonus: { hp: 15, str: 1 } },
  { name: 'of Insulation',      bonus: { coldResist: 3 } },
  { name: 'of Cooling',         bonus: { heatResist: 3 } },
  { name: 'of the Frost',       bonus: { coldResist: 5, defense: 1 } },
  { name: 'of the Forge',       bonus: { heatResist: 5, defense: 1 } },
  { name: 'of Thermal Balance', bonus: { heatResist: 2, coldResist: 2 } },
];

export const RARITY_MULTIPLIERS = {
  common:    { stat: 1.0, value: 1.0 },
  uncommon:  { stat: 1.3, value: 2.0 },
  rare:      { stat: 1.7, value: 4.0 },
  epic:      { stat: 2.2, value: 8.0 },
  legendary: { stat: 3.0, value: 16.0 },
};

export const RARITY_COLORS = {
  common:    '#aaaaaa',
  uncommon:  '#44cc44',
  rare:      '#4488ff',
  epic:      '#bb44ee',
  legendary: '#ffaa00',
};

export const POTION_BASES = [
  { name: 'Med-Gel Injector',    subtype: 'healing',  color: '#ff4444', effect: { heal: 20 },              value: 15, description: 'A pressurized gel capsule that accelerates tissue repair.' },
  { name: 'Stim Cartridge',      subtype: 'mana',     color: '#4444ff', effect: { mana: 20 },              value: 15, description: 'A neural stimulant that restores focus and energy.' },
  { name: 'Adrenal Booster',     subtype: 'strength', color: '#ff8800', effect: { str: 3, duration: 50 },  value: 25, description: 'A synthetic hormone shot that temporarily amplifies strength.' },
  { name: 'Corrosive Vial',      subtype: 'poison',   color: '#44ff44', effect: { damage: 15 },            value: 20, description: 'A capsule of concentrated industrial solvent.' },
  { name: 'Bio-Patch',           subtype: 'healing',  color: '#ff6666', effect: { heal: 15 },              value: 12, description: 'An adhesive patch that delivers slow-release healing agents.' },
  { name: 'Trauma Foam',         subtype: 'healing',  color: '#ffaaaa', effect: { heal: 25 },              value: 20, description: 'Expanding medical foam that seals and heals deep wounds.' },
];

export const SCROLL_BASES = [
  { name: 'Thermal Grenade',         effect: 'fireball',  damage: 20, value: 30, description: 'Deploys a concentrated thermal charge on nearby targets.' },
  { name: 'Emergency Translocator',  effect: 'teleport',  damage: 0,  value: 40, description: 'Single-use spatial displacement device. Random destination.' },
  { name: 'Diagnostic Scanner',      effect: 'identify',  damage: 0,  value: 20, description: 'Reveals the true specifications of a piece of equipment.' },
  { name: 'Nano-Forge Kit',          effect: 'enchant',   damage: 0,  value: 50, description: 'Nanite assembly kit that upgrades equipment properties.' },
  { name: 'Sector Map Chip',         effect: 'map',       damage: 0,  value: 25, description: 'Data chip that reveals the layout of the current level.' },
  { name: 'Arc Discharge',           effect: 'lightning', damage: 25, value: 35, description: 'Fires a high-voltage arc at the nearest hostile contact.' },
];

export const FOOD_BASES = [
  { name: 'Ration Bar',        heal: 5,  value: 3,  description: 'A compressed nutrient block. Filling enough.' },
  { name: 'Protein Strip',     heal: 8,  value: 5,  description: 'A hearty strip of vat-grown protein.' },
  { name: 'Dried Myco-Fiber',  heal: 10, value: 6,  description: 'Preserved strips of colony-grown fungal fiber.' },
  { name: 'Nutrient Paste',    heal: 20, value: 15, description: 'Calorie-dense bioengineered paste. A single tube sustains for a day.' },
  { name: 'Synth Porridge',    heal: 12, value: 8,  description: 'A bowl of reconstituted grain substitute. Tasteless but filling.' },
  { name: 'Wild Berry',        heal: 8,  value: 6,  description: 'A plump berry gathered from the forest.' },
];

export const MATERIAL_BASES = [
  { name: 'Iron Scraps',           value: 5,  description: 'A chunk of salvageable scrap iron.' },
  { name: 'Copper Ingot',          value: 25, description: 'A bar of refined copper.' },
  { name: 'Fire Crystal',          value: 40, description: 'A glowing crystal infused with elemental fire. Highly valuable.' },
  { name: 'Enchanted Rune Plate',  value: 80, description: 'A plate inscribed with ancient runes. Very rare.' },
  { name: 'Ancient Alloy Shard',   value: 60, description: 'A piece of metal from the Maker era, impossibly strong.' },
  { name: 'Silken Cord',           value: 8,  description: 'A length of magically strengthened silk.' },
];

export const ARTIFACT_BASES = [
  { name: 'Crown of the Forgotten King',      stats: { int: 5, wis: 5, cha: 5 },  description: 'A circlet worn by a king whose name has been lost to history.' },
  { name: 'Blade of the First Dawn',          stats: { attack: 12, str: 4 },      description: 'A radiant blade said to have been forged at the beginning of the world.' },
  { name: 'Gauntlets of the Giant',           stats: { str: 8, attack: 4 },       description: 'Massive gauntlets imbued with giant strength.' },
  { name: 'Amulet of the Makers',             stats: { defense: 6, wis: 6 },      description: 'An amulet that pulses with ancient magic, warding off dark forces.' },
  { name: 'Ring of the Sealed Tomb',          stats: { hp: 30, con: 5 },           description: 'A ring recovered from a sealed crypt, pulsing with restorative power.' },
];
