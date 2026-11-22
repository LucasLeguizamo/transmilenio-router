# Contributing to TransMilenio MCP

Thank you for your interest in contributing! This document explains how to get started.

## Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md). By participating, you agree to uphold this code.

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm 9+
- A Croma API key (for live testing)

### Setup

```bash
git clone https://github.com/LucasLeguizamo/transmilenio-router
cd transmilenio-router
pnpm install
cp .env.example .env
# Edit .env to add your CROMA_API_KEY
```

### Verify Your Setup

```bash
pnpm verify doctor
```

All critical checks should pass.

## Development Workflow

### 1. Create a Branch

```bash
git checkout -b feature/your-feature-name
```

### 2. Make Changes

Follow the expert personas in [AGENTS.md](AGENTS.md) for domain-specific guidance.

### 3. Verify Your Changes

```bash
pnpm verify all
```

This runs:
- Health checks
- MCP tool tests
- UI rendering tests

### 4. Run the Full Check Suite

```bash
pnpm lint
pnpm typecheck
pnpm test
```

### 5. Commit and Push

```bash
git add .
git commit -m "feat(scope): description"
git push origin feature/your-feature-name
```

Use conventional commits:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation only
- `refactor`: Code change that neither fixes a bug nor adds a feature
- `test`: Adding or fixing tests
- `chore`: Maintenance tasks

### 6. Open a Pull Request

Include:
- What changed and why
- How to verify the change
- Screenshots for UI changes
- Any limitations or known issues

## Using pstack (Recommended)

This project follows [pstack](https://github.com/cursor/plugins/tree/main/pstack) methodology. If you use Cursor:

### Install pstack

```
/add-plugin pstack
```

### Configure pstack

```
/setup-pstack
```

### Work in poteto-mode

```
/poteto-mode <your task description>
```

### Maintain the Verification Skill

After significant changes:

```
/maintain-verification-skill
```

## Project Structure

```
src/
├── lib/
│   ├── croma/          # Croma API client
│   │   ├── client.ts   # API client class
│   │   └── types.ts    # Zod schemas and types
│   ├── routing/        # Route planning
│   │   ├── planner.ts  # Routing algorithm
│   │   └── types.ts    # Route plan types
│   └── mcp/            # MCP server
│       ├── server.ts   # Server setup
│       └── tools.ts    # Tool implementations
├── ui/
│   └── components/     # React components
└── app/                # Next.js pages
```

## Code Style

### TypeScript

Follow the patterns in `typescript-best-practices`:

- Use discriminated unions for variants
- Brand primitives that shouldn't mix
- Parse external data with Zod at boundaries
- No `as` casts without validation
- Exhaustive switches with `never` checks

### Documentation

Follow `technical-writing`:

- One thought per sentence
- Use the real symbol/command name
- Write for a tired engineer
- Keep it dry in reference docs

## Testing

### Unit Tests

```bash
pnpm test
```

Tests use Vitest. Add tests in `tests/` directory.

### MCP Tool Tests

```bash
pnpm verify mcp
```

By default, uses fixture data. For live API:

```bash
pnpm verify mcp --live
```

### UI Tests

```bash
pnpm verify ui
```

Requires Playwright. Install with:

```bash
npx playwright install chromium
```

## Expert Personas

See [AGENTS.md](AGENTS.md) for domain experts:

- **Transit Routing Expert**: Route algorithms
- **Croma API Expert**: API integration
- **MCP & MCP Apps Expert**: MCP server
- **Map/Geo UX Expert**: Map rendering
- **Accessibility Expert**: WCAG compliance
- **Security & Privacy Expert**: Credentials and data

## Need Help?

- Open an issue for bugs or feature requests
- Use discussions for questions
- Check existing issues before creating new ones

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
