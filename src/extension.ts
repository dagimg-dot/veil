import type Gio from "gi://Gio";
import { Extension } from "resource:///org/gnome/shell/extensions/extension.js";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import { VeilIndicator } from "./components/indicator.js";
import { PanelManager } from "./core/panelManager.js";
import { StateManager } from "./core/stateManager.js";
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

		this.indicator = new VeilIndicator(this, this.settings);
		const indicatorButton = this.indicator.getButton();

		// Position indicator right before Quick Settings
		const indicatorPosition = this.indicator.getIndicatorPosition();

		Main.panel.addToStatusArea(
			"veil",
			indicatorButton,
			indicatorPosition,
			"right",
		);

		logger.debug("Veil indicator added to panel", {
			position: indicatorPosition,
		});

		this.panelManager = new PanelManager(
			this.settings,
			indicatorButton,
			this.stateManager,
		);

		this.indicator.setOnToggle(() => {
			this.handleToggle();
		});

		this.indicator.setOnHoverEnter(() => {
			this.handleHoverEnter();
		});

		this.indicator.setOnHoverLeave(() => {
			this.handleHoverLeave();
		});

		this.panelManager.setOnHoverComplete(() => {
			this.handleHoverComplete();
		});

		this.stateManager.setOnVisibilityChanged((visible) => {
			this.panelManager?.setVisibility(visible);
			this.indicator?.updateIcon(visible);
			// Reposition indicator after visibility changes
			this.indicator?.repositionIndicator();
		});

		this.panelManager.setOnItemsChanged((items) => {
			logger.debug("Panel items changed", { count: items.length });
			// Reposition indicator when items are added/removed
			this.indicator?.repositionIndicator();
		});

		this.setupSettingsHandlers();

		const initialVisibility = this.stateManager.getVisibility();
		this.panelManager.setVisibility(initialVisibility);
		this.indicator.updateIcon(initialVisibility);

		logger.info("Veil extension fully initialized");
	}

	private setupSettingsHandlers(): void {
		if (!this.settings) return;

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
	}

	private handleToggle() {
		if (!this.stateManager || !this.panelManager) {
			logger.warn("Cannot toggle: managers not initialized");
			return;
		}

		const newVisibility = this.stateManager.toggleVisibility();

		logger.debug("Visibility toggled", { newVisibility });
	}

	private handleHoverEnter() {
		if (!this.panelManager) {
			logger.warn("Cannot handle hover enter: panelManager not initialized");
			return;
		}

		this.panelManager.temporarilyShowItems();
		logger.debug("Hover enter: temporarily showing items");
	}

	private handleHoverLeave() {
		if (!this.panelManager) {
			logger.warn("Cannot handle hover leave: panelManager not initialized");
			return;
		}

		this.panelManager.temporarilyHideItemsWithDelay();
		logger.debug("Hover leave: scheduling hide with delay");
	}

	private handleHoverComplete() {
		if (!this.indicator) {
			logger.warn("Cannot handle hover complete: indicator not initialized");
			return;
		}

		// Restore icon to hidden state after hover completes
		this.indicator.restoreIconAfterHover();
		logger.debug("Hover complete: icon restored");
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
