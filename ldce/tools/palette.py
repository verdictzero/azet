"""Base color palette for LDCE tile generation.

Kept small and muted so the whole game reads as one world. RGB tuples;
callers add alpha as needed.
"""

GRASS_DARK   = (56, 102, 65)
GRASS_LIGHT  = (88, 137, 78)

WATER_DARK   = (30, 60, 110)
WATER_LIGHT  = (62, 107, 170)

DIRT_DARK    = (110, 85, 55)
DIRT_LIGHT   = (150, 115, 75)

TREE_DARK    = (34, 68, 38)
TREE_MID     = (56, 110, 60)

ROAD_DARK    = (38, 38, 42)
ROAD_LIGHT   = (92, 92, 98)
ROAD_LINE    = (220, 200, 60)
SIDEWALK     = (170, 170, 175)
SIDEWALK_D   = (120, 120, 125)  # darker speckle for pedestrian-worn variance

ZONE_R       = (120, 180, 120)
ZONE_C       = (120, 160, 200)
ZONE_I       = (200, 180, 110)

BUILDING_R   = (180, 140, 120)
BUILDING_C   = (140, 150, 200)
BUILDING_I   = (180, 160, 90)
ROOF         = (80, 50, 40)
WINDOW_LIT   = (240, 230, 150)

SMOKESTACK   = (70, 70, 75)
STACK_CAP    = (200, 55, 55)
PLANT_BODY   = (95, 95, 105)
PLANT_TRIM   = (60, 60, 70)
SMOKE        = (200, 200, 200)

RAIL_BALLAST_D = (70, 70, 72)
RAIL_BALLAST_L = (105, 105, 108)
RAIL_SLEEPER   = (90, 62, 42)
RAIL_STEEL     = (190, 190, 205)

PYLON        = (60, 60, 70)
PYLON_HILITE = (120, 120, 135)
WIRE         = (25, 25, 30)

RUBBLE_DARK  = (60, 55, 50)
RUBBLE_MID   = (95, 82, 66)
RUBBLE_LIGHT = (145, 125, 100)

SHORE_SAND   = (200, 188, 140)

# Mid-density (L2) building palettes — slightly richer than L1.
BUILDING_R_L2 = (195, 130, 110)
ROOF_R_L2     = (90, 45, 38)
BUILDING_C_L2 = (130, 145, 210)
ROOF_C_L2     = (55, 55, 95)
BUILDING_I_L2 = (190, 160, 80)
ROOF_I_L2     = (90, 70, 35)

# High-density (L3) skyscraper palettes.
BUILDING_R_L3 = (210, 180, 150)
ROOF_R_L3     = (95, 55, 45)
BUILDING_C_L3 = (110, 130, 220)
ROOF_C_L3     = (35, 45, 90)
BUILDING_I_L3 = (175, 150, 70)
ROOF_I_L3     = (70, 55, 25)
GLASS_SHEEN   = (220, 230, 240)

# Services.
PARK_GRASS    = (70, 130, 60)
PARK_PATH     = (190, 170, 130)
PARK_FLOWER_A = (230, 100, 120)
PARK_FLOWER_B = (240, 210, 90)

POLICE_BODY   = (60, 90, 150)
POLICE_TRIM   = (35, 55, 110)
POLICE_LIGHT  = (230, 230, 110)
POLICE_SIREN  = (240, 60, 60)

FIRE_BODY     = (185, 55, 45)
FIRE_TRIM     = (110, 25, 20)
FIRE_WINDOW   = (240, 230, 170)

# Nuclear plant.
NUKE_BODY     = (200, 205, 210)
NUKE_TRIM     = (90, 130, 140)
NUKE_DOME     = (160, 195, 205)
NUKE_COOLANT  = (110, 210, 180)
NUKE_HAZARD   = (255, 215, 50)

# Water animation shades (frame-to-frame offset for ripple feel).
WATER_FOAM    = (170, 200, 230)

# Overlay ramp (white; alpha encoded via rgba() a= param).
OVERLAY_WHITE = (255, 255, 255)

# Indicators (small icons drawn on transparent background, composed on top of buildings).
IND_NO_POWER_BG   = (30, 50, 110)
IND_NO_POWER_BOLT = (250, 235, 100)
IND_NO_WATER_BG   = (90, 30, 30)
IND_NO_WATER_DROP = (160, 210, 240)

