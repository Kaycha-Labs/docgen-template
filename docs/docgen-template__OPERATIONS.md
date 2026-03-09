# Operations & Runbooks

**Audience:** Engineers, DevOps, SRE  
**Last Updated:** 2026-03-09

## Deployment

The system is deployed via GitHub Actions CI/CD. The core functionality is a reusable workflow (`docgen.yml`) that triggers on repository pushes.

*   **Trigger:** `push` events to any branch (`**`).
*   **Runner:** `ubuntu-latest` (GitHub Hosted).
*   **Engine:** Node.js 20 environment.
*   **Secrets:** `ANTHROPIC_API_KEY`, `DOCGEN_GITHUB_TOKEN`.
*   **Process:**
    1.  Checkout repository (depth 2).
    2.  Clone DocGen engine from template.
    3.  Install dependencies (`npm install`).
    4.  Execute `docgen/index.ts` via `tsx`.
    5.  Cleanup temporary engine files.

## Environments

| Environment | URL | Purpose | Branch |
| :--- | :--- | :--- | :--- |
| CI/CD | `github.com/Jamesjhf1/docgen-template` | Documentation Generation Pipeline | `main` |
| Runtime | `ubuntu-latest` | Node.js 20 Execution Context | N/A |
| Staging | N/A | N/A (Template Repo) | `main` |

*Note: This repository is a template. Consuming repositories inherit the workflow configuration.*

## Monitoring

*   **Workflow Status:** Viewable in GitHub Actions tab for the repository.
*   **Logs:** Available via "Run logs" in the Actions UI.
*   **Health Checks:**
    *   Workflow completion status (Success/Failure).
    *   API Key validation (Anthropic).
    *   Token permissions (GitHub PAT).
*   **Alerting:** GitHub Actions notifications (email/webhook) on workflow failure.

## Runbooks

### Runbook: Deploy to Production

1.  Ensure `docgen/index.ts` and dependencies are updated locally.
2.  Commit changes to the `main` branch.
    ```bash
    git add .
    git commit -m "chore: update docgen engine"
    git push origin main
    ```
3.  Verify the workflow trigger in GitHub Actions.
4.  Confirm successful generation of `docs/` and `DEPS.yaml`.

### Runbook: Rollback a Deployment

1.  Identify the commit hash causing the failure in GitHub Actions.
2.  Revert the commit or checkout the previous stable version.
    ```bash
    git revert <commit-hash>
    git push origin main
    ```
3.  Alternatively, tag the last known good commit and switch the workflow reference.
4.  Verify the workflow runs successfully on the reverted state.

### Runbook: Database Migration

*Note: This repository does not manage a database. This procedure applies to updating the DocGen Engine dependencies.*

1.  Identify required dependency updates in `docgen/package.json`.
2.  Update versions and run `npm install` locally.
3.  Test the engine locally using `tsx docgen/index.ts`.
4.  Commit changes to `main`.
5.  Verify the workflow executes without dependency errors.

### Runbook: Rotate Secrets

1.  Navigate to **Settings > Secrets and variables > Actions** in the repository.
2.  Locate `ANTHROPIC_API_KEY` and `DOCGEN_GITHUB_TOKEN`.
3.  Delete the existing secret.
4.  Create a new secret with the updated value.
5.  Trigger a manual workflow run to validate the new secret.
6.  If using the bootstrap scripts, ensure the `gh` CLI is authenticated with the new token.

## Incident Response

| Severity | Definition | Escalation | Communication |
| :--- | :--- | :--- | :--- |
| **P0** | Workflow permanently failing; docs unavailable. | On-Call Engineer | Slack #ops-alerts |
| **P1** | API errors (Anthropic); partial generation failure. | DevOps Lead | GitHub Issue |
| **P2** | Non-critical errors; skipped files. | Engineering Team | GitHub Issue |

*   **Escalation:** Contact On-Call via PagerDuty/Slack.
*   **Communication:** Post status in repository Discussions or Status Page.

## Maintenance

*   **Scheduled Windows:** None (CI/CD is event-driven).
*   **Dependency Updates:** Quarterly review of `docgen/package.json`.
*   **Engine Upgrades:** Update `docgen` submodule or clone source in workflow when major versions change.
*   **Token Rotation:** Rotate `DOCGEN_GITHUB_TOKEN` every 90 days.

## Scripts

| Script | Description | Usage |
| :--- | :--- | :--- |
| `scripts/bootstrap-repo.sh` | Adds the `docgen.yml` workflow to a single repository. | `./scripts/bootstrap-repo.sh <org/repo>` |
| `scripts/bootstrap-all.sh` | Iterates through an organization and adds the workflow to all repos. | `./scripts/bootstrap-all.sh <org-name>` |

*   **Prerequisites:** `gh` CLI authenticated with `repo` scope.
*   **Output:** Creates `.github/workflows/docgen.yml` in target repositories.
*   **Error Handling:** Skips repos that already contain the workflow; logs failures.