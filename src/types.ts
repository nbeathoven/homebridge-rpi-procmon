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
  interval?: string;
  target?: ProcmonTarget;
  last_check_started_at?: string;
  last_check_finished_at?: string;
  last_check_duration_ms?: number;
  last_check_results?: ProcmonCheckResult[];
  last_recovery_results?: ProcmonActionResult[];
  recovery_exhausted?: boolean;
  metadata?: Record<string, string>;
  configured_checks?: ProcmonCheck[];
  last_error?: string;
  last_failure_reasons?: string[];
  next_check_at?: string;
}

export interface ProcmonTarget {
  transport?: string;
  host?: string;
  fallback_hosts?: string[];
  user?: string;
  port?: number;
  identity_file?: string;
}

export interface ProcmonActionResult {
  name: string;
  type: string;
  success: boolean;
  message?: string;
  output?: string;
  started_at: string;
  finished_at: string;
  duration_ms: number;
}

export interface ProcmonCheckResult extends ProcmonActionResult {
  id: string;
  observations?: Record<string, unknown>;
}

export interface CompletedMonitorState {
  needsAttention: boolean;
  finishedAt?: string;
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
      completedState?: CompletedMonitorState;
      role?: MonitorRole;
      label?: string;
    };
