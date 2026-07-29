#!/usr/bin/env bash
set -euo pipefail

image="${1:?image reference or immutable digest required}"
image_path="/home/linuxbrew/.linuxbrew/bin:/home/linuxbrew/.linuxbrew/sbin:/opt/agent-tools/bin:/home/cortex/.local/bin:/home/cortex/.local/share/nvim/mason/bin:/usr/local/bin:/usr/bin:/bin"
suffix="$(date +%s)-$$"
state_volume="aes12-cortex-state-$suffix"
workspace_volume="aes12-cortex-workspace-$suffix"
container="aes12-cortex-$suffix"
clone_state_volume="aes12-cortex-clone-state-$suffix"
clone_workspace_volume="aes12-cortex-clone-workspace-$suffix"
clone_container="aes12-cortex-clone-$suffix"
provision_state_volume="aes12-cortex-provision-state-$suffix"
provision_workspace_volume="aes12-cortex-provision-workspace-$suffix"
provision_source_volume="aes12-cortex-provision-source-$suffix"
provision_descriptor_volume="aes12-cortex-provision-descriptor-$suffix"
provision_container="aes12-cortex-provision-$suffix"
hardened_state_volume="aes12-cortex-hardened-state-$suffix"
hardened_workspace_volume="aes12-cortex-hardened-workspace-$suffix"
hardened_container="aes12-cortex-hardened-$suffix"

cleanup() {
  docker rm -f "$container" >/dev/null 2>&1 || true
  docker rm -f "$clone_container" >/dev/null 2>&1 || true
  docker rm -f "$provision_container" >/dev/null 2>&1 || true
  docker rm -f "$hardened_container" >/dev/null 2>&1 || true
  docker volume rm \
    "$state_volume" "$workspace_volume" \
    "$clone_state_volume" "$clone_workspace_volume" \
    "$provision_state_volume" "$provision_workspace_volume" \
    "$provision_source_volume" "$provision_descriptor_volume" \
    "$hardened_state_volume" "$hardened_workspace_volume" >/dev/null 2>&1 || true
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
  wait_healthy_for "$container"
}

wait_healthy_for() {
  local container_name="$1"
  local port
  port="$(docker port "$container_name" 4096/tcp | sed 's/.*://')"
  for _ in $(seq 1 60); do
    if curl --fail --silent --connect-timeout 1 --max-time 2 \
      "http://127.0.0.1:$port/api/health" \
      | jq -e '.healthy == true' >/dev/null 2>&1; then
      printf '%s\n' "$port"
      return 0
    fi
    sleep 1
  done
  docker logs "$container_name" >&2
  return 1
}

verify_private_clone() {
  docker volume create "$clone_state_volume" >/dev/null
  docker volume create "$clone_workspace_volume" >/dev/null
  docker run --detach --name "$clone_container" \
    --publish 127.0.0.1::4096 \
    --mount "type=volume,source=$clone_state_volume,target=/var/lib/opencode" \
    --mount "type=volume,source=$clone_workspace_volume,target=/workspace" \
    --env SANDBOX_REPO_URL=https://git.example.invalid/private/repo.git \
    --env SANDBOX_GIT_TOKEN=aes12-private-clone-token \
    --entrypoint /bin/bash \
    "$image" -lc '
      set -euo pipefail
      install -d /tmp/aes12-test-bin
      cat > /tmp/aes12-test-bin/git <<'"'"'FAKE_GIT'"'"'
#!/usr/bin/env bash
set -euo pipefail
[[ "$(id -u)" == 10001 ]]
[[ -x "$GIT_ASKPASS" ]]
[[ "$("$GIT_ASKPASS" "Username for private repository")" == x-access-token ]]
[[ "$("$GIT_ASKPASS" "Password for private repository")" == "$SANDBOX_GIT_TOKEN" ]]
[[ "$*" == "clone https://git.example.invalid/private/repo.git /workspace" ]]
mkdir -p /workspace/.git
touch /workspace/.private-clone-probe
FAKE_GIT
      chmod 0755 /tmp/aes12-test-bin/git
      export PATH="/tmp/aes12-test-bin:$PATH"
      exec /usr/local/bin/sandbox-entrypoint
    ' >/dev/null
  wait_healthy_for "$clone_container" >/dev/null
  docker exec "$clone_container" test -f /workspace/.private-clone-probe
  if docker exec --user cortex "$clone_container" /bin/bash -o pipefail -lc \
    "tr '\\0' '\\n' < /proc/1/environ | grep -q '^SANDBOX_GIT_TOKEN='"; then
    echo "sandbox git token survived into the OpenCode server environment" >&2
    return 1
  fi
  docker rm -f "$clone_container" >/dev/null
}

