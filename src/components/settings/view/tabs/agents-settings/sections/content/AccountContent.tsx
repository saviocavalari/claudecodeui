import { useCallback, useEffect, useState } from 'react';
import { Check, Loader2, LogIn, Plus, RefreshCw, Trash2, UserRound } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { authenticatedFetch } from '../../../../../../../utils/api';
import { Badge, Button } from '../../../../../../../shared/view/ui';
import SessionProviderLogo from '../../../../../../llm-logo-provider/SessionProviderLogo';
import type { AgentProvider, AuthStatus } from '../../../../../types/types';

type AccountContentProps = {
  agent: AgentProvider;
  authStatus: AuthStatus;
  onLogin: (customCommand?: string) => void;
};

type AgentVisualConfig = {
  name: string;
  bgClass: string;
  borderClass: string;
  textClass: string;
  subtextClass: string;
  buttonClass: string;
  description?: string;
};

type ProviderAccount = {
  id: string;
  name: string;
  isDefault: boolean;
  isActive: boolean;
  authenticated: boolean;
  email: string | null;
  method: string | null;
  error: string | null;
  coolingUntil: string | null;
};

type AccountsSnapshot = {
  provider: 'claude' | 'codex';
  activeProfileId: string | null;
  autoSwitch: boolean;
  allowGlobalAccount: boolean;
  accounts: ProviderAccount[];
};

type ApiResponse<T> = {
  success: boolean;
  data: T;
};

const agentConfig: Record<AgentProvider, AgentVisualConfig> = {
  claude: {
    name: 'Claude',
    bgClass: 'bg-blue-50 dark:bg-blue-900/20',
    borderClass: 'border-blue-200 dark:border-blue-800',
    textClass: 'text-blue-900 dark:text-blue-100',
    subtextClass: 'text-blue-700 dark:text-blue-300',
    buttonClass: 'bg-blue-600 hover:bg-blue-700 active:bg-blue-800',
  },
  cursor: {
    name: 'Cursor',
    bgClass: 'bg-purple-50 dark:bg-purple-900/20',
    borderClass: 'border-purple-200 dark:border-purple-800',
    textClass: 'text-purple-900 dark:text-purple-100',
    subtextClass: 'text-purple-700 dark:text-purple-300',
    buttonClass: 'bg-purple-600 hover:bg-purple-700 active:bg-purple-800',
  },
  codex: {
    name: 'Codex',
    bgClass: 'bg-muted/50',
    borderClass: 'border-gray-300 dark:border-gray-600',
    textClass: 'text-gray-900 dark:text-gray-100',
    subtextClass: 'text-gray-700 dark:text-gray-300',
    buttonClass: 'bg-gray-800 hover:bg-gray-900 active:bg-gray-950 dark:bg-gray-700 dark:hover:bg-gray-600 dark:active:bg-gray-500',
  },
  opencode: {
    name: 'OpenCode',
    description: 'OpenCode CLI assistant',
    bgClass: 'bg-zinc-50 dark:bg-zinc-900/20',
    borderClass: 'border-zinc-200 dark:border-zinc-700',
    textClass: 'text-zinc-900 dark:text-zinc-100',
    subtextClass: 'text-zinc-700 dark:text-zinc-300',
    buttonClass: 'bg-zinc-900 hover:bg-zinc-800 active:bg-zinc-950 dark:bg-zinc-700 dark:hover:bg-zinc-600',
  },
};

const readApiData = async <T,>(response: Response): Promise<T> => {
  const payload = await response.json() as ApiResponse<T> & { error?: string };
  if (!response.ok || !payload.success) {
    throw new Error(payload.error || 'Não foi possível atualizar as contas.');
  }
  return payload.data;
};

