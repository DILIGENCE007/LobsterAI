import { EventEmitter } from 'events';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { PassThrough } from 'stream';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { McpOAuthErrorCode, McpOAuthState } from '../../shared/mcp/auth';
import {
  buildMcpOAuthCliInvocation,
  cleanMcpCliOutput,
  clearMcpOAuthCredentialsBestEffort,
  extractMcpAuthorizationUrl,
  isMcpOAuthIdentityRemoved,
  isMcpServerInOpenClawConfig,
  type McpOAuthCliContext,
  McpOAuthCliError,
  type McpOAuthSpawn,
  parseMcpOAuthStatusOutput,
  readMcpOAuthStatuses,
  runMcpOAuthLogin,
  runMcpOAuthLogout,
} from './mcpOAuthCli';

let runtimeRoot: string;
let context: McpOAuthCliContext;

beforeEach(() => {
  runtimeRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-oauth-cli-')));
  fs.writeFileSync(path.join(runtimeRoot, 'openclaw.mjs'), '');
  context = {
    electronNodeRuntimePath: '/fake/electron',
    runtimeRoot,
    stateDir: path.join(runtimeRoot, 'home', 'state'),
    configPath: path.join(runtimeRoot, 'home', 'state', 'openclaw.json'),
    secretEnv: { LOBSTER_SECRET: 'x' },
  };
});

afterEach(() => {
  fs.rmSync(runtimeRoot, { recursive: true, force: true });
});

/** A fake child process that prints the given stdout lines and exits with `code`. */
function fakeSpawn(lines: string[], code: number, stderr = ''): { spawnImpl: McpOAuthSpawn; calls: Array<{ command: string; args: string[]; env: NodeJS.ProcessEnv }> } {
  const calls: Array<{ command: string; args: string[]; env: NodeJS.ProcessEnv }> = [];
  const spawnImpl: McpOAuthSpawn = (command, args, options) => {
    calls.push({ command, args, env: options.env });
    const child = new EventEmitter() as EventEmitter & { stdout: PassThrough; stderr: PassThrough; kill: () => boolean };
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.kill = () => true;
    setImmediate(() => {
      // Split one line across two chunks to exercise line buffering.
      const text = lines.join('\n');
      const middle = Math.floor(text.length / 2);
      child.stdout.write(text.slice(0, middle));
      child.stdout.write(`${text.slice(middle)}\n`);
      if (stderr) child.stderr.write(stderr);
      child.stdout.end();
      child.stderr.end();
      setImmediate(() => child.emit('close', code));
    });
    return child as unknown as ReturnType<McpOAuthSpawn>;
  };
  return { spawnImpl, calls };
}

/** A fake `mcp login` that prints the given lines, then waits for the browser until it is killed. */
function waitingSpawn(lines: string[]): { spawnImpl: McpOAuthSpawn; kill: ReturnType<typeof vi.fn>; spawned: () => number } {
  let spawnCount = 0;
  const kill = vi.fn();
  const spawnImpl: McpOAuthSpawn = () => {
    spawnCount += 1;
    const child = new EventEmitter() as EventEmitter & { stdout: PassThrough; stderr: PassThrough; kill: () => boolean };
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.kill = () => {
      kill();
      setImmediate(() => child.emit('close', null));
      return true;
    };
    setImmediate(() => child.stdout.write(`${lines.join('\n')}\n`));
    return child as unknown as ReturnType<McpOAuthSpawn>;
  };
  return { spawnImpl, kill, spawned: () => spawnCount };
}

// What `openclaw mcp logout` really prints on stderr when openclaw.json has unrelated issues.
const ESC = String.fromCharCode(27);
const CONFIG_WARNINGS = `${ESC}[35m[config]${ESC}[39m ${ESC}[33mwarnings: plugins.entries.acpx: plugin not installed: acpx; `
  + `gateway.auth.token: *** env var "OPENCLAW_GATEWAY_TOKEN" - feature using this value will be unavailable${ESC}[39m`;
const NO_SERVER = 'No MCP server named "lynxce" in /x/openclaw.json. Run openclaw mcp list to see configured servers.';

describe('cleanMcpCliOutput', () => {
  test('drops color codes and config loader warnings, keeping the actual error', () => {
    expect(cleanMcpCliOutput(`${CONFIG_WARNINGS}\n${NO_SERVER}\n`)).toBe(NO_SERVER);
    expect(cleanMcpCliOutput(`${ESC}[31mboom${ESC}[39m`)).toBe('boom');
  });
});

