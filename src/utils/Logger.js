const fs = require('fs');
const path = require('path');

class Logger {
    constructor() {
        this.logDir = path.join(process.cwd(), 'logs');
        this.ensureLogDirectory();
        this.logLevels = {
            ERROR: 0,
            WARN: 1,
            INFO: 2,
            DEBUG: 3
        };
        this.currentLevel = process.env.LOG_LEVEL ?
            this.logLevels[process.env.LOG_LEVEL.toUpperCase()] :
            this.logLevels.INFO;

        this.locale = process.env.LOG_LOCALE || 'en-PH';
        this.timezone = process.env.LOG_TIMEZONE || 'Asia/Manila';
    }

    ensureLogDirectory() {
        if (!fs.existsSync(this.logDir)) {
            fs.mkdirSync(this.logDir, { recursive: true });
        }
    }

    formatTimestamp() {
        const now = new Date();
        const date = now.toLocaleDateString(this.locale, {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            timeZone: this.timezone
        });
        const time = now.toLocaleTimeString(this.locale, {
            hour12: true,
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            timeZone: this.timezone
        });
        return `${date} ${time}`;
    }

    formatMessage(level, message, data = null) {
        const timestamp = this.formatTimestamp();
        const pid = process.pid;
        const formattedMessage = data ? `${message} ${JSON.stringify(data)}` : message;
        return `[${timestamp}] [${pid}] [${level}] ${formattedMessage}`;
    }

    writeToFile(level, formattedMessage) {
        const logFile = path.join(this.logDir, 'app.log');
        const errorLogFile = path.join(this.logDir, 'error.log');

        fs.appendFileSync(logFile, formattedMessage + '\n');

        if (level === 'ERROR') {
            fs.appendFileSync(errorLogFile, formattedMessage + '\n');
        }
    }

    log(level, message, data = null) {
        if (this.logLevels[level] <= this.currentLevel) {
            const formattedMessage = this.formatMessage(level, message, data);

            if (process.env.NODE_ENV !== 'production') {
                const colors = {
                    ERROR: '\x1b[31m',
                    WARN: '\x1b[33m',
                    INFO: '\x1b[36m',
                    DEBUG: '\x1b[37m'
                };
                console.log(`${colors[level]}%s\x1b[0m`, formattedMessage);
            }

            this.writeToFile(level, formattedMessage);
        }
    }

    error(message, data = null) {
        this.log('ERROR', message, data);
    }

    warn(message, data = null) {
        this.log('WARN', message, data);
    }

    info(message, data = null) {
        this.log('INFO', message, data);
    }

    debug(message, data = null) {
        this.log('DEBUG', message, data);
    }

    dbLog(sql, timing) {
        if (process.env.NODE_ENV === 'development') {
            this.debug(`[DB] ${sql} (${timing}ms)`);
        }
    }
}

const logger = new Logger();
module.exports = logger;