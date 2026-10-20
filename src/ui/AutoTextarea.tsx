import { useLayoutEffect, useRef, type ComponentProps } from 'react';

/** A textarea that grows and shrinks with its text; `rows` is the minimum height and CSS `max-height` the cap. */
export function AutoTextarea({ ref, onInput, ...props }: ComponentProps<'textarea'>) {
  const own = useRef<HTMLTextAreaElement | null>(null);
  const fit = () => {
    const el = own.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight + el.offsetHeight - el.clientHeight}px`;
  };

  // Re-fit after every render (the value can change from outside, e.g. when another slide is selected)…
  useLayoutEffect(fit);
  // …and when the box itself gets wider or narrower, which re-wraps the text.
  useLayoutEffect(() => {
    const el = own.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    let width = el.clientWidth;
    const ro = new ResizeObserver(() => {
      if (el.clientWidth !== width) { width = el.clientWidth; fit(); }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <textarea
      {...props}
      data-auto=""
      ref={(el) => {
        own.current = el;
        if (typeof ref === 'function') ref(el);
        else if (ref) ref.current = el;
      }}
      onInput={(e) => { fit(); onInput?.(e); }}
    />
  );
}
