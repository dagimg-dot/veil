import type Gio from "gi://Gio";
import type GLib from "gi://GLib";

const PROJECT_NAME = "Veil";

/** GSettings `logging-level` string values in ComboRow and verbosity order. */
export const LOGGING_LEVELS = ["error", "warn", "info", "debug"] as const;
export type LoggingLevel = (typeof LOGGING_LEVELS)[number];

export const DEFAULT_LOG_LEVEL: LoggingLevel = "info";

export type LogError = Error | GLib.Error;

type LogValue = string | number | boolean | null | undefined | object;

export type LogData =
    | string
    | number
    | boolean
    | LogError
    | Record<string, LogValue>;

/** Index of a `logging-level` value in LOGGING_LEVELS, falling back to the default. */
export const getVerbosity = (level: string): number => {
    const idx = (LOGGING_LEVELS as readonly string[]).indexOf(
        level.toLowerCase(),
    );
    return idx >= 0 ? idx : LOGGING_LEVELS.indexOf(DEFAULT_LOG_LEVEL);
};

// Global verbosity threshold for logger
let currentVerbosity: number = getVerbosity(DEFAULT_LOG_LEVEL);

export const initializeLogger = (settings: Gio.Settings) => {
    const levelString = settings.get_string("logging-level");
    currentVerbosity = getVerbosity(levelString);

    // Listen for log level changes
    settings.connectObject(
        "changed::logging-level",
        () => {
            const newLevelString = settings.get_string("logging-level");
            currentVerbosity = getVerbosity(newLevelString);
            info(`Log level changed to: ${newLevelString}`);
        },
        logger,
    );

    info(`Logger initialized with level: ${levelString}`);
};

export const deinitializeLogger = (settings: Gio.Settings) => {
    settings.disconnectObject(logger);
};

const isErrorLike = (data: LogData): data is LogError =>
    data instanceof Error ||
    (typeof data === "object" &&
        "message" in data &&
        typeof data.message === "string");

// Single write function — all console output routes through here
const write = (prefix: string, message: string, data?: LogData) => {
    const lines = [`${prefix}: ${message}`];
    if (data !== undefined) {
        if (isErrorLike(data)) {
            // String() keeps the message: SpiderMonkey stacks hold frames only
            lines.push(`${prefix}:   ${String(data)}`);
            if (data.stack) {
                lines.push(`${prefix}:   ${data.stack.trimEnd()}`);
            }
        } else if (typeof data === "object") {
            for (const [key, value] of Object.entries(data)) {
                lines.push(`${prefix}:   ${key}: ${value}`);
            }
        } else {
            lines.push(`${prefix}: ${data}`);
        }
    }
    console.log(lines.join("\n"));
};

const log = (level: LoggingLevel, message: string, data?: LogData) => {
    if (LOGGING_LEVELS.indexOf(level) > currentVerbosity) return;

    const timestamp = new Date().toISOString();
    const prefix = `[${PROJECT_NAME}] ${timestamp} ${level.toUpperCase()}`;
    write(prefix, message, data);
};

const debug = (message: string, data?: LogData) => {
    log("debug", message, data);
};

const info = (message: string, data?: LogData) => {
    log("info", message, data);
};

const warn = (message: string, data?: LogData) => {
    log("warn", message, data);
};

const error = (message: string, err?: LogError) => {
    log("error", message, err);
};

export const logger = {
    debug,
    info,
    warn,
    error,
};
