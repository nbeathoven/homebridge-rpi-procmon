import type {
  API,
  DynamicPlatformPlugin,
  Logger,
  PlatformAccessory,
  PlatformConfig,
} from "homebridge";

import { normalizeConfig, selectVisibleMonitors } from "./config";
import { MonitorSensorAccessory } from "./accessories/monitor-sensor-accessory";
import { OverallSensorAccessory } from "./accessories/overall-sensor-accessory";
import { ProcmonClient } from "./procmon-client";
import { PLATFORM_NAME, PLUGIN_NAME } from "./settings";
import type { AccessoryContext, NormalizedConfig, ProcmonMonitorState, ProcmonPlatformConfig, ProcmonStatus } from "./types";

const OVERALL_ACCESSORY_ID = "overall";

export class ProcmonPlatform implements DynamicPlatformPlugin {
  public readonly normalizedConfig: NormalizedConfig;

  private readonly accessories = new Map<string, PlatformAccessory<AccessoryContext>>();
  private readonly client: ProcmonClient;
  private refreshTimer?: NodeJS.Timeout;
  private refreshInFlight = false;

  constructor(
    public readonly log: Logger,
    config: PlatformConfig,
    public readonly api: API,
  ) {
    this.normalizedConfig = normalizeConfig(config as ProcmonPlatformConfig, this.log);
    this.client = new ProcmonClient(
      this.normalizedConfig.endpoint,
      this.normalizedConfig.requestTimeoutMs,
      this.log,
    );

    this.api.on("didFinishLaunching", () => {
      this.log.info(`starting ${PLUGIN_NAME} against ${this.normalizedConfig.endpoint}`);
      void this.refresh();
      this.refreshTimer = setInterval(() => {
        void this.refresh();
      }, this.normalizedConfig.pollIntervalSeconds * 1000);
    });

    this.api.on("shutdown", () => {
      if (this.refreshTimer) {
        clearInterval(this.refreshTimer);
      }
    });
  }

  configureAccessory(accessory: PlatformAccessory<AccessoryContext>): void {
    this.accessories.set(accessory.UUID, accessory);
  }

  private async refresh(): Promise<void> {
    if (this.refreshInFlight) {
      return;
    }

    this.refreshInFlight = true;
    try {
      const snapshot = await this.client.fetchStatus();
      this.syncOverallAccessory(snapshot);
      this.syncMonitorAccessories(snapshot, selectVisibleMonitors(snapshot, this.normalizedConfig));
    } catch (error) {
      this.log.warn(`procmon refresh failed: ${String(error)}`);
    } finally {
      this.refreshInFlight = false;
    }
  }

  private syncOverallAccessory(snapshot: ProcmonStatus): void {
    const uuid = this.api.hap.uuid.generate(`${PLUGIN_NAME}:${OVERALL_ACCESSORY_ID}`);

    if (!this.normalizedConfig.exposeOverallSensor) {
      this.removeAccessoryIfPresent(uuid);
      return;
    }

    const existing = this.accessories.get(uuid);
    if (existing) {
      new OverallSensorAccessory(this, existing, snapshot);
      this.api.updatePlatformAccessories([existing]);
      return;
    }

    const accessory = new this.api.platformAccessory<AccessoryContext>(
      `${this.normalizedConfig.name} Fault`,
      uuid,
    );
    new OverallSensorAccessory(this, accessory, snapshot);
    this.accessories.set(uuid, accessory);
    this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
  }

  private syncMonitorAccessories(snapshot: ProcmonStatus, monitors: ProcmonMonitorState[]): void {
    const liveUUIDs = new Set<string>();
    if (this.normalizedConfig.exposeOverallSensor) {
      liveUUIDs.add(this.api.hap.uuid.generate(`${PLUGIN_NAME}:${OVERALL_ACCESSORY_ID}`));
    }

    for (const monitor of monitors) {
      const uuid = this.api.hap.uuid.generate(`${PLUGIN_NAME}:${monitor.id}`);
      liveUUIDs.add(uuid);
      const existing = this.accessories.get(uuid);

      if (existing) {
        new MonitorSensorAccessory(this, existing, monitor);
        this.api.updatePlatformAccessories([existing]);
        continue;
      }

      const accessory = new this.api.platformAccessory<AccessoryContext>(
        `${monitor.name || monitor.id} Issue`,
        uuid,
      );
      new MonitorSensorAccessory(this, accessory, monitor);
      this.accessories.set(uuid, accessory);
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
    }

    for (const [uuid, accessory] of this.accessories.entries()) {
      if (liveUUIDs.has(uuid)) {
        continue;
      }
      if (accessory.context.kind === "monitor" || accessory.context.kind === "overall") {
        this.accessories.delete(uuid);
        this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      }
    }

    this.log.debug(
      `procmon sync complete: overall=${snapshot.overall_status} exposed_monitors=${monitors.length}`,
    );
  }

  private removeAccessoryIfPresent(uuid: string): void {
    const accessory = this.accessories.get(uuid);
    if (!accessory) {
      return;
    }
    this.accessories.delete(uuid);
    this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
  }
}
