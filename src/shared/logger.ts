/**
 * StoryForge Structured Logger
 *
 * Provides structured logging with levels, subsystem tags, and VS Code output channel integration.
 * Falls back to console when running outside VS Code (e.g., in tests).
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  readonly timestamp: string;
  readonly level: LogLevel;
  readonly subsystem: string;
  readonly message: string;
  readonly data?: Record<string, unknown>;
}

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

let globalOutputChannel: { appendLine(value: string): void } | undefined;
let globalMinLevel: LogLevel = 'info';

/**
 * Configure the logger with a VS Code OutputChannel.
 * Call this once during extension activation.
 */
export function configureLogger(
  outputChannel: { appendLine(value: string): void },
  minLevel: LogLevel = 'info',
): void {
  globalOutputChannel = outputChannel;
  globalMinLevel = minLevel;
}

/**
 * Set the minimum log level globally.
 */
export function setLogLevel(level: LogLevel): void {
  globalMinLevel = level;
}

function formatEntry(entry: LogEntry): string {
  const data = entry.data ? ` ${JSON.stringify(entry.data)}` : '';
  return `[${entry.timestamp}] [${entry.level.toUpperCase()}] [${entry.subsystem}] ${entry.message}${data}`;
}

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[globalMinLevel];
}

function writeLog(entry: LogEntry): void {
  if (!shouldLog(entry.level)) {
    return;
  }

  const formatted = formatEntry(entry);

  if (globalOutputChannel) {
    globalOutputChannel.appendLine(formatted);
  }

  // Also write to console for development
  switch (entry.level) {
    case 'debug':
      console.debug(formatted);
      break;
    case 'info':
      console.log(formatted);
      break;
    case 'warn':
      console.warn(formatted);
      break;
    case 'error':
      console.error(formatted);
      break;
  }
}

/**
 * Create a scoped logger for a specific subsystem.
 */
export function createLogger(subsystem: string): Logger {
  return new Logger(subsystem);
}

export class Logger {
  constructor(private readonly subsystem: string) {}

  debug(message: string, data?: Record<string, unknown>): void {
    writeLog({
      timestamp: new Date().toISOString(),
      level: 'debug',
      subsystem: this.subsystem,
      message,
      data,
    });
  }

  info(message: string, data?: Record<string, unknown>): void {
    writeLog({
      timestamp: new Date().toISOString(),
      level: 'info',
      subsystem: this.subsystem,
      message,
      data,
    });
  }

  warn(message: string, data?: Record<string, unknown>): void {
    writeLog({
      timestamp: new Date().toISOString(),
      level: 'warn',
      subsystem: this.subsystem,
      message,
      data,
    });
  }

  error(message: string, error?: Error | unknown, data?: Record<string, unknown>): void {
    const errorData: Record<string, unknown> = { ...data };
    if (error instanceof Error) {
      errorData.errorName = error.name;
      errorData.errorMessage = error.message;
      errorData.stack = error.stack;
    } else if (error !== undefined) {
      errorData.error = String(error);
    }

    writeLog({
      timestamp: new Date().toISOString(),
      level: 'error',
      subsystem: this.subsystem,
      message,
      data: Object.keys(errorData).length > 0 ? errorData : undefined,
    });
  }

  /**
   * Create a child logger with a more specific subsystem scope.
   */
  child(childScope: string): Logger {
    return new Logger(`${this.subsystem}:${childScope}`);
  }
}
