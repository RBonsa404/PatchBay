import { answer, askOnline, needsOnline, SUGGESTIONS, type AssistantContext } from '../game/assistant.js';
import { t } from '../i18n.js';
import { MENTOR, mentorPortrait } from './brand.js';
import { h } from './dom.js';
import { panel } from './panels.js';

/** The conversation with Aïcha, kept for the length of a mission. */
export class AskAicha {
  private readonly lines: { from: 'me' | 'her'; text: string }[] = [{ from: 'her', text: t('assistant.hello') }];

  private busy = false;

  constructor(private readonly context: () => AssistantContext) {}

  open(): void {
    const log = h('div', { class: 'chat-log', role: 'log', 'aria-live': 'polite' });
    const render = (): void => {
      log.replaceChildren(
        ...this.lines.map((l) => h('p', { class: `chat-line ${l.from}` }, l.from === 'her' ? h('strong', {}, MENTOR.name) : null, h('span', {}, l.text))),
      );
      log.scrollTop = log.scrollHeight;
    };
    const ask = async (question: string): Promise<void> => {
      if (!question.trim() || this.busy) return;
      const context = this.context();
      if (!needsOnline(question, context)) {
        this.lines.push({ from: 'me', text: question }, { from: 'her', text: answer(question, context) });
        render();
        return;
      }
      // What was said just before, so that a follow-up question makes sense.
      const history = this.lines.slice(1).slice(-4).map((l) => ({ role: l.from === 'me' ? ('user' as const) : ('assistant' as const), content: l.text }));
      this.lines.push({ from: 'me', text: question }, { from: 'her', text: t('assistant.thinking') });
      const pending = this.lines[this.lines.length - 1] as { from: 'her'; text: string };
      this.busy = true;
      render();
      const reply = await askOnline(question, context, history);
      this.busy = false;
      if ('answer' in reply) pending.text = reply.answer;
      else if ('blocked' in reply) pending.text = t('assistant.blocked');
      else if ('limited' in reply) pending.text = t('assistant.limited');
      else pending.text = answer(question, context);
      // The panel may have been closed meanwhile: this only redraws what is still on screen.
      render();
    };
    const input: HTMLInputElement = h('input', { placeholder: t('assistant.placeholder'), 'aria-label': t('assistant.placeholder'), spellcheck: 'false', autocomplete: 'off' });
    panel(t('assistant.title'), [
      h('div', { class: 'chat-who' }, mentorPortrait(), h('span', {}, MENTOR.role)),
      h('p', { class: 'chat-privacy' }, t('assistant.privacy')),
      log,
      h('div', { class: 'chat-chips' }, ...SUGGESTIONS.map((q) => h('button', { class: 'chip', onclick: () => void ask(q) }, q))),
      h(
        'form',
        {
          class: 'chat-form',
          onsubmit: (e: Event) => {
            e.preventDefault();
            void ask(input.value);
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
