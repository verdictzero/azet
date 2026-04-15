// Shared per-cell ordered dithering helpers.
//
// Quantizes RGB to 12 levels per channel with an 8x8 Bayer matrix, intended
// for chunky fullblock 1:2 raster cells. The `cell` argument is the integer
// block index — different shaders pass it in different coordinate systems
// (per-pane local, or fullscreen global) and the dither pattern matches
// whatever space the caller is in.

const float BAYER[64] = {
	 0.0/64.0, 32.0/64.0,  8.0/64.0, 40.0/64.0,  2.0/64.0, 34.0/64.0, 10.0/64.0, 42.0/64.0,
	48.0/64.0, 16.0/64.0, 56.0/64.0, 24.0/64.0, 50.0/64.0, 18.0/64.0, 58.0/64.0, 26.0/64.0,
	12.0/64.0, 44.0/64.0,  4.0/64.0, 36.0/64.0, 14.0/64.0, 46.0/64.0,  6.0/64.0, 38.0/64.0,
	60.0/64.0, 28.0/64.0, 52.0/64.0, 20.0/64.0, 62.0/64.0, 30.0/64.0, 54.0/64.0, 22.0/64.0,
	 3.0/64.0, 35.0/64.0, 11.0/64.0, 43.0/64.0,  1.0/64.0, 33.0/64.0,  9.0/64.0, 41.0/64.0,
	51.0/64.0, 19.0/64.0, 59.0/64.0, 27.0/64.0, 49.0/64.0, 17.0/64.0, 57.0/64.0, 25.0/64.0,
	15.0/64.0, 47.0/64.0,  7.0/64.0, 39.0/64.0, 13.0/64.0, 45.0/64.0,  5.0/64.0, 37.0/64.0,
	63.0/64.0, 31.0/64.0, 55.0/64.0, 23.0/64.0, 61.0/64.0, 29.0/64.0, 53.0/64.0, 21.0/64.0
};

vec3 dither12(vec3 color, vec2 cell) {
	int bx = int(mod(cell.x, 8.0));
	int by = int(mod(cell.y, 8.0));
	float t = BAYER[by * 8 + bx];
	float s = 1.0 / 11.0;
	vec3 lo = floor(color / s) * s;
	vec3 f = (color - lo) / s;
	return lo + s * step(vec3(t), f);
}

vec3 dither32(vec3 color, vec2 cell) {
	int bx = int(mod(cell.x, 8.0));
	int by = int(mod(cell.y, 8.0));
	float t = BAYER[by * 8 + bx];
	float s = 1.0 / 31.0;
	vec3 lo = floor(color / s) * s;
	vec3 f = (color - lo) / s;
	return lo + s * step(vec3(t), f);
}

vec3 dither8(vec3 color, vec2 cell) {
	int bx = int(mod(cell.x, 8.0));
	int by = int(mod(cell.y, 8.0));
	float t = BAYER[by * 8 + bx];
	float s = 1.0 / 7.0;
	vec3 lo = floor(color / s) * s;
	vec3 f = (color - lo) / s;
	return lo + s * step(vec3(t), f);
}

vec3 dither4(vec3 color, vec2 cell) {
	int bx = int(mod(cell.x, 8.0));
	int by = int(mod(cell.y, 8.0));
	float t = BAYER[by * 8 + bx];
	float s = 1.0 / 3.0;
	vec3 lo = floor(color / s) * s;
	vec3 f = (color - lo) / s;
	return lo + s * step(vec3(t), f);
}

const float BAYER2[4] = {
	0.0/4.0, 2.0/4.0,
	3.0/4.0, 1.0/4.0
};

vec3 dither2(vec3 color, vec2 cell) {
	int bx = int(mod(cell.x, 2.0));
	int by = int(mod(cell.y, 2.0));
	float t = BAYER2[by * 2 + bx];
	return step(vec3(t), color);
}

vec3 dither8_2x2(vec3 color, vec2 cell) {
	int bx = int(mod(cell.x, 2.0));
	int by = int(mod(cell.y, 2.0));
	float t = BAYER2[by * 2 + bx];
	float s = 1.0 / 7.0;
	vec3 lo = floor(color / s) * s;
	vec3 f = (color - lo) / s;
	return lo + s * step(vec3(t), f);
}
