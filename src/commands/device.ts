/**
 * CLI: opencli device issue | list | revoke
 * Manages the multi-tenant device credential registry.
 */

import { Command } from 'commander';
import { EXIT_CODES } from '../errors.js';
import { getErrorMessage } from '../errors.js';
import {
  issueDevice,
  listDevices,
  revokeDevice,
  resolveDeviceRegistryPath,
  ENV_DEVICE_REGISTRY,
} from '../device-registry.js';
import { render as renderOutput } from '../output.js';

export function registerDeviceCommands(program: Command): Command {
  const device = program
    .command('device')
    .description('Manage remote extension device credentials (multi-tenant)');

  device
    .command('issue')
    .description('Issue a deviceId + deviceToken pair and write it to the registry')
    .argument('[deviceId]', 'Optional device id (default: random 8-char id)')
    .option('--note <text>', 'Optional note stored with the device record')
    .option('--registry <path>', `Registry JSON path (default: $${ENV_DEVICE_REGISTRY} or ~/.opencli/devices.json)`)
    .action((deviceId: string | undefined, opts: { note?: string; registry?: string }) => {
      try {
        const result = issueDevice({
          deviceId,
          note: opts.note,
          registryPath: opts.registry,
        });
        // Print plaintext token once — it is not stored in the registry.
        console.log(`Issued device credentials`);
        console.log(`  deviceId:     ${result.deviceId}`);
        console.log(`  deviceToken:  ${result.deviceToken}`);
        console.log(`  registry:     ${result.registryPath}`);
        console.log();
        console.log('Configure the extension side panel with deviceId + deviceToken.');
        console.log('Store the token securely; only a hash is kept on the server.');
      } catch (err) {
        console.error(`Error: ${getErrorMessage(err)}`);
        process.exitCode = EXIT_CODES.USAGE_ERROR;
      }
    });

  device
    .command('list')
    .description('List devices in the credential registry')
    .option('--registry <path>', `Registry JSON path (default: $${ENV_DEVICE_REGISTRY} or ~/.opencli/devices.json)`)
    .option('-f, --format <fmt>', 'Output format: table, json, yaml', 'table')
    .action((opts: { registry?: string; format?: string }) => {
      const rows = listDevices(opts.registry).map((d) => ({
        deviceId: d.deviceId,
        status: d.status,
        createdAt: d.createdAt,
        revokedAt: d.revokedAt ?? '',
        note: d.note ?? '',
      }));
      const fmt = opts.format || 'table';
      if (fmt === 'table') {
        console.log(`Registry: ${resolveDeviceRegistryPath(opts.registry)}`);
        if (rows.length === 0) {
          console.log('No devices. Run: opencli device issue');
          return;
        }
      }
      renderOutput(rows, {
        fmt,
        columns: ['deviceId', 'status', 'createdAt', 'revokedAt', 'note'],
        title: 'opencli/device list',
        source: 'device registry',
      });
    });

  device
    .command('revoke')
    .description('Revoke a device so it can no longer connect')
    .argument('<deviceId>', 'Device id to revoke')
    .option('--registry <path>', `Registry JSON path (default: $${ENV_DEVICE_REGISTRY} or ~/.opencli/devices.json)`)
    .action((deviceId: string, opts: { registry?: string }) => {
      try {
        const record = revokeDevice(deviceId, { registryPath: opts.registry });
        console.log(`Revoked device "${record.deviceId}" (status=${record.status}).`);
        console.log('If the device is currently connected, restart the daemon or wait for the next reconnect attempt after disconnect.');
      } catch (err) {
        console.error(`Error: ${getErrorMessage(err)}`);
        process.exitCode = EXIT_CODES.USAGE_ERROR;
      }
    });

  return device;
}
