import Adw from "gi://Adw";
import type Gio from "gi://Gio";
import GObject from "gi://GObject";
import Gtk from "gi://Gtk";
import { getTemplate } from "../utils/getTemplate.js";
import { logger } from "../utils/logger.js";

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
            "statusAreaHPadding",
            "interactionMode",
            "autoHideEnabled",
            "autoHideDuration",
            "hoverHideOnLeave",
            "hoverDuration",
            "animationEnabled",
            "animateAllItems",
            "animationDuration",
            "loggingLevel",
            "journalctlCommand",
        ],
    },
    class GeneralPage extends Adw.PreferencesPage {
        declare _saveState: Adw.ComboRow;
        declare _defaultVisibility: Adw.ComboRow;
        declare _openIconRow: Adw.ActionRow;
        declare _closeIconRow: Adw.ActionRow;
        declare _openIconButton: Gtk.Button;
        declare _closeIconButton: Gtk.Button;
        declare _openIconClearButton: Gtk.Button;
        declare _closeIconClearButton: Gtk.Button;
        declare _statusAreaHPadding: Adw.SpinRow;
        declare _interactionMode: Adw.ComboRow;
        declare _autoHideEnabled: Adw.SwitchRow;
        declare _autoHideDuration: Adw.SpinRow;
        declare _hoverHideOnLeave: Adw.SwitchRow;
        declare _hoverDuration: Adw.SpinRow;
        declare _animationEnabled: Adw.SwitchRow;
        declare _animateAllItems: Adw.SwitchRow;
        declare _animationDuration: Adw.SpinRow;
        declare _loggingLevel: Adw.ComboRow;
        declare _journalctlCommand: Adw.EntryRow;

        private settings!: Gio.Settings;

        bindSettings(settings: Gio.Settings) {
            this.settings = settings;
            logger.debug("Settings bound to GeneralPage");

            // Bind save state combo
            const saveState = settings.get_boolean("save-state");
            this._saveState.set_selected(saveState ? 1 : 0);

            this._saveState.connect("notify::selected", () => {
                const selectedIndex = this._saveState.get_selected();
                settings.set_boolean("save-state", selectedIndex === 1);
                logger.debug("Save state changed", {
                    saveState: selectedIndex === 1,
                });
            });

            // Bind default visibility combo
            const defaultVisibility =
                settings.get_boolean("default-visibility");
            this._defaultVisibility.set_selected(defaultVisibility ? 0 : 1);

            this._defaultVisibility.connect("notify::selected", () => {
                const selectedIndex = this._defaultVisibility.get_selected();
                settings.set_boolean("default-visibility", selectedIndex === 0);
                logger.debug("Default visibility changed", {
                    visible: selectedIndex === 0,
                });
            });

            this.setupIconChooser(
                this._openIconButton,
                this._openIconClearButton,
                this._openIconRow,
                "custom-open-icon",
                "Icon shown when items are hidden",
            );

            this.setupIconChooser(
                this._closeIconButton,
                this._closeIconClearButton,
                this._closeIconRow,
                "custom-close-icon",
                "Icon shown when items are visible",
            );

            const statusHPadding = settings.get_int("status-area-h-padding");
            this._statusAreaHPadding.set_value(statusHPadding);
            this._statusAreaHPadding.connect("notify::value", () => {
                const value = this._statusAreaHPadding.get_value();
                settings.set_int("status-area-h-padding", value);
                logger.debug("Status area horizontal padding changed", {
                    value,
                });
            });

            // Bind interaction mode combo row
            const interactionMode = settings.get_string("interaction-mode");
            this._interactionMode.set_selected(
                interactionMode === "hover" ? 1 : 0,
            );

            const updateControlVisibility = () => {
                const selectedMode = this._interactionMode.get_selected();
                const isClickMode = selectedMode === 0;

                // Show auto-hide controls only in Click mode
                this._autoHideEnabled.set_visible(isClickMode);
                this._autoHideDuration.set_visible(isClickMode);

                // Show hover controls only in Hover mode
                this._hoverHideOnLeave.set_visible(!isClickMode);
                const hideOnLeaveEnabled = this._hoverHideOnLeave.get_active();
                this._hoverDuration.set_visible(
                    !isClickMode && !hideOnLeaveEnabled,
                );
            };

            this._interactionMode.connect("notify::selected", () => {
                const selectedIndex = this._interactionMode.get_selected();
                const mode = selectedIndex === 1 ? "hover" : "click";
                settings.set_string("interaction-mode", mode);
                updateControlVisibility();
                logger.debug("Interaction mode changed", { mode });
            });

            // Bind hover hide on leave switch
            const hoverHideOnLeave = settings.get_boolean(
                "hover-hide-on-leave",
            );
            this._hoverHideOnLeave.set_active(hoverHideOnLeave);

            this._hoverHideOnLeave.connect("notify::active", () => {
                const isActive = this._hoverHideOnLeave.get_active();
                settings.set_boolean("hover-hide-on-leave", isActive);
                updateControlVisibility();
                logger.debug("Hover hide on leave changed", {
                    enabled: isActive,
                });
            });

            // Bind auto-hide enabled switch
            const autoHideEnabled = settings.get_boolean("auto-hide-enabled");
            this._autoHideEnabled.set_active(autoHideEnabled);
            this._autoHideDuration.set_sensitive(autoHideEnabled);

            this._autoHideEnabled.connect("notify::active", () => {
                const isActive = this._autoHideEnabled.get_active();
                settings.set_boolean("auto-hide-enabled", isActive);
                this._autoHideDuration.set_sensitive(isActive);
                logger.debug("Auto-hide enabled changed", {
                    enabled: isActive,
                });
            });

            // Bind auto-hide duration spin row
            const autoHideDuration = settings.get_int("auto-hide-duration");
            this._autoHideDuration.set_value(autoHideDuration);

            this._autoHideDuration.connect("notify::value", () => {
                const value = this._autoHideDuration.get_value();
                settings.set_int("auto-hide-duration", value);
                logger.debug("Auto-hide duration changed", { duration: value });
            });

            // Bind hover duration spin row
            const hoverDuration = settings.get_int("hover-duration");
            this._hoverDuration.set_value(hoverDuration);

            this._hoverDuration.connect("notify::value", () => {
                const value = this._hoverDuration.get_value();
                settings.set_int("hover-duration", value);
                logger.debug("Hover duration changed", { duration: value });
            });

            // Set initial control visibility
            updateControlVisibility();

            // Bind animation enabled switch
            const animationEnabled = settings.get_boolean("animation-enabled");
            this._animationEnabled.set_active(animationEnabled);
            this._animationDuration.set_sensitive(animationEnabled);
            this._animateAllItems.set_sensitive(animationEnabled);
            // If animations disabled, ensure animateAllItems is also disabled
            if (!animationEnabled && this._animateAllItems.get_active()) {
                this._animateAllItems.set_active(false);
                settings.set_boolean("animate-all-items", false);
            }

            this._animationEnabled.connect("notify::active", () => {
                const isActive = this._animationEnabled.get_active();
                settings.set_boolean("animation-enabled", isActive);
                this._animationDuration.set_sensitive(isActive);
                this._animateAllItems.set_sensitive(isActive);
                if (!isActive && this._animateAllItems.get_active()) {
                    this._animateAllItems.set_active(false);
                    settings.set_boolean("animate-all-items", false);
                }
                logger.debug("Animation enabled changed", {
                    enabled: isActive,
                });
            });

            // Bind animation duration spin row
            const animationDuration = settings.get_int("animation-duration");
            this._animationDuration.set_value(animationDuration);

            this._animationDuration.connect("notify::value", () => {
                const value = this._animationDuration.get_value();
                settings.set_int("animation-duration", value);
                logger.debug("Animation duration changed", { duration: value });
            });

            // Bind animate all items switch
            const animateAllItems = settings.get_boolean("animate-all-items");
            this._animateAllItems.set_active(animateAllItems);

            this._animateAllItems.connect("notify::active", () => {
                const isActive = this._animateAllItems.get_active();
                settings.set_boolean("animate-all-items", isActive);
                logger.debug("Animate all items changed", {
                    enabled: isActive,
                });
            });

            // Bind logging level combo
            const loggingLevels = ["error", "warn", "info", "debug"];
            const currentLevel = settings.get_string("logging-level");
            const currentIndex = loggingLevels.indexOf(currentLevel);
            this._loggingLevel.set_selected(
                currentIndex >= 0 ? currentIndex : 2,
            ); // default to "info"

            this._loggingLevel.connect("notify::selected", () => {
                const level = loggingLevels[this._loggingLevel.get_selected()];
                if (level !== undefined) {
                    settings.set_string("logging-level", level);
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

                dialog.connect(
                    "response",
                    (_dialog: Gtk.Dialog, response: number) => {
                        if (response === Gtk.ResponseType.ACCEPT) {
                            const fileChooser =
                                _dialog as Gtk.FileChooserDialog;
                            const file = fileChooser.get_file();
                            if (file) {
                                const path = file.get_path();
                                if (path) {
                                    this.settings.set_string(settingsKey, path);
                                    updateSubtitle();
                                    logger.debug("Icon path updated", {
                                        key: settingsKey,
                                        path,
                                    });
                                }
                            }
                        }
                        dialog.destroy();
                    },
                );

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
