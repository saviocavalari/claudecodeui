import { useState } from 'react';
import { Check, Loader2, Lock } from 'lucide-react';

import { api } from '@/shared/api';
import { Button, Input } from '@/shared/ui';
import { useAuth } from '@/modules/auth';

const MIN_PASSWORD_LENGTH = 6;

/**
 * "My account" panel: lets the signed-in user change their own password.
 *
 * Every user sees this tab, admin or not, and it only ever acts on the account
 * that is currently signed in — the server resolves the account from the token,
 * never from anything typed here. Resetting somebody else's password is not
 * possible from this screen by design.
 */
export default function AccountSettingsTab() {
  const { user } = useAuth();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDone, setIsDone] = useState(false);

  const canSubmit = Boolean(currentPassword && newPassword && confirmPassword) && !isSaving;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setIsDone(false);

    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      setError(`A nova senha precisa ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`);
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('A confirmação não bate com a nova senha.');
      return;
    }
    if (newPassword === currentPassword) {
      setError('A nova senha precisa ser diferente da atual.');
      return;
    }

    setIsSaving(true);
    try {
      const res = await api.auth.changePassword(currentPassword, newPassword);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          res.status === 401
            ? 'Senha atual incorreta.'
            : body.error || 'Não foi possível alterar a senha.',
        );
      }
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setIsDone(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Erro inesperado.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Minha conta</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Conectado como <span className="font-medium text-foreground">{user?.username}</span>.
          A alteração abaixo vale apenas para esta conta.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="max-w-md space-y-4">
        <h3 className="flex items-center gap-2 text-sm font-medium text-foreground">
          <Lock className="h-4 w-4" /> Alterar minha senha
        </h3>

        <label className="block space-y-1.5">
          <span className="text-sm text-foreground">Senha atual</span>
          <Input
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            disabled={isSaving}
          />
        </label>

        <label className="block space-y-1.5">
          <span className="text-sm text-foreground">Nova senha</span>
          <Input
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            disabled={isSaving}
          />
          <span className="block text-xs text-muted-foreground">
            Pelo menos {MIN_PASSWORD_LENGTH} caracteres.
          </span>
        </label>

        <label className="block space-y-1.5">
          <span className="text-sm text-foreground">Confirmar nova senha</span>
          <Input
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            disabled={isSaving}
          />
        </label>

        {error && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        {isDone && (
          <div className="flex items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400">
            <Check className="h-4 w-4 flex-shrink-0" />
            Senha alterada. Use a nova senha no próximo login.
          </div>
        )}

        <Button type="submit" disabled={!canSubmit}>
          {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
          Alterar senha
        </Button>
      </form>
    </div>
  );
}
