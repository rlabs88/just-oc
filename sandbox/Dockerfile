# syntax=docker/dockerfile:1.7
ARG BUN_VERSION=1.3.14
FROM oven/bun:${BUN_VERSION}-slim@sha256:d56a2534ffd262e92c12fd3249d3924d296d97086da773f821d7d0477435ea04 AS base

ARG TARGETARCH
ARG OPENCODE_VERSION=1.17.5
ARG ZELLIJ_VERSION=0.44.3

LABEL org.opencontainers.image.title="just-oc sandbox base" \
      org.opencontainers.image.description="Shared OpenCode runtime base for named just-oc agent environments"

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
      bash ca-certificates coreutils curl findutils git gosu jq openssh-client procps ripgrep tini \
    && rm -rf /var/lib/apt/lists/*

RUN case "${TARGETARCH}" in \
      amd64) zellij_arch=x86_64; zellij_sha=397481870c4fc3bae646cd7613cde3a1cebdc204558a6cb9a7c603d4c852fc90 ;; \
      arm64) zellij_arch=aarch64; zellij_sha=439ed44da5df3cd70e578dc4aef5a67dc7b81eabdddec27969d84a6be380b2f0 ;; \
      *) echo "unsupported platform architecture: ${TARGETARCH}" >&2; exit 2 ;; \
    esac \
    && curl --fail --silent --show-error --location \
      "https://github.com/zellij-org/zellij/releases/download/v${ZELLIJ_VERSION}/zellij-${zellij_arch}-unknown-linux-musl.tar.gz" \
      --output /tmp/zellij.tar.gz \
    && tar -xzf /tmp/zellij.tar.gz -C /usr/local/bin zellij \
    && printf '%s  %s\n' "$zellij_sha" /usr/local/bin/zellij | sha256sum --check --strict \
    && rm /tmp/zellij.tar.gz \
    && zellij --version

RUN --mount=type=cache,target=/root/.bun/install/cache \
    bun install --global "opencode-ai@${OPENCODE_VERSION}" \
    && cp --dereference "$(command -v opencode)" /usr/local/bin/opencode.bin \
    && rm -f /usr/local/bin/opencode \
    && mv /usr/local/bin/opencode.bin /usr/local/bin/opencode \
    && rm -rf /root/.bun/install/global \
    && /usr/local/bin/opencode --version

RUN groupadd --gid 10001 cortex \
    && useradd --uid 10001 --gid 10001 --create-home --shell /bin/bash cortex \
    && install -d -o cortex -g cortex /opt/just-oc /workspace /var/lib/opencode

ENV HOME=/home/cortex \
    XDG_DATA_HOME=/var/lib/opencode \
    XDG_CONFIG_HOME=/etc/cortex-sandbox/config \
    OPENCODE_WORKSPACE=/workspace \
    OPENCODE_HOSTNAME=0.0.0.0 \
    OPENCODE_PORT=4096

EXPOSE 4096

FROM base AS cortex

ARG BUILD_CREATED
ARG BUILD_REVISION
ARG BUILD_SOURCE=https://github.com/rlabs88/just-oc
ARG BUILD_WORKFLOW_URL=local
ARG COMPATIBILITY_VERSION=1

LABEL org.opencontainers.image.title="Cortex sandbox" \
      org.opencontainers.image.description="Named Cortex OpenCode agent environment" \
      org.opencontainers.image.source="${BUILD_SOURCE}" \
      org.opencontainers.image.revision="${BUILD_REVISION}" \
      org.opencontainers.image.created="${BUILD_CREATED}" \
      io.rlabs.cortex.build.workflow="${BUILD_WORKFLOW_URL}" \
      io.rlabs.cortex.compatibility.version="${COMPATIBILITY_VERSION}" \
      io.rlabs.cortex.state-schema="1" \
      io.rlabs.cortex.workspace-schema="1" \
      io.rlabs.cortex.base.image="oven/bun:1.3.14-slim@sha256:d56a2534ffd262e92c12fd3249d3924d296d97086da773f821d7d0477435ea04" \
      io.rlabs.cortex.base.bun="1.3.14" \
      io.rlabs.cortex.base.opencode="1.17.5" \
      io.rlabs.cortex.base.zellij="0.44.3"

WORKDIR /opt/just-oc

COPY package.json bun.lock tsconfig.json ./
RUN bun install --frozen-lockfile --production

COPY plugins ./plugins
COPY .opencode/opencode.json ./.opencode/opencode.json
COPY sandbox/cortex/install-config.ts sandbox/cortex/probe.ts ./sandbox/cortex/
COPY sandbox/cortex/entrypoint.sh /usr/local/bin/sandbox-entrypoint

RUN BUILD_CREATED="${BUILD_CREATED}" \
    BUILD_REVISION="${BUILD_REVISION}" \
    BUILD_SOURCE="${BUILD_SOURCE}" \
    BUILD_WORKFLOW_URL="${BUILD_WORKFLOW_URL}" \
    COMPATIBILITY_VERSION="${COMPATIBILITY_VERSION}" \
    bun sandbox/cortex/install-config.ts \
    && chmod 0755 /usr/local/bin/sandbox-entrypoint \
    && chown -R cortex:cortex /opt/just-oc /etc/cortex-sandbox

HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=6 \
  CMD curl --fail --silent http://127.0.0.1:4096/api/health | jq -e '.healthy == true' >/dev/null

ENTRYPOINT ["/usr/bin/tini", "-g", "--", "/usr/local/bin/sandbox-entrypoint"]
