// ─── Tile Density Expansion ──────────────────────────
// Maps tile types to NxN character grids for zoom levels 2 and 3.
// At zoom level 1, tiles render as-is (single character).
// At zoom level N, each world tile expands to NxN screen cells.

// ── Expansion pattern definitions ────────────────────
// Each pattern is an array of rows, each row an array of chars.
// null means "use the tile's original char".
// Patterns can have multiple variants; spatial hashing picks one.

const WALL_2x2 = [
  [['\u2588','\u2593'],['\u2593','\u2588']],  // █▓ / ▓█
  [['\u2593','\u2588'],['\u2588','\u2593']],  // ▓█ / █▓
  [['\u2588','\u2588'],['\u2588','\u2593']],  // ██ / █▓
];

const WALL_3x3 = [
  [['\u2588','\u2593','\u2588'],['\u2593','#','\u2593'],['\u2588','\u2593','\u2588']],  // █▓█ / ▓#▓ / █▓█
  [['\u2593','\u2588','\u2593'],['\u2588','#','\u2588'],['\u2593','\u2588','\u2593']],  // ▓█▓ / █#█ / ▓█▓
  [['\u2588','\u2588','\u2588'],['\u2588','\u2592','\u2588'],['\u2588','\u2588','\u2588']],  // ███ / █▒█ / ███
];

const FLOOR_2x2 = [
  [['.','·'],['·','.']],
  [['·','.'],['.','\u00b7']],
  [['.','.'],['.','.']],
];

const FLOOR_3x3 = [
  [['·','.','\u00b7'],['.','\u00b7','.'],['\u00b7','.','\u00b7']],
  [['.','·','.'],['·','.','·'],['.','\u00b7','.']],
  [['.','.','.'],['.','·','.'],['.','.','·']],
];

const GRASS_2x2 = [
  [['.',','],['`','.']],
  [[',','.'],['.',';']],
  [['.','.'],['\'','.']],
];

const GRASS_3x3 = [
  [['.',',','.'],['`','.',','],['.',';','.']],
  [[',','.','\u00b7'],['.','.',','],['`','.','.']],
  [['.','.',','],['.','\u00b7','.'],[',','.','.']],
];

const TALL_GRASS_2x2 = [
  [['\u0131',','],['.','\u0131']],
  [[',','\u0131'],['\u0131','.']],
];

const TALL_GRASS_3x3 = [
  [['.','\u0131',','],['`','\u0131','.'],['.',',','\u0131']],
  [['\u0131','.','.'],['.','\u0131',','],['.','.','`']],
];

const MEADOW_2x2 = [
  [[',','\u00b7'],['\u00b7',',']],
  [['\u00b7',','],['.','\u00b7']],
];

const MEADOW_3x3 = [
  [[',','\u00b7',','],['\u00b7',',','\u00b7'],['.',',','\u00b7']],
  [['\u00b7',',','.'],[',','\u00b7',','],['.',',','.']],
];

const TREE_2x2 = [
  [[null,'.'],['.',null]],
  [['.',null],[null,'.']],
];

const TREE_3x3 = [
  [['\u00b7',null,'\u00b7'],[null,'\u2660',null],['\u00b7','|','\u00b7']],
  [['.',null,'.'],['.',null,'.'],['.','\u00b7','.']],
];

const DEEP_FOREST_2x2 = [
  [[null,'\u2660'],['\u2663',null]],
  [['\u2660',null],[null,'\u2663']],
];

const DEEP_FOREST_3x3 = [
  [['\u2660',null,'\u2660'],[null,'\u2663',null],['\u2660',null,'\u2660']],
  [[null,'\u2660',null],['\u2663',null,'\u2663'],[null,'\u2660',null]],
];

const SPARSE_TREE_2x2 = [
  [[null,'.'],['.','.']],
  [['.','.'],[null,'.']],
];

const SPARSE_TREE_3x3 = [
  [['.',null,'.'],['.','\u00b7','.'],['.','.','.']],
  [['.','.','.'],['.',null,'.'],['.','.','.']],
];

const WATER_2x2 = [
  [['~','\u2248'],['\u2248','~']],
  [['\u2248','~'],['~','\u2248']],
];

const WATER_3x3 = [
  [['~','\u2248','~'],['\u2248','~','\u2248'],['~','\u2248','~']],
  [['\u2248','~','\u2248'],['~','\u2248','~'],['\u2248','~','\u2248']],
];


const MOUNTAIN_2x2 = [
  [['\u25B3','\u2593'],['\u2593','\u25B3']],
  [['\u2593','\u25B3'],['\u25B3','\u2593']],
];

const MOUNTAIN_3x3 = [
  [['\u2593','\u25B3','\u2593'],['\u25B3','\u25B2','\u25B3'],['\u2593','\u25B3','\u2593']],
  [['\u25B3','\u2593','\u25B3'],['\u2593','\u25B2','\u2593'],['\u25B3','\u2593','\u25B3']],
];

