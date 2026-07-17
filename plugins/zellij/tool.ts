import { tool, type ToolDefinition } from "@opencode-ai/plugin"
import { execZellij } from "./exec"
import { domainHandlers } from "./domains"
import type { Domain } from "./types"

const TOOL_DESCRIPTION = `Zellij terminal multiplexer — single deep tool for all operations.

Use domain + action + params for structured calls, OR query for raw CLI passthrough.

## DOMAINS & ACTIONS

### session
- list — List all sessions
- new(name, layout?) — Create new session
- attach(session_name) — Attach to session
- kill(session_name) — Kill session
- delete(session_name) — Delete session
- rename(old_name, new_name) — Rename session
- switch(session_name) — Switch to session
- info(session_name) — Get session layout info
- clone(source_session, new_session_name) — Clone a session
- export(session_name, output_path?) — Export session layout
- import(import_path, new_session_name?) — Import session from layout
- kill_all — Kill all sessions
- delete_all — Delete all sessions

### pane
- new(direction?, command?, cwd?) — Open new pane (direction: right|down)
- close — Close focused pane
- focus(direction) — Focus pane (direction: left|right|up|down|next|previous)
- resize(direction, amount) — Resize pane (direction: left|right|up|down, amount: increase|decrease)
- scroll(direction, amount?) — Scroll (direction: up|down, amount: line|half-page|page)
- scroll_to_edge(edge) — Scroll to edge (edge: top|bottom)
- toggle_floating — Toggle floating panes
- toggle_fullscreen — Toggle fullscreen
- toggle_embed_float — Toggle embed/float
- pin — Pin pane
- toggle_frames — Toggle pane frames
- clear — Clear pane
- dump_screen(output_path?) — Dump screen content
- edit_scrollback — Edit scrollback buffer
- rename(name) — Rename pane
- undo_rename — Undo pane rename
- swap(direction) — Swap pane (direction: left|right|up|down)
- exec(command) — Execute command in new pane
- write(text, submit?) — Write text to pane (submit sends Enter)
- info — Get pane layout info
- move_focus_or_tab(direction) — Move focus or switch tab
- change_coordinates(x, y, width?, height?) — Change floating pane position

### tab
- new(name?, layout?) — New tab
- close — Close tab
- rename(name) — Rename tab
- undo_rename — Undo tab rename
- go_to(index) — Go to tab by index
- go_to_name(name) — Go to tab by name
- move(direction) — Move tab (direction: left|right)
- query_names — List tab names
- toggle_sync — Toggle tab sync
- next — Next tab
- previous — Previous tab

### pipe
- send(payload, pipe_name?, plugin_url?, args?) — Send pipe message
- to_plugin(payload, plugin_url, pipe_name?) — Pipe to plugin
- broadcast(payload, pipe_name) — Broadcast pipe message
- action(payload, pipe_name?, plugin_url?, floating?, in_place?, cwd?, title?, skip_cache?) — Advanced pipe action
- with_response(payload, pipe_name?, plugin_url?) — Pipe with response
- from_file(file_path, pipe_name?, plugin_url?) — Pipe file contents

### plugin
- launch(plugin_url, floating?, in_place?, skip_cache?, width?, height?, x?, y?) — Launch plugin
- action_launch(plugin_url, floating?, in_place?, skip_cache?) — Launch plugin (action)
- launch_or_focus(plugin_url, floating?) — Launch or focus plugin
- start_or_reload(plugin_url) — Start or reload plugin
- list_aliases — List plugin aliases
- info(plugin_url) — Get plugin info
- list_running — List running plugins

### layout
- dump(output_path?) — Dump current layout
- save(layout_name, layouts_dir?) — Save current layout to file
- apply(layout_name) — Apply a layout
- list(layouts_dir?) — List available layouts
- load(layout_name) — Load a layout
- new_tab_with(layout_name, tab_name?) — New tab with layout
- validate(layout_path) — Validate layout file

### utility
- run_command(command, direction?) — Run command in new pane
- edit_file(file_path) — Edit file in zellij
- switch_mode(mode) — Switch mode (locked|pane|tab|resize|move|search|session)
- snapshot — **One-call mega query**: returns ALL sessions, tabs, and panes as JSON. Use this first to understand the full Zellij state before any management operations.
- health_check — Check zellij version/health
- clear_cache — Clear cache
- cache_stats — Get cache stats

### detection
- watch_pipe(pipe_path, patterns?, timeout_ms?) — Watch named pipe
- create_named_pipe(pipe_name, mode?) — Create named pipe at /tmp/zellij-pipe-{name}
- pipe_with_timeout(command, target_pipe, timeout_ms?) — Execute and pipe with timeout
- poll_process(pid) — Check if process is running
- watch_file(file_path, patterns?) — Read file and check for patterns
- create_llm_wrapper(wrapper_name, llm_command, detect_marker?, timeout_ms?) — Create LLM completion wrapper
- cleanup — Remove all detection temp files

### exec
- start(session?, tab?, pane?, direction?, cwd?) — Start shell bridge listener in a pane. Targets existing focused pane by default; set direction (right|down) to create a new pane. session/tab/pane navigate to target before injecting.
- run(command, session?, timeout_ms?) — Execute command in bridge, returns JSON {request_id, stdout, stderr, exit_code, cwd, duration_ms}. Shell state (cwd, env, virtualenvs) persists across calls.
- status(session?) — Check if bridge listener is alive
- stop(session?) — Stop bridge listener and clean up

## AGENT CONTEXT (self-termination prevention)
Responses from session, pane, tab, and exec domains include an [AGENT CONTEXT] footer with the Zellij session and pane_id where the agent process is running. NEVER kill, close, or delete the session/pane shown in this context — doing so terminates the agent itself.

## QUERY (raw passthrough)
Pass any zellij CLI args directly. Examples:
  query: "list-sessions"
  query: "action new-pane --direction right -- htop"
  query: "action resize increase left"
  query: "--session mySession action dump-layout"`

