import { useEffect } from 'react';

/** The parts of a selection window that take the pointer. */
const HIT_TARGETS = '.sel-toolbar, .sel-menu, .sel-card';

/**
 * The transparent margin that holds a toolbar's or card's shadow overlaps the
 * selected text. While the pointer is over that margin the window ignores the
 * mouse, so clicks reach the app below; the main process still forwards moves,
 * and over the toolbar or card the window takes the mouse again. The main
 * process starts each selection (`key`) with the window ignoring the mouse.
 */
export function usePointerPassThrough(key: string | null | undefined, setPassThrough: (passThrough: boolean) => void): void {
  useEffect(() => {
    if (!key) return;
    let passThrough = true;
    const update = (next: boolean) => {
      if (next === passThrough) return;
      passThrough = next;
      setPassThrough(next);
    };
    const onMove = (event: MouseEvent) => update(!(event.target instanceof Element && event.target.closest(HIT_TARGETS)));
    const onLeave = () => update(true);
    const root = document.documentElement;
    window.addEventListener('mousemove', onMove);
    root.addEventListener('mouseleave', onLeave);
    return () => {
      window.removeEventListener('mousemove', onMove);
      root.removeEventListener('mouseleave', onLeave);
    };
  }, [key, setPassThrough]);
}
