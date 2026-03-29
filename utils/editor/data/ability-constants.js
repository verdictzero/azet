// data/ability-constants.js — Creature ability data mirrored from js/entities.js

export const ABILITY_EFFECTS = {
  // Tier 1 — Machine abilities
  empPulse:       { name: 'EMP Pulse', damage: 0, attackReduce: 2, type: 'debuff', description: 'Electromagnetic pulse disrupts your equipment.' },
  overcharge:     { name: 'Overcharge', damage: 8, type: 'magic', description: 'Releases a surge of stored electrical energy.' },
  selfRepair:     { name: 'Self-Repair', damage: 0, healSelf: 5, type: 'heal', description: 'Activates onboard repair subroutines.' },
  // Tier 2 — Mutant abilities
  toxinSpray:     { name: 'Toxin Spray', damage: 3, duration: 3, type: 'dot', description: 'Sprays mutagenic toxin that burns for 3 turns.' },
  corrosiveSpit:  { name: 'Corrosive Spit', damage: 4, armorReduce: 1, defenseReduce: 2, type: 'debuff', description: 'Acid corrodes armor plating.' },
  sporeCloud:     { name: 'Spore Cloud', damage: 2, stun: true, type: 'control', description: 'Releases disorienting spores that root you in place.' },
  // Tier 3 — Alien abilities
  psionicLash:    { name: 'Psionic Lash', damage: 10, type: 'magic', description: 'A wave of alien psychic force.' },
  voidDrain:      { name: 'Void Drain', damage: 5, heal: 5, type: 'drain', description: 'Siphons life energy through an alien organ.' },
  signalJam:      { name: 'Signal Jam', damage: 0, attackReduce: 2, defenseReduce: 2, type: 'debuff', description: 'Disrupts neural interface, weakening attack and defense.' },
  phaseShift:     { name: 'Phase Shift', damage: 0, type: 'utility', description: 'Shifts partially out of phase with local spacetime.' },
  // Tier 4 — Assimilated abilities (nano-fungus hybrids)
  naniteInjection:{ name: 'Nanite Injection', damage: 4, duration: 4, type: 'dot', description: 'Injects self-replicating nanites that consume tissue for 4 turns.' },
  thermalOverload:{ name: 'Thermal Overload', damage: 12, type: 'magic', description: 'Superheated nanite swarm detonation.' },
  assimilate:     { name: 'Assimilate', damage: 6, heal: 6, type: 'drain', description: 'Absorbs biomass to fuel nano-organic growth.' },
  fungalSnare:    { name: 'Fungal Snare', damage: 2, stun: true, type: 'control', description: 'Nano-fungal tendrils lock you in place.' },
  // Tier 5 — Exotic abilities
  gravCrush:      { name: 'Gravity Crush', damage: 6, defenseReduce: 3, type: 'debuff', description: 'Localized gravity spike crushes armor plating.' },
  echoScream:     { name: 'Echo Scream', damage: 5, stun: true, type: 'control', description: 'Sonic blast reverberates through hull corridors.' },
  memoryLeech:    { name: 'Memory Leech', damage: 4, attackReduce: 3, type: 'debuff', description: 'Drains combat knowledge, weakening your attacks.' },
  mirrorShield:   { name: 'Mirror Shield', damage: 0, healSelf: 8, type: 'heal', description: 'Absorbs incoming energy and converts it to self-repair.' },
  chainLightning: { name: 'Chain Lightning', damage: 9, type: 'magic', description: 'Arc of electricity jumps through conductive hull surfaces.' },
  entropyField:   { name: 'Entropy Field', damage: 3, duration: 5, armorReduce: 1, type: 'dot', description: 'Accelerates material decay, corroding equipment over time.' },
  symbioticBurst: { name: 'Symbiotic Burst', damage: 7, heal: 4, type: 'drain', description: 'Paired organism detonates and is rapidly regrown.' },
  timeFracture:   { name: 'Time Fracture', damage: 0, attackReduce: 2, defenseReduce: 2, stun: true, type: 'control', description: 'Temporal stutter freezes you in a causal loop.' },
};
