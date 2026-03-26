import { ensureModelRegistry } from '../agents/register-models.js';
import { samAgent } from '../agents/sam.js';

ensureModelRegistry();

export const rootAgent = samAgent;
