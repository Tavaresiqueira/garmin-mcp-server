import { Buffer } from "node:buffer";
import path from "node:path";

export interface GarminServerConfig {
  email?: string;
  password?: string;
  tokenDir: string;
  domain: "garmin.com" | "garmin.cn";
}

function readPassword(): string | undefined {
  if (process.env.GARMIN_PASSWORD) {
    return process.env.GARMIN_PASSWORD;
  }

  if (process.env.GARMINCONNECT_PASSWORD) {
    return process.env.GARMINCONNECT_PASSWORD;
  }

  if (process.env.GARMINCONNECT_BASE64_PASSWORD) {
    return Buffer.from(process.env.GARMINCONNECT_BASE64_PASSWORD, "base64").toString("utf8");
  }

  return undefined;
}

function isChinaDomain(): boolean {
  const value = process.env.GARMIN_IS_CN ?? process.env.GARMINCONNECT_IS_CN;
  return ["1", "true", "yes", "y"].includes(String(value).toLowerCase());
}

export function loadConfig(): GarminServerConfig {
  return {
    email: process.env.GARMIN_EMAIL ?? process.env.GARMINCONNECT_EMAIL,
    password: readPassword(),
    tokenDir: path.resolve(process.env.GARMIN_TOKEN_DIR ?? ".garmin-tokens"),
    domain: isChinaDomain() ? "garmin.cn" : "garmin.com",
  };
}
