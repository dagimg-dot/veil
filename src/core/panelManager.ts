import type Clutter from "gi://Clutter";
import type Gio from "gi://Gio";
import GLib from "gi://GLib";
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
	private initialSetupComplete = false;
	private hoverHideTimerId: number | null = null;
	private onHoverCompleteCallback?: () => void;
	private nameChangeHandlers: Map<St.Widget, number> = new Map();
	private firstChildHandlers: Map<St.Widget, number> = new Map();

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

		if (this.initialSetupComplete) {
			this.applyNewItemVisibility(actor);
		}

		this.updateAllItemsList();
		this.onItemsChangedCallback?.(this.getAllItemNames());
	}

	private applyNewItemVisibility(actor: St.Widget) {
		const child = actor.firstChild;

		if (!child) {
			// Container was added before its child widget; defer until child arrives
			const handlerId = actor.connect("notify::first-child", () => {
				actor.disconnect(handlerId);
				this.firstChildHandlers.delete(actor);
				this.applyNewItemVisibility(actor);
			});
			this.firstChildHandlers.set(actor, handlerId);
			return;
		}

		if (
			child === MainPanel.statusArea.quickSettings ||
			child === this.veilIndicator
		) {
			return;
		}

		const itemName = this.getItemName(child as St.Widget);
		if (itemName) {
			this.handleNewItemVisibility(itemName, actor);
		}

		this.watchForNameChange(child as St.Widget, actor);
	}

	private _onItemRemoved(_container: St.Widget, actor: St.Widget) {
		logger.debug("Panel item removed", { actor });

		const firstChildHandler = this.firstChildHandlers.get(actor);
		if (firstChildHandler !== undefined) {
			actor.disconnect(firstChildHandler);
			this.firstChildHandlers.delete(actor);
		}

		const child = actor.firstChild;
		if (child) {
			const nameHandler = this.nameChangeHandlers.get(child as St.Widget);
			if (nameHandler !== undefined) {
				(child as St.Widget).disconnect(nameHandler);
				this.nameChangeHandlers.delete(child as St.Widget);
			}
		}

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
		// Mark initial setup as complete after first setVisibility call
		this.initialSetupComplete = true;

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
			// Watch for accessible_name changes on existing items so we can
			// re-apply visibility once their real name is available (fixes items
			// whose accessible_name is not yet set at enable / hide time).
			panelItems.forEach((item) => {
				this.watchForNameChange(item.actor, item.container);
			});

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

	setOnHoverComplete(callback: () => void) {
		this.onHoverCompleteCallback = callback;
	}

	temporarilyShowItems() {
		// Cancel any pending hide timer
		this.cancelHoverHideTimer();

		// Show all items without changing the saved state
		const panelItems = this.getAllPanelItems();
		const animationEnabled = this.settings.get_boolean("animation-enabled");

		if (animationEnabled) {
			// Only animate items that are not visible at all
			const itemsToAnimate = panelItems.filter(
				(item) => !item.container.visible,
			);

			itemsToAnimate.forEach((item) => {
				this.animationManager.fadeIn(item.container);
			});

			// Ensure all items are in the correct visible state
			const itemsToFix = panelItems.filter(
				(item) => item.container.visible && item.container.opacity < 255,
			);

			itemsToFix.forEach((item) => {
				item.container.opacity = 255;
			});
		} else {
			// Instantly show all items
			panelItems.forEach((item) => {
				item.container.visible = true;
				item.container.opacity = 255;
				item.container.set_translation(0, 0, 0);
			});
		}

		logger.debug("Temporarily showing all items (hover)", {
			count: panelItems.length,
			animated: animationEnabled,
		});
	}

	temporarilyHideItemsWithDelay() {
		// Check if hide on leave is enabled
		const hideOnLeave = this.settings.get_boolean("hover-hide-on-leave");

		if (hideOnLeave) {
			// Hide immediately
			this.restoreVisibilityToSavedState();
			// Notify that hover is complete (to restore icon)
			this.onHoverCompleteCallback?.();
			logger.debug("Hide on leave: items hidden immediately");
		} else {
			// Cancel any existing timer
			this.cancelHoverHideTimer();

			// Get hover duration from settings (in seconds)
			const hoverDuration = this.settings.get_int("hover-duration");

			// Start a timer with configured duration before hiding
			this.hoverHideTimerId = GLib.timeout_add_seconds(
				GLib.PRIORITY_DEFAULT,
				hoverDuration,
				() => {
					this.hoverHideTimerId = null;
					this.restoreVisibilityToSavedState();
					// Notify that hover is complete (to restore icon)
					this.onHoverCompleteCallback?.();
					return GLib.SOURCE_REMOVE;
				},
			);

			logger.debug("Scheduled hover hide", { duration: hoverDuration });
		}
	}

	private cancelHoverHideTimer() {
		if (this.hoverHideTimerId !== null) {
			GLib.Source.remove(this.hoverHideTimerId);
			this.hoverHideTimerId = null;
			logger.debug("Cancelled hover hide timer");
		}
	}

	private restoreVisibilityToSavedState() {
		// Restore to the actual saved visibility state
		const currentVisibility = this.stateManager.getVisibility();
		this.setVisibility(currentVisibility);
		logger.debug("Restored visibility to saved state", {
			visible: currentVisibility,
		});
	}

	private watchForNameChange(child: St.Widget, container: St.Widget) {
		if (this.nameChangeHandlers.has(child)) {
			return;
		}

		const handlerId = child.connect("notify::accessible-name", () => {
			const newName = this.getItemName(child);
			if (newName) {
				logger.debug("Item accessible_name changed, re-applying visibility", {
					newName,
				});
				this.handleNewItemVisibility(newName, container);
				this.updateAllItemsList();
				this.onItemsChangedCallback?.(this.getAllItemNames());
			}
		});
		this.nameChangeHandlers.set(child, handlerId);
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
		this.cancelHoverHideTimer();
		this.animationManager.destroy();

		for (const [widget, handlerId] of this.nameChangeHandlers.entries()) {
			widget.disconnect(handlerId);
		}
		this.nameChangeHandlers.clear();

		for (const [widget, handlerId] of this.firstChildHandlers.entries()) {
			widget.disconnect(handlerId);
		}
		this.firstChildHandlers.clear();

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
