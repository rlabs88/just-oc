# syntax=docker/dockerfile:1.7
ARG FEDORA_IMAGE=registry.fedoraproject.org/fedora:44@sha256:590825dbaee41a97a162ecdffc3305264bd11cb3ff1e9cfd710d41ca5f936134
FROM ${FEDORA_IMAGE} AS base

ARG FEDORA_IMAGE
ARG TARGETARCH
ARG BREW_REVISION=77d90328ca2f63ff4ec1f67de0ade5632f5d2335
ARG BREW_CORE_REVISION=8f25520c64c1fe6b57f1112d028a72a2a4ce3355
ARG DOTFILES_REVISION=98304b684c688dfe71728c7915bebbe074ffe0d8
ARG MASON_REGISTRY_REVISION=eb4c0276c5c1254f3951f7a04e8668f2349a2a14
ARG BUN_VERSION=1.3.14
ARG ZELLIJ_VERSION=0.44.3
ARG OPENCODE_VERSION=1.18.9

LABEL org.opencontainers.image.title="just-oc Fedora sandbox base" \
      org.opencontainers.image.description="Pinned headless Fedora and Linuxbrew runtime for named agent environments"

RUN test "${TARGETARCH}" = amd64 \
    && dnf -y install --setopt=install_weak_deps=False \
      bash busybox bzip2 ca-certificates coreutils curl diffutils file findutils gcc gcc-c++ \
      git-core gzip jq make openssh-clients patch procps-ng ruby shadow-utils tar unzip \
      tini util-linux which xz zsh \
    && dnf clean all \
    && rm -rf /var/cache/dnf

RUN groupadd --gid 10001 cortex \
    && useradd --uid 10001 --gid 10001 --create-home --shell /bin/bash cortex \
    && install -d -o cortex -g cortex \
      /home/linuxbrew/.linuxbrew /home/cortex/.cache /home/cortex/dotfiles /opt/agent-tools \
      /opt/just-oc /workspace /var/lib/opencode

ENV HOME=/home/cortex \
    PATH=/home/linuxbrew/.linuxbrew/bin:/home/linuxbrew/.linuxbrew/sbin:/opt/agent-tools/bin:/home/cortex/.local/bin:/home/cortex/.local/share/nvim/mason/bin:/usr/local/bin:/usr/bin:/bin \
    HOMEBREW_PREFIX=/home/linuxbrew/.linuxbrew \
    HOMEBREW_CELLAR=/home/linuxbrew/.linuxbrew/Cellar \
    HOMEBREW_REPOSITORY=/home/linuxbrew/.linuxbrew/Homebrew \
    HOMEBREW_NO_ANALYTICS=1 \
    HOMEBREW_NO_AUTO_UPDATE=1 \
    HOMEBREW_NO_INSTALL_CLEANUP=1 \
    HOMEBREW_NO_INSTALL_FROM_API=1 \
    OPENCODE_WORKSPACE=/workspace \
    OPENCODE_HOSTNAME=0.0.0.0 \
    OPENCODE_PORT=4096

RUN runuser -u cortex -- env HOME=/home/cortex git init "$HOMEBREW_REPOSITORY" \
    && runuser -u cortex -- env HOME=/home/cortex \
      git -C "$HOMEBREW_REPOSITORY" remote add origin https://github.com/Homebrew/brew.git \
    && runuser -u cortex -- env HOME=/home/cortex \
      git -C "$HOMEBREW_REPOSITORY" fetch --depth 1 origin "$BREW_REVISION" \
    && runuser -u cortex -- env HOME=/home/cortex \
      git -C "$HOMEBREW_REPOSITORY" checkout --detach FETCH_HEAD \
    && install -d -o cortex -g cortex "$HOMEBREW_REPOSITORY/Library/Taps/homebrew/homebrew-core" \
    && runuser -u cortex -- env HOME=/home/cortex \
      git init "$HOMEBREW_REPOSITORY/Library/Taps/homebrew/homebrew-core" \
    && runuser -u cortex -- env HOME=/home/cortex \
      git -C "$HOMEBREW_REPOSITORY/Library/Taps/homebrew/homebrew-core" remote add origin https://github.com/Homebrew/homebrew-core.git \
    && runuser -u cortex -- env HOME=/home/cortex \
      git -C "$HOMEBREW_REPOSITORY/Library/Taps/homebrew/homebrew-core" fetch --depth 1 origin "$BREW_CORE_REVISION" \
    && runuser -u cortex -- env HOME=/home/cortex \
      git -C "$HOMEBREW_REPOSITORY/Library/Taps/homebrew/homebrew-core" checkout --detach FETCH_HEAD \
    && install -d -o cortex -g cortex "$HOMEBREW_PREFIX/bin" \
    && ln -s ../Homebrew/bin/brew "$HOMEBREW_PREFIX/bin/brew"

