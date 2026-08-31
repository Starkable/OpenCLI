#!/usr/bin/env node
/**
 * Force every opencli invocation to use an explicit device profile.
 *
 * Usage (cc-connect project env or PATH wrapper):
 *   OPENCLI_PROFILE=<deviceId> opencli-with-profile browser … 
 *
 * Or symlink/alias `opencli` → this script and keep real binary as `opencli-real`.
 *
 * Spike note (cc-connect): project `env` / `work_dir` are per-project, not per
 * Bridge session_key. For multi-tenant binding, either:
 *   1) one cc-connect project (or work_dir) per device with OPENCLI_PROFILE set, or
 *   2) put this wrapper on PATH and set OPENCLI_PROFILE in that project's env.
 */
import { spawn } from 'node:child_process';

const profile = process.env.OPENCLI_PROFILE?.trim();
if (!profile) {
  console.error(
    '[opencli-with-profile] OPENCLI_PROFILE is required in device credential mode. ' +
    'Set it to the deviceId from `opencli device issue`.',
  );
  process.exit(2);
}

const args = process.argv.slice(2);
const alreadyHasProfile = args.some((a, i) => a === '--profile' || a.startsWith('--profile=') || (args[i - 1] === '--profile'));
const forwarded = alreadyHasProfile ? args : ['--profile', profile, ...args];

const bin = process.env.OPENCLI_REAL_BIN?.trim() || 'opencli';
const child = spawn(bin, forwarded, { stdio: 'inherit', shell: process.platform === 'win32' });
child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
