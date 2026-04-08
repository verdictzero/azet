extends Node
## Music manager with dual-player crossfade.
## Ported from js/music.js MusicManager.

var current_track: String = ""
var volume: float = 0.5
var muted: bool = false
var crossfade_duration: float = 1.5

var _player_a: AudioStreamPlayer
var _player_b: AudioStreamPlayer
var _active_player: AudioStreamPlayer
var _crossfade_tween: Tween

const TRACKS := {
	"TITLE":           "res://assets/music/aq_title.ogg",
	"OVERWORLD_DAY":   "res://assets/music/aq_overworld_day.ogg",
	"OVERWORLD_NIGHT": "res://assets/music/aq_overworld_night.ogg",
	"TOWN_VAR1":       "res://assets/music/aq_town_var1.ogg",
	"TOWN_VAR2":       "res://assets/music/aq_town_var2.ogg",
	"TOWN_VAR3":       "res://assets/music/aq_town_var3.ogg",
	"RUINS_VAR1":      "res://assets/music/aq_ruins_var1.ogg",
	"RUINS_VAR2":      "res://assets/music/aq_ruins_var2.ogg",
	"BATTLE":          "res://assets/music/aq_battle.ogg",
	"BOSS_BATTLE":     "res://assets/music/aq_boss_battle.ogg",
	"FANFARE":         "res://assets/music/aq_fanfare.ogg",
}


func _ready() -> void:
	_player_a = AudioStreamPlayer.new()
	_player_b = AudioStreamPlayer.new()
	add_child(_player_a)
	add_child(_player_b)
	_active_player = _player_a


func play(track_key: String, loop: bool = true, fade_duration: float = -1.0) -> void:
	var path: String = TRACKS.get(track_key, "")
	if path == "" or path == current_track:
		return

	if not ResourceLoader.exists(path):
		push_warning("AudioManager: Track not found: %s" % path)
		return

	current_track = path
	var stream: AudioStream = load(path)
	if stream == null:
		return

	# Configure looping on the stream
	if stream is AudioStreamOggVorbis:
		stream.loop = loop
	elif stream is AudioStreamWAV:
		stream.loop_mode = AudioStreamWAV.LOOP_FORWARD if loop else AudioStreamWAV.LOOP_DISABLED

	var fade: float = fade_duration if fade_duration >= 0.0 else crossfade_duration
	var incoming: AudioStreamPlayer = _player_b if _active_player == _player_a else _player_a
	var outgoing: AudioStreamPlayer = _active_player

	incoming.stream = stream
	incoming.volume_db = -80.0
	incoming.play()

	if _crossfade_tween and _crossfade_tween.is_valid():
		_crossfade_tween.kill()

	_crossfade_tween = create_tween().set_parallel(true)
	var target_db: float = linear_to_db(volume) if not muted else -80.0
	_crossfade_tween.tween_property(incoming, "volume_db", target_db, fade)
	_crossfade_tween.tween_property(outgoing, "volume_db", -80.0, fade)
	_crossfade_tween.chain().tween_callback(outgoing.stop)

	_active_player = incoming


func stop(fade_out: bool = true) -> void:
	current_track = ""
	if fade_out:
		if _crossfade_tween and _crossfade_tween.is_valid():
			_crossfade_tween.kill()
		_crossfade_tween = create_tween()
		_crossfade_tween.tween_property(_active_player, "volume_db", -80.0, crossfade_duration)
		_crossfade_tween.chain().tween_callback(_active_player.stop)
	else:
		_active_player.stop()


func set_volume_level(v: float) -> void:
	volume = clampf(v, 0.0, 1.0)
	if not muted and _active_player.playing:
		_active_player.volume_db = linear_to_db(volume)


func toggle_mute() -> void:
	muted = not muted
	if muted:
		_active_player.volume_db = -80.0
	else:
		_active_player.volume_db = linear_to_db(volume)
