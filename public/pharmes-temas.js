/*
 * Pharmes - seletor de aparencia para o chat (claudecodeui / CloudCLI).
 * Adiciona temas de cor, fontes e tamanhos de texto sobre o app, sem alterar
 * o codigo dele. Aplica variaveis CSS (padrao shadcn/ui em HSL) via um seletor
 * de atributo com prioridade sobre :root e .dark. Persiste no navegador.
 *
 * Servido como arquivo estatico (public/) e injetado no index.html.
 */
(function () {
  'use strict';

  // Cada tema define o conjunto completo de variaveis (formato HSL "H S% L%").
  // escuro=true sincroniza a classe .dark do app (para detalhes que dependem dela).
  var TEMAS = {
    pharmes: {
      nome: 'Pharmes Escuro', escuro: true, primaria: '160 84% 39%',
      vars: {
        '--background': '220 40% 7%', '--foreground': '210 20% 90%',
        '--card': '220 33% 11%', '--card-foreground': '210 20% 90%',
        '--popover': '220 33% 11%', '--popover-foreground': '210 20% 90%',
        '--primary': '160 84% 39%', '--primary-foreground': '160 60% 7%',
        '--secondary': '220 25% 16%', '--secondary-foreground': '210 20% 90%',
        '--muted': '220 25% 16%', '--muted-foreground': '215 15% 62%',
        '--accent': '220 25% 18%', '--accent-foreground': '210 20% 92%',
        '--destructive': '0 70% 45%', '--destructive-foreground': '210 40% 98%',
        '--border': '220 25% 18%', '--input': '220 25% 22%', '--ring': '160 84% 39%',
      },
    },
    meianoite: {
      nome: 'Meia-noite', escuro: true, primaria: '239 84% 70%',
      vars: {
        '--background': '240 30% 9%', '--foreground': '240 15% 92%',
        '--card': '240 28% 13%', '--card-foreground': '240 15% 92%',
        '--popover': '240 28% 13%', '--popover-foreground': '240 15% 92%',
        '--primary': '239 84% 70%', '--primary-foreground': '240 40% 10%',
        '--secondary': '240 22% 18%', '--secondary-foreground': '240 15% 92%',
        '--muted': '240 22% 18%', '--muted-foreground': '240 12% 65%',
        '--accent': '240 22% 20%', '--accent-foreground': '240 15% 94%',
        '--destructive': '0 70% 45%', '--destructive-foreground': '210 40% 98%',
        '--border': '240 22% 20%', '--input': '240 22% 24%', '--ring': '239 84% 70%',
      },
    },
    grafite: {
      nome: 'Grafite Ambar', escuro: true, primaria: '38 92% 50%',
      vars: {
        '--background': '0 0% 8%', '--foreground': '40 8% 93%',
        '--card': '0 0% 12%', '--card-foreground': '40 8% 93%',
        '--popover': '0 0% 12%', '--popover-foreground': '40 8% 93%',
        '--primary': '38 92% 50%', '--primary-foreground': '40 60% 8%',
        '--secondary': '0 0% 17%', '--secondary-foreground': '40 8% 93%',
        '--muted': '0 0% 17%', '--muted-foreground': '0 0% 62%',
        '--accent': '0 0% 19%', '--accent-foreground': '40 8% 95%',
        '--destructive': '0 70% 45%', '--destructive-foreground': '40 8% 96%',
        '--border': '0 0% 19%', '--input': '0 0% 23%', '--ring': '38 92% 50%',
      },
    },
    oceano: {
      nome: 'Oceano', escuro: true, primaria: '187 85% 53%',
      vars: {
        '--background': '190 50% 7%', '--foreground': '185 25% 90%',
        '--card': '188 40% 11%', '--card-foreground': '185 25% 90%',
        '--popover': '188 40% 11%', '--popover-foreground': '185 25% 90%',
        '--primary': '187 85% 53%', '--primary-foreground': '190 60% 8%',
        '--secondary': '189 30% 16%', '--secondary-foreground': '185 25% 90%',
        '--muted': '189 30% 16%', '--muted-foreground': '186 18% 62%',
        '--accent': '189 30% 18%', '--accent-foreground': '185 25% 92%',
        '--destructive': '0 70% 45%', '--destructive-foreground': '185 25% 95%',
        '--border': '189 30% 18%', '--input': '189 30% 22%', '--ring': '187 85% 53%',
      },
    },
    nebulosa: {
      nome: 'Nebulosa', escuro: true, primaria: '292 84% 61%',
      vars: {
        '--background': '270 30% 9%', '--foreground': '280 20% 92%',
        '--card': '268 28% 14%', '--card-foreground': '280 20% 92%',
        '--popover': '268 28% 14%', '--popover-foreground': '280 20% 92%',
        '--primary': '292 84% 61%', '--primary-foreground': '292 50% 10%',
        '--secondary': '270 24% 19%', '--secondary-foreground': '280 20% 92%',
        '--muted': '270 24% 19%', '--muted-foreground': '275 15% 65%',
        '--accent': '270 24% 21%', '--accent-foreground': '280 20% 94%',
        '--destructive': '0 70% 45%', '--destructive-foreground': '280 20% 95%',
        '--border': '270 24% 21%', '--input': '270 24% 25%', '--ring': '292 84% 61%',
      },
    },
    claro: {
      nome: 'Claro', escuro: false, primaria: '173 80% 36%',
      vars: {
        '--background': '210 20% 98%', '--foreground': '220 25% 12%',
        '--card': '0 0% 100%', '--card-foreground': '220 25% 12%',
        '--popover': '0 0% 100%', '--popover-foreground': '220 25% 12%',
        '--primary': '173 80% 36%', '--primary-foreground': '0 0% 100%',
        '--secondary': '210 16% 93%', '--secondary-foreground': '220 20% 20%',
        '--muted': '210 16% 93%', '--muted-foreground': '215 12% 45%',
        '--accent': '210 16% 90%', '--accent-foreground': '220 20% 18%',
        '--destructive': '0 72% 51%', '--destructive-foreground': '0 0% 100%',
        '--border': '214 15% 88%', '--input': '214 15% 88%', '--ring': '173 80% 36%',
      },
    },
    neve: {
      nome: 'Neve Azul', escuro: false, primaria: '217 91% 60%',
      vars: {
        '--background': '214 45% 97%', '--foreground': '222 35% 14%',
        '--card': '0 0% 100%', '--card-foreground': '222 35% 14%',
        '--popover': '0 0% 100%', '--popover-foreground': '222 35% 14%',
        '--primary': '217 91% 60%', '--primary-foreground': '0 0% 100%',
        '--secondary': '214 32% 92%', '--secondary-foreground': '222 30% 22%',
        '--muted': '214 30% 93%', '--muted-foreground': '215 16% 43%',
        '--accent': '213 38% 89%', '--accent-foreground': '222 32% 18%',
        '--destructive': '0 72% 51%', '--destructive-foreground': '0 0% 100%',
        '--border': '214 24% 86%', '--input': '214 24% 86%', '--ring': '217 91% 60%',
      },
    },
    areia: {
      nome: 'Areia', escuro: false, primaria: '25 78% 45%',
      vars: {
        '--background': '42 45% 96%', '--foreground': '30 22% 16%',
        '--card': '45 55% 99%', '--card-foreground': '30 22% 16%',
        '--popover': '45 55% 99%', '--popover-foreground': '30 22% 16%',
        '--primary': '25 78% 45%', '--primary-foreground': '45 60% 98%',
        '--secondary': '39 32% 90%', '--secondary-foreground': '30 22% 22%',
        '--muted': '39 28% 91%', '--muted-foreground': '30 12% 43%',
        '--accent': '35 35% 87%', '--accent-foreground': '28 25% 18%',
        '--destructive': '0 68% 48%', '--destructive-foreground': '0 0% 100%',
        '--border': '36 24% 83%', '--input': '36 24% 83%', '--ring': '25 78% 45%',
      },
    },
    menta: {
      nome: 'Menta', escuro: false, primaria: '158 64% 38%',
      vars: {
        '--background': '150 30% 97%', '--foreground': '164 28% 13%',
        '--card': '0 0% 100%', '--card-foreground': '164 28% 13%',
        '--popover': '0 0% 100%', '--popover-foreground': '164 28% 13%',
        '--primary': '158 64% 38%', '--primary-foreground': '0 0% 100%',
        '--secondary': '151 24% 91%', '--secondary-foreground': '164 25% 20%',
        '--muted': '151 22% 92%', '--muted-foreground': '160 12% 42%',
        '--accent': '151 30% 87%', '--accent-foreground': '164 28% 17%',
        '--destructive': '0 72% 51%', '--destructive-foreground': '0 0% 100%',
        '--border': '152 20% 84%', '--input': '152 20% 84%', '--ring': '158 64% 38%',
      },
    },
    lavanda: {
      nome: 'Lavanda', escuro: false, primaria: '263 70% 58%',
      vars: {
        '--background': '270 38% 97%', '--foreground': '260 28% 15%',
        '--card': '0 0% 100%', '--card-foreground': '260 28% 15%',
        '--popover': '0 0% 100%', '--popover-foreground': '260 28% 15%',
        '--primary': '263 70% 58%', '--primary-foreground': '0 0% 100%',
        '--secondary': '267 28% 92%', '--secondary-foreground': '260 25% 22%',
        '--muted': '267 25% 93%', '--muted-foreground': '260 12% 44%',
        '--accent': '267 34% 89%', '--accent-foreground': '260 28% 18%',
        '--destructive': '0 72% 51%', '--destructive-foreground': '0 0% 100%',
        '--border': '266 22% 86%', '--input': '266 22% 86%', '--ring': '263 70% 58%',
      },
    },
  };

  var FONTES = {
    padrao: { nome: 'Padrao do app', amostra: 'Encode Sans (original)', valor: '' },
    inter: { nome: 'Inter', amostra: 'Limpa e neutra', valor: '"Inter", sans-serif' },
    grotesk: { nome: 'Space Grotesk', amostra: 'Moderna, com personalidade', valor: '"Space Grotesk", sans-serif' },
    plex: { nome: 'IBM Plex Sans', amostra: 'Tecnica e corporativa', valor: '"IBM Plex Sans", sans-serif' },
    sistema: { nome: 'Sistema', amostra: 'A fonte nativa do seu aparelho', valor: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' },
  };

  var TAMANHOS = {
    compacto: { cap: 'Compacto', px: '14px' },
    padrao: { cap: 'Padrao', px: '16px' },
    grande: { cap: 'Grande', px: '17.5px' },
    enorme: { cap: 'Enorme', px: '19px' },
  };

  var SKINS = {
    padrao: { nome: 'Padrao', amostra: 'Visual original do sistema' },
    minimalista: { nome: 'Minimalista', amostra: 'Sem sombras e com linhas limpas' },
    glass: { nome: 'Glass', amostra: 'Transparencia e efeito de vidro' },
    compacta: { nome: 'Compacta', amostra: 'Mais conteudo em menos espaco' },
    terminal: { nome: 'Terminal', amostra: 'Visual tecnico e quadrado' },
    neon: { nome: 'Neon', amostra: 'Contornos luminosos e contraste' },
  };

  var PADRAO = { tema: 'pharmes', skin: 'padrao', fonte: 'padrao', tamanho: 'padrao' };

  function carregar() {
    try { return Object.assign({}, PADRAO, JSON.parse(localStorage.getItem('pharmesAparencia') || '{}')); }
    catch (e) { return Object.assign({}, PADRAO); }
  }
  function salvar(p) { try { localStorage.setItem('pharmesAparencia', JSON.stringify(p)); } catch (e) {} }

  // Injeta as regras de tema como um <style>, uma vez.
  function garantirEstilos() {
    if (document.getElementById('pharmes-tema-style')) return;
    var css = '';
    Object.keys(TEMAS).forEach(function (id) {
      var t = TEMAS[id];
      var linhas = Object.keys(t.vars).map(function (k) { return k + ':' + t.vars[k] + ';'; }).join('');
      // nav tokens derivados da cor primaria, para a barra combinar
      linhas += '--nav-tab-glow:' + t.primaria + ' / 0.22;';
      linhas += '--nav-tab-ring:' + t.primaria + ' / 0.14;';
      linhas += '--nav-input-focus-ring:' + t.primaria + ' / 0.22;';
      linhas += '--ring:' + t.vars['--ring'] + ';';
      css += 'html[data-ptema="' + id + '"]{' + linhas + '}\n';
    });
    css += [
      'html[data-pskin="minimalista"]{--radius:0rem}',
      'html[data-pskin="minimalista"] *{box-shadow:none!important;text-shadow:none!important}',
      'html[data-pskin="minimalista"] button,html[data-pskin="minimalista"] [class*="rounded"]{border-radius:0!important}',
      'html[data-pskin="minimalista"] [class*="bg-card"]{background:hsl(var(--background))!important}',
      'html[data-pskin="minimalista"] [class*="border"]{border-color:hsl(var(--border)/.55)!important}',
      'html[data-pskin="minimalista"] button:hover{background:hsl(var(--foreground)/.045)!important}',

      'html[data-pskin="glass"]{--radius:1.25rem}',
      'html[data-pskin="glass"] body{background:radial-gradient(circle at 12% 8%,hsl(var(--primary)/.25),transparent 34%),radial-gradient(circle at 88% 92%,hsl(var(--ring)/.18),transparent 38%),linear-gradient(145deg,hsl(var(--background)),hsl(var(--muted)))}',
      'html[data-pskin="glass"] #root{background:transparent}',
      'html[data-pskin="glass"] [class*="bg-card"],html[data-pskin="glass"] [class*="bg-background"]{background:hsl(var(--card)/.58)!important;backdrop-filter:blur(28px) saturate(1.65);-webkit-backdrop-filter:blur(28px) saturate(1.65);border-color:hsl(0 0% 100%/.28)!important}',
      'html[data-pskin="glass"] [class*="backdrop-blur"]{backdrop-filter:blur(32px) saturate(1.7)!important;-webkit-backdrop-filter:blur(32px) saturate(1.7)!important}',
      'html[data-pskin="glass"] button,html[data-pskin="glass"] input,html[data-pskin="glass"] textarea,html[data-pskin="glass"] select{border-radius:999px!important;box-shadow:inset 0 1px 0 hsl(0 0% 100%/.28),0 4px 16px hsl(var(--foreground)/.08)!important}',
      'html[data-pskin="glass"] [class*="rounded-lg"],html[data-pskin="glass"] [class*="rounded-xl"]{border-radius:20px!important}',
      'html[data-pskin="glass"] [class*="shadow"]{box-shadow:0 18px 55px hsl(var(--foreground)/.12),inset 0 1px 0 hsl(0 0% 100%/.22)!important}',
      'html[data-pskin="glass"] button:hover{transform:translateY(-1px);filter:brightness(1.05)}',

      'html[data-pskin="compacta"]{--radius:.25rem}',
      'html[data-pskin="compacta"] button{min-height:unset}',
      'html[data-pskin="compacta"] [class*="py-"]{padding-top:.35rem!important;padding-bottom:.35rem!important}',
      'html[data-pskin="compacta"] [class*="px-4"],html[data-pskin="compacta"] [class*="p-4"]{padding-left:.55rem!important;padding-right:.55rem!important}',
      'html[data-pskin="compacta"] [class*="gap-3"],html[data-pskin="compacta"] [class*="gap-4"]{gap:.4rem!important}',
      '@media(min-width:768px){html[data-pskin="compacta"] [class~="md:w-72"]{width:15rem!important}}',

      'html[data-pskin="terminal"]{--radius:0rem}',
      'html[data-pskin="terminal"] body{font-family:"IBM Plex Mono","Courier New",monospace!important;background-image:repeating-linear-gradient(0deg,hsl(var(--foreground)/.025) 0,hsl(var(--foreground)/.025) 1px,transparent 1px,transparent 4px)}',
      'html[data-pskin="terminal"] button,html[data-pskin="terminal"] input,html[data-pskin="terminal"] textarea,html[data-pskin="terminal"] select,html[data-pskin="terminal"] [class*="rounded"]{border-radius:0!important}',
      'html[data-pskin="terminal"] *{box-shadow:none!important}',
      'html[data-pskin="terminal"] button{text-transform:uppercase;letter-spacing:.06em}',
      'html[data-pskin="terminal"] [class*="border"]{border-style:dashed!important;border-color:hsl(var(--primary)/.55)!important}',
      'html[data-pskin="terminal"] input:focus,html[data-pskin="terminal"] textarea:focus{outline:1px solid hsl(var(--primary))!important}',

      'html[data-pskin="neon"]{--radius:.8rem}',
      'html[data-pskin="neon"] body{background:radial-gradient(circle at 50% -20%,hsl(var(--primary)/.2),transparent 48%),hsl(var(--background))}',
      'html[data-pskin="neon"] button,html[data-pskin="neon"] input,html[data-pskin="neon"] textarea,html[data-pskin="neon"] [class*="border"]{border-color:hsl(var(--primary)/.62)!important}',
      'html[data-pskin="neon"] [class*="bg-card"]{background:linear-gradient(145deg,hsl(var(--card)),hsl(var(--primary)/.06))!important}',
      'html[data-pskin="neon"] button:hover,html[data-pskin="neon"] [class*="shadow"]{box-shadow:0 0 8px hsl(var(--primary)/.32),0 0 24px hsl(var(--primary)/.2)!important}',
      'html[data-pskin="neon"] input:focus,html[data-pskin="neon"] textarea:focus{box-shadow:0 0 0 2px hsl(var(--primary)/.3),0 0 22px hsl(var(--primary)/.28)!important}',
    ].join('\n');
    var st = document.createElement('style');
    st.id = 'pharmes-tema-style';
    st.textContent = css;
    document.head.appendChild(st);

    // Carrega as fontes do Google (uma vez).
    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@400;500;600;700&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap';
    document.head.appendChild(link);
  }

  // Cores + tamanho: nao dependem do <body>, aplicaveis ja no <head> (sem flash).
  function aplicarCores(p) {
    garantirEstilos();
    var raiz = document.documentElement;
    var tema = TEMAS[p.tema] || TEMAS.pharmes;
    raiz.setAttribute('data-ptema', p.tema);
    raiz.setAttribute('data-pskin', SKINS[p.skin] ? p.skin : 'padrao');
    if (tema.escuro) { raiz.classList.add('dark'); try { localStorage.setItem('theme', 'dark'); } catch (e) {} }
    else { raiz.classList.remove('dark'); try { localStorage.setItem('theme', 'light'); } catch (e) {} }
    raiz.style.colorScheme = tema.escuro ? 'dark' : 'light';
    raiz.style.fontSize = (TAMANHOS[p.tamanho] || TAMANHOS.padrao).px;
  }
  // Fonte: aplicada no body (herda); elementos com font mono nao sao afetados.
  function aplicarFonte(p) {
    if (document.body) document.body.style.fontFamily = (FONTES[p.fonte] || FONTES.padrao).valor;
  }
  function aplicar(p) { aplicarCores(p); aplicarFonte(p); }

  var pref = carregar();
  // aplica as cores o mais cedo possivel (o <head> ja existe quando este script roda)
  function bootApply() { try { aplicar(pref); } catch (e) {} }
  try { aplicarCores(pref); } catch (e) {}
  if (document.body) bootApply(); else document.addEventListener('DOMContentLoaded', bootApply);

  // Reaplica se o app mexer na classe .dark ou re-renderizar (mantem o tema fixo).
  var reforcando = false;
  function observar() {
    var obs = new MutationObserver(function () {
      if (reforcando) return;
      var tema = TEMAS[pref.tema] || TEMAS.pharmes;
      var raiz = document.documentElement;
      var precisaDark = tema.escuro && !raiz.classList.contains('dark');
      var sobrando = !tema.escuro && raiz.classList.contains('dark');
      var semAttr = raiz.getAttribute('data-ptema') !== pref.tema;
      if (precisaDark || sobrando || semAttr) {
        reforcando = true;
        aplicar(pref);
        reforcando = false;
      }
    });
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-ptema'] });
  }

  // ---------- botao flutuante + painel ----------

  function montarUI() {
    var estilo = document.createElement('style');
    estilo.textContent = [
      '#ph-fab{position:fixed;right:16px;bottom:calc(16px + env(safe-area-inset-bottom,0px));z-index:2147483000;width:44px;height:44px;border-radius:50%;border:1px solid hsl(var(--border));background:hsl(var(--card));color:hsl(var(--foreground));cursor:pointer;box-shadow:0 6px 20px rgba(0,0,0,.3);font-size:20px;display:flex;align-items:center;justify-content:center;transition:transform .15s ease}',
      '#ph-fab:hover{transform:scale(1.08)}',
      /* ancorado na barra superior: vira um botao comum ao lado das abas */
      '#ph-fab.ph-dock{position:static;width:30px;height:30px;border-radius:8px;box-shadow:none;font-size:15px;flex-shrink:0;background:transparent;border-color:hsl(var(--border))}',
      '#ph-fab.ph-dock:hover{transform:none;background:hsl(var(--accent))}',
      '#ph-back{position:fixed;inset:0;z-index:2147483001;background:rgba(0,0,0,.5);opacity:0;pointer-events:none;transition:opacity .2s ease}',
      '#ph-back.on{opacity:1;pointer-events:auto}',
      '#ph-panel{position:fixed;top:0;right:0;z-index:2147483002;width:360px;max-width:92vw;height:100vh;overflow-y:auto;background:hsl(var(--card));color:hsl(var(--card-foreground));border-left:1px solid hsl(var(--border));padding:20px;transform:translateX(100%);transition:transform .25s ease;font-family:inherit}',
      '#ph-panel.on{transform:translateX(0)}',
      '#ph-panel h2{font-size:20px;font-weight:700;margin:0}',
      '#ph-panel .top{display:flex;align-items:center;margin-bottom:20px}',
      '#ph-panel .x{margin-left:auto;background:none;border:none;color:hsl(var(--muted-foreground));font-size:24px;cursor:pointer;line-height:1}',
      '#ph-panel .g{margin-bottom:26px}',
      '#ph-panel .lab{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.1em;color:hsl(var(--muted-foreground));margin-bottom:10px;display:block}',
      '#ph-panel .temas{display:grid;grid-template-columns:1fr 1fr;gap:8px}',
      '#ph-panel .tema{border:2px solid hsl(var(--border));border-radius:10px;padding:8px;cursor:pointer;background:hsl(var(--background))}',
      '#ph-panel .tema.on{border-color:hsl(var(--primary))}',
      '#ph-panel .sw{height:30px;border-radius:6px;margin-bottom:6px;display:flex;align-items:center;padding:0 7px;gap:5px}',
      '#ph-panel .dot{width:11px;height:11px;border-radius:50%}',
      '#ph-panel .bar{height:5px;border-radius:3px;flex:1;opacity:.5}',
      '#ph-panel .tnome{font-size:11px;font-weight:600;color:hsl(var(--foreground))}',
      '#ph-panel .rows{display:flex;flex-direction:column;gap:6px}',
      '#ph-panel .row{display:flex;align-items:center;gap:10px;border:1px solid hsl(var(--border));border-radius:8px;padding:10px 12px;cursor:pointer;background:hsl(var(--background))}',
      '#ph-panel .row.on{border-color:hsl(var(--primary));background:hsl(var(--primary) / .10)}',
      '#ph-panel .row .rn{font-weight:600;font-size:13px}',
      '#ph-panel .row .ra{font-size:11px;color:hsl(var(--muted-foreground))}',
      '#ph-panel .row .ck{margin-left:auto;color:hsl(var(--primary));opacity:0;font-weight:700}',
      '#ph-panel .row.on .ck{opacity:1}',
      '#ph-panel .tam{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}',
      '#ph-panel .tb{border:1px solid hsl(var(--border));border-radius:8px;cursor:pointer;background:hsl(var(--background));padding:10px 2px;text-align:center;color:hsl(var(--muted-foreground))}',
      '#ph-panel .tb.on{border-color:hsl(var(--primary));color:hsl(var(--foreground))}',
      '#ph-panel .tb b{display:block}',
      '#ph-panel .tb span{font-size:10px}',
      '#ph-panel .reset{width:100%;padding:10px;margin-top:6px;background:transparent;border:1px solid hsl(var(--border));border-radius:8px;color:hsl(var(--muted-foreground));cursor:pointer;font-size:12px}',
    ].join('');
    document.head.appendChild(estilo);

    var fab = document.createElement('button');
    fab.id = 'ph-fab';
    fab.title = 'Aparencia (temas, fonte, tamanho)';
    fab.innerHTML = '&#9788;';

    var back = document.createElement('div');
    back.id = 'ph-back';

    var panel = document.createElement('div');
    panel.id = 'ph-panel';
    panel.innerHTML =
      '<div class="top"><h2>Aparencia</h2><button class="x" data-x>&times;</button></div>' +
      '<div class="g"><span class="lab">Tema de cores</span><div class="temas" data-temas></div></div>' +
      '<div class="g"><span class="lab">Skin da interface</span><div class="rows" data-skins></div></div>' +
      '<div class="g"><span class="lab">Fonte</span><div class="rows" data-fontes></div></div>' +
      '<div class="g"><span class="lab">Tamanho do texto</span><div class="tam" data-tam></div></div>' +
      '<button class="reset" data-reset>Restaurar padrao</button>';

    document.body.appendChild(back);
    document.body.appendChild(panel);

    // Ancora o botao na barra superior, ao lado das abas (Chat, Files...).
    // Se o cabecalho nao existir (ex: tela de login), volta a flutuar.
    // O app re-renderiza o cabecalho; o observer devolve o botao ao lugar.
    function ancorar() {
      var linha = document.querySelector('.pwa-header-safe > .flex');
      if (linha) {
        if (fab.parentElement !== linha) linha.appendChild(fab);
        fab.classList.add('ph-dock');
      } else {
        if (fab.parentElement !== document.body) document.body.appendChild(fab);
        fab.classList.remove('ph-dock');
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

    function hsl(v) { return 'hsl(' + v + ')'; }
    function render() {
      panel.querySelector('[data-temas]').innerHTML = Object.keys(TEMAS).map(function (id) {
        var t = TEMAS[id];
        return '<div class="tema' + (pref.tema === id ? ' on' : '') + '" data-tema="' + id + '">' +
          '<div class="sw" style="background:' + hsl(t.vars['--background']) + ';border:1px solid ' + hsl(t.vars['--border']) + '">' +
          '<span class="dot" style="background:' + hsl(t.primaria) + '"></span>' +
          '<span class="bar" style="background:' + hsl(t.vars['--muted-foreground']) + '"></span></div>' +
          '<div class="tnome">' + t.nome + '</div></div>';
      }).join('');
      panel.querySelector('[data-fontes]').innerHTML = Object.keys(FONTES).map(function (id) {
        var f = FONTES[id];
        var ff = f.valor ? ('style="font-family:' + f.valor + '"') : '';
        return '<div class="row' + (pref.fonte === id ? ' on' : '') + '" data-fonte="' + id + '">' +
          '<div><div class="rn" ' + ff + '>' + f.nome + '</div><div class="ra">' + f.amostra + '</div></div>' +
          '<span class="ck">&#10003;</span></div>';
      }).join('');
      panel.querySelector('[data-skins]').innerHTML = Object.keys(SKINS).map(function (id) {
        var skin = SKINS[id];
        return '<div class="row' + (pref.skin === id ? ' on' : '') + '" data-skin="' + id + '">' +
          '<div><div class="rn">' + skin.nome + '</div><div class="ra">' + skin.amostra + '</div></div>' +
          '<span class="ck">&#10003;</span></div>';
      }).join('');
      panel.querySelector('[data-tam]').innerHTML = Object.keys(TAMANHOS).map(function (id, i) {
        var t = TAMANHOS[id];
        return '<div class="tb' + (pref.tamanho === id ? ' on' : '') + '" data-tamanho="' + id + '">' +
          '<b style="font-size:' + (12 + i * 2) + 'px">A</b><span>' + t.cap + '</span></div>';
      }).join('');
    }

    function abrir() { render(); back.classList.add('on'); panel.classList.add('on'); }
    function fechar() { back.classList.remove('on'); panel.classList.remove('on'); }

    fab.addEventListener('click', abrir);
    window.addEventListener('pharmes:open-appearance', abrir);
    back.addEventListener('click', fechar);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') fechar(); });

    panel.addEventListener('click', function (e) {
      if (e.target.closest('[data-x]')) return fechar();
      if (e.target.closest('[data-reset]')) { pref = Object.assign({}, PADRAO); salvar(pref); aplicar(pref); render(); return; }
      var t = e.target.closest('[data-tema]');
      var s = e.target.closest('[data-skin]');
      var f = e.target.closest('[data-fonte]');
      var z = e.target.closest('[data-tamanho]');
      if (t) pref.tema = t.getAttribute('data-tema');
      else if (s) pref.skin = s.getAttribute('data-skin');
      else if (f) pref.fonte = f.getAttribute('data-fonte');
      else if (z) pref.tamanho = z.getAttribute('data-tamanho');
      else return;
      salvar(pref); aplicar(pref); render();
    });
  }

  function iniciar() {
    bootApply();
    observar();
    montarUI();
  }
  if (document.body) iniciar();
  else document.addEventListener('DOMContentLoaded', iniciar);
})();
