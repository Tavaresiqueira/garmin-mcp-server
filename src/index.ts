#!/usr/bin/env node

import "dotenv/config";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { loadConfig } from "./config.js";
import { parseGarminDate } from "./date.js";
import { GarminClient } from "./garmin-client.js";
import { getBaselineProfile, getChangeAlerts, getTrainingLoadTrend } from "./history.js";
import { getWellbeingSnapshot } from "./wellbeing.js";

const config = loadConfig();
const garmin = new GarminClient(config);

const server = new McpServer({
  name: "garmin-mcp-server",
  version: "0.1.0",
});

function jsonContent(data: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(data, null, 2),
      },
    ],
  };
}

server.registerTool(
  "garmin_training_load_trend",
  {
    title: "Garmin training load trend",
    description:
      "Return short and long window trends for sleep, overnight HRV, stress, training readiness, and Body Battery at wake.",
    inputSchema: {
      date: z.string().optional().describe("End date in YYYY-MM-DD format. Defaults to today."),
      shortWindowDays: z.number().int().min(3).max(14).optional().describe("Short trend window. Defaults to 7."),
      longWindowDays: z.number().int().min(7).max(56).optional().describe("Long trend window. Defaults to 28."),
    },
  },
  async ({ date, shortWindowDays, longWindowDays }) => {
    const trend = await getTrainingLoadTrend(
      garmin,
      parseGarminDate(date),
      shortWindowDays ?? 7,
      longWindowDays ?? 28,
    );
    return jsonContent(trend);
  },
);

server.registerTool(
  "garmin_baseline_profile",
  {
    title: "Garmin baseline profile",
    description:
      "Compute personal baseline ranges over a historical window for sleep, sleep score, HRV, stress, training readiness, and Body Battery at wake.",
    inputSchema: {
      date: z.string().optional().describe("End date in YYYY-MM-DD format. Defaults to today."),
      windowDays: z.number().int().min(14).max(90).optional().describe("Historical baseline window. Defaults to 42."),
    },
  },
  async ({ date, windowDays }) => {
    const baseline = await getBaselineProfile(garmin, parseGarminDate(date), windowDays ?? 42);
    return jsonContent(baseline);
  },
);

server.registerTool(
  "garmin_change_alerts",
  {
    title: "Garmin change alerts",
    description:
      "Highlight meaningful changes versus yesterday and versus baseline, such as sleep drops, HRV dips, stress spikes, and readiness declines.",
    inputSchema: {
      date: z.string().optional().describe("Date in YYYY-MM-DD format. Defaults to today."),
      baselineWindowDays: z
        .number()
        .int()
        .min(14)
        .max(56)
        .optional()
        .describe("Historical window used for baseline comparisons. Defaults to 28."),
    },
  },
  async ({ date, baselineWindowDays }) => {
    const alerts = await getChangeAlerts(garmin, parseGarminDate(date), baselineWindowDays ?? 28);
    return jsonContent(alerts);
  },
);

server.registerTool(
  "garmin_wellbeing_snapshot",
  {
    title: "Garmin wellbeing snapshot",
    description:
      "Fetch a concise Garmin Connect wellbeing snapshot for a date: sleep, Body Battery, HRV, stress, training readiness, and a workload recommendation.",
    inputSchema: {
      date: z.string().optional().describe("Date in YYYY-MM-DD format. Defaults to today."),
      includeRaw: z.boolean().optional().describe("Include raw Garmin responses for debugging."),
    },
  },
  async ({ date, includeRaw }) => {
    const snapshot = await getWellbeingSnapshot(garmin, parseGarminDate(date), includeRaw ?? false);
    return jsonContent(snapshot);
  },
);

server.registerTool(
  "garmin_workload_guard",
  {
    title: "Garmin workload guard",
    description:
      "Check Garmin recovery metrics before committing to a workload and suggest a safer daily scope when signals are weak.",
    inputSchema: {
      workload: z.string().describe("The work the user wants to take on."),
      ticketCount: z.number().int().positive().optional().describe("Number of tickets/tasks being considered."),
      date: z.string().optional().describe("Date in YYYY-MM-DD format. Defaults to today."),
    },
  },
  async ({ workload, ticketCount, date }) => {
    const snapshot = await getWellbeingSnapshot(garmin, parseGarminDate(date), false);
    const requestedCount = ticketCount ?? null;
    const overLimit = requestedCount !== null && requestedCount > snapshot.recommendation.ticketLimit;

    return jsonContent({
      workload,
      requestedTicketCount: requestedCount,
      date: snapshot.date,
      recommendation: snapshot.recommendation,
      pushbackRequired: overLimit || ["minimal", "recovery"].includes(snapshot.recommendation.load),
      suggestedResponse: overLimit
        ? `Garmin says to cap today at ${snapshot.recommendation.ticketLimit} ticket(s). ${snapshot.recommendation.message}`
        : snapshot.recommendation.message,
      metrics: {
        sleep: snapshot.sleep,
        bodyBattery: snapshot.bodyBattery,
        trainingReadiness: snapshot.trainingReadiness,
        stress: snapshot.stress,
      },
    });
  },
);

server.registerTool(
  "garmin_sleep_summary",
  {
    title: "Garmin sleep summary",
    description: "Fetch Garmin sleep score, duration, overnight HRV, sleep stress, Body Battery change, and resting heart rate.",
    inputSchema: {
      date: z.string().optional().describe("Date in YYYY-MM-DD format. Defaults to today."),
    },
  },
  async ({ date }) => {
    const snapshot = await getWellbeingSnapshot(garmin, parseGarminDate(date), false);
    return jsonContent({
      date: snapshot.date,
      sleep: snapshot.sleep,
      recommendation: snapshot.recommendation,
    });
  },
);

server.registerResource(
  "garmin-today",
  "garmin://wellbeing/today",
  {
    title: "Garmin wellbeing today",
    description: "Today's Garmin wellbeing snapshot for agent context.",
    mimeType: "application/json",
  },
  async (uri) => {
    const snapshot = await getWellbeingSnapshot(garmin, parseGarminDate(undefined), false);
    return {
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(snapshot, null, 2),
        },
      ],
    };
  },
);

server.registerPrompt(
  "garmin_workload_guardrails",
  {
    title: "Garmin workload guardrails",
    description:
      "System-style instructions for using Garmin recovery data before agreeing to heavy work.",
  },
  () => ({
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text: [
            "Use Garmin context as part of planning, especially when the user proposes a heavy workload, late-day push, risky refactor, production change, or many tickets in one day.",
            "",
            "Before agreeing to heavy work, call garmin_workload_guard or garmin_wellbeing_snapshot.",
            "If sleep, Body Battery, HRV, stress, or Training Readiness are poor, push back concretely: reduce ticket count, split the work, defer risky items, and create a stopping point.",
            "Do not moralize or diagnose health. Treat the metrics as planning context, not medical advice.",
            "If Garmin data is unavailable, say that plainly and fall back to normal workload planning.",
          ].join("\n"),
        },
      },
    ],
  }),
);

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Garmin MCP server failed: ${message}`);
  process.exit(1);
});
