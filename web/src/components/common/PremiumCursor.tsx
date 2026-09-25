import { useEffect, useRef } from 'react';

/** A deliberately quiet cursor treatment for desktop pointer devices. */
export function PremiumCursor() {
  const dotRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const reducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches;
    const coarsePointer = window.matchMedia('(pointer: coarse)').matches;

    if (reducedMotion || coarsePointer) return;

    document.body.classList.add('has-premium-cursor');

    let targetX = window.innerWidth / 2;
    let targetY = window.innerHeight / 2;
    let currentX = targetX;
    let currentY = targetY;
    let frame = 0;

    const render = () => {
      currentX += (targetX - currentX) * 0.16;
      currentY += (targetY - currentY) * 0.16;

      const transform = `translate3d(${currentX}px, ${currentY}px, 0)`;
      dotRef.current?.style.setProperty('transform', transform);
      ringRef.current?.style.setProperty('transform', transform);
      frame = window.requestAnimationFrame(render);
    };

    const handlePointerMove = (event: PointerEvent) => {
      targetX = event.clientX;
      targetY = event.clientY;
    };

    const handlePointerOver = (event: PointerEvent) => {
      const target = event.target as Element | null;
      const interactive = target?.closest(
        'button, a, input, textarea, [role="button"], [data-cursor="interactive"]',
      );
      document.body.classList.toggle('cursor-hover', Boolean(interactive));
    };

    window.addEventListener('pointermove', handlePointerMove, {
      passive: true,
    });
    document.addEventListener('pointerover', handlePointerOver, {
      passive: true,
    });
    frame = window.requestAnimationFrame(render);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('pointermove', handlePointerMove);
      document.removeEventListener('pointerover', handlePointerOver);
      document.body.classList.remove('has-premium-cursor', 'cursor-hover');
    };
  }, []);

  return (
    <>
      <span ref={dotRef} className="premium-cursor-dot" aria-hidden="true" />
      <span ref={ringRef} className="premium-cursor-ring" aria-hidden="true" />
    </>
  );
}
