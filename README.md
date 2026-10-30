# Accessible Maths

An experimental Quarto extension for native mathematical writing with authored proofs, hints, assumptions and explanation levels. It also starts a small, explicit TeX-to-MathML annotation experiment. It preserves the original mathematical content; annotations do not establish mathematical correctness or accessible speech.

**Version 0.0.10 is experimental development source. There is no tagged release.** Transcript, binding and braille controls retain their keyboard position while work is pending, identify their expression, and announce brief availability updates. The mathematical transcript and braille cells remain outside live regions and do not replace native mathematical speech. Related-proof navigation uses a compact layout while retaining native proof labels and authored summaries. Native/browser verification and assistive-technology acceptance are separate gates.

**Historical 0.0.9 evidence:** It adds an explicit English intent vocabulary and transcript-control refresh after subsequent native MathJax render passes. The full regression passed before a later narrow transport-comparison repair; affected pure checks and fresh native/browser checks passed after that repair. The native combined page exercised all 26 transcript controls: 25 finite interpretations and one expected complete native fallback. Four separate actual MathJax groups covered recursion, fixity, unsupported fallback and later typesetting. This is qualified component verification, not a complete post-repair full-suite result. Mathematical meaning and assistive-technology acceptance remain separate gates.

**Historical 0.0.8 evidence:** It adds optional/default macro arguments and explicit lexical scopes, reviewed catalogue capture, authored speech rules and separate annotation-bound braille literals. The full regression passed, including 75 Lua checks, 16 literal-file commands, 23 scoped-authoring/catalogue commands and 28 legacy render attempts. Actual MathJax browser checks passed eight first-pass and ten second-pass groups; the combined 62-QMD website also rendered successfully. These are separately recorded technical observations. The primary target is ordinary HTML articles and websites on Windows with Quarto 1.11.5 pre-release. This is the tested development baseline, not an established stable-version minimum. Manual assistive-technology, mathematical meaning and author acceptance remain separate checks.

