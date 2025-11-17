import Adw from "gi://Adw";
import type Gio from "gi://Gio";
import GObject from "gi://GObject";
import Gtk from "gi://Gtk";
import { getTemplate } from "../utils/getTemplate.js";
import { logger } from "../utils/logger.js";

export interface GeneralPageChildren {
	_saveState: Adw.ComboRow;
	_defaultVisibility: Adw.ComboRow;
	_openIconRow: Adw.ActionRow;
	_closeIconRow: Adw.ActionRow;
	_openIconButton: Gtk.Button;
	_closeIconButton: Gtk.Button;
	_openIconClearButton: Gtk.Button;
	_closeIconClearButton: Gtk.Button;
	_interactionMode: Adw.ComboRow;
	_autoHideEnabled: Adw.SwitchRow;
	_autoHideDuration: Adw.SpinRow;
	_hoverHideOnLeave: Adw.SwitchRow;
	_hoverDuration: Adw.SpinRow;
	_animationEnabled: Adw.SwitchRow;
	_animationDuration: Adw.SpinRow;
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
			"openIconRow",
			"closeIconRow",
			"openIconButton",
			"closeIconButton",
			"openIconClearButton",
			"closeIconClearButton",
			"interactionMode",
			"autoHideEnabled",
			"autoHideDuration",
			"hoverHideOnLeave",
			"hoverDuration",
			"animationEnabled",
			"animationDuration",
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

			this.setupIconChooser(
				children._openIconButton,
				children._openIconClearButton,
				children._openIconRow,
				"custom-open-icon",
				"Icon shown when items are hidden",
			);

			this.setupIconChooser(
				children._closeIconButton,
				children._closeIconClearButton,
				children._closeIconRow,
				"custom-close-icon",
				"Icon shown when items are visible",
			);

			// Bind interaction mode combo row
			const interactionMode = settings.get_string("interaction-mode");
			children._interactionMode.set_selected(
				interactionMode === "hover" ? 1 : 0,
			);

			const updateControlVisibility = () => {
				const selectedMode = children._interactionMode.get_selected();
				const isClickMode = selectedMode === 0;

				// Show auto-hide controls only in Click mode
				children._autoHideEnabled.set_visible(isClickMode);
				children._autoHideDuration.set_visible(isClickMode);

				// Show hover controls only in Hover mode
				children._hoverHideOnLeave.set_visible(!isClickMode);
				const hideOnLeaveEnabled = children._hoverHideOnLeave.get_active();
				children._hoverDuration.set_visible(
					!isClickMode && !hideOnLeaveEnabled,
				);
			};

			children._interactionMode.connect("notify::selected", () => {
				const selectedIndex = children._interactionMode.get_selected();
				const mode = selectedIndex === 1 ? "hover" : "click";
				settings.set_string("interaction-mode", mode);
				updateControlVisibility();
				logger.debug("Interaction mode changed", { mode });
			});

			// Bind hover hide on leave switch
			const hoverHideOnLeave = settings.get_boolean("hover-hide-on-leave");
			children._hoverHideOnLeave.set_active(hoverHideOnLeave);

			children._hoverHideOnLeave.connect("notify::active", () => {
				const isActive = children._hoverHideOnLeave.get_active();
				settings.set_boolean("hover-hide-on-leave", isActive);
				updateControlVisibility();
				logger.debug("Hover hide on leave changed", { enabled: isActive });
			});

			// Bind auto-hide enabled switch
			const autoHideEnabled = settings.get_boolean("auto-hide-enabled");
			children._autoHideEnabled.set_active(autoHideEnabled);
			children._autoHideDuration.set_sensitive(autoHideEnabled);

			children._autoHideEnabled.connect("notify::active", () => {
				const isActive = children._autoHideEnabled.get_active();
				settings.set_boolean("auto-hide-enabled", isActive);
				children._autoHideDuration.set_sensitive(isActive);
				logger.debug("Auto-hide enabled changed", { enabled: isActive });
			});

