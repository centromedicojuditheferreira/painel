/* ═══════════════════════════════════════════════════════════════════
   INÍCIO DA ADMINISTRAÇÃO · ADM v1.1 (06/11/2026) — a primeira tela da Marinalva
   v1.1: quadro "Esta semana" (agendamentos de psicologia por dia × a mesma semana do mês anterior, com o
   valor que entrou / previsto), visual mais limpo (pedido do dono: "poluído, mas mantém as informações"),
   fichas vermelhas da Recepção pulsando de leve, barra do topo e linha da data escondidas nesta tela.
   Pedido do dono (05/11/2026): a sócia acompanha as pendências das secretárias só pelo número (sem lista,
   sem nome de paciente), vê o que entra na conveniência nos últimos 7 dias, as contas que ela paga e o
   número que ela mais acompanha — os atendimentos dos psicólogos — com os meses anteriores ao lado,
   para o medo de "estar com poucos agendamentos" ser respondido pelo banco, todo dia. Letra grande,
   pouca coisa por tela, uma orquídea de marca d'água e a frase do dia (js/frases.js).
   · Ativa só para a Administração que não é o dono (CU.admin && !CU.dono). Secretárias e o dono
     continuam no Início de sempre (js/inicio.js), que chama INICIO_ADM.desenhar() quando é ela.
   · Pendências: contadas do que o Cortex já leu (GV.inicioDados + FCOB + GAVETA + PCOB), nada a mais.
   · Números: função cortex_adm_resumo(p_token) do Supabase (sql/ADM_v1_0_resumo_marinalva.sql), com a
     sessão do PIN; relida de 5 em 5 minutos. Sem o SQL instalado, os quadros de números explicam e o
     resto da tela segue normal. Nada em R$ da Unimed aqui (faturamento é só do dono).
   ═══════════════════════════════════════════════════════════════════ */
