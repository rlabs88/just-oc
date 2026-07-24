import type { ArchetypeConfig } from "../types"
import { cortexPrompt } from "../prompts/cortex"

export const cortex = {
  id: "cortex",
  displayName: "Cortex",
  description: "Precision software-engineering archetype for implementation, debugging, architecture, and verified repository change.",
  enabled: true,
  mode: "all",
  hidden: false,
  color: "primary",
  model: {
    model: "openai/gpt-5.6-luna",
    temperature: 0.2,
    steps: 80,
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
  nativeToolCatalog: {
    defaultMode: "compressed",
    disabled: ["read", "glob", "grep", "apply_patch"],
    retained: ["bash", "webfetch", "task", "todowrite", "skill"],
  },
  plugins: ["background-tasks", "zellij", "command-run"],
  hooks: ["tool-audit"],
  prompts: cortexPrompt,
} satisfies ArchetypeConfig
