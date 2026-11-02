/* ═══════════════════════════════════════════════════════════
   SEGURANÇA · Fase 2 — porteiro (02/11/2026)
   O banco agora confere, antes de cada pedido, se veio o login do Cortex
   (a sessão que nasce quando a pessoa entra com o PIN). Este arquivo faz
   todas as telas mandarem esse login sozinhas, sem mexer em cada uma:
   todo pedido ao Supabase ganha o cabeçalho x-cortex-token.
   · Antes de entrar (lista de nomes, PIN) não há sessão: vai sem o cabeçalho,
     e o banco deixa passar só a entrada, a notinha pública e o site dos profissionais.
   · Se o banco responder que a sessão caiu (401 SESSAO_INVALIDA), a tela volta
     para a entrada, do mesmo jeito que já acontecia com a lojinha.
   Carrega logo depois do loja_api.js (precisa do LAPI).
   ═══════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (!window.fetch || window.fetch.__porteiro) return;

  var BASE = 'https://xcucoryngkkuszztpxyq.supabase.co/rest/v1/';
  var original = window.fetch.bind(window);

  function urlDe(entrada) {
    if (typeof entrada === 'string') return entrada;
    if (entrada && typeof entrada.url === 'string') return entrada.url;
    return String(entrada || '');
  }

  function porteiroFetch(entrada, opcoes) {
    var url = urlDe(entrada);
    var token = null;
    try { token = (window.LAPI && LAPI.token) ? LAPI.token() : null; } catch (e) { token = null; }
    var doSupabase = url.indexOf(BASE) === 0;

    if (doSupabase && token) {
      try {
        var cab = new Headers((opcoes && opcoes.headers) || (entrada && typeof entrada !== 'string' && entrada.headers) || {});
        if (!cab.has('x-cortex-token')) cab.set('x-cortex-token', token);
        var novas = {};
        if (opcoes) Object.keys(opcoes).forEach(function (k) { novas[k] = opcoes[k]; });
        novas.headers = cab;
        opcoes = novas;
      } catch (e) { /* se algo der errado aqui, o pedido segue como antes */ }
    }

    var promessa = original(entrada, opcoes);
    if (!doSupabase || !token) return promessa;

    return promessa.then(function (r) {
      if (r && r.status === 401) {
        r.clone().json().then(function (j) {
          if (j && j.code === 'SESSAO_INVALIDA' && window.LAPI && LAPI.cair) LAPI.cair(j.message);
        }).catch(function () {});
      }
      return r;
    });
  }
  porteiroFetch.__porteiro = true;
  window.fetch = porteiroFetch;
})();
