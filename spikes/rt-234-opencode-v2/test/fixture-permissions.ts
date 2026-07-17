import type { PermissionPolicy } from "../src/schema/permissions.ts"

export const fixturePermissions: PermissionPolicy = {
  defaultToolAction: "deny",
  patterned: {
    read: { default: "allow", rules: [{ pattern: "*.env*", action: "deny" }] },
    edit: { default: "ask", rules: [] },
    glob: { default: "allow", rules: [] },
    grep: { default: "allow", rules: [] },
    list: { default: "allow", rules: [] },
    bash: { default: "ask", rules: [{ pattern: "rm *", action: "deny" }] },
    external_directory: { default: "deny", rules: [] },
    lsp: { default: "allow", rules: [] },
    skill: { default: "ask", rules: [] },
  },
  scalar: {
    todowrite: "allow",
    question: "allow",
    webfetch: "ask",
    websearch: "ask",
    doom_loop: "ask",
  },
  customTools: [],
}
