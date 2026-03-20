import type { PlatformAccessory, Service } from "homebridge";

import type { ProcmonPlatform } from "../platform";
import { monitorDisplayName, monitorNeedsAttention, monitorRole } from "../config";
import type { ProcmonMonitorState } from "../types";

export class MonitorSensorAccessory {
  private readonly informationService: Service;
  private readonly service: Service;

  constructor(
    private readonly platform: ProcmonPlatform,
    private readonly accessory: PlatformAccessory,
    private readonly monitor: ProcmonMonitorState,
  ) {
    this.informationService =
      this.accessory.getService(this.platform.api.hap.Service.AccessoryInformation) ??
      this.accessory.addService(this.platform.api.hap.Service.AccessoryInformation);

    this.service =
      this.accessory.getService(this.platform.api.hap.Service.ContactSensor) ??
      this.accessory.addService(this.platform.api.hap.Service.ContactSensor);

    this.configureInformation();
    this.update(monitor);
  }

  update(monitor: ProcmonMonitorState): void {
    const needsAttention = monitorNeedsAttention(monitor.status);
    const role = monitorRole(monitor);
    const label = monitorDisplayName(monitor);

    this.accessory.displayName = label;
    this.accessory.context = {
      kind: "monitor",
      monitorId: monitor.id,
      role,
      label,
    };

    this.service.setCharacteristic(this.platform.api.hap.Characteristic.Name, label);
    this.service.setCharacteristic(
      this.platform.api.hap.Characteristic.ContactSensorState,
      needsAttention
        ? this.platform.api.hap.Characteristic.ContactSensorState.CONTACT_NOT_DETECTED
        : this.platform.api.hap.Characteristic.ContactSensorState.CONTACT_DETECTED,
    );
    this.service.setCharacteristic(
      this.platform.api.hap.Characteristic.StatusActive,
      monitor.enabled,
    );
    this.service.setCharacteristic(
      this.platform.api.hap.Characteristic.StatusFault,
      needsAttention
        ? this.platform.api.hap.Characteristic.StatusFault.GENERAL_FAULT
        : this.platform.api.hap.Characteristic.StatusFault.NO_FAULT,
    );
    this.service.setCharacteristic(
      this.platform.api.hap.Characteristic.StatusTampered,
      this.platform.api.hap.Characteristic.StatusTampered.NOT_TAMPERED,
    );
  }

  private configureInformation(): void {
    const model = accessoryModel(monitorRole(this.monitor));

    this.informationService
      .setCharacteristic(this.platform.api.hap.Characteristic.Manufacturer, "rpi-procmon")
      .setCharacteristic(this.platform.api.hap.Characteristic.Name, monitorDisplayName(this.monitor))
      .setCharacteristic(this.platform.api.hap.Characteristic.Model, model)
      .setCharacteristic(this.platform.api.hap.Characteristic.SerialNumber, this.monitor.id);
  }
}

function accessoryModel(role: ReturnType<typeof monitorRole>): string {
  switch (role) {
    case "service":
      return "Procmon Service Sensor";
    case "container":
      return "Procmon Container Sensor";
    case "plugin":
      return "Procmon Plugin Sensor";
    default:
      return "Procmon Monitor Sensor";
  }
}
