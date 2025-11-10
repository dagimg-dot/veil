import type Gio from "gi://Gio";
import GLib from "gi://GLib";
import { logger } from "../utils/logger.js";

export class StateManager {
	private settings: Gio.Settings;
	private currentVisibility: boolean;
	private onVisibilityChangedCallback?: (visible: boolean) => void;
	private autoHideTimerId: number | null = null;

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
			return this.settings.get_boolean("saved-visibility");
		}
		return this.settings.get_boolean("default-visibility");
	}

	getVisibility(): boolean {
		return this.currentVisibility;
	}

	toggleVisibility(): boolean {
		this.currentVisibility = !this.currentVisibility;
		this.saveVisibility();
		this.handleAutoHideTimer();
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
			this.handleAutoHideTimer();
			this.onVisibilityChangedCallback?.(this.currentVisibility);
			logger.debug("Visibility set", { visible });
		}
	}

	private handleAutoHideTimer() {
		// Cancel existing timer if any
		this.cancelAutoHideTimer();

		// Start timer only when items are shown and auto-hide is enabledb
		if (this.currentVisibility) {
			const autoHideEnabled = this.settings.get_boolean("auto-hide-enabled");
			if (autoHideEnabled) {
				this.startAutoHideTimer();
			}
		}
	}

	private startAutoHideTimer() {
		this.cancelAutoHideTimer();
		const duration = this.settings.get_int("auto-hide-duration");
		logger.debug("Starting auto-hide timer", { duration });

		this.autoHideTimerId = GLib.timeout_add_seconds(
			GLib.PRIORITY_DEFAULT,
			duration,
			() => {
				logger.debug("Auto-hide timer expired, hiding items");
				this.autoHideTimerId = null;
				this.setVisibility(false);
				return GLib.SOURCE_REMOVE;
			},
		);
	}

	private cancelAutoHideTimer() {
		if (this.autoHideTimerId !== null) {
			logger.debug("Cancelling auto-hide timer");
			GLib.Source.remove(this.autoHideTimerId);
			this.autoHideTimerId = null;
		}
	}

	destroy() {
		this.cancelAutoHideTimer();
	}

	private saveVisibility() {
		const saveState = this.settings.get_boolean("save-state");
		if (saveState) {
			this.settings.set_boolean("saved-visibility", this.currentVisibility);

			logger.debug("Visibility state saved", {
				visibility: this.currentVisibility,
			});
		} else {
			this.settings.reset("saved-visibility");
			logger.debug("Visibility state reset to default");
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
			return false;
		} else {
			visibleItems.push(itemName);
			this.setVisibleItems(visibleItems);
			return true;
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

	onSaveStateChanged() {
		const saveState = this.settings.get_boolean("save-state");
		if (!saveState) {
			const defaultVisibility = this.settings.get_boolean("default-visibility");
			this.setVisibility(defaultVisibility);
		}
	}

	onDefaultVisibilityChanged() {
		const saveState = this.settings.get_boolean("save-state");
		if (!saveState) {
			const defaultVisibility = this.settings.get_boolean("default-visibility");
			this.setVisibility(defaultVisibility);
		}
	}

	onVisibleItemsChanged() {
		logger.debug("Visible items changed");
		this.onVisibilityChangedCallback?.(this.currentVisibility);
	}
}
