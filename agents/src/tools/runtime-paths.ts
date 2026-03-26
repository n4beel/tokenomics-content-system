import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function hasRequiredPaths(root: string, requiredRelPaths: string[]): boolean {
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
    return false;
  }
  return requiredRelPaths.every((rel) => fs.existsSync(path.join(root, rel)));
}

/**
 * Resolve tokenomics-seo root across dev, container, and temp runtime contexts.
 */
export function resolveSeoRoot(requiredRelPaths: string[] = []): string {
  const candidates = [
    process.env.TOKENOMICS_SEO_ROOT,
    path.resolve(__dirname, '../../tokenomics-seo'),
    path.resolve(process.cwd(), 'tokenomics-seo'),
    path.resolve(process.cwd(), 'agents/tokenomics-seo'),
    '/tmp/tokenomics-seo',
    '/app/tokenomics-seo',
  ].filter((p): p is string => !!p);

  for (const candidate of candidates) {
    const resolved = path.resolve(candidate);
    if (hasRequiredPaths(resolved, requiredRelPaths)) {
      return resolved;
    }
  }

  return path.resolve(candidates[0] || path.resolve(__dirname, '../../tokenomics-seo'));
}

/**
 * Use the current Node binary when available, otherwise rely on PATH.
 */
export function resolveNodeExec(): string {
  if (process.execPath && fs.existsSync(process.execPath)) {
    return process.execPath;
  }

  const envNode = process.env.NODE_BINARY || process.env.NODE_EXEC_PATH;
  if (envNode && fs.existsSync(envNode)) {
    return envNode;
  }

  return 'node';
}

function parseDotEnvFile(filePath: string): Record<string, string> {
  if (!fs.existsSync(filePath)) return {};

  const out: Record<string, string> = {};
  const raw = fs.readFileSync(filePath, 'utf-8');

  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const idx = trimmed.indexOf('=');
    if (idx <= 0) continue;

    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    out[key] = value;
  }

  return out;
}

/**
 * Merge process env with .env files so tool subprocesses get required API keys.
 */
export function buildToolEnv(seoRoot: string): NodeJS.ProcessEnv {
  const agentRoot = path.resolve(__dirname, '../..');
  const merged = {
    ...parseDotEnvFile(path.join(agentRoot, '.env')),
    ...parseDotEnvFile(path.join(seoRoot, '.env')),
    ...parseDotEnvFile(path.join(seoRoot, '.env.local')),
    ...process.env,
  };

  return merged;
}

/**
 * Ensure tool output directories are writable, falling back safely when needed.
 */
export function resolveWritableOutputDir(preferredDir: string, fallbackDir: string): string {
  const candidates = [preferredDir, fallbackDir].map((p) => path.resolve(p));

  for (const dir of candidates) {
    try {
      fs.mkdirSync(dir, { recursive: true });
      fs.accessSync(dir, fs.constants.W_OK);
      return dir;
    } catch {
      // Try next candidate.
    }
  }

  return path.resolve(fallbackDir);
}
