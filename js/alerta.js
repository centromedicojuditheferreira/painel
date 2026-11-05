/* ═══ 🔔 ALERTA v2.0 (05/11/2026) · avisos do Cortex fora da tela — obrigatórios para a recepção ═══
   v1.0 (30/10/2026), pedido do dono:
   · notificação do navegador enquanto houver pendência: "N pendências para resolver", repetida até resolver;
   · pendência nova sai numa notificação separada, assim que o Cortex a enxerga (na leitura do banco, de 10 em 10 min);
   · aba do navegador piscando ("🔴 N pendências") sempre que houver pendência, e o ícone com o número.
   v2.0, decisões do dono (05/11/2026):
   · conta de secretária SÓ ENTRA com os avisos do navegador ligados: depois do PIN, a porta (porta) pede a permissão;
     negada, mostra o passo a passo do cadeado e destrava sozinha quando liberar (API de permissões); navegador sem
     notificações (celular, Safari) não entra. A Administração entra sem (usa o celular) e vê o sininho vermelho.
   · dentro do Cortex, se a permissão cair, bloqueio de tela inteira até religar (bloqueio).
   · o resumo sai de 20 em 20 min (era 30), fixo na Central de Ações do Windows até clicar.
   · o Windows a página não enxerga: uma vez por navegador, "Teste do aviso" — manda um aviso e pergunta se apareceu;
     não apareceu, passo a passo das Configurações do Windows (com "entrar assim mesmo", que deixa o sininho aceso).
   A conta é a mesma do Início: Agenda + Corte + Falhas + Cadastros + Exclusões + Profissionais + Gaveta + Cobrar (GV.pendenciasAgora).
   Funciona com o Cortex aberto em alguma aba (pode estar minimizado ou atrás de outra janela). Navegador fechado não avisa.
   Várias abas no mesmo navegador combinam pelo localStorage para não repetir o mesmo aviso.
   O relógio do pisca roda num Worker: o Chrome atrasa os relógios de aba escondida, o do Worker não. */
