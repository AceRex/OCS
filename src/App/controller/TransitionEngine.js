/**
 * TransitionEngine.js
 *
 * Single source of truth for video/camera transition compositing.
 * Reused identically by:
 * 1. SwitcherProgramCanvas.js (Operator Program preview pane)
 * 2. DisplayCanvas.js (Routed General View and Speaker View output displays)
 *
 * Implements an extensible registry pattern:
 * - cut: instant cut (duration = 0)
 * - fade: dual-source opacity crossfade (1->0 / 0->1)
 * - wipe: directional reveal via canvas clip() (4 directions)
 */

function isSourceDrawable(source) {
  if (!source) return false;
  // HTMLVideoElement
  if (typeof HTMLVideoElement !== "undefined" && source instanceof HTMLVideoElement) {
    return source.readyState >= 2 && source.videoWidth > 0 && source.videoHeight > 0;
  }
  // HTMLImageElement
  if (typeof HTMLImageElement !== "undefined" && source instanceof HTMLImageElement) {
    return source.complete && source.naturalWidth > 0 && source.naturalHeight > 0;
  }
  // HTMLCanvasElement
  if (typeof HTMLCanvasElement !== "undefined" && source instanceof HTMLCanvasElement) {
    return source.width > 0 && source.height > 0;
  }
  // ImageBitmap or duck-typed canvas/image (for testing / node canvas mocks)
  if (source.width > 0 && source.height > 0) {
    return true;
  }
  return false;
}

function safeDrawImage(ctx, source, width, height) {
  if (!isSourceDrawable(source)) return false;
  try {
    ctx.drawImage(source, 0, 0, width, height);
    return true;
  } catch (_) {
    return false;
  }
}

export class TransitionEngine {
  constructor() {
    this.registry = new Map();
    this.activeTransition = null;
    this.registerDefaults();
  }

  registerDefaults() {
    // ── 1. Cut (instant switch) ──────────────────────────────────────────────
    this.register("cut", {
      render(ctx, outgoing, incoming, progress, width, height) {
        if (incoming && isSourceDrawable(incoming)) {
          safeDrawImage(ctx, incoming, width, height);
        } else if (outgoing && isSourceDrawable(outgoing)) {
          safeDrawImage(ctx, outgoing, width, height);
        }
      },
    });

    // ── 2. Fade / Dissolve (opacity crossfade) ───────────────────────────────
    this.register("fade", {
      render(ctx, outgoing, incoming, progress, width, height) {
        const p = Math.max(0, Math.min(1, progress));
        // Outgoing source: opacity 1 -> 0
        if (outgoing && p < 1 && isSourceDrawable(outgoing)) {
          ctx.save();
          ctx.globalAlpha = 1 - p;
          safeDrawImage(ctx, outgoing, width, height);
          ctx.restore();
        }
        // Incoming source: opacity 0 -> 1
        if (incoming && p > 0 && isSourceDrawable(incoming)) {
          ctx.save();
          ctx.globalAlpha = p;
          safeDrawImage(ctx, incoming, width, height);
          ctx.restore();
        }
      },
    });

    // ── 3. Wipe (directional reveal) ─────────────────────────────────────────
    this.register("wipe", {
      render(ctx, outgoing, incoming, progress, width, height, options = {}) {
        const p = Math.max(0, Math.min(1, progress));
        const dir = options.direction || "left-to-right";

        // 1. Draw outgoing source across full canvas
        if (outgoing && isSourceDrawable(outgoing)) {
          safeDrawImage(ctx, outgoing, width, height);
        }

        // 2. Draw incoming source inside directional clipped region
        if (incoming && p > 0 && isSourceDrawable(incoming)) {
          ctx.save();
          ctx.beginPath();
          if (dir === "left-to-right" || dir === "left") {
            ctx.rect(0, 0, width * p, height);
          } else if (dir === "right-to-left" || dir === "right") {
            ctx.rect(width * (1 - p), 0, width * p, height);
          } else if (dir === "top-to-bottom" || dir === "top") {
            ctx.rect(0, 0, width, height * p);
          } else if (dir === "bottom-to-top" || dir === "bottom") {
            ctx.rect(0, height * (1 - p), width, height * p);
          } else {
            // Default fallback: left-to-right
            ctx.rect(0, 0, width * p, height);
          }
          ctx.clip();
          safeDrawImage(ctx, incoming, width, height);
          ctx.restore();
        }
      },
    });
  }

