# Changelog

## 0.0.4 — local experimental candidate, 9 October 2026

- Fixed print visibility for extension content inside closed authored native disclosures, without changing screen disclosure or level-selection state.
- Required original authored annotation preservation for a successful assistive MathML DOM verdict; a DOM matching a changed final internal tree no longer passes.
- Avoided unnecessary final AST rewrites, copied ordinary TeX in runs and indexed normalized association labels instead of repeatedly scanning earlier labels.
- Reduced repeated argument-scope and text inspection within MathML diagnostic checkpoints, retaining final DOM reinspection after the author's page-ready hook. This is a bounded diagnostic optimisation, not a whole-site rendering-speed claim.

No additional setup or authoring changes are required. Manual acceptance, intent-aware speech and accessibility conformance remain separate questions.

Public-source preparation makes material AI assistance and review limits explicit, adds maintainer/upstream terms links, documents serial verification and protects generated, credential and developer files from accidental addition. Runtime behavior is unchanged; publication and the actual remote installation route remain separate steps.

## 0.0.3 — local experimental candidate, 9 October 2026

- Added opt-in actual assistive MathML DOM delivery with separate annotation, enrichment and DOM verdicts; no intent-aware speech claim.
- Exported explicit native semantic identities, document-local definition occurrences and notation declarations as inert versioned JSON; added reference schemas for data and options.
- Fixed repeated links into closed proofs, hints and assumptions, including nested steps. Indexed explanation groups in one initial pass.
- Compiled visual templates with TeX-aware placeholders; refused comments, verbatim, unbalanced braces and known definition/indirection commands. Diagnosed misplaced association attributes and reserved payload-ID collisions.
- Extended native format checks and browser failure evidence. Manual author, mathematical meaning, assistive-technology and physical-device review remain separate acceptance gates.

**Authoring change:** templates previously admitted with hidden/escaped placeholders or unsupported TeX commands are now errors. Replace them with bounded ordinary visual templates. New JSON interfaces are experimental and document-scoped; no automatic migration or full KG interoperability is promised.

## 0.0.2 — local development, 9 October 2026

- Added authored explanation levels, a per-statement selector and visible links to named proofs and explanations. Unlevelled explanations stay available for every choice.
- Added fragment reveal of filtered explanations and return focus to the original statement. Print and no-JavaScript output retain all variants.
- Preserved author-written labels in DOCX and controls-disabled HTML; added explicit generated-label overrides for document languages.
- Rejected blank labels, mixed disclosure kinds and explanation nesting that could hide canonical mathematical content.

**Authoring change:** related blocks for one statement require distinct summaries. Give multiple proofs explicit, meaningful `am-summary` values; `.am-explanation` always requires its own summary. Level names are authored labels, not inferred expertise or proof status. There is no automatic migration.

## 0.0.1 — local development, 9 October 2026

- Started explicit native theorem/proof associations and authored hint/assumption disclosures, with native HTML controls and fragment navigation.
- Started a page-local, fixed-arity mathematical macro experiment targeting pinned MathJax 4.1.3 and author-supplied MathML annotations.
- Defined ordinary native static fallbacks, bounded configuration, diagnostics and separate transport/accessibility acceptance checks.
- Kept the runtime and user instructions separate from developer tooling and generated evidence.

This initial build has no published repository or release. Experimental 0.0.x authoring conventions can change; retain a known working installed copy before updating. There is no automatic migration or verified intent-aware speech claim.
