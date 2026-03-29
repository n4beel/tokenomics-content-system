import { LlmAgent } from '@google/adk';
import { Type } from '@google/genai';

const MODEL =
  process.env.WEEKLY_LLM_MODEL ||
  process.env.LLM_MODEL_WEEKLY ||
  process.env.LLM_MODEL ||
  'gemini-2.5-flash';
// const MODEL = 'gemini-3.1-pro-preview'; // Hardcoded to prevent lite models from truncating the complex planning output

export const mayaAgent = new LlmAgent({
  name: 'Maya',
  model: MODEL,
  includeContents: 'none',
  description:
    'Content planning agent. Assigns pillars, picks templates, sets angles for weekly content.',
  outputKey: 'content_plan',
  generateContentConfig: {
    responseMimeType: 'application/json',
  },
  outputSchema: {
    type: Type.OBJECT,
    properties: {
      posts: {
        type: Type.ARRAY,
        minItems: '25',
        maxItems: '25',
        items: {
          type: Type.OBJECT,
          properties: {
            number:   { type: Type.INTEGER },
            platform: { type: Type.STRING, enum: ['LinkedIn', 'X', 'YouTube'] },
            pillar:   { type: Type.STRING },
            slot:     { type: Type.STRING },
            topic:    { type: Type.STRING },
            template: { type: Type.STRING },
            format:   { type: Type.STRING },
          },
          required: ['number', 'platform', 'pillar', 'slot', 'topic', 'template', 'format'],
        },
      },
      interviewPrompts: {
        type: Type.ARRAY,
        minItems: '10',
        items: { type: Type.STRING },
      },
    },
    required: ['posts', 'interviewPrompts'],
  },
  // afterAgentCallback does two things:
  // 1. Re-serializes the parsed object back to a JSON string so that downstream
  //    {content_plan} template injection works (ADK uses String(value), which gives
  //    "[object Object]" for a parsed JS object).
  // 2. Returns the JSON string as Content so the callback event has non-empty parts.
  //    ADK's outputSchema causes the original model text event to have empty parts
  //    (the text is parsed into stateDelta). getCurrentTurnContents skips empty-parts
  //    events, so without this, Quill receives no user message and hallucinates.
  afterAgentCallback: (context) => {
    const plan = context.state.get('content_plan');
    if (plan && typeof plan === 'object') {
      const jsonStr = JSON.stringify(plan);
      context.state.set('content_plan', jsonStr);
      // Return Content so the callback event has text parts that getCurrentTurnContents
      // can find — giving Quill a proper user message with the content plan.
      return { role: 'model' as const, parts: [{ text: jsonStr }] };
    }
    return undefined;
  },
  instruction: `Create a weekly content plan for Tokenomics.net based on the research brief below.

Output ONLY valid JSON matching the schema. No greeting, no preamble, no commentary — just the JSON object.

## Input — Research Brief
Use this as your source material:
<research_brief>
{research_brief}
</research_brief>

## Task: Plan the Week's Content

### Step 1 — Plan All 17 LinkedIn Posts

For each slot assign: Platform, Pillar, Topic, Template, Slot (day + time).

**Posting schedule:**
- Monday–Friday: 3 posts/day → Morning (7:30 AM CT), Midday (1:00 PM CT), Evening (5:00 PM CT)
- Saturday: 1 post → 10:00 AM CT
- Sunday: 1 post → 10:00 AM CT
Total: 15 weekday + 2 weekend = 17 LinkedIn posts

**The 8 LinkedIn Templates — pick the best fit for each slot:**
1. **Framework Drop** — Repeatable process or checklist presented as a step-by-step system
2. **Contrarian Take** — Challenge a popular narrative with evidence and an alternative view
3. **Case Study Breakdown** — Real project: context → decision → result → lesson
4. **News Reaction** — Breaking news: why it matters + take + what to watch
5. **Data Drop** — Striking number with implications for builders or investors
6. **Mistake Post** — Teaching through failure: mistake → why it happens → the fix
7. **List/Quick Hits** — Multiple connected insights in tight, readable format
8. **Video Companion** — Text post paired with native video: 3 key points + watch CTA

**LinkedIn Pillar Distribution Targets:**
- RWA Tokenization: 5–6 posts (30%)
- Tokenomics Fundamentals & Token Standards: 4–5 posts (25%)
- News & Market Intel: 3–4 posts (20%)
- Builder's Playbook: 2–3 posts (15%)
- Industry & DeFi: 1–2 posts (10%)

### Step 2 — Plan 5 X Posts (Personal Account: @hyper27374)

One post per weekday. Assign each a format:
- **Single** — Standalone tweet: Data Bomb, Contrarian Punch, Quick Take, or One-Liner (under 280 chars)
- **Thread** — 5–7 tweet breakdown: Atomized Framework, Case Thread, or News Thread
- **Article** — 800–1,500 word X Article (maximum 1 per week)

X Pillar Distribution (over-index on News vs LinkedIn):
- News & Market Intel: 30%
- RWA Tokenization: 25%
- Tokenomics Fundamentals: 25%
- Builder's Playbook: 10%
- Industry & DeFi: 10%

### Step 3 — Plan 3 YouTube Videos

Assign one video per publishing day:
- **Monday slot** → Educational Deep-Dive or Standards Explainer (evergreen, search-optimised)
- **Wednesday slot** → Tokenomics Teardown or News Analysis (project-focused or timely)
- **Friday slot** → Builder's Workshop or Educational Deep-Dive (practical, weekend-watch)

**YouTube Video Types:**
1. **Educational Deep-Dive** (10–20 min) — Evergreen keyword content paired with blog post
2. **Tokenomics Teardown** (12–18 min) — Real project: overview → distribution → mechanics → risks → verdict
3. **News Analysis** (8–12 min) — Timely event with lasting analytical value
4. **Standards Explainer** (10–15 min) — Token standard education (ERC-20, ERC-4626, ERC-3643, etc.)
5. **Builder's Workshop** (15–20 min) — Practical walkthrough with screen share

YouTube Pillar Distribution (over-index on Fundamentals):
- Tokenomics Fundamentals & Token Standards: 35%
- RWA Tokenization: 30%
- Builder's Playbook: 15%
- Industry & DeFi: 10%
- News & Market Intel: 10%

### Step 4 — Write 10–15 Interview Prompts for Tony

Specific questions for his voice note recording session, each mapped to a planned post with rationale.

## Output Format

Return a JSON object with two keys:

**posts** — array of exactly 25 objects (17 LinkedIn + 5 X + 3 YouTube), each with:
- number: integer 1–25
- platform: "LinkedIn" | "X" | "YouTube"
- pillar: the content pillar name
- slot: posting time string e.g. "Monday, Morning (7:30 AM CT)"
- topic: specific topic for this post
- template: the template name assigned
- format: e.g. "Text", "Single", "Thread", "Article", "Educational Deep-Dive"

**interviewPrompts** — array of 10–15 strings, each a specific question for Tony's voice note session

## What You Don't Do
- Don't write posts (Quill does)
- Don't research (Riley does)
- Don't schedule or trigger (Carl does)
- Don't decide strategy (Tony decides, you execute it)`,
  tools: [],
});
