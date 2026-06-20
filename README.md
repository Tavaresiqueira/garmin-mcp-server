# Garmin MCP Server

Garmin MCP Server exposes Garmin Connect wellness and recovery metrics to MCP-compatible AI assistants. It helps agents incorporate sleep, recovery, and training context when planning work.

## Capabilities

- Fetch daily wellbeing snapshots from Garmin Connect
- Summarize sleep, Body Battery, HRV, stress, Training Readiness, and training status
- Analyze short-term versus long-term recovery trends
- Compute personal baseline ranges over historical windows
- Highlight meaningful changes versus yesterday and baseline
- Recommend an appropriate workload level from current recovery signals
- Provide a guardrail tool for assistants before accepting heavy workloads
- Cache Garmin session tokens locally to avoid repeated logins

## MCP Tools

| Tool | Description |
| --- | --- |
| `garmin_training_load_trend` | Returns 7-day versus 28-day trends for sleep, HRV, stress, training readiness, and Body Battery at wake. |
| `garmin_baseline_profile` | Computes personal baseline ranges for recovery metrics over a historical window. |
| `garmin_change_alerts` | Highlights meaningful daily changes such as sleep drops, HRV dips, stress spikes, and readiness declines. |
| `garmin_wellbeing_snapshot` | Returns a concise daily snapshot with recovery metrics and workload recommendation. |
| `garmin_workload_guard` | Evaluates a proposed workload against current Garmin recovery signals. |
| `garmin_sleep_summary` | Returns focused sleep and recovery context for a given date. |

## MCP Resource

| Resource | Description |
| --- | --- |
| `garmin://wellbeing/today` | Today's wellbeing snapshot as JSON. |

## MCP Prompt

| Prompt | Description |
| --- | --- |
| `garmin_workload_guardrails` | Instructions for using Garmin context during workload planning. |

## Installation

```powershell
npm install
npm run build
```

## Authentication

The recommended local setup is an interactive one-time login. This writes Garmin session
tokens to disk so the MCP server can run later without storing your Garmin password.

Run:

```powershell
npm run login
```

The login command:

1. Prompts for your Garmin email.
2. Prompts for your Garmin password without echoing it to the terminal.
3. Authenticates with Garmin Connect.
4. Creates the token cache directory if it does not exist.
5. Writes reusable Garmin session tokens to `.garmin-tokens` by default.

Your password is used only for the login request. It is not written to disk.

After a successful login you should see output similar to:

```text
Garmin MCP login
This creates a reusable local token cache. Your password is not written to disk.

Garmin email: you@example.com
Garmin password:

Login successful for Your Name.
Token cache written to C:\path\to\garmin-mcp-server\.garmin-tokens.
You can now use the Garmin MCP server without storing your Garmin password.
```

The MCP server loads tokens from `GARMIN_TOKEN_DIR`. If the variable is not set, it
uses `./.garmin-tokens` relative to the directory where the server process starts.

For MCP clients, prefer passing an absolute `GARMIN_TOKEN_DIR` in the client
configuration. This avoids issues when the client starts the server from a different
working directory.

## Environment Variables

Create a local environment file only if you want to customize settings:

```powershell
Copy-Item .env.example .env
```

Example `.env`:

```env
GARMIN_TOKEN_DIR=.garmin-tokens
GARMIN_IS_CN=false
```

Supported variables:

| Variable | Purpose |
| --- | --- |
| `GARMIN_TOKEN_DIR` | Directory used to read/write Garmin session tokens. Defaults to `.garmin-tokens`. |
| `GARMIN_IS_CN` | Set to `true`, `1`, `yes`, or `y` for Garmin China accounts. Defaults to Garmin global (`garmin.com`). |
| `GARMIN_EMAIL` | Optional email used by `npm run login` or non-interactive server startup. |
| `GARMIN_PASSWORD` | Optional password used by `npm run login` or non-interactive server startup. Prefer token login locally. |
| `GARMINCONNECT_EMAIL` | Compatibility alias for `GARMIN_EMAIL`. |
| `GARMINCONNECT_PASSWORD` | Compatibility alias for `GARMIN_PASSWORD`. |
| `GARMINCONNECT_BASE64_PASSWORD` | Compatibility password option. The value is decoded from base64 before login. |
| `GARMINCONNECT_IS_CN` | Compatibility alias for `GARMIN_IS_CN`. |

