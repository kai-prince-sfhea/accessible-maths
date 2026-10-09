# Accessible Maths

An experimental Quarto extension for native mathematical writing with authored proofs, hints, assumptions and explanation levels. It also starts a small, explicit TeX-to-MathML annotation experiment. It preserves the original mathematical content; annotations do not establish mathematical correctness or accessible speech.

**Version 0.0.4 is published as experimental source. There is no tagged release yet.** The primary target is ordinary HTML articles and websites on Windows with Quarto 1.11.5 pre-release. This is the tested development baseline, not an established stable-version minimum. Manual assistive-technology, mathematical meaning and author acceptance remain separate checks.

Development used material OpenAI Codex assistance. Read [AI assistance and human responsibility](#ai-assistance-and-human-responsibility) for its scope, evaluation limits and the maintainer's responsibilities.

## Install and activate

From your existing Quarto project or document directory, install from GitHub:

```sh
quarto add kai-prince-sfhea/accessible-maths --no-prompt
quarto list extensions
```

GitHub installation uses `_extensions/kai-prince-sfhea/accessible-maths/`. The actual GitHub add/list/update/disable/remove workflow and standalone HTML/DOCX example were verified on the baseline above.

Select the filter in your document front matter or `_quarto.yml`:

```yaml
filters:
  - kai-prince-sfhea/accessible-maths
```

Use your normal `quarto render` workflow. No Node, Python, model or separate author build command is needed. Installing the extension does not select its filter or replace your project type, theme or navigation. Quarto installs only the `_extensions` runtime; retain that directory with your project's source. See [Quarto extension management](https://quarto.org/docs/extensions/managing.html).

For a local checkout or extracted source download, use `quarto add "C:/path/to/accessible-maths" --no-prompt` and select the unqualified `accessible-maths` filter. Local-copy update/removal uses that same local source path/unqualified name. Keep the GitHub owner prefix when selecting a GitHub-installed filter.

The source folder includes a complete [example article](example.qmd). From that folder, run `quarto render example.qmd --to html` or `quarto render example.qmd --to docx`. If copying the article into a GitHub-installed consumer project, change its filter to `kai-prince-sfhea/accessible-maths`. The experimental HTML example uses the external pinned engine described below; DOCX uses the ordinary static fallback.

## Associate an authored proof or explanation

Keep native theorem syntax, numbering and references. Give an associated proof its own `prf-` ID and explicitly identify the theorem with `proof-for`:

```markdown
::: {#thm-positive-square name="Positive squares" semantic-id="https://example.org/maths/positive-square"}
For every non-zero real number $x$, the square $x^2$ is positive.
:::

See @thm-positive-square.

::: {#prf-positive-square .proof proof-for="#thm-positive-square"}
The product is positive whether the non-zero real number is positive or negative.
:::

::: {#hint-sign .am-hint theorem-for="#thm-positive-square" am-summary="Hint: consider both signs"}
Consider the positive and negative cases separately.
:::

::: {#assumption-real .am-assumption theorem-for="#thm-positive-square"}
The statement concerns the ordered field of real numbers.
:::
```

Associations resolve on the current rendered page. A target can be a native `#thm-...` fragment or its explicitly declared `semantic-id` URI. Semantic IDs are optional for ordinary theorems; when supplied they must be absolute URIs and unambiguous on the page. References to an absent or ambiguous target are errors rather than guesses. Use includes to compose a page, then associate the objects present on that page.

An unmarked `.proof` remains an ordinary Quarto proof. Associated proofs, `.am-hint` and `.am-assumption` blocks become native HTML disclosures, closed initially. `am-summary` supplies an author-written control label; the defaults are `Proof`, `Hint` and `Assumptions`. Give each block associated with the same statement a distinct label, especially alternative proofs. Labels must be nonblank text of at most 256 UTF-8 bytes. The statement lists its related blocks with those labels, and each block links back to the statement. There is no initial-open or generated-explanation option in this version. Misplaced annotations, unsupported attributes and mixed disclosure kinds are errors.

Native theorem/proof headings, original IDs, equations, citations and references remain in the document. Readers can use the disclosure's native keyboard controls without JavaScript. The small enhancement opens containing disclosures when following a fragment destination and focuses that destination. It does not store reader choices. Print exposes every extension body and label, including content inside closed containing native `<details>` wrappers, without changing the screen's disclosure or level-selection state. Screen navigation controls are omitted from print. DOCX and controls-disabled HTML retain every body with its authored label. Automated Edge checks supplement manual assistive-technology evaluation, which remains pending.

## Offer authored explanation levels

Place explanations outside the statement and its proofs, with an explicit target and summary:

```markdown
::: {#explanation-intro .am-explanation theorem-for="#thm-positive-square" am-summary="Intuitive explanation" am-level="Introductory"}
Two non-zero real factors of the same sign give a positive product.
:::

::: {#explanation-advanced .am-explanation theorem-for="#thm-positive-square" am-summary="Explanation using order axioms" am-level="Advanced"}
Apply the ordered-field product axiom to the positive element x or -x.
:::
```

With two or more distinct named levels for a statement, HTML adds an **Explanation level** selector. It starts at **All explanations**. Choosing a level filters only that statement's explanations; statements, assumptions, hints and proofs keep their content and disclosure state. Explanations without `am-level` remain available for every choice. A fragment link into a filtered explanation restores All explanations for that statement, opens the relevant disclosure and focuses the destination. Its return link focuses the original statement.

Level names are author-supplied text, at most 64 UTF-8 bytes, presented in source order. They do not assign an inferred expertise rank or demonstrate understanding. Explanations require an authored `am-summary`. They cannot nest inside, contain or wrap native theorem/proof/remark/solution blocks, hints, assumptions or other explanations, because filtering must not hide canonical mathematical content. Ordinary step Divs inside an explanation can have their own fragment IDs.

Without JavaScript, all explanation summaries remain available through native disclosures and no level selector appears. Printing includes every explanation, even if filtered on screen. The extension neither generates variants nor validates their mathematical equivalence; authors must preserve the statement's conditions and review each explanation.

## Options

All options use one namespace:

```yaml
accessible-maths:
  enabled: true
  theorem-controls: true
  semantics: "off"
  mathml-output: internal
```

| Option | Default | Meaning |
|---|---|---|
| `enabled` | `true` | Enable the selected filter; `false` preserves ordinary native processing. |
| `theorem-controls` | `true` | Add controls to explicitly associated authored blocks in supported HTML. |
| `semantics` | `"off"` | `"off"` or `author-annotated`; the latter enables the bounded explicit macro experiment below. |
| `mathml-output` | `internal` | `internal` or experimental `assistive`; the latter requires `author-annotated` and requests annotated MathML DOM output. |
| `labels` | English strings below | Override generated interface text; authored summaries and level names remain your own text. |

Boolean options require booleans. Unknown options are rejected. The versioned [options schema](_extensions/accessible-maths/options.schema.json) describes this namespace; Lua also checks normalized labels and UTF-8 byte limits. It is a reference schema, not automatic Quarto editor integration. Use Quarto's normal metadata layering to select document or project settings. Control-label translation is explicit; selecting a document language does not automatically translate these strings:

```yaml
accessible-maths:
  labels:
    proof: Proof
    hint: Hint
    assumptions: Assumptions
    related: Explore this statement
    back: Back to statement
    level: Explanation level
    all: All explanations
```

Each override must be nonblank text of at most 256 UTF-8 bytes. Labels are rendered as plain text with Unicode whitespace normalized. Individual `am-summary` labels take priority; explanation blocks always require their own authored summary. Bounded checks cover flag overrides at project, directory, document, HTML format, profile and metadata-file levels, including nested Unicode paths and actual live preview rebuilding. This version does not promise every option combination or arbitrary custom templates/formats.

## Experimental mathematical annotations

Use `semantics: author-annotated` only when you want to declare the meaning of a small page-local mathematical macro. Select the pinned MathJax component through **native HTML format configuration**:

```yaml
filters:
  - kai-prince-sfhea/accessible-maths
accessible-maths:
  semantics: author-annotated
format:
  html:
    html-math-method:
      method: mathjax
      url: https://cdn.jsdelivr.net/npm/mathjax@4.1.3/tex-mml-chtml.js
```

This explicit native setting is required for the experiment: extension metadata alone does not select the HTML writer's maths URL on the targeted pre-release. The extension uses that single loader; it does not install a second MathJax engine or a fork. See [Quarto HTML mathematics](https://quarto.org/docs/output-formats/html-basics.html#latex-equations).

Declare a macro on a native definition:

```markdown
::: {#def-ordered-pair name="Ordered pair" semantic-id="https://example.org/maths/ordered-pair" am-macro="amPair" am-args="first second" am-intent="ordered-pair($first,$second)" am-tex="(#1,#2)"}
The notation denotes the ordered pair of its first and second arguments.
:::

The pair is $\amPair{a}{b}$.
```

The declaration supplies an absolute `semantic-id` URI, a macro name without its leading backslash, space-separated unique argument roles, an operation with explicit role references, and the ordinary TeX rendering. Names must start with `am`, then an uppercase ASCII letter and any further ASCII letters, such as `amPair`; `amIntent` and `amArg` are reserved helpers. This namespace prevents a declaration from replacing ordinary commands such as `\frac`.

Only **one to four required arguments** are supported. Each argument must occur exactly once in `am-tex` as `#1`, `#2`, and so on; every declared role must occur exactly once in `am-intent`. Templates require balanced braces and ordinary visual TeX. Comments, verbatim literals, known command-definition/indirection primitives and calls to declared page-local macros are refused. Escaped `\#` and `\%` are literal TeX symbols; `\#1` does not count as argument one. In a quoted Markdown attribute, double those backslashes so they survive the Markdown reader, for example `am-tex="\\# (#1,#2)"`. This is a bounded authoring contract, not a general TeX interpreter or source sanitizer. These declarations are page-local and explicit. Optional/default arguments, arbitrary TeX inference and automatic site-wide promotion are outside this version. Without semantic declarations, ordinary mathematics remains untouched by the macro scanner.

The default adapter transports author-supplied `intent` and `arg` annotations into genuine **internal MathML**. Automated MathJax 4.1.3 checks retained three ordered-pair examples and their scoped bindings through compilation, actual semantic enrichment and final serialization. Default CHTML has no MathML DOM elements; its internal-tree checks do not show that assistive technology receives the annotations.

To experiment with actual annotated MathML DOM delivery, add:

```yaml
accessible-maths:
  semantics: author-annotated
  mathml-output: assistive
```

Keep the pinned native HTML engine configuration above. This mode asks the existing MathJax engine for assistive MathML, disabling its enrichment, speech, braille and explorer initially so the page exposes one mathematical representation. Automated Edge checks inspect real MathML namespaces, scoped `intent`/`arg` bindings, the accessibility tree and hidden visual CHTML. This mode does not perform semantic enrichment, so the enrichment transport verdict is `not-tested`; DOM delivery has its own verdict. A preserved DOM verdict requires the original authored annotations and scoped bindings to survive into the final output; matching a changed internal tree alone cannot pass. Reader changes through MathJax's menu and later typesetting are outside that initial check.

Attribute survival does **not** show that MathSpeak, ClearSpeak, a screen reader or a braille engine interpreted authored meaning. In bounded differential experiments, identical notation annotated as an ordered pair or open interval produced identical speech strings with both existing ClearSpeak and MathSpeak. Intent-aware speech remains unresolved; there is no WCAG conformance claim. The annotation experiment requires JavaScript and its external engine; no-JavaScript disclosure behavior does not establish no-JavaScript mathematical rendering.

For experimental diagnostics, the browser console can inspect `await window.AccessibleMaths.ready` and `window.AccessibleMaths.snapshot()`. Separate annotation, enrichment and DOM transport verdicts cover initial page typesetting, with loading, TeX and binding diagnostics. Dynamic content, cross-reference popups and subsequent conversions have no verified transport contract in this version.

Annotation inspection indexes argument roles in one traversal per intent and reuses text within each checkpoint, reducing repeated diagnostic work. Each checkpoint still inspects its current tree, and final DOM inspection runs after the author's page-ready hook. No additional setup is needed; these changes do not establish whole-site rendering speed.

## Declared identity and notation data

HTML pages with explicitly identified native theorem/definition objects include an inert JSON script named `accessible-maths-declarations`. Its [versioned schema](_extensions/accessible-maths/declarations.schema.json) covers a small declarations slice of the shared v0 contract: semantic URIs, language-labelled names, containing-document source anchors, document-local occurrences, fragment destinations and declared notation roles/intent/visual TeX. Browser diagnostics expose a plain copy as `snapshot().declarations` when the annotation adapter is active. Otherwise the JSON remains directly readable without an engine or graph dependency.

This data is recreated when the filter renders that document. It covers explicit native declarations only, including composed content at its containing page's anchor. It has no verified original-include spans, expression-to-concept inference, cross-page completeness, independent freshness receipt or full knowledge-graph snapshot. Consumers must add a collection scope before merging document-local occurrence IDs. Objects retain `author-declared` origin, `not-asserted` review status and unknown content rights; exporting a URI does not approve its meaning or license your research. The payload contains public page metadata, so do not place confidential declarations in publication sources. Its script ID is reserved when a payload is emitted.

## Tested output boundaries

Native consumer checks preserve full authored bodies and labels in DOCX and compare the macro's ordinary rendering against native TeX. They also compare native HTML captions, IDs, references, navigation, theme and existing author hooks, and exercise local installation, updating, disabling and removal. Headless Edge checks cover scoped level selection, repeated native links, return focus, print/no-JavaScript output, reduced motion, forced-color focus and a 320-pixel viewport. Stateful axe checks detect no new violations against a native Quarto baseline; existing skip-link observations and contrast incompletes remain open. These bounded checks supplement manual author, keyboard, screen-reader and physical-device review; they do not replace it.

| Output on Windows / Quarto 1.11.5 | Bounded behavior checked |
|---|---|
| Ordinary HTML articles/websites | Authored controls, level selection, native captions/references, local lifecycle and preview; pinned MathJax annotation modes checked separately. |
| DOCX | Full authored bodies and labels, independently reopened ordinary visual mathematics. |
| Typst PDF | Native source and compiled PDF retain authored material, anchors, references and visual macro fallback. PDF appearance, tagging and AT remain unreviewed. |
| LaTeX | Native source preserves content, labels, references and visual macro fallback. The labelled-proof fixture fails PDF compilation with `Environment refproof undefined` both with and without the extension on this Quarto build; compiled LaTeX PDF support is not claimed. |
| EPUB | Native archive and independent Pandoc reopening preserve content, anchors and visual mathematics; no interactive controls. Reader/device acceptance is pending. |
| Revealjs | Complete static authored fallback; interactive controls are outside this version. |
| Dashboard HTML | Native mathematical content and disclosure dependencies render; dashboard-specific interaction/layout acceptance is pending. |
| Embedded HTML | Native MathML plus embedded controls renders without external script/style dependencies. Offline device behavior and MathML speech remain unverified. |
| KaTeX HTML | Semantics-off controls retain the native KaTeX loader and visual macro fallback; browser/AT engine interpretation is unverified. |

These checks use synthetic fixtures and do not establish every option combination, stable Quarto, other operating systems, arbitrary custom formats/templates or manuscript projects. Native verification ran serially; concurrent rendering has not been verified. The extension has no shared render cache or project hooks. Browser print-to-PDF is separate from a native PDF writer. Ordinary controls can coexist with other native maths methods; the annotation adapter is restricted to the pinned component above.

## Disable, update and remove

Set `accessible-maths.enabled: false` to disable the selected filter, or remove `kai-prince-sfhea/accessible-maths` from `filters`. No extension cache, reader database or review history needs resetting.

To update a GitHub installation, back up your source and installed extension, review the [changelog](CHANGELOG.md), then run this from the consuming project:

```sh
quarto update extension kai-prince-sfhea/accessible-maths --no-prompt
```

To uninstall, first remove the filter from your configuration, then run:

```sh
quarto remove kai-prince-sfhea/accessible-maths --no-prompt
```

Review your authored attributes and macros before removing their adapter; ordinary native theorem/proof content remains useful, while extension-defined macro invocations need an ordinary TeX replacement. Version 0.0.x authoring conventions may change; retain a working installed copy and review the [changelog](CHANGELOG.md) before updating. No automatic migration is promised.

## Security, rights and transparency

The browser enhancement uses no AI, server, reader storage, model download or publication action. The optional annotation experiment loads the explicitly selected MathJax 4.1.3 component from jsDelivr; MathJax may request its supporting components, fonts, speech worker and speech-rule maps. [MathJax 4.1.3](https://github.com/mathjax/MathJax/blob/4.1.3/LICENSE) and its [speech-rule engine](https://github.com/Speech-Rule-Engine/speech-rule-engine/blob/master/LICENSE) are separately supplied dependencies, with their own terms; supporting fonts and other assets retain their respective terms. No upstream engine, font, speech worker or model is bundled here. Offline operation, PWA caching and compatibility with a particular host's Content Security Policy are unverified. Review your site's final resources and policy before publishing.

This extension is not a source sanitizer or a website security audit. Keep confidential content out of documents intended for publication, including collapsed proofs: collapse does not make source private. The maintainer is [Kai Prince](https://github.com/kai-prince-sfhea). No private vulnerability-reporting channel is configured yet. Use contact information the maintainer makes available on that profile to arrange a private route before sharing sensitive details; do not post those details in public issues. Ordinary questions and non-sensitive bug reports can use [repository issues](https://github.com/kai-prince-sfhea/accessible-maths/issues). Include the extension, Quarto, operating system and browser versions plus a small non-confidential reproduction.

Copyright 2026 Kai Prince. Extension code, original examples and documentation use [Apache License 2.0](LICENSE); the [installed licence](_extensions/accessible-maths/LICENSE) travels with the runtime. Retain applicable copyright and licence notices when redistributing browser assets. This does not choose rights for your research, prose or mathematical data.

## AI assistance and human responsibility

**OpenAI Codex assisted development** of the implementation, debugging, design research, examples, synthetic fixtures, expected results, test harnesses and documentation. AI assistance was material to this work; this is not a claim that the code or evaluation corpus was independently authored or reviewed by a human.

Verification combines actual Quarto renders, deterministic comparisons, automated browser/accessibility checks and AI-assisted code review. Synthetic fixtures and expected results also received AI assistance. Passing these checks does not independently establish mathematical correctness, educational equivalence, accessible speech, WCAG conformance or suitability for a particular institution. Author review, mathematical-meaning review and manual assistive-technology/device acceptance remain open.

The maintainer remains responsible for reviewing contributions, rights, claims and publication. No University of Manchester approval or policy-compliance finding is claimed. University-affiliated use requires checking the applicable institutional, teaching, research, confidentiality and publisher rules for that activity. The extension itself makes no AI requests and does not generate or rewrite mathematical content.

Developer harnesses, planning and raw verification evidence are maintained in a separate, currently unpublished workspace. The full regression suite and complete development/prompt history are not included in this source distribution, so its full development verification cannot yet be reproduced from this repository alone. The included article is the runnable consumer example. This limitation does not prevent local installation or rendering and remains explicit until a developer-evidence distribution is available.
