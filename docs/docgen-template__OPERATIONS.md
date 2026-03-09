# Operations & Runbooks

**Last Updated:** 2026-03-09

## Deployment

The `docgen-template` repository is deployed via a CI/CD pipeline triggered on merge to protected branches. The system is containerized and deployed to Kubernetes clusters.

### CI/CD Pipeline
- **Trigger:** Push to `main` or `release/*` branches.
- **Actions:**
  1. Lint and type-check (`docgen/`).
  2. Unit tests (`docgen/`).
  3. Build Docker image (multi-stage build).
  4. Push image to container registry.
  5. Update Helm values and trigger deployment.

### Manual Deployment
For local development or emergency hotfixes:
1. Ensure `docker` and `kubectl` are configured.
2. Run `./scripts/bootstrap-repo.sh` to initialize local dependencies.
3. Build image: `docker build -t docgen-template:latest .`
4. Deploy: `kubectl apply -f k8s/deployment.yaml`

## Environments

| Environment | URL | Purpose | Branch |
| :--- | :--- | :--- | :--- |
| Development | `dev-docgen.kaycha.labs` | Feature testing, local integration | `feature/*` |
| Staging | `staging-docgen.kaycha.labs` | QA validation, UAT | `release/*` |
| Production | `docs.kaycha.labs` | Live documentation generation | `main` |

## Monitoring

### Dashboards
- **Infrastructure:** CPU, Memory, Disk I/O (Prometheus/Grafana).
- **Application:** Request latency, Error rates, LLM API latency (Qwen3.5).
- **Business:** Docs generated per hour, Cache hit ratio.

### Health Checks
- **Endpoint:** `/health` (200 OK), `/ready` (200 OK).
- **LLM Dependency:** Periodic ping to Qwen3.5 endpoint; failure triggers alert.

### Alerting
- **P0:** Service down, LLM API failure > 5 mins.
- **P1:** High error rate (> 5%), Latency > 2s.
- **P2:** Disk usage > 80%, Cache miss rate spike.

## Runbooks

### Runbook: Deploy to Production
**Prerequisites:**
- Merge request approved.
- CI pipeline passed.

**Steps:**
1. Verify CI pipeline status on GitHub Actions.
2. Confirm Helm chart version bump in `k8s/values.yaml`.
3. Execute deployment:
   ```bash
   kubectl apply -f k8s/deployment.yaml
   ```
4. Verify rollout:
   ```bash
   kubectl rollout status deployment/docgen-template
   ```
5. Check health endpoint: `curl https://docs.kaycha.labs/health`.
6. Monitor logs for 15 minutes: `kubectl logs -f deployment/docgen-template`.

### Runbook: Rollback a Deployment
**Prerequisites:**
- Identified failed deployment.
- Access to previous stable image tag.

**Steps:**
1. Identify previous stable tag:
   ```bash
   kubectl get deployment docgen-template -o jsonpath='{.spec.template.spec.containers[0].image}'
   ```
2. Revert image tag in `k8s/values.yaml`.
3. Apply rollback:
   ```bash
   kubectl rollout undo deployment/docgen-template
   ```
4. Verify rollback completion:
   ```bash
   kubectl rollout status deployment/docgen-template
   ```
5. Confirm service health.

### Runbook: Database Migration
**Prerequisites:**
- Backup completed.
- Migration script reviewed.

**Steps:**
1. Stop write traffic (if applicable).
2. Run migration script:
   ```bash
   kubectl exec -it <db-pod> -- ./migrate.sh --version <target>
   ```
3. Verify schema integrity.
4. Restart application pods to pick up schema changes.
5. Resume write traffic.

### Runbook: Rotate Secrets
**Prerequisites:**
- New secret generated.
- Deployment window scheduled.

**Steps:**
1. Update secret in Kubernetes:
   ```bash
   kubectl create secret generic docgen-secrets --from-literal=KEY=<new_value> --dry-run=client -o yaml | kubectl apply -f -
   ```
2. Trigger pod restart:
   ```bash
   kubectl rollout restart deployment/docgen-template
   ```
3. Verify application can read new secret.
4. Remove old secret reference from config.

## Incident Response

### Severity Levels
- **P0 (Critical):** System down, data loss, security breach. Response time: < 15 mins.
- **P1 (High):** Major functionality impaired, high error rate. Response time: < 1 hour.
- **P2 (Medium):** Minor functionality impaired, degraded performance. Response time: < 4 hours.
- **P3 (Low):** Cosmetic issues, feature requests. Response time: < 24 hours.

### Escalation
1. **On-Call Engineer:** Triage and initial mitigation.
2. **Engineering Lead:** If unresolved within 30 mins (P0/P1).
3. **CTO:** If unresolved within 2 hours (P0).

### Communication
- **Internal:** Slack channel `#incidents`.
- **External:** Status page update for P0/P1.
- **Post-Mortem:** Required for all P0/P1 incidents within 48 hours.

## Maintenance

### Scheduled Windows
- **Weekly:** Tuesday 02:00 UTC (Low traffic).
- **Monthly:** First Sunday 00:00 UTC (Major updates).

### Upgrade Procedures
1. Review changelog for breaking changes.
2. Update `DEPS.yaml` and `docgen/package.json`.
3. Run `./scripts/bootstrap-all.sh` to update dependencies.
4. Test in Staging environment.
5. Deploy to Production during maintenance window.

## Scripts

| Script | Description | Usage |
| :--- | :--- | :--- |
| `bootstrap-all.sh` | Initializes full environment (deps, lint, build). | `./scripts/bootstrap-all.sh` |
| `bootstrap-repo.sh` | Sets up local repo state and git hooks. | `./scripts/bootstrap-repo.sh` |
| `docgen/index.ts` | Core CLI entry point for documentation generation. | `npx ts-node docgen/index.ts` |
| `docgen/scanner.ts` | Scans source code for documentation markers. | Internal use |
| `docgen/prompts.ts` | Manages LLM prompt templates for Qwen3.5. | Internal use |