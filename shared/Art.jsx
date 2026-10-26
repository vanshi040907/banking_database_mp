import { useEffect, useRef } from 'react';

import lakeside from './assets/art/lakeside.webp';
import architecture from './assets/art/architecture.webp';
import hillside from './assets/art/hillside.webp';
import horizon from './assets/art/horizon.webp';
import sailboat from './assets/art/sailboat.webp';

export const ART = { lakeside, architecture, hillside, horizon, sailboat };

const OPP = { l: 'to right', r: 'to left', t: 'to bottom', b: 'to top' };

// A hand-drawn illustration. `fade` lists the sides ("l r t b") that should melt into the page.
// It multiplies into the page (so the paper disappears), draws itself in slowly and drifts a few
// pixels with the pointer. It is never placed behind interface elements.
export function Art({ name, fade = '', className = '', imgClassName = '', style, parallax = 1, draw = true, fadeSize = 14, alt = '' }) {
  const inner = useRef(null);

  useEffect(() => {
    if (!parallax || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let raf = 0;
    const move = (e) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const x = (e.clientX / window.innerWidth - 0.5) * 2;
        const y = (e.clientY / window.innerHeight - 0.5) * 2;
        if (inner.current) inner.current.style.transform = `translate(${(-x * 7 * parallax).toFixed(1)}px, ${(-y * 5 * parallax).toFixed(1)}px) scale(1.02)`;
      });
    };
    window.addEventListener('pointermove', move, { passive: true });
    return () => { window.removeEventListener('pointermove', move); cancelAnimationFrame(raf); };
  }, [parallax]);

  const sides = fade.split(' ').filter(Boolean);
  const mask = sides.map((s) => `linear-gradient(${OPP[s]}, transparent 0, #000 ${fadeSize}%)`).join(', ');
  const maskStyle = sides.length
    ? { WebkitMaskImage: mask, maskImage: mask, WebkitMaskComposite: 'source-in', maskComposite: 'intersect' }
    : {};

  return (
    <div className={`art-wrap overflow-hidden ${className}`} style={{ ...maskStyle, ...style }} aria-hidden={!alt} role={alt ? 'img' : undefined} aria-label={alt || undefined}>
      <div ref={inner} className="h-full w-full transition-transform duration-[1400ms] ease-out will-change-transform">
        <img src={ART[name]} alt="" draggable="false" className={`art-img ${draw ? 'art-draw' : ''} ${imgClassName}`} />
      </div>
    </div>
  );
}
