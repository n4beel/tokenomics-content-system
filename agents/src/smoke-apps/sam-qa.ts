import { ensureModelRegistry } from '../agents/register-models.js';
import { samQaAgent } from '../agents/sam-qa.js';

ensureModelRegistry();

export const rootAgent = samQaAgent;
