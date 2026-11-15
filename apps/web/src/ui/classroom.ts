import { ArrowLeft, CalendarClock, Check, Copy, Download, GraduationCap, KeyRound, LogOut, Play, RefreshCw, School, Star, UserMinus, Users } from 'lucide';
import type { Level } from '@patchbay/sim-core';
import { boardCsv, ClassError, classroom, tidyCode, type Assignment, type Board, type ClassResult, type StudentView } from '../game/classroom.js';
import { clock } from '../game/scoring.js';
import { tx } from '../i18n.js';
import { icon, logo } from './brand.js';
import { h, leave, starCount, ui } from './dom.js';
import './classroom.css';

/**
 * « Ma classe » : a student joins their teacher's class with its code and sees the homework; a teacher opens a class,
 * gives missions as homework and follows each student's marks. Everything else in the game works without it.
 */

export interface ClassroomActions {
  play(index: number, exam: boolean): void;
  back(): void;
}

const button = (label: string, onclick: () => void, kind = '', glyph?: Parameters<typeof icon>[0]): HTMLButtonElement =>
  h('button', { class: `btn ${kind}`, type: 'button', onclick }, glyph ? icon(glyph) : null, h('span', {}, label));

const today = (): string => new Date().toISOString().slice(0, 10);

const day = (iso: string): string => {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
};

function stars(score: number, size = 14): HTMLElement {
  const n = starCount(score);
  return h('span', { class: 'star-row', 'aria-label': `${n} / 3` }, ...[0, 1, 2].map((i) => {
    const s = icon(Star, size);
    if (i < n) s.classList.add('on');
    return s;
  }));
}

function field(label: string, input: HTMLInputElement): HTMLElement {
  return h('label', { class: 'class-field' }, h('span', {}, label), input);
}

const input = (attrs: Record<string, unknown>): HTMLInputElement => h('input', { type: 'text', autocomplete: 'off', spellcheck: 'false', ...attrs });

/** A form whose button waits for the server and shows its refusal under the fields. */
function form(title: string, glyph: Parameters<typeof icon>[0], intro: string, fields: HTMLElement[], action: string, run: () => Promise<void>): HTMLElement {
  const error = h('p', { class: 'class-error', role: 'alert' });
  const submit = h('button', { class: 'btn primary', type: 'submit' }, h('span', {}, action));
  const el = h(
    'form',
    {
      class: 'class-card',
      onsubmit: (e: Event) => {
        e.preventDefault();
        error.textContent = '';
        submit.disabled = true;
        run()
          .catch((err: unknown) => {
            error.textContent = err instanceof Error ? err.message : String(err);
          })
          .finally(() => {
            submit.disabled = false;
          });
      },
    },
    h('header', {}, icon(glyph, 22), h('h3', {}, title)),
    h('p', { class: 'muted' }, intro),
    ...fields,
    error,
    h('footer', {}, submit),
  );
  return el;
}

function frame(subtitle: string, body: HTMLElement, foot: HTMLElement[]): HTMLElement {
  return h(
    'div',
    { class: 'screen screen-center' },
    h(
      'article',
      { class: 'dossier panel-solid class-screen' },
      h('header', { class: 'class-head' }, logo('small'), h('div', {}, h('span', { class: 'label' }, 'Ma classe'), h('h2', {}, subtitle))),
      body,
      h('footer', {}, ...foot),
    ),
  );
}

export function showClassroom(levels: Level[], actions: ClassroomActions): void {
  const m = classroom.membership();
  if (m?.role === 'student') studentScreen(levels, actions);
  else if (m?.role === 'teacher') teacherScreen(levels, actions);
  else welcome(levels, actions);
}

