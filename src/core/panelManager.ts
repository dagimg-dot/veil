import Clutter from "gi://Clutter";
import type Gio from "gi://Gio";
import GLib from "gi://GLib";
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
	private activeAnimations: Map<St.Widget, number> = new Map();
	private timeoutIds: Map<St.Widget, number> = new Map();

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
		const animationEnabled = this.settings.get_boolean("animation-enabled");

		panelItems.forEach((item) => {
			const shouldBeVisible = visibleItems.includes(item.name);
			// If hiding, only show items in visibleItems list
			// If showing, show all items
			const targetVisibility = visible ? true : shouldBeVisible;

			if (animationEnabled) {
				if (targetVisibility) {
					this.fadeIn(item.container);
				} else {
					this.fadeOut(item.container);
				}
			} else {
				// Instant visibility change
				item.container.visible = targetVisibility;
				item.container.opacity = 255;
			}
		});

		logger.debug("Set panel visibility", {
			visible,
			totalItems: panelItems.length,
			visibleItemsCount: visibleItems.length,
			animated: animationEnabled,
		});
	}

	private fadeIn(actor: St.Widget) {
		// Cancel any ongoing animation
		this.cancelAnimation(actor);

		// Make visible immediately
		actor.visible = true;

		const duration = this.settings.get_int("animation-duration");
		const slideOffset = 30; // pixels to slide from

		// Set start state - slide from right and fade in
		actor.opacity = 0;
		actor.set_translation(slideOffset, 0, 0);

		// Add transition to actor
		const actorWithTransitions = actor as unknown as {
			add_transition: (
				name: string,
				transition: Clutter.PropertyTransition,
			) => void;
			connect: (signal: string, callback: () => void) => number;
			disconnect: (id: number) => void;
		};

		// Create translation-x transition (slide in from right)
		const translationTransition = new Clutter.PropertyTransition({
			property_name: "translation-x",
		});
		translationTransition.set_from(slideOffset);
		translationTransition.set_to(0);
		translationTransition.set_duration(duration);
		translationTransition.set_progress_mode(
			Clutter.AnimationMode.EASE_OUT_QUAD,
		);

		// Create opacity transition (fade in)
		const opacityTransition = new Clutter.PropertyTransition({
			property_name: "opacity",
		});
		opacityTransition.set_from(0);
		opacityTransition.set_to(255);
		opacityTransition.set_duration(duration);
		opacityTransition.set_progress_mode(Clutter.AnimationMode.EASE_OUT_QUAD);

		actorWithTransitions.add_transition("veil-slide-in", translationTransition);
		actorWithTransitions.add_transition("veil-fade-in", opacityTransition);

		// Track the animation
		this.activeAnimations.set(actor, Date.now());

		// Listen for completion
		const handlerId = actorWithTransitions.connect(
			"transitions-completed",
			() => {
				actorWithTransitions.disconnect(handlerId);
				this.activeAnimations.delete(actor);
				logger.debug("Slide in completed");
			},
		);
	}

	private fadeOut(actor: St.Widget) {
		// Cancel any ongoing animation
		this.cancelAnimation(actor);

		const duration = this.settings.get_int("animation-duration");
		const slideOffset = 30; // pixels to slide to

		// Add transition to actor
		const actorWithTransitions = actor as unknown as {
			add_transition: (
				name: string,
				transition: Clutter.PropertyTransition,
			) => void;
			connect: (signal: string, callback: () => void) => number;
			disconnect: (id: number) => void;
		};

		// Create translation-x transition (slide out to right)
		const translationTransition = new Clutter.PropertyTransition({
			property_name: "translation-x",
		});

		translationTransition.set_from(0);
		translationTransition.set_to(slideOffset);
		translationTransition.set_duration(duration);
		translationTransition.set_progress_mode(Clutter.AnimationMode.EASE_IN_QUAD);

		// Create opacity transition (fade out)
		const opacityTransition = new Clutter.PropertyTransition({
			property_name: "opacity",
		});

		opacityTransition.set_from(actor.opacity);
		opacityTransition.set_to(0);
		opacityTransition.set_duration(duration);
		opacityTransition.set_progress_mode(Clutter.AnimationMode.EASE_IN_QUAD);

		actorWithTransitions.add_transition(
			"veil-slide-out",
			translationTransition,
		);

		actorWithTransitions.add_transition("veil-fade-out", opacityTransition);

		// Track the animation
		this.activeAnimations.set(actor, Date.now());

		// Listen for completion to hide the actor
		const handlerId = actorWithTransitions.connect(
			"transitions-completed",
			() => {
				actorWithTransitions.disconnect(handlerId);

				// Cancel the fallback timeout since transition completed successfully
				const timeoutId = this.timeoutIds.get(actor);
				if (timeoutId !== undefined) {
					GLib.Source.remove(timeoutId);
					this.timeoutIds.delete(actor);
				}

				actor.visible = false;
				actor.opacity = 255;
				actor.set_translation(0, 0, 0);
				this.activeAnimations.delete(actor);
				logger.debug("Slide out completed, actor hidden");
			},
		);

		// Fallback timeout in case signal doesn't fire
		// Cancel any existing timeout for this actor
		const existingTimeoutId = this.timeoutIds.get(actor);
		if (existingTimeoutId !== undefined) {
			GLib.Source.remove(existingTimeoutId);
		}

		const timeoutId = GLib.timeout_add(
			GLib.PRIORITY_DEFAULT,
			duration + 100,
			() => {
				if (this.activeAnimations.has(actor)) {
					logger.warn("Slide out timeout - forcing completion");
					actor.visible = false;
					actor.opacity = 255;
					actor.set_translation(0, 0, 0);
					this.activeAnimations.delete(actor);
					this.timeoutIds.delete(actor);
				}
				return GLib.SOURCE_REMOVE;
			},
		);

		this.timeoutIds.set(actor, timeoutId);
	}

	private cancelAnimation(actor: St.Widget) {
		if (this.activeAnimations.has(actor)) {
			const actorWithTransitions = actor as unknown as {
				remove_all_transitions?: () => void;
				remove_transition?: (name: string) => void;
			};

			// Try to cancel all transitions
			try {
				actorWithTransitions.remove_all_transitions?.();
			} catch {
				// Fallback: try to remove known transitions by name
				actorWithTransitions.remove_transition?.("veil-slide-in");
				actorWithTransitions.remove_transition?.("veil-slide-out");
				actorWithTransitions.remove_transition?.("veil-fade-in");
				actorWithTransitions.remove_transition?.("veil-fade-out");
			}

			// Cancel any pending timeout
			const timeoutId = this.timeoutIds.get(actor);
			if (timeoutId !== undefined) {
				GLib.Source.remove(timeoutId);
				this.timeoutIds.delete(actor);
			}

			this.activeAnimations.delete(actor);
		}
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
		for (const actor of this.activeAnimations.keys()) {
			this.cancelAnimation(actor);
		}

		// Clean up any remaining timeouts
		for (const timeoutId of this.timeoutIds.values()) {
			GLib.Source.remove(timeoutId);
		}

		this.activeAnimations.clear();
		this.timeoutIds.clear();

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
