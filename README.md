# Kubernetes Store Orchestration Platform

A self-service platform for deploying isolated WooCommerce stores on Kubernetes. Each store gets its own namespace with MariaDB, WordPress+WooCommerce, ingress, and security policies. Designed to run locally on Minikube and deploy to production (k3s VPS) with only Helm values changes.

## Architecture

```
User → React Dashboard → Express Backend API → Kubernetes API / Helm CLI
                                                      ↓
                                              Per-Store Namespace
                                              ├── MariaDB (StatefulSet + PVC)
                                              ├── WordPress+WooCommerce (Deployment + PVC)
                                              ├── WP-CLI Init Job (post-install hook)
                                              ├── Ingress (<store>.127.0.0.1.nip.io)
                                              ├── Secrets, ResourceQuota, LimitRange
                                              └── NetworkPolicy
```

**Key components:**
- **Dashboard**: React SPA (Vite) served via nginx, polls backend for status updates
- **Backend**: Express.js API with SQLite, orchestrates Helm CLI for K8s provisioning
- **WooCommerce Chart**: Per-store Helm chart creating a full WordPress+WooCommerce stack
- **Platform Chart**: Helm chart for the dashboard, backend, RBAC, and ingress

## Prerequisites

- Docker (Docker Desktop or Colima)
- Minikube
- kubectl
- Helm 3

Install on macOS:
```bash
brew install minikube kubectl helm
# Docker Desktop:
brew install --cask docker
# Or use Colima (lightweight alternative):
brew install docker colima && colima start --cpu 2 --memory 4 --disk 8
```

## Quick Start (Local with Minikube)

```bash
# 1. Start Minikube with sufficient resources
minikube start --cpus=2 --memory=3072 --driver=docker
minikube addons enable ingress

# 2. Build images inside Minikube's Docker daemon
eval $(minikube docker-env)
docker build -t store-platform-backend:latest -f Dockerfile.backend .
docker build -t store-platform-dashboard:latest ./dashboard/

# 3. Deploy the platform
helm upgrade --install store-platform ./helm/store-platform/ \
  -f ./helm/store-platform/values-local.yaml --wait

# 4. Start the tunnel (required for ingress on macOS)
minikube tunnel

# 5. Access the dashboard
# Port-forward for direct access:
kubectl port-forward -n store-platform svc/dashboard 8080:80
open http://localhost:8080
# Or via ingress (requires tunnel):
open http://dashboard.127.0.0.1.nip.io
```

Or use the setup script:
```bash
chmod +x scripts/setup-local.sh && ./scripts/setup-local.sh
```

### Local Domain Approach

