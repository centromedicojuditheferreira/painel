/* ═══════════════════════════════════════════════════════════════════
   Financeiro · Gaveta (FIN v1.5) — a contagem do dinheiro às cegas.
   · Secretária: conta na primeira entrada do dia, antes de abrir o Cortex (por cédula e moeda);
     quem fecha a clínica conta de novo antes de sair (quadrado "Fechar a gaveta", a partir das 21h).
     Ela nunca vê quanto deveria ter: o servidor confere depois da próxima leitura do Feegow.
     Não bateu: conta de novo. Não bateu de novo: vê a diferença e escreve o que encontrou.
   · Administrador (sócia): lança retirada e colocação de dinheiro na gaveta.
   · Dono (senha de administração): quanto deveria ter agora, as pendências com a conta inteira e o histórico.
   Tudo pelas funções fin_gaveta_* e fin_cortex_gaveta do Supabase; as tabelas ficam fechadas.
   Se a função ainda não existe no Supabase (PR publicado antes do SQL), a gaveta fica quieta.
   ═══════════════════════════════════════════════════════════════════ */
var GAVETA = (function () {
  'use strict';

  var SB = { url: 'https://xcucoryngkkuszztpxyq.supabase.co', key: 'sb_publishable_6ATQUvqBBRS5xx7jAYKlmw_2FwTuHG7' };
  var TZ = 'America/Sao_Paulo';
  var CEDULAS = [200, 100, 50, 20, 10, 5, 2], MOEDAS = [1, 0.5, 0.25, 0.1, 0.05];
  var RITMO = 60 * 1000, RITMO_CONFERINDO = 20 * 1000, RITMO_ESCONDIDO = 3 * 60 * 1000;
  var SETA = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h13M13 6l6 6-6 6"/></svg>';
  var SEM = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

  var st = {
    estado: null, instalada: true, timer: null, pedido: 0,
    vistos: {},                     /* recontar/explicar já abertos sozinhos: não reabre a cada leitura */
    loPainel: null, enviouNaEntrada: false,
    dono: null, donoCarregando: false, donoErro: '', portaErro: '', portaOcupada: false, pedidoDono: 0,
    movs: null, movsErro: '', verTodos: false
  };

  /* ── utilidades ── */
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function bt(cls, html, fn) { var b = el('button', cls, html); b.type = 'button'; if (fn) b.addEventListener('click', fn); return b; }
  function esc(s) { var d = document.createElement('span'); d.textContent = s == null ? '' : String(s); return d.innerHTML; }
  function brl(v) {
    if (typeof fmt === 'function') return fmt(Number(v || 0));
    var s = Math.abs(Number(v || 0)).toFixed(2).split('.');
    return (Number(v) < 0 ? '-' : '') + 'R$ ' + s[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ',' + s[1];
  }
  function dif(v) { var n = Number(v || 0); return (n >= 0 ? 'Sobraram ' : 'Faltaram ') + brl(Math.abs(n)); }
  function rotulo(v) { return v >= 1 ? 'R$ ' + v : 'R$ 0,' + String(Math.round(v * 100)).padStart(2, '0'); }
  function dataDe(iso) { return new Date(String(iso).slice(0, 10) + 'T12:00:00-03:00'); }
  function ddmm(iso) { var m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? m[3] + '/' + m[2] : '—'; }
  function diaLongo(iso) { return iso ? SEM[dataDe(iso).getUTCDay()] + ', ' + ddmm(iso) : ''; }
  function horaDe(ts) { return ts ? new Date(ts).toLocaleTimeString('pt-BR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }) : '—'; }
  function diaDe(ts) { return ts ? new Date(ts).toLocaleDateString('en-CA', { timeZone: TZ }) : ''; }
  function diaHora(ts) { var d = diaDe(ts); return (d && st.estado && d === st.estado.hoje ? 'hoje' : ddmm(d)) + ' às ' + horaDe(ts); }
  function primeiroNome(n) { return String(n || '').trim().split(/\s+/)[0] || ''; }
  function ehAdmin() { return typeof isAdmin === 'function' && isAdmin(); }
  function avisa(msg) { if (typeof toast === 'function') toast(msg, 'ok'); }
  function mouseFino() { try { return window.matchMedia('(pointer: fine)').matches; } catch (e) { return false; } }
  function temConferindo() { return !!(st.estado && (st.estado.contagens || []).some(function (c) { return c.situacao === 'aguardando'; })); }
  function nomeTipo(c) { return (c.tipo === 'fechamento' ? 'Fechamento' : 'Chegada') + (c.tentativa === 2 ? ' · 2ª contagem' : ''); }
  function rodape(P, botoes) { P.rodape.hidden = false; P.rodape.classList.add('fim'); botoes.forEach(function (b) { P.rodape.appendChild(b); }); }
  function resumo(t) { if (window.moldura) moldura.resumo('gaveta', t); }

  /* senha de administração: a mesma do Extrato (pedida uma vez por sessão, guardada no módulo do Financeiro) */
  function senha() { return window.FIN && FIN.senhaAdm ? FIN.senhaAdm() : st.senhaLocal || null; }
  function guardarSenha(s) { if (window.FIN && FIN.guardarSenha) FIN.guardarSenha(s); else st.senhaLocal = s || null; }
  function msgSenha(c) {
    if (c === 'BLOQUEADO_TEMPORARIAMENTE') return 'Muitas tentativas erradas. Espere 15 minutos e tente de novo.';
    if (c === 'SENHA_INVALIDA') return 'Senha incorreta.';
    return '';
  }
  function rpcSenha(fn, args) {   /* funções do dono: conferem a senha no servidor, sem a sessão do login */
    return fetch(SB.url + '/rest/v1/rpc/' + fn, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SB.key, 'Authorization': 'Bearer ' + SB.key },
      body: JSON.stringify(args || {})
    }).then(function (r) {
      return r.text().then(function (t) {
        var j = null; try { j = JSON.parse(t); } catch (e) {}
        if (!r.ok) { var er = new Error((j && (j.message || j.hint || j.details)) || ('HTTP ' + r.status)); er.status = r.status; throw er; }
        if (j && j.ok === false) { var e2 = new Error(j.msg || j.erro || 'ERRO'); e2.codigo = j.erro; throw e2; }
        return j;
      });
    });
  }

  /* ── a grade da contagem: quantas cédulas e moedas de cada valor; o total é só o que ela contou ── */
  function grade(aoMudar, aoTerminar) {
    var w = el('div', 'gv-grade'), ins = [];
    [['Cédulas', CEDULAS], ['Moedas', MOEDAS]].forEach(function (g) {
      var col = el('div', 'gv-col');
      col.appendChild(el('span', 'gv-col-t', g[0]));
      g[1].forEach(function (v) {
        var l = el('label', 'gv-l');
        l.appendChild(el('span', 'gv-l-v', esc(rotulo(v))));
        var i = document.createElement('input');
        i.type = 'text'; i.inputMode = 'numeric'; i.autocomplete = 'off'; i.maxLength = 4; i.placeholder = '0'; i.className = 'gv-q';
        i.setAttribute('data-v', String(v));
        i.setAttribute('enterkeyhint', 'next');
        i.setAttribute('aria-label', (v >= 2 ? 'Cédulas de ' : 'Moedas de ') + rotulo(v));
        l.appendChild(i); col.appendChild(l); ins.push(i);
      });
      w.appendChild(col);
    });
    ins.forEach(function (i, k) {
      i.addEventListener('input', function () { var s = i.value.replace(/\D/g, '').slice(0, 4); if (s !== i.value) i.value = s; aoMudar(); });
      i.addEventListener('focus', function () { try { i.select(); } catch (e) {} });
      i.addEventListener('keydown', function (ev) {
        if (ev.key !== 'Enter') return;
        ev.preventDefault();
        if (ins[k + 1]) ins[k + 1].focus(); else if (aoTerminar) aoTerminar();
      });
    });
    return {
      el: w,
      cedulas: function () { var o = {}; ins.forEach(function (i) { var n = parseInt(i.value, 10); if (n > 0) o[i.getAttribute('data-v')] = n; }); return o; },
      centavos: function () { return ins.reduce(function (a, i) { return a + Math.round(Number(i.getAttribute('data-v')) * 100) * (parseInt(i.value, 10) || 0); }, 0); },
      focar: function () { if (ins[0]) ins[0].focus(); },
      travar: function (sim) { ins.forEach(function (i) { i.disabled = !!sim; }); }
    };
  }

  /* ── na entrada (depois do PIN, antes de abrir o Cortex) ── */
  var lo = document.getElementById('lo'), caixa = lo && lo.querySelector('.lo-caixa');
  var ops = document.getElementById('lo-ops'), senhaBox = document.getElementById('lo-senha'), errLo = document.getElementById('lo-err');
  function erroLo(m) { if (!errLo) return; errLo.textContent = m || ''; errLo.style.display = m ? 'block' : 'none'; }
  function painelLo() {
    limparLo();
    var P = el('div', 'lo-painel gv-lo');
    caixa.insertBefore(P, errLo || null);
    if (ops) ops.hidden = true;
    if (senhaBox) senhaBox.hidden = true;
    st.loPainel = P;
    return P;
  }
  function limparLo() {
    if (st.loPainel) { st.loPainel.remove(); st.loPainel = null; erroLo(''); }
    if (ops) ops.hidden = false;
  }

  /* chamada pelo doLogin(): se ela ainda não contou hoje (ou tem um "conte de novo"), a contagem vem antes de tudo */
  function naEntrada(u, seguir) {
    if (!window.LAPI || !LAPI.token() || !caixa) { seguir(); return; }
    LAPI.gavetaEstado().then(function (e) {
      st.instalada = true; st.estado = e;
      var p = e && e.precisa;
      if (p && (p.tipo === 'chegada' || p.tipo === 'recontar')) { painelEntrada(u, p, seguir); return; }
      seguir();
    }, function (er) {
      if (er && er.status === 404) st.instalada = false;   /* gaveta ainda não instalada no Supabase */
      seguir();                                            /* sem conexão: entra; o quadrado "Contar a gaveta" aparece depois */
    });
  }

  function painelEntrada(u, p, seguir) {
    var recontar = p.tipo === 'recontar';
    var P = painelLo();
    P.innerHTML = '<p class="lo-p-tit">' + (recontar ? 'Conte a gaveta de novo.' : esc('Olá, ' + primeiroNome(u.nome) + '. Antes de começar, conte a gaveta.')) + '</p>' +
      '<p class="lo-p-txt">' + (recontar
        ? esc('A sua contagem das ' + p.hora + ' não bateu. Conte de novo, com calma, cédula por cédula.')
        : 'Digite quantas cédulas e moedas há de cada valor. Você não vê quanto deveria ter: o Cortex confere sozinho em alguns minutos.') + '</p>';
    var tot = el('p', 'gv-total', 'Total contado <b>R$ 0,00</b>');
    var ok = bt('btn-lo gv-enviar', 'Enviar contagem' + SETA, enviar);
    var g = grade(function () { tot.querySelector('b').textContent = brl(g.centavos() / 100); zero = false; }, enviar);
    P.appendChild(g.el); P.appendChild(tot); P.appendChild(ok);
    P.appendChild(bt('lo-p-volta', 'Sair', function () {
      LAPI.sair(); limparLo();
      var pin = document.getElementById('lo-pin'); if (pin) pin.value = '';
      if (typeof loadLoginUsers === 'function') loadLoginUsers();
    }));
    var e2 = document.getElementById('lo-entrar'); if (e2) e2.classList.remove('aguarde');
    var ocupado = false, zero = false;
    setTimeout(function () { if (mouseFino() && st.loPainel === P) g.focar(); }, 40);
    function enviar() {
      if (ocupado) return;
      if (g.centavos() === 0 && !zero) { zero = true; erroLo('A gaveta está vazia? Se estiver, toque em Enviar contagem de novo.'); return; }
      ocupado = true; ok.classList.add('aguarde'); erroLo(''); g.travar(true);
      LAPI.gavetaContar('chegada', g.cedulas()).then(function () {   /* recontagem: o servidor usa a contagem aberta */
        limparLo(); st.enviouNaEntrada = true; seguir();
      }, function (er) {
        ocupado = false; ok.classList.remove('aguarde'); g.travar(false);
        if (er.codigo === 'JA_CONTOU' || er.codigo === 'CONFERINDO') { limparLo(); seguir(); return; }
        erroLo(er.message || String(er));
      });
    }
  }

  /* ── dentro do Cortex: leitura periódica, quadrados no topo e janelas ── */
  function iniciar() {
    parar();
    if (!st.instalada || !window.LAPI || !LAPI.token()) { chips(); return; }
    if (st.enviouNaEntrada) {
      st.enviouNaEntrada = false;
      setTimeout(function () { avisa('Contagem enviada. O Cortex confere em alguns minutos.'); }, 3200);
    }
    st.timer = setTimeout(atualizar, 3000);   /* depois da saudação */
  }
  function parar() { if (st.timer) { clearTimeout(st.timer); st.timer = null; } }
  function agendar() {
    parar();
    st.timer = setTimeout(atualizar, document.hidden ? RITMO_ESCONDIDO : (temConferindo() ? RITMO_CONFERINDO : RITMO));
  }
  function atualizar() {
    if (!st.instalada || !window.LAPI || !LAPI.token()) return Promise.resolve();
    var meu = ++st.pedido;
    return LAPI.gavetaEstado().then(function (e) {
      if (meu !== st.pedido || !LAPI.token()) return;
      var antes = st.estado;
      st.estado = e;
      notar(antes, e);
      chips();
      if (naTela()) desenhar();
      agendar();
    }, function (er) {
      if (meu !== st.pedido) return;
      if (er && er.status === 404) { st.instalada = false; chips(); if (naTela()) desenhar(); return; }
      agendar();
    });
  }
  document.addEventListener('visibilitychange', function () { if (!document.hidden && st.timer && window.LAPI && LAPI.token()) atualizar(); });

  /* o que mudou desde a última leitura: "bateu" vira aviso; "conte de novo" e "diferença" abrem a janela uma vez */
  function notar(antes, e) {
    if (!antes || !e || e.ok === false) return;
    var velhos = {};
    (antes.contagens || []).forEach(function (c) { velhos[c.id] = c.situacao; });
    (e.contagens || []).forEach(function (c) {
      if (velhos[c.id] === 'aguardando' && (c.situacao === 'ok' || c.situacao === 'abertura')) avisa('Gaveta conferida: a contagem das ' + c.hora + ' bateu.');
    });
    var p = e.precisa;
    if (p && (p.tipo === 'recontar' || p.tipo === 'explicar') && !st.vistos[p.tipo + p.id] && !document.querySelector('.pop')) {
      st.vistos[p.tipo + p.id] = true;
      if (p.tipo === 'recontar') abrirContagem('recontar'); else abrirExplicar(p);
    }
  }

  function chips() {
    if (!window.moldura || !moldura.alertasExtra) return;
    var e = st.estado, L = [];
    if (st.instalada && e && e.ok !== false && window.LAPI && LAPI.token()) {
      var p = e.precisa, f = e.fechamento || {};
      if (p && p.tipo === 'recontar') {
        L.push({ chave: 'gaveta-recontar', rot: 'Gaveta: contar de novo', dica: 'A contagem das ' + p.hora + ' não bateu. Conte de novo.',
                 acao: function () { abrirContagem('recontar'); } });
      } else if (p && p.tipo === 'explicar') {
        L.push({ chave: 'gaveta-explicar', rot: 'Gaveta: diferença', dica: 'Veja a diferença e escreva o que você encontrou.',
                 acao: function () { abrirExplicar(st.estado && st.estado.precisa); } });
      } else if (p && p.tipo === 'chegada') {
        L.push({ chave: 'gaveta-chegada', rot: 'Contar a gaveta', dica: 'Você ainda não contou a gaveta hoje.',
                 acao: function () { abrirContagem('chegada'); } });
      }
      if (!e.admin && f.mostrar && !f.feito && !(p && p.tipo === 'recontar') && !temConferindo()) {
        L.push({ chave: 'gaveta-fechar', rot: 'Fechar a gaveta', dica: 'Quem fecha a clínica conta a gaveta antes de sair.',
                 acao: function () { abrirContagem('fechamento'); } });
      }
    }
    moldura.alertasExtra(L);
  }

  /* janela da contagem dentro do Cortex: chegada (se não contou na entrada), recontagem ou fechamento */
  function abrirContagem(tipo) {
    if (!window.moldura || !window.LAPI) return;
    var recontar = tipo === 'recontar', fechar = tipo === 'fechamento';
    var p = st.estado && st.estado.precisa;
    var P = moldura.pop({ largura: '600px', titulo: recontar ? 'Contar a gaveta de novo' : (fechar ? 'Fechar a gaveta' : 'Contar a gaveta'), classe: 'gv-pop' });
    P.corpo.appendChild(el('div', 'pp-cab', '<h2>' + (recontar ? 'Conte a gaveta de novo' : (fechar ? 'Contagem de fechamento' : 'Contagem da gaveta')) + '</h2>' +
      '<span class="pp-sub">' + esc(recontar
        ? 'A contagem das ' + ((p && p.hora) || '') + ' não bateu. Conte de novo, com calma, cédula por cédula.'
        : (fechar ? 'Use quando for fechar a clínica: conte todo o dinheiro da gaveta antes de sair.' : 'Conte todo o dinheiro da gaveta.') + ' Você não vê quanto deveria ter: o Cortex confere sozinho em alguns minutos.') + '</span>'));
    var tot = el('p', 'gv-total', 'Total contado <b>R$ 0,00</b>');
    var g = grade(function () { tot.querySelector('b').textContent = brl(g.centavos() / 100); zero = false; }, enviar);
    P.corpo.appendChild(g.el);
    P.corpo.appendChild(tot);
    var aviso = el('p', 'gv-erro'); aviso.hidden = true; aviso.setAttribute('role', 'alert'); P.corpo.appendChild(aviso);
    var ok = bt('btn btn-p', 'Enviar contagem', enviar), zero = false, ocupado = false;
    rodape(P, [bt('btn btn-s', 'Cancelar', function () { P.fechar(); }), ok]);
    setTimeout(function () { if (P.aberto && mouseFino()) g.focar(); }, 30);
    function mostrar(m) { aviso.textContent = m; aviso.hidden = false; }
    function enviar() {
      if (ocupado) return;
      if (g.centavos() === 0 && !zero) { zero = true; mostrar('A gaveta está vazia? Se estiver, toque em Enviar contagem de novo.'); return; }
      ocupado = true; ok.disabled = true; ok.textContent = 'Enviando…'; aviso.hidden = true; g.travar(true);
      LAPI.gavetaContar(fechar ? 'fechamento' : 'chegada', g.cedulas()).then(function () {
        P.fechar(); avisa('Contagem enviada. O Cortex confere em alguns minutos.'); atualizar();
      }, function (er) {
        ocupado = false; ok.disabled = false; ok.textContent = 'Enviar contagem'; g.travar(false);
        mostrar(er.message || String(er));
        if (er.codigo === 'JA_FECHADA' || er.codigo === 'JA_CONTOU' || er.codigo === 'CONFERINDO') atualizar();
      });
    }
  }

  /* depois da segunda contagem errada: ela vê a diferença e escreve o que encontrou */
  function abrirExplicar(p) {
    if (!p || !window.moldura || !window.LAPI) return;
    var hoje = st.estado && st.estado.hoje;
    var quando = (p.dia && p.dia !== hoje ? ddmm(p.dia) + ' às ' : 'às ') + p.hora;
    var P = moldura.pop({ largura: '560px', titulo: 'Gaveta', classe: 'gv-pop' });
    P.corpo.appendChild(el('div', 'pp-cab', '<span class="pp-alerta">A gaveta não bateu</span><h2 class="gv-dif">' + esc(dif(p.diferenca)) + '</h2>' +
      '<span class="pp-sub">' + esc('Contagem ' + (p.contagem === 'fechamento' ? 'de fechamento' : 'de chegada') + ' ' + quando +
        (p.sem_recontagem ? ', sem a segunda contagem.' : ', depois de contar duas vezes.')) + '</span>'));
    P.corpo.appendChild(el('div', 'pp-caixa', '<span class="pp-rot">O que conferir</span><span class="pp-txt">' + esc(Number(p.diferenca) >= 0
      ? 'Sobrou dinheiro. Veja se algum pagamento em dinheiro ficou sem lançar no Feegow ou na conveniência, ou se foi lançado como Pix ou cartão.'
      : 'Faltou dinheiro. Veja se algum lançamento em dinheiro era Pix ou cartão, se algo foi lançado duas vezes ou se o troco saiu errado.') +
      '</span><span class="pp-txt">' + esc('A administração já foi avisada. Escreva abaixo o que você encontrou; se corrigir o lançamento, a próxima contagem confirma sozinha.') + '</span>'));
    var ta = document.createElement('textarea'); ta.className = 'fc'; ta.rows = 4; ta.maxLength = 1000; ta.placeholder = 'O que você encontrou?';
    ta.setAttribute('aria-label', 'O que você encontrou');
    P.corpo.appendChild(ta);
    var aviso = el('p', 'gv-erro'); aviso.hidden = true; aviso.setAttribute('role', 'alert'); P.corpo.appendChild(aviso);
    var ok = bt('btn btn-p', 'Enviar', function () {
      if (!ta.value.trim()) { aviso.textContent = 'Escreva o que você encontrou.'; aviso.hidden = false; ta.focus(); return; }
      ok.disabled = true; ok.textContent = 'Enviando…'; aviso.hidden = true;
      LAPI.gavetaExplicar(p.id, ta.value.trim()).then(function () {
        P.fechar(); avisa('Obrigado. O que você encontrou foi enviado.'); atualizar();
      }, function (er) { ok.disabled = false; ok.textContent = 'Enviar'; aviso.textContent = er.message || String(er); aviso.hidden = false; });
    });
    rodape(P, [bt('btn btn-s', 'Depois', function () { P.fechar(); }), ok]);
    setTimeout(function () { if (P.aberto && mouseFino()) ta.focus(); }, 30);
  }

  /* ════════════════════════ tela Financeiro → Gaveta ════════════════════════ */
  function raiz() {
    var s = document.getElementById('s-gaveta'); if (!s) return null;
    var r = s.querySelector(':scope > .gv-raiz');
    if (!r) { r = el('div', 'gv-raiz'); s.appendChild(r); }
    return r;
  }
  function naTela() { var s = document.getElementById('s-gaveta'); return !!(s && s.classList.contains('active')); }

  function abrir() {
    desenhar();
    atualizar();
    if (ehAdmin()) { carregarMovs(); if (senha()) carregarDono(); }
  }

  function desenhar() {
    var r = raiz(); if (!r) return;
    if (!st.instalada) { resumo(''); r.innerHTML = '<div class="lista-vazio">A gaveta ainda não foi instalada no servidor (FIN v1.5).</div>'; return; }
    var e = st.estado;
    var antes = r.querySelector('.lista-corpo'), rolou = antes ? antes.scrollTop : 0;
    r.innerHTML = '';
    var wrap = el('div', 'duas-col');
    if (ehAdmin()) { wrap.appendChild(listaDono()); wrap.appendChild(ladoAdmin(e)); }
    else { wrap.appendChild(listaHoje(e)); wrap.appendChild(ladoSecretaria(e)); }
    r.appendChild(wrap);
    var c2 = r.querySelector('.lista-corpo'); if (c2) c2.scrollTop = rolou;
    if (ehAdmin()) {
      var d = st.dono;
      resumo(d ? (d.pendencias.length ? (d.pendencias.length === 1 ? '1 pendência aberta' : d.pendencias.length + ' pendências abertas') : 'Nenhuma pendência aberta') +
                 (d.ultima ? ' · última contagem ' + diaHora(d.ultima.contada_em) : '') : 'Retirada, colocação e histórico');
    } else {
      var cs = (e && e.contagens) || [];
      resumo(e ? (cs.length ? (cs.length === 1 ? '1 contagem sua hoje' : cs.length + ' contagens suas hoje') : 'Você ainda não contou hoje') : '');
    }
  }

  /* situação de uma contagem, para a secretária (nunca o esperado; a diferença só na pendência dela) */
  function situMinha(c) {
    switch (c.situacao) {
      case 'aguardando': return { rot: 'conferindo', cls: 'espera', sub: 'O resultado sai em alguns minutos' };
      case 'ok': case 'abertura': return { rot: 'OK', cls: 'ok', sub: 'Bateu' };
      case 'recontar': return { rot: 'conte de novo', cls: 'pend', sub: 'Não bateu' };
      case 'recontada': return { rot: 'não bateu', cls: 'espera', sub: 'Você contou de novo' };
      case 'superada': return { rot: 'resolvido', cls: 'espera', sub: 'Outra contagem bateu depois' };
      case 'pendencia': return { rot: dif(c.diferenca), cls: c.fechada ? 'espera' : 'pend',
                                 sub: c.fechada ? 'Resolvida' : (c.explicada ? 'Explicação enviada' : 'Escreva o que você encontrou') };
    }
    return { rot: c.situacao, cls: 'espera', sub: '' };
  }

  function listaHoje(e) {
    var sec = el('section', 'lista gv-lista'); sec.setAttribute('aria-label', 'Suas contagens de hoje');
    sec.appendChild(el('div', 'painel-cab', '<h2>Suas contagens de hoje</h2><span>' + esc(e ? diaLongo(e.hoje) : '') + '</span>'));
    var corpo = el('div', 'lista-corpo');
    var cs = (e && e.contagens) || [];
    if (!e) corpo.appendChild(el('div', 'lista-vazio', 'Carregando…'));
    else if (!cs.length) corpo.appendChild(el('div', 'lista-vazio', 'Você ainda não contou a gaveta hoje.'));
    cs.forEach(function (c) {
      var s = situMinha(c);
      var acao = c.situacao === 'recontar' ? function () { abrirContagem('recontar'); }
        : (c.situacao === 'pendencia' && !c.fechada && !c.explicada && e.precisa && e.precisa.id === c.id ? function () { abrirExplicar(e.precisa); } : null);
      var l = acao ? bt('linha gv-l2', '', acao) : el('div', 'linha gv-l2 parada');
      l.innerHTML = '<span class="h">' + esc(c.hora) + '</span><span class="q"><span class="nm">' + esc(nomeTipo(c)) + '</span><span class="mt">' + esc(s.sub) + '</span></span>' +
        '<span class="dir"><span class="gv-st ' + s.cls + '">' + esc(s.rot) + '</span></span>';
      corpo.appendChild(l);
    });
    sec.appendChild(corpo);
    return sec;
  }

  function ladoSecretaria(e) {
    var l = el('div', 'lado');
    var s = el('section', 'painel gv-acoes-p');
    s.appendChild(el('div', 'painel-cab', '<h2>O que fazer</h2>'));
    var a = el('div', 'gv-acoes');
    var p = e && e.precisa, f = (e && e.fechamento) || {};
    if (p && p.tipo === 'recontar') a.appendChild(bt('btn btn-p', 'Contar de novo', function () { abrirContagem('recontar'); }));
    else if (p && p.tipo === 'explicar') a.appendChild(bt('btn btn-p', 'Ver a diferença', function () { abrirExplicar(p); }));
    else if (p && p.tipo === 'chegada') a.appendChild(bt('btn btn-p', 'Contar a gaveta', function () { abrirContagem('chegada'); }));
    if (e && f.feito) a.appendChild(el('p', 'gv-nota', esc('A gaveta foi fechada hoje às ' + f.hora + ' por ' + f.quem + '.')));
    else if (e) {
      a.appendChild(bt('btn btn-s', 'Fechar a gaveta', function () { abrirContagem('fechamento'); }));
      a.appendChild(el('p', 'gv-nota', esc('Quem fecha a clínica conta a gaveta antes de sair. A partir das ' + (f.botao || '21:00') + ' aparece o quadrado no topo.')));
    }
    if (!p && e && !f.feito) a.insertBefore(el('p', 'gv-nota', 'Nada pendente para você agora.'), a.firstChild);
    s.appendChild(a);
    l.appendChild(s);
    l.appendChild(el('section', 'painel nota-lado', '<h2>Como funciona</h2><ul class="gv-ul">' +
      '<li>Cada secretária conta a gaveta quando chega; quem fecha conta de novo antes de sair.</li>' +
      '<li>Digite quantas cédulas e moedas há de cada valor. Você não vê quanto deveria ter.</li>' +
      '<li>O Cortex confere sozinho em alguns minutos, depois da próxima leitura do Feegow.</li>' +
      '<li>Não bateu: conte de novo. Não bateu de novo: você vê a diferença e escreve o que encontrou.</li></ul>'));
    return l;
  }

  /* ── Administrador: retirada e colocação (sessão do login) ── */
  function carregarMovs() {
    if (!window.LAPI || !LAPI.token()) return;
    LAPI.gavetaMovs(31).then(function (m) { st.movs = m; st.movsErro = ''; if (naTela()) desenhar(); },
      function (er) { if (er && er.status === 404) st.instalada = false; st.movsErro = er.message || String(er); if (naTela()) desenhar(); });
  }

  function ladoAdmin(e) {
    var l = el('div', 'lado');
    var d = st.dono;
    if (d) {
      var g = el('section', 'painel lj-cx gv-agora');
      g.appendChild(el('div', 'lj-grande com-linha', '<h2 class="lj-grande-rot">Na gaveta agora, pela conta</h2>' +
        '<span class="lj-grande-n">' + esc(d.esperado_agora != null ? brl(d.esperado_agora) : '—') + '</span>' +
        '<span class="lj-grande-l2">' + esc(d.abertura ? 'Desde a abertura de ' + diaHora(d.abertura.contada_em) : 'Esperando a primeira contagem') + '</span>'));
      if (d.abertas != null && Math.abs(Number(d.abertas)) >= 0.005) {
        g.appendChild(el('div', 'lj-cx-l', '<span>Com as pendências abertas</span><b>' + esc(brl(d.esperado_proxima)) + '</b>'));
        g.appendChild(el('p', 'lj-nota gv-nota-cx', 'É o que a próxima contagem deve achar, para a próxima secretária não pagar pela diferença de antes.'));
      }
      if (d.ultima) g.appendChild(el('div', 'lj-cx-l', '<span>Última contagem</span><b>' + esc(diaHora(d.ultima.contada_em) + ' · ' + d.ultima.quem) + '</b>'));
      if (d.conferindo) g.appendChild(el('div', 'lj-cx-l', '<span>Conferindo agora</span><b>' + esc(d.conferindo) + '</b>'));
      l.appendChild(g);
    }
    var s = el('section', 'painel gv-movs');
    s.appendChild(el('div', 'painel-cab', '<h2>Retirada e colocação</h2><span>só o Administrador</span>'));
    var bts = el('div', 'gv-acoes gv-acoes-lin');
    bts.appendChild(bt('btn btn-s btn-g txt-vermelho', 'Retirada', function () { abrirMov('retirada'); }));
    bts.appendChild(bt('btn btn-s btn-g txt-verde', 'Colocação', function () { abrirMov('colocacao'); }));
    s.appendChild(bts);
    if (st.movsErro) s.appendChild(el('div', 'lista-vazio erro', esc(st.movsErro)));
    else if (!st.movs) s.appendChild(el('div', 'lista-vazio', 'Carregando…'));
    else if (!st.movs.length) s.appendChild(el('div', 'lista-vazio', 'Nenhuma retirada ou colocação nos últimos 31 dias.'));
    else {
      var lista = el('div', 'gv-movs-l');
      (st.verTodos ? st.movs : st.movs.slice(0, 8)).forEach(function (m) { lista.appendChild(linhaMov(m)); });
      s.appendChild(lista);
      if (st.movs.length > 8) s.appendChild(bt('gv-mais', st.verTodos ? 'Mostrar menos' : 'Ver todas (' + st.movs.length + ')', function () { st.verTodos = !st.verTodos; desenhar(); }));
    }
    l.appendChild(s);
    var f = (e && e.fechamento) || {};
    var fc = el('section', 'painel gv-acoes-p');
    fc.appendChild(el('div', 'painel-cab', '<h2>Fechamento de hoje</h2>'));
    var a = el('div', 'gv-acoes');
    if (f.feito) a.appendChild(el('p', 'gv-nota', esc('A gaveta foi fechada às ' + f.hora + ' por ' + f.quem + '.')));
    else if (e) {
      a.appendChild(el('p', 'gv-nota', esc('Ainda não fechada. Se ninguém fechar até as ' + (f.aviso || '22:00') + ', o aviso vai para o Telegram.')));
      a.appendChild(bt('btn btn-s', 'Fechar a gaveta', function () { abrirContagem('fechamento'); }));
    }
    fc.appendChild(a);
    l.appendChild(fc);
    return l;
  }

  function linhaMov(m) {
    var ret = m.tipo === 'retirada';
    var w = el('div', 'gv-mov' + (m.marcado_erro ? ' erro' : ''));
    w.innerHTML = '<span class="gv-mov-q"><b>' + esc((ret ? 'Retirada' : 'Colocação') + (m.obs ? ' · ' + m.obs : '')) + '</b>' +
      '<small>' + esc(diaHora(m.feito_em) + (m.marcado_erro ? ' · marcada como erro: ' + (m.motivo_erro || '') : '')) + '</small></span>' +
      '<span class="gv-mov-v' + (ret ? ' txt-vermelho' : '') + '">' + esc((ret ? '− ' : '') + brl(m.valor)) + '</span>';
    if (!m.marcado_erro) w.appendChild(bt('gv-mov-erro', 'Erro', function () { marcarErroMov(m); }));
    return w;
  }

  function valorDe(txt) {   /* "1.234,56", "1234,56" ou "1234.56" → 1234.56 */
    var s = String(txt || '').trim().replace(/\s|R\$/g, '');
    if (s.indexOf(',') >= 0) s = s.replace(/\./g, '').replace(',', '.');
    if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
    var v = Number(s);
    return v > 0 ? Math.round(v * 100) / 100 : null;
  }

  function abrirMov(tipo) {
    if (!window.moldura) return;
    var ret = tipo === 'retirada';
    var P = moldura.pop({ largura: '480px', titulo: 'Gaveta', classe: 'gv-pop' });
    P.corpo.appendChild(el('div', 'pp-cab', '<h2>' + (ret ? 'Retirada de dinheiro' : 'Colocação de dinheiro') + '</h2><span class="pp-sub">' +
      (ret ? 'Dinheiro que sai da gaveta, como o depósito no Sicoob.' : 'Dinheiro que entra na gaveta, como troco.') + '</span>'));
    var f = el('div', 'gv-form');
    f.innerHTML = '<label class="gv-campo"><span>Valor</span><input type="text" class="fc" inputmode="decimal" autocomplete="off" placeholder="0,00"></label>' +
      '<label class="gv-campo"><span>Observação (opcional)</span><input type="text" class="fc" maxlength="300" autocomplete="off" placeholder="' + (ret ? 'Depósito Sicoob' : 'Troco') + '"></label>';
    P.corpo.appendChild(f);
    var ins = f.querySelectorAll('input'), aviso = el('p', 'gv-erro'); aviso.hidden = true; aviso.setAttribute('role', 'alert'); P.corpo.appendChild(aviso);
    var ok = bt('btn btn-p', ret ? 'Registrar retirada' : 'Registrar colocação', enviar), ocupado = false;
    rodape(P, [bt('btn btn-s', 'Cancelar', function () { P.fechar(); }), ok]);
    ins[0].addEventListener('keydown', function (ev) { if (ev.key === 'Enter') { ev.preventDefault(); ins[1].focus(); } });
    ins[1].addEventListener('keydown', function (ev) { if (ev.key === 'Enter') { ev.preventDefault(); enviar(); } });
    setTimeout(function () { if (P.aberto) ins[0].focus(); }, 30);
    function enviar() {
      if (ocupado) return;
      var v = valorDe(ins[0].value);
      if (v == null) { aviso.textContent = 'Informe um valor válido, como 150,00.'; aviso.hidden = false; ins[0].focus(); return; }
      ocupado = true; ok.disabled = true; aviso.hidden = true;
      LAPI.gavetaMov(tipo, v, ins[1].value.trim()).then(function () {
        P.fechar(); avisa((ret ? 'Retirada' : 'Colocação') + ' de ' + brl(v) + ' registrada.'); carregarMovs(); if (senha()) carregarDono();
      }, function (er) { ocupado = false; ok.disabled = false; aviso.textContent = er.message || String(er); aviso.hidden = false; });
    }
  }

  function marcarErroMov(m) {
    var P = moldura.pop({ largura: '480px', titulo: 'Gaveta', classe: 'gv-pop' });
    P.corpo.appendChild(el('div', 'pp-cab', '<h2>Marcar como erro</h2><span class="pp-sub">' +
      esc((m.tipo === 'retirada' ? 'Retirada' : 'Colocação') + ' de ' + brl(m.valor) + ', ' + diaHora(m.feito_em) + '. Nada é apagado: fica marcada e sai da conta da gaveta.') + '</span>'));
    var ta = document.createElement('textarea'); ta.className = 'fc'; ta.rows = 3; ta.maxLength = 300; ta.placeholder = 'Motivo (por exemplo: o valor certo era 30,00)';
    P.corpo.appendChild(ta);
    var aviso = el('p', 'gv-erro'); aviso.hidden = true; P.corpo.appendChild(aviso);
    var ok = bt('btn btn-p', 'Marcar como erro', function () {
      if (!ta.value.trim()) { aviso.textContent = 'Descreva o motivo do erro.'; aviso.hidden = false; ta.focus(); return; }
      ok.disabled = true;
      LAPI.gavetaMovErro(m.id, ta.value.trim()).then(function () { P.fechar(); avisa('Marcada como erro.'); carregarMovs(); if (senha()) carregarDono(); },
        function (er) { ok.disabled = false; aviso.textContent = er.message || String(er); aviso.hidden = false; });
    });
    rodape(P, [bt('btn btn-s', 'Cancelar', function () { P.fechar(); }), ok]);
    setTimeout(function () { if (P.aberto) ta.focus(); }, 30);
  }

  /* ── dono: histórico, com a senha de administração ── */
  function carregarDono() {
    var s = senha(); if (!s) { if (naTela()) desenhar(); return Promise.resolve(); }
    var meu = ++st.pedidoDono;
    st.donoCarregando = true;
    return rpcSenha('fin_cortex_gaveta', { p_senha: s, p_dias: 14 }).then(function (d) {
      if (meu !== st.pedidoDono) return;
      st.dono = d; st.donoErro = ''; st.donoCarregando = false;
      if (naTela()) desenhar();
    }, function (er) {
      if (meu !== st.pedidoDono) return;
      st.donoCarregando = false;
      if (er.codigo === 'SENHA_INVALIDA' || er.codigo === 'BLOQUEADO_TEMPORARIAMENTE') { guardarSenha(null); st.dono = null; st.portaErro = msgSenha(er.codigo); }
      else if (er.status === 404) st.instalada = false;
      else st.donoErro = 'Não consegui ler o histórico: ' + (er.message || String(er));
      if (naTela()) desenhar();
    });
  }

  function listaDono() {
    var sec = el('section', 'lista alta gv-lista'); sec.setAttribute('aria-label', 'Histórico da gaveta');
    if (!senha()) {
      sec.appendChild(el('div', 'painel-cab', '<h2>Histórico da gaveta</h2><span>senha de administração</span>'));
      var box = el('div', 'cf-porta gv-porta');
      box.innerHTML = '<p>O histórico mostra quanto deveria ter na gaveta, as pendências com a conta inteira e as contagens dos últimos 14 dias. ' +
        'Abre com a senha de administração, a mesma do Extrato.</p><div class="cf-porta-l"><input type="password" class="fc" autocomplete="off" aria-label="Senha de administração" placeholder="Senha de administração">' +
        '<button type="button" class="btn btn-p">Entrar</button></div><p class="cf-porta-erro"' + (st.portaErro ? '' : ' hidden') + '>' + esc(st.portaErro) + '</p>';
      sec.appendChild(box);
      var inp = box.querySelector('input'), ok = box.querySelector('button'), er = box.querySelector('.cf-porta-erro');
      function tenta() {
        var s = inp.value; if (!s || st.portaOcupada) return;
        st.portaOcupada = true; ok.disabled = true; ok.textContent = 'Entrando…'; er.hidden = true;
        rpcSenha('fin_cortex_gaveta', { p_senha: s, p_dias: 14 }).then(function (d) {
          st.portaOcupada = false; st.portaErro = ''; guardarSenha(s); st.dono = d; desenhar();
        }, function (e) {
          st.portaOcupada = false; ok.disabled = false; ok.textContent = 'Entrar';
          er.textContent = msgSenha(e.codigo) || ('Não consegui conferir a senha: ' + (e.message || String(e))); er.hidden = false;
          inp.select();
        });
      }
      ok.addEventListener('click', tenta);
      inp.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') tenta(); });
      return sec;
    }
    var d = st.dono;
    sec.appendChild(el('div', 'painel-cab', '<h2>Histórico da gaveta</h2><span>últimos 14 dias</span>'));
    var corpo = el('div', 'lista-corpo');
    if (st.donoErro) corpo.appendChild(el('div', 'lista-vazio erro', esc(st.donoErro)));
    if (!d) { corpo.appendChild(el('div', 'lista-vazio', 'Carregando…')); sec.appendChild(corpo); return sec; }
    if (d.pendencias.length) {
      corpo.appendChild(el('div', 'dia-cab fin-cab pend', '<b>Pendências abertas</b><span>' + (d.pendencias.length === 1 ? '1 para resolver' : d.pendencias.length + ' para resolver') + '</span>'));
      d.pendencias.forEach(function (x) { corpo.appendChild(linhaHist(x, true)); });
    }
    if (!d.historico.length) corpo.appendChild(el('div', 'lista-vazio', d.abertura ? 'Nenhuma contagem nos últimos 14 dias.' : 'Nenhuma contagem ainda. A primeira contagem vira o ponto de partida da gaveta.'));
    var dia = null;
    d.historico.forEach(function (h) {
      var dd = diaDe(h.contada_em);
      if (dd !== dia) { dia = dd; corpo.appendChild(el('div', 'dia-cab', '<b>' + esc(dd === d.hoje ? 'Hoje' : diaLongo(dd)) + '</b><span></span>')); }
      corpo.appendChild(linhaHist(h, false));
    });
    sec.appendChild(corpo);
    return sec;
  }

  var COMO = { corrigido: 'corrigido nos lançamentos', quebra: 'quebra de caixa', sozinha: 'acertou na contagem seguinte' };
  function situDono(h) {
    switch (h.situacao) {
      case 'abertura': return { v: brl(h.valor), rot: 'abertura', cls: 'espera' };
      case 'ok': return { rot: 'OK', cls: 'ok' };
      case 'aguardando': return { rot: 'conferindo', cls: 'espera' };
      case 'recontar': return { rot: 'não bateu · esperando recontagem', cls: 'espera' };
      case 'recontada': return { rot: 'não bateu · recontou', cls: 'espera' };
      case 'superada': return { rot: 'não bateu · outra contagem bateu depois', cls: 'espera' };
      case 'pendencia': return h.fechada_em ? { v: dif(h.diferenca), rot: 'fechada: ' + (COMO[h.fechada_como] || h.fechada_como), cls: 'espera', vcls: '' }
                                          : { v: dif(h.diferenca), rot: 'pendência' + (h.sem_recontagem ? ' · sem recontagem' : ''), cls: 'pend', vcls: 'fin-pend-v' };
    }
    return { rot: h.situacao, cls: 'espera' };
  }
  function linhaHist(h, comDia) {
    var s = situDono(h), ehPend = h.situacao === 'pendencia';
    var b = ehPend ? bt('linha gv-l2', '', function () { detalhePend(h); }) : el('div', 'linha gv-l2 parada');
    if (ehPend) b.setAttribute('aria-haspopup', 'dialog');
    var nm = h.quem + ' · ' + (h.tipo === 'fechamento' ? 'fechamento' : 'chegada') + (h.tentativa === 2 ? ' · 2ª contagem' : '');
    var dd = diaDe(h.contada_em), hoje = st.dono && st.dono.hoje;
    b.innerHTML = '<span class="h">' + esc(comDia ? (dd === hoje ? 'hoje' : ddmm(dd)) : horaDe(h.contada_em)) + '</span>' +
      '<span class="q"><span class="nm">' + esc(nm) + '</span><span class="mt">' + esc(comDia ? 'às ' + horaDe(h.contada_em) : (h.explicacoes && h.explicacoes.length ? 'com explicação' : '')) + '</span></span>' +
      '<span class="dir">' + (s.v ? '<span class="valor ' + (s.vcls || '') + '">' + esc(s.v) + '</span>' : '') + '<span class="gv-st ' + s.cls + (s.v ? ' pequeno' : '') + '">' + esc(s.rot) + '</span></span>';
    return b;
  }

  function linhaConta(box, rot, val, itens, cls) {
    var w = el('div', 'gv-c' + (cls ? ' ' + cls : ''));
    w.appendChild(el('div', 'gv-c-l', '<span>' + esc(rot) + '</span><b>' + esc(val) + '</b>'));
    (itens || []).forEach(function (t) { w.appendChild(el('div', 'gv-c-i', '<span>' + esc(t[0]) + '</span><span>' + esc(t[1]) + '</span>')); });
    box.appendChild(w);
  }
  function detalhePend(x) {
    if (!window.moldura) return;
    var P = moldura.pop({ largura: '620px', titulo: 'Pendência da gaveta', classe: 'gv-pop' });
    var aberta = !x.fechada_em;
    P.corpo.appendChild(el('div', 'pp-cab', (aberta ? '<span class="pp-alerta">Pendência aberta</span>' : '') + '<h2 class="' + (aberta ? 'gv-dif' : '') + '">' + esc(dif(x.diferenca)) + '</h2>' +
      '<span class="pp-sub">' + esc('Contagem ' + (x.tipo === 'fechamento' ? 'de fechamento' : 'de chegada') + ' de ' + x.quem + ', ' + diaHora(x.contada_em) +
        (x.tentativa === 2 ? ' (2ª contagem)' : (x.sem_recontagem ? ' (não contou de novo)' : ''))) + '</span>'));
    var k = x.conta || {}, d = k.desde_ref || {}, rf = k.ref || {};
    var box = el('div', 'gv-conta');
    var rot = rf.situacao === 'abertura' ? 'abertura' : (rf.situacao === 'pendencia' ? 'com diferença' : 'bateu');
    linhaConta(box, 'Contagem anterior (' + rot + '), ' + diaHora(rf.contada_em) + ', ' + (rf.quem || ''), brl(rf.valor));
    linhaConta(box, '+ Dinheiro no Feegow', brl(d.feegow), (d.itens_feegow || []).map(function (i) { return [horaDe(i.visto_em) + ' · ' + i.paciente, brl(i.valor)]; }));
    linhaConta(box, '+ Dinheiro na conveniência', brl(d.loja), (d.itens_loja || []).map(function (i) { return [horaDe(i.quando) + ' · ' + i.desc + (i.secretaria ? ' · ' + i.secretaria : ''), brl(i.valor)]; }));
    var movs = d.itens_mov || [];
    if (Number(d.retiradas) > 0) linhaConta(box, '− Retiradas da sócia', '− ' + brl(d.retiradas), movs.filter(function (m) { return m.tipo === 'retirada'; })
      .map(function (m) { return [horaDe(m.feito_em) + ' · ' + m.quem + (m.obs ? ' · ' + m.obs : ''), '− ' + brl(m.valor)]; }));
    if (Number(d.colocacoes) > 0) linhaConta(box, '+ Colocações da sócia', brl(d.colocacoes), movs.filter(function (m) { return m.tipo === 'colocacao'; })
      .map(function (m) { return [horaDe(m.feito_em) + ' · ' + m.quem + (m.obs ? ' · ' + m.obs : ''), brl(m.valor)]; }));
    if (Math.abs(Number(d.ajustes || 0)) >= 0.005) linhaConta(box, 'Ajustes (pendências de antes e lançamentos corrigidos)', (Number(d.ajustes) > 0 ? '+ ' : '− ') + brl(Math.abs(d.ajustes)));
    linhaConta(box, '= A conta dava', brl(x.esperado), null, 'soma');
    linhaConta(box, 'Contou', brl(x.valor), null, 'soma');
    if (x.primeira) linhaConta(box, '1ª contagem, ' + diaHora(x.primeira.contada_em), brl(x.primeira.valor), null, 'cinza');
    P.corpo.appendChild(box);
    var ex = x.explicacoes || [];
    var bl = el('div', 'pp-bloco');
    bl.appendChild(el('span', 'pp-rot', 'O que a secretária encontrou'));
    if (!ex.length) bl.appendChild(el('span', 'pp-txt cinza', 'Ainda não escreveu.'));
    ex.forEach(function (e) { bl.appendChild(el('span', 'pp-txt', esc('“' + e.texto + '” — ' + e.por + ', ' + diaHora(e.quando)))); });
    P.corpo.appendChild(bl);
    if (!aberta) {
      P.corpo.appendChild(el('div', 'pp-caixa', '<span class="pp-rot">Fechada</span><span class="pp-txt">' +
        esc((COMO[x.fechada_como] || x.fechada_como) + ', ' + diaHora(x.fechada_em) + (x.fechada_obs ? '. ' + x.fechada_obs : '.')) + '</span>'));
      rodape(P, [bt('btn btn-s', 'Fechar', function () { P.fechar(); })]);
      return;
    }
    P.corpo.appendChild(el('div', 'pp-caixa', '<span class="pp-rot">Como fechar</span>' +
      '<span class="pp-txt"><b>Corrigido nos lançamentos:</b> o erro foi achado e corrigido no Feegow ou na conveniência. Se não foi, a próxima contagem acusa de novo. ' +
      'Quando a contagem seguinte bate, a pendência fecha sozinha.</span>' +
      '<span class="pp-txt"><b>Quebra de caixa:</b> o dinheiro faltou ou sobrou de verdade. A conta da gaveta passa a aceitar o valor contado.</span>'));
    var obs = document.createElement('textarea'); obs.className = 'fc'; obs.rows = 2; obs.maxLength = 500; obs.placeholder = 'Observação (opcional)';
    P.corpo.appendChild(obs);
    var aviso = el('p', 'gv-erro'); aviso.hidden = true; P.corpo.appendChild(aviso);
    function fechar(como, b) {
      var s = senha(); if (!s) { P.fechar(); desenhar(); return; }
      b.disabled = true;
      rpcSenha('fin_gaveta_fechar', { p_senha: s, p_id: x.id, p_como: como, p_obs: obs.value.trim() || null }).then(function () {
        P.fechar(); avisa(como === 'quebra' ? 'Fechada como quebra de caixa.' : 'Fechada como corrigida.'); carregarDono();
      }, function (er) {
        b.disabled = false;
        if (er.codigo === 'SENHA_INVALIDA' || er.codigo === 'BLOQUEADO_TEMPORARIAMENTE') { guardarSenha(null); st.portaErro = msgSenha(er.codigo); P.fechar(); desenhar(); return; }
        aviso.textContent = er.message || String(er); aviso.hidden = false;
      });
    }
    var b1 = bt('btn btn-s', 'Corrigido nos lançamentos', function () { fechar('corrigido', b1); });
    var b2 = bt('btn btn-p', 'Quebra de caixa', function () { fechar('quebra', b2); });
    rodape(P, [bt('btn btn-s', 'Agora não', function () { P.fechar(); }), b1, b2]);
  }

  /* ── saída ── */
  function sair() {
    parar();
    st.pedido++; st.pedidoDono++;
    st.estado = null; st.vistos = {}; st.dono = null; st.movs = null; st.movsErro = ''; st.donoErro = ''; st.portaErro = '';
    st.enviouNaEntrada = false; st.verTodos = false; st.senhaLocal = null;
    if (window.moldura && moldura.alertasExtra) moldura.alertasExtra([]);
    limparLo();
    var r = raiz(); if (r) r.innerHTML = '';
  }

  return { naEntrada: naEntrada, iniciar: iniciar, abrir: abrir, atualizar: atualizar, sair: sair };
})();
