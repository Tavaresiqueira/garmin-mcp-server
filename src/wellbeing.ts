import { secondsToHours, toIsoDate } from "./date.js";
import type { GarminClient } from "./garmin-client.js";

type JsonObject = Record<string, unknown>;

export interface SleepSummary {
  sleepHours: number | null;
  sleepScore: number | null;
  hrvStatus: string | null;
  avgOvernightHrv: number | null;
  bodyBatteryChange: number | null;
  restingHeartRate: number | null;
  avgSleepStress: number | null;
}

export interface BodyBatterySummary {
  current: number | null;
  atWake: number | null;
  highest: number | null;
  lowest: number | null;
  charged: number | null;
  drained: number | null;
  duringSleep: number | null;
}

export interface TrainingReadinessSummary {
  score: number | null;
  level: string | null;
  sleepScore: number | null;
  recoveryTime: number | null;
  acuteLoad: number | null;
  hrvFactorPercent: number | null;
  stressHistoryFactorPercent: number | null;
}

export interface WellbeingSnapshot {
  date: string;
  sleep: SleepSummary;
  bodyBattery: BodyBatterySummary;
  trainingReadiness: TrainingReadinessSummary | null;
  trainingStatus: JsonObject | null;
  steps: number | null;
  stress: {
    averageStress: number | null;
    maxStress: number | null;
  };
  recommendation: WorkloadRecommendation;
  raw?: {
    dailySummary?: JsonObject;
    sleep?: JsonObject;
    stress?: JsonObject;
    hrv?: JsonObject | null;
    trainingReadiness?: JsonObject[];
    trainingStatus?: JsonObject;
  };
}

export interface WorkloadRecommendation {
  load: "normal" | "reduced" | "minimal" | "recovery";
  ticketLimit: number;
  message: string;
  reasons: string[];
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function objectOrNull(value: unknown): JsonObject | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonObject) : null;
}

function latestBodyBattery(stressData: JsonObject): number | null {
  const values = stressData.bodyBatteryValuesArray;
  if (!Array.isArray(values)) {
    return null;
  }

  for (let index = values.length - 1; index >= 0; index -= 1) {
    const entry = values[index];
    if (Array.isArray(entry) && typeof entry[1] === "number") {
      return entry[1];
    }
  }

  return null;
}

function summarizeSleep(sleep: JsonObject): SleepSummary {
  const dailySleep = objectOrNull(sleep.dailySleepDTO) ?? {};
  const sleepScores = objectOrNull(dailySleep.sleepScores) ?? {};
  const overall = objectOrNull(sleepScores.overall) ?? {};

  return {
    sleepHours: secondsToHours(dailySleep.sleepTimeSeconds),
    sleepScore: numberOrNull(overall.value),
    hrvStatus: stringOrNull(sleep.hrvStatus),
    avgOvernightHrv: numberOrNull(sleep.avgOvernightHrv),
    bodyBatteryChange: numberOrNull(sleep.bodyBatteryChange),
    restingHeartRate: numberOrNull(sleep.restingHeartRate),
    avgSleepStress: numberOrNull(dailySleep.avgSleepStress),
  };
}

function summarizeBodyBattery(dailySummary: JsonObject, stressData: JsonObject): BodyBatterySummary {
  return {
    current: latestBodyBattery(stressData),
    atWake: numberOrNull(dailySummary.bodyBatteryAtWakeTime),
    highest: numberOrNull(dailySummary.bodyBatteryHighestValue),
    lowest: numberOrNull(dailySummary.bodyBatteryLowestValue),
    charged: numberOrNull(dailySummary.bodyBatteryChargedValue),
    drained: numberOrNull(dailySummary.bodyBatteryDrainedValue),
    duringSleep: numberOrNull(dailySummary.bodyBatteryDuringSleep),
  };
}

function summarizeTrainingReadiness(entries: JsonObject[]): TrainingReadinessSummary | null {
  const selected = entries.find((entry) => entry.inputContext === "AFTER_WAKEUP_RESET") ?? entries[0];
  if (!selected) {
    return null;
  }

  return {
    score: numberOrNull(selected.score),
    level: stringOrNull(selected.level),
    sleepScore: numberOrNull(selected.sleepScore),
    recoveryTime: numberOrNull(selected.recoveryTime),
    acuteLoad: numberOrNull(selected.acuteLoad),
    hrvFactorPercent: numberOrNull(selected.hrvFactorPercent),
    stressHistoryFactorPercent: numberOrNull(selected.stressHistoryFactorPercent),
  };
}

