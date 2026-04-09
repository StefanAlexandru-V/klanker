import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { executeShell } from '../shell.js';
import { homedir } from 'node:os';

const HOME = homedir();

describe('shell executor', () => {
  // --- Safe commands execute ---

  it('executes a safe command and returns output', async () => {
    const result = await executeShell({ cmd: 'echo hello' });
    assert.equal(result.ok, true);
    assert.equal(result.output.trim(), 'hello');
    assert.equal(result.truncated, false);
    assert.ok(result.duration >= 0);
    assert.equal(result.classification.level, 'safe');
  });

  it('executes ls in home directory', async () => {
    const result = await executeShell({ cmd: 'ls' });
    assert.equal(result.ok, true);
    assert.ok(result.output.length > 0);
  });

  it('captures stderr in output', async () => {
    const result = await executeShell({ cmd: 'echo err >&2' });
    assert.equal(result.ok, true);
    assert.ok(result.output.includes('err'));
  });

  // --- Blocked commands rejected ---

  it('rejects blocked commands', async () => {
    const result = await executeShell({ cmd: 'rm -rf /' });
    assert.equal(result.ok, false);
    assert.equal(result.code, 'BLOCKED');
    assert.ok(result.error.includes('blocked'));
  });

  it('rejects empty commands', async () => {
    const result = await executeShell({ cmd: '' });
    assert.equal(result.ok, false);
    assert.equal(result.code, 'BLOCKED');
  });

  it('rejects sudo commands', async () => {
    const result = await executeShell({ cmd: 'sudo ls' });
    assert.equal(result.ok, false);
    assert.equal(result.code, 'BLOCKED');
  });

  // --- Approval flow ---

  it('returns needsApproval for write commands', async () => {
    const result = await executeShell({ cmd: 'touch /tmp/test-klanker-xyz' });
    assert.equal(result.ok, false);
    assert.equal(result.code, 'NEEDS_APPROVAL');
    assert.equal(result.classification.level, 'approval');
  });

  it('executes approval commands when approved flag is set', async () => {
    const result = await executeShell({ cmd: 'echo write-test > /dev/null', approved: true });
    assert.equal(result.ok, true);
  });

  // --- Working directory ---

  it('uses home directory by default', async () => {
    const result = await executeShell({ cmd: 'pwd' });
    assert.equal(result.ok, true);
    assert.equal(result.output.trim(), HOME);
  });

  it('accepts cwd with ~ expansion', async () => {
    const result = await executeShell({ cmd: 'pwd', cwd: '~' });
    assert.equal(result.ok, true);
    assert.equal(result.output.trim(), HOME);
  });

  it('rejects cwd outside home directory', async () => {
    const result = await executeShell({ cmd: 'ls', cwd: '/etc' });
    assert.equal(result.ok, false);
    assert.equal(result.code, 'BLOCKED');
    assert.ok(result.error.includes('home directory'));
  });

  it('rejects non-existent cwd', async () => {
    const result = await executeShell({ cmd: 'ls', cwd: '~/nonexistent-dir-xyz-123' });
    assert.equal(result.ok, false);
    assert.equal(result.code, 'ERROR');
  });

  // --- Timeout ---

  it('times out long-running commands', async () => {
    const result = await executeShell({ cmd: 'sleep 10', timeout: 500, approved: true });
    assert.equal(result.ok, false);
    assert.equal(result.code, 'TIMEOUT');
    assert.ok(result.duration < 5000);
  });

  it('caps timeout at MAX_TIMEOUT', async () => {
    // Just verify it doesn't throw with a huge timeout
    const result = await executeShell({ cmd: 'echo fast', timeout: 999999 });
    assert.equal(result.ok, true);
  });

  // --- Output truncation ---

  it('truncates large output', async () => {
    // Generate >10KB of output — seq is unknown, so needs approval
    const result = await executeShell({ cmd: 'seq 1 20000', approved: true });
    assert.equal(result.ok, true);
    assert.equal(result.truncated, true);
    assert.ok(result.output.length <= 10 * 1024 + 100); // allow small buffer
  });

  // --- Error handling ---

  it('handles commands that exit with non-zero code', async () => {
    const result = await executeShell({ cmd: 'false', approved: true });
    assert.equal(result.ok, false);
    assert.equal(result.code, 'ERROR');
    assert.ok(result.duration >= 0);
  });

  it('handles commands with both stdout and stderr', async () => {
    const result = await executeShell({ cmd: 'echo out && echo err >&2' });
    // This may succeed (exit 0) — just verify we get output
    assert.ok(result.output.includes('out'));
  });
});
