/* ═══════════════════════════════════════════════════════════════════
   Conveniência · design novo: Notinhas, Caixa, Estoque, Histórico e a janela de Nova venda.
   Secretária (24/10/26): Caixa só da Administração; Estoque e Histórico sem R$; Notinhas sem os totais;
   notinha oculta mostra o nome, nunca o valor.
   Usa o mesmo Firestore e as mesmas variáveis de js/lojinha.js (db, CU, PC, PRC, CFG, fmt…).
   Cada gravação repete, campo a campo, a da função antiga citada no comentário ao lado;
   o que mudou foi só a cara (lista à esquerda, painel à direita, detalhe em janela).
   ═══════════════════════════════════════════════════════════════════ */
var LJ = (function () {
  'use strict';

  /* ── utilidades ── */
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function bt(cls, html, fn) { var b = el('button', cls, html); b.type = 'button'; if (fn) b.addEventListener('click', fn); return b; }
  function esc(s) { var d = document.createElement('span'); d.textContent = s == null ? '' : String(s); return d.innerHTML; }
  function sem(s) { return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }
  function svg(d, t, w) { return window.moldura ? moldura.svg(d, t, w) : ''; }
  var IC = { dir: 'M9.5 6l6 6-6 6', esq: 'M14.5 6l-6 6 6 6', busca: 'M4.5 11a6.5 6.5 0 1 0 13 0 6.5 6.5 0 1 0-13 0M16 16l4 4',
    menos: 'M6 12h12', mais: 'M12 6v12M6 12h12', x: 'M6 6l12 12M18 6 6 18', min: 'M6 16h12', sobe: 'M6 15l6-6 6 6',
    sacola: 'M5 8h14l-1 12.5H6zM9 10V7a3 3 0 0 1 6 0v3' };
  /* "1.234,56", "148,50" ou "148.5" → número (NaN quando não dá).
     "1.500" sem vírgula é ambíguo (1,5 ou mil e quinhentos?) e dá NaN, para a pessoa digitar de novo; letras, "Infinity" e "1e9" também. */
  function numOuNaN(txt) {
    var s = String(txt == null ? '' : txt).replace(/\s/g, '').replace(/R\$/gi, '');
    if (s.indexOf(',') >= 0) {
      /* com vírgula: só o jeito brasileiro (pontos de milhar em grupos de 3 antes da vírgula) */
      if (!/^-?(\d{1,3}(\.\d{3})+|\d*),\d*$/.test(s)) return NaN;
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
      if (!/^-?\d+(\.\d+)?$/.test(s) || /^-?\d{1,3}(\.\d{3})+$/.test(s)) return NaN;
    }
    var v = Number(s);
    return isFinite(v) ? v : NaN;
  }
  function num(txt) { var v = numOuNaN(txt); return isNaN(v) ? 0 : v; }
  function invalido(txt) { return String(txt == null ? '' : txt).trim() !== '' && isNaN(numOuNaN(txt)); }
  function br(v) { return (Math.round((Number(v) || 0) * 100) / 100).toFixed(2).replace('.', ','); }
  /* o mesmo arredondamento do toFixed(2) das telas antigas (calcCustoTotal/calcCustoUn), com vírgula */
  function fx2(v) { return v.toFixed(2).replace('.', ','); }
  /* depois que a gravação deu certo: atualiza a tela; se a atualização falhar, só avisa.
     Nunca devolve o formulário preenchido, para ninguém lançar a mesma coisa duas vezes. */
  function semQuebrar(p, msg) {
    return Promise.resolve(p).catch(function (e) {
      if (window.console) console.error(e);
      toast(msg || 'Gravado. Só não consegui atualizar a tela: recarregue a página (F5) antes de continuar.', 'ko');
    });
  }
  /* gravação pela metade (raro): aviso que fica na tela até a pessoa fechar */
  function alertaFixo(texto) {
    if (!window.moldura) { toast(texto, 'ko'); return; }
    var P = moldura.pop({ largura: '480px', titulo: 'Atenção' });
    P.corpo.appendChild(el('div', 'pp-cab', '<h2>Avise o administrador</h2>'));
    P.corpo.appendChild(el('p', 'pp-txt', esc(texto)));
    rodapeBotoes(P, [bt('btn btn-p', 'Entendi', function () { P.fechar(); })]);
  }
  function iniciais(n) { var p = String(n || '').trim().split(/\s+/).filter(Boolean); if (!p.length) return '?'; return (p[0][0] + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase(); }
  function dataDe(ts) { if (!ts) return null; return ts.toDate ? ts.toDate() : new Date(ts); }
  function d2(n) { return String(n).padStart(2, '0'); }
  function ddmm(d) { return d ? d2(d.getDate()) + '/' + d2(d.getMonth() + 1) : '—'; }
  function hhmm(d) { return d ? d2(d.getHours()) + ':' + d2(d.getMinutes()) : '—'; }
  function iso(d) { return d.getFullYear() + '-' + d2(d.getMonth() + 1) + '-' + d2(d.getDate()); }
  function chaveDia(d) { return d ? iso(d) : '—'; }
  var DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
  var MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  function diaRot(d) {
    if (!d) return '—';
    var h = new Date(); h.setHours(0, 0, 0, 0);
    var x = new Date(d.getTime()); x.setHours(0, 0, 0, 0);
    var dif = Math.round((h - x) / 864e5);
    if (dif === 0) return 'Hoje, ' + ddmm(d);
    if (dif === 1) return 'Ontem, ' + ddmm(d);
    return DIAS[d.getDay()] + ', ' + ddmm(d);
  }
  function quandoTxt(d) { return d ? diaRot(d) + ' às ' + hhmm(d) : '—'; }
  var TIPO_ROT = { venda_paciente: 'Venda', venda_profissional: 'Notinha', entrada_estoque: 'Entrada de estoque', pagamento_notinha: 'Pagamento de notinha',
    bonificacao: 'Bonificação', sangria: 'Sangria', suprimento: 'Suprimento', edicao_profissional: 'Edição de profissional',
    ajuste_estoque: 'Balanço de estoque', edicao_produto: 'Edição de produto' };
  var TIPO_COR = { venda_paciente: '#248A3D', venda_profissional: '#2C2D6E', pagamento_notinha: '#248A3D', bonificacao: '#C93400', entrada_estoque: '#636366',
    sangria: '#D70015', suprimento: '#248A3D', edicao_profissional: '#AEAEB2', ajuste_estoque: '#636366', edicao_produto: '#AEAEB2' };
  function tipoRot(t) { return TIPO_ROT[t] || t || '—'; }
  function formaRot(f) { return { dinheiro: 'Dinheiro', pix: 'PIX', debito: 'Débito', credito: 'Crédito', notinha: 'Notinha' }[f] || '—'; }
  function grupoRot(g) { return g === 'livraria' ? 'Livraria' : g === 'conveniencia' ? 'Conveniência' : (g || '—'); }
  function semValor(t) { return t === 'edicao_profissional' || t === 'edicao_produto' || t === 'ajuste_estoque'; }
  /* taxa do cartão: a mesma conta das telas antigas */
  function taxaDe(forma, v) { return forma === 'debito' ? v * (CFG.taxa_debito || 0) / 100 : forma === 'credito' ? v * (CFG.taxa_credito || 0) / 100 : 0; }
  function pct(v) { return String(v == null ? 0 : v).replace('.', ',') + '%'; }
  function saldoTxt(s) {
    if (s > 0.004) return { txt: fmt(s), cor: '#D70015', rot: 'Deve' };
    if (s < -0.004) return { txt: 'Crédito ' + fmt(-s), cor: '#248A3D', rot: 'Tem crédito' };
    return { txt: 'Em dia', cor: '#636366', rot: 'Saldo' };
  }
  function bonifPadrao() { return CFG.valor_bonificacao_padrao != null ? CFG.valor_bonificacao_padrao : 100; }
  function descMov(m) {
    if (m.tipo === 'pagamento_notinha') return m.descricao || 'Pagamento de notinha';
    if (m.tipo === 'bonificacao') return 'Bonificação mensal';
    if (m.tipo === 'sangria' || m.tipo === 'suprimento') {
      var d = m.descricao && m.descricao !== m.tipo ? m.descricao : tipoRot(m.tipo);
      return d.charAt(0).toUpperCase() + d.slice(1);
    }
    var q = m.quantidade || 0;
    if (m.produto_nome) return m.produto_nome + (q > 1 && m.tipo !== 'entrada_estoque' && m.tipo !== 'ajuste_estoque' ? ' ×' + q : '');
    return m.descricao || '—';
  }
  function clienteDe(m) {
    if (m.profissional_nome) return m.profissional_nome;
    if (m.cliente_tipo === 'paciente') return 'Paciente';
    return '';
  }
  function valorTxt(m) {
    if (semValor(m.tipo)) return '—';
    return (m.tipo === 'sangria' ? '− ' : '') + fmt(m.valor_total);
  }
  function seg(opcoes, atual, onPick, extra) {
    var s = el('div', 'seg' + (extra ? ' ' + extra : '')); s.setAttribute('role', 'group');
    opcoes.forEach(function (o) {
      var on = o[0] === atual;
      var b = bt(on ? 'on' : '', (o[2] ? '<span class="q" style="background:' + o[2] + '"></span>' : '') + esc(o[1]) +
        (o[3] != null ? ' <span class="n">' + o[3] + '</span>' : ''), function () { if (o[0] !== atual) onPick(o[0]); });
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      s.appendChild(b);
    });
    return s;
  }
  function alturaLista(raiz) {
    var l = raiz.querySelector('.lista.alta'); if (!l) return;
    var topo = l.getBoundingClientRect().top + window.scrollY;
    l.style.height = Math.max(520, window.innerHeight - topo - 24) + 'px';
  }
  window.addEventListener('resize', function () { document.querySelectorAll('.lj-raiz').forEach(function (r) { if (r.offsetParent) alturaLista(r); }); });
  /* a seção antiga continua no HTML (as funções antigas usam os ids dela); a tela nova vive num contêiner próprio */
  function raiz(sec) {
    var s = document.getElementById('s-' + sec); if (!s) return null;
    s.classList.add('lj-novo');
    var r = s.querySelector(':scope > .lj-raiz');
    if (!r) { r = el('div', 'lj-raiz'); s.appendChild(r); }
    return r;
  }
  function naTela(sec) { var s = document.getElementById('s-' + sec); return !!(s && s.classList.contains('active')); }
  function acoes(dest) { return window.moldura ? moldura.acoesDe(dest) : null; }
  function resumo(dest, t) { if (window.moldura) moldura.resumo(dest, t); }
  function copiar(txt, botaoEl, rotOk, rotNormal) {
    var feito = function () {
      botaoEl.textContent = rotOk;
      setTimeout(function () { if (document.body.contains(botaoEl)) botaoEl.textContent = rotNormal; }, 2400);
    };
    var reserva = function () {
      var ta = document.createElement('textarea'); ta.value = txt; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.left = '-9999px';
      document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); } catch (e) {} ta.remove(); feito();
    };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(feito, reserva); else reserva();
  }
  function campo(rot, input, extra) {
    var l = el('label', 'lj-campo' + (extra ? ' ' + extra : ''));
    l.appendChild(el('span', '', rot));
    l.appendChild(input);
    return l;
  }
  function entrada(tipo, valor, ph, modo) {
    var i = el('input', 'fc'); i.type = tipo || 'text'; if (valor != null) i.value = valor; if (ph) i.placeholder = ph; if (modo) i.inputMode = modo;
    return i;
  }
  function campos(lista) {
    var c = el('div', 'lj-campos');
    lista.forEach(function (x) {
      c.appendChild(el('div', 'lj-cl', '<span>' + esc(x[0]) + '</span><b' + (x[2] ? ' style="color:' + x[2] + '"' : '') + (x[3] ? ' class="' + x[3] + '"' : '') + '>' + esc(x[1]) + '</b>'));
    });
    return c;
  }
  function rodapeNav(P, i, n, ir) {
    P.rodape.innerHTML = '';
    P.rodape.classList.remove('fim');
    P.rodape.hidden = n < 2;
    if (n < 2) return;
    var a = bt('btn btn-s', svg(IC.esq, 16, 2.2) + 'Anterior', function () { if (i > 0) ir(i - 1); }); a.disabled = i <= 0;
    var p = bt('btn btn-p', 'Próxima' + svg(IC.dir, 16, 2.2), function () { if (i < n - 1) ir(i + 1); }); p.disabled = i >= n - 1;
    P.rodape.appendChild(a); P.rodape.appendChild(el('span', 'pop-pos', (i + 1) + ' de ' + n)); P.rodape.appendChild(p);
  }
  function rodapeBotoes(P, lista) {
    P.rodape.innerHTML = ''; P.rodape.classList.add('fim'); P.rodape.hidden = false;
    lista.forEach(function (b) { P.rodape.appendChild(b); });
  }

  /* ── períodos (Hoje / Esta semana / Este mês / Outro período) ── */
  function periodo(st) {
    var h = new Date(), ini, fim = new Date(h.getFullYear(), h.getMonth(), h.getDate(), 23, 59, 59);
    if (st.per === 'hoje') ini = new Date(h.getFullYear(), h.getMonth(), h.getDate(), 0, 0, 0);
    else if (st.per === 'semana') { var dw = (h.getDay() + 6) % 7; ini = new Date(h.getFullYear(), h.getMonth(), h.getDate() - dw, 0, 0, 0); }
    else if (st.per === 'outro' && st.ini && st.fim) { ini = new Date(st.ini + 'T00:00:00'); fim = new Date(st.fim + 'T23:59:59'); }
    else ini = new Date(h.getFullYear(), h.getMonth(), 1, 0, 0, 0);
    var rot = st.per === 'hoje' ? 'Hoje, ' + ddmm(ini) : st.per === 'semana' ? 'Esta semana, de ' + ddmm(ini) + ' a ' + ddmm(fim) :
      st.per === 'outro' ? 'De ' + ddmm(ini) + ' a ' + ddmm(fim) : 'Este mês, de ' + ddmm(ini) + ' a ' + ddmm(fim);
    var curto = st.per === 'hoje' ? 'hoje' : st.per === 'semana' ? 'esta semana' : st.per === 'outro' ? 'no período' : 'este mês';
    return { ini: ini, fim: fim, rot: rot, curto: curto };
  }
  function controlePeriodo(dest, st, aoMudar) {
    var ac = acoes(dest); if (!ac) return;
    var box = ac.querySelector('.lj-per');
    if (!box) { box = el('div', 'lj-per'); ac.appendChild(box); }
    box.innerHTML = '';
    box.appendChild(seg([['hoje', 'Hoje'], ['semana', 'Esta semana'], ['mes', 'Este mês'], ['outro', 'Outro período']], st.per, function (v) {
      st.per = v;
      if (v === 'outro' && !st.ini) { var h = new Date(); st.ini = iso(new Date(h.getFullYear(), h.getMonth(), 1)); st.fim = iso(h); }
      aoMudar();
    }));
    if (st.per === 'outro') {
      var lin = el('div', 'lj-per-datas');
      var a = entrada('date', st.ini), b = entrada('date', st.fim);
      a.setAttribute('aria-label', 'De'); b.setAttribute('aria-label', 'Até');
      lin.appendChild(a); lin.appendChild(el('span', '', 'a')); lin.appendChild(b);
      lin.appendChild(bt('btn btn-s', 'Ver', function () {
        if (!a.value || !b.value) { toast('Informe as duas datas.', 'ko'); return; }
        st.ini = a.value; st.fim = b.value; aoMudar();
      }));
      box.appendChild(lin);
    }
  }
  function buscaMovs(per) { return LAPI.movimentos({ ini: per.ini, fim: per.fim }); }   /* do mais novo ao mais velho */

  /* ── marcar como erro: o servidor marca e devolve saldo e estoque numa operação só (ou não faz nada),
        guarda quem marcou e quando, e recusa marcar duas vezes ── */
  function marcarErro(id, mot) {
    return LAPI.marcarErro(id, mot).catch(function (e) { if (e.codigo === 'JA_MARCADO') e.jaMarcado = true; throw e; });
  }
  function compensaTxt(m, semR) {   /* semR: Histórico da secretária, o mesmo aviso sem os valores */
    var p = [], q = m.quantidade || 1;
    if (m.tipo === 'venda_profissional' && m.profissional_nome) p.push('A notinha de ' + m.profissional_nome + (semR ? ' diminui o valor desta compra.' : ' diminui ' + fmt(m.valor_total) + '.'));
    if ((m.tipo === 'pagamento_notinha' || m.tipo === 'bonificacao') && m.profissional_nome)
      p.push(semR ? 'O valor ' + (m.tipo === 'bonificacao' ? 'desta bonificação' : 'deste pagamento') + ' volta para a notinha de ' + m.profissional_nome + '.'
                  : 'A notinha de ' + m.profissional_nome + ' volta a ter ' + fmt(m.valor_total) + '.');
    if ((m.tipo === 'venda_paciente' || m.tipo === 'venda_profissional') && m.produto_nome) p.push('O estoque de ' + m.produto_nome + ' volta ' + q + ' un.');
    if (m.tipo === 'entrada_estoque' && m.produto_nome) p.push('O estoque de ' + m.produto_nome + ' perde ' + q + ' un.');
    if (m.tipo === 'ajuste_estoque' && m.produto_nome) p.push('O balanço de ' + m.produto_nome + ' é desfeito no estoque.');
    if (m.tipo === 'edicao_profissional') p.push('É só um registro: uma correção de saldo feita à mão não volta sozinha.');
    return p.join(' ');
  }
  /* corpo de janela de um lançamento (Histórico, Caixa e lançamentos da notinha) */
  function vistaLanc(P, m, ctx) {
    var d = dataDe(m.timestamp);
    var erro = m.marcado_erro === true;
    P.corpo.appendChild(el('div', 'pp-cab', '<span class="pp-quando">' + esc(quandoTxt(d)) + '</span>' +
      '<h2' + (erro ? ' class="lj-risco"' : '') + '>' + esc(descMov(m)) + '</h2>'));
    var tg = el('span', 'pp-tag', esc(erro ? 'Marcado como erro' : tipoRot(m.tipo)));
    tg.style.color = erro ? '#D70015' : (TIPO_COR[m.tipo] || '#636366');
    P.corpo.lastChild.appendChild(tg);
    var lista = [['Tipo', tipoRot(m.tipo)]];
    var cli = clienteDe(m); if (cli) lista.push(['Cliente', cli]);
    if (m.quantidade) lista.push(['Quantidade', (m.tipo === 'ajuste_estoque' && m.quantidade > 0 ? '+' : '') + m.quantidade + ' un']);
    if (m.forma_pagamento) lista.push(['Pagamento', formaRot(m.forma_pagamento)]);
    if (!semValor(m.tipo) && !ctx.semValor) lista.push(['Valor', valorTxt(m)]);
    if ((m.taxa_valor || 0) > 0 && !ctx.semValor) { lista.push(['Taxa do cartão', '− ' + fmt(m.taxa_valor)]); lista.push(['Valor líquido', fmt(m.valor_liquido)]); }
    if (m.descricao && m.descricao !== 'Entrada de estoque' && m.descricao !== m.tipo && (m.produto_nome || semValor(m.tipo))) lista.push(['Observação', m.descricao]);
    lista.push(['Lançado por', m.secretaria_nome || '—']);
    P.corpo.appendChild(campos(lista));
    if (erro) {
      P.corpo.appendChild(el('div', 'pp-caixa', '<span class="pp-txt txt-vermelho"><b>Marcado como erro</b></span><span class="pp-txt">Motivo: ' + esc(m.motivo_erro || '—') +
        '. Continua registrado, mas está fora dos cálculos.</span>' +
        (m.erro_por_nome ? '<span class="pp-txt cinza">Marcado por ' + esc(m.erro_por_nome) + (m.erro_em ? ', ' + esc(quandoTxt(dataDe(m.erro_em))) : '') + '.</span>' : '')));
      return;
    }
    if (ctx.modo === 'erro') {
      var c = el('div', 'mal-conf lj-conf-erro');
      c.appendChild(el('b', '', 'Marcar como erro'));
      c.appendChild(el('span', 'pp-txt', 'O lançamento continuará registrado, mas será retirado dos cálculos. ' + esc(compensaTxt(m, ctx.semValor))));
      var ta = el('textarea', 'pp-nota'); ta.rows = 2; ta.placeholder = 'Motivo (obrigatório): descreva o erro'; ta.value = ctx.motivo || ''; ta.setAttribute('aria-label', 'Motivo');
      ta.addEventListener('input', function () { ctx.motivo = ta.value; });
      c.appendChild(ta);
      if (ctx.erroMotivo) c.appendChild(el('span', 'mal-erro-txt', 'Descreva o motivo do erro.'));
      var l = el('div', 'mal-conf-bt');
      l.appendChild(bt('btn btn-s', 'Cancelar', function () { if (ctx.ocupado) return; ctx.modo = null; ctx.erroMotivo = false; ctx.repinta(); }));
      var s = bt('btn btn-d', 'Marcar como erro', function () {
        if (ctx.ocupado) return;
        var mot = String(ctx.motivo || '').trim();
        if (!mot) { ctx.erroMotivo = true; ctx.repinta(); return; }
        ctx.ocupado = true; s.disabled = true; s.textContent = 'Salvando…';
        marcarErro(m.id, mot).then(function () {
          m.marcado_erro = true; m.motivo_erro = mot;
          ctx.ocupado = false; ctx.modo = null; ctx.motivo = ''; ctx.erroMotivo = false;
          toast('Lançamento marcado como erro.', 'ok');
          return loadCaches().then(function () { return ctx.depois(); }, function (e) { ctx.repinta(); throw e; }).catch(function (e) { return semQuebrar(Promise.reject(e)); });
        }, function (e) {
          ctx.ocupado = false;
          if (e.marcou || e.jaMarcado) { m.marcado_erro = true; if (!m.motivo_erro) m.motivo_erro = e.jaMarcado ? '(já estava marcado)' : mot; ctx.modo = null; ctx.motivo = ''; }
          if (e.marcou) {
            semQuebrar(loadCaches().then(function () { return ctx.depois(); })).then(function () { alertaFixo(e.message); });
          } else if (e.jaMarcado) {
            toast(e.message, 'ko');
            semQuebrar(loadCaches().then(function () { return ctx.depois(); }), 'Não consegui atualizar a tela: recarregue a página (F5).');
          } else { toast('Erro: ' + (e.message || e), 'ko'); ctx.repinta(); }
        });
      });
      l.appendChild(s); c.appendChild(l);
      P.corpo.appendChild(c);
      setTimeout(function () { if (document.body.contains(ta)) ta.focus(); }, 0);
    } else {
      P.corpo.appendChild(bt('btn btn-s lj-btn-erro', 'Marcar como erro', function () { ctx.modo = 'erro'; ctx.motivo = ''; ctx.erroMotivo = false; ctx.repinta(); }));
    }
  }

  /* ════════════════════════ NOTINHAS ════════════════════════ */
  var nt = { profs: [], mes: [], filtro: 'devendo', busca: '', carregado: false, erro: '', pinta: null, aberto: null };
  function notinhas() {
    var r = raiz('notinhas'); if (!r) return;
    if (!nt.carregado) r.innerHTML = '<div class="lista-vazio">Carregando…</div>';
    var h = new Date(), ini = new Date(h.getFullYear(), h.getMonth(), 1, 0, 0, 0), fim = new Date(h.getFullYear(), h.getMonth(), h.getDate(), 23, 59, 59);
    return Promise.all([
      LAPI.profissionais(),
      buscaMovs({ ini: ini, fim: fim })
    ]).then(function (res) {
      nt.profs = res[0].filter(function (p) { return p.ativo === true && !ehOculto(p); });
      nt.mes = res[1].filter(semErro);
      nt.carregado = true; nt.erro = '';
      if (naTela('notinhas')) desenhaNotinhas();
    }).catch(function (e) { nt.erro = e.message || String(e); if (naTela('notinhas')) desenhaNotinhas(); });
  }
  function ntDados() {
    var ult = {}, comp = 0, pag = 0, vis = {};
    nt.profs.forEach(function (p) { vis[p.id] = true; });
    nt.mes.forEach(function (m) {
      if (!m.profissional_id || !vis[m.profissional_id]) return;
      if (m.tipo === 'venda_profissional') { comp += m.valor_total || 0; if (!ult[m.profissional_id]) ult[m.profissional_id] = dataDe(m.timestamp); }
      if (m.tipo === 'pagamento_notinha' || m.tipo === 'bonificacao') pag += m.valor_total || 0;
    });
    return { ult: ult, comp: comp, pag: pag };
  }
  function bonifDe(p) { return p.bonificacao_mensal != null ? p.bonificacao_mensal : (CFG.valor_bonificacao_padrao || 100); }
  function desenhaNotinhas() {
    var r = raiz('notinhas'); if (!r) return;
    var D = ntDados();
    var aberto = 0, nDev = 0;
    nt.profs.forEach(function (p) { var s = p.saldo_devedor || 0; if (s > 0) { aberto += s; } if (s > 0.004) nDev++; });
    var admin = isAdmin();   /* secretária: sem os totais, só o que cada um deve (24/10/26) */
    resumo('notinhas', nt.carregado ? (admin ? fmt(aberto) + ' em aberto · ' : '') + (nDev === 1 ? '1 profissional devendo' : nDev + ' profissionais devendo') + ' · bonificação mensal de ' + fmt(bonifPadrao()) : '');
    var antes = r.querySelector('.lista-corpo'), rol = antes && !nt.topo ? antes.scrollTop : 0; nt.topo = false;
    var foco = document.activeElement && document.activeElement.classList.contains('lj-busca-in') ? document.activeElement.selectionStart : null;
    r.innerHTML = '';
    var wrap = el('div', 'duas-col');
    var sec = el('section', 'lista alta'); sec.setAttribute('aria-label', 'Profissionais');
    var q = sem(nt.busca).trim();
    var base = nt.profs.filter(function (p) { return !q || sem(p.nome).indexOf(q) >= 0; });
    var cont = { devendo: 0, emdia: 0, todos: base.length };
    base.forEach(function (p) { cont[(p.saldo_devedor || 0) > 0.004 ? 'devendo' : 'emdia']++; });
    var vis = base.filter(function (p) { var s = p.saldo_devedor || 0; return nt.filtro === 'todos' ? true : nt.filtro === 'devendo' ? s > 0.004 : s <= 0.004; })
      .sort(function (a, b) { var x = (b.saldo_devedor || 0) - (a.saldo_devedor || 0); return x || String(a.nome).localeCompare(String(b.nome), 'pt-BR'); });
    nt.vis = vis.map(function (p) { return p.id; });
    var topo = el('div', 'lista-topo');
    topo.appendChild(seg([['devendo', 'Devendo', '#D70015', cont.devendo], ['emdia', 'Em dia', '#248A3D', cont.emdia], ['todos', 'Todos', '#AEAEB2', cont.todos]], nt.filtro,
      function (v) { nt.filtro = v; nt.topo = true; desenhaNotinhas(); }));
    var bu = el('label', 'busca busca-p', svg(IC.busca, 14, 2) + '<input type="search" class="lj-busca-in" placeholder="Buscar" aria-label="Buscar profissional" autocomplete="off">');
    var bi = bu.querySelector('input'); bi.value = nt.busca;
    bi.addEventListener('input', function () { nt.busca = bi.value; nt.topo = true; desenhaNotinhas(); });
    topo.appendChild(bu);
    sec.appendChild(topo);
    var corpo = el('div', 'lista-corpo');
    if (nt.erro) corpo.appendChild(el('div', 'lista-vazio erro', esc(nt.erro)));
    else if (!nt.carregado) corpo.appendChild(el('div', 'lista-vazio', 'Carregando…'));
    else if (!vis.length) corpo.appendChild(el('div', 'lista-vazio', q ? 'Ninguém com esse nome.' : nt.filtro === 'devendo' ? 'Ninguém devendo. Todas as notinhas estão em dia.' : 'Nenhum profissional aqui.'));
    vis.forEach(function (p) {
      var s = saldoTxt(p.saldo_devedor || 0), u = D.ult[p.id];
      var b = bt('linha lj-linha' + (nt.aberto === p.id ? ' aberta' : ''), '<span class="cf-ini" aria-hidden="true">' + esc(iniciais(p.nome)) + '</span>' +
        '<span class="q"><span class="nm">' + esc(p.nome) + '</span><span class="mt">' + esc((u ? 'Última compra ' + ddmm(u) : 'Sem compras no mês') + ' · bonificação ' + fmt(bonifDe(p)) + '/mês') + '</span></span>' +
        '<span class="lj-saldo" style="color:' + s.cor + '">' + esc(s.txt) + '</span>' + svg(IC.dir, 16, 2), function () { abrirNotinha(p.id); });
      b.setAttribute('aria-haspopup', 'dialog'); b.setAttribute('data-id', p.id);
      corpo.appendChild(b);
    });
    sec.appendChild(corpo);
    wrap.appendChild(sec);
    var lado = el('div', 'lado');
    if (admin) lado.appendChild(el('section', 'painel lj-grande', '<h2 class="lj-grande-rot">Em aberto hoje</h2><span class="lj-grande-n" style="color:#D70015">' + esc(fmt(aberto)) + '</span>' +
      '<span class="lj-grande-l1">' + esc((nDev === 1 ? '1 profissional devendo' : nDev + ' profissionais devendo') + ' de ' + nt.profs.length) + '</span>' +
      '<span class="lj-grande-l2">' + esc('Em ' + MESES[new Date().getMonth()] + ': ' + fmt(D.comp) + ' em compras e ' + fmt(D.pag) + ' em pagamentos') + '</span>'));
    var novoP = el('section', 'painel nota-lado', '<h2>Profissional novo na conveniência?</h2><p class="cinza">Cadastre aqui para poder vender na notinha dele.</p>');
    novoP.appendChild(bt('btn btn-p lj-alinha', 'Novo profissional', function () { abrirNovoProf(); }));
    lado.appendChild(novoP);
    lado.appendChild(el('section', 'painel nota-lado', '<h2>Como funciona</h2><p>Compra na notinha <b>soma</b> no saldo do profissional. Pagamento e bonificação <b>baixam</b> o saldo; o pagamento entra no caixa.</p>' +
      '<p class="cinza">O profissional acompanha a própria notinha pelo link, sem senha.</p>'));
    wrap.appendChild(lado);
    r.appendChild(wrap);
    alturaLista(r);
    var c2 = r.querySelector('.lista-corpo'); if (c2) c2.scrollTop = rol;
    if (foco != null) { var ni = r.querySelector('.lj-busca-in'); if (ni) { ni.focus(); try { ni.setSelectionRange(foco, foco); } catch (e) {} } }
    if (nt.pinta) nt.pinta();
  }
  function marcaNot() {
    document.querySelectorAll('#s-notinhas .lj-linha.aberta').forEach(function (x) { x.classList.remove('aberta'); });
    if (nt.aberto) { var l = document.querySelector('#s-notinhas .lj-linha[data-id="' + CSS.escape(nt.aberto) + '"]'); if (l) l.classList.add('aberta'); }
  }
  function prDe(id) { for (var i = 0; i < nt.profs.length; i++) if (nt.profs[i].id === id) return nt.profs[i]; return null; }
  /* extrato em texto (a mesma conta de gerarRel(), com acentos) */
  var PAD = function (s, n) { s = String(s); return s.length > n ? s : s + new Array(n - s.length + 1).join(' '); };
  var PADL = function (s, n) { s = String(s); return s.length >= n ? s : new Array(n - s.length + 1).join(' ') + s; };
  function relDesc2(base, suf) { var max = 30, s = suf || '', b = String(base || '-'); return (b.length + s.length > max ? b.substring(0, max - s.length - 1) + '.' : b) + s; }
  function relLinha2(m) {
    var dt = fmtD(m.timestamp), q = m.quantidade || 1, desc = '', sin = '  ';
    if (m.tipo === 'venda_profissional') { desc = relDesc2(m.produto_nome, q > 1 ? ' x' + q : ''); sin = '+ '; }
    else if (m.tipo === 'pagamento_notinha') { desc = relDesc2('PAGAMENTO', m.forma_pagamento ? ' · ' + formaRot(m.forma_pagamento).toUpperCase() : ''); sin = '- '; }
    else if (m.tipo === 'bonificacao') { desc = 'BONIFICAÇÃO MENSAL'; sin = '- '; }
    else { desc = relDesc2(m.produto_nome, ' [pago]'); sin = '  '; }
    return '  ' + dt + '  ' + PAD(desc, 30) + sin + PADL(fmt(m.valor_total), 11);
  }
  function relRodape2(d, saldo) {
    var t = '  ' + new Array(54).join('-') + '\n';
    if (d.compras > 0) t += '  ' + PAD('Compras na notinha', 42) + '+ ' + PADL(fmt(d.compras), 11) + '\n';
    if (d.pagos > 0) t += '  ' + PAD('Pagamentos', 42) + '- ' + PADL(fmt(d.pagos), 11) + '\n';
    if (d.bonif > 0) t += '  ' + PAD('Bonificações', 42) + '- ' + PADL(fmt(d.bonif), 11) + '\n';
    if (d.avista > 0) t += '  ' + PAD('[pago] Pagas na hora (fora do saldo)', 42) + '  ' + PADL(fmt(d.avista), 11) + '\n';
    var lbl = saldo > 0 ? 'SALDO DEVEDOR ATUAL' : saldo < 0 ? 'CRÉDITO A FAVOR' : 'SALDO ATUAL (em dia)';
    t += '  ' + PAD(lbl, 42) + '  ' + PADL(fmt(Math.abs(saldo)), 11) + '\n';
    return t;
  }
  function textoExtrato(profId, vi, vf) {
    if (!vi || !vf) return Promise.resolve('Informe as duas datas.');
    var ini = new Date(vi + 'T00:00:00'), fim = new Date(vf + 'T23:59:59');
    var W = 57, IG = new Array(W + 1).join('='), TR = new Array(W + 1).join('-');
    return Promise.all([
      LAPI.movimentos({ ini: ini, fim: fim, crescente: true }),
      LAPI.profissionais()
    ]).then(function (res) {
      var SALDO = {}, NOME = {}, OCULTO = {};
      res[1].forEach(function (x) { SALDO[x.id] = x.saldo_devedor || 0; NOME[x.id] = x.nome; OCULTO[x.id] = ehOculto(x); });
      var TIPOS = ['venda_profissional', 'pagamento_notinha', 'bonificacao', 'venda_paciente'];
      var movs = res[0].filter(function (m) { return semErro(m) && m.profissional_id && TIPOS.indexOf(m.tipo) >= 0; });
      if (profId) movs = movs.filter(function (m) { return m.profissional_id === profId; });
      else movs = movs.filter(function (m) { return !OCULTO[m.profissional_id]; });
      movs.sort(ordAsc);
      var por = {};
      movs.forEach(function (m) {
        var k = m.profissional_id, v = m.valor_total || 0;
        if (!por[k]) por[k] = { nome: NOME[k] || m.profissional_nome || '(sem nome)', itens: [], compras: 0, pagos: 0, bonif: 0, avista: 0 };
        por[k].itens.push(m);
        if (m.tipo === 'venda_profissional') por[k].compras += v;
        else if (m.tipo === 'pagamento_notinha') por[k].pagos += v;
        else if (m.tipo === 'bonificacao') por[k].bonif += v;
        else por[k].avista += v;
      });
      var iniF = ini.toLocaleDateString('pt-BR'), fimF = fim.toLocaleDateString('pt-BR'), txt = '';
      if (profId) {
        var nm = NOME[profId] || 'Profissional', sd = SALDO[profId] || 0, d = por[profId];
        txt += 'EXTRATO DE NOTINHA\n' + nm + '\nPeríodo: ' + iniF + ' a ' + fimF + '\n' + IG + '\n';
        if (!d) txt += '\n  Nenhuma movimentação neste período.\n\n' + relRodape2({ compras: 0, pagos: 0, bonif: 0, avista: 0 }, sd);
        else { txt += '\n'; d.itens.forEach(function (m) { txt += relLinha2(m) + '\n'; }); txt += relRodape2(d, sd); }
        txt += IG + '\nCentro Médico Judithe Ferreira · Lev Soul\n';
      } else {
        txt += 'EXTRATO DE NOTINHAS · TODOS OS PROFISSIONAIS\nPeríodo: ' + iniF + ' a ' + fimF + '\n' + IG + '\n';
        var ks = Object.keys(por).sort(function (a, b) { return por[a].nome.localeCompare(por[b].nome); });
        if (!ks.length) return txt + '\n  Nenhuma movimentação de profissional no período.\n';
        var tc = 0, tp = 0, tb = 0, ts = 0;
        ks.forEach(function (k) {
          var d2_ = por[k]; tc += d2_.compras; tp += d2_.pagos; tb += d2_.bonif;
          txt += '\n' + d2_.nome + '\n' + TR + '\n';
          d2_.itens.forEach(function (m) { txt += relLinha2(m) + '\n'; });
          txt += relRodape2(d2_, SALDO[k] || 0);
        });
        Object.keys(SALDO).forEach(function (k) { if (SALDO[k] > 0 && !OCULTO[k]) ts += SALDO[k]; });
        txt += '\n' + IG + '\n';
        if (isAdmin()) {   /* os totais de todos são só da Administração; a secretária fica com o de cada um (24/10/26) */
          txt += '  ' + PAD('TOTAL COMPRAS NO PERÍODO', 42) + '+ ' + PADL(fmt(tc), 11) + '\n';
          txt += '  ' + PAD('TOTAL PAGAMENTOS', 42) + '- ' + PADL(fmt(tp), 11) + '\n';
          txt += '  ' + PAD('TOTAL BONIFICAÇÕES', 42) + '- ' + PADL(fmt(tb), 11) + '\n';
          txt += '  ' + PAD('DEVIDO HOJE (TODOS)', 42) + '  ' + PADL(fmt(ts), 11) + '\n';
        }
      }
      return txt;
    }).catch(function (e) { console.error(e); return 'ERRO AO GERAR EXTRATO\n\n' + (e.message || e); });
  }
  function blocoExtrato(profId, alvo) {
    var h = new Date();
    var st = { ini: iso(new Date(h.getFullYear(), h.getMonth(), 1)), fim: iso(h) };
    var box = el('div', 'lj-extrato');
    var lin = el('div', 'lj-per-datas');
    var a = entrada('date', st.ini), b = entrada('date', st.fim);
    a.setAttribute('aria-label', 'De'); b.setAttribute('aria-label', 'Até');
    lin.appendChild(el('span', 'cinza', 'De')); lin.appendChild(a); lin.appendChild(el('span', 'cinza', 'até')); lin.appendChild(b);
    box.appendChild(lin);
    var ta = el('textarea', 'lj-mono'); ta.readOnly = true; ta.rows = alvo === 'rel' ? 16 : 12; ta.value = 'Gerando o extrato…'; ta.setAttribute('aria-label', 'Extrato');
    box.appendChild(ta);
    var bts = el('div', 'lj-bts');
    var c1 = bt('btn btn-s', 'Copiar texto', function () { if (ta.value) copiar(ta.value, c1, 'Copiado', 'Copiar texto'); });
    var c2 = bt('btn btn-p', 'Copiar para o WhatsApp', function () { if (ta.value) copiar('```\n' + ta.value + '```', c2, 'Copiado com formatação do WhatsApp', 'Copiar para o WhatsApp'); });
    bts.appendChild(c1); bts.appendChild(c2);
    box.appendChild(bts);
    var gera = function () { ta.value = 'Gerando o extrato…'; textoExtrato(typeof profId === 'function' ? profId() : profId, a.value, b.value).then(function (t) { ta.value = t; }); };
    a.addEventListener('change', gera); b.addEventListener('change', gera);
    box._gera = gera;
    gera();
    return box;
  }
  function abrirNotinha(id, ids) {
    if (!window.moldura) return;
    ids = (ids || nt.vis || []).slice();
    var atual = id, modo = 'lista', aviso = '', avisoErro = false, ocupado = false, lanc = null, lancErro = '', lancAtual = null, ctxL = null;
    var form = {};
    var P = moldura.pop({ largura: '640px', titulo: 'Notinha', aoFechar: function () { nt.aberto = null; nt.pinta = null; marcaNot(); } });
    function limpa() { modo = 'lista'; aviso = ''; avisoErro = false; form = {}; lanc = null; lancErro = ''; lancAtual = null; }
    function carregaLanc(p) {
      lanc = null; lancErro = '';
      var quem = p.id;
      LAPI.movimentos({ profissional: p.id }).then(function (lista) {
        if (quem !== atual) return;
        lanc = lista.sort(ordDesc);
        if (P.aberto && modo === 'lista') pinta();
      }).catch(function (e) { lancErro = e.message || String(e); if (P.aberto) pinta(); });
    }
    function recarregar() { lanc = null; return notinhas(); }
    /* depois de gravar: recarrega os dados e a janela; se a recarga falhar, a janela fica sem o formulário (nada de lançar duas vezes) */
    function atualizaDepois() {
      return loadCaches().then(function () { return recarregar(); }).then(function () { var px = prDe(atual); if (px) carregaLanc(px); })
        .catch(function (e) { if (P.aberto) pinta(); return semQuebrar(Promise.reject(e)); });
    }
    function pinta() {
      var p = prDe(atual);
      if (!p) { P.fechar(); return; }
      nt.aberto = atual; marcaNot();
      P.topo.innerHTML = '<span class="pop-titulo-topo">Notinha</span>';
      P.corpo.innerHTML = '';
      if (lancAtual) { pintaLanc(p); return; }
      var s = p.saldo_devedor || 0, sT = saldoTxt(s);
      var cab = el('div', 'lj-not-cab');
      cab.appendChild(el('div', 'pp-cab', '<span class="pp-quando">' + esc('Bonificação de ' + fmt(bonifDe(p)) + ' por mês') + '</span><h2>' + esc(p.nome) + '</h2>'));
      cab.appendChild(el('div', 'lj-not-saldo', '<span>' + esc(sT.rot) + '</span><b style="color:' + sT.cor + '">' + esc(s > 0.004 ? fmt(s) : s < -0.004 ? fmt(-s) : 'Em dia') + '</b>'));
      P.corpo.appendChild(cab);
      var comp = 0, pag = 0, ult = null;
      nt.mes.forEach(function (m) {
        if (m.profissional_id !== p.id) return;
        if (m.tipo === 'venda_profissional') { comp += m.valor_total || 0; if (!ult) ult = dataDe(m.timestamp); }
        if (m.tipo === 'pagamento_notinha' || m.tipo === 'bonificacao') pag += m.valor_total || 0;
      });
      var mesN = MESES[new Date().getMonth()];
      P.corpo.appendChild(el('div', 'lj-kpis', '<div><span>Compras em ' + mesN + '</span><b>' + esc(fmt(comp)) + '</b></div><div><span>Pagamentos em ' + mesN + '</span><b>' + esc(fmt(pag)) + '</b></div>' +
        '<div><span>Última compra</span><b>' + esc(ult ? ddmm(ult) : '—') + '</b></div>'));
      P.corpo.appendChild(seg([['lista', 'Lançamentos'], ['pagar', 'Pagamento'], ['extrato', 'Extrato'], ['link', 'Link'], ['editar', 'Cadastro']], modo,
        function (v) { modo = v; aviso = ''; avisoErro = false; form = {}; pinta(); }, 'seg-cheio'));   /* cada aba começa com os dados de agora, como as janelas antigas */
      if (modo === 'lista') pintaLista(p);
      else if (modo === 'pagar') pintaPagar(p);
      else if (modo === 'extrato') P.corpo.appendChild(blocoExtrato(p.id, 'ext'));
      else if (modo === 'link') pintaLink(p);
      else pintaEditar(p);
      P.corpo.appendChild(el('span', 'lj-aviso' + (avisoErro ? ' erro' : ''), esc(aviso)));
      rodapeNav(P, ids.indexOf(atual), ids.length, function (j) { atual = ids[j]; limpa(); pinta(); carregaLanc(prDe(atual) || {}); });
      if (ids.indexOf(atual) < 0) P.rodape.hidden = true;
    }
    function pintaLista(p) {
      var box = el('div', 'lj-lanc');
      if (lancErro) box.appendChild(el('div', 'lista-vazio erro', esc(lancErro)));
      else if (!lanc) box.appendChild(el('div', 'lista-vazio', 'Carregando…'));
      else if (!lanc.length) box.appendChild(el('div', 'lista-vazio', 'Nenhum lançamento.'));
      else lanc.forEach(function (m) {
        var d = dataDe(m.timestamp), err = m.marcado_erro === true;
        var compra = m.tipo === 'venda_profissional', baixa = m.tipo === 'pagamento_notinha' || m.tipo === 'bonificacao';
        var meta = (m.tipo === 'venda_paciente' ? 'pago na hora · ' : '') + (m.forma_pagamento && m.forma_pagamento !== 'notinha' ? formaRot(m.forma_pagamento) + ' · ' : '') +
          'por ' + (m.secretaria_nome || '—') + (err ? ' · marcado como erro' : '');
        var desc = m.tipo === 'edicao_profissional' ? (m.descricao || 'Edição') : descMov(m);
        var b = bt('lj-lanc-l' + (err ? ' err' : ''), '<span class="w">' + esc(ddmm(d) + ' ' + hhmm(d)) + '</span><span class="q"><b>' + esc(desc) + '</b><small>' + esc(meta) + '</small></span>' +
          '<span class="v" style="color:' + (compra ? '#D70015' : baixa ? '#248A3D' : '#636366') + '">' + esc(semValor(m.tipo) ? '—' : (compra ? '+ ' : baixa ? '− ' : '') + fmt(m.valor_total)) + '</span>',
          function () { lancAtual = m; ctxL = null; pinta(); });
        box.appendChild(b);
      });
      P.corpo.appendChild(box);
    }
    function pintaLanc(p) {
      var m = lancAtual;
      P.topo.innerHTML = '';
      P.topo.appendChild(bt('pop-volta', svg(IC.esq, 16, 2.2) + esc(p.nome), function () { lancAtual = null; pinta(); }));
      if (!ctxL) ctxL = { repinta: function () { if (P.aberto) pinta(); }, depois: function () { lancAtual = null; form = {}; return Promise.resolve(recarregar()).then(function () { carregaLanc(prDe(atual) || p); }); } };
      vistaLanc(P, m, ctxL);
      P.rodape.hidden = true;
    }
    function pintaPagar(p) {
      var s = p.saldo_devedor || 0;
      if (form.valor === undefined) form.valor = '';          /* começa vazio, como em confirmarPgto() */
      if (!form.forma) form.forma = 'dinheiro';
      var box = el('div', 'lj-form');
      var iv = entrada('text', form.valor, '0,00', 'decimal'); iv.classList.add('lj-grande-in');
      iv.addEventListener('input', function () { form.valor = iv.value; atualizaTaxa(); });
      box.appendChild(campo('Valor pago (R$)', iv));
      if (s > 0.004) box.appendChild(bt('lj-preenche', 'Usar o saldo todo: ' + esc(fmt(s)), function () { form.valor = br(s); form.erro = false; pinta(); }));
      var fp = el('div', 'lj-campo');
      fp.appendChild(el('span', '', 'Forma de pagamento'));
      fp.appendChild(seg([['dinheiro', 'Dinheiro'], ['pix', 'PIX'], ['debito', 'Débito'], ['credito', 'Crédito']], form.forma, function (v) { form.forma = v; pinta(); }, 'seg-cheio'));
      var tx = el('span', 'lj-taxa'); fp.appendChild(tx);
      box.appendChild(fp);
      function atualizaTaxa() {
        var v = num(form.valor), t = taxaDe(form.forma, v);
        tx.textContent = t > 0 ? 'Taxa do cartão: ' + fmt(t) + ' · entra no banco ' + fmt(v - t) : '';
        tx.hidden = !(t > 0);
      }
      atualizaTaxa();
      var io = entrada('text', form.obs || '', 'Observação (opcional): pagamento parcial, cheque…'); io.setAttribute('aria-label', 'Observação');
      io.addEventListener('input', function () { form.obs = io.value; });
      box.appendChild(io);
      if (form.erro) box.appendChild(el('span', 'mal-erro-txt', 'Informe um valor válido.'));
      var ok = bt('btn btn-p btn-g lj-alinha-dir', 'Confirmar pagamento', function () {
        if (ocupado) return;
        var val = num(form.valor);
        if (!(val > 0)) { form.erro = true; pinta(); return; }
        ocupado = true; ok.disabled = true; ok.textContent = 'Salvando…';
        var pag = form.forma, obs = String(form.obs || '').trim();
        /* = confirmarPgto(): o servidor grava o pagamento, a taxa do cartão e a baixa no saldo juntos (ou nada) */
        LAPI.pagamentoNotinha(p.id, val, pag, obs)
          .then(function () {
            ocupado = false; form = {}; modo = 'lista'; aviso = 'Pagamento de ' + fmt(val) + ' registrado!'; avisoErro = false;
            toast('Pagamento de ' + fmt(val) + ' registrado!', 'ok');
            atualizaDepois();
          }, function (e) {
            ocupado = false; avisoErro = true;
            aviso = 'Não deu certo: ' + (e.message || e); if (P.aberto) pinta();
          });
      });
      box.appendChild(ok);
      P.corpo.appendChild(box);
      setTimeout(function () { if (document.body.contains(iv) && !form.focou) { form.focou = true; iv.focus(); iv.select(); } }, 0);
    }
    function pintaLink(p) {
      var url = window.location.href.split('?')[0] + '?prof=' + p.id;   /* = gerarLink() */
      var box = el('div', 'lj-form');
      box.appendChild(el('span', 'pp-txt', 'Compartilhe este link com o profissional para ele ver a própria notinha:'));
      var lin = el('div', 'lj-linha-in');
      var i = entrada('text', url); i.readOnly = true; i.setAttribute('aria-label', 'Link da notinha');
      lin.appendChild(i);
      var c = bt('btn btn-p', 'Copiar', function () { copiar(url, c, 'Link copiado', 'Copiar'); });
      lin.appendChild(c);
      box.appendChild(lin);
      P.corpo.appendChild(box);
    }
    function pintaEditar(p) {
      if (form.nome === undefined) { form.nome = p.nome; form.bonif = br(p.bonificacao_mensal != null ? p.bonificacao_mensal : bonifPadrao()); }
      /* o campo do saldo acompanha o saldo de agora enquanto ninguém mexer nele (um pagamento, uma venda ou
         um "marcar como erro" mudam o saldo com a janela aberta); só vira correção se a pessoa digitar outro valor */
      var sAgora = p.saldo_devedor || 0;
      if (form.saldo === undefined || (form.saldo === form.saldoIni && form.saldoBase !== sAgora)) { form.saldo = form.saldoIni = br(sAgora); form.saldoBase = sAgora; }
      var box = el('div', 'lj-form');
      var inN = entrada('text', form.nome); inN.addEventListener('input', function () { form.nome = inN.value; });
      box.appendChild(campo('Nome', inN));
      var inB = entrada('text', form.bonif, '', 'decimal'); inB.addEventListener('input', function () { form.bonif = inB.value; });
      box.appendChild(campo('Bonificação mensal (R$)', inB));
      var cs = el('div', 'lj-corrige');
      cs.appendChild(el('b', '', 'Corrigir saldo devedor (R$): só para erro de preenchimento'));
      cs.appendChild(el('span', '', 'Para registrar pagamento, use “Pagamento”. Este campo substitui o saldo atual.'));
      var inS = entrada('text', form.saldo, '', 'decimal'); inS.setAttribute('aria-label', 'Corrigir saldo devedor');
      inS.addEventListener('input', function () { form.saldo = inS.value; });
      cs.appendChild(inS);
      box.appendChild(cs);
      if (form.erroNome) box.appendChild(el('span', 'mal-erro-txt', 'Informe o nome.'));
      if (form.erroNum) box.appendChild(el('span', 'mal-erro-txt', 'Confira os valores: use vírgula para os centavos (ex.: 100 ou 100,00).'));
      var lin = el('div', 'lj-bts lj-entre');
      var esq = el('div', 'lj-bts');
      var bAt = bt('btn btn-s txt-vermelho', 'Desativar profissional', function () {
        if (ocupado) return; ocupado = true; bAt.disabled = true;
        /* = toggleProf() */
        var ativo = p.ativo !== false;
        LAPI.profissionalAtivo(p.id, !ativo)   /* o servidor registra no histórico */
          .then(function () { fim(''); }, function (e) {
            ocupado = false; aviso = 'Não deu certo: ' + (e.message || e); avisoErro = true; if (P.aberto) pinta();
          });
        function fim(extra) {
          ocupado = false; toast((ativo ? 'Profissional desativado.' : 'Profissional reativado.') + extra, extra ? 'ko' : 'ok'); P.fechar();
          semQuebrar(loadCaches().then(function () { return notinhas(); }));
        }
      });
      esq.appendChild(bAt);
      if (isAdmin()) {
        var oc = ehOculto(p);
        var bOc = bt('btn btn-s', oc ? 'Exibir a notinha' : 'Ocultar a notinha', function () {
          if (ocupado) return; ocupado = true; bOc.disabled = true;
          /* = toggleOculto() */
          LAPI.profissionalOculto(p.id, !oc)
            .then(function () {
              ocupado = false; toast(oc ? 'Notinha visível novamente.' : 'Notinha ocultada.', 'ok'); P.fechar();
              semQuebrar(loadCaches().then(function () { return notinhas(); }));
            }, function (e) { ocupado = false; aviso = 'Não deu certo: ' + (e.message || e); avisoErro = true; if (P.aberto) pinta(); });
        });
        bOc.title = 'Ocultar a notinha da tela Notinhas e do extrato geral';
        esq.appendChild(bOc);
      }
      lin.appendChild(esq);
      var sv = bt('btn btn-p', 'Salvar', function () {
        if (ocupado) return;
        var nm = String(form.nome || '').trim();
        form.erroNome = !nm;
        /* o saldo só é corrigido se a pessoa digitou outro valor no campo */
        var mexeuSaldo = String(form.saldo == null ? '' : form.saldo).trim() !== String(form.saldoIni == null ? '' : form.saldoIni).trim();
        form.erroNum = invalido(form.bonif) || (mexeuSaldo && invalido(form.saldo));
        if (form.erroNome || form.erroNum) { pinta(); return; }
        ocupado = true; sv.disabled = true; sv.textContent = 'Salvando…';
        /* = salvarProf() editando */
        var bonif = num(form.bonif);
        var novoSaldo = mexeuSaldo ? numOuNaN(form.saldo) : NaN;
        /* o servidor só corrige o saldo se for outro valor, e registra "Saldo corrigido manualmente…" / "Nome alterado…" no histórico */
        LAPI.profissionalSalvar(p.id, nm, bonif, isNaN(novoSaldo) ? null : novoSaldo)
          .then(function () {
            ocupado = false; form = {}; modo = 'lista'; aviso = 'Profissional salvo!'; avisoErro = false; toast('Profissional salvo!', 'ok');
            atualizaDepois();
          }, function (e) {
            ocupado = false; avisoErro = true;
            aviso = 'Não deu certo: ' + (e.message || e); if (P.aberto) pinta();
          });
      });
      lin.appendChild(sv);
      box.appendChild(lin);
      P.corpo.appendChild(box);
    }
    nt.pinta = function () { if (P.aberto && !ocupado) pinta(); };
    pinta();
    carregaLanc(prDe(atual) || {});
  }
  function abrirNovoProf() {
    if (!window.moldura) return;
    var st = { nome: '', bonif: br(bonifPadrao()), erro: false, ocupado: false };
    var P = moldura.pop({ largura: '520px', titulo: 'Notinhas' });
    function pinta() {
      P.corpo.innerHTML = '';
      P.corpo.appendChild(el('div', 'pp-cab', '<h2>Novo profissional</h2>'));
      var box = el('div', 'lj-form');
      var n = entrada('text', st.nome); n.addEventListener('input', function () { st.nome = n.value; });
      box.appendChild(campo('Nome', n));
      var b = entrada('text', st.bonif, '', 'decimal'); b.addEventListener('input', function () { st.bonif = b.value; });
      box.appendChild(campo('Bonificação mensal (R$)', b));
      if (st.erro) box.appendChild(el('span', 'mal-erro-txt', 'Informe o nome.'));
      if (st.erroNum) box.appendChild(el('span', 'mal-erro-txt', 'Confira a bonificação: use vírgula para os centavos (ex.: 100 ou 100,00).'));
      P.corpo.appendChild(box);
      setTimeout(function () { if (document.body.contains(n) && document.activeElement !== n && !st.focou) { st.focou = true; n.focus(); } }, 0);
      var sv = bt('btn btn-p', 'Salvar', function () {
        if (st.ocupado) return;
        var nm = String(st.nome || '').trim();
        st.erro = !nm; st.erroNum = invalido(st.bonif);
        if (st.erro || st.erroNum) { pinta(); return; }
        st.ocupado = true; sv.disabled = true; sv.textContent = 'Salvando…';
        /* = salvarProf() novo */
        LAPI.profissionalCriar(nm, num(st.bonif))
          .then(function () {
            toast('Profissional salvo!', 'ok'); P.fechar(); nt.filtro = 'todos';
            semQuebrar(loadCaches().then(function () { return notinhas(); }));
          }, function (e) { st.ocupado = false; toast('Erro: ' + (e.message || e), 'ko'); pinta(); });
      });
      rodapeBotoes(P, [bt('btn btn-s', 'Cancelar', function () { P.fechar(); }), sv]);
    }
    pinta();
  }
  function bonificacao() {
    if (!window.moldura) return;
    var val = bonifPadrao(), marc = {}, erro = false, ocupado = false;
    var P = moldura.pop({ largura: '600px', titulo: 'Notinhas' });
    function pinta() {
      P.corpo.innerHTML = '';
      P.corpo.appendChild(el('div', 'pp-cab', '<h2>Bonificação do mês</h2><span class="pp-sub">Marque quem recebe a bonificação de ' + MESES[new Date().getMonth()] + '. Cada um recebe ' + esc(fmt(val)) + ', que baixa o saldo da notinha.</span>'));
      var lista = el('div', 'pp-lista');
      if (!PRC.length) lista.appendChild(el('div', 'lista-vazio', 'Nenhum profissional ativo.'));
      PRC.forEach(function (p) {
        var on = !!marc[p.id], s = saldoTxt(p.saldo_devedor || 0);
        var b = bt('pp-linha lj-marca' + (on ? ' on' : ''), '<span class="cx" aria-hidden="true">' + (on ? svg('M5.5 12.5l4.2 4.2 8.8-9.4', 12, 3) : '') + '</span>' +
          '<span class="q"><b>' + esc(p.nome) + (ehOculto(p) ? ' <small>(oculto)</small>' : '') + '</b></span>' +
          (saldoOculto(p) ? '' : '<span class="tr" style="color:' + s.cor + '">' + esc(s.txt) + '</span>'), function () { marc[p.id] = !on; erro = false; pinta(); });
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
        lista.appendChild(b);
      });
      P.corpo.appendChild(lista);
      if (erro) P.corpo.appendChild(el('span', 'mal-erro-txt', 'Nenhum profissional selecionado.'));
      var n = PRC.filter(function (p) { return marc[p.id]; }).length;
      P.rodape.innerHTML = ''; P.rodape.classList.remove('fim'); P.rodape.hidden = false;
      P.rodape.appendChild(el('span', 'pop-pos', n === 0 ? 'Ninguém marcado' : n + (n === 1 ? ' profissional · ' : ' profissionais · ') + fmt(n * val)));
      var dir = el('span', 'lj-bts');
      dir.appendChild(bt('btn btn-s', 'Cancelar', function () { P.fechar(); }));
      var ap = bt('btn btn-p', 'Aplicar bonificação', function () {
        if (ocupado) return;
        var sel = PRC.filter(function (p) { return marc[p.id]; });
        if (!sel.length) { erro = true; pinta(); return; }
        ocupado = true; ap.disabled = true; ap.textContent = 'Salvando…';
        /* = confirmarBonif() */
        LAPI.bonificacao(sel.map(function (p) { return p.id; })).then(function () {   /* o valor é a bonificação padrão da configuração */
          toast('Bonificações aplicadas!', 'ok'); P.fechar();
          semQuebrar(loadCaches().then(function () { if (naTela('notinhas')) { nt.filtro = 'todos'; return notinhas(); } }));
        }, function (e) { ocupado = false; toast('Erro: ' + (e.message || e), 'ko'); pinta(); });
      });
      dir.appendChild(ap);
      P.rodape.appendChild(dir);
    }
    pinta();
  }
  function relatorio() {
    if (!window.moldura) return;
    var P = moldura.pop({ largura: '720px', titulo: 'Notinhas' });
    P.corpo.appendChild(el('div', 'pp-cab', '<h2>Relatório das notinhas</h2>'));
    var sel = el('select', 'fc'); sel.setAttribute('aria-label', 'Profissional');
    sel.appendChild(el('option', '', 'Todos os profissionais')); sel.firstChild.value = '';
    PRC.filter(function (p) { return isAdmin() || !ehOculto(p); }).forEach(function (p) { var o = el('option', '', esc(p.nome + (ehOculto(p) ? ' (oculto)' : ''))); o.value = p.id; sel.appendChild(o); });
    P.corpo.appendChild(campo('Profissional', sel));
    var bloco = blocoExtrato(function () { return sel.value; }, 'rel');
    sel.addEventListener('change', function () { bloco._gera(); });
    P.corpo.appendChild(bloco);
    rodapeBotoes(P, [bt('btn btn-s', 'Fechar', function () { P.fechar(); })]);
  }

  /* ════════════════════════ CAIXA ════════════════════════ */
  var cx = { per: 'mes', ini: '', fim: '', filtro: 'todos', movs: [], carregado: false, erro: '', pinta: null, aberto: null };
  function ehDinheiro(m) { return m.tipo === 'venda_paciente' || m.tipo === 'pagamento_notinha' || m.tipo === 'sangria' || m.tipo === 'suprimento'; }
  function grupoCx(m) { if (m.tipo === 'sangria' || m.tipo === 'suprimento') return 'caixa'; if (m.forma_pagamento === 'dinheiro') return 'dinheiro'; if (m.forma_pagamento === 'pix') return 'pix'; return 'cartao'; }
  function caixa() {
    var r = raiz('caixa'); if (!r) return;
    controlePeriodo('caixa', cx, function () { cx.topo = true; caixa(); });
    if (!cx.carregado) r.innerHTML = '<div class="lista-vazio">Carregando…</div>';
    else { var t = r.querySelector('.duas-col'); if (t) t.classList.add('carregando'); }
    var per = periodo(cx);
    return buscaMovs(per).then(function (movs) {
      cx.movs = movs.filter(semErro); cx.carregado = true; cx.erro = ''; cx.perAtual = per;
      if (naTela('caixa')) desenhaCaixa();
    }).catch(function (e) { cx.erro = e.message || String(e); cx.carregado = true; if (naTela('caixa')) desenhaCaixa(); });
  }
  function desenhaCaixa() {
    var r = raiz('caixa'); if (!r) return;
    var admin = isAdmin(), per = cx.perAtual || periodo(cx);
    var todos = cx.movs.filter(semErro).filter(ehDinheiro);
    var cont = { todos: todos.length, dinheiro: 0, pix: 0, cartao: 0, caixa: 0 };
    todos.forEach(function (m) { cont[grupoCx(m)]++; });
    var vis = cx.filtro === 'todos' ? todos : todos.filter(function (m) { return grupoCx(m) === cx.filtro; });
    cx.vis = vis.map(function (m) { return m.id; });
    resumo('caixa', per.rot + ' · ' + (todos.length === 1 ? '1 movimentação de dinheiro' : todos.length + ' movimentações de dinheiro'));
    /* totais: a mesma conta de loadCaixa() */
    var edin = 0, pnot = 0, supr = 0, sang = 0, pix = 0, deb = 0, cred = 0, tax = 0;
    cx.movs.forEach(function (m) {
      var v = m.valor_total || 0, l = m.valor_liquido || v, t = m.taxa_valor || 0;
      if (m.tipo === 'venda_paciente' || m.tipo === 'pagamento_notinha') {
        if (m.forma_pagamento === 'dinheiro') { if (m.tipo === 'venda_paciente') edin += v; else pnot += v; }
        else if (m.forma_pagamento === 'pix') pix += v;
        else if (m.forma_pagamento === 'debito') { deb += l; tax += t; }
        else if (m.forma_pagamento === 'credito') { cred += l; tax += t; }
      }
      if (m.tipo === 'sangria') sang += v; if (m.tipo === 'suprimento') supr += v;
    });
    var fis = edin + pnot + supr - sang, ban = pix + deb + cred;
    var antes = r.querySelector('.lista-corpo'), rol = antes && !cx.topo ? antes.scrollTop : 0; cx.topo = false;
    r.innerHTML = '';
    var wrap = el('div', 'duas-col');
    var sec = el('section', 'lista alta'); sec.setAttribute('aria-label', 'Movimentações de dinheiro');
    var topo = el('div', 'lista-topo');
    topo.appendChild(seg([['todos', 'Todas', null, cont.todos], ['dinheiro', 'Dinheiro', null, cont.dinheiro], ['pix', 'PIX', null, cont.pix], ['cartao', 'Cartão', null, cont.cartao], ['caixa', 'Sangria e suprimento', null, cont.caixa]],
      cx.filtro, function (v) { cx.filtro = v; cx.topo = true; desenhaCaixa(); }));
    topo.appendChild(el('span', 'mostrando', vis.length === 1 ? '1 movimentação' : vis.length + ' movimentações'));
    sec.appendChild(topo);
    var corpo = el('div', 'lista-corpo');
    if (cx.erro) corpo.appendChild(el('div', 'lista-vazio erro', esc(cx.erro)));
    else if (!vis.length) corpo.appendChild(el('div', 'lista-vazio', 'Nenhuma movimentação no período.'));
    listaPorDia(corpo, vis, function (m) {
      var cli = clienteDe(m);
      return { hora: hhmm(dataDe(m.timestamp)), desc: descMov(m), meta: [tipoRot(m.tipo), cli, 'por ' + (m.secretaria_nome || '—')].filter(Boolean).join(' · '),
        valor: valorTxt(m), cor: m.tipo === 'sangria' ? '#D70015' : '', sub: formaRot(m.forma_pagamento) + ((m.taxa_valor || 0) > 0 ? ' · líquido ' + fmt(m.valor_liquido) : '') };
    }, 'movimentação', 'movimentações', cx, function (id) { abrirMov('caixa', id); });
    sec.appendChild(corpo);
    wrap.appendChild(sec);
    var lado = el('div', 'lado');
    [['Caixa físico · dinheiro', fis, [['Vendas em dinheiro', fmt(edin)], ['Pagamentos de notinha em dinheiro', fmt(pnot)], ['Suprimentos', fmt(supr), '#248A3D'], ['Sangrias', '− ' + fmt(sang), '#D70015']]],
     ['Caixa banco · PIX e cartão, líquido', ban, [['PIX', fmt(pix)], ['Débito (líquido)', fmt(deb)], ['Crédito (líquido)', fmt(cred)], ['Taxas descontadas', '− ' + fmt(tax), '#D70015']]]].forEach(function (c) {
      var s = el('section', 'painel lj-cx');
      s.appendChild(el('div', 'lj-grande' + (admin ? ' com-linha' : ''), '<h2 class="lj-grande-rot">' + esc(c[0]) + '</h2><span class="lj-grande-n"' + (c[1] < 0 ? ' style="color:#D70015"' : '') + '>' + esc(fmt(c[1])) + '</span>' +
        '<span class="lj-grande-l2">' + esc(per.rot) + '</span>'));
      if (admin) c[2].forEach(function (l) { s.appendChild(el('div', 'lj-cx-l', '<span>' + esc(l[0]) + '</span><b' + (l[2] ? ' style="color:' + l[2] + '"' : '') + '>' + esc(l[1]) + '</b>')); });
      lado.appendChild(s);
    });
    if (admin) {
      var g = el('div', 'lj-cx-bts');
      g.appendChild(bt('btn btn-s btn-g txt-vermelho', 'Sangria', function () { abrirCxMov('sangria'); }));
      g.appendChild(bt('btn btn-s btn-g txt-verde', 'Suprimento', function () { abrirCxMov('suprimento'); }));
      lado.appendChild(g);
    } else lado.appendChild(el('p', 'lj-nota', 'O detalhe de cada caixa, a sangria e o suprimento ficam com o administrador.'));
    lado.appendChild(el('section', 'painel nota-lado', '<h2>Como a conta é feita</h2><p><b>Físico</b> = vendas e pagamentos de notinha em dinheiro, mais suprimentos, menos sangrias.</p>' +
      '<p><b>Banco</b> = PIX e cartões, já sem a taxa (débito ' + esc(pct(CFG.taxa_debito)) + ', crédito ' + esc(pct(CFG.taxa_credito)) + ').</p>' +
      '<p class="cinza">Compras na notinha não entram no caixa: entram quando o profissional paga.</p>'));
    wrap.appendChild(lado);
    r.appendChild(wrap);
    alturaLista(r);
    var c2 = r.querySelector('.lista-corpo'); if (c2) c2.scrollTop = rol;
    if (cx.pinta) cx.pinta();
  }
  function abrirCxMov(tipo) {
    if (!window.moldura) return;
    var st = { valor: '', motivo: '', erro: false, ocupado: false };
    var P = moldura.pop({ largura: '520px', titulo: 'Caixa físico' });
    function pinta() {
      P.corpo.innerHTML = '';
      P.corpo.appendChild(el('div', 'pp-cab', '<h2>' + (tipo === 'sangria' ? 'Sangria' : 'Suprimento') + '</h2><span class="pp-sub">' +
        (tipo === 'sangria' ? 'Dinheiro que sai do caixa físico (depósito, pagamento a fornecedor).' : 'Dinheiro que entra no caixa físico (troco do dia).') + '</span>'));
      var box = el('div', 'lj-form');
      var v = entrada('text', st.valor, '0,00', 'decimal'); v.classList.add('lj-grande-in'); v.addEventListener('input', function () { st.valor = v.value; });
      box.appendChild(campo('Valor (R$)', v));
      var mo = entrada('text', st.motivo, 'Troco, fornecedor…'); mo.addEventListener('input', function () { st.motivo = mo.value; });
      box.appendChild(campo('Motivo', mo));
      if (st.erro) box.appendChild(el('span', 'mal-erro-txt', 'Informe um valor válido (ex.: 50 ou 50,00).'));
      P.corpo.appendChild(box);
      setTimeout(function () { if (!st.focou && document.body.contains(v)) { st.focou = true; v.focus(); } }, 0);
      var ok = bt('btn btn-p', tipo === 'sangria' ? 'Registrar sangria' : 'Registrar suprimento', function () {
        if (st.ocupado) return;
        var val = num(st.valor), mot = String(st.motivo || '').trim();
        if (val <= 0) { st.erro = true; pinta(); return; }
        st.ocupado = true; ok.disabled = true; ok.textContent = 'Salvando…';
        /* = confirmarCxMov() */
        LAPI.caixaMov(tipo, val, mot)
          .then(function () { toast((tipo === 'sangria' ? 'Sangria' : 'Suprimento') + ' registrada!', 'ok'); P.fechar(); cx.filtro = 'todos'; semQuebrar(caixa()); },
                function (e) { st.ocupado = false; toast('Erro: ' + (e.message || e), 'ko'); pinta(); });
      });
      rodapeBotoes(P, [bt('btn btn-s', 'Cancelar', function () { P.fechar(); }), ok]);
    }
    pinta();
  }
  /* lista agrupada por dia (Caixa e Histórico) */
  function listaPorDia(corpo, vis, linhaDe, um, varios, st, abrir) {
    var grupos = [], porDia = {};
    vis.forEach(function (m) {
      var d = dataDe(m.timestamp), k = chaveDia(d);
      if (!porDia[k]) { porDia[k] = { d: d, itens: [] }; grupos.push(porDia[k]); }
      porDia[k].itens.push(m);
    });
    grupos.forEach(function (g) {
      corpo.appendChild(el('div', 'dia-cab', '<b>' + esc(diaRot(g.d)) + '</b><span>' + (g.itens.length === 1 ? '1 ' + um : g.itens.length + ' ' + varios) + '</span>'));
      g.itens.forEach(function (m) {
        var L = linhaDe(m), err = m.marcado_erro === true;
        var b = bt('linha lj-mov' + (err ? ' apagada' : '') + (st.aberto === m.id ? ' aberta' : ''), '<span class="h">' + esc(L.hora) + '</span>' +
          '<span class="q"><span class="nm' + (err ? ' lj-risco' : '') + '">' + esc(L.desc) + '</span><span class="mt">' + esc(L.meta) + '</span></span>' +
          '<span class="dir"><span class="valor"' + (L.cor ? ' style="color:' + L.cor + '"' : '') + '>' + esc(L.valor) + '</span>' +
          (L.tag ? '<span class="tag" style="color:' + L.tagCor + '">' + esc(L.tag) + '</span>' : '<span class="tr">' + esc(L.sub || '') + '</span>') + '</span>', function () { abrir(m.id); });
        b.setAttribute('aria-haspopup', 'dialog'); b.setAttribute('data-id', m.id);
        corpo.appendChild(b);
      });
    });
  }
  /* janela de uma movimentação (Caixa e Histórico) */
  function abrirMov(qual, id, idsDados) {
    if (!window.moldura) return;
    var st = qual === 'caixa' ? cx : hs;
    var ids = (idsDados || st.vis || []).slice(), atual = id, ctx = null;
    var P = moldura.pop({ largura: '600px', titulo: qual === 'caixa' ? 'Movimentação' : 'Lançamento', aoFechar: function () { st.aberto = null; st.pinta = null; marca(); } });
    function marca() {
      var s = document.getElementById('s-' + (qual === 'caixa' ? 'caixa' : 'historico'));
      if (!s) return;
      s.querySelectorAll('.lj-mov.aberta').forEach(function (x) { x.classList.remove('aberta'); });
      if (st.aberto) { var l = s.querySelector('.lj-mov[data-id="' + CSS.escape(st.aberto) + '"]'); if (l) l.classList.add('aberta'); }
    }
    function achar() { var L = st.movs || []; for (var i = 0; i < L.length; i++) if (L[i].id === atual) return L[i]; return null; }
    function pinta() {
      var m = achar();
      if (!m) { P.fechar(); return; }
      st.aberto = atual; marca();
      P.corpo.innerHTML = '';
      if (!ctx) ctx = { repinta: function () { if (P.aberto) pinta(); }, depois: function () { ctx = null; (qual === 'caixa' ? caixa : historico)(); },
                        semValor: qual === 'historico' && !isAdmin() };   /* Histórico da secretária: sem R$ */
      vistaLanc(P, m, ctx);
      var i = ids.indexOf(atual);
      rodapeNav(P, i, ids.length, function (j) { atual = ids[j]; ctx = null; pinta(); });
      if (i < 0) P.rodape.hidden = true;
    }
    st.pinta = function () { if (P.aberto && !(ctx && ctx.modo)) pinta(); };
    pinta();
  }

  /* ════════════════════════ ESTOQUE ════════════════════════ */
  var es = { entradas: [], prods: [], aba: 'entradas', busca: '', carregado: false, erro: '', form: { qtd: '1' }, msg: null, pinta: null, aberto: null };
  function estoque() {
    var r = raiz('estoque'); if (!r) return;
    var ac = acoes('estoque');
    if (ac && !ac.querySelector('.lj-es-busca')) {
      var bu = el('label', 'busca lj-es-busca', svg(IC.busca, 16, 2) + '<input type="search" placeholder="Filtrar a lista" aria-label="Filtrar a lista" autocomplete="off">');
      var bi = bu.querySelector('input'); bi.value = es.busca;
      bi.addEventListener('input', function () { es.busca = bi.value; es.topo = true; if (naTela('estoque')) desenhaEstoque(); });
      ac.insertBefore(bu, ac.firstChild);
    }
    if (!es.carregado) r.innerHTML = '<div class="lista-vazio">Carregando…</div>';
    return Promise.all([
      LAPI.movimentos({ tipo: 'entrada_estoque' }),
      LAPI.produtos()
    ]).then(function (res) {
      es.entradas = res[0].filter(semErro).sort(ordDesc);
      es.prods = res[1].filter(function (p) { return p.ativo; })
        .sort(function (a, b) { return String(a.nome).localeCompare(String(b.nome)); });
      es.carregado = true; es.erro = '';
      if (naTela('estoque')) desenhaEstoque();
    }).catch(function (e) { es.erro = e.message || String(e); es.carregado = true; if (naTela('estoque')) desenhaEstoque(); });
  }
  function prodDe(id) { for (var i = 0; i < es.prods.length; i++) if (es.prods[i].id === id) return es.prods[i]; for (var j = 0; j < PC.length; j++) if (PC[j].id === id) return PC[j]; return null; }
  function corEst(n) { return n <= 0 ? '#D70015' : n <= 5 ? '#C93400' : '#248A3D'; }
  function desenhaEstoque() {
    var r = raiz('estoque'); if (!r) return;
    var admin = isAdmin();
    if (!admin) es.aba = 'entradas';
    var acabando = es.prods.filter(function (p) { return (p.estoque_atual || 0) <= 3; }).length;
    var ult = es.entradas[0] ? dataDe(es.entradas[0].timestamp) : null;
    resumo('estoque', es.prods.length + ' produtos · ' + (acabando === 1 ? '1 acabando (3 un ou menos)' : acabando + ' acabando (3 un ou menos)') + ' · última entrada ' + (ult ? ddmm(ult) + ' às ' + hhmm(ult) : '—'));
    var antes = r.querySelector('.lista-corpo'), rol = antes && !es.topo ? antes.scrollTop : 0; es.topo = false;
    var focoForm = null;
    if (document.activeElement && r.contains(document.activeElement) && document.activeElement.dataset && document.activeElement.dataset.campo) {
      focoForm = { c: document.activeElement.dataset.campo, p: document.activeElement.selectionStart };
    }
    r.innerHTML = '';
    var wrap = el('div', 'duas-col');
    var sec = el('section', 'lista alta'); sec.setAttribute('aria-label', 'Estoque');
    var q = sem(es.busca).trim();
    var topo = el('div', 'lista-topo');
    var abas = [['entradas', 'Entradas recentes', null, es.entradas.length]];
    if (admin) abas.push(['posicao', 'Posição do estoque', null, es.prods.length]);
    topo.appendChild(seg(abas, es.aba, function (v) { es.aba = v; es.topo = true; desenhaEstoque(); }));
    var corpo = el('div', 'lista-corpo');
    var ids = [], n = 0;
    if (es.erro) corpo.appendChild(el('div', 'lista-vazio erro', esc(es.erro)));
    else if (es.aba === 'entradas') {
      var visE = es.entradas.filter(function (m) { return !q || sem((m.produto_nome || '') + ' ' + (m.descricao || '')).indexOf(q) >= 0; });
      ids = visE.map(function (m) { return m.id; }); n = visE.length;
      if (!visE.length) corpo.appendChild(el('div', 'lista-vazio', 'Nenhuma entrada encontrada.'));
      visE.forEach(function (m) {
        var d = dataDe(m.timestamp), qn = m.quantidade || 0, un = m.preco_unitario || (qn ? (m.valor_total || 0) / qn : 0);
        var p = prodDe(m.produto_id), uni = (p && p.unidade) || 'un';
        /* secretária: só as unidades, nenhum R$ (24/10/26) */
        var nome = admin ? (m.produto_nome || '—') + ' · ' + qn + ' ' + uni : (m.produto_nome || '—');
        var meta = (admin ? 'custo ' + fmt(un) + ' cada · ' : '') + (m.descricao || 'Entrada de estoque') + ' · por ' + (m.secretaria_nome || '—');
        var b = bt('linha lj-es' + (es.aberto === m.id ? ' aberta' : ''), '<span class="lj-es-d">' + esc(ddmm(d)) + '</span>' +
          '<span class="q"><span class="nm">' + esc(nome) + '</span><span class="mt">' + esc(meta) + '</span></span>' +
          '<span class="dir"><span class="valor">' + esc(admin ? fmt(m.valor_total) : '+' + qn + ' ' + uni) + '</span><span class="tr">' + esc(hhmm(d)) + '</span></span>', function () { abrirEs('entradas', m.id, ids); });
        b.setAttribute('data-id', m.id); b.setAttribute('aria-haspopup', 'dialog');
        corpo.appendChild(b);
      });
    } else {
      var visP = es.prods.filter(function (p) { return !q || sem(p.nome).indexOf(q) >= 0; }).slice().sort(function (a, b) { return (a.estoque_atual || 0) - (b.estoque_atual || 0); });
      ids = visP.map(function (p) { return p.id; }); n = visP.length;
      if (!visP.length) corpo.appendChild(el('div', 'lista-vazio', 'Nenhum produto encontrado.'));
      visP.forEach(function (p) {
        var e = p.estoque_atual || 0;
        var b = bt('linha lj-es' + (es.aberto === p.id ? ' aberta' : ''), '<span class="lj-es-d">' + (p.grupo === 'livraria' ? 'Livraria' : 'Conv.') + '</span>' +
          '<span class="q"><span class="nm">' + esc(p.nome) + '</span><span class="mt">' + esc(grupoRot(p.grupo) + ' · último custo ' + fmt(p.preco_custo) + ' · venda ' + fmt(p.preco_venda)) + '</span></span>' +
          '<span class="dir"><span class="valor" style="color:' + corEst(e) + '">' + esc(e + ' ' + (p.unidade || 'un')) + '</span><span class="tr" style="color:' + corEst(e) + ';font-weight:600">' +
          (e <= 0 ? 'Sem estoque' : e <= 3 ? 'Acabando' : e <= 5 ? 'Pouco' : '') + '</span></span>', function () { abrirEs('posicao', p.id, ids); });
        b.setAttribute('data-id', p.id); b.setAttribute('aria-haspopup', 'dialog');
        corpo.appendChild(b);
      });
    }
    topo.appendChild(el('span', 'mostrando', es.aba === 'entradas' ? (n === 1 ? '1 entrada' : n + ' entradas') : (n === 1 ? '1 produto' : n + ' produtos')));
    sec.appendChild(topo);
    sec.appendChild(corpo);
    wrap.appendChild(sec);
    wrap.appendChild(formEntrada());
    r.appendChild(wrap);
    alturaLista(r);
    var c2 = r.querySelector('.lista-corpo'); if (c2) c2.scrollTop = rol;
    if (focoForm) { var fe = r.querySelector('[data-campo="' + focoForm.c + '"]'); if (fe) { fe.focus(); try { if (focoForm.p != null) fe.setSelectionRange(focoForm.p, focoForm.p); } catch (e2) {} } }
    if (es.pinta) es.pinta();
  }
  function formEntrada() {
    var f = es.form, selP = f.pid ? prodDe(f.pid) : null;
    var s = el('section', 'painel lj-nova'); s.setAttribute('aria-label', 'Nova entrada');
    s.appendChild(el('div', 'painel-cab', '<h2>Nova entrada</h2>'));
    var box = el('div', 'lj-form lj-pad');
    var pc = el('div', 'lj-campo'); pc.appendChild(el('span', '', 'Produto'));
    if (!selP) {
      var ip = entrada('text', f.q || '', 'Buscar ou digitar o nome do produto'); ip.dataset.campo = 'q'; ip.setAttribute('aria-label', 'Buscar produto');
      ip.addEventListener('input', function () { f.q = ip.value; f.criando = false; es.msg = null; desenhaEstoque(); });
      pc.appendChild(ip);
      var qf = sem(f.q).trim();
      if (qf && !f.criando) {
        var res = PC.filter(function (p) { return sem(p.nome).indexOf(qf) >= 0; }).slice(0, 8);
        var lr = el('div', 'lj-res');
        res.forEach(function (p) {
          lr.appendChild(bt('lj-res-l', '<span class="q"><b>' + esc(p.nome) + '</b><small>' + esc(grupoRot(p.grupo) + ' · ' + (p.estoque_atual || 0) + ' ' + (p.unidade || 'un') + ' em estoque') + '</small></span>' +
            '<span class="v">' + esc(fmt(p.preco_venda)) + '</span>', function () { f.pid = p.id; f.q = ''; f.criando = false; es.msg = null; desenhaEstoque(); }));
        });
        if (!res.length) lr.appendChild(el('div', 'lj-res-vazio', 'Nenhum produto com esse nome.'));
        lr.appendChild(bt('lj-res-novo', 'Não encontrei: criar produto novo', function () { f.criando = true; f.grupoNovo = f.grupoNovo || 'conveniencia'; if (f.unidadeNovo == null) f.unidadeNovo = 'un'; desenhaEstoque(); }));
        pc.appendChild(lr);
      }
      if (f.criando) {
        var cn = el('div', 'mal-conf');
        cn.appendChild(el('b', '', 'Produto novo: “' + esc(String(f.q || '').trim()) + '”'));
        cn.appendChild(seg([['conveniencia', 'Conveniência'], ['livraria', 'Livraria']], f.grupoNovo || 'conveniencia', function (v) { f.grupoNovo = v; desenhaEstoque(); }, 'seg-cheio'));
        var iu = entrada('text', f.unidadeNovo == null ? 'un' : f.unidadeNovo, 'Unidade: un, cx, kg…'); iu.dataset.campo = 'un'; iu.setAttribute('aria-label', 'Unidade');
        iu.addEventListener('input', function () { f.unidadeNovo = iu.value; });
        cn.appendChild(iu);
        var lb = el('div', 'mal-conf-bt');
        lb.appendChild(bt('btn btn-s', 'Cancelar', function () { f.criando = false; desenhaEstoque(); }));
        var cr = bt('btn btn-p', es.criandoProd ? 'Salvando…' : 'Criar e selecionar', function () {
          if (es.criandoProd) return;
          var nm = String(f.q || '').trim();
          if (!nm) { es.msg = { t: 'Digite o nome do produto.', e: true }; desenhaEstoque(); return; }
          es.criandoProd = true; cr.disabled = true; cr.textContent = 'Salvando…';
          var gr = f.grupoNovo || 'conveniencia', un = String(f.unidadeNovo || '').trim() || 'un';
          /* = criarProdutoInline() */
          LAPI.produtoCriar(nm, gr, un).then(function (p) {
            es.criandoProd = false;
            PC.push(p); es.prods.push(p);
            f.pid = p.id; f.q = ''; f.criando = false; es.msg = { t: 'Produto criado!', e: false };
            desenhaEstoque();
          }, function (e) { es.criandoProd = false; toast('Erro: ' + (e.message || e), 'ko'); desenhaEstoque(); });
        });
        cr.disabled = !!es.criandoProd;   /* a tela pode se redesenhar enquanto grava: o botão continua travado */
        lb.appendChild(cr);
        cn.appendChild(lb);
        pc.appendChild(cn);
      }
    } else {
      var chip = el('div', 'lj-chip', '<span class="q"><b>' + esc(selP.nome) + '</b><small>' + esc(grupoRot(selP.grupo) + ' · ' + (selP.estoque_atual || 0) + ' ' + (selP.unidade || 'un') + ' em estoque · venda ' + fmt(selP.preco_venda) + ' / ' + (selP.unidade || 'un')) + '</small></span>');
      chip.appendChild(bt('btn btn-sm lj-trocar', 'Trocar', function () { f.pid = null; desenhaEstoque(); }));
      pc.appendChild(chip);
    }
    box.appendChild(pc);
    var g = el('div', 'lj-g2');
    var iq = entrada('text', f.qtd == null ? '1' : f.qtd, '', 'numeric'); iq.dataset.campo = 'qtd'; iq.addEventListener('input', function () { f.qtd = iq.value; });
    var iun = entrada('text', f.custoUn || '', 'Ex: 2,70', 'decimal'); iun.dataset.campo = 'cun';
    var itot = entrada('text', f.custoTot || '', '0,00', 'decimal'); itot.dataset.campo = 'ctot';
    /* custo por unidade ↔ total, como calcCustoTotal() / calcCustoUn() (mudar a quantidade não recalcula) */
    iun.addEventListener('input', function () { f.custoUn = iun.value; var un = num(iun.value), qn = parseInt(f.qtd, 10) || 1; f.custoTot = un > 0 ? fx2(un * qn) : ''; itot.value = f.custoTot; });
    itot.addEventListener('input', function () { f.custoTot = itot.value; var tot = num(itot.value), qn = parseInt(f.qtd, 10) || 1; f.custoUn = tot > 0 && qn > 0 ? fx2(tot / qn) : ''; iun.value = f.custoUn; });
    var ipv = entrada('text', f.preco || '', selP && selP.preco_venda ? 'atual ' + br(selP.preco_venda) : '0,00', 'decimal'); ipv.dataset.campo = 'pv';
    ipv.addEventListener('input', function () { f.preco = ipv.value; });
    g.appendChild(campo('Quantidade', iq));
    g.appendChild(campo('Custo por unidade', iun));
    g.appendChild(campo('Custo total <small>· calculado</small>', itot));
    g.appendChild(campo('Preço de venda', ipv));
    box.appendChild(g);
    var iob = entrada('text', f.obs || '', 'NF, fornecedor, lote…'); iob.dataset.campo = 'obs'; iob.addEventListener('input', function () { f.obs = iob.value; });
    box.appendChild(campo('Observação <small>· opcional</small>', iob));
    var rg = bt('btn btn-p btn-g', es.salvando ? 'Salvando…' : 'Registrar entrada', function () {
      if (es.salvando) return;
      var p = f.pid ? PC.find(function (x) { return x.id === f.pid; }) : null;
      if (!p) { es.msg = { t: 'Selecione um produto.', e: true }; desenhaEstoque(); return; }
      if (invalido(f.custoUn) || invalido(f.custoTot) || invalido(f.preco)) { es.msg = { t: 'Confira os valores: use vírgula para os centavos (ex.: 1500,00).', e: true }; desenhaEstoque(); return; }
      /* = confirmarEstoque() */
      var qtd = parseInt(f.qtd, 10) || 1, cstUn = num(f.custoUn), cstTot = num(f.custoTot), novoPrecoVenda = num(f.preco), obs = String(f.obs || '').trim();
      if (qtd < 1) { es.msg = { t: 'A quantidade precisa ser 1 ou mais.', e: true }; desenhaEstoque(); return; }
      es.salvando = true; rg.disabled = true; rg.textContent = 'Salvando…';
      /* o servidor grava a entrada e soma no estoque juntos (custo e preço novos só quando informados) */
      LAPI.entradaEstoque(p.id, qtd, cstUn, cstTot, novoPrecoVenda, obs)
        .then(function () {
          es.salvando = false; es.form = { qtd: '1' }; es.msg = { t: 'Entrada: ' + qtd + '× ' + p.nome, e: false }; toast('Entrada: ' + qtd + 'x ' + p.nome, 'ok'); es.aba = 'entradas';
          desenhaEstoque();
          semQuebrar(loadCaches().then(function () { return estoque(); }));
        }, function (e) {
          es.salvando = false;
          es.msg = { t: 'Não deu certo: ' + (e.message || e), e: true }; desenhaEstoque();
        });
    });
    rg.disabled = !!es.salvando;   /* a tela pode se redesenhar enquanto grava: o botão continua travado */
    box.appendChild(rg);
    box.appendChild(el('span', 'lj-aviso' + (es.msg && es.msg.e ? ' erro' : ''), es.msg ? esc(es.msg.t) : ''));
    box.appendChild(el('span', 'lj-nota', 'Custo ou preço em branco não mudam o que já está cadastrado. A quantidade entra no estoque na hora.'));
    s.appendChild(box);
    return s;
  }
  function abrirEs(aba, id, ids) {
    if (!window.moldura) return;
    var atual = id;
    var P = moldura.pop({ largura: '540px', titulo: aba === 'entradas' ? 'Entrada de estoque' : 'Produto', aoFechar: function () { es.aberto = null; es.pinta = null; marca(); } });
    function marca() {
      document.querySelectorAll('#s-estoque .lj-es.aberta').forEach(function (x) { x.classList.remove('aberta'); });
      if (es.aberto) { var l = document.querySelector('#s-estoque .lj-es[data-id="' + CSS.escape(es.aberto) + '"]'); if (l) l.classList.add('aberta'); }
    }
    function pinta() {
      P.corpo.innerHTML = '';
      es.aberto = atual; marca();
      var pr;
      if (aba === 'entradas') {
        var m = es.entradas.filter(function (x) { return x.id === atual; })[0];
        if (!m) { P.fechar(); return; }
        pr = prodDe(m.produto_id);
        var d = dataDe(m.timestamp), qn = m.quantidade || 0, un = (pr && pr.unidade) || 'un';
        P.corpo.appendChild(el('div', 'pp-cab', '<span class="pp-quando">' + esc(quandoTxt(d) + ' · por ' + (m.secretaria_nome || '—')) + '</span><h2>' + esc(m.produto_nome || '—') + '</h2>'));
        P.corpo.appendChild(campos(isAdmin()
          ? [['Quantidade', qn + ' ' + un], ['Custo por unidade', fmt(m.preco_unitario || (qn ? (m.valor_total || 0) / qn : 0))], ['Custo total', fmt(m.valor_total), '', 'f'],
             ['Observação', m.descricao || '—'], ['Estoque agora', pr ? (pr.estoque_atual || 0) + ' ' + un : '—']]
          : [['Quantidade', qn + ' ' + un, '', 'f'], ['Observação', m.descricao || '—'], ['Estoque agora', pr ? (pr.estoque_atual || 0) + ' ' + un : '—']]));   /* secretária: sem R$ */
      } else {
        pr = prodDe(atual);
        if (!pr) { P.fechar(); return; }
        var e = pr.estoque_atual || 0;
        P.corpo.appendChild(el('div', 'pp-cab', '<span class="pp-quando">' + esc(grupoRot(pr.grupo)) + '</span><h2>' + esc(pr.nome) + '</h2>'));
        P.corpo.appendChild(campos([['Em estoque', e + ' ' + (pr.unidade || 'un'), corEst(e), 'f'], ['Preço de venda', fmt(pr.preco_venda)], ['Último custo', fmt(pr.preco_custo)],
          ['Margem', pr.preco_venda > 0 ? Math.round((pr.preco_venda - (pr.preco_custo || 0)) / pr.preco_venda * 100) + '%' : '—']]));
      }
      if (pr && PC.some(function (x) { return x.id === pr.id; })) {
        P.corpo.appendChild(bt('btn btn-p lj-alinha', 'Dar entrada neste produto', function () { es.form = { pid: pr.id, qtd: '1' }; es.msg = null; P.fechar(); desenhaEstoque(); }));
      }
      var i = ids.indexOf(atual);
      rodapeNav(P, i, ids.length, function (j) { atual = ids[j]; pinta(); });
    }
    es.pinta = function () { if (P.aberto) pinta(); };
    pinta();
  }

  /* ════════════════════════ HISTÓRICO ════════════════════════ */
  var hs = { per: 'mes', ini: '', fim: '', filtro: 'todos', movs: [], carregado: false, erro: '', pinta: null, aberto: null };
  function grupoHs(m) {
    if (m.tipo === 'venda_paciente') return 'vendas';
    if (m.tipo === 'venda_profissional' || m.tipo === 'pagamento_notinha' || m.tipo === 'bonificacao' || m.tipo === 'edicao_profissional') return 'notinhas';
    if (m.tipo === 'entrada_estoque' || m.tipo === 'ajuste_estoque' || m.tipo === 'edicao_produto') return 'estoque';
    return 'caixa';
  }
  function historico() {
    var r = raiz('historico'); if (!r) return;
    controlePeriodo('historico', hs, function () { hs.topo = true; historico(); });
    if (!hs.carregado) r.innerHTML = '<div class="lista-vazio">Carregando…</div>';
    else { var t = r.querySelector('.duas-col'); if (t) t.classList.add('carregando'); }
    var per = periodo(hs);
    return buscaMovs(per).then(function (movs) {
      hs.movs = movs; hs.carregado = true; hs.erro = ''; hs.perAtual = per;
      if (naTela('historico')) desenhaHistorico();
    }).catch(function (e) { hs.erro = e.message || String(e); hs.carregado = true; if (naTela('historico')) desenhaHistorico(); });
  }
  var CATS = [
    ['vendas', 'Vendas pagas', '#248A3D', function (m) { return m.tipo === 'venda_paciente'; }, 'vendas'],
    ['notinha', 'Compras na notinha', '#2C2D6E', function (m) { return m.tipo === 'venda_profissional'; }, 'notinhas'],
    ['pagamentos', 'Pagamentos de notinha', '#248A3D', function (m) { return m.tipo === 'pagamento_notinha'; }, 'notinhas'],
    ['bonif', 'Bonificações', '#C93400', function (m) { return m.tipo === 'bonificacao'; }, 'notinhas'],
    ['estoque', 'Entradas de estoque', '#636366', function (m) { return m.tipo === 'entrada_estoque'; }, 'estoque'],
    ['caixa', 'Sangrias e suprimentos', '#D70015', function (m) { return m.tipo === 'sangria' || m.tipo === 'suprimento'; }, 'caixa']
  ];
  function metaHs(m) {
    var p = [tipoRot(m.tipo)], c = clienteDe(m);
    if (c) p.push(c);
    if (m.forma_pagamento && m.forma_pagamento !== 'notinha') p.push(formaRot(m.forma_pagamento));
    if ((m.tipo === 'ajuste_estoque' || m.tipo === 'entrada_estoque') && m.quantidade) p.push((m.quantidade > 0 ? '+' : '') + m.quantidade + ' un');
    p.push('por ' + (m.secretaria_nome || '—'));
    return p.join(' · ');
  }
  function desenhaHistorico() {
    var r = raiz('historico'); if (!r) return;
    var admin = isAdmin();   /* secretária: sem nenhum R$ e sem o quadro "No período" (24/10/26) */
    var per = hs.perAtual || periodo(hs), todos = hs.movs;
    var cont = { todos: todos.length, vendas: 0, notinhas: 0, estoque: 0, caixa: 0, erros: 0 };
    todos.forEach(function (m) { cont[grupoHs(m)]++; if (m.marcado_erro === true) cont.erros++; });
    var vis = todos.filter(function (m) { return hs.filtro === 'todos' ? true : hs.filtro === 'erros' ? m.marcado_erro === true : grupoHs(m) === hs.filtro; });
    hs.vis = vis.map(function (m) { return m.id; });
    resumo('historico', per.rot + ' · ' + (todos.length === 1 ? '1 lançamento' : todos.length + ' lançamentos') + ' · ' +
      (cont.erros === 0 ? 'nenhum marcado como erro' : cont.erros === 1 ? '1 marcado como erro' : cont.erros + ' marcados como erro'));
    var antes = r.querySelector('.lista-corpo'), rol = antes && !hs.topo ? antes.scrollTop : 0; hs.topo = false;
    r.innerHTML = '';
    var wrap = el('div', 'duas-col');
    var sec = el('section', 'lista alta'); sec.setAttribute('aria-label', 'Lançamentos');
    var topo = el('div', 'lista-topo');
    topo.appendChild(seg([['todos', 'Todos', null, cont.todos], ['vendas', 'Vendas', null, cont.vendas], ['notinhas', 'Notinhas', null, cont.notinhas], ['estoque', 'Estoque', null, cont.estoque],
      ['caixa', 'Caixa', null, cont.caixa], ['erros', 'Erros', null, cont.erros]], hs.filtro, function (v) { hs.filtro = v; hs.topo = true; desenhaHistorico(); }));
    topo.appendChild(el('span', 'mostrando', vis.length === 1 ? '1 lançamento' : vis.length + ' lançamentos'));
    sec.appendChild(topo);
    var corpo = el('div', 'lista-corpo');
    if (hs.erro) corpo.appendChild(el('div', 'lista-vazio erro', esc(hs.erro)));
    else if (!vis.length) corpo.appendChild(el('div', 'lista-vazio', 'Nenhum lançamento encontrado.'));
    listaPorDia(corpo, vis, function (m) {
      var err = m.marcado_erro === true;
      return { hora: hhmm(dataDe(m.timestamp)), desc: m.tipo === 'edicao_profissional' || m.tipo === 'edicao_produto' ? (m.descricao || tipoRot(m.tipo)) : descMov(m), meta: metaHs(m),
        valor: admin ? valorTxt(m) : '', cor: m.tipo === 'sangria' ? '#D70015' : '', tag: err ? 'Erro: ' + (m.motivo_erro || '') : tipoRot(m.tipo), tagCor: err ? '#D70015' : (TIPO_COR[m.tipo] || '#636366') };
    }, 'lançamento', 'lançamentos', hs, function (id) { abrirMov('historico', id); });
    sec.appendChild(corpo);
    wrap.appendChild(sec);
    var lado = el('div', 'lado');
    if (admin) {
      var np = el('section', 'painel');
      np.appendChild(el('div', 'painel-cab', '<h2>No período</h2><span>' + esc(per.curto) + '</span>'));
      var validos = todos.filter(function (m) { return m.marcado_erro !== true; });
      CATS.forEach(function (c) {
        var lista = validos.filter(c[3]);
        var tot = c[0] === 'caixa' ? validos.filter(function (m) { return m.tipo === 'suprimento'; }).reduce(function (a, m) { return a + (m.valor_total || 0); }, 0) -
          validos.filter(function (m) { return m.tipo === 'sangria'; }).reduce(function (a, m) { return a + (m.valor_total || 0); }, 0) : lista.reduce(function (a, m) { return a + (m.valor_total || 0); }, 0);
        np.appendChild(bt('cat', '<span class="q" style="background:' + c[2] + '"></span><span class="t"><b>' + c[1] + '</b><small>' + (lista.length === 1 ? '1 lançamento' : lista.length + ' lançamentos') + '</small></span>' +
          '<span class="lj-cat-v">' + esc((tot < 0 ? '− ' : '') + fmt(Math.abs(tot))) + '</span>' + svg(IC.dir, 16, 2), function () { abrirCat(c, lista, per); }));
      });
      lado.appendChild(np);
    }
    lado.appendChild(el('section', 'painel nota-lado', '<h2>Lançou errado?</h2><p>Abra o lançamento e use <b>Marcar como erro</b>, com o motivo. Ele continua registrado, mas sai de todos os cálculos.</p>' +
      '<p class="cinza">O sistema devolve o que for preciso: o saldo da notinha e o estoque voltam sozinhos.</p>'));
    wrap.appendChild(lado);
    r.appendChild(wrap);
    alturaLista(r);
    var c2 = r.querySelector('.lista-corpo'); if (c2) c2.scrollTop = rol;
    if (hs.pinta) hs.pinta();
  }
  function abrirCat(c, lista, per) {
    if (!window.moldura) return;
    var P = moldura.pop({ largura: '600px', titulo: 'Lançamentos ' + per.curto });
    P.corpo.appendChild(el('div', 'pp-cab', '<span class="pp-alerta" style="color:' + c[2] + '">' + (lista.length === 1 ? '1 lançamento' : lista.length + ' lançamentos') + '</span><h2>' + esc(c[1]) + '</h2>'));
    var l = el('div', 'pp-lista');
    if (!lista.length) l.appendChild(el('div', 'lista-vazio', 'Nada neste período.'));
    lista.forEach(function (m) {
      var d = dataDe(m.timestamp);
      l.appendChild(bt('pp-linha', '<span class="w">' + esc(ddmm(d) + ' ' + hhmm(d)) + '</span><span class="q"><b>' + esc(descMov(m)) + '</b><small>' + esc(metaHs(m)) + '</small></span><span class="lj-cat-v">' + esc(valorTxt(m)) + '</span>', function () {
        hs.filtro = c[4]; hs.topo = true; desenhaHistorico();
        var ids = hs.movs.filter(function (x) { return grupoHs(x) === c[4]; }).map(function (x) { return x.id; });
        abrirMov('historico', m.id, ids);
      }));
    });
    P.corpo.appendChild(l);
    rodapeBotoes(P, [bt('btn btn-s', 'Fechar', function () { P.fechar(); }), bt('btn btn-p', 'Ver só estes na lista', function () { hs.filtro = c[4]; hs.topo = true; P.fechar(); desenhaHistorico(); })]);
  }

  /* ════════════════════════ NOVA VENDA (janela no canto) ════════════════════════ */
  var nv = { janela: 'fechada', cart: [], q: '', cliente: 'paciente', modo: 'notinha', pag: 'dinheiro', prof: '', top: null, topEm: 0, ocupado: false, erro: '' };
  var nvEl = null;
  function nvProd(id) { for (var i = 0; i < PC.length; i++) if (PC[i].id === id) return PC[i]; return null; }
  function nvQtd(id) { for (var i = 0; i < nv.cart.length; i++) if (nv.cart[i].pid === id) return nv.cart[i].qtd; return 0; }
  function nvSet(id, n) {
    var i; for (i = 0; i < nv.cart.length; i++) if (nv.cart[i].pid === id) break;
    if (n <= 0) { if (i < nv.cart.length) nv.cart.splice(i, 1); }
    else if (i < nv.cart.length) nv.cart[i].qtd = n; else nv.cart.push({ pid: id, qtd: n });
    nv.erro = ''; nvPinta();
  }
  function nvMaisVendidos() {
    if (nv.top && Date.now() - nv.topEm < 10 * 60 * 1000) return;
    nv.topEm = Date.now();
    var h = new Date(), ini = new Date(h.getFullYear(), h.getMonth(), h.getDate() - 30, 0, 0, 0), fim = new Date(h.getFullYear(), h.getMonth(), h.getDate(), 23, 59, 59);
    buscaMovs({ ini: ini, fim: fim }).then(function (movs) {
      var c = {};
      movs.forEach(function (m) { if (semErro(m) && (m.tipo === 'venda_paciente' || m.tipo === 'venda_profissional') && m.produto_id) c[m.produto_id] = (c[m.produto_id] || 0) + (m.quantidade || 1); });
      nv.top = Object.keys(c).sort(function (a, b) { return c[b] - c[a]; });
      if (nv.janela === 'aberta') nvPinta();
    }).catch(function () { nv.top = []; });
  }
  /* toda venda nova começa do zero: Paciente, sem profissional, dinheiro (como loadVendaForm()) */
  function nvPadrao() { nv.cart = []; nv.q = ''; nv.cliente = 'paciente'; nv.modo = 'notinha'; nv.pag = 'dinheiro'; nv.prof = ''; nv.erro = ''; }
  function abrirVenda() {
    var nova = nv.janela === 'fechada';
    nv.janela = 'aberta';
    if (nova) {
      nvPadrao();
      /* como loadVendaForm(): recarrega produtos, preços e profissionais antes de vender */
      nv.carregando = true; nv.avisoCarga = '';
      loadCaches().then(function () { nv.avisoCarga = ''; }, function () { nv.avisoCarga = 'Não consegui atualizar produtos e preços agora. Confira os valores antes de confirmar.'; })
        .then(function () { nv.carregando = false; if (nv.janela !== 'fechada') nvPinta(); });
    }
    nvMaisVendidos();
    nvPinta();
    setTimeout(function () { var i = nvEl && nvEl.querySelector('.nv-busca input'); if (i) i.focus(); }, 0);
  }
  function nvTotal() { return nv.cart.reduce(function (a, it) { var p = nvProd(it.pid); return a + (p ? (p.preco_venda || 0) * it.qtd : 0); }, 0); }
  function nvEstoque(p) {
    var e = p.estoque_atual || 0, baixo = e <= 3;
    return { txt: baixo ? (e === 1 ? 'Último no estoque' : e <= 0 ? 'Sem estoque' : e + ' restantes') : e + ' em estoque', cls: baixo ? 'baixo' : '' };
  }
  function nvPinta() {
    var app = document.getElementById('app'); if (!app) return;
    if (!nvEl) { nvEl = el('div', 'nv'); app.appendChild(nvEl); }
    var fab = document.getElementById('fab');
    if (fab) fab.classList.toggle('nv-escondido', nv.janela !== 'fechada');
    nvEl.innerHTML = '';
    nvEl.className = 'nv nv-' + nv.janela;
    if (nv.janela === 'fechada') return;
    var tot = nvTotal(), qtdItens = nv.cart.reduce(function (a, it) { return a + it.qtd; }, 0);
    if (nv.janela === 'min') {
      var bar = el('div', 'nv-min');
      bar.appendChild(bt('nv-min-tit', esc(nv.cart.length ? 'Nova venda · ' + qtdItens + (qtdItens === 1 ? ' item · ' : ' itens · ') + fmt(tot) : 'Nova venda'), function () { nv.janela = 'aberta'; nvPinta(); }));
      var b1 = bt('nv-ic', svg(IC.sobe, 18, 2), function () { nv.janela = 'aberta'; nvPinta(); }); b1.setAttribute('aria-label', 'Abrir a venda'); bar.appendChild(b1);
      var b2 = bt('nv-ic', svg(IC.x, 18, 2), function () { nvFechar(); }); b2.setAttribute('aria-label', 'Fechar a venda'); bar.appendChild(b2);
      nvEl.appendChild(bar);
      return;
    }
    var jan = el('section', 'nv-jan'); jan.setAttribute('aria-label', 'Nova venda');
    var cab = el('div', 'nv-cab', '<span>Nova venda</span>');
    var bm = bt('nv-ic', svg(IC.min, 18, 2), function () { nv.janela = 'min'; nvPinta(); }); bm.setAttribute('aria-label', 'Minimizar'); cab.appendChild(bm);
    var bx = bt('nv-ic', svg(IC.x, 18, 2), function () { nvFechar(); }); bx.setAttribute('aria-label', 'Fechar e descartar'); cab.appendChild(bx);
    jan.appendChild(cab);
    var corpo = el('div', 'nv-corpo');
    var bu = el('label', 'busca nv-busca', svg(IC.busca, 16, 2) + '<input type="search" placeholder="Buscar produto e apertar Enter" aria-label="Buscar produto" autocomplete="off">');
    var bi = bu.querySelector('input'); bi.value = nv.q;
    var termo = sem(nv.q).trim();
    var achados = termo && !nv.carregando ? PC.filter(function (p) { return sem(p.nome).indexOf(termo) >= 0; }).slice(0, 6) : [];
    bi.addEventListener('input', function () { nv.q = bi.value; nvPinta(); var n2 = nvEl.querySelector('.nv-busca input'); if (n2) { n2.focus(); try { n2.setSelectionRange(n2.value.length, n2.value.length); } catch (e) {} } });
    bi.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && achados.length) { e.preventDefault(); nv.q = ''; nvSet(achados[0].id, nvQtd(achados[0].id) + 1); var n3 = nvEl.querySelector('.nv-busca input'); if (n3) n3.focus(); }
      if (e.key === 'Escape') { nv.q = ''; nvPinta(); }
    });
    corpo.appendChild(bu);
    if (nv.carregando) corpo.appendChild(el('div', 'nv-vazio nv-linha-topo', 'Atualizando produtos e preços…'));
    else if (!termo) {
      var tops = (nv.top || []).map(nvProd).filter(Boolean);
      if (tops.length < 6) PC.forEach(function (p) { if (tops.length < 6 && tops.indexOf(p) < 0) tops.push(p); });
      tops = tops.slice(0, 6);
      if (tops.length) {
        var mv = el('div', 'nv-bloco');
        mv.appendChild(el('span', 'nv-rot', nv.top && nv.top.length ? 'Mais vendidos' : 'Produtos'));
        var gr = el('div', 'nv-rapidos');
        tops.forEach(function (p) {
          var qn = nvQtd(p.id), e = nvEstoque(p);
          var b = bt('nv-rap' + (qn ? ' on' : ''), '<span class="q"><b>' + esc(p.nome) + '</b><small class="' + (qn ? 'na' : e.cls) + '">' + esc(qn ? 'Na venda: ' + qn : e.txt) + '</small></span><span class="v">' + esc(fmt(p.preco_venda)) + '</span>',
            function () { nvSet(p.id, qn + 1); });
          b.setAttribute('aria-label', 'Incluir ' + p.nome);
          gr.appendChild(b);
        });
        mv.appendChild(gr);
        corpo.appendChild(mv);
      }
    } else {
      var rs = el('div', 'nv-res');
      achados.forEach(function (p) {
        var qn = nvQtd(p.id), e = nvEstoque(p);
        var b = bt('nv-res-l' + (qn ? ' on' : ''), '<span class="q"><b>' + esc(p.nome) + '</b><small class="' + (qn ? 'na' : e.cls) + '">' + esc(qn ? 'Na venda: ' + qn : e.txt) + '</small></span><span class="v">' + esc(fmt(p.preco_venda)) + '</span>',
          function () { nv.q = ''; nvSet(p.id, qn + 1); });
        b.setAttribute('aria-label', 'Incluir ' + p.nome);
        rs.appendChild(b);
      });
      if (!achados.length) rs.appendChild(el('div', 'nv-vazio', 'Nenhum produto com esse nome.'));
      corpo.appendChild(rs);
    }
    var itens = el('div', 'nv-bloco');
    var ic = el('div', 'nv-itens-cab', '<span class="nv-rot">Itens</span>');
    if (nv.cart.length) ic.appendChild(bt('nv-limpar', 'Limpar', function () { nv.cart = []; nvPinta(); }));
    itens.appendChild(ic);
    if (!nv.cart.length) itens.appendChild(el('div', 'nv-vazio nv-linha-topo', 'Nenhum item. Toque num produto ou busque pelo nome.'));
    nv.cart.forEach(function (it) {
      var p = nvProd(it.pid); if (!p) return;
      var l = el('div', 'nv-item', '<span class="q"><b>' + esc(p.nome) + '</b><small>' + esc(fmt(p.preco_venda) + ' cada') + '</small></span>');
      var qd = el('span', 'nv-qtd');
      var m1 = bt('', svg(IC.menos, 14, 2.2), function () { nvSet(p.id, it.qtd - 1); }); m1.setAttribute('aria-label', 'Tirar um ' + p.nome);
      var m2 = bt('', svg(IC.mais, 14, 2.2), function () { nvSet(p.id, it.qtd + 1); }); m2.setAttribute('aria-label', 'Mais um ' + p.nome);
      qd.appendChild(m1); qd.appendChild(el('span', 'n', String(it.qtd))); qd.appendChild(m2);
      l.appendChild(qd);
      l.appendChild(el('span', 'v', esc(fmt((p.preco_venda || 0) * it.qtd))));
      itens.appendChild(l);
    });
    corpo.appendChild(itens);
    var cl = el('div', 'nv-bloco');
    cl.appendChild(el('span', 'nv-rot', 'Cliente'));
    cl.appendChild(seg([['paciente', 'Paciente'], ['prof', 'Profissional']], nv.cliente, function (v) { nv.cliente = v; nv.erro = ''; nvPinta(); }, 'seg-cheio'));
    corpo.appendChild(cl);
    var ehProf = nv.cliente === 'prof', naNotinha = ehProf && nv.modo === 'notinha';
    if (ehProf) {
      var pf = el('div', 'nv-bloco');
      var sel = el('select', 'fc'); sel.setAttribute('aria-label', 'Profissional');
      var o0 = el('option', '', 'Selecione…'); o0.value = ''; sel.appendChild(o0);
      PRC.forEach(function (p) {   /* notinha oculta: o nome aparece, o valor não (secretária) */
        var o = el('option', '', esc(p.nome + (p.saldo_devedor > 0 && !saldoOculto(p) ? ' — deve ' + fmt(p.saldo_devedor) : ''))); o.value = p.id; if (p.id === nv.prof) o.selected = true; sel.appendChild(o);
      });
      sel.addEventListener('change', function () { nv.prof = sel.value; nv.erro = ''; nvPinta(); });
      pf.appendChild(campo('Profissional', sel));
      pf.appendChild(el('span', 'nv-rot', 'Como vai pagar?'));
      pf.appendChild(seg([['notinha', 'Na notinha'], ['agora', 'Pagar agora']], nv.modo, function (v) { nv.modo = v; nvPinta(); }, 'seg-cheio'));
      corpo.appendChild(pf);
    }
    if (!naNotinha) {
      var pg = el('div', 'nv-bloco');
      pg.appendChild(el('span', 'nv-rot', 'Forma de pagamento'));
      pg.appendChild(seg([['dinheiro', 'Dinheiro'], ['pix', 'PIX'], ['debito', 'Débito'], ['credito', 'Crédito']], nv.pag, function (v) { nv.pag = v; nvPinta(); }, 'seg-cheio'));
      var tx = taxaDe(nv.pag, tot);
      if (tx > 0) pg.appendChild(el('span', 'nv-taxa', esc('Taxa ' + (nv.pag === 'debito' ? 'débito ' + pct(CFG.taxa_debito) : 'crédito ' + pct(CFG.taxa_credito)) + ' · líquido ' + fmt(tot - tx))));
      corpo.appendChild(pg);
    } else corpo.appendChild(el('span', 'nv-taxa', 'Será lançado na notinha do profissional.'));
    if (nv.avisoCarga) corpo.appendChild(el('span', 'mal-erro-txt', esc(nv.avisoCarga)));
    if (nv.erro) corpo.appendChild(el('span', 'mal-erro-txt', esc(nv.erro)));
    jan.appendChild(corpo);
    var pe = el('div', 'nv-pe', '<span class="t"><small>Total</small><b>' + esc(fmt(tot)) + '</b></span>');
    var ok = bt('btn btn-p nv-ok', naNotinha ? 'Lançar na notinha' : 'Confirmar venda', function () { nvConfirmar(ok); });
    ok.disabled = !nv.cart.length || nv.ocupado || nv.carregando;
    if (nv.ocupado) ok.textContent = 'Salvando…';
    pe.appendChild(ok);
    jan.appendChild(pe);
    nvEl.appendChild(jan);
  }
  function nvFechar() { if (nv.ocupado) return; nv.janela = 'fechada'; nvPadrao(); nvPinta(); }
  function nvConfirmar() {
    if (nv.ocupado || nv.carregando) return;
    /* = confirmarVenda(): o servidor confere o preço de cada produto, calcula a taxa do cartão, baixa o estoque
       e, na notinha, soma no saldo — tudo junto (ou nada) */
    var itens = nv.cart.map(function (it) { var p = nvProd(it.pid); return p ? { pid: p.id, preco: p.preco_venda, qtd: it.qtd } : null; }).filter(Boolean);
    if (!itens.length) { nv.erro = 'Adicione pelo menos um produto.'; nvPinta(); return; }
    var tipo = nv.cliente === 'prof' ? 'profissional' : 'paciente';
    var quem = 'paciente', como = formaRot(nv.pag), forma = nv.pag, profId = null;
    if (tipo === 'profissional') {
      profId = nv.prof;
      var prof = PRC.find(function (x) { return x.id === profId; });
      if (!profId || !prof) { nv.erro = 'Selecione o profissional.'; nvPinta(); return; }
      if (nv.modo !== 'agora') { forma = 'notinha'; como = 'na notinha'; }
      quem = prof.nome;
    }
    nv.ocupado = true; nvPinta();
    LAPI.venda(tipo, forma, profId, itens.map(function (x) { return { produto_id: x.pid, quantidade: x.qtd, preco: x.preco }; })).then(function (r) {
      nv.ocupado = false;
      toast('Venda registrada: ' + fmt(r.total) + ', ' + quem + ', ' + como + '.', 'ok');
      nv.janela = 'fechada'; nvPadrao();
      nv.topEm = 0;
      nvPinta();
      semQuebrar(loadCaches().then(function () {
        if (naTela('notinhas')) return notinhas(); else if (naTela('caixa')) return caixa(); else if (naTela('historico')) return historico(); else if (naTela('estoque')) return estoque();
      }));
    }, function (e) {
      nv.ocupado = false; nv.erro = 'Não deu certo: ' + (e.message || e); toast('A venda NÃO foi gravada: ' + (e.message || e), 'ko');
      /* preço mudou ou produto saiu do estoque: atualiza a lista para a pessoa conferir e confirmar de novo */
      if (e.codigo === 'PRECO_MUDOU' || e.codigo === 'PRODUTO_INVALIDO') {
        nv.carregando = true;
        loadCaches().catch(function () {}).then(function () { nv.carregando = false; if (nv.janela !== 'fechada') nvPinta(); });
      }
      nvPinta();
    });
  }
  function sair() { nv.janela = 'fechada'; nvPadrao(); nv.ocupado = false; nv.carregando = false; nv.avisoCarga = ''; if (nvEl) { nvEl.innerHTML = ''; nvEl.className = 'nv nv-fechada'; } var f = document.getElementById('fab'); if (f) f.classList.remove('nv-escondido'); nt.carregado = false; cx.carregado = false; es.carregado = false; hs.carregado = false; }

  return { notinhas: notinhas, caixa: caixa, estoque: estoque, historico: historico, relatorio: relatorio, bonificacao: bonificacao, abrirVenda: abrirVenda, sair: sair,
           _textoExtrato: textoExtrato };
})();
