/**
 * Reduces horizontal gap between top-panel status indicators by applying
 * `-natural-hpadding` (and optionally `-minimum-hpadding`) on each `panel-button`.
 * Ported from the Status Area Horizontal Spacing extension; see README for credit.
 */
import type Clutter from "gi://Clutter";
import type Gio from "gi://Gio";
import type St from "gi://St";
import { MainPanel } from "../types/index.js";

const SETTINGS_KEY = "status-area-h-padding";
const PANEL_BUTTON_CLASS = "panel-button";
/** Forces Shell to recompute panel-button metrics after inline style changes. */
const LAYOUT_REFRESH_CLASS = "veil-hspacing-layout-refresh-dummy";

function buildPaddingStyle(paddingPx: number): string {
    let line = `-natural-hpadding: ${paddingPx}px`;
    if (paddingPx < 6) {
        line += `; -minimum-hpadding: ${paddingPx}px`;
    }
    return line;
}

function mergeWithBaseline(paddingStyle: string, baseline: string): string {
    return baseline.length > 0 ? `${paddingStyle}; ${baseline}` : paddingStyle;
}

/**
 * Each `_rightBox` child is a wrapper; the clickable `panel-button` is usually
 * the wrapper itself or its first child (same one-level rule as upstream).
 */
function resolvePanelButton(container: Clutter.Actor): St.Widget | null {
    const widget = container as St.Widget;
    if (widget.has_style_class_name?.(PANEL_BUTTON_CLASS)) {
        return widget;
    }
    const children = container.get_children();
    if (children.length === 0) {
        return null;
    }
    const first = children[0] as St.Widget;
    return first.has_style_class_name?.(PANEL_BUTTON_CLASS) ? first : null;
}

function refreshPanelButtonLayout(button: St.Widget) {
    const previous = button.get_style_class_name() ?? "";
    button.set_style_class_name(LAYOUT_REFRESH_CLASS);
    button.set_style_class_name(previous);
}

export class StatusAreaHorizontalSpacing {
    private readonly settings: Gio.Settings;
    private paddingStyle: string;
    private readonly tracked = new Map<St.Widget, string>();

    constructor(settings: Gio.Settings) {
        this.settings = settings;
        this.paddingStyle = buildPaddingStyle(settings.get_int(SETTINGS_KEY));
    }

    enable() {
        for (const child of MainPanel._rightBox.get_children()) {
            this.attachToContainer(child);
        }

        MainPanel._rightBox.connectObject(
            "child-added",
            (_box: St.BoxLayout, actor: Clutter.Actor) => {
                this.attachToContainer(actor);
            },
            this,
        );

        this.settings.connectObject(
            `changed::${SETTINGS_KEY}`,
            () => {
                this.paddingStyle = buildPaddingStyle(
                    this.settings.get_int(SETTINGS_KEY),
                );
                this.reapplyAll();
            },
            this,
        );
    }

    destroy() {
        this.settings.disconnectObject(this);
        MainPanel._rightBox.disconnectObject(this);
        for (const child of MainPanel._rightBox.get_children()) {
            this.detachFromContainer(child);
        }
        this.tracked.clear();
    }

    private reapplyAll() {
        for (const child of MainPanel._rightBox.get_children()) {
            this.detachFromContainer(child);
            this.attachToContainer(child);
        }
    }

    private attachToContainer(container: Clutter.Actor) {
        const button = resolvePanelButton(container);
        if (!button || this.tracked.has(button)) {
            return;
        }
        const baselineStyle = button.get_style() ?? "";
        this.wireButton(button, baselineStyle);
    }

    private wireButton(button: St.Widget, baselineStyle: string) {
        button.set_style(mergeWithBaseline(this.paddingStyle, baselineStyle));

        button.connectObject(
            "style-changed",
            () => {
                const current = button.get_style() ?? "";
                if (current.includes(this.paddingStyle)) {
                    return;
                }
                button.disconnectObject(this);
                this.tracked.delete(button);
                this.wireButton(button, current);
            },
            this,
        );

        this.tracked.set(button, baselineStyle);
        refreshPanelButtonLayout(button);
    }

    private detachFromContainer(container: Clutter.Actor) {
        const button = resolvePanelButton(container);
        if (!button) {
            return;
        }
        const baselineStyle = this.tracked.get(button);
        if (baselineStyle === undefined) {
            return;
        }
        button.disconnectObject(this);
        button.set_style(baselineStyle);
        this.tracked.delete(button);
        refreshPanelButtonLayout(button);
    }
}