var ALERTA = (function () {
  'use strict';

  var RESUMO_MS = 20 * 60 * 1000;   /* v2: resumo de 20 em 20 min, contados do último aviso que saiu (resumo ou pendência nova) */
  var JUNTA_MS = 4000;              /* espera as telas terminarem de ler o banco antes de comparar */
  var MAX_SEPARADAS = 3;            /* até 3 novas: uma notificação para cada; mais que isso, uma só com a lista */
  var K_ULTIMO = 'cortex.alerta.ultimo_aviso_em';
  var K_CONHECIDAS = 'cortex.alerta.conhecidas.v1';
  var K_WIN = 'cortex.alerta.windows';   /* 'ok' = o teste do Windows passou; 'sem' = entrou sem confirmar */
  var ORDEM = ['fin', 'agenda', 'corte', 'falhas', 'prof', 'gaveta', 'cad', 'excl'];
  var ROT = { fin: 'Cobrar', agenda: 'Agenda', corte: 'Corte', falhas: 'Falhas', prof: 'Profissionais', gaveta: 'Gaveta', cad: 'Cadastros', excl: 'Exclusões' };
  var ICONE_NOTIF = 'img/levsoul-marca.png';

  var st = {
    ligado: false, total: 0, partes: {}, pronto: false, base: document.title || 'Cortex', fase: false,
    relogio: null, tiques: 0, juntaTimer: null, resumo: null,
    linkIcone: null, iconeOrig: null, iconeN: -1, img: null
  };

  /* ── utilidades ── */
  function ler(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function grava(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function suporta() { return typeof window.Notification === 'function'; }
  function permitido() { return suporta() && Notification.permission === 'granted'; }
  function plural(n, um, varios) { return n + ' ' + (n === 1 ? um : varios); }
  function irAgenda() { try { if (window.moldura && moldura.irTelaGuias) moldura.irTelaGuias('agenda'); } catch (e) {} }

  /* ── relógio de 1 s (Worker; sem Worker, setInterval comum) ── */
  function criarRelogio(fn) {
    try {
      var url = URL.createObjectURL(new Blob(['setInterval(function(){postMessage(0);},1000);'], { type: 'text/javascript' }));
      var w = new Worker(url);
      w.onmessage = fn;
      return { parar: function () { w.terminate(); URL.revokeObjectURL(url); } };
    } catch (e) {
      var t = setInterval(fn, 1000);
      return { parar: function () { clearInterval(t); } };
    }
  }

  /* ── permissão e o sininho do topo ── */
  function sino() {
    var b = document.getElementById('pg-sino');
    if (!b) return;
    var semWin = ler(K_WIN) === 'sem';
    b.hidden = !st.ligado || !suporta() || (Notification.permission === 'granted' && !semWin);
    b.title = !suporta() ? 'Este navegador não mostra avisos' :
      Notification.permission === 'denied' ? 'Os avisos do navegador estão bloqueados: clique para ver como liberar' :
      Notification.permission === 'granted' ? 'O aviso do Windows ainda não foi confirmado: clique para testar de novo' :
      'Ligar os avisos do navegador';
  }
  function pedirPermissao() {
    if (!suporta() || Notification.permission !== 'default') { sino(); return; }
    try {
      var p = Notification.requestPermission(function () { sino(); });   /* navegadores antigos usam o callback */
      if (p && p.then) p.then(sino, sino);
    } catch (e) { sino(); }
  }
  function cliqueSino() {
    if (!suporta()) { alert('Este navegador não mostra notificações. Use o Google Chrome ou o Edge no computador.'); return; }
    if (Notification.permission === 'granted') { grava(K_WIN, ''); bloqueio(true); return; }   /* confirmar o Windows de novo */
    bloqueio(true);
  }

  /* ── notificação ── */
  function notifica(titulo, corpo, tag, fixa, aoClicar) {
    if (!permitido()) return null;
    try {
      var n = new Notification(titulo, { body: corpo, tag: tag, renotify: true, requireInteraction: !!fixa, icon: ICONE_NOTIF, lang: 'pt-BR' });
      n.onclick = function () {
        try { window.focus(); } catch (e) {}
        try { if (aoClicar) aoClicar(); } catch (e) {}
        n.close();
      };
      return n;
    } catch (e) { return null; }   /* Chrome do Android só aceita notificação por service worker: lá, só a aba */
  }
  function textoPartes(partes) {
    return ORDEM.filter(function (k) { return partes[k] > 0; })
      .map(function (k) { return ROT[k] + ' ' + partes[k]; }).join(' · ');
  }
  function marcarAviso() { grava(K_ULTIMO, String(Date.now())); }
  function resumoVencido() { return Date.now() - (+ler(K_ULTIMO) || 0) >= RESUMO_MS; }

  function talvezResumo() {
    if (!st.ligado || !st.pronto) return;
    if (st.total <= 0) {
      if (st.resumo) { try { st.resumo.close(); } catch (e) {} st.resumo = null; }
      return;
    }
    if (!permitido() || !resumoVencido()) return;
    marcarAviso();
    st.resumo = notifica(plural(st.total, 'pendência', 'pendências') + ' para resolver',
      textoPartes(st.partes) + '\nClique para abrir o Cortex.', 'cortex-resumo', true, irAgenda);
  }

  /* ── o que é novo: compara com a última leitura guardada neste navegador (por tela) ── */
  function lerConhecidas() {
    try { var o = JSON.parse(ler(K_CONHECIDAS) || '{}'); return (o && typeof o === 'object') ? o : {}; }
    catch (e) { return {}; }
  }
  function comparar() {
    st.juntaTimer = null;
    if (!st.ligado || !window.GV || !GV.pendenciasAgora) return;
    var P = GV.pendenciasAgora();
    var conhecidas = lerConhecidas(), novas = [];
    ORDEM.forEach(function (f) {
      if (!P.pronto[f]) return;                               /* tela que ainda não leu (ou deu erro) fica como estava */
      var atuais = P.itens.filter(function (i) { return i.fonte === f; });
      var antes = conhecidas[f];
      if (Array.isArray(antes)) {                             /* primeira vez neste navegador: só guarda, não avisa */
        var vistos = {}; antes.forEach(function (k) { vistos[k] = true; });
        atuais.forEach(function (i) { if (!vistos[i.chave]) novas.push(i); });
      }
      conhecidas[f] = atuais.map(function (i) { return i.chave; });
    });
    grava(K_CONHECIDAS, JSON.stringify(conhecidas));
    st.pronto = ORDEM.every(function (f) { return P.pronto[f]; });
    if (!novas.length || !permitido()) return;
    var tot = '\n' + plural(st.total, 'pendência', 'pendências') + ' para resolver no total.';
    if (novas.length <= MAX_SEPARADAS) {
      novas.forEach(function (i) { notifica(i.titulo, i.corpo + tot, 'cortex-' + i.chave, false, i.abrir); });
    } else {
      var linhas = novas.slice(0, 4).map(function (i) { return i.titulo.replace(/^(Nova pendência|Voltou) · /, '') + ': ' + i.corpo; });
      if (novas.length > 4) linhas.push('… e mais ' + (novas.length - 4));
      notifica(plural(novas.length, 'pendência nova', 'pendências novas'), linhas.join('\n') + tot, 'cortex-novas', false, irAgenda);
    }
    marcarAviso();   /* aviso de pendência nova também zera o relógio dos 30 min */
  }

  /* ── aba do navegador: título piscando e ícone com o número (quadrado, cantos retos como o resto do Cortex) ── */
  function pintaTitulo() {
    if (!st.ligado || st.total <= 0) { if (document.title !== st.base) document.title = st.base; return; }
    st.fase = !st.fase;
    document.title = st.fase ? '🔴 ' + plural(st.total, 'pendência', 'pendências') : '(' + st.total + ') ' + st.base;
  }
  function pintaIcone(n) {
    if (n === st.iconeN) return;
    st.iconeN = n;
    var link = st.linkIcone || document.querySelector('link[rel~="icon"]');
    if (!link) { link = document.createElement('link'); link.rel = 'icon'; document.head.appendChild(link); }
    st.linkIcone = link;
    if (!st.iconeOrig) st.iconeOrig = link.href;
    if (n <= 0) { link.type = 'image/png'; link.href = st.iconeOrig; return; }
    function desenha() {
      try {
        var c = document.createElement('canvas'); c.width = c.height = 64;
        var g = c.getContext('2d');
        if (st.img && st.img.complete && st.img.naturalWidth) g.drawImage(st.img, 0, 0, 64, 64);
        var txt = n > 99 ? '99+' : String(n), lado = txt.length > 2 ? 44 : 38;
        g.fillStyle = '#D70015'; g.fillRect(64 - lado, 64 - lado, lado, lado);
        g.fillStyle = '#FFFFFF'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.font = 'bold ' + (txt.length > 2 ? 22 : txt.length > 1 ? 28 : 32) + 'px Arial, sans-serif';
        g.fillText(txt, 64 - lado / 2, 64 - lado / 2 + 2);
        link.type = 'image/png'; link.href = c.toDataURL('image/png');
      } catch (e) {}
    }
    if (!st.img) {
      st.img = new Image();
      st.img.onload = function () { var m = st.iconeN; st.iconeN = -1; pintaIcone(m); };
      st.img.src = st.iconeOrig;
    }
    desenha();
  }

  function tique() {
    pintaTitulo();
    st.tiques++;
    if (st.tiques % 15 === 0) { talvezResumo(); vigiar(); }   /* a cada 15 s: o resumo (relógio compartilhado entre abas) e a permissão */
  }

  /* ── ligar / desligar (entrada e saída do Cortex) ── */
  function ligar() {
    if (st.ligado) return;
    st.ligado = true; st.tiques = 0; st.pronto = false;
    var b = document.getElementById('pg-sino');
    if (b && !b._alerta) { b._alerta = true; b.addEventListener('click', cliqueSino); }
    sino();   /* a permissão é pedida no clique de Entrar (o Chrome só mostra o pedido depois de um clique) e pelo sininho */
    st.relogio = criarRelogio(tique);
    vigiar();
  }
  function desligar() {
    if (!st.ligado) return;
    st.ligado = false;
    bloqueio(false);
    if (st.relogio) { st.relogio.parar(); st.relogio = null; }
    if (st.juntaTimer) { clearTimeout(st.juntaTimer); st.juntaTimer = null; }
    if (st.resumo) { try { st.resumo.close(); } catch (e) {} st.resumo = null; }
    st.total = 0; st.partes = {};
    pintaIcone(0);
    document.title = st.base;
    sino();
  }

  /* chamado pelo badgesTopo do GV sempre que uma tela termina de ler o banco */
  function atualizar() {
    if (!st.ligado || !window.GV || !GV.pendenciasAgora) return;
    var P = GV.pendenciasAgora();
    st.partes = P.partes;
    st.total = ORDEM.reduce(function (s, f) { return s + (P.partes[f] || 0); }, 0);
    pintaIcone(st.total);
    if (st.total <= 0) pintaTitulo();
    if (st.juntaTimer) clearTimeout(st.juntaTimer);
    st.juntaTimer = setTimeout(comparar, JUNTA_MS);
  }

  /* a moldura avisa o título da tela atual ("Agenda · Cortex") */
  function titulo(t) { st.base = t || 'Cortex'; if (!st.ligado || st.total <= 0) document.title = st.base; }

  /* ═══ v2 · a porta: conta de secretária só entra com os avisos ligados ═══ */
  function ehSecretaria(u) { var x = u || (typeof CU !== 'undefined' ? CU : null); return !!x && x.admin !== true; }
  function estado() { return !suporta() ? 'sem_suporte' : Notification.permission; }   /* 'granted' | 'denied' | 'default' | 'sem_suporte' */
  var ICO = {
    sino: 'M6 16.5V11a6 6 0 1 1 12 0v5.5l1.5 1.5h-15zM10 20.5a2 2 0 0 0 4 0',
    cadeado: 'M7 11V8a5 5 0 0 1 10 0v3M5 11h14v10H5zM12 15v2',
    ok: 'M5 12.5l4.5 4.5L19 7.5', seta: 'M5 12h13M13 6l6 6-6 6', win: 'M3 5.5 11 4.4v7.1H3zM12 4.2 21 3v8.5h-9zM3 12.5h8v7.1L3 18.5zM12 12.5h9V21l-9-1.2z'
  };
  function sv(d, t, w) { return '<svg width="' + (t || 18) + '" height="' + (t || 18) + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="' + (w || 1.8) + '" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="' + d + '"/></svg>'; }
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function bt(cls, html, fn) { var b = el('button', cls, html); b.type = 'button'; if (fn) b.addEventListener('click', fn); return b; }
  function passosCadeado() {
    return '<div class="av-passos">' +
      '<div><i class=\"n\">1</i>Clique no <b>cadeado</b> (ou no ícone de ajustes) à esquerda do endereço <b>cortex.levsoul.com.br</b>, no alto do navegador.</div>' +
      '<div class="av-cadeado">' + sv(ICO.cadeado, 16, 1.8) + ' <span>cortex.levsoul.com.br</span></div>' +
      '<div><i class=\"n\">2</i>Em <b>Notificações</b>, escolha <b>Permitir</b>.</div>' +
      '<div><i class=\"n\">3</i>Volte para cá: o Cortex destrava sozinho. Se não destravar, clique em <b>Já liberei</b> ou recarregue a página (F5).</div></div>';
  }
  function passosWindows() {
    return '<div class="av-passos">' +
      '<div><i class=\"n\">1</i>No Windows, abra <b>Configurações › Sistema › Notificações</b> e deixe <b>Notificações</b> ligado.</div>' +
      '<div><i class=\"n\">2</i>Na lista de aplicativos, deixe o <b>Google Chrome</b> (ou o Edge) ligado.</div>' +
      '<div><i class=\"n\">3</i>Desligue o <b>Não perturbe</b> / <b>Assistente de foco</b> (o ícone de sino ou lua, no canto do relógio).</div>' +
      '<div><i class=\"n\">4</i>Volte para cá e toque em <b>Testar de novo</b>.</div></div>';
  }
  /* pede a permissão e devolve a resposta numa Promise ('granted' | 'denied' | 'default') */
  function pedir() {
    return new Promise(function (ok) {
      if (!suporta()) { ok('sem_suporte'); return; }
      if (Notification.permission !== 'default') { ok(Notification.permission); return; }
      try {
        var p = Notification.requestPermission(function (r) { ok(r); });
        if (p && p.then) p.then(ok, function () { ok(Notification.permission); });
      } catch (e) { ok(Notification.permission); }
    });
  }
  /* API de permissões: avisa quando a secretária libera pelo cadeado, sem recarregar */
  function vigiarPermissao(fn) {
    try {
      if (!navigator.permissions || !navigator.permissions.query) return null;
      var pare = false;
      navigator.permissions.query({ name: 'notifications' }).then(function (p) {
        if (pare) return;
        p.onchange = function () { if (!pare) fn(p.state); };
      }).catch(function () {});
      return function () { pare = true; };
    } catch (e) { return null; }
  }
  /* o painel da porta (mesmo desenho na entrada e no bloqueio). ctx: { raiz, seguir, sair, u } */
  function painelPorta(ctx) {
    var P = ctx.raiz, parar = null;
    function limpa() { if (parar) { parar(); parar = null; } }
    function pinta(modo, extra) {
      limpa();
      P.innerHTML = '';
      var e = estado();
      if (modo === 'teste' || (modo == null && e === 'granted')) { pintaTeste(); return; }
      if (e === 'sem_suporte') {
        P.appendChild(el('h2', null, 'Este navegador não mostra avisos'));
        P.appendChild(el('p', null, 'O Cortex da recepção precisa dos avisos do navegador, e este navegador não os mostra. Entre pelo <b>Google Chrome</b> ou pelo <b>Edge</b>, no computador da recepção.'));
        if (ctx.sair) P.appendChild(bt('av-sair', 'Sair', ctx.sair));
        return;
      }
      if (e === 'denied' || modo === 'negado') {
        P.appendChild(el('h2', null, 'Os avisos estão bloqueados'));
        P.appendChild(el('p', null, 'O navegador está com os avisos do Cortex <b>bloqueados</b>. Para entrar, libere assim:'));
        P.insertAdjacentHTML('beforeend', passosCadeado());
        var d = el('div', 'av-duas');
        d.appendChild(bt('av-bt calmo', 'Já liberei', function () { if (estado() === 'granted') pinta('teste'); else pinta('negado', 'ainda'); }));
        d.appendChild(bt('av-bt calmo', 'Recarregar a página', function () { location.reload(); }));
        P.appendChild(d);
        if (extra === 'ainda') P.appendChild(el('p', 'av-erro', 'Ainda está bloqueado. Confira o passo 2: em Notificações tem que estar "Permitir".'));
        if (ctx.sair) P.appendChild(bt('av-sair', 'Sair', ctx.sair));
        parar = vigiarPermissao(function (s) { if (s === 'granted') pinta('teste'); });
        return;
      }
      /* 'default': ainda não respondeu */
      P.appendChild(el('h2', null, 'Para entrar, ligue os avisos'));
      P.appendChild(el('p', null, 'O Cortex avisa no canto da tela quando aparece pendência (consulta sem guia, corte, mensagem que não saiu, paciente para cobrar) e repete <b>de 20 em 20 minutos</b> até resolver. ' +
        'Por isso a recepção só entra com os avisos ligados. Clique no botão e, na janelinha do navegador, em <b>Permitir</b>.'));
      P.appendChild(bt('av-bt', sv(ICO.sino, 18, 2) + ' Ligar os avisos', function () {
        pedir().then(function (r) {
          if (r === 'granted') pinta('teste');
          else if (r === 'denied') pinta('negado');
          else pinta(null, 'fechou');
        });
      }));
      if (extra === 'fechou') P.appendChild(el('p', 'av-erro', 'A janelinha foi fechada sem resposta. Clique de novo e escolha "Permitir". Se ela não aparecer mais, use o cadeado ao lado do endereço.'));
      if (ctx.sair) P.appendChild(bt('av-sair', 'Sair', ctx.sair));
      parar = vigiarPermissao(function (s) { if (s === 'granted') pinta('teste'); else if (s === 'denied') pinta('negado'); });
    }
    function pintaTeste(falhou) {
      limpa();
      P.innerHTML = '';
      if (ler(K_WIN) === 'ok') { ctx.seguir(); return; }
      if (!falhou) {
        P.appendChild(el('h2', null, 'Teste do aviso'));
        P.appendChild(el('p', null, 'Os avisos do navegador estão ligados. Falta conferir se o <b>Windows</b> mostra o aviso no canto da tela (a página não consegue ver isso sozinha).'));
        var mandou = false;
        var b = bt('av-bt', sv(ICO.sino, 18, 2) + ' Mandar um aviso de teste', function () {
          var n = notifica('Teste do Cortex', 'Se você está vendo isto, o Windows mostra os avisos do Cortex.', 'cortex-teste', false, null);
          mandou = true;
          b.innerHTML = sv(ICO.sino, 18, 2) + ' Mandar de novo';
          per.hidden = false;
          if (n) setTimeout(function () { try { n.close(); } catch (e) {} }, 15000);
        });
        P.appendChild(b);
        var per = el('div'); per.hidden = true;
        per.appendChild(el('p', null, '<b>O aviso apareceu no canto da tela?</b>'));
        var d = el('div', 'av-duas');
        d.appendChild(bt('av-bt', sv(ICO.ok, 18, 2.2) + ' Apareceu', function () { if (!mandou) return; grava(K_WIN, 'ok'); sino(); ctx.seguir(); }));
        d.appendChild(bt('av-bt calmo', 'Não apareceu', function () { pintaTeste(true); }));
        per.appendChild(d);
        P.appendChild(per);
      } else {
        P.appendChild(el('h2', null, 'O Windows não mostrou o aviso'));
        P.appendChild(el('p', null, 'O navegador está liberado, mas o Windows está segurando os avisos. Ajuste assim:'));
        P.insertAdjacentHTML('beforeend', passosWindows());
        P.appendChild(bt('av-bt', 'Testar de novo', function () { pintaTeste(false); }));
        P.appendChild(bt('av-sair', 'Entrar assim mesmo (o sininho vermelho fica aceso até confirmar)', function () { grava(K_WIN, 'sem'); sino(); ctx.seguir(); }));
      }
      if (ctx.sair) P.appendChild(bt('av-sair', 'Sair', ctx.sair));
    }
    pinta();
    return { fechar: limpa };
  }

  /* na ENTRADA (chamada pelo doLogin, depois do PIN): secretária sem permissão não passa */
  function porta(u, seguir) {
    if (!ehSecretaria(u)) { seguir(); return; }
    if (estado() === 'granted' && ler(K_WIN) === 'ok') { seguir(); return; }
    var lo = document.getElementById('lo'), caixa = lo && lo.querySelector('.lo-caixa');
    var ops = document.getElementById('lo-ops'), senhaBox = document.getElementById('lo-senha'), err = document.getElementById('lo-err');
    if (!caixa) { seguir(); return; }
    var antigo = caixa.querySelector('.lo-painel'); if (antigo) antigo.remove();
    var P = el('div', 'lo-painel av-porta');
    caixa.insertBefore(P, err || null);
    if (ops) ops.hidden = true;
    if (senhaBox) senhaBox.hidden = true;
    if (err) err.style.display = 'none';
    var e2 = document.getElementById('lo-entrar'); if (e2) e2.classList.remove('aguarde');
    function limpar() { P.remove(); if (ops) ops.hidden = false; }
    painelPorta({ raiz: P, u: u,
      seguir: function () { limpar(); seguir(); },
      sair: function () {
        limpar();
        if (window.LAPI && LAPI.sair) LAPI.sair();
        var pin = document.getElementById('lo-pin'); if (pin) pin.value = '';
        if (typeof loadLoginUsers === 'function') loadLoginUsers();
      } });
  }

  /* dentro do Cortex: bloqueio de tela inteira enquanto a permissão estiver fora (ou para refazer o teste do Windows) */
  var blq = null;
  function bloqueio(mostrar) {
    if (!mostrar) { if (blq) { blq.remove(); blq = null; } return; }
    if (blq) return;
    blq = el('div', 'av-bloqueio'); blq.setAttribute('role', 'dialog'); blq.setAttribute('aria-modal', 'true');
    var P = el('div', 'av-porta');
    blq.appendChild(P);
    document.body.appendChild(blq);
    painelPorta({ raiz: P, seguir: function () { bloqueio(false); sino(); }, sair: function () { bloqueio(false); if (typeof doLogout === 'function') doLogout(); } });
  }
  function vigiar() {
    if (!st.ligado || !ehSecretaria()) return;
    if (suporta() && Notification.permission !== 'granted' && !blq) bloqueio(true);
    sino();
  }

  return { ligar: ligar, desligar: desligar, atualizar: atualizar, titulo: titulo, pedirPermissao: pedirPermissao, porta: porta, bloqueio: bloqueio };
})();
