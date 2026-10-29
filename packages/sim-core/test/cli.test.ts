import { describe, expect, it } from 'vitest';
import { Cli, profiles } from '../src/index.js';

const router = () => new Cli({ profile: profiles['cisco-1841']! });
const privileged = (cli = router()) => {
  cli.execute('enable');
  return cli;
};
const configMode = (cli = privileged()) => {
  cli.execute('configure terminal');
  return cli;
};

describe('mode state machine', () => {
  it('starts in user EXEC with the > prompt', () => {
    expect(router().prompt).toBe('Router>');
  });

  it('walks user -> privileged -> config -> interface and back', () => {
    const cli = router();
    expect(cli.execute('enable').prompt).toBe('Router#');
    const r = cli.execute('configure terminal');
    expect(r.prompt).toBe('Router(config)#');
    expect(r.output).toBe('Enter configuration commands, one per line.  End with CNTL/Z.');
    expect(cli.execute('interface fa0/0').prompt).toBe('Router(config-if)#');
    expect(cli.execute('exit').prompt).toBe('Router(config)#');
    expect(cli.execute('end').prompt).toBe('Router#');
    expect(cli.execute('disable').prompt).toBe('Router>');
  });

  it('accepts unique abbreviations (en / conf t)', () => {
    const cli = router();
    cli.execute('en');
    expect(cli.execute('conf t').prompt).toBe('Router(config)#');
  });

  it('hostname changes the prompt and no hostname resets it', () => {
    const cli = configMode();
    expect(cli.execute('hostname R1').prompt).toBe('R1(config)#');
    expect(cli.execute('no hostname').prompt).toBe('Router(config)#');
  });

  it('runs global commands typed inside a sub-mode and returns to config mode', () => {
    const cli = configMode();
    cli.execute('interface serial 0/0/0');
    expect(cli.execute('hostname R9').prompt).toBe('R9(config)#');
  });

  it('runs exec commands from config mode with do', () => {
    const cli = configMode();
    expect(cli.execute('do show startup-config').output).toBe('startup-config is not present');
    expect(cli.prompt).toBe('Router(config)#');
  });
});

describe('errors', () => {
  it('puts the caret under the offending word, counting the prompt width', () => {
    const r = router().execute('configure terminal');
    expect(r.output).toBe(`${' '.repeat(7)}^\n% Invalid input detected at '^' marker.`);
  });

  it('points at the second word when only that one is wrong', () => {
    const r = privileged().execute('show runnning');
    expect(r.output).toBe(`${' '.repeat(7 + 5)}^\n% Invalid input detected at '^' marker.`);
  });

  it('reports incomplete commands', () => {
    expect(configMode().execute('hostname').output).toBe('% Incomplete command.');
  });

  it('reports ambiguous abbreviations', () => {
    expect(privileged().execute('e').output).toBe('% Ambiguous command:  "e"');
  });

  it('rejects an unknown interface', () => {
    const r = configMode().execute('interface fa9/9');
    expect(r.output).toContain("% Invalid input detected at '^' marker.");
  });

  it('rejects ip address on a switch access port', () => {
    const sw = new Cli({ profile: profiles['catalyst-2960']! });
    sw.execute('enable');
    sw.execute('configure terminal');
    sw.execute('interface fa0/1');
    expect(sw.execute('ip address 10.0.0.1 255.255.255.0').output).toContain('Invalid input');
  });
});

describe('contextual help', () => {
  it('lists the commands of the current mode with ?', () => {
    const out = router().execute('?').output;
    expect(out).toContain('enable');
    expect(out).not.toContain('configure');
  });

  it('lists next words with descriptions', () => {
    const out = privileged().execute('show ?').output;
    expect(out).toContain('running-config');
    expect(out).toContain('startup-config');
    expect(out).toContain('version');
  });

  it('lists words starting with a partial word', () => {
    expect(privileged().execute('sh?').output).toBe('show');
  });

  it('shows <cr> when the command can end', () => {
    expect(privileged().execute('show version ?').output).toBe('  <cr>');
  });

  it('shows parameter help', () => {
    expect(configMode().execute('hostname ?').output).toBe("  WORD  This system's network name");
  });

  it('completes unique prefixes (Tab)', () => {
    expect(privileged().complete('sh run')).toBe('sh running-config ');
    expect(privileged().complete('sh s')).toBe('sh startup-config ');
    expect(privileged().complete('s')).toBe('show ');
  });
});

