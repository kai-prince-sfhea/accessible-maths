// Copyright 2026 Kai Prince. SPDX-License-Identifier: Apache-2.0
// Local-only exact literal-data reader; no Markdown conversion, network or writes.
import { lstat, open, realpath } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';

const LIMIT = 65536;
const fail = (): never => { throw new Error('accessible-maths: braille-literals-file requires an ordinary confined UTF-8 YAML file of at most 65536 bytes'); };
const localPath = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 4096
  && /\.ya?ml$/i.test(value) && !/[\\:%?#\u0000-\u001f\u007f]/.test(value) && !value.startsWith('/')
  && !value.split('/').some(part => !part || part === '.' || part === '..' || ['.git', '.quarto', '_extensions'].includes(part.toLowerCase()));
const inside = (root: string, value: string) => { const suffix = relative(root, value); return !!suffix && !isAbsolute(suffix) && suffix !== '..' && !suffix.startsWith('..' + sep); };

export async function readLiteralFile(input: unknown) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !['version', 'root', 'path'].includes(key))) fail();
  const value = input as { version: number; root: string; path: string };
  if (value.version !== 1 || typeof value.root !== 'string' || !isAbsolute(value.root) || value.root.length > 32768 || !localPath(value.path)) fail();
  const root = resolve(value.root), rootInfo = await lstat(root);
  if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink()) fail();
  const physicalRoot = await realpath(root), destination = join(root, value.path);
  async function ordinary() {
    let cursor = root;
    for (const [index, component] of value.path.split('/').entries()) {
      cursor = join(cursor, component); const info = await lstat(cursor);
      if (info.isSymbolicLink() || !(index === value.path.split('/').length - 1 ? info.isFile() : info.isDirectory())) fail();
    }
    const physical = await realpath(destination);
    if (!inside(physicalRoot, physical)) fail();
    return physical;
  }
  const physical = await ordinary(), before = await lstat(physical);
  if (!before.isFile() || before.size > LIMIT) fail();
  const handle = await open(physical, 'r'); let bytes: Uint8Array;
  try {
    const opened = await handle.stat();
    if (!opened.isFile() || opened.size !== before.size || opened.ino !== before.ino || opened.dev !== before.dev) fail();
    const buffer = new Uint8Array(LIMIT + 1); let length = 0;
    while (length < buffer.length) { const result = await handle.read(buffer, length, buffer.length - length, null); if (!result.bytesRead) break; length += result.bytesRead; }
    if (length > LIMIT || length !== before.size) fail();
    bytes = buffer.slice(0, length);
    const after = await handle.stat();
    if (after.size !== before.size || after.mtimeMs !== before.mtimeMs || after.ctimeMs !== before.ctimeMs) fail();
  } finally { await handle.close(); }
  const afterPhysical = await ordinary(), after = await lstat(afterPhysical);
  if (afterPhysical !== physical || after.size !== before.size || after.mtimeMs !== before.mtimeMs || after.ctimeMs !== before.ctimeMs || after.ino !== before.ino || after.dev !== before.dev) fail();
  let raw: string; try { raw = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes); } catch { fail(); }
  const sha256 = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(byte => byte.toString(16).padStart(2, '0')).join('');
  return { version: 1, path: value.path, raw, bytes: bytes.length, sha256 };
}

if ((import.meta as any).main) {
  try {
    const deno = (globalThis as any).Deno, reader = deno.stdin.readable.getReader(), chunks: Uint8Array[] = []; let length = 0;
    while (true) { const next = await reader.read(); if (next.done) break; length += next.value.length; if (length > LIMIT) fail(); chunks.push(next.value); }
    const bytes = new Uint8Array(length); let at = 0; for (const chunk of chunks) { bytes.set(chunk, at); at += chunk.length; }
    const request = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    await deno.stdout.write(new TextEncoder().encode(JSON.stringify(await readLiteralFile(request))));
  } catch { console.error('accessible-maths: braille-literals-file requires an ordinary confined UTF-8 YAML file of at most 65536 bytes, without symlinks or junctions'); (globalThis as any).Deno.exit(1); }
}
