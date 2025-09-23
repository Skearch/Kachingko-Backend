class DeduplicationMiddleware {
    constructor() {
        this.activeRequests = new Map();
    }

    deduplicate(keyGenerator) {
        return async (req, res, next) => {
            const key = keyGenerator(req);

            if (this.activeRequests.has(key)) {
                return res.status(429).json({
                    success: false,
                    message: 'Duplicate request detected. Please wait.'
                });
            }

            this.activeRequests.set(key, true);

            res.on('finish', () => {
                this.activeRequests.delete(key);
            });

            next();
        };
    }
}

module.exports = new DeduplicationMiddleware();