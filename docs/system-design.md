# System Design & Tradeoffs

## Overview

The Store Platform is a Kubernetes-native orchestration system that deploys fully isolated WooCommerce stores on demand. Each store runs in its own namespace with dedicated MariaDB, WordPress, and WooCommerce instances.

## Architecture

### Components

1. **React Dashboard** - SPA for managing stores (create, monitor, delete). Served via nginx with API reverse-proxy.
2. **Express Backend** - REST API that orchestrates Kubernetes resources via Helm CLI. Manages state in SQLite. Exposes metrics for observability.
3. **Helm Charts** - Declarative infrastructure as code for both the platform and per-store deployments.
4. **Kubernetes** - Container orchestration providing isolation, networking, and persistence.

### Data Flow

```
Create Store Request:
  Dashboard → POST /api/stores → Backend validates (Joi) → Check max stores & duplicates
  → Insert DB (status: provisioning) → Return 201 immediately
  → Concurrency queue: if slots available → helm install → Poll readiness → Update DB
  → Dashboard polls every 5s → Status: ready

Delete Store Request:
  Dashboard → DELETE /api/stores/:id → Backend updates DB (status: deleting)
  → Return 200 immediately → Background: helm uninstall → kubectl delete namespace
  → Update DB (status: deleted)
```

## Key Design Decisions

### 1. SQLite over ConfigMaps/External DB
- Simpler queries and joins for audit logs
- ACID transactions for state management
- WAL mode for concurrent read performance
- No external database dependency for the platform itself
- Tradeoff: limits backend to single-writer (addressed by concurrency queue)

### 2. Helm CLI via child_process
- More reliable than Helm SDK (which is Go-native, no official Node.js SDK)
- Same interface as manual usage — easy to debug by running the same commands
- Timeout handling built-in via child_process options
- Stderr capture for error reporting back to the user
- Tradeoff: requires helm binary in the container image

### 3. Async Provisioning with Concurrency Queue
- API returns immediately with "provisioning" status (non-blocking)
- Background process handles Helm install with configurable concurrency limit (default: 3)
- Prevents overwhelming the cluster with too many simultaneous provisions
- Dashboard polls for status updates every 5 seconds
- Prevents HTTP timeout on slow provisions (WordPress + WooCommerce can take 3-5 min)

### 4. Namespace-per-Store Isolation
- Strong resource isolation (CPU, memory, storage via ResourceQuota)
- Network isolation via NetworkPolicy (deny-by-default)
- Independent secrets per namespace
- Clean teardown: `kubectl delete namespace` removes everything atomically
- No cross-store interference possible

### 5. nip.io for Local DNS
- Zero-configuration wildcard DNS
- `<anything>.127-0-0-1.nip.io` resolves to 127.0.0.1
- No /etc/hosts editing needed for Minikube + tunnel
- In production, replaced with real wildcard DNS via Helm values

### 6. Helm Post-Install Hook for WP-CLI
- WooCommerce initialization runs as a Kubernetes Job (post-install hook)
- Init container waits for WordPress readiness before running WP-CLI
- Retryable with backoffLimit of 5
- Clean separation from deployment lifecycle — Job runs once after install

## Isolation, Resources & Reliability

### Per-Store Isolation
- **Namespace**: Each store runs in `store-<name>` namespace
- **ResourceQuota**: Max 6 pods, 3Gi memory, 2 CPU cores per store namespace
- **LimitRange**: Default container limits 512Mi/500m, default requests 128Mi/100m
- **NetworkPolicy**: Deny-all-ingress with explicit allows for ingress controller and intra-namespace; DNS and HTTPS egress allowed
- **Secrets**: Per-store generated passwords (crypto.randomBytes), stored as Kubernetes Secrets (not in source code)
- **PVCs**: Dedicated persistent volumes per store (MariaDB 2Gi + WordPress 2Gi)

