#!/usr/bin/env bash
set -euo pipefail

is_arm64() {
  [[ "$1" == arm64 || "$1" == aarch64 ]]
}

kernel_architecture="$(uname -m)"
is_arm64 "$kernel_architecture" || {
  echo "native ARM64 host required; uname -m returned $kernel_architecture" >&2
  exit 1
}

docker_architecture="$(docker info --format '{{.Architecture}}')"
is_arm64 "$docker_architecture" || {
  echo "native ARM64 Docker daemon required; Docker reported $docker_architecture" >&2
  exit 1
}

builder="$(docker buildx inspect --bootstrap)"
platforms="$(printf '%s\n' "$builder" | awk -F': *' '$1 == "Platforms" { print $2 }')"
[[ -n "$platforms" ]] || {
  echo "Buildx bootstrap did not report supported platforms" >&2
  exit 1
}
printf '%s\n' "$platforms" | tr ',' '\n' | sed 's/^[[:space:]]*//; s/[[:space:]]*$//' \
  | grep -Fxq linux/arm64 || {
    echo "Buildx builder does not advertise linux/arm64: $platforms" >&2
    exit 1
  }

printf 'native ARM64 preflight passed: kernel=%s docker=%s platform=linux/arm64\n' \
  "$kernel_architecture" "$docker_architecture"
