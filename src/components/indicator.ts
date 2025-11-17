import Clutter from "gi://Clutter";
import type Gio from "gi://Gio";
import St from "gi://St";
import type { Extension } from "resource:///org/gnome/shell/extensions/extension.js";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import * as PanelMenu from "resource:///org/gnome/shell/ui/panelMenu.js";
import * as PopupMenu from "resource:///org/gnome/shell/ui/popupMenu.js";
import { Icons } from "../lib/icons.js";
import { MainPanel } from "../types/index.js";
import { logger } from "../utils/logger.js";

export class VeilIndicator {
	private indicator: PanelMenu.Button;
	private extension: Extension;
	private iconWidget: St.Icon | null = null;
	private onToggleCallback?: () => void;
	private settings: Gio.Settings;

	constructor(extension: Extension, settings: Gio.Settings) {
		this.extension = extension;
		this.settings = settings;
		this.indicator = new PanelMenu.Button(0, "Veil");
		this.setupUI();
		this.setupMenu();
		this.setupClickHandler();
	}

	private setupUI() {
		new Icons(this.extension.path, this.settings);
		this.updateIcon(true);
	}

	private setupClickHandler() {
		this.indicator.connect("button-press-event", (_actor, event) => {
			const button = event.get_button();

			if (button === Clutter.BUTTON_PRIMARY) {
				logger.debug("Primary click on Veil indicator");

				this.onToggleCallback?.();

				if (this.indicator.menu) {
					this.indicator.menu.close();
				}
			}
		});

		// Add touch support
		this.indicator.connect("touch-event", (_actor, event) => {
			const eventType = event.type();

			if (eventType === Clutter.EventType.TOUCH_BEGIN) {
				logger.debug("Touch begin on Veil indicator");

				this.onToggleCallback?.();

				if (this.indicator.menu) {
					this.indicator.menu.close();
				}
			}
		});
	}

	private setupMenu() {
		const settingsItem = new PopupMenu.PopupMenuItem("Settings");
		settingsItem.connect("activate", () => {
			logger.debug("Opening Veil preferences");
			this.extension.openPreferences();
		});

		if (this.indicator.menu && "addMenuItem" in this.indicator.menu) {
			this.indicator.menu.addMenuItem(settingsItem);
		}
	}

	updateIcon(isVisible: boolean) {
		if (this.iconWidget) {
			this.indicator.remove_child(this.iconWidget);
			this.iconWidget = null;
		}

		// left-arrow = show (items visible), right-arrow = hide (items hidden)
		const iconName = isVisible ? "arrow-close" : "arrow-open";
		const veilIcon = Icons.get(iconName);

		if (veilIcon) {
			this.iconWidget = new St.Icon({
				gicon: veilIcon,
				style_class: "system-status-icon",
			});

			this.indicator.add_child(this.iconWidget);
			logger.debug("Icon updated", { iconName, isVisible });
		}
	}

	getIndicatorPosition(): number {
		const rightBoxItems = MainPanel._rightBox.get_children();

		for (let index = 0; index < rightBoxItems.length; index++) {
			const item = rightBoxItems[index];

			if (item.firstChild === Main.panel.statusArea.quickSettings) {
				// Return the position of Quick Settings so indicator goes before it
				return index;
			}
		}

		// Fallback: if Quick Settings not found, put at the end
		return rightBoxItems.length;
	}

	repositionIndicator() {
		const indicatorButton = this.indicator;
		const container = indicatorButton.get_parent();

		if (!container) return;

		// Find Quick Settings position, accounting for our indicator being in the list
		const rightBoxItems = MainPanel._rightBox.get_children();

		let quickSettingsIndex = -1;

		for (let index = 0; index < rightBoxItems.length; index++) {
			const item = rightBoxItems[index];

			if (item.firstChild === Main.panel.statusArea.quickSettings) {
				quickSettingsIndex = index;
				break;
			}
		}

		if (quickSettingsIndex === -1) {
			logger.warn("Could not find Quick Settings for repositioning");
			return;
		}

		// Move indicator to be right before Quick Settings
		MainPanel._rightBox.set_child_at_index(
			container,
			Math.max(0, quickSettingsIndex - 1),
		);

		logger.debug("Indicator repositioned", { position: quickSettingsIndex });
	}

	setOnToggle(callback: () => void) {
		this.onToggleCallback = callback;
	}

	getButton(): PanelMenu.Button {
		return this.indicator;
	}

	destroy() {
		if (this.indicator) {
			this.indicator.destroy();
		}
	}
}
