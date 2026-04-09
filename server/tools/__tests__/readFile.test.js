import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSafe } from '../readFile.js';
import { writeFileSync, mkdirSync, symlinkSync, unlinkSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const HOME = homedir();
const TEST_DIR = join(HOME, '.klanker-test-readfile');

describe('readFile', () => {
  before(() => {
    mkdirSync(TEST_DIR, { recursive: true });
    writeFileSync(join(TEST_DIR, 'hello.txt'), 'Hello World');
    writeFileSync(join(TEST_DIR, 'big.txt'), 'x'.repeat(25 * 1024));
    writeFileSync(join(TEST_DIR, 'binary.png'), Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x00]));
    writeFileSync(join(TEST_DIR, 'nullbytes.txt'), Buffer.from([0x48, 0x65, 0x6C, 0x00, 0x6F]));

    // Symlink within home
    try { unlinkSync(join(TEST_DIR, 'link-ok.txt')); } catch {}
    symlinkSync(join(TEST_DIR, 'hello.txt'), join(TEST_DIR, 'link-ok.txt'));

    // Symlink outside home
    try { unlinkSync(join(TEST_DIR, 'link-bad.txt')); } catch {}
    symlinkSync('/etc/hostname', join(TEST_DIR, 'link-bad.txt'));
  });

  after(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it('reads a text file', async () => {
    const result = await readFileSafe({ path: join(TEST_DIR, 'hello.txt') });
    assert.equal(result.ok, true);
    assert.equal(result.content, 'Hello World');
    assert.equal(result.truncated, false);
    assert.equal(result.size, 11);
  });

  it('resolves ~ in paths', async () => {
    const result = await readFileSafe({ path: '~/.klanker-test-readfile/hello.txt' });
    assert.equal(result.ok, true);
    assert.equal(result.content, 'Hello World');
  });

  it('rejects paths outside home directory', async () => {
    const result = await readFileSafe({ path: '/etc/passwd' });
    assert.equal(result.ok, false);
    assert.equal(result.code, 'BLOCKED');
  });

  it('rejects symlinks that resolve outside home', async () => {
    const result = await readFileSafe({ path: join(TEST_DIR, 'link-bad.txt') });
    assert.equal(result.ok, false);
    assert.equal(result.code, 'BLOCKED');
  });

  it('follows symlinks within home', async () => {
    const result = await readFileSafe({ path: join(TEST_DIR, 'link-ok.txt') });
    assert.equal(result.ok, true);
    assert.equal(result.content, 'Hello World');
  });

  it('rejects binary files by extension', async () => {
    const result = await readFileSafe({ path: join(TEST_DIR, 'binary.png') });
    assert.equal(result.ok, false);
    assert.equal(result.code, 'BINARY');
  });

  it('rejects files with null bytes', async () => {
    const result = await readFileSafe({ path: join(TEST_DIR, 'nullbytes.txt') });
    assert.equal(result.ok, false);
    assert.equal(result.code, 'BINARY');
  });

  it('truncates files over 20KB', async () => {
    const result = await readFileSafe({ path: join(TEST_DIR, 'big.txt') });
    assert.equal(result.ok, true);
    assert.equal(result.truncated, true);
    assert.ok(result.content.length <= 20 * 1024);
    assert.equal(result.size, 25 * 1024);
  });

  it('returns NOT_FOUND for missing files', async () => {
    const result = await readFileSafe({ path: join(TEST_DIR, 'nope.txt') });
    assert.equal(result.ok, false);
    assert.equal(result.code, 'NOT_FOUND');
  });

  it('rejects directories', async () => {
    const result = await readFileSafe({ path: TEST_DIR });
    assert.equal(result.ok, false);
    assert.equal(result.code, 'ERROR');
  });

  it('rejects empty path', async () => {
    const result = await readFileSafe({ path: '' });
    assert.equal(result.ok, false);
    assert.equal(result.code, 'ERROR');
  });
});
