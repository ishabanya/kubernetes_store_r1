# Kubernetes Store Orchestration Platform

> **Self-service platform for deploying fully isolated WooCommerce stores on Kubernetes.**
> Each store runs in its own namespace with dedicated MariaDB, WordPress + WooCommerce, ingress routing, network policies, and resource quotas — provisioned in minutes through a single-click dashboard.

---

## Highlights

- **One-click store provisioning** via React dashboard
- **Full namespace isolation** — each store gets its own DB, secrets, quotas, and network policies
- **Async provisioning** with concurrency queue (no HTTP timeouts)
- **Helm-driven** — same charts for local dev and production, only values change
- **Audit trail** and **metrics endpoint** for observability
- **Rate limiting** and **abuse prevention** built in

---

## Architecture

```
                         +-------------------+
                         |  React Dashboard  |
                         |  (Vite + nginx)   |
                         +--------+----------+
                                  |
                            POST /api/stores
                                  |
                         +--------v----------+
                         |  Express Backend  |
                         |  SQLite + Helm CLI|
                         +--------+----------+
                                  |
                          helm install / uninstall
                                  |
              +-------------------v--------------------+
              |         Kubernetes Cluster             |
              |                                        |
              |   +--- store-<name> namespace -------+ |
              |   | MariaDB (StatefulSet + PVC)      | |
              |   | WordPress + WooCommerce (Deploy)  | |
              |   | WP-CLI Init Job (post-install)   | |
              |   | Ingress, Secrets, NetworkPolicy   | |
              |   | ResourceQuota, LimitRange         | |
              |   +----------------------------------+ |
              +----------------------------------------+
```

**Key components:**

| Component | Description |
|-----------|-------------|
| **Dashboard** | React SPA (Vite) served via nginx, reverse-proxies API calls to backend |
| **Backend** | Express.js REST API with SQLite, orchestrates Kubernetes via Helm CLI |
| **WooCommerce Chart** | Per-store Helm chart — MariaDB, WordPress, WP-CLI init, ingress, security |
| **Platform Chart** | Helm chart for dashboard, backend, RBAC, and HPA |

---

## Getting Started

### 1. Clone the Repository

```bash
git clone https://github.com/ishabanya/kubernetes_store_r1.git
cd kubernetes_store_r1
```

### 2. Install Prerequisites

<details>
<summary><strong>macOS</strong></summary>

```bash
# Homebrew (if not installed)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Docker Desktop
brew install --cask docker
# Or use Colima (lightweight alternative):
# brew install docker colima && colima start --cpu 2 --memory 4 --disk 8

# Kubernetes tools
brew install minikube kubectl helm
```
</details>

<details>
<summary><strong>Windows</strong></summary>

```powershell
# Chocolatey (run PowerShell as Administrator)
Set-ExecutionPolicy Bypass -Scope Process -Force
[System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072
iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))

# Docker Desktop (requires WSL2)
wsl --install
choco install docker-desktop -y

# Kubernetes tools
choco install minikube kubernetes-cli kubernetes-helm -y
```

> **Notes:** Enable "WSL 2 based engine" in Docker Desktop settings. Use **PowerShell** or **Git Bash** for all commands. Replace `eval $(minikube docker-env)` with `& minikube docker-env --shell powershell | Invoke-Expression`.
</details>

<details>
<summary><strong>Linux (Ubuntu / Debian)</strong></summary>

```bash
# Docker
sudo apt-get update && sudo apt-get install -y docker.io
sudo usermod -aG docker $USER && newgrp docker

# Minikube
curl -LO https://storage.googleapis.com/minikube/releases/latest/minikube-linux-amd64
sudo install minikube-linux-amd64 /usr/local/bin/minikube

# kubectl
curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"
sudo install kubectl /usr/local/bin/kubectl

# Helm
curl https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash
```
</details>

### 3. Deploy Locally (macOS / Linux)

