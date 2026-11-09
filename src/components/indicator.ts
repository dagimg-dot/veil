import Clutter from "gi://Clutter";
import type Gio from "gi://Gio";
import St from "gi://St";
import type { Extension } from "resource:///org/gnome/shell/extensions/extension.js";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import * as PanelMenu from "resource:///org/gnome/shell/ui/panelMenu.js";
import * as PopupMenu from "resource:///org/gnome/shell/ui/popupMenu.js";
import { Icons } from "../lib/icons.js";
import {
    type ClickGesture,
    type GesturePanelButton,
    MainPanel,
} from "../types/index.js";
import { logger } from "../utils/logger.js";
import { readInteractionMode } from "../utils/settings.js";

export class VeilIndicator {
    private indicator: PanelMenu.Button | null = null;
    private extension: Extension;
    private iconWidget: St.Icon | null = null;
    private onToggleCallback?: () => void;
    private onHoverEnterCallback?: () => void;
    private onHoverLeaveCallback?: () => void;
    private settings: Gio.Settings;
    private isHovering = false;
    private clickGesture: ClickGesture | null = null;

    constructor(extension: Extension, settings: Gio.Settings) {
        this.extension = extension;
        this.settings = settings;
        this.indicator = new PanelMenu.Button(0, "Veil");
        this.indicator.connectObject(
            "destroy",
            () => {
                this.indicator = null;
            },
            this,
        );
        this.setupUI();
        this.setupMenu();
        this.setupClickHandler();
        this.setupHoverHandlers();
    }

    private get panelButton(): PanelMenu.Button {
        if (this.indicator === null) {
            throw new Error("VeilIndicator used after destroy");
        }
        return this.indicator;
    }

    private setupUI() {
        new Icons(this.extension.path, this.settings);
        this.updateIcon(true);
    }

    private setupClickHandler() {
        const btn = this.panelButton;

        const onPrimaryClick = () => {
            const interactionMode = readInteractionMode(this.settings);

            if (interactionMode === "click") {
                logger.debug("Primary click on Veil indicator");
                this.onToggleCallback?.();

                const menu = this.panelButton.menu;
                if (menu) {
                    menu.close();
                }
            } else {
                logger.debug("Click ignored in Hover mode");
            }
        };

        // GNOME 50+: intercept the click gesture before it shows the default menu.
        const gesture = (btn as GesturePanelButton)._clickGesture;
        if (gesture) {
            this.clickGesture = gesture;
            gesture.connectObject(
                "recognize",
                (action) => {
                    if (action.get_button() === Clutter.BUTTON_PRIMARY) {
                        onPrimaryClick();
                    }
                    // Return PROPAGATE (false) to reject the gesture and prevent
                    // the default menu handler from showing on click.
                    return Clutter.EVENT_PROPAGATE;
                },
                this,
            );
        }

        // Pre-GNOME 50 fallback: handle button-press-event
        btn.connectObject(
            "button-press-event",
            (_actor: Clutter.Actor, event: Clutter.Event) => {
                const button = event.get_button();

                if (button === Clutter.BUTTON_PRIMARY) {
                    onPrimaryClick();
                }
            },
            this,
        );

        btn.connectObject(
            "touch-event",
            (_actor: Clutter.Actor, event: Clutter.Event) => {
                const eventType = event.type();

                if (eventType === Clutter.EventType.TOUCH_BEGIN) {
                    onPrimaryClick();
                }
            },
            this,
        );
    }

    private setupMenu() {
        const settingsItem = new PopupMenu.PopupMenuItem("Settings");
        settingsItem.connectObject(
            "activate",
            () => {
                logger.debug("Opening Veil preferences");
                this.extension.openPreferences();
            },
            this,
        );

        const menu = this.panelButton.menu;
        if (menu && "addMenuItem" in menu) {
            menu.addMenuItem(settingsItem);
        }
    }

    updateIcon(isVisible: boolean) {
        if (this.iconWidget) {
            this.panelButton.remove_child(this.iconWidget);
            this.iconWidget = null;
        }

        const iconName = isVisible ? "arrow-close" : "arrow-open";
        const veilIcon = Icons.get(iconName);

        if (veilIcon) {
            this.iconWidget = new St.Icon({
                gicon: veilIcon,
                style_class: "system-status-icon",
            });

            this.panelButton.add_child(this.iconWidget);
            logger.debug("Icon updated", { iconName, isVisible });
        }
    }

    private quickSettingsIndex(): number {
        return MainPanel._rightBox
            .get_children()
            .findIndex(
                (item) =>
                    item.firstChild === Main.panel.statusArea.quickSettings,
            );
    }

    getIndicatorPosition(): number {
        const index = this.quickSettingsIndex();
        return index === -1 ? MainPanel._rightBox.get_children().length : index;
    }

    repositionIndicator() {
        if (!this.indicator) return;

        const container = this.indicator.get_parent();

        if (!container) return;

        const quickSettingsIndex = this.quickSettingsIndex();

        if (quickSettingsIndex === -1) {
            logger.warn("Could not find Quick Settings for repositioning");
            return;
        }

        MainPanel._rightBox.set_child_at_index(
            container,
            Math.max(0, quickSettingsIndex - 1),
        );

        logger.debug("Indicator repositioned", {
            position: quickSettingsIndex,
        });
    }

    private setupHoverHandlers() {
        const btn = this.panelButton;
        btn.connectObject(
            "enter-event",
            () => {
                const interactionMode = readInteractionMode(this.settings);

                if (interactionMode === "hover") {
                    this.isHovering = true;
                    this.updateIcon(true);
                    this.onHoverEnterCallback?.();
                }
                return Clutter.EVENT_PROPAGATE;
            },
            this,
        );

        btn.connectObject(
            "leave-event",
            () => {
                const interactionMode = readInteractionMode(this.settings);

                if (interactionMode === "hover") {
                    this.isHovering = false;
                    this.onHoverLeaveCallback?.();
                }
                return Clutter.EVENT_PROPAGATE;
            },
            this,
        );
    }

    setOnToggle(callback: () => void) {
        this.onToggleCallback = callback;
    }

    setOnHoverEnter(callback: () => void) {
        this.onHoverEnterCallback = callback;
    }

    setOnHoverLeave(callback: () => void) {
        this.onHoverLeaveCallback = callback;
    }

    notifyHoverLeaveSyncFromMenu() {
        if (readInteractionMode(this.settings) !== "hover") return;
        this.isHovering = false;
        this.onHoverLeaveCallback?.();
    }

    restoreIconAfterHover() {
        if (!this.isHovering) {
            this.updateIcon(false);
        }
    }

    getButton(): PanelMenu.Button {
        return this.panelButton;
    }

    destroy() {
        this.clickGesture?.disconnectObject(this);
        this.clickGesture = null;
        this.indicator?.disconnectObject(this);
        if (this.iconWidget && this.indicator) {
            this.indicator.remove_child(this.iconWidget);
            this.iconWidget.destroy();
            this.iconWidget = null;
        }
        if (this.indicator) {
            this.indicator.destroy();
            this.indicator = null;
        }
    }
}