describe('extractMcpAuthorizationUrl', () => {
  test('accepts only a bare http(s) URL line', () => {
    expect(extractMcpAuthorizationUrl('  https://auth.example.com/authorize?a=1&b=2  ')).toBe(
      'https://auth.example.com/authorize?a=1&b=2',
    );
    expect(extractMcpAuthorizationUrl('Open this URL to authorize "x":')).toBeNull();
    expect(extractMcpAuthorizationUrl('file:///etc/passwd')).toBeNull();
    expect(extractMcpAuthorizationUrl('javascript:alert(1)')).toBeNull();
    expect(extractMcpAuthorizationUrl('https://a.example.com/x run this')).toBeNull();
  });
});

describe('parseMcpOAuthStatusOutput', () => {
  test('keeps OAuth servers only and tolerates log noise around the JSON', () => {
    const stdout = [
      '[plugins] loaded 3 plugins',
      JSON.stringify({
        path: '/x/openclaw.json',
        servers: [
          { name: 'lynxce', auth: 'oauth', authStatus: { state: 'authorized' } },
          { name: 'notion', auth: 'oauth', authStatus: { state: 'requires-authorization' } },
          { name: 'odd', auth: 'oauth', authStatus: { state: 'something-new' } },
          { name: 'plain', transport: 'stdio' },
        ],
      }),
    ].join('\n');
    expect(parseMcpOAuthStatusOutput(stdout)).toEqual({
      lynxce: McpOAuthState.Authorized,
      notion: McpOAuthState.RequiresAuthorization,
      odd: McpOAuthState.Unknown,
    });
    expect(parseMcpOAuthStatusOutput('not json')).toEqual({});
  });
});

