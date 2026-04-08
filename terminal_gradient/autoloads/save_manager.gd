extends Node
## Save/load system with XOR cipher for save file export.
## Ported from js/main.js save/load functions.
##
## IMPORTANT: The XOR cipher operates on raw bytes, not UTF-8 strings.
## JS uses btoa/atob (base64 of raw bytes). We must use Marshalls for
## binary-safe base64 encoding to maintain cross-platform compatibility.

const SAVE_CIPHER_KEY := "AETHEON-ASCIIQUEST-2024"
const SAVE_HEADER := "--- ASCIIQUEST SAVE FILE ---"
const SAVE_FOOTER := "--- END ASCIIQUEST SAVE ---"
const SAVE_DIR := "user://saves/"


func _ready() -> void:
	DirAccess.make_dir_recursive_absolute(SAVE_DIR)


func save_game(slot: int = 1, data: Dictionary = {}) -> bool:
	var json_str: String = JSON.stringify(data)
	var path: String = SAVE_DIR + "slot_%d.json" % slot
	var file := FileAccess.open(path, FileAccess.WRITE)
	if file == null:
		push_warning("SaveManager: Failed to open %s for writing" % path)
		return false
	file.store_string(json_str)
	file.close()
	EventBus.save_completed.emit(slot)
	return true


func load_game(slot: int = 1) -> Variant:
	var path: String = SAVE_DIR + "slot_%d.json" % slot
	if not FileAccess.file_exists(path):
		return null
	var file := FileAccess.open(path, FileAccess.READ)
	if file == null:
		return null
	var json_str: String = file.get_as_text()
	file.close()
	var json := JSON.new()
	var err := json.parse(json_str)
	if err != OK:
		push_warning("SaveManager: Failed to parse save file %s" % path)
		return null
	EventBus.load_completed.emit(slot)
	return json.data


func has_save(slot: int = 1) -> bool:
	return FileAccess.file_exists(SAVE_DIR + "slot_%d.json" % slot)


func delete_save(slot: int = 1) -> void:
	var path: String = SAVE_DIR + "slot_%d.json" % slot
	if FileAccess.file_exists(path):
		DirAccess.remove_absolute(path)


# ── Export/import for clipboard sharing (JS-compatible format) ──

func export_save_to_text(save_json: String) -> String:
	## XOR-cipher the JSON string and base64 encode for sharing.
	## Uses raw byte operations to match JS btoa/atob behavior.
	var input_bytes: PackedByteArray = save_json.to_utf8_buffer()
	var key_bytes: PackedByteArray = SAVE_CIPHER_KEY.to_utf8_buffer()
	var xored := PackedByteArray()
	xored.resize(input_bytes.size())
	for i in range(input_bytes.size()):
		xored[i] = input_bytes[i] ^ key_bytes[i % key_bytes.size()]
	var b64: String = Marshalls.raw_to_base64(xored)
	return "%s\n%s\n%s" % [SAVE_HEADER, b64, SAVE_FOOTER]


func import_save_from_text(text: String) -> Variant:
	## Decode a shared save file (base64 → XOR-decipher → JSON).
	var lines: PackedStringArray = text.strip_edges().split("\n")
	if lines.size() < 3:
		return null
	if lines[0].strip_edges() != SAVE_HEADER or lines[lines.size() - 1].strip_edges() != SAVE_FOOTER:
		return null

	var b64: String = ""
	for i in range(1, lines.size() - 1):
		b64 += lines[i].strip_edges()

	var xored: PackedByteArray = Marshalls.base64_to_raw(b64)
	if xored.is_empty():
		return null

	var key_bytes: PackedByteArray = SAVE_CIPHER_KEY.to_utf8_buffer()
	var decrypted := PackedByteArray()
	decrypted.resize(xored.size())
	for i in range(xored.size()):
		decrypted[i] = xored[i] ^ key_bytes[i % key_bytes.size()]

	var json_str: String = decrypted.get_string_from_utf8()
	var json := JSON.new()
	var err := json.parse(json_str)
	if err != OK:
		push_warning("SaveManager: Failed to parse imported save data")
		return null

	var data: Variant = json.data
	if data is Dictionary:
		if not data.has("seed") or not data.has("player") or not data.has("version"):
			return null
	return data