COPY sandbox/toolchain.lock.json /etc/cortex-sandbox/toolchain.lock.json
COPY sandbox/toolchain.Brewfile /opt/cortex-sandbox/toolchain.Brewfile
COPY --from=dotfiles --chown=10001:10001 /brew/remote.Brewfile /home/cortex/dotfiles/brew/remote.Brewfile
COPY --from=dotfiles --chown=10001:10001 /.bashrc /home/cortex/dotfiles/.bashrc
COPY --from=dotfiles --chown=10001:10001 /.zshrc /home/cortex/dotfiles/.zshrc
COPY --from=dotfiles --chown=10001:10001 /stow.sh /home/cortex/dotfiles/stow.sh
COPY --from=dotfiles --chown=10001:10001 /.config /home/cortex/dotfiles/.config

RUN test "$(jq -r '.base.image' /etc/cortex-sandbox/toolchain.lock.json)" = "$FEDORA_IMAGE" \
    && test "$(jq -r '.homebrew.revision' /etc/cortex-sandbox/toolchain.lock.json)" = "$BREW_REVISION" \
    && test "$(jq -r '.homebrew.coreRevision' /etc/cortex-sandbox/toolchain.lock.json)" = "$BREW_CORE_REVISION" \
    && test "$(jq -r '.dotfiles.revision' /etc/cortex-sandbox/toolchain.lock.json)" = "$DOTFILES_REVISION" \
    && test "$(jq -r '.mason.registry.revision' /etc/cortex-sandbox/toolchain.lock.json)" = "$MASON_REGISTRY_REVISION" \
    && test "$(jq -r '.formulae.bun' /etc/cortex-sandbox/toolchain.lock.json)" = "$BUN_VERSION" \
    && test "$(jq -r '.formulae.zellij' /etc/cortex-sandbox/toolchain.lock.json)" = "$ZELLIJ_VERSION" \
    && test "$(jq -r '.npmPackages["opencode-ai"]' /etc/cortex-sandbox/toolchain.lock.json)" = "$OPENCODE_VERSION"

RUN --mount=type=cache,target=/home/cortex/.cache/Homebrew,uid=10001,gid=10001,sharing=locked \
    awk '/^brew / {gsub(/brew |"/, ""); print}' /home/cortex/dotfiles/brew/remote.Brewfile \
      | sed 's/^flock$/util-linux/' | sort > /tmp/source.formulae \
    && awk '/^brew / {gsub(/brew |"/, ""); print}' /opt/cortex-sandbox/toolchain.Brewfile | sort > /tmp/locked.formulae \
    && diff -u /tmp/source.formulae /tmp/locked.formulae \
    && mv /usr/bin/tar /usr/bin/tar.gnu \
    && ln -s /usr/bin/busybox /usr/bin/tar \
    && runuser -u cortex -- env HOME=/home/cortex PATH="$PATH" \
      brew bundle install --file /opt/cortex-sandbox/toolchain.Brewfile \
    && rm /usr/bin/tar \
    && mv /usr/bin/tar.gnu /usr/bin/tar \
    && rm -f /tmp/source.formulae /tmp/locked.formulae

RUN npm install --global --prefix /opt/agent-tools \
      @anthropic-ai/claude-code@2.1.220 \
      @openai/codex@0.146.0 \
      @zed-industries/codex-acp@0.16.0 \
      mastracode@0.32.3 \
      opencode-ai@${OPENCODE_VERSION} \
    && chown -R cortex:cortex /opt/agent-tools

RUN git init /opt/cortex-sandbox/mason-registry \
    && git -C /opt/cortex-sandbox/mason-registry remote add origin https://github.com/mason-org/mason-registry.git \
    && git -C /opt/cortex-sandbox/mason-registry fetch --depth 1 origin "$MASON_REGISTRY_REVISION" \
    && git -C /opt/cortex-sandbox/mason-registry checkout --detach FETCH_HEAD \
    && test "$(git -C /opt/cortex-sandbox/mason-registry rev-parse HEAD)" = "$MASON_REGISTRY_REVISION" \
    && chown -R cortex:cortex /opt/cortex-sandbox/mason-registry

COPY sandbox/cortex/dotfiles-overlay.sh /usr/local/libexec/cortex-dotfiles-overlay
RUN chmod 0755 /home/cortex/dotfiles/stow.sh /usr/local/libexec/cortex-dotfiles-overlay \
    && chown -R cortex:cortex /home/cortex \
    && runuser -u cortex -- env HOME=/home/cortex PATH="$PATH" \
      /home/cortex/dotfiles/stow.sh .config \
    && /usr/local/libexec/cortex-dotfiles-overlay /home/cortex/dotfiles \
    && chown -R cortex:cortex /home/cortex

