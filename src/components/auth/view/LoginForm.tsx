import { useCallback, useState } from 'react';
import type { FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Lock, User } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import AuthErrorAlert from './AuthErrorAlert';
import AuthInputField from './AuthInputField';
import AuthScreenLayout from './AuthScreenLayout';

type LoginFormState = {
  username: string;
  password: string;
};

const initialState: LoginFormState = {
  username: '',
  password: '',
};

/**
 * Login form component.
 * Handles credential input with browser autofill support (`autocomplete`
 * attributes) so that password managers can offer to fill saved credentials.
 */
export default function LoginForm() {
  const { t } = useTranslation('auth');
  const { login, register } = useAuth();

  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [formState, setFormState] = useState<LoginFormState>(initialState);
  const [errorMessage, setErrorMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isRegister = mode === 'register';

  const updateField = useCallback((field: keyof LoginFormState, value: string) => {
    setFormState((previous) => ({ ...previous, [field]: value }));
  }, []);

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setErrorMessage('');

      // Keep form validation local so each auth screen owns its own UI feedback.
      if (!formState.username.trim() || !formState.password) {
        setErrorMessage(t('login.errors.requiredFields'));
        return;
      }

      if (isRegister && formState.password.length < 6) {
        setErrorMessage('A senha precisa ter pelo menos 6 caracteres.');
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
    [formState.password, formState.username, isRegister, login, register, t],
  );

  return (
    <AuthScreenLayout
      title={isRegister ? 'Criar conta' : t('login.title')}
      description={
        isRegister
          ? 'Crie sua conta. O administrador libera os projetos que você poderá acessar.'
          : t('login.description')
      }
      footerText="Enter your credentials to access CloudCLI"
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
          label={t('login.password')}
          value={formState.password}
          onChange={(value) => updateField('password', value)}
          placeholder={t('login.placeholders.password')}
          isDisabled={isSubmitting}
          type="password"
          autoComplete={isRegister ? 'new-password' : 'current-password'}
          icon={Lock}
        />

        <AuthErrorAlert errorMessage={errorMessage} />

        <button
          type="submit"
          disabled={isSubmitting}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 font-medium text-primary-foreground shadow-lg shadow-primary/25 transition-all duration-200 hover:brightness-110 hover:shadow-primary/30 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:ring-offset-2 focus:ring-offset-card active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              {isRegister ? 'Criando conta...' : t('login.loading')}
            </>
          ) : (
            isRegister ? 'Criar conta' : t('login.submit')
          )}
        </button>

        <div className="pt-1 text-center text-sm text-muted-foreground">
          {isRegister ? (
            <button
              type="button"
              className="font-medium text-primary hover:underline"
              onClick={() => {
                setMode('login');
                setErrorMessage('');
              }}
            >
              Já tem conta? Entrar
            </button>
          ) : (
            <button
              type="button"
              className="font-medium text-primary hover:underline"
              onClick={() => {
                setMode('register');
                setErrorMessage('');
              }}
            >
              Não tem conta? Criar conta
            </button>
          )}
        </div>
      </form>
    </AuthScreenLayout>
  );
}
