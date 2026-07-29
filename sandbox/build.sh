#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
lock="$root/sandbox/toolchain.lock.json"
dotfiles_checkout="${DOTFILES_CHECKOUT:?set DOTFILES_CHECKOUT to a clean rlabs88/dotfiles checkout}"
image="${CORTEX_IMAGE:-just-oc/cortex-sandbox:latest}"
platform="$(jq -r '.platform' "$lock")"
revision="${BUILD_REVISION:-$(git -C "$root" rev-parse HEAD)}"
created="${BUILD_CREATED:-$(date -u +%Y-%m-%dT%H:%M:%SZ)}"
source="${BUILD_SOURCE:-https://github.com/rlabs88/just-oc}"
workflow_url="${BUILD_WORKFLOW_URL:-local}"
dotfiles_revision="$(jq -r '.dotfiles.revision' "$lock")"
fedora_image="$(jq -r '.base.image' "$lock")"
fedora_arm64_manifest="$(jq -r '.base.arm64Manifest' "$lock")"

[[ -z "$(git -C "$dotfiles_checkout" status --porcelain)" ]] || {
  echo "dotfiles checkout must be clean" >&2
  exit 2
}
[[ "$(git -C "$dotfiles_checkout" rev-parse HEAD)" == "$dotfiles_revision" ]] || {
  echo "dotfiles checkout does not match locked revision $dotfiles_revision" >&2
  exit 2
}
"$root/sandbox/verify-dotfiles-source.sh" "$dotfiles_checkout"

resolved_arm64_manifest="$(
  docker buildx imagetools inspect "$fedora_image" --raw \
    | jq -er '.manifests[] | select(.platform.os == "linux" and .platform.architecture == "arm64") | .digest'
)"
[[ "$resolved_arm64_manifest" == "$fedora_arm64_manifest" ]] || {
  echo "Fedora index ARM64 child changed: resolved $resolved_arm64_manifest, expected $fedora_arm64_manifest" >&2
  exit 1
}

docker buildx build --load \
  --platform "$platform" \
  --build-context "dotfiles=$dotfiles_checkout" \
  --file "$root/sandbox/Dockerfile" \
  --target cortex \
  --build-arg "BUILD_CREATED=$created" \
  --build-arg "BUILD_REVISION=$revision" \
  --build-arg "BUILD_SOURCE=$source" \
  --build-arg "BUILD_WORKFLOW_URL=$workflow_url" \
  --build-arg "FEDORA_IMAGE=$fedora_image" \
  --build-arg "FEDORA_ARM64_MANIFEST=$fedora_arm64_manifest" \
  --build-arg "BREW_REVISION=$(jq -r '.homebrew.revision' "$lock")" \
  --build-arg "BREW_CORE_REVISION=$(jq -r '.homebrew.coreRevision' "$lock")" \
  --build-arg "DOTFILES_REVISION=$dotfiles_revision" \
  --build-arg "BUN_VERSION=$(jq -r '.formulae.bun' "$lock")" \
  --build-arg "ZELLIJ_VERSION=$(jq -r '.formulae.zellij' "$lock")" \
  --build-arg "OPENCODE_VERSION=$(jq -r '.npmPackages["opencode-ai"]' "$lock")" \
  --build-arg "COMPATIBILITY_VERSION=$(jq -r '.compatibilityVersion' "$lock")" \
  --build-arg "MASON_REGISTRY_REVISION=$(jq -r '.mason.registry.revision' "$lock")" \
  --tag "$image" \
  "$root"

printf '%s\n' "$image"
