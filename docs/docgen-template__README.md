# docgen-template System Overview

**Audience:** Engineers, Architects, Technical Leads
**Last Updated:** 2026-03-09

## Overview

The `docgen` system is an automated documentation generation tool built with TypeScript and Node.js. It leverages local LLMs via Ollama to analyze codebases, detect changes, and produce production-grade Markdown documentation. This system serves engineering teams by maintaining up-to-date architectural and operational documentation with minimal manual overhead.

## Quick Start

1.  **Clone Repository**
    ```bash
    git clone https://github.com/kaycha-labs/docgen-template.git
    cd docgen-template
    ```

2.  **Initialize Environment**
    ```bash
    ./scripts/bootstrap-repo.sh
    ```

3.  **Configure Environment**
    Ensure `OLLAMA_HOST` is set if running Ollama remotely. Default is `http://localhost:11434`.
    ```bash
    export OLLAMA_HOST=http://localhost:11434
    ```

4.  **Run Documentation Generation**
    ```bash
    npm install
    npm run dev
    ```

## Tech Stack

| Category | Technology | Purpose |
| :--- | :--- | :--- |
| **Runtime** | Node.js | Execution environment |
| **Language** | TypeScript | Type-safe logic implementation |
| **LLM Interface** | Ollama | Local model inference client |
| **Build Tool** | npm | Dependency management and scripts |
| **Automation** | Bash | Repository bootstrapping and CI tasks |
| **Config** | DEPS.yaml | Dependency version pinning |

## Architecture Overview

The system operates as a CLI-driven pipeline. The entry point (`docgen/index.ts`) orchestrates the workflow by scanning the repository, analyzing Git diffs, and invoking the LLM client to generate content.

```text
[CLI Entry] --> [Scanner] --> [Diff Analyzer] --> [LLM Client] --> [Markdown Output]
      |             |             |                |
   index.ts    scanner.ts    diff-analyzer.ts  ollama-client.ts
```

**Key Patterns:**
*   **Dependency Injection:** Modules (`prompts.ts`, `types.ts`) are decoupled for testability.
*   **Git-Aware Scanning:** `git-utils.ts` tracks changes to minimize regeneration scope.
*   **Prompt Management:** `prompts.ts` centralizes LLM instructions for consistent output.

## Key Features

*   **Automated Scanning:** Recursively scans `docgen/` and `scripts/` to identify source context.
*   **Diff Analysis:** Uses `diff-analyzer.ts` to detect code changes and update only affected documentation sections.
*   **Local LLM Integration:** Connects to Ollama for cost-effective, private code analysis.
*   **Dependency Tracking:** Monitors `DEPS.yaml` and `package.json` for version drift.
*   **Error Logging:** Captures generation failures in `docgen/.run-log.jsonl`.

## Project Structure

```text
├── CLAUDE.md                 # AI configuration and constraints
├── DEPS.yaml                 # Dependency versioning
├── docgen/                   # Core documentation engine
│   ├── index.ts              # CLI entry point
│   ├── scanner.ts            # File system traversal
│   ├── diff-analyzer.ts      # Git change detection
│   ├── ollama-client.ts      # LLM API wrapper
│   ├── prompts.ts            # System prompts
│   ├── source-context.ts     # Context extraction
│   ├── types.ts              # TypeScript interfaces
│   ├── package.json          # Node.js dependencies
│   └── tsconfig.json         # Compiler configuration
├── docs/                     # Generated documentation output
└── scripts/                  # Automation scripts
    ├── bootstrap-repo.sh     # Repository initialization
    └── bootstrap-all.sh      # Full system bootstrap
```

## Related Documentation

*   [**Product Overview**](./docgen-template__PRODUCT.md) - Requirements and user stories.
*   [**Architecture Deep Dive**](./docgen-template__ARCHITECTURE.md) - Component diagrams and data flow.
*   [**Engineering Standards**](./docgen-template__ENGINEERING.md) - Coding conventions and CI/CD.
*   [**Operations Guide**](./docgen-template__OPERATIONS.md) - Deployment and monitoring.
*   [**Security Policy**](./docgen-template__SECURITY.md) - Threat model and compliance.
*   [**Release Notes**](./docgen-template__RELEASES.md) - Version history and changelogs.
*   [**Data Model**](./docgen-template__DATA.md) - Schema and data contracts.