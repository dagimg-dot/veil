import { beforeEach, describe, expect, test } from "bun:test";
import { StatusAreaHorizontalSpacing } from "../../src/core/statusAreaHorizontalSpacing.ts";
import { fakeSettings, panel, resetPanel, Widget } from "./fakes.js";

const KEY = "status-area-h-padding";

function panelButton(style = null) {
    const button = new Widget();
    button.styleClass = "panel-button";
    button.style = style;
    return button;
}

function addContainer(container) {
    panel._rightBox.children.push(container);
    panel._rightBox.emit("child-added", container);
    return container;
}

function wrapped(button) {
    const container = new Widget();
    container.children = [button];
    return container;
}

let settings;
let spacing;

beforeEach(() => {
    resetPanel();
    settings = fakeSettings({ [KEY]: 8 });
    spacing = new StatusAreaHorizontalSpacing(settings);
});

describe("padding style", () => {
    test("applies to a panel-button wrapper's child", () => {
        spacing.enable();
        const button = panelButton();
        addContainer(wrapped(button));
        expect(button.get_style()).toBe("-natural-hpadding: 8px");
    });

    test("applies to a container that is itself the panel-button", () => {
        spacing.enable();
        const button = addContainer(panelButton());
        expect(button.get_style()).toBe("-natural-hpadding: 8px");
    });

    test("sets the minimum padding too below 6px", () => {
        settings.change(KEY, 4);
        spacing = new StatusAreaHorizontalSpacing(settings);
        spacing.enable();
        const button = addContainer(panelButton());
        expect(button.get_style()).toBe(
            "-natural-hpadding: 4px; -minimum-hpadding: 4px",
        );
    });

    test("skips children that are not panel buttons", () => {
        spacing.enable();
        const other = new Widget();
        addContainer(wrapped(other));
        expect(other.get_style()).toBeNull();
    });

    test("keeps the button's existing style after the padding", () => {
        spacing.enable();
        const button = addContainer(panelButton("color: red"));
        expect(button.get_style()).toBe("-natural-hpadding: 8px; color: red");
    });
});

test("a padding change reapplies to tracked buttons", () => {
    spacing.enable();
    const button = addContainer(panelButton());
    settings.change(KEY, 10);
    expect(button.get_style()).toBe("-natural-hpadding: 10px");
});

test("a style set by someone else keeps the padding", () => {
    spacing.enable();
    const button = addContainer(panelButton());
    button.set_style("color: blue");
    button.emit("style-changed");
    expect(button.get_style()).toBe("-natural-hpadding: 8px; color: blue");
});

test("destroy restores styles and disconnects everything", () => {
    spacing.enable();
    const button = addContainer(panelButton("color: red"));
    spacing.destroy();

    expect(button.get_style()).toBe("color: red");
    expect(button.connectedTo("style-changed")).toBe(0);
    expect(panel._rightBox.connectedTo("child-added")).toBe(0);
    expect(settings.signals.handlers.size).toBe(0);
});
