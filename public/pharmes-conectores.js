/*
 * Pharmes - painel de conectores para o Cloud CLI (claudecodeui).
 * Botao na barra superior (ao lado das abas) que abre um painel listando
 * os conectores disponiveis no servidor (Chat2Desk, Firebird, Supabase...).
 * Os dados vem de /pharmes-conectores.json - apenas nomes e descricoes,
 * nunca credenciais. Injetado por cima, sem alterar o codigo do app.
 */
(function () {
  'use strict';

  function montar() {
    if (document.getElementById('ph-con-btn')) return;

    var estilo = document.createElement('style');
    estilo.textContent = [
      '#ph-con-btn{width:30px;height:30px;border-radius:8px;border:1px solid hsl(var(--border));background:transparent;color:hsl(var(--foreground));cursor:pointer;font-size:15px;display:flex;align-items:center;justify-content:center;flex-shrink:0}',
      '#ph-con-btn:hover{background:hsl(var(--accent))}',
      '#ph-con-btn.ph-solto{position:fixed;right:16px;bottom:calc(70px + env(safe-area-inset-bottom,0px));z-index:2147483000;width:44px;height:44px;border-radius:50%;background:hsl(var(--card));box-shadow:0 6px 20px rgba(0,0,0,.3)}',
      '#ph-con-back{position:fixed;inset:0;z-index:2147483001;background:rgba(0,0,0,.5);opacity:0;pointer-events:none;transition:opacity .2s ease}',
      '#ph-con-back.on{opacity:1;pointer-events:auto}',
      '#ph-con-panel{position:fixed;top:0;right:0;z-index:2147483002;width:420px;max-width:94vw;height:100dvh;overflow-y:auto;background:hsl(var(--card));color:hsl(var(--card-foreground));border-left:1px solid hsl(var(--border));padding:20px;padding-bottom:calc(20px + env(safe-area-inset-bottom,0px));transform:translateX(100%);transition:transform .25s ease;font-family:inherit}',
      '#ph-con-panel.on{transform:translateX(0)}',
      '#ph-con-panel h2{font-size:20px;font-weight:700;margin:0}',
      '#ph-con-panel .top{display:flex;align-items:center;margin-bottom:6px}',
      '#ph-con-panel .x{margin-left:auto;background:none;border:none;color:hsl(var(--muted-foreground));font-size:24px;cursor:pointer;line-height:1}',
      '#ph-con-panel .sub{font-size:12px;color:hsl(var(--muted-foreground));margin-bottom:16px}',
      '#ph-con-panel .con{border:1px solid hsl(var(--border));border-radius:10px;padding:12px;margin-bottom:10px;background:hsl(var(--background))}',
      '#ph-con-panel .con .nm{font-weight:700;font-size:14px;margin-bottom:4px;display:flex;align-items:center;gap:8px}',
      '#ph-con-panel .con .ds{font-size:12.5px;line-height:1.5;color:hsl(var(--foreground));opacity:.9;margin-bottom:8px}',
      '#ph-con-panel .con .kv{font-size:11px;color:hsl(var(--muted-foreground));margin-top:2px}',
      '#ph-con-panel .con .kv b{color:hsl(var(--foreground));font-weight:600}',
      '#ph-con-panel .con .tags{display:flex;flex-wrap:wrap;gap:4px;margin-top:6px}',
      '#ph-con-panel .con .tag{font-size:10.5px;padding:2px 8px;border-radius:99px;background:hsl(var(--primary) / .12);color:hsl(var(--primary));border:1px solid hsl(var(--primary) / .25)}',
      '#ph-con-panel .rodape{font-size:11.5px;color:hsl(var(--muted-foreground));line-height:1.5;border-top:1px solid hsl(var(--border));padding-top:12px;margin-top:14px}',
      '#ph-con-panel .erro{font-size:13px;color:hsl(var(--destructive))}',
    ].join('');
    document.head.appendChild(estilo);

    var btn = document.createElement('button');
    btn.id = 'ph-con-btn';
    btn.title = 'Conectores disponiveis (bancos, WhatsApp, atendimento)';
    btn.innerHTML = '&#128268;'; // plugue

    var back = document.createElement('div');
    back.id = 'ph-con-back';

    var panel = document.createElement('div');
    panel.id = 'ph-con-panel';

    document.body.appendChild(back);
    document.body.appendChild(panel);

    function render(dados) {
      var html =
        '<div class="top"><h2>Conectores</h2><button class="x" data-x>&times;</button></div>' +
        '<div class="sub">O que este servidor sabe acessar. Atualizado em ' + (dados.atualizado_em || '?') +
        '. Só nomes e descrições — as senhas ficam no cofre (~/.secrets).</div>';
      (dados.conectores || []).forEach(function (c) {
        html += '<div class="con">' +
          '<div class="nm">' + c.nome + '</div>' +
          '<div class="ds">' + c.descricao + '</div>' +
          '<div class="kv"><b>Credencial:</b> ' + c.arquivo + '</div>' +
          '<div class="kv"><b>Variáveis:</b> ' + (c.variaveis || []).join(', ') + '</div>' +
          '<div class="tags">' + (c.usado_por || []).map(function (p) { return '<span class="tag">' + p + '</span>'; }).join('') + '</div>' +
          '</div>';
      });
      html += '<div class="rodape">' + (dados.nota_projetos || '') +
        '<br><br>Para usar um conector numa conversa, é só dizer: "use o conector X" — o Claude lê a credencial do cofre sozinho.</div>';
      panel.innerHTML = html;
    }

    function abrir() {
      panel.innerHTML = '<div class="top"><h2>Conectores</h2><button class="x" data-x>&times;</button></div><div class="sub">Carregando...</div>';
      back.classList.add('on');
      panel.classList.add('on');
      fetch('/pharmes-conectores.json', { cache: 'no-store' })
        .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
        .then(render)
        .catch(function (e) {
          panel.innerHTML = '<div class="top"><h2>Conectores</h2><button class="x" data-x>&times;</button></div>' +
            '<div class="erro">Não consegui carregar a lista (' + e.message + '). Peça ao Claude para regenerar o pharmes-conectores.json.</div>';
        });
    }
    function fechar() { back.classList.remove('on'); panel.classList.remove('on'); }

    btn.addEventListener('click', abrir);
    back.addEventListener('click', fechar);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') fechar(); });
    panel.addEventListener('click', function (e) { if (e.target.closest('[data-x]')) fechar(); });

    // Ancora o botao na barra superior, antes do botao de temas se ele ja
    // estiver la; flutua so quando nao ha cabecalho (ex: tela de login).
    function ancorar() {
      var linha = document.querySelector('.pwa-header-safe > .flex');
      if (linha) {
        if (btn.parentElement !== linha) linha.appendChild(btn);
        btn.classList.remove('ph-solto');
        // mantem ordem estavel: conectores antes do botao de temas
        var fab = document.getElementById('ph-fab');
        if (fab && fab.parentElement === linha && btn.nextElementSibling !== fab) {
          linha.insertBefore(btn, fab);
        }
      } else {
        if (btn.parentElement !== document.body) document.body.appendChild(btn);
        btn.classList.add('ph-solto');
      }
    }
    ancorar();
    var reancorando = false;
    new MutationObserver(function () {
      if (reancorando) return;
      reancorando = true;
      setTimeout(function () {
        reancorando = false;
        try { ancorar(); } catch (e) {}
      }, 300);
    }).observe(document.body, { childList: true, subtree: true });
  }

  if (document.body) montar();
  else document.addEventListener('DOMContentLoaded', montar);
})();
