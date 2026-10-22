import type {
  API,
  DynamicPlatformPlugin,
  Logger,
  PlatformAccessory,
  PlatformConfig,
} from "homebridge";

import { monitorDisplayName, normalizeConfig, overallDisplayName, selectVisibleMonitors } from "./config";
import { MonitorSensorAccessory } from "./accessories/monitor-sensor-accessory";
import { OverallSensorAccessory } from "./accessories/overall-sensor-accessory";
import { ProcmonClient, validateStatus } from "./procmon-client";
import { monitorHealth } from "./monitor-health";
import { PLATFORM_NAME, PLUGIN_NAME } from "./settings";
import type { AccessoryContext, CompletedMonitorState, NormalizedConfig, ProcmonMonitorState, ProcmonPlatformConfig, ProcmonStatus } from "./types";

const OVERALL_ACCESSORY_ID = "overall";
const configuredAPIs = new WeakSet<API>();

export class ProcmonPlatform implements DynamicPlatformPlugin {
  public readonly normalizedConfig: NormalizedConfig;

  private readonly accessories = new Map<string, PlatformAccessory<AccessoryContext>>();
  private readonly client: ProcmonClient;
  private refreshTimer?: NodeJS.Timeout;
  private refreshInFlight = false;
  private readonly completedStates = new Map<string, CompletedMonitorState>();
  private readonly monitorHealthStates = new Map<string, ReturnType<typeof monitorHealth>>();
  private readonly diagnosticStates = new Map<string, string>();
  private hasAcceptedSnapshot = false;
  private pollFailed = false;

  constructor(
    public readonly log: Logger,
    config: PlatformConfig,
    public readonly api: API,
  ) {
    if (configuredAPIs.has(api)) {
      throw new Error(`${PLUGIN_NAME} supports only one platform instance per Homebridge API to preserve accessory UUIDs`);
    }
    configuredAPIs.add(api);
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
    if (accessory.context.kind === "monitor" && accessory.context.completedState) {
      this.completedStates.set(accessory.context.monitorId, accessory.context.completedState);
    }
    const { Service, Characteristic } = this.api.hap;
    accessory.getService(Service.ContactSensor)
      ?.setCharacteristic(Characteristic.StatusActive, false)
      .setCharacteristic(Characteristic.StatusFault, Characteristic.StatusFault.GENERAL_FAULT);
  }

  private async refresh(): Promise<void> {
    if (this.refreshInFlight) {
      return;
    }

    this.refreshInFlight = true;
    try {
      const snapshot = await this.client.fetchStatus();
      validateStatus(snapshot);
      this.monitorHealthStates.clear();
      const liveIds = new Set(snapshot.monitors.map((monitor) => monitor.id));
      for (const id of this.completedStates.keys()) {
        if (!liveIds.has(id)) {
          this.completedStates.delete(id);
        }
      }
      for (const id of this.diagnosticStates.keys()) {
        if (!liveIds.has(id)) {
          this.diagnosticStates.delete(id);
        }
      }
      for (const monitor of snapshot.monitors) {
        const health = monitorHealth(monitor, this.completedStates.get(monitor.id));
        this.monitorHealthStates.set(monitor.id, health);
        if (health.completedState) {
          this.completedStates.set(monitor.id, health.completedState);
        } else {
          this.completedStates.delete(monitor.id);
        }
      }
      this.syncOverallAccessory(snapshot);
      const exposedIds = new Set<string>();
      for (const accessory of this.accessories.values()) {
        if (accessory.context.kind === "monitor") {
          exposedIds.add(accessory.context.monitorId);
        }
      }
      this.syncMonitorAccessories(snapshot, selectVisibleMonitors(snapshot, this.normalizedConfig, exposedIds));
      if (!this.hasAcceptedSnapshot || this.pollFailed) {
        const attention = [...this.monitorHealthStates.values()].filter((health) => health.needsAttention).length;
        this.log.info(`procmon ${this.hasAcceptedSnapshot ? "connection restored" : "first snapshot accepted"}: ` +
          `monitors=${snapshot.monitor_count} attention=${attention} accessories=${this.accessories.size}`);
      }
      for (const monitor of snapshot.monitors) {
        const health = this.getMonitorHealth(monitor);
        const diagnostic = JSON.stringify({
          status: monitor.status,
          active: health.active,
          attention: health.needsAttention,
          target: monitor.target?.host,
          transport: monitor.target?.transport,
          error: monitor.last_error,
          reasons: monitor.last_failure_reasons,
        });
        if (this.diagnosticStates.get(monitor.id) !== diagnostic && health.needsAttention) {
          this.log.debug(`procmon monitor ${JSON.stringify(monitor.id)} requires attention: ${diagnostic}`);
        }
        this.diagnosticStates.set(monitor.id, diagnostic);
      }
      this.hasAcceptedSnapshot = true;
      this.pollFailed = false;
    } catch (error) {
      this.pollFailed = true;
      const { Service, Characteristic } = this.api.hap;
      for (const accessory of this.accessories.values()) {
        // A transport failure is not evidence that the monitored service failed.
        accessory.getService(Service.ContactSensor)
          ?.setCharacteristic(Characteristic.StatusActive, false)
          .setCharacteristic(Characteristic.StatusFault, Characteristic.StatusFault.GENERAL_FAULT);
      }
      this.log.warn(`procmon refresh failed: ${String(error)}`);
    } finally {
      this.refreshInFlight = false;
    }
  }

  public getMonitorHealth(monitor: ProcmonMonitorState): ReturnType<typeof monitorHealth> {
    return this.monitorHealthStates.get(monitor.id) ?? monitorHealth(monitor, this.completedStates.get(monitor.id));
  }

  private monitorUUID(id: string): string {
    // A separate namespace separator cannot collide with legacy colon-prefixed IDs.
    return this.api.hap.uuid.generate(id === "overall" ? `${PLUGIN_NAME}\0monitor:overall` : `${PLUGIN_NAME}:${id}`);
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
      overallDisplayName(this.normalizedConfig.name),
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
      const uuid = this.monitorUUID(monitor.id);
      liveUUIDs.add(uuid);
      const existing = this.accessories.get(uuid);

      if (existing) {
        new MonitorSensorAccessory(this, existing, monitor);
        this.api.updatePlatformAccessories([existing]);
        continue;
      }

      const accessory = new this.api.platformAccessory<AccessoryContext>(
        monitorDisplayName(monitor),
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
