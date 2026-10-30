// Copyright 2026 Kai Prince. SPDX-License-Identifier: Apache-2.0
// Original bounded parser for MathML 4 WD 2026-10-02, section 5.1.
// XML 1.0 Fifth Edition NCNames; no normalization, evaluation or speech rules.
(() => {
  'use strict';
  const scope = globalThis;
  if (scope.AccessibleMathsIntentGrammar) return;
  const LIMITS = Object.freeze({maxBytes:2048,maxDepth:32,maxNodes:512,maxProperties:128,maxArguments:128,maxNameBytes:512});
  const start = cp => cp === 95 || cp >= 65 && cp <= 90 || cp >= 97 && cp <= 122 ||
    cp >= 0xc0 && cp <= 0xd6 || cp >= 0xd8 && cp <= 0xf6 || cp >= 0xf8 && cp <= 0x2ff ||
    cp >= 0x370 && cp <= 0x37d || cp >= 0x37f && cp <= 0x1fff || cp >= 0x200c && cp <= 0x200d ||
    cp >= 0x2070 && cp <= 0x218f || cp >= 0x2c00 && cp <= 0x2fef || cp >= 0x3001 && cp <= 0xd7ff ||
    cp >= 0xf900 && cp <= 0xfdcf || cp >= 0xfdf0 && cp <= 0xfffd || cp >= 0x10000 && cp <= 0xeffff;
  const continuation = cp => start(cp) || cp === 45 || cp === 46 || cp >= 48 && cp <= 57 ||
    cp === 0xb7 || cp >= 0x300 && cp <= 0x36f || cp >= 0x203f && cp <= 0x2040;
  function characters(value, maximum) {
    if (typeof value !== 'string' || !value.length || value.length > maximum) return null;
    const chars = []; let bytes = 0;
    for (const char of value) {
      const cp = char.codePointAt(0); if (cp >= 0xd800 && cp <= 0xdfff) return null;
      bytes += cp <= 0x7f ? 1 : cp <= 0x7ff ? 2 : cp <= 0xffff ? 3 : 4;
      if (bytes > maximum) return null; chars.push(char);
    }
    return chars;
  }
  function isNCName(value, maxBytes = LIMITS.maxNameBytes) {
    if (!Number.isInteger(maxBytes) || maxBytes < 1 || maxBytes > LIMITS.maxNameBytes) return false;
    const chars = characters(value, maxBytes);
    return Boolean(chars && start(chars[0].codePointAt(0)) && chars.slice(1).every(char => continuation(char.codePointAt(0))));
  }
  function parseIntent(value) {
    const chars = characters(value, LIMITS.maxBytes); if (!chars) return null;
    const invalid = () => { throw new Error('invalid-intent'); };
    const whitespace = char => char === ' ' || char === '\t' || char === '\r' || char === '\n';
    const digit = char => char !== undefined && char >= '0' && char <= '9';
    let position = 0, nodes = 0, properties = 0, argumentsCount = 0;
    const references = [], counts = new Map();
    const skip = () => { while (whitespace(chars[position])) position++; };
    const node = value => { if (++nodes > LIMITS.maxNodes) invalid(); return { ...value, properties: [] }; };
    function name() {
      const first = position; if (!chars[position] || !start(chars[position].codePointAt(0))) invalid(); position++;
      while (chars[position] && continuation(chars[position].codePointAt(0))) position++;
      const value = chars.slice(first, position).join(''); if (!characters(value, LIMITS.maxNameBytes)) invalid(); return value;
    }
    function property(target) {
      if (chars[position] !== ':' || ++properties > LIMITS.maxProperties) invalid(); position++;
      target.properties.push(name());
    }
    function expression(depth) {
      if (depth > LIMITS.maxDepth) invalid(); skip(); let result;
      if (chars[position] === '$') {
        position++; const value = name(); result = node({kind:'reference',name:value});
        if (!counts.has(value)) { references.push(value); counts.set(value, 0); } counts.set(value, counts.get(value) + 1);
      } else if (chars[position] === '-' || digit(chars[position])) {
        const first = position; if (chars[position] === '-') position++;
        if (!digit(chars[position])) invalid(); while (digit(chars[position])) position++;
        if (chars[position] === '.' && digit(chars[position + 1])) { position++; while (digit(chars[position])) position++; }
        result = node({kind:'number',value:chars.slice(first,position).join('')});
      } else {
        const value = name(); result = node({kind:value.startsWith('_')?'literal':'concept',name:value});
      }
      for (;;) {
        skip(); if (chars[position] === ':') { property(result); continue; }
        if (chars[position] !== '(') return result;
        position++; skip(); const args = [];
        if (chars[position] !== ')') {
          for (;;) {
            if (++argumentsCount > LIMITS.maxArguments) invalid(); args.push(expression(depth + 1)); skip();
            if (chars[position] !== ',') break; position++;
          }
        }
        if (chars[position] !== ')') invalid(); position++;
        result = node({kind:'application',head:result,args});
      }
    }
    try {
      skip(); let ast;
      if (chars[position] === ':') { ast = node({kind:'self-properties'}); do { property(ast); skip(); } while (chars[position] === ':'); }
      else ast = expression(0);
      skip(); if (position !== chars.length) invalid();
      // Application heads can themselves be applications. Bound actual AST
      // depth too, rather than only recursive argument parsing depth.
      const pending = [{node:ast,depth:1}];
      while (pending.length) { const item = pending.pop(); if (item.depth > LIMITS.maxDepth) invalid();
        if (item.node.kind === 'application') for (const child of [item.node.head,...item.node.args]) pending.push({node:child,depth:item.depth+1}); }
      return {ast,references,referenceCounts:references.map(name=>({name,count:counts.get(name)}))};
    } catch { return null; }
  }
  scope.AccessibleMathsIntentGrammar = Object.freeze({version:1,LIMITS,isNCName,parseIntent});
})();
