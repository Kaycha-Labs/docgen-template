# Security & Compliance

**Audience:** Engineers, Security Team, Compliance  
**Last Updated:** 2026-03-09

## Authentication

Authentication is handled via **Supabase Auth** (JWT-based).

- **Providers:** Email/Password, OAuth (Google, GitHub).
- **Flow:**
  1. User signs in via Supabase Client.
  2. Supabase issues `access_token` (JWT) and `refresh_token`.
  3. Client stores tokens in `httpOnly` cookies (server-side) or secure storage (client-side).
  4. All API requests include `Authorization: Bearer <token>`.
- **Token Handling:**
  - Access tokens expire after 1 hour.
  - Refresh tokens rotate on use.
  - Tokens are validated against Supabase JWT secret on every request.

## Authorization (RBAC)

Access control follows a Role-Based Access Control (RBAC) model enforced at the application and database layers.

| Role | Permissions | Access Level |
| :--- | :--- | :--- |
| **Admin** | Full CRUD, User Management, System Config | Organization-wide |
| **Member** | CRUD own resources, Read shared resources | Project-level |
| **Viewer** | Read-only access to assigned resources | Project-level |
| **Service** | API access for background jobs | System-level |

## Row Level Security (RLS)

RLS is enforced on all public tables in the `public` schema. Policies are defined in `db/migrations`.

**General Policy Pattern:**
```sql
-- Enable RLS
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Example: Users can only see their own data
CREATE POLICY "Users can view own data"
ON public.users
FOR SELECT
USING (auth.uid() = id);

-- Example: Users can update own data
CREATE POLICY "Users can update own data"
ON public.users
FOR UPDATE
USING (auth.uid() = id);
```

**Active Policies:**
- `public.users`: `auth.uid() = id`
- `public.projects`: `auth.uid() IN (SELECT user_id FROM project_members WHERE project_id = id)`
- `public.documents`: `auth.uid() IN (SELECT user_id FROM document_permissions WHERE document_id = id)`

## API Security

- **Rate Limiting:** 100 requests/minute per IP/User via Supabase Edge Functions.
- **CORS:** Restricted to approved origins defined in environment variables (`NEXT_PUBLIC_ALLOWED_ORIGINS`).
- **Input Validation:** All inputs validated using **Zod** schemas before database interaction.
- **Headers:** Security headers enforced via middleware (`X-Content-Type-Options`, `X-Frame-Options`, `Strict-Transport-Security`).

## Secrets Management

Secrets are managed via environment variables injected at runtime. No secrets are stored in code or version control.

| Secret | Storage | Rotation Policy |
| :--- | :--- | :--- |
| **Supabase URL** | Environment Variable | Manual update on rotation |
| **Supabase JWT Secret** | Environment Variable | Manual update on rotation |
| **API Keys (3rd Party)** | Secrets Manager / Vault | Quarterly rotation |
| **Database Credentials** | Environment Variable | Quarterly rotation |

## Data Protection

- **Encryption at Rest:** Managed by Supabase (AES-256).
- **Encryption in Transit:** TLS 1.3 enforced for all connections.
- **PII Handling:**
  - PII fields (email, phone) are masked in logs.
  - Sensitive data is encrypted at the application layer before storage where required.
  - Data retention policies enforced via cron jobs.

## Compliance

- **SOC2:** Infrastructure compliant with SOC2 Type II controls.
- **GDPR:** Data subject rights (export, deletion) supported via API endpoints.
- **HIPAA:** BAA available for enterprise plans; encryption and access logs enabled.
- **Audit Logging:** All auth and data modification events logged to `audit_logs` table.

## Security Checklist

Pre-deploy security review items:

- [ ] All secrets rotated and stored in environment variables.
- [ ] RLS policies verified on all new tables.
- [ ] Input validation schemas updated for new endpoints.
- [ ] CORS origins updated for new domains.
- [ ] Dependency audit (`npm audit` / `yarn audit`) passed.
- [ ] Rate limiting configured for public endpoints.
- [ ] Security headers verified in production build.
- [ ] Access tokens validated for expiration handling.