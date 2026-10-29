import * as THREE from 'three';
import type { Stage } from '../scene/stage.js';

/**
 * Playing with a controller (standard mapping: Xbox, PlayStation, generic USB pads). The left stick moves an
 * on-screen cursor, the right stick turns the camera around what it looks at, the triggers zoom. Over the menus the
 * A button clicks what the cursor points at; over the room it acts like the mouse.
 *
 *   A  click / plug        B  unplug         X  zoom on the device   Y  overview
 *   LB/RB  previous/next cable                Back  close the panel or drop the cable
 */

/** What the controller drives in the room; the current mission registers itself. */
export interface GameTarget {
  canvas: HTMLElement;
  aim(x: number, y: number): void;
  act(): void;
  unplug(): void;
  focus(): void;
  overview(): void;
  cancel(): void;
  cycleCable(step: 1 | -1): void;
}

const DEAD_ZONE = 0.18;
/** Cursor speed at full tilt, in screen heights per second. */
const CURSOR_SPEED = 0.9;
const ORBIT_SPEED = 2.2;
const ZOOM_SPEED = 1.6;
/** Hide the cursor after this long without touching the pad (the mouse took over). */
const IDLE_HIDE_S = 6;

let target: GameTarget | null = null;

/** Register what the pad drives; returns the function that unregisters it. */
export function setGameTarget(t: GameTarget): () => void {
  target = t;
  return () => {
    if (target === t) target = null;
  };
}

const deadZone = (v: number): number => (Math.abs(v) < DEAD_ZONE ? 0 : (v - Math.sign(v) * DEAD_ZONE) / (1 - DEAD_ZONE));

/** Start listening for controllers. `notify` shows a short message (pad connected). */
export function startGamepad(stage: Stage, notify: (text: string) => void): void {
  const cursor = document.createElement('div');
  cursor.className = 'pad-cursor';
  cursor.hidden = true;
  document.body.append(cursor);

  let x = window.innerWidth / 2;
  let y = window.innerHeight / 2;
  let previous: boolean[] = [];
  let idle = 0;
  let hovered: Element | null = null;
  let active = false;

  window.addEventListener('gamepadconnected', (e) => {
    notify(`🎮 ${e.gamepad.id.split('(')[0]?.trim() || 'Manette'} connectée — A : cliquer, B : débrancher, LB/RB : câbles`);
    active = true;
  });
  window.addEventListener('mousemove', () => {
    idle = IDLE_HIDE_S;
  });

  const spherical = new THREE.Spherical();
  const offset = new THREE.Vector3();

  const press = (button: number): void => {
    const under = document.elementFromPoint(x, y);
    const overRoom = !!target && under === target.canvas;
    switch (button) {
      case 0: // A
        if (overRoom) target?.act();
        else if (under instanceof HTMLInputElement || under instanceof HTMLTextAreaElement) under.focus();
        else (under?.closest('button, a, [role="button"], label') as HTMLElement | null)?.click();
        break;
      case 1: // B
        if (overRoom) target?.unplug();
        else target?.cancel();
        break;
      case 2: // X
        target?.focus();
        break;
      case 3: // Y
        target?.overview();
        break;
      case 4: // LB
        target?.cycleCable(-1);
        break;
      case 5: // RB
        target?.cycleCable(1);
        break;
      case 8: // Back / Share
        target?.cancel();
        break;
    }
  };

  stage.onFrame((dt) => {
    if (!active) return;
    const pad = [...navigator.getGamepads()].find((p): p is Gamepad => !!p && p.connected);
    if (!pad) return;
    const [lx = 0, ly = 0, rx = 0, ry = 0] = pad.axes.map(deadZone);
    const buttons = pad.buttons.map((b) => b.pressed);
    const dpadX = (buttons[15] ? 1 : 0) - (buttons[14] ? 1 : 0);
    const dpadY = (buttons[13] ? 1 : 0) - (buttons[12] ? 1 : 0);
    const zoom = (pad.buttons[7]?.value ?? 0) - (pad.buttons[6]?.value ?? 0);
    const touched = lx || ly || rx || ry || dpadX || dpadY || Math.abs(zoom) > 0.05 || buttons.some((b, i) => b && !previous[i]);

    if (touched) idle = 0;
    else idle += dt;
    cursor.hidden = idle >= IDLE_HIDE_S;

    // Cursor: stick for speed, d-pad for precise steps.
    const speed = CURSOR_SPEED * window.innerHeight * dt;
    const moveX = lx * Math.abs(lx) * speed + dpadX * speed * 0.25;
    const moveY = ly * Math.abs(ly) * speed + dpadY * speed * 0.25;
    if (moveX || moveY) {
      x = Math.min(window.innerWidth - 1, Math.max(0, x + moveX));
      y = Math.min(window.innerHeight - 1, Math.max(0, y + moveY));
      const under = document.elementFromPoint(x, y);
      if (target && under === target.canvas) target.aim(x, y);
      const button = under?.closest('button') ?? null;
      if (button !== hovered) {
        hovered?.classList.remove('pad-hover');
        button?.classList.add('pad-hover');
        hovered = button;
      }
    }
    cursor.style.transform = `translate(${x}px, ${y}px)`;

    // Camera: orbit around the target, zoom with the triggers.
    if ((rx || ry || Math.abs(zoom) > 0.05) && stage.controls.enabled) {
      const c = stage.controls;
      offset.copy(stage.camera.position).sub(c.target);
      spherical.setFromVector3(offset);
      spherical.theta -= rx * ORBIT_SPEED * dt;
      spherical.phi = THREE.MathUtils.clamp(spherical.phi + ry * ORBIT_SPEED * dt, 0.15, c.maxPolarAngle);
      spherical.radius = THREE.MathUtils.clamp(spherical.radius * (1 - zoom * ZOOM_SPEED * dt), c.minDistance, c.maxDistance);
      stage.camera.position.copy(c.target).add(offset.setFromSpherical(spherical));
    }

    buttons.forEach((down, i) => {
      if (down && !previous[i]) press(i);
    });
    previous = buttons;
  });
}
