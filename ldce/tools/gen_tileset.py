"""Generate the LDCE base tileset and its Godot bindings (atlas v2).

Emits three artifacts:
    godot/assets/tileset.png   — the atlas texture
    godot/assets/tileset.tres  — Godot TileSet resource pointing at the atlas
    godot/scripts/tile_ids.gd  — GDScript constants: name -> atlas coord

Usage:
    python tools/gen_tileset.py              # default paths (run from repo root)
    python tools/gen_tileset.py --outdir X   # override Godot project dir

Atlas layout (10 cols x 19 rows; each cell is TILE x TILE px):
    Row  0: grass, water_f0..3 (animation frames), dirt, tree, rubble, _, _
    Row  1-2: road       bitmask 0..15    \\  bit 0=N, 1=E, 2=S, 3=W
    Row  3-4: rail       bitmask 0..15
    Row  5-6: power_line bitmask 0..15
    Row  7-8: shore      bitmask 0..15
    Row  9:   zone_R, zone_C, zone_I, bld_R_L1, bld_C_L1, bld_I_L1, park, _, _, _
    Row 10:   R_L2 TL/TR, C_L2 TL/TR, I_L2 TL/TR, police TL/TR, fire TL/TR
    Row 11:   R_L2 BL/BR, C_L2 BL/BR, I_L2 BL/BR, police BL/BR, fire BL/BR
    Row 12:   coal TL/TR, nuke T row (3 cells), _ _ _ _ _
    Row 13:   coal BL/BR, nuke M row (3 cells), _ _ _ _ _
    Row 14:   _ _, nuke B row (3 cells), _ _ _ _ _
    Row 15:   R_L3 row 0 (3), C_L3 row 0 (3), I_L3 row 0 (3), _
    Row 16:   R_L3 row 1 (3), C_L3 row 1 (3), I_L3 row 1 (3), _
    Row 17:   R_L3 row 2 (3), C_L3 row 2 (3), I_L3 row 2 (3), _
    Row 18:   overlay_0..4 (alpha 0.1, 0.2, 0.3, 0.45, 0.6), _ _ _ _ _

The water tile at (1,0) is declared with animation_frames_count=4 consuming
atlas cells (1,0)..(4,0) — (2,0), (3,0), (4,0) are therefore NOT declared as
independent tiles.
"""
from __future__ import annotations

import argparse
import random
import sys
from pathlib import Path

from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).parent))
import palette as P

TILE = 16
COLS = 10
ROWS = 33

N, E, S, W = 1, 2, 4, 8

# Rows holding a 16-entry NESW bitmask group. Each group takes 2 rows × 8 cols.
# power_line / water_pipe / sewer_pipe tiles render with transparent base so
# they can be drawn on top of any ground tile via dedicated TileMapLayers.
BITMASK_GROUPS = {
    "road":       1,
    "rail":       3,
    "power_line": 5,
    "shore":      7,
    "water_pipe": 19,
    "sewer_pipe": 21,
}

# Fixed single-tile slots.
_FIXED_SLOTS = {
    "grass":    (0, 0),
    "water":    (1, 0),   # Anim base: .tres consumes (2,0)..(4,0) as frames.
    "dirt":     (5, 0),
    "tree":     (6, 0),
    "rubble":   (7, 0),

    "zone_r":   (0, 9),
    "zone_c":   (1, 9),
    "zone_i":   (2, 9),
    "bld_r_l1": (3, 9),
    "bld_c_l1": (4, 9),
    "bld_i_l1": (5, 9),
    "park":     (6, 9),

    "overlay_0":    (0, 18),
    "overlay_1":    (1, 18),
    "overlay_2":    (2, 18),
    "overlay_3":    (3, 18),
    "overlay_4":    (4, 18),
    "no_power_ind": (5, 18),
    "no_water_ind": (6, 18),
    "wind":         (7, 18),
    "hydro":        (8, 18),
    "water_tower":  (9, 18),

    # HUD action / overlay-mode icons (row 31).
    "icon_bulldoze":        (0, 31),
    "icon_overlay_off":     (1, 31),
    "icon_overlay_poll":    (2, 31),
    "icon_overlay_crime":   (3, 31),
    "icon_overlay_lv":      (4, 31),
    "icon_overlay_power":   (5, 31),
    "icon_overlay_water":   (6, 31),
    "icon_overlay_sewer":   (7, 31),

    # Disaster icons (row 32).
    "icon_tornado":         (0, 32),
    "icon_quake":           (1, 32),
    "icon_flood":           (2, 32),
    "icon_overlay_traffic": (3, 32),
}

# Multi-cell building layouts. Each entry: (name, footprint_cols, footprint_rows, [(col, row), ...]).
# The cell list is row-major and its order defines the sub-index baked into building_sub.
_MULTI_CELL_LAYOUTS = {
    # 2×2 buildings — L2 zones + services + coal plant. 2 atlas rows (10 & 11).
    "bld_r_l2": (2, 2, [(0, 10), (1, 10), (0, 11), (1, 11)]),
    "bld_c_l2": (2, 2, [(2, 10), (3, 10), (2, 11), (3, 11)]),
    "bld_i_l2": (2, 2, [(4, 10), (5, 10), (4, 11), (5, 11)]),
    "police":   (2, 2, [(6, 10), (7, 10), (6, 11), (7, 11)]),
    "fire":     (2, 2, [(8, 10), (9, 10), (8, 11), (9, 11)]),
    "coal":     (2, 2, [(0, 12), (1, 12), (0, 13), (1, 13)]),

    # 3×3 nuke plant.
    "nuke":     (3, 3, [(2, 12), (3, 12), (4, 12),
                        (2, 13), (3, 13), (4, 13),
                        (2, 14), (3, 14), (4, 14)]),

    # 3×3 L3 skyscrapers.
    "bld_r_l3": (3, 3, [(0, 15), (1, 15), (2, 15),
                        (0, 16), (1, 16), (2, 16),
                        (0, 17), (1, 17), (2, 17)]),
    "bld_c_l3": (3, 3, [(3, 15), (4, 15), (5, 15),
                        (3, 16), (4, 16), (5, 16),
                        (3, 17), (4, 17), (5, 17)]),
    "bld_i_l3": (3, 3, [(6, 15), (7, 15), (8, 15),
                        (6, 16), (7, 16), (8, 16),
                        (6, 17), (7, 17), (8, 17)]),

    # 2×2 alternative plants + services (stacked next to pipe bitmask rows).
    "microwave":    (2, 2, [(8, 19), (9, 19), (8, 20), (9, 20)]),
    "gas":          (2, 2, [(8, 21), (9, 21), (8, 22), (9, 22)]),
    "water_pump":   (2, 2, [(0, 23), (1, 23), (0, 24), (1, 24)]),
    "sewer_plant":  (2, 2, [(2, 23), (3, 23), (2, 24), (3, 24)]),
    "solar":        (2, 2, [(4, 23), (5, 23), (4, 24), (5, 24)]),
    "oil":          (2, 2, [(6, 23), (7, 23), (6, 24), (7, 24)]),

    # 3×3 endgame: fusion + 4 arcologies.
    "fusion":        (3, 3, [(0, 25), (1, 25), (2, 25),
                             (0, 26), (1, 26), (2, 26),
                             (0, 27), (1, 27), (2, 27)]),
    "arco_plymouth": (3, 3, [(3, 25), (4, 25), (5, 25),
                             (3, 26), (4, 26), (5, 26),
                             (3, 27), (4, 27), (5, 27)]),
    "arco_forest":   (3, 3, [(6, 25), (7, 25), (8, 25),
                             (6, 26), (7, 26), (8, 26),
                             (6, 27), (7, 27), (8, 27)]),
    "arco_darco":    (3, 3, [(0, 28), (1, 28), (2, 28),
                             (0, 29), (1, 29), (2, 29),
                             (0, 30), (1, 30), (2, 30)]),
    "arco_launch":   (3, 3, [(3, 28), (4, 28), (5, 28),
                             (3, 29), (4, 29), (5, 29),
                             (3, 30), (4, 30), (5, 30)]),
}


