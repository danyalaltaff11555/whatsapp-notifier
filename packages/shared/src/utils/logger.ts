import pino from 'pino';

/**
 * Centralized logger using Pino
 */

const isDevelopment = process.env.NODE_ENV !== 'production';

export const logger = pino({
    level: process.env.LOG_LEVEL || (isDevelopment ? 'debug' : 'info'),
    transport: isDevelopment
        ? {
            target: 'pino-pretty',
            options: {
                colorize: true,
                translateTime: 'HH:MM:ss',
                ignore: 'pid,hostname',
            },
        }
        : undefined,
    formatters: {
        level: (label) => {
            return { level: label };
        },
    },
    base: {
        env: process.env.NODE_ENV,
    },
    timestamp: pino.stdTimeFunctions.isoTime,
});

/**
 * Enhanced logger with Sentry integration
 */
export const enhancedLogger = {
    info: (message: string, meta?: any) => logger.info(meta, message),
    warn: (message: string, meta?: any) => logger.warn(meta, message),
    debug: (message: string, meta?: any) => logger.debug(meta, message),
    error: (message: string, meta?: any) => {
        logger.error(meta, message);

        // Send to Sentry if available
        if (meta?.error instanceof Error) {
            try {
                const { captureException } = require('../monitoring/sentry');
                captureException(meta.error, { message, ...meta });
            } catch (e) {
                // Sentry not initialized, skip
            }
        }
    },
};

/**
 * Create a child logger with additional context
 */
export function createLogger(context: Record<string, unknown>): pino.Logger {
    return logger.child(context);
}

/**
 * Add correlation ID to logger context
 */
export function withTraceId(traceId: string): pino.Logger {
    return logger.child({ trace_id: traceId });
}

export default logger;
