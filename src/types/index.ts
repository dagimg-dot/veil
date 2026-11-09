import type St from "gi://St";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import type { Panel } from "resource:///org/gnome/shell/ui/panel.js";
import type { Button as PanelMenuButton } from "resource:///org/gnome/shell/ui/panelMenu.js";

export interface MainPanel extends Panel {
    _rightBox: St.BoxLayout;
}

export const MainPanel = Main.panel as MainPanel;

export interface PanelItem {
    name: string;
    actor: St.Widget;
    container: St.Widget;
    originalVisible?: boolean;
}

/** The private click gesture `PanelMenu.Button` has since GNOME 50. */
export interface ClickGesture {
    get_button(): number;
    connect(
        signal: "recognize",
        handler: (action: ClickGesture) => boolean,
    ): number;
}

/** Older shells have no gesture, so the field is optional. */
export type GesturePanelButton = PanelMenuButton & {
    _clickGesture?: ClickGesture;
};