verify_provisioned_entrypoint() {
  for volume in "$provision_state_volume" "$provision_workspace_volume" \
    "$provision_source_volume" "$provision_descriptor_volume"; do
    docker volume create "$volume" >/dev/null
  done
  docker run --rm \
    --mount "type=volume,source=$provision_source_volume,target=/sources" \
    --mount "type=volume,source=$provision_descriptor_volume,target=/descriptor" \
    --entrypoint /bin/bash "$image" -lc '
      set -euo pipefail
      for id in operations application; do
        git init -q --initial-branch=main "/tmp/$id"
        git -C "/tmp/$id" config user.name test
        git -C "/tmp/$id" config user.email test@example.invalid
        printf "%s\n" "$id" > "/tmp/$id/README.md"
        git -C "/tmp/$id" add README.md
        git -C "/tmp/$id" commit -qm fixture
        git clone -q --bare "/tmp/$id" "/sources/$id.git"
      done
      cat > /descriptor/provisioning.v1.json <<JSON
{"schemaVersion":1,"primaryRepositoryId":"application","repositories":[{"id":"operations","origin":"file:///sources/operations.git","ref":"main"},{"id":"application","origin":"file:///sources/application.git","ref":"main"}],"layout":"repos","profileId":"verification"}
JSON
      chmod -R a+rX /sources /descriptor
    '
  docker run --detach --name "$provision_container" \
    --mount "type=volume,source=$provision_state_volume,target=/var/lib/opencode" \
    --mount "type=volume,source=$provision_workspace_volume,target=/workspace" \
    --mount "type=volume,source=$provision_source_volume,target=/sources,readonly" \
    --mount "type=volume,source=$provision_descriptor_volume,target=/run/cortex,readonly" \
    "$image" serve --provisioning-file /run/cortex/provisioning.v1.json >/dev/null
  for _ in $(seq 1 60); do
    if docker exec "$provision_container" curl --fail --silent \
      http://127.0.0.1:4096/api/health | jq -e '.healthy == true' >/dev/null 2>&1; then break; fi
    sleep 1
  done
  docker exec "$provision_container" test -d /workspace/repos/operations/.git
  docker exec "$provision_container" test -d /workspace/repos/application/.git
  opencode_pid="$(docker exec "$provision_container" pgrep -xo opencode)"
  [[ "$(docker exec "$provision_container" readlink "/proc/$opencode_pid/cwd")" == /workspace/repos/application ]]
  docker rm -f "$provision_container" >/dev/null
}

verify_hardened_startup() {
  docker volume create "$hardened_state_volume" >/dev/null
  docker volume create "$hardened_workspace_volume" >/dev/null
  docker run --rm \
    --mount "type=volume,source=$hardened_state_volume,target=/var/lib/opencode" \
    --mount "type=volume,source=$hardened_workspace_volume,target=/workspace" \
    --entrypoint /bin/bash "$image" -lc \
    'chown cortex:cortex /var/lib/opencode /workspace'
  docker run --detach --name "$hardened_container" \
    --read-only --cap-drop ALL --cap-add SETUID --cap-add SETGID \
    --security-opt no-new-privileges \
    --tmpfs /tmp:rw,nosuid,nodev,noexec \
    --tmpfs /run:rw,nosuid,nodev,noexec \
    --tmpfs /home/cortex/.cache:rw,nosuid,nodev,uid=10001,gid=10001,mode=0700 \
    --tmpfs /home/cortex/.bun:rw,nosuid,nodev,uid=10001,gid=10001,mode=0700 \
    --mount "type=volume,source=$hardened_state_volume,target=/var/lib/opencode" \
    --mount "type=volume,source=$hardened_workspace_volume,target=/workspace" \
    "$image" >/dev/null
  for _ in $(seq 1 60); do
    if docker exec "$hardened_container" curl --fail --silent \
      http://127.0.0.1:4096/api/health | jq -e '.healthy == true' >/dev/null 2>&1; then
      docker rm -f "$hardened_container" >/dev/null
      return 0
    fi
    sleep 1
  done
  docker logs "$hardened_container" >&2
  return 1
}