/** Not in a class yet: join one, or open one as a teacher. */
function welcome(levels: Level[], actions: ClassroomActions): void {
  const code = input({ name: 'code', maxlength: 9, placeholder: 'ex. K7RT2M', class: 'mono', required: true, autocapitalize: 'characters' });
  const name = input({ name: 'name', maxlength: 40, placeholder: 'Prénom Nom', required: true, autocomplete: 'name' });
  const className = input({ name: 'class', maxlength: 40, placeholder: 'ex. Licence 2 Réseaux, groupe B', required: true });
  const teacher = input({ name: 'teacher', maxlength: 40, placeholder: 'ex. M. Ouédraogo', required: true });
  const backCode = input({ name: 'code', maxlength: 9, placeholder: 'Code de la classe', class: 'mono', required: true });
  const backKey = input({ name: 'key', maxlength: 16, placeholder: 'XXXX-XXXX-XXXX', class: 'mono', required: true });
  const again = (): void => void leave(screen).then(() => showClassroom(levels, actions));

  const screen = frame(
    'Rejoindre ou ouvrir une classe',
    h(
      'div',
      { class: 'class-grid' },
      form('Je suis étudiant·e', GraduationCap, 'Ton professeur te donne le code de sa classe. Tes résultats lui seront envoyés à la fin de chaque mission.', [field('Code de la classe', code), field('Ton prénom et ton nom', name)], 'Rejoindre la classe', async () => {
        await classroom.join(code.value, name.value);
        again();
      }),
      h(
        'div',
        { class: 'class-stack' },
        form('Je suis professeur', School, 'Ouvre une classe, donne son code aux étudiants, choisis les missions à faire et suis leurs notes.', [field('Nom de la classe', className), field('Votre nom', teacher)], 'Ouvrir la classe', async () => {
          const opened = await classroom.create(className.value, teacher.value);
          void leave(screen).then(() => keyReveal(opened.code, opened.key, levels, actions));
        }),
        h(
          'details',
          { class: 'class-card class-return' },
          h('summary', {}, icon(KeyRound, 18), h('span', {}, 'J’ai déjà une classe (autre ordinateur)')),
          form('Retrouver ma classe', KeyRound, 'Le code de la classe et la clé du professeur, donnés à l’ouverture.', [field('Code', backCode), field('Clé du professeur', backKey)], 'Se connecter', async () => {
            await classroom.signIn(backCode.value, backKey.value);
            again();
          }),
        ),
      ),
    ),
    [button('Retour', () => void leave(screen).then(actions.back), 'ghost', ArrowLeft)],
  );
  ui().append(screen);
  code.focus();
}

/** Shown once, right after a class is opened: the key is never shown again. */
function keyReveal(code: string, key: string, levels: Level[], actions: ClassroomActions): void {
  const copy = (text: string, btn: HTMLButtonElement): void => {
    void navigator.clipboard?.writeText(text).then(() => {
      btn.classList.add('copied');
      setTimeout(() => btn.classList.remove('copied'), 1500);
    });
  };
  const codeBtn: HTMLButtonElement = h('button', { class: 'class-secret', type: 'button', onclick: () => copy(code, codeBtn), title: 'Copier' }, h('b', { class: 'mono' }, code), icon(Copy, 16));
  const keyBtn: HTMLButtonElement = h('button', { class: 'class-secret amber', type: 'button', onclick: () => copy(key, keyBtn), title: 'Copier' }, h('b', { class: 'mono' }, key), icon(Copy, 16));
  const screen = frame(
    'Votre classe est ouverte',
    h(
      'div',
      { class: 'class-reveal' },
      h('div', {}, h('h3', {}, 'Code de la classe'), codeBtn, h('p', { class: 'muted' }, 'À écrire au tableau : chaque étudiant le saisit dans « Ma classe ».')),
      h('div', {}, h('h3', {}, 'Votre clé de professeur'), keyBtn, h('p', { class: 'muted' }, 'Notez-la et gardez-la pour vous : avec le code, elle ouvre le tableau des notes depuis n’importe quel ordinateur. Elle ne sera plus affichée.')),
    ),
    [button('J’ai noté la clé', () => void leave(screen).then(() => teacherScreen(levels, actions)), 'primary', Check)],
  );
  ui().append(screen);
}

function resultFor(results: ClassResult[], a: Assignment): ClassResult | undefined {
  return results.find((r) => r.level === a.level && r.exam === a.exam);
}

