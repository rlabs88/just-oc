#!/usr/bin/env bash
set -euo pipefail

if [[ "${1:-}" == serve ]]; then shift; fi
provisioning_file=""
while (( $# > 0 )); do
  case "$1" in
    --provisioning-file)
      [[ $# -ge 2 && -n "$2" ]] || { echo '{"error":"--provisioning-file requires a path"}' >&2; exit 78; }
      provisioning_file="$2"
      shift 2
      ;;
    *)
      printf '{"error":"unsupported sandbox entrypoint argument"}\n' >&2
      exit 78
      ;;
  esac
done

state="${XDG_DATA_HOME:-/var/lib/opencode}"
workspace="${OPENCODE_WORKSPACE:-/workspace}"
config_root="${XDG_CONFIG_HOME:-/etc/cortex-sandbox/config}"

# The first compatibility pass is the read-only admission gate. Ownership,
# modes, and metadata remain untouched until retained surfaces are accepted.
bun /opt/just-oc/sandbox/cortex/probe.ts compatibility \
  --state "$state" --workspace "$workspace"

for retained_directory in "$state" "$workspace"; do
  install -d "$retained_directory"
  if [[ "$(stat -c '%u:%g' "$retained_directory")" != 10001:10001 ]]; then
    chown cortex:cortex "$retained_directory"
  fi
done
runuser -u cortex -- env HOME="$HOME" PATH="$PATH" \
  mkdir -p "$HOME/.cache/opencode" "$HOME/.bun/install/cache"
runuser -u cortex -- env HOME="$HOME" PATH="$PATH" \
  bun /opt/just-oc/sandbox/cortex/probe.ts compatibility \
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

if [[ -n "$provisioning_file" && -n "${SANDBOX_REPO_URL:-}" ]]; then
  echo '{"error":"provisioning descriptor and legacy repository variables are mutually exclusive"}' >&2
  exit 78
fi

runtime_workspace="$workspace"
if [[ -n "$provisioning_file" ]]; then
  provisioning_result="$(runuser -u cortex -- env HOME="$HOME" PATH="$PATH" \
    bun /opt/just-oc/sandbox/cortex/provisioning.ts \
      --provisioning-file "$provisioning_file" --workspace "$workspace")"
  runtime_workspace="$(printf '%s' "$provisioning_result" | jq -er '.primaryDirectory')"
fi

if [[ -z "$provisioning_file" && -n "${SANDBOX_REPO_URL:-}" && ! -d "$workspace/.git" ]]; then
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
  chown cortex:cortex "$askpass"
  chmod 0700 "$askpass"
  clone_args=(clone)
  if [[ -n "${SANDBOX_REPO_BRANCH:-}" ]]; then
    clone_args+=(--branch "$SANDBOX_REPO_BRANCH" --single-branch)
  fi
  clone_args+=("$SANDBOX_REPO_URL" "$workspace")
  if [[ -n "${SANDBOX_GIT_TOKEN:-}" ]]; then
    runuser -u cortex -- env HOME="$HOME" PATH="$PATH" \
      GIT_ASKPASS="$askpass" GIT_TERMINAL_PROMPT=0 \
      SANDBOX_GIT_TOKEN="$SANDBOX_GIT_TOKEN" git "${clone_args[@]}"
  else
    runuser -u cortex -- env HOME="$HOME" PATH="$PATH" git "${clone_args[@]}"
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
cd "$runtime_workspace"
exec runuser -u cortex -- env \
  HOME="$HOME" PATH="$PATH" \
  XDG_DATA_HOME="$state" XDG_CONFIG_HOME="$config_root" \
  OPENCODE_CONFIG="$runtime_config" \
  opencode serve \
  --hostname "${OPENCODE_HOSTNAME:-0.0.0.0}" \
  --port "${OPENCODE_PORT:-4096}"
