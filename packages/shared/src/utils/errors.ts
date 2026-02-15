/**
 * Custom error classes for the application
 */

export class AppError extends Error {
    constructor(
        message: string,
        public statusCode: number = 500,
        public code: string = 'INTERNAL_ERROR',
        public isOperational: boolean = true
    ) {
        super(message);
        this.name = this.constructor.name;
        Error.captureStackTrace(this, this.constructor);
    }
}

export class ValidationError extends AppError {
    constructor(message: string, public errors?: any) {
        super(message, 400, 'VALIDATION_ERROR');
    }
}

export class AuthenticationError extends AppError {
    constructor(message: string = 'Authentication failed') {
        super(message, 401, 'AUTHENTICATION_ERROR');
    }
}

export class AuthorizationError extends AppError {
    constructor(message: string = 'Insufficient permissions') {
        super(message, 403, 'AUTHORIZATION_ERROR');
    }
}

export class NotFoundError extends AppError {
    constructor(resource: string) {
        super(`${resource} not found`, 404, 'NOT_FOUND');
    }
}

export class RateLimitError extends AppError {
    constructor(message: string = 'Rate limit exceeded') {
        super(message, 429, 'RATE_LIMIT_EXCEEDED');
    }
}

export class WhatsAppAPIError extends AppError {
    constructor(
        message: string,
        public whatsappErrorCode?: number,
        public isRetryable: boolean = false
    ) {
        super(message, 502, 'WHATSAPP_API_ERROR');
    }
}

export class DatabaseError extends AppError {
    constructor(message: string) {
        super(message, 500, 'DATABASE_ERROR', false);
    }
}

export class QueueError extends AppError {
    constructor(message: string) {
        super(message, 500, 'QUEUE_ERROR', false);
    }
}

/**
 * Check if error is retryable
 */
export function isRetryableError(error: Error): boolean {
    if (error instanceof WhatsAppAPIError) {
        return error.isRetryable;
    }

    // Network errors are generally retryable
    if (
        error.message.includes('ECONNRESET') ||
        error.message.includes('ETIMEDOUT') ||
        error.message.includes('ENOTFOUND')
    ) {
        return true;
    }

    return false;
}
