#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
image="just-oc/cortex-sandbox:aes12-$(date +%s)-$$"

CORTEX_IMAGE="$image" bash "$root/sandbox/build.sh" >/dev/null
bash "$root/sandbox/verify-image.sh" "$image"