describe('interface and line configuration', () => {
  it('stores interface settings in the structured config', () => {
    const cli = configMode();
    cli.execute('interface fastethernet 0/0');
    cli.execute('description LAN');
    cli.execute('ip address 192.168.1.1 255.255.255.0');
    cli.execute('no shutdown');
    const ifc = cli.config.interfaces.find((i) => i.name === 'FastEthernet0/0');
    expect(ifc).toMatchObject({ description: 'LAN', ip: { address: '192.168.1.1', mask: '255.255.255.0' }, shutdown: false });
    cli.execute('no ip address');
    expect(cli.config.interfaces.find((i) => i.name === 'FastEthernet0/0')?.ip).toBeUndefined();
  });

  it('applies line commands to the selected lines only', () => {
    const cli = configMode();
    cli.execute('line vty 0 4');
    cli.execute('password cisco');
    const [con, , vty04, vty515] = cli.config.lines;
    expect(con?.password).toBeUndefined();
    expect(vty04?.password).toBe('cisco');
    expect(vty515?.password).toBeUndefined();
  });

  it('refuses vty ranges that cannot be represented', () => {
    expect(configMode().execute('line vty 0 2').output).toContain('Unsupported vty range');
  });
});

describe('passwords and sessions', () => {
  it('asks for the enable secret and grants access on the right answer', () => {
    const cli = configMode();
    cli.execute('enable secret class');
    cli.execute('end');
    cli.execute('disable');
    const ask = cli.execute('enable');
    expect(ask.prompt).toBe('Password: ');
    expect(ask.hiddenInput).toBe(true);
    expect(cli.execute('class').prompt).toBe('Router#');
  });

  it('denies access after three bad enable secrets', () => {
    const cli = configMode();
    cli.execute('enable secret class');
    cli.execute('end');
    cli.execute('disable');
    cli.execute('enable');
    cli.execute('a');
    cli.execute('b');
    const last = cli.execute('c');
    expect(last.output).toBe('% Bad secrets');
    expect(last.prompt).toBe('Router>');
  });

  it('shows the banner and asks for the console password on connect', () => {
    const cli = configMode();
    cli.execute('banner motd #');
    cli.execute('AUTHORIZED ONLY');
    cli.execute('#');
    cli.execute('line console 0');
    cli.execute('password cisco');
    cli.execute('login');
    cli.execute('end');
    cli.execute('logout');
    const r = cli.execute('');
    expect(r.output).toBe('AUTHORIZED ONLY\n\nUser Access Verification\n');
    expect(r.prompt).toBe('Password: ');
    expect(cli.execute('cisco').prompt).toBe('Router>');
  });

  it('supports single-line banners', () => {
    const cli = configMode();
    expect(cli.execute('banner motd #hello#').prompt).toBe('Router(config)#');
    expect(cli.config.motd).toEqual(['hello']);
  });
});

describe('startup-config, erase and reload', () => {
  it('saves with copy run start and shows the startup-config', () => {
    const cli = configMode();
    cli.execute('hostname R1');
    cli.execute('end');
    expect(cli.execute('show startup-config').output).toBe('startup-config is not present');
    expect(cli.execute('copy run start').prompt).toBe('Destination filename [startup-config]? ');
    expect(cli.execute('').output).toBe('Building configuration...\n[OK]');
    expect(cli.execute('show startup-config').output).toContain('hostname R1');
  });

  it('keeps the startup-config across a reload and drops unsaved changes', () => {
    const cli = configMode();
    cli.execute('hostname Saved');
    cli.execute('end');
    cli.execute('write memory');
    cli.execute('configure terminal');
    cli.execute('hostname Unsaved');
    cli.execute('end');

    expect(cli.execute('reload').prompt).toBe('System configuration has been modified. Save? [yes/no]: ');
    expect(cli.execute('no').prompt).toBe('Proceed with reload? [confirm]');
    cli.execute('');
    expect(cli.execute('').prompt).toBe('Saved>');
  });

  it('asks the initial configuration dialog when there is no startup-config', () => {
    const cli = configMode();
    cli.execute('hostname Gone');
    cli.execute('end');
    cli.execute('erase startup-config');
    cli.execute('');
    cli.execute('reload');
    cli.execute('n');
    const dialog = cli.execute('');
    expect(dialog.prompt).toBe('Would you like to enter the initial configuration dialog? [yes/no]: ');
    cli.execute('no');
    expect(cli.execute('').prompt).toBe('Router>');
  });

  it('cancels erase when the answer starts with n', () => {
    const cli = configMode();
    cli.execute('end');
    cli.execute('write memory');
    cli.execute('erase startup-config');
    cli.execute('n');
    expect(cli.startup).not.toBeNull();
  });
});