/** Domains whose responses include agent context for self-termination prevention. */
const CONTEXT_DOMAINS = new Set(["session", "pane", "tab", "exec"])

/**
 * Returns the Zellij session/pane the agent process is running in.
 * Zellij sets these env vars for all child processes inside a pane.
 */
function getAgentContext(): string {
  const session = process.env.ZELLIJ_SESSION_NAME
  const paneId = process.env.ZELLIJ_PANE_ID
  if (!session) return ""
  const parts = [`session="${session}"`]
  if (paneId) parts.push(`pane_id=${paneId}`)
  return `\n\n[AGENT CONTEXT — DO NOT TERMINATE] ${parts.join(", ")}`
}

export function createZellijTool(): ToolDefinition {
  return tool({
    description: TOOL_DESCRIPTION,
    args: {
      domain: tool.schema
        .enum(["session", "pane", "tab", "pipe", "plugin", "layout", "utility", "detection", "exec"])
        .optional()
        .describe("The zellij domain to operate on (omit if using query)"),
      action: tool.schema
        .string()
        .optional()
        .describe("The action to perform within the domain"),
      params: tool.schema
        .record(tool.schema.string(), tool.schema.unknown())
        .optional()
        .describe("Action-specific parameters as key-value pairs"),
      query: tool.schema
        .string()
        .optional()
        .describe("Raw zellij CLI args for direct passthrough — domain/action/params ignored when set"),
    },
    async execute(args) {
      try {
        // Raw query passthrough takes precedence
        if (args.query) {
          return await execZellij(args.query)
        }

        if (!args.domain || !args.action) {
          return "[ERROR] Provide either query for raw CLI passthrough, or domain + action for structured calls"
        }

        const handler = domainHandlers[args.domain as Domain]
        if (!handler) {
          return `[ERROR] Unknown domain: "${args.domain}"`
        }

        const result = await handler(args.action, args.params ?? {})

        // Append agent context to session/pane/tab/exec responses
        if (CONTEXT_DOMAINS.has(args.domain)) {
          return result + getAgentContext()
        }

        return result
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return `[ERROR] ${message}`
      }
    },
  })
}
