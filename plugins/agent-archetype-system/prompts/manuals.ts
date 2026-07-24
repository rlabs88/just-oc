import type { TaskType } from "../types"

export const taskManuals = {
  implementation: `# Implementation manual

Translate the acceptance contract into the smallest integrated behavior. Trace affected callers and consumers before editing, keep dependency direction explicit, and prefer an established seam over a parallel abstraction. Prove the missing contract with a focused check, implement it coherently, then widen validation in proportion to risk. Audit the final diff against every requested behavior and report exact outcomes.`,
  debugging: `# Debugging manual

Start from the observable failure and diagnose backward through the last responsible boundary. Separate reproduction facts from hypotheses, compare the failing path with a known-good path when available, and change the earliest boundary that violates its contract. Add a focused regression check before widening validation. Do not mask the symptom, suppress an error, or broaden the fix without evidence.`,
  architecture: `# Architecture manual

Identify the capability boundary, state owner, dependencies, integration seams, and failure semantics before proposing structure. Prefer the smallest vertical slice that preserves existing ownership and host authority. Make alternatives comparable by naming their gains, drag, migration cost, and reversibility. Validate the selected contract against actual runtime extension points before implementation.`,
  review: `# Review manual

Review from user-visible behavior inward. Check correctness, security boundaries, data and state ownership, failure handling, compatibility, and validation evidence. Tie each finding to a concrete path and consequence, rank it by impact, and distinguish actionable defects from optional improvements. Reconcile the final verdict with the original acceptance conditions and exact test outcomes.`,
  research: `# Research manual

Frame the decision the research must support, then gather the smallest sufficient evidence set. Prefer repository evidence and primary version-matched sources. Track claims, provenance, contradictions, and uncertainty separately. Stop when more discovery is unlikely to change the decision, and return a bounded recommendation with the next executable action.`,
  visual_inspection: `# Visual inspection manual

Inspect the rendered artifact at representative sizes and states, not only its source. Compare hierarchy, alignment, spacing, typography, color, overflow, focus, loading, empty, and error behavior against the intended contract. Record concrete visual evidence, distinguish systemic defects from isolated polish, and re-inspect after each material correction.`,
} as const satisfies Readonly<Record<TaskType, string>>
