# Deployment 0.1.4

## Scope

Upgrade the existing plugin on SafaBridge only. Epcilon runs MA352 and
SafaSnooper runs snooperd/snooper-gui; neither requires a procmon or Homebridge
installation. The central controller is procmon v0.3.1, commit `25271d8`.

The tested package SHA-256 is
`7722b844f4e261f7673837676152635118c39d5352fcc766b1e489fc818f7d84`.

## Installed Paths

- Plugin: `/var/lib/homebridge/node_modules/homebridge-rpi-procmon`
- Package: `/var/lib/homebridge/local-tarballs/homebridge-rpi-procmon-0.1.4.tgz`
- Manifest: `/var/lib/homebridge/package.json` now references that local package.
- Backup: `/home/nima/backups/procmon-plugin-0.1.3-20261021`

The package has no runtime dependencies beyond its existing Homebridge peer.
The verified tarball was unpacked and the plugin directory replaced without
running dependency resolution against unrelated plugins. Only the procmon child
bridge received SIGTERM; the Homebridge parent restarted it automatically.
Homebridge config and accessory cache identities were preserved.

## Rollback

If rollback is necessary, first verify the paths and that no later installation
has superseded this release. Restore the backed-up `installed-package` directory
to the plugin path and restore the backed-up `package.json`. Preserve the current
configuration and accessory cache rather than restoring old pairing state.
Restart only the procmon child bridge from Homebridge UI (or send SIGTERM to the
exact `homebridge: homebridge-rpi-procmon` child process). Verify plugin 0.1.3
starts and note that its original stale-health limitations return.

## Publication

GitHub source synchronization does not mean npm publication. The repository's
published-release workflow invokes `npm publish`; publishing to npm is a separate
step. Do not trigger that workflow merely to synchronize a LAN deployment.

## Verification Limits

Automated tests exercise HAP characteristics through a mock API and the actual
HTTP client against the live controller. Cached HAP values and UUIDs can be
inspected on the host; this does not prove how a particular Apple Home client
renders StatusFault/StatusActive. Do not interpret a retained closed contact
alone as proof of current health when the sensor is unavailable or faulted.
