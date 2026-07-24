import type { TaskType } from "../types"

export const taskManuals = {
  implementation: `# Implementation manual

Translate the acceptance contract into the smallest integrated behavior. Trace affected callers and consumers before editing, keep dependency direction explicit, and prefer an established seam over a parallel abstraction. Prove the missing contract with a focused check, implement it coherently, then widen validation in proportion to risk. Audit the final diff against every requested behavior and report exact outcomes.`,
  new_build: `# New build manual

Define the complete truthful user flow and production boundary before optimizing individual components. Prefer mature ecosystem libraries for conventional behavior, honor the exact requested framework, and keep external boundaries typed and validated. Implement real loading, empty, error, recovery, persistence, and configuration behavior where the product requires them. Reject placeholder success, disconnected controls, fake data presented as live, and visual polish that conceals an incomplete flow. Finish with lint, type, build, and end-to-end validation appropriate to the delivered surface.`,
  debugging: `# Debugging manual

Start from the observable failure and diagnose backward through the last responsible boundary. Separate reproduction facts from hypotheses, compare the failing path with a known-good path when available, and change the earliest boundary that violates its contract. Add a focused regression check before widening validation. Do not mask the symptom, suppress an error, or broaden the fix without evidence.`,
  refactoring: `# Refactoring manual

Inventory public behavior, inputs, outputs, persistence effects, compatibility constraints, and extension seams before changing structure. Establish the existing tests as one oracle, then add focused differential or end-to-end coverage across the real CLI, API, storage, or user boundary. Preserve behavior first; improve ownership and dependency direction second. Remove superseded paths when safe, and do not claim parity from a small hand-selected sample or from compilation alone.`,
  architecture: `# Architecture manual

Identify the capability boundary, state owner, dependencies, integration seams, and failure semantics before proposing structure. Prefer the smallest vertical slice that preserves existing ownership and host authority. Make alternatives comparable by naming their gains, drag, migration cost, and reversibility. Validate the selected contract against actual runtime extension points before implementation.`,
  review: `# Review manual

Review from user-visible behavior inward. Check correctness, security boundaries, data and state ownership, failure handling, compatibility, and validation evidence. Tie each finding to a concrete path and consequence, rank it by impact, and distinguish actionable defects from optional improvements. Reconcile the final verdict with the original acceptance conditions and exact test outcomes.`,
  research: `# Research manual

Frame the decision the research must support, then gather the smallest sufficient evidence set. Prefer repository evidence and primary version-matched sources. Track claims, provenance, contradictions, and uncertainty separately. Stop when more discovery is unlikely to change the decision, and return a bounded recommendation with the next executable action.`,
  data_research: `# Data research manual

Translate the question into explicit definitions, source fields, units, transformations, and decision thresholds. Compute quantitative claims through reproducible code or structured tools rather than language-model intuition. Preserve source provenance, missing-data treatment, uncertainty, and the distinction between correlation, inference, and observation. Validate intermediate datasets and final calculations, and inspect every chart or exported artifact used to support the conclusion.`,
  visual_inspection: `# Visual inspection manual

Inspect the rendered artifact at representative sizes and states, not only its source. Compare hierarchy, alignment, spacing, typography, color, overflow, focus, loading, empty, and error behavior against the intended contract. Record concrete visual evidence, distinguish systemic defects from isolated polish, and re-inspect after each material correction.`,
  frontend: `# Frontend manual

Start from the real user journey and component states, then implement structure, interaction, and styling as one integrated behavior. Use the requested framework and established component system exactly. Keep state ownership explicit, controls connected to real behavior, keyboard and focus paths operable, and loading, empty, error, disabled, and overflow states intentional. Validate the rendered result and interactions at representative viewports after material changes.`,
  website: `# Website manual

Define the audience, primary action, information hierarchy, routes, and responsive states before polishing. Build a coherent visual system with restrained typography, color, spacing, imagery, and reusable components; avoid generic template clutter and unsupported marketing claims. Verify navigation, forms, links, metadata, accessibility, performance-sensitive assets, and responsive rendering in the actual application.`,
  interactive_3d: `# Interactive and 3D manual

Treat rendering, input, simulation state, assets, performance, and fallback behavior as one runtime contract. Establish camera, controls, coordinate conventions, loading, resize, cleanup, and error states explicitly. Use deterministic fixtures where possible, bound expensive work, and inspect the actual scene across representative interactions and device constraints. Do not accept a static screenshot as proof of correct interactive behavior.`,
  editorial: `# Editorial manual

Preserve factual meaning, intended audience, voice, and source provenance while improving structure and clarity. Normalize terminology, headings, links, examples, and calls to action without inventing claims or smoothing over contradictions. Make instructions executable and verification paths concrete. Review the rendered document or publishing surface when layout, navigation, or formatting affects comprehension.`,
  operations: `# Operations manual

Identify the environment, authority boundary, dependencies, rollout sequence, health signals, failure modes, and rollback path before changing operational state. Prefer reproducible configuration and idempotent commands over manual drift. Keep secrets provider-managed, distinguish local validation from remote success, and require explicit authorization for deployment or shared-state mutation. Validate configuration statically, exercise the safest available smoke path, and report observability and rollback evidence.`,
} as const satisfies Readonly<Record<TaskType, string>>
