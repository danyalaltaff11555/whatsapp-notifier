import winston from 'winston';
import WinstonCloudWatch from 'winston-cloudwatch';

/**
 * CloudWatch logging transport
 */

export function createCloudWatchTransport(config: {
  logGroupName: string;
  logStreamName: string;
  awsRegion: string;
  awsAccessKeyId?: string;
  awsSecretKey?: string;
}): winston.transport {
  return new WinstonCloudWatch({
    logGroupName: config.logGroupName,
    logStreamName: config.logStreamName,
    awsRegion: config.awsRegion,
    awsAccessKeyId: config.awsAccessKeyId,
    awsSecretKey: config.awsSecretKey,
    messageFormatter: ({ level, message, ...meta }) => {
      return JSON.stringify({
        level,
        message,
        timestamp: new Date().toISOString(),
        ...meta,
      });
    },
  });
}

/**
 * Add CloudWatch transport to logger
 */
export function addCloudWatchLogging(
  logger: winston.Logger,
  enabled: boolean,
  config?: {
    logGroupName?: string;
    logStreamName?: string;
    awsRegion?: string;
  }
): void {
  if (!enabled || !config?.logGroupName) {
    console.log('CloudWatch logging disabled');
    return;
  }

  const transport = createCloudWatchTransport({
    logGroupName: config.logGroupName,
    logStreamName: config.logStreamName || `${process.env.NODE_ENV}-${Date.now()}`,
    awsRegion: config.awsRegion || 'us-east-1',
    awsAccessKeyId: process.env.AWS_ACCESS_KEY_ID,
    awsSecretKey: process.env.AWS_SECRET_ACCESS_KEY,
  });

  logger.add(transport);
  console.log('CloudWatch logging enabled', { logGroup: config.logGroupName });
}
