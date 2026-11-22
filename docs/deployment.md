# Deployment to Vercel

This project is a Next.js app designed for Vercel.

## Prerequisites

- A Vercel account
- A Croma API key from https://usecroma.com
- Optional: an OpenAI API key for the demo host at `/demo`

## Deploy

### One-click

1. Push this repository to GitHub.
2. Import the project in the Vercel dashboard.
3. Set environment variables (see below).
4. Deploy.

### CLI

```bash
pnpm install
pnpm build
npx vercel --prod
```

## Environment variables

Set these in the Vercel project settings:

| Variable | Required | Description |
|----------|----------|-------------|
| `CROMA_API_KEY` | Yes | Croma API bearer token |
| `OPENAI_API_KEY` | No | Needed only for `/demo` |

Never commit secrets. Use `.env.example` as a local template.

## Endpoints after deploy

| Path | Purpose |
|------|---------|
| `/` | Project landing page |
| `/api/mcp` | MCP HTTP endpoint |
| `/demo` | AI SDK demo host |

## Connect clients to production

### Cursor

Point the MCP config at your Vercel URL:

```json
{
  "transmilenio": {
    "url": "https://YOUR_PROJECT.vercel.app/api/mcp"
  }
}
```

### Vercel AI SDK

```typescript
import { experimental_createMCPClient } from "ai";

const client = await experimental_createMCPClient({
  url: "https://YOUR_PROJECT.vercel.app/api/mcp",
});
```

## Build check

Before deploying, run locally:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm verify doctor
pnpm verify mcp
```

## Notes

- The MCP route uses the Node.js runtime.
- Map tiles come from OpenStreetMap and Carto. No map API key is required.
- Live TransMilenio data requires a valid `CROMA_API_KEY` with remaining credits.