# Bake the locked editor graph and Mason language tools so runtime validation
# succeeds without first-run downloads.
RUN install -d /usr/local/libexec/cortex-build-tools \
    && ln -s /usr/bin/busybox /usr/local/libexec/cortex-build-tools/tar \
    && (runuser -u cortex -- env HOME=/home/cortex PATH="/usr/local/libexec/cortex-build-tools:$PATH" \
      nvim --headless '+Lazy! restore' '+sleep 90' '+qa!' || test "$?" -eq 1) \
    && for plugin_dir in /home/cortex/.local/share/nvim/lazy/*; do \
      plugin="$(basename "$plugin_dir")"; \
      locked="$(jq -er --arg plugin "$plugin" '.[$plugin].commit' /home/cortex/dotfiles/.config/nvim/lazy-lock.json)"; \
      test "$(git -C "$plugin_dir" rev-parse HEAD)" = "$locked"; \
    done \
    && for plugin in LazyVim mason.nvim nvim-treesitter; do \
      test -d "/home/cortex/.local/share/nvim/lazy/$plugin"; \
    done \
    && for parser in bash c diff html javascript jsdoc json lua luadoc luap markdown markdown_inline python query regex toml tsx typescript vim vimdoc yaml; do \
      test -f "/home/cortex/.local/share/nvim/site/parser/$parser.so"; \
    done \
    && runuser -u cortex -- env HOME=/home/cortex PATH="/usr/local/libexec/cortex-build-tools:$PATH" \
      nvim --headless \
        '+lua require("lazy").load({plugins={"mason.nvim"}})' \
        '+MasonInstall pyright@1.1.411 black@26.5.1 ruff@0.16.0 clangd@22.1.6 clang-format@22.1.8 cpplint@2.0.2 typescript-language-server@5.3.0 prettier@3.9.6 eslint_d@15.0.2' \
        '+sleep 180' '+qa!' \
    && for tool in pyright black ruff clangd clang-format cpplint typescript-language-server prettier eslint_d; do \
      test -x "/home/cortex/.local/share/nvim/mason/bin/$tool"; \
      test -f "/home/cortex/.local/share/nvim/mason/packages/$tool/mason-receipt.json"; \
    done \
    && rm -rf /usr/local/libexec/cortex-build-tools

EXPOSE 4096

FROM base AS cortex

ARG BUILD_CREATED
ARG BUILD_REVISION
ARG BUILD_SOURCE=https://github.com/rlabs88/just-oc
ARG BUILD_WORKFLOW_URL=local
ARG COMPATIBILITY_VERSION=2

LABEL org.opencontainers.image.title="Cortex Fedora sandbox" \
      org.opencontainers.image.description="Named Cortex environment on the pinned agent-sandbox Fedora baseline" \
      org.opencontainers.image.source="${BUILD_SOURCE}" \
      org.opencontainers.image.revision="${BUILD_REVISION}" \
      org.opencontainers.image.created="${BUILD_CREATED}" \
      io.rlabs.cortex.build.workflow="${BUILD_WORKFLOW_URL}" \
      io.rlabs.cortex.compatibility.version="${COMPATIBILITY_VERSION}" \
      io.rlabs.cortex.provisioning.schema="cortex.provisioning/v1" \
      io.rlabs.cortex.state-schema="1" \
      io.rlabs.cortex.workspace-schema="1" \
      io.rlabs.cortex.base.image="${FEDORA_IMAGE}" \
      io.rlabs.cortex.base.fedora="44" \
      io.rlabs.cortex.homebrew.revision="${BREW_REVISION}" \
      io.rlabs.cortex.homebrew.core.revision="${BREW_CORE_REVISION}" \
      io.rlabs.cortex.dotfiles.revision="${DOTFILES_REVISION}" \
      io.rlabs.cortex.mason.registry.revision="${MASON_REGISTRY_REVISION}" \
      io.rlabs.cortex.base.bun="${BUN_VERSION}" \
      io.rlabs.cortex.base.opencode="${OPENCODE_VERSION}" \
      io.rlabs.cortex.base.zellij="${ZELLIJ_VERSION}"

WORKDIR /opt/just-oc
COPY package.json bun.lock tsconfig.json ./
RUN bun install --frozen-lockfile --production
COPY plugins ./plugins
COPY .opencode/opencode.json ./.opencode/opencode.json
COPY sandbox/cortex/install-config.ts sandbox/cortex/probe.ts sandbox/cortex/baseline-probe.ts sandbox/cortex/provisioning.ts ./sandbox/cortex/
COPY sandbox/cortex/entrypoint.sh /usr/local/bin/sandbox-entrypoint

RUN BUILD_CREATED="${BUILD_CREATED}" \
    BUILD_REVISION="${BUILD_REVISION}" \
    BUILD_SOURCE="${BUILD_SOURCE}" \
    BUILD_WORKFLOW_URL="${BUILD_WORKFLOW_URL}" \
    COMPATIBILITY_VERSION="${COMPATIBILITY_VERSION}" \
    bun sandbox/cortex/install-config.ts \
    && chmod 0755 /usr/local/bin/sandbox-entrypoint \
    && chown -R cortex:cortex /opt/just-oc /etc/cortex-sandbox

HEALTHCHECK --interval=10s --timeout=3s --start-period=30s --retries=6 \
  CMD curl --fail --silent http://127.0.0.1:4096/api/health | jq -e '.healthy == true' >/dev/null

ENTRYPOINT ["/usr/bin/tini", "-g", "--", "/usr/local/bin/sandbox-entrypoint"]
CMD ["serve"]
