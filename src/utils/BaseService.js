const logger = require('./Logger');

class BaseService {
    constructor() {
        this.serviceName = this.constructor.name;
        this.isInitialized = false;
        this.serviceStatus = 'inactive';
        this.serviceMetrics = {
            operationsCount: 0,
            successCount: 0,
            errorCount: 0,
            lastOperation: null,
            lastError: null,
            startTime: new Date()
        };
    }

    logInfo(message, data = null) {
        logger.info(`[${this.serviceName}] ${message}`, data);
    }

    logError(message, error = null) {
        logger.error(`[${this.serviceName}] ${message}`, error);
        this._updateMetrics('error', error);
    }

    logDebug(message, data = null) {
        logger.debug(`[${this.serviceName}] ${message}`, data);
    }

    logWarn(message, data = null) {
        logger.warn(`[${this.serviceName}] ${message}`, data);
    }

    handleServiceError(error, operation) {
        this.logError(`${operation} failed`, error);
        this._updateMetrics('error', error);
        throw new Error(`${this.serviceName}: ${operation} failed - ${error.message}`);
    }

    async executeWithRetry(operation, maxRetries = 3, delayMs = 1000) {
        let lastError;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                this._updateMetrics('operation');
                const result = await operation();
                this._updateMetrics('success');
                return result;
            } catch (error) {
                lastError = error;
                this.logWarn(`Attempt ${attempt}/${maxRetries} failed: ${error.message}`);

                if (attempt < maxRetries) {
                    await this._delay(delayMs * attempt);
                }
            }
        }

        throw this.handleServiceError(lastError, 'operation with retry');
    }

    async executeWithTimeout(operation, timeoutMs = 30000) {
        return Promise.race([
            operation(),
            new Promise((_, reject) =>
                setTimeout(() => reject(new Error(`Operation timed out after ${timeoutMs}ms`)), timeoutMs)
            )
        ]);
    }

    async executeWithCircuitBreaker(operation, failureThreshold = 5, resetTimeoutMs = 60000) {
        if (!this._circuitBreaker) {
            this._circuitBreaker = {
                failures: 0,
                state: 'closed',
                lastFailureTime: null
            };
        }

        if (this._circuitBreaker.state === 'open') {
            const timeSinceLastFailure = Date.now() - this._circuitBreaker.lastFailureTime;
            if (timeSinceLastFailure < resetTimeoutMs) {
                throw new Error(`${this.serviceName} circuit breaker is open. Service temporarily unavailable.`);
            }
            this._circuitBreaker.state = 'half-open';
        }

        try {
            const result = await operation();

            if (this._circuitBreaker.state === 'half-open') {
                this._circuitBreaker.state = 'closed';
                this._circuitBreaker.failures = 0;
                this.logInfo('Circuit breaker reset - service restored');
            }

            return result;
        } catch (error) {
            this._circuitBreaker.failures++;
            this._circuitBreaker.lastFailureTime = Date.now();

            if (this._circuitBreaker.failures >= failureThreshold) {
                this._circuitBreaker.state = 'open';
                this.logError(`Circuit breaker opened after ${failureThreshold} failures`);
            }

            throw error;
        }
    }

    validateConfiguration(requiredConfig = []) {
        const missingConfig = [];

        for (const config of requiredConfig) {
            if (!process.env[config]) {
                missingConfig.push(config);
            }
        }

        if (missingConfig.length > 0) {
            throw new Error(`${this.serviceName} missing required configuration: ${missingConfig.join(', ')}`);
        }
    }

    async healthCheck() {
        try {
            const health = await this._performHealthCheck();
            return {
                service: this.serviceName,
                status: 'healthy',
                timestamp: new Date().toISOString(),
                uptime: this._getUptime(),
                metrics: this.getMetrics(),
                ...health
            };
        } catch (error) {
            return {
                service: this.serviceName,
                status: 'unhealthy',
                timestamp: new Date().toISOString(),
                error: error.message,
                metrics: this.getMetrics()
            };
        }
    }

    async initialize() {
        try {
            this.logInfo('Initializing service...');
            await this._performInitialization();
            this.isInitialized = true;
            this.serviceStatus = 'active';
            this.logInfo('Service initialized successfully');
        } catch (error) {
            this.serviceStatus = 'error';
            throw this.handleServiceError(error, 'service initialization');
        }
    }

    async shutdown() {
        try {
            this.logInfo('Shutting down service...');
            await this._performShutdown();
            this.serviceStatus = 'inactive';
            this.logInfo('Service shut down successfully');
        } catch (error) {
            this.logError('Error during service shutdown', error);
            throw error;
        }
    }

    getMetrics() {
        return {
            ...this.serviceMetrics,
            uptime: this._getUptime(),
            successRate: this._calculateSuccessRate(),
            status: this.serviceStatus,
            isInitialized: this.isInitialized
        };
    }

    resetMetrics() {
        this.serviceMetrics = {
            operationsCount: 0,
            successCount: 0,
            errorCount: 0,
            lastOperation: null,
            lastError: null,
            startTime: new Date()
        };
        this.logInfo('Service metrics reset');
    }

    createRateLimiter(requestsPerMinute = 60) {
        if (!this._rateLimiter) {
            this._rateLimiter = {
                requests: [],
                limit: requestsPerMinute
            };
        }

        return () => {
            const now = Date.now();
            const oneMinuteAgo = now - 60000;

            this._rateLimiter.requests = this._rateLimiter.requests.filter(time => time > oneMinuteAgo);

            if (this._rateLimiter.requests.length >= this._rateLimiter.limit) {
                throw new Error(`${this.serviceName} rate limit exceeded: ${requestsPerMinute} requests per minute`);
            }

            this._rateLimiter.requests.push(now);
        };
    }

    async _performHealthCheck() {
        return { details: 'Base health check passed' };
    }

    async _performInitialization() {
        this.logDebug('Base initialization completed');
    }

    async _performShutdown() {
        this.logDebug('Base shutdown completed');
    }

    _updateMetrics(type, error = null) {
        const now = new Date();

        if (type === 'operation') {
            this.serviceMetrics.operationsCount++;
            this.serviceMetrics.lastOperation = now;
        } else if (type === 'success') {
            this.serviceMetrics.successCount++;
        } else if (type === 'error') {
            this.serviceMetrics.errorCount++;
            this.serviceMetrics.lastError = {
                timestamp: now,
                message: error?.message || 'Unknown error'
            };
        }
    }

    _getUptime() {
        return Math.floor((Date.now() - this.serviceMetrics.startTime.getTime()) / 1000);
    }

    _calculateSuccessRate() {
        const total = this.serviceMetrics.operationsCount;
        if (total === 0) return 100;
        return Math.round((this.serviceMetrics.successCount / total) * 100);
    }

    async _delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    _ensureInitialized() {
        if (!this.isInitialized) {
            throw new Error(`${this.serviceName} is not initialized. Call initialize() first.`);
        }
    }

    _validateInput(input, validationRules = {}) {
        const errors = [];

        for (const [field, rules] of Object.entries(validationRules)) {
            const value = input[field];

            if (rules.required && (value === undefined || value === null || value === '')) {
                errors.push(`${field} is required`);
                continue;
            }

            if (value !== undefined && value !== null) {
                if (rules.type && typeof value !== rules.type) {
                    errors.push(`${field} must be of type ${rules.type}`);
                }

                if (rules.minLength && value.length < rules.minLength) {
                    errors.push(`${field} must be at least ${rules.minLength} characters long`);
                }

                if (rules.maxLength && value.length > rules.maxLength) {
                    errors.push(`${field} must be at most ${rules.maxLength} characters long`);
                }

                if (rules.pattern && !rules.pattern.test(value)) {
                    errors.push(`${field} format is invalid`);
                }

                if (rules.customValidator && !rules.customValidator(value)) {
                    errors.push(rules.customMessage || `${field} validation failed`);
                }
            }
        }

        if (errors.length > 0) {
            throw new Error(`Validation failed: ${errors.join(', ')}`);
        }
    }
}

module.exports = BaseService;