Development used material OpenAI Codex assistance. Read [AI assistance and human responsibility](#ai-assistance-and-human-responsibility) for its scope, evaluation limits and the maintainer's responsibilities.

## Install and activate

**Install the extension.** Open a terminal in your existing Quarto project
or document directory and install from GitHub:

```sh
quarto add kai-prince-sfhea/accessible-maths --no-prompt
quarto list extensions
```

Select the filter in your document front matter or `_quarto.yml`:

```yaml
filters:
  - kai-prince-sfhea/accessible-maths
```

No Node, Python, model or separate author build command is needed. Installing
the extension copies its runtime; selecting the filter enables it. Keep the
installed `_extensions` directory with your project's source. See
[Quarto extension management](https://quarto.org/docs/extensions/managing.html).

For a local checkout or extracted source download, use `quarto add "C:/path/to/accessible-maths" --no-prompt` and select the unqualified `accessible-maths` filter. Local-copy update/removal uses that same local source path/unqualified name. Keep the GitHub owner prefix when selecting a GitHub-installed filter.

The GitHub command follows the experimental `main` branch. For a local checkout or extracted source, use the local-source command above. Neither installation route establishes a supported release.

## Start with ordinary theorem controls

Open the [example.qmd tutorial](example.qmd) in your editor. It walks through
rendering an ordinary theorem and proof, editing one label, and trying hints,
assumptions and explanation levels. From the source folder, render it with
`quarto render example.qmd --to html`; Word uses `--to docx`. In a consuming
project, copy that file and use the matching installed filter name above.

The tutorial needs no semantic IDs, catalogue, model or experimental maths
engine. Its instructions remain readable in the rendered article. Keep using
your normal editor **Render** or **Preview** workflow. The rest of this README
is the advanced authoring, configuration and behaviour reference.

| What you want | What to select |
|---|---|
| Proof, hint, assumption and explanation controls | Accessible Maths alone. |
| A mathematical glossary, explicit proof relations or reviewed notation alternatives | Add Maths Knowledge Graph before Accessible Maths; share its catalogue rather than duplicate proof associations. |
| Project-wide graph navigation and search | Add Knowledge Graph Extraction and configure its project catalogue. Accessible Maths alone does not assemble a website graph. |
| Experimental `intent`/`arg` annotation transport | Opt into the separate [annotation experiment](#experimental-mathematical-annotations). |

The separate [advanced.qmd example](advanced.qmd) retains the complete annotation
experiment. From the source folder, run
`quarto render advanced.qmd --to html` or `quarto render advanced.qmd --to docx`.
If copying it into a GitHub-installed consumer project, change its filter to
`kai-prince-sfhea/accessible-maths`. Its experimental HTML uses the external
pinned engine described below; DOCX uses the ordinary static fallback.

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

Associations resolve on the current rendered page. A target can be a native `#thm-...` fragment or its explicitly declared `semantic-id` URI. Semantic IDs are optional for ordinary theorems; AM-owned mathematical blocks require absolute, unambiguous URIs. Generic content belonging to another extension, such as Generative Websites translation source/candidate blocks, may share a language-independent URI. Those foreign occurrences do not become AM association targets or mathematical declarations. Native fragment IDs must still be distinct, and adding translation classes cannot exempt an owned theorem from mathematical identity checks. References to an absent or ambiguous mathematical target are errors rather than guesses. Use includes to compose a page, then associate the mathematical objects present on that page.

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
  intent-speech: false
```

| Option | Default | Meaning |
|---|---|---|
| `enabled` | `true` | Enable the selected filter; `false` preserves ordinary native processing. |
| `theorem-controls` | `true` | Add controls to explicitly associated authored blocks in supported HTML. |
| `semantics` | `"off"` | `"off"` or `author-annotated`; the latter enables the bounded explicit macro experiment below. |
| `mathml-output` | `internal` | `internal` or experimental `assistive`; the latter requires `author-annotated` and requests annotated MathML DOM output. |
| `intent-speech` | `false` | Use `true` for the finite English vocabulary, or a mapping for reviewed language-specific rules and braille declarations. Requires `author-annotated`; speech requests respect the existing native pipeline and reader settings. |
| `catalogue` | `false` | Publish a separately versioned, reviewed declarations catalogue from the current native AST. Only explicitly reviewed, public declarations in a named knowledge scope qualify. |
| `labels` | English strings below | Override generated interface text; authored summaries and level names remain your own text. |

Boolean options require booleans. Unknown options are rejected. The versioned [options schema](_extensions/accessible-maths/options.schema.json) describes this namespace; Lua also checks normalized labels and UTF-8 byte limits. It is a reference schema, not automatic Quarto editor integration. Use Quarto's normal metadata layering to select document or project settings. Control-label translation is explicit; selecting a document language does not automatically translate these strings:

The filter consumes Quarto's effective `accessible-maths` mapping. A higher
metadata layer can replace that mapping; do not assume a partial document,
format, profile or metadata-file value preserves every project option. Put a
complete intended mapping at the authoritative layer. In particular, an
explicit document mapping can remain authoritative over `--metadata-file`.
To disable, set `enabled: false` in the effective mapping or remove the filter.
Unknown keys and malformed options are still diagnosed before disabled
processing returns; disabling is not a way to admit invalid configuration.

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

## Match your website's appearance

The default controls inherit the page's text colour and native Quarto theme.
Styling is optional: ordinary `.qmd` and `.yml` authoring is sufficient. To
customise appearance, add a normal Quarto stylesheet, without editing installed
extension files:

```yaml
format:
  html:
    css: styles.css
```

```css
/* styles.css: inherited by every Accessible Maths control on this page. */
:root {
  --am-border-radius: .6rem;
  --am-block-spacing: 1.25rem;
  --am-summary-padding: .75rem 1rem;
  --am-body-padding: .25rem 1rem 1rem;
}
```

The supported properties are `--am-border-color` (`currentColor`),
`--am-border-radius` (`.25rem`), `--am-block-spacing` (`1rem`),
`--am-summary-padding` (`.625rem .75rem`), `--am-body-padding`
(`.25rem .75rem .75rem`), `--am-summary-weight` (`600`),
`--am-control-background` (the Quarto body background, falling back to `Canvas`)
and `--am-focus-color` (`currentColor`). Set them on `:root` for a whole page or
on a containing authored class for one section. Native CSS inheritance works
through the generated disclosures. For direct selectors, the public hooks are
`.am-disclosure`, `.am-disclosure-body`, `.am-related`, `.am-return` and
`.am-level-controls`.

Retain visible focus, readable contrast and the controls' minimum target size.
Forced-colour mode uses system colours, and print continues to expose all
authored bodies independently of these screen styles. CSS changes presentation,
not proof associations, explanation levels or mathematical meaning.

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

There are **one to four argument roles**, with an optional leading argument as described below. Each argument must occur exactly once in `am-tex` as `#1`, `#2`, and so on; every declared role must occur exactly once in `am-intent`. Templates require balanced braces and ordinary visual TeX. Comments, verbatim literals, known command-definition/indirection primitives and calls to declared page-local macros are refused. Escaped `\#` and `\%` are literal TeX symbols; `\#1` does not count as argument one. In a quoted Markdown attribute, double those backslashes so they survive the Markdown reader, for example `am-tex="\\# (#1,#2)"`. This is a bounded authoring contract, not a general TeX interpreter or source sanitizer. Declarations are explicit and page-local; arbitrary TeX inference and automatic site-wide promotion are outside this version. Without semantic declarations, ordinary mathematics remains untouched by the macro scanner.

The transport comparator retains raw MathML and raw annotation/operand text. After a recorded source checkpoint with no preexisting `data-semantic-added` markers, it can exclude one exact kind of native enrichment addition from comparison: a leaf `<mo>` containing U+2061 invisible application, with the pinned SRE added/punctuation/application/appl markers and no `intent` or `arg`. Authored operators, other invisible characters, visible text, concept values and scoped operand bindings remain significant. This limited rule does not establish presentation equivalence.

### Optional arguments and local notation scopes

Use `am-optional` to name the **first** role and `am-default` for its literal
TeX default. The remaining roles keep their required braces:

```markdown
::: {#def-power name="Power notation" semantic-id="https://example.org/maths/power" am-macro="amPower" am-args="base exponent" am-optional="base" am-default="2" am-intent="power($base,$exponent)" am-tex="#1^{#2}"}
The first argument is the base and the second is the exponent.
:::

The default is $\amPower{3}$; an explicit base is $\amPower[5]{3}$.
```

These render as `2^{3}` and `5^{3}` even without experimental annotations.
An explicit empty `[]` stays empty; it does not select the default. An empty
default is permitted. Balanced braces protect an inner `]`, and escaped
delimiters remain literal. Only one leading optional argument is supported.
Defaults use the same bounded ordinary-TeX restrictions as templates; they
cannot define commands, call a declared macro or smuggle argument placeholders.
This finite signature is separate from MathJax's broader
[TeX macro facilities](https://docs.mathjax.org/en/latest/input/tex/macros.html).

By default a declaration is available throughout its containing document.
Wrap a region in an identified `.am-macro-scope` Div to give it a lexical
registry:

```markdown
::: {#local-notation .am-macro-scope}
Your local definition and the mathematics using it go here.
:::
```

The nearest scope can shadow a command from its parent. Its definitions are
available throughout that scope, including native includes, and stop at its
boundary. Siblings and following text retain their own registry. Duplicate
commands in one scope, missing/duplicate scope IDs and excess nesting fail with
a diagnostic. Semantic URIs stay document-unique. `am-scope`, used for the
reviewed catalogue below, names a knowledge context and does not create a TeX
lexical scope. Local declarations are never promoted to global commands.

The default adapter transports author-supplied `intent` and `arg` annotations into genuine **internal MathML**. Automated MathJax 4.1.3 checks retained three ordered-pair examples and their scoped bindings through compilation, actual semantic enrichment and final serialization. Default CHTML has no MathML DOM elements; its internal-tree checks do not show that assistive technology receives the annotations.

To experiment with actual annotated MathML DOM delivery, add:

```yaml
accessible-maths:
  semantics: author-annotated
  mathml-output: assistive
```

Keep the pinned native HTML engine configuration above. This mode asks the existing MathJax engine for assistive MathML, disabling its enrichment, speech, braille and explorer initially so the page exposes one mathematical representation. Automated Edge checks inspect real MathML namespaces, scoped `intent`/`arg` bindings, the accessibility tree and hidden visual CHTML. This mode does not perform semantic enrichment, so the enrichment transport verdict is `not-tested`; DOM delivery has its own verdict. A preserved DOM verdict requires the original authored annotations and scoped bindings to survive into the final output; matching a changed internal tree alone cannot pass. Reader changes through MathJax's menu and later typesetting are outside that initial check.

Attribute survival does **not** show that MathSpeak, ClearSpeak, a screen reader or a braille engine interpreted authored meaning. Earlier unmodified-engine experiments produced identical speech for a pair and an interval. The optional adapter below is a separate, finite interpretation experiment; it does not change that earlier finding. There is no WCAG conformance claim. The annotation experiment requires JavaScript and its external engine; no-JavaScript disclosure behavior does not establish no-JavaScript mathematical rendering.

### Request an experimental intent transcript

Add `intent-speech: true` to the same complete `accessible-maths` mapping and
retain the pinned native MathJax configuration above. In internal output mode,
the reader can request a transcript using the existing MathJax speech worker.
The built-in English vocabulary includes `ordered-pair`, `open-interval`,
`closed-interval`, `closed-open-interval`, `open-closed-interval`,
`absolute-value`, `applied-to`, `composed-with`, `power`, `root`, `fraction`,
`cardinality`, `floor`, `ceiling`, `set`, `complex-conjugate`, `domain`,
`codomain` and `image`, including supported nested applications and surrounding
mathematics. Their argument roles bind by exact name, rather than visible
spelling. Unsupported concepts, properties, languages or ambiguous bindings
retain native mathematics and report an explicit fallback.

Transcripts are optional text, not automatic replacements for MathJax's accessible
names. The adapter respects disabled speech/enrichment and never turns them on
silently. Assistive-only output initially disables that native speech pipeline,
so a transcript is unavailable in that mode. Braille is requested from the
original presentation tree separately from the speech-only interpretation
clone. This preserves that distinction; braille and screen-reader quality still
need human evaluation. Loading errors and stale results after changed mathematics
or reader settings must not become successful interpretation verdicts.

Intent syntax accepts a bounded MathML 4 grammar with Unicode XML NCNames,
properties and nested applications/references. Syntax admission does not mean
every concept or property has a speech implementation. The TeX command namespace,
one-to-four macro arguments and exactly-once template/role rules stay finite.
The parser targets the [2 October 2026 MathML 4 working draft](https://www.w3.org/TR/2026/WD-mathml4-20261002/#intent); later draft changes need a new compatibility check.

Bounded Edge 155.0.4283.62 checks with the pinned MathJax 4.1.3 worker produced
different requested transcript strings for an authored ordered pair and open
interval with identical visual notation. The original presentation's nonempty
Nemeth strings and native mathematical accessible names remained unchanged.
Other checks exercised the finite vocabulary, Unicode roles, nested/surrounding
mathematics, explicit fallback, native speech/enrichment settings, focus, print
and mobile controls. These are transcript and preservation observations; no
audio, screen-reader session, braille-quality review or general intent-engine
acceptance is established. Earlier format/axe evidence retains its recorded
candidate/component scope.

For experimental diagnostics, the browser console can inspect `await window.AccessibleMaths.ready` and `window.AccessibleMaths.snapshot()`. Separate annotation, enrichment and DOM transport verdicts cover initial page typesetting, with loading, TeX and binding diagnostics. Dynamic content, cross-reference popups and subsequent conversions have no verified transport contract in this version.

When transcripts are enabled, each captured expression's `intentSpeech` result
records its own request status, fallback and original-presentation braille
source. The historical top-level `speechInterpretation: not-tested` refers to
native accessible-name interpretation; it is not promoted by a transcript.
Authors need no JavaScript for the reader controls.

### Interpret explicit concepts and current render passes

The vocabulary uses exact concept names and explicit operand positions; it does
not infer meaning from a shared glyph. A closed interval names both included
endpoints; half-open intervals distinguish which endpoint is excluded. Function
application and composition preserve their authored order. Powers, roots and
fractions include grouping words for nested expressions. These experimental
English realizations need mathematical and accessibility review.

Each listed concept accepts its declared default `function` fixity. Only
`applied-to`, `composed-with` and `power` additionally admit one explicit
`infix` property. Conflicting/repeated properties, `silent`, `literal`,
unknown meanings, unsupported arities or unbound roles fall back for the whole
expression. This does not implement every MathML 4 concept or property.

The adapter also refreshes its owned transcript controls after subsequent native
MathJax render passes, retires controls for removed MathItems, and invalidates
old bindings when an expression changes. It does not observe arbitrary DOM and
request retypesetting itself, load another engine, change reader preferences or
silently update reviewed braille. The initial ready promise remains a snapshot;
use the current diagnostic snapshot for later render passes. VM lifecycle checks
are separate from actual browser and assistive-technology acceptance.

### Write a reviewed speech rule

Replace the boolean with a mapping when a concept needs an authored realization:

```yaml
accessible-maths:
  semantics: author-annotated
  intent-speech:
    enabled: true
    language: en
    rules:
      - id: indexed-symbol
        revision: '1'
        concept: indexed-symbol
        roles: [symbol, index]
        template: 'the symbol {symbol} at index {index}'
        review: author-reviewed
        reviewed-by: 'Replace with the reviewer name'
```

Retain the pinned native MathJax configuration. A rule has one to four ordered
roles, each used exactly once in its plain-text template. The roles correspond
to argument positions in the authored intent; they need not share its argument
reference names. Rules do not contain HTML, speech markup or executable code.
At most 32 rules and 64 KiB of combined realizations are accepted.

`language` declares the reviewed text's language. It does not switch MathJax's
locale or translate arguments. The reader's actual initialized worker locale
must match it. An unsupported meaning falls back to the native whole-expression
reading; mismatched locales, stale expressions and disabled native speech report
the request as unavailable. A
review marker records an author's assertion; the extension does not verify
linguistic or mathematical fidelity.

### Supply a separately reviewed braille literal

First render the page and use **Copy expression binding** beside an expression.
It displays two ordinary YAML fields, `expression-sha256` and `meaning`.
Paste them into a record in a UTF-8 `braille.yml` file beside that QMD. Add a
distinct lowercase `id`, quoted `revision`, declared `code` and `language`,
literal `cells`, `review: author-reviewed` and `reviewed-by`. For example, the
record structure below deliberately needs the copied binding and a qualified
reviewer's transcription before it can be rendered:

```yaml
version: 1
braille-literals:
  - id: reviewed-expression
    revision: '1'
    # Paste expression-sha256 and meaning from the rendered control here.
    code: 'Replace with the actual transcription code'
    language: en
    cells: |-
      ⠁  ⠃
    review: author-reviewed
    reviewed-by: 'Replace with the qualified reviewer name'
```

The cells above illustrate whitespace only; they are not a transcription of
the selected mathematics. Add `braille-literals-file: braille.yml` to the
`intent-speech` mapping, then render normally. Paths are relative to the
containing QMD and must stay inside the project, through ordinary files without
symlinks or junctions. Up to 16 records and a 64 KiB literal YAML file are
accepted. The configured relative filename must contain no whitespace, URL or
encoding. The bounded reader supports literal mappings, sequences and scalars;
aliases, tags, duplicate keys and folded blocks are refused. UTF-8 BOM is
accepted and YAML CRLF line endings become LF. Double ASCII spaces, line feeds
and Unicode Braille blanks within a literal block are preserved.

Nonempty inline `braille-literals` metadata is refused: Pandoc's Markdown
metadata processing can collapse spaces and line breaks. An empty inline list
is harmless and may remain alongside a literal file. No author-written
JavaScript, model or separate build step is required.

The expression fingerprint binds the current expanded TeX, original presentation
MathML and scoped annotations, including operands. It does not bind a general
mathematical meaning or establish transcription correctness. Changed notation,
arguments or annotations require a new binding and review. Matching declarations
have separate reader display and UTF-8 JSON download controls. The download is
not BRF or a device-ready braille file. Native speech, braille and accessible
names remain independent; no literal is silently substituted into those channels.

Annotation inspection indexes argument roles in one traversal per intent and reuses text within each checkpoint, reducing repeated diagnostic work. Each checkpoint still inspects its current tree, and final DOM inspection runs after the author's page-ready hook. No additional setup is needed; these changes do not establish whole-site rendering speed.

## Declared identity and notation data

HTML pages with explicitly identified native theorem/definition objects include an inert JSON script named `accessible-maths-declarations`. Its [versioned schema](_extensions/accessible-maths/declarations.schema.json) covers a small declarations slice of the shared v0 contract: semantic URIs, language-labelled names, containing-document source anchors, document-local occurrences, fragment destinations and declared notation roles/intent/visual TeX. Browser diagnostics expose a plain copy as `snapshot().declarations` when the annotation adapter is active. Otherwise the JSON remains directly readable without an engine or graph dependency.

This data is recreated when the filter renders that document. It covers explicit native declarations only, including composed content at its containing page's anchor. It has no verified original-include spans, expression-to-concept inference, cross-page completeness, independent freshness receipt or full knowledge-graph snapshot. Consumers must add a collection scope before merging document-local occurrence IDs. Objects retain `author-declared` origin, `not-asserted` review status and unknown content rights; exporting a URI does not approve its meaning or license your research. The payload contains public page metadata, so do not place confidential declarations in publication sources. Its script ID is reserved when a payload is emitted.

### Opt into a reviewed native catalogue

The legacy declarations payload above remains available. The separate catalogue
requires explicit publication and review attributes, for example:

```markdown
::: {#def-index name="Indexed symbols" semantic-id="https://example.org/maths/indexed-symbol" am-review="author-reviewed" am-public="true" am-scope="mathematics"}
An indexed symbol associates a symbol with a position.
:::
```

Set `accessible-maths.catalogue: true` in YAML. Eligible declarations appear in
the inert `accessible-maths-catalogue` script, whose
[schema](_extensions/accessible-maths/catalogue.schema.json) is independent of
the legacy payload. Private, hidden or conditional ancestors are withheld.
An empty catalogue reports `empty`; it is not evidence of a complete website
graph. Review markers do not grant content rights or validate meaning.

Each published record binds the current expanded native body, identity,
notation signature and lexical scope with SHA-256. The containing document's
original bytes have a separate hash. These are change bindings, not proof of
semantic equivalence or exact original include spans. Included declarations
use the containing page's native anchor; the packet does not claim a complete
include dependency closure.

A separately installed extension can call the versioned `catalogue-api.lua`
on the same current pre-AST document after assigning canonical identities.
This avoids collecting a previous HTML render. Keep Maths Knowledge Graph
before Accessible Maths so native proof associations can be established before
the controls are rendered. Consumer support and its own source mapping need
separate verification; installing this API alone does not configure a graph
or transfer all declarations into Maths Knowledge Graph.

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

Extension validation messages use documented field names and, for associated
elements, safe processing ordinals instead of echoing authored IDs, semantic
URIs, option keys or target values. An ordinal describes filter traversal, not
a source line number. Ordinary rendered prose, attributes, Quarto errors and
native tool logs can still contain authored or machine-specific information;
review them privately before sharing. This does not make page content private.

## AI assistance and human responsibility

**OpenAI Codex assisted development** of the implementation, debugging, design research, examples, synthetic fixtures, expected results, test harnesses and documentation. AI assistance was material to this work; this is not a claim that the code or evaluation corpus was independently authored or reviewed by a human.

Verification combines actual Quarto renders, deterministic comparisons, automated browser/accessibility checks and AI-assisted code review. Synthetic fixtures and expected results also received AI assistance. Passing these checks does not independently establish mathematical correctness, educational equivalence, accessible speech, WCAG conformance or suitability for a particular institution. Author review, mathematical-meaning review and manual assistive-technology/device acceptance remain open.

The maintainer remains responsible for reviewing contributions, rights, claims and publication. No University of Manchester approval or policy-compliance finding is claimed. University-affiliated use requires checking the applicable institutional, teaching, research, confidentiality and publisher rules for that activity. The extension itself makes no AI requests and does not generate or rewrite mathematical content.

Developer harnesses, planning and raw verification evidence are maintained in a separate, currently unpublished workspace. The full regression suite and complete development/prompt history are not included in this source distribution, so its full development verification cannot yet be reproduced from this repository alone. The included article is the runnable consumer example. This limitation does not prevent local installation or rendering and remains explicit until a developer-evidence distribution is available.
