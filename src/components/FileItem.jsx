import { useEffect, useRef } from "react";
import { gsap } from "gsap";

function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export default function FileItem({ file, onRemove, disabled }) {
  const ref = useRef(null);

  // Mount animation: fade up + tiny scale.
  useEffect(() => {
    if (!ref.current) return;
    gsap.fromTo(
      ref.current,
      { y: -6, opacity: 0, scale: 0.985 },
      { y: 0, opacity: 1, scale: 1, duration: 0.28, ease: "power2.out" }
    );
  }, []);

  const handleRemove = () => {
    if (disabled) return;
    if (!ref.current) {
      onRemove(file.id);
      return;
    }
    gsap.to(ref.current, {
      x: 24,
      opacity: 0,
      duration: 0.18,
      ease: "power2.in",
      onComplete: () => onRemove(file.id),
    });
  };

  const dims = file.dims ? `${file.dims.width} × ${file.dims.height}` : "";
  const meta =
    file.status === "ready"
      ? `${dims} · ${file.format} · ${formatBytes(file.sizeBytes)}`
      : file.status === "loading"
      ? "Reading…"
      : `Error: ${file.error}`;

  const className =
    "file-item" +
    (file.status === "loading" ? " file-item--loading" : "") +
    (file.status === "error" ? " file-item--error" : "");

  return (
    <div ref={ref} className={className}>
      <div className="file-thumb-wrap">
        {file.preview ? (
          <img className="file-thumb" src={file.preview} alt="" />
        ) : (
          <div className="file-thumb file-thumb--placeholder" />
        )}
      </div>
      <div className="file-meta">
        <div className="file-name" title={file.path}>
          {file.name}
        </div>
        <div className="file-stats">{meta}</div>
      </div>
      <button
        className="file-remove"
        onClick={handleRemove}
        disabled={disabled}
        aria-label="Remove"
      >
        ×
      </button>
    </div>
  );
}
