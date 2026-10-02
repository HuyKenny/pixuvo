/**
 * Turns a partner's "how to play" text into drawable controls (keycaps, mouse, touch).
 * Deterministic and conservative: a control is shown only when the text names it.
 * The UI labels the result "From the game's instructions" — it is not a guarantee.
 */
export type Device = 'keys' | 'mouse' | 'touch';

export interface ControlRow {
  device: Device;
  /** Keycaps to draw, e.g. ['↑','←','↓','→'] or ['W','A','S','D'] or ['Space']. Empty for mouse/touch. */
  keys: string[];
  /** Short action in plain words ("Move", "Jump"…), or null when the text does not say. */
  action: string | null;
  /** Mouse/touch gesture ("Click", "Drag", "Tap", "Swipe"). */
  gesture?: string;
}

const ACTIONS: Array<[RegExp, string]> = [
  [/\b(jump|jumps|jumping|hop)\b/, 'Jump'],
  [/\b(shoot|shoots|shooting|fire|fires)\b/, 'Shoot'],
  [/\b(punch|punches)\b/, 'Punch'],
  [/\b(kick|kicks)\b/, 'Kick'],
  [/\b(attack|attacks|hit|hits|strike)\b/, 'Attack'],
  [/\b(accelerate|accelerates|gas|speed up)\b/, 'Accelerate'],
  [/\b(brake|brakes|reverse|slow down)\b/, 'Brake'],
  [/\b(steer|steers|turn|turns|lean|tilt)\b/, 'Steer'],
  [/\b(aim|aims)\b/, 'Aim'],
  [/\b(pause|pauses)\b/, 'Pause'],
  [/\b(respawn|restart|retry)\b/, 'Restart'],
  [/\b(boost|nitro|dash|sprint|run faster)\b/, 'Boost'],
  [/\b(drag|drags)\b/, 'Drag'],
  [/\b(select|choose|pick)\b/, 'Select'],
  [/\b(move|moves|moving|walk|walks|control|controls|drive|drives|fly|flies|run|runs|navigate)\b/, 'Move'],
];

function actionNear(text: string, index: number, mentionLen = 0): string | null {
  // Partner texts often have no punctuation, so look only at the next few words after the
  // mention ("arrow keys to move", "Z to punch"), then a little before it ("to jump press space").
  const after = text.slice(index + mentionLen, index + mentionLen + 45);
  const stop = after.search(/[.;\n]|\b(press|use|hold|key|keys|click|tap)\b/);
  const window = stop > 0 ? after.slice(0, stop) : after;
  let best: { at: number; label: string } | null = null;
  for (const [re, label] of ACTIONS) {
    const m = re.exec(window);
    if (m && (!best || m.index < best.at)) best = { at: m.index, label };
  }
  if (best) return best.label;
  // Only the words between the previous control mention and this one ("to jump press space").
  let before = text.slice(Math.max(0, index - 30), index);
  const prev = [...before.matchAll(/\b(arrows?|keys?|space ?bar|space|click|tap|mouse|swipe|[a-z])\b|[,.;]/g)].pop();
  if (prev) before = before.slice(prev.index + prev[0].length);
  for (const [re, label] of ACTIONS) if (re.test(before)) return label;
  return null;
}

export function parseControls(instructions: string): ControlRow[] {
  if (!instructions) return [];
  const t = instructions.toLowerCase().replace(/\s+/g, ' ');
  const rows: ControlRow[] = [];
  const seen = new Set<string>();
  const add = (row: ControlRow) => {
    const key = row.device + row.keys.join() + (row.gesture ?? '');
    if (seen.has(key)) return;
    seen.add(key);
    rows.push(row);
  };

  let m: RegExpExecArray | null;
  if ((m = /\b(arrow keys?|arrows|arrow buttons|cursor keys)\b/.exec(t))) add({ device: 'keys', keys: ['↑', '←', '↓', '→'], action: actionNear(t, m.index, m[0].length) ?? 'Move' });
  if ((m = /\bw\s*,?\s*a\s*,?\s*s\s*,?\s*d\b|\bwasd\b/.exec(t))) add({ device: 'keys', keys: ['W', 'A', 'S', 'D'], action: actionNear(t, m.index) ?? 'Move' });
  if ((m = /\b(space ?bar|space key|spacebar|press space|space to)\b/.exec(t))) add({ device: 'keys', keys: ['Space'], action: actionNear(t, m.index, m[0].length) });
  if ((m = /\b(enter key|press enter|enter to)\b/.exec(t))) add({ device: 'keys', keys: ['Enter'], action: actionNear(t, m.index) });
  if ((m = /\b(shift key|press shift|shift to)\b/.exec(t))) add({ device: 'keys', keys: ['Shift'], action: actionNear(t, m.index) });
  if ((m = /\b(esc|escape) key\b|\bpress (p|esc)\b/.exec(t))) add({ device: 'keys', keys: [m[0].includes('p') && !m[0].includes('esc') ? 'P' : 'Esc'], action: 'Pause' });
  // Single letter keys: "press Z", "Z key", "X to jump"
  const letterRe = /\b(?:press|key|keys|use|hold)\s+([a-z])(?:\s*(?:,|and|or|\/)\s*([a-z]))?\b|\b([a-z])\s+key\b|\b([a-z])(?:\s+or\s+([a-z]))?\s+to\s+(?:jump|shoot|punch|kick|attack|fire|boost|dash|brake|accelerate)\b/g;
  while ((m = letterRe.exec(t))) {
    const letters = [m[1], m[2], m[3], m[4], m[5]].filter((x): x is string => !!x && x.length === 1 && x !== 'a' && x !== 'i');
    for (const l of letters) {
      if ('wasd'.includes(l) && seen.has('keysW,A,S,D')) continue;
      // "X or K to kick": the verb is part of the match itself.
      const own = / to (\w+)$/.exec(m[0]);
      const ownAction = own ? ACTIONS.find(([re]) => re.test(own[1]!))?.[1] ?? null : null;
      add({ device: 'keys', keys: [l.toUpperCase()], action: ownAction ?? actionNear(t, m.index, m[0].length) ?? actionNear(t, m.index) });
    }
    if (rows.length > 8) break;
  }
  if ((m = /\b(left[- ]?click|right[- ]?click|mouse click|click)\b/.exec(t))) add({ device: 'mouse', keys: [], gesture: 'Click', action: actionNear(t, m.index, m[0].length) });
  if ((m = /\b(drag|drag and drop)\b/.exec(t)) && /\bmouse\b|\bclick\b/.test(t)) add({ device: 'mouse', keys: [], gesture: 'Drag', action: actionNear(t, m.index) ?? 'Drag' });
  if ((m = /\b(move|use) (the )?mouse\b|\bmouse to\b/.exec(t)) && !rows.some((r) => r.device === 'mouse')) add({ device: 'mouse', keys: [], gesture: 'Move', action: actionNear(t, m.index) ?? 'Aim' });
  if ((m = /\b(tap|touch|touchscreen)\b/.exec(t))) add({ device: 'touch', keys: [], gesture: 'Tap', action: actionNear(t, m.index, m[0].length) });
  if ((m = /\b(swipe|swipes)\b/.exec(t))) add({ device: 'touch', keys: [], gesture: 'Swipe', action: actionNear(t, m.index, m[0].length) });
  return rows.slice(0, 8);
}
