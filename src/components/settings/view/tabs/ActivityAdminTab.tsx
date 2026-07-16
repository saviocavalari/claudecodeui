import { useCallback, useEffect, useState } from 'react';
import {
  FolderInput,
  Loader2,
  LogIn,
  MessageSquare,
  RefreshCw,
  Terminal,
  Trash2,
  UserPlus,
} from 'lucide-react';

import { api } from '../../../../utils/api';
import { Button } from '../../../../shared/view/ui';

type ActivityEntry = {
  id: number;
  user_id: number | null;
  username: string | null;
  action: string;
  project_id: string | null;
  project_name: string | null;
  detail: string | null;
  created_at: string;
};

const ACTION_META: Record<string, { label: string; icon: typeof LogIn }> = {
  login: { label: 'Entrou', icon: LogIn },
  register: { label: 'Criou conta', icon: UserPlus },
  open_ai: { label: 'Abriu a IA', icon: MessageSquare },
  open_terminal: { label: 'Abriu terminal', icon: Terminal },
  delete_project: { label: 'Excluiu projeto', icon: Trash2 },
  archive_project: { label: 'Arquivou projeto', icon: FolderInput },
};

/**
 * Admin-only audit trail: recent security-relevant actions across all users.
 */
export default function ActivityAdminTab() {
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await api.admin.activity(200);
      if (!res.ok) throw new Error('Falha ao carregar a atividade.');
      const data = await res.json();
      setEntries(data.activity ?? []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Erro inesperado.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const formatWhen = (iso: string): string => {
    // SQLite stores UTC without a timezone marker; treat it as UTC.
    const normalized = iso.includes('T') ? iso : `${iso.replace(' ', 'T')}Z`;
    const date = new Date(normalized);
    if (Number.isNaN(date.getTime())) return iso;
    return date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Carregando atividade...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Atividade</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Quem entrou, abriu a IA ou o terminal, e em qual projeto. Mais recentes primeiro.
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

      {entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma atividade registrada ainda.</p>
      ) : (
        <div className="divide-y divide-border rounded-lg border border-border">
          {entries.map((entry) => {
            const meta = ACTION_META[entry.action] ?? { label: entry.action, icon: MessageSquare };
            const Icon = meta.icon;
            return (
              <div key={entry.id} className="flex items-center gap-3 px-3 py-2">
                <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-muted">
                  <Icon className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm text-foreground">
                    <span className="font-medium">{entry.username ?? 'usuário removido'}</span>
                    {' — '}
                    {meta.label}
                    {entry.project_name && (
                      <span className="text-muted-foreground"> · {entry.project_name}</span>
                    )}
                  </div>
                  {entry.detail && (
                    <div className="truncate text-xs text-muted-foreground/70">{entry.detail}</div>
                  )}
                </div>
                <div className="flex-shrink-0 text-xs text-muted-foreground">
                  {formatWhen(entry.created_at)}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