const SNOW_2x2 = [
  [['\u2746','\u00b7'],['\u00b7','\u2746']],
  [['\u00b7','\u2746'],['\u2746','\u00b7']],
];

const SNOW_3x3 = [
  [['\u00b7','\u2746','\u00b7'],['\u2746','\u2746','\u2746'],['\u00b7','\u2746','\u00b7']],
  [['\u2746','\u00b7','\u2746'],['\u00b7','\u2746','\u00b7'],['\u2746','\u00b7','\u2746']],
];

const HILL_2x2 = [
  [['\u2229','.'],['.','\u2229']],
  [['.','\u2229'],['\u2229','.']],
];

const HILL_3x3 = [
  [['.','\u2229','.'],['.','\u2312','.'],['.','\u2229','.']],
  [['\u2229','.','\u2312'],['.','\u2229','.'],['\u2312','.','\u2229']],
];

const ROCK_2x2 = [
  [['\u2593','\u2592'],['\u2592','\u2593']],
  [['\u2592','\u2593'],['\u2593','\u2592']],
];

const ROCK_3x3 = [
  [['\u2593','\u2592','\u2593'],['\u2592','\u2588','\u2592'],['\u2593','\u2592','\u2593']],
  [['\u2592','\u2593','\u2592'],['\u2593','\u2592','\u2593'],['\u2592','\u2593','\u2592']],
];

const CRYSTAL_2x2 = [
  [['#','\u2666'],['\u2666','#']],
  [['\u2666','#'],['#','\u2666']],
];

const CRYSTAL_3x3 = [
  [['\u2666','#','\u2666'],['#','\u2666','#'],['\u2666','#','\u2666']],
  [['#','\u2666','#'],['\u2666','*','\u2666'],['#','\u2666','#']],
];

const LAVA_2x2 = [
  [['~','\u2248'],['\u2248','~']],
  [['\u2248','~'],['~','\u2248']],
];

const LAVA_3x3 = [
  [['~','\u2248','~'],['\u2248','*','\u2248'],['~','\u2248','~']],
  [['\u2248','~','\u2248'],['~','\u2248','~'],['\u2248','~','\u2248']],
];

const DOOR_2x2 = [
  [['\u2593','+'],['+','\u2593']],
  [['+',' '],[' ','+']],
];

const DOOR_3x3 = [
  [['\u2593','\u2593','\u2593'],['\u2593','+','\u2593'],['\u2593',' ','\u2593']],
  [['\u2588','\u2593','\u2588'],['\u2593','+','\u2593'],[' ',' ',' ']],
];

// ── Directional door patterns (entrance/airlock doors with direction indicators) ──

// Entrance doors — framed portal with directional arrow showing exit direction
// West-facing (door on west edge, arrow points left ◄)
const ENTRANCE_DOOR_W_2x2 = [
  [['╔','▌'],['╚','▌']],
];
const ENTRANCE_DOOR_W_3x3 = [
  [['╔','═','▌'],['◄',null,'▌'],['╚','═','▌']],
];

// East-facing (door on east edge, arrow points right ►)
const ENTRANCE_DOOR_E_2x2 = [
  [['▐','╗'],['▐','╝']],
];
const ENTRANCE_DOOR_E_3x3 = [
  [['▐','═','╗'],['▐',null,'►'],['▐','═','╝']],
];

// Special access doors — heavier frame, restricted feel
const SPECIAL_DOOR_W_2x2 = [
  [['╠','▌'],['╠','▌']],
];
const SPECIAL_DOOR_W_3x3 = [
  [['╔','▓','▌'],['╠',null,'▌'],['╚','▓','▌']],
];
const SPECIAL_DOOR_E_2x2 = [
  [['▐','╣'],['▐','╣']],
];
const SPECIAL_DOOR_E_3x3 = [
  [['▐','▓','╗'],['▐',null,'╣'],['▐','▓','╝']],
];

// Engineering entrance doors — industrial portal, cleaner frame
const ENG_ENTRANCE_W_2x2 = [
  [['◄','║'],['░','║']],
];
const ENG_ENTRANCE_W_3x3 = [
  [['╔','─','║'],['◄',null,'║'],['╚','─','║']],
];
const ENG_ENTRANCE_E_2x2 = [
  [['║','►'],['║','░']],
];
const ENG_ENTRANCE_E_3x3 = [
  [['║','─','╗'],['║',null,'►'],['║','─','╝']],
];

