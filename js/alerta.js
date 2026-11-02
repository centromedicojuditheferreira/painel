/* ═══ 🔔 ALERTA v1.0 (30/10/2026) · avisos do Cortex fora da tela ═══
   Pedido do dono:
   · notificação do navegador enquanto houver pendência: "N pendências para resolver", de 30 em 30 min até resolver;
   · pendência nova sai numa notificação separada, assim que o Cortex a enxerga (na leitura do banco, de 10 em 10 min);
   · aba do navegador piscando ("🔴 N pendências") sempre que houver pendência, e o ícone com o número.
   Vale para todo mundo que entra no Cortex (secretárias e Administração).
   A conta é a mesma do número vermelho do menu: Agenda + Corte + Falhas + Cadastros + Exclusões (GV.pendenciasAgora).
   Funciona com o Cortex aberto em alguma aba (pode estar minimizado ou atrás de outra janela). Navegador fechado não avisa.
   Várias abas no mesmo navegador combinam pelo localStorage para não repetir o mesmo aviso.
   O relógio do pisca roda num Worker: o Chrome atrasa os relógios de aba escondida, o do Worker não. */
var ALERTA = (function () {
  'use strict';

  var RESUMO_MS = 30 * 60 * 1000;   /* resumo de 30 em 30 min, contados do último aviso que saiu (resumo ou pendência nova) */
  var JUNTA_MS = 4000;              /* espera as telas terminarem de ler o banco antes de comparar */
  var MAX_SEPARADAS = 3;            /* até 3 novas: uma notificação para cada; mais que isso, uma só com a lista */
  var K_ULTIMO = 'cortex.alerta.ultimo_aviso_em';
  var K_CONHECIDAS = 'cortex.alerta.conhecidas.v1';
  var ORDEM = ['agenda', 'corte', 'falhas', 'cad', 'excl'];
  var ROT = { agenda: 'Agenda', corte: 'Corte', falhas: 'Falhas', cad: 'Cadastros', excl: 'Exclusões' };
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
    b.hidden = !st.ligado || !suporta() || Notification.permission === 'granted';
    b.title = suporta() && Notification.permission === 'denied'
      ? 'Os avisos do navegador estão bloqueados: clique para ver como liberar'
      : 'Ligar os avisos do navegador';
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
    if (Notification.permission === 'default') { pedirPermissao(); return; }
    if (Notification.permission === 'denied') {
      alert('Os avisos do Cortex estão bloqueados neste navegador.\n\nPara liberar:\n1. Clique no cadeado ao lado do endereço (cortex.levsoul.com.br).\n2. Em "Notificações", escolha "Permitir".\n3. Recarregue a página.');
    }
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
    if (st.tiques % 15 === 0) talvezResumo();   /* confere o resumo a cada 15 s (o relógio é compartilhado entre abas) */
  }

  /* ── ligar / desligar (entrada e saída do Cortex) ── */
  function ligar() {
    if (st.ligado) return;
    st.ligado = true; st.tiques = 0; st.pronto = false;
    var b = document.getElementById('pg-sino');
    if (b && !b._alerta) { b._alerta = true; b.addEventListener('click', cliqueSino); }
    sino();   /* a permissão é pedida no clique de Entrar (o Chrome só mostra o pedido depois de um clique) e pelo sininho */
    st.relogio = criarRelogio(tique);
  }
  function desligar() {
    if (!st.ligado) return;
    st.ligado = false;
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

  return { ligar: ligar, desligar: desligar, atualizar: atualizar, titulo: titulo, pedirPermissao: pedirPermissao };
})();
