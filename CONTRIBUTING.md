# Contributing to BilboMD

Welcome to BilboMD! 🎉  

This guide outlines how to contribute to our Small Angle X-ray Scattering (SAXS) modeling platform.

## Table of Contents

- [Project Overview](#project-overview)
- [Development Setup](#development-setup)
- [Code Standards](#code-standards)
- [Testing Guidelines](#testing-guidelines)
- [Contribution Workflow](#contribution-workflow)
- [Project Structure](#project-structure)

## Project Overview

BilboMD is a monorepo for SAXS-guided modeling using molecular dynamics simulations,
supporting multiple job types and execution engines.

**Tech Stack:**

- **Frontend**: React + TypeScript + RTK Query + Material-UI
- **Backend**: Express.js + TypeScript + MongoDB + Redis
- **Worker**: Node.js job processor with MD simulation engines
- **Build System**: Turborepo + pnpm workspaces
- **Testing**: Vitest + React Testing Library
- **Deployment**: Docker + Docker Compose

## Development Setup

### Prerequisites

- Node.js 20+
- pnpm 10+
- Docker & Docker Compose
- MongoDB (local or containerized)
- Redis (local or containerized)

### Quick Start

```bash
# Clone and install dependencies
git clone git@github.com:bl1231/bilbomd.git
cd bilbomd
pnpm install

# Transpile the Typescript
pnpm build

# Pull the pre-built Docker images
cd infra
./deploy-to-beamline.sh pull local

# Start all services locally
./deploy-to-beamline.sh local
```

The BilboMD UI (served from the Docker container) should now be available at `https://localhost:3001`

If you want to start a development instance of the ui code

```bash
# Start frontend UI in dev mode
#   which enable hot module reloading
#   so you can instantly see the effect of your code changes.
pnpm -F @bilbomd/ui run dev
```

### Environment Setup

1. Copy environment file and configure as needed:

   ```bash
   cp infra/.env.example infra/.env.local
   ```

2. Edit the `infra/docker-compose.local.yml` file.

   Probably the main thing you want to check is which Docker images are being used. For example this would pull the `v2.2.0` image from the public GitHub Container:

   ```yaml
     backend:
       image: ghcr.io/bl1231/bilbomd-backend:2.2.0
   ```

   This would attempt to use a locally built/tagged image:

   ```yaml
     backend:
       image: bl1231/bilbomd-backend:latest
   ```

3. Start infrastructure services:

   ```bash
   # For local development
   docker-compose --env-file .env.local -f infra/docker-compose.local.yml -p bilbomd-local up -d
   
   # Or use the `deploy-to-beamline.sh` script
   cd infra
   ./deploy-to-beamline.sh local
   ```

If you run into setup issues on your platform, feel free to open an issue or discussion.

## Code Standards

### TypeScript Rules

- Avoid `any` when possible — prefer explicit types or generics
- We generally prefer **functional patterns** and arrow functions
  for consistency across the codebase
- Use **arrow functions** consistently: `const myFunc = () => {}`.
  This is a style preference rather than a hard rule.
- All new code should have proper TypeScript types

### Code Style

```typescript
// ✅ Preferred: Functional approach with arrow functions
const processJob = (job: BilboMDJobDTO): ProcessedJob => {
  // implementation
}

// ❌ Avoid: Classes and function declarations when arrow functions work
function processJob(job: BilboMDJobDTO): ProcessedJob {
  // implementation
}
```

## Testing Guidelines

### Requirements

- **Write unit tests** for all new code
- Place test files in `__tests__` directories **within each module/directory**
- **Avoid** a single `tests` folder at project root
- Example: `src/controllers/jobs/__tests__/getAllJobs.test.ts`

### Vitest Best Practices

```typescript
// Always import vi from vitest for mocking
import { vi } from 'vitest'

// Use vi functions instead of jest equivalents
vi.mock('../../path/to/module')
vi.fn()
vi.clearAllMocks()
```

### React Component Testing

```typescript
// ✅ Good: Test what user sees/does
expect(screen.getByText('Submit')).toBeInTheDocument()
expect(screen.getByRole('button', { name: /submit/i })).toBeEnabled()

// ❌ Avoid: Testing internal state or implementation
expect(component.state.isSubmitting).toBe(false)
```

### Element Selection Strategy

1. **Prefer accessible queries**: `getByRole()`, `getByLabelText()`, `getByText()`
2. **Use data-testid sparingly**: Only when semantic queries aren't sufficient
3. **Handle multiple elements**: Use `getAllByRole()[0]` for first match
4. **Text matching**: Use regex `/partial text/` for dynamic content

### Running Tests

```bash
# Run all tests
pnpm test

# Run tests for specific package
pnpm test --filter @bilbomd/backend
pnpm test --filter @bilbomd/ui

# Run tests in watch mode
pnpm test --watch
```

## Contribution Workflow

### 1. Issue Creation

- Check existing issues before creating new ones
- Use issue templates when available
- Provide clear reproduction steps for bugs
- Include relevant environment information

### 2. Branch Naming

We generally follow conventional commits, but this is not strictly enforced.
Clear, descriptive messages are more important than strict formatting.

### 3. Development Process

1. **Fork** the repository
2. **Create** a feature branch from `main`
3. **Make changes** following code standards
4. **Write tests** for new functionality
5. **Run tests** locally: `pnpm test`
6. **Build** to ensure no errors: `pnpm build`
7. **Commit** with descriptive messages
8. **Push** to your fork
9. **Create** a Pull Request

### 4. Commit Messages

Use conventional commit format:

```bash
feat: add support for OpenMM GPU acceleration
fix: resolve job status synchronization issue
docs: update API documentation for job endpoints
test: add unit tests for job processing pipeline
refactor: optimize database query performance
```

### 5. Pull Request Guidelines

Small, incremental PRs are preferred.
If you’re unsure about scope, open a **draft PR** or issue first.

- **Title**: Clear, descriptive summary of changes
- **Description**: Include context, changes made, and testing approach
- **Link** related issues
- **Screenshots** for UI changes
- **Breaking changes** must be clearly documented

## Project Structure

```bash
bilbomd/
├── apps/
│   ├── backend/         # Express.js REST API
│   ├── ui/              # React SPA frontend
│   ├── worker/          # Job processor for BilboMD pipelines
│   └── scoper/          # Mg2+ Ion prediction for RNA
├── packages/
│   ├── bilbomd-types/   # Shared TypeScript types
│   ├── mongodb-schema/  # Database schemas
│   └── md-utils/        # Molecular dynamics utilities
├── tools/
│   └── python/          # Python utility scripts used by `apps`
└── infra/               # Docker compose files and some Helm charts

```

### Key Directories

- **Place tests** in `__tests__` directories within each module
- **Shared types** go in `packages/bilbomd-types`
- **Database schemas** in `packages/mongodb-schema`
- **Python helper/utility code** in `tools/python`
- **Docker configs** in `infra/`

## Getting Help

- **Issues**: Use GitHub issues for bugs and feature requests
- **Discussions**: Use GitHub discussions for questions
- **Documentation**: Check `docs/` directory for additional guides

## License

This project is licensed under the terms specified in [LICENSE.txt](LICENSE.txt).

---

Thank you for contributing to BilboMD!
