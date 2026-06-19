#!/usr/bin/env node

import "dotenv/config";

import fs from "node:fs";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

import { GarminConnect } from "garmin-connect";

import { loadConfig } from "./config.js";

async function promptVisible(question: string, defaultValue?: string): Promise<string> {
  const rl = readline.createInterface({ input, output });
  const suffix = defaultValue ? ` (${defaultValue})` : "";
  const answer = await rl.question(`${question}${suffix}: `);
  rl.close();
  return answer.trim() || defaultValue || "";
}

async function promptPassword(question: string, defaultValue?: string): Promise<string> {
  if (defaultValue) {
    return defaultValue;
  }

  output.write(`${question}: `);
  input.setRawMode?.(true);
  input.resume();
  input.setEncoding("utf8");

  return new Promise((resolve, reject) => {
    let value = "";

    const cleanup = () => {
      input.setRawMode?.(false);
      input.pause();
      input.removeListener("data", onData);
    };

    const onData = (char: string) => {
      if (char === "\u0003") {
        cleanup();
        output.write("\n");
        reject(new Error("Login cancelled."));
        return;
      }

      if (char === "\r" || char === "\n") {
        cleanup();
        output.write("\n");
        resolve(value);
        return;
      }

      if (char === "\u007f" || char === "\b") {
        value = value.slice(0, -1);
        return;
      }

      value += char;
    };

    input.on("data", onData);
  });
}

async function main(): Promise<void> {
  const config = loadConfig();

  console.log("Garmin MCP login");
  console.log("This creates a reusable local token cache. Your password is not written to disk.");
  console.log("");

  const email = await promptVisible("Garmin email", config.email);
  const password = await promptPassword("Garmin password", config.password);

  if (!email || !password) {
    throw new Error("Garmin email and password are required.");
  }

  fs.mkdirSync(config.tokenDir, { recursive: true });

  const client = new GarminConnect(
    {
      username: email,
      password,
    },
    config.domain,
  );

  await client.login(email, password);
  client.exportTokenToFile(config.tokenDir);

  const profile = await client.getUserProfile();
  const displayName = "displayName" in profile ? profile.displayName : email;

  console.log("");
  console.log(`Login successful for ${displayName}.`);
  console.log(`Token cache written to ${config.tokenDir}.`);
  console.log("You can now use the Garmin MCP server without storing your Garmin password.");
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Garmin login failed: ${message}`);
  process.exit(1);
});
