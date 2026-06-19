# Garmin MCP Server

Garmin MCP Server exposes Garmin Connect wellness and recovery metrics to MCP-compatible AI assistants. It helps agents incorporate sleep, recovery, and training context when planning work.

## Capabilities

- Fetch daily wellbeing snapshots from Garmin Connect
- Summarize sleep, Body Battery, HRV, stress, Training Readiness, and training status
- Recommend an appropriate workload level from current recovery signals
- Provide a guardrail tool for assistants before accepting heavy workloads
- Cache Garmin session tokens locally to avoid repeated logins

## MCP Tools

| Tool | Description |
| --- | --- |
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

Run the interactive login:

```powershell
npm run login
```

The login command prompts for your Garmin email and password, authenticates once, and writes reusable session tokens to `.garmin-tokens`. Your password is not written to disk.

Create a local environment file only if you want to customize settings:

```powershell
Copy-Item .env.example .env
```

Example `.env`:

```env
GARMIN_TOKEN_DIR=.garmin-tokens
GARMIN_IS_CN=false
```

You can also set `GARMIN_EMAIL` and `GARMIN_PASSWORD` in `.env` for non-interactive environments, but the recommended local setup is `npm run login`.

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

You can also place `GARMIN_EMAIL` and `GARMIN_PASSWORD` in the `env` block instead of using `.env`.

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
