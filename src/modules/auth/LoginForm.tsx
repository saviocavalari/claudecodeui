import { useCallback, useState } from 'react';
import type { FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Lock, User } from 'lucide-react';

import { api } from '@/shared/api';
import { useAuth } from '@/modules/auth/context/AuthContext';
import AuthErrorAlert from '@/modules/auth/AuthErrorAlert';
import AuthInputField from '@/modules/auth/AuthInputField';
import AuthScreenLayout from '@/modules/auth/AuthScreenLayout';

type LoginFormState = {
  username: string;
  password: string;
  confirmPassword: string;
};

const initialState: LoginFormState = {
  username: '',
  password: '',
  confirmPassword: '',
};

/**
 * Login form component.
 * Rendered by the auth module's ProtectedRoute when no user session exists.
 * Handles credential input with browser autofill support (`autocomplete`
 * attributes) so that password managers can offer to fill saved credentials.
 */
export default function LoginForm() {
  const { t } = useTranslation('auth');
  const { error: sessionError, login, register } = useAuth();

  const [mode, setMode] = useState<'login' | 'register' | 'reset'>('login');
  const [formState, setFormState] = useState<LoginFormState>(initialState);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isRegister = mode === 'register';
  const isReset = mode === 'reset';

  const switchMode = useCallback((next: 'login' | 'register' | 'reset') => {
    setMode(next);
    setErrorMessage('');
    setSuccessMessage('');
    setFormState((previous) => ({ ...previous, password: '', confirmPassword: '' }));
  }, []);

  const updateField = useCallback((field: keyof LoginFormState, value: string) => {
    setFormState((previous) => ({ ...previous, [field]: value }));
  }, []);

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setErrorMessage('');
      setSuccessMessage('');

      // Keep form validation local so each auth screen owns its own UI feedback.
      if (!formState.username.trim() || !formState.password) {
        setErrorMessage(t('login.errors.requiredFields'));
        return;
      }

      if ((isRegister || isReset) && formState.password.length < 6) {
        setErrorMessage('A senha precisa ter pelo menos 6 caracteres.');
        return;
      }

      if (isReset) {
        if (formState.password !== formState.confirmPassword) {
          setErrorMessage('As duas senhas não são iguais.');
          return;
        }
        setIsSubmitting(true);
        try {
          const res = await api.auth.requestPasswordReset(
            formState.username.trim(),
            formState.password,
          );
          if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            setErrorMessage(body.error || 'Não foi possível enviar o pedido.');
          } else {
            setFormState(initialState);
            setMode('login');
            setSuccessMessage(
              'Pedido enviado. Avise o administrador ou seu supervisor: depois que ele aprovar, entre com a nova senha.',
            );
          }
        } catch {
          setErrorMessage('Não foi possível enviar o pedido.');
        }
        setIsSubmitting(false);
        return;
      }

      setIsSubmitting(true);
      const result = isRegister
        ? await register(formState.username.trim(), formState.password)
        : await login(formState.username.trim(), formState.password);
      if (!result.success) {
        setErrorMessage(result.error);
      }
      setIsSubmitting(false);
    },
    [formState.confirmPassword, formState.password, formState.username, isRegister, isReset, login, register, t],
  );

  return (
    <AuthScreenLayout
      title={isRegister ? 'Criar conta' : isReset ? 'Esqueci minha senha' : t('login.title')}
      description={
        isRegister
          ? 'Crie sua conta. O administrador libera os projetos que você poderá acessar.'
          : isReset
            ? 'Escolha uma nova senha. Ela passa a valer depois que o administrador ou seu supervisor aprovar o pedido.'
            : t('login.description')
      }
      footerText={t('login.footerText')}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <AuthInputField
          id="username"
          label={t('login.username')}
          value={formState.username}
          onChange={(value) => updateField('username', value)}
          placeholder={t('login.placeholders.username')}
          isDisabled={isSubmitting}
          autoComplete="username"
          icon={User}
        />

        <AuthInputField
          id="password"
          label={isReset ? 'Nova senha' : t('login.password')}
          value={formState.password}
          onChange={(value) => updateField('password', value)}
          placeholder={t('login.placeholders.password')}
          isDisabled={isSubmitting}
          type="password"
          autoComplete={isRegister || isReset ? 'new-password' : 'current-password'}
          icon={Lock}
        />

        {isReset && (
          <AuthInputField
            id="confirmPassword"
            label="Repita a nova senha"
            value={formState.confirmPassword}
            onChange={(value) => updateField('confirmPassword', value)}
            placeholder="Digite a nova senha de novo"
            isDisabled={isSubmitting}
            type="password"
            autoComplete="new-password"
            icon={Lock}
          />
        )}

        {successMessage && (
          <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">
            {successMessage}
          </div>
        )}

        <AuthErrorAlert errorMessage={errorMessage || sessionError || ''} />

        <button
          type="submit"
          disabled={isSubmitting}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 font-medium text-primary-foreground shadow-lg shadow-primary/25 transition-all duration-200 hover:shadow-primary/30 hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:ring-offset-2 focus:ring-offset-card active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              {isRegister ? 'Criando conta...' : isReset ? 'Enviando pedido...' : t('login.loading')}
            </>
          ) : (
            isRegister ? 'Criar conta' : isReset ? 'Pedir nova senha' : t('login.submit')
          )}
        </button>

        <div className="pt-1 text-center text-sm text-muted-foreground">
          {isRegister || isReset ? (
            <button
              type="button"
              className="font-medium text-primary hover:underline"
              onClick={() => switchMode('login')}
            >
              {isReset ? 'Voltar para o login' : 'Já tem conta? Entrar'}
            </button>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <button
                type="button"
                className="font-medium text-primary hover:underline"
                onClick={() => switchMode('register')}
              >
                Não tem conta? Criar conta
              </button>
              <button
                type="button"
                className="text-xs text-muted-foreground hover:text-foreground hover:underline"
                onClick={() => switchMode('reset')}
              >
                Esqueci minha senha
              </button>
            </div>
          )}
        </div>
      </form>
    </AuthScreenLayout>
  );
}