/** The student's homework, with what is done and what is late. */
function studentScreen(levels: Level[], actions: ClassroomActions): void {
  const m = classroom.membership();
  if (m?.role !== 'student') return welcome(levels, actions);
  const list = h('div', { class: 'class-homework', 'aria-busy': 'true' }, h('p', { class: 'muted' }, 'Chargement des devoirs…'));
  const note = h('p', { class: 'muted small' });
  const render = (view: StudentView): void => {
    list.removeAttribute('aria-busy');
    if (view.assignments.length === 0) {
      list.replaceChildren(h('p', { class: 'class-empty' }, icon(CalendarClock, 20), h('span', {}, `Pas encore de devoir. ${view.teacher} choisira les missions à faire ; en attendant, le parcours reste ouvert.`)));
      return;
    }
    list.replaceChildren(
      ...view.assignments.map((a) => {
        const index = levels.findIndex((l) => l.id === a.level);
        const level = levels[index];
        const r = resultFor(view.results, a);
        const late = !r && a.due !== undefined && a.due < today();
        return h(
          'div',
          { class: `class-task${r ? ' done' : ''}${late ? ' late' : ''}` },
          h('span', { class: 'class-num' }, index < 0 ? '?' : String(index + 1).padStart(2, '0')),
          h(
            'div',
            { class: 'class-task-body' },
            h('strong', {}, level ? tx(level.title) : a.level),
            h(
              'span',
              { class: 'class-tags' },
              a.exam ? h('span', { class: 'tag exam' }, 'Examen') : h('span', { class: 'tag' }, 'Entraînement'),
              a.due ? h('span', { class: `tag${late ? ' late' : ''}` }, `${late ? 'En retard · ' : 'Pour le '}${day(a.due)}`) : null,
              r ? h('span', { class: 'best' }, stars(r.best), `${r.best} / 100`, r.attempts > 1 ? h('small', {}, ` · ${r.attempts} essais`) : null) : null,
            ),
          ),
          level ? button(r ? 'Refaire' : 'Faire', () => void leave(screen).then(() => actions.play(index, a.exam)), r ? 'ghost small' : 'primary small', Play) : null,
        );
      }),
    );
  };
  const load = (): void => {
    classroom
      .me()
      .then((view) => {
        render(view);
        const left = classroom.pending();
        note.textContent = left ? `${left} résultat${left > 1 ? 's' : ''} en attente d’envoi : ils partiront dès que le réseau reviendra.` : 'Tes résultats sont envoyés à ton professeur à la fin de chaque mission.';
      })
      .catch((err: unknown) => {
        list.replaceChildren(h('p', { class: 'class-error' }, err instanceof Error ? err.message : String(err)));
        if (err instanceof ClassError && err.code === 'forbidden') note.textContent = 'Ton professeur t’a peut-être retiré de la classe : quitte-la puis rejoins-la à nouveau.';
      });
  };
  const screen = frame(
    m.className,
    h('div', { class: 'class-body' }, h('p', { class: 'class-who' }, icon(Users, 18), h('span', {}, `${m.name} · classe de ${m.teacher} · code `, h('b', { class: 'mono' }, m.code))), h('h3', {}, 'Devoirs'), list, note),
    [
      button('Quitter la classe', () => {
        if (!confirm('Quitter cette classe sur cet ordinateur ? Tes notes restent chez ton professeur.')) return;
        classroom.leave();
        void leave(screen).then(() => showClassroom(levels, actions));
      }, 'ghost', LogOut),
      button('Actualiser', load, 'ghost', RefreshCw),
      button('Retour', () => void leave(screen).then(actions.back), 'primary', ArrowLeft),
    ],
  );
  ui().append(screen);
  load();
}

