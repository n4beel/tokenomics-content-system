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
    const repoRoot = path.resolve(agentRoot, '..');
    const apiRoot = path.join(repoRoot, 'api');
    const merged = {
        ...parseDotEnvFile(path.join(repoRoot, '.env')),
        ...parseDotEnvFile(path.join(agentRoot, '.env')),
        ...parseDotEnvFile(path.join(apiRoot, '.env')),
        ...parseDotEnvFile(path.join(apiRoot, '.env.local')),
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

function toSafeRelativePath(input: string): string {
    const normalized = path.posix.normalize(input.replace(/\\/g, '/'));
    const noLeading = normalized.replace(/^\/+/, '');
    const cleaned = noLeading
        .split('/')
        .filter((segment) => segment && segment !== '.' && segment !== '..')
        .join('/');
    return cleaned;
}

/**
 * Resolve a shared output root. Prefer attached volume paths when writable.
 */
export function resolveOutputRoot(seoRoot: string): string {
    const configured = process.env.TOKENOMICS_OUTPUT_ROOT;
    const localAgentOutput = path.resolve(__dirname, '../../data/tokenomics-output');
    const chromaDir = process.env.CHROMA_DATA_DIR
        ? path.resolve(process.env.CHROMA_DATA_DIR)
        : undefined;
    const candidates = [
        configured,
        localAgentOutput,
        chromaDir ? path.join(chromaDir, 'tokenomics-output') : undefined,
        '/data/chroma/tokenomics-output',
        '/data/tokenomics-output',
        '/workspace/tokenomics-output',
        path.join(seoRoot, 'output'),
    ].filter((p): p is string => !!p);

    for (const candidate of candidates) {
        try {
            const resolved = path.resolve(candidate);
            fs.mkdirSync(resolved, { recursive: true });
            fs.accessSync(resolved, fs.constants.W_OK);
            return resolved;
        } catch {
            // Try next candidate.
        }
    }

    return path.resolve(path.join(seoRoot, 'output'));
}

function sanitizeRunId(raw?: string): string {
    const input = (raw || '').trim();
    if (!input) return '';
    const safe = input.replace(/[^a-zA-Z0-9._-]/g, '-').replace(/-+/g, '-');
    return safe.slice(0, 80);
}

function defaultRunId(): string {
    const now = new Date();
    const stamp = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}${String(now.getUTCDate()).padStart(2, '0')}-${String(now.getUTCHours()).padStart(2, '0')}${String(now.getUTCMinutes()).padStart(2, '0')}${String(now.getUTCSeconds()).padStart(2, '0')}`;
    return `adhoc-${stamp}`;
}

export function resolveRunScopedRoot(seoRoot: string, runId?: string): string {
    const outputRoot = resolveOutputRoot(seoRoot);
    const resolvedRunId =
        sanitizeRunId(runId) ||
        sanitizeRunId(process.env.TOKENOMICS_RUN_ID) ||
        defaultRunId();

    const runRoot = path.join(outputRoot, 'runs', resolvedRunId);
    return resolveWritableOutputDir(runRoot, outputRoot);
}

/**
 * Constrain requested tool output under the managed output root.
 */
export function resolveManagedOutputDir(
    seoRoot: string,
    requestedOutputDir?: string,
    runId?: string,
): string {
    const runRoot = resolveRunScopedRoot(seoRoot, runId);

    if (!requestedOutputDir || !requestedOutputDir.trim()) {
        return runRoot;
    }

    const requested = requestedOutputDir.trim();
    let relative = requested;

    if (path.isAbsolute(requested)) {
        const normalized = requested.replace(/\\/g, '/');
        const marker = '/output/';
        const markerIndex = normalized.lastIndexOf(marker);
        if (markerIndex >= 0) {
            relative = normalized.slice(markerIndex + marker.length);
        } else {
            relative = path.basename(normalized);
        }
    }

    const safeRelative = toSafeRelativePath(relative);
    const target = safeRelative ? path.join(runRoot, safeRelative) : runRoot;

    return resolveWritableOutputDir(target, runRoot);
}
