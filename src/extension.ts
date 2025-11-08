import type Gio from "gi://Gio";
import { Extension } from "resource:///org/gnome/shell/extensions/extension.js";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import { VeilIndicator } from "./components/indicator.js";
import { PanelManager } from "./core/panelManager.js";
import { QuickSettingsManager } from "./core/quickSettingsManager.js";
import { StateManager } from "./core/stateManager.js";
import { initializeLogger, logger } from "./utils/logger.js";

export default class Veil extends Extension {
	private indicator!: VeilIndicator | null;
	private settings!: Gio.Settings | null;
	private panelManager!: PanelManager | null;
	private stateManager!: StateManager | null;
	private quickSettingsManager!: QuickSettingsManager | null;
	private settingsHandlers: number[] = [];

	enable() {
		logger.info("Veil extension enabled");

		this.settings = this.getSettings();
		initializeLogger(this.settings);

		this.stateManager = new StateManager(this.settings);
		this.quickSettingsManager = new QuickSettingsManager(this.settings);
		this.quickSettingsManager.setStateManager(this.stateManager);

		this.indicator = new VeilIndicator(this, this.settings);
		this.indicator.setQuickSettingsManager(this.quickSettingsManager);

		const indicatorButton = this.indicator.getButton();

		// Position indicator using the QuickSettingsManager
		const indicatorPosition = this.indicator.getInitialPosition();

		Main.panel.addToStatusArea(
			"veil",
			indicatorButton,
			indicatorPosition,
			"right",
		);

		logger.debug("Veil indicator added to panel", {
			position: indicatorPosition,
		});

		// Reposition after adding to ensure correct placement
		this.indicator.reposition();

		this.panelManager = new PanelManager(this.settings, indicatorButton);

		this.indicator.setOnToggle(() => {
			this.handleToggle();
		});

		this.stateManager.setOnVisibilityChanged((visible) => {
			this.panelManager?.setVisibility(visible);
			this.indicator?.updateIcon(visible);

			this.quickSettingsManager?.updateVisibility(visible);
			this.indicator?.reposition();
		});

		this.panelManager.setOnItemsChanged((items) => {
			logger.debug("Panel items changed", { count: items.length });
			this.indicator?.reposition();
		});

		this.setupSettingsHandlers();

		const initialVisibility = this.stateManager.getVisibility();
		this.panelManager.setVisibility(initialVisibility);
		this.indicator.updateIcon(initialVisibility);

		this.quickSettingsManager?.updateVisibility(initialVisibility);

		logger.info("Veil extension fully initialized");
	}

	private setupSettingsHandlers() {
		if (!this.settings) {
			logger.warn("Cannot setup settings handlers: settings not initialized");
			return;
		}

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

		this.settingsHandlers.push(
			this.settings.connect("changed::hide-quicksettings", () => {
				logger.debug("Hide Quick Settings setting changed");
				const currentVisibility = this.stateManager?.getVisibility() ?? true;
				this.quickSettingsManager?.updateVisibility(currentVisibility);
				this.indicator?.reposition();
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

	disable() {
		logger.info("Veil extension disabled");

		if (this.settings) {
			this.settingsHandlers.forEach((handlerId) => {
				this.settings?.disconnect(handlerId);
			});
			this.settingsHandlers = [];
		}

		this.quickSettingsManager?.restoreQuickSettings();

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

		if (this.quickSettingsManager) {
			this.quickSettingsManager = null;
		}

		this.settings = null;

		logger.info("Veil extension cleanup complete");
	}
}
