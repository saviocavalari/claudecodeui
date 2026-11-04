// Link direto para um projeto: https://.../?projeto=<projectId ou caminho da pasta>.
// Usado pela Arvore de Sistemas. O parametro e guardado antes do login (a tela de login
// descartaria a URL) e consumido quando a lista de projetos carrega.
const CHAVE = 'cloudcli:abrir-projeto';

export function capturarProjetoDoLink(): void {
  try {
    const url = new URL(window.location.href);
    const projeto = url.searchParams.get('projeto');
    if (!projeto) return;
    sessionStorage.setItem(CHAVE, projeto);
    url.searchParams.delete('projeto');
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
  } catch {
    // sessionStorage indisponivel: o link apenas abre o Cloud CLI normalmente
  }
}

export function consumirProjetoDoLink(): string | null {
  try {
    const projeto = sessionStorage.getItem(CHAVE);
    if (projeto) sessionStorage.removeItem(CHAVE);
    return projeto;
  } catch {
    return null;
  }
}
