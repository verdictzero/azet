extends Node
## Game clock with day/night cycle.
## Ported from js/systems.js TimeSystem.
## 1 game hour = 30 real seconds.

signal hour_changed(hour: int)
signal day_changed(day: int)
signal time_of_day_changed(is_day: bool)

var hour: int = 8
var day: int = 1
var year: int = 1
var _accumulator: float = 0.0
# Overworld needs a live clock so the day/night shader pass actually moves.
# Menus / cutscenes can still toggle this to freeze time.
var paused: bool = false

const SECONDS_PER_HOUR: float = 30.0

# Time-of-day tint colors matching JS
const TIME_TINTS: Dictionary = {
	"dawn":      Color(0.9, 0.7, 0.5, 0.15),
	"morning":   Color(1.0, 1.0, 1.0, 0.0),
	"afternoon": Color(1.0, 0.95, 0.8, 0.05),
	"evening":   Color(0.8, 0.5, 0.3, 0.2),
	"night":     Color(0.2, 0.2, 0.5, 0.35),
}


func update_real_time(delta: float) -> void:
	if paused:
		return
	_accumulator += delta
	if _accumulator >= SECONDS_PER_HOUR:
		_accumulator -= SECONDS_PER_HOUR
		advance(1)


func advance(hours: int) -> void:
	var was_day: bool = is_daytime()
	hour += hours
	while hour >= 24:
		hour -= 24
		day += 1
		day_changed.emit(day)
		if day > 365:
			day = 1
			year += 1
	hour_changed.emit(hour)
	if is_daytime() != was_day:
		time_of_day_changed.emit(is_daytime())


func is_daytime() -> bool:
	return hour >= 6 and hour < 20


func get_time_of_day() -> String:
	if hour >= 5 and hour < 7:
		return "dawn"
	elif hour >= 7 and hour < 12:
		return "morning"
	elif hour >= 12 and hour < 17:
		return "afternoon"
	elif hour >= 17 and hour < 20:
		return "evening"
	else:
		return "night"


func get_time_tint() -> Color:
	return TIME_TINTS.get(get_time_of_day(), Color(1, 1, 1, 0))


func get_sun_angle_deg() -> float:
	## User-spec'd mapping: 0° = top = 12 PM, 90° = 3 PM, 180° = 12 AM,
	## 270° = 9 AM. Linear at 30°/hour → one full revolution in 12 hours.
	## Includes sub-hour fraction so the sun sweeps smoothly.
	var frac: float = _accumulator / SECONDS_PER_HOUR
	return fposmod((float(hour) + frac - 12.0) * 30.0, 360.0)


func get_sun_direction() -> Vector2:
	## Unit vector pointing TOWARD the sun in screen space (y-down).
	## 0° = (0, -1) = straight up. Rotates clockwise.
	var r: float = deg_to_rad(get_sun_angle_deg())
	return Vector2(sin(r), -cos(r))


func get_moon_direction() -> Vector2:
	## Moon is always 180° opposite the sun — gives the user-requested
	## "similar pattern with moonlight" for free: when the sun is below the
	## horizon the moon is above it, and vice versa.
	return -get_sun_direction()


func get_sun_intensity() -> float:
	## 1.0 at noon, 0.0 once the sun is below the horizon. Smooth ramp
	## around dawn/dusk (~6 AM / 6 PM).
	return smoothstep(0.0, 0.25, -get_sun_direction().y)


func get_moon_intensity() -> float:
	## Matches sun_intensity shape but muted — moonlight is dimmer than
	## sunlight and cooler (color is applied in the shader).
	return smoothstep(0.0, 0.25, -get_moon_direction().y) * 0.35


func get_day_factor() -> float:
	## 0 = deep night, 1 = noon. Drives the ambient day/night blend in
	## the shader.
	return get_sun_intensity()


func reset() -> void:
	hour = 8
	day = 1
	year = 1
	_accumulator = 0.0
