# Splatmap Terrain Shader Pattern

**Status:** in use in `ui/screens/splatmap_spawn_test_3_screen.gd` (debug screen).
**Date:** 2026-04-25.
**Builds on:** [`proxy-splatmap-pattern.md`](proxy-splatmap-pattern.md).

## Problem

The proxy-splatmap pattern eliminates CPU/GPU drift by making both sides read the same baked bytes. But baking a discrete *ID* per texel forces the GPU shader to either:

- Sample with `filter_nearest` and accept stairstepped texel-grid boundaries, or
- Sample with `filter_linear` and decode bilinear-blended IDs as garbage (an ID of 1.5 between zones 1 and 2 doesn't mean anything).

Even if you bake at high resolution, the boundary path follows the texel grid at large scales because each pixel must commit to a single ID.  The *micro* edge can be smoothed; the *macro* shape cannot — without changing the architecture.

The classic fix from terrain-rendering is to bake **continuous weight fields** (one scalar per zone) instead of a single ID, and let the shader do the classification at fragment scale.  GPU + CPU both bilinear-sample the same weight bytes; CPU does argmax for spawn (needs a discrete answer); GPU does softmax-weighted colour blending for rendering (gets smooth gradient boundaries by construction).

## The pattern

Per chunk, bake **N weight fields** (one per zone) at low or moderate resolution.  Pack them into texture channels — for 5 zones: RGBA8 + L8.  Both textures bound to a per-chunk `ShaderMaterial.duplicate()` with `filter_linear, repeat_disable`.

**GPU shader** (per fragment):

```glsl
vec4 wa = texture(weights_a, uv);      // w0..w3
float wb = texture(weights_b, uv).r;   // w4

// Softmax with high temperature (sharpness) to keep zone interiors solid
// while blending smoothly at boundaries.
float w_max = max(max(max(wa.r, wa.g), max(wa.b, wa.a)), wb);
float e0 = exp((wa.r - w_max) * sharpness);
float e1 = exp((wa.g - w_max) * sharpness);
// ... e2, e3, e4
float sum = e0 + e1 + e2 + e3 + e4;
vec3 col = (ZONE_COLORS[0]*e0 + ZONE_COLORS[1]*e1 + ... ZONE_COLORS[4]*e4) / sum;

ALBEDO = col;  // (apply desat / post-fx as needed)
```

The softmax probabilities sum to 1, dominate sharply at zone interiors (sub-dominant zones contribute < 1%), and blend smoothly to ~50/50 at boundaries.  No hard step at any pixel → no stairsteps.

**CPU spawn** (per candidate position):

```gdscript
# Bilinear-sample 5 weights, mirror GLSL's LINEAR + CLAMP_TO_EDGE.
var weights := _bilinear_5(weights_a_img, weights_b_img, lx, lz)
# Argmax for the discrete spawn id.
var id: int = _argmax(weights)
```

CPU and GPU read identical bytes, apply identical bilinear interpolation.  CPU's argmax always agrees with the dominant softmax probability on GPU at the same world XZ.  Spawn precision preserved.

## Why this delivers both

| Test | Boundary look | Spawn precision | Architecture |
|---|---|---|---|
| 1 — procedural per-fragment | Smooth | Drift-prone | Two parallel noise-math impls |
| 2 — baked ID + NEAREST | Stairstepped | Perfect | Same bytes, discrete sample |
| **3 — baked weights + softmax** | **Smooth gradient** | **Perfect** | Same bytes, continuous fields |

Test 3 splits the visual decision (continuous, blended, smooth) from the spawn decision (discrete, argmax) — they share the *underlying data* but use it differently.

## Implementation conventions

### Texture packing (N zones)

| N | Layout | Storage |
|---|---|---|
| 1–4 | Single RGBA8 | 4 bytes / texel |
| 5 | RGBA8 + L8 | 5 bytes / texel |
| 6–8 | Two RGBA8 | 8 bytes / texel |
| > 8 | Texture array or 3D texture | varies |

8-bit per weight is enough — boundary location depends only on the *relative ordering* of weights, and 1/255 quantization noise only matters within ~1/255 of the argmax flip-line.

### Softmax temperature (`blend_sharpness`)

A single uniform controls boundary fade width:

| Value | Effect |
|---|---|
| ~8 | Soft / dreamy / wide pastel transitions |
| 32 | Solid zone interiors with a visible ~0.5 m fade band — good default |
| 64+ | Tight edges (close to argmax) — only useful if you specifically want hard transitions |

Subtract `w_max` before `exp()` for numerical stability.  Otherwise `exp(0.8 * 64) ≈ 4×10²²` overflows the range.

### Bake convention + chunk-seam continuity

Bake `(N + 2)² ` instead of N² — one texel of overhang on every side.  Texel `i` (i = 0..N+1) sits at chunk-local `(i − 0.5) × step`, so:
- Index 0 reaches half a step into the LEFT/UP neighbour.
- Index N+1 reaches half a step into the RIGHT/DOWN neighbour.

Adjacent chunks bake the same world XZ at their shared overhang positions, so the GPU's bilinear filter blends continuously across seams.  Without the overhang, `filter_linear` clamps to chunk edges and you see a thin discontinuity at every chunk boundary.

Shader uniforms become `bake_origin = chunk_origin − vec2(step)` and `texture_world_size = (N+2) × step`.

### Sub-dominant blending vs. hard cuts

If you specifically want **discrete** zone colours (no fade band), use argmax instead of softmax.  But then bake at *very high resolution* (≥ 512²) so the texel grid sits below the post-FX raster pass's quantization, otherwise you stairstep again.  Softmax gives smooth boundaries at low bake resolution, which is the usual cheaper choice.

### What stays mirrored

After this refactor, only the small **zone colour LUT** is duplicated between GDScript and GLSL — N hex tuples.  Annotate "MUST match" comments at both sites.  Everything else (noise math, classification, sampling) is single-source-of-truth on CPU.

## When to apply

- You have a CPU classifier that needs to agree with GPU rendering at every world point.
- You want smooth visual boundaries between regions.
- More than 1–2 biomes (single-biome alpha-blends are simpler).
- Threading available for the bake (recommended — see proxy-splatmap pattern doc for `WorkerThreadPool` flow).

## Files of interest (reference implementation)

- `ui/screens/splatmap_spawn_test_3_screen.gd`
  - `_bake_chunk_weights()` — bakes the (N+2)² weight pair on a worker thread.
  - `_sample_baked_id_bilinear()` — CPU mirror of GLSL `texture()` + `LINEAR` + `CLAMP_TO_EDGE`, then argmax.
  - `_finish_chunk_load()` — wires `bake_origin` + `texture_world_size` per chunk.
- `assets/shaders/splat_test_3_ground.gdshader` — softmax-blended ground shader.
- `core/splat_test_zone.gd`
  - `zone_weights_at(wx, wz) → PackedFloat32Array` — exposes the 5 raw FBM weights.
  - `zone_id_at(wx, wz) → int` — kept as argmax convenience wrapper.