```bash
# Start Minikube
minikube start --cpus=2 --memory=3072 --driver=docker
minikube addons enable ingress

# Build images inside Minikube's Docker daemon
eval $(minikube docker-env)
docker build -t store-platform-backend:latest -f Dockerfile.backend .
docker build -t store-platform-dashboard:latest ./dashboard/

# Deploy the platform
helm upgrade --install store-platform ./helm/store-platform/ \
  -f ./helm/store-platform/values-local.yaml --wait

# Port-forward (dashboard + store ingress)
kubectl port-forward -n store-platform svc/dashboard 8080:80 &
kubectl port-forward -n ingress-nginx svc/ingress-nginx-controller 8082:80 &
```

Or use the automated setup script:
```bash
chmod +x scripts/setup-local.sh && ./scripts/setup-local.sh
```

<details>
<summary><strong>Windows (PowerShell)</strong></summary>

```powershell
minikube start --cpus=2 --memory=3072 --driver=docker
minikube addons enable ingress

& minikube docker-env --shell powershell | Invoke-Expression
docker build -t store-platform-backend:latest -f Dockerfile.backend .
docker build -t store-platform-dashboard:latest ./dashboard/

helm upgrade --install store-platform ./helm/store-platform/ `
  -f ./helm/store-platform/values-local.yaml --wait

# Run each in a separate terminal:
kubectl port-forward -n store-platform svc/dashboard 8080:80
kubectl port-forward -n ingress-nginx svc/ingress-nginx-controller 8082:80
```
</details>

### 4. Open the Dashboard

```
http://localhost:8080
```

---

## Usage: Create a Store & Place an Order

### Step 1 — Create a Store
1. Open `http://localhost:8080` and click **+ Create Store**
2. Enter any name you like (e.g., `My Awesome Shop`)
3. Set your **Admin Username** and **Admin Password** (or leave password blank to auto-generate)
4. Click **Create Store** — provisioning begins

### Step 2 — Wait for Ready
- Dashboard auto-polls every 5 seconds
- Status: **Provisioning** &#8594; **Ready** (typically 3-5 minutes)

### Step 3 — Browse & Order
1. Click the **Store URL** on the card (e.g., `http://my-awesome-shop.127-0-0-1.nip.io:8082`)
2. Add a product to cart &#8594; **Proceed to Checkout**
3. Fill in any billing details &#8594; select **Cash on Delivery** &#8594; **Place Order**
4. Verify in WP Admin: click the **Admin URL** &#8594; **WooCommerce** &#8594; **Orders**

### Step 4 — Delete a Store
1. Click **Delete** on the store card &#8594; confirm
2. All resources (pods, PVCs, secrets, ingress, namespace) are removed

### Accessing Stores

| URL | Purpose |
|-----|---------|
| `http://localhost:8080` | Dashboard |
| `http://<store>.127-0-0-1.nip.io:8082` | Store frontend |
| `http://<store>.127-0-0-1.nip.io:8082/wp-admin` | WP Admin panel |

