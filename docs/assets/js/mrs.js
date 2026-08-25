/* =============================================================================
   MRS Aircraft — site behaviour.

   No framework, no bundler. Seven small features, each isolated:
     1. scroll reveal        IntersectionObserver, never a scroll listener
     2. nav condense         IntersectionObserver sentinel, same reason
     3. mobile menu          hamburger morph, staggered reveal, Escape, scroll lock
     4. openings filter      state lives in the URL so filtered views are linkable
     5. forms                inline errors, focus first error, live region, honeypot
     6. exploded 3d scenes   procedural three.js, scrubbed to scroll, lazy imported
     7. hero hand-over       photo, graticule and copy leave at three rates

   Every animation here is gated on prefers-reduced-motion.
   ========================================================================== */

(() => {
  "use strict";

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  const $  = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  /* -- 1. scroll reveal ---------------------------------------------------- */
  /* Sequences content into view in reading order. Justification: hierarchy.
     The reader's eye is walked down the page one block at a time rather than
     being handed a finished wall of text. */

  function initReveal() {
    const items = $$(".reveal");
    if (!items.length) return;

    if (reduced.matches || !("IntersectionObserver" in window)) {
      items.forEach((el) => el.classList.add("in"));
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) {
            // An instant jump (anchor link, restored scroll position, deep
            // link) never renders the frames in between, so anything already
            // above the viewport would stay invisible forever and the page
            // would look broken on the way back up. Reveal it silently.
            if (entry.boundingClientRect.bottom <= 0) {
              entry.target.classList.add("in");
              io.unobserve(entry.target);
            }
            continue;
          }
          entry.target.classList.add("in");
          io.unobserve(entry.target);
        }
      },
      { rootMargin: "0px 0px -12% 0px", threshold: 0.08 }
    );

    // Stagger index is per group, so a grid cascades but sections do not
    // inherit an ever-growing delay down the page.
    $$("[data-stagger]").forEach((group) => {
      Array.from(group.children).forEach((child, i) => {
        child.style.setProperty("--i", String(Math.min(i, 8)));
      });
    });

    items.forEach((el) => io.observe(el));
  }

  /* -- 2. nav condense ----------------------------------------------------- */

  function initNav() {
    const wrap = $(".nav-wrap");
    if (!wrap) return;

    const sentinel = document.createElement("div");
    sentinel.setAttribute("aria-hidden", "true");
    sentinel.style.cssText = "position:absolute;top:0;left:0;width:1px;height:1px;";
    document.body.prepend(sentinel);

    if (!("IntersectionObserver" in window)) {
      wrap.classList.add("is-stuck");
      return;
    }

    new IntersectionObserver(
      ([entry]) => wrap.classList.toggle("is-stuck", !entry.isIntersecting),
      { threshold: 0 }
    ).observe(sentinel);
  }

  /* -- 3. mobile menu ------------------------------------------------------ */

  function initMenu() {
    const toggle = $(".nav-toggle");
    const panel = $(".nav-panel");
    if (!toggle || !panel) return;

    panel.querySelectorAll("a").forEach((a, i) => a.style.setProperty("--i", String(i)));

    let lastFocus = null;

    const setOpen = (open) => {
      toggle.setAttribute("aria-expanded", String(open));
      toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
      if (open) {
        lastFocus = document.activeElement;
        panel.setAttribute("data-open", "");
        document.documentElement.style.overflow = "hidden";
        const first = panel.querySelector("a, button");
        if (first) first.focus();
      } else {
        panel.removeAttribute("data-open");
        document.documentElement.style.overflow = "";
        if (lastFocus instanceof HTMLElement) lastFocus.focus();
      }
    };

    toggle.addEventListener("click", () => {
      setOpen(toggle.getAttribute("aria-expanded") !== "true");
    });

    panel.addEventListener("click", (e) => {
      if (e.target instanceof HTMLElement && e.target.closest("a")) setOpen(false);
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && panel.hasAttribute("data-open")) setOpen(false);
    });

    // Keep focus inside the panel while it owns the screen.
    panel.addEventListener("keydown", (e) => {
      if (e.key !== "Tab") return;
      const focusable = $$("a, button", panel).filter((el) => el.offsetParent !== null);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    });

    // A resize past the breakpoint must not leave the page scroll-locked.
    matchMedia("(min-width: 1024px)").addEventListener("change", (e) => {
      if (e.matches && panel.hasAttribute("data-open")) setOpen(false);
    });
  }

  /* -- 4. openings filter -------------------------------------------------- */
  /* Filter state is written to the query string, so a filtered list can be
     linked, bookmarked and shared. Back and forward work. */

  function initFilters() {
    const form = $("[data-filters]");
    const list = $("[data-roles]");
    if (!form || !list) return;

    const rows = $$("[data-role]", list);
    const count = $("[data-filter-count]");
    const empty = $("[data-filter-empty]");
    const keys = ["dept", "experience", "type"];

    const apply = (push) => {
      const state = {};
      keys.forEach((k) => {
        const field = form.elements.namedItem(k);
        if (field instanceof HTMLSelectElement && field.value) state[k] = field.value;
      });

      let shown = 0;
      for (const row of rows) {
        const hit = keys.every((k) => !state[k] || row.dataset[k] === state[k]);
        row.hidden = !hit;
        if (hit) shown += 1;
      }

      if (count) {
        count.textContent =
          shown === rows.length
            ? `${rows.length} open roles`
            : `${shown} of ${rows.length} roles`;
      }
      if (empty) empty.hidden = shown !== 0;

      if (push) {
        const params = new URLSearchParams(state);
        const url = params.toString()
          ? `${location.pathname}?${params}`
          : location.pathname;
        history.replaceState(null, "", url);
      }
    };

    // Hydrate from the URL so a shared link opens already filtered.
    const params = new URLSearchParams(location.search);
    keys.forEach((k) => {
      const field = form.elements.namedItem(k);
      const val = params.get(k);
      if (field instanceof HTMLSelectElement && val) field.value = val;
    });

    form.addEventListener("change", () => apply(true));
    form.addEventListener("submit", (e) => e.preventDefault());

    const reset = $("[data-filter-reset]");
    if (reset) {
      reset.addEventListener("click", () => {
        form.reset();
        apply(true);
      });
    }

    apply(false);
  }

  /* -- 5. forms ------------------------------------------------------------ */

  const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  const RE_PHONE = /^[+\d][\d\s\-()]{7,17}$/;
  const RESUME_TYPES = [".pdf", ".doc", ".docx"];
  const RESUME_MAX = 5 * 1024 * 1024;

  function fieldError(input) {
    const value = (input.value || "").trim();
    const label = input.dataset.label || "This field";

    if (input.type === "checkbox") {
      return input.required && !input.checked ? "Please tick this box to continue." : "";
    }
    if (input.required && !value) return `${label} is required.`;
    if (!value) return "";
    if (input.type === "email" && !RE_EMAIL.test(value)) {
      return "Enter an email address in the form name@example.com";
    }
    if (input.type === "tel" && !RE_PHONE.test(value)) {
      return "Enter a phone number with country code, for example +91 98765 43210";
    }
    if (input.type === "url" && !/^https?:\/\/\S+\.\S+/.test(value)) {
      return "Enter a full link starting with https://";
    }
    if (input.type === "file" && input.files && input.files.length) {
      const file = input.files[0];
      const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
      if (!RESUME_TYPES.includes(ext)) {
        return "Attach a PDF, DOC or DOCX file.";
      }
      if (file.size > RESUME_MAX) {
        const mb = (file.size / 1048576).toFixed(1);
        return `That file is ${mb} MB. The limit is 5 MB.`;
      }
    }
    return "";
  }

  function paint(input, message) {
    const field = input.closest(".field") || input.closest(".check-field");
    if (!field) return;
    const slot = field.querySelector(".field-error");
    if (message) {
      field.setAttribute("data-invalid", "");
      input.setAttribute("aria-invalid", "true");
      if (slot) slot.textContent = message;
    } else {
      field.removeAttribute("data-invalid");
      input.removeAttribute("aria-invalid");
      if (slot) slot.textContent = "";
    }
  }

  function initForms() {
    $$("form[data-form]").forEach((form) => {
      const status = form.querySelector("[data-status]");
      const submit = form.querySelector("[type=submit]");
      const submitLabel = submit ? submit.querySelector("[data-label]") : null;
      const endpoint = form.dataset.endpoint || "";
      const fallbackMail = form.dataset.fallbackMail || "info@mrsaircraft.com";
      const controls = $$("input, select, textarea", form).filter(
        (el) => el.name && el.name !== "_honey"
      );

      let dirty = false;
      let sending = false;

      const markDirty = () => {
        dirty = true;
      };
      controls.forEach((el) => {
        el.addEventListener("input", markDirty, { once: true });
        // Validate on blur, then live once the field has been flagged.
        el.addEventListener("blur", () => paint(el, fieldError(el)));
        el.addEventListener("input", () => {
          if (el.getAttribute("aria-invalid") === "true") paint(el, fieldError(el));
        });
      });

      // Losing a part-filled application to a stray click is worth a prompt.
      window.addEventListener("beforeunload", (e) => {
        if (!dirty || sending) return;
        e.preventDefault();
        e.returnValue = "";
      });

      const setStatus = (tone, message) => {
        if (!status) return;
        status.setAttribute("data-tone", tone);
        status.textContent = message;
      };

      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        if (sending) return;

        // Honeypot. A bot fills every field it finds; a person never sees this.
        const honey = form.elements.namedItem("_honey");
        if (honey instanceof HTMLInputElement && honey.value) return;

        let firstBad = null;
        for (const el of controls) {
          const message = fieldError(el);
          paint(el, message);
          if (message && !firstBad) firstBad = el;
        }

        if (firstBad) {
          setStatus("error", "Some details need fixing before this can be sent.");
          firstBad.focus();
          return;
        }

        if (!endpoint) {
          // No silent success. If the form is not wired up, say so and give a
          // route that definitely works. See DEPLOY.md.
          setStatus(
            "error",
            `This form is not connected to a mailbox yet, so nothing was sent. Please email ${fallbackMail} directly.`
          );
          return;
        }

        sending = true;
        if (submit) submit.disabled = true;
        if (submitLabel) submitLabel.textContent = "Sending…";
        setStatus("", "");

        try {
          const res = await fetch(endpoint, {
            method: "POST",
            body: new FormData(form),
            headers: { Accept: "application/json" },
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          dirty = false;
          const done = form.querySelector("[data-done]");
          if (done) {
            form.hidden = true;
            done.hidden = false;
            done.setAttribute("tabindex", "-1");
            done.focus();
          } else {
            form.reset();
            setStatus("ok", form.dataset.successMessage || "Message received. Thank you.");
          }
        } catch (err) {
          setStatus(
            "error",
            `We could not send that just now. Please try again, or email ${fallbackMail} directly.`
          );
        } finally {
          sending = false;
          if (submit) submit.disabled = false;
          if (submitLabel) submitLabel.textContent = submit.dataset.idle || "Send";
        }
      });
    });

    // Role and enquiry pre-select, driven by the query string the capability
    // and job pages link with.
    const params = new URLSearchParams(location.search);
    for (const [key, value] of params) {
      const field = document.querySelector(`[data-prefill="${CSS.escape(key)}"]`);
      if (!field) continue;
      const option = Array.from(field.options || []).find(
        (o) => o.value.toLowerCase() === value.toLowerCase()
      );
      if (option) field.value = option.value;
      else if (field instanceof HTMLInputElement) field.value = value;
    }
  }

  /* -- 6. exploded 3d scenes ----------------------------------------------- */
  /* three.js is ~600 KB, so a scene module is only imported once its section is
     within a screen of the fold. Before that the section is its own poster:
     a heading, the copy, and the part list as plain text. */

  const SCENES = {
    engine: { module: "./mrs-engine.js", mount: "mountEngine" },
    airframe: { module: "./mrs-airframe.js", mount: "mountAirframe" },
  };

  function initScenes() {
    if (!("IntersectionObserver" in window)) return;

    $$("[data-scene]").forEach((host) => {
      const spec = SCENES[host.dataset.scene];
      if (!spec) return;

      const io = new IntersectionObserver(
        async (entries) => {
          if (!entries[0].isIntersecting) return;
          io.disconnect();
          try {
            const mod = await import(spec.module);
            await mod[spec.mount](host);
          } catch (err) {
            // A WebGL failure must not take the section down with it. The copy
            // and the part list stay; only the canvas is missing.
            host.setAttribute("data-webgl", "failed");
            console.warn(`${host.dataset.scene} failed to mount:`, err);
          }
        },
        { rootMargin: "600px 0px" }
      );
      io.observe(host);
    });
  }

  /* -- 7. hero hand-over --------------------------------------------------- */
  /* Writes progress through the hero to --hero-p, and CSS does the rest: the
     photograph, the graticule and the copy leave at three different rates so
     the first screen passes to the second instead of sliding away as one flat
     sheet. Same discipline as the 3D sections: an IntersectionObserver owns the
     rAF loop, there is no scroll listener, and nothing runs once the hero has
     gone. Undamped on purpose, because a slow translate shows no jitter and
     lag on the fold is the one place it would be felt. */

  function initHero() {
    const hero = $(".hero");
    if (!hero || reduced.matches || !("IntersectionObserver" in window)) return;

    let running = false;
    let raf = 0;
    let last = -1;

    const frame = () => {
      if (!running) return;
      const r = hero.getBoundingClientRect();
      const p = Math.min(1, Math.max(0, -r.top / Math.max(r.height, 1)));
      if (Math.abs(p - last) > 0.001) {
        last = p;
        hero.style.setProperty("--hero-p", p.toFixed(3));
      }
      raf = requestAnimationFrame(frame);
    };

    new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !running) {
          running = true;
          raf = requestAnimationFrame(frame);
        } else if (!entry.isIntersecting && running) {
          running = false;
          cancelAnimationFrame(raf);
        }
      },
      { threshold: 0 }
    ).observe(hero);
  }

  /* -- boot ---------------------------------------------------------------- */

  const boot = () => {
    initNav();
    initMenu();
    initReveal();
    initFilters();
    initForms();
    initScenes();
    initHero();
    const year = $("[data-year]");
    if (year) year.textContent = String(new Date().getFullYear());
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
