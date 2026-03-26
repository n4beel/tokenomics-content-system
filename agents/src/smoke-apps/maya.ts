import { ensureModelRegistry } from '../agents/register-models.js';
import { mayaAgent } from '../agents/maya.js';

ensureModelRegistry();

export const rootAgent = mayaAgent;
