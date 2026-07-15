import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, RefreshCw, ShieldCheck, Trash2, UserCog } from 'lucide-react';

import { api } from '../../../../utils/api';
import { Button } from '../../../../shared/view/ui';
import { useAuth } from '../../../auth/context/AuthContext';

type AdminUser = {
  id: number;
  username: string;
  created_at: string;
  last_login: string | null;
  is_active: boolean;
  role: 'admin' | 'member' | string;
  projectIds: 'all' | string[];
};

type AdminProject = {
  projectId: string;
  name: string;
  path: string;
};

/**
 * Admin-only panel: manage who can log in and which projects each member can
 * work on. A member only ever sees the projects checked here for them.
 */
export default function UsersAdminTab() {
  const { user: currentUser } = useAuth();
  const currentUserId = Number(currentUser?.id);

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [projects, setProjects] = useState<AdminProject[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingUserId, setSavingUserId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [usersRes, projectsRes] = await Promise.all([
        api.admin.users(),
        api.admin.projects(),
      ]);
      if (!usersRes.ok || !projectsRes.ok) {
        throw new Error('Falha ao carregar dados de administração.');
      }
      const usersData = await usersRes.json();
      const projectsData = await projectsRes.json();
      setUsers(usersData.users ?? []);
      setProjects(projectsData.projects ?? []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Erro inesperado.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const runAction = useCallback(
    async (userId: number, action: () => Promise<Response>) => {
      setSavingUserId(userId);
      setError(null);
      try {
        const res = await action();
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || 'Não foi possível salvar a alteração.');
        }
        await load();
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Erro inesperado.');
      } finally {
        setSavingUserId(null);
      }
    },
    [load],
  );

  const toggleProject = useCallback(
    (target: AdminUser, projectId: string) => {
      if (target.projectIds === 'all') return;
      const current = new Set(target.projectIds);
      if (current.has(projectId)) {
        current.delete(projectId);
      } else {
        current.add(projectId);
      }
      void runAction(target.id, () =>
        api.admin.setUserProjects(target.id, Array.from(current)),
      );
    },
    [runAction],
  );

  const members = useMemo(() => users.filter((u) => u.role !== 'admin'), [users]);
  const admins = useMemo(() => users.filter((u) => u.role === 'admin'), [users]);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Carregando usuários...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Usuários e acessos</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Qualquer pessoa pode se cadastrar, mas só vê os projetos que você liberar aqui.
            Marque abaixo quais projetos cada pessoa pode acessar.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()}>
          <RefreshCw className="h-4 w-4" />
          Atualizar
        </Button>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      {admins.length > 0 && (
        <section className="space-y-2">
          <h3 className="flex items-center gap-2 text-sm font-medium text-foreground">
            <ShieldCheck className="h-4 w-4" /> Administradores
          </h3>
          <div className="space-y-2">
            {admins.map((u) => (
              <div
                key={u.id}
                className="flex items-center justify-between rounded-lg border border-border bg-muted/20 px-3 py-2"
              >
                <div className="text-sm">
                  <span className="font-medium text-foreground">{u.username}</span>
                  {u.id === currentUserId && (
                    <span className="ml-2 text-xs text-muted-foreground">(você)</span>
                  )}
                  <div className="text-xs text-muted-foreground">Acesso total a todos os projetos</div>
                </div>
                {u.id !== currentUserId && (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={savingUserId === u.id}
                    onClick={() =>
                      void runAction(u.id, () => api.admin.setUserRole(u.id, 'member'))
                    }
                  >
                    <UserCog className="h-4 w-4" />
                    Tornar comum
                  </Button>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="space-y-3">
        <h3 className="text-sm font-medium text-foreground">
          Usuários comuns ({members.length})
        </h3>

        {members.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Ninguém se cadastrou ainda. Quando alguém criar uma conta, ela aparece aqui
            para você liberar os projetos.
          </p>
        )}

        {members.map((u) => {
          const granted = u.projectIds === 'all' ? new Set<string>() : new Set(u.projectIds);
          const isSaving = savingUserId === u.id;

          return (
            <div key={u.id} className="rounded-lg border border-border p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm">
                  <span className="font-medium text-foreground">{u.username}</span>
                  <span
                    className={
                      u.is_active
                        ? 'ml-2 text-xs text-emerald-600 dark:text-emerald-400'
                        : 'ml-2 text-xs text-amber-600 dark:text-amber-400'
                    }
                  >
                    {u.is_active ? 'ativo' : 'desativado'}
                  </span>
                  <div className="text-xs text-muted-foreground">
                    {granted.size} de {projects.length} projetos liberados
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {isSaving && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={isSaving}
                    onClick={() =>
                      void runAction(u.id, () => api.admin.setUserActive(u.id, !u.is_active))
                    }
                  >
                    {u.is_active ? 'Desativar' : 'Ativar'}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={isSaving}
                    onClick={() =>
                      void runAction(u.id, () => api.admin.setUserRole(u.id, 'admin'))
                    }
                    title="Promover a administrador (acesso total)"
                  >
                    <ShieldCheck className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={isSaving}
                    onClick={() => {
                      if (
                        window.confirm(
                          `Excluir a conta de "${u.username}"? Isso remove o acesso dela.`,
                        )
                      ) {
                        void runAction(u.id, () => api.admin.deleteUser(u.id));
                      }
                    }}
                    title="Excluir usuário"
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-1 gap-1 sm:grid-cols-2">
                {projects.map((p) => (
                  <label
                    key={p.projectId}
                    className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent/40"
                  >
                    <input
                      type="checkbox"
                      className="h-4 w-4 flex-shrink-0"
                      checked={granted.has(p.projectId)}
                      disabled={isSaving}
                      onChange={() => toggleProject(u, p.projectId)}
                    />
                    <span className="truncate text-foreground" title={p.path}>
                      {p.name}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          );
        })}
      </section>
    </div>
  );
}
