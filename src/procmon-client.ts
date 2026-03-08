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

      const payload = await response.json() as ProcmonStatus;
      payload.monitors ??= [];
      return payload;
    } catch (error) {
      this.log.debug(`procmon request failed: ${String(error)}`);
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}