/** The teacher's board: homework to choose, and every student's best mark for each. */
function teacherScreen(levels: Level[], actions: ClassroomActions): void {
  const m = classroom.membership();
  if (m?.role !== 'teacher') return welcome(levels, actions);
  let board: Board | null = null;
  const status = h('p', { class: 'muted small', 'aria-live': 'polite' });
  const table = h('div', { class: 'class-board' }, h('p', { class: 'muted' }, 'Chargement du tableau…'));
  const homework = h('div', { class: 'class-assign' });
  const title = (id: string): string => {
    const l = levels.find((x) => x.id === id);
    return l ? `${String(levels.indexOf(l) + 1).padStart(2, '0')} · ${tx(l.title)}` : id;
  };

  const renderBoard = (b: Board): void => {
    if (b.students.length === 0) {
      table.replaceChildren(h('p', { class: 'class-empty' }, icon(Users, 20), h('span', {}, 'Aucun étudiant pour l’instant. Donnez-leur le code '), h('b', { class: 'mono' }, b.code), h('span', {}, ' : ils le saisissent dans « Ma classe ».')));
      return;
    }
    const head = h('tr', {}, h('th', { scope: 'col', class: 'who' }, `Étudiants (${b.students.length})`), ...b.assignments.map((a) => h('th', { scope: 'col', title: title(a.level) }, h('span', {}, `M${title(a.level).slice(0, 2)}`), a.exam ? h('small', {}, 'exam.') : null)), h('th', { scope: 'col', title: 'Moyenne sur tous les devoirs, un devoir non fait compte 0' }, 'Moyenne'), h('th', {}));
    const rows = b.students.map((s) => {
      const marks = b.assignments.map((a) => b.results.find((r) => r.student === s.id && r.level === a.level && r.exam === a.exam));
      const done = marks.filter((r): r is NonNullable<typeof r> => !!r);
      const mean = b.assignments.length && done.length ? Math.round(marks.reduce((n, r) => n + (r?.best ?? 0), 0) / b.assignments.length) : null;
      return h(
        'tr',
        {},
        h('th', { scope: 'row' }, s.name, h('small', {}, `vu le ${new Date(s.seen).toLocaleDateString('fr-FR')}`)),
        ...marks.map((r) =>
          r
            ? h('td', { class: `mark ${r.best >= 70 ? 'good' : r.best >= 40 ? 'mid' : 'low'}`, title: `${r.attempts} essai(s) · ${clock(r.used)} / ${clock(r.limit)}${r.tidy === null ? '' : ` · propreté ${r.tidy}`}` }, h('b', {}, String(r.best)), stars(r.best, 11))
            : h('td', { class: 'mark none' }, '—'),
        ),
        h('td', { class: 'mean' }, mean === null ? '—' : String(mean)),
        h(
          'td',
          {},
          h('button', {
            class: 'icon-btn',
            type: 'button',
            title: `Retirer ${s.name}`,
            'aria-label': `Retirer ${s.name}`,
            onclick: () => {
              if (!confirm(`Retirer ${s.name} de la classe ? Ses notes seront effacées.`)) return;
              void classroom.remove(s.id).then(load, (e: unknown) => (status.textContent = e instanceof Error ? e.message : String(e)));
            },
          }, icon(UserMinus, 16)),
        ),
      );
    });
    table.replaceChildren(h('table', {}, h('thead', {}, head), h('tbody', {}, ...rows)));
  };

  /** One line per mission: practice, exam, and a last day. */
  const renderHomework = (b: Board): void => {
    const lines = levels.map((level) => {
      const own = (exam: boolean): Assignment | undefined => b.assignments.find((a) => a.level === level.id && a.exam === exam);
      const practice = h('input', { type: 'checkbox', checked: !!own(false), 'aria-label': `${tx(level.title)} en entraînement` });
      const exam = h('input', { type: 'checkbox', checked: !!own(true), 'aria-label': `${tx(level.title)} en examen` });
      const due = h('input', { type: 'date', value: own(false)?.due ?? own(true)?.due ?? '', min: today(), 'aria-label': `Date limite de ${tx(level.title)}` });
      return { level, practice, exam, due, row: h('div', { class: 'class-assign-row' }, h('span', { class: 'name' }, title(level.id)), h('label', {}, practice, 'Entraînement'), h('label', {}, exam, 'Examen'), due) };
    });
    const save = button('Enregistrer les devoirs', () => {
      const chosen: Assignment[] = [];
      for (const l of lines) {
        const due = l.due.value || undefined;
        if (l.practice.checked) chosen.push({ level: l.level.id, exam: false, ...(due ? { due } : {}) });
        if (l.exam.checked) chosen.push({ level: l.level.id, exam: true, ...(due ? { due } : {}) });
      }
      save.disabled = true;
      classroom
        .assign(chosen)
        .then(() => {
          status.textContent = `Devoirs enregistrés : ${chosen.length} mission${chosen.length > 1 ? 's' : ''}.`;
          load();
        })
        .catch((e: unknown) => (status.textContent = e instanceof Error ? e.message : String(e)))
        .finally(() => (save.disabled = false));
    }, 'primary small', Check);
    homework.replaceChildren(...lines.map((l) => l.row), h('div', { class: 'class-assign-foot' }, save));
  };

  const load = (): void => {
    classroom
      .board()
      .then((b) => {
        const first = board === null;
        board = b;
        renderBoard(b);
        if (first) renderHomework(b);
        status.textContent = `Tableau à jour (${new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}).`;
      })
      .catch((e: unknown) => {
        table.replaceChildren(h('p', { class: 'class-error' }, e instanceof Error ? e.message : String(e)));
      });
  };

  const exportCsv = (): void => {
    if (!board) return;
    const blob = new Blob([boardCsv(board, title)], { type: 'text/csv;charset=utf-8' });
    const a = h('a', { href: URL.createObjectURL(blob), download: `notes-${tidyCode(board.name).toLowerCase() || board.code}-${today()}.csv` });
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  const screen = frame(
    m.className,
    h(
      'div',
      { class: 'class-body' },
      h('p', { class: 'class-who' }, icon(School, 18), h('span', {}, `${m.teacher} · code de la classe `, h('b', { class: 'mono class-code' }, m.code))),
      h('h3', {}, 'Notes (meilleur essai sur 100)'),
      table,
      h('details', { class: 'class-card' }, h('summary', {}, icon(CalendarClock, 18), h('span', {}, 'Choisir les devoirs')), homework),
      status,
    ),
    [
      button('Se déconnecter', () => {
        if (!confirm('Se déconnecter de cette classe sur cet ordinateur ? Il faudra le code et la clé pour revenir.')) return;
        classroom.leave();
        void leave(screen).then(() => showClassroom(levels, actions));
      }, 'ghost', LogOut),
      button('Exporter (CSV)', exportCsv, 'ghost', Download),
      button('Actualiser', load, 'ghost', RefreshCw),
      button('Retour', () => void leave(screen).then(actions.back), 'primary', ArrowLeft),
    ],
  );
  screen.querySelector('.dossier')?.classList.add('wide');
  ui().append(screen);
  load();
}
