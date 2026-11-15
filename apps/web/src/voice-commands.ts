/** What a spoken sentence asks for. No browser needed. */

export type VoiceCommand =
  | { kind: 'cable'; cable: 'straight' | 'crossover' | 'console' | 'serial' | null }
  | { kind: 'check' | 'hint' | 'brief' | 'overview' | 'ports' | 'menu' | 'help' }
  | { kind: 'open'; device: string }
  | { kind: 'ask'; question: string };

/** What a spoken sentence asks for. Anything that is not a command is a question for Aïcha. */
export function understand(sentence: string, devices: string[]): VoiceCommand {
  const s = sentence
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();
  if (/\b(cable|cordon)\b.*\bdroit/.test(s)) return { kind: 'cable', cable: 'straight' };
  if (/\b(cable|cordon)\b.*\bcroise/.test(s)) return { kind: 'cable', cable: 'crossover' };
  if (/\b(cable|cordon)\b.*\bconsole/.test(s)) return { kind: 'cable', cable: 'console' };
  if (/\b(cable|cordon)\b.*\bserie/.test(s)) return { kind: 'cable', cable: 'serial' };
  if (/\b(pose|lache|range|annule)\b.*\b(cable|cordon)/.test(s)) return { kind: 'cable', cable: null };
  // A device by name, spoken as "R un", "S 2", "PC trois"…
  const digits: Record<string, string> = { un: '1', une: '1', deux: '2', trois: '3', quatre: '4', cinq: '5', six: '6' };
  const compact = s.replace(/\b(un|une|deux|trois|quatre|cinq|six)\b/g, (w) => digits[w] ?? w).replace(/\s+/g, '');
  const device = devices.find((d) => compact.includes(d.toLowerCase()));
  if (device && /(ouvr|console|configur|va sur|connecte|regarde)/.test(s)) return { kind: 'open', device };
  if (/\bverifi/.test(s)) return { kind: 'check' };
  if (/\b(indice|aide-moi|un coup de main)\b/.test(s)) return { kind: 'hint' };
  if (/\b(consignes?|briefing|ordre de travail)\b/.test(s)) return { kind: 'brief' };
  if (/\b(vue d'ensemble|vue generale|recule|vue)\b/.test(s)) return { kind: 'overview' };
  if (/\b(ports|interfaces)\b/.test(s)) return { kind: 'ports' };
  if (/\b(menu|pause)\b/.test(s)) return { kind: 'menu' };
  if (/\b(commandes|touches|raccourcis)\b/.test(s)) return { kind: 'help' };
  return { kind: 'ask', question: sentence.trim() };
}
