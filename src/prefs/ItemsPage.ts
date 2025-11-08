import Adw from "gi://Adw";
import type Gio from "gi://Gio";
import GObject from "gi://GObject";
import { getTemplate } from "../utils/getTemplate.js";
import { logger } from "../utils/logger.js";

export interface ItemsPageChildren {
	_itemsGroup: Adw.PreferencesGroup;
	_actionsGroup: Adw.PreferencesGroup;
	_resetButton: Adw.ActionRow;
	_clearButton: Adw.ActionRow;
}

export const ItemsPage = GObject.registerClass(
	{
		GTypeName: "VeilItemsPage",
		Template: getTemplate("ItemsPage"),
		InternalChildren: [
			"itemsGroup",
			"actionsGroup",
			"resetButton",
			"clearButton",
		],
	},
	class ItemsPage extends Adw.PreferencesPage {
		private settings!: Gio.Settings;
		private itemRows: Map<string, Adw.ActionRow> = new Map();

		bindSettings(settings: Gio.Settings) {
			this.settings = settings;
			const children = this as unknown as ItemsPageChildren;
			logger.debug("Settings bound to ItemsPage");

			// Connect reset button
			children._resetButton.connect("activated", () => {
				this.handleReset();
			});

			// Connect clear button
			children._clearButton.connect("activated", () => {
				this.handleClear();
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
				this.updateRowState(row, itemName, visibleItems.includes(itemName));
			});

			// Update clear button state
			this.updateClearButtonState();
		}

		private createItemRow(itemName: string): Adw.ActionRow {
			const row = new Adw.ActionRow({
				title: itemName,
				activatable: true,
			});

			row.connect("activated", () => {
				this.toggleItem(itemName);
			});

			return row;
		}

		private updateRowState(
			row: Adw.ActionRow,
			itemName: string,
			isVisible: boolean,
		) {
			if (isVisible) {
				row.set_title(`🔥 ${itemName}`);
				row.set_subtitle("Will remain visible when hiding");
			} else {
				row.set_title(itemName);
				row.set_subtitle("Will be hidden");
			}
		}

		private updateItemStates() {
			const visibleItems = this.settings.get_strv("visible-items");

			for (const [itemName, row] of this.itemRows.entries()) {
				this.updateRowState(row, itemName, visibleItems.includes(itemName));
			}
		}

		private toggleItem(itemName: string) {
			const visibleItems = this.settings.get_strv("visible-items");
			const index = visibleItems.indexOf(itemName);

			if (index >= 0) {
				visibleItems.splice(index, 1);
			} else {
				visibleItems.push(itemName);
			}

			this.settings.set_strv("visible-items", visibleItems);
			logger.debug("Toggled item visibility", {
				itemName,
				isVisible: index < 0,
			});
		}

		private handleReset() {
			this.settings.set_strv("visible-items", []);
			logger.info("Reset visible items to default (empty)");
		}

		private handleClear() {
			const allItems = this.settings.get_strv("all-items");
			const visibleItems = this.settings.get_strv("visible-items");
			const cleaned = visibleItems.filter((item) => allItems.includes(item));

			if (cleaned.length !== visibleItems.length) {
				this.settings.set_strv("visible-items", cleaned);
				logger.info("Cleared orphaned items", {
					before: visibleItems.length,
					after: cleaned.length,
				});
			} else {
				logger.debug("No orphaned items to clear");
			}

			this.updateClearButtonState();
		}

		private updateClearButtonState() {
			const children = this as unknown as ItemsPageChildren;
			const allItems = this.settings.get_strv("all-items");
			const visibleItems = this.settings.get_strv("visible-items");
			const orphaned = visibleItems.filter((item) => !allItems.includes(item));

			if (orphaned.length === 0) {
				children._clearButton.set_title("🌿 All data is clean 🌱");
				children._clearButton.set_subtitle("No orphaned items found");
				children._clearButton.set_sensitive(false);
			} else {
				children._clearButton.set_title("Clear Orphaned Data");
				children._clearButton.set_subtitle(
					`Remove ${orphaned.length} orphaned item${orphaned.length === 1 ? "" : "s"}`,
				);
				children._clearButton.set_sensitive(true);
			}
		}
	},
);
