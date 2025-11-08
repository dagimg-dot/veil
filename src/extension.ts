import type Gio from "gi://Gio";
import { Extension } from "resource:///org/gnome/shell/extensions/extension.js";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import { VeilIndicator } from "./components/indicator.js";
import { PanelManager } from "./core/panelManager.js";
import { StateManager } from "./core/stateManager.js";
import { MainPanel } from "./types/index.js";
import { initializeLogger, logger } from "./utils/logger.js";

export default class Veil extends Extension {
	private indicator!: VeilIndicator | null;
	private settings!: Gio.Settings | null;
	private panelManager!: PanelManager | null;
	private stateManager!: StateManager | null;
	private settingsHandlers: number[] = [];

	enable() {
		logger.info("Veil extension enabled");

		this.settings = this.getSettings();
		initializeLogger(this.settings);

		this.stateManager = new StateManager(this.settings);

		this.indicator = new VeilIndicator(this);
		const indicatorButton = this.indicator.getButton();

		// Position indicator right before Quick Settings
		const indicatorPosition = this.getIndicatorPosition();

		Main.panel.addToStatusArea(
			"veil",
			indicatorButton,
			indicatorPosition,
			"right",
		);

		logger.debug("Veil indicator added to panel", {
			position: indicatorPosition,
		});

		this.panelManager = new PanelManager(this.settings, indicatorButton);

		this.indicator.setOnToggle(() => {
			this.handleToggle();
		});

		this.stateManager.setOnVisibilityChanged((visible) => {
			this.panelManager?.setVisibility(visible);
			this.indicator?.updateIcon(visible);
			// Reposition indicator after visibility changes
			this.repositionIndicator();
		});

		this.panelManager.setOnItemsChanged((items) => {
			logger.debug("Panel items changed", { count: items.length });
			// Reposition indicator when items are added/removed
			this.repositionIndicator();
		});

		this.settingsHandlers.push(
			this.settings.connect("changed::save-state", () => {
				this.stateManager?.onSaveStateChanged();
			}),
		);
		this.settingsHandlers.push(
			this.settings.connect("changed::default-visibility", () => {
				this.stateManager?.onDefaultVisibilityChanged();
			}),
		);
		this.settingsHandlers.push(
			this.settings.connect("changed::visible-items", () => {
				this.stateManager?.onVisibleItemsChanged();

				if (this.stateManager) {
					this.panelManager?.setVisibility(this.stateManager.getVisibility());
				}
			}),
		);
		this.settingsHandlers.push(
			this.settings.connect("changed::auto-hide-enabled", () => {
				logger.debug("Auto-hide enabled setting changed");
			}),
		);
		this.settingsHandlers.push(
			this.settings.connect("changed::auto-hide-duration", () => {
				logger.debug("Auto-hide duration setting changed");
			}),
		);

		const initialVisibility = this.stateManager.getVisibility();
		this.panelManager.setVisibility(initialVisibility);
		this.indicator.updateIcon(initialVisibility);

		logger.info("Veil extension fully initialized");
	}

	private getIndicatorPosition(): number {
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

	private repositionIndicator() {
		if (!this.indicator) return;

		const indicatorButton = this.indicator.getButton();
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

	private handleToggle() {
		if (!this.stateManager || !this.panelManager) {
			logger.warn("Cannot toggle: managers not initialized");
			return;
		}

		const newVisibility = this.stateManager.toggleVisibility();

		logger.debug("Visibility toggled", { newVisibility });
	}

	disable() {
		logger.info("Veil extension disabled");

		if (this.settings) {
			this.settingsHandlers.forEach((handlerId) => {
				this.settings?.disconnect(handlerId);
			});
			this.settingsHandlers = [];
		}

		if (this.panelManager) {
			this.panelManager.showAllItems();
			this.panelManager.destroy();
			this.panelManager = null;
		}

		if (this.indicator) {
			this.indicator.destroy();
			this.indicator = null;
		}

		if (this.stateManager) {
			this.stateManager.destroy();
			this.stateManager = null;
		}

		this.settings = null;

		logger.info("Veil extension cleanup complete");
	}
}
