extends Node
## Global signal hub for decoupled inter-system communication.
## Systems emit and subscribe to signals here without knowing about each other.

# State machine
signal state_changed(old_state: int, new_state: int)
signal turn_advanced(turn_count: int)
signal transition_started(type: String)
signal transition_completed()

# Player
signal player_moved(position: Vector2i)
signal player_entered_location(location_id: String)
signal player_exited_location()
signal player_entered_dungeon(dungeon_data: Dictionary)
signal player_exited_dungeon()
signal player_died()
signal level_up(new_level: int)

# Combat
signal enemy_encountered(enemy_data: Dictionary)
signal enemy_defeated(enemy_data: Dictionary, xp: int, loot: Array)
signal combat_round_resolved(results: Dictionary)

# Items
signal item_picked_up(item: Dictionary)
signal item_used(item: Dictionary)
signal item_equipped(item: Dictionary, slot: String)
signal item_dropped(item: Dictionary)

# Quests
signal quest_accepted(quest_id: String)
signal quest_completed(quest_id: String)
signal quest_objective_updated(quest_id: String, objective_idx: int)

# Factions
signal faction_reputation_changed(faction_id: String, old_val: int, new_val: int)

# Dialogue
signal dialogue_started(npc_data: Dictionary)
signal dialogue_ended(npc_data: Dictionary)

# Shop
signal shop_opened(shop_data: Dictionary)
signal shop_closed()

# World
signal weather_changed(weather_type: String)
signal world_event_triggered(event_type: String, event_data: Dictionary)
signal section_entered(section_id: String)

# Lore
signal lore_discovered(category: String, text: String)

# UI
signal message_logged(text: String, color: Color)

# Save/Load
signal save_completed(slot: int)
signal load_completed(slot: int)
