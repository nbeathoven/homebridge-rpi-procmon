import type { Logger } from "homebridge";

import type { ProcmonStatus } from "./types";

export class ProcmonClient {
  constructor(
    private readonly endpoint: string,
    private readonly timeoutMs: number,
    private readonly log: Logger,
  ) {}

  async fetchStatus(): Promise<ProcmonStatus> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(`${this.endpoint}/status`, {
        headers: {
          Accept: "application/json",
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`GET /status failed with ${response.status} ${response.statusText}`);
      }

      const payload: unknown = await response.json();
      validateStatus(payload);
      return payload;
    } catch (error) {
      this.log.debug(`procmon request failed: ${String(error)}`);
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}

export function validateStatus(value: unknown): asserts value is ProcmonStatus {
  if (!isRecord(value) || typeof value.overall_status !== "string" || !value.overall_status.trim() ||
      !Array.isArray(value.monitors) || !Number.isInteger(value.monitor_count) ||
      value.monitor_count !== value.monitors.length) {
    throw new Error("Invalid procmon status snapshot");
  }
  const ids = new Set<string>();
  for (const monitor of value.monitors) {
    if (!isRecord(monitor) || typeof monitor.id !== "string" || !monitor.id.trim() ||
        ids.has(monitor.id) || typeof monitor.name !== "string" ||
        typeof monitor.type !== "string" || typeof monitor.enabled !== "boolean" ||
        typeof monitor.status !== "string" || !monitor.status.trim()) {
      throw new Error("Invalid procmon monitor snapshot");
    }
    for (const field of ["interval", "last_check_finished_at", "last_check_started_at"]) {
      if (monitor[field] !== undefined && typeof monitor[field] !== "string") {
        throw new Error(`Invalid procmon monitor ${field}`);
      }
    }
    if (monitor.last_error !== undefined && typeof monitor.last_error !== "string") {
      throw new Error("Invalid procmon monitor last_error");
    }
    if (monitor.last_failure_reasons !== undefined && (!Array.isArray(monitor.last_failure_reasons) ||
        !monitor.last_failure_reasons.every((reason) => typeof reason === "string"))) {
      throw new Error("Invalid procmon monitor last_failure_reasons");
    }
    if (monitor.target !== undefined) {
      if (!isRecord(monitor.target)) {
        throw new Error("Invalid procmon monitor target");
      }
      for (const field of ["transport", "host", "user", "identity_file"]) {
        if (monitor.target[field] !== undefined && typeof monitor.target[field] !== "string") {
          throw new Error(`Invalid procmon target ${field}`);
        }
      }
    }
    ids.add(monitor.id);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
