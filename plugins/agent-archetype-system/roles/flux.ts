import type { ArchetypeConfig } from "../types"
import { fluxPrompt } from "../prompts/flux"

export const flux = {
  id: "flux",
  displayName: "Flux",
  description: "Divergent archetype for design, interface work, scoping, and any open problem, reached by re-posing it before committing.",
  enabled: true,
  mode: "all",
  hidden: false,
  color: "accent",
  model: {
    model: "openai/gpt-5.6-luna",
    // Higher than Cortex: vantage selection and candidate range are sampling-driven.
    temperature: 0.7,
    steps: 80,
  },
  permissions: {
    "*": "allow",
    adhd_run: "allow",
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
  nativeToolCatalog: {
    defaultMode: "compressed",
    disabled: ["read", "glob", "grep", "apply_patch"],
    retained: ["bash", "webfetch", "task", "todowrite", "skill"],
  },
  plugins: ["background-tasks", "zellij", "command-run", "adhd"],
  hooks: ["tool-audit"],
  prompts: fluxPrompt,
} satisfies ArchetypeConfig