def _build_slots() -> dict[str, tuple[int, int]]:
    s = dict(_FIXED_SLOTS)
    for group, start_row in BITMASK_GROUPS.items():
        for mask in range(16):
            s[f"{group}_{mask:02d}"] = (mask % 8, start_row + mask // 8)
    for name, (_, _, cells) in _MULTI_CELL_LAYOUTS.items():
        for sub, (c, r) in enumerate(cells):
            s[f"{name}_{sub:02d}"] = (c, r)
    return s


SLOTS = _build_slots()

# Atlas cells that are part of the water animation chain (not standalone tiles).
WATER_ANIM_CELLS = [(2, 0), (3, 0), (4, 0)]


def rgba(rgb, a=255):
    return (rgb[0], rgb[1], rgb[2], a)


def noise_fill(im, base, light, rng, density=0.3):
    px = im.load()
    b, l = rgba(base), rgba(light)
    for y in range(im.height):
        for x in range(im.width):
            px[x, y] = l if rng.random() < density else b


# ---------- terrain ----------

def tile_grass(rng):
    im = Image.new("RGBA", (TILE, TILE), rgba(P.GRASS_DARK))
    noise_fill(im, P.GRASS_DARK, P.GRASS_LIGHT, rng, 0.30)
    return im


def tile_water_frame(rng, frame: int):
    """One frame of water. `frame` in 0..3 shifts the ripple pattern."""
    im = Image.new("RGBA", (TILE, TILE), rgba(P.WATER_DARK))
    px = im.load()
    for y in range(TILE):
        # Horizontal ripple rows drift down with frame index.
        stripe_y = (y + frame) % 4
        if stripe_y == 0:
            for x in range(TILE):
                if rng.random() < 0.6:
                    px[x, y] = rgba(P.WATER_LIGHT)
        elif stripe_y == 2 and rng.random() < 0.5:
            # Occasional foam fleck.
            fx = (rng.randint(0, TILE - 1))
            px[fx, y] = rgba(P.WATER_FOAM)
    # A few sparkles that shift across frames.
    for k in range(2):
        sx = (3 + frame * 4 + k * 7) % TILE
        sy = (5 + frame * 3) % TILE
        px[sx, sy] = rgba(P.WATER_FOAM)
    return im


def tile_dirt(rng):
    im = Image.new("RGBA", (TILE, TILE), rgba(P.DIRT_DARK))
    noise_fill(im, P.DIRT_DARK, P.DIRT_LIGHT, rng, 0.25)
    return im


def tile_tree(rng):
    im = tile_grass(rng)
    d = ImageDraw.Draw(im)
    for _ in range(3):
        cx = rng.randint(3, TILE - 4)
        cy = rng.randint(3, TILE - 4)
        r = rng.randint(2, 3)
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=rgba(P.TREE_DARK))
        d.ellipse([cx - r + 1, cy - r + 1, cx + r - 1, cy + r - 1],
                  fill=rgba(P.TREE_MID))
    return im


def tile_rubble(rng):
    im = Image.new("RGBA", (TILE, TILE), rgba(P.RUBBLE_MID))
    px = im.load()
    for y in range(TILE):
        for x in range(TILE):
            r = rng.random()
            if r < 0.30:
                px[x, y] = rgba(P.RUBBLE_DARK)
            elif r < 0.55:
                px[x, y] = rgba(P.RUBBLE_MID)
            elif r < 0.65:
                px[x, y] = rgba(P.RUBBLE_LIGHT)
    return im


# ---------- roads ----------

def tile_road(mask, rng):
    im = tile_grass(rng)
    d = ImageDraw.Draw(im)
    c0, c1 = 6, 9
    d.rectangle([c0, c0, c1, c1], fill=rgba(P.ROAD_LIGHT))
    if mask & N: d.rectangle([c0, 0,  c1, c0],       fill=rgba(P.ROAD_LIGHT))
    if mask & S: d.rectangle([c0, c1, c1, TILE - 1], fill=rgba(P.ROAD_LIGHT))
    if mask & E: d.rectangle([c1, c0, TILE - 1, c1], fill=rgba(P.ROAD_LIGHT))
    if mask & W: d.rectangle([0,  c0, c0, c1],       fill=rgba(P.ROAD_LIGHT))

    px = im.load()
    # Manhattan-distance dilation from asphalt: 1 ring = kerb, 2 ring = sidewalk.
    INF = 99
    dist = [[INF] * TILE for _ in range(TILE)]
    for y in range(TILE):
        for x in range(TILE):
            if px[x, y][:3] == P.ROAD_LIGHT:
                dist[y][x] = 0
    for step in (1, 2):
        for y in range(TILE):
            for x in range(TILE):
                if dist[y][x] != INF:
                    continue
                for dx, dy in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < TILE and 0 <= ny < TILE and dist[ny][nx] == step - 1:
                        dist[y][x] = step
                        break
    for y in range(TILE):
        for x in range(TILE):
            if dist[y][x] == 1:
                px[x, y] = rgba(P.ROAD_DARK)
            elif dist[y][x] == 2:
                # Gentle sidewalk speckle for a used-concrete feel.
                if rng.random() < 0.15:
                    px[x, y] = rgba(P.SIDEWALK_D)
                else:
                    px[x, y] = rgba(P.SIDEWALK)

    if mask == (N | S):
        for y in range(TILE):
            if y % 4 < 2:
                px[7, y] = rgba(P.ROAD_LINE)
    elif mask == (E | W):
        for x in range(TILE):
            if x % 4 < 2:
                px[x, 7] = rgba(P.ROAD_LINE)
    return im


# ---------- rail ----------

def tile_rail(mask, rng):
    im = tile_grass(rng)
    px = im.load()
    d = ImageDraw.Draw(im)
    c0, c1 = 6, 9

    def ballast(x0, y0, x1, y1):
        for yy in range(y0, y1 + 1):
            for xx in range(x0, x1 + 1):
                if not (0 <= xx < TILE and 0 <= yy < TILE):
                    continue
                px[xx, yy] = rgba(
                    P.RAIL_BALLAST_L if rng.random() < 0.4 else P.RAIL_BALLAST_D
                )

    ballast(c0, c0, c1, c1)
    if mask & N: ballast(c0, 0,  c1, c0)
    if mask & S: ballast(c0, c1, c1, TILE - 1)
    if mask & E: ballast(c1, c0, TILE - 1, c1)
    if mask & W: ballast(0,  c0, c0, c1)

    if mask & N:
        for y in range(0, c0, 2):
            d.line([(c0, y), (c1, y)], fill=rgba(P.RAIL_SLEEPER))
    if mask & S:
        for y in range(c1 + 1, TILE, 2):
            d.line([(c0, y), (c1, y)], fill=rgba(P.RAIL_SLEEPER))
    if mask & E:
        for x in range(c1 + 1, TILE, 2):
            d.line([(x, c0), (x, c1)], fill=rgba(P.RAIL_SLEEPER))
    if mask & W:
        for x in range(0, c0, 2):
            d.line([(x, c0), (x, c1)], fill=rgba(P.RAIL_SLEEPER))

    steel = rgba(P.RAIL_STEEL)
    if mask & N:
        for y in range(0, c0):
            px[7, y] = steel; px[8, y] = steel
    if mask & S:
        for y in range(c1 + 1, TILE):
            px[7, y] = steel; px[8, y] = steel
    if mask & E:
        for x in range(c1 + 1, TILE):
            px[x, 7] = steel; px[x, 8] = steel
    if mask & W:
        for x in range(0, c0):
            px[x, 7] = steel; px[x, 8] = steel
    return im


# ---------- power lines ----------

def tile_power_line(mask, rng):
    """Power line tile — transparent base so it composes onto any ground tile."""
    im = Image.new("RGBA", (TILE, TILE), (0, 0, 0, 0))
    px = im.load()
    d = ImageDraw.Draw(im)
    d.rectangle([6, 6, 9, 9], fill=rgba(P.PYLON))
    px[6, 6] = rgba(P.PYLON_HILITE)
    px[9, 6] = rgba(P.PYLON_HILITE)

    wire = rgba(P.WIRE)
    if mask & N:
        for y in range(0, 6): px[7, y] = wire
    if mask & S:
        for y in range(10, TILE): px[8, y] = wire
    if mask & E:
        for x in range(10, TILE): px[x, 7] = wire
    if mask & W:
        for x in range(0, 6): px[x, 8] = wire
    return im


