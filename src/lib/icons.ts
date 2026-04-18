import Gio from "gi://Gio";

const ICONS = ["arrow-open", "arrow-close"] as const;
type ICON = (typeof ICONS)[number];

export class Icons {
	static #icons = new Map<ICON, Gio.Icon>();
	static #extPath = "";
	static #settings: Gio.Settings | null = null;
	static #customOpenHandlerId: number | null = null;
	static #customCloseHandlerId: number | null = null;

	constructor(extPath: string, settings?: Gio.Settings) {
		Icons.#extPath = extPath;
		Icons.#settings = settings || null;

		this.loadIcons();

		// Watch for settings changes
		if (Icons.#settings) {
			Icons.#customOpenHandlerId = Icons.#settings.connect(
				"changed::custom-open-icon",
				() => {
					this.loadIcon("arrow-open");
				},
			);

			Icons.#customCloseHandlerId = Icons.#settings.connect(
				"changed::custom-close-icon",
				() => {
					this.loadIcon("arrow-close");
				},
			);
		}
	}

	/** Disconnect settings signals (call from extension `disable()` while settings is still valid). */
	static teardown(settings: Gio.Settings) {
		if (Icons.#customOpenHandlerId !== null) {
			settings.disconnect(Icons.#customOpenHandlerId);
			Icons.#customOpenHandlerId = null;
		}
		if (Icons.#customCloseHandlerId !== null) {
			settings.disconnect(Icons.#customCloseHandlerId);
			Icons.#customCloseHandlerId = null;
		}
		Icons.#settings = null;
	}

	private loadIcons() {
		for (const name of ICONS) {
			this.loadIcon(name);
		}
	}

	private loadIcon(name: ICON) {
		let iconPath: string | null = null;

		// Try to load custom icon if settings available and it's arrow-open or arrow-close
		if (Icons.#settings && (name === "arrow-open" || name === "arrow-close")) {
			const settingsKey =
				name === "arrow-open" ? "custom-open-icon" : "custom-close-icon";
			const customPath = Icons.#settings.get_string(settingsKey);

			if (customPath && customPath.length > 0) {
				const file = Gio.File.new_for_path(customPath);

				if (file.query_exists(null)) {
					iconPath = customPath;
				}
			}
		}

		// Fallback to default icon if no custom icon or custom icon doesn't exist
		if (!iconPath) {
			iconPath = `${Icons.#extPath}/assets/icons/${name}.svg`;
		}

		try {
			const icon = Gio.icon_new_for_string(iconPath);
			Icons.#icons.set(name, icon);
		} catch (e) {
			// If loading fails, try default as last resort
			if (iconPath.includes("/assets/icons/")) {
				throw e;
			}
			const defaultPath = `${Icons.#extPath}/assets/icons/${name}.svg`;
			const icon = Gio.icon_new_for_string(defaultPath);
			Icons.#icons.set(name, icon);
		}
	}

	static get(name: ICON) {
		return Icons.#icons.get(name);
	}
}
