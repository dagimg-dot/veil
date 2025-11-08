import Adw from "gi://Adw";
import type Gio from "gi://Gio";
import GObject from "gi://GObject";
import { getTemplate } from "../utils/getTemplate.js";
import { logger } from "../utils/logger.js";

export interface GeneralPageChildren {
	_loggingLevel: Adw.ComboRow;
	_journalctlCommand: Adw.EntryRow;
}

export const GeneralPage = GObject.registerClass(
	{
		GTypeName: "VeilGeneralPage",
		Template: getTemplate("GeneralPage"),
		InternalChildren: ["loggingLevel", "journalctlCommand"],
	},
	class GeneralPage extends Adw.PreferencesPage {
		private settings!: Gio.Settings;

		bindSettings(settings: Gio.Settings) {
			this.settings = settings;
			const children = this as unknown as GeneralPageChildren;
			logger.debug("Settings bound to GeneralPage");

			// Bind logging level combo
			const loggingLevels = ["error", "warn", "info", "debug"];
			const currentLevel = settings.get_string("logging-level");
			const currentIndex = loggingLevels.indexOf(currentLevel);
			children._loggingLevel.set_selected(currentIndex >= 0 ? currentIndex : 2); // default to "info"

			children._loggingLevel.connect("notify::selected", () => {
				const selectedIndex = children._loggingLevel.get_selected();
				if (selectedIndex >= 0 && selectedIndex < loggingLevels.length) {
					settings.set_string("logging-level", loggingLevels[selectedIndex]);
				}
			});
		}
	},
);
