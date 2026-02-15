import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import { logger } from '@whatsapp-notif/shared';
import Fastify, { FastifyInstance } from 'fastify';
import { errorHandler } from './middleware/errorHandler';
import { healthRoutes } from './routes/health';
import { notificationRoutes } from './routes/notifications';
import { webhookRoutes } from './routes/webhooks';
import { analyticsRoutes } from './routes/analytics';

/**
 * Build and configure Fastify application
 */
export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: logger as unknown as boolean,
    requestIdHeader: 'x-trace-id',
    requestIdLogLabel: 'trace_id',
    disableRequestLogging: false,
  });

  // Register plugins
  await app.register(helmet, {
    contentSecurityPolicy: false,
  });

  await app.register(cors, {
    origin: process.env.CORS_ORIGIN || '*',
    credentials: true,
  });

  // Register error handler
  app.setErrorHandler(errorHandler);

  // Health check endpoint
  app.get('/health', () => {
    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
    };
  });

  // Root endpoint
  app.get('/', () => {
    return {
      service: 'WhatsApp Notification Service',
      version: '1.0.0',
      documentation: '/docs',
    };
  });

  // Register routes
  await app.register(healthRoutes);
  await app.register(notificationRoutes);
  await app.register(webhookRoutes);
  await app.register(analyticsRoutes);

  return app;
}
