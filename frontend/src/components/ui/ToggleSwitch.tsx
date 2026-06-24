'use client';

import React from 'react';

interface ToggleSwitchProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  /** Accessible label (visually hidden). */
  label?: string;
  className?: string;
}

/**
 * Animated on/off switch used for "Include in servicing" selections.
 * The thumb slides and the track gradient transitions on toggle. Motion is
 * automatically neutralised under prefers-reduced-motion (global CSS rule).
 */
export function ToggleSwitch({ checked, onChange, disabled = false, label, className = '' }: ToggleSwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      data-on={checked ? 'true' : 'false'}
      onClick={() => !disabled && onChange(!checked)}
      className={`switch ${className}`}
    >
      <span className="switch-thumb" aria-hidden="true" />
    </button>
  );
}

export default ToggleSwitch;