var INICIO_ADM = (function () {
  'use strict';

  var VALIDADE = 5 * 60 * 1000;   /* a leitura dos números vale por 5 min */
  var MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  var MES_LONGO = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  var DIA_SEM = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
  var IC = { dir: 'M9.5 6l6 6-6 6', ok: 'M5 12.5l4.5 4.5L19 7.5', aspas: 'M7 11h3v3H7zM14 11h3v3h-3zM7 11c0-2.5 1-4 3-5M14 11c0-2.5 1-4 3-5',
             sobe: 'M12 19V6M6 12l6-6 6 6', igual: 'M5 10h14M5 14h14' };

  var st = { dados: null, lidoEm: 0, erro: '', carregando: false, promessa: null, main: null, R: null };

  function logado() { return typeof CU !== 'undefined' && !!CU; }
  function ativo() { return logado() && CU.admin === true && !CU.dono; }
  function novo(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function botao(cls, html, fn) { var b = novo('button', cls, html); b.type = 'button'; if (fn) b.addEventListener('click', fn); return b; }
  function esc(s) { var d = document.createElement('div'); d.textContent = s == null ? '' : String(s); return d.innerHTML; }
  function svg(d, t, w) { return window.moldura ? moldura.svg(d, t, w) : ''; }
  function n0(v) { return Math.round(Number(v) || 0).toLocaleString('pt-BR'); }
  function rs(v) { return 'R$ ' + (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function rs0(v) { return 'R$ ' + Math.round(Number(v) || 0).toLocaleString('pt-BR'); }
  function hhmm(ms) { var d = new Date(ms); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); }
  function dataLocal(iso) { var p = String(iso || '').slice(0, 10).split('-'); return new Date(+p[0], +p[1] - 1, +p[2] || 1); }
  function ddmm(iso) { var d = dataLocal(iso); return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0'); }
  function hojeISO() { return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }); }
  function plural(n, um, varios) { return n0(n) + ' ' + (n === 1 ? um : varios); }
  function pct(a, b) { return b ? Math.round((a - b) / b * 100) : null; }
  function ordinal(n) { return n + 'ª'; }
  function chips(lista, fmt) { return lista.map(function (x) { return '<span class="ia-chip">' + fmt(x) + '</span>'; }).join(''); }
  function ir(d) { if (window.irPara) irPara(d); }

  /* ── pendências das secretárias: só a contagem, a partir do que o Início já lê ── */
  var FICHAS = [
    { k: 'agenda', rot: 'Agenda',        tela: 'agenda' },
    { k: 'corte',  rot: 'Corte',         tela: 'corte' },
    { k: 'falhas', rot: 'Falhas',        tela: 'falhas' },
    { k: 'cad',    rot: 'Cadastros',     tela: 'cadastros' },
    { k: 'excl',   rot: 'Exclusões',     tela: 'exclusoes' },
    { k: 'caixa',  rot: 'Cobrar',        tela: 'caixa' },
    { k: 'prof',   rot: 'Profissionais', tela: null }
  ];
  function contar(R) {
    var c = { agenda: 0, corte: 0, falhas: 0, cad: 0, excl: 0, caixa: 0, prof: 0 }, antiga = null, abrirProf = null, gaveta = [];
    function marca(iso) { if (!iso) return; var d = new Date(iso); if (!isNaN(d) && (!antiga || d < antiga)) antiga = d; }
    (R.agora || []).forEach(function (a) {
      if (a.chave === 'hoje_sem_guia') c.agenda += a.n || 0;
      else if (a.chave === 'cobrar') c.caixa += a.n || 0;
      else if (a.chave === 'prof') { c.prof += a.n || 0; abrirProf = a.abrir; }
      else if (a.chave === 'gaveta') gaveta.push(a);
    });
    (R.grupos || []).forEach(function (g) {
      var k = String(g.chave).indexOf('agenda:') === 0 ? 'agenda' : g.chave;
      if (c[k] == null) c[k] = 0;
      c[k] += g.n || 0;
      (g.itens || []).forEach(function (it) { marca(it.desde); });
    });
    var total = 0; Object.keys(c).forEach(function (k) { total += c[k]; });
    return { c: c, total: total, antiga: antiga, abrirProf: abrirProf, gaveta: gaveta };
  }

  /* ── os números do servidor ── */
  function carregar(forcar) {
    if (!ativo() || !window.LAPI || !LAPI.admResumo) return Promise.resolve(null);
    if (st.promessa) return st.promessa;
    if (!forcar && st.dados && Date.now() - st.lidoEm < VALIDADE) return Promise.resolve(st.dados);
    st.carregando = true;
    st.promessa = LAPI.admResumo().then(function (j) {
      st.dados = j; st.lidoEm = Date.now(); st.erro = '';
    }).catch(function (e) {
      st.erro = e && e.status === 404 ? 'SEM_SQL' : ((e && e.message) || 'Não consegui ler os números.');
      if (!st.dados) st.lidoEm = Date.now() - VALIDADE + 60 * 1000;   /* deu erro: tenta de novo em 1 min */
    }).then(function () {
      st.carregando = false; st.promessa = null;
      if (naTela()) desenhar(st.main, st.R);
    });
    return st.promessa;
  }
  function naTela() { return !!(window.GV && GV.telaAtual && GV.telaAtual() === 'inicio' && window.moldura && moldura.atual() === 'inicio' && st.main); }

  /* ── pedaços ── */
  function cabecalho(titulo, sub, acao) {
    var h = novo('div', 'ia-cab', '<h2>' + esc(titulo) + '</h2>' + (sub ? '<span>' + esc(sub) + '</span>' : ''));
    if (acao) { var b = botao('ia-ir', esc(acao[0]) + ' ›', acao[1]); h.appendChild(b); }
    return h;
  }
  function numero(valor, rotulo, cls) {
    return novo('div', 'ia-num' + (cls ? ' ' + cls : ''), '<b>' + esc(valor) + '</b><small>' + esc(rotulo) + '</small>');
  }
  function fraseTopo(P) {
    var emDia = P.pronto && P.total === 0;
    var f = emDia ? FRASES.emDia() : FRASES.doDia();
    return novo('p', 'ia-frase' + (emDia ? ' em-dia' : ''), '<i>' + svg(IC.aspas, 18, 1.6) + '</i><span>' + esc(f) + '</span>');
  }

  /* Recepção: as fichas com o número (pílulas; as vermelhas pulsam de leve) */
  function recepcao(P) {
    var sec = novo('section', 'ia-card ia-recep'); sec.setAttribute('aria-label', 'Recepção');
    var emDia = P.pronto && P.total === 0;
    sec.appendChild(cabecalho('Recepção', emDia ? 'nenhuma pendência das secretárias' : 'pendências das secretárias · clique para abrir a tela', ['Agenda', function () { ir('agenda'); }]));
    var linha = novo('div', 'ia-fichas');
    FICHAS.forEach(function (f) {
      var n = P.c[f.k] || 0, zero = n === 0;
      var b = botao('ia-ficha ' + (zero ? 'ok' : 'tem'),
        '<span class="r">' + esc(f.rot) + '</span>' +
        '<span class="n">' + (P.pronto || n ? (zero ? svg(IC.ok, 16, 2.6) : n0(n)) : '…') + '</span>',
        function () { if (f.k === 'prof' && P.abrirProf) P.abrirProf(); else if (f.tela) ir(f.tela); });
      b.title = zero ? f.rot + ': em dia' : f.rot + ': ' + plural(n, 'pendência', 'pendências') + ' — abrir a tela';
      linha.appendChild(b);
    });
    P.gaveta.forEach(function (g) {
      var b = botao('ia-ficha orq', '<span class="r">Gaveta</span><span class="n txt">' + esc(g.txt || 'tarefa') + '</span>', g.abrir);
      b.title = g.l1 || 'Gaveta';
      linha.appendChild(b);
    });
    sec.appendChild(linha);
    if (emDia) sec.appendChild(novo('div', 'ia-rodape', '<span class="ok">' + svg(IC.ok, 14, 2.6) + ' Recepção em dia</span>'));
    else if (P.antiga) {
      var a = P.antiga, aHoje = a.toLocaleDateString('en-CA') === new Date().toLocaleDateString('en-CA');
      sec.appendChild(novo('div', 'ia-rodape', '<span>a pendência mais antiga espera desde ' + (aHoje ? 'hoje às ' : String(a.getDate()).padStart(2, '0') + '/' + String(a.getMonth() + 1).padStart(2, '0') + ' ') + hhmm(a.getTime()) + '</span>'));
    }
    return sec;
  }

  /* Esta semana: agendamentos de psicologia por dia × a mesma semana do mês anterior; embaixo, o valor */
  function semana(D) {
    var sec = novo('section', 'ia-card ia-semcard'); sec.setAttribute('aria-label', 'Esta semana');
    var S = D && D.semana;
    if (!S) { sec.appendChild(cabecalho('Esta semana', 'agendamentos de psicologia por dia')); sec.appendChild(semDados()); return sec; }
    var dias = S.dias || [], hj = hojeISO();
    var mesRef = MES_LONGO[dataLocal(S.ref_mes).getMonth()], mesSeg = MES_LONGO[dataLocal(S.seg).getMonth()];
    var tot = S.total || 0, ref = S.ref_total || 0;
    var totC = 0, refC = 0, feriados = [];   /* a comparação ignora os dias que foram feriado numa das duas semanas */
    dias.forEach(function (d) {
      if (d.feriado || d.ref_feriado) { feriados.push(DIA_SEM[d.dow % 7]); return; }
      totC += d.agendados || 0; refC += d.ref_agendados || 0;
    });
    var dif = pct(totC, refC);
    sec.appendChild(cabecalho('Esta semana', 'agendamentos de psicologia por dia · ' + ordinal(S.n) + ' semana de ' + mesSeg + ' × ' + ordinal(S.n) + ' de ' + mesRef + ' (' + ddmm(S.ref_seg) + ' a ' + ddmm(S.ref_sab) + ')'));
    var topo = novo('div', 'ia-sem-topo');
    topo.appendChild(novo('div', 'ia-sem-tot', '<b>' + n0(tot) + '</b><small>de ' + ddmm(S.seg) + ' a ' + ddmm(S.sab) + '</small>'));
    topo.appendChild(novo('div', 'ia-sem-tot ref', '<b>' + n0(ref) + '</b><small>' + ordinal(S.n) + ' semana de ' + esc(mesRef) + '</small>'));
    if (dif != null) topo.appendChild(novo('div', 'ia-sem-dif ' + (dif >= 3 ? 'sobe' : dif <= -3 ? 'desce' : 'igual'),
      (dif >= 3 ? svg(IC.sobe, 15, 2.4) + ' ' + dif + '% a mais' : dif <= -3 ? svg(IC.igual, 15, 2.4) + ' ' + Math.abs(dif) + '% a menos' : svg(IC.igual, 15, 2.4) + ' no mesmo ritmo') + ' que ' + esc(mesRef) +
      (feriados.length ? '<small>sem contar ' + esc(feriados.join(', ')) + ' (feriado)</small>' : '')));
    sec.appendChild(topo);
    var max = 1;
    dias.forEach(function (d) { max = Math.max(max, d.agendados || 0, d.ref_agendados || 0); });
    var grade = novo('div', 'ia-semana'); grade.setAttribute('role', 'img');
    grade.setAttribute('aria-label', 'Agendamentos por dia: ' + dias.map(function (d) { return DIA_SEM[d.dow % 7] + ' ' + d.agendados + ' (mês anterior ' + d.ref_agendados + ')'; }).join(', '));
    dias.forEach(function (d) {
      var dt = dataLocal(d.dia), passado = d.dia < hj, hoje = d.dia === hj;
      var col = novo('div', 'ia-dia' + (hoje ? ' hoje' : passado ? ' passado' : ' futuro') + (d.feriado ? ' feriado' : ''));
      col.title = DIA_SEM[dt.getDay()] + ' ' + ddmm(d.dia) + ': ' + plural(d.agendados || 0, 'agendamento', 'agendamentos') + (passado || hoje ? ' · ' + n0(d.atendidos || 0) + ' atendidos' : '') + ' · mês anterior: ' + n0(d.ref_agendados || 0);
      col.innerHTML = '<span class="n">' + (d.feriado ? '—' : n0(d.agendados || 0)) + '</span>' +
        '<span class="pilha"><span class="b" style="height:' + Math.max(2, Math.round((d.agendados || 0) / max * 100)) + '%"></span>' +
        '<span class="b ref" style="height:' + Math.max(2, Math.round((d.ref_agendados || 0) / max * 100)) + '%"></span></span>' +
        '<span class="m">' + DIA_SEM[dt.getDay()] + '<small>' + (d.feriado ? 'feriado' : dt.getDate()) + '</small></span>' +
        '<span class="r">' + (d.ref_feriado ? 'feriado' : n0(d.ref_agendados || 0)) + '</span>';
      grade.appendChild(col);
    });
    sec.appendChild(grade);
    sec.appendChild(novo('p', 'ia-legenda', '<i class="a"></i> esta semana <i class="b"></i> ' + ordinal(S.n) + ' semana de ' + esc(mesRef) + ' · dias que já passaram contam o que aconteceu; os que faltam, o que está marcado'));
    var V = S.valor;
    if (V) {
      var nums = novo('div', 'ia-nums tres ia-sem-valor');
      nums.appendChild(numero(rs0(V.entrou), 'entrou até hoje', 'verde'));
      nums.appendChild(numero(rs0(V.previsto), 'previsto até sábado' + (V.comparecimento ? ' · ' + Math.round(V.comparecimento * 100) + '% de comparecimento' : '')));
      nums.appendChild(numero(rs0(V.ref_total), ordinal(S.n) + ' semana de ' + mesRef));
      sec.appendChild(nums);
      sec.appendChild(novo('p', 'ia-nota mini', 'Unimed pela tabela de códigos, Lev Soul R$ 60 por sessão, particular pelo valor marcado' +
        (V.sem_valor_n ? ' · ' + plural(V.sem_valor_n, 'agendamento de outro convênio sem valor cadastrado', 'agendamentos de outros convênios sem valor cadastrado') : '') + '.'));
    }
    return sec;
  }

  /* Psicólogos: o número do mês, a comparação e os meses */
  function psicologos(D) {
    var sec = novo('section', 'ia-card ia-psi'); sec.setAttribute('aria-label', 'Psicólogos');
    var hoje = new Date(), mi = hoje.getMonth(), mesNome = MES_LONGO[mi], mesAnt = MES_LONGO[(mi + 11) % 12];
    sec.appendChild(cabecalho('Psicólogos', 'atendimentos de psicologia · todos os convênios', ['Agenda', function () { ir('agenda'); }]));
    if (!D) { sec.appendChild(semDados()); return sec; }
    var p = D.psi || {}, at = p.atendidos_mes || 0, ant = p.mes_anterior_mesmo_dia || 0, antTot = p.mes_anterior_total || 0, rest = p.marcadas_restantes || 0;
    var comp = Number(p.comparecimento) || 0, est = at + Math.round(rest * comp);
    var dif = pct(at, ant);

    var topo = novo('div', 'ia-psi-topo');
    topo.appendChild(novo('div', 'ia-grande', '<b>' + n0(at) + '</b><small>atendimentos em ' + esc(mesNome) + ', até hoje</small>'));
    var cmp = novo('p', 'ia-cmp');
    if (ant && dif != null && dif >= 3) cmp.innerHTML = '<i class="sobe">' + svg(IC.sobe, 16, 2.4) + '</i><span><b>' + dif + '% acima</b> de ' + esc(mesAnt) + ' no mesmo ponto do mês (' + n0(ant) + ')</span>';
    else if (ant && dif != null && dif <= -3) cmp.innerHTML = '<i class="igual">' + svg(IC.igual, 16, 2.4) + '</i><span>' + esc(mesAnt) + ' tinha ' + n0(ant) + ' no mesmo ponto — e ' + esc(mesNome) + ' ainda tem <b>' + n0(rest) + ' marcadas</b> pela frente</span>';
    else if (ant) cmp.innerHTML = '<i class="igual">' + svg(IC.igual, 16, 2.4) + '</i><span><b>no mesmo ritmo</b> de ' + esc(mesAnt) + ' (' + n0(ant) + ' no mesmo ponto)</span>';
    else cmp.innerHTML = '<span>primeiro mês com dados para comparar</span>';
    topo.appendChild(cmp);
    sec.appendChild(topo);

    var nums = novo('div', 'ia-nums');
    nums.appendChild(numero(n0(rest), 'marcadas pela frente em ' + mesNome));
    nums.appendChild(numero(n0(p.psicologos_mes || 0), 'psicólogos atendendo'));
    if (at) nums.appendChild(numero(Math.round((p.unimed_mes || 0) / at * 100) + '%', 'pela Unimed'));
    nums.appendChild(numero(n0(p.hoje_atendidos || 0) + ' · ' + n0(p.hoje_marcadas || 0), 'hoje: atendidas · ainda marcadas'));
    sec.appendChild(nums);

    /* barras dos meses: fechados em cheio; o atual até hoje + a estimativa em cima, mais clara */
    var meses = (p.meses || []).slice(), max = 1;
    meses.forEach(function (m) { max = Math.max(max, m.atendidos || 0); });
    max = Math.max(max, est);
    var barras = novo('div', 'ia-barras'); barras.setAttribute('role', 'img');
    barras.setAttribute('aria-label', 'Atendimentos de psicologia por mês: ' + meses.map(function (m) { return MES[+m.mes.slice(5, 7) - 1] + ' ' + m.atendidos; }).join(', '));
    var mesAtual = String(p.mes || '').slice(0, 7);
    meses.forEach(function (m) {
      var atual = m.mes === mesAtual, v = m.atendidos || 0;
      var col = novo('div', 'ia-col' + (atual ? ' atual' : ''));
      var alt = Math.max(2, Math.round(v / max * 100)), altEst = atual ? Math.max(0, Math.round((est - v) / max * 100)) : 0;
      col.innerHTML = '<span class="v">' + n0(v) + '</span>' +
        '<span class="pilha"><span class="b" style="height:' + alt + '%"></span>' +
        (altEst ? '<span class="e" style="height:' + altEst + '%;bottom:' + alt + '%" title="estimativa até o fim do mês: ' + n0(est) + '"></span>' : '') + '</span>' +
        '<span class="m">' + MES[+m.mes.slice(5, 7) - 1] + (atual ? '<small>até hoje</small>' : '') + '</span>';
      barras.appendChild(col);
    });
    sec.appendChild(barras);

    var nota = novo('p', 'ia-nota');
    if (comp && rest) {
      var cmpTxt = Math.round(comp * 100) + '%';
      nota.innerHTML = 'Se o comparecimento seguir como nos últimos 3 meses (' + cmpTxt + '), ' + esc(mesNome) + ' fecha perto de <b>' + n0(est) + '</b>' +
        (antTot ? (est >= antTot ? ' — acima de ' + esc(mesAnt) + ' (' + n0(antTot) + ').' : ' — ' + esc(mesAnt) + ' fechou com ' + n0(antTot) + ', e o mês ainda ganha agendamentos novos até o fim.') : '.');
    } else nota.textContent = antTot ? mesAnt + ' fechou com ' + n0(antTot) + ' atendimentos.' : '';
    sec.appendChild(nota);
    return sec;
  }

  /* Conveniência: últimos 7 dias */
  function conveniencia(D) {
    var sec = novo('section', 'ia-card ia-conv'); sec.setAttribute('aria-label', 'Conveniência');
    sec.appendChild(cabecalho('Conveniência', 'últimos 7 dias, hoje incluso', ['Histórico', function () { ir('historico'); }]));
    if (!D) { sec.appendChild(semDados()); return sec; }
    var c = D.conv || {};
    var nums = novo('div', 'ia-nums tres');
    nums.appendChild(numero(rs0(c.vendas), 'vendido · ' + plural(c.vendas_n || 0, 'venda', 'vendas'), 'orq'));
    nums.appendChild(numero(rs0(c.recebido), 'recebido de notinhas', 'verde'));
    nums.appendChild(numero(rs0(c.notinha), 'lançado em notinha (a receber)'));
    sec.appendChild(nums);

    var dias = c.dias || [], max = 1;
    dias.forEach(function (d) { max = Math.max(max, (Number(d.vendas) || 0) + (Number(d.recebido) || 0)); });
    var barras = novo('div', 'ia-barras mini'); barras.setAttribute('role', 'img');
    barras.setAttribute('aria-label', 'Entradas por dia: ' + dias.map(function (d) { return ddmm(d.dia) + ' ' + rs0((Number(d.vendas) || 0) + (Number(d.recebido) || 0)); }).join(', '));
    var hj = hojeISO();
    dias.forEach(function (d) {
      var v = (Number(d.vendas) || 0) + (Number(d.recebido) || 0), dt = dataLocal(d.dia);
      var col = novo('div', 'ia-col' + (d.dia === hj ? ' atual' : '') + (v ? '' : ' zero'));
      col.title = ddmm(d.dia) + ': ' + rs(d.vendas) + ' vendido · ' + rs(d.recebido) + ' de notinhas';
      col.innerHTML = '<span class="v">' + (v ? rs0(v).replace('R$ ', '') : '') + '</span><span class="pilha"><span class="b" style="height:' + Math.max(2, Math.round(v / max * 100)) + '%"></span></span>' +
        '<span class="m">' + DIA_SEM[dt.getDay()] + '<small>' + dt.getDate() + '</small></span>';
      barras.appendChild(col);
    });
    sec.appendChild(barras);

    var lin = novo('div', 'ia-linhas');
    var mv = c.mais_vendidos || [];
    if (mv.length) lin.appendChild(novo('p', '', '<b>Mais vendidos</b>' + chips(mv, function (x) { return esc(x.nome) + ' <i>' + n0(x.qtd) + '</i>'; })));
    var ac = c.acabando || [];
    if (c.acabando_n) {
      var pa = novo('p', 'aviso', '<b>Acabando</b> <span class="q">' + n0(c.acabando_n) + '</span>' + chips(ac, function (x) { return esc(x.nome) + ' <i>' + n0(x.estoque) + '</i>'; }) + (c.acabando_n > ac.length ? '<span class="ia-chip mudo">…</span>' : ''));
      pa.appendChild(botao('ia-link', 'Entrada de estoque ›', function () { ir('estoque'); }));
      pa.title = 'Produtos ativos com 0 a 2 no estoque que venderam nos últimos 30 dias';
      lin.appendChild(pa);
    }
    if (c.negativos_n) {
      var pn = novo('p', 'mudo', '<b>' + n0(c.negativos_n) + '</b> com estoque negativo (venda sem entrada) ');
      pn.appendChild(botao('ia-link', 'Estoque atual ›', function () { ir('posicao'); }));
      lin.appendChild(pn);
    }
    if (lin.children.length) sec.appendChild(lin);
    return sec;
  }

  /* Contas do mês: o que ela paga */
  function contas(D) {
    var sec = novo('section', 'ia-card ia-contas'); sec.setAttribute('aria-label', 'Contas do mês');
    var mesNome = MES_LONGO[new Date().getMonth()];
    sec.appendChild(cabecalho('Contas de ' + mesNome, 'o que falta pagar e o que vence agora', ['Abrir o Financeiro', function () { ir('contas'); }]));
    if (!D) { sec.appendChild(semDados()); return sec; }
    var k = D.contas || {}, venc = k.vencidas || 0;
    var nums = novo('div', 'ia-nums tres');
    nums.appendChild(numero(rs0(k.falta), 'falta pagar' + (k.sem_valor ? ' · ' + plural(k.sem_valor, 'conta sem valor', 'contas sem valor') : '')));
    nums.appendChild(numero(n0(k.pagas || 0) + ' de ' + n0(k.total || 0), 'contas pagas', 'verde'));
    nums.appendChild(numero(n0(venc), venc === 1 ? 'conta vencida' : 'contas vencidas', venc ? 'verm' : 'verde'));
    sec.appendChild(nums);
    var prox = k.proximas || [], hj = hojeISO();
    if (prox.length) {
      var ul = novo('div', 'ia-lista');
      prox.slice(0, 6).forEach(function (x) {
        var v = String(x.vencimento || '').slice(0, 10), tag = '', cls = '';
        if (v && v < hj) { tag = 'vencida'; cls = 'verm'; }
        else if (v === hj) { tag = 'vence hoje'; cls = 'lar'; }
        else if (v) { var dd = Math.round((dataLocal(v) - dataLocal(hj)) / 864e5); tag = dd === 1 ? 'vence amanhã' : 'vence em ' + dd + ' dias'; }
        var r = botao('ia-item', '<span class="d">' + (v ? ddmm(v) : '—') + '</span><span class="nm">' + esc(x.nome || '—') + (x.debito ? '<small>débito automático · ' + esc(x.debito) + '</small>' : '') + '</span>' +
          '<span class="tg ' + cls + '">' + tag + '</span><span class="vl">' + (x.valor != null ? rs(x.valor) : 'valor a definir') + '</span>', function () { ir('contas'); });
        ul.appendChild(r);
      });
      if (prox.length > 6) ul.appendChild(botao('ia-mais', 'e mais ' + (prox.length - 6) + ' no Financeiro ›', function () { ir('contas'); }));
      sec.appendChild(ul);
    } else sec.appendChild(novo('p', 'ia-nota ok', svg(IC.ok, 14, 2.6) + ' Nada vencido e nada vencendo nos próximos 3 dias.'));
    return sec;
  }

  function semDados() {
    var p = novo('div', 'ia-sem');
    if (st.erro === 'SEM_SQL') p.innerHTML = 'Falta instalar no Supabase a função <code>cortex_adm_resumo</code> (arquivo <code>sql/ADM_v1_0_resumo_marinalva.sql</code>). Depois disso, os números aparecem aqui.';
    else if (st.erro) p.textContent = st.erro;
    else p.textContent = 'Lendo os números…';
    return p;
  }

  /* ── a tela ── */
  function desenhar(main, R) {
    st.main = main; st.R = R;
    var P = contar(R || {}); P.pronto = !!(R && R.pronto); P.lidoEm = R && R.lidoEm;
    var D = st.dados && st.dados.ok ? st.dados : null;
    if (!D && !st.promessa) carregar(false); else if (!st.promessa && Date.now() - st.lidoEm >= VALIDADE) carregar(false);
    var rolou = window.scrollY;
    main.innerHTML = '';
    var raiz = novo('div', 'ia-raiz');
    if (window.ORQUIDEA) raiz.appendChild(novo('div', 'ia-orq', ORQUIDEA.svg({ classe: 'ia-orq-svg' })));
    var cont = novo('div', 'ia-cont');
    if (window.FRASES) cont.appendChild(fraseTopo(P));
    ['agenda', 'corte', 'falhas', 'cad', 'excl'].forEach(function (k) {
      if (R && R.erros && R.erros[k]) cont.appendChild(novo('div', 'in-erro', 'Não consegui ler ' + ({ agenda: 'a agenda', corte: 'o corte', falhas: 'as falhas', cad: 'os cadastros', excl: 'as exclusões' })[k] + ': ' + esc(R.erros[k])));
    });
    cont.appendChild(recepcao(P));
    cont.appendChild(semana(D));
    var grade = novo('div', 'ia-grade');
    grade.appendChild(psicologos(D));
    grade.appendChild(conveniencia(D));
    cont.appendChild(grade);
    cont.appendChild(contas(D));
    var rod = [];
    if (P.lidoEm) rod.push('pendências lidas às ' + hhmm(P.lidoEm));
    if (D && st.lidoEm) rod.push('números das ' + hhmm(st.lidoEm));
    if (rod.length) cont.appendChild(novo('p', 'ia-lido', rod.join(' · ')));
    raiz.appendChild(cont);
    main.appendChild(raiz);
    window.scrollTo(0, rolou);
  }

  return { ativo: ativo, desenhar: desenhar, recarregar: function () { return carregar(true); }, dados: function () { return st.dados; },
           sair: function () { st.dados = null; st.lidoEm = 0; st.erro = ''; } };
})();
