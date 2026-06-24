import React from 'react';

/**
 * Animated authentication backdrop (login / admin-login).
 *
 * Deep-navy scene with ~20 slowly drifting finance glyphs, a faint blueprint
 * grid, and 3 soft pulsing radial blobs in brand teal + gold. All motion is
 * pure CSS (see globals.css) and is disabled automatically under
 * `prefers-reduced-motion`. Rendered behind the card, pointer-events:none.
 */

const GLYPHS = [
  'AU$', '%', '↑', '↗', 'LVR', 'DTI', 'ROI', '⌂', '$', '%',
  '↑', 'AU$', 'P&I', '↗', 'LVR', 'ROI', '%', '$', '⌂', 'DTI',
];

// Deterministic pseudo-random layout so SSR and client markup match (no hydration mismatch).
function layout(i: number) {
  const top = (i * 53 + 7) % 92;
  const left = (i * 37 + 11) % 92;
  const size = 14 + ((i * 13) % 30);
  const delay = (i % 10) * -2.1;
  const duration = 18 + ((i * 7) % 12);
  return { top, left, size, delay, duration };
}

export function AuthScene(): React.ReactElement {
  return (
    <div aria-hidden="true" className="auth-scene pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="auth-grid absolute inset-0" />

      {/* Pulsing brand blobs */}
      <span className="auth-blob" style={{ top: '-6rem', left: '-4rem', width: '22rem', height: '22rem', background: 'rgba(1,105,111,0.55)', animationDelay: '0s' }} />
      <span className="auth-blob" style={{ top: '30%', right: '-6rem', width: '24rem', height: '24rem', background: 'rgba(209,153,0,0.30)', animationDelay: '-3s' }} />
      <span className="auth-blob" style={{ bottom: '-8rem', left: '35%', width: '26rem', height: '26rem', background: 'rgba(1,105,111,0.40)', animationDelay: '-6s' }} />

      {/* Drifting finance glyphs */}
      {GLYPHS.map((g, i) => {
        const l = layout(i);
        return (
          <span
            key={i}
            className="auth-glyph"
            style={{
              top: `${l.top}%`,
              left: `${l.left}%`,
              fontSize: `${l.size}px`,
              animationDelay: `${l.delay}s`,
              animationDuration: `${l.duration}s`,
            }}
          >
            {g}
          </span>
        );
      })}
    </div>
  );
}

export default AuthScene;