describe('runMcpOAuthLogin', () => {
  test('opens the printed authorization URL once and resolves when credentials are saved', async () => {
    const { spawnImpl, calls } = fakeSpawn(
      [
        'Open this URL to authorize "lynxce":',
        'https://web.example.com/api/oauth/mcp/authorize?client_id=c1&state=s',
        'Waiting for the browser to return to OpenClaw...',
        'MCP OAuth credentials saved for "lynxce".',
      ],
      0,
    );
    const openExternal = vi.fn(async () => {});

    await runMcpOAuthLogin({ context, serverKey: 'lynxce', openExternal, spawnImpl });

    expect(openExternal).toHaveBeenCalledTimes(1);
    expect(openExternal).toHaveBeenCalledWith('https://web.example.com/api/oauth/mcp/authorize?client_id=c1&state=s');
    expect(calls[0].command).toBe('/fake/electron');
    expect(calls[0].args).toEqual([path.join(runtimeRoot, 'openclaw.mjs'), 'mcp', 'login', 'lynxce']);
    expect(calls[0].env).toMatchObject({
      ELECTRON_RUN_AS_NODE: '1',
      OPENCLAW_STATE_DIR: context.stateDir,
      OPENCLAW_CONFIG_PATH: context.configPath,
      LOBSTER_SECRET: 'x',
    });
  });

  test('treats still-valid stored credentials as success without opening a browser', async () => {
    const { spawnImpl } = fakeSpawn(['MCP OAuth credentials saved for "lynxce".'], 0);
    const openExternal = vi.fn(async () => {});
    await runMcpOAuthLogin({ context, serverKey: 'lynxce', openExternal, spawnImpl });
    expect(openExternal).not.toHaveBeenCalled();
  });

  test('does not open the browser and fails when the loopback callback cannot start (exit 0, no token)', async () => {
    const { spawnImpl } = fakeSpawn(
      [
        'Could not start the local OAuth callback (listen EADDRINUSE 127.0.0.1:8989).',
        'Open this URL to authorize "lynxce":',
        'https://web.example.com/api/oauth/mcp/authorize?client_id=c1',
        'After approval, run openclaw mcp login lynxce --code <code>.',
      ],
      0,
    );
    const openExternal = vi.fn(async () => {});
    await expect(runMcpOAuthLogin({ context, serverKey: 'lynxce', openExternal, spawnImpl })).rejects.toMatchObject({
      code: McpOAuthErrorCode.CallbackUnavailable,
    });
    expect(openExternal).not.toHaveBeenCalled();
  });

  test('surfaces the CLI error when login exits non-zero', async () => {
    const { spawnImpl } = fakeSpawn([], 1, 'MCP server "lynxce" is not configured with auth: "oauth".');
    const error = await runMcpOAuthLogin({ context, serverKey: 'lynxce', openExternal: async () => {}, spawnImpl }).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(McpOAuthCliError);
    expect((error as McpOAuthCliError).code).toBe(McpOAuthErrorCode.Failed);
    expect((error as McpOAuthCliError).message).toContain('not configured with auth');
  });

  test('reports a server missing from openclaw.json as not loaded', async () => {
    const { spawnImpl } = fakeSpawn(
      [],
      1,
      'No MCP server named "lynxce" in /x/openclaw.json. Run openclaw mcp list to see configured servers.',
    );
    await expect(
      runMcpOAuthLogin({ context, serverKey: 'lynxce', openExternal: async () => {}, spawnImpl }),
    ).rejects.toMatchObject({ code: McpOAuthErrorCode.ServerNotLoaded });
  });

  test('rejects a second concurrent login for the same server', async () => {
    const { spawnImpl } = fakeSpawn(['MCP OAuth credentials saved for "lynxce".'], 0);
    const first = runMcpOAuthLogin({ context, serverKey: 'lynxce', openExternal: async () => {}, spawnImpl });
    await expect(
      runMcpOAuthLogin({ context, serverKey: 'lynxce', openExternal: async () => {}, spawnImpl }),
    ).rejects.toMatchObject({ code: McpOAuthErrorCode.AlreadyInProgress });
    await first;
  });

  test('kills the waiting CLI and reports cancellation when the signal aborts', async () => {
    const { spawnImpl, kill } = waitingSpawn([
      'Open this URL to authorize "lynxce":',
      'https://web.example.com/api/oauth/mcp/authorize?client_id=c1',
      'Waiting for the browser to return to OpenClaw...',
    ]);
    const openExternal = vi.fn(async () => {});
    const controller = new AbortController();
    const login = runMcpOAuthLogin({ context, serverKey: 'lynxce', openExternal, spawnImpl, signal: controller.signal });
    await vi.waitFor(() => expect(openExternal).toHaveBeenCalledTimes(1));

    controller.abort();

    await expect(login).rejects.toMatchObject({ code: McpOAuthErrorCode.Cancelled });
    expect(kill).toHaveBeenCalledTimes(1);
    // The server is free for a new sign-in once the cancelled one has ended.
    const { spawnImpl: retrySpawn } = fakeSpawn(['MCP OAuth credentials saved for "lynxce".'], 0);
    await runMcpOAuthLogin({ context, serverKey: 'lynxce', openExternal, spawnImpl: retrySpawn });
  });

  test('does not spawn the CLI when the signal is already aborted', async () => {
    const { spawnImpl, spawned } = waitingSpawn([]);
    const controller = new AbortController();
    controller.abort();
    await expect(
      runMcpOAuthLogin({ context, serverKey: 'lynxce', openExternal: async () => {}, spawnImpl, signal: controller.signal }),
    ).rejects.toMatchObject({ code: McpOAuthErrorCode.Cancelled });
    expect(spawned()).toBe(0);
  });

  test('keeps config warnings out of the error message', async () => {
    const { spawnImpl } = fakeSpawn([], 1, `${CONFIG_WARNINGS}\nMCP server "lynxce" needs a URL for OAuth login.`);
    const error = await runMcpOAuthLogin({ context, serverKey: 'lynxce', openExternal: async () => {}, spawnImpl })
      .catch((e: unknown) => e as McpOAuthCliError);
    expect(error.code).toBe(McpOAuthErrorCode.Failed);
    expect(error.message).toBe('MCP server "lynxce" needs a URL for OAuth login.');
  });

  test('asks the CLI for plain, uncolored output', () => {
    expect(buildMcpOAuthCliInvocation(context, ['status', '--json']).options.env).toMatchObject({
      NO_COLOR: '1',
      FORCE_COLOR: '0',
    });
  });

  test('reports a missing runtime before spawning anything', () => {
    fs.rmSync(path.join(runtimeRoot, 'openclaw.mjs'));
    expect(() => buildMcpOAuthCliInvocation(context, ['status', '--json'])).toThrow(McpOAuthCliError);
  });
});

