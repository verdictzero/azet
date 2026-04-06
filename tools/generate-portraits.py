#!/usr/bin/env python3
"""
Generate pre-baked ASCII portrait data from PNG files.

Replicates the convertDoubled algorithm from js/ascii-art-gen.js:
- Each source pixel becomes 2 adjacent character columns
- Each character row encodes 2 vertical pixels via Unicode half-blocks
- Alpha blending over a configurable background color

Output: js/portrait-data.js (ES module with palette-indexed cell data)
"""

import json
import os
import sys
from pathlib import Path
from PIL import Image

# ── Constants matching ascii-art-gen.js ──────────────────

UPPER_HALF = '\u2580'  # ▀
LOWER_HALF = '\u2584'  # ▄
FULL_BLOCK = '\u2588'  # █
ALPHA_THRESHOLD = 30

CHAR_TABLE = [' ', UPPER_HALF, LOWER_HALF, FULL_BLOCK]  # index 0-3

# Target dimensions (inside border frame: 96-2=94 cols, 84-2=82 rows)
TARGET_COLS = 94
TARGET_ROWS = 82

# Background color for dialogue panels
BG_COLOR = (14, 14, 20)  # #0e0e14 (FF_BLUE_DARK)
BG_HEX = '#0e0e14'

# Portrait PNGs to process
PORTRAIT_FILES = [
    'sprites/portraits/npc_female_1.png',
    'sprites/portraits/npc_female_2.png',
    'sprites/portraits/npc_female_3.png',
    'sprites/portraits/npc_female_4.png',
    'sprites/portraits/npc_female_5.png',
    'sprites/portraits/npc_male_1.png',
    'sprites/portraits/npc_male_2.png',
    'sprites/portraits/npc_female_child_1.png',
    'sprites/portraits/npc_male_child_1.png',
]


def blend_over(r, g, b, a, bg_r, bg_g, bg_b):
    """Alpha-blend pixel over solid background. Returns #rrggbb hex string."""
    alpha = a / 255.0
    inv = 1.0 - alpha
    o_r = round(r * alpha + bg_r * inv)
    o_g = round(g * alpha + bg_g * inv)
    o_b = round(b * alpha + bg_b * inv)
    return f'#{o_r:02x}{o_g:02x}{o_b:02x}'


def convert_doubled(img, cols, rows, bg_color=BG_COLOR, bg_hex=BG_HEX):
    """
    Double-density conversion: each source pixel emits 2 adjacent character
    columns. Combined with half-block vertical encoding (2 pixels per row).

    Matches js/ascii-art-gen.js convertDoubled() exactly.
    """
    bg_r, bg_g, bg_b = bg_color

    # Sample at half the column count since each pixel becomes 2 chars
    sample_w = (cols + 1) // 2  # Math.ceil(cols / 2)
    sample_h = rows * 2

    # Resize image to sample dimensions (bilinear = similar to canvas 'medium')
    resized = img.resize((sample_w, sample_h), Image.BILINEAR)
    pixels = resized.load()

    cells = []
    for r in range(rows):
        row = []
        for c in range(sample_w):
            # Top pixel
            tp = pixels[c, r * 2]
            t_r, t_g, t_b, t_a = tp[0], tp[1], tp[2], tp[3] if len(tp) > 3 else 255

            # Bottom pixel
            bp = pixels[c, r * 2 + 1]
            b_r, b_g, b_b, b_a = bp[0], bp[1], bp[2], bp[3] if len(bp) > 3 else 255

            top_transparent = t_a < ALPHA_THRESHOLD
            bot_transparent = b_a < ALPHA_THRESHOLD

            if top_transparent and bot_transparent:
                char_idx = 0  # space
                fg = bg_hex
                bg = bg_hex
            elif top_transparent:
                char_idx = 2  # LOWER_HALF
                fg = blend_over(b_r, b_g, b_b, b_a, bg_r, bg_g, bg_b)
                bg = bg_hex
            elif bot_transparent:
                char_idx = 1  # UPPER_HALF
                fg = blend_over(t_r, t_g, t_b, t_a, bg_r, bg_g, bg_b)
                bg = bg_hex
            else:
                top_color = blend_over(t_r, t_g, t_b, t_a, bg_r, bg_g, bg_b)
                bot_color = blend_over(b_r, b_g, b_b, b_a, bg_r, bg_g, bg_b)
                if top_color == bot_color:
                    char_idx = 3  # FULL_BLOCK
                    fg = top_color
                    bg = top_color
                else:
                    char_idx = 1  # UPPER_HALF
                    fg = top_color
                    bg = bot_color

            # Each pixel emits 2 adjacent identical cells
            row.append((char_idx, fg, bg))
            row.append((char_idx, fg, bg))

        cells.append(row)

    out_cols = sample_w * 2
    return out_cols, rows, cells


def main():
    project_root = Path(__file__).parent.parent
    os.chdir(project_root)

    # Build global color palette and portrait data
    palette = {}  # hex -> index
    palette_list = []
    portraits = {}

    def get_palette_idx(hex_color):
        if hex_color not in palette:
            palette[hex_color] = len(palette_list)
            palette_list.append(hex_color)
        return palette[hex_color]

    for png_path in PORTRAIT_FILES:
        full_path = project_root / png_path
        if not full_path.exists():
            print(f'WARNING: {png_path} not found, skipping', file=sys.stderr)
            continue

        print(f'Processing {png_path}...', file=sys.stderr)
        img = Image.open(full_path).convert('RGBA')

        cols, rows, cells = convert_doubled(img, TARGET_COLS, TARGET_ROWS)

        # Convert to palette-indexed flat array
        flat_data = []
        for row in cells:
            for char_idx, fg, bg in row:
                fg_idx = get_palette_idx(fg)
                bg_idx = get_palette_idx(bg)
                flat_data.append(char_idx)
                flat_data.append(fg_idx)
                flat_data.append(bg_idx)

        portraits[png_path] = {
            'cols': cols,
            'rows': rows,
            'data': flat_data,
        }

    print(f'Palette size: {len(palette_list)} colors', file=sys.stderr)
    print(f'Portraits: {len(portraits)}', file=sys.stderr)

    # Write JS module
    out_path = project_root / 'js' / 'portrait-data.js'
    with open(out_path, 'w') as f:
        f.write('// Auto-generated by tools/generate-portraits.py — do not edit manually\n')
        f.write('// Pre-baked ASCII portrait data at 3x density using doubled half-block encoding\n\n')

        # Write palette as compact array
        f.write('export const PORTRAIT_PALETTE = ')
        f.write(json.dumps(palette_list, separators=(',', ':')))
        f.write(';\n\n')

        # Write char lookup
        f.write("export const PORTRAIT_CHARS = [' ', '\\u2580', '\\u2584', '\\u2588'];\n\n")

        # Write portrait data
        f.write('export const PORTRAIT_ASCII = {\n')
        for i, (path, data) in enumerate(portraits.items()):
            f.write(f'  {json.dumps(path)}: ')
            f.write(json.dumps(data, separators=(',', ':')))
            if i < len(portraits) - 1:
                f.write(',')
            f.write('\n')
        f.write('};\n')

    file_size = out_path.stat().st_size
    print(f'Wrote {out_path} ({file_size:,} bytes)', file=sys.stderr)


if __name__ == '__main__':
    main()
