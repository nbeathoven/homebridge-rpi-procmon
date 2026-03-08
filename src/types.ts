import type { PlatformConfig } from "homebridge";

export interface ProcmonPlatformConfig extends PlatformConfig {
  endpoint?: string;
  pollIntervalSeconds?: number;
  requestTimeoutMs?: number;
  exposeOverallSensor?: boolean;
  exposeDisabledMonitors?: boolean;
  hideHealthyMonitors?: boolean;
  includeMonitors?: string[];
  excludeMonitors?: string[];
}

export interface NormalizedConfig {
  name: string;
  endpoint: string;
  pollIntervalSeconds: number;
  requestTimeoutMs: number;
  exposeOverallSensor: boolean;
  exposeDisabledMonitors: boolean;
  hideHealthyMonitors: boolean;
  includeMonitors: Set<string>;
  excludeMonitors: Set<string>;
}

export interface ProcmonStatus {
  app_version: string;
  overall_status: string;
  monitor_count: number;
  healthy_count: number;
  degraded_count: number;
  recovering_count: number;
  failed_count: number;
  disabled_count: number;
  last_updated_at: string;
  monitors: ProcmonMonitorState[];
}

export interface ProcmonMonitorState {
  id: string;
  name: string;
  type: string;
  enabled: boolean;
  status: string;
  metadata?: Record<string, string>;
  configured_checks?: ProcmonCheck[];
  last_error?: string;
  last_failure_reasons?: string[];
  next_check_at?: string;
}

export interface ProcmonCheck {
  id: string;
  type: string;
  container?: string;
  command?: string;
}

export type MonitorRole = "service" | "container" | "plugin" | "monitor";

export type AccessoryContext =
  | {
      kind: "overall";
      label?: string;
    }
  | {
      kind: "monitor";
      monitorId: string;
      role?: MonitorRole;
      label?: string;
    };
