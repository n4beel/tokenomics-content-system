const RAW_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
const API_BASE_URL = `${RAW_URL.replace(/\/+$/, '')}/api`;
const AGENTS_BASE_URL = process.env.NEXT_PUBLIC_AGENTS_URL || 'http://localhost:8000';

/**
 * Typed fetch wrapper for the NestJS API
 */
async function apiFetch<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;
  const res = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(error.message || `API Error: ${res.status}`);
  }

  return res.json();
}

/**
 * Typed fetch wrapper for the ADK Agent Service
 */
async function agentsFetch<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${AGENTS_BASE_URL}${endpoint}`;
  const res = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(error.message || `Agents API Error: ${res.status}`);
  }

  return res.json();
}

// --- NestJS API Client ---

export interface HealthResponse {
  status: string;
  timestamp: string;
  service: string;
}

export interface ConfigResponse {
  model: string;
  batchCron: string;
  cmsUrl: string;
  hasGeminiKey: boolean;
  hasOpenRouterKey: boolean;
  hasKimiKey: boolean;
  hasCmsCredentials: boolean;
}

export interface BatchTriggerResponse {
  message: string;
  batchId: string;
  jobId: string;
}

export interface BatchStatus {
  id: string;
  state: string;
  progress: number;
  data: Record<string, unknown>;
  returnvalue?: Record<string, unknown>;
  failedReason?: string;
}

export const api = {
  health: () => apiFetch<HealthResponse>('/health'),
  config: () => apiFetch<ConfigResponse>('/config'),

  batch: {
    triggerWeekly: () =>
      apiFetch<BatchTriggerResponse>('/batch/trigger/weekly', { method: 'POST' }),
    triggerDailyNews: () =>
      apiFetch<BatchTriggerResponse>('/batch/trigger/daily-news', { method: 'POST' }),
    getStatus: (jobId: string) =>
      apiFetch<BatchStatus>(`/batch/status/${jobId}`),
  },
};

// --- ADK Agent Service Client ---

export const agents = {
  listApps: () => agentsFetch<string[]>('/list-apps'),
  createSession: (appName: string, userId: string, sessionId: string) =>
    agentsFetch(`/apps/${appName}/users/${userId}/sessions/${sessionId}`, {
      method: 'POST',
    }),
  run: (appName: string, userId: string, sessionId: string, message: string) =>
    agentsFetch(`/run`, {
      method: 'POST',
      body: JSON.stringify({
        app_name: appName,
        user_id: userId,
        session_id: sessionId,
        new_message: {
          role: 'user',
          parts: [{ text: message }],
        },
      }),
    }),
};
