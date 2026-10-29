type Child = Node | string | null | undefined | false;

/** Tiny element builder: `h('button', { class: 'btn', onclick }, 'Jouer')`. Text is always set as text, never HTML. */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, unknown> = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === false || value === null) continue;
    if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2), value as EventListener);
    else if (key === 'class') el.className = String(value);
    else if (key === 'style' && typeof value === 'object') Object.assign(el.style, value);
    else if (value === true) el.setAttribute(key, '');
    else el.setAttribute(key, String(value));
  }
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    el.append(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return el;
}

export const ui = (): HTMLElement => document.getElementById('ui') as HTMLElement;

/** Fade a full-screen element out, then remove it. */
export function leave(el: HTMLElement): Promise<void> {
  el.classList.add('leaving');
  return new Promise((resolve) =>
    setTimeout(() => {
      el.remove();
      resolve();
    }, 330),
  );
}

export const stars = (score: number): string => {
  const n = score >= 100 ? 3 : score >= 75 ? 2 : score >= 50 ? 1 : 0;
  return '★'.repeat(n) + '☆'.repeat(3 - n);
};
