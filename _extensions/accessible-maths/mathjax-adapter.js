// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Kai Prince
// Experimental MathML annotation transport for the pinned MathJax 4.1.3 API.
// Load this blocking configuration script BEFORE Quarto's native maths loader.
// It never downloads/loads MathJax. Optional finite intent transcripts are
// independent of annotation transport and leave native accessible output intact.
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
  const intentSpeechEnabled = document.currentScript?.getAttribute('data-am-intent-speech') === 'true';
  const realisationsId = document.currentScript?.getAttribute('data-am-realisations') || null;
  const grammar = globalThis.AccessibleMathsIntentGrammar;
  const intentSpeech = globalThis.AccessibleMathsIntentSpeech;
  const SPEECH_TIMEOUT = 20000;
  const state = {
    schemaVersion: 1,
    version: '0.0.9',
    requestedMathMLOutput,
    expectedMathJaxVersion: EXPECTED_VERSION,
    actualMathJaxVersion: null,
    status: 'configured',
    transportStatus: 'pending',
    annotationTransportStatus: 'pending',
    enrichmentStatus: 'pending',
    domTransportStatus: requestedMathMLOutput === 'assistive' ? 'pending' : 'not-requested',
    // Native engine/ARIA interpretation is an independent, untested verdict.
    // Explicit finite transcript requests are recorded per expression instead.
    speechInterpretation: 'not-tested',
    intentSpeech: { enabled: intentSpeechEnabled, language: 'en',
      builtinSupportedConcepts: [...(intentSpeech?.supportedConcepts || [])],
      supportedConcepts: [...(intentSpeech?.supportedConcepts || [])],
      localePolicy: realisationsId === null ? 'legacy-english' : 'exact-author-language',
      localeAdmission: 'checked-per-expression-request', maxConcurrent: 1 },
    runtime: { enrichmentEnabled: null, speechEnabled: null, brailleEnabled: null, explorerEnabled: null, assistiveMathMLEnabled: null },
    declarations: null,
    diagnostics: [],
    expressions: []
  };
  const items = new WeakMap();
  const speechItems = new Map();
  const mathErrors = new WeakSet();
  const addedApplicationPolicies = new WeakMap();
  let activeSpeech = null;
  let expressionOrdinal = 0, refreshScheduled = false, refreshing = false;
  function discardControls(item) {
    item.controls?.braille?.invalidate();
    item.controls?.container?.remove?.();
    item.controls = null;
  }
  function retireAbsentItems(document) {
    const current = new Set(document.math);
    for (const [id,item] of speechItems) if (!current.has(item.math) || item.math.typesetRoot?.isConnected === false) {
      if (activeSpeech?.item === item) activeSpeech.expired = true;
      discardControls(item); speechItems.delete(id); items.delete(item.math);
    }
    state.expressions = state.expressions.filter(record => speechItems.has(record.id));
  }
  function scheduleRefresh() {
    if (!settled || state.status === 'error' || refreshing || refreshScheduled) return;
    refreshScheduled = true;
    Promise.resolve().then(() => { refreshScheduled = false; if (state.status !== 'error') finish(); });
  }
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
    requestIntentSpeech,
    getExpressionBinding,
    requestBrailleLiterals,
    exportBrailleLiterals,
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
  if (grammar?.version !== 1 || typeof grammar.parseIntent !== 'function' || typeof grammar.isNCName !== 'function') {
    diagnose('intent-grammar-unavailable', 'The intent grammar dependency must precede the MathJax adapter.');
    settle('error');
    return;
  }
  if (intentSpeechEnabled && (intentSpeech?.version !== 1 || typeof intentSpeech.interpret !== 'function')) {
    diagnose('intent-speech-unavailable', 'The opt-in intent transcript helper must precede the MathJax adapter.');
    settle('error');
    return;
  }

  const parseIntent = value => grammar.parseIntent(value);

  function readRealisations() {
    if (realisationsId === null) return { mapped: false, valid: true, raw: null, config: null };
    if (realisationsId !== 'accessible-maths-realisations' || typeof intentSpeech?.parseRealisations !== 'function') return { mapped: true, valid: false, raw: null, config: null };
    const element = window.document.getElementById(realisationsId);
    if (!element || element.type !== 'application/json' || typeof element.textContent !== 'string') return { mapped: true, valid: false, raw: null, config: null };
    const raw = element.textContent;
    try { return { mapped: true, valid: true, raw, config: intentSpeech.parseRealisations(raw) }; }
    catch { return { mapped: true, valid: false, raw, config: null }; }
  }
  function sameRealisations(previous) {
    if (!previous.mapped) return realisationsId === null;
    const element = window.document.getElementById(realisationsId);
    return element?.type === 'application/json' && element.textContent === previous.raw;
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
  function hasSemanticAddedAttribute(root) {
    if (attribute(root, 'data-semantic-added') !== null) return true;
    return (root?.childNodes || []).some(hasSemanticAddedAttribute);
  }
  function annotations(root, dom = false, normalizeAddedApplication = false) {
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
    // The pinned native enrichment can insert an invisible application token.
    // Preserve raw checkpoint text/MathML and normalize only a new exact SRE
    // marker after a source checkpoint with no preexisting added markers. Other
    // invisible characters, visible tokens, annotation roles and authored text
    // remain significant. This is not a generic presentation equivalence rule.
    const transportText = new WeakMap();
    function transportContent(node) {
      if (!node) return '';
      if (!normalizeAddedApplication) return content(node);
      if (transportText.has(node)) return transportText.get(node);
      const kind = dom ? node.localName : node.kind;
      const childNodes = node.childNodes || [];
      const leaf = childNodes.length === 1 && (dom
        ? childNodes[0].nodeType === 3 && childNodes[0].nodeValue === '\u2061'
        : childNodes[0].kind === 'text' && childNodes[0].getText() === '\u2061');
      const added = kind === 'mo' && leaf && get(node, 'intent') === null && get(node, 'arg') === null &&
        get(node, 'data-semantic-added') === 'true' && get(node, 'data-semantic-type') === 'punctuation' &&
        get(node, 'data-semantic-role') === 'application' && get(node, 'data-semantic-operator') === 'appl';
      const value = added ? '' : dom
        ? node.nodeType === 3 ? String(node.nodeValue) : [...childNodes].map(transportContent).join('')
        : kind === 'text' ? String(node.getText()) : childNodes.map(transportContent).join('');
      transportText.set(node, value);
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
          text: parsed?.references.length ? referencedContent(node) : content(node),
          transportText: transportContent(node), bindings: [] };
        if (intent !== null) {
          if (!parsed) problems.push({ code: 'invalid-intent', path });
          else if (parsed.references.length) {
            const scoped = scopedArguments(node);
            for (const role of parsed.references) {
              const matches = scoped.get(role) || [];
              entry.bindings.push({ role, count: matches.length, text: matches.map(content), transportText: matches.map(transportContent) });
              if (matches.length !== 1) problems.push({ code: matches.length ? 'ambiguous-arg' : 'unresolved-arg', path, role });
            }
          }
        }
        if (arg !== null && !grammar.isNCName(arg)) problems.push({ code: 'invalid-arg', path });
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
    return JSON.stringify(checkpoint.annotations.map(({ intent, arg, text, transportText, bindings }) =>
      ({ intent, arg, text: transportText ?? text, bindings: bindings.map(binding => ({ role: binding.role, count: binding.count, text: binding.transportText ?? binding.text })) })).map(JSON.stringify).sort());
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
      if (phase === 'preEnrichment') addedApplicationPolicies.set(math, !hasSemanticAddedAttribute(math.root));
      const normalizeAddedApplication = phase !== 'preEnrichment' && addedApplicationPolicies.get(math) === true &&
        typeof math.inputData?.enrichedMml === 'string';
      const inspected = annotations(math.root, false, normalizeAddedApplication);
      let record = items.get(math);
      if (!record && !inspected.annotations.length && !/\\am(?:Intent|Arg)\b/.test(math.math || '')) return;
      if (!record) {
        if (state.expressions.length >= MAX_ANNOTATIONS) {
          diagnose('expression-limit', 'The annotation evidence limit was reached; transport is not fully checked.');
          return;
        }
        record = { id: `am-expression-${++expressionOrdinal}`, sourceTeX: String(math.math || ''), display: Boolean(math.display), checkpoints: {} };
        items.set(math, record);
        state.expressions.push(record);
      }
      if (mathErrors.has(math)) record.nativeMathError = true;
      const mml = window.MathJax.startup.toMML(math.root);
      if (mml.length > MAX_MML_LENGTH) {
        diagnose('serialization-limit', 'An expression exceeds the diagnostic serialization limit.', { expression: record.id, phase });
        return;
      }
      if (phase === 'preEnrichment') {
        record.sourceTeX = String(math.math || ''); record.display = Boolean(math.display);
        record.checkpoints = {};
      }
      record.checkpoints[phase] = {
        mathML: mml,
        ...inspected,
        enrichmentPerformed: Boolean(math.inputData?.enrichedMml)
      };
      let captured = speechItems.get(record.id);
      if (!captured) {
        captured = { math, document, record, revision: 0, controls: null };
        speechItems.set(record.id, captured);
      }
      if (phase === 'preEnrichment') {
        captured.revision += 1;
        captured.mathML = mml;
        if (captured.controls) {
          captured.controls.output.hidden = true;
          captured.controls.button.setAttribute('aria-expanded', 'false');
          captured.controls.braille?.invalidate();
        }
      }
      captured.math = math;
      captured.document = document;
      if (phase === 'finalSerialization') {
        if (captured.controls && captured.controls.forRoot !== math.typesetRoot) discardControls(captured);
        captured.completedRevision = captured.revision;
        captured.completedRoot = math.root;
        captured.completedTeX = math.math;
        captured.normalizeAddedApplication = normalizeAddedApplication;
      }
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
              hiddenWithinOutput, ...annotations(node, true, normalizeAddedApplication) };
          }),
          visualMathAriaHidden: output?.querySelector?.('mjx-math')?.getAttribute('aria-hidden') || null,
          speechInterpretation: 'not-tested'
        };
      }
      captureRuntime(document);
      if (phase === 'finalSerialization') scheduleRefresh();
    } catch (error) {
      diagnose('checkpoint-error', 'A MathML transport checkpoint could not be captured.', { phase, detail: String(error?.message || error) });
    }
  }
  function action(phase) {
    return [phase === 'preEnrichment' ? 21 : phase === 'postEnrichment' ? 31 : 201,
      document => { for (const math of document.math) capture(math, document, phase); if (phase === 'finalSerialization') scheduleRefresh(); },
      (math, document) => capture(math, document, phase)];
  }
  function finish() {
    if (refreshing || settled && state.status === 'error') return;
    const document = window.MathJax.startup.document;
    retireAbsentItems(document);
    refreshing = true;
    captureRuntime(document);
    captureDeclarations();
    for (const math of document.math) capture(math, document, 'finalSerialization');
    refreshing = false;
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
    if (intentSpeechEnabled) {
      const realisations = readRealisations();
      state.intentSpeech.configurationStatus = realisations.mapped ? realisations.valid ? 'author-mapping' : 'invalid-author-mapping' : 'legacy-english';
      if (realisations.mapped) {
        state.intentSpeech.supportedConcepts = realisations.valid ? [...new Set([
          ...(intentSpeech.normalizeLocale(realisations.config.language).split('-')[0] === 'en' ? intentSpeech.supportedConcepts : []),
          ...realisations.config.rules.map(rule => rule.concept)
        ])] : [];
        if (realisations.valid) state.intentSpeech.language = realisations.config.language;
      }
    }
    if (intentSpeechEnabled) for (const item of speechItems.values()) addSpeechControls(item);
  }

  function speechResult(expressionId, language, status, reason = null, extra = {}) {
    return { schemaVersion: 1, expressionId, language, status, reason,
      speech: null, nativeSpeech: null, braille: null, brailleSource: null, concepts: [], ...extra };
  }
  function publishSpeech(item, result) {
    if (item) item.record.intentSpeech = copy(result);
    const controls = item?.controls;
    if (controls) {
      controls.button.disabled = false;
      controls.output.hidden = false;
      controls.button.setAttribute('aria-expanded', 'true');
      controls.output.replaceChildren();
      const text = (className, value) => {
        const span = window.document.createElement('span');
        span.className = className; span.textContent = value;
        controls.output.appendChild(span);
      };
      if (result.status === 'interpreted' || result.status === 'native-fallback') {
        text('am-intent-speech-transcript', `${result.status === 'interpreted' ? 'Experimental meaning transcript' : 'Native presentation reading'}: ${result.speech}`);
        if (result.braille !== null) text('am-intent-speech-braille', ` Presentation braille: ${result.braille}`);
        if (result.status === 'native-fallback') text('am-intent-speech-status', ' A supported meaning could not be determined for the complete expression. The native reading is shown.');
      } else {
        const message = result.reason === 'native-speech-disabled'
          ? 'MathJax speech is disabled. You can change it through the mathematics accessibility menu, then request a transcript again.'
          : result.reason === 'invalid-or-missing-realisations'
            ? 'The authored reading configuration is missing or invalid. Native mathematics remains available.'
          : result.reason === 'native-language-mismatch'
            ? 'The native mathematics reading language does not match the reviewed templates. Native mathematics remains available; its accessibility menu controls the reading language.'
          : result.reason === 'unsupported-language' || result.reason === 'native-language-not-english'
            ? 'These experimental transcripts currently support English. Native mathematics remains available.'
            : result.status === 'busy' ? 'MathJax is still preparing another transcript. Try again when it finishes.'
              : result.status === 'stale' ? 'The mathematics or reading settings changed. Request a new transcript.'
                : result.status === 'not-ready' ? 'The mathematics is still loading. Try again when it is ready.'
                  : result.status === 'disabled' ? 'Experimental transcripts are not enabled for this page.'
                    : result.reason === 'speech-time-limit' ? 'The transcript request timed out. Native mathematics remains available.'
                      : 'A transcript could not be produced for this expression. Native mathematics remains available.';
        text('am-intent-speech-status', message);
      }
    }
    return copy(result);
  }
  function addSpeechControls(item) {
    const output = item.math.typesetRoot;
    if (item.controls || !output?.parentNode || !window.document.createElement) return;
    const controls = window.document.createElement('span');
    controls.className = 'am-intent-speech-controls';
    const button = window.document.createElement('button');
    button.type = 'button'; button.className = 'am-intent-speech-request';
    button.textContent = 'Show meaning transcript';
    const transcript = window.document.createElement('span');
    transcript.className = 'am-intent-speech-result'; transcript.hidden = true;
    // Do not put this optional transcript inside MathJax's accessible tree or
    // give it an automatic live region/ARIA label. Readers request it explicitly.
    let suffix = 1;
    let id = `${item.record.id}-meaning`;
    while (window.document.getElementById(id)) id = `${item.record.id}-meaning-${++suffix}`;
    transcript.id = id;
    button.setAttribute('aria-controls', id); button.setAttribute('aria-expanded', 'false');
    button.addEventListener('click', () => { void requestIntentSpeech(item.record.id); });
    controls.appendChild(button); controls.appendChild(transcript);
    output.parentNode.insertBefore(controls, output.nextSibling);
    item.controls = { button, output: transcript, container: controls, forRoot: output };
    if (realisationsId !== null) addBrailleControls(item, controls);
  }
  function speechPreferences(document, math) {
    const options = document?.options || {};
    const locale = options.sre?.locale;
    return JSON.stringify({ enrichment: options.enableEnrichment, speech: options.enableSpeech,
      braille: options.enableBraille, sre: options.sre || null, locale,
      pool: math.generatorPool?.options || null });
  }
  async function requestIntentSpeech(expressionId, options = {}) {
    const realisations = readRealisations();
    const language = options?.language === undefined ? realisations.config?.language || 'en' : options.language;
    const id = typeof expressionId === 'string' ? expressionId.slice(0, 128) : '';
    const item = speechItems.get(id);
    const result = (status, reason = null, extra) => publishSpeech(item, speechResult(id, typeof language === 'string' ? language : null, status, reason, extra));
    if (!intentSpeechEnabled) return result('disabled', 'author-option-disabled');
    if (!realisations.valid) return result('unavailable', 'invalid-or-missing-realisations');
    if (realisations.mapped ? !intentSpeech.normalizeLocale(language) || intentSpeech.normalizeLocale(language) !== intentSpeech.normalizeLocale(realisations.config.language) : language !== 'en') return result('unavailable', 'unsupported-language');
    if (!settled || state.status !== 'ready') return result('not-ready', 'transport-not-ready');
    if (!item) return result('unknown-expression', 'expression-not-captured');
    const { math, document, record } = item;
    if (item.completedRevision !== item.revision) return result('not-ready', 'expression-render-in-progress');
    if (item.completedRoot !== math.root || item.completedTeX !== math.math) return result('stale', 'expression-no-longer-current');
    if (record.nativeMathError || !record.annotationTransportPreserved ||
        record.checkpoints.preEnrichment?.bindingDiagnostics.length ||
        !record.checkpoints.preEnrichment || !record.checkpoints.finalSerialization ||
        signature(record.checkpoints.preEnrichment) !== signature(record.checkpoints.finalSerialization)) return result('unavailable', 'invalid-or-unpreserved-annotations');
    const current = document?.options || {};
    const poolOptions = math.generatorPool?.options || {};
    if (current.enableEnrichment !== true || current.enableSpeech !== true || poolOptions.enableSpeech === false) return result('unavailable', 'native-speech-disabled');
    // A reviewed mapping needs the initialized generator's actual option,
    // rather than guessing its locale from a document-level preference.
    const locale = realisations.mapped ? poolOptions.locale : poolOptions.locale ?? current.sre?.locale;
    if (realisations.mapped ? intentSpeech.normalizeLocale(locale, { native: true }) !== intentSpeech.normalizeLocale(realisations.config.language) : typeof locale !== 'string' || !/^en(?:[-_][A-Za-z0-9]+)*$/.test(locale)) return result('unavailable', realisations.mapped ? 'native-language-mismatch' : 'native-language-not-english');
    if (typeof math.speechFor !== 'function' || !math.generatorPool?.webworker || !document.webworker) return result('unavailable', 'native-speech-worker-unavailable');
    if (!item.mathML) return result('unavailable', 'original-presentation-unavailable');
    if (activeSpeech) {
      if (activeSpeech.item === item && !activeSpeech.expired) return activeSpeech.result;
      return result('busy', 'native-worker-request-in-progress');
    }
    const revision = item.revision, root = math.root, tex = math.math;
    const preferences = speechPreferences(document, math);
    const isCurrent = () => {
      if (revision !== item.revision || math.root !== root || math.math !== tex || math.typesetRoot?.isConnected === false ||
          speechPreferences(document, math) !== preferences || !sameRealisations(realisations) || ![...document.math].includes(math)) return false;
      try { return window.MathJax.startup.toMML(math.root) === record.checkpoints.finalSerialization.mathML && signature(annotations(math.root, false, item.normalizeAddedApplication)) === signature(record.checkpoints.finalSerialization); }
      catch { return false; }
    };
    if (!isCurrent()) return result('stale', 'expression-no-longer-current');
    const lease = { item, expired: false, result: null };
    activeSpeech = lease;
    item.record.intentSpeech = speechResult(id, language, 'loading');
    if (item.controls) item.controls.button.disabled = true;
    let timeout;
    const work = Promise.resolve().then(() => intentSpeech.interpret(item.mathML, {
      language,
      ...(realisations.mapped ? { configuration: realisations.config } : {}),
      speak: value => {
        if (lease.expired) throw new Error('request-expired');
        if (!isCurrent()) throw new Error('expression-changed');
        return math.speechFor(value);
      }
    }));
    // A timeout ends our result, not MathJax's shared worker. Retain its lease
    // until the real operation settles and prevent every subsequent worker call.
    const timed = new Promise((_, reject) => { timeout = setTimeout(() => {
      lease.expired = true; reject(new Error('speech-time-limit'));
    }, SPEECH_TIMEOUT); });
    lease.result = Promise.race([work, timed]).then(interpreted => {
      if (!isCurrent()) return result('stale', 'expression-or-preferences-changed');
      const brailleEnabled = current.enableBraille === true && poolOptions.enableBraille !== false;
      return result(interpreted.status, interpreted.reason, { ...interpreted, expressionId: id,
        nativeLocale: locale, localePolicy: realisations.mapped ? 'exact-author-language' : 'legacy-english',
        braille: brailleEnabled ? interpreted.braille : null,
        brailleSource: brailleEnabled ? 'original-presentation' : null,
        brailleStatus: brailleEnabled ? 'presentation' : 'disabled' });
    }, error => !isCurrent() ? result('stale', 'expression-or-preferences-changed')
      : result('failed', error?.message === 'speech-time-limit' ? 'speech-time-limit' : 'native-worker-or-interpretation-failed'))
      .finally(() => { clearTimeout(timeout); });
    work.then(() => { if (activeSpeech === lease) activeSpeech = null; }, () => { if (activeSpeech === lease) activeSpeech = null; });
    return lease.result;
  }

  // Literal braille is a separately reviewed text artifact. It never calls the
  // shared speech worker or substitutes for native ARIA/presentation braille.
  function bindingContext(expressionId) {
    const id = typeof expressionId === 'string' ? expressionId.slice(0, 128) : '', item = speechItems.get(id);
    const refused = (status, reason) => ({ id, item, status, reason });
    if (!intentSpeechEnabled) return refused('disabled', 'author-option-disabled');
    if (!settled || state.status !== 'ready') return refused('not-ready', 'transport-not-ready');
    if (!item) return refused('unknown-expression', 'expression-not-captured');
    const realisations = readRealisations();
    if (!realisations.valid) return refused('unavailable', 'invalid-or-missing-realisations');
    const { math, document, record } = item, before = record.checkpoints.preEnrichment, final = record.checkpoints.finalSerialization;
    if (item.completedRevision !== item.revision) return refused('not-ready', 'expression-render-in-progress');
    if (item.completedRoot !== math.root || item.completedTeX !== math.math) return refused('stale', 'expression-no-longer-current');
    if (record.nativeMathError || !record.annotationTransportPreserved || !before || !final || before.bindingDiagnostics.length || final.bindingDiagnostics.length || signature(before) !== signature(final)) return refused('unavailable', 'invalid-or-unpreserved-annotations');
    const meanings = before.annotations.filter(annotation => annotation.intent !== null);
    if (meanings.length !== 1 || !parseIntent(meanings[0].intent)) return refused('unavailable', 'requires-one-authored-intent');
    const root = math.root, revision = item.revision, tex = math.math, preferences = speechPreferences(document, math);
    const isCurrent = () => {
      if (item.revision !== revision || item.completedRevision !== revision || item.completedRoot !== root || math.root !== root || math.math !== tex ||
          math.typesetRoot?.isConnected === false || ![...document.math].includes(math) || speechPreferences(document, math) !== preferences || !sameRealisations(realisations)) return false;
      try { return window.MathJax.startup.toMML(math.root) === final.mathML && signature(annotations(math.root, false, item.normalizeAddedApplication)) === signature(final); }
      catch { return false; }
    };
    if (!isCurrent()) return refused('stale', 'expression-no-longer-current');
    return { id, item, realisations, status: 'current', isCurrent, input: { sourceTeX: String(tex), presentationMathML: item.mathML,
      annotationSignature: signature(before), meaning: meanings[0].intent } };
  }
  function bindingResult(id, status, reason = null, extra = {}) {
    return { version: 1, expressionId: id, status, reason, binding: null, ...extra };
  }
  async function getExpressionBinding(expressionId) {
    const context = bindingContext(expressionId);
    if (context.status !== 'current') return bindingResult(context.id, context.status, context.reason);
    if (typeof intentSpeech?.buildExpressionBinding !== 'function') return bindingResult(context.id, 'unavailable', 'binding-helper-unavailable');
    try {
      const binding = await intentSpeech.buildExpressionBinding(context.input);
      if (!context.isCurrent()) return bindingResult(context.id, 'stale', 'expression-or-settings-changed');
      return bindingResult(context.id, 'ready', null, { binding: copy(binding), qualification: 'Exact current native TeX, presentation MathML and scoped annotations; no definition/prose equivalence or mathematical correctness claim.' });
    } catch (error) { return bindingResult(context.id, context.isCurrent() ? 'unavailable' : 'stale', error?.message === 'binding-hash-unavailable' ? 'binding-hash-unavailable' : 'binding-unavailable'); }
  }
  async function requestBrailleLiterals(expressionId) {
    const context = bindingContext(expressionId);
    const result = (status, reason = null, extra = {}) => {
      const value = { ...bindingResult(context.id, status, reason), literals: [], nativeBrailleUnchanged: true,
        qualification: intentSpeech?.literalQualification || 'Author-reviewed literal only; native braille is unchanged.', ...extra };
      if (context.item) context.item.record.reviewedBraille = copy(value);
      return copy(value);
    };
    if (context.status !== 'current') return result(context.status, context.reason);
    if (!context.realisations.mapped || typeof intentSpeech?.matchingBrailleLiterals !== 'function') return result('unavailable', 'no-authored-braille-literals');
    const current = await getExpressionBinding(context.id);
    if (!context.isCurrent()) return result('stale', 'expression-or-settings-changed');
    if (current.status !== 'ready') return result(current.status, current.reason);
    try {
      const literals = intentSpeech.matchingBrailleLiterals(context.realisations.config, current.binding);
      return literals.length ? result('matched', null, { binding: current.binding, literals: copy(literals) })
        : result('unavailable', 'no-current-reviewed-literal', { binding: current.binding });
    } catch { return result('unavailable', 'invalid-or-missing-realisations'); }
  }
  async function exportBrailleLiterals(expressionId, { download = false } = {}) {
    if (typeof download !== 'boolean') return bindingResult('', 'unavailable', 'invalid-export-option');
    const context = bindingContext(expressionId), current = await requestBrailleLiterals(expressionId);
    if (current.status !== 'matched') return current;
    if (context.status !== 'current' || !context.isCurrent()) return bindingResult(context.id, 'stale', 'expression-or-settings-changed');
    const artifact = { version: 1, kind: 'accessible-maths-reviewed-braille-literals', expressionId: current.expressionId,
      binding: current.binding, literals: current.literals, qualification: current.qualification, nativeBrailleUnchanged: true };
    const filename = `${context.id}-reviewed-braille.json`;
    if (download) {
      const URLObject = window.URL, BlobObject = window.Blob;
      if (!URLObject?.createObjectURL || !URLObject.revokeObjectURL || typeof BlobObject !== 'function') return bindingResult(context.id, 'unavailable', 'download-unavailable');
      let url, link;
      try {
        const bytes = JSON.stringify(artifact, null, 2) + '\n';
        url = URLObject.createObjectURL(new BlobObject([bytes], { type: 'application/json;charset=utf-8' }));
        link = window.document.createElement('a'); link.href = url; link.download = filename; link.hidden = true;
        window.document.body.appendChild(link);
        if (!context.isCurrent()) return bindingResult(context.id, 'stale', 'expression-or-settings-changed');
        link.click();
      } catch { return bindingResult(context.id, 'unavailable', 'download-unavailable'); }
      finally { link?.remove(); if (url) setTimeout(() => URLObject.revokeObjectURL(url), 0); }
    }
    return { version: 1, expressionId: context.id, status: download ? 'download-requested' : 'ready', reason: null, filename, artifact: copy(artifact) };
  }
  function addBrailleControls(item, controls) {
    const doc = window.document;
    const button = (label, className) => { const node = doc.createElement('button'); node.type = 'button'; node.className = 'am-intent-speech-request ' + className; node.textContent = label; controls.appendChild(node); return node; };
    const output = className => { const node = doc.createElement('span'); node.className = 'am-intent-speech-result ' + className; node.hidden = true; controls.appendChild(node); return node; };
    const copyButton = button('Copy expression binding', 'am-copy-expression-binding'), bindingOutput = output('am-expression-binding-result');
    const brailleButton = button('Show reviewed braille literals', 'am-reviewed-braille-request'), brailleOutput = output('am-reviewed-braille-result');
    const exportButton = button('Download reviewed braille JSON', 'am-reviewed-braille-export'); exportButton.hidden = true;
    let copyEpoch = 0, brailleEpoch = 0;
    item.controls.braille = { invalidate() {
      copyEpoch++; brailleEpoch++; bindingOutput.hidden = true; brailleOutput.hidden = true; exportButton.hidden = true;
      bindingOutput.replaceChildren(); brailleOutput.replaceChildren(); copyButton.disabled = false; brailleButton.disabled = false;
      item.record.reviewedBraille = bindingResult(item.record.id, 'stale', 'expression-render-in-progress');
    } };
    const say = (where, value, className = 'am-intent-speech-status', name = 'span') => { const node = doc.createElement(name); node.className = className; node.textContent = value; where.appendChild(node); return node; };
    copyButton.addEventListener('click', async () => {
      const epoch = ++copyEpoch, context = bindingContext(item.record.id); copyButton.disabled = true;
      try {
        const result = await getExpressionBinding(item.record.id); if (epoch !== copyEpoch) return;
        bindingOutput.replaceChildren(); bindingOutput.hidden = false;
        if (result.status !== 'ready' || context.status !== 'current' || !context.isCurrent()) { say(bindingOutput, 'A binding is unavailable or stale. It requires one current, preserved authored intent.'); return; }
        say(bindingOutput, result.binding.yaml, 'am-expression-binding-yaml', 'code');
        let copied = false;
        try { if (window.navigator?.clipboard?.writeText) { await window.navigator.clipboard.writeText(result.binding.yaml); copied = true; } } catch { /* Visible YAML remains available for manual copying. */ }
        if (epoch !== copyEpoch) return;
        if (!context.isCurrent()) { bindingOutput.replaceChildren(); say(bindingOutput, 'The expression changed while copying. A previously copied binding may now be stale; request a new one.'); return; }
        say(bindingOutput, copied ? ' Binding YAML copied. Add your reviewed literal, named code and review metadata in page YAML.' : ' Select and copy this binding YAML. Add your reviewed literal, named code and review metadata in page YAML.');
      } finally { if (epoch === copyEpoch) copyButton.disabled = false; }
    });
    brailleButton.addEventListener('click', async () => {
      const epoch = ++brailleEpoch; brailleButton.disabled = true; exportButton.hidden = true;
      try {
        const result = await requestBrailleLiterals(item.record.id); if (epoch !== brailleEpoch) return;
        brailleOutput.replaceChildren(); brailleOutput.hidden = false;
        if (result.status !== 'matched') { say(brailleOutput, 'No reviewed braille literal matches this exact current expression and authored intent. Native mathematics and its braille remain available.'); return; }
        for (const literal of result.literals) {
          say(brailleOutput, ` Author-reviewed braille literal — ${literal.code} (${literal.language}); revision ${literal.revision}, reviewed by ${literal['reviewed-by']}: `);
          say(brailleOutput, literal.cells, 'am-reviewed-braille-cells', 'code');
        }
        say(brailleOutput, ' ' + result.qualification); exportButton.hidden = false;
      } finally { if (epoch === brailleEpoch) brailleButton.disabled = false; }
    });
    exportButton.addEventListener('click', async () => {
      exportButton.disabled = true;
      try { const result = await exportBrailleLiterals(item.record.id, { download: true }); if (result.status !== 'download-requested') { exportButton.hidden = true; brailleOutput.replaceChildren(); say(brailleOutput, ' The expression or configuration changed, or the JSON download is unavailable. Request the reviewed literal again.'); } }
      finally { exportButton.disabled = false; }
    });
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
          const valid = type === 'intent' ? Boolean(parseIntent(value)) : grammar.isNCName(value);
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