def tile_water_pipe(mask, rng):
    """Shallow cyan pipe icon; transparent base."""
    im = Image.new("RGBA", (TILE, TILE), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    c0, c1 = 6, 9
    # Central junction node.
    d.rectangle([c0 + 1, c0 + 1, c1 - 1, c1 - 1], fill=rgba(P.PIPE_WATER_LIGHT))
    d.rectangle([c0 + 1, c0 + 1, c1 - 1, c0 + 1], fill=rgba(P.PIPE_WATER_DARK))
    # Arms — 2 px wide each, darker outline.
    if mask & N:
        d.rectangle([7, 0, 8, c0 + 1], fill=rgba(P.PIPE_WATER_LIGHT))
        d.line([(6, 0), (6, c0)], fill=rgba(P.PIPE_WATER_DARK))
        d.line([(9, 0), (9, c0)], fill=rgba(P.PIPE_WATER_DARK))
    if mask & S:
        d.rectangle([7, c1 - 1, 8, TILE - 1], fill=rgba(P.PIPE_WATER_LIGHT))
        d.line([(6, c1), (6, TILE - 1)], fill=rgba(P.PIPE_WATER_DARK))
        d.line([(9, c1), (9, TILE - 1)], fill=rgba(P.PIPE_WATER_DARK))
    if mask & E:
        d.rectangle([c1 - 1, 7, TILE - 1, 8], fill=rgba(P.PIPE_WATER_LIGHT))
        d.line([(c1, 6), (TILE - 1, 6)], fill=rgba(P.PIPE_WATER_DARK))
        d.line([(c1, 9), (TILE - 1, 9)], fill=rgba(P.PIPE_WATER_DARK))
    if mask & W:
        d.rectangle([0, 7, c0 + 1, 8], fill=rgba(P.PIPE_WATER_LIGHT))
        d.line([(0, 6), (c0, 6)], fill=rgba(P.PIPE_WATER_DARK))
        d.line([(0, 9), (c0, 9)], fill=rgba(P.PIPE_WATER_DARK))
    return im


def tile_sewer_pipe(mask, rng):
    """Brown sewer pipe; transparent base. Same geometry as water_pipe."""
    im = Image.new("RGBA", (TILE, TILE), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    c0, c1 = 6, 9
    d.rectangle([c0 + 1, c0 + 1, c1 - 1, c1 - 1], fill=rgba(P.PIPE_SEWER_LIGHT))
    d.rectangle([c0 + 1, c0 + 1, c1 - 1, c0 + 1], fill=rgba(P.PIPE_SEWER_DARK))
    if mask & N:
        d.rectangle([7, 0, 8, c0 + 1], fill=rgba(P.PIPE_SEWER_LIGHT))
        d.line([(6, 0), (6, c0)], fill=rgba(P.PIPE_SEWER_DARK))
        d.line([(9, 0), (9, c0)], fill=rgba(P.PIPE_SEWER_DARK))
    if mask & S:
        d.rectangle([7, c1 - 1, 8, TILE - 1], fill=rgba(P.PIPE_SEWER_LIGHT))
        d.line([(6, c1), (6, TILE - 1)], fill=rgba(P.PIPE_SEWER_DARK))
        d.line([(9, c1), (9, TILE - 1)], fill=rgba(P.PIPE_SEWER_DARK))
    if mask & E:
        d.rectangle([c1 - 1, 7, TILE - 1, 8], fill=rgba(P.PIPE_SEWER_LIGHT))
        d.line([(c1, 6), (TILE - 1, 6)], fill=rgba(P.PIPE_SEWER_DARK))
        d.line([(c1, 9), (TILE - 1, 9)], fill=rgba(P.PIPE_SEWER_DARK))
    if mask & W:
        d.rectangle([0, 7, c0 + 1, 8], fill=rgba(P.PIPE_SEWER_LIGHT))
        d.line([(0, 6), (c0, 6)], fill=rgba(P.PIPE_SEWER_DARK))
        d.line([(0, 9), (c0, 9)], fill=rgba(P.PIPE_SEWER_DARK))
    return im


# ---------- shore ----------

def tile_shore(mask, rng):
    im = tile_grass(rng)
    px = im.load()

    def water_pixel():
        return rgba(P.WATER_DARK) if rng.random() < 0.5 else rgba(P.WATER_LIGHT)

    depth = 4
    if mask & N:
        for y in range(depth):
            intensity = 1.0 - y / float(depth)
            for x in range(TILE):
                if rng.random() < 0.35 + 0.6 * intensity:
                    px[x, y] = water_pixel()
                elif y == depth - 1 and rng.random() < intensity * 0.5:
                    px[x, y] = rgba(P.SHORE_SAND)
    if mask & S:
        for y in range(TILE - depth, TILE):
            dist = TILE - y
            intensity = 1.0 - (depth - dist) / float(depth)
            for x in range(TILE):
                if rng.random() < 0.35 + 0.6 * intensity:
                    px[x, y] = water_pixel()
                elif dist == depth and rng.random() < intensity * 0.5:
                    px[x, y] = rgba(P.SHORE_SAND)
    if mask & E:
        for x in range(TILE - depth, TILE):
            dist = TILE - x
            intensity = 1.0 - (depth - dist) / float(depth)
            for y in range(TILE):
                if rng.random() < 0.35 + 0.6 * intensity:
                    px[x, y] = water_pixel()
                elif dist == depth and rng.random() < intensity * 0.5:
                    px[x, y] = rgba(P.SHORE_SAND)
    if mask & W:
        for x in range(depth):
            intensity = 1.0 - x / float(depth)
            for y in range(TILE):
                if rng.random() < 0.35 + 0.6 * intensity:
                    px[x, y] = water_pixel()
                elif x == depth - 1 and rng.random() < intensity * 0.5:
                    px[x, y] = rgba(P.SHORE_SAND)
    return im


# ---------- zones / low-density buildings ----------

def tile_zone(color, rng):
    im = Image.new("RGBA", (TILE, TILE), rgba(color))
    d = ImageDraw.Draw(im)
    dark = tuple(max(0, c - 50) for c in color)
    d.rectangle([0, 0, TILE - 1, TILE - 1], outline=rgba(dark))
    for cx, cy in [(2, 2), (TILE - 3, 2), (2, TILE - 3), (TILE - 3, TILE - 3)]:
        im.putpixel((cx, cy), rgba(dark))
    return im


def tile_building_l1(zone_color, bld_color, roof_color, rng):
    im = tile_zone(zone_color, rng)
    d = ImageDraw.Draw(im)
    x0 = rng.randint(3, 4)
    y0 = rng.randint(3, 5)
    x1 = TILE - rng.randint(3, 4) - 1
    y1 = TILE - rng.randint(2, 3) - 1
    d.rectangle([x0 + 1, y0 + 1, x1 + 1, y1 + 1], fill=(0, 0, 0, 110))
    d.rectangle([x0, y0, x1, y1], fill=rgba(bld_color))
    d.rectangle([x0, y0, x1, y0 + 1], fill=rgba(roof_color))
    for wy in range(y0 + 3, y1 - 1, 3):
        for wx in range(x0 + 1, x1, 2):
            if rng.random() < 0.55:
                im.putpixel((wx, wy), rgba(P.WINDOW_LIT))
    return im


# ---------- multi-cell packers ----------

def _pack_and_slice(big: Image.Image, footprint_cols: int, footprint_rows: int):
    """Slice a footprint-sized image into 16×16 tiles in row-major order."""
    tiles = []
    for r in range(footprint_rows):
        for c in range(footprint_cols):
            tiles.append(big.crop((c * TILE, r * TILE, (c + 1) * TILE, (r + 1) * TILE)))
    return tiles


def _draw_midrise(big, zone, wall, roof, rng, floors=3):
    """Shared drawer for 2×2 mid-rise buildings."""
    size_x = big.width
    size_y = big.height
    d = ImageDraw.Draw(big)
    # Zoned lot background.
    for y in range(size_y):
        for x in range(size_x):
            big.putpixel((x, y), rgba(zone))
    # Lot border.
    dark = tuple(max(0, c - 50) for c in zone)
    d.rectangle([0, 0, size_x - 1, size_y - 1], outline=rgba(dark))

    pad_l = 3; pad_r = 3; pad_t = 4; pad_b = 2
    x0, y0 = pad_l, pad_t
    x1, y1 = size_x - pad_r - 1, size_y - pad_b - 1

    # Shadow.
    d.rectangle([x0 + 1, y0 + 1, x1 + 1, y1 + 1], fill=(0, 0, 0, 120))
    # Body.
    d.rectangle([x0, y0, x1, y1], fill=rgba(wall))
    # Roof strip.
    d.rectangle([x0, y0, x1, y0 + 1], fill=rgba(roof))
    # Rows of windows (skip top roof row).
    for wy in range(y0 + 3, y1 - 1, 3):
        for wx in range(x0 + 1, x1, 2):
            if rng.random() < 0.7:
                big.putpixel((wx, wy), rgba(P.WINDOW_LIT))


def _draw_skyscraper(big, zone, wall, roof, rng):
    size_x = big.width
    size_y = big.height
    d = ImageDraw.Draw(big)
    for y in range(size_y):
        for x in range(size_x):
            big.putpixel((x, y), rgba(zone))
    dark = tuple(max(0, c - 60) for c in zone)
    d.rectangle([0, 0, size_x - 1, size_y - 1], outline=rgba(dark))

    pad = 3
    x0, y0 = pad, pad + 2
    x1, y1 = size_x - pad - 1, size_y - 2

    # Shadow.
    d.rectangle([x0 + 2, y0 + 2, x1 + 2, y1 + 2], fill=(0, 0, 0, 110))
    # Stepped tower: main body + setback on top third.
    d.rectangle([x0, y0, x1, y1], fill=rgba(wall))
    setback_top = y0 - 2
    d.rectangle([x0 + 3, setback_top, x1 - 3, y0], fill=rgba(wall))

    # Roof strip + antenna.
    d.rectangle([x0 + 3, setback_top, x1 - 3, setback_top + 1], fill=rgba(roof))
    antenna_x = (x0 + x1) // 2
    for ay in range(setback_top - 3, setback_top):
        if 0 <= ay < size_y:
            big.putpixel((antenna_x, ay), rgba(P.GLASS_SHEEN))

    # Dense window grid.
    for wy in range(y0 + 2, y1 - 1, 2):
        for wx in range(x0 + 1, x1, 2):
            if rng.random() < 0.8:
                big.putpixel((wx, wy), rgba(P.WINDOW_LIT))
            else:
                big.putpixel((wx, wy), rgba(P.GLASS_SHEEN))


def tile_bld_l2(zone, wall, roof, rng):
    big = Image.new("RGBA", (TILE * 2, TILE * 2), (0, 0, 0, 0))
    _draw_midrise(big, zone, wall, roof, rng)
    return _pack_and_slice(big, 2, 2)


def tile_bld_l3(zone, wall, roof, rng):
    big = Image.new("RGBA", (TILE * 3, TILE * 3), (0, 0, 0, 0))
    _draw_skyscraper(big, zone, wall, roof, rng)
    return _pack_and_slice(big, 3, 3)


def tile_park(rng):
    im = Image.new("RGBA", (TILE, TILE), rgba(P.PARK_GRASS))
    noise_fill(im, P.PARK_GRASS, P.GRASS_LIGHT, rng, 0.35)
    d = ImageDraw.Draw(im)
    # Path.
    d.line([(0, 8), (TILE - 1, 8)], fill=rgba(P.PARK_PATH))
    d.line([(0, 9), (TILE - 1, 9)], fill=rgba(P.PARK_PATH))
    # Flowers.
    for _ in range(4):
        fx = rng.randint(1, TILE - 2)
        fy = rng.choice([rng.randint(1, 6), rng.randint(11, TILE - 2)])
        col = P.PARK_FLOWER_A if rng.random() < 0.5 else P.PARK_FLOWER_B
        im.putpixel((fx, fy), rgba(col))
    # A tree blob.
    d.ellipse([2, 2, 6, 6], fill=rgba(P.TREE_DARK))
    d.ellipse([3, 3, 5, 5], fill=rgba(P.TREE_MID))
    return im


def tile_police(rng):
    big = Image.new("RGBA", (TILE * 2, TILE * 2), (0, 0, 0, 0))
    # Dirt lot.
    for y in range(TILE * 2):
        for x in range(TILE * 2):
            big.putpixel((x, y),
                         rgba(P.DIRT_LIGHT if rng.random() < 0.25 else P.DIRT_DARK))
    d = ImageDraw.Draw(big)
    d.rectangle([3, 6, 28, 28], fill=rgba(P.POLICE_BODY))
    d.rectangle([3, 6, 28, 8], fill=rgba(P.POLICE_TRIM))
    d.rectangle([13, 14, 18, 28], fill=rgba(P.POLICE_TRIM))  # door column
    # Roof siren.
    d.rectangle([14, 2, 17, 5], fill=rgba(P.POLICE_SIREN))
    d.rectangle([14, 4, 17, 6], fill=rgba(P.POLICE_LIGHT))
    # Windows.
    for wy in [10, 20]:
        for wx in [6, 9, 22, 25]:
            big.putpixel((wx, wy), rgba(P.POLICE_LIGHT))
    # Shield accent.
    big.putpixel((15, 10), rgba(P.POLICE_LIGHT))
    big.putpixel((16, 10), rgba(P.POLICE_LIGHT))
    return _pack_and_slice(big, 2, 2)


def tile_fire(rng):
    big = Image.new("RGBA", (TILE * 2, TILE * 2), (0, 0, 0, 0))
    for y in range(TILE * 2):
        for x in range(TILE * 2):
            big.putpixel((x, y),
                         rgba(P.DIRT_LIGHT if rng.random() < 0.25 else P.DIRT_DARK))
    d = ImageDraw.Draw(big)
    d.rectangle([2, 5, 29, 28], fill=rgba(P.FIRE_BODY))
    d.rectangle([2, 5, 29, 7], fill=rgba(P.FIRE_TRIM))
    # Garage doors.
    for gx in [5, 18]:
        d.rectangle([gx, 12, gx + 8, 28], fill=rgba(P.FIRE_TRIM))
        for yy in range(14, 28, 3):
            d.line([(gx + 1, yy), (gx + 7, yy)], fill=rgba(P.FIRE_BODY))
    # Tower with bell.
    d.rectangle([13, 0, 18, 6], fill=rgba(P.FIRE_TRIM))
    d.rectangle([14, 1, 17, 5], fill=rgba(P.FIRE_WINDOW))
    return _pack_and_slice(big, 2, 2)


def tile_coal(rng):
    """Existing 2×2 coal plant visual."""
    size = TILE * 2
    big = Image.new("RGBA", (size, size), rgba(P.DIRT_DARK))
    px = big.load()
    for y in range(size):
        for x in range(size):
            if rng.random() < 0.25:
                px[x, y] = rgba(P.DIRT_LIGHT)
    d = ImageDraw.Draw(big)
    d.ellipse([3, 2, 15, 22], fill=rgba(P.PLANT_BODY))
    d.ellipse([4, 2, 14, 6],  fill=rgba(P.PLANT_TRIM))
    d.rectangle([4, 20, 14, 22], fill=rgba(P.PLANT_TRIM))
    d.rectangle([15, 16, 29, 28], fill=rgba(P.PLANT_BODY))
    d.rectangle([15, 16, 29, 17], fill=rgba(P.PLANT_TRIM))
    d.rectangle([16, 29, 30, 30], fill=(0, 0, 0, 110))
    d.rectangle([18, 1, 20, 15], fill=rgba(P.SMOKESTACK))
    d.rectangle([18, 1, 20, 2],  fill=rgba(P.STACK_CAP))
    d.rectangle([24, 4, 26, 15], fill=rgba(P.SMOKESTACK))
    d.rectangle([24, 4, 26, 5],  fill=rgba(P.STACK_CAP))
    for y in range(0, 5):
        if rng.random() < 0.7 and 0 <= y < size:
            px[19, y] = rgba(P.SMOKE)
        if rng.random() < 0.7 and y >= 1:
            px[25, y] = rgba(P.SMOKE)
    for wy in range(20, 27, 3):
        for wx in range(16, 29, 2):
            if rng.random() < 0.55:
                px[wx, wy] = rgba(P.WINDOW_LIT)
    return _pack_and_slice(big, 2, 2)


def tile_nuke(rng):
    """3×3 nuclear plant: two containment domes + cooling tower + main building."""
    size = TILE * 3
    big = Image.new("RGBA", (size, size), rgba(P.DIRT_DARK))
    px = big.load()
    for y in range(size):
        for x in range(size):
            if rng.random() < 0.2:
                px[x, y] = rgba(P.DIRT_LIGHT)
    d = ImageDraw.Draw(big)
    # Security fence perimeter.
    d.rectangle([0, 0, size - 1, size - 1], outline=rgba(P.PLANT_TRIM))
    # Two containment domes (top row).
    for cx in [10, 26]:
        d.ellipse([cx - 6, 4, cx + 6, 18], fill=rgba(P.NUKE_BODY))
        d.ellipse([cx - 5, 4, cx + 5, 10], fill=rgba(P.NUKE_DOME))
        d.rectangle([cx - 6, 14, cx + 6, 18], fill=rgba(P.NUKE_TRIM))
    # Cooling tower (center-left-bottom), tapered.
    d.ellipse([2, 22, 18, 44], fill=rgba(P.NUKE_BODY))
    d.ellipse([4, 22, 16, 28], fill=rgba(P.NUKE_COOLANT))
    # Main hall (right-bottom).
    d.rectangle([22, 28, 46, 45], fill=rgba(P.NUKE_BODY))
    d.rectangle([22, 28, 46, 30], fill=rgba(P.NUKE_TRIM))
    # Windows.
    for wy in range(32, 44, 3):
        for wx in range(23, 46, 2):
            if rng.random() < 0.55:
                px[wx, wy] = rgba(P.WINDOW_LIT)
    # Hazard stripe.
    for x in range(0, size, 4):
        if 0 <= x < size - 1:
            px[x, size - 2] = rgba(P.NUKE_HAZARD)
            px[x + 1, size - 2] = rgba(P.NUKE_HAZARD)
    # Steam from cooling tower.
    for y in range(18, 26):
        if rng.random() < 0.7 and 0 <= y < size:
            px[10, y] = rgba(P.SMOKE)
    return _pack_and_slice(big, 3, 3)


# ---------- overlay ramp ----------

def tile_overlay(alpha: int):
    """Semi-transparent white square. Controller modulates color."""
    im = Image.new("RGBA", (TILE, TILE), (0, 0, 0, 0))
    for y in range(TILE):
        for x in range(TILE):
            im.putpixel((x, y), rgba(P.OVERLAY_WHITE, alpha))
    return im


# ---------- indicators (transparent-background icons) ----------

def tile_no_power_ind(rng):
    im = Image.new("RGBA", (TILE, TILE), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    # Circular badge.
    d.ellipse([2, 2, 13, 13], fill=rgba(P.IND_NO_POWER_BG, 220))
    # Lightning bolt: pixel path.
    bolt_pixels = [
        (8, 3), (7, 4), (8, 5), (7, 6), (8, 7),
        (7, 8), (8, 9), (7, 10), (6, 11), (8, 8),
    ]
    for (x, y) in bolt_pixels:
        im.putpixel((x, y), rgba(P.IND_NO_POWER_BOLT))
    return im


def tile_no_water_ind(rng):
    im = Image.new("RGBA", (TILE, TILE), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.ellipse([2, 2, 13, 13], fill=rgba(P.IND_NO_WATER_BG, 220))
    # Droplet shape.
    for y, xs in [(4, [7]), (5, [7]), (6, [6, 7, 8]), (7, [5, 8]),
                  (8, [5, 8]), (9, [6, 7])]:
        for x in xs:
            im.putpixel((x, y), rgba(P.IND_NO_WATER_DROP))
    # Slash (denial).
    for i in range(10):
        x = 3 + i
        y = 3 + i
        if 0 <= x < TILE and 0 <= y < TILE:
            im.putpixel((x, y), rgba((240, 80, 80)))
    return im


# ---------- 1×1 buildings ----------

def tile_wind(rng):
    im = Image.new("RGBA", (TILE, TILE), rgba(P.GRASS_DARK))
    noise_fill(im, P.GRASS_DARK, P.GRASS_LIGHT, rng, 0.30)
    d = ImageDraw.Draw(im)
    # Tower.
    d.rectangle([7, 4, 8, 13], fill=rgba(P.WIND_TOWER))
    # Hub.
    im.putpixel((7, 3), rgba(P.WIND_TOWER))
    im.putpixel((8, 3), rgba(P.WIND_TOWER))
    # Three blades radiating.
    for dx, dy in [(-1, -1), (-2, -1), (-3, -2)]:
        im.putpixel((7 + dx, 3 + dy), rgba(P.WIND_BLADE))
    for dx, dy in [(2, -1), (3, -2), (4, -2)]:
        if 0 <= 7 + dx < TILE and 0 <= 3 + dy < TILE:
            im.putpixel((7 + dx, 3 + dy), rgba(P.WIND_BLADE))
    for dx, dy in [(0, 2), (0, 3), (1, 4)]:
        if 0 <= 7 + dx < TILE and 0 <= 3 + dy < TILE:
            im.putpixel((7 + dx, 3 + dy), rgba(P.WIND_BLADE))
    # Base shadow.
    d.rectangle([5, 13, 10, 14], fill=(0, 0, 0, 120))
    return im


def tile_hydro(rng):
    im = Image.new("RGBA", (TILE, TILE), rgba(P.WATER_DARK))
    # Dam wall spanning horizontally.
    d = ImageDraw.Draw(im)
    d.rectangle([0, 5, TILE - 1, 10], fill=rgba(P.HYDRO_CONCRETE))
    d.rectangle([0, 5, TILE - 1, 6], fill=rgba(P.HYDRO_SHADOW))
    # Spillway streams.
    for x in [3, 7, 11]:
        for y in range(10, TILE):
            im.putpixel((x, y), rgba(P.HYDRO_SPILL))
            if x + 1 < TILE:
                im.putpixel((x + 1, y), rgba(P.HYDRO_SPILL))
    # Ripple on upstream side.
    for x in range(0, TILE, 3):
        im.putpixel((x, 2), rgba(P.WATER_LIGHT))
        if x + 1 < TILE:
            im.putpixel((x + 1, 4), rgba(P.WATER_LIGHT))
    return im


def tile_water_tower(rng):
    im = Image.new("RGBA", (TILE, TILE), rgba(P.GRASS_DARK))
    noise_fill(im, P.GRASS_DARK, P.GRASS_LIGHT, rng, 0.30)
    d = ImageDraw.Draw(im)
    # Tank (circular).
    d.ellipse([3, 2, 12, 9], fill=rgba(P.TANK_BODY))
    d.ellipse([3, 2, 12, 5], fill=rgba(P.TANK_TRIM))
    # Legs.
    d.line([(4, 9), (4, 13)], fill=rgba(P.TANK_LEG))
    d.line([(7, 9), (7, 13)], fill=rgba(P.TANK_LEG))
    d.line([(10, 9), (10, 13)], fill=rgba(P.TANK_LEG))
    d.line([(4, 13), (10, 13)], fill=rgba(P.TANK_LEG))
    # Shadow.
    d.rectangle([3, 14, 12, 14], fill=(0, 0, 0, 120))
    return im


# ---------- 2×2 buildings (plants + services) ----------

def _dirt_lot(big, rng):
    for y in range(big.height):
        for x in range(big.width):
            big.putpixel((x, y),
                         rgba(P.DIRT_LIGHT if rng.random() < 0.25 else P.DIRT_DARK))


def tile_water_pump(rng):
    big = Image.new("RGBA", (TILE * 2, TILE * 2), (0, 0, 0, 0))
    _dirt_lot(big, rng)
    d = ImageDraw.Draw(big)
    # Main building.
    d.rectangle([2, 8, 29, 28], fill=rgba(P.PUMP_BODY))
    d.rectangle([2, 8, 29, 10], fill=rgba(P.PUMP_TRIM))
    # Tank on roof.
    d.ellipse([6, 2, 18, 11], fill=rgba(P.PUMP_BODY))
    d.ellipse([6, 2, 18, 6],  fill=rgba(P.PUMP_TRIM))
    # Pipe outlet.
    d.rectangle([22, 5, 28, 7], fill=rgba(P.PUMP_PIPE))
    d.rectangle([28, 5, 30, 18], fill=rgba(P.PUMP_PIPE))
    # Windows.
    for wx in [5, 9, 23, 27]:
        big.putpixel((wx, 15), rgba(P.WINDOW_LIT))
        big.putpixel((wx, 22), rgba(P.WINDOW_LIT))
    # Shadow.
    d.rectangle([2, 29, 29, 30], fill=(0, 0, 0, 120))
    return _pack_and_slice(big, 2, 2)


def tile_sewer_plant(rng):
    big = Image.new("RGBA", (TILE * 2, TILE * 2), (0, 0, 0, 0))
    _dirt_lot(big, rng)
    d = ImageDraw.Draw(big)
    # Two circular treatment tanks.
    for cx in [9, 22]:
        d.ellipse([cx - 6, 6, cx + 6, 18], fill=rgba(P.SEWER_TANK))
        d.ellipse([cx - 5, 7, cx + 5, 11], fill=rgba(P.SEWER_TRIM))
    # Main building below.
    d.rectangle([3, 20, 28, 28], fill=rgba(P.SEWER_BODY))
    d.rectangle([3, 20, 28, 21], fill=rgba(P.SEWER_TRIM))
    # Vents.
    d.rectangle([10, 17, 12, 20], fill=rgba(P.SEWER_TRIM))
    d.rectangle([20, 17, 22, 20], fill=rgba(P.SEWER_TRIM))
    for wx in range(5, 28, 3):
        big.putpixel((wx, 24), rgba(P.WINDOW_LIT))
    d.rectangle([3, 29, 28, 30], fill=(0, 0, 0, 120))
    return _pack_and_slice(big, 2, 2)


def tile_solar(rng):
    big = Image.new("RGBA", (TILE * 2, TILE * 2), (0, 0, 0, 0))
    _dirt_lot(big, rng)
    d = ImageDraw.Draw(big)
    # Array of panels in a 4×3 grid.
    for row_y in [4, 13, 22]:
        for col_x in [2, 10, 18, 26]:
            d.rectangle([col_x, row_y, col_x + 4, row_y + 5], fill=rgba(P.SOLAR_FRAME))
            d.rectangle([col_x + 1, row_y + 1, col_x + 3, row_y + 4], fill=rgba(P.SOLAR_PANEL_DARK))
            big.putpixel((col_x + 2, row_y + 2), rgba(P.SOLAR_PANEL_LITE))
    return _pack_and_slice(big, 2, 2)


def tile_gas(rng):
    big = Image.new("RGBA", (TILE * 2, TILE * 2), (0, 0, 0, 0))
    _dirt_lot(big, rng)
    d = ImageDraw.Draw(big)
    # Main hall.
    d.rectangle([2, 14, 29, 28], fill=rgba(P.GAS_BODY))
    d.rectangle([2, 14, 29, 15], fill=rgba(P.GAS_TRIM))
    # Twin stacks with flame caps.
    for sx in [8, 22]:
        d.rectangle([sx, 2, sx + 3, 14], fill=rgba(P.GAS_BODY))
        d.rectangle([sx, 2, sx + 3, 3],  fill=rgba(P.GAS_TRIM))
        # Flame flicker.
        for fy in range(0, 3):
            big.putpixel((sx + 1, fy), rgba(P.GAS_FLAME))
            if rng.random() < 0.5:
                big.putpixel((sx + 2, fy), rgba(P.GAS_FLAME))
    # Windows.
    for wy in [19, 24]:
        for wx in range(4, 28, 3):
            if rng.random() < 0.6:
                big.putpixel((wx, wy), rgba(P.WINDOW_LIT))
    d.rectangle([2, 29, 29, 30], fill=(0, 0, 0, 120))
    return _pack_and_slice(big, 2, 2)


def tile_oil(rng):
    big = Image.new("RGBA", (TILE * 2, TILE * 2), (0, 0, 0, 0))
    _dirt_lot(big, rng)
    d = ImageDraw.Draw(big)
    # Storage tanks.
    d.ellipse([2, 4, 12, 14], fill=rgba(P.OIL_TANK))
    d.ellipse([2, 4, 12, 7],  fill=rgba(P.OIL_TRIM))
    d.ellipse([16, 4, 26, 14], fill=rgba(P.OIL_TANK))
    d.ellipse([16, 4, 26, 7],  fill=rgba(P.OIL_TRIM))
    # Refinery bank on bottom.
    d.rectangle([2, 16, 29, 28], fill=rgba(P.OIL_BODY))
    d.rectangle([2, 16, 29, 17], fill=rgba(P.OIL_TRIM))
    # Flare stack.
    d.rectangle([13, 1, 15, 17], fill=rgba(P.OIL_TRIM))
    for fy in range(0, 3):
        big.putpixel((14, fy), rgba(P.OIL_FLARE))
        if rng.random() < 0.6:
            big.putpixel((13, fy), rgba(P.OIL_FLARE))
    d.rectangle([2, 29, 29, 30], fill=(0, 0, 0, 120))
    return _pack_and_slice(big, 2, 2)


def tile_microwave(rng):
    big = Image.new("RGBA", (TILE * 2, TILE * 2), (0, 0, 0, 0))
    _dirt_lot(big, rng)
    d = ImageDraw.Draw(big)
    # Large dish.
    d.ellipse([3, 3, 28, 22], fill=rgba(P.MICRO_DISH))
    d.ellipse([5, 5, 26, 20], fill=rgba(P.MICRO_SHADOW))
    d.ellipse([7, 7, 24, 18], fill=rgba(P.MICRO_DISH))
    # Receiver at center.
    d.rectangle([14, 11, 17, 15], fill=rgba(P.MICRO_SHADOW))
    # Pedestal.
    d.rectangle([14, 22, 17, 28], fill=rgba(P.MICRO_SHADOW))
    d.rectangle([10, 28, 21, 30], fill=rgba(P.MICRO_SHADOW))
    # Beam sparkle.
    for (x, y) in [(15, 0), (16, 2), (15, 4)]:
        big.putpixel((x, y), rgba(P.MICRO_BEAM))
    return _pack_and_slice(big, 2, 2)


# ---------- 3×3 buildings (fusion + arcologies) ----------

def tile_fusion(rng):
    size = TILE * 3
    big = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    _dirt_lot(big, rng)
    d = ImageDraw.Draw(big)
    # Outer ring (tokamak donut).
    d.ellipse([4, 4, size - 5, size - 5], fill=rgba(P.FUSION_RING))
    d.ellipse([10, 10, size - 11, size - 11], fill=(0, 0, 0, 0))
    # Body / inner ring.
    d.ellipse([7, 7, size - 8, size - 8], fill=rgba(P.FUSION_BODY))
    d.ellipse([12, 12, size - 13, size - 13], fill=rgba(P.FUSION_RING))
    # Plasma core.
    d.ellipse([16, 16, size - 17, size - 17], fill=rgba(P.FUSION_PLASMA_A))
    for (x, y) in [(23, 22), (24, 25), (22, 26)]:
        big.putpixel((x, y), rgba(P.FUSION_PLASMA_B))
    # Corner support pylons.
    for (cx, cy) in [(3, 3), (size - 4, 3), (3, size - 4), (size - 4, size - 4)]:
        d.rectangle([cx - 1, cy - 1, cx + 1, cy + 1], fill=rgba(P.PLANT_TRIM))
    return _pack_and_slice(big, 3, 3)


def tile_arco_plymouth(rng):
    """Traditional pyramid-shaped arcology."""
    size = TILE * 3
    big = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    _dirt_lot(big, rng)
    d = ImageDraw.Draw(big)
    # Stepped pyramid body.
    for step in range(4):
        inset = step * 5
        y_top = 4 + step * 10
        y_bot = size - 4 - step * 2
        if y_top >= y_bot: break
        d.rectangle([inset + 4, y_top, size - inset - 5, y_bot],
                    fill=rgba(P.ARCO_PLYMOUTH_BASE))
        d.rectangle([inset + 4, y_top, size - inset - 5, y_top + 1],
                    fill=rgba(P.ARCO_PLYMOUTH_TRIM))
    # Tip.
    d.rectangle([size // 2 - 1, 2, size // 2 + 1, 5], fill=rgba(P.ARCO_PLYMOUTH_TIP))
    # Window grid.
    for wy in range(10, size - 6, 3):
        for wx in range(6, size - 6, 2):
            if rng.random() < 0.7:
                big.putpixel((wx, wy), rgba(P.WINDOW_LIT))
    return _pack_and_slice(big, 3, 3)


def tile_arco_forest(rng):
    """Forest arco — vegetation-covered dome."""
    size = TILE * 3
    big = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    _dirt_lot(big, rng)
    d = ImageDraw.Draw(big)
    # Dome.
    d.ellipse([4, 6, size - 5, size - 2], fill=rgba(P.ARCO_FOREST_LEAF))
    # Trunk support.
    d.rectangle([size // 2 - 2, size - 8, size // 2 + 2, size - 2],
                fill=rgba(P.ARCO_FOREST_TRUNK))
    # Leafy clumps scattered on dome.
    for _ in range(14):
        cx = rng.randint(8, size - 10)
        cy = rng.randint(10, size - 8)
        d.ellipse([cx - 2, cy - 2, cx + 2, cy + 2], fill=rgba(P.TREE_DARK))
        big.putpixel((cx, cy), rgba(P.ARCO_FOREST_GLINT))
    # Roof antenna-tree.
    d.rectangle([size // 2 - 1, 2, size // 2 + 1, 7], fill=rgba(P.ARCO_FOREST_TRUNK))
    d.ellipse([size // 2 - 4, 0, size // 2 + 4, 6], fill=rgba(P.TREE_DARK))
    return _pack_and_slice(big, 3, 3)


def tile_arco_darco(rng):
    """Darco — dark dystopian spire."""
    size = TILE * 3
    big = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    _dirt_lot(big, rng)
    d = ImageDraw.Draw(big)
    # Fortress base.
    d.rectangle([3, 8, size - 4, size - 3], fill=rgba(P.ARCO_DARCO_BASE))
    d.rectangle([3, 8, size - 4, 10], fill=rgba(P.ARCO_DARCO_TRIM))
    # Towers on corners.
    for tx in [3, size - 6]:
        d.rectangle([tx, 2, tx + 3, 10], fill=rgba(P.ARCO_DARCO_BASE))
        d.rectangle([tx, 2, tx + 3, 3], fill=rgba(P.ARCO_DARCO_TRIM))
    # Central tall tower.
    d.rectangle([size // 2 - 2, 0, size // 2 + 2, 14], fill=rgba(P.ARCO_DARCO_BASE))
    d.rectangle([size // 2 - 2, 0, size // 2 + 2, 1], fill=rgba(P.ARCO_DARCO_TRIM))
    # Neon windows.
    for wy in range(6, size - 5, 3):
        for wx in range(5, size - 5, 2):
            if rng.random() < 0.55:
                big.putpixel((wx, wy), rgba(P.ARCO_DARCO_NEON))
    # Central beacon.
    big.putpixel((size // 2, 2), rgba(P.ARCO_DARCO_NEON))
    big.putpixel((size // 2, 0), rgba(P.ARCO_DARCO_NEON))
    return _pack_and_slice(big, 3, 3)


def tile_icon_bulldoze(rng):
    im = Image.new("RGBA", (TILE, TILE), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    # Tracks.
    d.rectangle([2, 11, 13, 14], fill=rgba(P.ICON_OUTLINE))
    for x in range(3, 13, 2):
        im.putpixel((x, 13), rgba(P.ICON_BULLDOZE_B))
    # Cab.
    d.rectangle([8, 4, 13, 10], fill=rgba(P.ICON_BULLDOZE_A))
    d.rectangle([8, 4, 13, 5],  fill=rgba(P.ICON_OUTLINE))
    # Blade.
    d.polygon([(2, 7), (7, 7), (7, 11), (1, 11)], fill=rgba(P.ICON_BULLDOZE_A))
    d.line([(2, 7), (1, 11)], fill=rgba(P.ICON_OUTLINE))
    # Window.
    im.putpixel((10, 7), rgba(P.WINDOW_LIT))
    return im


def tile_icon_overlay_off(rng):
    im = Image.new("RGBA", (TILE, TILE), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    # Eye outline.
    d.ellipse([1, 4, 14, 11], fill=rgba(P.ICON_EYE_BODY))
    d.ellipse([1, 4, 14, 11], outline=rgba(P.ICON_OUTLINE))
    # Pupil.
    d.ellipse([6, 6, 9, 9], fill=rgba(P.ICON_EYE_PUPIL))
    return im


def tile_icon_overlay_poll(rng):
    im = Image.new("RGBA", (TILE, TILE), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    # Smokestack.
    d.rectangle([6, 6, 9, 14], fill=rgba(P.ICON_POLL_STACK))
    d.rectangle([5, 6, 10, 7], fill=rgba(P.ICON_OUTLINE))
    # Plume.
    for (x, y) in [(6, 4), (7, 3), (8, 2), (9, 1), (5, 3),
                   (4, 2), (10, 3), (11, 2)]:
        if 0 <= x < TILE and 0 <= y < TILE:
            im.putpixel((x, y), rgba(P.ICON_POLL_PLUME))
    return im


def tile_icon_overlay_crime(rng):
    im = Image.new("RGBA", (TILE, TILE), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    # Exclamation inside a diamond.
    d.polygon([(8, 1), (14, 8), (8, 14), (2, 8)], fill=rgba(P.ICON_CRIME))
    d.polygon([(8, 1), (14, 8), (8, 14), (2, 8)], outline=rgba(P.ICON_OUTLINE))
    # "!" mark.
    d.rectangle([7, 4, 8, 9], fill=rgba(P.WINDOW_LIT))
    im.putpixel((7, 11), rgba(P.WINDOW_LIT))
    im.putpixel((8, 11), rgba(P.WINDOW_LIT))
    return im


def tile_icon_overlay_lv(rng):
    im = Image.new("RGBA", (TILE, TILE), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    # Green coin bg.
    d.ellipse([1, 2, 14, 13], fill=rgba(P.ICON_DOLLAR))
    d.ellipse([1, 2, 14, 13], outline=rgba(P.ICON_OUTLINE))
    # "$" strokes.
    d.rectangle([7, 4, 8, 11], fill=rgba(P.ICON_OUTLINE))
    for (x, y) in [(5, 5), (6, 4), (9, 4), (10, 5),
                   (5, 7), (9, 10), (10, 9), (5, 10), (6, 11), (9, 11)]:
        im.putpixel((x, y), rgba(P.ICON_OUTLINE))
    return im


def tile_icon_overlay_power(rng):
    im = Image.new("RGBA", (TILE, TILE), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.polygon([(9, 1), (4, 8), (7, 8), (5, 14), (11, 6), (8, 6)],
              fill=rgba(P.ICON_BOLT))
    d.polygon([(9, 1), (4, 8), (7, 8), (5, 14), (11, 6), (8, 6)],
              outline=rgba(P.ICON_OUTLINE))
    return im


def tile_icon_overlay_water(rng):
    im = Image.new("RGBA", (TILE, TILE), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    # Droplet shape.
    d.polygon([(8, 1), (12, 7), (12, 11), (8, 14), (4, 11), (4, 7)],
              fill=rgba(P.ICON_DROP))
    d.polygon([(8, 1), (12, 7), (12, 11), (8, 14), (4, 11), (4, 7)],
              outline=rgba(P.ICON_OUTLINE))
    # Shine highlight.
    im.putpixel((6, 6), rgba(P.WINDOW_LIT))
    return im


def tile_icon_tornado(rng):
    im = Image.new("RGBA", (TILE, TILE), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    # Funnel narrowing from top-left to bottom-right.
    bands = [
        (1, 2, 14, 4, P.ICON_TORNADO_DARK),
        (2, 4, 13, 6, P.ICON_TORNADO_LIGHT),
        (3, 6, 12, 8, P.ICON_TORNADO_DARK),
        (5, 8, 11, 10, P.ICON_TORNADO_LIGHT),
        (6, 10, 10, 12, P.ICON_TORNADO_DARK),
        (7, 12, 9, 14, P.ICON_TORNADO_LIGHT),
    ]
    for (x0, y0, x1, y1, col) in bands:
        d.rectangle([x0, y0, x1, y1], fill=rgba(col))
    # A little debris streak at the bottom.
    im.putpixel((8, 14), rgba(P.ICON_OUTLINE))
    im.putpixel((8, 15), rgba(P.ICON_OUTLINE))
    return im


def tile_icon_quake(rng):
    im = Image.new("RGBA", (TILE, TILE), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    # Ground.
    d.rectangle([1, 10, 14, 14], fill=rgba(P.ICON_QUAKE_GROUND))
    d.rectangle([1, 10, 14, 11], fill=rgba(P.ICON_OUTLINE))
    # Jagged crack from top to bottom center.
    crack_pixels = [
        (7, 0), (7, 1), (8, 2), (7, 3), (8, 4), (7, 5),
        (8, 6), (9, 7), (8, 8), (7, 9),
        (7, 11), (8, 12), (7, 13), (8, 14),
    ]
    for (x, y) in crack_pixels:
        im.putpixel((x, y), rgba(P.ICON_QUAKE_CRACK))
    return im


def tile_icon_flood(rng):
    im = Image.new("RGBA", (TILE, TILE), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    # Three stacked wave ridges.
    for band_y, col in [(4, P.ICON_FLOOD_DARK), (8, P.ICON_FLOOD_LIGHT),
                        (12, P.ICON_FLOOD_DARK)]:
        for x in range(1, 15):
            dy = 0
            phase = (x + band_y) % 4
            if phase == 0: dy = -1
            elif phase == 2: dy = 1
            im.putpixel((x, band_y + dy), rgba(col))
            im.putpixel((x, band_y + dy + 1), rgba(col))
    return im


def tile_icon_overlay_traffic(rng):
    im = Image.new("RGBA", (TILE, TILE), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    # Road strip.
    d.rectangle([0, 9, TILE - 1, 13], fill=rgba(P.ICON_CAR_ROAD))
    d.line([(0, 11), (TILE - 1, 11)], fill=rgba(P.ROAD_LINE))
    # Two cars stacked top-down-ish.
    d.rectangle([3, 3, 9, 8], fill=rgba(P.ICON_CAR_BODY))
    d.rectangle([4, 4, 8, 5], fill=rgba(P.ICON_CAR_WINDOW))
    d.rectangle([9, 4, 9, 7], fill=rgba(P.ICON_OUTLINE))
    # Second car on the road.
    d.rectangle([10, 14, TILE - 2, 15], fill=rgba(P.ICON_CAR_BODY))
    im.putpixel((11, 14), rgba(P.ICON_CAR_WINDOW))
    return im


def tile_icon_overlay_sewer(rng):
    im = Image.new("RGBA", (TILE, TILE), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    # Pipe silhouette.
    d.rectangle([5, 2, 10, 13], fill=rgba(P.ICON_SEWER_ARROW))
    d.rectangle([5, 2, 10, 3],  fill=rgba(P.ICON_OUTLINE))
    d.rectangle([5, 12, 10, 13], fill=rgba(P.ICON_OUTLINE))
    # Down-arrow inside.
    d.polygon([(6, 5), (9, 5), (8, 7), (9, 7), (7, 10), (5, 7), (6, 7)],
              fill=rgba(P.ICON_OUTLINE))
    return im


def tile_arco_launch(rng):
    """Launch arco — rocket-bearing spacefaring arco."""
    size = TILE * 3
    big = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    _dirt_lot(big, rng)
    d = ImageDraw.Draw(big)
    # Launch pad base.
    d.rectangle([2, size - 10, size - 3, size - 3], fill=rgba(P.ARCO_LAUNCH_BASE))
    d.rectangle([2, size - 10, size - 3, size - 9], fill=rgba(P.ARCO_LAUNCH_TRIM))
    # Support gantries.
    for gx in [4, size - 6]:
        d.rectangle([gx, size - 28, gx + 1, size - 9], fill=rgba(P.ARCO_LAUNCH_TRIM))
    # Rocket body (center).
    rx = size // 2
    d.rectangle([rx - 2, 4, rx + 2, size - 10], fill=rgba(P.ARCO_LAUNCH_ROCKET))
    # Nose cone.
    d.polygon([(rx - 2, 4), (rx + 2, 4), (rx, 0)], fill=rgba(P.ARCO_LAUNCH_ROCKET))
    # Fins.
    d.polygon([(rx - 2, size - 14), (rx - 4, size - 10), (rx - 2, size - 10)],
              fill=rgba(P.ARCO_LAUNCH_TRIM))
    d.polygon([(rx + 2, size - 14), (rx + 4, size - 10), (rx + 2, size - 10)],
              fill=rgba(P.ARCO_LAUNCH_TRIM))
    # Exhaust plume.
    for fy in range(size - 8, size - 3):
        for fx in range(rx - 2, rx + 3):
            big.putpixel((fx, fy), rgba(P.ARCO_LAUNCH_FIRE))
    # Windows on rocket.
    for wy in range(8, size - 12, 3):
        big.putpixel((rx, wy), rgba(P.WINDOW_LIT))
    return _pack_and_slice(big, 3, 3)


# ---------- atlas assembly ----------

def build_atlas(seed: int) -> Image.Image:
    atlas = Image.new("RGBA", (COLS * TILE, ROWS * TILE), (0, 0, 0, 0))
    rng = random.Random(seed)

    def paste(im, col, row):
        atlas.paste(im, (col * TILE, row * TILE))

    # Terrain.
    paste(tile_grass(rng),  *SLOTS["grass"])
    # Water: 4 frames laid out at (1..4, 0).
    for frame in range(4):
        paste(tile_water_frame(rng, frame), 1 + frame, 0)
    paste(tile_dirt(rng),   *SLOTS["dirt"])
    paste(tile_tree(rng),   *SLOTS["tree"])
    paste(tile_rubble(rng), *SLOTS["rubble"])

    # Bitmask groups.
    gen_fns = {
        "road":       tile_road,
        "rail":       tile_rail,
        "power_line": tile_power_line,
        "shore":      tile_shore,
        "water_pipe": tile_water_pipe,
        "sewer_pipe": tile_sewer_pipe,
    }
    for group, fn in gen_fns.items():
        for mask in range(16):
            paste(fn(mask, rng), *SLOTS[f"{group}_{mask:02d}"])

    # Zones + L1 buildings + park.
    paste(tile_zone(P.ZONE_R, rng), *SLOTS["zone_r"])
    paste(tile_zone(P.ZONE_C, rng), *SLOTS["zone_c"])
    paste(tile_zone(P.ZONE_I, rng), *SLOTS["zone_i"])
    paste(tile_building_l1(P.ZONE_R, P.BUILDING_R, P.ROOF, rng), *SLOTS["bld_r_l1"])
    paste(tile_building_l1(P.ZONE_C, P.BUILDING_C, P.ROOF, rng), *SLOTS["bld_c_l1"])
    paste(tile_building_l1(P.ZONE_I, P.BUILDING_I, P.ROOF, rng), *SLOTS["bld_i_l1"])
    paste(tile_park(rng), *SLOTS["park"])

    # Multi-cell buildings.
    def place_multi(name: str, tiles):
        _, _, cells = _MULTI_CELL_LAYOUTS[name]
        for tile_img, (c, r) in zip(tiles, cells):
            paste(tile_img, c, r)

    place_multi("bld_r_l2", tile_bld_l2(P.ZONE_R, P.BUILDING_R_L2, P.ROOF_R_L2, rng))
    place_multi("bld_c_l2", tile_bld_l2(P.ZONE_C, P.BUILDING_C_L2, P.ROOF_C_L2, rng))
    place_multi("bld_i_l2", tile_bld_l2(P.ZONE_I, P.BUILDING_I_L2, P.ROOF_I_L2, rng))
    place_multi("police",   tile_police(rng))
    place_multi("fire",     tile_fire(rng))
    place_multi("coal",     tile_coal(rng))
    place_multi("nuke",     tile_nuke(rng))
    place_multi("bld_r_l3", tile_bld_l3(P.ZONE_R, P.BUILDING_R_L3, P.ROOF_R_L3, rng))
    place_multi("bld_c_l3", tile_bld_l3(P.ZONE_C, P.BUILDING_C_L3, P.ROOF_C_L3, rng))
    place_multi("bld_i_l3", tile_bld_l3(P.ZONE_I, P.BUILDING_I_L3, P.ROOF_I_L3, rng))

    # Overlay alpha ramp.
    for i, a in enumerate([25, 50, 80, 115, 150]):
        paste(tile_overlay(a), i, 18)

    # Indicators + 1×1 utility buildings on row 18.
    paste(tile_no_power_ind(rng), *SLOTS["no_power_ind"])
    paste(tile_no_water_ind(rng), *SLOTS["no_water_ind"])
    paste(tile_wind(rng),         *SLOTS["wind"])
    paste(tile_hydro(rng),        *SLOTS["hydro"])
    paste(tile_water_tower(rng),  *SLOTS["water_tower"])

    # Alternative 2×2 plants + water/sewer buildings.
    place_multi("microwave",   tile_microwave(rng))
    place_multi("gas",         tile_gas(rng))
    place_multi("water_pump",  tile_water_pump(rng))
    place_multi("sewer_plant", tile_sewer_plant(rng))
    place_multi("solar",       tile_solar(rng))
    place_multi("oil",         tile_oil(rng))

    # 3×3 endgame.
    place_multi("fusion",        tile_fusion(rng))
    place_multi("arco_plymouth", tile_arco_plymouth(rng))
    place_multi("arco_forest",   tile_arco_forest(rng))
    place_multi("arco_darco",    tile_arco_darco(rng))
    place_multi("arco_launch",   tile_arco_launch(rng))

    # HUD icons on row 31.
    paste(tile_icon_bulldoze(rng),       *SLOTS["icon_bulldoze"])
    paste(tile_icon_overlay_off(rng),    *SLOTS["icon_overlay_off"])
    paste(tile_icon_overlay_poll(rng),   *SLOTS["icon_overlay_poll"])
    paste(tile_icon_overlay_crime(rng),  *SLOTS["icon_overlay_crime"])
    paste(tile_icon_overlay_lv(rng),     *SLOTS["icon_overlay_lv"])
    paste(tile_icon_overlay_power(rng),  *SLOTS["icon_overlay_power"])
    paste(tile_icon_overlay_water(rng),  *SLOTS["icon_overlay_water"])
    paste(tile_icon_overlay_sewer(rng),  *SLOTS["icon_overlay_sewer"])

    # Disaster icons + traffic overlay icon (row 32).
    paste(tile_icon_tornado(rng),         *SLOTS["icon_tornado"])
    paste(tile_icon_quake(rng),           *SLOTS["icon_quake"])
    paste(tile_icon_flood(rng),           *SLOTS["icon_flood"])
    paste(tile_icon_overlay_traffic(rng), *SLOTS["icon_overlay_traffic"])

    return atlas


# ---------- Godot bindings ----------

def emit_tres(path: Path, texture_res_path: str) -> None:
    """Emit the TileSet .tres. Declares one tile per SLOTS entry EXCEPT water
    animation continuation frames; the base water tile gets animation config.
    """
    declared = sorted(set(SLOTS.values()) - set(WATER_ANIM_CELLS),
                      key=lambda p: (p[1], p[0]))
    lines = [
        '[gd_resource type="TileSet" load_steps=3 format=3]\n',
        '\n',
        f'[ext_resource type="Texture2D" path="{texture_res_path}" id="1_tex"]\n',
        '\n',
        '[sub_resource type="TileSetAtlasSource" id="TileSetAtlasSource_main"]\n',
        'texture = ExtResource("1_tex")\n',
        f'texture_region_size = Vector2i({TILE}, {TILE})\n',
    ]

    water_col, water_row = _FIXED_SLOTS["water"]
    for c, r in declared:
        # Water base tile: declare animation frames.
        if (c, r) == (water_col, water_row):
            lines.append(f'{c}:{r}/animation_columns = 0\n')
            lines.append(f'{c}:{r}/animation_separation = Vector2i(0, 0)\n')
            lines.append(f'{c}:{r}/animation_speed = 2.0\n')
            lines.append(f'{c}:{r}/animation_mode = 0\n')
            lines.append(f'{c}:{r}/animation_frames_count = 4\n')
            for fi in range(4):
                lines.append(f'{c}:{r}/animation_frame_{fi}/duration = 1.0\n')
            lines.append(f'{c}:{r}/0 = 0\n')
        else:
            lines.append(f'{c}:{r}/0 = 0\n')

    lines += [
        '\n',
        '[resource]\n',
        f'tile_size = Vector2i({TILE}, {TILE})\n',
        'sources/0 = SubResource("TileSetAtlasSource_main")\n',
    ]
    path.write_text("".join(lines))


def _emit_single_constants(lines, single_names):
    for name in sorted(single_names):
        c, r = SLOTS[name]
        lines.append(f'const {name.upper()} := Vector2i({c}, {r})\n')


def _emit_multi_constants(lines):
    """Emit per-multi-building arrays: const BLD_R_L2 := [Vector2i(..), ...]."""
    for name in sorted(_MULTI_CELL_LAYOUTS):
        _, _, cells = _MULTI_CELL_LAYOUTS[name]
        coords = [f"Vector2i({c}, {r})" for (c, r) in cells]
        lines.append(f'const {name.upper()}: Array[Vector2i] = [{", ".join(coords)}]\n')


def emit_tile_ids_gd(path: Path) -> None:
    lines = [
        '# Auto-generated by tools/gen_tileset.py. Do not edit by hand.\n',
        'class_name TileIds\n',
        'extends RefCounted\n',
        '\n',
        'const SOURCE_ID: int = 0\n',
        '\n',
    ]

    # Named single-tile constants: everything in _FIXED_SLOTS plus nothing else
    # (water animation frames are represented by the base WATER constant only).
    single_names = [n for n in _FIXED_SLOTS if n != "water" or True]
    _emit_single_constants(lines, single_names)
    lines.append('\n')

    _emit_multi_constants(lines)
    lines.append('\n')

    lines.append('# Bitmask convention: N=1, E=2, S=4, W=8.\n')
    for group, start_row in BITMASK_GROUPS.items():
        lines.append(f'static func {group}(mask: int) -> Vector2i:\n')
        lines.append(f'\treturn Vector2i(mask & 7, {start_row} + (mask >> 3))\n')

    lines.append('\n')
    lines.append('# Multi-cell helpers: look up atlas coord by (kind, sub_index).\n')
    lines.append('static func multi(kind_array: Array[Vector2i], sub: int) -> Vector2i:\n')
    lines.append('\treturn kind_array[sub]\n')

    path.write_text("".join(lines))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--outdir", default="godot",
                    help="Godot project root (default: godot)")
    ap.add_argument("--seed", type=int, default=1337)
    args = ap.parse_args()

    root = Path(args.outdir)
    png_path = root / "assets" / "tileset.png"
    tres_path = root / "assets" / "tileset.tres"
    gd_path = root / "scripts" / "tile_ids.gd"

    for p in (png_path, tres_path, gd_path):
        p.parent.mkdir(parents=True, exist_ok=True)

    atlas = build_atlas(args.seed)
    atlas.save(png_path)
    emit_tres(tres_path, "res://assets/tileset.png")
    emit_tile_ids_gd(gd_path)

    declared = len(set(SLOTS.values()) - set(WATER_ANIM_CELLS))
    print(f"wrote {png_path} ({atlas.width}x{atlas.height})")
    print(f"wrote {tres_path} ({declared} atlas tiles declared, "
          f"{len(WATER_ANIM_CELLS)} water anim frames)")
    print(f"wrote {gd_path} ({len(_FIXED_SLOTS)} singles, "
          f"{len(_MULTI_CELL_LAYOUTS)} multi-cell arrays)")


if __name__ == "__main__":
    main()
