import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { gsap } from "gsap";

const els = {
  filesSummary: document.getElementById("files-summary"),
  outputPath: document.getElementById("output-path"),
  pickFiles: document.getElementById("pick-files"),
  pickOutput: document.getElementById("pick-output"),
  fileList: document.getElementById("file-list"),
  clearFiles: document.getElementById("clear-files"),
  step1Extra: document.getElementById("step1-extra-actions"),

  reviewFiles: document.getElementById("review-files"),
  reviewOutput: document.getElementById("review-output"),
  reviewBlurb: document.getElementById("review-blurb"),

  status: document.getElementById("status"),
  progressBar: document.getElementById("progress-bar"),
  progressFill: document.getElementById("progress-fill"),
  resultBlock: document.getElementById("result"),
  resultSuccess: document.getElementById("result-success"),
  resultFailed: document.getElementById("result-failed"),

  stepBack: document.getElementById("step-back"),
  stepNext: document.getElementById("step-next"),

  hero: document.querySelector(".hero"),
  card: document.querySelector(".card"),
  steps: document.querySelectorAll(".step"),
  dots: document.querySelectorAll(".step-dot"),
  lines: document.querySelectorAll(".step-line"),

  version: document.getElementById("version"),
};

const state = {
  files: new Map(),
  output: null,
  busy: false,
  done: false,
};

let nextId = 0;
let currentStep = 1;

// ---------------- helpers ----------------

function basename(path) {
  return path.split(/[\\/]/).pop();
}

function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function readyFiles() {
  return Array.from(state.files.values()).filter((f) => f.status === "ready");
}

// ---------------- step navigation ----------------

function canContinueFrom(step) {
  if (step === 1) return readyFiles().length > 0 && !anyLoading();
  if (step === 2) return state.output !== null;
  if (step === 3) return !state.busy && !state.done;
  return false;
}

function anyLoading() {
  return Array.from(state.files.values()).some((f) => f.status === "loading");
}

function getStepEl(step) {
  return document.querySelector(`.step[data-step="${step}"]`);
}

function updateIndicator() {
  els.dots.forEach((dot) => {
    const n = parseInt(dot.dataset.step, 10);
    dot.classList.toggle("is-active", n === currentStep);
    dot.classList.toggle("is-completed", n < currentStep);
  });
  els.lines.forEach((line, i) => {
    line.classList.toggle("is-completed", i + 1 < currentStep);
  });
}

function updateNav() {
  els.stepBack.hidden = currentStep === 1 || state.busy;

  if (currentStep === 3) {
    if (state.done) {
      els.stepNext.textContent = "Convert More";
      els.stepNext.disabled = false;
    } else {
      els.stepNext.textContent = "Convert";
      els.stepNext.disabled = !canContinueFrom(3);
    }
  } else {
    els.stepNext.textContent = "Continue";
    els.stepNext.disabled = !canContinueFrom(currentStep);
  }

  els.pickFiles.disabled = state.busy;
  els.pickOutput.disabled = state.busy;
  els.clearFiles.disabled = state.busy;
}

function refreshFilesSummary() {
  const files = Array.from(state.files.values());
  if (files.length === 0) {
    els.filesSummary.textContent = "No files selected";
    els.filesSummary.classList.add("muted");
    els.fileList.hidden = true;
    els.step1Extra.hidden = true;
  } else {
    const ready = readyFiles().length;
    const errored = files.filter((f) => f.status === "error").length;
    const loading = files.filter((f) => f.status === "loading").length;
    let text = `${ready} ready`;
    if (loading > 0) text += ` · ${loading} loading`;
    if (errored > 0) text += ` · ${errored} unsupported`;
    els.filesSummary.textContent = text;
    els.filesSummary.classList.remove("muted");
    els.fileList.hidden = false;
    els.step1Extra.hidden = false;
  }
}

function refreshReview() {
  const ready = readyFiles();
  const count = ready.length;
  els.reviewFiles.textContent = count === 0 ? "—" : `${count} texture${count === 1 ? "" : "s"}`;
  els.reviewOutput.textContent = state.output || "—";
}

