import type Clutter from "gi://Clutter";
import type Gio from "gi://Gio";
import type St from "gi://St";
import type * as PanelMenu from "resource:///org/gnome/shell/ui/panelMenu.js";
import { MainPanel, type PanelItem } from "../types/index.js";
import { logger } from "../utils/logger.js";
import { AnimationManager } from "./animationManager.js";
import type { StateManager } from "./stateManager.js";

export class PanelManager {
	private settings: Gio.Settings;
	private veilIndicator: PanelMenu.Button;
	private animationManager: AnimationManager;
	private addedHandlerId: number | null = null;
	private removedHandlerId: number | null = null;
	private onItemsChangedCallback?: (items: string[]) => void;
	private stateManager: StateManager;

	constructor(
		settings: Gio.Settings,
		veilIndicator: PanelMenu.Button,
		stateManager: StateManager,
	) {
		this.settings = settings;
		this.veilIndicator = veilIndicator;
		this.stateManager = stateManager;
		this.animationManager = new AnimationManager(settings);
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

		// Get the item name and container for the newly added item
		const child = actor.firstChild;
		if (child) {
			const itemName = this.getItemName(child as St.Widget);
			if (
				itemName &&
				child !== MainPanel.statusArea.quickSettings &&
				child !== this.veilIndicator
			) {
				// Apply visibility logic to the new item
				this.handleNewItemVisibility(itemName, actor);
			}
		}

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
		const animationEnabled = this.settings.get_boolean("animation-enabled");

		if (visible) {
			// When showing all items, fade them in
			if (animationEnabled) {
				panelItems.forEach((item) => {
					this.animationManager.fadeIn(item.container);
				});
			} else {
				panelItems.forEach((item) => {
					item.container.visible = true;
					item.container.opacity = 255;
				});
			}
		} else {
			// When hiding, first fade out all items, then fade back in the ones that should remain visible
			if (animationEnabled) {
				// First, fade out all items
				const allFadeOutPromises: Promise<void>[] = [];

				panelItems.forEach((item) => {
					allFadeOutPromises.push(
						this.animationManager.fadeOut(item.container),
					);
				});

				// After all fade out animations complete, fade in the visible items
				Promise.all(allFadeOutPromises).then(() => {
					const itemsToShow = panelItems.filter((item) =>
						visibleItems.includes(item.name),
					);

					itemsToShow.forEach((item) => {
						this.animationManager.fadeIn(item.container);
					});
				});
			} else {
				// Instant visibility change
				panelItems.forEach((item) => {
					const shouldBeVisible = visibleItems.includes(item.name);
					item.container.visible = shouldBeVisible;
					item.container.opacity = 255;
				});
			}
		}

		logger.debug("Set panel visibility", {
			visible,
			totalItems: panelItems.length,
			visibleItemsCount: visibleItems.length,
			animated: animationEnabled,
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

	private handleNewItemVisibility(itemName: string, container: St.Widget) {
		const currentVisibility = this.stateManager.getVisibility();
		const visibleItems = this.settings.get_strv("visible-items");

		if (currentVisibility) {
			// Overall visibility is true (all items shown): show the new item
			container.visible = true;
			container.opacity = 255;
			logger.debug("New item shown (visibility=true)", { itemName });
		} else {
			// Overall visibility is false (items hidden): show only if in visible-items list
			const shouldBeVisible = visibleItems.includes(itemName);
			container.visible = shouldBeVisible;
			container.opacity = 255;
			logger.debug("New item visibility set based on visible-items", {
				itemName,
				visible: shouldBeVisible,
			});
		}
	}

	destroy() {
		this.animationManager.destroy();

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
