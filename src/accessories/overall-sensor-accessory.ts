import type { PlatformAccessory, Service } from "homebridge";

import type { ProcmonPlatform } from "../platform";
import { overallNeedsAttention } from "../config";
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
    const needsAttention = overallNeedsAttention(snapshot.overall_status);
    const sensorName = `${this.platform.normalizedConfig.name} Fault`;

    this.accessory.displayName = sensorName;
    this.accessory.context = {
      kind: "overall",
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
      true,
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
      .setCharacteristic(this.platform.api.hap.Characteristic.Model, "Overall Health Sensor")
      .setCharacteristic(this.platform.api.hap.Characteristic.SerialNumber, "overall");
  }
}