function transitionToStep(target) {
  if (target === currentStep) return;
  const direction = target > currentStep ? 1 : -1;
  const oldEl = getStepEl(currentStep);
  const newEl = getStepEl(target);

  // Animate the outgoing step out, then swap and animate the incoming step in.
  gsap.to(oldEl, {
    x: -32 * direction,
    opacity: 0,
    duration: 0.18,
    ease: "power2.in",
    onComplete: () => {
      oldEl.hidden = true;
      newEl.hidden = false;

      // Reset state
      gsap.fromTo(
        newEl,
        { x: 32 * direction, opacity: 0 },
        { x: 0, opacity: 1, duration: 0.28, ease: "power2.out" }
      );
    },
  });

  currentStep = target;
  updateIndicator();
  updateNav();
}

// ---------------- file management ----------------

function renderRow(row, opts = {}) {
  let el = document.getElementById(row.id);
  const isNew = !el;

  if (isNew) {
    el = document.createElement("div");
    el.id = row.id;
    el.className = "file-item";
    els.fileList.appendChild(el);
  }

  const dims = row.dims ? `${row.dims.width} × ${row.dims.height}` : "";
  const meta =
    row.status === "ready"
      ? `${dims} · ${row.format} · ${formatBytes(row.sizeBytes)}`
      : row.status === "loading"
      ? "Reading…"
      : `Error: ${row.error}`;

  el.classList.toggle("file-item--error", row.status === "error");
  el.classList.toggle("file-item--loading", row.status === "loading");

  el.innerHTML = `
    <div class="file-thumb-wrap">
      ${
        row.preview
          ? `<img class="file-thumb" src="${row.preview}" alt="" />`
          : `<div class="file-thumb file-thumb--placeholder"></div>`
      }
    </div>
    <div class="file-meta">
      <div class="file-name" title="${row.path}">${row.name}</div>
      <div class="file-stats">${meta}</div>
    </div>
    <button class="file-remove" data-id="${row.id}" aria-label="Remove">×</button>
  `;

  el.querySelector(".file-remove").addEventListener("click", () => removeFile(row.id, el));

  if (isNew && opts.animate !== false) {
    gsap.fromTo(
      el,
      { y: -6, opacity: 0, scale: 0.985 },
      { y: 0, opacity: 1, scale: 1, duration: 0.28, ease: "power2.out" }
    );
  }
}

function removeFile(id, el) {
  gsap.to(el, {
    x: 24,
    opacity: 0,
    duration: 0.18,
    ease: "power2.in",
    onComplete: () => {
      state.files.delete(id);
      el.remove();
      refreshFilesSummary();
      updateNav();
    },
  });
}

async function addFile(path) {
  for (const existing of state.files.values()) {
    if (existing.path === path) return;
  }
  const id = `file-${nextId++}`;
  const row = {
    id,
    path,
    name: basename(path),
    status: "loading",
  };
  state.files.set(id, row);
  renderRow(row);
  refreshFilesSummary();
  updateNav();

  try {
    const preview = await invoke("preview_vtf", { path });
    row.status = "ready";
    row.preview = preview.data_url;
    row.dims = { width: preview.width, height: preview.height };
    row.format = preview.format;
    row.sizeBytes = preview.file_size;
  } catch (err) {
    row.status = "error";
    row.error = String(err);
  }
  renderRow(row, { animate: false });
  refreshFilesSummary();
  updateNav();
}

async function pickFiles() {
  const selected = await open({
    multiple: true,
    filters: [{ name: "Valve Texture", extensions: ["vtf"] }],
  });
  if (!selected) return;
  const list = Array.isArray(selected) ? selected : [selected];
  for (const path of list) {
    await addFile(path);
  }
}

async function pickOutput() {
  const selected = await open({ directory: true, multiple: false });
  if (typeof selected !== "string") return;
  state.output = selected;
  els.outputPath.textContent = selected;
  els.outputPath.classList.remove("muted");
  updateNav();
}

function clearFiles() {
  // Stagger out
  const items = Array.from(els.fileList.querySelectorAll(".file-item"));
  if (items.length === 0) return;
  gsap.to(items, {
    x: 24,
    opacity: 0,
    stagger: 0.04,
    duration: 0.18,
    ease: "power2.in",
    onComplete: () => {
      state.files.clear();
      els.fileList.innerHTML = "";
      refreshFilesSummary();
      updateNav();
    },
  });
}

