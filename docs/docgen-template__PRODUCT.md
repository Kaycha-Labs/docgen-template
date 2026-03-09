# Product & Features

**Audience:** Product Managers, Engineers, Stakeholders
**Last Updated:** 2026-03-09

## Product Vision

Kaycha DocGen is an automated technical documentation engine designed to maintain up-to-date repository documentation through AI-assisted analysis and static code scanning. The product solves the problem of documentation drift by integrating directly into the development workflow, ensuring that architectural decisions, data schemas, and operational procedures are reflected in the `docs/` directory without manual intervention.

**Target Users:**
*   **Maintainers:** Developers responsible for repository health and documentation accuracy.
*   **Stakeholders:** Product Managers and Architects requiring accurate system overviews.
*   **CI/CD Systems:** Automated pipelines requiring documentation validation.

## User Roles

| Role | Description | Key Permissions |
| :--- | :--- | :--- |
| **Maintainer** | Primary developer or team lead responsible for the repository. | Run `docgen` locally, approve generated diffs, modify `DEPS.yaml`. |
| **CI/CD Bot** | Automated service running in the pipeline. | Trigger scans on push, commit documentation updates, read-only access to `docs/`. |
| **Reviewer** | External stakeholder or auditor. | Read-only access to generated Markdown files in `docs/`. |

## Core Features

### Source Analysis
*   **Codebase Scanning:** Automatically traverses the repository structure to identify source files, configuration files, and entry points.
    *   Supports TypeScript/JavaScript (`docgen/index.ts`, `scanner.ts`).
    *   Detects shell scripts (`scripts/bootstrap-repo.sh`).
    *   **Access:** Maintainer, CI/CD Bot.
*   **Dependency Mapping:** Analyzes `DEPS.yaml` and `package.json` to track external tooling and library requirements.
    *   **Access:** Maintainer, CI/CD Bot.

### AI Integration
*   **Ollama Client:** Interfaces with local or remote LLM instances for content generation.
    *   Handles prompt injection and response parsing.
    *   **Access:** Maintainer, CI/CD Bot.
*   **Prompt Engineering:** Maintains structured prompts for specific documentation types (Architecture, Security, Operations).
    *   **Access:** Maintainer.

### Diff & Version Control
*   **Git Integration:** Utilizes `git-utils.ts` to track changes between commits and branches.
    *   **Access:** Maintainer, CI/CD Bot.
*   **Diff Analysis:** Compares current state against previous documentation to identify drift.
    *   **Access:** Maintainer, CI/CD Bot.
*   **Bootstrap Automation:** Provides scripts to initialize documentation structure from scratch.
    *   **Access:** Maintainer.

### Output Generation
*   **Markdown Rendering:** Generates production-grade Markdown files for each domain (Architecture, Data, Engineering, Operations, Product, README, Releases, Security).
    *   **Access:** Maintainer, CI/CD Bot.
*   **Error Handling:** Captures generation failures in `.docgen-error.md` for debugging.
    *   **Access:** Maintainer.

## User Workflows

### Initial Bootstrap
1.  **Trigger:** Maintainer runs `./scripts/bootstrap-all.sh`.
2.  **Execution:** System scans repository structure and initializes `docs/` directory.
3.  **Generation:** AI models generate initial content for all domain files.
4.  **Commit:** Generated files are staged and committed to the repository.

### Incremental Update
1.  **Trigger:** Git push event or manual `docgen` command.
2.  **Scan:** `scanner.ts` identifies changed source files.
3.  **Analyze:** `diff-analyzer.ts` determines which documentation sections require updates.
4.  **Generate:** `ollama-client.ts` fetches updated content based on prompts.
5.  **Validate:** System checks for errors; if successful, updates `docs/` files.
6.  **Commit:** Changes are committed automatically by CI/CD Bot.

## Feature Status

| Feature | Status | Notes |
| :--- | :--- | :--- |
| **Source Scanning** | Live | Core functionality, stable. |
| **AI Generation** | Live | Requires Ollama instance configuration. |
| **Diff Analysis** | Live | Tracks changes between commits. |
| **Bootstrap Script** | Live | One-time setup for new repositories. |
| **Dependency Sync** | Live | Updates `DEPS.yaml` based on code usage. |
| **Error Logging** | Live | Writes to `.docgen-error.md` on failure. |
| **Multi-Repo Support** | Planned | Currently single-repository scoped. |
| **UI Dashboard** | Planned | Web interface for review and approval. |