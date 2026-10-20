#!/usr/bin/env node
// Offline password reset for whoever has shell access to the server. The web
// app only offers a self-service change that requires the current password,
// so a user who forgot it (including the admin) had no way back in short of
// editing the bcrypt hash in auth.db by hand. This script does that safely:
// it backs up the database, writes a hash with the same cost the server uses
// and checks the new password against the stored hash before reporting success.
//
// Usage:
//   npm run reset-password                  # list accounts
//   npm run reset-password -- <username>    # prompt for the new password (TTY)
//   RESET_PASSWORD='...' npm run reset-password -- <username>
//
// Without a TTY and without RESET_PASSWORD a random temporary password is
// generated and printed once. The password is never taken from argv so it does
// not end up in shell history or in the process list.
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const bcrypt = require('bcrypt');
const Database = require('better-sqlite3');

// Must match the cost and minimum length enforced by the auth module.
const BCRYPT_COST = 12;
const MIN_PASSWORD_LENGTH = 6;

const databasePath = process.env.DATABASE_PATH || path.join(os.homedir(), '.cloudcli', 'auth.db');
const username = process.argv[2];

function fail(message) {
  console.error(`reset-password: ${message}`);
  process.exit(1);
}

function promptHidden(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    // Echo nothing while the password is typed.
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

async function readNewPassword() {
  if (process.env.RESET_PASSWORD) {
    return { password: process.env.RESET_PASSWORD, generated: false };
  }
  if (process.stdin.isTTY) {
    const first = await promptHidden('Nova senha: ');
    const second = await promptHidden('Repita a nova senha: ');
    if (first !== second) fail('as senhas digitadas não conferem.');
    return { password: first, generated: false };
  }
  return { password: crypto.randomBytes(9).toString('base64url'), generated: true };
}

if (!fs.existsSync(databasePath)) fail(`banco não encontrado em ${databasePath}`);

const db = new Database(databasePath);

if (!username) {
  const users = db.prepare('SELECT id, username, role, is_active FROM users ORDER BY id').all();
  console.log(`Contas em ${databasePath}:`);
  for (const user of users) {
    console.log(`  ${user.username}  (${user.role}${user.is_active ? '' : ', desativada'})`);
  }
  console.log('\nUso: npm run reset-password -- <username>');
  process.exit(0);
}

const user = db.prepare('SELECT id, username FROM users WHERE username = ?').get(username);
if (!user) fail(`usuário "${username}" não existe. Rode sem argumentos para listar as contas.`);

const { password, generated } = await readNewPassword();
if (password.length < MIN_PASSWORD_LENGTH) {
  fail(`a senha precisa ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`);
}

const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
const backupPath = `${databasePath}.bak-senha-${stamp}`;
await db.backup(backupPath);

const passwordHash = bcrypt.hashSync(password, BCRYPT_COST);
db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(passwordHash, user.id);

const stored = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(user.id);
if (!bcrypt.compareSync(password, stored.password_hash)) {
  fail(`a senha gravada não confere; restaure o backup ${backupPath}`);
}

console.log(`Senha de "${user.username}" redefinida. Backup do banco: ${backupPath}`);
if (generated) {
  console.log(`Senha temporária: ${password}`);
  console.log('Troque em Configurações > Minha conta depois de entrar.');
}
