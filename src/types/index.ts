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

export interface ClickGesture {
    get_button(): number;
    connectObject(
        signal: "recognize",
        handler: (action: ClickGesture) => boolean,
        owner: object,
    ): void;
    disconnectObject(owner: object): void;
}

export type GesturePanelButton = PanelMenuButton & {
    _clickGesture?: ClickGesture;
};
