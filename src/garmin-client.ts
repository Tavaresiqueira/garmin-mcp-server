import fs from "node:fs";

import { GarminConnect } from "garmin-connect";

import type { GarminServerConfig } from "./config.js";

type JsonObject = Record<string, unknown>;

const CONNECT_API_BASE = "https://connectapi.";

export class GarminClient {
  private client?: GarminConnect;

  constructor(private readonly config: GarminServerConfig) {}

  async connect(): Promise<GarminConnect> {
    if (this.client) {
      return this.client;
    }

    const client = new GarminConnect(
      {
        username: this.config.email ?? "",
        password: this.config.password ?? "",
      },
      this.config.domain,
    );

    if (fs.existsSync(this.config.tokenDir)) {
      try {
        client.loadTokenByFile(this.config.tokenDir);
        await client.getUserProfile();
        this.client = client;
        return client;
      } catch {
        this.client = undefined;
      }
    }

    if (!this.config.email || !this.config.password) {
      throw new Error(
        `Garmin credentials are missing and no valid token cache was found at ${this.config.tokenDir}. ` +
          "Run `npm run login` from the server directory to create a token cache, or set GARMIN_EMAIL and GARMIN_PASSWORD.",
      );
    }

    await client.login(this.config.email, this.config.password);
    client.exportTokenToFile(this.config.tokenDir);
    this.client = client;
    return client;
  }

  async getProfile(): Promise<JsonObject> {
    const client = await this.connect();
    return (await client.getUserProfile()) as unknown as JsonObject;
  }

  async getUserSettings(): Promise<JsonObject> {
    const client = await this.connect();
    return (await client.getUserSettings()) as unknown as JsonObject;
  }

  async getSleepData(date: Date): Promise<JsonObject> {
    const client = await this.connect();
    return (await client.getSleepData(date)) as unknown as JsonObject;
  }

  async getDailySummary(dateIso: string): Promise<JsonObject> {
    const profile = await this.getProfile();
    const displayName = profile.displayName;
    if (typeof displayName !== "string" || displayName.length === 0) {
      throw new Error("Garmin profile is missing displayName; daily summary endpoint cannot be queried.");
    }

    return this.get<JsonObject>(`/usersummary-service/usersummary/daily/${displayName}`, {
      calendarDate: dateIso,
    });
  }

  async getStressData(dateIso: string): Promise<JsonObject> {
    return this.get<JsonObject>(`/wellness-service/wellness/dailyStress/${dateIso}`);
  }

  async getHrvData(dateIso: string): Promise<JsonObject | null> {
    return this.get<JsonObject | null>(`/hrv-service/hrv/${dateIso}`);
  }

  async getTrainingReadiness(dateIso: string): Promise<JsonObject[]> {
    return this.get<JsonObject[]>(`/metrics-service/metrics/trainingreadiness/${dateIso}`);
  }

  async getTrainingStatus(dateIso: string): Promise<JsonObject> {
    return this.get<JsonObject>(`/metrics-service/metrics/trainingstatus/aggregated/${dateIso}`);
  }

  private async get<T>(path: string, params?: Record<string, string>): Promise<T> {
    const client = await this.connect();
    const url = `${CONNECT_API_BASE}${this.config.domain}${path}`;
    return client.get<T>(url, params ? { params } : undefined);
  }
}
