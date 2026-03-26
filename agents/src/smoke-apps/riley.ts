import { ensureModelRegistry } from '../agents/register-models.js';
import { rileyAgent } from '../agents/riley.js';

ensureModelRegistry();

export const rootAgent = rileyAgent;
