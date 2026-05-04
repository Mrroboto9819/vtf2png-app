import { forwardRef } from "react";

const STEPS = [
  { num: 1, label: "Pick" },
  { num: 2, label: "Output" },
  { num: 3, label: "Convert" },
];

const StepIndicator = forwardRef(function StepIndicator(
  { currentStep, onJumpTo, busy },
  ref
) {
  return (
    <nav className="step-indicator" aria-label="Wizard progress" ref={ref}>
      {STEPS.map((step, i) => (
        <div key={step.num} style={{ display: "contents" }}>
          <button
            type="button"
            className={
              "step-dot" +
              (step.num === currentStep ? " is-active" : "") +
              (step.num < currentStep ? " is-completed" : "")
            }
            data-step={step.num}
            disabled={busy || step.num >= currentStep}
            onClick={() => onJumpTo(step.num)}
            aria-label={`Step ${step.num}: ${step.label}`}
          >
            <span className="step-dot-num">{step.num}</span>
            <span className="step-dot-label">{step.label}</span>
          </button>
          {i < STEPS.length - 1 && (
            <span
              className={
                "step-line" + (step.num < currentStep ? " is-completed" : "")
              }
              aria-hidden="true"
            />
          )}
        </div>
      ))}
    </nav>
  );
});

export default StepIndicator;
