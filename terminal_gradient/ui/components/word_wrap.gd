class_name WordWrap
extends RefCounted
## Text wrapping utility. Ported from js/engine.js wordWrap.

static func wrap(text: String, max_width: int) -> PackedStringArray:
	if text == "" or max_width <= 0:
		return PackedStringArray([""])

	var words: PackedStringArray = text.split(" ")
	var lines: PackedStringArray = PackedStringArray()
	var current: String = ""

	for word in words:
		if word.length() > max_width:
			if current != "":
				lines.append(current)
				current = ""
			# Break long word across lines
			var i := 0
			while i < word.length():
				lines.append(word.substr(i, max_width))
				i += max_width
		elif current.length() + word.length() + 1 <= max_width:
			if current != "":
				current += " "
			current += word
		else:
			if current != "":
				lines.append(current)
			current = word

	if current != "":
		lines.append(current)

	if lines.is_empty():
		return PackedStringArray([""])
	return lines