export function recommendWorkload(snapshot: Omit<WellbeingSnapshot, "recommendation">): WorkloadRecommendation {
  const reasons: string[] = [];
  let risk = 0;

  if (snapshot.sleep.sleepHours !== null && snapshot.sleep.sleepHours < 5) {
    risk += 3;
    reasons.push(`sleep was ${snapshot.sleep.sleepHours}h`);
  } else if (snapshot.sleep.sleepHours !== null && snapshot.sleep.sleepHours < 6.5) {
    risk += 1;
    reasons.push(`sleep was only ${snapshot.sleep.sleepHours}h`);
  }

  if (snapshot.sleep.sleepScore !== null && snapshot.sleep.sleepScore < 50) {
    risk += 2;
    reasons.push(`sleep score is ${snapshot.sleep.sleepScore}`);
  }

  if (snapshot.bodyBattery.current !== null && snapshot.bodyBattery.current < 30) {
    risk += 3;
    reasons.push(`Body Battery is ${snapshot.bodyBattery.current}`);
  } else if (snapshot.bodyBattery.current !== null && snapshot.bodyBattery.current < 50) {
    risk += 1;
    reasons.push(`Body Battery is ${snapshot.bodyBattery.current}`);
  }

  if (snapshot.trainingReadiness?.score !== null && snapshot.trainingReadiness?.score !== undefined) {
    if (snapshot.trainingReadiness.score < 40) {
      risk += 3;
      reasons.push(`training readiness is ${snapshot.trainingReadiness.score}`);
    } else if (snapshot.trainingReadiness.score < 60) {
      risk += 1;
      reasons.push(`training readiness is ${snapshot.trainingReadiness.score}`);
    }
  }

  if (snapshot.sleep.hrvStatus && !["BALANCED", "BALANCE"].includes(snapshot.sleep.hrvStatus.toUpperCase())) {
    risk += 1;
    reasons.push(`HRV status is ${snapshot.sleep.hrvStatus}`);
  }

  if (risk >= 6) {
    return {
      load: "recovery",
      ticketLimit: 1,
      message: "Recovery signals are weak. Take one small, low-risk task and postpone deep or irreversible work.",
      reasons,
    };
  }

  if (risk >= 4) {
    return {
      load: "minimal",
      ticketLimit: 2,
      message: "Keep scope tight today. Do one or two tickets, avoid late-day expansion, and leave complex work queued.",
      reasons,
    };
  }

  if (risk >= 2) {
    return {
      load: "reduced",
      ticketLimit: 3,
      message: "Use a reduced plan: prioritize the highest-value tasks and add explicit stopping points.",
      reasons,
    };
  }

  return {
    load: "normal",
    ticketLimit: 5,
    message: "Recovery signals look workable. Keep normal planning, with breaks and a clear end condition.",
    reasons: reasons.length > 0 ? reasons : ["no major recovery warning signals found"],
  };
}

export async function getWellbeingSnapshot(
  garmin: GarminClient,
  date: Date,
  includeRaw = false,
): Promise<WellbeingSnapshot> {
  const dateIso = toIsoDate(date);
  const [dailySummary, sleep, stress, hrv, trainingReadiness, trainingStatus] = await Promise.all([
    garmin.getDailySummary(dateIso),
    garmin.getSleepData(date),
    garmin.getStressData(dateIso),
    garmin.getHrvData(dateIso).catch(() => null),
    garmin.getTrainingReadiness(dateIso).catch(() => []),
    garmin.getTrainingStatus(dateIso).catch(() => ({})),
  ]);

  const withoutRecommendation = {
    date: dateIso,
    sleep: summarizeSleep({ ...sleep, ...(hrv ? { hrvData: hrv } : {}) }),
    bodyBattery: summarizeBodyBattery(dailySummary, stress),
    trainingReadiness: summarizeTrainingReadiness(trainingReadiness),
    trainingStatus,
    steps: numberOrNull(dailySummary.totalSteps),
    stress: {
      averageStress: numberOrNull(dailySummary.averageStressLevel),
      maxStress: numberOrNull(dailySummary.maxStressLevel),
    },
    ...(includeRaw
      ? {
          raw: {
            dailySummary,
            sleep,
            stress,
            hrv,
            trainingReadiness,
            trainingStatus,
          },
        }
      : {}),
  };

  return {
    ...withoutRecommendation,
    recommendation: recommendWorkload(withoutRecommendation),
  };
}
