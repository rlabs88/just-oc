import type { ArchetypeConfig } from "../types"
import { fluxPrompt } from "../prompts/flux"

export const flux = {
  id: "flux",
  displayName: "Flux",
  description: "Research and scoping archetype for broad discovery, alternatives, trade-offs, and convergence into bounded action.",
  enabled: true,
  mode: "all",
  hidden: false,
  color: "accent",
  model: {
    model: "openai/gpt-5.6-luna",
    temperature: 0.5,
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
  },
  plugins: ["background-tasks", "command-run"],
  hooks: ["tool-audit"],
  prompts: fluxPrompt,
} satisfies ArchetypeConfig
