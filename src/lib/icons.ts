import Gio from "gi://Gio";

const ICONS = ["arrow-open", "arrow-close"] as const;
type ICON = (typeof ICONS)[number];

export class Icons {
    static #icons = new Map<ICON, Gio.Icon>();
    static #extPath = "";
    static #settings: Gio.Settings | null = null;

    constructor(extPath: string, settings?: Gio.Settings) {
        Icons.#extPath = extPath;
        Icons.#settings = settings || null;

        this.loadIcons();

        if (Icons.#settings) {
            Icons.#settings.connectObject(
                "changed::custom-open-icon",
                () => {
                    this.loadIcon("arrow-open");
                },
                "changed::custom-close-icon",
                () => {
                    this.loadIcon("arrow-close");
                },
                Icons,
            );
        }
    }

    static teardown(settings: Gio.Settings) {
        settings.disconnectObject(Icons);
        Icons.#settings = null;
    }

    private loadIcons() {
        for (const name of ICONS) {
            this.loadIcon(name);
        }
    }

    private loadIcon(name: ICON) {
        let iconPath: string | null = null;

        if (
            Icons.#settings &&
            (name === "arrow-open" || name === "arrow-close")
        ) {
            const settingsKey =
                name === "arrow-open"
                    ? "custom-open-icon"
                    : "custom-close-icon";
            const customPath = Icons.#settings.get_string(settingsKey);

            if (customPath && customPath.length > 0) {
                const file = Gio.File.new_for_path(customPath);

                if (file.query_exists(null)) {
                    iconPath = customPath;
                }
            }
        }

        if (!iconPath) {
            iconPath = `${Icons.#extPath}/assets/icons/${name}.svg`;
        }

        try {
            const icon = Gio.icon_new_for_string(iconPath);
            Icons.#icons.set(name, icon);
        } catch (e) {
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
