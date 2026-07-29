#!/usr/bin/env bash
set -euo pipefail

state="${XDG_DATA_HOME:-/var/lib/opencode}"
workspace="${OPENCODE_WORKSPACE:-/workspace}"
config_root="${XDG_CONFIG_HOME:-/etc/cortex-sandbox/config}"

install -d -o cortex -g cortex "$state" "$workspace"
install -d -o cortex -g cortex "$HOME/.cache/opencode" "$HOME/.bun/install/cache"

# This is the read-only admission gate. Initialization writes metadata only
# after the retained surfaces have been accepted as fresh or compatible.
gosu cortex bun /opt/just-oc/sandbox/cortex/probe.ts compatibility \
  --state "$state" --workspace "$workspace" --initialize

if [[ -n "${OPENCODE_AUTH_JSON:-}" ]]; then
  auth_dir="$state/opencode"
  runtime_secret_dir="/run/cortex-secrets"
  install -d -m 0700 -o cortex -g cortex "$auth_dir"
  install -d -m 0700 -o cortex -g cortex "$runtime_secret_dir"
  install -m 0600 -o cortex -g cortex /dev/null "$runtime_secret_dir/auth.json"
  printf '%s' "$OPENCODE_AUTH_JSON" > "$runtime_secret_dir/auth.json"
  rm -f "$auth_dir/auth.json"
  ln -s "$runtime_secret_dir/auth.json" "$auth_dir/auth.json"
  chown -h cortex:cortex "$auth_dir/auth.json"
  unset OPENCODE_AUTH_JSON
fi

if [[ -n "${SANDBOX_REPO_URL:-}" && ! -d "$workspace/.git" ]]; then
  if [[ "$SANDBOX_REPO_URL" =~ ^[^:]+://[^/]*@ ]]; then
    echo "[sandbox] repository URL must not contain embedded credentials" >&2
    exit 78
  fi
  askpass="$(mktemp)"
  trap 'rm -f "$askpass"' EXIT
  cat > "$askpass" <<'ASKPASS'
#!/usr/bin/env bash
case "$1" in
  *Username*) printf '%s' x-access-token ;;
  *Password*) printf '%s' "${SANDBOX_GIT_TOKEN:-}" ;;
esac
ASKPASS
  chmod 0700 "$askpass"
  clone_args=(clone)
  if [[ -n "${SANDBOX_REPO_BRANCH:-}" ]]; then
    clone_args+=(--branch "$SANDBOX_REPO_BRANCH" --single-branch)
  fi
  clone_args+=("$SANDBOX_REPO_URL" "$workspace")
  if [[ -n "${SANDBOX_GIT_TOKEN:-}" ]]; then
    GIT_ASKPASS="$askpass" GIT_TERMINAL_PROMPT=0 gosu cortex \
      git "${clone_args[@]}"
  else
    gosu cortex git "${clone_args[@]}"
  fi
  rm -f "$askpass"
  trap - EXIT
fi
unset SANDBOX_GIT_TOKEN

runtime_config="$(mktemp)"
trap 'rm -f "$runtime_config"' EXIT
jq \
  --arg model "${OPENCODE_MODEL:-}" \
  --arg agent "${OPENCODE_DEFAULT_AGENT:-cortex}" \
  'if $model == "" then . else .model = $model end | .default_agent = $agent' \
  "$config_root/opencode/opencode.json" > "$runtime_config"
chmod 0644 "$runtime_config"
export OPENCODE_CONFIG="$runtime_config"

cd "$workspace"
exec gosu cortex opencode serve \
  --hostname "${OPENCODE_HOSTNAME:-0.0.0.0}" \
  --port "${OPENCODE_PORT:-4096}"
