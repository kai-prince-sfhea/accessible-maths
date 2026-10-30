// Copyright 2026 Kai Prince. SPDX-License-Identifier: Apache-2.0
// Finite built-in or author-reviewed interpretations, separate from native ARIA.
// The caller supplies the existing MathItem.speechFor worker; no engine, voice,
// model, preference change or network loader is installed by this helper.
(() => {
  'use strict';
  const scope = globalThis;
  if (scope.AccessibleMathsIntentSpeech) return;
  const MATHML = 'http://www.w3.org/1998/Math/MathML';
  const LIMITS = Object.freeze({ mathML: 1024 * 1024, nodes: 4096, depth: 64,
    annotations: 32, workerCalls: 64, text: 16384 });
  // Original explicit English realizations, guided by the W3C intent concept
  // catalogue. Arity/order/fixity are declared, never inferred from a glyph.
  const builtins = Object.freeze({
    'ordered-pair': {arity:2,fixities:['function'],realize:v=>`the ordered pair with first entry ${v[0]} and second entry ${v[1]}`},
    'open-interval': {arity:2,fixities:['function'],realize:v=>`the open interval from ${v[0]} to ${v[1]}`},
    'closed-interval': {arity:2,fixities:['function'],realize:v=>`the closed interval from ${v[0]} included to ${v[1]} included`},
    'closed-open-interval': {arity:2,fixities:['function'],realize:v=>`the interval from ${v[0]} included to ${v[1]} excluded`},
    'open-closed-interval': {arity:2,fixities:['function'],realize:v=>`the interval from ${v[0]} excluded to ${v[1]} included`},
    'absolute-value': {arity:1,fixities:['function'],realize:v=>`the absolute value of ${v[0]}`},
    'applied-to': {arity:2,fixities:['function','infix'],realize:v=>`the function ${v[0]} applied to ${v[1]} end application`},
    'composed-with': {arity:2,fixities:['function','infix'],realize:v=>`the composition of ${v[0]} after ${v[1]} end composition`},
    'power': {arity:2,fixities:['function','infix'],realize:v=>`the quantity ${v[0]} raised to the power ${v[1]} end power`},
    'root': {arity:2,fixities:['function'],realize:v=>`the root of degree ${v[1]} of ${v[0]} end root`},
    'fraction': {arity:2,fixities:['function'],realize:v=>`the fraction with numerator ${v[0]} and denominator ${v[1]} end fraction`},
    'cardinality': {arity:1,fixities:['function'],realize:v=>`the cardinality of ${v[0]}`},
    'floor': {arity:1,fixities:['function'],realize:v=>`the floor of ${v[0]}`},
    'ceiling': {arity:1,fixities:['function'],realize:v=>`the ceiling of ${v[0]}`},
    'set': {arity:1,fixities:['function'],realize:v=>`the set whose members are ${v[0]} end set`},
    'complex-conjugate': {arity:1,fixities:['function'],realize:v=>`the complex conjugate of ${v[0]}`},
    'domain': {arity:1,fixities:['function'],realize:v=>`the domain of ${v[0]}`},
    'codomain': {arity:1,fixities:['function'],realize:v=>`the codomain of ${v[0]}`},
    'image': {arity:1,fixities:['function'],realize:v=>`the image of ${v[0]}`}
  });
  const supportedConcepts = Object.freeze(Object.keys(builtins));
  const REALISATION_LIMITS = Object.freeze({ bytes: 65536, rules: 32, literals: 16,
    id: 64, revision: 128, reviewer: 256, concept: 64, template: 1024,
    code: 128, cells: 4096, meaning: 2048 });
  const literalQualification = 'Author-reviewed literal declaration; exact annotation identity does not establish braille correctness, definition equivalence or independent review. Native presentation braille is unchanged.';
  const utf8Bytes = value => {
    let bytes = 0;
    for (const character of value) { const cp = character.codePointAt(0); bytes += cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4; }
    return bytes;
  };
  const invalid = reason => { throw new Error(`invalid-realisations:${reason}`); };
  function plainCopy(value, depth = 0, budget = { nodes: 0 }) {
    if (++budget.nodes > 8192 || depth > 16) invalid('structure');
    if (value === null || typeof value === 'boolean') return value;
    if (typeof value === 'string') { if (!value.isWellFormed()) invalid('unicode'); return value; }
    if (typeof value === 'number') { if (!Number.isFinite(value)) invalid('number'); return value; }
    if (!value || typeof value !== 'object' || ![Object.prototype, Array.prototype, null].includes(Object.getPrototypeOf(value))) invalid('literal-data');
    const descriptors = Object.getOwnPropertyDescriptors(value);
    for (const key of Reflect.ownKeys(descriptors)) if (typeof key !== 'string' || !Object.hasOwn(descriptors[key], 'value')) invalid('accessors');
    if (Array.isArray(value)) {
      if (value.length > 1024 || Object.keys(descriptors).some(key => key !== 'length' && !/^(?:0|[1-9]\d*)$/u.test(key))) invalid('array');
      return Array.from({ length: value.length }, (_, index) => { if (!Object.hasOwn(descriptors, String(index))) invalid('sparse-array'); return plainCopy(descriptors[index].value, depth + 1, budget); });
    }
    const result = {};
    for (const [key, descriptor] of Object.entries(descriptors)) Object.defineProperty(result, key, { value: plainCopy(descriptor.value, depth + 1, budget), enumerable: true });
    return result;
  }
  const freeze = value => { if (value && typeof value === 'object') { for (const child of Object.values(value)) freeze(child); Object.freeze(value); } return value; };
  function fields(value, allowed) {
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !allowed.includes(key))) invalid('fields');
  }
  function prose(value, maximum, name) {
    if (typeof value !== 'string' || !value.trim() || utf8Bytes(value) > maximum || /[<>\u0000-\u001f\u007f-\u009f]/u.test(value)) invalid(name);
    return value;
  }
  // A finite well-formed BCP47 subset, not a registered-language lookup. No
  // extensions, private-use tags, aliases or fallback to a different locale.
  function normalizeLocale(value, { native = false } = {}) {
    if (typeof value !== 'string' || value.length > 63) return null;
    if (native) value = value.replaceAll('_', '-');
    const parts = value.split('-');
    if (!/^[A-Za-z]{2,8}$/u.test(parts[0])) return null;
    let at = 1;
    if (/^[A-Za-z]{4}$/u.test(parts[at] || '')) at++;
    if (/^(?:[A-Za-z]{2}|[0-9]{3})$/u.test(parts[at] || '')) at++;
    const variants = new Set();
    for (; at < parts.length; at++) {
      const part = parts[at].toLowerCase();
      if (!/^(?:[a-z0-9]{5,8}|[0-9][a-z0-9]{3})$/u.test(part) || variants.has(part)) return null;
      variants.add(part);
    }
    return value.toLowerCase();
  }
  function templateParts(template, roles) {
    const result = [], used = new Set(); let cursor = 0;
    for (const match of template.matchAll(/\{([^{}]+)\}|[{}]/gu)) {
      if (!match[1] || !roles.includes(match[1]) || used.has(match[1])) invalid('template-placeholder');
      if (match.index > cursor) result.push({ text: template.slice(cursor, match.index) });
      result.push({ role: match[1] }); used.add(match[1]); cursor = match.index + match[0].length;
    }
    if (used.size !== roles.length) invalid('template-role-missing');
    if (cursor < template.length) result.push({ text: template.slice(cursor) });
    return result;
  }
  function reviewed(value, ids) {
    if (typeof value.id !== 'string' || !/^[a-z][a-z0-9-]{0,63}$/u.test(value.id) || ids.has(value.id)) invalid('id');
    ids.add(value.id);
    prose(value.revision, REALISATION_LIMITS.revision, 'revision');
    prose(value['reviewed-by'], REALISATION_LIMITS.reviewer, 'reviewed-by');
    if (value.review !== 'author-reviewed') invalid('review');
  }
  function validateRealisations(input) {
    const value = plainCopy(input), grammar = scope.AccessibleMathsIntentGrammar;
    if (!grammar || grammar.version !== 1) invalid('grammar');
    if (utf8Bytes(JSON.stringify(value)) > REALISATION_LIMITS.bytes) invalid('bytes');
    fields(value, ['version', 'language', 'rules', 'braille-literals']);
    if (value.version !== 1 || !normalizeLocale(value.language)) invalid('version-or-language');
    const ids = new Set(), concepts = new Set(), rules = value.rules === undefined ? [] : value.rules;
    const literals = value['braille-literals'] === undefined ? [] : value['braille-literals'];
    if (!Array.isArray(rules) || rules.length > REALISATION_LIMITS.rules || !Array.isArray(literals) || literals.length > REALISATION_LIMITS.literals) invalid('inventory');
    for (const rule of rules) {
      fields(rule, ['id', 'revision', 'concept', 'roles', 'template', 'review', 'reviewed-by']); reviewed(rule, ids);
      if (!grammar.isNCName(rule.concept, REALISATION_LIMITS.concept) || concepts.has(rule.concept)) invalid('concept');
      concepts.add(rule.concept);
      if (!Array.isArray(rule.roles) || rule.roles.length < 1 || rule.roles.length > 4 || new Set(rule.roles).size !== rule.roles.length || rule.roles.some(role => !grammar.isNCName(role, REALISATION_LIMITS.concept))) invalid('roles');
      templateParts(prose(rule.template, REALISATION_LIMITS.template, 'template'), rule.roles);
    }
    for (const literal of literals) {
      fields(literal, ['id', 'revision', 'expression-sha256', 'meaning', 'code', 'language', 'cells', 'review', 'reviewed-by']); reviewed(literal, ids);
      if (typeof literal['expression-sha256'] !== 'string' || !/^[a-f0-9]{64}$/u.test(literal['expression-sha256'])) invalid('fingerprint');
      if (!grammar.parseIntent(prose(literal.meaning, REALISATION_LIMITS.meaning, 'meaning'))) invalid('meaning');
      prose(literal.code, REALISATION_LIMITS.code, 'code');
      if (!normalizeLocale(literal.language)) invalid('literal-language');
      if (typeof literal.cells !== 'string' || !/[\u2801-\u28ff]/u.test(literal.cells) || /[^\u2800-\u28ff \n]/u.test(literal.cells) || utf8Bytes(literal.cells) > REALISATION_LIMITS.cells) invalid('cells');
    }
    return freeze({ version: 1, language: value.language, rules, 'braille-literals': literals });
  }
  function parseRealisations(raw) {
    if (typeof raw !== 'string' || !raw.isWellFormed() || utf8Bytes(raw) > REALISATION_LIMITS.bytes) invalid('json-bytes');
    // The native filter emits literal JSON; this bounded parser additionally
    // refuses duplicate (including escaped) keys in a replaced DOM payload.
    let at = 0, nodes = 0;
    const whitespace = () => { while (/[\t\r\n ]/u.test(raw[at] || '!')) at++; };
    const string = () => { const start = at++; let escape = false;
      while (at < raw.length) { const char = raw[at++]; if (!escape && char === '"') { const value = JSON.parse(raw.slice(start, at)); if (!value.isWellFormed()) invalid('json-unicode'); return value; } if (!escape && char === '\\') escape = true; else escape = false; }
      invalid('json-string');
    };
    const parse = depth => {
      if (++nodes > 8192 || depth > 16) invalid('json-structure'); whitespace(); const char = raw[at];
      if (char === '"') return string();
      if (char === '{') { at++; const result = Object.create(null), seen = new Set(); whitespace(); if (raw[at] === '}') { at++; return result; }
        while (true) { whitespace(); if (raw[at] !== '"') invalid('json-key'); const key = string(); if (seen.has(key)) invalid('json-duplicate'); seen.add(key); whitespace(); if (raw[at++] !== ':') invalid('json-separator'); result[key] = parse(depth + 1); whitespace(); if (raw[at] === '}') { at++; return result; } if (raw[at++] !== ',') invalid('json-separator'); }
      }
      if (char === '[') { at++; const result = []; whitespace(); if (raw[at] === ']') { at++; return result; } while (true) { result.push(parse(depth + 1)); whitespace(); if (raw[at] === ']') { at++; return result; } if (raw[at++] !== ',') invalid('json-separator'); } }
      for (const [token, result] of [['true', true], ['false', false], ['null', null]]) if (raw.startsWith(token, at)) { at += token.length; return result; }
      const number = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/u.exec(raw.slice(at)); if (!number) invalid('json-value'); at += number[0].length; const value = Number(number[0]); if (!Number.isFinite(value)) invalid('json-number'); return value;
    };
    let value; try { value = parse(0); whitespace(); if (at !== raw.length) invalid('json-trailing'); } catch (error) { if (String(error.message).startsWith('invalid-realisations:')) throw error; invalid('json'); }
    return validateRealisations(value);
  }
  const canonical = value => Array.isArray(value) ? '[' + value.map(canonical).join(',') + ']'
    : value && typeof value === 'object' ? '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}' : JSON.stringify(value);
  async function buildExpressionBinding(input, { cryptoObject = scope.crypto } = {}) {
    const value = plainCopy(input); fields(value, ['sourceTeX', 'presentationMathML', 'annotationSignature', 'meaning']);
    for (const [name, maximum] of [['sourceTeX', 65536], ['presentationMathML', LIMITS.mathML], ['annotationSignature', LIMITS.mathML]]) if (typeof value[name] !== 'string' || !value[name].length || utf8Bytes(value[name]) > maximum) invalid('binding-' + name);
    if (!scope.AccessibleMathsIntentGrammar?.parseIntent(prose(value.meaning, REALISATION_LIMITS.meaning, 'meaning'))) invalid('meaning');
    if (!cryptoObject?.subtle?.digest) throw new Error('binding-hash-unavailable');
    const basis = canonical({ version: 1, sourceTeX: value.sourceTeX, presentationMathML: value.presentationMathML, annotationSignature: value.annotationSignature });
    // TextEncoder is unnecessary for dependency-free isolated helpers.
    const bytes = [];
    for (const character of basis) { const cp = character.codePointAt(0); if (cp < 0x80) bytes.push(cp); else if (cp < 0x800) bytes.push(0xc0 | cp >> 6, 0x80 | cp & 63); else if (cp < 0x10000) bytes.push(0xe0 | cp >> 12, 0x80 | cp >> 6 & 63, 0x80 | cp & 63); else bytes.push(0xf0 | cp >> 18, 0x80 | cp >> 12 & 63, 0x80 | cp >> 6 & 63, 0x80 | cp & 63); }
    const digest = await cryptoObject.subtle.digest('SHA-256', new Uint8Array(bytes));
    if (!(digest instanceof ArrayBuffer) && Object.prototype.toString.call(digest) !== '[object ArrayBuffer]') throw new Error('binding-hash-unavailable');
    const hash = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join(''); if (hash.length !== 64) throw new Error('binding-hash-unavailable');
    return freeze({ version: 1, expressionSha256: hash, meaning: value.meaning, precision: 'exact-native-tex-mathml-annotations',
      yaml: `expression-sha256: "${hash}"\nmeaning: ${JSON.stringify(value.meaning)}\n` });
  }
  function matchingBrailleLiterals(configuration, binding) {
    const config = validateRealisations(configuration), value = plainCopy(binding);
    fields(value, ['version', 'expressionSha256', 'meaning', 'precision', 'yaml']);
    if (value.version !== 1 || !/^[a-f0-9]{64}$/u.test(value.expressionSha256 || '') || !scope.AccessibleMathsIntentGrammar?.parseIntent(value.meaning)) invalid('binding');
    return freeze(config['braille-literals'].filter(literal => literal['expression-sha256'] === value.expressionSha256 && literal.meaning === value.meaning));
  }
  class Fallback extends Error {
    constructor(reason) { super(reason); this.reason = reason; }
  }
  function parseXML(value) {
    const doc = new DOMParser().parseFromString(value, 'application/xml');
    if (doc.doctype || doc.getElementsByTagName('parsererror').length) throw new Fallback('invalid-mathml');
    return doc.documentElement;
  }
  const serializeXML = node => new XMLSerializer().serializeToString(node);

  /**
   * Interpret only the declared finite subset. Unsupported/ambiguous intent
   * falls back for the WHOLE expression, so a mixed result is never advertised
   * as completely interpreted. All rewrites are private clones for speech.
   * `parse`/`serialize` are injectable solely for isolated, dependency-free tests.
   */
  async function interpret(mathML, { language = 'en', configuration, speak, parse = parseXML, serialize = serializeXML } = {}) {
    const grammar = scope.AccessibleMathsIntentGrammar;
    if (!grammar || grammar.version !== 1) throw new Error('intent-grammar-unavailable');
    if (typeof speak !== 'function') throw new Error('speech-worker-unavailable');
    if (typeof mathML !== 'string' || !mathML.length || mathML.length > LIMITS.mathML) throw new Error('mathml-limit');
    const config = configuration === undefined ? null : validateRealisations(configuration);
    if ((!config && language !== 'en') || (config && normalizeLocale(language) !== normalizeLocale(config.language))) throw new Error('unsupported-language');
    const english = !config || normalizeLocale(config.language).split('-')[0] === 'en';
    let calls = 0, annotations = 0;
    const concepts = [], templateRules = [];
    const worker = async value => {
      if (calls >= LIMITS.workerCalls) throw new Fallback('worker-call-limit');
      calls += 1;
      const output = await speak(value);
      if (!Array.isArray(output) || output.length !== 2 ||
          output.some(item => typeof item !== 'string' || item.length > LIMITS.text)) throw new Error('invalid-worker-output');
      return output;
    };
    // Reject structurally unsafe/budget-exceeding input before the shared
    // native worker receives it. Valid but unsupported intent can fall back.
    let root;
    try { root = parse(mathML); } catch { throw new Error('invalid-mathml'); }
    if (!root || root.localName !== 'math' || root.namespaceURI !== MATHML) throw new Error('invalid-mathml');
    let nodes = 0;
    function validate(node, depth) {
      if (++nodes > LIMITS.nodes || depth > LIMITS.depth) throw new Error('mathml-tree-limit');
      if (node.namespaceURI !== MATHML) throw new Error('foreign-mathml');
      for (const child of node.children) validate(child, depth + 1);
    }
    validate(root, 0);
    // Native presentation is always evaluated independently. In particular,
    // braille from the subsequent speech-only clone is NEVER returned.
    const [nativeSpeech, braille] = await worker(mathML);
    const base = { schemaVersion: 1, language, nativeSpeech, braille,
      brailleSource: 'original-presentation', concepts: [], workerCalls: calls,
      ...(config ? { templateRules: [], realisationLanguage: config.language } : {}) };
    try {
      const working = root.cloneNode(true);
      const doc = working.ownerDocument;
      const element = (name, text) => {
        const node = doc.createElementNS(MATHML, name);
        if (text !== undefined) node.textContent = text;
        return node;
      };
      const wrap = node => {
        if (node.localName === 'math') return node;
        const math = element('math'); math.appendChild(node); return math;
      };
      function bindings(owner) {
        const found = new Map();
        function visit(node) {
          const arg = node.getAttribute('arg');
          if (arg !== null) {
            if (!grammar.isNCName(arg)) throw new Fallback('invalid-arg');
            if (!found.has(arg)) found.set(arg, []);
            found.get(arg).push(node);
          }
          // A role on this child is available, but roles deeper inside a child
          // with its own arg/intent belong to that child, not the outer owner.
          if (arg !== null || node.getAttribute('intent') !== null) return;
          for (const child of node.children) visit(child);
        }
        for (const child of owner.children) visit(child);
        return found;
      }
      async function argument(ast, owner, found, depth) {
        if (depth > LIMITS.depth) throw new Fallback('intent-depth-limit');
        if (ast.kind !== 'application' && ast.properties.length) throw new Fallback('unsupported-properties');
        if (ast.kind === 'reference') {
          const matches = found.get(ast.name) || [];
          if (matches.length !== 1) throw new Fallback(matches.length ? 'ambiguous-arg' : 'unresolved-arg');
          const rewritten = await rewrite(matches[0].cloneNode(true), depth + 1);
          const [speech] = await worker(serialize(wrap(rewritten)));
          if (!speech.trim()) throw new Fallback('empty-argument-speech');
          return speech;
        }
        if (ast.kind === 'number') {
          const [speech] = await worker(serialize(wrap(element('mn', ast.value))));
          if (!speech.trim()) throw new Fallback('empty-argument-speech');
          return speech;
        }
        if (ast.kind === 'application') return application(ast, owner, found, depth + 1);
        throw new Fallback('unsupported-argument');
      }
      async function application(ast, owner, found, depth) {
        if (ast.kind !== 'application' || ast.head.kind !== 'concept') throw new Fallback('unsupported-intent');
        const properties = [...ast.head.properties,...ast.properties];
        // This finite adapter supports these exact names only. The general
        // grammar transports other NCNames unchanged, without guessing a rule.
        const name = ast.head.name;
        const rule = config?.rules.find(rule => rule.concept === name);
        const builtin = english && Object.hasOwn(builtins,name) ? builtins[name] : null;
        if (properties.length && (rule || !builtin || properties.length !== 1 || !builtin.fixities.includes(properties[0]))) throw new Fallback('unsupported-properties');
        const arity = rule ? rule.roles.length : builtin ? builtin.arity : 0;
        if (!arity) throw new Fallback('unsupported-concept');
        if (ast.args.length !== arity) throw new Fallback('unsupported-arity');
        const values = [];
        for (const arg of ast.args) values.push(await argument(arg, owner, found, depth + 1));
        if (!concepts.includes(name)) concepts.push(name);
        const text = rule ? templateParts(rule.template, rule.roles).map(part => part.text === undefined ? values[rule.roles.indexOf(part.role)] : part.text).join('') : builtin.realize(values);
        if (text.length > LIMITS.text) throw new Fallback('interpretation-text-limit');
        if (rule && !templateRules.some(value => value.id === rule.id)) templateRules.push({ id: rule.id, revision: rule.revision, concept: rule.concept,
          roles: [...rule.roles], template: rule.template, language: config.language, review: rule.review, 'reviewed-by': rule['reviewed-by'], qualification: 'Author-reviewed wording declaration; not independent semantic or accessibility verification.' });
        return text;
      }
      async function rewrite(node, depth) {
        if (depth > LIMITS.depth) throw new Fallback('mathml-tree-limit');
        const intent = node.getAttribute('intent');
        if (intent !== null) {
          if (++annotations > LIMITS.annotations) throw new Fallback('annotation-limit');
          const parsed = grammar.parseIntent(intent);
          if (!parsed) throw new Fallback('invalid-intent');
          return element('mtext', await application(parsed.ast, node, bindings(node), depth + 1));
        }
        for (const child of [...node.children]) node.replaceChild(await rewrite(child, depth + 1), child);
        return node;
      }
      const rewritten = await rewrite(working, 0);
      if (!annotations) throw new Fallback('no-authored-intent');
      const [speech] = await worker(serialize(wrap(rewritten)));
      if (!speech.trim()) throw new Fallback('empty-interpreted-speech');
      return { ...base, status: 'interpreted', reason: null, speech, concepts, workerCalls: calls, ...(config ? { templateRules } : {}) };
    } catch (error) {
      if (!(error instanceof Fallback)) throw error;
      return { ...base, status: 'native-fallback', reason: error.reason, speech: nativeSpeech, workerCalls: calls };
    }
  }
  scope.AccessibleMathsIntentSpeech = Object.freeze({ version: 1, LIMITS, REALISATION_LIMITS, supportedConcepts,
    normalizeLocale, validateRealisations, parseRealisations, buildExpressionBinding, matchingBrailleLiterals,
    literalQualification, interpret });
})();
