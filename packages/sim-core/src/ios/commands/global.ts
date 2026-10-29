import { parentOf, parseInterfaceRange } from '../interfaces.js';
import { groupOf, isVirtualKind } from '../profiles.js';
import type { CommandContext, CommandDef } from '../types.js';

function startBanner(ctx: CommandContext, text: string): string {
  const delimiter = text.charAt(0);
  const rest = text.slice(1);
  const closing = rest.indexOf(delimiter);
  if (closing >= 0) {
    ctx.config.motd = [rest.slice(0, closing)];
    return '';
  }

  const lines: string[] = rest.trim() === '' ? [] : [rest];
  const collect = (line: string): void => {
    const end = line.indexOf(delimiter);
    if (end < 0) {
      lines.push(line);
      ctx.ask({ prompt: '', handler: collect });
      return;
    }
    const before = line.slice(0, end);
    if (before !== '') lines.push(before);
    ctx.config.motd = lines;
  };
  ctx.ask({ prompt: '', handler: collect });
  return `Enter TEXT message.  End with the character '${delimiter}'.`;
}

export const globalCommands: CommandDef[] = [
  {
    modes: ['config'],
    syntax: 'hostname <name:word>',
    help: "Set system's network name",
    paramHelp: { name: 'This system\'s network name' },
    negatable: true,
    run: (ctx, args) => {
      const name = args.name as string;
      // Letters, digits and hyphens only, up to 63 characters (RFC 1123 host names).
      if (!ctx.negate && !/^[A-Za-z0-9-]{1,63}$/.test(name)) return '% Hostname contains one or more illegal characters.';
      ctx.config.hostname = ctx.negate ? ctx.profile.defaultHostname : name;
    },
  },
  {
    modes: ['config'],
    syntax: 'enable secret <password:word>',
    help: 'Assign the privileged level secret',
    paramHelp: { password: 'The UNENCRYPTED (cleartext) \'enable\' secret' },
    negatable: true,
    run: (ctx, args) => {
      if (ctx.negate) delete ctx.config.enableSecret;
      else ctx.config.enableSecret = args.password as string;
    },
  },
  {
    modes: ['config'],
    syntax: 'enable password <password:word>',
    help: 'Assign the privileged level password (MUST be different from the secret)',
    paramHelp: { password: 'The UNENCRYPTED (cleartext) \'enable\' password' },
    negatable: true,
    run: (ctx, args) => {
      if (ctx.negate) delete ctx.config.enablePassword;
      else ctx.config.enablePassword = args.password as string;
    },
  },
  {
    modes: ['config'],
    syntax: 'banner motd <text:text>',
    help: 'Set Message of the Day banner',
    paramHelp: { text: 'c banner-text c, where \'c\' is a delimiting character' },
    negatable: true,
    run: (ctx, args) => {
      if (ctx.negate) {
        delete ctx.config.motd;
        return;
      }
      return startBanner(ctx, args.text as string);
    },
  },
  {
    modes: ['config'],
    syntax: 'ip domain-lookup',
    help: 'Enable IP Domain Name System hostname translation',
    negatable: true,
    run: (ctx) => {
      ctx.config.domainLookup = !ctx.negate;
    },
  },
  {
    modes: ['config'],
    syntax: 'ip domain lookup',
    help: 'Enable IP Domain Name System hostname translation',
    negatable: true,
    run: (ctx) => {
      ctx.config.domainLookup = !ctx.negate;
    },
  },
  {
    modes: ['config'],
    syntax: 'service password-encryption',
    help: 'Encrypt system passwords',
    negatable: true,
    run: (ctx) => {
      ctx.config.passwordEncryption = !ctx.negate;
    },
  },
  {
    modes: ['config'],
    syntax: 'interface <name:iface>',
    help: 'Select an interface to configure',
    paramHelp: { name: 'Interface type and number' },
    negatable: true,
    run: (ctx, args) => {
      const name = args.name as string;
      const kind = groupOf(ctx.profile, name)?.kind;
      const parent = parentOf(name);
      if (ctx.negate) {
        // Only SVIs, loopbacks and subinterfaces can be deleted; physical interfaces are fixed.
        if (!parent && (!isVirtualKind(kind) || name === 'Vlan1')) ctx.invalid(1);
        ctx.config.interfaces = ctx.config.interfaces.filter((i) => i.name !== name);
        return;
      }
      const list = ctx.config.interfaces;
      if (!list.some((i) => i.name === name)) {
        if (parent) {
          // A new subinterface is listed right after its parent and siblings; it starts enabled like its parent.
          let at = list.findIndex((i) => i.name === parent);
          while (at + 1 < list.length && parentOf((list[at + 1] as { name: string }).name) === parent) at++;
          list.splice(at + 1, 0, { name, shutdown: false });
        } else {
          // `interface vlan N` creates the SVI administratively down; a loopback comes up at once.
          list.push({ name, shutdown: kind === 'svi' });
        }
      }
      ctx.setMode(parent ? 'config-subif' : 'config-if', { interfaces: [name] });
    },
  },
  {
    modes: ['config'],
    syntax: 'interface range <ports:text>',
    help: 'Configure a range of interfaces',
    paramHelp: { ports: 'Interface range, e.g. fa0/1 - 24 , fa0/30' },
    run: (ctx, args) => {
      const names = parseInterfaceRange(ctx.profile, args.ports as string) ?? ctx.invalid(2);
      ctx.setMode('config-if-range', { interfaces: names });
    },
  },
  {
    modes: ['config'],
    syntax: 'vlan <id:int:1-4094>',
    help: 'VLAN commands',
    paramHelp: { id: 'ISL VLAN IDs 1-4094' },
    negatable: true,
    run: (ctx, args) => {
      const id = Number(args.id);
      if (ctx.profile.family !== 'switch') ctx.invalid(0);
      if (id >= 1002 && id <= 1005) ctx.invalid(1);
      if (ctx.negate) {
        if (id === 1) ctx.invalid(1);
        ctx.config.vlans = ctx.config.vlans.filter((v) => v.id !== id);
        return;
      }
      if (!ctx.config.vlans.some((v) => v.id === id) && id !== 1) ctx.config.vlans.push({ id });
      ctx.setMode('config-vlan', { vlan: id });
    },
  },
  {
    modes: ['config'],
    syntax: 'ip default-gateway <address:ip>',
    help: 'Specify default gateway (if not routing IP)',
    paramHelp: { address: 'IP address of default gateway' },
    negatable: true,
    run: (ctx, args) => {
      if (ctx.negate) delete ctx.config.defaultGateway;
      else ctx.config.defaultGateway = args.address as string;
    },
  },
  {
    modes: ['config'],
    syntax: 'line console <number:int:0-0>',
    help: 'Primary terminal line',
    run: (ctx) => ctx.setMode('config-line', { lines: ['con 0'] }),
  },
  {
    modes: ['config'],
    syntax: 'line aux <number:int:0-0>',
    help: 'Auxiliary line',
    run: (ctx) => {
      if (!ctx.profile.hasAux) ctx.invalid(1);
      ctx.setMode('config-line', { lines: ['aux 0'] });
    },
  },
  {
    modes: ['config'],
    syntax: 'line vty <first:int:0-15> <last:int:0-15>',
    help: 'Virtual terminal',
    paramHelp: { first: 'First Line number', last: 'Last Line number' },
    run: (ctx, args) => {
      const first = Number(args.first);
      const last = Number(args.last);
      const ids = ctx.config.lines
        .filter((l) => l.id.startsWith('vty '))
        .filter((l) => {
          const [from, to] = l.id.slice(4).split(' ').map(Number) as [number, number];
          return from >= first && to <= last;
        })
        .map((l) => l.id);
      const covered = ids.map((id) => id.slice(4).split(' ').map(Number) as [number, number]);
      const exact =
        covered.length > 0 &&
        Math.min(...covered.map((c) => c[0])) === first &&
        Math.max(...covered.map((c) => c[1])) === last;
      if (!exact) return '% Unsupported vty range in this simulator (use 0 4, 5 15 or 0 15).';
      ctx.setMode('config-line', { lines: ids });
    },
  },
];
