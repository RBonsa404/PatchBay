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

/** Stars earned for a mark: 1 from 40, 2 from 70 (a complete mission gets 80), 3 from 90 (it takes speed). */
export const starCount = (score: number): number => (score >= 90 ? 3 : score >= 70 ? 2 : score >= 40 ? 1 : 0);
