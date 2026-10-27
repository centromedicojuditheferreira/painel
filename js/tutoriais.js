/* ═══════════════════════════════════════════════════════════════════
   TUT v1.0 — tutoriais do Cortex (27/10/2026)
   Um motor só para todos os manuais: a aba Tutoriais, o botão "?" no
   topo de cada tela e a abertura automática.
   - Cada tutorial tem uma versão (TUT_CONTEUDO, em js/tutoriais_conteudo.js).
     Subiu a versão, ele reabre uma vez para todos, marcado "Atualizado".
   - "Não mostrar de novo" fica no banco (tut_leituras, funções tut_*), por
     usuário: vale em qualquer PC. Sem o SQL instalado, cai no navegador.
   - O Manual geral abre logo depois da entrada; o tutorial de cada tela,
     na primeira vez que ela entra na tela. Um de cada vez, nunca por cima
     de outra janela (contagem da gaveta, saudação etc.).
   - O último passo de todos termina com o aviso para a Administração.
   ═══════════════════════════════════════════════════════════════════ */
var TUT = (function () {
  'use strict';

  var IMG = 'img/guia/';
  var AVISO_FIM = 'Achou algo errado ou desatualizado neste tutorial? <b>Avise a Administração.</b>';
  var estado = {};          /* tutorial → { versao, oculto, visto_em } (do banco) */
  var carregado = false, semBanco = false;
  var fila = [];            /* tutoriais esperando para abrir sozinhos */
  var vistosNaSessao = {};  /* Manual geral: abre uma vez por entrada no Cortex */
  var aberto = null;

  function C() { return window.TUT_CONTEUDO || {}; }
  function ehAdm() { return typeof CU !== 'undefined' && !!CU && CU.admin === true; }
  function usuario() { return (typeof CU !== 'undefined' && CU) ? (CU.id || CU.nome || '') : ''; }
  function esc(t) { var d = document.createElement('div'); d.textContent = t == null ? '' : String(t); return d.innerHTML; }
  function lista() {   /* tutoriais que este usuário enxerga, na ordem do conteúdo */
    var c = C();
    return Object.keys(c).filter(function (k) { return !c[k].adm || ehAdm(); }).map(function (k) { return { id: k, t: c[k] }; });
  }
  function daTela(destino) {
    var c = C(), k;
    for (k in c) if (c[k].telas && c[k].telas.indexOf(destino) >= 0 && (!c[k].adm || ehAdm())) return k;
    return null;
  }

  /* ── memória: banco, com o navegador de reserva ── */
  function chaveLocal(id) { return 'tut.' + usuario() + '.' + id; }
  function lerLocal(id) { try { var v = localStorage.getItem(chaveLocal(id)); return v ? JSON.parse(v) : null; } catch (e) { return null; } }
  function gravarLocal(id, v) { try { localStorage.setItem(chaveLocal(id), JSON.stringify(v)); } catch (e) {} }
  function rpc(fn, args) {
    if (!window.LAPI || !LAPI.token()) return Promise.reject(new Error('sem sessão'));
    var a = { p_token: LAPI.token() }; Object.keys(args || {}).forEach(function (k) { a[k] = args[k]; });
    return fetch('https://xcucoryngkkuszztpxyq.supabase.co/rest/v1/rpc/' + fn, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': 'sb_publishable_6ATQUvqBBRS5xx7jAYKlmw_2FwTuHG7',
                 'Authorization': 'Bearer sb_publishable_6ATQUvqBBRS5xx7jAYKlmw_2FwTuHG7' },
      body: JSON.stringify(a)
    }).then(function (r) {
      return r.json().catch(function () { return null; }).then(function (j) {
        if (!r.ok || !j || j.ok === false) { var e = new Error((j && (j.msg || j.message)) || ('HTTP ' + r.status)); e.status = r.status; throw e; }
        return j;
      });
    });
  }
  function carregar() {
    if (carregado) return Promise.resolve();
    return rpc('tut_estado').then(function (j) {
      estado = {}; (j.itens || []).forEach(function (x) { estado[x.tutorial] = x; });
      semBanco = false; carregado = true;
    }, function () {   /* SQL ainda não instalado (ou sem rede): vale o navegador */
      semBanco = true; carregado = true; estado = {};
      lista().forEach(function (x) { var v = lerLocal(x.id); if (v) estado[x.id] = v; });
    });
  }
  function marcar(id, oculto) {
    var t = C()[id]; if (!t) return;
    var v = { tutorial: id, versao: t.versao || 1, oculto: !!oculto, visto_em: new Date().toISOString() };
    estado[id] = v; gravarLocal(id, v);
    if (!semBanco) rpc('tut_marcar', { p_tutorial: id, p_versao: v.versao, p_oculto: v.oculto }).catch(function () {});
  }
  /* situação de um tutorial para este usuário */
  function situacao(id) {
    var t = C()[id], e = estado[id]; if (!t) return 'nada';
    if (!e) return 'novo';
    if ((e.versao || 1) < (t.versao || 1)) return 'atualizado';
    return e.oculto ? 'oculto' : 'visto';
  }
  function deveAbrirSozinho(id) { var s = situacao(id); return s === 'novo' || s === 'atualizado' || s === 'visto'; }

  /* ── a janela ── */
  function abrir(id, sozinho) {
    var t = C()[id]; if (!t || !window.moldura) return;
    if (t.adm && !ehAdm()) return;
    var sit = situacao(id);
    var passos = t.passos.slice();
    var i = 0, ocultar = sit === 'oculto';
    var P = moldura.pop({ titulo: t.titulo + (sit === 'atualizado' ? ' · Atualizado' : ''), largura: '860px', classe: 'gd-pop',
                          aoFechar: function () { marcar(id, ocultar); aberto = null; setTimeout(proximo, 400); } });
    aberto = id;
    P.rodape.hidden = false;
    P.rodape.innerHTML = '<label class="gd-oculta"><input type="checkbox"' + (ocultar ? ' checked' : '') + '> Não mostrar de novo' +
      (t.telas && t.telas.length ? ' ao abrir ' + esc(t.ondeAbre || 'esta tela') : ' ao entrar no Cortex') + '</label>' +
      '<span class="gd-pontos"></span><span class="pop-dir"><button type="button" class="btn btn-s" data-g="-1">Anterior</button>' +
      '<button type="button" class="btn btn-p" data-g="1">Próximo</button></span>';
    P.rodape.querySelector('.gd-oculta input').addEventListener('change', function () { ocultar = this.checked; });
    var pinta = function () {
      var s = passos[i], ult = i === passos.length - 1, larga = !!(s.img && s.larga);
      var vis = s.img ? '<img src="' + IMG + s.img + '" alt="' + esc(s.t) + '" loading="lazy">' : (s.vis ? s.vis() : '');
      P.corpo.innerHTML = '<div class="gd-passo' + (larga ? ' larga' : '') + (vis ? '' : ' sem-vis') + '">' +
        (vis ? '<div class="gd-vis">' + vis + '</div>' : '') +
        '<div class="gd-txt"><p class="gd-n">' + (i + 1) + ' de ' + passos.length + '</p><h2>' + esc(s.t) + '</h2><p class="gd-p">' + s.p + '</p>' +
        (s.e ? '<p class="gd-e">' + s.e + '</p>' : '') +
        (ult ? '<p class="gd-aviso">' + AVISO_FIM + '</p>' : '') + '</div></div>';
      P.rodape.querySelector('.gd-pontos').innerHTML = passos.map(function (_, k) {
        return '<button type="button" class="gd-ponto' + (k === i ? ' on' : '') + '" data-k="' + k + '" aria-label="Passo ' + (k + 1) + '"></button>';
      }).join('');
      P.rodape.querySelector('[data-g="-1"]').disabled = i === 0;
      P.rodape.querySelector('[data-g="1"]').textContent = ult ? 'Fechar' : 'Próximo';
      P.corpo.scrollTop = 0;
    };
    var vai = function (k) { if (k >= passos.length) { P.fechar(); return; } i = Math.max(0, k); pinta(); };
    P.rodape.addEventListener('click', function (ev) {
      var b = ev.target.closest('[data-g],[data-k]'); if (!b) return;
      if (b.hasAttribute('data-k')) vai(Number(b.getAttribute('data-k'))); else vai(i + Number(b.getAttribute('data-g')));
    });
    var tecla = function (ev) {
      if (!P.aberto) { document.removeEventListener('keydown', tecla); return; }
      if (ev.target && /INPUT|TEXTAREA|SELECT/.test(ev.target.tagName) && ev.target.type !== 'checkbox') return;
      if (ev.key === 'ArrowRight') vai(i + 1); else if (ev.key === 'ArrowLeft' && i > 0) vai(i - 1);
    };
    document.addEventListener('keydown', tecla);
    pinta();
  }

  /* ── abertura automática: um de cada vez, só com a tela livre ── */
  function telaLivre() {
    if (aberto) return false;
    if (document.querySelector('.pop')) return false;                       /* outra janela aberta */
    var lo = document.getElementById('lo'); if (lo && lo.style.display !== 'none') return false;   /* entrada/saudação */
    var app = document.getElementById('app'); if (!app || app.style.display === 'none') return false;
    return true;
  }
  var espera = null;
  function proximo() {
    clearTimeout(espera);
    if (!fila.length) return;
    if (!telaLivre()) { espera = setTimeout(proximo, 1000); return; }
    var id = fila.shift();
    if (vistosNaSessao[id] || !deveAbrirSozinho(id)) { proximo(); return; }   /* geral: uma vez por entrada; telas: toda vez que entra nela */
    var t = C()[id];
    if (t && t.telas && t.telas.length && window.moldura && t.telas.indexOf(moldura.atual()) < 0) { proximo(); return; }   /* já saiu da tela */
    if (id === 'geral') vistosNaSessao[id] = true;
    abrir(id, true);
  }
  function enfileirar(id) { if (id && fila.indexOf(id) < 0 && !vistosNaSessao[id]) fila.push(id); carregar().then(function () { setTimeout(proximo, 500); }); }

  /* ── ganchos do Cortex ── */
  function aoEntrar() {   /* depois do PIN: o Manual geral primeiro */
    vistosNaSessao = {};
    fila = fila.filter(function (x) { return x !== 'geral'; }); fila.unshift('geral');   /* o geral passa na frente do tutorial da Agenda */
    carregar().then(function () { setTimeout(proximo, 500); });
  }
  function aoTrocarTela(destino) {
    var b = document.getElementById('pg-ajuda'), id = daTela(destino);
    if (b) { b.hidden = !id; b.setAttribute('data-tut', id || ''); }
    if (id) enfileirar(id);
  }
  function aoSair() { estado = {}; carregado = false; fila = []; vistosNaSessao = {}; aberto = null; clearTimeout(espera); }
  var bAj = document.getElementById('pg-ajuda');
  if (bAj) bAj.addEventListener('click', function () { var id = bAj.getAttribute('data-tut'); if (id) carregar().then(function () { abrir(id); }); });

  /* ── a aba Tutoriais ── */
  function tela() {
    var host = document.getElementById('s-tutoriais'); if (!host) return;
    host.innerHTML = '<p class="tut-vazio">Carregando…</p>';
    carregar().then(function () {
      var h = '<div class="tut-grade">';
      lista().forEach(function (x) {
        var s = situacao(x.id), n = x.t.passos.length;
        var selo = s === 'novo' ? '<span class="tut-selo novo">Novo</span>' : (s === 'atualizado' ? '<span class="tut-selo atu">Atualizado</span>' : '');
        h += '<button type="button" class="tut-card' + (x.id === 'geral' ? ' geral' : '') + '" data-tut="' + x.id + '">' +
          '<span class="tut-sec">' + esc(x.t.secao || '') + '</span><b>' + esc(x.t.titulo) + '</b>' +
          '<small>' + esc(x.t.resumo || '') + '</small><span class="tut-pe">' + n + ' passo' + (n === 1 ? '' : 's') + selo + '</span></button>';
      });
      h += '</div>';
      if (ehAdm()) h += '<div class="tut-adm" id="tut-adm"><h3>Quem já leu</h3><p class="tut-vazio">Carregando…</p></div>';
      host.innerHTML = h;
      host.querySelectorAll('.tut-card').forEach(function (b) {
        b.addEventListener('click', function () { abrir(b.getAttribute('data-tut')); });
      });
      if (ehAdm()) quemLeu();
    });
  }
  function quemLeu() {
    var box = document.getElementById('tut-adm'); if (!box) return;
    rpc('tut_admin_leituras').then(function (j) {
      var us = j.usuarios || [], it = {}, tuts = lista().filter(function (x) { return !x.t.adm; });
      (j.itens || []).forEach(function (x) { it[x.usuario_id + '|' + x.tutorial] = x; });
      if (!us.length) { box.innerHTML = '<h3>Quem já leu</h3><p class="tut-vazio">Nenhuma secretária cadastrada.</p>'; return; }
      var h = '<h3>Quem já leu</h3><div class="tut-tab-wrap"><table class="tut-tab"><thead><tr><th>Tutorial</th>' +
        us.map(function (u) { return '<th>' + esc(u.nome) + '</th>'; }).join('') + '</tr></thead><tbody>';
      tuts.forEach(function (x) {
        h += '<tr><td>' + esc(x.t.titulo) + '</td>' + us.map(function (u) {
          var e = it[u.id + '|' + x.id];
          if (!e) return '<td class="nao">não abriu</td>';
          var velho = (e.versao || 1) < (x.t.versao || 1);
          var d = new Date(e.visto_em).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
          return '<td class="' + (velho ? 'velho' : 'sim') + '">' + (velho ? 'versão antiga · ' : '') + d + (e.oculto ? ' ✓' : '') + '</td>';
        }).join('') + '</tr>';
      });
      box.innerHTML = h + '</tbody></table></div><p class="tut-leg">Data = última vez que abriu · ✓ = marcou "Não mostrar de novo".</p>';
    }, function (e) {
      box.innerHTML = '<h3>Quem já leu</h3><p class="tut-vazio">' + (e.status === 404 ? 'Falta instalar o SQL dos tutoriais (TUT v1.0) no Supabase.' : 'Não deu para ler agora.') + '</p>';
    });
  }

  /* ajudante dos passos sem print: marcos na lateral colorida */
  function linha(l) {
    return '<div class="gd-linha">' + l.map(function (x) {
      return '<div class="gd-marco' + (x[3] ? ' ' + x[3] : '') + '"><small>' + x[0] + '</small><b>' + x[1] + '</b><span>' + x[2] + '</span></div>';
    }).join('') + '</div>';
  }
  function icone(txt) { return '<div class="gd-faq"><b>' + txt + '</b></div>'; }

  return { abrir: function (id) { carregar().then(function () { abrir(id); }); }, aoEntrar: aoEntrar, aoTrocarTela: aoTrocarTela,
           aoSair: aoSair, tela: tela, linha: linha, icone: icone };
})();
