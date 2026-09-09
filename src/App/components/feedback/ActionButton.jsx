import React, { forwardRef, useEffect, useRef, useState } from "react";
import "./feedback.css";

export function reportActionError(error) {
  window.dispatchEvent(new CustomEvent("ocs:action-error", {
    detail: error?.message || String(error || "The action could not be completed. Please try again."),
  }));
}

// Track the real operation, including same-tick repeated clicks. Synchronous
// controls never enter a fabricated loading state.
const ActionButton = forwardRef(function ActionButton({
  onClick, children, disabled, loading = false, loadingLabel = "Working…",
  className = "", type = "button", ...props
}, ref) {
  const [pending, setPending] = useState(false);
  const locked = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const busy = loading || pending;

  const handleClick = async (event) => {
    if (disabled || loading || locked.current) return;
    locked.current = true;
    try {
      const operation = onClick?.(event);
      if (operation && typeof operation.then === "function") {
        setPending(true);
        const result = await operation;
        if (result?.ok === false || result?.success === false) {
          throw new Error(result.error || result.message || "The action could not be completed. Please try again.");
        }
      }
    } catch (error) {
      reportActionError(error);
    } finally {
      locked.current = false;
      if (mounted.current) setPending(false);
    }
  };

  return (
    <button {...props} ref={ref} type={type} onClick={handleClick}
      disabled={disabled || busy} aria-busy={busy || undefined}
      aria-label={busy ? loadingLabel : props["aria-label"]}
      className={`ocs-action-button ${className}`} data-pending={busy || undefined}>
      {children}
      {busy && <span className="ocs-action-progress" aria-hidden="true">
        <span className="ocs-action-spinner" />
      </span>}
      {busy && <span className="sr-only" role="status">{loadingLabel}</span>}
    </button>
  );
});

export function ActionFeedback() {
  const [message, setMessage] = useState("");
  useEffect(() => {
    const listener = (event) => setMessage(event.detail);
    window.addEventListener("ocs:action-error", listener);
    return () => window.removeEventListener("ocs:action-error", listener);
  }, []);
  if (!message) return null;
  return <div className="ocs-action-feedback" role="alert">
    <div><strong>Action needs attention</strong><p>{message}</p></div>
    <button type="button" aria-label="Dismiss error" onClick={() => setMessage("")}>×</button>
  </div>;
}

export default ActionButton;
