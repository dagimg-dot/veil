import Clutter from "gi://Clutter";
import type Gio from "gi://Gio";
import GLib from "gi://GLib";
import { logger } from "../utils/logger.js";

const SLIDE_OFFSET = 30;

interface RunningAnimation {
    timeoutId: number | null;
    resolve: (() => void) | null;
}

export class AnimationManager {
    private settings: Gio.Settings;
    private running: Map<Clutter.Actor, RunningAnimation> = new Map();

    constructor(settings: Gio.Settings) {
        this.settings = settings;
    }

    fadeIn(actor: Clutter.Actor): void {
        this.cancelAnimation(actor);

        actor.visible = true;

        if (!actor.is_mapped()) {
            this.resetPresentation(actor);
            return;
        }

        const duration = this.settings.get_int("animation-duration");

        // Set start state - slide from right and fade in
        actor.opacity = 0;
        actor.set_translation(SLIDE_OFFSET, 0, 0);

        this.addTransition(actor, "veil-slide-in", "translation-x", {
            from: SLIDE_OFFSET,
            to: 0,
            duration,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        });
        this.addTransition(actor, "veil-fade-in", "opacity", {
            from: 0,
            to: 255,
            duration,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        });

        actor.connectObject(
            "transitions-completed",
            () => {
                this.stop(actor);
                logger.debug("Slide in completed");
            },
            this,
        );

        this.running.set(actor, { timeoutId: null, resolve: null });
    }

    fadeOut(actor: Clutter.Actor): Promise<void> {
        return new Promise((resolve) => {
            this.cancelAnimation(actor);

            if (!actor.is_mapped()) {
                this.hide(actor);
                resolve();
                return;
            }

            const duration = this.settings.get_int("animation-duration");

            this.addTransition(actor, "veil-slide-out", "translation-x", {
                from: 0,
                to: SLIDE_OFFSET,
                duration,
                mode: Clutter.AnimationMode.EASE_IN_QUAD,
            });
            this.addTransition(actor, "veil-fade-out", "opacity", {
                from: actor.opacity,
                to: 0,
                duration,
                mode: Clutter.AnimationMode.EASE_IN_QUAD,
            });

            const complete = () => {
                this.stop(actor);
                this.hide(actor);
                resolve();
            };

            actor.connectObject(
                "transitions-completed",
                () => {
                    logger.debug("Slide out completed, actor hidden");
                    complete();
                },
                this,
            );

            const animation: RunningAnimation = {
                timeoutId: GLib.timeout_add(
                    GLib.PRIORITY_DEFAULT,
                    duration + 100,
                    () => {
                        animation.timeoutId = null;
                        logger.warn("Slide out timeout - forcing completion");
                        complete();
                        return GLib.SOURCE_REMOVE;
                    },
                ),
                resolve,
            };

            this.running.set(actor, animation);
        });
    }

    cancelAnimation(actor: Clutter.Actor): void {
        this.stop(actor)?.resolve?.();
    }

    destroy(): void {
        for (const actor of [...this.running.keys()]) {
            this.stop(actor);
            this.resetPresentation(actor);
        }

        logger.debug("AnimationManager destroyed");
    }

    private addTransition(
        actor: Clutter.Actor,
        name: string,
        property: string,
        options: {
            from: number;
            to: number;
            duration: number;
            mode: Clutter.AnimationMode;
        },
    ) {
        const transition = new Clutter.PropertyTransition({
            property_name: property,
        });
        transition.set_from(options.from);
        transition.set_to(options.to);
        transition.set_duration(options.duration);
        transition.set_progress_mode(options.mode);
        transition.set_remove_on_complete(true);
        actor.add_transition(name, transition);
    }

    private stop(actor: Clutter.Actor): RunningAnimation | undefined {
        const animation = this.running.get(actor);
        if (!animation) return undefined;

        this.running.delete(actor);
        actor.disconnectObject(this);
        if (animation.timeoutId !== null) {
            GLib.Source.remove(animation.timeoutId);
        }
        actor.remove_all_transitions();
        return animation;
    }

    private hide(actor: Clutter.Actor) {
        actor.visible = false;
        this.resetPresentation(actor);
    }

    private resetPresentation(actor: Clutter.Actor) {
        actor.opacity = 255;
        actor.set_translation(0, 0, 0);
    }
}
