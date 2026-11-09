import { beforeEach, describe, expect, spyOn, test } from "bun:test";
import { AnimationManager } from "../../src/core/animationManager.ts";
import { fakeSettings, runSources, sources, Widget } from "./fakes.js";

let manager;
let actor;

beforeEach(() => {
    sources.clear();
    manager = new AnimationManager(fakeSettings({ "animation-duration": 200 }));
    actor = new Widget();
});

describe("fadeIn", () => {
    test("shows the actor and starts from transparent and offset", () => {
        actor.visible = false;
        manager.fadeIn(actor);

        expect(actor.visible).toBe(true);
        expect(actor.opacity).toBe(0);
        expect(actor.translationX).toBe(30);
        expect([...actor.transitions.keys()]).toEqual([
            "veil-slide-in",
            "veil-fade-in",
        ]);
    });

    test("disconnects its completion handler when finished", () => {
        manager.fadeIn(actor);
        actor.emit("transitions-completed");
        expect(actor.connectedTo("transitions-completed")).toBe(0);
    });
});

describe("fadeOut", () => {
    test("hides and resets the actor when the transitions complete", async () => {
        const done = manager.fadeOut(actor);
        actor.opacity = 40;
        actor.translationX = 12;

        actor.emit("transitions-completed");
        await done;

        expect(actor.visible).toBe(false);
        expect(actor.opacity).toBe(255);
        expect(actor.translationX).toBe(0);
        expect(sources.size).toBe(0);
    });

    test("uses a fallback timeout just past the animation duration", () => {
        manager.fadeOut(actor);
        expect([...sources.values()][0].delay).toBe(300);
    });

    test("forces completion when the signal never arrives", async () => {
        const warn = spyOn(console, "log").mockImplementation(() => {});
        const done = manager.fadeOut(actor);

        runSources();
        await done;
        warn.mockRestore();

        expect(actor.visible).toBe(false);
        expect(actor.opacity).toBe(255);
    });
});

describe("cancelAnimation", () => {
    test("removes the transitions and the fallback timeout", () => {
        manager.fadeOut(actor);
        manager.cancelAnimation(actor);

        expect(actor.transitions.size).toBe(0);
        expect(sources.size).toBe(0);
    });

    test("leaves actors it is not animating alone", () => {
        actor.add_transition("someone-elses", {});
        manager.cancelAnimation(actor);
        expect(actor.transitions.size).toBe(1);
    });
});

test("destroy removes every pending timeout", () => {
    manager.fadeOut(actor);
    manager.fadeOut(new Widget());
    manager.destroy();
    expect(sources.size).toBe(0);
});
