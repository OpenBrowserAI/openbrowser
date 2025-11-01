export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  FATAL = 4,
  OFF = 5
}

export interface LoggerOptions {
  level?: LogLevel;
  prefix?: string;
  dateFormat?: boolean;
  transport?: Transport[];
}

export interface Transport {
  log(level: LogLevel, message: string): void;
}

export class ConsoleTransport implements Transport {
  log(level: LogLevel, message: string): void {
    const methods = {
      [LogLevel.DEBUG]: console.debug,
      [LogLevel.INFO]: console.info,
      [LogLevel.WARN]: console.warn,
      [LogLevel.ERROR]: console.error,
      [LogLevel.FATAL]: console.error,
      [LogLevel.OFF]: () => {}
    };
    const method = methods[level] || console.log;
    method(message);
  }
}

export class Logger {
  protected level: LogLevel;
  protected prefix: string;
  protected dateFormat: boolean;
  protected transports: Transport[];

  constructor(options: LoggerOptions = {}) {
    this.level = options.level ?? LogLevel.INFO;
    this.prefix = options.prefix ?? '';
    this.dateFormat = options.dateFormat ?? true;
    this.transports = options.transport ?? [new ConsoleTransport()];
  }

  public setLevel(level: LogLevel): this {
    this.level = level;
    return this;
  }

  public setPrefix(prefix: string): this {
    this.prefix = prefix;
    return this;
  }

  public addTransport(transport: Transport): this {
    this.transports.push(transport);
    return this;
  }

  protected formatMessage(level: LogLevel, message: string): string {
    const levelNames = {
      [LogLevel.DEBUG]: 'DEBUG',
      [LogLevel.INFO]: 'INFO',
      [LogLevel.WARN]: 'WARN',
      [LogLevel.ERROR]: 'ERROR',
      [LogLevel.FATAL]: 'FATAL',
      [LogLevel.OFF]: 'OFF'
    };

    let formattedMessage = '';

    if (this.dateFormat) {
      formattedMessage += `[${new Date().toLocaleString()}] `;
    }

    formattedMessage += `[${levelNames[level] || 'UNKNOWN'}] `;

    if (this.prefix) {
      formattedMessage += `[${this.prefix}] `;
    }

    formattedMessage += message;

    return formattedMessage;
  }

  protected log(level: LogLevel, message: string | Error, ...args: any[]): void {
    if (level < this.level) {
      return;
    }

    let finalMessage: string;

    if (message instanceof Error) {
      finalMessage = `${message.message}\n${message.stack}`;
    } else {
      finalMessage = message;
    }

    if (args.length > 0) {
      finalMessage += ' ' + args.map(arg => {
        if (arg == null || arg == undefined) {
          return arg + '';
        } else if (arg instanceof Error || (arg.stack && arg.message)) {
          return `${arg.message}\n${arg.stack}`;
        } else if (typeof arg === 'object') {
          return JSON.stringify(arg);
        }
        return String(arg);
      }).join(' ');
    }

    const formattedMessage = this.formatMessage(level, finalMessage);

    this.transports.forEach(transport => {
      transport.log(level, formattedMessage);
    });
  }

  public isEnableDebug() {
    return this.level <= LogLevel.DEBUG;
  }

  public debug(message: string | Error, ...args: any[]): void {
    this.log(LogLevel.DEBUG, message, ...args);
  }

  public isEnableInfo() {
    return this.level <= LogLevel.INFO;
  }

  public info(message: string | Error, ...args: any[]): void {
    this.log(LogLevel.INFO, message, ...args);
  }

  public warn(message: string | Error, ...args: any[]): void {
    this.log(LogLevel.WARN, message, ...args);
  }

  public error(message: string | Error, ...args: any[]): void {
    this.log(LogLevel.ERROR, message, ...args);
  }

  public fatal(message: string | Error, ...args: any[]): void {
    this.log(LogLevel.FATAL, message, ...args);
  }

  public createChild(name: string, options: Partial<LoggerOptions> = {}): Logger {
    const childPrefix = this.prefix ? `${this.prefix}.${name}` : name;
    
    return new Logger({
      level: options.level || this.level,
      prefix: childPrefix,
      dateFormat: options.dateFormat !== undefined ? options.dateFormat : this.dateFormat,
      transport: options.transport || this.transports
    });
  }
}

const Log = new Logger();

export default Log;