> Both port-forwards (8080 for dashboard, 8082 for stores) must be running. [nip.io](https://nip.io) provides zero-config wildcard DNS — no `/etc/hosts` editing needed.

---

## Production Deployment (k3s VPS)

<details>
<summary><strong>Click to expand production setup</strong></summary>

### 1. Install k3s
```bash
curl -sfL https://get.k3s.io | sh -
kubectl get nodes
```

### 2. Configure DNS
| Record | Value |
|--------|-------|
| `*.stores.yourdomain.com` | VPS IP (wildcard A) |
| `dashboard.stores.yourdomain.com` | VPS IP |
| `api.stores.yourdomain.com` | VPS IP |

### 3. Push Images
```bash
docker build -t ghcr.io/youruser/store-platform-backend:v1.0.0 -f Dockerfile.backend .
docker build -t ghcr.io/youruser/store-platform-dashboard:v1.0.0 ./dashboard/
docker push ghcr.io/youruser/store-platform-backend:v1.0.0
docker push ghcr.io/youruser/store-platform-dashboard:v1.0.0
```

### 4. (Optional) TLS with cert-manager
```bash
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/latest/download/cert-manager.yaml
```

### 5. Deploy
```bash
helm upgrade --install store-platform ./helm/store-platform/ \
  -f ./helm/store-platform/values-prod.yaml \
  --set backend.image=ghcr.io/youruser/store-platform-backend:v1.0.0 \
  --set dashboard.image=ghcr.io/youruser/store-platform-dashboard:v1.0.0 \
  --wait
```

### Local vs Production

| Concern | Local (Minikube) | Production (k3s) |
|---------|------------------|-------------------|
| Ingress class | nginx | traefik |
| Base domain | `127-0-0-1.nip.io` | `stores.yourdomain.com` |
| Image pull | `Never` (local) | `Always` (registry) |
| Replicas | 1 | 2 (HPA up to 5) |
| TLS | None | cert-manager + Let's Encrypt |
| Max stores | 10 | 50 |

Same Helm charts, same templates — **only values change**.
</details>

---

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/stores` | Create a store |
| `GET` | `/api/stores` | List all stores |
| `GET` | `/api/stores/:id` | Get store details |
| `DELETE` | `/api/stores/:id` | Delete a store |
| `GET` | `/api/stores/audit/log` | Audit trail |
| `GET` | `/api/metrics` | Platform metrics |
| `GET` | `/api/health` | Health check |

---

## Upgrade & Rollback

```bash
# View release history
helm history store-platform

# Upgrade with a new image
helm upgrade store-platform ./helm/store-platform/ \
  -f ./helm/store-platform/values-prod.yaml \
  --set backend.image=ghcr.io/youruser/store-platform-backend:v1.1.0

# Rollback to previous revision
helm rollback store-platform 1
```

---

## Project Structure

```
kubernetes_store_r1/
├── dashboard/                    # React (Vite) frontend
│   ├── src/
│   │   ├── components/           # StoreList, StoreCard, CreateStoreDialog, etc.
│   │   ├── services/api.js       # Axios API client
│   │   └── App.jsx               # Tab navigation (Stores / Activity Log)
│   ├── Dockerfile                # Multi-stage: Node build -> nginx serve
│   └── nginx.conf                # Reverse proxy /api/ to backend
├── backend/                      # Node.js + Express API
│   ├── src/
│   │   ├── controllers/          # REST route handlers
│   │   ├── services/             # Business logic + provisioners
│   │   ├── kubernetes/           # Helm CLI wrapper
│   │   ├── middleware/           # Rate limiting, error handling
│   │   ├── database/            # SQLite (better-sqlite3)
│   │   └── utils/               # Logger, validation
│   └── package.json
├── Dockerfile.backend            # Backend image with Helm + kubectl
├── helm/
│   ├── store-platform/           # Platform chart (dashboard, backend, RBAC, HPA)
│   │   ├── templates/
│   │   ├── values.yaml
│   │   ├── values-local.yaml
│   │   └── values-prod.yaml
│   └── woocommerce-store/        # Per-store chart
│       ├── templates/            # MariaDB, WordPress, init job, ingress, etc.
│       ├── values.yaml
│       ├── values-local.yaml
│       └── values-prod.yaml
├── scripts/
│   ├── setup-local.sh            # Automated local setup
│   ├── teardown.sh               # Clean everything up
│   └── add-hosts.sh              # Fallback /etc/hosts setup
├── docs/
│   ├── system-design.md          # Architecture, tradeoffs, scaling, security
│   └── local-to-prod.md          # Local vs production differences
└── README.md
```

---

## Teardown

```bash
# Remove all stores and the platform
./scripts/teardown.sh

# Or manually:
helm uninstall store-platform -n store-platform
minikube stop && minikube delete
```

---

## Documentation

See **[docs/system-design.md](docs/system-design.md)** for in-depth coverage:

- Architecture decisions and tradeoffs
- Isolation model (namespaces, ResourceQuota, LimitRange, NetworkPolicy)
- Idempotency, failure handling, and cleanup guarantees
- Security posture (secrets, RBAC, container hardening)
- Horizontal scaling plan (HPA, concurrency queue)
- Abuse prevention (rate limiting, quotas, audit trail)
- Local-to-production story
- Upgrade / rollback approach
