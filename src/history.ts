import { addDays, dateRangeEndingOn, secondsToHours, toIsoDate } from "./date.js";
import type { GarminClient } from "./garmin-client.js";

type JsonObject = Record<string, unknown>;

interface HistoricalMetricDay {
  date: string;
  sleepHours: number | null;
  sleepScore: number | null;
  avgOvernightHrv: number | null;
  averageStress: number | null;
  trainingReadiness: number | null;
  bodyBatteryAtWake: number | null;
}

interface MetricSummary {
  average: number | null;
  minimum: number | null;
  maximum: number | null;
  sampleCount: number;
}

interface TrendMetric {
  averageShortWindow: number | null;
  averageLongWindow: number | null;
  previousShortWindowAverage: number | null;
  deltaVsPreviousShortWindow: number | null;
  trend: "up" | "down" | "flat" | "unknown";
}

export interface TrainingLoadTrend {
  date: string;
  windows: {
    shortDays: number;
    longDays: number;
  };
  sampleCoverage: {
    shortWindowDays: number;
    longWindowDays: number;
  };
  metrics: {
    sleepHours: TrendMetric;
    avgOvernightHrv: TrendMetric;
    averageStress: TrendMetric;
    trainingReadiness: TrendMetric;
    bodyBatteryAtWake: TrendMetric;
  };
  interpretation: string;
}

export interface BaselineMetricProfile extends MetricSummary {
  lowerQuartile: number | null;
  upperQuartile: number | null;
}

export interface BaselineProfile {
  date: string;
  windowDays: number;
  sampleCount: number;
  metrics: {
    sleepHours: BaselineMetricProfile;
    sleepScore: BaselineMetricProfile;
    avgOvernightHrv: BaselineMetricProfile;
    averageStress: BaselineMetricProfile;
    trainingReadiness: BaselineMetricProfile;
    bodyBatteryAtWake: BaselineMetricProfile;
  };
}

export interface ChangeAlert {
  metric: string;
  severity: "info" | "warning" | "critical";
  direction: "up" | "down";
  summary: string;
}

export interface ChangeAlertsReport {
  date: string;
  comparisonDate: string;
  baselineWindowDays: number;
  current: HistoricalMetricDay;
  previous: HistoricalMetricDay | null;
  baseline: BaselineProfile;
  alerts: ChangeAlert[];
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function objectOrNull(value: unknown): JsonObject | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonObject) : null;
}

