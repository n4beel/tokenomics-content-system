import { LlmAgent } from '@google/adk';

const MODEL =
  process.env.WEEKLY_LLM_MODEL ||
  process.env.LLM_MODEL_WEEKLY ||
  process.env.LLM_MODEL ||
  'gemini-2.5-flash';

export const mayaQaAgent = new LlmAgent({
  name: 'MayaQA',
  model: MODEL,
  includeContents: 'none',
  description:
    'Quality gate agent. Reviews all drafted content against brand standards.',
  outputKey: 'qa_result',
  // The LLM output is ignored entirely. All QA logic runs here, programmatically.
  // This avoids any dependency on the model following complex formatting instructions.
  afterAgentCallback: (context) => {
    const draftsRaw = context.state.get('drafts');
    let drafts: any[] = [];

    if (Array.isArray(draftsRaw)) {
      drafts = draftsRaw;
    } else if (typeof draftsRaw === 'string') {
      try {
        const parsed = JSON.parse(draftsRaw);
        if (Array.isArray(parsed)) drafts = parsed;
      } catch {}
    }

    // Check 1: count
    if (drafts.length !== 25) {
      const msg = `FAIL: Got ${drafts.length} posts, need exactly 25. Quill must return all 25 in the array.`;
      context.state.set('qa_result', msg);
      return undefined;
    }

    // Check 2: per-post content length and placeholder detection
    const failures: string[] = [];

    for (const post of drafts) {
      const platform: string = post.platform || '';
      const format: string = (post.format || '').toLowerCase();
      const content: string = typeof post.content === 'string' ? post.content : '';
      const topic: string = post.topic || 'unknown';
      const wordCount = content.trim().split(/\s+/).filter(Boolean).length;
      const charCount = content.length;

      // Placeholder check
      if (/this post will|see content plan|placeholder/i.test(content)) {
        failures.push(`[${topic}] Contains placeholder text — write the actual post`);
        continue;
      }

      if (platform === 'LinkedIn') {
        if (wordCount < 150) {
          failures.push(`[${topic}] LinkedIn: ${wordCount} words (need 150+ words / ~900+ chars). Current: ${charCount} chars`);
        }
      } else if (platform === 'X') {
        if (format.includes('thread')) {
          if (charCount < 300) {
            failures.push(`[${topic}] X thread: ${charCount} chars (need 300+ chars with 5+ tweets)`);
          }
        } else {
          if (charCount < 80) {
            failures.push(`[${topic}] X single: ${charCount} chars (need 80+ chars)`);
          }
        }
      } else if (platform === 'YouTube') {
        if (wordCount < 800) {
          failures.push(`[${topic}] YouTube: ${wordCount} words (need 800+ words / ~5000+ chars). Current: ${charCount} chars`);
        }
        if (!/\[0:00/i.test(content)) {
          failures.push(`[${topic}] YouTube: missing [0:00 ...] timestamp markers in script`);
        }
      }
    }

    if (failures.length === 0) {
      context.state.set('qa_result', 'ALL_PASSED');
      context.actions.escalate = true;
    } else {
      const msg =
        `FAIL: ${failures.length} post(s) need revision:\n` +
        failures.map((f) => `- ${f}`).join('\n') +
        `\n\nQuill: fix ALL failed posts AND return the full array of all 25 posts.`;
      context.state.set('qa_result', msg);
    }

    return undefined;
  },
  instruction: `You are reviewing social media content drafts. Output only: "QA_RUNNING"`,
  tools: [],
});
