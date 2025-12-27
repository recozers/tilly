import { Response } from 'express';
import { AIService } from '../services/ai.service.js';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error-handler.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('AIController');

/**
 * AI controller - handles chat requests
 */
export class AIController {
  constructor(private aiService: AIService) {}

  /**
   * POST /api/ai/chat - Process a chat message
   */
  chat = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { message, chatHistory = [], timezone = 'America/New_York' } = req.body as {
      message: string;
      chatHistory?: Array<{ role: string; content: string }>;
      timezone?: string;
    };

    if (!message || typeof message !== 'string') {
      res.status(400).json({ error: 'Message is required' });
      return;
    }

    logger.info({ userId: req.userId }, 'Processing chat request');

    const result = await this.aiService.processChat(
      message,
      req.userId,
      chatHistory as Array<{ role: 'user' | 'assistant' | 'system' | 'tool'; content: string }>,
      timezone
    );

    res.json({
      response: result.response,
      events: result.events,
      toolCalls: result.toolCalls,
    });
  });

  /**
   * POST /api/ai/proxy - Proxy request to OpenAI (for legacy compatibility)
   */
  proxy = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { model, messages, temperature, max_tokens, stream } = req.body;

    // For now, just pass through to OpenAI
    // This maintains compatibility with the old /api/openai endpoint
    const config = (await import('../config/index.js')).config;

    const requestBody = {
      model: model || config.openai.model,
      messages,
      temperature: temperature ?? 0.3,
      max_tokens: max_tokens ?? 1000,
      stream: stream ?? false,
    };

    const response = await fetch(`${config.openai.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.openai.apiKey}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error({ status: response.status, error: errorText }, 'OpenAI proxy error');
      res.status(response.status).json({ error: 'OpenAI API error' });
      return;
    }

    const data = await response.json();
    res.json(data);
  });
}
