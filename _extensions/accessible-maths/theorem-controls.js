/* Copyright 2026 Kai Prince. SPDX-License-Identifier: Apache-2.0 */

(() => {
  "use strict";

  const levelGroups = new Map();

  function explanationOwner(element) {
    for (let current = element; current; current = current.parentElement) {
      if (current.classList.contains("am-explanation")
        && current.getAttribute("data-am-kind") === "explanation") return current;
    }
    return null;
  }

  function ownedDisclosure(element) {
    // A native wrapper may name its contained disclosure; a nested step may
    // instead be inside it. An association outside the wrapper is not owned.
    const associatedId = element.getAttribute("data-am-disclosure");
    const associated = associatedId && document.getElementById(associatedId);
    if (associated && associated.localName === "details"
      && associated.classList.contains("am-disclosure") && element.contains(associated)) return associated;
    for (let current = element; current; current = current.parentElement) {
      if (current.localName === "details" && current.classList.contains("am-disclosure")) return current;
    }
    return null;
  }

  function initializeLevels() {
    // Fragment-only test/embedding environments need not implement form APIs.
    if (typeof document.querySelectorAll !== "function"
      || typeof document.createElement !== "function") return;
    const explanationsByTheorem = new Map();
    for (const variant of document.querySelectorAll(".am-explanation[data-am-kind='explanation']")) {
      const theoremId = variant.getAttribute("data-am-theorem");
      let group = explanationsByTheorem.get(theoremId);
      if (!group) {
        group = { variants: [], levels: [], seenLevels: new Set() };
        explanationsByTheorem.set(theoremId, group);
      }
      group.variants.push(variant);
      const level = variant.getAttribute("data-am-level");
      if (level && !group.seenLevels.has(level)) {
        group.seenLevels.add(level);
        group.levels.push(level);
      }
    }
    let selectNumber = 0;
    for (const placeholder of document.querySelectorAll(".am-level-controls[data-am-level-for]")) {
      const theoremId = placeholder.getAttribute("data-am-level-for");
      const theorem = document.getElementById(theoremId);
      if (!theorem || theorem.getAttribute("data-am-theorem-target") !== "true"
        || !theorem.contains(placeholder) || levelGroups.has(theoremId)) continue;
      const group = explanationsByTheorem.get(theoremId);
      if (!group || group.levels.length < 2) continue;
      const { variants, levels } = group;

      const label = document.createElement("label");
      label.className = "am-level-label";
      label.textContent = placeholder.getAttribute("data-am-level-label") || "Explanation level";
      const select = document.createElement("select");
      do { select.id = `am-level-select-${++selectNumber}`; }
      while (document.getElementById(select.id));
      label.htmlFor = select.id;
      function option(value, text) {
        const item = document.createElement("option");
        item.value = value;
        item.textContent = text;
        select.appendChild(item);
      }
      option("", placeholder.getAttribute("data-am-all-label") || "All explanations");
      for (const level of levels) option(level, level);
      select.value = "";
      const apply = () => {
        const focused = document.activeElement;
        for (const variant of variants) {
          const level = variant.getAttribute("data-am-level");
          variant.hidden = select.value !== "" && Boolean(level) && level !== select.value;
        }
        if (focused && variants.some((variant) => variant.hidden && variant.contains(focused))) select.focus();
      };
      select.addEventListener("change", apply);
      placeholder.appendChild(label);
      placeholder.appendChild(select);
      levelGroups.set(theoremId, { select, apply });
      apply();
      placeholder.hidden = false;
    }
  }

  // Native details/summary owns disclosure behavior. This enhancement only
  // filters authored explanations and reveals extension-owned destinations.
  function revealFragment() {
    const hash = window.location.hash;
    if (!hash || hash === "#") return;

    let id;
    try {
      id = decodeURIComponent(hash.slice(1));
    } catch {
      return;
    }

    // An ID lookup avoids interpreting author-controlled IDs as CSS selectors.
    const target = document.getElementById(id);
    if (!target) return;

    // A fragment can target the explanation wrapper or any nested step. Make
    // its existing source visible before opening details and moving focus.
    const explanation = explanationOwner(target);
    if (explanation) {
      const group = levelGroups.get(explanation.getAttribute("data-am-theorem"));
      if (group) {
        group.select.value = "";
        group.apply();
      }
    }

    // Quarto retains a native proof/theorem container and its original anchor.
    // It may explicitly name a disclosure contained inside that container.
    // Ignore associations escaping that target, even when an ID exists.
    let origin = target;
    const associatedId = target.getAttribute("data-am-disclosure");
    if (associatedId) {
      const associated = document.getElementById(associatedId);
      if (associated && associated.localName === "details"
        && associated.classList.contains("am-disclosure") && target.contains(associated)) {
        origin = associated;
      }
    }

    const ancestors = [];
    let owner = null;
    for (let element = origin; element; element = element.parentElement) {
      if (element.localName !== "details") continue;
      ancestors.push(element);
      if (!owner && element.classList.contains("am-disclosure")) owner = element;
    }
    if (!owner && target.getAttribute("data-am-theorem-target") !== "true") return;

    // Open outer containers first, including authored native details wrappers.
    // Other disclosures retain their current state.
    for (let index = ancestors.length - 1; index >= 0; index -= 1) {
      ancestors[index].open = true;
    }

    // Most HTML destinations can be focused with a temporary tabindex. When a
    // destination has no focus API (for example some MathML implementations),
    // retain native content and focus its nearest disclosure summary instead.
    const summary = owner && Array.from(owner.children).find((child) => child.localName === "summary");
    function focusDestination(focusTarget) {
      if (!focusTarget || typeof focusTarget.focus !== "function") return false;
      const temporaryTabindex = !focusTarget.hasAttribute("tabindex");
      if (temporaryTabindex) focusTarget.setAttribute("tabindex", "-1");

      const restoreTabindex = () => {
        if (temporaryTabindex && focusTarget.getAttribute("tabindex") === "-1") {
          focusTarget.removeAttribute("tabindex");
        }
      };
      if (temporaryTabindex) {
        focusTarget.addEventListener("blur", restoreTabindex, { once: true });
      }
      focusTarget.focus({ preventScroll: true });
      if (document.activeElement !== focusTarget) {
        restoreTabindex();
        focusTarget.removeEventListener("blur", restoreTabindex);
        return false;
      }
      return true;
    }
    if (!focusDestination(target)) focusDestination(summary);

    // Do not rewrite the URL or animate the reader's jump, including when the
    // surrounding site requests smooth scrolling.
    if (typeof target.scrollIntoView === "function") {
      target.scrollIntoView({ behavior: "instant", block: "start", inline: "nearest" });
    }
  }

  function start() {
    initializeLevels();
    revealFragment();
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
  window.addEventListener("hashchange", revealFragment);

  // Activating an owned fragment link again does not fire hashchange. Observe
  // that narrow case without cancelling navigation or altering browser history.
  document.addEventListener("click", (event) => {
    if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey
      || event.shiftKey || event.altKey) return;
    let link = event.target;
    while (link && link.localName !== "a") link = link.parentElement;
    if (!link) return;
    const href = link.getAttribute("href");
    if (!href) return;
    let linked, current;
    try {
      linked = new URL(href, window.location.href);
      current = new URL(window.location.href);
    } catch { return; }
    // Quarto navigation normalizes index.html fragment links to absolute
    // directory URLs. Treat that native page alias as the same document,
    // without admitting other pages, origins or query-dependent documents.
    const pagePath = (pathname) => pathname.replace(/\/index\.html$/, "/");
    if (linked.origin !== current.origin || linked.search !== current.search
      || pagePath(linked.pathname) !== pagePath(current.pathname)
      || !linked.hash || linked.hash !== current.hash) return;
    let destination;
    try { destination = document.getElementById(decodeURIComponent(linked.hash.slice(1))); }
    catch { return; }
    if (!destination || (!link.hasAttribute("data-am-return") && !ownedDisclosure(destination))) return;
    window.setTimeout(revealFragment, 0);
  });
})();
