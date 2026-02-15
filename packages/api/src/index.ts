import { logger, initSentry, addCloudWatchLogging } from '@whatsapp-notif/shared';
import { buildApp } from './app';
import { config } from './config';

/**
 * API Server entry point
 */

async function main() {
  try {
    // Initialize monitoring
    initSentry(process.env.SENTRY_DSN, config.nodeEnv);
    
    // Add CloudWatch logging in production
    if (config.nodeEnv === 'production') {
      addCloudWatchLogging(logger as any, true, {
        logGroupName: '/whatsapp-notif/api',
        logStreamName: `api-${new Date().toISOString().split('T')[0]}`,
        awsRegion: process.env.AWS_REGION || 'us-east-1',
      });
    }

    const app = await buildApp();

    const port = config.port;
    const host = config.host;

    await app.listen({ port, host });

    logger.info(`API server running on http://${host}:${port}`);

    // Graceful shutdown
    const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];
    signals.forEach((signal) => {
      process.on(signal, () => {
        logger.info(`Received ${signal}, shutting down gracefully...`);
        void app.close().then(() => {
          process.exit(0);
        });
      });
    });
  } catch (error) {
    logger.error('Failed to start server', error);
    process.exit(1);
  }
}

start().catch((error) => {
  logger.error('Unhandled error during startup', error);
  process.exit(1);
});
