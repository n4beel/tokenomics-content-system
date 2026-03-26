import { ensureModelRegistry } from '../agents/register-models.js';
import { quillAgent } from '../agents/quill.js';

ensureModelRegistry();

export const rootAgent = quillAgent;
