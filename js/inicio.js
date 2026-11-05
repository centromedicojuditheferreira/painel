/* ═══════════════════════════════════════════════════════════════════
   INÍCIO v4 (05/11/2026) — a primeira tela das secretárias
   Pedido do dono: a tela inicial mostrava a mesma pendência várias vezes (quadrados pulantes, lista da
   Agenda, "Resolver agora", número do menu). Agora cada pendência aparece UMA vez, no lugar certo:
   · Agora — cartões só com o que é de hoje, na hora: Hoje sem guia, Cobrar (paciente que chegou; FIN v2.0),
     Gaveta (contar / contar de novo / diferença / fechar) e Profissionais (na hora da régua de cobrança).
   · Para resolver — uma lista só, em grupos com ordem fixa de prioridade: Agenda (por situação, ABA à parte),
     Corte, Falhas, Cadastros, Exclusões e Caixa (pagamento para ajustar). Até 5 linhas por grupo + "ver as outras".
     Cada linha abre a janela daquela tela e resolve ali mesmo; o cabeçalho do grupo leva à tela inteira.
   · Tudo em dia — quando não há nada: tela calma, sem vermelho.
   Os dados vêm de GV.inicioDados() (js/guias.js), PCOB (js/cobranca.js), GAVETA (js/gaveta.js) e FCOB (js/cobrar.js).
   Este módulo não lê banco nenhum: só desenha o que os outros já leram.
   ═══════════════════════════════════════════════════════════════════ */
