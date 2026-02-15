import { FastifyInstance } from 'fastify';

/**
 * Health and monitoring routes
 */

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  // GET /v1/health - Health check
  app.get('/v1/health', async () => {
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      uptime: process.uptime(),
      dependencies: {
        sqs: 'connected', // TODO: Add actual health checks in Phase 4
        redis: 'not_implemented',
        database: 'not_implemented',
      },
    };

    return health;
  });

  // GET /v1/metrics - Prometheus metrics placeholder
  app.get('/v1/metrics', async () => {
    // TODO: Implement Prometheus metrics in Phase 5
    return {
      message: 'Metrics endpoint - to be implemented in Phase 5',
    };
  });
}
