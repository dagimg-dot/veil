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
	private indicator: PanelMenu.Button | null = null;
	private extension: Extension;
	private iconWidget: St.Icon | null = null;
	private onToggleCallback?: () => void;
	private onHoverEnterCallback?: () => void;
	private onHoverLeaveCallback?: () => void;
	private settings: Gio.Settings;
	private isHovering = false;
	private readonly indicatorSignalIds: number[] = [];

	constructor(extension: Extension, settings: Gio.Settings) {
		this.extension = extension;
		this.settings = settings;
		this.indicator = new PanelMenu.Button(0, "Veil");
		this.setupUI();
		this.setupMenu();
		this.setupClickHandler();
		this.setupHoverHandlers();
	}

	private get panelButton(): PanelMenu.Button {
		if (this.indicator === null) {
			throw new Error("VeilIndicator used after destroy");
		}
		return this.indicator;
	}

	private setupUI() {
		new Icons(this.extension.path, this.settings);
		this.updateIcon(true);
	}

	private setupClickHandler() {
		const btn = this.panelButton;
		this.indicatorSignalIds.push(
			btn.connect("button-press-event", (_actor, event) => {
				const button = event.get_button();

				if (button === Clutter.BUTTON_PRIMARY) {
					const interactionMode = this.settings.get_string("interaction-mode");

					// Only handle clicks in Click mode
					if (interactionMode === "click") {
						logger.debug("Primary click on Veil indicator");
						this.onToggleCallback?.();

						const menu = this.panelButton.menu;
						if (menu) {
							menu.close();
						}
					} else {
						logger.debug("Click ignored in Hover mode");
					}
				}
			}),
		);

		// Add touch support
		this.indicatorSignalIds.push(
			btn.connect("touch-event", (_actor, event) => {
				const eventType = event.type();

				if (eventType === Clutter.EventType.TOUCH_BEGIN) {
					const interactionMode = this.settings.get_string("interaction-mode");

					// Only handle touch in Click mode
					if (interactionMode === "click") {
						logger.debug("Touch begin on Veil indicator");
						this.onToggleCallback?.();

						const menu = this.panelButton.menu;
						if (menu) {
							menu.close();
						}
					} else {
						logger.debug("Touch ignored in Hover mode");
					}
				}
			}),
		);
	}

	private setupMenu() {
		const settingsItem = new PopupMenu.PopupMenuItem("Settings");
		settingsItem.connect("activate", () => {
			logger.debug("Opening Veil preferences");
			this.extension.openPreferences();
		});

		const menu = this.panelButton.menu;
		if (menu && "addMenuItem" in menu) {
			menu.addMenuItem(settingsItem);
		}
	}

	updateIcon(isVisible: boolean) {
		if (this.iconWidget) {
			this.panelButton.remove_child(this.iconWidget);
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

			this.panelButton.add_child(this.iconWidget);
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
		const indicatorButton = this.panelButton;
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

	private setupHoverHandlers() {
		const btn = this.panelButton;
		this.indicatorSignalIds.push(
			btn.connect("enter-event", () => {
				const interactionMode = this.settings.get_string("interaction-mode");

				// Only handle hover in Hover mode
				if (interactionMode === "hover") {
					this.isHovering = true;
					// Change icon to visible state during hover
					this.updateIcon(true);
					this.onHoverEnterCallback?.();
				}
				return Clutter.EVENT_PROPAGATE;
			}),
		);

		this.indicatorSignalIds.push(
			btn.connect("leave-event", () => {
				const interactionMode = this.settings.get_string("interaction-mode");

				// Only handle hover in Hover mode
				if (interactionMode === "hover") {
					this.isHovering = false;
					this.onHoverLeaveCallback?.();
				}
				return Clutter.EVENT_PROPAGATE;
			}),
		);
	}

	setOnToggle(callback: () => void) {
		this.onToggleCallback = callback;
	}

	setOnHoverEnter(callback: () => void) {
		this.onHoverEnterCallback = callback;
	}

	setOnHoverLeave(callback: () => void) {
		this.onHoverLeaveCallback = callback;
	}

	/** When a Shell menu closes without a matching leave-event (hover mode). */
	notifyHoverLeaveSyncFromMenu() {
		if (this.settings.get_string("interaction-mode") !== "hover") return;
		this.isHovering = false;
		this.onHoverLeaveCallback?.();
	}

	restoreIconAfterHover() {
		// Restore icon to hidden state after hover ends
		if (!this.isHovering) {
			this.updateIcon(false);
		}
	}

	getButton(): PanelMenu.Button {
		return this.panelButton;
	}

	destroy() {
		if (this.indicator) {
			for (const id of this.indicatorSignalIds) {
				this.indicator.disconnect(id);
			}
			this.indicatorSignalIds.length = 0;
		}
		if (this.iconWidget && this.indicator) {
			this.indicator.remove_child(this.iconWidget);
			this.iconWidget.destroy();
			this.iconWidget = null;
		}
		if (this.indicator) {
			this.indicator.destroy();
			this.indicator = null;
		}
	}
}
