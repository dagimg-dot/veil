import type Gio from "gi://Gio";

const PROJECT_NAME = "Veil";

export enum LogLevel {
	ERROR = 0,
	WARN = 1,
	INFO = 2,
	DEBUG = 3,
}

const stringToLogLevel = (level: string): LogLevel => {
	switch (level.toLowerCase()) {
		case "error":
			return LogLevel.ERROR;
		case "warn":
			return LogLevel.WARN;
		case "info":
			return LogLevel.INFO;
		case "debug":
			return LogLevel.DEBUG;
		default:
			return LogLevel.INFO;
	}
};

let currentLogLevel: LogLevel = LogLevel.INFO;

export const initializeLogger = (settings: Gio.Settings) => {
	const levelString = settings.get_string("logging-level");
	currentLogLevel = stringToLogLevel(levelString);

	log(LogLevel.INFO, `Logger initialized with level: ${levelString}`);

	// Listen for log level changes
	settings.connect("changed::logging-level", () => {
		const newLevelString = settings.get_string("logging-level");
		currentLogLevel = stringToLogLevel(newLevelString);
		log(
			LogLevel.INFO,
			`Log level changed to: ${newLevelString}`,
			undefined,
			true,
		);
	});
};

const formatLogSuffix = (data: unknown): string => {
	if (typeof data === "object" && data !== null) {
		try {
			return ` ${JSON.stringify(data)}`;
		} catch {
			return " [Object]";
		}
	}
	return ` ${String(data)}`;
};

const log = (
	level: LogLevel,
	message: string,
	data?: unknown,
	logChange = false,
) => {
	// Early return if log level is too low
	if (level > currentLogLevel && !logChange) {
		return;
	}

	const timestamp = new Date().toISOString();
	const levelName = LogLevel[level];
	const prefix = `[${PROJECT_NAME}] ${timestamp} ${levelName}`;

	let line = `${prefix}: ${message}`;

	if (data) {
		line += formatLogSuffix(data);
	}

	console.log(line);
};

const debug = (message: string, data?: unknown) => {
	log(LogLevel.DEBUG, message, data);
};

const info = (message: string, data?: unknown) => {
	log(LogLevel.INFO, message, data);
};

const warn = (message: string, data?: unknown) => {
	log(LogLevel.WARN, message, data);
};

const error = (message: string, err?: unknown) => {
	const timestamp = new Date().toISOString();
	const prefix = `[${PROJECT_NAME}] ${timestamp} ERROR`;
	const line =
		err !== undefined
			? `${prefix}: ${message}: ${String(err)}`
			: `${prefix}: ${message}`;
	console.error(line);
};

export const logger = {
	debug,
	info,
	warn,
	error,
};
