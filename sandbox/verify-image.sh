#!/usr/bin/env bash
set -euo pipefail

image="${1:?image reference or immutable digest required}"
suffix="$(date +%s)-$$"
state_volume="aes12-cortex-state-$suffix"
workspace_volume="aes12-cortex-workspace-$suffix"
container="aes12-cortex-$suffix"

cleanup() {
  docker rm -f "$container" >/dev/null 2>&1 || true
  docker volume rm "$state_volume" "$workspace_volume" >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker pull "$image" >/dev/null 2>&1 || docker image inspect "$image" >/dev/null
docker volume create "$state_volume" >/dev/null
docker volume create "$workspace_volume" >/dev/null

start() {
  docker run --detach --name "$container" \
    --publish 127.0.0.1::4096 \
    --mount "type=volume,source=$state_volume,target=/var/lib/opencode" \
    --mount "type=volume,source=$workspace_volume,target=/workspace" \
    --entrypoint /bin/bash \
    "$image" -lc '
      set -euo pipefail
      for command in git base64 sha256sum find xargs; do command -v "$command" >/dev/null; done
      exec /usr/local/bin/sandbox-entrypoint
    ' >/dev/null
}

wait_healthy() {
  local port
  port="$(docker port "$container" 4096/tcp | sed 's/.*://')"
  for _ in $(seq 1 60); do
    if curl --fail --silent "http://127.0.0.1:$port/api/health" | jq -e '.healthy == true' >/dev/null 2>&1; then
      printf '%s\n' "$port"
      return 0
    fi
    sleep 1
  done
  docker logs "$container" >&2
  return 1
}

start
port="$(wait_healthy)"
curl --fail --silent "http://127.0.0.1:$port/agent" | jq -e '
  (if type == "array" then . else .data end)
  | any(.name == "cortex" and .mode == "all")
' >/dev/null
docker exec "$container" gosu cortex bun /opt/just-oc/sandbox/cortex/probe.ts all \
  --state /var/lib/opencode --workspace /workspace >/dev/null
session_id="$(curl --fail --silent \
  --request POST \
  --header 'Content-Type: application/json' \
  --data '{"location":{"directory":"/workspace"}}' \
  "http://127.0.0.1:$port/api/session" \
  | jq -r 'select(.data.location.directory == "/workspace") | .data.id')"
[[ "$session_id" == ses_* ]] || { echo "minimal session spawn did not return ses_* at /workspace" >&2; exit 1; }

docker rm -f "$container" >/dev/null
start
wait_healthy >/dev/null

labels="$(docker image inspect "$image" --format '{{json .Config.Labels}}')"
printf '%s' "$labels" | jq -e '
  .["org.opencontainers.image.revision"] != "" and
  .["org.opencontainers.image.source"] == "https://github.com/rlabs88/just-oc" and
  .["io.rlabs.cortex.build.workflow"] != "" and
  .["io.rlabs.cortex.compatibility.version"] == "1" and
  .["io.rlabs.cortex.state-schema"] == "1" and
  .["io.rlabs.cortex.workspace-schema"] == "1" and
  .["io.rlabs.cortex.base.image"] == "oven/bun:1.3.14-slim@sha256:d56a2534ffd262e92c12fd3249d3924d296d97086da773f821d7d0477435ea04" and
  .["io.rlabs.cortex.base.bun"] == "1.3.14" and
  .["io.rlabs.cortex.base.opencode"] == "1.17.5"
' >/dev/null

if docker history --no-trunc "$image" | rg -i \
  '(LINEAR_.*(TOKEN|SECRET|KEY)|GITHUB_.*(TOKEN|SECRET|KEY)|OCIR_.*(TOKEN|SECRET|KEY)|OPENAI_API_KEY|ANTHROPIC_API_KEY)='; then
  echo "forbidden credential material found in image history" >&2
  exit 1
fi

config_json="$(docker image inspect "$image" --format '{{json .Config}}')"
if printf '%s' "$config_json" | jq -e '
  ((.Env // []) + [(.Labels // {} | to_entries[] | "\(.key)=\(.value)")])
  | any(test("(LINEAR|GITHUB|OCIR|OPENAI|ANTHROPIC).*(TOKEN|SECRET|KEY)="; "i"))
' >/dev/null; then
  echo "forbidden credential material found in image config" >&2
  exit 1
fi

exported="$(mktemp)"
scan_container="$(docker create "$image")"
docker export "$scan_container" --output "$exported"
docker rm "$scan_container" >/dev/null
if rg --text --ignore-case --max-count 1 \
  '(gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|lin_api_[A-Za-z0-9]{20,}|sk-ant-[A-Za-z0-9_-]{20,}|sk-proj-[A-Za-z0-9_-]{20,})' \
  "$exported"; then
  rm -f "$exported"
  echo "credential-shaped material found in exported image filesystem" >&2
  exit 1
fi
rm -f "$exported"

echo "Cortex sandbox image validation passed for $image"
