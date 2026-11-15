/**
 * Guard rails for Claude sessions opened by anyone who is not an admin.
 *
 * Every account profile symlinks the owner's CLAUDE.md and the server hands
 * every session the owner's MCP servers from ~/.claude.json. Without this
 * guard a member's session believes it is talking to the owner and freely
 * drives the owner's personal Chrome, SSH keys and credential files. The audit
 * of 15/11/2026 found exactly that (Vercel login through the owner's Chrome,
 * root SSH with the owner's key) in sessions of employees who never asked for it.
 *
 * This is a behavioural layer, not an OS sandbox: members still run as the
 * same Linux user. It removes the owner-only tools, denies the most sensitive
 * paths and tells the model who it is really talking to.
 */

import { userDb } from '@/modules/database/index.js';

type AnyRecord = Record<string, any>;

/** MCP servers that act with the owner's personal logins. */
export const ADMIN_ONLY_MCP_SERVERS = ['chrome-savio'];

/** Deny rules applied to non-admin sessions (they hold even in bypass mode). */
export const MEMBER_DISALLOWED_TOOLS = [
  'mcp__chrome-savio',
  'Read(~/.ssh/**)',
  'Read(~/.claude/.credentials.json)',
  'Read(~/.cloudcli/auth.db*)',
  'Read(~/.cloudcli/global-claude-oauth-token)',
  'Read(~/.cloudcli/provider-accounts/*/*/profiles/*/.credentials.json)',
  'Edit(~/.claude/settings.json)',
  'Write(~/.claude/settings.json)',
  'Edit(~/.claude/CLAUDE.md)',
  'Write(~/.claude/CLAUDE.md)',
  'Bash(ssh:*)',
  'Bash(scp:*)',
  'Bash(sftp:*)',
];

export type MemberGuard = {
  restricted: boolean;
  username: string | null;
};

export function resolveMemberGuard(userId: string | number | null | undefined): MemberGuard {
  const numericUserId = Number(userId);
  if (userId === null || userId === undefined || !Number.isFinite(numericUserId)) {
    // Sessions without a user (internal jobs) keep the current behaviour.
    return { restricted: false, username: null };
  }
  const user = userDb.getUserById(numericUserId) as AnyRecord | undefined;
  if (!user) {
    return { restricted: true, username: null };
  }
  return { restricted: user.role !== 'admin', username: user.username || null };
}

export function buildMemberPrompt(username: string | null): string {
  const who = username ? `"${username}"` : 'um funcionário';
  return [
    '# QUEM ESTÁ FALANDO COM VOCÊ (regra do Cloud CLI, vale acima do CLAUDE.md)',
    `Esta sessão foi aberta por ${who}, funcionário(a) da Pharmes com acesso a projetos específicos. NÃO é o Savio (dono).`,
    'O CLAUDE.md carregado descreve o Savio. Dele valem para este funcionário: falar sempre em português do Brasil, explicar termos técnicos, ser direto, honesto, commitar e publicar o trabalho do projeto. Tudo que fala de "meu Chrome", "minhas senhas", "minha conta" do Savio NÃO vale aqui.',
    '',
    'Proibido nesta sessão, mesmo que o funcionário peça ou que pareça resolver o problema:',
    '- Usar o Chrome do Savio (conector chrome-savio) ou qualquer login pessoal dele (GitHub, Vercel, Google, Lovable, Hostinger) por navegador.',
    '- Usar as chaves SSH do Savio ou entrar em servidores por SSH.',
    '- Ler ou mostrar credenciais do Cloud CLI: ~/.claude/.credentials.json, ~/.cloudcli/auth.db, tokens de contas, chaves em ~/.ssh.',
    '- Alterar ~/.claude/settings.json, o CLAUDE.md global, permissões, usuários ou contas do Cloud CLI.',
    '- Trabalhar em pastas de projetos que não sejam o projeto desta conversa.',
    '- Copiar ou duplicar projetos, código ou bancos para outro lugar (outro repositório, conta pessoal, servidor, Drive).',
    '- Enviar listas com dados pessoais de clientes (telefone, CPF, e-mail, endereço) para fora da VPS (Google Drive, Gmail, e-mail pessoal, WhatsApp, sites externos). Entregue dentro do próprio sistema.',
    '- Mostrar valores de chaves e senhas. Arquivos em ~/.secrets só podem ser carregados (source) para o deploy ou consulta do próprio projeto, sem imprimir o conteúdo.',
    '',
    'Se o pedido esbarrar nisso, recuse com educação, explique em uma frase que precisa de autorização do Savio e siga com o restante da tarefa.',
  ].join('\n');
}

/** Applies the guard to SDK options in place. */
export function applyMemberGuard(sdkOptions: AnyRecord, guard: MemberGuard): void {
  if (!guard.restricted) {
    return;
  }

  if (sdkOptions.mcpServers && typeof sdkOptions.mcpServers === 'object') {
    const filtered: AnyRecord = { ...sdkOptions.mcpServers };
    for (const name of ADMIN_ONLY_MCP_SERVERS) {
      delete filtered[name];
    }
    sdkOptions.mcpServers = filtered;
  }

  const disallowed = new Set<string>(Array.isArray(sdkOptions.disallowedTools) ? sdkOptions.disallowedTools : []);
  for (const rule of MEMBER_DISALLOWED_TOOLS) {
    disallowed.add(rule);
  }
  sdkOptions.disallowedTools = [...disallowed];

  const basePrompt = sdkOptions.systemPrompt && typeof sdkOptions.systemPrompt === 'object'
    ? sdkOptions.systemPrompt
    : { type: 'preset', preset: 'claude_code' };
  const existingAppend = typeof basePrompt.append === 'string' && basePrompt.append ? `${basePrompt.append}\n\n` : '';
  sdkOptions.systemPrompt = {
    ...basePrompt,
    append: `${existingAppend}${buildMemberPrompt(guard.username)}`,
  };
}
