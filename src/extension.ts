import type Gio from "gi://Gio";
import { Extension } from "resource:///org/gnome/shell/extensions/extension.js";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import { VeilIndicator } from "./components/indicator.js";
import { initializeLogger, logger } from "./utils/logger.js";

export default class Veil extends Extension {
	private indicator!: VeilIndicator | null;
	private settings!: Gio.Settings | null;

	enable() {
		logger.info("Veil extension enabled");

		this.settings = this.getSettings();

		initializeLogger(this.settings);

		this.indicator = new VeilIndicator(this);
		Main.panel.addToStatusArea("veil", this.indicator.getButton(), 0, "right");
	}

	disable() {
		if (this.indicator) {
			this.indicator.destroy();
			this.indicator = null;
		}
	}
}
