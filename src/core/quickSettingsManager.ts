import type Gio from "gi://Gio";
import type St from "gi://St";
import { MainPanel } from "../types/index.js";
import { logger } from "../utils/logger.js";

export class QuickSettingsManager {
	private settings: Gio.Settings;
	private stateManager: { getVisibility: () => boolean } | null = null;

	constructor(settings: Gio.Settings) {
		this.settings = settings;
	}

	setStateManager(stateManager: { getVisibility: () => boolean }) {
		this.stateManager = stateManager;
	}

	getQuickSettingsContainer(): St.Widget | null {
		const rightBoxItems = MainPanel._rightBox.get_children();

		for (let index = 0; index < rightBoxItems.length; index++) {
			const item = rightBoxItems[index];

			if (item.firstChild === MainPanel.statusArea.quickSettings) {
				return item as St.Widget;
			}
		}

		return null;
	}

	updateVisibility(itemsVisible?: boolean) {
		const hideQuickSettings = this.settings.get_boolean("hide-quicksettings");
		const quickSettingsContainer = this.getQuickSettingsContainer();

		if (!quickSettingsContainer) {
			logger.warn("Quick Settings container not found");
			return;
		}

		// If hide-quicksettings is enabled, Quick Settings visibility follows the toggle state
		// When items are visible, Quick Settings is visible; when items are hidden, Quick Settings is hidden
		if (hideQuickSettings) {
			// If itemsVisible is not provided, get current state
			if (itemsVisible === undefined) {
				itemsVisible = this.stateManager?.getVisibility() ?? true;
			}
			quickSettingsContainer.visible = itemsVisible;
		} else {
			// If hide-quicksettings is disabled, always show Quick Settings
			quickSettingsContainer.visible = true;
		}

		logger.debug("Quick Settings visibility updated", {
			hideQuickSettingsEnabled: hideQuickSettings,
			itemsVisible: itemsVisible ?? this.stateManager?.getVisibility() ?? true,
			quickSettingsVisible: quickSettingsContainer.visible,
		});
	}

	getIndicatorPosition(): number {
		const hideQuickSettings = this.settings.get_boolean("hide-quicksettings");

		// If hide-quicksettings is enabled, put indicator at the very end (which is visually first in GNOME Shell panel)
		if (hideQuickSettings) {
			// Get the actual number of children to position at the end
			const rightBoxItems = MainPanel._rightBox.get_children();
			return rightBoxItems.length; // This will add it at the end, which appears first visually
		}

		// Otherwise, position before Quick Settings as usual
		const rightBoxItems = MainPanel._rightBox.get_children();

		for (let index = 0; index < rightBoxItems.length; index++) {
			const item = rightBoxItems[index];

			if (item.firstChild === MainPanel.statusArea.quickSettings) {
				// Return the position of Quick Settings so indicator goes before it
				return index;
			}
		}

		// Fallback: if Quick Settings not found, put at the end
		return rightBoxItems.length;
	}

	repositionIndicator(indicatorButton: St.Widget): boolean {
		const container = indicatorButton.get_parent();

		if (!container) return false;

		const hideQuickSettings = this.settings.get_boolean("hide-quicksettings");
		const rightBoxItems = MainPanel._rightBox.get_children();

		if (hideQuickSettings) {
			// When hiding Quick Settings, indicator should be first (at the end of the list in GNOME Shell)
			// Find current position of container
			let currentIndex = -1;
			for (let i = 0; i < rightBoxItems.length; i++) {
				if (rightBoxItems[i] === container) {
					currentIndex = i;
					break;
				}
			}

			if (currentIndex === -1) {
				logger.warn("Container not found in rightBox");
				return false;
			}

			// Move to the last position (highest index) which appears first visually
			const lastIndex = rightBoxItems.length - 1;

			// Only move if not already at the last position
			if (currentIndex !== lastIndex) {
				MainPanel._rightBox.set_child_at_index(container, lastIndex);
				logger.debug(
					"Indicator repositioned to first position (hide-quicksettings enabled)",
					{
						fromIndex: currentIndex,
						toIndex: lastIndex,
						totalChildren: rightBoxItems.length,
					},
				);
				return true;
			}
			return false;
		}

		// Find Quick Settings position, accounting for our indicator being in the list
		let quickSettingsIndex = -1;

		for (let index = 0; index < rightBoxItems.length; index++) {
			const item = rightBoxItems[index];

			if (item.firstChild === MainPanel.statusArea.quickSettings) {
				quickSettingsIndex = index;
				break;
			}
		}

		if (quickSettingsIndex === -1) {
			logger.warn("Could not find Quick Settings for repositioning");
			return false;
		}

		// Find current position of container
		let currentIndex = -1;
		for (let i = 0; i < rightBoxItems.length; i++) {
			if (rightBoxItems[i] === container) {
				currentIndex = i;
				break;
			}
		}

		if (currentIndex === -1) {
			logger.warn("Container not found in rightBox");
			return false;
		}

		// Calculate target position (right before Quick Settings)
		const targetIndex = Math.max(0, quickSettingsIndex - 1);

		// Only move if not already at the target position
		if (currentIndex !== targetIndex) {
			MainPanel._rightBox.set_child_at_index(container, targetIndex);
			logger.debug("Indicator repositioned", {
				fromIndex: currentIndex,
				toIndex: targetIndex,
				quickSettingsIndex,
			});
			return true;
		}
		return false;
	}

	restoreQuickSettings() {
		const quickSettingsContainer = this.getQuickSettingsContainer();
		if (quickSettingsContainer) {
			quickSettingsContainer.visible = true;
			logger.debug("Quick Settings visibility restored");
		}
	}
}
