import { WebSocket, WebSocketServer, RawData } from 'ws';
import { Server as HttpServer } from 'http';
import type {
  WSClientMessage,
  WSServerMessage,
  WSConnectionState,
} from '@tilly/shared';
import { config } from '../config/index.js';
import { createAuthenticatedClient } from '../config/database.js';
import { authCache } from '../utils/cache.js';
import { createLogger } from '../utils/logger.js';
import { StreamingAIService } from '../services/streaming-ai.service.js';

const logger = createLogger('WebSocketServer');

interface AuthenticatedWebSocket extends WebSocket {
  connectionState: WSConnectionState;
  isAlive: boolean;
}

export class WSServer {
  private wss: WebSocketServer;
  private clients: Map<WebSocket, AuthenticatedWebSocket> = new Map();
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private streamingAIService: StreamingAIService;

  constructor(
    httpServer: HttpServer,
    streamingAIService: StreamingAIService
  ) {
    this.streamingAIService = streamingAIService;

    this.wss = new WebSocketServer({
      server: httpServer,
      path: '/ws',
      maxPayload: 1024 * 1024, // 1MB max message size
    });

    this.setupEventHandlers();
    this.startHeartbeat();

    logger.info('WebSocket server initialized on /ws');
  }

  private setupEventHandlers(): void {
    this.wss.on('connection', (ws: WebSocket) => {
      if (this.clients.size >= config.websocket.maxConnections) {
        logger.warn('Max connections reached, rejecting new connection');
        this.sendError(ws, undefined, 'MAX_CONNECTIONS', 'Server at capacity');
        ws.close(1013, 'Server at capacity');
        return;
      }

      const authWs = ws as AuthenticatedWebSocket;
      authWs.connectionState = {
        authenticated: false,
        connectedAt: new Date(),
      };
      authWs.isAlive = true;

      this.clients.set(ws, authWs);
      logger.debug({ clients: this.clients.size }, 'New WebSocket connection');

      ws.on('message', (data) => this.handleMessage(authWs, data));
      ws.on('close', () => this.handleClose(authWs));
      ws.on('error', (error) => this.handleError(authWs, error));
      ws.on('pong', () => {
        authWs.isAlive = true;
      });
    });

    this.wss.on('error', (error) => {
      logger.error({ error }, 'WebSocket server error');
    });
  }

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      this.wss.clients.forEach((ws) => {
        const authWs = ws as AuthenticatedWebSocket;
        if (!authWs.isAlive) {
          logger.debug('Terminating unresponsive client');
          this.clients.delete(ws);
          return ws.terminate();
        }
        authWs.isAlive = false;
        ws.ping();
      });
    }, config.websocket.heartbeatIntervalMs);
  }

  private async handleMessage(ws: AuthenticatedWebSocket, data: RawData): Promise<void> {
    try {
      const message = JSON.parse(data.toString()) as WSClientMessage;

      switch (message.type) {
        case 'ping':
          this.send(ws, { type: 'pong' });
          break;

        case 'auth':
          await this.handleAuth(ws, message.payload.token);
          break;

        case 'chat':
          if (!ws.connectionState.authenticated) {
            this.sendError(ws, message.id, 'NOT_AUTHENTICATED', 'Please authenticate first');
            return;
          }
          await this.handleChat(ws, message);
          break;

        default:
          this.sendError(ws, undefined, 'UNKNOWN_MESSAGE', 'Unknown message type');
      }
    } catch (error) {
      logger.error({ error }, 'Failed to parse WebSocket message');
      this.sendError(ws, undefined, 'PARSE_ERROR', 'Invalid message format');
    }
  }

  private async handleAuth(ws: AuthenticatedWebSocket, token: string): Promise<void> {
    try {
      // Check cache first
      const cached = authCache.get(token);
      if (cached) {
        ws.connectionState.authenticated = true;
        ws.connectionState.userId = cached.userId;
        this.send(ws, {
          type: 'auth_result',
          payload: { success: true, userId: cached.userId },
        });
        logger.debug({ userId: cached.userId }, 'WebSocket auth from cache');
        return;
      }

      // Verify with Supabase
      const supabase = createAuthenticatedClient(token);
      const { data: { user }, error } = await supabase.auth.getUser(token);

      if (error || !user) {
        this.send(ws, {
          type: 'auth_result',
          payload: { success: false, error: 'Invalid token' },
        });
        return;
      }

      // Cache and update state
      authCache.set(token, { userId: user.id, email: user.email || '' });
      ws.connectionState.authenticated = true;
      ws.connectionState.userId = user.id;

      this.send(ws, {
        type: 'auth_result',
        payload: { success: true, userId: user.id },
      });

      logger.debug({ userId: user.id }, 'WebSocket authenticated');
    } catch (error) {
      logger.error({ error }, 'WebSocket auth error');
      this.send(ws, {
        type: 'auth_result',
        payload: { success: false, error: 'Authentication failed' },
      });
    }
  }

  private async handleChat(ws: AuthenticatedWebSocket, message: WSClientMessage & { type: 'chat' }): Promise<void> {
    const { id, payload } = message;
    const userId = ws.connectionState.userId!;
    const timezone = payload.timezone || 'America/New_York';

    try {
      await this.streamingAIService.processStreamingChat({
        messageId: id,
        message: payload.message,
        chatHistory: payload.chatHistory || [],
        userId,
        timezone,
        onStreamStart: (loopIteration) => {
          this.send(ws, {
            type: 'stream_start',
            id,
            payload: { loopIteration },
          });
        },
        onStreamChunk: (content, loopIteration) => {
          this.send(ws, {
            type: 'stream_chunk',
            id,
            payload: { content, loopIteration },
          });
        },
        onStreamEnd: (fullContent, loopIteration, hasMoreToolCalls) => {
          this.send(ws, {
            type: 'stream_end',
            id,
            payload: { fullContent, loopIteration, hasMoreToolCalls },
          });
        },
        onToolCallStart: (toolCallId, toolName, args, loopIteration) => {
          this.send(ws, {
            type: 'tool_call_start',
            id,
            payload: { toolCallId, toolName, arguments: args, loopIteration },
          });
        },
        onToolCallResult: (toolCallId, toolName, result, success, loopIteration) => {
          this.send(ws, {
            type: 'tool_call_result',
            id,
            payload: { toolCallId, toolName, result, success, loopIteration },
          });
        },
        onToolLoopStatus: (iteration, maxIterations, status, toolCalls) => {
          this.send(ws, {
            type: 'tool_loop_status',
            id,
            payload: { iteration, maxIterations, status, toolCalls },
          });
        },
        onEventCreated: (event, loopIteration) => {
          this.send(ws, {
            type: 'event_created',
            id,
            payload: { event, loopIteration },
          });
        },
        onError: (code, errorMessage, details) => {
          this.sendError(ws, id, code, errorMessage, details);
        },
      });
    } catch (error) {
      logger.error({ error, messageId: id }, 'Chat processing failed');
      this.sendError(ws, id, 'CHAT_ERROR', 'Failed to process chat message');
    }
  }

  private handleClose(ws: AuthenticatedWebSocket): void {
    this.clients.delete(ws);
    logger.debug(
      { userId: ws.connectionState.userId, clients: this.clients.size },
      'WebSocket connection closed'
    );
  }

  private handleError(ws: AuthenticatedWebSocket, error: Error): void {
    logger.error({ error, userId: ws.connectionState.userId }, 'WebSocket error');
  }

  private send(ws: WebSocket, message: WSServerMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  private sendError(
    ws: WebSocket,
    id: string | undefined,
    code: string,
    message: string,
    details?: unknown
  ): void {
    this.send(ws, {
      type: 'error',
      id,
      payload: { code, message, details },
    });
  }

  public shutdown(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    this.wss.clients.forEach((ws) => {
      ws.close(1001, 'Server shutting down');
    });

    this.wss.close();
    logger.info('WebSocket server shut down');
  }

  public getStats(): { connections: number; authenticated: number } {
    let authenticated = 0;
    this.clients.forEach((client) => {
      if (client.connectionState.authenticated) {
        authenticated++;
      }
    });

    return {
      connections: this.clients.size,
      authenticated,
    };
  }
}
