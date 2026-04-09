/**
 * Shell command executor with safety classification, timeout, and output truncation.
 *
 * Commands are classified before execution:
 *   - safe:     executed immediately
 *   - approval: returns { needsApproval: true } unless approved flag is set
 *   - blocked:  rejected without execution
 *
 * @module shell
 */

import { exec } from 'node:child_process';
import { homedir } from 'node:os';
import { resolve, normalize } from 'node:path';
import { existsSync } from 'node:fs';
import { classify } from './classify.js';

const HOME = homedir();
const DEFAULT_TIMEOUT = 30_000; // 30 seconds
const MAX_TIMEOUT = 120_000;    // 2 minutes
const MAX_OUTPUT = 10 * 1024;   // 10KB

/**
 * @typedef {object} ShellParams
 * @property {string} cmd
 * @property {string} [cwd]
 * @property {number} [timeout]
 * @property {boolean} [approved]
 */

/**
 * @typedef {object} ShellResult
 * @property {boolean} ok
 * @property {string} [output]
 * @property {string} [error]
 * @property {string} [code] — BLOCKED | NEEDS_APPROVAL | TIMEOUT | ERROR
 * @property {boolean} [truncated]
 * @property {number} [duration]
 * @property {import('./classify.js').Classification} [classification]
 */

/**
 * Resolve ~ and validate that a path is under $HOME.
 * @param {string} p
 * @returns {{ ok: boolean, resolved: string, error?: string }}
 */
function resolveSafePath(p) {
  const expanded = p.replace(/^~(?=$|\/|\\)/, HOME);
  const resolved = resolve(expanded);
  const normalized = normalize(resolved);

  if (!normalized.startsWith(HOME)) {
    return { ok: false, resolved: normalized, error: `Path must be under home directory (${HOME})` };
  }
  return { ok: true, resolved: normalized };
}

/**
 * Execute a shell command with safety checks.
 * @param {ShellParams} params
 * @returns {Promise<ShellResult>}
 */
export async function executeShell(params) {
  const { cmd, cwd, timeout, approved = false } = params;

  if (!cmd || !cmd.trim()) {
    return { ok: false, error: 'Empty command', code: 'BLOCKED' };
  }

  const classification = classify(cmd);

  if (classification.level === 'blocked') {
    return {
      ok: false,
      error: `Command blocked: ${classification.reason}`,
      code: 'BLOCKED',
      classification,
    };
  }

  if (classification.level === 'approval' && !approved) {
    return {
      ok: false,
      error: `Command requires user approval: ${classification.reason}`,
      code: 'NEEDS_APPROVAL',
      classification,
    };
  }

  // Validate cwd
  let resolvedCwd = HOME;
  if (cwd) {
    const pathCheck = resolveSafePath(cwd);
    if (!pathCheck.ok) {
      return { ok: false, error: pathCheck.error, code: 'BLOCKED' };
    }
    if (!existsSync(pathCheck.resolved)) {
      return { ok: false, error: `Working directory does not exist: ${cwd}`, code: 'ERROR' };
    }
    resolvedCwd = pathCheck.resolved;
  }

  const effectiveTimeout = Math.min(timeout || DEFAULT_TIMEOUT, MAX_TIMEOUT);
  const start = Date.now();

  return new Promise((resolvePromise) => {
    const child = exec(cmd, {
      cwd: resolvedCwd,
      timeout: effectiveTimeout,
      maxBuffer: 1024 * 1024, // 1MB buffer — we truncate manually
      env: { ...process.env, HOME },
      shell: '/bin/sh',
    }, (error, stdout, stderr) => {
      const duration = Date.now() - start;
      let output = stdout + (stderr ? (stdout ? '\n' : '') + stderr : '');
      let truncated = false;

      if (output.length > MAX_OUTPUT) {
        output = output.slice(0, MAX_OUTPUT);
        truncated = true;
      }

      if (error) {
        if (error.killed || error.signal === 'SIGTERM') {
          return resolvePromise({
            ok: false,
            error: `Command timed out after ${Math.round(effectiveTimeout / 1000)}s`,
            code: 'TIMEOUT',
            output: output || undefined,
            truncated,
            duration,
            classification,
          });
        }

        return resolvePromise({
          ok: false,
          error: error.message,
          code: 'ERROR',
          output: output || undefined,
          truncated,
          duration,
          classification,
        });
      }

      resolvePromise({
        ok: true,
        output,
        truncated,
        duration,
        classification,
      });
    });
  });
}
