import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { gsap } from "gsap";

import StepIndicator from "./components/StepIndicator.jsx";
import FileItem from "./components/FileItem.jsx";

function basename(path) {
  return path.split(/[\\/]/).pop();
}

let nextFileId = 0;

export default function App() {
  // ---- state ----
  const [files, setFiles] = useState([]);
  const [output, setOutput] = useState(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const [transitionDir, setTransitionDir] = useState(0);
  const [statusText, setStatusText] = useState("");
  const [progressFraction, setProgressFraction] = useState(0);
  const [progressVisible, setProgressVisible] = useState(false);
  const [result, setResult] = useState(null);

  // ---- refs ----
  const heroRef = useRef(null);
  const indicatorRef = useRef(null);
  const cardRef = useRef(null);
  const stepRefs = useRef({});
  const resultBlockRef = useRef(null);
  const successCountRef = useRef(null);
  const failedCountRef = useRef(null);

  // ---- derived ----
  const readyFiles = files.filter((f) => f.status === "ready");
  const anyLoading = files.some((f) => f.status === "loading");

  function canContinueFrom(step) {
    if (step === 1) return readyFiles.length > 0 && !anyLoading;
    if (step === 2) return output !== null;
    if (step === 3) return !busy && !done;
    return false;
  }

  // ---- mount entrance animation (runs once) ----
  useEffect(() => {
    gsap.set([heroRef.current, cardRef.current], { opacity: 0, y: 12 });
    gsap.set(indicatorRef.current, { opacity: 0, y: 8 });

    const tl = gsap.timeline({ defaults: { ease: "power3.out" } });
    tl.to(heroRef.current, { opacity: 1, y: 0, duration: 0.55 })
      .to(indicatorRef.current, { opacity: 1, y: 0, duration: 0.4 }, "-=0.25")
      .to(cardRef.current, { opacity: 1, y: 0, duration: 0.5 }, "-=0.3");
  }, []);

  // ---- step transition: animate the new active step in ----
  useEffect(() => {
    if (transitionDir === 0) return; // skip on initial mount
    const el = stepRefs.current[currentStep];
    if (!el) return;
    gsap.fromTo(
      el,
      { opacity: 0, x: 24 * transitionDir },
      { opacity: 1, x: 0, duration: 0.28, ease: "power2.out" }
    );
  }, [currentStep, transitionDir]);

  // ---- listen for Tauri progress events ----
  useEffect(() => {
    const unlistenPromise = listen("convert-progress", (event) => {
      const { current, total, file } = event.payload;
      setProgressFraction(total === 0 ? 0 : (current - 1) / total);
      setStatusText(`Converting ${basename(file)} (${current}/${total})…`);
    });
    return () => {
      unlistenPromise.then((fn) => fn());
    };
  }, []);

  // ---- count-up animation when result arrives ----
  useEffect(() => {
    if (!result || !resultBlockRef.current) return;

    gsap.fromTo(
      resultBlockRef.current,
      { y: 8, opacity: 0 },
      { y: 0, opacity: 1, duration: 0.3, ease: "power2.out" }
    );

    function tickTo(el, target) {
      if (!el) return;
      const c = { v: 0 };
      gsap.to(c, {
        v: target,
        duration: 0.6,
        ease: "power2.out",
        onUpdate: () => {
          el.textContent = Math.round(c.v);
        },
      });
    }
    tickTo(successCountRef.current, result.succeeded);
    tickTo(failedCountRef.current, result.failed.length);
  }, [result]);

  // ---- step navigation ----
  function transitionTo(target) {
    if (target === currentStep) return;
    setTransitionDir(target > currentStep ? 1 : -1);
    setCurrentStep(target);
  }

  function goNext() {
    if (currentStep === 3) {
      if (done) startOver();
      else runConversion();
      return;
    }
    if (canContinueFrom(currentStep)) transitionTo(currentStep + 1);
  }

  function goBack() {
    if (currentStep > 1 && !busy) transitionTo(currentStep - 1);
  }

  function jumpTo(target) {
    if (busy) return;
    if (target < currentStep) transitionTo(target);
  }

  // ---- file management ----
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

  async function addFile(path) {
    if (files.some((f) => f.path === path)) return;
    const id = `file-${nextFileId++}`;
    const row = {
      id,
      path,
      name: basename(path),
      status: "loading",
    };
    setFiles((prev) => [...prev, row]);

    try {
      const preview = await invoke("preview_vtf", { path });
      setFiles((prev) =>
        prev.map((f) =>
          f.id === id
            ? {
                ...f,
                status: "ready",
                preview: preview.data_url,
                dims: { width: preview.width, height: preview.height },
                format: preview.format,
                sizeBytes: preview.file_size,
              }
            : f
        )
      );
    } catch (err) {
      setFiles((prev) =>
        prev.map((f) =>
          f.id === id ? { ...f, status: "error", error: String(err) } : f
        )
      );
    }
  }

  function removeFile(id) {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  }

  function clearFiles() {
    setFiles([]);
  }

  async function pickOutput() {
    const selected = await open({ directory: true, multiple: false });
    if (typeof selected === "string") setOutput(selected);
  }

  // ---- conversion ----
  async function runConversion() {
    if (readyFiles.length === 0 || !output) return;

    setBusy(true);
    setDone(false);
    setResult(null);
    setProgressVisible(true);
    setProgressFraction(0);
    setStatusText("Starting…");

    try {
      const res = await invoke("convert_files", {
        files: readyFiles.map((f) => f.path),
        output,
      });

      setProgressFraction(1);

      if (res.failed.length === 0) {
        setStatusText(`All ${res.total} converted.`);
      } else {
        const first = res.failed[0];
        setStatusText(
          `${res.failed.length} failed — first: ${basename(first.file)} (${first.error}).`
        );
      }

      setResult(res);
      setDone(true);
    } catch (err) {
      setStatusText(`Error: ${err}`);
    } finally {
      setBusy(false);
    }
  }

  function startOver() {
    setFiles([]);
    setOutput(null);
    setDone(false);
    setResult(null);
    setProgressVisible(false);
    setProgressFraction(0);
    setStatusText("");
    transitionTo(1);
  }

  // ---- next-button label ----
  const nextLabel =
    currentStep < 3 ? "Continue" : done ? "Convert More" : "Convert";
  const nextDisabled =
    currentStep < 3
      ? !canContinueFrom(currentStep)
      : !done && !canContinueFrom(3);

  const filesSummaryText = (() => {
    if (files.length === 0) return "No files selected";
    const ready = readyFiles.length;
    const loading = files.filter((f) => f.status === "loading").length;
    const errored = files.filter((f) => f.status === "error").length;
    let txt = `${ready} ready`;
    if (loading > 0) txt += ` · ${loading} loading`;
    if (errored > 0) txt += ` · ${errored} unsupported`;
    return txt;
  })();

  // ---- render ----
  return (
    <main className="app">
      <header className="hero" ref={heroRef}>
        <span className="eyebrow">Desktop Converter</span>
        <h1>VTF &rarr; PNG</h1>
        <p className="subtitle">
          Pick your textures, preview each one, drop the ones you don't want, and convert.
        </p>
      </header>

      <StepIndicator
        ref={indicatorRef}
        currentStep={currentStep}
        onJumpTo={jumpTo}
        busy={busy}
      />

      <section className="card" ref={cardRef}>
        {/* Step 1 — Pick Files */}
        <div
          className="step"
          data-step="1"
          ref={(el) => {
            stepRefs.current[1] = el;
          }}
          hidden={currentStep !== 1}
        >
          <div className="step-head">
            <span className="step-num-mono">01</span>
            <h2 className="step-title">Pick your textures</h2>
            <p className="step-blurb">
              Add `.vtf` files. We'll preview each one so you can drop any you don't want before converting.
            </p>
          </div>

          <div className="row">
            <div className="path-row">
              <span
                className={"path" + (files.length === 0 ? " muted" : "")}
              >
                {filesSummaryText}
              </span>
              <button
                className="btn btn-secondary"
                onClick={pickFiles}
                disabled={busy}
              >
                Add Files
              </button>
            </div>
          </div>

          {files.length > 0 && (
            <div className="file-list">
              {files.map((f) => (
                <FileItem
                  key={f.id}
                  file={f}
                  onRemove={removeFile}
                  disabled={busy}
                />
              ))}
            </div>
          )}

          {files.length > 0 && (
            <div className="row inline-actions">
              <button
                className="btn btn-ghost"
                onClick={clearFiles}
                disabled={busy}
              >
                Clear all
              </button>
            </div>
          )}
        </div>

        {/* Step 2 — Output Folder */}
        <div
          className="step"
          data-step="2"
          ref={(el) => {
            stepRefs.current[2] = el;
          }}
          hidden={currentStep !== 2}
        >
          <div className="step-head">
            <span className="step-num-mono">02</span>
            <h2 className="step-title">Choose where to save</h2>
            <p className="step-blurb">
              Each `.vtf` will land here as a `.png` with the same base name.
            </p>
          </div>

          <div className="row">
            <div className="path-row">
              <span className={"path" + (output ? "" : " muted")}>
                {output || "No folder selected"}
              </span>
              <button
                className="btn btn-secondary"
                onClick={pickOutput}
                disabled={busy}
              >
                Choose
              </button>
            </div>
          </div>
        </div>

        {/* Step 3 — Convert */}
        <div
          className="step"
          data-step="3"
          ref={(el) => {
            stepRefs.current[3] = el;
          }}
          hidden={currentStep !== 3}
        >
          <div className="step-head">
            <span className="step-num-mono">03</span>
            <h2 className="step-title">Ready to convert</h2>
            <p className="step-blurb">Review the plan and hit Convert.</p>
          </div>

          <div className="review">
            <div className="review-row">
              <span className="review-label">Textures</span>
              <span className="review-value">
                {readyFiles.length === 0
                  ? "—"
                  : `${readyFiles.length} texture${
                      readyFiles.length === 1 ? "" : "s"
                    }`}
              </span>
            </div>
            <div className="review-row">
              <span className="review-label">Output</span>
              <span className="review-value">{output || "—"}</span>
            </div>
          </div>

          {progressVisible && (
            <div className="progress-bar">
              <div
                className="progress-fill"
                style={{ width: `${progressFraction * 100}%` }}
              />
            </div>
          )}

          {statusText && <div className="status">{statusText}</div>}

          {result && (
            <div className="result" ref={resultBlockRef}>
              <div className="result-stat">
                <span className="result-stat-num" ref={successCountRef}>
                  0
                </span>
                <span className="result-stat-label">succeeded</span>
              </div>
              <div className="result-stat">
                <span className="result-stat-num" ref={failedCountRef}>
                  0
                </span>
                <span className="result-stat-label">failed</span>
              </div>
            </div>
          )}
        </div>

        {/* Wizard nav */}
        <div className="step-nav">
          {currentStep > 1 && !busy && (
            <button className="btn btn-secondary" onClick={goBack}>
              Back
            </button>
          )}
          <button
            className="btn btn-primary"
            onClick={goNext}
            disabled={nextDisabled || busy}
          >
            {nextLabel}
          </button>
        </div>
      </section>

      <footer className="footer">
        <span>vtf2png-app v{__APP_VERSION__}</span>
      </footer>
    </main>
  );
}
