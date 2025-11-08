import Adw from "gi://Adw";
import Gdk from "gi://Gdk";
import type Gio from "gi://Gio";
import GObject from "gi://GObject";
import Gtk from "gi://Gtk";
import { getTemplate } from "../utils/getTemplate.js";
import { logger } from "../utils/logger.js";

export interface GeneralPageChildren {
	_saveState: Adw.ComboRow;
	_defaultVisibility: Adw.ComboRow;
	_hideQuickSettings: Adw.SwitchRow;
	_toggleShortcutRow: Adw.ActionRow;
	_toggleShortcutLabel: Gtk.ShortcutLabel;
	_toggleShortcutButton: Gtk.Button;
	_openIconRow: Adw.ActionRow;
	_closeIconRow: Adw.ActionRow;
	_openIconButton: Gtk.Button;
	_closeIconButton: Gtk.Button;
	_openIconClearButton: Gtk.Button;
	_closeIconClearButton: Gtk.Button;
	_autoHideEnabled: Adw.SwitchRow;
	_autoHideDuration: Adw.SpinRow;
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
			"hideQuickSettings",
			"toggleShortcutRow",
			"toggleShortcutLabel",
			"toggleShortcutButton",
			"openIconRow",
			"closeIconRow",
			"openIconButton",
			"closeIconButton",
			"openIconClearButton",
			"closeIconClearButton",
			"autoHideEnabled",
			"autoHideDuration",
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

			// Bind hide quick settings switch
			const hideQuickSettings = settings.get_boolean("hide-quicksettings");
			children._hideQuickSettings.set_active(hideQuickSettings);

			children._hideQuickSettings.connect("notify::active", () => {
				const isActive = children._hideQuickSettings.get_active();
				settings.set_boolean("hide-quicksettings", isActive);
				logger.debug("Hide Quick Settings changed", { enabled: isActive });
			});

			// Bind toggle shortcut
			this.setupShortcutEditor(
				children._toggleShortcutButton,
				children._toggleShortcutLabel,
				children._toggleShortcutRow,
				"toggle-shortcut",
			);

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

		private setupShortcutEditor(
			button: Gtk.Button,
			label: Gtk.ShortcutLabel,
			row: Adw.ActionRow,
			settingsKey: string,
		) {
			// Update label to show current shortcut
			const updateShortcutLabel = () => {
				const shortcuts = this.settings.get_strv(settingsKey);
				if (shortcuts && shortcuts.length > 0 && shortcuts[0]) {
					label.set_accelerator(shortcuts[0]);
					row.set_subtitle(`Current: ${shortcuts[0]}`);
				} else {
					label.set_accelerator("");
					row.set_subtitle("No shortcut set");
				}
			};

			// Initial update
			updateShortcutLabel();

			// Listen for settings changes
			this.settings.connect(`changed::${settingsKey}`, () => {
				updateShortcutLabel();
			});

			// Button click handler
			button.connect("clicked", () => {
				const dialog = new Gtk.Dialog({
					title: "Set Keyboard Shortcut",
					modal: true,
					transient_for: this.get_root() as Gtk.Window,
				});

				dialog.add_button("Cancel", Gtk.ResponseType.CANCEL);
				dialog.add_button("Clear", Gtk.ResponseType.REJECT);
				dialog.add_button("Set", Gtk.ResponseType.ACCEPT);

				const contentArea = dialog.get_content_area() as Gtk.Box;
				const label = new Gtk.Label({
					label:
						"Press your desired key combination...\n\nPress Escape to cancel.",
					justify: Gtk.Justification.CENTER,
					margin_top: 20,
					margin_bottom: 20,
					margin_start: 20,
					margin_end: 20,
				});
				contentArea.append(label);

				let capturedShortcut = "";

				// Handle key press events
				const keyController = new Gtk.EventControllerKey();
				keyController.connect(
					"key-pressed",
					(_controller, keyval, _keycode, state) => {
						// Ignore modifier keys alone
						if (
							[
								Gdk.KEY_Shift_L,
								Gdk.KEY_Shift_R,
								Gdk.KEY_Control_L,
								Gdk.KEY_Control_R,
								Gdk.KEY_Alt_L,
								Gdk.KEY_Alt_R,
								Gdk.KEY_Super_L,
								Gdk.KEY_Super_R,
								Gdk.KEY_Meta_L,
								Gdk.KEY_Meta_R,
							].includes(keyval)
						) {
							return Gdk.EVENT_PROPAGATE;
						}

						// Escape cancels
						if (keyval === Gdk.KEY_Escape) {
							dialog.response(Gtk.ResponseType.CANCEL);
							return Gdk.EVENT_STOP;
						}

						// Build accelerator string
						const accelerator = Gtk.accelerator_name(keyval, state);
						capturedShortcut = accelerator;
						label.set_label(
							`Shortcut: ${accelerator}\n\nPress Enter to confirm or Escape to cancel.`,
						);

						return Gdk.EVENT_STOP;
					},
				);

				contentArea.add_controller(keyController);

				// Handle Enter key for confirmation
				const enterController = new Gtk.EventControllerKey();
				enterController.connect(
					"key-pressed",
					(_controller, keyval, _keycode, _state) => {
						if (keyval === Gdk.KEY_Return && capturedShortcut) {
							dialog.response(Gtk.ResponseType.ACCEPT);
							return Gdk.EVENT_STOP;
						}
						return Gdk.EVENT_PROPAGATE;
					},
				);
				contentArea.add_controller(enterController);

				dialog.connect("response", (_dialog, response) => {
					if (response === Gtk.ResponseType.ACCEPT && capturedShortcut) {
						this.settings.set_strv(settingsKey, [capturedShortcut]);
						logger.debug("Shortcut updated", {
							key: settingsKey,
							shortcut: capturedShortcut,
						});
					} else if (response === Gtk.ResponseType.REJECT) {
						// Clear shortcut
						this.settings.set_strv(settingsKey, []);
						logger.debug("Shortcut cleared", { key: settingsKey });
					}
					dialog.destroy();
				});

				dialog.show();
			});
		}
	},
);
