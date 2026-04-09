/**
 * Safe file reader with path validation, binary detection, and size truncation.
 *
 * Only reads files under $HOME. Resolves ~ and symlinks before checking.
 *
 * @module readFile
 */

import { readFile as fsReadFile, realpath, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { resolve, normalize, extname } from 'node:path';

const HOME = homedir();
const MAX_SIZE = 20 * 1024; // 20KB

const BINARY_EXTENSIONS = new Set([
  '.exe', '.dll', '.so', '.dylib', '.o', '.a', '.lib',
  '.bin', '.dat', '.db', '.sqlite', '.sqlite3',
  '.zip', '.tar', '.gz', '.bz2', '.xz', '.7z', '.rar',
  '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.webp', '.svg',
  '.mp3', '.mp4', '.avi', '.mov', '.mkv', '.flac', '.wav', '.ogg',
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  '.woff', '.woff2', '.ttf', '.otf', '.eot',
  '.onnx', '.pb', '.pt', '.pth', '.safetensors',
  '.pyc', '.pyo', '.class', '.jar', '.war',
]);

/**
 * @typedef {object} ReadFileResult
 * @property {boolean} ok
 * @property {string} [content]
 * @property {string} [error]
 * @property {string} [code]
 * @property {boolean} [truncated]
 * @property {number} [size]
 */

/**
 * Read a file safely.
 * @param {{ path: string }} params
 * @returns {Promise<ReadFileResult>}
 */
export async function readFileSafe(params) {
  const { path: rawPath } = params;

  if (!rawPath || !rawPath.trim()) {
    return { ok: false, error: 'No path provided', code: 'ERROR' };
  }

  const expanded = rawPath.trim().replace(/^~(?=$|\/|\\)/, HOME);
  const resolved = resolve(expanded);

  const normalizedPath = normalize(resolved);
  if (normalizedPath !== HOME && !normalizedPath.startsWith(HOME + '/')) {
    return { ok: false, error: `Path must be under home directory (${HOME})`, code: 'BLOCKED' };
  }

  // Check the file exists and get stats
  let fileStat;
  try {
    fileStat = await stat(resolved);
  } catch {
    return { ok: false, error: `File not found: ${rawPath}`, code: 'NOT_FOUND' };
  }

  if (fileStat.isDirectory()) {
    return { ok: false, error: `Path is a directory, not a file: ${rawPath}`, code: 'ERROR' };
  }

  // Resolve symlinks and verify the real path is still under HOME
  let realPath;
  try {
    realPath = await realpath(resolved);
  } catch {
    return { ok: false, error: `Cannot resolve path: ${rawPath}`, code: 'ERROR' };
  }

  if (!normalize(realPath).startsWith(HOME)) {
    return { ok: false, error: `Symlink resolves outside home directory`, code: 'BLOCKED' };
  }

  // Check for binary file by extension
  const ext = extname(realPath).toLowerCase();
  if (BINARY_EXTENSIONS.has(ext)) {
    return { ok: false, error: `Binary file type not supported: ${ext}`, code: 'BINARY' };
  }

  // Read the file
  let content;
  try {
    const buffer = await fsReadFile(realPath);

    // Check for null bytes (binary detection)
    const sample = buffer.subarray(0, Math.min(8192, buffer.length));
    if (sample.includes(0)) {
      return { ok: false, error: 'File appears to be binary (contains null bytes)', code: 'BINARY' };
    }

    content = buffer.toString('utf-8');
  } catch (err) {
    return { ok: false, error: `Cannot read file: ${err.message}`, code: 'ERROR' };
  }

  const truncated = content.length > MAX_SIZE;
  if (truncated) {
    content = content.slice(0, MAX_SIZE);
  }

  return {
    ok: true,
    content,
    truncated,
    size: fileStat.size,
  };
}
