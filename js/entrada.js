/* ═══════════════════════════════════════════════════════════════════
   Entrada do Cortex (login) e a saudação depois do PIN
   Não guarda nada nem fala com banco nenhum. O login de sempre continua
   enchendo o <select id="lo-usr"> (secretárias do Supabase, ou os
   profissionais nos links de conferência) e conferindo o PIN em doLogin();
   aqui só se desenha essa lista como opções clicáveis, se mostra o PIN
   embaixo e, depois que entra, a saudação animada.
   ═══════════════════════════════════════════════════════════════════ */
var ENTRADA = (function () {
  'use strict';

  var PADRAO = 'administrador';                   /* conta que já vem marcada */
  var SAUDA = { administrador: 'Marinalva' };     /* conta → nome dito na saudação; as demais usam o próprio nome */
  var COR = { claro: { login: '#D47AB2', app: '#FBF4F8' }, escuro: { login: '#5A1F55', app: '#1C0F1A' } };   /* cor da barra do navegador no celular, por tema (TEMA v4.1) */

  var lo = document.getElementById('lo'), sel = document.getElementById('lo-usr'), ops = document.getElementById('lo-ops'),
      senha = document.getElementById('lo-senha'), pin = document.getElementById('lo-pin'), err = document.getElementById('lo-err'),
      btn = document.getElementById('lo-entrar'), txt = document.getElementById('lo-bv-txt');
  if (!lo || !sel || !ops || !senha || !pin) {
    return { boasVindas: function () { if (lo) lo.style.display = 'none'; } };
  }

  function mq(q) { try { return window.matchMedia(q); } catch (e) { return { matches: false }; } }
  var mouse = mq('(pointer: fine)'), calmo = mq('(prefers-reduced-motion: reduce)');
  function norm(s) { return String(s == null ? '' : s).trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function visivel() { return lo.style.display !== 'none'; }
  function modoAdm() { return typeof LO_MODO === 'undefined' || LO_MODO === 'adm'; }

  /* ── cor da barra do navegador (celular): rosa no login, clara no sistema ── */
  var meta = document.querySelector('meta[name="theme-color"]');
  function corBarra() {
    var t = document.documentElement.getAttribute('data-tema') === 'escuro' ? 'escuro' : 'claro';
    if (meta) meta.setAttribute('content', visivel() ? COR[t].login : COR[t].app);
  }

  /* ── os nomes, desenhados a partir do <select> ── */
  function render() {
    var todas = Array.prototype.slice.call(sel.options);
    var reais = todas.filter(function (o) { return o.value; });
    if (!reais.length) {   /* "carregando…", "nenhum profissional…" etc. */
      ops.innerHTML = '<p class="lo-vazio">' + esc(todas.length ? todas[0].textContent : 'Carregando…') + '</p>';
      sel.selectedIndex = -1; senha.hidden = true;
      return;
    }
    reais.sort(function (a, b) {   /* em ordem alfabética, com a conta padrão sempre em cima */
      var pa = norm(a.textContent) === PADRAO, pb = norm(b.textContent) === PADRAO;
      if (pa !== pb) return pa ? -1 : 1;
      return a.textContent.localeCompare(b.textContent, 'pt-BR', { sensitivity: 'base' });
    });
    ops.innerHTML = reais.map(function (o) {
      return '<button type="button" class="lo-op" role="radio" aria-checked="false" tabindex="-1" data-v="' + esc(o.value) + '">' +
        '<i aria-hidden="true"></i><span>' + esc(o.textContent) + '</span></button>';
    }).join('');
    var padrao = null;
    if (modoAdm()) reais.forEach(function (o) { if (!padrao && norm(o.textContent) === PADRAO) padrao = o; });
    if (!padrao && reais.length === 1) padrao = reais[0];
    escolher(padrao ? padrao.value : null, false);
    if (padrao && mouse.matches && visivel()) pin.focus();   /* no celular não abre o teclado sozinho */
  }

  function escolher(v, focar) {
    var achou = false;
    Array.prototype.forEach.call(ops.querySelectorAll('.lo-op'), function (b) {
      var sim = v != null && b.getAttribute('data-v') === String(v);
      b.setAttribute('aria-checked', sim ? 'true' : 'false');
      b.tabIndex = sim ? 0 : -1;
      if (sim) achou = true;
    });
    if (!achou) {
      var primeiro = ops.querySelector('.lo-op'); if (primeiro) primeiro.tabIndex = 0;
      sel.selectedIndex = -1; senha.hidden = true;
      return;
    }
    var abriu = senha.hidden, mudou = sel.value !== String(v) || abriu;
    sel.value = String(v);
    if (mudou) { pin.value = ''; if (err) err.style.display = 'none'; }
    senha.hidden = false;
    if (abriu && !calmo.matches) { senha.classList.remove('surge'); void senha.offsetWidth; senha.classList.add('surge'); }
    if (focar) pin.focus();
  }

  ops.addEventListener('click', function (e) {
    var b = e.target.closest('.lo-op');
    if (b) escolher(b.getAttribute('data-v'), true);
  });
  ops.addEventListener('keydown', function (e) {   /* setas andam entre os nomes, como bolinhas de verdade */
    var bs = Array.prototype.slice.call(ops.querySelectorAll('.lo-op')); if (!bs.length) return;
    var i = bs.indexOf(document.activeElement), n = null;
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') n = bs[(i + 1) % bs.length];
    else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') n = bs[(i - 1 + bs.length) % bs.length];
    else if (e.key === 'Home') n = bs[0];
    else if (e.key === 'End') n = bs[bs.length - 1];
    if (n) { e.preventDefault(); escolher(n.getAttribute('data-v'), false); n.focus(); }
  });

  /* ── botão Entrar: "pensando" enquanto confere; tremidinha quando o PIN está errado ── */
  var tAguarde = null;
  function aguardar() { if (!btn) return; btn.classList.add('aguarde'); clearTimeout(tAguarde); tAguarde = setTimeout(parar, 8000); }
  function parar() { clearTimeout(tAguarde); if (btn) btn.classList.remove('aguarde'); }
  if (btn) btn.addEventListener('click', aguardar, true);
  pin.addEventListener('keydown', function (e) { if (e.key === 'Enter') aguardar(); }, true);
  if (err) new MutationObserver(function () {
    if (err.style.display !== 'block' || !err.textContent.trim()) return;
    parar();
    if (!senha.hidden && visivel()) pin.focus();   /* PIN errado: já volta para a caixinha, é só digitar de novo */
    if (calmo.matches) return;
    senha.classList.remove('treme'); void senha.offsetWidth; senha.classList.add('treme');
  }).observe(err, { attributes: true, attributeFilter: ['style'], childList: true, characterData: true, subtree: true });
  senha.addEventListener('animationend', function (e) {
    if (e.target !== senha) return;
    senha.classList.remove(e.animationName === 'lo-treme' ? 'treme' : 'surge');
  });

  /* ── saudação depois do PIN (chamada por entrarApp) ──
     FRASES v1.0 (06/11/2026): no acesso da sócia (Administração sem ser o dono), a saudação de sempre
     ("Bem-vinda, Marinalva!") continua igual e, em vez de sumir sozinha, dá lugar à frase do dia:
     a orquídea desabrocha, a frase aparece palavra a palavra e um botão leva ao Início — a tela só sai
     quando ela clica (ou Enter/Esc). Secretárias e o dono seguem como antes: a saudação some sozinha. ── */
  var cena = null;   /* a cena da frase, montada uma vez só */
  function cenaFrase() {
    if (cena) return cena;
    cena = document.createElement('div'); cena.className = 'lo-fr'; cena.setAttribute('aria-live', 'polite');
    cena.innerHTML = '<div class="lo-fr-in">' + (window.ORQUIDEA ? ORQUIDEA.svg({ classe: 'lo-fr-orq' }) : '') +
      '<p class="lo-fr-dia" id="lo-fr-dia"></p><p class="lo-fr-txt" id="lo-fr-txt"></p>' +
      '<button type="button" class="lo-fr-bt" id="lo-fr-bt">Vamos ao Início' +
      '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h13M13 6l6 6-6 6"/></svg></button></div>';
    lo.appendChild(cena);
    return cena;
  }
  function boasVindas(cu) {
    parar();
    var nome = String((cu && cu.nome) || '').trim();
    nome = SAUDA[norm(nome)] || nome;
    var frase = nome ? 'Bem-vinda, ' + nome + '!' : 'Bem-vinda!';
    if (cu && cu.dono) frase = 'Bem-vindo, chefe!';   /* FIN v3.0: o acesso do dono entra pela Administração com o PIN dele */
    if (txt) txt.innerHTML = frase.split(' ').map(function (p, i) {   /* uma palavra de cada vez */
      return '<span style="animation-delay:' + (0.64 + i * 0.13).toFixed(2) + 's">' + esc(p) + '</span>';
    }).join(' ');
    if (document.activeElement && lo.contains(document.activeElement)) document.activeElement.blur();
    lo.classList.remove('saindo', 'fr'); lo.classList.add('bv');
    var comFrase = !!(cu && cu.admin === true && !cu.dono && window.FRASES);   /* só a sócia */
    var calma = calmo.matches, foi = false, fase = 'bv';
    var t = setTimeout(comFrase ? fraseDoDia : sair, calma ? 1600 : 2700);
    function sair() {
      if (foi) return; foi = true;
      clearTimeout(t); lo.removeEventListener('click', clique); document.removeEventListener('keydown', tecla, true);
      lo.classList.add('saindo');
      setTimeout(function () {
        lo.style.display = 'none'; lo.classList.remove('bv', 'fr', 'saindo');
        if (txt) txt.textContent = '';
        if (cena) { var ft = cena.querySelector('#lo-fr-txt'); if (ft) ft.textContent = ''; }
      }, calma ? 150 : 700);
    }
    function fraseDoDia() {
      if (foi || fase === 'fr') return;
      fase = 'fr'; clearTimeout(t);
      var c = cenaFrase(), hoje = new Date();
      var dia = hoje.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
      c.querySelector('#lo-fr-dia').textContent = dia;
      var palavras = String(FRASES.doDia(hoje)).split(' ');
      var ini = calma ? 0 : 0.95, passo = calma ? 0 : 0.11;   /* as palavras começam quando a orquídea já abriu */
      c.querySelector('#lo-fr-txt').innerHTML = palavras.map(function (p, i) {
        return '<span style="animation-delay:' + (ini + i * passo).toFixed(2) + 's">' + esc(p) + '</span>';
      }).join(' ');
      var bt = c.querySelector('#lo-fr-bt');
      bt.style.animationDelay = (calma ? 0 : ini + palavras.length * passo + 0.35).toFixed(2) + 's';
      bt.onclick = function (e) { e.stopPropagation(); sair(); };
      lo.classList.add('fr');
      setTimeout(function () { if (!foi) try { bt.focus({ preventScroll: true }); } catch (e) {} }, calma ? 50 : (ini + palavras.length * passo + 0.6) * 1000);
    }
    function clique(e) {   /* na saudação: pula para a frase (ela) ou sai (os demais); na frase, só o botão sai */
      if (fase === 'bv') { if (comFrase) fraseDoDia(); else sair(); }
    }
    function tecla(e) {
      if (e.key !== 'Enter' && e.key !== 'Escape' && e.key !== ' ') return;
      e.preventDefault();
      if (fase === 'bv' && comFrase) fraseDoDia(); else sair();
    }
    lo.addEventListener('click', clique);
    document.addEventListener('keydown', tecla, true);
  }

  new MutationObserver(render).observe(sel, { childList: true });
  new MutationObserver(corBarra).observe(lo, { attributes: true, attributeFilter: ['style'] });
  render(); corBarra();

  return { boasVindas: boasVindas, corBarra: corBarra };
})();
