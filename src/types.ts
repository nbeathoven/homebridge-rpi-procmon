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
  last_error?: string;
  last_failure_reasons?: string[];
  next_check_at?: string;
}

export type AccessoryContext =
  | {
      kind: "overall";
    }
  | {
      kind: "monitor";
      monitorId: string;
    };
