# Proxy Splatmap Pattern

**Status:** in use in `ui/screens/splatmap_spawn_test_screen.gd` (debug screen).
**Date:** 2026-04-25.

## Problem

When a system needs both:

- a **CPU** decision based on a noise / classifier field (e.g. "what biome lives here?  what kind of foliage spawns at this XZ?"), and
- a **GPU** decision based on the same field (e.g. ground colour, terrain blend),

the obvious approach is to write the noise math twice — once in GDScript, once in GLSL — and require them to be byte-for-byte identical.

That fails. In practice they drift because of:

- GPU precision quirks (mediump fragments at world coords > ~100 m corrupt `fract(p * 123.34)` style hash math).
- Driver / shader-language differences (e.g. Godot's shading language doesn't accept top-level `precision highp float;` declarations even though GLSL ES does).
- Any future refactor that touches one side and forgets the other.

The symptom: prefabs spawn on tiles whose ground colour disagrees with their type.  The cause is **not** a real spawn-classifier bug — it's the architecture forcing two implementations to be twins.

## The pattern

Replace the duplicated math with a single shared **proxy texture** that both sides read.

Per chunk, at load time:

1. **CPU bakes** an `Image` by calling the *one* GDScript classifier (e.g. `SplatTestZone.zone_id_at`) once per texel, writing the integer ID into a single channel.
2. **CPU samples** that same `Image` for every spawn decision in the chunk (replaces live calls to the classifier).
3. **GPU samples** the same texels via `texture(splat_tex, uv).r` with `filter_nearest, repeat_disable` and decodes the byte back to an ID.

Both sides now read **identical bytes**.  Drift between spawn and ground rendering becomes physically impossible.  The classifier (`zone_id_at`) is the single source of truth and is consumed *only* at bake time.

## Implementation conventions (must be the same on both sides)

These are the alignment landmines.  Get them right and the bake-then-sample round-trip is bit-exact.

### Storage format

- **Image format:** `Image.FORMAT_L8` (1 byte per texel).
- **Encoding:** `byte = id * 51` so the 5 IDs map to 0 / 51 / 102 / 153 / 204.  Even spacing in 8-bit means `int(round(v * 5.0))` in the shader round-trips cleanly under any driver quantisation.  Storing raw `id` (0..4) reads as `4/255 ≈ 0.0157` in shader — borderline values that some GLES drivers handle inconsistently.
- **Filter:** `filter_nearest` *(uniform hint, set in shader)*.  Hard zone boundaries; no bilinear blending of integer IDs.
- **Wrap:** `repeat_disable` so a chunk's edge texels can't bleed into neighbours.

### Texel-centre vs floor sampling

The bake samples at **texel centres** (`(ix + 0.5) * step`).  The CPU lookup uses `floor(local / step)`.  Those two conventions match the GPU's NEAREST sampler exactly: any world XZ inside the chunk resolves to the same texel index on CPU and GPU.

```gdscript
# Bake (CPU)
var step: float = CHUNK_SIZE / float(SPLAT_GRID_N)
var wx: float = origin_x + (float(ix) + 0.5) * step
var id: int = MyClassifier.classify(wx, wz)
img.set_pixel(ix, iz, Color8(id * 51, 0, 0, 255))

# Lookup (CPU)
var ix: int = clampi(int(floor(local_x / step)), 0, SPLAT_GRID_N - 1)
var byte_v: int = int(round(img.get_pixel(ix, iz).r * 255.0))
var id: int = clampi(int(round(float(byte_v) / 51.0)), 0, 4)
```

```glsl
// Lookup (GPU)
vec2 uv = (v_world_pos.xz - chunk_origin) / chunk_size;
int id = int(round(texture(splat_tex, uv).r * 5.0));
```

### Material-per-chunk is required

A `sampler2D` cannot ride MMI `INSTANCE_CUSTOM` (it's a single `vec4`).  So each chunk needs its own `ShaderMaterial.duplicate()` of a template, with the splat texture and `chunk_origin` set per chunk.  Cost is one ShaderMaterial per active chunk (~25 in current chunk-streaming setup) — trivial.

Keep the original material as a *template* holding only the cross-chunk uniforms (e.g. `ground_saturation`).

### Resolution choice

Tradeoff between memory and how finely you can resolve zone boundaries.  Splat test uses 128² for `CHUNK_SIZE = 64` → 2 px/metre, 16 KB per chunk in L8.  ~25 visible chunks ≈ 400 KB total.  If you want crisper boundaries push to 256² (4 px/m, 64 KB/chunk).

## What stays mirrored

After this refactor, only the small constant table (zone IDs → display colours) is duplicated between GDScript and GLSL.  Five hex tuples.  Add a "MUST match" comment on each side pointing at the other.  This is a *much* smaller drift surface than the entire noise pipeline.

## When to apply this

Any time the codebase has:

- A GDScript classifier or noise function, AND
- A GLSL mirror of the same math, AND
- Both must agree at the same world point.

Concrete candidates in this codebase:

- ✅ **`SplatTestZone` + `splat_test_ground.gdshader`** — done (this refactor).
- 🟡 **`BiomeField` + `terrain_splat.gdshader`** — production code uses `BiomeField.bake_chunk_density_grid` for the *spawn* side already (`PackedFloat32Array`-based grid, similar idea), but the *ground* shader still recomputes procedurally.  Has its own drift profile; not currently broken in the same way as the splat test was, but the same pattern would apply if drift symptoms appear.
- 🟡 Any future biome / weather / hazard system that needs a CPU spawn rule and a GPU visualisation.

## Files of interest (reference implementation)

- `ui/screens/splatmap_spawn_test_screen.gd`
  - `_bake_chunk_splat()` — CPU bake.
  - `_sample_baked_id()` — CPU lookup.
  - `_load_chunk()` — wires bake → texture → per-chunk material → spawn.
- `assets/shaders/splat_test_ground.gdshader` — GPU lookup + colour LUT.
- `core/splat_test_zone.gd` — single source of truth (`zone_id_at`).

## Extension: smooth-edge boundaries

The simplest version of this pattern bakes a single discrete *ID* per texel and the GPU samples NEAREST.  That gives stairstepped boundaries because every fragment commits to one of N solid colours.  If you also need smooth (non-stairstepped) boundaries with the same spawn-precision invariant, switch to baking continuous weight *fields* (one scalar per zone) and have the GPU softmax-blend the colours while CPU still argmaxes for spawn.  See [`splatmap-terrain-shader.md`](splatmap-terrain-shader.md) for that build on top of this pattern.
