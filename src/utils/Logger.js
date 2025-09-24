const fs = require('fs');
const path = require('path');

class Logger {
    constructor(options = {}) {
        this.logDir = options.logDir || path.join(process.cwd(), 'logs');
        this.logLevels = {
            ERROR: 0,
            WARN: 1,
            INFO: 2,
            DEBUG: 3,
            TRACE: 4
        };

        this.currentLevel = this._parseLogLevel(
            options.logLevel || process.env.LOG_LEVEL || 'INFO'
        );

        this.locale = options.locale || process.env.LOG_LOCALE || 'en-PH';
        this.timezone = options.timezone || process.env.LOG_TIMEZONE || 'Asia/Manila';
        this.maxFileSize = options.maxFileSize || 10 * 1024 * 1024;
        this.maxFiles = options.maxFiles || 5;
        this.enableColors = options.enableColors !== false;

        this._initialize();
    }

    _initialize() {
        this._ensureLogDirectory();
        this._setupLogRotation();
        this._logStartupMessage();
    }

    _parseLogLevel(level) {
        const upperLevel = level.toUpperCase();
        return this.logLevels[upperLevel] !== undefined
            ? this.logLevels[upperLevel]
            : this.logLevels.INFO;
    }

    _ensureLogDirectory() {
        try {
            if (!fs.existsSync(this.logDir)) {
                fs.mkdirSync(this.logDir, { recursive: true });
            }
        } catch (error) {
            console.error('Failed to create log directory:', error);
            this.logDir = process.cwd();
        }
    }

    _setupLogRotation() {
        this._rotateIfNeeded();
    }

    _logStartupMessage() {
        this.info('Logger initialized', {
            logLevel: Object.keys(this.logLevels)[this.currentLevel],
            logDir: this.logDir,
            timezone: this.timezone,
            locale: this.locale
        });
    }

    formatTimestamp() {
        const now = new Date();

        try {
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
        } catch (error) {
            return now.toISOString();
        }
    }

    formatMessage(level, message, data = null, metadata = {}) {
        const timestamp = this.formatTimestamp();
        const pid = process.pid;
        const requestId = metadata.requestId || '';
        const userId = metadata.userId || '';

        let formattedMessage = message;

        if (data !== null && data !== undefined) {
            if (typeof data === 'object') {
                try {
                    formattedMessage += ` ${JSON.stringify(data, this._jsonReplacer, 2)}`;
                } catch (error) {
                    formattedMessage += ` [Circular/Invalid JSON: ${error.message}]`;
                }
            } else {
                formattedMessage += ` ${data}`;
            }
        }

        const parts = [
            `[${timestamp}]`,
            `[${pid}]`,
            `[${level}]`
        ];

        if (requestId) parts.push(`[${requestId}]`);
        if (userId) parts.push(`[${userId}]`);

        return `${parts.join(' ')} ${formattedMessage}`;
    }

    _jsonReplacer(key, value) {
        if (typeof value === 'object' && value !== null) {
            if (value.constructor === Object || Array.isArray(value)) {
                return value;
            }
            return '[Complex Object]';
        }

        const sensitiveFields = ['password', 'pin', 'token', 'secret', 'key', 'authorization'];
        if (sensitiveFields.some(field => key.toLowerCase().includes(field))) {
            return '[REDACTED]';
        }

        return value;
    }

    _getLogFilePath(type = 'app') {
        return path.join(this.logDir, `${type}.log`);
    }

    _rotateIfNeeded() {
        const appLogPath = this._getLogFilePath('app');
        const errorLogPath = this._getLogFilePath('error');

        this._rotateFile(appLogPath);
        this._rotateFile(errorLogPath);
    }

    _rotateFile(filePath) {
        if (!fs.existsSync(filePath)) {
            return;
        }

        try {
            const stats = fs.statSync(filePath);
            if (stats.size > this.maxFileSize) {
                const timestamp = new Date().toISOString().split('T')[0];
                const extension = path.extname(filePath);
                const basename = path.basename(filePath, extension);
                const dirname = path.dirname(filePath);

                const rotatedPath = path.join(dirname, `${basename}-${timestamp}${extension}`);

                fs.renameSync(filePath, rotatedPath);
                this._cleanupOldLogs(dirname, basename, extension);
            }
        } catch (error) {
            console.error('Log rotation failed:', error);
        }
    }

    _cleanupOldLogs(dirname, basename, extension) {
        try {
            const files = fs.readdirSync(dirname)
                .filter(file => file.startsWith(basename) && file.endsWith(extension))
                .map(file => ({
                    name: file,
                    path: path.join(dirname, file),
                    stats: fs.statSync(path.join(dirname, file))
                }))
                .sort((a, b) => b.stats.mtime - a.stats.mtime);

            if (files.length > this.maxFiles) {
                files.slice(this.maxFiles).forEach(file => {
                    try {
                        fs.unlinkSync(file.path);
                    } catch (error) {
                        console.error('Failed to delete old log file:', error);
                    }
                });
            }
        } catch (error) {
            console.error('Failed to cleanup old logs:', error);
        }
    }

