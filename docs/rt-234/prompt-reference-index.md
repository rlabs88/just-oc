# Prompt Reference Index

## Purpose

The shared prompt modules use independently evolved coding-agent prompts as
comparative design evidence. They are a fresh synthesis for the OpenCode role
contract, not vendored or concatenated upstream prompt text. OpenSrc provides a
repeatable local reference cache through [`.agents/index.yaml`](../../.agents/index.yaml).

## Indexed sources

| Source | Indexed ref | License | Relevant evidence |
| --- | --- | --- | --- |
| [OpenAI Codex](https://github.com/openai/codex) | `openai/codex@main` | Apache-2.0 | instruction precedence, repository instructions, planning, patch discipline, validation, permission modes, progress, final handoff |
| [Piebald Claude Code system prompts](https://github.com/Piebald-AI/claude-code-system-prompts) | `Piebald-AI/claude-code-system-prompts@main` | MIT | harness boundaries, reversible versus shared actions, truthful reporting, task continuity, tool discipline, outcome-first communication |

The indexed files were fetched through `just -g lib osrc apply`. The selected
OpenSrc cache records were fetched on 2026-07-17. Because the cache materializes
a ref without Git metadata, the content hashes below are the reproducibility
anchors for this decision.

## Selected content hashes

| Reference file | SHA-256 |
| --- | --- |
| Codex `base_instructions/default.md` | `ac8ae107a0d72fe3476b430afb161ea4e67da2e446d778aefc44828160559807` |
| Codex `gpt-5.2-codex_prompt.md` | `1b3dd697043a7f613c691a3721a450251626685b3e97ac3ad3d35ea62758a31e` |
| Claude Code `system-prompt-harness-instructions.md` | `51d2e208bd79be70dead748acfc4ed0ffc014c4ce5715621f1eb4bbe470c83ad` |
| Claude Code `system-prompt-action-safety-and-truthful-reporting.md` | `4e28d694c01b5452cf2ed846b1e889eb0b0f32e5d5d1ea03bce408b746fd1d45` |
| Claude Code `system-prompt-outcome-first-communication-style.md` | `fbbf804e6bdd5a2ebb03b332a0d53efa1407bec3ffbf66d1d67cb2792371eff8` |
| Claude Code `system-prompt-task-approval-continuity.md` | `e72a2a1904b864fa02c11e364b1500d8bb9116701c27945ed88df7b7631ea589` |

## Synthesis boundary

The resulting modules deliberately keep OpenCode as the execution owner. They
do not claim Codex or Claude Code tool names, permission implementations,
product identity, hidden context, or provider behavior. The shared contract
adopts durable principles only:

- explicit instruction precedence and scoped repository policy;
- observed capability plus current permission as the authority boundary;
- bounded autonomy for reversible in-scope work;
- careful treatment of destructive, external, and shared-state effects;
- secrets and untrusted content as first-class trust boundaries;
- narrow tools, deterministic edits, proportional tests, and truthful evidence;
- bounded delegation with named ownership and return artifacts;
- progress communication and a self-contained outcome-first final response.

Upstream updates require a new indexed comparison, reviewed content hashes, and
an intentional shared-policy release. They never flow into compiled prompts
automatically.
