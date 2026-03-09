# Developer Guide

**Audience:** Engineers, Contributors
**Last Updated:** 2026-03-09

## Prerequisites

Before contributing, ensure the following tools are installed:

| Tool | Minimum Version | Notes |
| :--- | :--- | :--- |
| **Node.js** | 20.x | LTS version required |
| **pnpm** | 9.x | Package manager for `docgen/` |
| **Git** | 2.x | Version control |
| **Bash** | 5.x | For bootstrap scripts |

## Getting Started

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/kaycha-labs/docgen-template.git
    cd docgen-template
    ```

2.  **Initialize the repository:**
    Run the bootstrap script to install dependencies and configure the environment.
    ```bash
    ./scripts/bootstrap-repo.sh
    ```

3.  **Verify installation:**
    ```bash
    pnpm --prefix docgen install
    ```

## Environment Variables

No environment variables are required for basic operation. The `docgen/` tool operates with default configurations.

| Variable | Required | Description | Example |
| :--- | :--- | :--- | :--- |
| `NODE_ENV` | No | Runtime environment | `development` |
| `DOCS_DIR` | No | Override default docs output path | `./docs` |
| `LOG_LEVEL` | No | Verbosity for docgen logs | `debug` |

## Project Structure

```text
├── CLAUDE.md                 # AI assistant configuration
├── DEPS.yaml                 # Dependency definitions
├── docgen/                   # Documentation generator logic
│   ├── index.ts            # CLI entry point
│   ├── scanner.ts          # Source file analysis
│   ├── prompts.ts          # LLM prompt templates
│   ├── package.json        # Node.js dependencies
│   └── tsconfig.json       # TypeScript configuration
├── docs/                     # Generated documentation output
└── scripts/                  # Automation scripts
    ├── bootstrap-repo.sh   # Repository initialization
    └── bootstrap-all.sh    # Full environment setup
```

## Development Workflow

1.  **Branching:**
    *   `main`: Production-ready code.
    *   `feature/*`: New features.
    *   `fix/*`: Bug fixes.
    *   `chore/*`: Maintenance tasks.

2.  **Pull Requests:**
    *   Squash commits before merging.
    *   Ensure all CI checks pass.
    *   Update relevant documentation in `docs/`.

3.  **Code Review:**
    *   At least one approval required.
    *   Linting and type checks must pass.

## Coding Standards

*   **Language:** TypeScript (Strict mode enabled).
*   **Formatting:** Prettier (configured in `docgen/`).
*   **Linting:** ESLint (configured in `docgen/`).
*   **Naming:**
    *   Files: `kebab-case` (e.g., `source-context.ts`).
    *   Functions: `camelCase`.
    *   Constants: `UPPER_SNAKE_CASE`.
*   **Imports:** Grouped and sorted (standard TypeScript convention).

## Testing

Run tests from the `docgen/` directory.

```bash
cd docgen
pnpm test
```

*   **Unit Tests:** `pnpm test:unit`
*   **Integration Tests:** `pnpm test:integration`
*   **Coverage:** `pnpm test:coverage`

## Build & Deploy

**Build:**
```bash
cd docgen
pnpm build
```
This compiles TypeScript to JavaScript in `docgen/dist/`.

**Deploy:**
1.  Generate documentation:
    ```bash
    pnpm docgen --output docs/
    ```
2.  Commit changes to `docs/`.
3.  Push to `main` branch.
4.  CI pipeline triggers documentation site update.

## Troubleshooting

| Issue | Solution |
| :--- | :--- |
| `pnpm: command not found` | Install pnpm: `npm install -g pnpm` |
| `bootstrap-repo.sh: Permission denied` | Run `chmod +x scripts/bootstrap-repo.sh` |
| `TypeScript errors` | Run `pnpm build` to check types locally |
| `Ollama connection failed` | Ensure Ollama service is running locally |
| `Docs not updating` | Clear `docs/` cache and re-run `docgen` |