#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${SCRIPT_DIR}/.env"
ENV_EXAMPLE="${SCRIPT_DIR}/.env.example"

if ! command -v docker >/dev/null 2>&1; then
  echo "docker is not installed or not in PATH."
  exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "Docker Compose plugin is not available."
  exit 1
fi

if [[ ! -f "${ENV_FILE}" ]]; then
  cp "${ENV_EXAMPLE}" "${ENV_FILE}"
  echo ".env was created from .env.example. Adjust values if needed."
else
  echo ".env already exists and will not be overwritten."
fi

if [[ ! -f "${HOME}/.docker/config.json" ]]; then
  cat <<'EOF'
No Docker login found at ~/.docker/config.json.
If the GHCR packages are private, run this first:
  echo "${GHCR_TOKEN}" | docker login ghcr.io -u "${GHCR_USERNAME}" --password-stdin
EOF
fi

docker compose -f "${SCRIPT_DIR}/docker-compose.prod.yml" --profile watchtower up -d watchtower

echo "Watchtower has been started."
echo "Status:"
docker ps --filter "name=watchtower"
