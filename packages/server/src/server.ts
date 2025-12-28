import { createServer } from 'http';
import { createApp } from './app.js';
import { config } from './config/index.js';
import { logger } from './utils/logger.js';
import { WSServer } from './websocket/server.js';

/**
 * Start the server
 */
async function main(): Promise<void> {
  try {
    const { app, streamingAIService } = createApp();

    // Create HTTP server (needed for WebSocket upgrade)
    const httpServer = createServer(app);

    // Initialize WebSocket server
    let wsServer: WSServer | null = null;
    if (config.websocket.enabled) {
      wsServer = new WSServer(httpServer, streamingAIService);
    }

    httpServer.listen(config.port, () => {
      logger.info({
        port: config.port,
        env: config.env,
        model: config.openai.model,
        websocket: config.websocket.enabled,
      }, 'Server started');

      if (config.isDevelopment) {
        logger.info(`API available at http://localhost:${config.port}/api`);
        logger.info(`Health check: http://localhost:${config.port}/api/health`);
        if (config.websocket.enabled) {
          logger.info(`WebSocket available at ws://localhost:${config.port}/ws`);
        }
      }
    });

    // Graceful shutdown
    const shutdown = async (signal: string) => {
      logger.info({ signal }, 'Shutdown signal received');

      // Shutdown WebSocket server first
      if (wsServer) {
        wsServer.shutdown();
      }

      // Close HTTP server
      httpServer.close(() => {
        logger.info('HTTP server closed');
        process.exit(0);
      });

      // Force exit after 10 seconds
      setTimeout(() => {
        logger.warn('Forcing shutdown after timeout');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

  } catch (error) {
    logger.fatal({ error }, 'Failed to start server');
    process.exit(1);
  }
}

main();
