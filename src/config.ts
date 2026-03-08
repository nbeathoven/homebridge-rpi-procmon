import type { Logger } from "homebridge";

import type {
  MonitorRole,
  NormalizedConfig,
  ProcmonMonitorState,
  ProcmonPlatformConfig,
  ProcmonStatus,
} from "./types";

const DEFAULT_ENDPOINT = "http://127.0.0.1:9645";
const DEFAULT_POLL_INTERVAL_SECONDS = 15;
const DEFAULT_TIMEOUT_MS = 4000;

export function normalizeConfig(config: ProcmonPlatformConfig, log: Logger): NormalizedConfig {
  const endpoint = normalizeEndpoint(config.endpoint ?? DEFAULT_ENDPOINT);
  const pollIntervalSeconds = clampInteger(config.pollIntervalSeconds, DEFAULT_POLL_INTERVAL_SECONDS, 5, 300);
  const requestTimeoutMs = clampInteger(config.requestTimeoutMs, DEFAULT_TIMEOUT_MS, 1000, 30000);

  if (config.endpoint && endpoint !== config.endpoint.replace(/\/+$/, "")) {
    log.debug(`normalized endpoint to ${endpoint}`);
  }

  return {
    name: cleanString(config.name) || "Rpi Procmon",
    endpoint,
    pollIntervalSeconds,
    requestTimeoutMs,
    exposeOverallSensor: config.exposeOverallSensor !== false,
    exposeDisabledMonitors: config.exposeDisabledMonitors === true,
    hideHealthyMonitors: config.hideHealthyMonitors === true,
    includeMonitors: new Set(cleanStringArray(config.includeMonitors)),
    excludeMonitors: new Set(cleanStringArray(config.excludeMonitors)),
  };
}

export function selectVisibleMonitors(snapshot: ProcmonStatus, config: NormalizedConfig): ProcmonMonitorState[] {
  return (snapshot.monitors || []).filter((monitor) => {
    if (!config.exposeDisabledMonitors && (!monitor.enabled || monitor.status === "disabled")) {
      return false;
    }
    if (config.includeMonitors.size > 0 && !config.includeMonitors.has(monitor.id)) {
      return false;
    }
    if (config.excludeMonitors.has(monitor.id)) {
      return false;
    }
    if (config.hideHealthyMonitors && isHealthyMonitor(monitor.status)) {
      return false;
    }
    return true;
  });
}

export function overallNeedsAttention(status: string): boolean {
  return !["healthy", "recovering"].includes(status);
}

export function monitorNeedsAttention(status: string): boolean {
  return !["healthy"].includes(status);
}

export function overallDisplayName(name: string): string {
  return `${name} Supervisor`;
}

export function monitorDisplayName(monitor: ProcmonMonitorState): string {
  const role = monitorRole(monitor);
  const rawName = cleanMonitorName(monitor.name || monitor.id);

  switch (role) {
    case "service":
      return `Service: ${trimRoleSuffix(rawName, / service$/i)}`;
    case "container":
      return `Container: ${trimRoleSuffix(rawName, / container$/i)}`;
    case "plugin":
      return `Plugin: ${rawName}`;
    default:
      return `Monitor: ${rawName}`;
  }
}

export function monitorRole(monitor: ProcmonMonitorState): MonitorRole {
  switch (monitor.type) {
    case "systemd-service":
      return "service";
    case "docker-container":
      return "container";
    case "docker-log":
      return "plugin";
    default:
      return "monitor";
  }
}

function isHealthyMonitor(status: string): boolean {
  return status === "healthy";
}

function normalizeEndpoint(value: string): string {
  const trimmed = cleanString(value);
  if (!trimmed) {
    return DEFAULT_ENDPOINT;
  }
  return trimmed.replace(/\/+$/, "");
}

function cleanString(value: string | undefined): string {
  return (value ?? "").trim();
}

function cleanMonitorName(value: string): string {
  const trimmed = cleanString(value);
  if (!trimmed) {
    return "Unnamed";
  }
  return trimmed.replace(/^service:\s*/i, "").replace(/^container:\s*/i, "").replace(/^plugin:\s*/i, "");
}

function trimRoleSuffix(value: string, suffix: RegExp): string {
  const trimmed = value.replace(suffix, "").trim();
  return trimmed || value;
}

function cleanStringArray(values: string[] | undefined): string[] {
  return (values ?? []).map((value) => value.trim()).filter(Boolean);
}

function clampInteger(value: number | undefined, fallback: number, min: number, max: number): number {
  if (!Number.isInteger(value)) {
    return fallback;
  }
  const normalized = value as number;
  return Math.min(Math.max(normalized, min), max);
}
