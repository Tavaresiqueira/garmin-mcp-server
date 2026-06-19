# Garmin MCP Server

MCP server that lets an agent read Garmin Connect recovery metrics before planning heavy work.

It is inspired by the Oura Ring MCP idea: your physical context enters the agent loop, so the same agent helping you ship code can also notice when Garmin says your recovery is poor.

## What It Exposes

Tools:

- `garmin_wellbeing_snapshot`: sleep, Body Battery, HRV, stress, Training Readiness, training status, and a workload recommendation.
- `garmin_workload_guard`: checks a proposed workload and suggests a safer scope when recovery signals are weak.
- `garmin_sleep_summary`: focused sleep context.

Resource:

- `garmin://wellbeing/today`: today's snapshot as JSON.

Prompt:

- `garmin_workload_guardrails`: system-style instructions for agents to proactively check Garmin before agreeing to heavy work.

## Setup

Install and build:

```powershell
npm install
npm run build
```

Create a local `.env` file:

```powershell
Copy-Item .env.example .env
```

Fill in either:

- `GARMIN_EMAIL` and `GARMIN_PASSWORD`
- or `GARMINCONNECT_EMAIL` and `GARMINCONNECT_BASE64_PASSWORD`, matching the `garmin-grafana` style.

The server caches Garmin OAuth tokens in `.garmin-tokens` by default after the first successful login. You can override this with `GARMIN_TOKEN_DIR`.

## Claude Desktop Config

Add this server to your Claude Desktop MCP config:

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

If you do not use `.env`, put `GARMIN_EMAIL` and `GARMIN_PASSWORD` in the `env` block.

## Agent Instructions

Use this as Claude/Codex project guidance:

```text
Use Garmin context as part of planning, especially when I propose a heavy workload, late-day push, risky refactor, production change, or many tickets in one day.

Before agreeing to heavy work, call garmin_workload_guard or garmin_wellbeing_snapshot.

If sleep, Body Battery, HRV, stress, or Training Readiness are poor, push back concretely: reduce ticket count, split the work, defer risky items, and create a stopping point.

Do not moralize or diagnose health. Treat the metrics as planning context, not medical advice.

If Garmin data is unavailable, say that plainly and fall back to normal workload planning.
```

## Notes

This uses the unofficial Garmin Connect web APIs through the `garmin-connect` npm package. Garmin can change these endpoints or rate-limit repeated logins, so token reuse matters.

Your local `garmin-grafana` setup uses the Python `garminconnect`/`garth` token store under `garminconnect-tokens`. This TypeScript server keeps its own Node-compatible token cache and does not read the Python token format directly.
