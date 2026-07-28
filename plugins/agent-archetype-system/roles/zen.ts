import type { ArchetypeConfig } from "../types"
import { zenPrompt } from "../prompts/zen"

export const zen = {
  id: "zen",
  displayName: "Zen",
  description: "Knowledge-plane archetype for retrieval, synthesis, provenance, contradiction detection, and durable current truth.",
  enabled: true,
  mode: "all",
  hidden: false,
  color: "info",
  model: {
    model: "openai/gpt-5.6-luna",
    temperature: 0.1,
    steps: 48,
  },
  permissions: {
    "*": "allow",
    command_run: "allow",
    command_run_read: "allow",
    command_run_glob: "allow",
    command_run_grep: "allow",
    command_run_apply_patch: "allow",
    command_run_shell: "allow",
    command_run_task_status: "allow",
    command_run_web_discover: "allow",
    command_run_read_media: "allow",
    // Zen delegates divergent exploration to Flux and feasibility to Cortex.
    // Declares intent only; OpenCode's permission result remains authoritative.
    task: { "*": "ask", cortex: "allow", flux: "allow" },
  },
  plugins: ["zellij", "command-run"],
  hooks: ["tool-audit"],
  prompts: zenPrompt,
} satisfies ArchetypeConfig
