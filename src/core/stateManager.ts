import type Gio from "gi://Gio";
import { logger } from "../utils/logger.js";

export class StateManager {
	private settings: Gio.Settings;
	private currentVisibility: boolean;
	private onVisibilityChangedCallback?: (visible: boolean) => void;

	constructor(settings: Gio.Settings) {
		this.settings = settings;
		this.currentVisibility = this.getInitialVisibility();
		logger.debug("StateManager initialized", {
			currentVisibility: this.currentVisibility,
		});
	}

	private getInitialVisibility(): boolean {
		const saveState = this.settings.get_boolean("save-state");
		if (saveState) {
			// If saving state, try to restore from settings
			// For now, default to true (visible) - we can add a saved-visibility key later if needed
			return true;
		} else {
			// Use default visibility setting
			return this.settings.get_boolean("default-visibility");
		}
	}

	getVisibility(): boolean {
		return this.currentVisibility;
	}

	toggleVisibility(): boolean {
		this.currentVisibility = !this.currentVisibility;
		this.saveVisibility();
		this.onVisibilityChangedCallback?.(this.currentVisibility);
		logger.debug("Visibility toggled", {
			newVisibility: this.currentVisibility,
		});
		return this.currentVisibility;
	}

	setVisibility(visible: boolean) {
		if (this.currentVisibility !== visible) {
			this.currentVisibility = visible;
			this.saveVisibility();
			this.onVisibilityChangedCallback?.(this.currentVisibility);
			logger.debug("Visibility set", { visible });
		}
	}

	private saveVisibility() {
		const saveState = this.settings.get_boolean("save-state");
		if (saveState) {
			// Save visibility state - we could add a saved-visibility key to schema if needed
			// For now, we'll rely on the visible-items list to determine state
			logger.debug("Visibility state saved", {
				visibility: this.currentVisibility,
			});
		}
	}

	getVisibleItems(): string[] {
		return this.settings.get_strv("visible-items");
	}

	setVisibleItems(items: string[]) {
		this.settings.set_strv("visible-items", items);
		logger.debug("Visible items updated", { count: items.length });
	}

	addVisibleItem(itemName: string) {
		const visibleItems = this.getVisibleItems();
		if (!visibleItems.includes(itemName)) {
			visibleItems.push(itemName);
			this.setVisibleItems(visibleItems);
		}
	}

	removeVisibleItem(itemName: string) {
		const visibleItems = this.getVisibleItems().filter(
			(item) => item !== itemName,
		);
		this.setVisibleItems(visibleItems);
	}

	toggleVisibleItem(itemName: string): boolean {
		const visibleItems = this.getVisibleItems();
		const index = visibleItems.indexOf(itemName);
		if (index >= 0) {
			visibleItems.splice(index, 1);
			this.setVisibleItems(visibleItems);
			return false; // Item is now hidden
		} else {
			visibleItems.push(itemName);
			this.setVisibleItems(visibleItems);
			return true; // Item is now visible
		}
	}

	clearVisibleItems() {
		this.setVisibleItems([]);
		logger.debug("Visible items cleared");
	}

	cleanOrphanedItems(allItems: string[]) {
		const visibleItems = this.getVisibleItems();
		const cleaned = visibleItems.filter((item) => allItems.includes(item));
		if (cleaned.length !== visibleItems.length) {
			this.setVisibleItems(cleaned);
			logger.debug("Cleaned orphaned items", {
				before: visibleItems.length,
				after: cleaned.length,
			});
		}
		return cleaned.length !== visibleItems.length;
	}

	setOnVisibilityChanged(callback: (visible: boolean) => void) {
		this.onVisibilityChangedCallback = callback;
	}

	// Handle settings changes
	onSaveStateChanged() {
		// If save-state is disabled, reset to default visibility
		const saveState = this.settings.get_boolean("save-state");
		if (!saveState) {
			const defaultVisibility = this.settings.get_boolean("default-visibility");
			this.setVisibility(defaultVisibility);
		}
	}

	onDefaultVisibilityChanged() {
		// If save-state is disabled, update to new default
		const saveState = this.settings.get_boolean("save-state");
		if (!saveState) {
			const defaultVisibility = this.settings.get_boolean("default-visibility");
			this.setVisibility(defaultVisibility);
		}
	}

	onVisibleItemsChanged() {
		// Notify that visible items list changed
		logger.debug("Visible items changed");
		this.onVisibilityChangedCallback?.(this.currentVisibility);
	}
}
