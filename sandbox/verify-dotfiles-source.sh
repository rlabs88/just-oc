#!/usr/bin/env bash
set -euo pipefail

dotfiles="${1:?dotfiles checkout required}"
required=(
  .bashrc
  .zshrc
  stow.sh
  brew/remote.Brewfile
  scripts/shell-script.sh
  shellutil
  .config/nvim
)

for path in "${required[@]}"; do
  [[ -e "$dotfiles/$path" ]] || {
    echo "required dotfiles allowlist entry is missing: $path" >&2
    exit 2
  }
done

if find \
  "$dotfiles/.bashrc" \
  "$dotfiles/.zshrc" \
  "$dotfiles/stow.sh" \
  "$dotfiles/brew/remote.Brewfile" \
  "$dotfiles/scripts/shell-script.sh" \
  "$dotfiles/shellutil" \
  "$dotfiles/.config/nvim" \
  -type l -print -quit | grep -q .
then
  echo "symlinks are not allowed in the dotfiles build allowlist" >&2
  exit 1
fi

if find \
  "$dotfiles/.bashrc" \
  "$dotfiles/.zshrc" \
  "$dotfiles/stow.sh" \
  "$dotfiles/brew/remote.Brewfile" \
  "$dotfiles/scripts/shell-script.sh" \
  "$dotfiles/shellutil" \
  "$dotfiles/.config/nvim" \
  -type f -print0 \
  | xargs -0 grep -EIl \
      '(gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|lin_api_[A-Za-z0-9]{20,}|sk-ant-[A-Za-z0-9_-]{20,}|sk-proj-[A-Za-z0-9_-]{20,}|-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----)'
then
  echo "credential-shaped material found in allowlisted dotfiles" >&2
  exit 1
fi
