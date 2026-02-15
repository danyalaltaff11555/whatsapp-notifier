import { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { logger } from '@whatsapp-notif/shared';

/**
 * Global error handler
 */

export function errorHandler(
  error: FastifyError,
  request: FastifyRequest,
  reply: FastifyReply
): void {
  const traceId = request.id;

  // Log error with context
  logger.error('Request error', {
    traceId,
    error: {
      message: error.message,
      stack: error.stack,
      code: error.code,
    },
    request: {
      method: request.method,
      url: request.url,
      headers: request.headers,
    },
  });

  // Determine status code
  const statusCode = error.statusCode || 500;

  // Format error response
  const errorResponse: any = {
    error: error.name || 'Internal Server Error',
    message: error.message || 'An unexpected error occurred',
    code: error.code || 'INTERNAL_ERROR',
    traceId,
  };

  // Hide internal error details in production
  if (process.env.NODE_ENV === 'production' && statusCode === 500) {
    errorResponse.message = 'An unexpected error occurred';
    delete errorResponse.code;
  }

  reply.status(statusCode).send(errorResponse);
}
