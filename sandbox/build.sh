#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
image="${CORTEX_IMAGE:-just-oc/cortex-sandbox:latest}"
platform="${CORTEX_PLATFORM:-linux/amd64}"
revision="${BUILD_REVISION:-$(git -C "$root" rev-parse HEAD)}"
created="${BUILD_CREATED:-$(date -u +%Y-%m-%dT%H:%M:%SZ)}"
source="${BUILD_SOURCE:-https://github.com/rlabs88/just-oc}"
workflow_url="${BUILD_WORKFLOW_URL:-local}"

docker buildx build --load \
  --platform "$platform" \
  --file "$root/sandbox/Dockerfile" \
  --target cortex \
  --build-arg "BUILD_CREATED=$created" \
  --build-arg "BUILD_REVISION=$revision" \
  --build-arg "BUILD_SOURCE=$source" \
  --build-arg "BUILD_WORKFLOW_URL=$workflow_url" \
  --build-arg "COMPATIBILITY_VERSION=1" \
  --tag "$image" \
  "$root"

printf '%s\n' "$image"
