export type ParamType = 'word' | 'int' | 'ip' | 'mask' | 'iface' | 'text';

export interface LiteralNode {
  kind: 'literal';
  word: string;
}

export interface ParamNode {
  kind: 'param';
  name: string;
  type: ParamType;
  min?: number;
  max?: number;
}

export type SyntaxNode = LiteralNode | ParamNode;

const PARAM_TYPES: readonly ParamType[] = ['word', 'int', 'ip', 'mask', 'iface', 'text'];

/** Parse e.g. `line vty <first:int:0-15> <last:int:0-15>` into nodes. */
export function parseSyntax(syntax: string): SyntaxNode[] {
  return syntax
    .trim()
    .split(/\s+/)
    .map((raw): SyntaxNode => {
      if (!(raw.startsWith('<') && raw.endsWith('>'))) return { kind: 'literal', word: raw.toLowerCase() };
      const [name, type, range] = raw.slice(1, -1).split(':');
      if (!name || !type || !PARAM_TYPES.includes(type as ParamType)) throw new Error(`Bad syntax token: ${raw}`);
      const node: ParamNode = { kind: 'param', name, type: type as ParamType };
      if (range) {
        const [min, max] = range.split('-').map(Number);
        node.min = min;
        node.max = max;
      }
      return node;
    });
}

export function paramLabel(node: ParamNode): string {
  switch (node.type) {
    case 'int':
      return node.min !== undefined && node.max !== undefined ? `<${node.min}-${node.max}>` : '<number>';
    case 'ip':
    case 'mask':
      return 'A.B.C.D';
    case 'text':
      return 'LINE';
    default:
      return 'WORD';
  }
}

export function isIpv4(s: string): boolean {
  const parts = s.split('.');
  return parts.length === 4 && parts.every((p) => /^\d{1,3}$/.test(p) && Number(p) <= 255);
}

export function isInRange(s: string, node: ParamNode): boolean {
  if (!/^\d+$/.test(s)) return false;
  const n = Number(s);
  return (node.min === undefined || n >= node.min) && (node.max === undefined || n <= node.max);
}
