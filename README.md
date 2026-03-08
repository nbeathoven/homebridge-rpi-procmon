# homebridge-rpi-procmon

`homebridge-rpi-procmon` is a Homebridge dynamic platform plugin that reads the `rpi-procmon` HTTP API and exposes monitor health into Apple Home.

## Current Scope

- Polls `GET /status` from `rpi-procmon`
- Exposes one optional overall Contact Sensor for global procmon health
- Exposes one Contact Sensor per selected procmon monitor
- Updates cached accessories dynamically as monitor inventory changes

This initial version is intentionally read-only. Restart actions, host reboot, and procmon restart switches should only be added after `rpi-procmon` exposes authenticated control endpoints.

## Accessory Mapping

- Overall procmon status: `ContactSensor`
  - `Closed` = healthy or recovering
  - `Open` = degraded, failed, unknown
- Per-monitor health: `ContactSensor`
  - `Closed` = healthy
  - `Open` = degraded, failed, recovering, unknown

That keeps the Home app model simple and semantically honest. Text-heavy issue history belongs in a Homebridge UI, not in HomeKit characteristics.

## Installation

```bash
npm install -g homebridge-rpi-procmon
```

## Example Config

```json
{
  "platform": "RpiProcmon",
  "name": "Rpi Procmon",
  "endpoint": "http://192.168.5.11:9645",
  "pollIntervalSeconds": 15,
  "requestTimeoutMs": 4000,
  "exposeOverallSensor": true,
  "exposeDisabledMonitors": false,
  "hideHealthyMonitors": false,
  "includeMonitors": [],
  "excludeMonitors": []
}
```

## Development

```bash
npm install
npm run check
```

## Publishing Notes

- Package name: `homebridge-rpi-procmon`
- Plugin alias: `RpiProcmon`
- Requires `homebridge` `^1.11.2`
- Requires Node `^18.15.0 || ^20.7.0 || ^22 || ^24`

## Roadmap

- Add a Homebridge custom UI for recent issues and recovery history
- Add optional restart/reboot action switches after procmon gains authenticated write endpoints
- Add tests around config filtering and snapshot normalization
