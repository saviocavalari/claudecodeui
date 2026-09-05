#!/usr/bin/env bash
#
# Reports whether upstream (siteboon/claudecodeui) has released a version this
# fork has not merged yet, and how much work merging it would be.
#
# Read-only by design: it fetches, then does the merge entirely in git's object
# store via `git merge-tree`. The working tree, the index and the checked-out
# branch are never touched, so it is safe to run while someone is using the app.
#
# Writes a short report to REPORT_FILE, overwritten on each run.

set -uo pipefail

REPO_DIR="${REPO_DIR:-$HOME/apps/claudecodeui}"
REPORT_FILE="${REPORT_FILE:-$HOME/cloudcli-upstream-status.md}"

cd "$REPO_DIR" || {
    echo "Repositorio nao encontrado em $REPO_DIR" >&2
    exit 1
}

if ! git remote get-url upstream >/dev/null 2>&1; then
    echo "Remote 'upstream' nao configurado em $REPO_DIR" >&2
    exit 1
fi

git fetch upstream --tags --quiet || {
    echo "Falha ao buscar o upstream" >&2
    exit 1
}

now="$(date '+%d/%m/%Y as %H:%M')"
current_version="$(node -p "require('./package.json').version" 2>/dev/null || echo '?')"

# Newest upstream release tag, ignoring the parallel cloudcli-local-server-* series.
latest_tag="$(git tag --list 'v*' --sort=-creatordate | head -1)"

{
    echo "# Cloud CLI — situacao em relacao ao projeto de origem"
    echo
    echo "Verificado em $now."
    echo
    echo "| | |"
    echo "|---|---|"
    echo "| Versao rodando aqui | $current_version |"
    echo "| Ultima versao publicada la | ${latest_tag#v} |"
} > "$REPORT_FILE"

# Releases newer than the one this fork is on.
#
# Compared by version number rather than by git ancestry: upstream rewrote its
# history at some point, so old tags are not ancestors of this fork's main even
# though their content was merged long ago. The package.json version is the
# reliable marker of where this fork stands.
pending_tags=()
while IFS= read -r tag; do
    [ -z "$tag" ] && continue
    version="${tag#v}"
    # Keep the tag only when it sorts strictly above the running version.
    if [ "$version" != "$current_version" ] \
        && [ "$(printf '%s\n%s\n' "$current_version" "$version" | sort -V | tail -1)" = "$version" ]; then
        pending_tags+=("$tag")
    fi
done < <(git tag --list 'v*' --sort=creatordate)

if [ ${#pending_tags[@]} -eq 0 ]; then
    {
        echo "| Situacao | em dia |"
        echo
        echo "Nada a fazer: nenhuma versao nova desde a ultima atualizacao."
    } >> "$REPORT_FILE"
    exit 0
fi

{
    echo "| Situacao | ${#pending_tags[@]} versao(oes) pendente(s) |"
    echo
    echo "## Versoes ainda nao incorporadas"
    echo
    echo "| Versao | Conflitos previstos | Arquivos que mudam |"
    echo "|---|---|---|"
} >> "$REPORT_FILE"

for tag in "${pending_tags[@]}"; do
    # Dry-run merge in the object store only — nothing on disk changes.
    conflicts="$(git merge-tree --write-tree --name-only main "$tag" 2>/dev/null | grep -c '^CONFLICT' || true)"
    files="$(git diff --name-only "main..$tag" 2>/dev/null | wc -l | tr -d ' ')"
    echo "| ${tag#v} | $conflicts | $files |" >> "$REPORT_FILE"
done

# Effort estimate is driven by the first pending release: merging is done one
# release at a time, so that is the step that actually gets tackled next.
first_conflicts="$(git merge-tree --write-tree --name-only main "${pending_tags[0]}" 2>/dev/null | grep -c '^CONFLICT' || true)"

{
    echo
    echo "## O que isso significa"
    echo
    if [ "$first_conflicts" -eq 0 ]; then
        echo "A proxima versao (${pending_tags[0]#v}) entra sem conflito nenhum."
        echo "E uma atualizacao rapida — pedir ao Claude e coisa de poucos minutos."
    elif [ "$first_conflicts" -le 5 ]; then
        echo "A proxima versao (${pending_tags[0]#v}) tem $first_conflicts conflito(s):"
        echo "pouca coisa, resolve em menos de meia hora."
    elif [ "$first_conflicts" -le 20 ]; then
        echo "A proxima versao (${pending_tags[0]#v}) tem $first_conflicts conflitos:"
        echo "da uma ou duas horas de trabalho."
    else
        echo "A proxima versao (${pending_tags[0]#v}) tem $first_conflicts conflitos —"
        echo "e bastante coisa. Vale reservar meio periodo e fazer release por release."
    fi
    echo
    echo "Para atualizar, peca ao Claude: \"atualiza o Cloud CLI para a ${pending_tags[-1]#v}\"."
    echo "O merge e sempre feito em branch separada, com o main intacto como rollback."
} >> "$REPORT_FILE"