// Engineering airlock doors — heavy sealed bulkhead with pressure indicators
const ENG_AIRLOCK_W_2x2 = [
  [['▓','◄'],['▓','░']],
];
const ENG_AIRLOCK_W_3x3 = [
  [['▓','▓','▓'],['◄',null,'▓'],['▓','▓','▓']],
];
const ENG_AIRLOCK_E_2x2 = [
  [['►','▓'],['░','▓']],
];
const ENG_AIRLOCK_E_3x3 = [
  [['▓','▓','▓'],['▓',null,'►'],['▓','▓','▓']],
];

const STAIRS_2x2 = [
  [['/',null],[null,'/']],
  [[null,'/'],['/','\\']],
];

const STAIRS_3x3 = [
  [['/',null,'\\'],['.',null,'.'],['/',null,'\\']],
  [['.','/','.'],[null,null,null],['.','\\','.']],
];

const COBBLESTONE_2x2 = [
  [['\u00b7','.'],['.','\u00b7']],
  [['.','\u00b7'],['\u00b7','.']],
];

const COBBLESTONE_3x3 = [
  [['\u00b7','.','\u00b7'],['.','\u00b7','.'],['\u00b7','.','\u00b7']],
  [['.','\u00b7','.'],['\u00b7','.','\u00b7'],['.','\u00b7','.']],
];

const FENCE_2x2 = [
  [['|','-'],['-','|']],
  [['-','|'],['|','-']],
];

const FENCE_3x3 = [
  [['|','-','|'],['-','|','-'],['|','-','|']],
  [['-','|','-'],['|','+','|'],['-','|','-']],
];

const ROAD_2x2 = [
  [['=','.'],['.','=']],
  [['.','\u2550'],['\u2550','.']],
];

const ROAD_3x3 = [
  [['.','\u2550','.'],['\u2550','.','\u2550'],['.','\u2550','.']],
  [['\u2550','.','\u2550'],['.','\u2550','.'],['.','.','=']],
];

const VOID_2x2 = [
  [[' ','\u2591'],['\u2591',' ']],
  [['\u2591',' '],[' ','\u2591']],
];

const VOID_3x3 = [
  [[' ','\u2591',' '],['\u2591',' ','\u2591'],[' ','\u2591',' ']],
  [['\u2591',' ','\u2591'],[' ','\u2591',' '],['\u2591',' ','\u2591']],
];

const MECH_2x2 = [
  [['\u2699','\u2502'],['\u2500','\u2699']],
  [['\u2502','\u2699'],['\u2699','\u2500']],
];

const MECH_3x3 = [
  [['\u2502','\u2699','\u2502'],['\u2500','\u2699','\u2500'],['\u2502','\u2699','\u2502']],
  [['\u2699','\u2500','\u2699'],['\u2500','\u2699','\u2500'],['\u2699','\u2500','\u2699']],
];

const FUNGAL_2x2 = [
  [['%','\u00b7'],['\u00b7','%']],
  [['\u00b7','%'],['%','\u00b7']],
];

const FUNGAL_3x3 = [
  [['\u00b7','%','\u00b7'],['%','%','%'],['\u00b7','%','\u00b7']],
  [['%','\u00b7','%'],['\u00b7','%','\u00b7'],['%','\u00b7','%']],
];

const BRIDGE_2x2 = [
  [['=','='],['|','|']],
  [['=','='],['\u2550','\u2550']],
];

const BRIDGE_3x3 = [
  [['|','=','|'],['=','=','='],['|','=','|']],
  [['\u2550','=','\u2550'],['=','\u2550','='],['|','=','|']],
];

// ── Colony substructure tear patterns ────────────────

const TEAR_GRASS_2x2 = [
  [[',','.'],['.', ',']],
  [['.',','],[',','.']],
];

const TEAR_GRASS_3x3 = [
  [[',','.',','],['.',',' ,'.'],[',','.',',']],
  [['.',',','.'],[',','.',','],['.', ',','.']],
];

const TEAR_DIRT_2x2 = [
  [['\u00B7','.'],['.', '\u00B7']],
  [['.', '\u00B7'],['\u00B7','.']],
];

const TEAR_DIRT_3x3 = [
  [['\u00B7','.','\u00B7'],['.','\u00B7','.'],['\u00B7','.','\u00B7']],
  [['.','\u00B7','.'],['\u00B7','.','\u00B7'],['.','\u00B7','.']],
];

const TEAR_LIGHT_METAL_2x2 = [
  [['\u2591','\u2500'],['\u2500','\u2591']],
  [['\u2500','\u2591'],['\u2591','\u2500']],
];

const TEAR_LIGHT_METAL_3x3 = [
  [['\u2591','\u2500','\u2591'],['\u2500','\u2591','\u2500'],['\u2591','\u2500','\u2591']],
  [['\u2500','\u2591','\u2500'],['\u2591','\u2500','\u2591'],['\u2500','\u2591','\u2500']],
];

const TEAR_DARK_METAL_2x2 = [
  [['\u2592','\u2550'],['\u2550','\u2592']],
  [['\u2550','\u2592'],['\u2592','\u2550']],
];