			// Bind auto-hide duration spin row
			const autoHideDuration = settings.get_int("auto-hide-duration");
			children._autoHideDuration.set_value(autoHideDuration);

			children._autoHideDuration.connect("notify::value", () => {
				const value = children._autoHideDuration.get_value();
				settings.set_int("auto-hide-duration", value);
				logger.debug("Auto-hide duration changed", { duration: value });
			});

			// Bind hover duration spin row
			const hoverDuration = settings.get_int("hover-duration");
			children._hoverDuration.set_value(hoverDuration);

			children._hoverDuration.connect("notify::value", () => {
				const value = children._hoverDuration.get_value();
				settings.set_int("hover-duration", value);
				logger.debug("Hover duration changed", { duration: value });
			});

			// Set initial control visibility
			updateControlVisibility();

			// Bind animation enabled switch
			const animationEnabled = settings.get_boolean("animation-enabled");
			children._animationEnabled.set_active(animationEnabled);
			children._animationDuration.set_sensitive(animationEnabled);

			children._animationEnabled.connect("notify::active", () => {
				const isActive = children._animationEnabled.get_active();
				settings.set_boolean("animation-enabled", isActive);
				children._animationDuration.set_sensitive(isActive);
				logger.debug("Animation enabled changed", { enabled: isActive });
			});

			// Bind animation duration spin row
			const animationDuration = settings.get_int("animation-duration");
			children._animationDuration.set_value(animationDuration);

			children._animationDuration.connect("notify::value", () => {
				const value = children._animationDuration.get_value();
				settings.set_int("animation-duration", value);
				logger.debug("Animation duration changed", { duration: value });
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

		private setupIconChooser(
			button: Gtk.Button,
			clearButton: Gtk.Button,
			row: Adw.ActionRow,
			settingsKey: string,
			defaultSubtitle: string,
		) {
			// Update subtitle to show current icon path
			const updateSubtitle = () => {
				const iconPath = this.settings.get_string(settingsKey);
				if (iconPath && iconPath.length > 0) {
					row.set_subtitle(iconPath);
				} else {
					row.set_subtitle(defaultSubtitle);
				}
			};

			// Initial update
			updateSubtitle();

			// File chooser button handler
			button.connect("clicked", () => {
				const dialog = new Gtk.FileChooserDialog({
					title: "Select Icon",
					action: Gtk.FileChooserAction.OPEN,
					modal: true,
					transient_for: this.get_root() as Gtk.Window,
				});

				dialog.add_button("Cancel", Gtk.ResponseType.CANCEL);
				dialog.add_button("Select", Gtk.ResponseType.ACCEPT);

				// Add SVG file filter
				const filter = new Gtk.FileFilter();
				filter.set_name("SVG Images");
				filter.add_mime_type("image/svg+xml");
				filter.add_pattern("*.svg");
				dialog.add_filter(filter);

				// Add "All Files" filter as fallback
				const allFilter = new Gtk.FileFilter();
				allFilter.set_name("All Files");
				allFilter.add_pattern("*");
				dialog.add_filter(allFilter);

				dialog.connect("response", (_dialog: Gtk.Dialog, response: number) => {
					if (response === Gtk.ResponseType.ACCEPT) {
						const fileChooser = _dialog as Gtk.FileChooserDialog;
						const file = fileChooser.get_file();
						if (file) {
							const path = file.get_path();
							if (path) {
								this.settings.set_string(settingsKey, path);
								updateSubtitle();
								logger.debug("Icon path updated", { key: settingsKey, path });
							}
						}
					}
					dialog.destroy();
				});

				dialog.show();
			});

			// Clear button handler
			clearButton.connect("clicked", () => {
				this.settings.set_string(settingsKey, "");
				updateSubtitle();
				logger.debug("Icon path cleared", { key: settingsKey });
			});
		}
	},
);
