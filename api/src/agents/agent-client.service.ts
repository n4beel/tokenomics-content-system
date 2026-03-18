import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as http from 'http';
import * as https from 'https';

/**
 * HTTP client for the standalone ADK Agent Service.
 * The agent service runs on its own port and exposes ADK's built-in API.
 */
@Injectable()
export class AgentClientService {
  private readonly logger = new Logger(AgentClientService.name);
  private readonly baseUrl: string;

  constructor(private readonly config: ConfigService) {
    this.baseUrl = this.config.get<string>(
      'AGENTS_SERVICE_URL',
      'http://localhost:8000',
    );
  }

  /**
   * List available agent apps on the ADK service
   */
  async listApps(): Promise<string[]> {
    return this.request<string[]>('GET', '/list-apps');
  }

  /**
   * Create or update a session for a given app, user, and session ID
   */
  async createSession(
    appName: string,
    userId: string,
    sessionId: string,
    state?: Record<string, unknown>,
  ): Promise<any> {
    return this.request(
      'POST',
      `/apps/${appName}/users/${userId}/sessions/${sessionId}`,
      state || {},
    );
  }

  /**
   * Run the agent with a message and return the response
   * NOTE: TypeScript ADK uses camelCase field names (newMessage, not new_message)
   */
  async run(
    appName: string,
    userId: string,
    sessionId: string,
    message: string,
  ): Promise<any> {
    return this.request('POST', '/run', {
      appName,
      userId,
      sessionId,
      newMessage: {
        role: 'user',
        parts: [{ text: message }],
      },
    });
  }

  /**
   * Convenience: run the full weekly content pipeline
   * App name = 'agent' (ADK api_server uses the directory name, not rootAgent.name)
   */
  async runWeeklyPipeline(batchId: string): Promise<any> {
    const appName = 'src';
    const userId = 'system';
    const sessionId = `batch-${batchId}`;

    this.logger.log(`[${batchId}] Creating session for weekly pipeline...`);
    await this.createSession(appName, userId, sessionId);

    this.logger.log(
      `[${batchId}] Running weekly pipeline (Riley → Maya → Quill ↔ MayaQA)...`,
    );
    const result = await this.run(
      appName,
      userId,
      sessionId,
      'Generate the weekly research brief, plan the content, write all posts, and run QA review. This is the full weekly batch run.',
    );

    this.logger.log(`[${batchId}] Weekly pipeline complete`);
    return result;
  }

  /**
   * Convenience: run the blog content pipeline
   */
  async runBlogPipeline(batchId: string): Promise<any> {
    const appName = 'src/sam-pipeline.ts';
    const userId = 'system';
    const sessionId = `blog-${batchId}`;

    this.logger.log(`[${batchId}] Creating session for blog pipeline...`);
    await this.createSession(appName, userId, sessionId);

    this.logger.log(
      `[${batchId}] Running blog pipeline (Riley → Sam)...`,
    );
    const result = await this.run(
      appName,
      userId,
      sessionId,
      'Generate two SEO blog posts for this week. Focus on Tokenomics and DeFi topics. Route this to the SamPipeline.',
    );

    this.logger.log(`[${batchId}] Blog pipeline complete`);
    return result;
  }

  /**
   * Convenience: run the daily news scan
   */
  async runDailyNewsScan(batchId: string): Promise<any> {
    const appName = 'src';
    const userId = 'system';
    const sessionId = `news-${batchId}`;

    this.logger.log(`[${batchId}] Creating session for daily news scan...`);
    await this.createSession(appName, userId, sessionId);

    this.logger.log(`[${batchId}] Running daily news scan...`);
    const result = await this.run(
      appName,
      userId,
      sessionId,
      'Generate the daily news brief. Quick scan overnight news, identify time-sensitive items that warrant same-day reaction, note anything worth watching but not urgent, flag creator alerts.',
    );

    this.logger.log(`[${batchId}] Daily news scan complete`);
    return result;
  }

  /**
   * Generic HTTP request to the ADK Agent Service
   */
  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const urlString = `${this.baseUrl}${path}`;
    const url = new URL(urlString);
    const client = url.protocol === 'https:' ? https : http;
    const bodyString = body ? JSON.stringify(body) : '';

    return new Promise((resolve, reject) => {
      const req = client.request(
        url,
        {
          method,
          headers: {
            'Content-Type': 'application/json',
            ...(bodyString ? { 'Content-Length': Buffer.byteLength(bodyString) } : {}),
          },
          timeout: 1000 * 60 * 30, // 30 minute timeout for heavy LLM operations
        },
        (res) => {
          let data = '';
          res.on('data', (chunk) => {
            data += chunk;
          });
          res.on('end', () => {
            if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
              try {
                resolve(JSON.parse(data));
              } catch (e) {
                reject(
                  new HttpException(
                    'Invalid JSON response from Agent Service',
                    HttpStatus.BAD_GATEWAY,
                  ),
                );
              }
            } else {
              reject(
                new HttpException(
                  `Agent Service Error: ${res.statusCode} - ${data}`,
                  HttpStatus.BAD_GATEWAY,
                ),
              );
            }
          });
        },
      );

      req.on('error', (error) => {
        this.logger.error(`Agent Service unreachable at ${urlString}: ${error}`);
        reject(
          new HttpException(
            'Agent Service is unreachable. Ensure the ADK service is running.',
            HttpStatus.SERVICE_UNAVAILABLE,
          ),
        );
      });

      req.on('timeout', () => {
        req.destroy();
        this.logger.error(`Agent Service request timed out at ${urlString}`);
        reject(
          new HttpException(
            'Agent Service Request Timeout (30m limit reached)',
            HttpStatus.GATEWAY_TIMEOUT,
          ),
        );
      });

      if (bodyString) {
        req.write(bodyString);
      }
      req.end();
    });
  }
}