const TEAR_DARK_METAL_3x3 = [
  [['\u2592','\u2550','\u2592'],['\u2550','\u2592','\u2550'],['\u2592','\u2550','\u2592']],
  [['\u2550','\u2592','\u2550'],['\u2592','\u2550','\u2592'],['\u2550','\u2592','\u2550']],
];

const TEAR_GRID_2x2 = [
  [['\u256C','\u2550'],['\u2551','\u256C']],
  [['\u2550','\u256C'],['\u256C','\u2551']],
];

const TEAR_GRID_3x3 = [
  [['\u256C','\u2550','\u256C'],['\u2551','\u256C','\u2551'],['\u256C','\u2550','\u256C']],
  [['\u2550','\u256C','\u2550'],['\u256C','\u2551','\u256C'],['\u2550','\u256C','\u2550']],
];

// ── Category → pattern mapping ──────────────────────

const TYPE_PATTERNS = {
  // Walls & solid structures
  WALL:           { 2: WALL_2x2, 3: WALL_3x3 },
  BUILDING_WALL:  { 2: WALL_2x2, 3: WALL_3x3 },
  MOSSY_WALL:     { 2: WALL_2x2, 3: WALL_3x3 },
  REACTOR_WALL:   { 2: WALL_2x2, 3: WALL_3x3 },
  MANUFACTORY_WALL: { 2: WALL_2x2, 3: WALL_3x3 },
  CLOCKWORK_WALL: { 2: WALL_2x2, 3: WALL_3x3 },
  PILLAR:         { 2: WALL_2x2, 3: WALL_3x3 },
  COLUMN:         { 2: WALL_2x2, 3: WALL_3x3 },

  // Floors & corridors
  FLOOR:          { 2: FLOOR_2x2, 3: FLOOR_3x3 },
  CORRIDOR:       { 2: FLOOR_2x2, 3: FLOOR_3x3 },
  MANUFACTORY_FLOOR: { 2: FLOOR_2x2, 3: FLOOR_3x3 },
  CLOCKWORK_FLOOR: { 2: FLOOR_2x2, 3: FLOOR_3x3 },
  SPORE_FLOOR:    { 2: FLOOR_2x2, 3: FLOOR_3x3 },
  CARPET:         { 2: FLOOR_2x2, 3: FLOOR_3x3 },
  RUG:            { 2: FLOOR_2x2, 3: FLOOR_3x3 },

  // Grassland / meadow
  GRASSLAND:      { 2: GRASS_2x2, 3: GRASS_3x3 },
  MEADOW:         { 2: MEADOW_2x2, 3: MEADOW_3x3 },
  TALL_GRASS:     { 2: TALL_GRASS_2x2, 3: TALL_GRASS_3x3 },
  SCRUBLAND:      { 2: GRASS_2x2, 3: GRASS_3x3 },
  BARREN_WASTE:   { 2: GRASS_2x2, 3: GRASS_3x3 },
  FIELD:          { 2: GRASS_2x2, 3: GRASS_3x3 },
  GARDEN:         { 2: MEADOW_2x2, 3: MEADOW_3x3 },
  FLOWER_BED:     { 2: MEADOW_2x2, 3: MEADOW_3x3 },

  // Forest / trees
  FOREST:         { 2: TREE_2x2, 3: TREE_3x3 },
  DEEP_FOREST:    { 2: DEEP_FOREST_2x2, 3: DEEP_FOREST_3x3 },
  SPARSE_TREES:   { 2: SPARSE_TREE_2x2, 3: SPARSE_TREE_3x3 },
  CANOPY:         { 2: DEEP_FOREST_2x2, 3: DEEP_FOREST_3x3 },
  PINE_STAND:     { 2: TREE_2x2, 3: TREE_3x3 },
  TREE:           { 2: TREE_2x2, 3: TREE_3x3 },
  TREE_CANOPY:    { 2: DEEP_FOREST_2x2, 3: DEEP_FOREST_3x3 },
  TREE_TRUNK:     { 2: SPARSE_TREE_2x2, 3: SPARSE_TREE_3x3 },
  BUSH:           { 2: SPARSE_TREE_2x2, 3: SPARSE_TREE_3x3 },
  HYDRO_JUNGLE:   { 2: DEEP_FOREST_2x2, 3: DEEP_FOREST_3x3 },

  // Water (depth gradient)
  RIVER_WATER:    { 2: WATER_2x2, 3: WATER_3x3 },

  // Shoreline
  INNER_SHORE:    { 2: GRASS_2x2, 3: GRASS_3x3 },
  OUTER_SHORE:    { 2: GRASS_2x2, 3: GRASS_3x3 },

  // Wetlands
  MIRE:           { 2: WATER_2x2, 3: WATER_3x3 },
  BOG:            { 2: WATER_2x2, 3: WATER_3x3 },
  MARSH_REEDS:    { 2: TALL_GRASS_2x2, 3: TALL_GRASS_3x3 },
  MUDFLAT:        { 2: GRASS_2x2, 3: GRASS_3x3 },
  SALT_FLAT:      { 2: GRASS_2x2, 3: GRASS_3x3 },
  DRY_RIVERBED:   { 2: GRASS_2x2, 3: GRASS_3x3 },
  TOXIC_SUMP:     { 2: WATER_2x2, 3: WATER_3x3 },

  // Mountains & rocks
  MOUNTAIN:       { 2: MOUNTAIN_2x2, 3: MOUNTAIN_3x3 },
  MOUNTAIN_BASE:  { 2: ROCK_2x2, 3: ROCK_3x3 },
  CRAG:           { 2: MOUNTAIN_2x2, 3: MOUNTAIN_3x3 },
  HIGH_PEAK:      { 2: MOUNTAIN_2x2, 3: MOUNTAIN_3x3 },
  SUMMIT:         { 2: MOUNTAIN_2x2, 3: MOUNTAIN_3x3 },
  SNOWCAP:        { 2: SNOW_2x2, 3: SNOW_3x3 },
  FROZEN_DECK:    { 2: SNOW_2x2, 3: SNOW_3x3 },
  BOULDER_FIELD:  { 2: ROCK_2x2, 3: ROCK_3x3 },
  ROCKY_SLOPE:    { 2: ROCK_2x2, 3: ROCK_3x3 },
  STALAGMITE:     { 2: ROCK_2x2, 3: ROCK_3x3 },
  STALACTITE:     { 2: ROCK_2x2, 3: ROCK_3x3 },
  RUBBLE:         { 2: ROCK_2x2, 3: ROCK_3x3 },
  ROCK:           { 2: ROCK_2x2, 3: ROCK_3x3 },

  // Hills
  FOOTHILL:       { 2: HILL_2x2, 3: HILL_3x3 },
  ROLLING_HILLS:  { 2: HILL_2x2, 3: HILL_3x3 },
  RIDGE:          { 2: HILL_2x2, 3: HILL_3x3 },
  HIGHLAND:       { 2: HILL_2x2, 3: HILL_3x3 },

  // Crystals / special minerals
  CRYSTAL:        { 2: CRYSTAL_2x2, 3: CRYSTAL_3x3 },
  CRYSTAL_ZONE:   { 2: CRYSTAL_2x2, 3: CRYSTAL_3x3 },

  // Lava / fire
  REACTOR_SLAG:   { 2: LAVA_2x2, 3: LAVA_3x3 },
  THERMAL_VENT:   { 2: LAVA_2x2, 3: LAVA_3x3 },

  // Doors
  DOOR:           { 2: DOOR_2x2, 3: DOOR_3x3 },
  PORTCULLIS:     { 2: DOOR_2x2, 3: DOOR_3x3 },
  CLOCKWORK_GATE: { 2: DOOR_2x2, 3: DOOR_3x3 },

  // Stairs
  STAIRS_UP:      { 2: STAIRS_2x2, 3: STAIRS_3x3 },
  STAIRS_DOWN:    { 2: STAIRS_2x2, 3: STAIRS_3x3 },

  // Roads & paths
  ROAD:           { 2: ROAD_2x2, 3: ROAD_3x3 },
  COBBLESTONE:    { 2: COBBLESTONE_2x2, 3: COBBLESTONE_3x3 },

  // Bridges
  BRIDGE:         { 2: BRIDGE_2x2, 3: BRIDGE_3x3 },
  BRIDGE_ENTRANCE:{ 2: DOOR_2x2, 3: DOOR_3x3 },
  BRIDGE_FLOOR:   { 2: FLOOR_2x2, 3: FLOOR_3x3 },
  BRIDGE_GATE:    { 2: WALL_2x2, 3: WALL_3x3 },
  BRIDGE_PIPE:    { 2: MECH_2x2, 3: MECH_3x3 },
  BROKEN_BRIDGE:  { 2: VOID_2x2, 3: VOID_3x3 },

  // Fences
  FENCE:          { 2: FENCE_2x2, 3: FENCE_3x3 },

  // Void / anomaly
  VOID:           { 2: VOID_2x2, 3: VOID_3x3 },
  VOID_RIFT:      { 2: VOID_2x2, 3: VOID_3x3 },
  GLITCH_ZONE:    { 2: VOID_2x2, 3: VOID_3x3 },
  ASSIMILATED:    { 2: VOID_2x2, 3: VOID_3x3 },
  HULL_BREACH:    { 2: VOID_2x2, 3: VOID_3x3 },
  NANO_PLAGUE:    { 2: VOID_2x2, 3: VOID_3x3 },

  // Mechanical / clockwork / pipes
  MECH_PIPE:      { 2: MECH_2x2, 3: MECH_3x3 },
  MECH_GEAR:      { 2: MECH_2x2, 3: MECH_3x3 },
  MECH_VALVE:     { 2: MECH_2x2, 3: MECH_3x3 },
  MECH_CONDUIT:   { 2: MECH_2x2, 3: MECH_3x3 },
  CLOCKWORK_GEAR: { 2: MECH_2x2, 3: MECH_3x3 },
  CLOCKWORK_FLYWHEEL: { 2: MECH_2x2, 3: MECH_3x3 },
  MANUFACTORY_GEAR: { 2: MECH_2x2, 3: MECH_3x3 },
  MANUFACTORY_CONVEYOR: { 2: MECH_2x2, 3: MECH_3x3 },
  PIPE_HORIZONTAL: { 2: MECH_2x2, 3: MECH_3x3 },
  PIPE_VERTICAL:  { 2: MECH_2x2, 3: MECH_3x3 },
  PIPE_JUNCTION:  { 2: MECH_2x2, 3: MECH_3x3 },
  PIPE_VALVE:     { 2: MECH_2x2, 3: MECH_3x3 },
  BORE_GEAR:      { 2: MECH_2x2, 3: MECH_3x3 },
  BORE_DRILL:     { 2: MECH_2x2, 3: MECH_3x3 },
  TURBINE_BLADE:  { 2: MECH_2x2, 3: MECH_3x3 },

  // Organic
  MOSS:           { 2: FUNGAL_2x2, 3: FUNGAL_3x3 },

  // Colony substructure tears
  TEAR_GRASS:       { 2: TEAR_GRASS_2x2, 3: TEAR_GRASS_3x3 },
  TEAR_DIRT:        { 2: TEAR_DIRT_2x2, 3: TEAR_DIRT_3x3 },
  TEAR_LIGHT_METAL: { 2: TEAR_LIGHT_METAL_2x2, 3: TEAR_LIGHT_METAL_3x3 },
  TEAR_DARK_METAL:  { 2: TEAR_DARK_METAL_2x2, 3: TEAR_DARK_METAL_3x3 },
  TEAR_GRID:        { 2: TEAR_GRID_2x2, 3: TEAR_GRID_3x3 },

  // ── O'Neill cylinder section tiles ──

  // Section walls (massive hull plating between sections)
  SECTION_WALL:        { 2: WALL_2x2, 3: WALL_3x3 },
  SECTION_WALL_DETAIL: { 2: WALL_2x2, 3: WALL_3x3 },
  SECTION_WALL_RIVET:  { 2: WALL_2x2, 3: WALL_3x3 },

  // Entrance frames, passages, doors, and gates (inter-habitat connections)
  ENTRANCE_FRAME:      { 2: WALL_2x2, 3: WALL_3x3 },
  ENTRANCE_PASSAGE:    { 2: FLOOR_2x2, 3: FLOOR_3x3 },
  ENTRANCE_DOOR_W:     { 2: ENTRANCE_DOOR_W_2x2, 3: ENTRANCE_DOOR_W_3x3 },
  ENTRANCE_DOOR_E:     { 2: ENTRANCE_DOOR_E_2x2, 3: ENTRANCE_DOOR_E_3x3 },
  ENTRANCE_GATE:       { 2: WALL_2x2, 3: WALL_3x3 },
  SPECIAL_ACCESS_DOOR_W: { 2: SPECIAL_DOOR_W_2x2, 3: SPECIAL_DOOR_W_3x3 },
  SPECIAL_ACCESS_DOOR_E: { 2: SPECIAL_DOOR_E_2x2, 3: SPECIAL_DOOR_E_3x3 },

  // Engineering space tiles (directional entrance + airlock doors)
  ENGINEERING_ENTRANCE_W: { 2: ENG_ENTRANCE_W_2x2, 3: ENG_ENTRANCE_W_3x3 },
  ENGINEERING_ENTRANCE_E: { 2: ENG_ENTRANCE_E_2x2, 3: ENG_ENTRANCE_E_3x3 },
  ENGINEERING_AIRLOCK_W:  { 2: ENG_AIRLOCK_W_2x2, 3: ENG_AIRLOCK_W_3x3 },
  ENGINEERING_AIRLOCK_E:  { 2: ENG_AIRLOCK_E_2x2, 3: ENG_AIRLOCK_E_3x3 },
  ENG_LIGHT:           { 2: FLOOR_2x2, 3: FLOOR_3x3 },
  ENG_DAMAGED_FLOOR:   { 2: FLOOR_2x2, 3: FLOOR_3x3 },
  ENG_SPARKING:        { 2: FLOOR_2x2, 3: FLOOR_3x3 },

  // Tower structures at chunk intersections
  TOWER_CORNER:        { 2: WALL_2x2, 3: WALL_3x3 },
  TOWER_WALL:          { 2: WALL_2x2, 3: WALL_3x3 },
  TOWER_SPIRE:         { 2: WALL_2x2, 3: WALL_3x3 },
  TOWER_FLOOR:         { 2: FLOOR_2x2, 3: FLOOR_3x3 },
  TOWER_DOOR:          { 2: DOOR_2x2, 3: DOOR_3x3 },

  // Inner hull engineering corridors
  HULL_CORRIDOR_WALL:  { 2: WALL_2x2, 3: WALL_3x3 },
  HULL_CATWALK:        { 2: FLOOR_2x2, 3: FLOOR_3x3 },
  HULL_FLOOR:          { 2: FLOOR_2x2, 3: FLOOR_3x3 },
  HULL_GRATING:        { 2: FLOOR_2x2, 3: FLOOR_3x3 },
  HULL_PIPE:           { 2: MECH_2x2, 3: MECH_3x3 },
  HULL_VALVE:          { 2: MECH_2x2, 3: MECH_3x3 },
  HULL_MACHINERY:      { 2: MECH_2x2, 3: MECH_3x3 },
  HULL_CONDUIT:        { 2: MECH_2x2, 3: MECH_3x3 },
  TRANSIT_PLATFORM:    { 2: FLOOR_2x2, 3: FLOOR_3x3 },

  // Facility tiles (C2 / ENG)
  FACILITY_WALL:       { 2: WALL_2x2, 3: WALL_3x3 },
  FACILITY_PANEL:      { 2: WALL_2x2, 3: WALL_3x3 },
  FACILITY_FLOOR:      { 2: FLOOR_2x2, 3: FLOOR_3x3 },
  FACILITY_CORRIDOR:   { 2: FLOOR_2x2, 3: FLOOR_3x3 },
  FACILITY_JUNCTION:   { 2: FLOOR_2x2, 3: FLOOR_3x3 },
  FACILITY_EQUIPMENT:  { 2: MECH_2x2, 3: MECH_3x3 },

  // Desert biome
  SAND:                { 2: GRASS_2x2, 3: GRASS_3x3 },
  DUNE:                { 2: GRASS_2x2, 3: GRASS_3x3 },
  SCRUB:               { 2: GRASS_2x2, 3: GRASS_3x3 },
  DESERT_ROCK:         { 2: ROCK_2x2, 3: ROCK_3x3 },
  MESA:                { 2: MOUNTAIN_2x2, 3: MOUNTAIN_3x3 },

  // Frozen biome
  SNOW_GROUND:         { 2: SNOW_2x2, 3: SNOW_3x3 },
  FROZEN_TREE:         { 2: TREE_2x2, 3: TREE_3x3 },
  DEAD_TREE:           { 2: SPARSE_TREE_2x2, 3: SPARSE_TREE_3x3 },
  ICE_ROCK:            { 2: ROCK_2x2, 3: ROCK_3x3 },
  ICE_FORMATION:       { 2: MOUNTAIN_2x2, 3: MOUNTAIN_3x3 },
  HULL_BREACH_ICE:     { 2: WALL_2x2, 3: WALL_3x3 },
  FROZEN_RIVER:        { 2: FLOOR_2x2, 3: FLOOR_3x3 },

  // Damaged biome
  DAMAGE_FIRE:         { 2: LAVA_2x2, 3: LAVA_3x3 },
  DAMAGE_GRID:         { 2: TEAR_GRID_2x2, 3: TEAR_GRID_3x3 },
  CRACKED_FLOOR:       { 2: FLOOR_2x2, 3: FLOOR_3x3 },
  DAMAGED_GRASS:       { 2: GRASS_2x2, 3: GRASS_3x3 },
  CHARRED_TREE:        { 2: SPARSE_TREE_2x2, 3: SPARSE_TREE_3x3 },

  // Vacuum biome
  VACUUM_VOID:         { 2: VOID_2x2, 3: VOID_3x3 },
  VACUUM_WRECKAGE:     { 2: ROCK_2x2, 3: ROCK_3x3 },
  VACUUM_DEBRIS:       { 2: VOID_2x2, 3: VOID_3x3 },
  SEALED_ROOM_WALL:    { 2: WALL_2x2, 3: WALL_3x3 },
  SEALED_ROOM_FLOOR:   { 2: FLOOR_2x2, 3: FLOOR_3x3 },
  ALIEN_GROWTH:        { 2: CRYSTAL_2x2, 3: CRYSTAL_3x3 },
  VOID_SPACE:          { 2: VOID_2x2, 3: VOID_3x3 },

  // Toxic swamp biome
  TOXIC_POOL:          { 2: WATER_2x2, 3: WATER_3x3 },
  TOXIC_MUD:           { 2: GRASS_2x2, 3: GRASS_3x3 },
  MUTANT_VINE:         { 2: TREE_2x2, 3: TREE_3x3 },
  TOXIC_THICKET:       { 2: DEEP_FOREST_2x2, 3: DEEP_FOREST_3x3 },
  TOXIC_GAS:           { 2: VOID_2x2, 3: VOID_3x3 },
  BIOLAB_RUIN:         { 2: WALL_2x2, 3: WALL_3x3 },
  CONTAINMENT_WALL:    { 2: WALL_2x2, 3: WALL_3x3 },

  // Overgrown biome
  VINE_FLOOR:          { 2: GRASS_2x2, 3: GRASS_3x3 },
  DENSE_JUNGLE:        { 2: DEEP_FOREST_2x2, 3: DEEP_FOREST_3x3 },
  GIANT_TREE:          { 2: DEEP_FOREST_2x2, 3: DEEP_FOREST_3x3 },
  OVERGROWN_WALL:      { 2: WALL_2x2, 3: WALL_3x3 },
  OVERGROWN_RUIN:      { 2: FLOOR_2x2, 3: FLOOR_3x3 },
};

