import { answer, SUGGESTIONS, type AssistantContext } from '../game/assistant.js';
import { t } from '../i18n.js';
import { MENTOR, mentorPortrait } from './brand.js';
import { h } from './dom.js';
import { panel } from './panels.js';

/** The conversation with Aïcha, kept for the length of a mission. */
export class AskAicha {
  private readonly lines: { from: 'me' | 'her'; text: string }[] = [{ from: 'her', text: t('assistant.hello') }];

  constructor(private readonly context: () => AssistantContext) {}

  open(): void {
    const log = h('div', { class: 'chat-log', role: 'log', 'aria-live': 'polite' });
    const render = (): void => {
      log.replaceChildren(
        ...this.lines.map((l) => h('p', { class: `chat-line ${l.from}` }, l.from === 'her' ? h('strong', {}, MENTOR.name) : null, h('span', {}, l.text))),
      );
      log.scrollTop = log.scrollHeight;
    };
    const ask = (question: string): void => {
      if (!question.trim()) return;
      this.lines.push({ from: 'me', text: question }, { from: 'her', text: answer(question, this.context()) });
      render();
    };
    const input: HTMLInputElement = h('input', { placeholder: t('assistant.placeholder'), 'aria-label': t('assistant.placeholder'), spellcheck: 'false', autocomplete: 'off' });
    panel(t('assistant.title'), [
      h('div', { class: 'chat-who' }, mentorPortrait(), h('span', {}, MENTOR.role)),
      log,
      h('div', { class: 'chat-chips' }, ...SUGGESTIONS.map((q) => h('button', { class: 'chip', onclick: () => ask(q) }, q))),
      h(
        'form',
        {
          class: 'chat-form',
          onsubmit: (e: Event) => {
            e.preventDefault();
            ask(input.value);
            input.value = '';
          },
        },
        input,
        h('button', { class: 'btn primary small', type: 'submit' }, t('assistant.send')),
      ),
    ], 'assistant');
    render();
    input.focus();
  }
}
