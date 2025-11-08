import Adw from "gi://Adw";
import type Gio from "gi://Gio";
import GObject from "gi://GObject";
import { getTemplate } from "../utils/getTemplate.js";
import { logger } from "../utils/logger.js";

export interface GeneralPageChildren {
	_saveState: Adw.ComboRow;
	_defaultVisibility: Adw.ComboRow;
	_loggingLevel: Adw.ComboRow;
	_journalctlCommand: Adw.EntryRow;
}

export const GeneralPage = GObject.registerClass(
	{
		GTypeName: "VeilGeneralPage",
		Template: getTemplate("GeneralPage"),
		InternalChildren: [
			"saveState",
			"defaultVisibility",
			"loggingLevel",
			"journalctlCommand",
		],
	},
	class GeneralPage extends Adw.PreferencesPage {
		private settings!: Gio.Settings;

		bindSettings(settings: Gio.Settings) {
			this.settings = settings;
			const children = this as unknown as GeneralPageChildren;
			logger.debug("Settings bound to GeneralPage");

			// Bind save state combo
			const saveState = settings.get_boolean("save-state");
			children._saveState.set_selected(saveState ? 1 : 0);

			children._saveState.connect("notify::selected", () => {
				const selectedIndex = children._saveState.get_selected();
				settings.set_boolean("save-state", selectedIndex === 1);
				logger.debug("Save state changed", { saveState: selectedIndex === 1 });
			});

			// Bind default visibility combo
			const defaultVisibility = settings.get_boolean("default-visibility");
			children._defaultVisibility.set_selected(defaultVisibility ? 0 : 1);

			children._defaultVisibility.connect("notify::selected", () => {
				const selectedIndex = children._defaultVisibility.get_selected();
				settings.set_boolean("default-visibility", selectedIndex === 0);
				logger.debug("Default visibility changed", {
					visible: selectedIndex === 0,
				});
			});

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