We use [nip.io](https://nip.io) for zero-configuration wildcard DNS:
- `<store-name>.127.0.0.1.nip.io` resolves to `127.0.0.1` automatically
- No `/etc/hosts` editing required
- Works with `minikube tunnel` which exposes ingress on localhost
- Each store gets a unique subdomain (e.g., `my-shop.127.0.0.1.nip.io`)

## Creating a Store and Placing an Order

### Step 1: Create a Store
1. Open the dashboard at `http://localhost:8080`
2. Click **Create Store**
3. Enter a name (lowercase letters, numbers, hyphens — e.g., `my-shop`)
4. Select **WooCommerce** as the store type
5. Click **Create** — the store starts provisioning

### Step 2: Wait for Ready Status
- The dashboard auto-polls every 5 seconds
- Status progresses: **Provisioning** → **Ready**
- Provisioning takes 3-5 minutes (MariaDB startup + WordPress init + WooCommerce install)
- If a store fails, the error message is displayed on the card

### Step 3: Place a Test Order (COD)
1. Click the **Store URL** link on the store card (e.g., `http://my-shop.127.0.0.1.nip.io`)
   - If using port-forward: `kubectl port-forward -n store-my-shop svc/my-shop-wordpress 8081:80`
2. You'll see the WordPress storefront with WooCommerce
3. Browse to **Shop** — find the "Sample Product" ($19.99)
4. Click **Add to Cart**
5. Go to **Cart** → **Proceed to Checkout**
6. Fill in billing details (any test data is fine)
7. Select **Cash on Delivery** as the payment method
8. Click **Place Order**
9. Verify the order was created:
   - Go to the **Admin URL** (e.g., `http://my-shop.127.0.0.1.nip.io/wp-admin`)
   - Log in with the generated admin credentials (stored in Kubernetes secret: `kubectl get secret my-shop-wp-secret -n store-my-shop -o jsonpath='{.data.admin-password}' | base64 -d`)
   - Navigate to **WooCommerce → Orders** — you should see the order

### Step 4: Delete a Store
1. Click **Delete** on the store card in the dashboard
2. Confirm deletion in the dialog
3. The system runs `helm uninstall` → `kubectl delete namespace`
4. All resources (pods, PVCs, secrets, ingress) are removed

## VPS / Production Setup (k3s)

### 1. Install k3s on your VPS
```bash
curl -sfL https://get.k3s.io | sh -
kubectl get nodes   # verify k3s is running
```

### 2. Configure DNS
Add these DNS records pointing to your VPS IP:
- `*.stores.yourdomain.com → VPS_IP` (wildcard A record for store subdomains)
- `dashboard.stores.yourdomain.com → VPS_IP`
- `api.stores.yourdomain.com → VPS_IP`

### 3. Push Images to a Container Registry
```bash
docker build -t ghcr.io/youruser/store-platform-backend:v1.0.0 -f Dockerfile.backend .
docker build -t ghcr.io/youruser/store-platform-dashboard:v1.0.0 ./dashboard/
docker push ghcr.io/youruser/store-platform-backend:v1.0.0
docker push ghcr.io/youruser/store-platform-dashboard:v1.0.0
```

### 4. (Optional) Install cert-manager for TLS
```bash
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/latest/download/cert-manager.yaml
```

### 5. Deploy with Production Values
```bash
helm upgrade --install store-platform ./helm/store-platform/ \
  -f ./helm/store-platform/values-prod.yaml \
  --set backend.image=ghcr.io/youruser/store-platform-backend:v1.0.0 \
  --set dashboard.image=ghcr.io/youruser/store-platform-dashboard:v1.0.0 \
  --wait
```

### What Changes Between Local and Production

| Concern | Local (Minikube) | Production (k3s VPS) |
|---------|------------------|----------------------|
| Ingress class | nginx | traefik |
| Base domain | 127.0.0.1.nip.io | stores.yourdomain.com |
| Image pull | `Never` (local build) | `Always` (registry) |
| Replicas | 1 | 2 (HPA up to 5) |
| TLS | None | cert-manager |
| Max stores | 10 | 50 |

All differences are handled via `values-local.yaml` vs `values-prod.yaml` — **same Helm charts, same templates**.

## Upgrade & Rollback

```bash
# View Helm release history
helm history store-platform

# Upgrade to a new version
helm upgrade store-platform ./helm/store-platform/ \
  -f ./helm/store-platform/values-prod.yaml \
  --set backend.image=ghcr.io/youruser/store-platform-backend:v1.1.0

# Rollback to previous revision
helm rollback store-platform 1
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | /api/stores | Create store (name, type) |
| GET | /api/stores | List all stores + status |
| GET | /api/stores/:id | Get store detail |
| DELETE | /api/stores/:id | Delete store + cleanup |
| GET | /api/stores/audit/log | Get audit log |
| GET | /api/metrics | Platform metrics (counts, durations) |
| GET | /api/health | Health check |

## Teardown

```bash
# Remove all stores and the platform
./scripts/teardown.sh

# Or manually:
helm uninstall store-platform -n store-platform
minikube stop && minikube delete
```

## Project Structure

```
├── dashboard/               # React (Vite) frontend
│   ├── src/
│   │   ├── components/      # StoreList, StoreCard, CreateStoreDialog, etc.
│   │   ├── services/api.js  # Axios API client
│   │   └── App.jsx          # Tab navigation (Stores / Activity Log)
│   ├── Dockerfile           # Multi-stage: Node build → nginx serve
│   └── nginx.conf           # Reverse proxy /api/ to backend
├── backend/                 # Node.js + Express API
│   ├── src/
│   │   ├── controllers/     # REST route handlers
│   │   ├── services/        # Business logic + provisioners
│   │   ├── kubernetes/      # Helm CLI wrapper
│   │   ├── middleware/       # Rate limiting, error handling
│   │   ├── database/        # SQLite (better-sqlite3)
│   │   └── utils/           # Logger, validation
│   └── package.json
├── Dockerfile.backend       # Backend image with helm + kubectl baked in
├── helm/
│   ├── store-platform/      # Platform chart (dashboard + backend + RBAC + HPA)
│   │   ├── templates/       # 11 templates including HPA
│   │   ├── values.yaml
│   │   ├── values-local.yaml
│   │   └── values-prod.yaml
│   └── woocommerce-store/   # Per-store chart
│       ├── templates/       # 11 templates (MariaDB, WP, init job, ingress, etc.)
│       ├── values.yaml
│       ├── values-local.yaml
│       └── values-prod.yaml
├── scripts/
│   ├── setup-local.sh       # Automated local setup
│   ├── teardown.sh          # Clean everything up
│   └── add-hosts.sh         # Fallback /etc/hosts setup
├── docs/
│   ├── system-design.md     # Architecture, tradeoffs, scaling, security
│   └── local-to-prod.md     # Local vs production differences
└── README.md
```

## System Design Documentation

See [docs/system-design.md](docs/system-design.md) for detailed coverage of:
- Architecture choices and tradeoffs
- Isolation model (namespaces, ResourceQuota, LimitRange, NetworkPolicy)
- Idempotency, failure handling, and cleanup guarantees
- Security posture (secrets, RBAC, container hardening, NetworkPolicy)
- Horizontal scaling plan (HPA, concurrency queue, stateful constraints)
- Abuse prevention (rate limiting, quotas, audit trail)
- Local-to-VPS production story (Helm values differences)
- Upgrade/rollback approach