// ---------------- conversion ----------------

function setProgress(current, total) {
  els.progressFill.style.width =
    total === 0 ? "0%" : `${(current / total) * 100}%`;
}

function animateCount(el, target) {
  const counter = { value: 0 };
  gsap.to(counter, {
    value: target,
    duration: 0.6,
    ease: "power2.out",
    onUpdate: () => {
      el.textContent = Math.round(counter.value);
    },
  });
}

async function runConversion() {
  const ready = readyFiles();
  if (ready.length === 0 || !state.output) return;

  state.busy = true;
  state.done = false;
  els.resultBlock.hidden = true;
  updateNav();

  els.progressBar.hidden = false;
  setProgress(0, ready.length);
  els.status.textContent = "Starting…";

  try {
    const result = await invoke("convert_files", {
      files: ready.map((f) => f.path),
      output: state.output,
    });

    setProgress(result.total, result.total);

    if (result.failed.length === 0) {
      els.status.textContent = `All ${result.total} converted.`;
    } else {
      const first = result.failed[0];
      els.status.textContent =
        `${result.failed.length} failed — first: ${basename(first.file)} (${first.error}).`;
    }

    els.resultBlock.hidden = false;
    gsap.fromTo(
      els.resultBlock,
      { y: 8, opacity: 0 },
      { y: 0, opacity: 1, duration: 0.3, ease: "power2.out" }
    );
    animateCount(els.resultSuccess, result.succeeded);
    animateCount(els.resultFailed, result.failed.length);

    state.done = true;
  } catch (err) {
    els.status.textContent = `Error: ${err}`;
  } finally {
    state.busy = false;
    updateNav();
  }
}

function startOver() {
  // Clear everything and go back to step 1.
  state.files.clear();
  els.fileList.innerHTML = "";
  state.output = null;
  state.done = false;
  els.outputPath.textContent = "No folder selected";
  els.outputPath.classList.add("muted");
  els.resultBlock.hidden = true;
  els.progressBar.hidden = true;
  els.progressFill.style.width = "0%";
  els.status.textContent = "";
  refreshFilesSummary();
  transitionToStep(1);
}

// ---------------- events ----------------

listen("convert-progress", (event) => {
  const { current, total, file } = event.payload;
  setProgress(current - 1, total);
  els.status.textContent = `Converting ${basename(file)} (${current}/${total})…`;
});

els.pickFiles.addEventListener("click", pickFiles);
els.pickOutput.addEventListener("click", pickOutput);
els.clearFiles.addEventListener("click", clearFiles);

els.stepBack.addEventListener("click", () => {
  if (currentStep > 1) transitionToStep(currentStep - 1);
});

els.stepNext.addEventListener("click", () => {
  if (currentStep === 3) {
    if (state.done) {
      startOver();
    } else {
      runConversion();
    }
    return;
  }

  if (currentStep === 2) {
    refreshReview();
  }

  if (canContinueFrom(currentStep)) {
    transitionToStep(currentStep + 1);
  }
});

// Allow clicking step dots to jump back (only to completed/active steps).
els.dots.forEach((dot) => {
  dot.addEventListener("click", () => {
    const target = parseInt(dot.dataset.step, 10);
    if (target < currentStep) transitionToStep(target);
    if (target === 3 && currentStep === 2 && canContinueFrom(2)) {
      refreshReview();
      transitionToStep(3);
    }
  });
});

// ---------------- mount ----------------

// __APP_VERSION__ is replaced at build time by Vite (see vite.config.js).
// No Rust IPC call needed just to display the version.
els.version.textContent = `vtf2png-app v${__APP_VERSION__}`;

// Entrance animation on load
window.addEventListener("DOMContentLoaded", () => {
  updateIndicator();
  updateNav();

  gsap.set([els.hero, els.card], { opacity: 0, y: 12 });
  gsap.set(".step-indicator", { opacity: 0, y: 8 });

  const tl = gsap.timeline({ defaults: { ease: "power3.out" } });
  tl.to(els.hero, { opacity: 1, y: 0, duration: 0.55 })
    .to(".step-indicator", { opacity: 1, y: 0, duration: 0.4 }, "-=0.25")
    .to(els.card, { opacity: 1, y: 0, duration: 0.5 }, "-=0.3");
});
