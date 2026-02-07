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
                                              ├── Ingress (<store>.127-0-0-1.nip.io)
                                              ├── Secrets, ResourceQuota, LimitRange
                                              └── NetworkPolicy
```

**Key components:**
- **Dashboard**: React SPA (Vite) served via nginx, polls backend for status updates
- **Backend**: Express.js API with SQLite, orchestrates Helm CLI for K8s provisioning
- **WooCommerce Chart**: Per-store Helm chart creating a full WordPress+WooCommerce stack
- **Platform Chart**: Helm chart for the dashboard, backend, RBAC, and ingress

## Prerequisites

- Docker
- Minikube
- kubectl
- Helm 3

### macOS

```bash
# Install Homebrew (if not installed)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Install Docker Desktop
brew install --cask docker
# Or use Colima (lightweight alternative):
brew install docker colima && colima start --cpu 2 --memory 4 --disk 8

# Install Kubernetes tools
brew install minikube kubectl helm
```

### Windows

```powershell
# Install Chocolatey (if not installed) — run PowerShell as Administrator
Set-ExecutionPolicy Bypass -Scope Process -Force
[System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072
iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))

# Install Docker Desktop (requires WSL2 — enable it first if not already)
wsl --install
choco install docker-desktop -y

# Install Kubernetes tools
choco install minikube kubernetes-cli kubernetes-helm -y

# Restart terminal after installation
```

> **Windows notes:**
> - Docker Desktop requires **WSL2** enabled. After installing, open Docker Desktop and ensure "Use the WSL 2 based engine" is checked in Settings > General.
> - Use **PowerShell** or **Git Bash** for all commands below. If using PowerShell, replace `eval $(minikube docker-env)` with `& minikube docker-env --shell powershell | Invoke-Expression`.
> - `minikube tunnel` must run in a separate terminal (as Administrator on Windows).

### Linux (Ubuntu/Debian)

```bash
# Install Docker
sudo apt-get update
sudo apt-get install -y docker.io
sudo usermod -aG docker $USER
newgrp docker

# Install Minikube
curl -LO https://storage.googleapis.com/minikube/releases/latest/minikube-linux-amd64
sudo install minikube-linux-amd64 /usr/local/bin/minikube

# Install kubectl
curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"
sudo install kubectl /usr/local/bin/kubectl

# Install Helm
curl https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash
```

## Quick Start (Local with Minikube)

### macOS / Linux

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

# 4. Port-forward to access the dashboard and stores
kubectl port-forward -n store-platform svc/dashboard 8080:80 &
kubectl port-forward -n ingress-nginx svc/ingress-nginx-controller 8082:80 &

# 5. Open the dashboard
open http://localhost:8080    # macOS
xdg-open http://localhost:8080  # Linux
```

Or use the setup script:
```bash
chmod +x scripts/setup-local.sh && ./scripts/setup-local.sh
```

### Windows (PowerShell)

```powershell
# 1. Start Minikube with sufficient resources
minikube start --cpus=2 --memory=3072 --driver=docker
minikube addons enable ingress

# 2. Build images inside Minikube's Docker daemon
& minikube docker-env --shell powershell | Invoke-Expression
docker build -t store-platform-backend:latest -f Dockerfile.backend .
docker build -t store-platform-dashboard:latest ./dashboard/

# 3. Deploy the platform
helm upgrade --install store-platform ./helm/store-platform/ `
  -f ./helm/store-platform/values-local.yaml --wait

# 4. Port-forward to access the dashboard and stores (run each in a separate terminal)
# Terminal 1:
kubectl port-forward -n store-platform svc/dashboard 8080:80
# Terminal 2:
kubectl port-forward -n ingress-nginx svc/ingress-nginx-controller 8082:80

# 5. Open the dashboard
Start-Process "http://localhost:8080"
```

### Accessing Stores

Once a store is created and shows **Ready** status:
- **Store URL**: `http://<store-name>.127-0-0-1.nip.io:8082` (clickable from dashboard)
- **Admin URL**: `http://<store-name>.127-0-0-1.nip.io:8082/wp-admin`

> Port 8082 is the ingress controller port-forward. Both port-forwards (8080 for dashboard, 8082 for stores) must be running.

### Local Domain Approach

We use [nip.io](https://nip.io) for zero-configuration wildcard DNS:
- `<store-name>.127-0-0-1.nip.io` resolves to `127.0.0.1` automatically
- No `/etc/hosts` editing required
- Works on all platforms (macOS, Windows, Linux)
- Each store gets a unique subdomain (e.g., `my-shop.127-0-0-1.nip.io:8082`)

## Creating a Store and Placing an Order

### Step 1: Create a Store
1. Open the dashboard at `http://localhost:8080`
2. Click **Create Store**
3. Enter a name (lowercase letters, numbers, hyphens — e.g., `my-shop`)
4. Select **WooCommerce** as the store type
5. Set your **Admin Username** and **Admin Password** (or leave password empty to auto-generate)
6. Click **Create** — the store starts provisioning

### Step 2: Wait for Ready Status
- The dashboard auto-polls every 5 seconds
- Status progresses: **Provisioning** → **Ready**
- Provisioning takes 3-5 minutes (MariaDB startup + WordPress init + WooCommerce install)
- If a store fails, the error message is displayed on the card

### Step 3: Place a Test Order (COD)
1. Click the **Store URL** link on the store card (e.g., `http://my-shop.127-0-0-1.nip.io:8082`)
2. You'll see the WooCommerce Storefront with sample products
3. Find a product (e.g., "Sample Product" at $19.99)
4. Click **Add to Cart**
5. Go to **Cart** → **Proceed to Checkout**
6. Fill in billing details (any test data is fine)
7. Select **Cash on Delivery** as the payment method
8. Click **Place Order**
9. Verify the order was created:
   - Click the **Admin URL** on the store card (e.g., `http://my-shop.127-0-0-1.nip.io:8082/wp-admin`)
   - Log in with the admin credentials you set during store creation
   - Navigate to **WooCommerce → Orders** — you should see the order
   - If you used auto-generated password, retrieve it: `kubectl get secret my-shop-wp-secret -n store-my-shop -o jsonpath='{.data.admin-password}' | base64 -d`

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
| Base domain | 127-0-0-1.nip.io | stores.yourdomain.com |
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
