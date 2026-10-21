#!/usr/bin/env node
// Stores a long-lived Claude token for the primary ("Conta principal") account.
// The primary account normally lives in ~/.claude/.credentials.json, filled by
// `claude /login`. That login carries a refresh token with a hard expiry of
// about a month; once it passes, every user sharing the primary account is
// asked to authenticate again. `claude setup-token` issues a token that lasts a
// year. The server injects it as CLAUDE_CODE_OAUTH_TOKEN for the primary
// account only, so per-user accounts keep their own logins.
//
// Usage:
//   npm run set-global-claude-token            # runs `claude setup-token`, then asks for the token
//   npm run set-global-claude-token -- --skip  # only asks for a token generated earlier
//   GLOBAL_CLAUDE_TOKEN='sk-ant-oat01-...' npm run set-global-claude-token -- --skip
//   npm run set-global-claude-token -- --status
//
// The token is never taken from argv so it does not end up in shell history or
// in the process list. It is tested before being written; a token that does
// not answer is not saved. No build or restart is needed: the server reads the
// file on every request.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';

const TOKEN_PATTERN = /^sk-ant-oat\d+-[A-Za-z0-9_-]+$/;
const tokenPath = process.env.GLOBAL_CLAUDE_TOKEN_PATH
  || path.join(os.homedir(), '.cloudcli', 'global-claude-oauth-token');
const args = new Set(process.argv.slice(2));

function fail(message) {
  console.error(`set-global-claude-token: ${message}`);
  process.exit(1);
}

function promptHidden(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = (text) => {
      if (text.startsWith(question)) rl.output.write(text);
    };
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write('\n');
      resolve(answer);
    });
  });
}

// Runs the CLI with nothing but the token, so neither a profile directory nor
// the stale host credentials can make a bad token look good.
function testToken(token) {
  const env = { ...process.env, CLAUDE_CODE_OAUTH_TOKEN: token };
  delete env.CLAUDE_CONFIG_DIR;
  delete env.ANTHROPIC_API_KEY;
  delete env.ANTHROPIC_AUTH_TOKEN;
  const result = spawnSync(
    'claude',
    ['-p', 'responda apenas: ok', '--model', 'claude-haiku-4-5-20251001', '--max-turns', '1'],
    { env, cwd: os.tmpdir(), input: '', encoding: 'utf8', timeout: 120_000 },
  );
  const output = `${result.stdout || ''}${result.stderr || ''}`.trim();
  return { ok: result.status === 0 && /ok/i.test(result.stdout || ''), output };
}

function describeSavedToken() {
  if (!fs.existsSync(tokenPath)) return null;
  const stat = fs.statSync(tokenPath);
  const token = fs.readFileSync(tokenPath, 'utf8').trim();
  return { token, savedAt: stat.mtime };
}

if (args.has('--status')) {
  const saved = describeSavedToken();
  if (!saved) {
    console.log(`Nenhum token salvo em ${tokenPath}. A conta principal usa o login de ~/.claude.`);
    process.exit(0);
  }
  const { ok, output } = testToken(saved.token);
  console.log(`Token salvo em ${saved.savedAt.toLocaleString('pt-BR')} (${tokenPath}).`);
  console.log(ok ? 'Teste: funcionando.' : `Teste: FALHOU.\n${output}`);
  process.exit(ok ? 0 : 1);
}

if (!args.has('--skip')) {
  if (!process.stdin.isTTY) fail('o login precisa de um terminal interativo; use --skip com GLOBAL_CLAUDE_TOKEN.');
  console.log('Vai abrir o login do Claude. Entre com a conta que deve ser a "Conta principal".');
  console.log('No fim, o Claude mostra um token começando com sk-ant-oat01-. Copie-o.\n');
  const env = { ...process.env };
  delete env.CLAUDE_CONFIG_DIR;
  const result = spawnSync('claude', ['setup-token'], { env, stdio: 'inherit' });
  if (result.status !== 0) fail('o claude setup-token não terminou com sucesso.');
  console.log('');
}

let token = process.env.GLOBAL_CLAUDE_TOKEN;
if (!token) {
  if (!process.stdin.isTTY) fail('sem terminal interativo, passe o token em GLOBAL_CLAUDE_TOKEN.');
  token = await promptHidden('Cole aqui o token (não aparece na tela): ');
}
token = token.replace(/\s+/g, '');
if (!TOKEN_PATTERN.test(token)) fail('isso não parece um token do claude setup-token (sk-ant-oat01-...).');

console.log('Testando o token...');
const { ok, output } = testToken(token);
if (!ok) fail(`o token não funcionou, nada foi salvo.\n${output}`);

fs.mkdirSync(path.dirname(tokenPath), { recursive: true, mode: 0o700 });
const temporaryPath = `${tokenPath}.${process.pid}.tmp`;
fs.writeFileSync(temporaryPath, `${token}\n`, { mode: 0o600 });
fs.renameSync(temporaryPath, tokenPath);
console.log(`Pronto. Token salvo em ${tokenPath}; a Conta principal passa a usá-lo na próxima mensagem.`);
console.log('Ele vale por cerca de 1 ano. Para conferir depois: npm run set-global-claude-token -- --status');
