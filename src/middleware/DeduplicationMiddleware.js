const logger = require('../utils/Logger');

class DeduplicationMiddleware {
    constructor() {
        this.activeRequests = new Map();
        this.requestCounts = new Map();
        this.cleanupInterval = this._startCleanupInterval();
    }

    static getInstance() {
        if (!DeduplicationMiddleware.instance) {
            DeduplicationMiddleware.instance = new DeduplicationMiddleware();
        }
        return DeduplicationMiddleware.instance;
    }

    deduplicate(keyGenerator, options = {}) {
        const config = {
            ttl: 60000,
            maxRetries: 3,
            cleanupInterval: 300000,
            ...options
        };

        return async (req, res, next) => {
            try {
                const key = this._generateKey(keyGenerator, req);

                if (this._isDuplicateRequest(key)) {
                    return this._handleDuplicateRequest(res, key);
                }

                this._registerRequest(key, config.ttl);
                this._attachCleanupListener(res, key);

                next();
            } catch (error) {
                this._handleError(error, res);
            }
        };
    }

    _generateKey(keyGenerator, req) {
        if (typeof keyGenerator !== 'function') {
            throw new Error('Key generator must be a function');
        }

        const key = keyGenerator(req);
        if (!key || typeof key !== 'string') {
            throw new Error('Key generator must return a non-empty string');
        }

        return key;
    }

    _isDuplicateRequest(key) {
        const requestData = this.activeRequests.get(key);
        if (!requestData) {
            return false;
        }

        if (this._isRequestExpired(requestData)) {
            this._removeRequest(key);
            return false;
        }

        this._incrementRetryCount(key);
        return true;
    }

    _isRequestExpired(requestData) {
        return Date.now() > requestData.expiresAt;
    }

    _incrementRetryCount(key) {
        const count = this.requestCounts.get(key) || 0;
        this.requestCounts.set(key, count + 1);
    }

    _registerRequest(key, ttl) {
        const requestData = {
            timestamp: Date.now(),
            expiresAt: Date.now() + ttl
        };

        this.activeRequests.set(key, requestData);
        this._logRequestRegistration(key);
    }

    _attachCleanupListener(res, key) {
        const cleanupRequest = () => {
            this._removeRequest(key);
        };

        res.on('finish', cleanupRequest);
        res.on('close', cleanupRequest);
        res.on('error', cleanupRequest);
    }

    _removeRequest(key) {
        this.activeRequests.delete(key);
        this.requestCounts.delete(key);
    }

    _handleDuplicateRequest(res, key) {
        const retryCount = this.requestCounts.get(key) || 0;

        this._logDuplicateRequest(key, retryCount);

        return res.status(429).json({
            success: false,
            message: 'Duplicate request detected. Please wait.',
            retryAfter: this._getRetryAfter(key),
            attemptCount: retryCount
        });
    }

    _getRetryAfter(key) {
        const requestData = this.activeRequests.get(key);
        if (!requestData) {
            return 0;
        }

        const remainingTime = requestData.expiresAt - Date.now();
        return Math.max(0, Math.ceil(remainingTime / 1000));
    }

    _handleError(error, res) {
        logger.error('[DeduplicationMiddleware] Error occurred:', error);

        res.status(500).json({
            success: false,
            message: 'Internal server error in deduplication middleware'
        });
    }

    _startCleanupInterval() {
        return setInterval(() => {
            this._cleanupExpiredRequests();
        }, 300000);
    }

    _cleanupExpiredRequests() {
        const now = Date.now();
        let cleanedCount = 0;

        for (const [key, requestData] of this.activeRequests.entries()) {
            if (now > requestData.expiresAt) {
                this._removeRequest(key);
                cleanedCount++;
            }
        }

        if (cleanedCount > 0) {
            logger.info(`[DeduplicationMiddleware] Cleaned up ${cleanedCount} expired requests`);
        }
    }

    _logRequestRegistration(key) {
        logger.debug(`[DeduplicationMiddleware] Registered request: ${key}`);
    }

    _logDuplicateRequest(key, retryCount) {
        logger.warn(`[DeduplicationMiddleware] Duplicate request detected: ${key} (attempt ${retryCount})`);
    }

    getActiveRequestsCount() {
        return this.activeRequests.size;
    }

    getRequestStats() {
        return {
            activeRequests: this.activeRequests.size,
            totalRetries: Array.from(this.requestCounts.values()).reduce((sum, count) => sum + count, 0)
        };
    }

    clearAllRequests() {
        this.activeRequests.clear();
        this.requestCounts.clear();
        logger.info('[DeduplicationMiddleware] Cleared all active requests');
    }

    destroy() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }
        this.clearAllRequests();
    }

    static deduplicate(keyGenerator, options = {}) {
        return DeduplicationMiddleware.getInstance().deduplicate(keyGenerator, options);
    }
}

DeduplicationMiddleware.instance = null;

module.exports = DeduplicationMiddleware;