# Tokenomics.net Content System

Monorepo for the AI content generation system.

## Structure

```
content-system/
├── agents/     # ADK Agent Service (standalone ADK project)
├── api/        # NestJS API Service (scheduler, CMS, dashboard API)
└── dashboard/  # Next.js Dashboard (batch review, settings)
```

## Setup

```bash
# Install deps for all services
cd api && npm install && cd ..
cd agents && npm install && cd ..
cd dashboard && npm install && cd ..
```

## Development

```bash
# Run agents (interactive testing UI)
cd agents && npx adk web

# Run API server
cd api && npm run start:dev

# Run dashboard
cd dashboard && npm run dev
```
# tokenomics-content-system