    _writeToFile(level, formattedMessage) {
        try {
            this._rotateIfNeeded();

            const logFile = this._getLogFilePath('app');
            fs.appendFileSync(logFile, formattedMessage + '\n', { encoding: 'utf8' });

            if (level === 'ERROR') {
                const errorLogFile = this._getLogFilePath('error');
                fs.appendFileSync(errorLogFile, formattedMessage + '\n', { encoding: 'utf8' });
            }
        } catch (error) {
            console.error('Failed to write to log file:', error);
        }
    }

    _getColorCode(level) {
        const colors = {
            ERROR: '\x1b[31m',
            WARN: '\x1b[33m',
            INFO: '\x1b[36m',
            DEBUG: '\x1b[37m',
            TRACE: '\x1b[90m'
        };
        return colors[level] || '\x1b[37m';
    }

    _shouldLogToConsole() {
        return process.env.NODE_ENV !== 'production' || process.env.FORCE_CONSOLE_LOG === 'true';
    }

    log(level, message, data = null, metadata = {}) {
        if (this.logLevels[level] <= this.currentLevel) {
            const formattedMessage = this.formatMessage(level, message, data, metadata);

            if (this._shouldLogToConsole()) {
                if (this.enableColors) {
                    const colorCode = this._getColorCode(level);
                    console.log(`${colorCode}%s\x1b[0m`, formattedMessage);
                } else {
                    console.log(formattedMessage);
                }
            }

            this._writeToFile(level, formattedMessage);
        }
    }

    error(message, data = null, metadata = {}) {
        if (data instanceof Error) {
            const errorData = {
                message: data.message,
                stack: data.stack,
                name: data.name,
                code: data.code
            };
            this.log('ERROR', message, errorData, metadata);
        } else {
            this.log('ERROR', message, data, metadata);
        }
    }

    warn(message, data = null, metadata = {}) {
        this.log('WARN', message, data, metadata);
    }

    info(message, data = null, metadata = {}) {
        this.log('INFO', message, data, metadata);
    }

    debug(message, data = null, metadata = {}) {
        this.log('DEBUG', message, data, metadata);
    }

    trace(message, data = null, metadata = {}) {
        this.log('TRACE', message, data, metadata);
    }

    dbLog(sql, timing, metadata = {}) {
        if (process.env.NODE_ENV === 'development' || process.env.LOG_DB === 'true') {
            this.debug(`[DB] ${sql}`, { timing: `${timing}ms` }, metadata);
        }
    }

    httpLog(method, url, statusCode, responseTime, metadata = {}) {
        const level = statusCode >= 400 ? 'WARN' : 'INFO';
        this.log(level, `${method} ${url} ${statusCode}`, {
            responseTime: `${responseTime}ms`
        }, metadata);
    }

    securityLog(event, details, metadata = {}) {
        this.warn(`[SECURITY] ${event}`, details, { ...metadata, security: true });
    }

    performanceLog(operation, duration, metadata = {}) {
        this.info(`[PERFORMANCE] ${operation}`, {
            duration: `${duration}ms`
        }, metadata);
    }

    auditLog(action, user, details, metadata = {}) {
        this.info(`[AUDIT] ${action}`, {
            user,
            details
        }, { ...metadata, audit: true });
    }

    child(metadata = {}) {
        return new ChildLogger(this, metadata);
    }

    getCurrentLevel() {
        return Object.keys(this.logLevels)[this.currentLevel];
    }

    setLevel(level) {
        this.currentLevel = this._parseLogLevel(level);
        this.info(`Log level changed to: ${this.getCurrentLevel()}`);
    }

    flush() {
        
    }

    getStats() {
        try {
            const appLogPath = this._getLogFilePath('app');
            const errorLogPath = this._getLogFilePath('error');

            return {
                appLogSize: fs.existsSync(appLogPath) ? fs.statSync(appLogPath).size : 0,
                errorLogSize: fs.existsSync(errorLogPath) ? fs.statSync(errorLogPath).size : 0,
                currentLevel: this.getCurrentLevel(),
                logDir: this.logDir
            };
        } catch (error) {
            return {
                error: error.message,
                currentLevel: this.getCurrentLevel(),
                logDir: this.logDir
            };
        }
    }
}

class ChildLogger {
    constructor(parent, metadata = {}) {
        this.parent = parent;
        this.metadata = metadata;
    }

    _log(level, message, data, additionalMetadata = {}) {
        const combinedMetadata = { ...this.metadata, ...additionalMetadata };
        this.parent.log(level, message, data, combinedMetadata);
    }

    error(message, data = null, metadata = {}) {
        this._log('ERROR', message, data, metadata);
    }

    warn(message, data = null, metadata = {}) {
        this._log('WARN', message, data, metadata);
    }

    info(message, data = null, metadata = {}) {
        this._log('INFO', message, data, metadata);
    }

    debug(message, data = null, metadata = {}) {
        this._log('DEBUG', message, data, metadata);
    }

    trace(message, data = null, metadata = {}) {
        this._log('TRACE', message, data, metadata);
    }
}

const logger = new Logger();
module.exports = logger;