export default function AccountContent({ agent, authStatus, onLogin }: AccountContentProps) {
  const { t } = useTranslation('settings');
  const config = agentConfig[agent];
  const supportsMultipleAccounts = agent === 'claude' || agent === 'codex';
  const [snapshot, setSnapshot] = useState<AccountsSnapshot | null>(null);
  const [accountsLoading, setAccountsLoading] = useState(false);
  const [busyAccountId, setBusyAccountId] = useState<string | null>(null);
  const [accountsError, setAccountsError] = useState<string | null>(null);

  const notifyAuthChanged = useCallback(() => {
    window.dispatchEvent(new CustomEvent('provider-auth-changed', {
      detail: { provider: agent },
    }));
  }, [agent]);

  const loadAccounts = useCallback(async () => {
    if (!supportsMultipleAccounts) {
      return;
    }
    setAccountsLoading(true);
    setAccountsError(null);
    try {
      const response = await authenticatedFetch(`/api/providers/${agent}/accounts`);
      setSnapshot(await readApiData<AccountsSnapshot>(response));
    } catch (error) {
      setAccountsError(error instanceof Error ? error.message : 'Não foi possível carregar as contas.');
    } finally {
      setAccountsLoading(false);
    }
  }, [agent, supportsMultipleAccounts]);

  useEffect(() => {
    void loadAccounts();
    const handleChanged = (event: Event) => {
      const provider = (event as CustomEvent<{ provider?: AgentProvider }>).detail?.provider;
      if (provider === agent) {
        void loadAccounts();
      }
    };
    window.addEventListener('provider-auth-changed', handleChanged);
    return () => window.removeEventListener('provider-auth-changed', handleChanged);
  }, [agent, loadAccounts]);

  const activateAccount = async (accountId: string) => {
    setBusyAccountId(accountId);
    setAccountsError(null);
    try {
      const response = await authenticatedFetch(
        `/api/providers/${agent}/accounts/${encodeURIComponent(accountId)}/activate`,
        { method: 'POST', body: '{}' },
      );
      setSnapshot(await readApiData<AccountsSnapshot>(response));
      notifyAuthChanged();
    } catch (error) {
      setAccountsError(error instanceof Error ? error.message : 'Não foi possível trocar a conta.');
    } finally {
      setBusyAccountId(null);
    }
  };

  const addAccount = async () => {
    setBusyAccountId('new');
    setAccountsError(null);
    try {
      const response = await authenticatedFetch(`/api/providers/${agent}/accounts`, {
        method: 'POST',
        body: JSON.stringify({
          name: `Conta ${(snapshot?.accounts.length ?? 1) + 1}`,
        }),
      });
      const result = await readApiData<{ account: ProviderAccount; loginCommand: string }>(response);
      await loadAccounts();
      onLogin(result.loginCommand);
    } catch (error) {
      setAccountsError(error instanceof Error ? error.message : 'Não foi possível adicionar a conta.');
    } finally {
      setBusyAccountId(null);
    }
  };

  const loginAccount = async (account: ProviderAccount) => {
    setBusyAccountId(account.id);
    setAccountsError(null);
    try {
      if (!account.isActive) {
        await activateAccount(account.id);
      }
      const response = await authenticatedFetch(
        `/api/providers/${agent}/accounts/${encodeURIComponent(account.id)}/login-command`,
        { method: 'POST', body: '{}' },
      );
      const result = await readApiData<{ loginCommand: string }>(response);
      onLogin(result.loginCommand);
    } catch (error) {
      setAccountsError(error instanceof Error ? error.message : 'Não foi possível iniciar o login.');
    } finally {
      setBusyAccountId(null);
    }
  };

  const deleteAccount = async (account: ProviderAccount) => {
    if (!window.confirm(`Remover "${account.name}" do CloudCLI?`)) {
      return;
    }
    setBusyAccountId(account.id);
    setAccountsError(null);
    try {
      const response = await authenticatedFetch(
        `/api/providers/${agent}/accounts/${encodeURIComponent(account.id)}`,
        { method: 'DELETE' },
      );
      setSnapshot(await readApiData<AccountsSnapshot>(response));
      notifyAuthChanged();
    } catch (error) {
      setAccountsError(error instanceof Error ? error.message : 'Não foi possível remover a conta.');
    } finally {
      setBusyAccountId(null);
    }
  };

  const updateAutoSwitch = async (enabled: boolean) => {
    if (!snapshot) {
      return;
    }
    setSnapshot({ ...snapshot, autoSwitch: enabled });
    setAccountsError(null);
    try {
      const response = await authenticatedFetch(`/api/providers/${agent}/accounts/settings`, {
        method: 'PATCH',
        body: JSON.stringify({ autoSwitch: enabled }),
      });
      setSnapshot(await readApiData<AccountsSnapshot>(response));
    } catch (error) {
      setSnapshot({ ...snapshot, autoSwitch: !enabled });
      setAccountsError(error instanceof Error ? error.message : 'Não foi possível salvar a troca automática.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="mb-4 flex items-center gap-3">
        <SessionProviderLogo provider={agent} className="h-6 w-6" />
        <div>
          <h3 className="text-lg font-medium text-foreground">{config.name}</h3>
          <p className="text-sm text-muted-foreground">
            {t(`agents.account.${agent}.description`, {
              defaultValue: config.description || `${config.name} CLI assistant`,
            })}
          </p>
        </div>
      </div>

      <div className={`${config.bgClass} border ${config.borderClass} rounded-lg p-4`}>
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <div className={`font-medium ${config.textClass}`}>
                {t('agents.connectionStatus')}
              </div>
              <div className={`text-sm ${config.subtextClass}`}>
                {authStatus.loading
                  ? t('agents.authStatus.checkingAuth')
                  : authStatus.authenticated
                    ? t('agents.authStatus.loggedInAs', {
                        email: authStatus.email || t('agents.authStatus.authenticatedUser'),
                      })
                    : t('agents.authStatus.notConnected')}
              </div>
            </div>
            {authStatus.loading ? (
              <Badge variant="secondary" className="bg-muted">{t('agents.authStatus.checking')}</Badge>
            ) : authStatus.authenticated ? (
              <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">
                {t('agents.authStatus.connected')}
              </Badge>
            ) : (
              <Badge variant="secondary" className="bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300">
                {t('agents.authStatus.disconnected')}
              </Badge>
            )}
          </div>

          {!supportsMultipleAccounts && authStatus.method !== 'api_key' && (
            <div className="border-t border-border/50 pt-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className={`font-medium ${config.textClass}`}>
                    {authStatus.authenticated ? t('agents.login.reAuthenticate') : t('agents.login.title')}
                  </div>
                  <div className={`text-sm ${config.subtextClass}`}>
                    {authStatus.authenticated
                      ? t('agents.login.reAuthDescription')
                      : t('agents.login.description', { agent: config.name })}
                  </div>
                </div>
                <Button onClick={() => onLogin()} className={`${config.buttonClass} text-white`} size="sm">
                  <LogIn className="mr-2 h-4 w-4" />
                  {authStatus.authenticated ? t('agents.login.reLoginButton') : t('agents.login.button')}
                </Button>
              </div>
            </div>
          )}

          {authStatus.error && !supportsMultipleAccounts && (
            <div className="border-t border-border/50 pt-4 text-sm text-red-600 dark:text-red-400">
              {t('agents.error', { error: authStatus.error })}
            </div>
          )}
        </div>
      </div>

      {supportsMultipleAccounts && (
        <div className="space-y-3 rounded-lg border border-border bg-card p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h4 className="font-medium text-foreground">
                {t('agents.multipleAccounts.title', { defaultValue: 'Contas conectadas' })}
              </h4>
              <p className="text-sm text-muted-foreground">
                {t('agents.multipleAccounts.description', {
                  defaultValue: 'Escolha a conta ativa ou conecte outras contas para alternar quando o limite for atingido.',
                })}
              </p>
            </div>
            <Button
              size="sm"
              onClick={() => void addAccount()}
              disabled={busyAccountId !== null}
              className={`${config.buttonClass} text-white`}
            >
              {busyAccountId === 'new'
                ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                : <Plus className="mr-2 h-4 w-4" />}
              {t('agents.multipleAccounts.add', { defaultValue: 'Adicionar conta' })}
            </Button>
          </div>

          {accountsLoading && !snapshot ? (
            <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t('agents.multipleAccounts.loading', { defaultValue: 'Carregando contas...' })}
            </div>
          ) : (
            <div className="space-y-2">
              {snapshot?.accounts.map((account) => {
                const cooling = Boolean(
                  account.coolingUntil && Date.parse(account.coolingUntil) > Date.now(),
                );
                return (
                  <div
                    key={account.id}
                    className={`flex flex-wrap items-center gap-3 rounded-lg border p-3 ${
                      account.isActive ? 'border-green-500/50 bg-green-500/5' : 'border-border'
                    }`}
                  >
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted">
                      <UserRound className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-sm font-medium text-foreground">{account.name}</span>
                        {account.isActive && (
                          <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">
                            {t('agents.multipleAccounts.active', { defaultValue: 'Em uso' })}
                          </Badge>
                        )}
                        {cooling && (
                          <Badge variant="secondary">
                            {t('agents.multipleAccounts.cooldown', { defaultValue: 'Limite atingido' })}
                          </Badge>
                        )}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">
                        {account.authenticated
                          ? account.email || t('agents.authStatus.authenticatedUser')
                          : t('agents.authStatus.notConnected')}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      {!account.isActive && account.authenticated && (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={busyAccountId !== null}
                          onClick={() => void activateAccount(account.id)}
                          title={t('agents.multipleAccounts.use', { defaultValue: 'Usar esta conta' })}
                        >
                          {busyAccountId === account.id
                            ? <Loader2 className="h-4 w-4 animate-spin" />
                            : <Check className="h-4 w-4" />}
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={busyAccountId !== null}
                        onClick={() => void loginAccount(account)}
                        title={t('agents.multipleAccounts.login', { defaultValue: 'Entrar novamente' })}
                      >
                        <RefreshCw className="h-4 w-4" />
                      </Button>
                      {!account.isDefault && (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={busyAccountId !== null}
                          onClick={() => void deleteAccount(account)}
                          className="text-red-600 hover:text-red-700"
                          title={t('agents.multipleAccounts.remove', { defaultValue: 'Remover conta' })}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {snapshot && (
            <>
              {!snapshot.allowGlobalAccount && (
                <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
                  A conta global não foi liberada para seu usuário. Conecte uma conta própria para usar este agente.
                </div>
              )}
              <label className="flex cursor-pointer items-start gap-3 border-t border-border pt-3">
                <input
                  type="checkbox"
                  checked={snapshot.autoSwitch}
                  onChange={(event) => void updateAutoSwitch(event.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-border"
                />
                <span>
                  <span className="block text-sm font-medium text-foreground">
                    {t('agents.multipleAccounts.autoSwitch', { defaultValue: 'Trocar automaticamente ao atingir o limite' })}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {t('agents.multipleAccounts.autoSwitchDescription', {
                      defaultValue: 'O CloudCLI tenta a próxima conta conectada e repete a solicitação atual.',
                    })}
                  </span>
                </span>
              </label>
            </>
          )}

          {accountsError && (
            <div className="text-sm text-red-600 dark:text-red-400">{accountsError}</div>
          )}
        </div>
      )}
    </div>
  );
}
