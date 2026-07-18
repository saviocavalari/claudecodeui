/* Inventario seguro de secrets: mostra somente arquivos e nomes de variaveis. */
(function () {
  'use strict';

  function montar() {
    if (document.getElementById('ph-sec-btn')) return;

    var style = document.createElement('style');
    style.textContent = [
      '#ph-sec-btn{width:30px;height:30px;border-radius:8px;border:1px solid hsl(var(--border));background:transparent;color:hsl(var(--foreground));cursor:pointer;font-size:15px;display:flex;align-items:center;justify-content:center;flex-shrink:0}',
      '#ph-sec-btn:hover{background:hsl(var(--accent))}',
      '#ph-sec-btn.ph-solto{position:fixed;right:70px;bottom:calc(70px + env(safe-area-inset-bottom,0px));z-index:2147483000;width:44px;height:44px;border-radius:50%;background:hsl(var(--card));box-shadow:0 6px 20px rgba(0,0,0,.3)}',
      '#ph-sec-back{position:fixed;inset:0;z-index:2147483001;background:rgba(0,0,0,.5);opacity:0;pointer-events:none;transition:opacity .2s ease}',
      '#ph-sec-back.on{opacity:1;pointer-events:auto}',
      '#ph-sec-panel{position:fixed;top:0;right:0;z-index:2147483002;width:460px;max-width:94vw;height:100dvh;overflow-y:auto;background:hsl(var(--card));color:hsl(var(--card-foreground));border-left:1px solid hsl(var(--border));padding:20px;padding-bottom:calc(20px + env(safe-area-inset-bottom,0px));transform:translateX(100%);transition:transform .25s ease;font-family:inherit}',
      '#ph-sec-panel.on{transform:translateX(0)}',
      '#ph-sec-panel .top{display:flex;align-items:center;gap:10px;margin-bottom:5px}',
      '#ph-sec-panel h2{font-size:20px;font-weight:700;margin:0}',
      '#ph-sec-panel .x{margin-left:auto;background:none;border:none;color:hsl(var(--muted-foreground));font-size:24px;cursor:pointer}',
      '#ph-sec-panel .sub{font-size:12px;line-height:1.5;color:hsl(var(--muted-foreground));margin-bottom:14px}',
      '#ph-sec-panel .summary{display:flex;gap:8px;margin-bottom:14px}',
      '#ph-sec-panel .count{flex:1;border:1px solid hsl(var(--border));border-radius:10px;padding:9px;background:hsl(var(--background));text-align:center;font-size:11px;color:hsl(var(--muted-foreground))}',
      '#ph-sec-panel .count b{display:block;font-size:18px;color:hsl(var(--foreground))}',
      '#ph-sec-panel .project{border:1px solid hsl(var(--border));border-radius:12px;margin-bottom:10px;overflow:hidden;background:hsl(var(--background))}',
      '#ph-sec-panel .pname{font-size:13px;font-weight:700;padding:11px 12px;background:hsl(var(--primary)/.09);border-bottom:1px solid hsl(var(--border));display:flex;justify-content:space-between}',
      '#ph-sec-panel .file{padding:10px 12px;border-bottom:1px solid hsl(var(--border)/.65)}',
      '#ph-sec-panel .file:last-child{border-bottom:0}',
      '#ph-sec-panel .fname{font:600 11px ui-monospace,monospace;color:hsl(var(--muted-foreground));margin-bottom:7px}',
      '#ph-sec-panel .vars{display:flex;flex-wrap:wrap;gap:5px}',
      '#ph-sec-panel .var{font:500 10px ui-monospace,monospace;padding:3px 7px;border-radius:99px;background:hsl(var(--primary)/.11);color:hsl(var(--primary));border:1px solid hsl(var(--primary)/.22)}',
      '#ph-sec-panel .empty,#ph-sec-panel .erro{font-size:13px;padding:16px;border:1px solid hsl(var(--border));border-radius:10px}',
      '#ph-sec-panel .erro{color:hsl(var(--destructive))}',
    ].join('');
    document.head.appendChild(style);

    var btn = document.createElement('button');
    btn.id = 'ph-sec-btn';
    btn.title = 'Secrets dos projetos (somente nomes, valores protegidos)';
    btn.innerHTML = '&#128272;';
    var back = document.createElement('div');
    back.id = 'ph-sec-back';
    var panel = document.createElement('div');
    panel.id = 'ph-sec-panel';
    document.body.appendChild(back);
    document.body.appendChild(panel);

    function esc(value) {
      return String(value).replace(/[&<>"']/g, function (char) {
        return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char];
      });
    }

    function render(data) {
      var html = '<div class="top"><span>🔐</span><h2>Secrets</h2><button class="x" data-x>&times;</button></div>' +
        '<div class="sub">Inventário de <b>' + esc(data.root) + '</b>. Por segurança, os valores nunca são enviados ao navegador.</div>' +
        '<div class="summary"><div class="count"><b>' + data.projects.length + '</b>projetos</div>' +
        '<div class="count"><b>' + data.totalFiles + '</b>arquivos</div>' +
        '<div class="count"><b>' + data.totalVariables + '</b>variáveis</div></div>';
      if (!data.projects.length) html += '<div class="empty">Nenhum secret de projeto encontrado.</div>';
      data.projects.forEach(function (project) {
        var variableCount = project.files.reduce(function (sum, file) { return sum + file.variables.length; }, 0);
        html += '<section class="project"><div class="pname"><span>' + esc(project.name) + '</span><span>' + variableCount + '</span></div>';
        project.files.forEach(function (file) {
          html += '<div class="file"><div class="fname">' + esc(file.relativePath) + '</div><div class="vars">' +
            (file.variables.length ? file.variables.map(function (name) { return '<span class="var">' + esc(name) + '</span>'; }).join('') : '<span class="sub">Arquivo sem variáveis detectáveis</span>') +
            '</div></div>';
        });
        html += '</section>';
      });
      panel.innerHTML = html;
    }

    function abrir() {
      panel.innerHTML = '<div class="top"><span>🔐</span><h2>Secrets</h2><button class="x" data-x>&times;</button></div><div class="sub">Carregando inventário seguro...</div>';
      back.classList.add('on');
      panel.classList.add('on');
      var token = localStorage.getItem('auth-token');
      fetch('/api/system/secrets', { cache: 'no-store', headers: token ? { Authorization: 'Bearer ' + token } : {} })
        .then(function (response) {
          if (!response.ok) throw new Error(response.status === 403 ? 'acesso exclusivo do administrador' : 'HTTP ' + response.status);
          var contentType = response.headers.get('content-type') || '';
          if (!contentType.includes('application/json')) {
            throw new Error('o servidor ainda não foi reiniciado após a atualização');
          }
          return response.json();
        })
        .then(render)
        .catch(function (error) { panel.innerHTML = '<div class="top"><span>🔐</span><h2>Secrets</h2><button class="x" data-x>&times;</button></div><div class="erro">Não foi possível carregar: ' + esc(error.message) + '.</div>'; });
    }
    function fechar() { back.classList.remove('on'); panel.classList.remove('on'); }
    btn.addEventListener('click', abrir);
    back.addEventListener('click', fechar);
    panel.addEventListener('click', function (event) { if (event.target.closest('[data-x]')) fechar(); });
    document.addEventListener('keydown', function (event) { if (event.key === 'Escape') fechar(); });

    function ancorar() {
      var row = document.querySelector('.pwa-header-safe > .flex');
      if (row) {
        if (btn.parentElement !== row) row.appendChild(btn);
        btn.classList.remove('ph-solto');
        var themeButton = document.getElementById('ph-fab');
        if (themeButton && themeButton.parentElement === row && btn.nextElementSibling !== themeButton) {
          row.insertBefore(btn, themeButton);
        }
      } else {
        if (btn.parentElement !== document.body) document.body.appendChild(btn);
        btn.classList.add('ph-solto');
      }
    }
    ancorar();
    var anchoring = false;
    new MutationObserver(function () {
      if (anchoring) return;
      anchoring = true;
      setTimeout(function () { anchoring = false; ancorar(); }, 300);
    }).observe(document.body, { childList: true, subtree: true });
  }

  if (document.body) montar();
  else document.addEventListener('DOMContentLoaded', montar);
})();