For local development, use `npm run login` instead of keeping `GARMIN_PASSWORD` in
`.env`. Credentials in environment variables are mainly useful for non-interactive
or temporary automation.

## Verify the Server Locally

After logging in and building, run:

```powershell
npm run typecheck
npm run build
npm run start
```

`npm run start` launches the MCP server over stdio. It will wait for an MCP client
to speak the protocol, so it may appear idle in a normal terminal. That is expected.

## Claude Desktop Configuration

Add the server to your Claude Desktop MCP configuration:

```json
{
  "mcpServers": {
    "garmin": {
      "command": "node",
      "args": ["C:\\Users\\joao.siqueira\\Documents\\garmin-mcp-server\\dist\\index.js"],
      "env": {
        "GARMIN_TOKEN_DIR": "C:\\Users\\joao.siqueira\\Documents\\garmin-mcp-server\\.garmin-tokens"
      }
    }
  }
}
```

Use your own absolute paths for `dist\\index.js` and `.garmin-tokens`.

You can also place `GARMIN_EMAIL` and `GARMIN_PASSWORD` in the `env` block instead
of using token login, but token login is preferred for local machines because it
does not require storing the Garmin password in the MCP client config.

After editing the MCP client configuration, restart the client so it reloads the
server definition.

## Codex Configuration Example

If your MCP client uses a TOML-style server config, the same setup looks like this:

```toml
[mcp_servers.garmin]
command = "node"
args = ["C:\\Users\\joao.siqueira\\Documents\\garmin-mcp-server\\dist\\index.js"]

[mcp_servers.garmin.env]
GARMIN_TOKEN_DIR = "C:\\Users\\joao.siqueira\\Documents\\garmin-mcp-server\\.garmin-tokens"
```

Restart Codex after updating the config. Once loaded, the Garmin tools should be
available as MCP tools:

- `garmin_training_load_trend`
- `garmin_baseline_profile`
- `garmin_change_alerts`
- `garmin_wellbeing_snapshot`
- `garmin_workload_guard`
- `garmin_sleep_summary`

## Troubleshooting

If login fails:

- Confirm the email and password work in Garmin Connect in a browser.
- If your account uses Garmin China, set `GARMIN_IS_CN=true`.
- Delete the token cache and run `npm run login` again if tokens become stale.

If the MCP client cannot fetch Garmin data:

- Confirm `npm run build` has been run and `dist\\index.js` exists.
- Use an absolute `GARMIN_TOKEN_DIR` in the MCP client config.
- Confirm the MCP client was restarted after config changes.
- Run `npm run login` again if Garmin has invalidated the session.

If TypeScript build fails:

```powershell
npm install
npm run typecheck
npm run build
```

## Recommended Agent Guidance

```text
Use Garmin context as part of planning, especially when I propose a heavy workload, late-day push, risky refactor, production change, or many tickets in one day.

Before agreeing to heavy work, call garmin_workload_guard or garmin_wellbeing_snapshot.

If sleep, Body Battery, HRV, stress, or Training Readiness are poor, push back concretely: reduce ticket count, split the work, defer risky items, and create a stopping point.

Do not moralize or diagnose health. Treat the metrics as planning context, not medical advice.

If Garmin data is unavailable, say that plainly and fall back to normal workload planning.
```

## Development

```powershell
npm run dev
npm run login
npm run typecheck
npm run build
```

## Security

- Do not commit `.env` or token cache directories.
- Prefer token reuse over repeated credential logins.
- Treat all Garmin data as private health-related context.
