#!/usr/bin/env bash
set -euo pipefail

echo "=== Kubernetes Store Platform - Local Setup ==="

# Check prerequisites
for cmd in docker minikube kubectl helm; do
  if ! command -v "$cmd" &>/dev/null; then
    echo "ERROR: $cmd is not installed."
    echo "Install with: brew install $cmd"
    exit 1
  fi
done

echo "All prerequisites found."

# Start Minikube if not running
if ! minikube status &>/dev/null; then
  echo "Starting Minikube..."
  minikube start --cpus=4 --memory=8192 --driver=docker
else
  echo "Minikube is already running."
fi

# Enable ingress addon
echo "Enabling ingress addon..."
minikube addons enable ingress

# Point Docker to Minikube's Docker daemon
echo "Configuring Docker to use Minikube..."
eval $(minikube docker-env)

# Build Docker images inside Minikube
echo "Building backend image..."
docker build -t store-platform-backend:latest -f Dockerfile.backend .

echo "Building dashboard image..."
docker build -t store-platform-dashboard:latest ./dashboard/

# Install the platform Helm chart
echo "Installing store-platform Helm chart..."
helm upgrade --install store-platform ./helm/store-platform/ \
  -f ./helm/store-platform/values-local.yaml \
  --wait --timeout 5m

echo ""
echo "=== Setup Complete ==="
echo ""
echo "Starting port-forwards..."

# Kill existing port-forwards
pkill -f "kubectl port-forward.*svc/dashboard" 2>/dev/null || true
pkill -f "kubectl port-forward.*svc/ingress-nginx" 2>/dev/null || true

# Port-forward dashboard on 8080
kubectl port-forward -n store-platform svc/dashboard 8080:80 &>/dev/null &
echo "Dashboard: http://localhost:8080"

# Port-forward ingress controller on 8082 (for store URLs)
kubectl port-forward -n ingress-nginx svc/ingress-nginx-controller 8082:80 &>/dev/null &
echo "Store URLs available on port 8082 (e.g., http://<store>.127-0-0-1.nip.io:8082)"

echo ""
echo "Open http://localhost:8080 in your browser to access the dashboard."
echo "Stores will be accessible at http://<store-name>.127-0-0-1.nip.io:8082"
