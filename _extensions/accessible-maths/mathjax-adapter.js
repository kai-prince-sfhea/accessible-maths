// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Kai Prince
// Experimental MathML annotation transport for the pinned MathJax 4.1.3 API.
// Load this blocking configuration script BEFORE Quarto's native maths loader.
// It never downloads/loads MathJax and makes no intent-aware speech claim.
(() => {
  'use strict';

  const EXPECTED_VERSION = '4.1.3';
  const MAX_ANNOTATIONS = 512;
  const MAX_ATTRIBUTE_LENGTH = 2048;
  const MAX_MML_LENGTH = 1024 * 1024;
  const MAX_DIAGNOSTICS = 100;
  // Read the blocking dependency's own configuration while currentScript is
  // available. No inline configuration or second MathJax loader is required.
  const requestedMathMLOutput = document.currentScript?.getAttribute('data-am-mathml-output') || 'internal';
  const state = {
    schemaVersion: 1,
    version: '0.0.4',
    requestedMathMLOutput,
    expectedMathJaxVersion: EXPECTED_VERSION,
    actualMathJaxVersion: null,
    status: 'configured',
    transportStatus: 'pending',
    annotationTransportStatus: 'pending',
    enrichmentStatus: 'pending',
    domTransportStatus: requestedMathMLOutput === 'assistive' ? 'pending' : 'not-requested',
    speechInterpretation: 'not-tested',
    runtime: { enrichmentEnabled: null, speechEnabled: null, brailleEnabled: null, explorerEnabled: null, assistiveMathMLEnabled: null },
    declarations: null,
    diagnostics: [],
    expressions: []
  };
  const items = new WeakMap();
  const mathErrors = new WeakSet();
  const copy = value => JSON.parse(JSON.stringify(value));
  let resolveReady;
  let settled = false;
  let deadline;
  const ready = new Promise(resolve => { resolveReady = resolve; });
  function diagnose(code, message, detail = {}, severity = 'error') {
    if (state.diagnostics.length < MAX_DIAGNOSTICS) {
      state.diagnostics.push({ code, severity, message, ...detail });
    }
  }
  function settle(status) {
    if (settled) return;
    settled = true;
    clearTimeout(deadline);
    state.status = status;
    if (status === 'error') {
      state.transportStatus = 'failed';
      state.annotationTransportStatus = 'failed';
      if (state.enrichmentStatus === 'pending') state.enrichmentStatus = 'failed';
      if (state.domTransportStatus === 'pending') state.domTransportStatus = 'failed';
    }
    resolveReady(copy(state));
  }

  // All returned data is a plain copy: browser tools cannot change the evidence
  // by mutating the arrays obtained through this diagnostic API.
  const api = Object.freeze({
    ready,
    snapshot: () => copy(state),
    get version() { return state.version; },
    get status() { return state.status; },
    get transportStatus() { return state.transportStatus; },
    get requestedMathMLOutput() { return state.requestedMathMLOutput; },
    get annotationTransportStatus() { return state.annotationTransportStatus; },
    get enrichmentStatus() { return state.enrichmentStatus; },
    get domTransportStatus() { return state.domTransportStatus; },
    get actualMathJaxVersion() { return state.actualMathJaxVersion; },
    get diagnostics() { return copy(state.diagnostics); },
    get expressions() { return copy(state.expressions); }
  });
  if (window.AccessibleMaths) {
    console.warn('Accessible Maths: a second adapter was not installed.');
    return;
  }
  window.AccessibleMaths = api;
  if (!['internal', 'assistive'].includes(requestedMathMLOutput)) {
    diagnose('invalid-output-mode', 'Unsupported MathML output mode; the adapter did not alter the native engine configuration.');
    settle('error');
    return;
  }

  // Deliberately bounded ASCII subset of the MathML 4 intent grammar:
  // names, numeric literals, $references and nested function applications.
  // Properties and Unicode NCNames remain unsupported in this first adapter.
  const namePattern = /^[A-Za-z_][A-Za-z0-9_.-]*$/;
  function parseIntent(value) {
    if (!value || value.length > MAX_ATTRIBUTE_LENGTH) return null;
    let position = 0;
    const references = [];
    const whitespace = () => { while (/\s/.test(value[position] || '') && position < value.length) position += 1; };
    function expression(depth) {
      if (depth > 32) return false;
      whitespace();
      const remaining = value.slice(position);
      let match;
      if ((match = remaining.match(/^\$([A-Za-z_][A-Za-z0-9_.-]*)/))) {
        references.push(match[1]);
      } else if (!(match = remaining.match(/^-?\d+(?:\.\d+)?/)) &&
                 !(match = remaining.match(/^[A-Za-z_][A-Za-z0-9_.-]*/))) {
        return false;
      }
      position += match[0].length;
      whitespace();
      if (value[position] === '(') {
        position += 1;
        whitespace();
        if (value[position] !== ')') {
          if (!expression(depth + 1)) return false;
          whitespace();
          while (value[position] === ',') {
            position += 1;
            if (!expression(depth + 1)) return false;
            whitespace();
          }
        }
        if (value[position] !== ')') return false;
        position += 1;
      }
      whitespace();
      return true;
    }
    return expression(0) && position === value.length ? { references: [...new Set(references)] } : null;
  }

  function attribute(node, name) {
    if (!node?.attributes) return null;
    const value = typeof node.attributes.getExplicit === 'function'
      ? node.attributes.getExplicit(name) : node.attributes.get(name);
    return value === undefined || value === null ? null : String(value);
  }
  function textContent(node) {
    if (!node) return '';
    if (node.kind === 'text') return String(node.getText());
    return (node.childNodes || []).map(textContent).join('');
  }
  function annotations(root, dom = false) {
    const result = [];
    const problems = [];
    const get = dom ? (node, name) => node.getAttribute(name) : attribute;
    const children = dom ? node => [...node.children] : node => node.childNodes || [];
    // Cache only within this checkpoint: later render actions can change the
    // tree, so evidence from an earlier phase must never be reused.
    let text;
    function content(node) {
      if (!node) return '';
      if (text?.has(node)) return text.get(node);
      const value = dom ? node.textContent : textContent(node);
      if (text) text.set(node, value);
      return value;
    }
    function referencedContent(node) {
      if (dom) return content(node);
      if (!node) return '';
      text ||= new WeakMap();
      if (text.has(node)) return text.get(node);
      const value = node.kind === 'text' ? String(node.getText())
        : (node.childNodes || []).map(referencedContent).join('');
      text.set(node, value);
      return value;
    }
    function scopedArguments(node) {
      const matches = new Map();
      function search(child) {
        const arg = get(child, 'arg');
        if (arg !== null) {
          if (!matches.has(arg)) matches.set(arg, []);
          matches.get(arg).push(child);
        }
        // MathML 4 references cannot reach through an intervening annotation.
        if (arg !== null || get(child, 'intent') !== null) return;
        children(child).forEach(search);
      }
      children(node).forEach(search);
      return matches;
    }
    function walk(node, path) {
      const intent = get(node, 'intent');
      const arg = get(node, 'arg');
      if (intent !== null || arg !== null) {
        const parsed = intent !== null ? parseIntent(intent) : null;
        // A referenced intent reuses descendant text for its bindings and
        // annotation entries. An unreferenced intent needs only its own value.
        const entry = { path, kind: dom ? node.localName : node.kind, intent, arg,
          text: parsed?.references.length ? referencedContent(node) : content(node), bindings: [] };
        if (intent !== null) {
          if (!parsed) problems.push({ code: 'invalid-intent', path });
          else if (parsed.references.length) {
            const scoped = scopedArguments(node);
            for (const role of parsed.references) {
              const matches = scoped.get(role) || [];
              entry.bindings.push({ role, count: matches.length, text: matches.map(content) });
              if (matches.length !== 1) problems.push({ code: matches.length ? 'ambiguous-arg' : 'unresolved-arg', path, role });
            }
          }
        }
        if (arg !== null && !namePattern.test(arg)) problems.push({ code: 'invalid-arg', path });
        result.push(entry);
      }
      children(node).forEach((child, index) => walk(child, `${path}/${index}`));
    }
    walk(root, '0');
    return { annotations: result, bindingDiagnostics: problems };
  }
  function signature(checkpoint) {
    // Enrichment may add/rearrange mrows. Compare attributes and their scoped
    // argument text rather than pretending tree paths are stable identities.
    return JSON.stringify(checkpoint.annotations.map(({ intent, arg, text, bindings }) =>
      ({ intent, arg, text, bindings })).map(JSON.stringify).sort());
  }
  function captureRuntime(document) {
    const enabled = name => typeof document.options[name] === 'boolean' ? document.options[name] : null;
    state.runtime.enrichmentEnabled = enabled('enableEnrichment');
    state.runtime.speechEnabled = enabled('enableSpeech');
    state.runtime.brailleEnabled = enabled('enableBraille');
    state.runtime.explorerEnabled = enabled('enableExplorer');
    state.runtime.assistiveMathMLEnabled = enabled('enableAssistiveMml');
  }
  function captureDeclarations() {
    const script = window.document.getElementById('accessible-maths-declarations');
    if (!script) return;
    try {
      if (script.type !== 'application/json' || script.textContent.length > MAX_MML_LENGTH) throw new Error('Unsupported declaration payload type or size.');
      const declarations = JSON.parse(script.textContent);
      if (declarations?.schemaVersion !== 1 || declarations.kind !== 'accessible-maths-declarations' ||
          !Array.isArray(declarations.objects) || !Array.isArray(declarations.occurrences)) throw new Error('Unsupported declaration payload structure.');
      // Explicit author declarations only. No expression/identity inference or
      // claim that this document fragment is a complete knowledge graph.
      state.declarations = declarations;
    } catch (error) {
      diagnose('invalid-declaration-payload', 'The inert author declaration payload could not be read.', { detail: String(error?.message || error) }, 'warning');
    }
  }
  function capture(math, document, phase) {
    if (!math?.root) return;
    try {
      const containsMathError = node => node.kind === 'merror' || (node.childNodes || []).some(containsMathError);
      if (!mathErrors.has(math) && containsMathError(math.root)) {
        mathErrors.add(math);
        diagnose('math-expression-error', 'MathJax retained a native mathematical error; successful annotation transport was not established for this expression.',
          { sourceTeX: String(math.math || '').slice(0, MAX_ATTRIBUTE_LENGTH) });
      }
      const inspected = annotations(math.root);
      let record = items.get(math);
      if (!record && !inspected.annotations.length && !/\\am(?:Intent|Arg)\b/.test(math.math || '')) return;
      if (!record) {
        if (state.expressions.length >= MAX_ANNOTATIONS) {
          diagnose('expression-limit', 'The annotation evidence limit was reached; transport is not fully checked.');
          return;
        }
        record = { id: `am-expression-${state.expressions.length + 1}`, sourceTeX: String(math.math || ''), display: Boolean(math.display), checkpoints: {} };
        items.set(math, record);
        state.expressions.push(record);
      }
      if (mathErrors.has(math)) record.nativeMathError = true;
      const mml = window.MathJax.startup.toMML(math.root);
      if (mml.length > MAX_MML_LENGTH) {
        diagnose('serialization-limit', 'An expression exceeds the diagnostic serialization limit.', { expression: record.id, phase });
        return;
      }
      record.checkpoints[phase] = {
        mathML: mml,
        ...inspected,
        enrichmentPerformed: Boolean(math.inputData?.enrichedMml)
      };
      for (const problem of inspected.bindingDiagnostics) {
        diagnose(problem.code, 'The authored annotation has an invalid or ambiguous argument scope.', { expression: record.id, phase, ...problem });
      }
      if (phase === 'postEnrichment') {
        record.originalMathML = typeof math.inputData?.originalMml === 'string' ? math.inputData.originalMml : null;
        record.enrichedMathML = typeof math.inputData?.enrichedMml === 'string' ? math.inputData.enrichedMml : null;
      }
      if (phase === 'finalSerialization') {
        const output = math.typesetRoot;
        const maths = output?.querySelectorAll ? [...output.querySelectorAll('math')] : [];
        record.accessibleOutput = {
          ariaLabel: output?.getAttribute?.('aria-label') || null,
          speechLabelCount: output?.querySelectorAll?.('[aria-label]').length || 0,
          // These are actual MathML elements in the output, if present. The
          // serialized internal tree alone is not an accessible-DOM claim.
          mathMLElements: maths.map(node => {
            let ancestor = node;
            let hiddenWithinOutput = false;
            while (ancestor) {
              if (ancestor.getAttribute('aria-hidden') === 'true') hiddenWithinOutput = true;
              if (ancestor === output) break;
              ancestor = ancestor.parentElement;
            }
            return { namespace: node.namespaceURI, intent: node.getAttribute('intent'), arg: node.getAttribute('arg'),
              hiddenWithinOutput, ...annotations(node, true) };
          }),
          visualMathAriaHidden: output?.querySelector?.('mjx-math')?.getAttribute('aria-hidden') || null,
          speechInterpretation: 'not-tested'
        };
      }
      captureRuntime(document);
    } catch (error) {
      diagnose('checkpoint-error', 'A MathML transport checkpoint could not be captured.', { phase, detail: String(error?.message || error) });
    }
  }
  function action(phase) {
    return [phase === 'preEnrichment' ? 21 : phase === 'postEnrichment' ? 31 : 201,
      document => { for (const math of document.math) capture(math, document, phase); },
      (math, document) => capture(math, document, phase)];
  }
  function finish() {
    if (settled) return;
    const document = window.MathJax.startup.document;
    captureRuntime(document);
    captureDeclarations();
    for (const math of document.math) capture(math, document, 'finalSerialization');
    let failed = state.diagnostics.some(entry => entry.severity === 'error');
    let untested = !state.expressions.length;
    let annotationFailed = failed;
    let domFailed = failed;
    let enrichmentPerformed = Boolean(state.expressions.length);
    for (const record of state.expressions) {
      const { preEnrichment: before, postEnrichment: after, finalSerialization: final } = record.checkpoints;
      if (!before || !after || !final) {
        failed = true;
        annotationFailed = true;
        domFailed = true;
        enrichmentPerformed = false;
        diagnose('missing-checkpoint', 'Not every MathML transport checkpoint was observed.', { expression: record.id });
        continue;
      }
      if (!after.enrichmentPerformed) { untested = true; enrichmentPerformed = false; }
      record.annotationTransportPreserved = signature(before) === signature(final);
      record.transportPreserved = signature(before) === signature(after) && signature(before) === signature(final);
      if (!record.transportPreserved) {
        failed = true;
        annotationFailed = true;
        diagnose('annotation-changed', 'MathML attributes or scoped argument bindings changed during transport.', { expression: record.id });
      }
      if (requestedMathMLOutput === 'assistive') {
        const output = record.accessibleOutput;
        const maths = output?.mathMLElements || [];
        record.domTransportPreserved = record.annotationTransportPreserved && maths.length === 1 &&
          maths[0].namespace === 'http://www.w3.org/1998/Math/MathML' &&
          !maths[0].hiddenWithinOutput && !maths[0].bindingDiagnostics.length &&
          signature(final) === signature(maths[0]) && output.visualMathAriaHidden === 'true';
        if (!record.domTransportPreserved) {
          domFailed = true;
          diagnose('dom-annotation-changed', 'The requested assistive MathML did not retain the authored annotation and scoped bindings in its exposed DOM representation.', { expression: record.id });
        }
        if (output?.ariaLabel || output?.speechLabelCount) {
          domFailed = true;
          diagnose('multiple-accessible-representations', 'Assistive MathML and generated speech labels are both present; exclusive initial output was not established.', { expression: record.id });
        }
      }
    }
    state.transportStatus = failed ? 'failed' : untested ? 'not-tested' : 'preserved';
    state.annotationTransportStatus = annotationFailed ? 'failed' : !state.expressions.length ? 'not-tested' : 'preserved';
    state.enrichmentStatus = state.diagnostics.some(entry => entry.code === 'enrichment-error') ? 'failed' : enrichmentPerformed ? 'performed' : 'not-tested';
    if (requestedMathMLOutput === 'assistive') {
      if (state.runtime.enrichmentEnabled !== false || state.runtime.speechEnabled !== false ||
          state.runtime.brailleEnabled !== false || state.runtime.explorerEnabled !== false || state.runtime.assistiveMathMLEnabled !== true) {
        domFailed = true;
        diagnose('output-mode-mismatch', 'The native engine did not retain the requested initial assistive-only accessibility settings.');
      }
      state.domTransportStatus = domFailed ? 'failed' : !state.expressions.length ? 'not-tested' : 'preserved';
    }
    settle('ready');
  }

  const configured = window.MathJax || {};
  if (configured.version || configured.startup?.document) {
    state.actualMathJaxVersion = configured.version || null;
    diagnose('engine-already-started', 'The adapter must precede the native MathJax loader; no second engine was loaded.');
    settle('error');
    return;
  }
  const originalStartup = configured.startup || {};
  const originalReady = originalStartup.ready;
  const originalPageReady = originalStartup.pageReady;
  const originalOptions = configured.options || {};
  const originalEnrichError = originalOptions.enrichError;
  const originalCompileError = originalOptions.compileError;
  const packages = configured.tex?.packages;
  if (Array.isArray(packages)) {
    if (!packages.includes('accessible-maths')) packages.push('accessible-maths');
  } else {
    configured.tex = { ...(configured.tex || {}), packages: { ...(packages || {}), '[+]': [...new Set([...(packages?.['[+]'] || []), 'accessible-maths'])] } };
  }
  configured.options = {
    ...originalOptions,
    ...(requestedMathMLOutput === 'assistive' ? {
      enableExplorer: false,
      menuOptions: {
        ...(originalOptions.menuOptions || {}),
        settings: { ...(originalOptions.menuOptions?.settings || {}), enrich: false, speech: false, braille: false, assistiveMml: true }
      }
    } : {}),
    renderActions: {
      ...(originalOptions.renderActions || {}),
      accessibleMathsBefore: action('preEnrichment'),
      accessibleMathsAfter: action('postEnrichment'),
      accessibleMathsFinal: action('finalSerialization')
    },
    enrichError(document, math, error) {
      diagnose('enrichment-error', 'MathJax enrichment failed; the transport experiment did not pass.', { detail: String(error?.message || error) });
      return originalEnrichError ? originalEnrichError(document, math, error) : document.enrichError(document, math, error);
    },
    compileError(document, math, error) {
      diagnose('compile-error', 'MathJax could not compile an expression.', { detail: String(error?.message || error) });
      return originalCompileError ? originalCompileError(document, math, error) : document.compileError(math, error);
    }
  };
  configured.startup = {
    ...originalStartup,
    ready() {
      const engine = window.MathJax;
      state.status = 'initializing';
      state.actualMathJaxVersion = engine.version || null;
      if (engine.version !== EXPECTED_VERSION) {
        diagnose('engine-version-mismatch', `This experimental adapter requires MathJax ${EXPECTED_VERSION}; no replacement engine was loaded.`);
        settle('error');
        return;
      }
      try {
        const { CommandMap } = engine._.input.tex.TokenMap;
        const { Configuration } = engine._.input.tex.Configuration;
        const annotate = (parser, name, type) => {
          const value = parser.GetArgument(name);
          const body = parser.ParseArg(name);
          const wrapper = parser.create('node', 'mrow', [body], {});
          const valid = type === 'intent' ? Boolean(parseIntent(value)) : value.length <= MAX_ATTRIBUTE_LENGTH && namePattern.test(value);
          if (valid) wrapper.attributes.set(type, value);
          else diagnose(`invalid-${type}`, 'Unsupported or malformed annotation was omitted; its mathematical body was retained.');
          parser.Push(wrapper);
        };
        new CommandMap('accessibleMathsMap', { amIntent: [annotate, 'intent'], amArg: [annotate, 'arg'] });
        Configuration.create('accessible-maths', { handler: { macro: ['accessibleMathsMap'] } });
        if (originalReady) originalReady.call(this);
        else engine.startup.defaultReady();
        engine.startup.promise.catch(error => {
          diagnose('startup-error', 'MathJax startup failed.', { detail: String(error?.message || error) });
          settle('error');
        });
      } catch (error) {
        diagnose('adapter-error', 'The pinned MathJax adapter could not initialize.', { detail: String(error?.message || error) });
        settle('error');
        throw error;
      }
    },
    pageReady() {
      return Promise.resolve().then(() => originalPageReady
        ? originalPageReady.call(this) : window.MathJax.startup.defaultPageReady()).then(finish, error => {
        diagnose('typeset-error', 'MathJax did not complete initial typesetting.', { detail: String(error?.message || error) });
        settle('error');
        throw error;
      });
    }
  };
  window.MathJax = configured;
  deadline = setTimeout(() => {
    diagnose('startup-timeout', 'MathJax did not complete the experiment within 30 seconds. Check the native loader, network and content security policy.');
    settle('error');
  }, 30000);
})();
