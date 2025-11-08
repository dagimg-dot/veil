import type Clutter from "gi://Clutter";
import type Gio from "gi://Gio";
import type St from "gi://St";
import type * as PanelMenu from "resource:///org/gnome/shell/ui/panelMenu.js";
import { MainPanel, type PanelItem } from "../types/index.js";
import { logger } from "../utils/logger.js";

export class PanelManager {
	private settings: Gio.Settings;
	private veilIndicator: PanelMenu.Button;
	private addedHandlerId: number | null = null;
	private removedHandlerId: number | null = null;
	private onItemsChangedCallback?: (items: string[]) => void;

	constructor(settings: Gio.Settings, veilIndicator: PanelMenu.Button) {
		this.settings = settings;
		this.veilIndicator = veilIndicator;
		this.setupListeners();
		this.updateAllItemsList();
	}

	private setupListeners() {
		this.addedHandlerId = MainPanel._rightBox.connect(
			"child-added",
			this._onItemAdded.bind(this),
		);

		this.removedHandlerId = MainPanel._rightBox.connect(
			"child-removed",
			this._onItemRemoved.bind(this),
		);

		logger.debug("Panel listeners setup complete");
	}

	private _onItemAdded(_container: St.Widget, actor: St.Widget) {
		logger.debug("Panel item added", { actor });
		this.updateAllItemsList();
		this.onItemsChangedCallback?.(this.getAllItemNames());
	}

	private _onItemRemoved(_container: St.Widget, actor: St.Widget) {
		logger.debug("Panel item removed", { actor });
		this.updateAllItemsList();
		this.onItemsChangedCallback?.(this.getAllItemNames());
	}

	private updateAllItemsList() {
		const itemNames = this.getAllItemNames();
		this.settings.set_strv("all-items", itemNames);
		logger.debug("Updated all-items list", { count: itemNames.length });
	}

	getAllItemNames(): string[] {
		const rightBoxItems = MainPanel._rightBox.get_children();
		const itemNames: string[] = [];

		rightBoxItems.forEach(
			(item: Clutter.Actor<Clutter.LayoutManager, Clutter.Content>) => {
				const child = item.firstChild;
				if (!child) return;

				// Skip Quick Settings and Veil indicator
				if (
					child === MainPanel.statusArea.quickSettings ||
					child === this.veilIndicator
				) {
					return;
				}

				// Get item name
				const name = this.getItemName(child as St.Widget);

				if (name) {
					itemNames.push(name);
				}
			},
		);

		return itemNames;
	}

	getAllPanelItems(): PanelItem[] {
		const rightBoxItems = MainPanel._rightBox.get_children();
		const items: PanelItem[] = [];

		rightBoxItems.forEach(
			(item: Clutter.Actor<Clutter.LayoutManager, Clutter.Content>) => {
				const child = item.firstChild;
				if (!child) return;

				// Skip Quick Settings and Veil indicator
				if (
					child === MainPanel.statusArea.quickSettings ||
					child === this.veilIndicator
				) {
					return;
				}

				const name = this.getItemName(child as St.Widget);

				if (name) {
					items.push({
						name,
						actor: child as St.Widget,
						container: item as St.Widget,
					});
				}
			},
		);

		return items;
	}

	getItemName(item: St.Widget): string | null {
		// Try accessible_name first
		if (item.accessible_name && item.accessible_name !== "") {
			return item.accessible_name;
		}

		// Fall back to constructor type name
		if (item.constructor && "name" in item.constructor) {
			return item.constructor.name;
		}

		return null;
	}

	isItemVisible(item: PanelItem): boolean {
		const visibleItems = this.settings.get_strv("visible-items");
		return visibleItems.includes(item.name);
	}

	setVisibility(visible: boolean) {
		const panelItems = this.getAllPanelItems();
		const visibleItems = this.settings.get_strv("visible-items");

		panelItems.forEach((item) => {
			const shouldBeVisible = visibleItems.includes(item.name);
			// If hiding, only show items in visibleItems list
			// If showing, show all items
			item.container.visible = visible ? true : shouldBeVisible;
		});

		logger.debug("Set panel visibility", {
			visible,
			totalItems: panelItems.length,
			visibleItemsCount: visibleItems.length,
		});
	}

	restoreVisibility() {
		const panelItems = this.getAllPanelItems();
		const visibleItems = this.settings.get_strv("visible-items");

		panelItems.forEach((item) => {
			const shouldBeVisible = visibleItems.includes(item.name);
			item.container.visible = shouldBeVisible;
		});

		logger.debug("Restored panel visibility", {
			totalItems: panelItems.length,
			visibleItemsCount: visibleItems.length,
		});
	}

	showAllItems() {
		const panelItems = this.getAllPanelItems();
		panelItems.forEach((item) => {
			item.container.visible = true;
		});
		logger.debug("Showed all panel items", { count: panelItems.length });
	}

	setOnItemsChanged(callback: (items: string[]) => void) {
		this.onItemsChangedCallback = callback;
	}

	destroy() {
		if (this.addedHandlerId !== null) {
			MainPanel._rightBox.disconnect(this.addedHandlerId);
			this.addedHandlerId = null;
		}
		if (this.removedHandlerId !== null) {
			MainPanel._rightBox.disconnect(this.removedHandlerId);
			this.removedHandlerId = null;
		}
		logger.debug("PanelManager destroyed");
	}
}
