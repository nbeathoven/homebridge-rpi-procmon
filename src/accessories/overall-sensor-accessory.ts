import type { PlatformAccessory, Service } from "homebridge";

import type { ProcmonPlatform } from "../platform";
import { overallDisplayName } from "../config";
import type { ProcmonStatus } from "../types";

export class OverallSensorAccessory {
  private readonly informationService: Service;
  private readonly service: Service;

  constructor(
    private readonly platform: ProcmonPlatform,
    private readonly accessory: PlatformAccessory,
    snapshot: ProcmonStatus,
  ) {
    this.informationService =
      this.accessory.getService(this.platform.api.hap.Service.AccessoryInformation) ??
      this.accessory.addService(this.platform.api.hap.Service.AccessoryInformation);

    this.service =
      this.accessory.getService(this.platform.api.hap.Service.ContactSensor) ??
      this.accessory.addService(this.platform.api.hap.Service.ContactSensor);

    this.configureInformation();
    this.update(snapshot);
  }

  update(snapshot: ProcmonStatus): void {
    const health = snapshot.monitors.map((monitor) => this.platform.getMonitorHealth(monitor));
    const enabled = snapshot.monitors.some((monitor) => monitor.enabled && monitor.status !== "disabled");
    const needsAttention = enabled && health.some((monitor) => monitor.needsAttention);
    const sensorName = overallDisplayName(this.platform.normalizedConfig.name);

    this.accessory.displayName = sensorName;
    this.accessory.context = {
      kind: "overall",
      label: sensorName,
    };

    this.service.setCharacteristic(this.platform.api.hap.Characteristic.Name, sensorName);
    this.service.setCharacteristic(
      this.platform.api.hap.Characteristic.ContactSensorState,
      needsAttention
        ? this.platform.api.hap.Characteristic.ContactSensorState.CONTACT_NOT_DETECTED
        : this.platform.api.hap.Characteristic.ContactSensorState.CONTACT_DETECTED,
    );
    this.service.setCharacteristic(
      this.platform.api.hap.Characteristic.StatusActive,
      enabled && health.every((monitor, index) =>
        !snapshot.monitors[index].enabled || snapshot.monitors[index].status === "disabled" || monitor.active),
    );
    this.service.setCharacteristic(
      this.platform.api.hap.Characteristic.StatusFault,
      needsAttention
        ? this.platform.api.hap.Characteristic.StatusFault.GENERAL_FAULT
        : this.platform.api.hap.Characteristic.StatusFault.NO_FAULT,
    );
  }

  private configureInformation(): void {
    this.informationService
      .setCharacteristic(this.platform.api.hap.Characteristic.Manufacturer, "rpi-procmon")
      .setCharacteristic(this.platform.api.hap.Characteristic.Name, overallDisplayName(this.platform.normalizedConfig.name))
      .setCharacteristic(this.platform.api.hap.Characteristic.Model, "Procmon Supervisor Sensor")
      .setCharacteristic(this.platform.api.hap.Characteristic.SerialNumber, "overall");
  }
}
