import React, { useState, useEffect, useRef } from "react";
import { PiCaretUp, PiCaretDown } from "react-icons/pi";

/**
 * Robust Duration Input Component
 * 
 * Supports typing, keyboard navigation (Tab/Arrows), and steppers without reformatting
 * each keystroke. Validates on blur or Enter.
 * Strict Universal 12px Border Radius compliance.
 */
export default function DurationInput({
  value = 0, // total seconds
  onChange,
  label,
  disabled = false,
  className = "",
}) {
  const totalSec = Math.max(0, parseInt(value, 10) || 0);

  const toParts = (sec) => {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    return {
      h: String(h).padStart(2, "0"),
      m: String(m).padStart(2, "0"),
      s: String(s).padStart(2, "0"),
    };
  };

  const initialParts = toParts(totalSec);
  const [hours, setHours] = useState(initialParts.h);
  const [minutes, setMinutes] = useState(initialParts.m);
  const [seconds, setSeconds] = useState(initialParts.s);
  const [isFocused, setIsFocused] = useState(false);

  // Sync from props only when not actively editing
  useEffect(() => {
    if (!isFocused) {
      const parts = toParts(totalSec);
      setHours(parts.h);
      setMinutes(parts.m);
      setSeconds(parts.s);
    }
  }, [totalSec, isFocused]);

  const commit = (hVal, mVal, sVal) => {
    const parsedH = Math.max(0, parseInt(hVal, 10) || 0);
    const parsedM = Math.max(0, Math.min(59, parseInt(mVal, 10) || 0));
    const parsedS = Math.max(0, Math.min(59, parseInt(sVal, 10) || 0));

    const total = parsedH * 3600 + parsedM * 60 + parsedS;
    const formatted = toParts(total);
    setHours(formatted.h);
    setMinutes(formatted.m);
    setSeconds(formatted.s);

    if (typeof onChange === "function" && total !== totalSec) {
      onChange(total);
    }
  };

  const handleBlur = () => {
    setIsFocused(false);
    commit(hours, minutes, seconds);
  };

  const handleKeyDown = (e, unit) => {
    if (e.key === "Enter") {
      e.target.blur();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      stepUnit(unit, 1);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      stepUnit(unit, -1);
    }
  };

  const stepUnit = (unit, delta) => {
    let curH = parseInt(hours, 10) || 0;
    let curM = parseInt(minutes, 10) || 0;
    let curS = parseInt(seconds, 10) || 0;

    if (unit === "h") {
      curH = Math.max(0, curH + delta);
    } else if (unit === "m") {
      curM = Math.max(0, Math.min(59, curM + delta));
    } else if (unit === "s") {
      curS = Math.max(0, Math.min(59, curS + delta));
    }

    commit(curH, curM, curS);
  };

  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      {label && (
        <span className="text-[10px] uppercase font-bold text-white/50 tracking-wider">
          {label}
        </span>
      )}
      <div className="flex items-center gap-1 bg-[#120D22]/80 border border-white/10 rounded-[12px] p-1 shadow-inner focus-within:border-[#7C3AED] transition-colors">
        {/* Hours */}
        <div className="flex flex-col items-center">
          <button
            type="button"
            disabled={disabled}
            onClick={() => stepUnit("h", 1)}
            className="p-0.5 text-white/40 hover:text-white disabled:opacity-20 transition-colors"
          >
            <PiCaretUp size={10} />
          </button>
          <input
            type="text"
            inputMode="numeric"
            disabled={disabled}
            value={hours}
            onFocus={() => setIsFocused(true)}
            onBlur={handleBlur}
            onChange={(e) => setHours(e.target.value.replace(/\D/g, "").slice(0, 3))}
            onKeyDown={(e) => handleKeyDown(e, "h")}
            className="w-8 text-center bg-transparent text-white font-mono text-xs font-semibold focus:outline-none"
            placeholder="00"
          />
          <button
            type="button"
            disabled={disabled}
            onClick={() => stepUnit("h", -1)}
            className="p-0.5 text-white/40 hover:text-white disabled:opacity-20 transition-colors"
          >
            <PiCaretDown size={10} />
          </button>
          <span className="text-[8px] font-bold text-white/30 uppercase -mt-0.5">hr</span>
        </div>

        <span className="text-white/40 font-mono text-xs pb-3">:</span>

        {/* Minutes */}
        <div className="flex flex-col items-center">
          <button
            type="button"
            disabled={disabled}
            onClick={() => stepUnit("m", 1)}
            className="p-0.5 text-white/40 hover:text-white disabled:opacity-20 transition-colors"
          >
            <PiCaretUp size={10} />
          </button>
          <input
            type="text"
            inputMode="numeric"
            disabled={disabled}
            value={minutes}
            onFocus={() => setIsFocused(true)}
            onBlur={handleBlur}
            onChange={(e) => setMinutes(e.target.value.replace(/\D/g, "").slice(0, 2))}
            onKeyDown={(e) => handleKeyDown(e, "m")}
            className="w-8 text-center bg-transparent text-white font-mono text-xs font-semibold focus:outline-none"
            placeholder="00"
          />
          <button
            type="button"
            disabled={disabled}
            onClick={() => stepUnit("m", -1)}
            className="p-0.5 text-white/40 hover:text-white disabled:opacity-20 transition-colors"
          >
            <PiCaretDown size={10} />
          </button>
          <span className="text-[8px] font-bold text-white/30 uppercase -mt-0.5">min</span>
        </div>

        <span className="text-white/40 font-mono text-xs pb-3">:</span>

        {/* Seconds */}
        <div className="flex flex-col items-center">
          <button
            type="button"
            disabled={disabled}
            onClick={() => stepUnit("s", 1)}
            className="p-0.5 text-white/40 hover:text-white disabled:opacity-20 transition-colors"
          >
            <PiCaretUp size={10} />
          </button>
          <input
            type="text"
            inputMode="numeric"
            disabled={disabled}
            value={seconds}
            onFocus={() => setIsFocused(true)}
            onBlur={handleBlur}
            onChange={(e) => setSeconds(e.target.value.replace(/\D/g, "").slice(0, 2))}
            onKeyDown={(e) => handleKeyDown(e, "s")}
            className="w-8 text-center bg-transparent text-white font-mono text-xs font-semibold focus:outline-none"
            placeholder="00"
          />
          <button
            type="button"
            disabled={disabled}
            onClick={() => stepUnit("s", -1)}
            className="p-0.5 text-white/40 hover:text-white disabled:opacity-20 transition-colors"
          >
            <PiCaretDown size={10} />
          </button>
          <span className="text-[8px] font-bold text-white/30 uppercase -mt-0.5">sec</span>
        </div>
      </div>
    </div>
  );
}