### Idempotency and Failure Handling
- **Duplicate rejection**: Store names are unique; creating a duplicate returns 409
- **Startup reconciliation**: On backend restart, all stale "provisioning" stores are marked "failed" with a clear message
- **Helm idempotency**: `helm install` with unique release names; Helm handles atomic rollback on failed installs
- **Namespace cleanup**: `kubectl delete namespace --ignore-not-found` tolerates already-deleted resources
- **Provisioning timeout**: Helm install has a 10-minute `activeDeadlineSeconds` on the init Job
- **All operations audited**: Every create/delete/success/failure logged to audit_log table with timestamps and IP

### Cleanup Guarantees
- Delete triggers `helm uninstall` to remove the Helm release
- Then `kubectl delete namespace` removes all remaining resources (PVCs, Secrets, etc.)
- Even if Helm uninstall partially fails, namespace deletion is the ultimate cleanup
- Store status tracked in DB through the full lifecycle: provisioning → ready → deleting → deleted

## Security Posture

### Secret Handling
- Database passwords and WordPress admin credentials are generated per-store using `crypto.randomBytes`
- Secrets are passed to Helm via `--set` flags (never written to disk as files)
- Kubernetes Secrets are the canonical store; application reads them via env vars from secretKeyRef
- No secrets are hardcoded in source code, Helm charts, or Docker images
- `.env.example` contains placeholder values only

### RBAC / Least Privilege
- Backend runs as a dedicated ServiceAccount (`store-platform-backend`)
- ClusterRole grants access only to resources needed for provisioning:
  - Core: namespaces, pods, services, secrets, PVCs, configmaps, resourcequotas, limitranges
  - Apps: deployments, statefulsets
  - Batch: jobs
  - Networking: ingresses, networkpolicies
- All verbs are needed because the backend creates and tears down complete namespaces
- ClusterRoleBinding scoped to the specific ServiceAccount in the platform namespace

### Public vs Internal Exposure
- **Public (via Ingress)**: Dashboard UI, Backend API, Store storefronts
- **Internal only (ClusterIP)**: MariaDB services (port 3306), WordPress services (port 80 within namespace), Backend-to-Helm communication
- NetworkPolicy ensures MariaDB is only reachable from within its own namespace
- Dashboard communicates with backend via nginx reverse proxy (no direct exposure needed)

### Container Hardening
- **MariaDB**: Runs as non-root (UID 1001), `allowPrivilegeEscalation: false`, fsGroup 1001
- **WordPress**: `allowPrivilegeEscalation: false`, fsGroup 33 (www-data)
- **WP-CLI init Job**: Runs as UID 33 (www-data), `allowPrivilegeEscalation: false`
- **Backend**: Node.js on Alpine (minimal attack surface)
- **Dashboard**: nginx on Alpine (minimal attack surface, static files only)
- All containers have explicit resource requests and limits

## Horizontal Scaling Plan

### What Scales Horizontally
| Component | Scalable? | How |
|-----------|-----------|-----|
| Dashboard (nginx) | Yes — stateless | HPA on CPU, replicas: 2-5 in prod |
| Backend API | Partially — SQLite is single-writer | HPA on CPU/memory, replicas: 2-5 in prod |
| Store instances | Yes — each in own namespace | No limit except cluster resources |

### Scaling Provisioning Throughput
- **Concurrency queue**: Configurable `MAX_CONCURRENT_PROVISIONS` (default 3, prod 5) prevents cluster overload
- **Horizontal backend scaling**: Multiple backend replicas can serve read requests; writes are serialized by SQLite WAL mode
- **Queue draining**: When a provision completes, the next queued provision starts automatically

### Stateful Constraints
- **SQLite**: Single-writer limitation. For true horizontal write scaling, migrate to PostgreSQL.
  - Current mitigation: WAL mode allows concurrent reads while one writer holds the lock
  - In practice, write operations (store create/update) are infrequent and fast
- **Helm releases**: Helm state is stored in Kubernetes Secrets (not in SQLite), so any backend replica can run Helm commands
- **Per-store databases**: Each MariaDB is independent — no cross-store scaling concern

### HPA Configuration (Production)
- Backend: min 2, max 5 replicas, scales at 70% CPU / 80% memory
- Dashboard: min 2, max 3 replicas, scales at 70% CPU
- Enabled via `values-prod.yaml` with `autoscaling.enabled: true`