# Pipes / lines — keep backgrounds transparent in the tile (rendered on overlay layer).
PIPE_WATER_LIGHT = (120, 200, 230)
PIPE_WATER_DARK  = (40, 100, 150)
PIPE_SEWER_LIGHT = (150, 120, 90)
PIPE_SEWER_DARK  = (70, 50, 35)

# Wind turbine.
WIND_TOWER = (210, 215, 220)
WIND_BLADE = (240, 245, 250)

# Hydro dam.
HYDRO_CONCRETE = (195, 195, 200)
HYDRO_SHADOW   = (100, 105, 115)
HYDRO_SPILL    = (170, 210, 230)

# Water tower.
TANK_BODY   = (215, 195, 155)
TANK_TRIM   = (130, 105, 70)
TANK_LEG    = (90, 85, 80)

# Water pump building.
PUMP_BODY   = (140, 160, 175)
PUMP_TRIM   = (80, 95, 110)
PUMP_PIPE   = (60, 110, 150)

# Sewer plant.
SEWER_BODY  = (130, 115, 95)
SEWER_TRIM  = (75, 60, 45)
SEWER_TANK  = (90, 120, 130)

# Solar plant.
SOLAR_PANEL_DARK = (22, 30, 70)
SOLAR_PANEL_LITE = (65, 95, 170)
SOLAR_FRAME      = (160, 160, 170)

# Gas plant.
GAS_BODY    = (170, 170, 175)
GAS_TRIM    = (90, 90, 100)
GAS_FLAME   = (255, 180, 60)

# Oil refinery.
OIL_BODY    = (120, 80, 55)
OIL_TRIM    = (65, 40, 25)
OIL_TANK    = (155, 135, 90)
OIL_FLARE   = (255, 140, 40)

# Microwave receiver.
MICRO_DISH   = (200, 205, 215)
MICRO_SHADOW = (100, 110, 130)
MICRO_BEAM   = (180, 230, 255)

# Fusion plant.
FUSION_RING     = (120, 130, 160)
FUSION_BODY     = (195, 200, 215)
FUSION_PLASMA_A = (180, 120, 255)
FUSION_PLASMA_B = (255, 200, 90)

# Arcologies — four flavors.
ARCO_PLYMOUTH_BASE = (200, 190, 175)
ARCO_PLYMOUTH_TRIM = (100, 85, 65)
ARCO_PLYMOUTH_TIP  = (230, 215, 180)
ARCO_FOREST_LEAF   = (60, 135, 70)
ARCO_FOREST_TRUNK  = (85, 65, 45)
ARCO_FOREST_GLINT  = (240, 250, 220)
ARCO_DARCO_BASE    = (40, 40, 50)
ARCO_DARCO_TRIM    = (15, 15, 25)
ARCO_DARCO_NEON    = (240, 50, 120)
ARCO_LAUNCH_BASE   = (190, 200, 215)
ARCO_LAUNCH_TRIM   = (100, 110, 130)
ARCO_LAUNCH_ROCKET = (235, 235, 240)
ARCO_LAUNCH_FIRE   = (255, 150, 50)

# Palette icons (row 31 — drawn on transparent backgrounds for HUD use).
ICON_OUTLINE      = (20, 20, 25)
ICON_BULLDOZE_A   = (240, 190, 60)
ICON_BULLDOZE_B   = (180, 130, 30)
ICON_EYE_BODY     = (230, 230, 230)
ICON_EYE_PUPIL    = (40, 40, 50)
ICON_POLL_PLUME   = (140, 110, 90)
ICON_POLL_STACK   = (70, 70, 75)
ICON_CRIME        = (220, 60, 150)
ICON_DOLLAR       = (70, 200, 90)
ICON_BOLT         = (250, 220, 60)
ICON_DROP         = (120, 200, 230)
ICON_SEWER_ARROW  = (150, 110, 70)

# Disaster icons.
ICON_TORNADO_DARK  = (110, 115, 125)
ICON_TORNADO_LIGHT = (180, 185, 195)
ICON_QUAKE_GROUND  = (130, 100, 70)
ICON_QUAKE_CRACK   = (30, 25, 20)
ICON_FLOOD_DARK    = (50, 100, 160)
ICON_FLOOD_LIGHT   = (120, 190, 220)
ICON_CAR_BODY      = (200, 80, 70)
ICON_CAR_WINDOW    = (80, 100, 130)
ICON_CAR_ROAD      = (80, 80, 85)