// Simple hash for spatial variation
function tileHash(wx, wy) {
  return ((wx * 73856093) ^ (wy * 19349663)) >>> 0;
}

// ── Tile expansion LRU cache ──
// expandTile is deterministic for (type, density, wx, wy, char, fg, bg),
// so we cache results to avoid recomputing every frame.
const _tileCache = new Map();
const _TILE_CACHE_MAX = 8192;

export function clearTileCache() { _tileCache.clear(); }

/**
 * Expand a tile to an NxN grid of characters, colors, and backgrounds.
 * @param {object} tile - Tile object with type, char, fg, bg
 * @param {number} density - Zoom density level (1, 2, or 3)
 * @param {number} wx - World x coordinate (for spatial variation)
 * @param {number} wy - World y coordinate (for spatial variation)
 * @returns {{ chars: string[][], fgs: string[][], bgs: string[][] }}
 */
export function expandTile(tile, density, wx, wy) {
  if (density > 1) {
    const cacheKey = `${tile.type}:${density}:${wx}:${wy}:${tile.char}:${tile.fg}:${tile.bg || ''}`;
    const cached = _tileCache.get(cacheKey);
    if (cached) return cached;
    const result = _expandTileInner(tile, density, wx, wy);
    if (_tileCache.size >= _TILE_CACHE_MAX) {
      // Evict oldest quarter of entries
      const iter = _tileCache.keys();
      for (let i = 0; i < _TILE_CACHE_MAX / 4; i++) iter.next();
      // Delete from start up to iterator position
      let count = 0;
      for (const k of _tileCache.keys()) {
        if (count++ >= _TILE_CACHE_MAX / 4) break;
        _tileCache.delete(k);
      }
    }
    _tileCache.set(cacheKey, result);
    return result;
  }
  return _expandTileInner(tile, density, wx, wy);
}

