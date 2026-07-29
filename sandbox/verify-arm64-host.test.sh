#!/usr/bin/env bash
set -euo pipefail

boundary="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
fixture="$(mktemp -d)"
trap 'rm -rf "$fixture"' EXIT
mkdir -p "$fixture/bin"

cat > "$fixture/bin/uname" <<'UNAME'
#!/usr/bin/env bash
printf '%s\n' "${MOCK_UNAME:?}"
UNAME
cat > "$fixture/bin/docker" <<'DOCKER'
#!/usr/bin/env bash
set -euo pipefail
if [[ "$1" == info ]]; then
  printf '%s\n' "${MOCK_DOCKER_ARCH:?}"
elif [[ "$1 ${2:-} ${3:-}" == "buildx inspect --bootstrap" ]]; then
  printf 'Name: fixture\nPlatforms: %s\n' "${MOCK_BUILDX_PLATFORMS:?}"
else
  echo "unexpected docker invocation: $*" >&2
  exit 64
fi
DOCKER
chmod 0755 "$fixture/bin/uname" "$fixture/bin/docker"

run_preflight() {
  PATH="$fixture/bin:$PATH" \
    MOCK_UNAME="$1" \
    MOCK_DOCKER_ARCH="$2" \
    MOCK_BUILDX_PLATFORMS="$3" \
    bash "$boundary/verify-arm64-host.sh"
}

run_preflight arm64 aarch64 'linux/arm64, linux/amd64' >/dev/null

for failure in \
  'x86_64|aarch64|linux/arm64' \
  'arm64|amd64|linux/arm64' \
  'arm64|aarch64|linux/amd64'; do
  IFS='|' read -r kernel daemon platforms <<< "$failure"
  if run_preflight "$kernel" "$daemon" "$platforms" >/dev/null 2>&1; then
    echo "ARM64 preflight accepted invalid tuple: $failure" >&2
    exit 1
  fi
done

echo "ARM64 host preflight regression tests passed"