var INICIO = (function () {
  'use strict';

  var LIM = 5;   /* linhas por grupo antes do "ver as outras N" */
  var ORDEM_GRUPOS = ['agenda', 'corte', 'falhas', 'cad', 'excl', 'caixa'];
  var st = { D: null, abertos: {}, timer: null, relogio: null, cache: null };

  function novo(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function botao(cls, html, fn) { var b = novo('button', cls, html); b.type = 'button'; if (fn) b.addEventListener('click', fn); return b; }
  function esc(s) { var d = document.createElement('div'); d.textContent = s == null ? '' : String(s); return d.innerHTML; }
  function svg(d, t, w) { return window.moldura ? moldura.svg(d, t, w) : ''; }
  var IC = { dir: 'M9.5 6l6 6-6 6', ok: 'M5 12.5l4.5 4.5L19 7.5' };
  function naTela() { return !!(window.GV && GV.telaAtual && GV.telaAtual() === 'inicio' && window.moldura && moldura.atual() === 'inicio'); }
  function logado() { return typeof CU !== 'undefined' && !!CU; }
  function hhmm(ms) { var d = new Date(ms); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); }
  function hojeSP() { return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }); }
  function plural(n, um, varios) { return n + ' ' + (n === 1 ? um : varios); }
  function desdeTxt(iso) {
    if (!iso) return '';
    var d = new Date(iso), h = new Date();
    var dif = Math.round((new Date(h.getFullYear(), h.getMonth(), h.getDate()) - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 864e5);
    return 'desde ' + (dif === 0 ? '' : dif === 1 ? 'ontem ' : String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') + ' ') + hhmm(d.getTime());
  }

  /* ── as fontes: GV + os módulos que não são tela do GV ── */
  function ler() {
    var D = (window.GV && GV.inicioDados) ? GV.inicioDados() : { pronto: {}, erros: {}, agora: [], grupos: [], numeros: {} };
    var agora = D.agora.slice(), grupos = D.grupos.slice();

    /* Cobrar (FIN v2.0, js/cobrar.js): os de hoje no Agora; os de dias anteriores no grupo Caixa */
    var fc = (window.FCOB && FCOB.itens) ? FCOB.itens() : [];
    if (fc.length) {
      var hj = hojeSP(), deHoje = fc.filter(function (x) { return x.data === hj; }), antigos = fc.filter(function (x) { return x.data !== hj; });
      if (deHoje.length) {
        var c0 = deHoje[0];
        agora.push({ chave: 'cobrar', rot: 'Cobrar', etq: 'na recepção', cor: 'vermelho', n: deHoje.length,
          l1: (c0.primeira ? 'chegou ' + c0.primeira + ' · ' : '') + (c0.paciente || '—'),
          l2: (c0.origem || '') + (c0.esperado != null ? ' · R$ ' + Number(c0.esperado).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '') + (FCOB.situacaoCurta ? ' · ' + FCOB.situacaoCurta(c0) : ''),
          abrir: function () { FCOB.abrir(deHoje.length === 1 ? c0.chave : null); } });
      }
      if (antigos.length) grupos.push({ chave: 'caixa', rot: 'Caixa', sub: 'pagamento para ajustar no Feegow', cor: 'laranja', n: antigos.length, tela: 'caixa', telaRot: 'Caixa',
        abrirTela: function () { if (window.irPara) irPara('caixa'); },
        itens: antigos.map(function (x) {
          return { h: (FCOB.diaTxt ? FCOB.diaTxt(x.data) : x.data) + (x.primeira ? ' · ' + x.primeira : ''), nome: x.paciente || '—',
                   meta: (x.origem || '') + (FCOB.situacaoCurta ? ' · ' + FCOB.situacaoCurta(x) : ''), tag: FCOB.sitRot ? FCOB.sitRot(x) : 'Cobrar', tagCls: 'laranja',
                   tr: '', desde: x.desde || null, abrir: function () { FCOB.abrir(x.chave); } };
        }) });
    }

    /* Gaveta: tarefa da hora (contar, contar de novo, diferença, fechar) */
    var gv = (window.GAVETA && GAVETA.pendencias) ? GAVETA.pendencias() : [];
    if (gv.length) {
      var g0 = gv[0], curto = g0.rot.replace(/^Gaveta: /, '');
      curto = curto.charAt(0).toUpperCase() + curto.slice(1);
      agora.push({ chave: 'gaveta', rot: 'Gaveta', etq: gv.length > 1 ? plural(gv.length, 'tarefa', 'tarefas') : '', cor: 'orquidea', n: null, txt: curto.replace(/ a gaveta$/i, ''),
        l1: g0.rot, l2: gv.length > 1 ? gv.slice(1).map(function (x) { return x.rot; }).join(' · ') : (g0.l2 || ''),
        abrir: g0.abrir });
    }

    /* Profissionais: cobrança na hora da régua + cadastro incompleto */
    var pr = (window.PCOB && PCOB.pendencias) ? PCOB.pendencias() : [];
    if (pr.length) {
      var p0 = pr[0], env = pr.filter(function (x) { return x.chave.indexOf('env:') === 0; });
      agora.push({ chave: 'prof', rot: 'Profissionais', etq: env.length ? 'cobrar pelo WhatsApp' : 'cadastro', cor: 'laranja', n: pr.length,
        l1: p0.nome || '—', l2: p0.l2 || '', abrir: function () { PCOB.abrir(); } });
    }

    var total = 0;
    agora.forEach(function (c) { total += (c.chave === 'gaveta' ? gv.length : (c.n || 0)); });
    grupos.forEach(function (g) { total += g.n || 0; });
    var pronto = ['agenda', 'corte', 'falhas', 'cad', 'excl'].every(function (k) { return D.pronto[k]; });
    return { agora: agora, grupos: grupos, numeros: D.numeros, erros: D.erros, pronto: pronto, lidoEm: D.lidoEm, total: total };
  }

  /* ── número do menu e linha "N para resolver" ── */
  function pintaMenu(n) {
    var el = document.getElementById('gv-sbb');
    if (el) { el.hidden = !n; el.textContent = n || ''; }
  }

  /* ── desenho ── */
  function cartao(c) {
    var b = botao('in-card ' + (c.cor === 'laranja' ? 'lar' : c.cor === 'orquidea' ? 'orq' : c.cor === 'verde' ? 'verde' : ''),
      '<span class="rot">' + esc(c.rot) + (c.etq ? '<i>' + esc(c.etq) + '</i>' : '') + '</span>' +
      (c.n != null ? '<span class="num">' + c.n + '</span>' : '<span class="num txt">' + esc(c.txt || '') + '</span>') +
      '<span class="l1">' + esc(c.l1 || '') + '</span>' +
      '<span class="l2">' + esc(c.l2 || '') + '</span>' +
      '<span class="seta">' + svg(IC.dir, 16, 2) + '</span>', c.abrir);
    b.setAttribute('aria-haspopup', 'dialog');
    return b;
  }
  function linha(it, cor) {
    var cls = it.tagCls === 'cinza' ? ' c' : '';
    var b = botao('in-r', (it.hHtml != null ? '<span class="h">' + it.hHtml + '</span>' : '<span class="h">' + esc(it.h || '') + '</span>') +
      '<span class="nm">' + esc(it.nome || '—') + '<small>' + esc(it.meta || '') + '</small></span>' +
      '<span class="tg' + cls + '">' + esc(it.tag || '') + (it.tr ? ' · ' + esc(it.tr) : '') + '</span>' +
      (it.desde ? '<span class="desde">' + esc(desdeTxt(it.desde)) + '</span>' : ''), it.abrir);
    b.style.setProperty('--cor', 'var(--' + (it.tagCls === 'laranja' ? 'laranja' : it.tagCls === 'verde' ? 'verde' : 'vermelho') + ')');
    b.setAttribute('aria-haspopup', 'dialog');
    return b;
  }
  function grupo(g) {
    var sec = novo('section', 'in-g'); sec.setAttribute('aria-label', g.rot);
    sec.style.setProperty('--cor', 'var(--' + (g.cor === 'laranja' ? 'laranja' : g.cor === 'cinza' ? 'cinza' : 'vermelho') + ')');
    var cab = novo('div', 'in-g-cab', '<span class="q"></span><b>' + esc(g.rot) + '</b><small>' + esc(g.sub || '') + '</small><span class="n">' + g.n + '</span>');
    var ir = botao('ir', esc(g.telaRot || g.rot) + ' ›', g.abrirTela); ir.title = 'Abrir a tela ' + (g.telaRot || g.rot);
    cab.appendChild(ir);
    sec.appendChild(cab);
    var todos = !!st.abertos[g.chave];
    var mostra = todos ? g.itens : g.itens.slice(0, LIM);
    mostra.forEach(function (it) { sec.appendChild(linha(it, g.cor)); });
    if (g.itens.length > LIM) {
      var resto = g.itens.length - LIM;
      sec.appendChild(botao('in-mais', todos ? 'mostrar menos' : 'ver ' + (resto === 1 ? 'a outra' : 'as outras ' + resto) + ' ›', function () {
        st.abertos[g.chave] = !todos; desenhar();
      }));
    }
    return sec;
  }
  function calmo(R) {
    var n = R.numeros || {};
    var w = novo('div', 'in-calmo');
    w.innerHTML = '<div class="ok">' + svg(IC.ok, 36, 2.2) + '</div><h2>Tudo em dia</h2>' +
      '<p>Nenhuma pendência na agenda, no corte, nas falhas, nos cadastros, nas exclusões nem no caixa. O Cortex relê o banco de 10 em 10 minutos e avisa se aparecer algo.</p>' +
      '<div class="in-nums">' +
      (n.consultasHoje != null ? '<div><b>' + n.consultasHoje + '</b><small>' + (n.consultasHoje === 1 ? 'consulta hoje' : 'consultas hoje') + '</small></div>' : '') +
      (n.cobertas != null ? '<div><b>' + n.cobertas + '</b><small>cobertas nas próximas semanas</small></div>' : '') +
      (R.lidoEm ? '<div><b>' + hhmm(R.lidoEm) + '</b><small>última leitura</small></div>' : '') + '</div>';
    return w;
  }
  function resumoTopo(R) {
    if (!window.moldura) return;
    var d = new Date(), dia = d.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
    moldura.resumo('inicio', dia);   /* a hora da leitura vem do GV ("atualizado às"), ao lado */
  }

  function desenhar() {
    var main = document.getElementById('gv-conteudo'); if (!main) return;
    var R = st.cache = ler();
    pintaMenu(R.total);
    resumoTopo(R);
    var rolou = window.scrollY;
    main.innerHTML = '';
    var raiz = novo('div', 'in-raiz');
    ['agenda', 'corte', 'falhas', 'cad', 'excl'].forEach(function (k) {
      if (R.erros[k]) raiz.appendChild(novo('div', 'in-erro', 'Não consegui ler ' + ({ agenda: 'a agenda', corte: 'o corte', falhas: 'as falhas', cad: 'os cadastros', excl: 'as exclusões' })[k] + ': ' + esc(R.erros[k])));
    });
    if (R.agora.length) {
      var sa = novo('section', 'in-sec'); sa.setAttribute('aria-label', 'Agora');
      sa.appendChild(novo('div', 'in-sec-t', '<h2>Agora</h2><span>o que é de hoje, na hora</span>'));
      var ag = novo('div', 'in-agora');
      R.agora.forEach(function (c) { ag.appendChild(cartao(c)); });
      sa.appendChild(ag);
      raiz.appendChild(sa);
    }
    if (R.grupos.length) {
      var sb = novo('section', 'in-sec'); sb.setAttribute('aria-label', 'Para resolver');
      var nG = R.grupos.reduce(function (s, g) { return s + g.n; }, 0);
      sb.appendChild(novo('div', 'in-sec-t', '<h2>Para resolver</h2><span>' + plural(nG, 'pendência', 'pendências') + ' · cada linha abre e resolve aqui mesmo</span>'));
      var bd = novo('div', 'in-board');
      R.grupos.forEach(function (g) { bd.appendChild(grupo(g)); });
      sb.appendChild(bd);
      raiz.appendChild(sb);
    }
    if (!R.agora.length && !R.grupos.length) {
      raiz.appendChild(R.pronto ? calmo(R) : novo('div', 'lista-vazio', 'Lendo o banco…'));
    }
    main.appendChild(raiz);
    window.scrollTo(0, rolou);
    relogio();
  }

  /* o "lido às" do topo acompanha a hora; de minuto em minuto enquanto o Início estiver na tela */
  function relogio() {
    if (st.relogio) clearInterval(st.relogio);
    st.relogio = setInterval(function () {
      if (!naTela() || !logado()) { clearInterval(st.relogio); st.relogio = null; return; }
      if (st.cache) resumoTopo(st.cache);
    }, 60 * 1000);
  }

  /* chamado por todas as fontes (badgesTopo, chipsMudaram, gaveta) sempre que algo muda */
  function atualizar() {
    if (!logado()) return;
    if (st.timer) clearTimeout(st.timer);
    st.timer = setTimeout(function () {
      st.timer = null;
      if (naTela()) desenhar();
      else { st.cache = ler(); pintaMenu(st.cache.total); }
      if (window.moldura && moldura.redesenharAlertas) moldura.redesenharAlertas();
    }, 120);
  }
  function total() { if (!st.cache) st.cache = ler(); return st.cache.total; }

  return { desenhar: desenhar, atualizar: atualizar, total: total, dados: function () { return st.cache; } };
})();
