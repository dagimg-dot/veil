import type Gio from "gi://Gio";

export const INTERACTION_MODES = ["click", "hover"] as const;
export type InteractionMode = (typeof INTERACTION_MODES)[number];

/** The value if it is one of the options, otherwise the fallback (e.g. after a hand-edited dconf value). */
export const pickOption = <T extends string>(
    value: string,
    options: readonly T[],
    fallback: T,
): T => options.find((option) => option === value) ?? fallback;

export const readInteractionMode = (settings: Gio.Settings): InteractionMode =>
    pickOption(
        settings.get_string("interaction-mode"),
        INTERACTION_MODES,
        "click",
    );