function _expandTileInner(tile, density, wx, wy) {
  if (density === 1) {
    return {
      chars: [[tile.char]],
      fgs: [[tile.fg]],
      bgs: [[tile.bg || '#000000']],
    };
  }

  const patterns = TYPE_PATTERNS[tile.type];
  const variants = patterns ? patterns[density] : null;

  if (!variants || variants.length === 0) {
    // Fallback: fill NxN with the tile's own char
    return _fillUniform(tile, density);
  }

  // Pick variant based on world position
  const hash = tileHash(wx, wy);
  const variant = variants[hash % variants.length];

  const chars = [];
  const fgs = [];
  const bgs = [];
  const bg = tile.bg || '#000000';

  for (let dy = 0; dy < density; dy++) {
    const charRow = [];
    const fgRow = [];
    const bgRow = [];
    for (let dx = 0; dx < density; dx++) {
      const ch = variant[dy][dx];
      charRow.push(ch === null ? tile.char : ch);
      fgRow.push(tile.fg);
      bgRow.push(bg);
    }
    chars.push(charRow);
    fgs.push(fgRow);
    bgs.push(bgRow);
  }

  return { chars, fgs, bgs };
}

function _fillUniform(tile, density) {
  const chars = [];
  const fgs = [];
  const bgs = [];
  const bg = tile.bg || '#000000';
  for (let dy = 0; dy < density; dy++) {
    const charRow = [];
    const fgRow = [];
    const bgRow = [];
    for (let dx = 0; dx < density; dx++) {
      charRow.push(tile.char);
      fgRow.push(tile.fg);
      bgRow.push(bg);
    }
    chars.push(charRow);
    fgs.push(fgRow);
    bgs.push(bgRow);
  }
  return { chars, fgs, bgs };
}
