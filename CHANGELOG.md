# Changelog

## 0.1.4 - 2026-10-21

- Harden procmon v0.3.0 integration while retaining the read-only `/status` API and existing accessory UUIDs.
- Report polling failures as unavailable/faulted instead of silently retaining apparent health.
- Validate snapshots before applying accessory inventory changes.
- Distinguish transient checking from service failure and bound stale health readings.
- Align recovering and disabled status semantics across sensors.
- Retain previously exposed healthy monitors when using `hideHealthyMonitors`.
- Add regression tests and an architecture/QA requirements audit.

## 0.1.3

- Synchronize HomeKit-safe accessory information names.
