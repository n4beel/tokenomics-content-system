/**
 * Custom ADK HTTP server with SSE streaming support.
 *
 * Replaces `adk api_server` as the runtime for the agents service.
 * Exposes:
 *   GET  /list-apps
 *   POST /apps/:appName/users/:userId/sessions/:sessionId  (create session)
 *   GET  /apps/:appName/users/:userId/sessions/:sessionId  (get session)
 *   GET  /apps/:appName/users/:userId/sessions              (list sessions)
 *   POST /run        — blocking, returns full event array (backward compat)
 *   POST /run-sse    — SSE stream, sends each event as it arrives
 */

import express, { Request, Response } from 'express';
import http from 'http';
import https from 'https';
import {
  Runner,
  InMemorySessionService,
  InMemoryArtifactService,
  InMemoryMemoryService,
} from '@google/adk';
import { ensureModelRegistry } from './agents/register-models.js';

ensureModelRegistry();

// Lazy-load agents to avoid circular imports at module level
async function loadAgents(): Promise<Record<string, any>> {
  const [{ rootAgent: weeklyAgent }, { rootAgent: blogAgent }] = await Promise.all([
    import('./agent.js'),
    import('./sam-pipeline.js'),
  ]);
  return {
    agent: weeklyAgent,
    'sam-pipeline': blogAgent,
  };
}

const sessionService = new InMemorySessionService();
const artifactService = new InMemoryArtifactService();
const memoryService = new InMemoryMemoryService();

let agentMap: Record<string, any> | null = null;
const runnerCache: Record<string, Runner> = {};

async function getAgents(): Promise<Record<string, any>> {
  if (!agentMap) {
    agentMap = await loadAgents();
  }
  return agentMap;
}

function getRunner(appName: string, agent: any): Runner {
  if (!runnerCache[appName]) {
    runnerCache[appName] = new Runner({
      appName,
      agent,
      sessionService,
      artifactService,
      memoryService,
    });
  }
  return runnerCache[appName];
}

const app = express();
app.use(express.json({ limit: '50mb' }));

// ── List apps ─────────────────────────────────────────────────────────────
app.get('/list-apps', async (_req, res) => {
  const agents = await getAgents();
  res.json(Object.keys(agents));
});

// ── Session management ────────────────────────────────────────────────────
app.post(
  '/apps/:appName/users/:userId/sessions/:sessionId',
  async (req: Request, res: Response) => {
    try {
      const { appName, userId, sessionId } = req.params;
      const session = await sessionService.createSession({
        appName,
        userId,
        sessionId,
        state: req.body ?? {},
      });
      res.json(session);
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  },
);

app.get(
  '/apps/:appName/users/:userId/sessions/:sessionId',
  async (req: Request, res: Response) => {
    try {
      const { appName, userId, sessionId } = req.params;
      const session = await sessionService.getSession({ appName, userId, sessionId });
      res.json(session);
    } catch {
      res.status(404).json({ error: 'Session not found' });
    }
  },
);

app.get(
  '/apps/:appName/users/:userId/sessions',
  async (req: Request, res: Response) => {
    try {
      const { appName, userId } = req.params;
      const result = await sessionService.listSessions({ appName, userId });
      res.json({ sessions: result.sessions ?? [] });
    } catch {
      res.json({ sessions: [] });
    }
  },
);

// ── SSE streaming run ─────────────────────────────────────────────────────
app.post('/run-sse', async (req: Request, res: Response) => {
  const { appName, userId, sessionId, newMessage } = req.body ?? {};

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const sendEvent = (data: unknown) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const agents = await getAgents();
    const agent = agents[appName];
    if (!agent) {
      sendEvent({ error: `Unknown app: ${appName}` });
      res.end();
      return;
    }

    const runner = getRunner(appName, agent);
    for await (const event of runner.runAsync({ userId, sessionId, newMessage })) {
      sendEvent(event);
    }

    res.write('data: [DONE]\n\n');
  } catch (err) {
    sendEvent({ error: String(err) });
  }

  res.end();
});

// ── Blocking run (backward compat) ────────────────────────────────────────
app.post('/run', async (req: Request, res: Response) => {
  const { appName, userId, sessionId, newMessage } = req.body ?? {};

  try {
    const agents = await getAgents();
    const agent = agents[appName];
    if (!agent) {
      res.status(404).json({ error: `Unknown app: ${appName}` });
      return;
    }

    const events: unknown[] = [];
    const runner = getRunner(appName, agent);
    for await (const event of runner.runAsync({ userId, sessionId, newMessage })) {
      events.push(event);
    }
    res.json(events);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ── Async run with push callbacks ─────────────────────────────────────────
/**
 * Fire-and-forget POST to a callback URL. Never throws — agent pipeline
 * must not be blocked by callback failures.
 */
function postToCallback(callbackUrl: string, body: unknown): void {
  try {
    const url = new URL(callbackUrl);
    const client = url.protocol === 'https:' ? https : http;
    const data = JSON.stringify(body);
    const req = client.request(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
      },
    });
    req.on('error', () => {}); // ignore — fire and forget
    req.write(data);
    req.end();
  } catch {
    // ignore serialization or URL errors
  }
}

/**
 * POST /run-async
 * Starts the pipeline in the background and returns 202 immediately.
 * As events are produced, each is POSTed to:
 *   {callbackUrl}/event  — one ADK event
 *   {callbackUrl}/done   — pipeline finished successfully
 *   {callbackUrl}/error  — pipeline threw
 */
app.post('/run-async', async (req: Request, res: Response) => {
  const { appName, userId, sessionId, newMessage, callbackUrl } = req.body ?? {};

  if (!appName || !userId || !sessionId || !newMessage || !callbackUrl) {
    res.status(400).json({ error: 'Missing required fields: appName, userId, sessionId, newMessage, callbackUrl' });
    return;
  }

  let agents: Record<string, any>;
  try {
    agents = await getAgents();
  } catch (err) {
    res.status(500).json({ error: `Failed to load agents: ${String(err)}` });
    return;
  }

  const agent = agents[appName];
  if (!agent) {
    res.status(404).json({ error: `Unknown app: ${appName}` });
    return;
  }

  // Acknowledge immediately — caller does not wait for pipeline completion
  res.status(202).json({ sessionId, appName });

  // Run pipeline in background, pushing events to callbackUrl
  (async () => {
    try {
      const runner = getRunner(appName, agent);
      for await (const event of runner.runAsync({ userId, sessionId, newMessage })) {
        postToCallback(`${callbackUrl}/event`, event);
      }
      postToCallback(`${callbackUrl}/done`, { ok: true });
    } catch (err) {
      postToCallback(`${callbackUrl}/error`, { error: String(err) });
    }
  })();
});

// ── Start ─────────────────────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT ?? '8000', 10);
const HOST = process.env.HOST ?? '0.0.0.0';

app.listen(PORT, HOST, () => {
  console.log(`
+-----------------------------------------------------------------------------+
| ADK SSE Server started                                                      |
|                                                                             |
| Listening on ${HOST}:${PORT}${''.padStart(Math.max(0, 49 - `${HOST}:${PORT}`.length))}|
| Endpoints: /list-apps  /run  /run-sse                                       |
+-----------------------------------------------------------------------------+`);
});