start
port="$(wait_healthy)"
curl --fail --silent --connect-timeout 1 --max-time 5 \
  "http://127.0.0.1:$port/agent" | jq -e '
  (if type == "array" then . else .data end)
  | any(.name == "cortex" and .mode == "all")
' >/dev/null
docker exec "$container" runuser -u cortex -- env HOME=/home/cortex PATH="$image_path" \
  bun /opt/just-oc/sandbox/cortex/probe.ts all \
  --state /var/lib/opencode --workspace /workspace >/dev/null
docker exec "$container" runuser -u cortex -- env HOME=/home/cortex PATH="$image_path" \
  bun /opt/just-oc/sandbox/cortex/baseline-probe.ts >/dev/null
docker exec "$container" test ! -e /var/lib/tailscale/tailscaled.state
docker exec "$container" /bin/bash -lc '! pgrep -x tailscaled && ! command -v zmx'
docker exec "$container" runuser -u cortex -- env HOME=/home/cortex PATH="$image_path" \
  /bin/bash -lc 'eval "$(brew shellenv)"; command -v brew >/dev/null; test -L ~/.config/nvim'
docker exec "$container" runuser -u cortex -- env HOME=/home/cortex PATH="$image_path" \
  /bin/zsh -lc 'command -v brew >/dev/null'
docker exec "$container" runuser -u cortex -- env HOME=/home/cortex PATH="$image_path" \
  /bin/bash -ic '! type -t zmx && ! type -t zp && [[ ${PROMPT_COMMAND[*]-} != *zmx* ]]'
docker exec "$container" runuser -u cortex -- env HOME=/home/cortex PATH="$image_path" \
  /bin/zsh -ic '! type -w zmx >/dev/null 2>&1 && ! type -w zp >/dev/null 2>&1 && [[ ${precmd_functions[*]-} != *zmx* ]]'
session_id="$(curl --fail --silent \
  --connect-timeout 1 \
  --max-time 5 \
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
  .["io.rlabs.cortex.compatibility.version"] == "2" and
  .["io.rlabs.cortex.provisioning.schema"] == "cortex.provisioning/v1" and
  .["io.rlabs.cortex.state-schema"] == "1" and
  .["io.rlabs.cortex.workspace-schema"] == "1" and
  .["io.rlabs.cortex.base.image"] == "registry.fedoraproject.org/fedora:44@sha256:590825dbaee41a97a162ecdffc3305264bd11cb3ff1e9cfd710d41ca5f936134" and
  .["io.rlabs.cortex.base.fedora"] == "44" and
  .["io.rlabs.cortex.homebrew.revision"] == "77d90328ca2f63ff4ec1f67de0ade5632f5d2335" and
  .["io.rlabs.cortex.homebrew.core.revision"] == "8f25520c64c1fe6b57f1112d028a72a2a4ce3355" and
  .["io.rlabs.cortex.dotfiles.revision"] == "98304b684c688dfe71728c7915bebbe074ffe0d8" and
  .["io.rlabs.cortex.mason.registry.revision"] == "eb4c0276c5c1254f3951f7a04e8668f2349a2a14" and
  .["io.rlabs.cortex.base.bun"] == "1.3.14" and
  .["io.rlabs.cortex.base.opencode"] == "1.18.9" and
  .["io.rlabs.cortex.base.zellij"] == "0.44.3"
' >/dev/null

image_size="$(docker image inspect "$image" --format '{{.Size}}')"
max_image_size="$(docker run --rm --entrypoint jq "$image" -r '.sizeBudget.uncompressedBytes' /etc/cortex-sandbox/toolchain.lock.json)"
(( image_size <= max_image_size )) || { echo "image exceeds locked uncompressed size budget" >&2; exit 1; }

docker run --rm --network none --read-only \
  --tmpfs /tmp:rw,nosuid,nodev \
  --entrypoint runuser "$image" \
  -u cortex -- env HOME=/home/cortex PATH="$image_path" \
  XDG_CACHE_HOME=/tmp/cache XDG_STATE_HOME=/tmp/state \
  /bin/bash -lc '
    bun /opt/just-oc/sandbox/cortex/baseline-probe.ts
    nvim --headless "+lua assert(#vim.api.nvim_list_runtime_paths() > 1)" +qa
  '

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

verify_private_clone
verify_provisioned_entrypoint
verify_hardened_startup

echo "Cortex sandbox image validation passed for $image"
