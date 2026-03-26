import { ensureModelRegistry } from '../agents/register-models.js';
import { mayaQaAgent } from '../agents/maya-qa.js';

ensureModelRegistry();

export const rootAgent = mayaQaAgent;
