import { createApp } from './app.js';
import { config } from './config/index.js';
import { logger } from './utils/logger.js';

/**
 * Start the server
 */
async function main(): Promise<void> {
  try {
    const app = createApp();

    app.listen(config.port, () => {
      logger.info({
        port: config.port,
        env: config.env,
        model: config.openai.model,
      }, 'Server started');

      if (config.isDevelopment) {
        logger.info(`API available at http://localhost:${config.port}/api`);
        logger.info(`Health check: http://localhost:${config.port}/api/health`);
      }
    });

    // Graceful shutdown
    const shutdown = async (signal: string) => {
      logger.info({ signal }, 'Shutdown signal received');
      process.exit(0);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

  } catch (error) {
    logger.fatal({ error }, 'Failed to start server');
    process.exit(1);
  }
}

main();
