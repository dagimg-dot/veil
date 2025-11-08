import type St from "gi://St";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import type { Panel } from "resource:///org/gnome/shell/ui/panel.js";

export interface MainPanel extends Panel {
	_rightBox: St.BoxLayout;
}

export const MainPanel = Main.panel as MainPanel;

export interface PanelItem {
	name: string;
	actor: St.Widget;
	container: St.Widget;
}
