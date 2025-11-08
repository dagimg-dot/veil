import St from "gi://St";
import type { Extension } from "resource:///org/gnome/shell/extensions/extension.js";
import * as PanelMenu from "resource:///org/gnome/shell/ui/panelMenu.js";
import * as PopupMenu from "resource:///org/gnome/shell/ui/popupMenu.js";
import { Icons } from "../lib/icons.js";
import { logger } from "../utils/logger.js";

export class VeilIndicator {
	private indicator: PanelMenu.Button;
	private extension: Extension;

	constructor(extension: Extension) {
		this.extension = extension;
		this.indicator = new PanelMenu.Button(0, "Veil");
		this.setupUI();
		this.setupMenu();
	}

	private setupUI() {
		new Icons(this.extension.path);

		const veilIcon = Icons.get("smile");

		const icon = new St.Icon({
			gicon: veilIcon,
			style_class: "system-status-icon",
		});

		this.indicator.add_child(icon);
	}

	private setupMenu() {
		const settingsItem = new PopupMenu.PopupMenuItem("Settings");
		settingsItem.connect("activate", () => {
			logger.debug("Opening Veil preferences");
			this.extension.openPreferences();
		});

		if (this.indicator.menu && "addMenuItem" in this.indicator.menu) {
			this.indicator.menu.addMenuItem(settingsItem);
		}
	}

	getButton(): PanelMenu.Button {
		return this.indicator;
	}

	destroy() {
		if (this.indicator) {
			this.indicator.destroy();
		}
	}
}
