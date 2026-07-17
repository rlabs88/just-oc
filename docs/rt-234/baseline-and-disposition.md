# Baseline and Disposition

## Baseline

| Item | Observed value |
| --- | --- |
| Repository | [rlabs88/just-oc](https://github.com/rlabs88/just-oc) |
| Starting commit | `f9dc39d9e0ebaa3243c2464bd69eba85e58ca522` |
| Default branch | `master` (`origin/HEAD`) |
| RT-234 working branch | `codex/rt-234-opencode-v2-architecture` |
| Root package identity | `express-health-api@1.0.0` (stale and unrelated) |
| Root lockfiles | `bun.lock` and `package-lock.json` (conflicting ownership) |
| Config package manager | npm lockfile under `.opencode/` |
| Installed OpenCode CLI | `1.17.5` |
| Installed config plugin SDK | `0.0.0-beta-202607142228` |
| Selected compatibility pin | `opencode-ai@1.17.5` and `@opencode-ai/plugin@1.17.5` |
| Existing submodules | two declared, both uninitialized |

The matching `1.17.5` SDK is available from the
[official npm package](https://www.npmjs.com/package/@opencode-ai/plugin).
“OpenCode v2” therefore names the second-generation `just-oc` design. It does
not name an upstream OpenCode major release. OpenCode's `/v2` SDK and catalog
surfaces used by the spike remain compatibility-gated implementation details.

## Security containment

The tracked MiniMax provider configuration contained a literal credential. The
active tree removes that provider block entirely, selects
`openai/gpt-5.6-luna`, and ignores `.env` variants. OpenAI subscription
authentication remains in OpenCode's user-owned OAuth store and is not copied
into repository configuration.

The credential remains recoverable from repository history and must be treated
as compromised. A signature scan found the known credential class in the
history of `.opencode/opencode.json`; other hits were deliberate security-test
fixtures or type/property names. No second provider credential class was found
by the bounded signature scan.

Repository-side containment is complete, but provider-side revocation is not
yet proven. Both available browser sessions required MiniMax authentication.
The official MiniMax key-management login has been left ready for an authorized
account owner. Until revocation is recorded:

1. do not restore or use the historical literal;
2. revoke the exposed key under MiniMax Account → API Keys;
3. create a replacement only if MiniMax is deliberately restored later;
4. inject any future provider credential through environment substitution or a
   secret manager;
5. record revocation time and key label/fingerprint only, never the key value.

History rewriting is deliberately deferred. RT-235 requires an archival branch
at the exact legacy commit, so revocation is the immediate control; any later
history rewrite must be a separately coordinated repository decision.

## Current behavior and defects

- `npm test` exits `1` because the root package has no test script.
- `bun test` exits `1`; its only discovered auth suite is an intentionally
  failing red-phase fixture for a missing, unrelated token manager.
- isolated `opencode debug config` resolves the Luna default and confirms the
  CLI can read the sanitized config.
- Full `opencode debug config` does not complete because the config points to
  machine-specific `file:///home/user/...` plugin paths.
- Agent definitions are manually duplicated across `.opencode/agents/`,
  `agents/`, and `.real-agents/`.
- Plugin source is split between `plugins/` and uninitialized submodules under
  `plugin/`.
- The checked-in `.swarm/` tree and most `autoresearch/{logs,results,plots}`
  content are runtime/generated state, not harness source.
- Two case-colliding `LICENSE.txt` / `license.txt` pairs under the copied skill
  trees make the checkout dirty on case-insensitive filesystems. The resulting
  pre-existing modifications are preserved and excluded from RT-234 edits.
- Copied skill symlinks resolve to `/home/zz/.agent/...` and are not portable.

## Top-level disposition

`archive` means preserve on RT-235's `legacy/pre-agent-archetypes` branch, not
retain in cleaned `main`.

| Surface | Disposition | Rationale / owner |
| --- | --- | --- |
| `.gitignore` | migrate | Keep source/runtime separation and secret ignores; RT-235 normalizes it. |
| `.gitmodules` | delete after archive | Current submodules are uninitialized and duplicate or vendor external plugin work. |
| `.kilo/` | archive, then delete | Copied Kilo configuration is outside the accepted OpenCode v2 active tree. |
| `.opencode/` | archive, then regenerate | Preserve legacy; rebuild only portable config/dependencies and generated agent assets. |
| `.real-agents/` | archive, then delete | Research/generated prompt material is not a canonical role source. |
| `.swarm/` | archive, then delete | Tracked runtime state, telemetry, sessions, and evidence are non-source. |
| `AGENTS.md` | migrate | Keep repository policy only; remove stale layout instructions. |
| `LICENSE` | retain | Repository license. |
| `README.md` | regenerate | Current 14-agent optimization product description is superseded. |
| `agents/` | archive, then delete | Third manually edited role tree; no forward migration by default. |
| `analysis/` | archive, then delete | Unrelated point-in-time analysis. |
| `analysis_output/` | archive, then delete | Generated, unrelated analysis output. |
| `architecture/` | archive, then delete | Payment-platform ADR is unrelated to the harness. |
| `autoresearch/` | archive, then delete | Optimization harness/logs/results are explicitly excluded from persistent identity. |
| `btree_storage_analysis.py` | archive, then delete | Unrelated analysis executable. |
| `bun.lock` | regenerate | Bun is selected as the single package manager; lock only the cleaned workspace. |
| `harness/` | archive, then delete | Unrelated Python examples/tools; not the new OpenCode harness boundary. |
| `helm/` | archive, then delete | Deployment assets are explicitly out of scope. |
| `kilo.jsonc` | archive, then delete | Kilo-specific active configuration is not part of OpenCode v2. |
| `monte_carlo_pi_validation.py` | archive, then delete | Unrelated quantitative example. |
| `package-lock.json` | delete after archive | Remove dual package-manager ownership. |
| `package.json` | regenerate | Replace unrelated Express metadata with a private Bun workspace. |
| `plugin/` | archive, then delete | Uninitialized vendor submodules; retained behavior must be owned by independent workspace plugins. |
| `plugins/` | migrate | Split `background_tasks` and `zellij` into independent bundles; add Agent Archetypes only in RT-236. |
| `quantitative_validation_report.md` | archive, then delete | Unrelated generated report. |
| `requirements.txt` | delete after archive | No Python runtime in the selected harness boundary. |
| `research/` | archive, then delete | Point-in-time research is not production harness source. |
| `setup-symlinks.sh` | replace | Installation flow must resolve repository paths portably. |
| `src/` | archive, then delete | Unrelated Express/Python application code. |
| `symlink-opencode.sh` | replace | Collapse duplicate install scripts into one portable flow. |
| `test_bounded_search.py` | archive, then delete | Test belongs to excluded Python tooling. |
| `tests/` | archive, then delete | Unrelated API/auth tests, including a permanently red placeholder suite. |
| `docs/rt-234/` | retain through migration | Durable architecture/scoping evidence for RT-235 and RT-236. |
| `spikes/rt-234-opencode-v2/` | retain until RT-236 gate | Compatibility evidence, explicitly non-production and removable after implementation parity. |

## Reproducible baseline commands

```bash
git status --short --branch
git remote -v
git symbolic-ref refs/remotes/origin/HEAD
git submodule status
git ls-files | awk -F/ '{print $1}' | sort | uniq -c
git ls-files | perl -ne 'chomp; push @{$p{lc $_}}, $_; END { for $k (keys %p) { print join(" <> ", @{$p{$k}}), "\n" if @{$p{$k}} > 1 } }'
opencode --version
opencode debug v2 --pure
npm test
bun test
```

## Nested inventory and entry points

This appendix preserves the category inventory required to recover the cleanup
scope without rescanning the legacy tree.

| Category | Count | Current owner / disposition |
| --- | ---: | --- |
| Agent-definition/research files across `.opencode/agents`, `agents`, `.real-agents` | 34 | Archive, then remove from active; no default forward migration |
| Files under `plugins/` | 51 | Inventory by bundle; migrate only validated independent entry points |
| OpenCode commands | 1 | Re-evaluate `execute.md` under RT-235; retain only if it remains harness-specific |
| OpenCode tools | 0 | Do not invent a top-level tools plane |
| Skill directories under `.opencode/skills` | 23 | Copied/non-portable; archive, then remove from active |
| Skill directories under `.kilo/skills` | 23 | Duplicated Kilo copies; archive, then remove from active |
| `.swarm` state/evidence files | 12 | Runtime state; archive, then delete from active |
| `autoresearch/logs` files | 289 | Generated runtime logs; archive, then delete from active |
| `autoresearch/results` files | 68 | Generated evaluation results; archive, then delete from active |
| `autoresearch/plots` files | 14 | Generated plots; archive, then delete from active |
| Test files across root/autoresearch/plugins | 12 | Keep only tests for retained plugin behavior; remove unrelated red fixtures |
| Setup/symlink scripts | 2 | Replace with one portable installation flow |

### Plugin roots

| Current surface | Current entry point | Decision |
| --- | --- | --- |
| Background tasks | `plugins/src/background_tasks/index.ts` | Candidate to migrate as `plugins/background-tasks/`; current entry point uses an in-memory manager while deeper lifecycle modules are disconnected, so retention requires RT-235 validation |
| Zellij | `plugins/src/zellij/index.ts` | Candidate to migrate as `plugins/zellij/`; must remain optional and independently loadable |
| oh-my-openagent submodule | `plugin/oh-my-openagent` | Uninitialized vendor submodule; archive reference, then remove from active unless a separately evidenced capability is selected |
| zellij-mcp-server submodule | `plugin/zellij-mcp-server` | Uninitialized external submodule; archive reference, then remove from active in favor of the retained bundle or a separately versioned dependency |

Nested `index.ts` files under background-task features/tools and Zellij domains
are internal module barrels, not independent plugin entry points. No DALL-E J
bundle exists in the pinned tree, so RT-235 must not claim it as retained
without adding a separately sourced, reviewed plugin.

### Configuration, state, tests, and installation

- Active config: `.opencode/opencode.json`; dependency metadata is
  `.opencode/package.json` plus npm lockfile.
- Kilo config: `kilo.jsonc` plus copied `.kilo/` assets; both are legacy.
- State stores: tracked `.swarm/`; OpenCode's external storage paths referenced
  by background-task modules; in-memory task state in the active plugin entry.
- Tests: unrelated root API/auth tests, autoresearch suites, and one Zellij
  domain test. RT-235 retains only tests tied to retained bundles.
- Installation: `setup-symlinks.sh` and `symlink-opencode.sh` currently compete;
  copied skill symlinks target one machine. The target uses one portable flow
  and no absolute plugin URL.
