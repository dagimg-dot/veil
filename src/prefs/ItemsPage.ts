import Adw from "gi://Adw";
import type Gio from "gi://Gio";
import GObject from "gi://GObject";
import type Gtk from "gi://Gtk";
import { getTemplate } from "../utils/getTemplate.js";
import { logger } from "../utils/logger.js";

export interface ItemsPageChildren {
	_itemsGroup: Adw.PreferencesGroup;
	_resetButton: Gtk.Button;
}

export const ItemsPage = GObject.registerClass(
	{
		GTypeName: "VeilItemsPage",
		Template: getTemplate("ItemsPage"),
		InternalChildren: ["itemsGroup", "resetButton"],
	},
	class ItemsPage extends Adw.PreferencesPage {
		private settings!: Gio.Settings;
		private itemRows: Map<string, Adw.SwitchRow> = new Map();
		private handlerIds: Map<string, number> = new Map();
		private updating = false;

		bindSettings(settings: Gio.Settings) {
			this.settings = settings;
			const children = this as unknown as ItemsPageChildren;
			logger.debug("Settings bound to ItemsPage");

			children._resetButton.connect("clicked", () => {
				this.handleReset();
			});

			// Initial load
			this.updateItemsList();

			// Listen for changes to all-items and visible-items
			this.settings.connect("changed::all-items", () => {
				this.updateItemsList();
			});

			this.settings.connect("changed::visible-items", () => {
				this.updateItemStates();
			});
		}

		private updateItemsList() {
			const children = this as unknown as ItemsPageChildren;
			const allItems = this.settings.get_strv("all-items");
			const visibleItems = this.settings.get_strv("visible-items");

			logger.debug("Updating items list", {
				allItemsCount: allItems.length,
				visibleItemsCount: visibleItems.length,
			});

			// Remove old rows that no longer exist
			for (const [itemName, row] of this.itemRows.entries()) {
				if (!allItems.includes(itemName)) {
					const handlerId = this.handlerIds.get(itemName);

					if (handlerId !== undefined) {
						row.disconnect(handlerId);
						this.handlerIds.delete(itemName);
					}

					children._itemsGroup.remove(row);

					this.itemRows.delete(itemName);
				}
			}

			// Add or update rows for all items
			allItems.forEach((itemName) => {
				let row = this.itemRows.get(itemName);

				if (!row) {
					row = this.createItemRow(itemName);
					children._itemsGroup.add(row);
					this.itemRows.set(itemName, row);
				}

				this.updateRowState(row, visibleItems.includes(itemName));
			});
		}

		private createItemRow(itemName: string): Adw.SwitchRow {
			const row = new Adw.SwitchRow({
				title: itemName,
				subtitle: "Toggle to show/hide this item",
			});

			const handlerId = row.connect("notify::active", () => {
				if (!this.updating) {
					this.toggleItem(itemName, row.active);
				}
			});

			this.handlerIds.set(itemName, handlerId);
			return row;
		}

		private updateRowState(row: Adw.SwitchRow, isVisible: boolean) {
			this.updating = true;
			row.active = isVisible;
			this.updating = false;
		}

		private updateItemStates() {
			const visibleItems = this.settings.get_strv("visible-items");

			for (const [itemName, row] of this.itemRows.entries()) {
				const isVisible = visibleItems.includes(itemName);

				// Only update if state changed to avoid infinite loops
				if (row.active !== isVisible) {
					this.updateRowState(row, isVisible);
				}
			}
		}

		private toggleItem(itemName: string, isActive: boolean) {
			const visibleItems = this.settings.get_strv("visible-items");
			const index = visibleItems.indexOf(itemName);

			if (isActive && index < 0) {
				// Add to visible items
				visibleItems.push(itemName);
				this.settings.set_strv("visible-items", visibleItems);
				logger.debug("Item added to visible items", { itemName });
			} else if (!isActive && index >= 0) {
				// Remove from visible items
				visibleItems.splice(index, 1);
				this.settings.set_strv("visible-items", visibleItems);
				logger.debug("Item removed from visible items", { itemName });
			}
		}

		private handleReset() {
			this.settings.set_strv("visible-items", []);
			logger.info("Reset all items to hidden");
		}
	},
);
