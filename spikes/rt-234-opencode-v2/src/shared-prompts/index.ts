import { identityBaseline } from "./identity.ts"
import { securityBaseline } from "./security.ts"
import { taskBaseline } from "./task.ts"

export const sharedPrompts = {
  identity: identityBaseline,
  security: securityBaseline,
  task: taskBaseline,
} as const
