import Clutter from "gi://Clutter";
import St from "gi://St";
import type { Extension } from "resource:///org/gnome/shell/extensions/extension.js";
import * as PanelMenu from "resource:///org/gnome/shell/ui/panelMenu.js";
import * as PopupMenu from "resource:///org/gnome/shell/ui/popupMenu.js";
import { Icons } from "../lib/icons.js";
import { logger } from "../utils/logger.js";

export class VeilIndicator {
	private indicator: PanelMenu.Button;
	private extension: Extension;
	private iconWidget: St.Icon | null = null;
	private onToggleCallback?: () => void;

	constructor(extension: Extension) {
		this.extension = extension;
		this.indicator = new PanelMenu.Button(0, "Veil");
		this.setupUI();
		this.setupMenu();
		this.setupClickHandler();
	}

	private setupUI() {
		new Icons(this.extension.path);
		this.updateIcon(true);
	}

	private setupClickHandler() {
		this.indicator.connect("button-press-event", (_actor, event) => {
			const button = event.get_button();

			if (button === Clutter.BUTTON_PRIMARY) {
				logger.debug("Primary click on Veil indicator");

				this.onToggleCallback?.();

				if (this.indicator.menu) {
					this.indicator.menu.close();
				}
			}
		});
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

	updateIcon(isVisible: boolean) {
		if (this.iconWidget) {
			this.indicator.remove_child(this.iconWidget);
			this.iconWidget = null;
		}

		// left-arrow = show (items visible), right-arrow = hide (items hidden)
		const iconName = isVisible ? "arrow-close" : "arrow-open";
		const veilIcon = Icons.get(iconName);

		if (veilIcon) {
			this.iconWidget = new St.Icon({
				gicon: veilIcon,
				style_class: "system-status-icon",
			});

			this.indicator.add_child(this.iconWidget);
			logger.debug("Icon updated", { iconName, isVisible });
		}
	}

	setOnToggle(callback: () => void) {
		this.onToggleCallback = callback;
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
