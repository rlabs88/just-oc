#!/usr/bin/env bash
set -euo pipefail

dotfiles="${1:?dotfiles directory required}"

# zmx is intentionally outside the headless baseline. Molten's Jupyter and
# image-provider graph is also outside this non-GUI sandbox. Keep the source
# tree and all other Neovim/shell configuration, but replace those plugin specs
# with inert overlays and clear zmx shell hooks after the source dotfiles load.
printf 'return {}\n' > "$dotfiles/.config/nvim/lua/plugins/zmx.lua"
printf 'return {}\n' > "$dotfiles/.config/nvim/lua/config/zmx.lua"
printf 'return {}\n' > "$dotfiles/.config/nvim/lua/plugins/molten.lua"

# The image build installs exact versions from the pinned local registry. An
# empty ensure_installed list prevents dotfiles startup from racing that locked
# path or resolving moving registry state.
cat > "$dotfiles/.config/nvim/lua/plugins/mason.lua" <<'MASON'
return {
  {
    "mason-org/mason.nvim",
    opts = function(_, opts)
      -- LazyVim contributes stylua to this list. Replace the merged value so
      -- startup cannot race the pinned file registry's first refresh; the
      -- image build installs the approved exact package set explicitly.
      opts.ensure_installed = {}
      opts.registries = { "file:/opt/cortex-sandbox/mason-registry" }
      opts.registry_cache = { refresh = false }
    end,
  },
}
MASON

# The locked nvim-treesitter revision no longer exposes a jsonc parser. Keep
# the source language set otherwise intact while removing that unsupported
# alias so a locked headless restore has no skipped/failed parser task.
cat > "$dotfiles/.config/nvim/lua/plugins/treesitter.lua" <<'TREESITTER'
return {
  {
    "nvim-treesitter/nvim-treesitter",
    opts = function(_, opts)
      opts.ensure_installed = vim.tbl_filter(function(language)
        return language ~= "jsonc"
      end, opts.ensure_installed or {})
    end,
  },
}
TREESITTER

install -d /etc/cortex-sandbox
cat > /etc/cortex-sandbox/shell-overlay.sh <<'OVERLAY'
unset ZMX_SESSION ZMX_NVIM_HANDOFF_FILE ZMX_NVIM_TRACE ZMX_NVIM_TRACE_FILE
unset -f \
  __zmx_clear_stale_session_env \
  __zmx_nvim_handoff \
  __zmx_nvim_now_ms \
  __zmx_nvim_stopped_job_count \
  __zmx_nvim_trace \
  zmx zp nvim 2>/dev/null || true
if declare -p PROMPT_COMMAND 2>/dev/null | grep -q '^declare -[^=]*a'; then
  filtered_prompt_commands=()
  for prompt_command in "${PROMPT_COMMAND[@]}"; do
    [[ "$prompt_command" == __zmx_nvim_handoff ]] || filtered_prompt_commands+=("$prompt_command")
  done
  PROMPT_COMMAND=("${filtered_prompt_commands[@]}")
else
  prompt_command_value="${PROMPT_COMMAND-}"
  PROMPT_COMMAND="${prompt_command_value//__zmx_nvim_handoff;\//}"
  PROMPT_COMMAND="${PROMPT_COMMAND//;__zmx_nvim_handoff/}"
  [[ "$PROMPT_COMMAND" == __zmx_nvim_handoff ]] && PROMPT_COMMAND=""
  unset prompt_command_value
fi
if [[ -n "${precmd_functions+x}" ]]; then
  precmd_functions=(${precmd_functions:#__zmx_nvim_handoff})
fi
OVERLAY

for shell_rc in /home/cortex/.bashrc /home/cortex/.zshrc; do
  printf '\n# Cortex headless sandbox overlay\nsource /etc/cortex-sandbox/shell-overlay.sh\n' >> "$shell_rc"
done