describe('isMcpServerInOpenClawConfig', () => {
  test('checks mcp.servers and lets the CLI handle unreadable configs', () => {
    const configPath = path.join(runtimeRoot, 'openclaw.json');
    fs.writeFileSync(configPath, JSON.stringify({ mcp: { servers: { lynxce: { url: 'https://x', auth: 'oauth' } } } }));
    expect(isMcpServerInOpenClawConfig(configPath, 'lynxce')).toBe(true);
    expect(isMcpServerInOpenClawConfig(configPath, 'other')).toBe(false);

    // LobsterAI's minimal config (no model configured yet) has no mcp section.
    fs.writeFileSync(configPath, JSON.stringify({ gateway: {}, plugins: {} }));
    expect(isMcpServerInOpenClawConfig(configPath, 'lynxce')).toBe(false);

    fs.writeFileSync(configPath, '{ not json');
    expect(isMcpServerInOpenClawConfig(configPath, 'lynxce')).toBe(true);
  });
});

describe('runMcpOAuthLogout', () => {
  test('reports a server missing from openclaw.json as not loaded, without the CLI noise', async () => {
    const { spawnImpl } = fakeSpawn([], 1, `${CONFIG_WARNINGS}\n${NO_SERVER}`);
    const error = await runMcpOAuthLogout({ context, serverKey: 'lynxce', spawnImpl }).catch((e: unknown) => e as McpOAuthCliError);
    expect(error.code).toBe(McpOAuthErrorCode.ServerNotLoaded);
    expect(error.message).not.toContain('[config]');
    expect(error.message).not.toContain(ESC);
  });
});

describe('isMcpOAuthIdentityRemoved', () => {
  const existing = { name: 'lynxce', url: 'https://mcp.example.com/mcp' };

  test('flags changes that orphan the stored tokens', () => {
    expect(isMcpOAuthIdentityRemoved(existing, { name: 'renamed' })).toBe(true);
    expect(isMcpOAuthIdentityRemoved(existing, { url: 'https://other.example.com/mcp' })).toBe(true);
    expect(isMcpOAuthIdentityRemoved(existing, { auth: 'none' })).toBe(true);
    expect(isMcpOAuthIdentityRemoved(existing, { transportType: 'stdio' })).toBe(true);
  });

  test('ignores updates that keep the same identity', () => {
    expect(isMcpOAuthIdentityRemoved(existing, {})).toBe(false);
    expect(isMcpOAuthIdentityRemoved(existing, {
      name: 'lynxce',
      url: 'https://mcp.example.com/mcp',
      transportType: 'http',
      auth: 'oauth',
    })).toBe(false);
  });
});

describe('clearMcpOAuthCredentialsBestEffort', () => {
  const writeConfig = (servers: Record<string, unknown>) => {
    fs.mkdirSync(path.dirname(context.configPath), { recursive: true });
    fs.writeFileSync(context.configPath, JSON.stringify({ mcp: { servers } }));
  };

  test('runs `mcp logout` for a server that OpenClaw has loaded', async () => {
    writeConfig({ lynxce: { url: 'https://x', auth: 'oauth' } });
    const { spawnImpl, calls } = fakeSpawn(['MCP OAuth credentials cleared for "lynxce".'], 0);
    await expect(clearMcpOAuthCredentialsBestEffort({ context, serverKey: 'lynxce', spawnImpl })).resolves.toBe(true);
    expect(calls[0].args.slice(1)).toEqual(['mcp', 'logout', 'lynxce']);
  });

  test('skips servers missing from openclaw.json without spawning', async () => {
    writeConfig({});
    const { spawnImpl, calls } = fakeSpawn([], 0);
    await expect(clearMcpOAuthCredentialsBestEffort({ context, serverKey: 'lynxce', spawnImpl })).resolves.toBe(false);
    expect(calls).toHaveLength(0);
  });

  test('swallows CLI failures', async () => {
    writeConfig({ lynxce: { url: 'https://x', auth: 'oauth' } });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { spawnImpl } = fakeSpawn([], 1, 'boom');
    await expect(clearMcpOAuthCredentialsBestEffort({ context, serverKey: 'lynxce', spawnImpl })).resolves.toBe(false);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe('readMcpOAuthStatuses', () => {
  test('runs `mcp status --json` and parses the result', async () => {
    const { spawnImpl, calls } = fakeSpawn(
      [JSON.stringify({ servers: [{ name: 'lynxce', auth: 'oauth', authStatus: { state: 'authorized' } }] })],
      0,
    );
    await expect(readMcpOAuthStatuses({ context, spawnImpl })).resolves.toEqual({ lynxce: McpOAuthState.Authorized });
    expect(calls[0].args.slice(1)).toEqual(['mcp', 'status', '--json']);
  });
});
