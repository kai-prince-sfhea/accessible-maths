// Copyright 2026 Kai Prince. SPDX-License-Identifier: Apache-2.0
// Automatic, local-only native catalogue compiler. No network or writes.
import { isAbsolute, join, relative, resolve } from 'node:path';
import './intent-grammar.js';
const fail = (): never => { throw new Error('accessible-maths: catalogue requires bounded reviewed declarations and an ordinary confined UTF-8 containing source'); };
const object = (value: unknown): value is Record<string, any> => !!value && typeof value === 'object' && !Array.isArray(value);
const keys = (value: unknown, allowed: string[]) => { if (!object(value) || Object.keys(value).some(key => !allowed.includes(key))) fail(); return value; };
const text = (value: unknown, maximum = 2048, blank = false): string => {
  if (typeof value !== 'string' || new TextEncoder().encode(value).length > maximum || (!blank && !value.trim()) || /[\u0000-\u001f\u007f-\u009f]/.test(value)) fail(); return value;
};
const path = (value: unknown): string => { const result = text(value, 4096); if (!/\.(?:qmd|md)$/i.test(result) || /[:\\?#]/.test(result) || result.startsWith('/') || result.split('/').some(part => !part || part === '.' || part === '..' || ['.git', '.quarto', '_extensions'].includes(part.toLowerCase()))) fail(); return result; };
const uri = (value: unknown) => { const result = text(value); if (!/^[A-Za-z][A-Za-z0-9+.-]*:[^\s<>"{}]+$/.test(result)) fail(); return result; };
export const catalogueCanonical = (value: any): string => {
  if (value === null || typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) { for (let index = 0; index < value.length; index++) if (!Object.hasOwn(value, index)) fail(); return '[' + value.map(catalogueCanonical).join(',') + ']'; }
  if (object(value)) return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + catalogueCanonical(value[key])).join(',') + '}';
  return fail();
};
const sha = async (value: Uint8Array | string) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', typeof value === 'string' ? new TextEncoder().encode(value) : value))].map(byte => byte.toString(16).padStart(2, '0')).join('');
const grammar = (globalThis as any).AccessibleMathsIntentGrammar;
function lexical(value: unknown) {
  const input = keys(value, ['kind', 'anchor']);
  if (input.kind === 'document' && !Object.hasOwn(input, 'anchor')) return { kind: 'document' };
  if (input.kind !== 'div') fail();
  const anchor = text(input.anchor, 512); if (/[\s#"'<>]/.test(anchor)) fail(); return { kind: 'div', anchor };
}
function notation(value: unknown) {
  const input = keys(value, ['command', 'roles', 'intent', 'visualTeX', 'signature', 'lexicalScope']);
  const command = text(input.command, 64), intent = text(input.intent, 2048), visualTeX = text(input.visualTeX, 4096);
  if (!/^am[A-Z][A-Za-z]*$/.test(command) || ['amIntent', 'amArg'].includes(command) || !Array.isArray(input.roles) || input.roles.length < 1 || input.roles.length > 4 || !grammar?.parseIntent(intent)) fail();
  const roles = input.roles.map((role: unknown) => { const accepted = text(role, 64); if (!grammar.isNCName(accepted, 64)) fail(); return accepted; });
  if (new Set(roles).size !== roles.length) fail();
  const parsed = grammar.parseIntent(intent);
  if (parsed.referenceCounts.length !== roles.length || parsed.referenceCounts.some((entry: any) => !roles.includes(entry.name) || entry.count !== 1)) fail();
  let parameters: any[] = roles.map((role: string) => ({ role, kind: 'required' }));
  if (input.signature !== undefined) {
    const signature = keys(input.signature, ['version', 'parameters']);
    if (signature.version !== 1 || !Array.isArray(signature.parameters) || signature.parameters.length !== roles.length) fail();
    parameters = signature.parameters.map((raw: unknown, index: number) => {
      const parameter = keys(raw, ['role', 'kind', 'defaultTeX']);
      if (parameter.role !== roles[index] || !['required', 'optional'].includes(parameter.kind) || parameter.kind === 'optional' && index !== 0) fail();
      if (parameter.kind === 'required') { if (Object.hasOwn(parameter, 'defaultTeX')) fail(); return { role: roles[index], kind: 'required' }; }
      return { role: roles[index], kind: 'optional', defaultTeX: text(parameter.defaultTeX, 1024, true) };
    });
  }
  return { command, roles, intent, visualTeX, signature: { version: 1, parameters }, ...(input.lexicalScope === undefined ? {} : { lexicalScope: lexical(input.lexicalScope) }) };
}
export async function compileCatalogue(value: unknown, readSource: (root: string, source: string) => Promise<Uint8Array>) {
  const input = keys(value, ['version', 'root', 'source', 'records']);
  if (input.version !== 1 || typeof input.root !== 'string' || !isAbsolute(input.root) || !Array.isArray(input.records) || input.records.length > 256) fail();
  const source = path(input.source), records: any[] = [], ids = new Set(), anchors = new Set(); let bodyBytes = 0;
  if (!input.records.length) return { version: 1, kind: 'accessible-maths-catalogue', status: 'empty', source: { document: source, precision: 'containing-document' }, records: [] };
  for (const raw of input.records) {
    const entry = keys(raw, ['id', 'type', 'label', 'anchor', 'scope', 'review', 'public', 'lexicalScope', 'notation', 'body']);
    const id = uri(entry.id), anchor = text(entry.anchor, 512), label = text(entry.label, 2048), scope = text(entry.scope, 64);
    if (ids.has(id) || anchors.has(anchor) || /[\s#"'<>]/.test(anchor) || !/^[a-z][a-z0-9-]*$/.test(scope) || !['thm', 'lem', 'cor', 'prp', 'cnj', 'def', 'exm', 'exr'].includes(entry.type) || entry.review !== 'author-reviewed' || entry.public !== true || typeof entry.body !== 'string') fail();
    bodyBytes += new TextEncoder().encode(entry.body).length; if (bodyBytes > 2 * 1024 * 1024) fail();
    if (new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(new TextEncoder().encode(entry.body)) !== entry.body) fail();
    ids.add(id); anchors.add(anchor);
    const record: any = { id, type: entry.type, label, anchor, scope, review: 'author-reviewed', public: true,
      lexicalScope: lexical(entry.lexicalScope), bodySha256: await sha(entry.body), ...(entry.notation === undefined ? {} : { notation: notation(entry.notation) }) };
    record.declarationSha256 = await sha(catalogueCanonical(record)); records.push(record);
  }
  records.sort((a, b) => a.anchor < b.anchor ? -1 : a.anchor > b.anchor ? 1 : 0);
  const bytes = await readSource(input.root, source);
  if (!(bytes instanceof Uint8Array) || bytes.length > 2 * 1024 * 1024) fail();
  try { new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes); } catch { fail(); }
  return { version: 1, kind: 'accessible-maths-catalogue', status: 'complete', producer: { name: 'accessible-maths', version: '0.0.9' },
    source: { document: source, precision: 'containing-document', sha256: await sha(bytes) }, declarationsSha256: await sha(catalogueCanonical(records)), records };
}
async function confinedSource(rootInput: string, source: string) {
  const deno = (globalThis as any).Deno, root = resolve(rootInput), rootStat = await deno.lstat(root);
  if (!rootStat.isDirectory || rootStat.isSymlink) fail();
  const physicalRoot = await deno.realPath(root); let current = root;
  for (const component of source.split('/')) {
    current = join(current, component); const info = await deno.lstat(current);
    if (info.isSymlink || current !== join(root, source) && !info.isDirectory) fail();
  }
  const info = await deno.lstat(current), physical = await deno.realPath(current), outside = relative(physicalRoot, physical);
  if (!info.isFile || info.size > 2 * 1024 * 1024 || outside === '..' || outside.startsWith('..\\') || outside.startsWith('../') || isAbsolute(outside)) fail();
  return await deno.readFile(current);
}
if ((import.meta as any).main) {
  try {
    const deno = (globalThis as any).Deno, reader = deno.stdin.readable.getReader(); let chunks: Uint8Array[] = [], count = 0;
    while (true) { const next = await reader.read(); if (next.done) break; count += next.value.length; if (count > 3 * 1024 * 1024) fail(); chunks.push(next.value); }
    const bytes = new Uint8Array(count); let at = 0; for (const chunk of chunks) { bytes.set(chunk, at); at += chunk.length; }
    const input = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    const packet = await compileCatalogue(input, confinedSource);
    await deno.stdout.write(new TextEncoder().encode(JSON.stringify(packet)));
  } catch { console.error('accessible-maths: catalogue compilation refused invalid, changed or unconfined source data'); (globalThis as any).Deno.exit(1); }
}