## Abuse Prevention

### Rate Limiting
- **API-level**: 30 requests/minute per IP across all endpoints
- **Store creation**: 5 requests/minute per IP (stricter)
- Implemented via `express-rate-limit` middleware

### Blast-Radius Controls
- **Max stores**: Configurable limit (default 10, prod 50) — prevents unbounded resource consumption
- **Max resources per store**: ResourceQuota caps each namespace at 6 pods, 3Gi memory, 2 CPU
- **Provisioning timeout**: Helm Job has `activeDeadlineSeconds: 600` (10 min) — prevents hung provisions
- **Concurrency limit**: Max 3 concurrent provisions (configurable) — prevents cluster overload
- **LimitRange**: Default container limits prevent any single container from consuming excessive resources

### Audit Trail
- Every action logged to `audit_log` table: store_id, action, details (JSON), IP address, timestamp
- Actions tracked: `create`, `provision_success`, `provision_failed`, `delete_start`, `delete_success`, `delete_failed`
- Accessible via API: `GET /api/stores/audit/log`
- Surfaced in dashboard Activity Log tab

### Observability
- **Metrics endpoint**: `GET /api/metrics` returns total stores, stores by status, failure count, average provisioning duration, active/queued provisions
- **Activity log**: Dashboard shows real-time audit trail
- **Error reporting**: Failed stores show the specific error message in the dashboard (e.g., "WP-CLI: could not connect to database")
- **Structured logging**: Pino JSON logger with request context (store ID, operation, errors)

## Local-to-VPS Production Story

### What Changes via Helm Values

| Concern | Local (`values-local.yaml`) | Production (`values-prod.yaml`) |
|---------|---------------------------|--------------------------------|
| Kubernetes | Minikube | k3s on VPS |
| Ingress class | nginx (Minikube addon) | traefik (k3s default) |
| Base domain | 127-0-0-1.nip.io | stores.yourdomain.com |
| Image pull | `Never` (local build) | `Always` (container registry) |
| Replicas | 1 | 2 (with HPA up to 5) |
| Max stores | 10 | 50 |
| TLS | None | cert-manager + Let's Encrypt |
| Storage class | standard (Minikube) | local-path (k3s) |
| PVC sizes | 1-2Gi | 5-10Gi |
| DNS | nip.io wildcard | Wildcard A record |

### Ingress Strategy
- Local: `minikube tunnel` + nip.io gives instant wildcard routing
- Production: Wildcard A record (`*.stores.yourdomain.com`) pointed at VPS IP
- Same Ingress template, different `className` and host patterns via values

### Secrets Strategy
- Local: Generated per-store, stored in Kubernetes Secrets
- Production: Same approach, but secrets could also be managed via external-secrets-operator for integration with Vault/AWS Secrets Manager

### Upgrade/Rollback with Helm
```bash
# View release history
helm history store-platform

# Upgrade with new image
helm upgrade store-platform ./helm/store-platform/ \
  -f ./helm/store-platform/values-prod.yaml \
  --set backend.image=ghcr.io/user/backend:v1.1.0

# Rollback to previous revision
helm rollback store-platform 1

# Per-store chart upgrades (e.g., new WordPress version)
helm upgrade wc-mystore ./helm/woocommerce-store/ \
  --set wordpress.image=wordpress:6.9-apache
```
- Helm maintains revision history — instant rollback to any previous state
- Platform upgrades are independent of store upgrades
- Rolling update strategy ensures zero downtime for platform components
- Store upgrades use Recreate strategy (required due to RWO PVC for WordPress)

## Capacity Planning

- Default max stores: 10 (configurable via Helm values)
- Per store: ~1Gi memory, 1 CPU (limits), ~4Gi storage (MariaDB 2Gi + WordPress 2Gi)
- Minikube recommended: 2 CPUs, 3Gi RAM (can handle 2-3 stores)
- Production VPS: 4 CPUs, 16Gi RAM (can handle 10-15 stores comfortably)