function round(value: number | null, digits = 1): number | null {
  if (value === null) {
    return null;
  }

  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function average(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function quantile(sortedValues: number[], ratio: number): number | null {
  if (sortedValues.length === 0) {
    return null;
  }

  const index = (sortedValues.length - 1) * ratio;
  const lowerIndex = Math.floor(index);
  const upperIndex = Math.ceil(index);
  const lower = sortedValues[lowerIndex];
  const upper = sortedValues[upperIndex];

  if (lower === undefined || upper === undefined) {
    return null;
  }

  if (lowerIndex === upperIndex) {
    return lower;
  }

  return lower + (upper - lower) * (index - lowerIndex);
}

function summarizeMetric(values: Array<number | null>): MetricSummary {
  const clean = values.filter((value): value is number => value !== null).sort((left, right) => left - right);
  return {
    average: round(average(clean)),
    minimum: clean.length > 0 ? round(clean[0]) : null,
    maximum: clean.length > 0 ? round(clean[clean.length - 1]) : null,
    sampleCount: clean.length,
  };
}

function summarizeBaselineMetric(values: Array<number | null>): BaselineMetricProfile {
  const clean = values.filter((value): value is number => value !== null).sort((left, right) => left - right);
  const summary = summarizeMetric(values);

  return {
    ...summary,
    lowerQuartile: round(quantile(clean, 0.25)),
    upperQuartile: round(quantile(clean, 0.75)),
  };
}

function compareDirection(
  currentValue: number | null,
  previousValue: number | null,
): "up" | "down" | "flat" | "unknown" {
  if (currentValue === null || previousValue === null) {
    return "unknown";
  }

  const delta = currentValue - previousValue;
  if (Math.abs(delta) < 0.1) {
    return "flat";
  }

  return delta > 0 ? "up" : "down";
}

function buildTrendMetric(
  recentValues: Array<number | null>,
  longValues: Array<number | null>,
  previousValues: Array<number | null>,
): TrendMetric {
  const average7d = summarizeMetric(recentValues).average;
  const average28d = summarizeMetric(longValues).average;
  const previous7dAverage = summarizeMetric(previousValues).average;
  const deltaVsPrevious7d =
    average7d !== null && previous7dAverage !== null ? round(average7d - previous7dAverage) : null;

  return {
    averageShortWindow: average7d,
    averageLongWindow: average28d,
    previousShortWindowAverage: previous7dAverage,
    deltaVsPreviousShortWindow: deltaVsPrevious7d,
    trend: compareDirection(average7d, previous7dAverage),
  };
}

function describeTrend(metricLabel: string, metric: TrendMetric, higherIsBetter: boolean): string | null {
  if (metric.trend === "unknown" || metric.deltaVsPreviousShortWindow === null) {
    return null;
  }

  if (metric.trend === "flat") {
    return `${metricLabel} is stable versus the previous week`;
  }

  const movedPositive = metric.deltaVsPreviousShortWindow > 0;
  const favorable = higherIsBetter ? movedPositive : !movedPositive;
  const directionWord = favorable ? "improving" : "worsening";

  return `${metricLabel} is ${directionWord} versus the previous week`;
}

function buildInterpretation(metrics: TrainingLoadTrend["metrics"]): string {
  const parts = [
    describeTrend("sleep", metrics.sleepHours, true),
    describeTrend("HRV", metrics.avgOvernightHrv, true),
    describeTrend("stress", metrics.averageStress, false),
    describeTrend("training readiness", metrics.trainingReadiness, true),
    describeTrend("Body Battery at wake", metrics.bodyBatteryAtWake, true),
  ].filter((part): part is string => part !== null);

  if (parts.length === 0) {
    return "Trend data is incomplete. Garmin did not return enough historical samples to infer direction.";
  }

  return parts.join("; ") + ".";
}

async function fetchHistoricalMetricDay(garmin: GarminClient, date: Date): Promise<HistoricalMetricDay> {
  const dateIso = toIsoDate(date);
  const [dailySummary, sleep, trainingReadiness] = await Promise.all([
    garmin.getDailySummary(dateIso).catch(() => ({} as JsonObject)),
    garmin.getSleepData(date).catch(() => ({} as JsonObject)),
    garmin.getTrainingReadiness(dateIso).catch(() => [] as JsonObject[]),
  ]);

  const dailySleep = objectOrNull(sleep.dailySleepDTO) ?? {};
  const sleepScores = objectOrNull(dailySleep.sleepScores) ?? {};
  const overall = objectOrNull(sleepScores.overall) ?? {};
  const readinessEntry = trainingReadiness.find((entry) => entry.inputContext === "AFTER_WAKEUP_RESET") ?? trainingReadiness[0];

  return {
    date: dateIso,
    sleepHours: secondsToHours(dailySleep.sleepTimeSeconds),
    sleepScore: numberOrNull(overall.value),
    avgOvernightHrv: numberOrNull(sleep.avgOvernightHrv),
    averageStress: numberOrNull(dailySummary.averageStressLevel),
    trainingReadiness: readinessEntry ? numberOrNull(readinessEntry.score) : null,
    bodyBatteryAtWake: numberOrNull(dailySummary.bodyBatteryAtWakeTime),
  };
}

async function mapWithConcurrency<TInput, TOutput>(
  values: TInput[],
  concurrency: number,
  mapper: (value: TInput) => Promise<TOutput>,
): Promise<TOutput[]> {
  const results: TOutput[] = new Array(values.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < values.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await mapper(values[currentIndex]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, () => worker()));
  return results;
}

export async function getHistoricalMetricDays(
  garmin: GarminClient,
  endDate: Date,
  days: number,
): Promise<HistoricalMetricDay[]> {
  const dates = dateRangeEndingOn(endDate, days);
  return mapWithConcurrency(dates, 4, (date) => fetchHistoricalMetricDay(garmin, date));
}

export async function getTrainingLoadTrend(
  garmin: GarminClient,
  date: Date,
  shortDays = 7,
  longDays = 28,
): Promise<TrainingLoadTrend> {
  if (longDays < shortDays) {
    throw new Error("The long trend window must be greater than or equal to the short trend window.");
  }

  const history = await getHistoricalMetricDays(garmin, date, longDays);
  const shortWindow = history.slice(-shortDays);
  const previousShortWindow = history.slice(Math.max(0, history.length - shortDays * 2), history.length - shortDays);

  const metrics = {
    sleepHours: buildTrendMetric(
      shortWindow.map((entry) => entry.sleepHours),
      history.map((entry) => entry.sleepHours),
      previousShortWindow.map((entry) => entry.sleepHours),
    ),
    avgOvernightHrv: buildTrendMetric(
      shortWindow.map((entry) => entry.avgOvernightHrv),
      history.map((entry) => entry.avgOvernightHrv),
      previousShortWindow.map((entry) => entry.avgOvernightHrv),
    ),
    averageStress: buildTrendMetric(
      shortWindow.map((entry) => entry.averageStress),
      history.map((entry) => entry.averageStress),
      previousShortWindow.map((entry) => entry.averageStress),
    ),
    trainingReadiness: buildTrendMetric(
      shortWindow.map((entry) => entry.trainingReadiness),
      history.map((entry) => entry.trainingReadiness),
      previousShortWindow.map((entry) => entry.trainingReadiness),
    ),
    bodyBatteryAtWake: buildTrendMetric(
      shortWindow.map((entry) => entry.bodyBatteryAtWake),
      history.map((entry) => entry.bodyBatteryAtWake),
      previousShortWindow.map((entry) => entry.bodyBatteryAtWake),
    ),
  };

  return {
    date: toIsoDate(date),
    windows: {
      shortDays,
      longDays,
    },
    sampleCoverage: {
      shortWindowDays: shortWindow.length,
      longWindowDays: history.length,
    },
    metrics,
    interpretation: buildInterpretation(metrics),
  };
}

export async function getBaselineProfile(
  garmin: GarminClient,
  date: Date,
  windowDays = 42,
): Promise<BaselineProfile> {
  const history = await getHistoricalMetricDays(garmin, date, windowDays);

  return {
    date: toIsoDate(date),
    windowDays,
    sampleCount: history.length,
    metrics: {
      sleepHours: summarizeBaselineMetric(history.map((entry) => entry.sleepHours)),
      sleepScore: summarizeBaselineMetric(history.map((entry) => entry.sleepScore)),
      avgOvernightHrv: summarizeBaselineMetric(history.map((entry) => entry.avgOvernightHrv)),
      averageStress: summarizeBaselineMetric(history.map((entry) => entry.averageStress)),
      trainingReadiness: summarizeBaselineMetric(history.map((entry) => entry.trainingReadiness)),
      bodyBatteryAtWake: summarizeBaselineMetric(history.map((entry) => entry.bodyBatteryAtWake)),
    },
  };
}

function formatNumber(value: number | null): string {
  return value === null ? "unknown" : String(round(value));
}

function createAlert(
  metric: string,
  severity: "info" | "warning" | "critical",
  direction: "up" | "down",
  summary: string,
): ChangeAlert {
  return { metric, severity, direction, summary };
}

function collectAlerts(
  current: HistoricalMetricDay,
  previous: HistoricalMetricDay | null,
  baseline: BaselineProfile,
): ChangeAlert[] {
  const currentHasRecoveryData = [
    current.sleepHours,
    current.sleepScore,
    current.avgOvernightHrv,
    current.averageStress,
    current.trainingReadiness,
    current.bodyBatteryAtWake,
  ].some((value) => value !== null);

  if (!currentHasRecoveryData) {
    return [
      createAlert(
        "overall",
        "info",
        "up",
        "Garmin has not populated recovery data for this date yet. Compare again after the morning sync completes.",
      ),
    ];
  }

  const alerts: ChangeAlert[] = [];

  const previousSleep = previous?.sleepHours ?? null;
  if (current.sleepHours !== null && previousSleep !== null) {
    const sleepDrop = current.sleepHours - previousSleep;
    if (sleepDrop <= -1.5) {
      alerts.push(
        createAlert(
          "sleepHours",
          sleepDrop <= -2.5 ? "critical" : "warning",
          "down",
          `Sleep dropped from ${formatNumber(previousSleep)}h to ${formatNumber(current.sleepHours)}h versus yesterday.`,
        ),
      );
    }
  }

  const baselineSleep = baseline.metrics.sleepHours.average;
  if (current.sleepHours !== null && baselineSleep !== null && current.sleepHours <= baselineSleep - 1.5) {
    alerts.push(
      createAlert(
        "sleepHours",
        current.sleepHours <= baselineSleep - 2.5 ? "critical" : "warning",
        "down",
        `Sleep is ${formatNumber(baselineSleep - current.sleepHours)}h below your ${baseline.windowDays}-day baseline.`,
      ),
    );
  }

  const baselineHrv = baseline.metrics.avgOvernightHrv.average;
  if (current.avgOvernightHrv !== null && baselineHrv !== null && current.avgOvernightHrv <= baselineHrv - 8) {
    alerts.push(
      createAlert(
        "avgOvernightHrv",
        current.avgOvernightHrv <= baselineHrv - 12 ? "critical" : "warning",
        "down",
        `Overnight HRV is ${formatNumber(baselineHrv - current.avgOvernightHrv)} below baseline.`,
      ),
    );
  }

  const baselineStress = baseline.metrics.averageStress.average;
  if (current.averageStress !== null && baselineStress !== null && current.averageStress >= baselineStress + 10) {
    alerts.push(
      createAlert(
        "averageStress",
        current.averageStress >= baselineStress + 18 ? "critical" : "warning",
        "up",
        `Average stress is ${formatNumber(current.averageStress - baselineStress)} above baseline.`,
      ),
    );
  }

  const baselineReadiness = baseline.metrics.trainingReadiness.average;
  if (
    current.trainingReadiness !== null &&
    baselineReadiness !== null &&
    current.trainingReadiness <= baselineReadiness - 15
  ) {
    alerts.push(
      createAlert(
        "trainingReadiness",
        current.trainingReadiness <= baselineReadiness - 25 ? "critical" : "warning",
        "down",
        `Training readiness is ${formatNumber(baselineReadiness - current.trainingReadiness)} below baseline.`,
      ),
    );
  }

  const baselineBattery = baseline.metrics.bodyBatteryAtWake.average;
  if (current.bodyBatteryAtWake !== null && baselineBattery !== null && current.bodyBatteryAtWake <= baselineBattery - 15) {
    alerts.push(
      createAlert(
        "bodyBatteryAtWake",
        current.bodyBatteryAtWake <= baselineBattery - 25 ? "critical" : "warning",
        "down",
        `Body Battery at wake is ${formatNumber(baselineBattery - current.bodyBatteryAtWake)} below baseline.`,
      ),
    );
  }

  if (alerts.length === 0) {
    alerts.push(
      createAlert(
        "overall",
        "info",
        "up",
        "No major recovery changes detected versus yesterday or your baseline window.",
      ),
    );
  }

  return alerts;
}

export async function getChangeAlerts(
  garmin: GarminClient,
  date: Date,
  baselineWindowDays = 28,
): Promise<ChangeAlertsReport> {
  const current = await fetchHistoricalMetricDay(garmin, date);
  const previousDate = addDays(date, -1);
  const previous = await fetchHistoricalMetricDay(garmin, previousDate).catch(() => null);
  const baselineEndDate = addDays(date, -1);
  const baseline = await getBaselineProfile(garmin, baselineEndDate, baselineWindowDays);

  return {
    date: toIsoDate(date),
    comparisonDate: toIsoDate(previousDate),
    baselineWindowDays,
    current,
    previous,
    baseline,
    alerts: collectAlerts(current, previous, baseline),
  };
}
