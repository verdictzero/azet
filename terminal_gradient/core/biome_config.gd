class_name BiomeConfig
extends Resource
## Parameters that govern the terrain-splat noise field and the meadow-zone
## classifier derived from it. Consumed by the splat shader (as material
## uniforms) and by CPU-side vegetation placement (via BiomeField), so both
## sides read from one source and can't drift on a threshold tweak.

## World-space frequency of the FBM field sampled by `BiomeField.fbm`.
@export var noise_freq: float = 0.06
## Field value above which a point classifies as meadow. Higher = rarer,
## smaller meadow pockets.
@export var meadow_threshold: float = 0.55
## Smoothstep width around `meadow_threshold` for the ground shader's
## meadow/forest blend band.
@export var meadow_softness: float = 0.03
## How far past the blend band the CPU culler pushes before calling a point
## meadow, in units of `meadow_softness`. Prevents vegetation brushing the
## visible edge of a meadow pocket.
@export var meadow_cull_inset_mult: float = 1.5

## Frequency of the domain-warp sub-noise used to perturb sample coordinates
## before the main FBM evaluates. Higher than `noise_freq` — this is the
## "small detail" layer that jags the meadow/forest boundary. Set to 0 for
## smooth boundaries (i.e. warp-free).
@export var warp_freq: float = 0.18
## World-space amplitude of the domain-warp displacement, in metres. ~2-3 m
## gives organic ragged boundaries without obliterating the underlying
## patch structure.
@export var warp_amp: float = 2.5


func meadow_cull_gate() -> float:
	return meadow_threshold + meadow_softness * meadow_cull_inset_mult