  /**
   * Register a new transition type.
   * Extensible: new transitions can be plugged in without altering switching state.
   */
  register(type, renderer) {
    if (!type || typeof renderer?.render !== "function") {
      throw new Error(`Invalid transition renderer for type "${type}"`);
    }
    this.registry.set(type.toLowerCase(), renderer);
  }

  /**
   * Check if a transition type is registered.
   */
  has(type) {
    return this.registry.has(type?.toLowerCase());
  }

  /**
   * Retrieve transition renderer by type name.
   */
  get(type) {
    const key = type?.toLowerCase();
    return this.registry.get(key) || this.registry.get("cut");
  }

  /**
   * Get all registered transition types.
   */
  getTypes() {
    return Array.from(this.registry.keys());
  }

  /**
   * Render a composited frame onto a canvas context.
   */
  render(ctx, outgoing, incoming, progress, width, height, options = {}) {
    if (!ctx) return;
    const type = options.type || "fade";
    const renderer = this.get(type);
    renderer.render(ctx, outgoing, incoming, progress, width, height, options);
  }

  /**
   * Start driving an animated transition over time.
   * If a transition is already in progress, immediately interrupts it.
   */
  start({
    fromId,
    toId,
    type = "fade",
    duration = 750,
    direction = "left-to-right",
    onUpdate,
    onComplete,
  }) {
    // Interruption handling: cancel pending animation
    this.cancel();

    if (type === "cut" || duration <= 0) {
      if (typeof onUpdate === "function") onUpdate(1.0);
      if (typeof onComplete === "function") onComplete();
      return;
    }

    const startTime = typeof performance !== "undefined" ? performance.now() : Date.now();
    let animFrame = null;
    let isCancelled = false;

    const transitionState = {
      fromId,
      toId,
      type,
      duration,
      direction,
      startTime,
      progress: 0,
    };

    const step = () => {
      if (isCancelled) return;
      const now = typeof performance !== "undefined" ? performance.now() : Date.now();
      const elapsed = now - startTime;
      const progress = Math.min(1.0, elapsed / duration);
      transitionState.progress = progress;

      if (typeof onUpdate === "function") {
        onUpdate(progress);
      }

      if (progress < 1.0) {
        if (typeof requestAnimationFrame !== "undefined") {
          animFrame = requestAnimationFrame(step);
        } else {
          animFrame = setTimeout(step, 16);
        }
      } else {
        this.activeTransition = null;
        if (typeof onComplete === "function") {
          onComplete();
        }
      }
    };

    this.activeTransition = {
      state: transitionState,
      cancel: () => {
        isCancelled = true;
        if (animFrame != null) {
          if (typeof cancelAnimationFrame !== "undefined") {
            cancelAnimationFrame(animFrame);
          } else {
            clearTimeout(animFrame);
          }
        }
      },
    };

    step();
    return transitionState;
  }

  /**
   * Immediately cancel any running transition animation.
   */
  cancel() {
    if (this.activeTransition) {
      this.activeTransition.cancel();
      this.activeTransition = null;
    }
  }

  /**
   * Check if a transition is currently in progress.
   */
  isActive() {
    return this.activeTransition !== null;
  }

  /**
   * Get the current active transition state (if any).
   */
  getActiveState() {
    return this.activeTransition?.state || null;
  }
}

// Global singleton instance
export const transitionEngine = new TransitionEngine();

// CommonJS fallback for Node test environments
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    TransitionEngine,
    transitionEngine,
  };
}
