import type Gio from "gi://Gio";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import { logger } from "../utils/logger.js";

export class KeyboardManager {
	private settings: Gio.Settings;
	private onToggleCallback?: () => void;
	private keybindingName = "toggle-shortcut";

	constructor(settings: Gio.Settings) {
		this.settings = settings;
	}

	setOnToggle(callback: () => void) {
		this.onToggleCallback = callback;
	}

	registerShortcut() {
		if (Main.wm.addKeybinding) {
			Main.wm.addKeybinding(
				this.keybindingName,
				this.settings,
				0, // KeyBindingFlags.NONE
				3, // Shell.ActionMode.ALL
				() => {
					logger.debug("Keyboard shortcut activated");
					this.onToggleCallback?.();
				},
			);
			logger.debug("Keyboard shortcut registered", {
				key: this.keybindingName,
			});
		} else {
			logger.warn("Main.wm.addKeybinding not available");
		}
	}

	unregisterShortcut() {
		if (Main.wm.removeKeybinding) {
			Main.wm.removeKeybinding(this.keybindingName);
			logger.debug("Keyboard shortcut unregistered", {
				key: this.keybindingName,
			});
		}
	}
}
