# Local to Production Guide

## Differences

| Concern | Local (Minikube) | Production (k3s VPS) |
|---------|------------------|----------------------|
| Kubernetes | Minikube | k3s |
| Ingress class | nginx | traefik |
| Base domain | 127-0-0-1.nip.io | stores.yourdomain.com |
| Storage class | standard | local-path |
| PVC sizes | Small (1-2Gi) | Larger (5-10Gi) |
| Image pull policy | Never (local build) | Always (registry) |
| Replicas | 1 | 2 (HPA up to 5) |
| TLS | None | cert-manager + Let's Encrypt |
| DNS | nip.io (wildcard) | Wildcard A record |
| Max stores | 10 | 50 |
| Concurrent provisions | 3 | 5 |
| Autoscaling (HPA) | Disabled | Enabled |

## Production Setup Steps

### 1. VPS Setup
```bash
# Install k3s
curl -sfL https://get.k3s.io | sh -

# Verify
kubectl get nodes
```

### 2. DNS Configuration
- Add wildcard A record: `*.stores.yourdomain.com → VPS_IP`
- Add A record: `dashboard.stores.yourdomain.com → VPS_IP`
- Add A record: `api.stores.yourdomain.com → VPS_IP`

### 3. Container Registry
Push images to a registry (Docker Hub, GHCR, etc.):
```bash
docker build -t ghcr.io/youruser/store-platform-backend:v1.0.0 -f Dockerfile.backend .
docker build -t ghcr.io/youruser/store-platform-dashboard:v1.0.0 ./dashboard/
docker push ghcr.io/youruser/store-platform-backend:v1.0.0
docker push ghcr.io/youruser/store-platform-dashboard:v1.0.0
```

### 4. TLS with cert-manager
```bash
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/latest/download/cert-manager.yaml
```

### 5. Deploy
```bash
helm upgrade --install store-platform ./helm/store-platform/ \
  -f ./helm/store-platform/values-prod.yaml \
  --set backend.image=ghcr.io/youruser/store-platform-backend:v1.0.0 \
  --set dashboard.image=ghcr.io/youruser/store-platform-dashboard:v1.0.0
```

## What Changes via Helm Values

The same Helm chart templates are used for both environments. Only the values differ:

- `values-local.yaml`: `imagePullPolicy: Never`, nginx ingress, nip.io domain, HPA disabled
- `values-prod.yaml`: `imagePullPolicy: Always`, traefik ingress, real domain, HPA enabled, higher limits

No template changes, no code changes — configuration only.

## Upgrade Strategy

### Rolling Updates
```bash
# Build and push new images
docker build -t ghcr.io/youruser/store-platform-backend:v1.1.0 -f Dockerfile.backend .
docker push ghcr.io/youruser/store-platform-backend:v1.1.0

# Update deployment
helm upgrade store-platform ./helm/store-platform/ \
  -f ./helm/store-platform/values-prod.yaml \
  --set backend.image=ghcr.io/youruser/store-platform-backend:v1.1.0
```

### Per-Store Upgrades
```bash
# Upgrade a specific store's WordPress version
helm upgrade wc-mystore ./helm/woocommerce-store/ \
  --set wordpress.image=wordpress:6.9-apache \
  --reuse-values
```

### Rollback
```bash
# View history
helm history store-platform

# Rollback to previous
helm rollback store-platform 1

# Rollback a specific store
helm rollback wc-mystore 1
```

Helm maintains full revision history — rollback is instant and atomic.

## Monitoring Recommendations

- **Metrics**: Prometheus + Grafana (k3s has built-in metrics-server)
- **Logging**: Loki or EFK stack
- **Alerts**: AlertManager for pod failures, high resource usage
- **Backup**: Regular SQLite backup + PVC snapshots
- **Built-in**: `/api/metrics` endpoint provides store counts, failure rates, provisioning durations
