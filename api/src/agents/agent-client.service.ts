import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as http from 'http';
import * as https from 'https';

interface RequestFailure {
  kind: 'network' | 'timeout' | 'http' | 'parse';
  message: string;
  status?: number;
}

/**
 * HTTP client for the standalone ADK Agent Service.
 * The agent service runs on its own port and exposes ADK's built-in API.
 */
@Injectable()
export class AgentClientService {
  private readonly logger = new Logger(AgentClientService.name);
  private readonly baseUrls: string[];

  constructor(private readonly config: ConfigService) {
    const configuredUrl = this.config.get<string>(
      'AGENTS_SERVICE_URL',
      'http://localhost:8000',
    );
    this.baseUrls = this.buildCandidateBaseUrls(configuredUrl);
    this.logger.log(`Agent service base URL candidates: ${this.baseUrls.join(', ')}`);
  }

  private buildCandidateBaseUrls(base: string): string[] {
    const out: string[] = [];
    const add = (url: string) => {
      if (!out.includes(url)) out.push(url);
    };

    let parsed: URL;
    try {
      parsed = new URL(base);
    } catch {
      // Invalid URL: preserve current behavior by using it as-is.
      return [base];
    }

    add(base);

    const isRailwayInternal = parsed.hostname.endsWith('.railway.internal');
    if (!isRailwayInternal) return out;

    // Railway internal services commonly expose PORT=8080.
    if (parsed.port === '8000') {
      const u = new URL(base);
      u.port = '8080';
      add(u.toString());
    } else if (parsed.port === '8080') {
      const u = new URL(base);
      u.port = '8000';
      add(u.toString());
    } else if (!parsed.port) {
      const u8080 = new URL(base);
      u8080.port = '8080';
      add(u8080.toString());
      const u8000 = new URL(base);
      u8000.port = '8000';
      add(u8000.toString());
    }

    return out;
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
      `[${batchId}] Running blog pipeline (Riley → Sam → SamQA)...`,
    );
    const result = await this.run(
      appName,
      userId,
      sessionId,
      'Run the full blog pipeline: pick the next 2 queued topics from clusters, research each with Perplexity Sonar, write complete MDX posts following the template, generate hero + OG images, render Mermaid diagrams, run QA validation, and publish as drafts to cms.tokenomics.net.',
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
    let lastFailure: RequestFailure | null = null;

    for (const baseUrl of this.baseUrls) {
      const urlString = `${baseUrl}${path}`;
      try {
        return await this.requestOnce<T>(urlString, method, body);
      } catch (failure: any) {
        lastFailure = failure as RequestFailure;

        const shouldRetryWithNextBase =
          lastFailure.kind === 'network' || lastFailure.kind === 'timeout';

        if (!shouldRetryWithNextBase) {
          break;
        }

        this.logger.warn(
          `Agent request failed at ${urlString} (${lastFailure.kind}: ${lastFailure.message}). Trying next base URL...`,
        );
      }
    }

    if (lastFailure?.kind === 'timeout') {
      throw new HttpException(
        'Agent Service request timed out (30m limit reached).',
        HttpStatus.GATEWAY_TIMEOUT,
      );
    }

    if (lastFailure?.kind === 'http') {
      throw new HttpException(
        `Agent Service Error: ${lastFailure.status} - ${lastFailure.message}`,
        HttpStatus.BAD_GATEWAY,
      );
    }

    if (lastFailure?.kind === 'parse') {
      throw new HttpException(
        'Invalid JSON response from Agent Service',
        HttpStatus.BAD_GATEWAY,
      );
    }

    throw new HttpException(
      'Agent Service is unreachable. Ensure the ADK service is running and AGENTS_SERVICE_URL is correct.',
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  }

  private async requestOnce<T>(
    urlString: string,
    method: string,
    body?: unknown,
  ): Promise<T> {
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
          timeout: 1000 * 60 * 30,
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
              } catch {
                reject({
                  kind: 'parse',
                  message: 'Response was not valid JSON',
                } satisfies RequestFailure);
              }
              return;
            }

            reject({
              kind: 'http',
              status: res.statusCode,
              message: data,
            } satisfies RequestFailure);
          });
        },
      );

      req.on('error', (error) => {
        this.logger.error(`Agent Service unreachable at ${urlString}: ${error}`);
        reject({
          kind: 'network',
          message: String(error),
        } satisfies RequestFailure);
      });

      req.on('timeout', () => {
        req.destroy();
        this.logger.error(`Agent Service request timed out at ${urlString}`);
        reject({
          kind: 'timeout',
          message: 'Request timeout',
        } satisfies RequestFailure);
      });

      if (bodyString) {
        req.write(bodyString);
      }
      req.end();
    });
  }
}
