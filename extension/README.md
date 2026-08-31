# OpenCLI Browser Bridge Extension

The extension connects Chrome tabs to the local OpenCLI daemon **or** a remote
daemon (intranet MVP). It uses Chrome extension APIs as a transport and
browser-control layer for explicit CLI / Agent commands. An optional **Side
Panel** talks to a cc-connect Bridge for chat while browser commands still flow
through the daemon WebSocket.

## Modes

- **local** (default): `ws://localhost:19825/ext` — classic setup; install opencli on the same machine.
- **remote**: configure daemon base URL + **deviceId/deviceToken** (multi-tenant) or shared `OPENCLI_REMOTE_TOKEN` (single-tenant compat) in the side panel; the user's machine does **not** need the opencli CLI.
  - Multi-tenant guide: [`docs/guide/multi-tenant-device-credentials.md`](../docs/guide/multi-tenant-device-credentials.md)
  - Original remote MVP: [`docs/guide/sidebar-remote-opencli.md`](../docs/guide/sidebar-remote-opencli.md)

## Permission Notes

- `debugger`: sends CDP commands to OpenCLI-controlled or bound tabs.
- `tabs` / `tabGroups`: manages the dedicated OpenCLI automation container and
  reports selected tab metadata back to the CLI.
- `cookies`: reads cookies for browser-backed adapters that need authenticated
  fetches.
- `downloads`: surfaces download lifecycle to `opencli browser wait download`.
  The extension observes started / in-progress / completed / failed downloads so
  the CLI can wait for a file triggered by an automation command. OpenCLI
  filters by the command's filename/URL pattern and timeout, and does not modify,
  redirect, or persist browser download history.
- `sidePanel`: Agent chat UI and connection settings.

Suggested Chrome Web Store justification for `downloads`:

> This extension uses `chrome.downloads` to surface download lifecycle
> (started / in-progress / completed / failed) to the OpenCLI command-line tool,
> so agents can wait for downloads triggered during an automation workflow. The
> command filters by a user-provided filename or URL pattern and timeout. We do
> not modify, redirect, or persist user download history.
