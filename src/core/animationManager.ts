import Clutter from "gi://Clutter";
import type Gio from "gi://Gio";
import GLib from "gi://GLib";
import type St from "gi://St";
import { logger } from "../utils/logger.js";

export class AnimationManager {
	private settings: Gio.Settings;
	private activeAnimations: Map<St.Widget, number> = new Map();
	private timeoutIds: Map<St.Widget, number> = new Map();

	constructor(settings: Gio.Settings) {
		this.settings = settings;
	}

	fadeIn(actor: St.Widget): void {
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

	fadeOut(actor: St.Widget): Promise<void> {
		return new Promise((resolve) => {
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
			translationTransition.set_progress_mode(
				Clutter.AnimationMode.EASE_IN_QUAD,
			);

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

			// Listen for completion to hide the actor and resolve promise
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
					resolve();
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
						resolve();
					}
					return GLib.SOURCE_REMOVE;
				},
			);

			this.timeoutIds.set(actor, timeoutId);
		});
	}

	cancelAnimation(actor: St.Widget): void {
		if (this.activeAnimations.has(actor)) {
			const actorWithTransitions = actor as unknown as {
				remove_all_transitions?: () => void;
				remove_transition?: (name: string) => void;
			};

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

	destroy(): void {
		// Cancel all active animations
		for (const actor of this.activeAnimations.keys()) {
			this.cancelAnimation(actor);
		}

		// Clean up any remaining timeouts
		for (const timeoutId of this.timeoutIds.values()) {
			GLib.Source.remove(timeoutId);
		}

		this.activeAnimations.clear();
		this.timeoutIds.clear();

		logger.debug("AnimationManager destroyed");
	}
}
