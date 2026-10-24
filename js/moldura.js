/* ═══════════════════════════════════════════════════════════════════
   Moldura do painel (design Lev Soul)
   Menu lateral, cabeçalho da página, barra "Resolver agora" e o botão Nova venda.
   Não guarda dado nenhum: só chama nav() da lojinha e as telas do GV.
   ═══════════════════════════════════════════════════════════════════ */
var moldura = (function () {
  'use strict';

  var I = {
    agenda: 'M6.5 5h11a3 3 0 0 1 3 3v9.5a3 3 0 0 1-3 3h-11a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3zM3.5 9.5h17M8 3v4M16 3v4',
    renovacoes: 'M19.5 12a7.5 7.5 0 0 1-12.9 5.2M4.5 12a7.5 7.5 0 0 1 12.9-5.2M17.5 3.5V7H14M6.5 20.5V17H10',
    cadastros: 'M6 5h12a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3zM6.8 11a2.2 2.2 0 1 0 4.4 0 2.2 2.2 0 1 0-4.4 0M5.8 16.2c.6-1.6 1.8-2.4 3.2-2.4s2.6.8 3.2 2.4M14.5 10h4M14.5 13.5h3',
    corte: 'M4 6.5a2.5 2.5 0 1 0 5 0 2.5 2.5 0 1 0-5 0M4 17.5a2.5 2.5 0 1 0 5 0 2.5 2.5 0 1 0-5 0M8.6 7.9 20 17M8.6 16.1 20 7',
    exclusoes: 'M4.5 6.5h15M9.5 6.5v-2h5v2M6.5 6.5l1 13h9l1-13M10.5 10.5v6M13.5 10.5v6',
    falhas: 'M7 3.5h10a3 3 0 0 1 3 3v7a3 3 0 0 1-3 3h-6l-4.5 4v-4H7a3 3 0 0 1-3-3v-7a3 3 0 0 1 3-3zM12 7v4.5M12 14h.01',
    malotes: 'M3.5 7.5 12 3.5l8.5 4v9L12 20.5l-8.5-4zM3.5 7.5l8.5 4 8.5-4M12 11.5v9',
    notinhas: 'M6 3.5h8.5l4 4v13H6zM14 3.5V8h4.5M9 12h6M9 15.5h6',
    caixa: 'M5.5 6.5h13a2.5 2.5 0 0 1 2.5 2.5v6a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 15V9a2.5 2.5 0 0 1 2.5-2.5zM9.7 12a2.3 2.3 0 1 0 4.6 0 2.3 2.3 0 1 0-4.6 0M6.5 9.5v5M17.5 9.5v5',
    estoque: 'M5 4h14a1.5 1.5 0 0 1 1.5 1.5V7A1.5 1.5 0 0 1 19 8.5H5A1.5 1.5 0 0 1 3.5 7V5.5A1.5 1.5 0 0 1 5 4zM5 8.5v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-10M10 12.5h4',
    historico: 'M3.5 12a8.5 8.5 0 1 0 17 0 8.5 8.5 0 1 0-17 0M12 7.5V12l3 2',
    conferencia: 'M3.5 12a8.5 8.5 0 1 0 17 0 8.5 8.5 0 1 0-17 0M8.2 12.2l2.6 2.6 5-5.2',
    visao: 'M4.5 20V13M10 20V8M15.5 20v-5M21 20H3M20 4.5l-5 4.5-4.5-3L4 10',
    posicao: 'M8.5 4.5h7M8.5 4.5A1.5 1.5 0 0 0 7 6v1h10V6a1.5 1.5 0 0 0-1.5-1.5M7 5.5H5.5A1.5 1.5 0 0 0 4 7v12a1.5 1.5 0 0 0 1.5 1.5h13A1.5 1.5 0 0 0 20 19V7a1.5 1.5 0 0 0-1.5-1.5H17M8 12h8M8 16h5',
    profissionais: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20c.8-3.3 3.3-5 6.5-5s5.7 1.7 6.5 5M16 4.5a3.5 3.5 0 0 1 0 6.5M18 15c1.8.6 3 2.3 3.5 5',
    exportar: 'M12 4v11M7.5 10.5 12 15l4.5-4.5M5 19.5h14',
    cfg: 'M4 7h9M17 7h3M15 5v4M4 17h3M11 17h9M9 15v4',
    dono: 'M4 8.5l4 3.5 4-6.5 4 6.5 4-3.5-1.8 10H5.8z',
    extrato: 'M6 3.5h12v17l-2-1.4-2 1.4-2-1.4-2 1.4-2-1.4-2 1.4zM9 8h6M9 11.5h6M9 15h3.5',
    venda: 'M6 8h12l-1 12.5H7zM9 8V6.5a3 3 0 0 1 6 0V8',
    fixar: 'M4 5h16v14H4zM9.5 5v14',
    sair: 'M10 4.5H6.5a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2H10M14.5 8l4 4-4 4M18.5 12h-9',
    alerta: 'M12 3.5 21.5 20h-19zM12 10v4.5M12 17.2h.01',
    esq: 'M14.5 6l-6 6 6 6', dir: 'M9.5 6l6 6-6 6'
  };
  function svg(d, tam, traco) {
    return '<svg width="' + (tam || 18) + '" height="' + (tam || 18) + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="' +
      (traco || 1.7) + '" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="' + d + '"></path></svg>';
  }

  /* destino → onde fica no painel antigo (s = seção de nav(), t = tela do GV) */
  var DEST = {
    agenda:        { s: 'guias', t: 'agenda',  secao: 'Faturamento', titulo: 'Agenda', busca: true },   /* busca: lupa + Renovação de validade Unimed no topo */
    cadastros:     { s: 'guias', t: 'cad',     secao: 'Faturamento', titulo: 'Cadastros' },
    exclusoes:     { s: 'guias', t: 'excl',    secao: 'Faturamento', titulo: 'Exclusões' },
    corte:         { s: 'guias', t: 'corte',   secao: 'Faturamento', titulo: 'Corte' },
    falhas:        { s: 'guias', t: 'falhas',  secao: 'Faturamento', titulo: 'Falhas' },
    malotes:       { s: 'guias', t: 'malotes', secao: 'Faturamento', titulo: 'Malotes' },
    conferencia:   { s: 'guias', t: 'prof',    secao: 'Profissionais', titulo: 'Conferência' },
    dono:          { s: 'guias', t: 'dono',    secao: 'Administração', titulo: 'Dono' },
    notinhas:      { s: 'notinhas',  secao: 'Lojinha', titulo: 'Notinhas',
                     acoes: [['Profissionais', function () { irPara('profissionais'); }], ['Relatório', function () { if (window.LJ) LJ.relatorio(); else abrirRel(); }],
                             ['Bonificação do mês', function () { if (window.LJ) LJ.bonificacao(); else abrirBonif(); }]] },
    caixa:         { s: 'caixa',     secao: 'Lojinha', titulo: 'Caixa' },
    estoque:       { s: 'estoque',   secao: 'Lojinha', titulo: 'Estoque', acoes: [['Balanço', function () { irPara('balanco'); }]] },
    balanco:       { s: 'balanco',   secao: 'Lojinha', titulo: 'Balanço', menu: 'estoque', acoes: [['Voltar ao estoque', function () { irPara('estoque'); }]] },
    historico:     { s: 'historico', secao: 'Lojinha', titulo: 'Histórico' },
    venda:         { s: 'venda',     secao: 'Lojinha', titulo: 'Nova venda', semFab: true },
    profissionais: { s: 'profissionais', secao: 'Lojinha', titulo: 'Profissionais', menu: 'notinhas' },
    extrato:       { s: 'financeiro', secao: 'Financeiro', titulo: 'Extrato' },   /* FIN v1.3: só o administrador, por enquanto */
    visao:         { s: 'dashboard', secao: 'Administração', titulo: 'Visão geral' },
    posicao:       { s: 'posicao',   secao: 'Administração', titulo: 'Estoque atual' },
    exportar:      { s: 'exportar',  secao: 'Administração', titulo: 'Exportar' },
    cfg:           { s: 'cfg',       secao: 'Administração', titulo: 'Configurações' }
  };
  var TELA_GV = {}, SEC_LOJA = {};
  Object.keys(DEST).forEach(function (k) {
    if (DEST[k].s === 'guias') TELA_GV[DEST[k].t] = k; else SEC_LOJA[DEST[k].s] = k;
  });

  /* itens do menu: [destino, rótulo, id do contador, contador em vermelho?] */
  var MENU = [
    ['Faturamento', [['agenda', 'Agenda', 'gv-b-agenda', true], ['cadastros', 'Cadastros', 'gv-b-cad', true],
      ['exclusoes', 'Exclusões', 'gv-b-excl', true], ['corte', 'Corte', 'gv-b-corte', true], ['falhas', 'Falhas', 'gv-b-falhas', true],
      ['malotes', 'Malotes', 'gv-b-malotes']]],
    ['Lojinha', [['notinhas', 'Notinhas'], ['caixa', 'Caixa'], ['estoque', 'Estoque'], ['historico', 'Histórico']]],
    ['Profissionais', [['conferencia', 'Conferência', 'gv-b-prof', true]]],
    ['Financeiro', [['extrato', 'Extrato']], true],
    ['Administração', [['visao', 'Visão geral'], ['posicao', 'Estoque atual'], ['exportar', 'Exportar'], ['cfg', 'Configurações'],
      ['dono', 'Dono', null, false, 'gv-aba-dono']], true]
  ];

  var app = document.getElementById('app');
  var menu = document.getElementById('menu');
  var atual = null;
  var chipsGV = [];
  var resumos = {};
  var fixo = false;
  try { fixo = localStorage.getItem('painel.menuFixo') === '1'; } catch (e) {}

  /* ── menu ── */
  function montarMenu() {
    var h = '<div class="menu-in">' +
      '<div class="menu-marca"><span class="menu-logo">' +
      '<img class="menu-o" src="img/levsoul-marca.png" alt="" aria-hidden="true" width="32" height="32">' +
      '<span class="menu-nome"><img src="img/levsoul-logo.png" alt="Lev Soul" width="115" height="18"><span>Centro Médico Judithe Ferreira</span></span>' +
      '</span><button type="button" class="menu-fixar" id="menu-fixar">' + svg(I.fixar) + '</button></div>';
    MENU.forEach(function (g) {
      var adm = g[2] ? ' menu-admin' : '';
      h += '<div class="menu-grupo' + adm + '"><span>' + g[0] + '</span><i aria-hidden="true"></i></div>';
      g[1].forEach(function (it) {
        h += '<button type="button" class="menu-item' + adm + (it[3] ? ' urg' : '') + '" data-ir="' + it[0] + '" title="' + it[1] + '"' +
          (it[4] ? ' id="' + it[4] + '"' : '') + '>' +
          '<span class="menu-ic">' + svg(I[it[0]]) + '<span class="menu-ponto" aria-hidden="true"></span></span>' +
          '<span class="menu-rot">' + it[1] + '</span>' +
          '<span class="menu-n"' + (it[2] ? ' id="' + it[2] + '" hidden' : '') + '></span></button>';
      });
    });
    h += '<div class="menu-user"><span class="menu-av" id="sb-av" aria-hidden="true">?</span>' +
      '<span class="menu-quem"><b id="sb-nm">—</b><small id="sb-papel">Secretária</small></span>' +
      '<button type="button" class="menu-sair" title="Sair" aria-label="Sair" onclick="doLogout()">' + svg(I.sair) + '</button></div></div>';
    menu.innerHTML = h;
    menu.addEventListener('click', function (ev) {
      var b = ev.target.closest('[data-ir]');
      if (b) { irPara(b.getAttribute('data-ir')); if (!fixo) abrir(false); }
    });
    document.getElementById('menu-fixar').addEventListener('click', function () { fixar(!fixo); });
    menu.addEventListener('mouseenter', function () { if (!fixo) abrir(true); });
    menu.addEventListener('mouseleave', function () { if (!fixo) abrir(false); });
    menu.addEventListener('focusin', function () { if (!fixo) abrir(true); });
    menu.addEventListener('focusout', function (ev) { if (!fixo && !menu.contains(ev.relatedTarget)) abrir(false); });
    /* o ponto vermelho do menu recolhido segue os contadores que o GV atualiza */
    var obs = new MutationObserver(marcarContadores);
    menu.querySelectorAll('.menu-n[id]').forEach(function (n) { obs.observe(n, { attributes: true, childList: true, characterData: true, subtree: true }); });
    fixar(fixo, true);
  }
  function marcarContadores() {
    menu.querySelectorAll('.menu-item').forEach(function (it) {
      var n = it.querySelector('.menu-n');
      it.classList.toggle('tem', !!(n && !n.hidden && n.textContent && n.textContent !== '0'));
    });
  }
  function abrir(sim) { menu.classList.toggle('aberto', !!sim || fixo); menu.classList.toggle('solto', !fixo); }
  function fixar(sim, inicio) {
    fixo = !!sim;
    app.classList.toggle('menu-fixo', fixo);
    abrir(fixo);
    var b = document.getElementById('menu-fixar');
    if (b) { var r = fixo ? 'Recolher o menu' : 'Fixar o menu aberto'; b.title = r; b.setAttribute('aria-label', r); }
    if (!inicio) { try { localStorage.setItem('painel.menuFixo', fixo ? '1' : '0'); } catch (e) {} }
  }

  /* ── navegação ── */
  function secaoAtual() { var s = document.querySelector('.sec.active'); return s ? s.id.replace('s-', '') : ''; }
  function irPara(d) {
    if (d === 'venda' && window.LJ) { LJ.abrirVenda(); return; }     /* Nova venda é a janela no canto */
    var x = DEST[d]; if (!x) return;
    if (x.s === 'guias') {
      if (secaoAtual() === 'guias' && window.GV && GV.tela) GV.tela(x.t); else nav('guias', x.t);
    } else nav(x.s);
  }
  function irTelaGuias(t) { irPara(TELA_GV[t] || 'agenda'); }
  function aoNavegar(s, sub) { definir(s === 'guias' ? (TELA_GV[sub || 'agenda'] || 'agenda') : (SEC_LOJA[s] || s)); }
  function aoTrocarTela(t) { if (secaoAtual() === 'guias') definir(TELA_GV[t] || 'agenda'); }
  function definir(d) {
    var x = DEST[d]; if (!x) return;
    var mudou = d !== atual;
    if (mudou) fecharPops();                      /* trocou de tela: as janelas abertas eram da tela anterior */
    atual = d;
    document.getElementById('pg-secao').textContent = x.secao;
    document.getElementById('pg-titulo').textContent = x.titulo;
    document.title = x.titulo + ' · Cortex';
    document.getElementById('pg-resumo').textContent = resumos[d] || '';
    var ehGV = x.s === 'guias';
    ['gv-renov', 'gv-lupa'].forEach(function (id) { var el = document.getElementById(id); if (el) el.hidden = !x.busca; });
    document.getElementById('gv-recarregar').hidden = !ehGV;
    var at = document.getElementById('gv-atualizado'); if (at) at.hidden = !ehGV || d === 'conferencia';   /* a hora é dos dados do faturamento */
    var ac = document.getElementById('pg-acoes');
    if (mudou) {                                  /* telas do GV podem pôr controles aqui (acoesDe) depois disto */
      ac.innerHTML = '';
      (x.acoes || []).forEach(function (a) {
        var b = document.createElement('button'); b.type = 'button'; b.className = 'btn btn-s'; b.textContent = a[0];
        b.addEventListener('click', a[1]); ac.appendChild(b);
      });
    }
    var alvo = x.menu || d;
    menu.querySelectorAll('.menu-item').forEach(function (it) {
      var on = it.getAttribute('data-ir') === alvo;
      it.classList.toggle('on', on);
      if (on) it.setAttribute('aria-current', 'page'); else it.removeAttribute('aria-current');
    });
    document.getElementById('fab').hidden = !!x.semFab;
    var ola = d === 'agenda';                     /* v3.3: na Agenda, "Bom dia / Boa tarde / Boa noite, <nome>" no lugar do título */
    document.querySelector('.pg-tit').classList.toggle('ola', ola);
    if (ola) document.getElementById('pg-titulo').textContent = saudacao();
    desenharAlertas();
    if (mudou) window.scrollTo(0, 0);
  }
  function saudacao() {
    var h = new Date().getHours();
    var s = h < 12 ? 'Bom dia' : (h < 18 ? 'Boa tarde' : 'Boa noite');
    var nome = (typeof CU !== 'undefined' && CU && CU.nome) ? CU.nome : '';
    return nome ? s + ', ' + nome : s;
  }
  function acoesDe(d) { return d === atual ? document.getElementById('pg-acoes') : null; }
  function resumo(d, txt) { resumos[d] = txt || ''; if (d === atual) document.getElementById('pg-resumo').textContent = resumos[d]; }

  /* ── barra dos quadrados de alerta (os chips vêm do GV; aparece em todas as telas) ──
     v3.4: sem o rótulo "Resolver agora"; os quadrados começam na margem esquerda. */
  var ra = document.getElementById('ra');
  function alertas(lista) { chipsGV = lista || []; desenharAlertas(); }
  function desenharAlertas() {
    if (!chipsGV.length) { ra.hidden = true; ra.innerHTML = ''; return; }
    var filtro = (window.GV && GV.filtroTipo) ? GV.filtroTipo() : null;
    ra.hidden = false;
    ra.innerHTML =
      '<button type="button" class="ra-seta some" data-l="-1" aria-label="Ver alertas anteriores">' + svg(I.esq, 16, 2.2) + '</button>' +
      '<div class="ra-trilho"></div>' +
      '<button type="button" class="ra-seta some" data-l="1" aria-label="Ver mais alertas">' + svg(I.dir, 16, 2.2) + '</button>';
    var tr = ra.querySelector('.ra-trilho');
    var j = 0;
    chipsGV.forEach(function (c) {
      if (c.sep) { var s = document.createElement('span'); s.className = 'ra-sep'; s.setAttribute('aria-hidden', 'true'); tr.appendChild(s); return; }
      var aqui = c.chave === atual;
      var on = atual === 'agenda' && filtro === c.chave;   /* v3.4: o filtro "Só X" da lista mora no próprio quadrado */
      var b = document.createElement('button'); b.type = 'button';
      b.className = 'ra-chip' + (aqui ? ' aqui' : '') + (on ? ' on' : '');
      b.innerHTML = esc(c.rot) + ' <b>' + c.n + '</b>' + (on ? svg('M6 6l12 12M18 6 6 18', 12, 2.6) : '');
      b.title = aqui ? 'Você está nesta tela' : (on ? 'A lista mostra só estes. Clique para tirar o filtro' : (c.dica || ''));
      if (on) b.setAttribute('aria-pressed', 'true');
      if (aqui) b.setAttribute('aria-current', 'page');
      else b.addEventListener('click', on ? function () { if (window.GV && GV.limparFiltroTipo) GV.limparFiltroTipo(); } : c.acao);
      b.style.animationDelay = (j++ * 120) + 'ms';
      tr.appendChild(b);
    });
    ra.querySelectorAll('.ra-seta').forEach(function (s) {
      s.addEventListener('click', function () {
        var passo = Math.max(160, Math.round(tr.clientWidth * 0.7)) * Number(s.getAttribute('data-l'));
        tr.scrollBy({ left: passo, behavior: 'smooth' });
      });
    });
    tr.addEventListener('scroll', setas);
    setas();
  }
  function setas() {
    var tr = ra.querySelector('.ra-trilho'); if (!tr) return;
    var s = ra.querySelectorAll('.ra-seta');
    s[0].classList.toggle('some', !(tr.scrollLeft > 2));
    s[1].classList.toggle('some', !(tr.scrollLeft + tr.clientWidth < tr.scrollWidth - 2));
  }
  window.addEventListener('resize', setas);
  function esc(t) { var d = document.createElement('div'); d.textContent = t == null ? '' : String(t); return d.innerHTML; }

  /* ── janela de detalhe (pop): uma por vez, Esc e clique fora fecham ──
     v3.4: {sobre:true} abre por cima da janela que já está aberta (ex.: o detalhe de uma guia dentro
     da Renovação de validade Unimed); Esc e o clique fora fecham só a de cima. {classe} = classe extra. */
  var pilha = [];
  function fecharPops() { while (pilha.length) pilha[pilha.length - 1].fechar(true); }
  function pop(o) {
    o = o || {};
    if (!o.sobre) fecharPops();
    var nivel = pilha.length;
    var anterior = document.activeElement;
    var fundo = document.createElement('div'); fundo.className = 'pop-fundo';
    var el = document.createElement('section');
    el.className = 'pop' + (o.classe ? ' ' + o.classe : ''); el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true');
    el.style.width = o.largura || '620px';
    if (nivel) { fundo.style.zIndex = 200 + nivel * 2; el.style.zIndex = 201 + nivel * 2; }
    el.innerHTML = '<div class="pop-topo"><div class="pop-esq"></div><button type="button" class="pop-x" aria-label="Fechar">' +
      svg('M6 6l12 12M18 6 6 18', 18, 2) + '</button></div><div class="pop-corpo"></div><div class="pop-rodape" hidden></div>';
    document.body.appendChild(fundo); document.body.appendChild(el);
    var api = { el: el, topo: el.querySelector('.pop-esq'), corpo: el.querySelector('.pop-corpo'), rodape: el.querySelector('.pop-rodape'), aberto: true };
    if (o.titulo) api.topo.innerHTML = '<span class="pop-titulo-topo">' + esc(o.titulo) + '</span>';
    api.fechar = function (trocando) {
      if (!api.aberto) return;
      while (pilha.length && pilha[pilha.length - 1] !== api) pilha[pilha.length - 1].fechar(true);   /* fecha antes as que estão por cima */
      api.aberto = false;
      fundo.remove(); el.remove();
      var i = pilha.indexOf(api); if (i >= 0) pilha.splice(i, 1);
      if (o.aoFechar) o.aoFechar(!!trocando);
      if (!trocando && anterior && anterior.focus) { try { anterior.focus({ preventScroll: true }); } catch (e) {} }
    };
    fundo.addEventListener('click', function () { api.fechar(); });
    el.querySelector('.pop-x').addEventListener('click', function () { api.fechar(); });
    pilha.push(api);
    setTimeout(function () { var f = el.querySelector('.pop-x'); if (f && api.aberto) f.focus({ preventScroll: true }); }, 0);
    return api;
  }
  document.addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape' && pilha.length) { ev.stopPropagation(); pilha[pilha.length - 1].fechar(); }
  }, true);

  /* ── botão Nova venda ── */
  function montarFab() {
    var b = document.createElement('button');
    b.type = 'button'; b.id = 'fab'; b.className = 'fab';
    b.innerHTML = svg(I.venda, 20, 1.8) + '<span>Nova venda</span>';
    b.addEventListener('click', function () { irPara('venda'); });
    app.appendChild(b);
  }

  montarMenu();
  montarFab();
  var rec = document.getElementById('gv-recarregar');
  if (rec) rec.addEventListener('click', function () {
    rec.classList.add('girando'); setTimeout(function () { rec.classList.remove('girando'); }, 1200);
  });
  window.irPara = irPara;
  return { aoNavegar: aoNavegar, aoTrocarTela: aoTrocarTela, alertas: alertas, resumo: resumo,
           irTelaGuias: irTelaGuias, atual: function () { return atual; }, pop: pop, svg: svg, I: I, acoesDe: acoesDe };
})();
