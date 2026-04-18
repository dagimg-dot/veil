import type Gio from "gi://Gio";
import GLib from "gi://GLib";
import { Extension } from "resource:///org/gnome/shell/extensions/extension.js";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import type { PopupMenu as ShellPopupMenu } from "resource:///org/gnome/shell/ui/popupMenu.js";
import { VeilIndicator } from "./components/indicator.js";
import { PanelManager } from "./core/panelManager.js";
import { StateManager } from "./core/stateManager.js";
import { StatusAreaHorizontalSpacing } from "./core/statusAreaHorizontalSpacing.js";
import { Icons } from "./lib/icons.js";
import { initializeLogger, logger } from "./utils/logger.js";

export default class Veil extends Extension {
	private indicator!: VeilIndicator | null;
	private settings!: Gio.Settings | null;
	private panelManager!: PanelManager | null;
	private stateManager!: StateManager | null;
	private statusAreaHorizontalSpacing: StatusAreaHorizontalSpacing | null =
		null;
	private settingsHandlers: number[] = [];
	private veilMenuOpenStateHandlerId: number | null = null;
	private readonly extensionIdleSourceIds: Set<number> = new Set();

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

		this.statusAreaHorizontalSpacing = new StatusAreaHorizontalSpacing(
			this.settings,
		);
		this.statusAreaHorizontalSpacing.enable();

		this.indicator.setOnToggle(() => {
			this.handleToggle();
		});

		this.indicator.setOnHoverEnter(() => {
			this.handleHoverEnter();
			this.panelManager?.setHoverInteractionZone("indicator");
		});

		this.indicator.setOnHoverLeave(() => {
			this.panelManager?.setHoverInteractionZone("none");
			this.handleHoverLeave();
		});

		this.panelManager.setOnPanelLeave(() => {
			this.handleHoverLeave();
		});

		this.panelManager.setOnHoverComplete(() => {
			this.handleHoverComplete();
		});

		const veilButton = this.indicator.getButton();
		const veilMenu = veilButton.menu as ShellPopupMenu | null;

		if (veilMenu) {
			this.veilMenuOpenStateHandlerId = veilMenu.connect(
				"open-state-changed",
				() => {
					if (veilMenu.isOpen) return undefined;

					this.runOnIdle(() => {
						if (this.settings?.get_string("interaction-mode") !== "hover") {
							return false;
						}

						const inside = this.panelManager?.pointerInHoverSafeZone() ?? false;

						if (!inside) {
							this.indicator?.notifyHoverLeaveSyncFromMenu();
						}

						return false;
					});

					return undefined;
				},
			);
		}

		this.stateManager.setOnPanelRevealChanged((revealed) => {
			this.panelManager?.setPermanentVisibility(revealed);
			this.indicator?.updateIcon(revealed);
			// Reposition indicator after visibility changes
			this.indicator?.repositionIndicator();
		});

		this.panelManager.setOnItemsChanged((items) => {
			logger.debug("Panel items changed", { count: items.length });
			// Reposition indicator when items are added/removed
			this.indicator?.repositionIndicator();
		});

		this.setupSettingsHandlers();

		const initiallyRevealed = this.stateManager.isPanelRevealed();
		this.panelManager.setPermanentVisibility(initiallyRevealed);
		this.indicator.updateIcon(initiallyRevealed);

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
					this.panelManager?.setPermanentVisibility(
						this.stateManager.isPanelRevealed(),
					);
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
			this.settings.connect("changed::interaction-mode", () => {
				const mode = this.settings?.get_string("interaction-mode");
				if (mode === "hover") {
					this.panelManager?.resetHoverStateForModeEntry();
					// Click-expanded tray has the same look as hover preview; leave would
					// "restore" to revealed=true and nothing would hide. Collapse so hover
					// teardown matches a real baseline.
					if (this.stateManager?.isPanelRevealed()) {
						this.stateManager.setPanelRevealed(false);
						logger.debug(
							"Switched to hover mode while expanded: collapsed for hover baseline",
						);
					}
				} else if (mode === "click") {
					this.panelManager?.resetHoverStateForModeEntry();
				}
			}),
		);
	}

	private handleToggle() {
		if (!this.stateManager || !this.panelManager) {
			logger.warn("Cannot toggle: managers not initialized");
			return;
		}

		const revealed = this.stateManager.togglePanelReveal();

		logger.debug("Panel reveal toggled", { revealed });
	}

	private handleHoverEnter() {
		if (!this.panelManager) {
			logger.warn("Cannot handle hover enter: panelManager not initialized");
			return;
		}

		this.panelManager.setTemporaryVisibility();
	}

	private handleHoverLeave() {
		if (!this.panelManager) {
			logger.warn("Cannot handle hover leave: panelManager not initialized");
			return;
		}

		if (this.settings?.get_string("interaction-mode") !== "hover") {
			return;
		}

		this.runOnIdle(() => {
			this.panelManager?.scheduleTemporaryHide();
			return false;
		});
	}

	private runOnIdle(handler: () => boolean): void {
		const id = GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
			this.extensionIdleSourceIds.delete(id);
			return handler();
		});
		this.extensionIdleSourceIds.add(id);
	}

	private handleHoverComplete() {
		if (!this.indicator) {
			logger.warn("Cannot handle hover complete: indicator not initialized");
			return;
		}

		// Restore icon to hidden state after hover completes
		this.indicator.restoreIconAfterHover();
	}

	disable() {
		logger.info("Veil extension disabled");

		for (const id of this.extensionIdleSourceIds) {
			GLib.Source.remove(id);
		}
		this.extensionIdleSourceIds.clear();

		if (this.statusAreaHorizontalSpacing) {
			this.statusAreaHorizontalSpacing.destroy();
			this.statusAreaHorizontalSpacing = null;
		}

		if (this.settings) {
			this.settingsHandlers.forEach((handlerId) => {
				this.settings?.disconnect(handlerId);
			});
			this.settingsHandlers = [];
			Icons.teardown(this.settings);
		}

		if (this.panelManager) {
			this.panelManager.showAllItems();
			this.panelManager.destroy();
			this.panelManager = null;
		}

		if (this.veilMenuOpenStateHandlerId !== null && this.indicator) {
			const menu = this.indicator.getButton().menu as ShellPopupMenu | null;
			if (menu) {
				menu.disconnect(this.veilMenuOpenStateHandlerId);
			}
			this.veilMenuOpenStateHandlerId = null;
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
