import type Gio from "gi://Gio";
import GLib from "gi://GLib";
import { logger } from "../utils/logger.js";

/**
 * Canonical "panel revealed" state: whether Veil is showing the expanded tray
 * (vs collapsed). Persists via GSettings when save-state is enabled.
 * Keys in the schema remain *-visibility for compatibility.
 */
export class StateManager {
	private settings: Gio.Settings;
	/** When true, the tray is expanded per user/saved preference (click mode, or baseline for hover). */
	private panelRevealed: boolean;
	private onPanelRevealChangedCallback?: (revealed: boolean) => void;
	private autoHideTimerId: number | null = null;

	constructor(settings: Gio.Settings) {
		this.settings = settings;
		this.panelRevealed = this.getInitialPanelRevealed();
		logger.debug("StateManager initialized", {
			panelRevealed: this.panelRevealed,
		});
	}

	private getInitialPanelRevealed(): boolean {
		const saveState = this.settings.get_boolean("save-state");
		if (saveState) {
			return this.settings.get_boolean("saved-visibility");
		}
		return this.settings.get_boolean("default-visibility");
	}

	isPanelRevealed(): boolean {
		return this.panelRevealed;
	}

	togglePanelReveal(): boolean {
		this.panelRevealed = !this.panelRevealed;
		this.savePanelRevealToSettings();
		this.handleAutoHideTimer();
		this.onPanelRevealChangedCallback?.(this.panelRevealed);
		logger.debug("Panel reveal toggled", {
			panelRevealed: this.panelRevealed,
		});
		return this.panelRevealed;
	}

	setPanelRevealed(revealed: boolean) {
		if (this.panelRevealed !== revealed) {
			this.panelRevealed = revealed;
			this.savePanelRevealToSettings();
			this.handleAutoHideTimer();
			this.onPanelRevealChangedCallback?.(this.panelRevealed);
			logger.debug("Panel reveal set", { revealed });
		}
	}

	private handleAutoHideTimer() {
		this.cancelAutoHideTimer();

		if (this.panelRevealed) {
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
				logger.debug("Auto-hide timer expired, collapsing tray");
				this.autoHideTimerId = null;
				this.setPanelRevealed(false);
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

	private savePanelRevealToSettings() {
		const saveState = this.settings.get_boolean("save-state");
		if (saveState) {
			this.settings.set_boolean("saved-visibility", this.panelRevealed);

			logger.debug("Panel reveal saved to settings", {
				panelRevealed: this.panelRevealed,
			});
		} else {
			this.settings.reset("saved-visibility");
			logger.debug("Saved visibility key reset (save-state off)");
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

	setOnPanelRevealChanged(callback: (revealed: boolean) => void) {
		this.onPanelRevealChangedCallback = callback;
	}

	onSaveStateChanged() {
		const saveState = this.settings.get_boolean("save-state");
		if (!saveState) {
			const defaultRevealed = this.settings.get_boolean("default-visibility");
			this.setPanelRevealed(defaultRevealed);
		}
	}

	onDefaultVisibilityChanged() {
		const saveState = this.settings.get_boolean("save-state");
		if (!saveState) {
			const defaultRevealed = this.settings.get_boolean("default-visibility");
			this.setPanelRevealed(defaultRevealed);
		}
	}

	onVisibleItemsChanged() {
		logger.debug("Visible items changed");
		this.onPanelRevealChangedCallback?.(this.panelRevealed);
	}
}
