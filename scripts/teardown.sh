#!/usr/bin/env bash
set -euo pipefail

echo "=== Kubernetes Store Platform - Teardown ==="

# Uninstall all store releases
echo "Removing all WooCommerce store releases..."
for release in $(helm list --all-namespaces -q | grep "^wc-" 2>/dev/null || true); do
  ns=$(helm list --all-namespaces --filter "$release" -o json | python3 -c "import sys,json; print(json.load(sys.stdin)[0]['namespace'])" 2>/dev/null || echo "")
  if [ -n "$ns" ]; then
    echo "  Uninstalling $release from $ns..."
    helm uninstall "$release" --namespace "$ns" || true
    kubectl delete namespace "$ns" --ignore-not-found || true
  fi
done

# Uninstall the platform
echo "Removing store-platform..."
helm uninstall store-platform --namespace store-platform 2>/dev/null || true
kubectl delete namespace store-platform --ignore-not-found || true

# Clean up any remaining store namespaces
echo "Cleaning up store namespaces..."
for ns in $(kubectl get namespaces -o name 2>/dev/null | grep "store-" || true); do
  echo "  Deleting $ns..."
  kubectl delete "$ns" --ignore-not-found || true
done

echo ""
echo "=== Teardown Complete ==="
echo ""
echo "To also stop Minikube: minikube stop"
echo "To delete Minikube entirely: minikube delete"
