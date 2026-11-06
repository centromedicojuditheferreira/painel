/* ═══════════════════════════════════════════════════════════════════
   FIN v3.0 — Financeiro da Administração (05/11/2026)
   Abas: Contas do mês e Contas fixas (Marinalva e dono); Dívidas e Projeção (só o dono).
   FIN v3.1: a Projeção abre com as parcelas de dívida mês a mês (colunas empilhadas, cartão incluso) até a última parcela.
   FIN v4.0: a Projeção ganha o caixa mês a mês do dono (fin_projecao_chefe): Unimed por estágio e competência, repasse por profissional,
            conveniência (dinheiro; notinha à parte), fixas, parcelas e cartão — sem saldo inicial até plugar o banco.
   FIN v3.2: "Como é pago" (alguém paga ou débito automático em qual banco), "Deixar nos bancos" no mês e lembretes no Telegram (servidor).
   Tudo pelas funções fin_* do Supabase, com a sessão do PIN. O servidor decide o que cada
   um recebe: no acesso da Marinalva as parcelas vêm sem "nº X de Y", sem saldo devedor e
   sem a observação do dono; as funções de dívidas e projeção recusam a sessão dela.
   Conta "no cartão": aparece no mês, mas fica fora dos totais (já está na fatura do cartão).
   ═══════════════════════════════════════════════════════════════════ */
