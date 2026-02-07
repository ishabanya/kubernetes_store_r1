#!/usr/bin/env bash
set -euo pipefail

echo "=== Add /etc/hosts entries (fallback if nip.io doesn't work) ==="
echo ""
echo "This script adds local DNS entries for the store platform."
echo "You will be prompted for your sudo password."
echo ""

MINIKUBE_IP=$(minikube ip 2>/dev/null || echo "127.0.0.1")

entries=(
  "$MINIKUBE_IP dashboard.local.store-platform"
  "$MINIKUBE_IP api.local.store-platform"
)

for entry in "${entries[@]}"; do
  if ! grep -q "$(echo "$entry" | awk '{print $2}')" /etc/hosts; then
    echo "$entry" | sudo tee -a /etc/hosts
    echo "  Added: $entry"
  else
    echo "  Already exists: $entry"
  fi
done

echo ""
echo "Done. You can now access:"
echo "  Dashboard: http://dashboard.local.store-platform"
echo "  API:       http://api.local.store-platform"
