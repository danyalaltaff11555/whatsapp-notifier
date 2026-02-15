import { FastifyReply, FastifyRequest } from 'fastify';
import { ZodError, ZodSchema } from 'zod';
import { logger } from '@whatsapp-notif/shared';

/**
 * Request validation middleware factory
 */

export function validateRequest(schema: ZodSchema) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      request.body = schema.parse(request.body);
    } catch (error) {
      if (error instanceof ZodError) {
        const errors = error.errors.map((err) => ({
          field: err.path.join('.'),
          message: err.message,
          code: err.code,
        }));

        logger.warn('Request validation failed', {
          path: request.url,
          errors,
        });

        return reply.status(400).send({
          error: 'Validation Error',
          message: 'Request validation failed',
          code: 'VALIDATION_ERROR',
          errors,
        });
      }

      logger.error('Unexpected validation error', { error });

      return reply.status(500).send({
        error: 'Internal Server Error',
        message: 'An unexpected error occurred',
        code: 'INTERNAL_ERROR',
      });
    }
  };
}