var CONTAS = (function () {
  'use strict';

  var TZ = 'America/Sao_Paulo';
  var st = { aba: 'mes', comp: null, filtro: 'aberto', mes: null, mesErro: '', fixas: null, fixasErro: '', cats: null,
             dividas: null, divErro: '', proj: null, projErro: '', dvp: null, dvpErro: '', dvSel: 0, instalado: true, pedidoMes: 0 };

  var MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  var MES3 = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  var BASES = [['informado', 'Valor informado'], ['ultimo', 'Último valor pago'], ['media3', 'Média de 3 meses'], ['media6', 'Média de 6 meses']];
  var TIPOS = [['imposto_parcelado', 'Imposto parcelado'], ['emprestimo', 'Empréstimo'], ['financiamento', 'Financiamento'], ['outro', 'Outro']];
  var STATUS = { paga: ['Paga', 'ok'], vencida: ['Vencida', 'pend'], a_vencer: ['A vencer', 'espera'], no_cartao: ['No cartão', 'espera'], sem_data: ['Sem data', 'espera'] };
  /* FIN v3.2: como é pago — vazio = alguém paga; senão, débito automático no banco (entra no lembrete "deixar saldo" do Telegram) */
  var PAGA = [['', 'Alguém paga (boleto, Pix, guia)'], ['sicoob', 'Débito automático no Sicoob'], ['bb', 'Débito automático no Banco do Brasil'],
              ['caixa', 'Débito automático na Caixa'], ['inter', 'Débito automático no Inter'], ['c6', 'Débito automático no C6']];
  var BANCO = { sicoob: 'Sicoob', bb: 'BB', caixa: 'Caixa', inter: 'Inter', c6: 'C6' };

  /* ── utilidades ── */
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function bt(cls, html, fn) { var b = el('button', cls, html); b.type = 'button'; if (fn) b.addEventListener('click', fn); return b; }
  function esc(s) { var d = document.createElement('span'); d.textContent = s == null ? '' : String(s); return d.innerHTML; }
  function svg(d, t, w) { return window.moldura ? moldura.svg(d, t, w) : ''; }
  function brl(v) { return v == null ? '—' : 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function ehDono() { return typeof CU !== 'undefined' && !!CU && CU.dono === true; }
  function avisa(msg) { if (typeof toast === 'function') toast(msg, 'ok'); }
  function resumo(t) { if (window.moldura) moldura.resumo('contas', t); }
  function raiz() {
    var s = document.getElementById('s-contas'); if (!s) return null;
    var r = s.querySelector(':scope > .ct-raiz');
    if (!r) { r = el('div', 'ct-raiz'); s.appendChild(r); }
    return r;
  }
  function naTela() { var s = document.getElementById('s-contas'); return !!(s && s.classList.contains('active')); }
  function hojeISO() { return new Date().toLocaleDateString('en-CA', { timeZone: TZ }); }
  function compAtual() { return hojeISO().slice(0, 7) + '-01'; }
  function somaMes(comp, n) {
    var a = Number(comp.slice(0, 4)), m = Number(comp.slice(5, 7)) - 1 + n;
    a += Math.floor(m / 12); m = ((m % 12) + 12) % 12;
    return a + '-' + String(m + 1).padStart(2, '0') + '-01';
  }
  function nomeMes(comp) { var m = Number(comp.slice(5, 7)) - 1; return MESES[m].charAt(0).toUpperCase() + MESES[m].slice(1) + ' de ' + comp.slice(0, 4); }
  function mesCurto(comp) { return MES3[Number(comp.slice(5, 7)) - 1] + '/' + comp.slice(2, 4); }
  function ddmm(iso) { var m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? m[3] + '/' + m[2] : '—'; }
  function dia(iso) { var m = String(iso || '').match(/^\d{4}-\d{2}-(\d{2})/); return m ? m[1] : '—'; }
  function rotulo(lista, cod) { for (var i = 0; i < lista.length; i++) if (lista[i][0] === cod) return lista[i][1]; return cod || ''; }
  function msgErro(er) {
    if (er && er.status === 404) { st.instalado = false; return 'O Financeiro ainda não foi instalado no servidor.'; }
    return (er && er.message) || String(er);
  }
  /* "1.234,56", "1234,56" ou "1234.56" → 1234.56; vazio → null; inválido → NaN */
  function numero(txt) {
    var s = String(txt == null ? '' : txt).trim().replace(/\s|R\$/g, '');
    if (!s) return null;
    if (s.indexOf(',') >= 0) s = s.replace(/\./g, '').replace(',', '.');
    if (!/^\d+(\.\d{1,2})?$/.test(s)) return NaN;
    return Math.round(Number(s) * 100) / 100;
  }
  function num2(v) { return v == null ? '' : Number(v).toFixed(2).replace('.', ','); }
  function inteiro(txt, min, max) {
    var s = String(txt == null ? '' : txt).trim(); if (!s) return null;
    if (!/^\d+$/.test(s)) return NaN;
    var n = Number(s); return n < min || n > max ? NaN : n;
  }
  function rodape(P, botoes) { P.rodape.hidden = false; P.rodape.classList.add('fim'); botoes.forEach(function (b) { P.rodape.appendChild(b); }); }
  function opcoes(lista, atual) {
    return lista.map(function (o) { return '<option value="' + esc(o[0]) + '"' + (o[0] === atual ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('');
  }
  function campo(rot, html, cls) { return '<label class="ct-campo' + (cls ? ' ' + cls : '') + '"><span>' + rot + '</span>' + html + '</label>'; }
  function aviso(P) { var a = el('p', 'ct-erro'); a.hidden = true; a.setAttribute('role', 'alert'); P.corpo.appendChild(a); return a; }

  /* ── abrir / sair ── */
  function abrir() {
    if (!st.comp) st.comp = compAtual();
    if ((st.aba === 'dividas' || st.aba === 'projecao') && !ehDono()) st.aba = 'mes';
    desenhar();
    carregarAba();
  }
  function sair() {
    st = { aba: 'mes', comp: null, filtro: 'aberto', mes: null, mesErro: '', fixas: null, fixasErro: '', cats: null,
           dividas: null, divErro: '', proj: null, projErro: '', dvp: null, dvpErro: '', dvSel: 0, instalado: true, pedidoMes: 0 };
    var r = raiz(); if (r) r.innerHTML = '';
  }
  function carregarAba() {
    if (st.aba === 'mes') carregarMes();
    else if (st.aba === 'fixas') carregarFixas();
    else if (st.aba === 'dividas') carregarDividas();
    else if (st.aba === 'projecao') carregarProj();
  }
  function trocarAba(a) { st.aba = a; desenhar(); carregarAba(); }

  function carregarMes() {
    if (!window.LAPI || !LAPI.token()) return;
    var meu = ++st.pedidoMes, comp = st.comp;
    LAPI.finContasMes(comp).then(function (j) {
      if (meu !== st.pedidoMes) return;
      st.mes = j; st.mesErro = ''; if (naTela()) desenhar();
    }, function (er) { if (meu !== st.pedidoMes) return; st.mesErro = msgErro(er); if (naTela()) desenhar(); });
  }
  function carregarCats() {
    if (st.cats) return Promise.resolve(st.cats);
    return LAPI.finCategorias().then(function (c) { st.cats = c; return c; });
  }
  function carregarFixas() {
    if (!window.LAPI || !LAPI.token()) return;
    Promise.all([LAPI.finContasFixas(), carregarCats()]).then(function (r) {
      st.fixas = r[0]; st.fixasErro = ''; if (naTela()) desenhar();
    }, function (er) { st.fixasErro = msgErro(er); if (naTela()) desenhar(); });
  }
  function carregarDividas() {
    if (!ehDono() || !window.LAPI || !LAPI.token()) return;
    LAPI.finDividas().then(function (d) { st.dividas = d; st.divErro = ''; if (naTela()) desenhar(); },
      function (er) { st.divErro = msgErro(er); if (naTela()) desenhar(); });
  }
  function carregarProj() {
    if (!ehDono() || !window.LAPI || !LAPI.token()) return;
    LAPI.finProjecaoChefe().then(function (p) { st.proj = p; st.projErro = ''; if (naTela()) desenhar(); },
      function (er) { st.projErro = msgErro(er); if (naTela()) desenhar(); });
    LAPI.finDividasProjecao().then(function (p) { st.dvp = p; st.dvpErro = ''; if (naTela()) desenhar(); },
      function (er) { st.dvpErro = msgErro(er); if (naTela()) desenhar(); });
  }

  /* ── tela ── */
  function desenhar() {
    var r = raiz(); if (!r) return;
    r.innerHTML = '';
    if (!st.instalado) { resumo(''); r.appendChild(el('div', 'lista-vazio', 'O Financeiro ainda não foi instalado no servidor.')); return; }
    var abas = [['mes', 'Contas do mês'], ['fixas', 'Contas fixas']];
    if (ehDono()) abas.push(['dividas', 'Dívidas'], ['projecao', 'Projeção']);
    var barra = el('div', 'seg ct-abas'); barra.setAttribute('role', 'tablist');
    abas.forEach(function (a) {
      var b = bt(a[0] === st.aba ? 'on' : '', esc(a[1]), function () { if (st.aba !== a[0]) trocarAba(a[0]); });
      b.setAttribute('role', 'tab'); b.setAttribute('aria-selected', a[0] === st.aba ? 'true' : 'false');
      barra.appendChild(b);
    });
    r.appendChild(barra);
    if (st.aba === 'mes') telaMes(r);
    else if (st.aba === 'fixas') telaFixas(r);
    else if (st.aba === 'dividas') telaDividas(r);
    else telaProj(r);
  }

  /* ═══ Contas do mês ═══ */
  function emAberto(c) { return c.status === 'a_vencer' || c.status === 'vencida' || c.status === 'sem_data'; }
  function passa(c) {
    if (st.filtro === 'aberto') return emAberto(c);
    if (st.filtro === 'pagas') return c.status === 'paga';
    if (st.filtro === 'cartao') return c.status === 'no_cartao';
    return true;
  }
  function telaMes(r) {
    var j = st.mes, contas = (j && j.competencia === st.comp) ? (j.contas || []) : null;
    var wrap = el('div', 'duas-col');
    var sec = el('section', 'lista ct-lista'); sec.setAttribute('aria-label', 'Contas de ' + nomeMes(st.comp));
    var topo = el('div', 'lista-topo');
    var nav = el('div', 'ct-mesnav');
    nav.appendChild(bt('ct-seta', svg('M14.5 6l-6 6 6 6', 18, 2), function () { st.comp = somaMes(st.comp, -1); st.mes = null; desenhar(); carregarMes(); }));
    nav.appendChild(el('b', 'ct-mes', esc(nomeMes(st.comp))));
    nav.appendChild(bt('ct-seta', svg('M9.5 6l6 6-6 6', 18, 2), function () { st.comp = somaMes(st.comp, 1); st.mes = null; desenhar(); carregarMes(); }));
    nav.querySelectorAll('.ct-seta')[0].setAttribute('aria-label', 'Mês anterior');
    nav.querySelectorAll('.ct-seta')[1].setAttribute('aria-label', 'Próximo mês');
    topo.appendChild(nav);
    var cont = { aberto: 0, pagas: 0, cartao: 0, tudo: 0 };
    (contas || []).forEach(function (c) {
      cont.tudo++; if (emAberto(c)) cont.aberto++; if (c.status === 'paga') cont.pagas++; if (c.status === 'no_cartao') cont.cartao++;
    });
    var seg = el('div', 'seg');
    (ehDono() ? [['aberto', 'Em aberto'], ['pagas', 'Pagas'], ['cartao', 'No cartão'], ['tudo', 'Tudo']]
             : [['aberto', 'Em aberto'], ['pagas', 'Pagas'], ['tudo', 'Tudo']]).forEach(function (f) {   /* FIN v3.3: a aba "No cartão" é só do dono */
      seg.appendChild(bt(st.filtro === f[0] ? 'on' : '', esc(f[1]) + (contas ? ' <span class="n">' + cont[f[0]] + '</span>' : ''),
        function () { st.filtro = f[0]; desenhar(); }));
    });
    topo.appendChild(seg);
    sec.appendChild(topo);
    var corpo = el('div', 'lista-corpo');
    if (st.mesErro) corpo.appendChild(el('div', 'lista-vazio erro', esc(st.mesErro)));
    else if (!contas) corpo.appendChild(el('div', 'lista-vazio', 'Carregando…'));
    else {
      var vis = contas.filter(passa);
      if (!vis.length) corpo.appendChild(el('div', 'lista-vazio', st.filtro === 'aberto' ? 'Nada em aberto neste mês.' : 'Nenhuma conta aqui.'));
      vis.forEach(function (c) { corpo.appendChild(linhaConta(c)); });
    }
    sec.appendChild(corpo);
    wrap.appendChild(sec);
    wrap.appendChild(ladoMes(contas));
    r.appendChild(wrap);
  }
  function linhaConta(c) {
    var s = STATUS[c.status] || [c.status, 'espera'];
    /* parcela de dívida: no acesso do dono, "parcela X de Y" no lugar da categoria (cabe no celular); no da Marinalva vem sem o número */
    var meta = (c.parcela && c.parcelas_total) ? ['parcela ' + c.parcela + ' de ' + c.parcelas_total] : [c.categoria_nome];
    if (c.status === 'paga' && c.pago_em) meta.push('paga em ' + ddmm(c.pago_em) + (c.baixa_via === 'cartao' ? ' no cartão' : ''));
    else if (c.no_cartao && c.status !== 'no_cartao') meta.push('no cartão da clínica');   /* FIN v3.3: Feegow/SM Click no acesso da sócia */
    else if (c.debito_banco && c.status !== 'no_cartao') meta.push('débito ' + (BANCO[c.debito_banco] || c.debito_banco));
    if (c.obs_dono) meta.push('com observação sua');
    var v = c.status === 'paga' ? c.valor_pago : c.valor_previsto;
    var l = bt('linha ct-l' + (c.status === 'no_cartao' ? ' cartao' : ''), '', function () { popConta(c); });
    l.innerHTML = '<span class="h">' + esc(c.vencimento ? dia(c.vencimento) : '—') + '</span>' +
      '<span class="q"><span class="nm">' + esc(c.nome) + '</span><span class="mt">' + esc(meta.join(' · ')) + '</span></span>' +
      '<span class="dir"><span class="ct-v">' + esc(v == null ? 'sem valor' : brl(v)) + '</span><span class="ct-st ' + s[1] + '">' + esc(s[0]) + '</span></span>';
    return l;
  }
  function ladoMes(contas) {
    var l = el('div', 'lado');
    var p = el('section', 'painel');
    var falta = 0, pago = 0, previsto = 0, venc = 0, semValor = 0, cartao = 0;
    (contas || []).forEach(function (c) {
      if (c.status === 'no_cartao' || (c.no_cartao && c.status !== 'paga')) { cartao += Number(c.valor_previsto || 0); return; }   /* FIN v3.3: no cartão, mesmo com status normal (sócia) */
      if (c.status === 'paga') { pago += Number(c.valor_pago || 0); previsto += Number(c.valor_previsto || c.valor_pago || 0); return; }
      previsto += Number(c.valor_previsto || 0);
      falta += Number(c.valor_previsto || 0);
      if (c.status === 'vencida') venc++;
      if (c.valor_previsto == null) semValor++;
    });
    p.appendChild(el('div', 'lj-grande com-linha', '<h2 class="lj-grande-rot">Falta pagar em ' + esc(MESES[Number(st.comp.slice(5, 7)) - 1]) + '</h2>' +
      '<span class="lj-grande-n">' + esc(contas ? brl(falta) : '—') + '</span>' +
      (contas && semValor ? '<span class="lj-grande-l2">' + semValor + (semValor === 1 ? ' conta ainda sem valor' : ' contas ainda sem valor') + '</span>' : '')));
    var k = el('div', 'lj-kpis ct-kpis');
    k.innerHTML = '<div><span>Previsto</span><b>' + esc(contas ? brl(previsto) : '—') + '</b></div>' +
      '<div><span>Pago</span><b>' + esc(contas ? brl(pago) : '—') + '</b></div>' +
      '<div><span>Vencidas</span><b class="' + (venc ? 'ct-vermelho' : '') + '">' + (contas ? venc : '—') + '</b></div>';
    p.appendChild(el('div', 'lj-pad', '')).appendChild(k);
    if (contas && cartao) p.appendChild(el('p', 'ct-nota ct-pad', (ehDono() ? 'No cartão: ' : 'No cartão da clínica: ') + esc(brl(cartao)) + '. Já está dentro da fatura do cartão, por isso fica fora da conta acima.'));
    l.appendChild(p);
    /* FIN v3.2: quanto deixar em cada banco para o débito automático do que ainda não tem baixa */
    var bancos = {}, ordem = [];
    (contas || []).forEach(function (c) {
      if (!c.debito_banco || c.status === 'paga' || c.status === 'no_cartao') return;
      var b = bancos[c.debito_banco];
      if (!b) { b = bancos[c.debito_banco] = { v: 0, n: 0, d: null }; ordem.push(c.debito_banco); }
      b.v += Number(c.valor_previsto || 0); b.n++;
      if (c.vencimento && (!b.d || c.vencimento < b.d)) b.d = c.vencimento;
    });
    if (ordem.length) {
      var bx = el('section', 'painel');
      bx.appendChild(el('div', 'painel-cab', '<h2>Deixar nos bancos</h2><span>débito automático</span>'));
      ordem.sort(function (a, b) { return String(bancos[a].d || '').localeCompare(String(bancos[b].d || '')); }).forEach(function (k) {
        var b = bancos[k];
        bx.appendChild(el('div', 'ct-prox ct-banco', '<span class="t">' + esc(BANCO[k] || k) + ' <small>' + esc(b.n + (b.n === 1 ? ' débito' : ' débitos') +
          (b.d ? ', o primeiro em ' + ddmm(b.d) : '')) + '</small></span><span class="v">' + esc(brl(Math.round(b.v * 100) / 100)) + '</span>'));
      });
      l.appendChild(bx);
    }
    var prox = (contas || []).filter(function (c) { return emAberto(c) && c.vencimento && c.vencimento >= hojeISO(); }).slice(0, 5);
    if (contas && st.comp === compAtual()) {
      var n = el('section', 'painel');
      n.appendChild(el('div', 'painel-cab', '<h2>Próximos vencimentos</h2>'));
      if (!prox.length) n.appendChild(el('div', 'lista-vazio', 'Nada a vencer no resto do mês.'));
      prox.forEach(function (c) {
        var b = bt('ct-prox', '<span class="d">' + esc(ddmm(c.vencimento)) + '</span><span class="t">' + esc(c.nome) + '</span><span class="v">' +
          esc(c.valor_previsto == null ? 'sem valor' : brl(c.valor_previsto)) + '</span>', function () { popConta(c); });
        n.appendChild(b);
      });
      l.appendChild(n);
    }
    var mes = st.comp === compAtual() ? 'deste mês' : 'de ' + MESES[Number(st.comp.slice(5, 7)) - 1];
    resumo(contas ? (falta ? 'Falta pagar ' + brl(falta) + ' ' + mes : 'Tudo pago ' + mes) + (venc ? ' · ' + venc + (venc === 1 ? ' vencida' : ' vencidas') : '') : '');
    return l;
  }

  function popConta(c) {
    if (!window.moldura) return;
    var P = moldura.pop({ largura: '520px', titulo: 'Financeiro', classe: 'ct-pop' });
    var s = STATUS[c.status] || [c.status, 'espera'];
    P.corpo.appendChild(el('div', 'pp-cab', '<span class="ct-st ' + s[1] + '">' + esc(s[0]) + '</span><h2>' + esc(c.nome) + '</h2>' +
      '<span class="pp-sub">' + esc(c.categoria_nome + (c.vencimento ? ' · vence em ' + ddmm(c.vencimento) : ' · sem data de vencimento')) + '</span>'));
    var cx = el('div', 'ct-info');
    var linhas = [['Previsto', c.valor_previsto == null ? 'sem valor' : brl(c.valor_previsto)]];
    if (c.parcela && c.parcelas_total) linhas.push(['Parcela', c.parcela + ' de ' + c.parcelas_total]);
    if (c.status === 'paga') {
      linhas.push(['Pago', brl(c.valor_pago)]);
      linhas.push(['Pago em', ddmm(c.pago_em) + (c.baixa_por ? ' · baixa de ' + c.baixa_por : '')]);
    }
    if (c.obs) linhas.push(['Observação', c.obs]);
    cx.innerHTML = linhas.map(function (x) { return '<div><span>' + esc(x[0]) + '</span><b>' + esc(x[1]) + '</b></div>'; }).join('');
    P.corpo.appendChild(cx);
    if (c.obs_dono) P.corpo.appendChild(el('div', 'ct-dono', '<span>Só você vê</span><p>' + esc(c.obs_dono) + '</p>'));
    var av;
    if (c.status === 'paga') {
      av = aviso(P);
      var desf = bt('btn btn-s', 'Desfazer a baixa', function () {
        desf.disabled = true;
        LAPI.finBaixa(c.id, null, null, null, true).then(function () { P.fechar(); avisa('Baixa desfeita.'); carregarMes(); },
          function (er) { desf.disabled = false; av.textContent = msgErro(er); av.hidden = false; });
      });
      rodape(P, [bt('btn btn-s', 'Fechar', function () { P.fechar(); }), desf]);
      return;
    }
    if (c.status === 'no_cartao') {
      P.corpo.appendChild(el('p', 'ct-nota', 'Esta conta é cobrada no cartão. Ela já entra na fatura do cartão, então não precisa dar baixa aqui.'));
      rodape(P, [bt('btn btn-s', 'Fechar', function () { P.fechar(); })]);
      return;
    }
    var f = el('div', 'ct-form');
    f.innerHTML = '<h3 class="ct-sub">Marcar como paga</h3>' +
      '<div class="ct-dupla">' + campo('Valor pago', '<input type="text" class="fc" id="ct-b-valor" inputmode="decimal" autocomplete="off" placeholder="0,00" value="' + esc(num2(c.valor_previsto)) + '">') +
      campo('Data do pagamento', '<input type="date" class="fc" id="ct-b-data" value="' + esc(hojeISO()) + '">') + '</div>' +
      campo('Observação (opcional)', '<input type="text" class="fc" id="ct-b-obs" maxlength="300" autocomplete="off">') +
      '<div class="ct-checks"><label class="ct-check"><input type="checkbox" id="ct-b-via"' + (c.no_cartao ? ' checked' : '') + '><span>Paguei com o cartão da clínica</span></label></div>';   /* FIN v3.3 */
    P.corpo.appendChild(f);
    av = aviso(P);
    var ok = bt('btn btn-p', 'Marcar como paga', enviar), ocupado = false;
    rodape(P, [bt('btn btn-s', 'Cancelar', function () { P.fechar(); }), ok]);
    var iv = f.querySelector('#ct-b-valor');
    iv.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') { ev.preventDefault(); enviar(); } });
    function enviar() {
      if (ocupado) return;
      var v = numero(iv.value), d = f.querySelector('#ct-b-data').value;
      if (v == null || isNaN(v) || v <= 0) { av.textContent = 'Informe o valor pago, como 1.250,00.'; av.hidden = false; iv.focus(); return; }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) { av.textContent = 'Informe a data do pagamento.'; av.hidden = false; return; }
      ocupado = true; ok.disabled = true; av.hidden = true;
      var via = f.querySelector('#ct-b-via').checked ? 'cartao' : null;
      LAPI.finBaixa(c.id, v, d, f.querySelector('#ct-b-obs').value.trim(), false, via).then(function () {
        P.fechar(); avisa(c.nome + ': paga, ' + brl(v) + (via ? ' no cartão' : '') + '.'); carregarMes();
      }, function (er) { ocupado = false; ok.disabled = false; av.textContent = msgErro(er); av.hidden = false; });
    }
  }

  /* ═══ Contas fixas ═══ */
  function telaFixas(r) {
    var wrap = el('div', 'duas-col');
    var sec = el('section', 'lista ct-lista'); sec.setAttribute('aria-label', 'Contas fixas');
    var topo = el('div', 'lista-topo');
    var ativas = (st.fixas || []).filter(function (c) { return c.ativa; }).length;
    topo.appendChild(el('span', 'lista-tit', st.fixas ? ativas + (ativas === 1 ? ' conta ativa' : ' contas ativas') : 'Contas fixas'));
    topo.appendChild(bt('btn btn-p btn-sm', 'Nova conta', function () { popFixa(null); }));
    sec.appendChild(topo);
    var corpo = el('div', 'lista-corpo');
    if (st.fixasErro) corpo.appendChild(el('div', 'lista-vazio erro', esc(st.fixasErro)));
    else if (!st.fixas) corpo.appendChild(el('div', 'lista-vazio', 'Carregando…'));
    else if (!st.fixas.length) corpo.appendChild(el('div', 'lista-vazio', 'Nenhuma conta fixa ainda.'));
    (st.fixas || []).forEach(function (c) {
      var meta = [c.categoria_nome, rotulo(BASES, c.base_projecao).toLowerCase()];
      if (c.obs_dono) meta.push('com observação sua');
      var tags = '';
      if (c.no_cartao) tags += '<span class="ct-st espera">' + (c.cartao_socia ? (ehDono() ? 'No cartão · a Marinalva paga' : 'No cartão da clínica') : 'No cartão') + '</span>';
      else if (c.debito_banco) tags += '<span class="ct-st espera">Débito ' + esc(BANCO[c.debito_banco] || c.debito_banco) + '</span>';
      if (!c.ativa) tags += '<span class="ct-st espera">Inativa</span>';
      var l = bt('linha ct-l' + (c.ativa ? '' : ' inativa'), '', function () { popFixa(c); });
      l.innerHTML = '<span class="h">' + esc(c.dia_vencimento ? String(c.dia_vencimento).padStart(2, '0') : '—') + '</span>' +
        '<span class="q"><span class="nm">' + esc(c.nome) + '</span><span class="mt">' + esc(meta.join(' · ')) + '</span></span>' +
        '<span class="dir"><span class="ct-v">' + esc(c.valor_informado == null ? 'sem valor' : brl(c.valor_informado)) + '</span>' + tags + '</span>';
      corpo.appendChild(l);
    });
    sec.appendChild(corpo);
    wrap.appendChild(sec);
    var lado = el('div', 'lado');
    lado.appendChild(el('section', 'painel nota-lado', '<h2>Como funciona</h2><ul class="ct-ul">' +
      '<li>Cada conta fixa vira uma conta do mês sozinha, no dia de vencimento.</li>' +
      '<li>O valor do mês sai da base escolhida: o valor informado, o último pago ou a média de 3 ou 6 meses. Sem histórico, vale o informado.</li>' +
      '<li>Marque "Paga no cartão" quando a conta já vem na fatura do cartão: ela aparece no mês, mas não soma de novo.</li>' +
      '<li>Mudou o valor? As contas em aberto deste mês em diante acompanham.</li></ul>'));
    wrap.appendChild(lado);
    r.appendChild(wrap);
    resumo(st.fixas ? ativas + (ativas === 1 ? ' conta fixa ativa' : ' contas fixas ativas') : '');
  }

  function popFixa(c) {
    if (!window.moldura) return;
    carregarCats().then(function (cats) { abrirFixa(c, cats); }, function (er) { if (typeof toast === 'function') toast(msgErro(er), 'ko'); });
  }
  function abrirFixa(c, cats) {
    var nova = !c; c = c || { ativa: true, base_projecao: 'informado', categoria: 'outro' };
    var P = moldura.pop({ largura: '600px', titulo: 'Financeiro', classe: 'ct-pop' });
    P.corpo.appendChild(el('div', 'pp-cab', '<h2>' + (nova ? 'Nova conta fixa' : esc(c.nome)) + '</h2>' +
      '<span class="pp-sub">' + (nova ? 'Conta que se repete todo mês.' : 'Editar a conta fixa.') + '</span>'));
    var f = el('div', 'ct-form');
    f.innerHTML = campo('Nome', '<input type="text" class="fc" id="ct-f-nome" maxlength="120" autocomplete="off" value="' + esc(c.nome || '') + '">') +
      '<div class="ct-dupla">' +
      campo('Categoria', '<select class="fc" id="ct-f-cat">' + opcoes(cats.map(function (x) { return [x.codigo, x.nome]; }), c.categoria) + '</select>') +
      campo('Dia de vencimento', '<input type="text" class="fc" id="ct-f-dia" inputmode="numeric" maxlength="2" autocomplete="off" placeholder="1 a 31" value="' + esc(c.dia_vencimento || '') + '">') +
      '</div><div class="ct-dupla">' +
      campo('Valor', '<input type="text" class="fc" id="ct-f-valor" inputmode="decimal" autocomplete="off" placeholder="0,00" value="' + esc(num2(c.valor_informado)) + '">') +
      campo('Base para os próximos meses', '<select class="fc" id="ct-f-base">' + opcoes(BASES, c.base_projecao) + '</select>') +
      '</div><div class="ct-dupla">' +
      campo('CNPJ ou CPF de quem recebe <small>(opcional)</small>', '<input type="text" class="fc" id="ct-f-doc" inputmode="numeric" maxlength="18" autocomplete="off" value="' + esc(c.recebedor_doc || '') + '">') +
      campo('Nome de quem recebe <small>(opcional)</small>', '<input type="text" class="fc" id="ct-f-rec" maxlength="120" autocomplete="off" value="' + esc(c.recebedor_nome || '') + '">') +
      '</div>' +
      campo('Como é pago <small>(débito automático entra no aviso "deixar saldo" do Telegram)</small>', '<select class="fc" id="ct-f-paga">' + opcoes(PAGA, c.debito_banco || '') + '</select>') +
      campo('Observação <small>(a Marinalva e o dono veem)</small>', '<textarea class="fc ct-ta" id="ct-f-obs" maxlength="600" rows="2">' + esc(c.obs || '') + '</textarea>') +
      (ehDono() ? campo('Observação só sua', '<textarea class="fc ct-ta" id="ct-f-obsd" maxlength="600" rows="2">' + esc(c.obs_dono || '') + '</textarea>', 'ct-dono-campo') : '') +
      '<div class="ct-checks">' +
      '<label class="ct-check"><input type="checkbox" id="ct-f-cartao"' + (c.no_cartao ? ' checked' : '') + '><span>Paga no cartão <small>(fica fora dos totais: já está na fatura)</small></span></label>' +
      (ehDono() ? '<label class="ct-check"><input type="checkbox" id="ct-f-socia"' + (c.cartao_socia ? ' checked' : '') + '><span>A Marinalva paga esta no cartão <small>(ela vê a conta e dá baixa; as outras do cartão ela não vê)</small></span></label>' : '') +   /* FIN v3.3 */
      '<label class="ct-check"><input type="checkbox" id="ct-f-ativa"' + (c.ativa !== false ? ' checked' : '') + '><span>Ativa <small>(desmarque quando a conta acabar)</small></span></label>' +
      '</div>';
    P.corpo.appendChild(f);
    var av = aviso(P);
    var ok = bt('btn btn-p', nova ? 'Criar conta' : 'Salvar', salvar), ocupado = false;
    rodape(P, [bt('btn btn-s', 'Cancelar', function () { P.fechar(); }), ok]);
    setTimeout(function () { if (P.aberto && nova) f.querySelector('#ct-f-nome').focus(); }, 30);
    function q(id) { return f.querySelector('#' + id); }
    function erro(t, foco) { av.textContent = t; av.hidden = false; if (foco) foco.focus(); }
    function salvar() {
      if (ocupado) return;
      var nome = q('ct-f-nome').value.trim(), d = inteiro(q('ct-f-dia').value, 1, 31), v = numero(q('ct-f-valor').value);
      if (!nome) return erro('Informe o nome da conta.', q('ct-f-nome'));
      if (isNaN(d)) return erro('Dia de vencimento entre 1 e 31, ou deixe em branco.', q('ct-f-dia'));
      if (isNaN(v)) return erro('Informe o valor como 1.250,00, ou deixe em branco.', q('ct-f-valor'));
      var doc = q('ct-f-doc').value.replace(/\D/g, '');
      if (doc && doc.length !== 11 && doc.length !== 14) return erro('CPF tem 11 números e CNPJ tem 14.', q('ct-f-doc'));
      var cartao = q('ct-f-cartao').checked, obsD = ehDono() ? q('ct-f-obsd').value.trim() : null, paga = q('ct-f-paga').value;
      ocupado = true; ok.disabled = true; av.hidden = true;
      LAPI.finContaFixaSalvar({ id: c.id, nome: nome, categoria: q('ct-f-cat').value, dia: d, valor: v, base: q('ct-f-base').value,
        doc: doc, recebedor: q('ct-f-rec').value.trim(), obs: q('ct-f-obs').value.trim(), ativa: q('ct-f-ativa').checked })
        .then(function (j) {
          var muda = cartao !== !!c.no_cartao || (ehDono() && obsD !== (c.obs_dono || ''));
          return muda ? LAPI.finContaFixaMarcar(j.id, cartao, ehDono() ? obsD : null) : j;
        })
        .then(function (j) {   /* FIN v3.3: só o dono marca a conta do cartão que a sócia paga */
          var socia = ehDono() && q('ct-f-socia') ? q('ct-f-socia').checked : null;
          return socia != null && socia !== !!c.cartao_socia ? LAPI.finContaFixaCartaoSocia(j.id, socia) : j;
        })
        .then(function (j) { return paga !== (c.debito_banco || '') ? LAPI.finContaDebito('fixa', j.id, paga) : j; })
        .then(function () { P.fechar(); avisa(nova ? 'Conta criada.' : 'Conta salva.'); st.mes = null; carregarFixas(); },
          function (er) { ocupado = false; ok.disabled = false; erro(msgErro(er)); });
    }
  }

  /* ═══ Dívidas (só o dono) ═══ */
  function faltaDe(d) { return d.saldo_estimado != null ? Number(d.saldo_estimado) : (d.saldo_devedor != null ? Number(d.saldo_devedor) : null); }
  function telaDividas(r) {
    var wrap = el('div', 'duas-col');
    var sec = el('section', 'lista ct-lista'); sec.setAttribute('aria-label', 'Dívidas');
    var topo = el('div', 'lista-topo');
    var ativas = (st.dividas || []).filter(function (d) { return d.ativa; });
    topo.appendChild(el('span', 'lista-tit', st.dividas ? ativas.length + (ativas.length === 1 ? ' dívida ativa' : ' dívidas ativas') : 'Dívidas'));
    topo.appendChild(bt('btn btn-p btn-sm', 'Nova dívida', function () { abrirDivida(null); }));
    sec.appendChild(topo);
    var corpo = el('div', 'lista-corpo');
    if (st.divErro) corpo.appendChild(el('div', 'lista-vazio erro', esc(st.divErro)));
    else if (!st.dividas) corpo.appendChild(el('div', 'lista-vazio', 'Carregando…'));
    else if (!st.dividas.length) corpo.appendChild(el('div', 'lista-vazio', 'Nenhuma dívida cadastrada.'));
    var total = 0, mensal = 0, semDado = 0;
    (st.dividas || []).forEach(function (d) {
      var fa = faltaDe(d);
      if (d.ativa) { if (fa != null) total += fa; else semDado++; mensal += Number(d.valor_parcela || 0); }
      var meta = [rotulo(TIPOS, d.tipo)];
      if (d.parcela_atual && d.parcelas_total) meta.push('parcela ' + Math.min(d.parcela_atual, d.parcelas_total) + ' de ' + d.parcelas_total);
      if (d.parcelas_restantes != null) meta.push(d.parcelas_restantes === 1 ? 'falta 1' : 'faltam ' + d.parcelas_restantes);
      if (d.termina_em) meta.push('até ' + mesCurto(d.termina_em));
      if (d.dia_vencimento) meta.push('dia ' + d.dia_vencimento);
      if (d.debito_banco) meta.push('débito ' + (BANCO[d.debito_banco] || d.debito_banco));
      var dir = '<span class="ct-v">' + esc(brl(d.valor_parcela)) + '<small>/mês</small></span>' +
        '<span class="mt">' + esc(d.saldo_estimado != null ? 'falta ' + brl(d.saldo_estimado) : (d.saldo_devedor != null ? 'saldo ' + brl(d.saldo_devedor) : 'sem prazo')) + '</span>';
      var l = bt('linha ct-l' + (d.ativa ? '' : ' inativa'), '', function () { abrirDivida(d); });
      l.innerHTML = '<span class="q"><span class="nm">' + esc(d.credor + (d.descricao ? ' · ' + d.descricao : '')) + '</span><span class="mt">' + esc(meta.join(' · ')) + '</span></span>' +
        '<span class="dir">' + dir + '</span>';
      corpo.appendChild(l);
    });
    sec.appendChild(corpo);
    wrap.appendChild(sec);
    var lado = el('div', 'lado');
    var p = el('section', 'painel');
    p.appendChild(el('div', 'lj-grande com-linha', '<h2 class="lj-grande-rot">Falta pagar</h2><span class="lj-grande-n">' + esc(st.dividas ? brl(total) : '—') + '</span>' +
      '<span class="lj-grande-l2">Parcelas que faltam × valor da parcela; sem prazo cadastrado, vale o saldo devedor informado.' +
      (semDado ? ' ' + semDado + (semDado === 1 ? ' dívida sem prazo nem saldo fica fora.' : ' dívidas sem prazo nem saldo ficam fora.') : '') + '</span>'));
    p.appendChild(el('div', 'lj-grande', '<h2 class="lj-grande-rot">Parcelas por mês</h2><span class="lj-grande-n ct-n2">' + esc(st.dividas ? brl(mensal) : '—') + '</span>'));
    lado.appendChild(p);
    lado.appendChild(el('section', 'painel nota-lado', '<h2>Só você vê</h2><p class="ct-nota">A Marinalva vê cada parcela nas contas do mês, sem o número da parcela, sem o saldo e sem esta aba.</p>'));
    wrap.appendChild(lado);
    r.appendChild(wrap);
    resumo(st.dividas ? 'Falta pagar ' + brl(total) + ' · ' + brl(mensal) + ' por mês' : '');
  }

  function abrirDivida(d) {
    if (!window.moldura || !ehDono()) return;
    var nova = !d; d = d || { ativa: true, base_projecao: 'informado', tipo: 'emprestimo' };
    var P = moldura.pop({ largura: '600px', titulo: 'Financeiro · só você vê', classe: 'ct-pop' });
    P.corpo.appendChild(el('div', 'pp-cab', '<h2>' + (nova ? 'Nova dívida' : esc(d.credor + (d.descricao ? ' · ' + d.descricao : ''))) + '</h2>' +
      '<span class="pp-sub">Imposto parcelado, empréstimo ou financiamento. A parcela entra nas contas do mês da Marinalva sem o número e sem o saldo.</span>'));
    var f = el('div', 'ct-form');
    f.innerHTML = '<div class="ct-dupla">' +
      campo('Credor', '<input type="text" class="fc" id="ct-d-cred" maxlength="120" autocomplete="off" value="' + esc(d.credor || '') + '">') +
      campo('Tipo', '<select class="fc" id="ct-d-tipo">' + opcoes(TIPOS, d.tipo) + '</select>') + '</div>' +
      campo('Descrição <small>(a Marinalva vê no nome da conta; não ponha o nº da parcela)</small>', '<input type="text" class="fc" id="ct-d-desc" maxlength="120" autocomplete="off" value="' + esc(d.descricao || '') + '">') +
      '<div class="ct-dupla">' +
      campo('Valor da parcela', '<input type="text" class="fc" id="ct-d-parc" inputmode="decimal" autocomplete="off" placeholder="0,00" value="' + esc(num2(d.valor_parcela)) + '">') +
      campo('Dia de vencimento', '<input type="text" class="fc" id="ct-d-dia" inputmode="numeric" maxlength="2" autocomplete="off" placeholder="1 a 31" value="' + esc(d.dia_vencimento || '') + '">') +
      '</div><div class="ct-dupla">' +
      campo('Total de parcelas <small>(opcional)</small>', '<input type="text" class="fc" id="ct-d-tot" inputmode="numeric" maxlength="3" autocomplete="off" value="' + esc(d.parcelas_total || '') + '">') +
      campo('Mês da 1ª parcela <small>(opcional)</small>', '<input type="month" class="fc" id="ct-d-prim" value="' + esc(d.primeira_competencia ? String(d.primeira_competencia).slice(0, 7) : '') + '">') +
      '</div><div class="ct-dupla">' +
      campo('Mês da última parcela <small>(só sem o total)</small>', '<input type="month" class="fc" id="ct-d-ult" value="' + esc(d.ultima_competencia ? String(d.ultima_competencia).slice(0, 7) : '') + '">') +
      campo('Como é pago', '<select class="fc" id="ct-d-paga">' + opcoes(PAGA, d.debito_banco || '') + '</select>') +
      '</div><div class="ct-dupla">' +
      campo('Saldo devedor informado <small>(opcional)</small>', '<input type="text" class="fc" id="ct-d-saldo" inputmode="decimal" autocomplete="off" placeholder="0,00" value="' + esc(num2(d.saldo_devedor)) + '">') +
      campo('Saldo em', '<input type="date" class="fc" id="ct-d-saldoem" value="' + esc(d.saldo_em || '') + '">') +
      '</div><div class="ct-dupla">' +
      campo('Base para os próximos meses', '<select class="fc" id="ct-d-base">' + opcoes(BASES, d.base_projecao) + '</select>') +
      campo('CNPJ de quem recebe <small>(opcional)</small>', '<input type="text" class="fc" id="ct-d-doc" inputmode="numeric" maxlength="18" autocomplete="off" value="' + esc(d.recebedor_doc || '') + '">') +
      '</div>' +
      campo('Observação <small>(só você vê)</small>', '<textarea class="fc ct-ta" id="ct-d-obs" maxlength="800" rows="3">' + esc(d.obs || '') + '</textarea>') +
      '<div class="ct-checks"><label class="ct-check"><input type="checkbox" id="ct-d-ativa"' + (d.ativa !== false ? ' checked' : '') + '><span>Ativa <small>(desmarque quando quitar)</small></span></label></div>';
    P.corpo.appendChild(f);
    var av = aviso(P);
    var ok = bt('btn btn-p', nova ? 'Criar dívida' : 'Salvar', salvar), ocupado = false;
    rodape(P, [bt('btn btn-s', 'Cancelar', function () { P.fechar(); }), ok]);
    function q(id) { return f.querySelector('#' + id); }
    function erro(t, foco) { av.textContent = t; av.hidden = false; if (foco) foco.focus(); }
    function salvar() {
      if (ocupado) return;
      var cred = q('ct-d-cred').value.trim(), parc = numero(q('ct-d-parc').value), dd = inteiro(q('ct-d-dia').value, 1, 31),
          tot = inteiro(q('ct-d-tot').value, 1, 600), saldo = numero(q('ct-d-saldo').value), prim = q('ct-d-prim').value;
      if (!cred) return erro('Informe o credor.', q('ct-d-cred'));
      if (parc == null || isNaN(parc)) return erro('Informe o valor da parcela, como 1.250,00.', q('ct-d-parc'));
      if (isNaN(dd)) return erro('Dia de vencimento entre 1 e 31, ou deixe em branco.', q('ct-d-dia'));
      if (isNaN(tot)) return erro('Total de parcelas: só números, ou deixe em branco.', q('ct-d-tot'));
      if (isNaN(saldo)) return erro('Informe o saldo como 75.543,58, ou deixe em branco.', q('ct-d-saldo'));
      if (prim && !/^\d{4}-\d{2}$/.test(prim)) return erro('Mês da 1ª parcela inválido.', q('ct-d-prim'));
      var ult = q('ct-d-ult').value;
      if (ult && !/^\d{4}-\d{2}$/.test(ult)) return erro('Mês da última parcela inválido.', q('ct-d-ult'));
      if (ult && tot) return erro('Com o total de parcelas, a última parcela sai sozinha. Deixe só um dos dois.', q('ct-d-ult'));
      if (ult && prim && ult < prim) return erro('A última parcela não pode vir antes da primeira.', q('ct-d-ult'));
      var doc = q('ct-d-doc').value.replace(/\D/g, '');
      if (doc && doc.length !== 11 && doc.length !== 14) return erro('CPF tem 11 números e CNPJ tem 14.', q('ct-d-doc'));
      ocupado = true; ok.disabled = true; av.hidden = true;
      var ultNova = ult ? ult + '-01' : null, ultAntes = d.ultima_competencia ? String(d.ultima_competencia).slice(0, 10) : null, paga = q('ct-d-paga').value;
      LAPI.finDividaSalvar({ id: d.id, credor: cred, tipo: q('ct-d-tipo').value, descricao: q('ct-d-desc').value.trim(), dia: dd, parcela: parc,
        base: q('ct-d-base').value, total: tot, primeira: prim ? prim + '-01' : null, saldo: saldo, saldoEm: q('ct-d-saldoem').value || null,
        doc: doc, obs: q('ct-d-obs').value.trim(), ativa: q('ct-d-ativa').checked })
        .then(function (j) { return ultNova !== ultAntes ? LAPI.finDividaFim(j.id, ultNova) : j; })
        .then(function (j) { return paga !== (d.debito_banco || '') ? LAPI.finContaDebito('divida', j.id, paga) : j; })
        .then(function () { P.fechar(); avisa(nova ? 'Dívida criada.' : 'Dívida salva.'); st.mes = null; st.proj = null; st.dvp = null; carregarDividas(); },
          function (er) { ocupado = false; ok.disabled = false; erro(msgErro(er)); });
    }
  }

  /* ═══ Projeção (só o dono) ═══ */

  /* ── FIN v3.1: parcelas de dívida mês a mês, em colunas empilhadas, até a última parcela ──
     Grupos em ordem fixa (de baixo para cima) e cor fixa por grupo: a cor segue a dívida, não a posição.
     Cores: paleta categórica validada para daltonismo nos dois temas (css/contas.css, --dv1 a --dv6). */
  var GRUPOS = [
    { k: 'impostos', nome: 'Impostos parcelados', c: 1 },
    { k: 'bb', nome: 'Banco do Brasil', c: 2 },
    { k: 'sicoob', nome: 'Sicoob', c: 3 },
    { k: 'caixa', nome: 'Caixa', c: 4 },
    { k: 'cartao', nome: 'Cartão (parcelas)', c: 5 },
    { k: 'outras', nome: 'Outras', c: 6 }
  ];
  function semAcento(s) { return String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim(); }
  function grupoDe(d) {
    if (d.tipo === 'imposto_parcelado') return 'impostos';
    var c = semAcento(d.credor);
    if (c === 'bb' || c.indexOf('banco do brasil') === 0) return 'bb';
    if (c.indexOf('sicoob') === 0) return 'sicoob';
    if (c.indexOf('caixa') === 0) return 'caixa';
    return 'outras';
  }
  function centavos(v) { return Math.round(Number(v || 0) * 100) / 100; }
  function ultimoComValor(v) { for (var i = v.length - 1; i >= 0; i--) if (Number(v[i]) > 0) return i; return -1; }
  function montarDv(j) {
    var meses = j.meses || [], n = meses.length, por = {}, itens = [], tot = [];
    GRUPOS.forEach(function (g) { por[g.k] = []; for (var i = 0; i < n; i++) por[g.k].push(0); });
    function soma(g, v) { for (var i = 0; i < n; i++) por[g][i] += Number(v[i] || 0); }
    (j.dividas || []).forEach(function (d) {
      var g = grupoDe(d), v = d.valores || [];
      soma(g, v);
      itens.push({ nome: d.credor + (d.descricao ? ' · ' + d.descricao : ''), g: g, fim: ultimoComValor(v), semPrazo: !!d.sem_prazo, v: v });
    });
    if (j.cartao && j.cartao.valores) {
      soma('cartao', j.cartao.valores);
      var fc = ultimoComValor(j.cartao.valores);
      if (fc >= 0) itens.push({ nome: 'Cartão Sicoob · parcelas já compradas', g: 'cartao', fim: fc, semPrazo: false, v: j.cartao.valores });
    }
    for (var i = 0; i < n; i++) {
      var t = 0;
      GRUPOS.forEach(function (g) { por[g.k][i] = centavos(por[g.k][i]); t += por[g.k][i]; });
      tot.push(centavos(t));
    }
    return { meses: meses, n: n, por: por, tot: tot, itens: itens, cartao: j.cartao || null,
             grupos: GRUPOS.filter(function (g) { return por[g.k].some(function (v) { return v > 0; }); }),
             ultimo: ultimoComValor(tot) };
  }
  function passoEixo(max) {
    var ps = [500, 1000, 2000, 2500, 5000, 10000, 20000, 25000, 50000, 100000];
    for (var i = 0; i < ps.length; i++) if (max / ps[i] <= 5) return ps[i];
    return ps[ps.length - 1];
  }
  function rotEixo(v) { return v === 0 ? '0' : v >= 1000 ? (v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' mil' : String(v); }
  function pct(a, b) { return b ? Math.round((a - b) / b * 100) : 0; }

  function telaDv() {
    var sec = el('section', 'lista ct-dv'); sec.setAttribute('aria-label', 'Parcelas de dívida mês a mês');
    var j = st.dvp, M = j && !st.dvpErro ? montarDv(j) : null;
    sec.appendChild(el('div', 'painel-cab', '<h2>Parcelas de dívida, mês a mês</h2>' +
      (M && M.n ? '<span>' + esc(mesCurto(M.meses[0]) + ' a ' + mesCurto(M.meses[Math.max(0, M.ultimo)])) + '</span>' : '')));
    if (st.dvpErro) { sec.appendChild(el('div', 'lista-vazio erro', esc(st.dvpErro))); return { sec: sec }; }
    if (!M) { sec.appendChild(el('div', 'lista-vazio', 'Carregando…')); return { sec: sec }; }
    if (!M.n || M.ultimo < 0) { sec.appendChild(el('div', 'lista-vazio', 'Nenhuma parcela de dívida pela frente.')); return { sec: sec }; }
    if (st.dvSel >= M.n) st.dvSel = 0;

    /* quatro números: este mês, daqui a 1 e 2 anos, e quando acaba */
    var k = el('div', 'ct-dv-kpis'), h = '';
    [[0, 'Neste mês'], [12, ''], [24, '']].forEach(function (x) {
      if (x[0] >= M.n) return;
      var i = x[0], v = M.tot[i], d = pct(v, M.tot[0]);
      h += '<div><span>' + esc(x[1] || 'Em ' + mesCurto(M.meses[i])) + '</span><b>' + esc(brl(v)) + '</b>' +
        (i ? '<small>' + esc(d === 0 ? 'igual a hoje' : (d < 0 ? d + '%' : '+' + d + '%') + ' em relação a hoje') + '</small>' : '<small>de parcelas</small>') + '</div>';
    });
    h += '<div><span>Última parcela</span><b>' + esc(mesCurto(M.meses[M.ultimo])) + '</b><small>' +
      esc(M.itens.some(function (it) { return it.semPrazo; }) ? 'fora as dívidas sem prazo' : 'depois disso, zero') + '</small></div>';
    k.innerHTML = h;
    sec.appendChild(k);

    var leit = el('div', 'ct-dv-leit'), graf = el('div', 'ct-dv-graf');
    sec.appendChild(leit); sec.appendChild(graf);

    /* a mesma coisa em tabela (leitor de tela, e para conferir número por número) */
    var det = el('details', 'ct-dv-det');
    var th = '<tr><th>Mês</th>' + M.grupos.map(function (g) { return '<th class="n">' + esc(g.nome) + '</th>'; }).join('') + '<th class="n">Total</th></tr>';
    var tb = '';
    for (var i = 0; i <= M.ultimo; i++) {
      tb += '<tr><td>' + esc(mesCurto(M.meses[i])) + '</td>' + M.grupos.map(function (g) {
        var v = M.por[g.k][i]; return '<td class="n">' + (v ? esc(brl(v)) : '<small>—</small>') + '</td>';
      }).join('') + '<td class="n"><b>' + esc(brl(M.tot[i])) + '</b></td></tr>';
    }
    det.innerHTML = '<summary>Ver mês a mês em tabela</summary><div class="ct-tab-cx"><table class="ct-tab"><thead>' + th + '</thead><tbody>' + tb + '</tbody></table></div>';
    sec.appendChild(det);
    return { sec: sec, M: M, desenha: function () { desenharGraf(graf, leit, M); } };
  }

  /* leitura do mês escolhido: total e o valor de cada grupo (a legenda é a própria leitura) */
  function leituraDv(leit, M, i) {
    leit.innerHTML = '<div class="ct-dv-mes"><span>' + esc(nomeMes(M.meses[i])) + '</span><b>' + esc(brl(M.tot[i])) + '</b>' +
      (i ? '<small>' + esc(M.tot[i] === M.tot[0] ? 'igual a hoje' : (M.tot[i] < M.tot[0] ? brl(M.tot[0] - M.tot[i]) + ' a menos que hoje' : brl(M.tot[i] - M.tot[0]) + ' a mais que hoje')) + '</small>' : '') +
      '</div><ul class="ct-dv-leg">' + M.grupos.map(function (g) {
        var v = M.por[g.k][i];
        return '<li' + (v ? '' : ' class="zero"') + '><i class="dvs' + g.c + '"></i><span>' + esc(g.nome) + '</span><b>' + esc(v ? brl(v) : '—') + '</b></li>';
      }).join('') + '</ul>';
  }

  function desenharGraf(box, leit, M) {
    var W = Math.max(280, Math.round(box.clientWidth - 32) || 600), H = W < 480 ? 220 : 240;
    var esq = 44, dir = 4, topo = 8, base = 22, pw = W - esq - dir, ph = H - topo - base;
    var n = M.ultimo + 1, max = 0, i;
    for (i = 0; i < n; i++) max = Math.max(max, M.tot[i]);
    var passo = passoEixo(max), teto = Math.max(passo, Math.ceil(max / passo) * passo), k = ph / teto;
    var banda = pw / n, bw = Math.max(2, Math.min(24, banda * 0.72)), y0 = topo + ph;
    var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '" role="img" tabindex="0" aria-label="' +
      esc('Parcelas de dívida por mês, de ' + mesCurto(M.meses[0]) + ' a ' + mesCurto(M.meses[M.ultimo]) + ': ' + brl(M.tot[0]) + ' neste mês. Use as setas para andar pelos meses.') + '">';
    for (var y = 0; y <= teto; y += passo) {
      var py = Math.round(y0 - y * k) + 0.5;
      s += '<line class="g' + (y === 0 ? ' b' : '') + '" x1="' + esq + '" x2="' + (W - dir) + '" y1="' + py + '" y2="' + py + '"/>' +
        '<text class="ax" x="' + (esq - 6) + '" y="' + (py + 4) + '" text-anchor="end">' + rotEixo(y) + '</text>';
    }
    s += '<rect class="sel" x="' + esq + '" y="' + topo + '" width="' + banda.toFixed(2) + '" height="' + ph + '"/>';
    for (i = 0; i < n; i++) {
      var x = esq + i * banda + (banda - bw) / 2, yc = y0, prim = true;
      M.grupos.forEach(function (g) {
        var v = M.por[g.k][i]; if (v <= 0) return;
        var hp = v * k, alt = prim ? hp : Math.max(0.6, hp - 2);   /* 2 px de fundo entre um bloco e outro */
        s += '<rect class="dvs' + g.c + '" x="' + x.toFixed(2) + '" y="' + (yc - hp).toFixed(2) + '" width="' + bw.toFixed(2) + '" height="' + alt.toFixed(2) + '"/>';
        yc -= hp; prim = false;
      });
    }
    /* eixo dos meses: um risquinho em cada janeiro e o ano no meio dos meses dele (ano curto demais fica sem rótulo) */
    var ini = 0;
    for (i = 1; i <= n; i++) {
      if (i < n && M.meses[i].slice(5, 7) !== '01') continue;
      var lx = esq + i * banda, ano = M.meses[ini].slice(0, 4), larg = (i - ini) * banda;
      if (i < n) s += '<line class="g b" x1="' + lx.toFixed(1) + '" x2="' + lx.toFixed(1) + '" y1="' + y0 + '" y2="' + (y0 + 5) + '"/>';
      if (larg >= ano.length * 6.4 + 6)
        s += '<text class="ax" x="' + (esq + (ini + i) / 2 * banda).toFixed(1) + '" y="' + (H - 6) + '" text-anchor="middle">' + ano + '</text>';
      ini = i;
    }
    s += '<rect class="hit" x="' + esq + '" y="0" width="' + pw + '" height="' + H + '"/></svg>';
    box.innerHTML = s;

    var sv = box.querySelector('svg'), sel = sv.querySelector('.sel');
    function idx(ev) {
      var r = sv.getBoundingClientRect(), px = (ev.clientX - r.left) * (W / (r.width || W)) - esq;
      return Math.max(0, Math.min(n - 1, Math.floor(px / banda)));
    }
    function mostra(m) { sel.setAttribute('x', (esq + m * banda).toFixed(2)); leituraDv(leit, M, m); }
    sv.addEventListener('pointermove', function (ev) {
      if (ev.pointerType === 'mouse') mostra(idx(ev));        /* mouse: passa por cima e lê */
      else { st.dvSel = idx(ev); mostra(st.dvSel); }          /* dedo: arrasta de lado e lê */
    });
    sv.addEventListener('pointerleave', function (ev) { if (ev.pointerType === 'mouse') mostra(st.dvSel); });
    sv.addEventListener('click', function (ev) { st.dvSel = idx(ev); mostra(st.dvSel); });
    sv.addEventListener('keydown', function (ev) {
      var m = st.dvSel;
      if (ev.key === 'ArrowRight') m++; else if (ev.key === 'ArrowLeft') m--;
      else if (ev.key === 'Home') m = 0; else if (ev.key === 'End') m = n - 1; else return;
      ev.preventDefault(); st.dvSel = Math.max(0, Math.min(n - 1, m)); mostra(st.dvSel);
    });
    mostra(Math.min(st.dvSel, n - 1));
  }

  /* quando cada uma termina e quanto alivia por mês */
  function telaMarcos(M) {
    var wrap = el('div', 'duas-col');
    var sec = el('section', 'lista ct-lista'); sec.setAttribute('aria-label', 'Quando cada dívida termina');
    sec.appendChild(el('div', 'painel-cab', '<h2>Quando cada uma termina</h2>'));
    var corpo = el('div', 'lista-corpo'), porFim = {}, semPrazo = [];
    M.itens.forEach(function (it) {
      if (it.semPrazo) { semPrazo.push(it); return; }
      if (it.fim < 0) return;
      (porFim[it.fim] = porFim[it.fim] || []).push(it);
    });
    Object.keys(porFim).map(Number).sort(function (a, b) { return a - b; }).forEach(function (i) {
      var its = porFim[i], alivio = 0;
      its.forEach(function (it) { alivio += Number(it.v[i] || 0); });
      var depois = i + 1 < M.n ? M.tot[i + 1] : 0;
      var mt = 'última parcela · ' + (i + 1 < M.n && depois > 0 ? 'de ' + mesCurto(M.meses[i + 1]) + ' em diante: ' + brl(depois) + ' por mês' : 'depois disso, nenhuma parcela de dívida');
      var l = el('div', 'ct-marco');
      l.innerHTML = '<span class="m">' + esc(mesCurto(M.meses[i])) + '</span><span class="q">' +
        its.map(function (it) { return '<span class="nm"><i class="dvs' + (GRUPOS.filter(function (g) { return g.k === it.g; })[0] || GRUPOS[5]).c + '"></i>' + esc(it.nome) + '</span>'; }).join('') +
        '<span class="mt">' + esc(mt) + '</span></span><span class="v">−' + esc(brl(centavos(alivio))) + '<small>por mês</small></span>';
      corpo.appendChild(l);
    });
    semPrazo.forEach(function (it) {
      var l = el('div', 'ct-marco');
      l.innerHTML = '<span class="m">—</span><span class="q"><span class="nm">' + esc(it.nome) + '</span><span class="mt">sem prazo cadastrado: fica no gráfico até ' +
        esc(mesCurto(M.meses[M.n - 1])) + '. Informe o total de parcelas ou o mês da última na aba Dívidas.</span></span><span class="v"></span>';
      corpo.appendChild(l);
    });
    sec.appendChild(corpo);
    wrap.appendChild(sec);
    var lado = el('div', 'lado');
    var fat = M.cartao && M.cartao.fatura ? mesCurto(M.cartao.fatura) : null;
    lado.appendChild(el('section', 'painel nota-lado', '<h2>Como ler</h2><ul class="ct-ul">' +
      '<li>Cada coluna é o quanto sai em parcelas de dívida naquele mês. Toque numa coluna (ou passe o mouse) para ver o mês.</li>' +
      '<li>Neste mês, o que já foi pago entra pelo valor pago. Daqui para frente, cada dívida usa a base dela: valor informado, último pago ou média.</li>' +
      '<li>Parcela que muda todo mês (Selic, IPCA) fica no valor da base; o número real pode variar um pouco.</li>' +
      '<li>Cartão: só as parcelas já compradas' + (fat ? ', tiradas da fatura de ' + esc(fat) : '') + '. Compra nova e assinatura ficam nas contas fixas.</li>' +
      '<li>Só você vê esta tela.</li></ul>'));
    wrap.appendChild(lado);
    return wrap;
  }

  /* ═══ FIN v4.0 — Caixa mês a mês (só o dono) ═══
     Servidor: fin_projecao_chefe. Colunas = meses do calendário (mês atual → 1 mês depois da Unimed da última competência).
     Entradas: Unimed (cai 2 meses depois da competência, com o estágio em que o número está) + conveniência em dinheiro (média de 3 meses).
     A notinha aparece à parte e NÃO soma: é venda a prazo para o profissional.
     Saídas: repasse (motor do recibo: lacrado / do dia / estimado pela agenda × comparecimento), contas fixas, parcelas de dívida e parcelas do cartão.
     Sem saldo inicial até plugar o banco: a tela mostra o resultado de cada mês, não o saldo acumulado. */
  var ESTAGIO = {
    definitiva: ['Definitiva', 'Recibo da Unimed (F5): é o que ela pagou de fato.'],
    enviada:    ['Enviada', 'Malotes já na Unimed. Até vir o recibo, projeta 100 % do enviado.'],
    lancador:   ['Lançador', 'Guias lançadas no Feegow, ainda não enviadas.'],
    planejador: ['Planejador', 'O planejador já decidiu o que cabe faturar.'],
    dia:        ['Do dia', 'Espelho do Feegow: o que já aconteceu + o que falta marcado × comparecimento.'],
    estimado:   ['Estimado', 'Só agenda marcada × comparecimento. Mês com pouca agenda marcada fica subestimado.']
  };
  var SELO_REP = { lacrado: 'lacrado', fechado: 'mês fechado', dia: 'do dia', estimado: 'estimado', sem_agenda: 'sem agenda', sem_regime: 'sem regime' };
  function sinal(v) { return v < 0 ? 'neg' : (v > 0 ? 'pos' : ''); }
  function brlS(v) { return (v < 0 ? '−' : '') + brl(Math.abs(v)); }
  function montarPj(p) {
    var meses = p.meses || [], n = meses.length, i;
    var uni = (p.unimed && p.unimed.por_coluna) || [], est = (p.unimed && p.unimed.estagio) || [];
    var rep = (p.repasse && p.repasse.por_coluna) || [];
    var conv = p.conveniencia || {}, din = Number(conv.dinheiro || 0), nota = Number(conv.notinha || 0);
    var L = { uni: [], conv: [], ent: [], rep: [], fix: [], parc: [], cart: [], sai: [], res: [] };
    for (i = 0; i < n; i++) {
      L.uni[i] = centavos(uni[i]); L.conv[i] = centavos(din);
      L.ent[i] = centavos(L.uni[i] + L.conv[i]);
      L.rep[i] = centavos(rep[i]); L.fix[i] = centavos((p.fixas || [])[i]); L.parc[i] = centavos((p.parcelas || [])[i]); L.cart[i] = centavos((p.cartao || [])[i]);
      L.sai[i] = centavos(L.rep[i] + L.fix[i] + L.parc[i] + L.cart[i]);
      L.res[i] = centavos(L.ent[i] - L.sai[i]);
    }
    return { meses: meses, n: n, L: L, est: est, nota: nota, uniComp: (p.unimed && p.unimed.competencias) || [], profs: (p.repasse && p.repasse.profissionais) || [] };
  }
  function celulaEst(e) {
    if (!e) return '';
    var d = ESTAGIO[e] || [e, '']; return '<small class="ct-est ' + esc(e) + '" title="' + esc(d[1]) + '">' + esc(d[0]) + '</small>';
  }
  function telaProj(r) {
    var dv = telaDv();
    r.appendChild(dv.sec);
    if (dv.desenha) { dv.desenha(); r.appendChild(telaMarcos(dv.M)); }

    var p = st.proj;
    var sec = el('section', 'lista ct-pj'); sec.setAttribute('aria-label', 'Caixa mês a mês');
    sec.appendChild(el('div', 'painel-cab', '<h2>Caixa, mês a mês</h2><span>' +
      esc(p && p.ok ? mesCurto(p.inicio) + ' a ' + mesCurto(p.fim) + ' · sem saldo inicial até plugar o banco' : '') + '</span>'));
    if (st.projErro) { sec.appendChild(el('div', 'lista-vazio erro', esc(st.projErro))); r.appendChild(sec); resumo(''); return; }
    if (!p) { sec.appendChild(el('div', 'lista-vazio', 'Carregando… (o repasse é calculado profissional por profissional)')); r.appendChild(sec); resumo(''); return; }
    if (!p.ok) { sec.appendChild(el('div', 'lista-vazio erro', esc(p.msg || p.erro || 'Não consegui montar a projeção.'))); r.appendChild(sec); resumo(''); return; }
    var M = montarPj(p), L = M.L, i;

    /* quatro números: este mês, o pior mês, Unimed a cair nos próximos 3 e repasse deste mês */
    var pior = 0; for (i = 1; i < M.n; i++) if (L.res[i] < L.res[pior]) pior = i;
    var uni3 = 0; for (i = 0; i < Math.min(3, M.n); i++) uni3 += L.uni[i];
    var k = el('div', 'ct-dv-kpis');
    k.innerHTML =
      '<div><span>Este mês</span><b class="' + sinal(L.res[0]) + '">' + esc(brlS(L.res[0])) + '</b><small>' + esc(brl(L.ent[0]) + ' entra · ' + brl(L.sai[0]) + ' sai') + '</small></div>' +
      '<div><span>Mês mais apertado</span><b class="' + sinal(L.res[pior]) + '">' + esc(brlS(L.res[pior])) + '</b><small>' + esc(nomeMes(M.meses[pior])) + '</small></div>' +
      '<div><span>Unimed nos próximos 3 meses</span><b>' + esc(brl(uni3)) + '</b><small>' + esc(p.imposto_aplicado ? 'líquido de ' + p.imposto_pct + '% de imposto' : 'bruto; o Simples está nas contas fixas') + '</small></div>' +
      '<div><span>Repasse deste mês</span><b>' + esc(brl(L.rep[0])) + '</b><small>' + esc(M.profs.length + ' profissionais · comparecimento Unimed ' + Math.round(Number(p.taxa_unimed || 0) * 100) + '%') + '</small></div>';
    sec.appendChild(k);

    /* a tabela: uma linha por bloco, uma coluna por mês */
    function linha(cls, rot, vals, fmt, extra) {
      var h = '<tr class="' + cls + '"><th scope="row">' + rot + '</th>';
      for (var j = 0; j < M.n; j++) h += '<td class="n">' + (fmt ? fmt(vals[j], j) : (vals[j] ? esc(brl(vals[j])) : '<small>—</small>')) + (extra ? extra(j) : '') + '</td>';
      return h + '</tr>';
    }
    var th = '<tr><th></th>' + M.meses.map(function (m, j) { return '<th class="n' + (j === 0 ? ' atual' : '') + '">' + esc(mesCurto(m)) + (j === 0 ? '<small>o que falta</small>' : '') + '</th>'; }).join('') + '</tr>';
    var tb = '<tr class="grupo"><th scope="rowgroup" colspan="' + (M.n + 1) + '">Entra</th></tr>' +
      linha('', 'Unimed', L.uni, null, function (j) { return celulaEst(M.est[j]); }) +
      linha('', 'Conveniência <small>dinheiro, média de 3 meses</small>', L.conv) +
      linha('info', 'Notinha <small>venda a prazo aos profissionais — não soma</small>', L.conv.map(function () { return M.nota; }), function (v) { return '<small>' + esc(brl(v)) + '</small>'; }) +
      linha('tot', 'Entradas', L.ent) +
      '<tr class="grupo"><th scope="rowgroup" colspan="' + (M.n + 1) + '">Sai</th></tr>' +
      linha('', 'Repasse aos profissionais', L.rep) +
      linha('', 'Contas fixas', L.fix) +
      linha('', 'Parcelas de dívidas', L.parc) +
      linha('', 'Cartão <small>parcelas já compradas</small>', L.cart) +
      linha('tot', 'Saídas', L.sai) +
      linha('res', 'Resultado do mês', L.res, function (v) { return '<b class="' + sinal(v) + '">' + esc(brlS(v)) + '</b>'; });
    var cx = el('div', 'ct-tab-cx ct-pj-cx');
    cx.innerHTML = '<table class="ct-tab ct-pj-tab"><thead>' + th + '</thead><tbody>' + tb + '</tbody></table>';
    sec.appendChild(cx);
    sec.appendChild(el('p', 'ct-nota ct-pad', 'Cada mês mostra o que entra e o que sai nele; sem saldo inicial, o resultado não acumula. ' +
      'Nos últimos meses do quadro, a agenda ainda está pouco marcada: repasse e Unimed "estimados" tendem a subir conforme a recepção marcar.'));
    r.appendChild(sec);

    /* Unimed por competência: onde cada mês de atendimento está na esteira e quando cai */
    var su = el('section', 'lista ct-pj-uni'); su.setAttribute('aria-label', 'Unimed por competência');
    su.appendChild(el('div', 'painel-cab', '<h2>Unimed: cada mês de atendimento, do dia ao recibo</h2><span>paga no último dia útil do 2º mês seguinte</span>'));
    var hu = '<table class="ct-tab"><thead><tr><th>Atendimentos de</th><th>Cai em</th><th>Estágio</th><th class="n">Do dia</th><th class="n">Planejador</th><th class="n">Lançador</th><th class="n">Enviada</th><th class="n">Definitiva</th><th class="n">Na projeção</th></tr></thead><tbody>';
    M.uniComp.forEach(function (u) {
      function c(v, ativo) { return '<td class="n' + (ativo ? ' on' : '') + '">' + (Number(v) ? esc(brl(v)) : '<small>—</small>') + '</td>'; }
      var diaTxt = Number(u.dia) ? esc(brl(u.dia)) + (u.marcadas ? '<br><small>' + esc(brl(u.dia_realizado) + ' feito + ' + u.marcadas + ' marcadas') + '</small>' : '') : '<small>—</small>';
      hu += '<tr' + (u.coluna == null ? ' class="fora"' : '') + '><td>' + esc(nomeMes(u.competencia)) + '</td><td>' + esc(mesCurto(u.cai_em)) + '</td><td>' + celulaEst(u.estagio) + '</td>' +
        '<td class="n' + (u.estagio === 'dia' || u.estagio === 'estimado' ? ' on' : '') + '">' + diaTxt + '</td>' +
        c(u.planejador, u.estagio === 'planejador') + c(u.lancador, u.estagio === 'lancador') + c(u.enviada, u.estagio === 'enviada') + c(u.definitiva, u.estagio === 'definitiva') +
        '<td class="n"><b>' + esc(brl(u.liquido)) + '</b></td></tr>';
    });
    hu += '</tbody></table>';
    var cu = el('div', 'ct-tab-cx'); cu.innerHTML = hu; su.appendChild(cu);
    su.appendChild(el('p', 'ct-nota ct-pad', 'O número avança pela esteira: do dia → planejador → lançador → enviada → definitiva. A coluna destacada é a que está valendo. ' +
      'Competência que já caiu fora do quadro aparece esmaecida.'));
    r.appendChild(su);

    /* repasse por profissional */
    var sr = el('section', 'lista ct-pj-rep'); sr.setAttribute('aria-label', 'Repasse por profissional');
    var det = el('details', 'ct-dv-det');
    var hr = '<table class="ct-tab"><thead><tr><th>Profissional</th><th class="n">Compar.</th><th class="n">R$/sessão</th>' + M.meses.map(function (m) { return '<th class="n">' + esc(mesCurto(m)) + '</th>'; }).join('') + '</tr></thead><tbody>';
    M.profs.forEach(function (pf) {
      hr += '<tr><td>' + esc(String(pf.nome || '').trim()) + '</td><td class="n">' + esc(Math.round(Number(pf.taxa || 0) * 100) + '%') + '</td><td class="n">' + esc(brl(pf.media_sessao)) + '</td>' +
        (pf.valores || []).map(function (v, j) {
          var s = (pf.selos || [])[j];
          return '<td class="n">' + (Number(v) ? esc(brl(v)) : '<small>—</small>') + (s && s !== 'estimado' && s !== 'sem_agenda' ? '<small class="ct-selo ' + esc(s) + '">' + esc(SELO_REP[s] || s) + '</small>' : '') + '</td>';
        }).join('') + '</tr>';
    });
    hr += '<tr class="tot"><th scope="row">Total</th><td></td><td></td>' + L.rep.map(function (v) { return '<td class="n"><b>' + esc(brl(v)) + '</b></td>'; }).join('') + '</tr></tbody></table>';
    det.innerHTML = '<summary>Repasse por profissional (' + M.profs.length + ')</summary><div class="ct-tab-cx">' + hr + '</div>' +
      '<p class="ct-nota ct-pad">Mês corrente: motor do recibo até hoje + o que falta marcado × comparecimento do profissional (últimos 3 meses). ' +
      'Semana confirmada pelo profissional lacra o valor; recibo gerado aparece como "lacrado". Meses seguintes: agenda marcada × comparecimento × R$/sessão do último recibo.</p>';
    sr.appendChild(det);
    r.appendChild(sr);

    resumo('Este mês: ' + brlS(L.res[0]) + ' · pior mês ' + mesCurto(M.meses[pior]) + ' ' + brlS(L.res[pior]));
  }

  /* gráfico das dívidas acompanha a largura da tela (girar o celular, abrir o menu) */
  var tLarg = null;
  window.addEventListener('resize', function () {
    clearTimeout(tLarg);
    tLarg = setTimeout(function () {
      if (!naTela() || st.aba !== 'projecao' || !st.dvp) return;
      var g = document.querySelector('#s-contas .ct-dv-graf'), l = document.querySelector('#s-contas .ct-dv-leit');
      if (g && l) desenharGraf(g, l, montarDv(st.dvp));
    }, 150);
  });

  /* a tela abre quando nav('contas') ativa a seção (sem mexer no mapa de telas do lojinha.js) */
  var ativa = false, secao = document.getElementById('s-contas');
  if (secao && window.MutationObserver) new MutationObserver(function () {
    var on = secao.classList.contains('active');
    if (on && !ativa) abrir();
    ativa = on;
  }).observe(secao, { attributes: true, attributeFilter: ['class'] });

  return { abrir: abrir, sair: sair };
})();
