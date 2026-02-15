import { FastifyReply, FastifyRequest } from 'fastify';
import { logger } from '@whatsapp-notif/shared';

/**
 * API key authentication middleware
 */

const VALID_API_KEYS = new Set(
  (process.env.API_KEYS || 'test-key').split(',')
);

export async function authenticateApiKey(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const apiKey = request.headers['x-api-key'] as string;

  if (!apiKey) {
    logger.warn('Missing API key', {
      path: request.url,
      ip: request.ip,
    });

    return reply.status(401).send({
      error: 'Unauthorized',
      message: 'API key is required',
      code: 'MISSING_API_KEY',
    });
  }

  if (!VALID_API_KEYS.has(apiKey)) {
    logger.warn('Invalid API key', {
      path: request.url,
      ip: request.ip,
      apiKey: apiKey.substring(0, 8) + '...',
    });

    return reply.status(401).send({
      error: 'Unauthorized',
      message: 'Invalid API key',
      code: 'INVALID_API_KEY',
    });
  }

  // Attach API key to request for later use
  (request as any).apiKey = apiKey;

  logger.debug('API key authenticated', {
    apiKey: apiKey.substring(0, 8) + '...',
  });
}
