/* ═══════════════════════════════════════════════════════════════════
   LEV SOUL v1.0 — a aba Lev Soul do Cortex (05/11/2026)
   Abas: Funil · Assinantes · Agenda · Pendências · Empresas · Comissões · Visão do dono (só a administração).
   "Nova contratação" e "Meu link" ficam no alto da tela (e no Funil).
   Tudo pelas funções ls_cx_* do Supabase, com a sessão do PIN (o porteiro.js põe o x-cortex-token).
   O servidor decide o que cada um vê: comissões da secretária são só as dela; liberar, confirmar
   pagamento, encerrar pela casa e a Visão do dono são da administração.
   Agenda em modo transição (ls_agenda_modo): só avisa de quem já está no Lev Soul novo; ninguém é bloqueado.
   ═══════════════════════════════════════════════════════════════════ */
var LEVSOUL = (function () {
  'use strict';

  var SB = { url: 'https://xcucoryngkkuszztpxyq.supabase.co', key: 'sb_publishable_6ATQUvqBBRS5xx7jAYKlmw_2FwTuHG7' };
  var TZ = 'America/Sao_Paulo';
  var MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

  function novoEstado() {
    return { aba: 'funil', resumo: null, pedidoResumo: 0,
             funil: null, funilErro: '',
             ass: null, assErro: '', assFiltro: 'ativos', assBusca: '',
             agVista: null, alertas: null, alertasErro: '', trans: null, transErro: '',
             colab: null, colabErro: '', pedidos: null, pedidosErro: '', cadastros: null, cadErro: '',
             empresas: null, empErro: '', liberacoes: null, libErro: '', leads: null, leadsErro: '',
             comMes: null, com: null, comErro: '',
             dono: null, donoErro: '', equipe: null };
  }
  var st = novoEstado();

  /* ── rótulos ── */
  var SIT_CONVITE = { criado: ['Link gerado, não enviado', 'espera'], enviado: ['Enviado', 'espera'], aberto: ['Abriu o link', 'atencao'],
                      aceito: ['Aceitou, falta pagar', 'atencao'], pago: ['Pago', 'ok'], vencido: ['Link venceu', 'pend'], cancelado: ['Cancelado', 'espera'] };
  var SIT_ASS = { em_dia: ['Em dia', 'ok'], inadimplente: ['Em atraso', 'pend'], pausada: ['Pausada', 'espera'],
                  aguardando_pagamento: ['Aguardando pagamento', 'atencao'], cancelada: ['Cancelada', 'espera'], encerrada: ['Encerrada', 'espera'] };
  var SIT_COB = { aberta: ['Em aberto', 'atencao'], atrasada: ['Atrasada', 'pend'], paga: ['Paga', 'ok'], cancelada: ['Cancelada', 'espera'], estornada: ['Estornada', 'espera'] };
  var CHIP = {
    em_atraso: ['Mensalidade em atraso', 'pend', 'A mensalidade está em atraso. Enquanto não regularizar, a sessão sai no valor particular. Se a pessoa quiser, ajude a pagar antes da sessão.'],
    pausada: ['Lev Soul pausado', 'atencao', 'A assinatura está pausada. Durante a pausa a sessão não sai pelo Lev Soul: confira com a pessoa se ela quer retomar.'],
    aguardando_pagamento: ['Ativação não paga', 'atencao', 'A pessoa aceitou, mas a primeira mensalidade ainda não caiu. Peça o pagamento antes da sessão.'],
    sem_assinatura: ['Sem Lev Soul ativo', 'pend', 'Marcado como Lev Soul, mas a pessoa não tem assinatura ativa. Confira: contratar ou mudar para particular.'],
    sem_cadastro: ['Fora do Lev Soul novo', 'espera', 'A pessoa ainda não está no sistema novo do Lev Soul.'],
    fora_da_lista: ['Fora da lista da empresa', 'pend', 'Marcado pelo convênio da empresa, mas a pessoa não está liberada na lista de colaboradores.'],
    empresa_diferente: ['Convênio de outra empresa', 'atencao', 'O convênio do agendamento é de uma empresa diferente da que liberou a pessoa. Corrija o convênio no Feegow.']
  };
  var ETAPA = { sem_cpf: ['Falta CPF no Feegow', 'pend'], pronto: ['Pronto para migrar', 'atencao'], convidado: ['Convite enviado', 'espera'], no_sistema: ['No Lev Soul novo', 'ok'] };
  var SIT_COLAB = { aguardando_liberacao: ['Aguardando liberação', 'atencao'], liberado: ['Falta a 1ª mensagem', 'atencao'], mensagem_enviada: ['Mensagem enviada', 'espera'],
                    ativou: ['Ativou', 'ok'], em_uso: ['Em uso', 'ok'], sair: ['Pediu para sair', 'espera'], sem_resposta: ['Sem resposta', 'espera'],
                    negado: ['Negado', 'pend'], desligado: ['Desligado', 'espera'] };
  var SIT_PEDIDO = { aberta: ['Aberto', 'atencao'], em_analise: ['Em análise', 'espera'], aprovada: ['Aprovado', 'ok'], negada: ['Negado', 'pend'], concluida: ['Concluído', 'ok'] };
  var TIPO_PEDIDO = { estorno: 'Estorno', familia: 'Incluir alguém da família', remarcacao: 'Remarcação', pausa: 'Pausa', cancelamento: 'Cancelamento', outro: 'Outro assunto' };
  var LIGACAO = { ok: 'Ligado ao Feegow', sem_cpf: 'Sem CPF', nao_encontrado: 'CPF não achado no Feegow', duplicado: 'CPF em mais de uma ficha', pendente: 'Ligação pendente' };
  var PAPEL_COM = { trouxe: 'Trouxe', fechou: 'Fechou', trouxe_e_fechou: 'Trouxe e fechou', link_pessoal: 'Link pessoal' };
  var EST_COM = { aguardando: ['Aguardando o 2º mês', 'espera'], liberada: ['Liberada', 'atencao'], paga: ['Paga', 'ok'], anulada: ['Anulada', 'pend'] };
  var FINALIDADE = { convite: 'Link de contratação', pagamento_pendente: 'Pagamento pendente', boas_vindas: 'Boas-vindas', codigo: 'Código de acesso',
                     mensalidade_chegando: 'Mensalidade chegando', mensalidade_chegando_familia: 'Mensalidade chegando', mensalidade_vence_hoje: 'Mensalidade vence hoje',
                     mensalidade_em_aberto: 'Mensalidade em aberto' };
  var SIT_MSG = { fila: 'na fila', enviada: 'enviada', entregue: 'entregue', lida: 'lida', falha: 'falhou', suprimida: 'não enviada (SAIR)', cancelada: 'cancelada' };

  var ERROS = {
    SESSAO_INVALIDA: 'Sua sessão terminou. Entre de novo.',
    SO_ADMINISTRADOR: 'Esta ação é do acesso da administração.',
    NOME_INVALIDO: 'Escreva o nome completo.',
    WHATSAPP_INVALIDO: 'Confira o WhatsApp, com DDD.',
    CPF_INVALIDO: 'O CPF não confere. Confira os números.',
    INDICACAO_OBRIGATORIA: 'Pergunte se houve indicação e marque a resposta.',
    TRAZIDO_POR_INVALIDO: 'Escolha quem trouxe este cliente.',
    SO_VIGENTE_PAUSA: 'Só uma assinatura ativa pode pausar.',
    JA_PAUSOU: 'A pausa de 30 dias é uma só, e esta assinatura já usou.',
    ASSINATURA_JA_FECHADA: 'Esta assinatura já estava encerrada.',
    COBRANCA_NAO_ABERTA: 'Esta mensalidade não está mais em aberto.',
    PACIENTE_INEXISTENTE: 'Não achei essa ficha no Feegow. Confira o número.',
    EMPRESA_INATIVA: 'A empresa não está ativa.',
    COLABORADOR_NAO_LIBERADO: 'O administrador ainda não liberou este colaborador.',
    COLABORADOR_INEXISTENTE: 'Colaborador não encontrado.',
    LIBERACAO_JA_RESPONDIDA: 'Esta liberação já foi respondida.',
    RESPOSTA_OBRIGATORIA: 'Escreva a resposta para o cliente (pelo menos 3 letras).',
    CONVITE_INEXISTENTE: 'Convite não encontrado.',
    SEM_SQL: 'Esta parte ainda não foi instalada no servidor.'
  };

  /* ── utilidades ── */
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function bt(cls, html, fn) { var b = el('button', cls, html); b.type = 'button'; if (fn) b.addEventListener('click', fn); return b; }
  function esc(s) { var d = document.createElement('span'); d.textContent = s == null ? '' : String(s); return d.innerHTML; }
  function svg(d, t, w) { return window.moldura ? moldura.svg(d, t, w) : ''; }
  function ehAdm() { return typeof CU !== 'undefined' && !!CU && CU.admin === true; }
  function logado() { return !!(window.LAPI && LAPI.token && LAPI.token()); }
  function avisa(msg) { if (typeof toast === 'function') toast(msg, 'ok'); }
  function resumoTopo(t) { if (window.moldura) moldura.resumo('levsoul', t); }
  function raiz() {
    var s = document.getElementById('s-levsoul'); if (!s) return null;
    var r = s.querySelector(':scope > .ls-raiz');
    if (!r) { r = el('div', 'ls-raiz'); s.appendChild(r); }
    return r;
  }
  function naTela() { var s = document.getElementById('s-levsoul'); return !!(s && s.classList.contains('active')); }
  function hojeISO() { return new Date().toLocaleDateString('en-CA', { timeZone: TZ }); }
  function diasAte(iso) { if (!iso) return null; return Math.round((Date.parse(String(iso).slice(0, 10) + 'T12:00:00Z') - Date.parse(hojeISO() + 'T12:00:00Z')) / 864e5); }
  function brl(v) { return v == null ? '—' : 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function brlS(v) { return v == null ? '—' : 'R$ ' + Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 0 }); }
  function ddmm(iso) { var m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? m[3] + '/' + m[2] : '—'; }
  function ddmmaa(iso) { var m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? m[3] + '/' + m[2] + '/' + m[1].slice(2) : '—'; }
  function quando(ts) {
    if (!ts) return '—';
    var d = new Date(ts); if (isNaN(d)) return '—';
    var dia = d.toLocaleDateString('en-CA', { timeZone: TZ });
    var h = d.toLocaleTimeString('pt-BR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
    return (dia === hojeISO() ? 'hoje' : ddmm(dia)) + ' ' + h;
  }
  function tempo(min) {
    min = Number(min || 0);
    if (min < 60) return Math.max(min, 0) + ' min';
    if (min < 1440) return Math.floor(min / 60) + ' h';
    return Math.floor(min / 1440) + (min < 2880 ? ' dia' : ' dias');
  }
  function digitos(s) { return String(s == null ? '' : s).replace(/\D/g, ''); }
  function fone(w) {
    var d = digitos(w); if (d.length >= 12 && d.slice(0, 2) === '55') d = d.slice(2);
    if (d.length === 11) return '(' + d.slice(0, 2) + ') ' + d.slice(2, 7) + '-' + d.slice(7);
    if (d.length === 10) return '(' + d.slice(0, 2) + ') ' + d.slice(2, 6) + '-' + d.slice(6);
    return w || '—';
  }
  function cpfFmt(c) { var d = digitos(c); return d.length === 11 ? d.slice(0, 3) + '.' + d.slice(3, 6) + '.' + d.slice(6, 9) + '-' + d.slice(9) : (c || '—'); }
  function primeiro(n) { var p = String(n || '').trim().split(/\s+/)[0] || ''; return p.charAt(0).toUpperCase() + p.slice(1).toLowerCase(); }
  function tag(par, extra) { par = par || ['', 'espera']; return '<span class="ls-st ' + par[1] + '">' + esc(par[0]) + (extra ? ' <small>' + esc(extra) + '</small>' : '') + '</span>'; }
  function campo(rot, html, cls) { return '<label class="ls-campo' + (cls ? ' ' + cls : '') + '"><span>' + rot + '</span>' + html + '</label>'; }
  function aviso(alvo) { var a = el('p', 'ls-erro'); a.hidden = true; a.setAttribute('role', 'alert'); alvo.appendChild(a); return a; }
  function mostra(a, txt) { a.textContent = txt; a.hidden = !txt; }
  function rodape(P, botoes) { P.rodape.hidden = false; P.rodape.classList.add('fim'); P.rodape.innerHTML = ''; botoes.forEach(function (b) { if (b) P.rodape.appendChild(b); }); }
  function info(linhas) {
    var cx = el('div', 'ls-info');
    cx.innerHTML = linhas.filter(Boolean).map(function (x) { return '<div><span>' + esc(x[0]) + '</span><b>' + (x[2] ? x[1] : esc(x[1])) + '</b></div>'; }).join('');
    return cx;
  }
  function cab(P, selo, titulo, sub) {
    P.corpo.appendChild(el('div', 'pp-cab', (selo || '') + '<h2>' + esc(titulo) + '</h2>' + (sub ? '<span class="pp-sub">' + esc(sub) + '</span>' : '')));
  }
  function waLink(num, txt) { return 'https://wa.me/' + digitos(num) + (txt ? '?text=' + encodeURIComponent(txt) : ''); }
  function abrirWa(num, txt) { window.open(waLink(num, txt), '_blank', 'noopener'); }
  function copiar(txt) {
    function velho() {
      var t = document.createElement('textarea'); t.value = txt; t.setAttribute('readonly', ''); t.style.position = 'fixed'; t.style.opacity = '0';
      document.body.appendChild(t); t.select(); var ok = false; try { ok = document.execCommand('copy'); } catch (e) {} t.remove(); return ok;
    }
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(txt).then(function () { return true; }, function () { return velho(); });
    return Promise.resolve(velho());
  }
  function vazio(txt, erro) { return el('div', 'lista-vazio' + (erro ? ' erro' : ''), esc(txt)); }

  /* ── servidor ── */
  function rpc(fn, args) {
    return fetch(SB.url + '/rest/v1/rpc/' + fn, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SB.key, 'Authorization': 'Bearer ' + SB.key },
      body: JSON.stringify(args || {})
    }).then(function (r) {
      return r.text().then(function (t) {
        var j = null; try { j = t ? JSON.parse(t) : null; } catch (e) {}
        if (r.status === 404 || (j && j.code === 'PGRST202')) { var e1 = new Error('SEM_SQL'); e1.semSql = true; throw e1; }
        if (!r.ok) {
          var m = String((j && (j.message || j.hint)) || ('HTTP ' + r.status));
          if (/^SESSAO_INVALIDA/.test(m) && window.LAPI && LAPI.cair) LAPI.cair('Sua sessão terminou. Entre de novo.');
          var e2 = new Error(m); e2.codigo = (m.match(/^([A-Z][A-Z_]{3,})\b/) || [])[1] || ''; throw e2;
        }
        return j;
      });
    });
  }
  function erroTxt(er) {
    if (!er) return 'Algo deu errado.';
    if (er.semSql) return ERROS.SEM_SQL;
    if (er.codigo && ERROS[er.codigo]) return ERROS[er.codigo];
    var m = String(er.message || er), i = m.indexOf(': ');
    return i > 0 && /^[A-Z_]+$/.test(m.slice(0, i)) ? m.slice(i + 2) : m;
  }
  /* botão que chama o servidor: trava, mostra o erro no aviso, chama depois() no sucesso */
  function acao(b, a, fazer, depois) {
    if (b.disabled) return;
    b.disabled = true; if (a) mostra(a, '');
    fazer().then(function (j) { b.disabled = false; depois(j); }, function (er) { b.disabled = false; if (a) mostra(a, erroTxt(er)); else avisa(erroTxt(er)); });
  }

  /* ── abrir / sair / resumo ── */
  function abrir() {
    if (st.aba === 'dono' && !ehAdm()) st.aba = 'funil';
    desenhar();
    carregarResumo();
    carregarAba();
  }
  function sair() {
    st = novoEstado();
    var r = raiz(); if (r) r.innerHTML = '';
    contador(0);
  }
  function contador(n) {
    var c = document.getElementById('ls-b-pend'); if (!c) return;
    c.textContent = n > 0 ? String(n) : ''; c.hidden = !(n > 0);
  }
  var ultimoResumo = 0;
  function carregarResumo() {
    if (!logado()) return;
    var meu = ++st.pedidoResumo; ultimoResumo = Date.now();
    rpc('ls_cx_resumo').then(function (j) {
      if (meu !== st.pedidoResumo) return;
      var primeira = !st.resumo;
      st.resumo = j || {};
      contador(st.resumo.pendencias || 0);
      if (primeira && !st.agVista) st.agVista = st.resumo.modo === 'completo' ? 'avisos' : 'transicao';
      if (naTela()) { desenhar(); }
    }, function () { /* sem o resumo a aba funciona igual, só sem os números */ });
  }
  /* o número do menu: confere a cada 5 minutos enquanto alguém estiver no Cortex */
  setInterval(function () { if (logado() && Date.now() - ultimoResumo > 5 * 60000) carregarResumo(); }, 60000);
  setTimeout(function () { if (logado()) carregarResumo(); }, 4000);

  function carregarAba() {
    if (!logado()) return;
    var a = st.aba;
    if (a === 'funil') carregarFunil();
    else if (a === 'assinantes') carregarAss();
    else if (a === 'agenda') carregarAgenda();
    else if (a === 'pendencias') carregarPendencias();
    else if (a === 'empresas') carregarEmpresas();
    else if (a === 'comissoes') carregarComissoes();
    else if (a === 'dono') carregarDono();
  }
  function recarregar() { carregarResumo(); carregarAba(); }
  function redesenha() { if (naTela()) desenhar(); }
  function guarda(chave, chaveErro) {
    return [function (j) { st[chave] = j; st[chaveErro] = ''; redesenha(); }, function (er) { st[chaveErro] = erroTxt(er); redesenha(); }];
  }
  function carregarFunil() { var g = guarda('funil', 'funilErro'); rpc('ls_cx_funil').then(g[0], g[1]); }
  function carregarAss() { var g = guarda('ass', 'assErro'); rpc('ls_cx_assinaturas', { p_busca: null, p_situacao: null }).then(g[0], g[1]); }
  function carregarAgenda() {
    var g1 = guarda('alertas', 'alertasErro'), g2 = guarda('trans', 'transErro');
    rpc('ls_cx_agenda_alertas', { p_de: null, p_ate: null }).then(g1[0], g1[1]);
    rpc('ls_cx_transicao').then(g2[0], g2[1]);
  }
  function carregarPendencias() {
    var g1 = guarda('colab', 'colabErro'), g2 = guarda('pedidos', 'pedidosErro'), g3 = guarda('cadastros', 'cadErro');
    rpc('ls_cx_colaboradores_contatar').then(g1[0], g1[1]);
    rpc('ls_cx_solicitacoes', { p_so_abertas: true }).then(g2[0], g2[1]);
    rpc('ls_cx_cadastros_pendencias').then(g3[0], g3[1]);
  }
  function carregarEmpresas() {
    var g1 = guarda('empresas', 'empErro'), g2 = guarda('liberacoes', 'libErro'), g3 = guarda('leads', 'leadsErro');
    rpc('ls_cx_empresas').then(g1[0], g1[1]);
    rpc('ls_cx_liberacoes').then(g2[0], g2[1]);
    if (ehAdm()) rpc('ls_cx_leads_empresas', { p_so_abertos: true }).then(g3[0], g3[1]);
  }
  function carregarComissoes() {
    if (!st.comMes) st.comMes = hojeISO().slice(0, 7) + '-01';
    var mes = st.comMes;
    rpc('ls_cx_comissoes', { p_mes: mes }).then(function (j) { if (mes !== st.comMes) return; st.com = j; st.comErro = ''; redesenha(); },
      function (er) { st.comErro = erroTxt(er); redesenha(); });
  }
  function carregarDono() { if (!ehAdm()) return; var g = guarda('dono', 'donoErro'); rpc('ls_cx_visao_dono').then(g[0], g[1]); }
  function carregarEquipe() {
    if (st.equipe) return Promise.resolve(st.equipe);
    return rpc('ls_cx_equipe').then(function (j) { st.equipe = j; return j; }, function () { return { equipe: [], profissionais: [] }; });
  }

  /* ── tela ── */
  function desenhar() {
    var r = raiz(); if (!r) return;
    var rolagem = window.scrollY;
    r.innerHTML = '';
    var R = st.resumo || {};
    var abas = [['funil', 'Funil', R.funil, R.funil_atencao], ['assinantes', 'Assinantes', R.ativos, R.em_atraso], ['agenda', 'Agenda', R.agenda, R.agenda],
                ['pendencias', 'Pendências', (R.pedidos || 0) + (R.cadastros || 0) + (R.colaboradores || 0), 1],
                ['empresas', 'Empresas', (R.liberacoes || 0) + (R.leads || 0), 1], ['comissoes', 'Comissões']];
    if (ehAdm()) abas.push(['dono', 'Visão do dono']);
    var barra = el('div', 'seg ls-abas'); barra.setAttribute('role', 'tablist');
    abas.forEach(function (a) {
      var n = a[2] ? ' <span class="n' + (a[3] ? ' ls-urg' : '') + '">' + a[2] + '</span>' : '';
      var b = bt(a[0] === st.aba ? 'on' : '', esc(a[1]) + n, function () { if (st.aba !== a[0]) { st.aba = a[0]; desenhar(); carregarAba(); } });
      b.setAttribute('role', 'tab'); b.setAttribute('aria-selected', a[0] === st.aba ? 'true' : 'false');
      barra.appendChild(b);
    });
    r.appendChild(barra);
    if (st.aba === 'funil') telaFunil(r);
    else if (st.aba === 'assinantes') telaAss(r);
    else if (st.aba === 'agenda') telaAgenda(r);
    else if (st.aba === 'pendencias') telaPendencias(r);
    else if (st.aba === 'empresas') telaEmpresas(r);
    else if (st.aba === 'comissoes') telaComissoes(r);
    else telaDono(r);
    window.scrollTo(0, rolagem);
    resumoTopo(R.ativos != null ? R.ativos + (R.ativos === 1 ? ' assinante ativo' : ' assinantes ativos') +
      (R.pendencias ? ' · ' + R.pendencias + (R.pendencias === 1 ? ' coisa para resolver' : ' coisas para resolver') : ' · tudo em dia') : '');
  }

  /* ═══ Funil ═══ */
  function farol(c) {
    if (c.situacao === 'vencido') return 'pend';
    var m = Number(c.minutos_parado || 0);
    return m < 5 ? 'ok' : (m < 60 ? 'atencao' : 'pend');
  }
  function telaFunil(r) {
    var F = st.funil, lista = F ? (F.lista || []) : null;
    var wrap = el('div', 'duas-col');
    var sec = el('section', 'lista ls-lista'); sec.setAttribute('aria-label', 'Funil de contratação');
    var topo = el('div', 'lista-topo');
    topo.appendChild(el('span', 'lista-tit', lista ? (lista.length ? lista.length + (lista.length === 1 ? ' contratação em andamento' : ' contratações em andamento') : 'Funil') : 'Funil'));
    topo.appendChild(bt('btn btn-p btn-sm', 'Nova contratação', function () { contratar(); }));
    sec.appendChild(topo);
    var corpo = el('div', 'lista-corpo');
    if (st.funilErro) corpo.appendChild(vazio(st.funilErro, true));
    else if (!lista) corpo.appendChild(vazio('Carregando…'));
    else if (!lista.length) corpo.appendChild(el('div', 'lista-vazio', 'Nenhuma contratação em andamento.<br><small>Use <b>Nova contratação</b> quando a pessoa disser sim: o Cortex gera o link e manda pelo WhatsApp.</small>'));
    (lista || []).forEach(function (c) {
      var s = SIT_CONVITE[c.situacao] || [c.situacao, 'espera'];
      var meta = [s[0], c.porta === 'site' ? 'pelo site' : 'por ' + (c.gerado_por || 'secretária')];
      var l = bt('linha ls-l', '', function () { popConvite(c); });
      l.innerHTML = '<span class="h ls-farol ' + farol(c) + '" title="Tempo desde o último passo"><i></i>' + esc(tempo(c.minutos_parado)) + '</span>' +
        '<span class="q"><span class="nm">' + esc(c.nome || '—') + '</span><span class="mt">' + esc(meta.join(' · ')) + '</span></span>' +
        '<span class="dir">' + tag(s) + '<span class="tr">' + esc(fone(c.whatsapp)) + '</span></span>';
      corpo.appendChild(l);
    });
    sec.appendChild(corpo);
    wrap.appendChild(sec);
    var lado = el('div', 'lado');
    var p = el('section', 'painel');
    var k = (F && F.contadores) || {};
    p.appendChild(el('div', 'painel-cab', '<h2>Funil</h2><span>todas as contratações</span>'));
    var kp = el('div', 'lj-kpis ls-kpis');
    kp.innerHTML = '<div><span>Enviados</span><b>' + (F ? (k.enviado || 0) : '—') + '</b></div><div><span>Abriram</span><b>' + (F ? (k.aberto || 0) : '—') + '</b></div>' +
      '<div><span>Aceitaram</span><b>' + (F ? (k.aceito || 0) + (k.pago || 0) : '—') + '</b></div>';
    p.appendChild(el('div', 'lj-pad')).appendChild(kp);
    p.appendChild(el('p', 'ls-nota ls-pad', 'O quadradinho mostra o tempo desde o último passo: <b class="ls-c-ok">verde</b> até 5 min, <b class="ls-c-at">laranja</b> até 1 hora, <b class="ls-c-pe">vermelho</b> depois disso. Vermelho em quem abriu ou aceitou é hora de um toque de cuidado.'));
    lado.appendChild(p);
    lado.appendChild(painelMeuLink());
    wrap.appendChild(lado);
    r.appendChild(wrap);
  }
  function painelMeuLink() {
    var p = el('section', 'painel');
    p.appendChild(el('div', 'painel-cab', '<h2>Meu link</h2><span>para divulgar</span>'));
    var c = el('div', 'ls-pad ls-col');
    c.appendChild(el('p', 'ls-nota', 'Quem assinar sozinho pelo seu link conta como seu, com 100% da comissão da primeira mensalidade.'));
    c.appendChild(bt('btn btn-s', 'Ver e copiar meu link', function () { meuLink(); }));
    p.appendChild(c);
    return p;
  }
  function meuLink() {
    if (!window.moldura) return;
    var P = moldura.pop({ largura: '480px', titulo: 'Lev Soul' });
    cab(P, '', 'Meu link', 'Divulgue à vontade: Instagram, status, conversa.');
    var cx = el('div', 'ls-link', 'Carregando…'); P.corpo.appendChild(cx);
    var a = aviso(P.corpo);
    rodape(P, [bt('btn btn-s', 'Fechar', function () { P.fechar(); })]);
    rpc('ls_cx_meu_link').then(function (j) {
      cx.textContent = j.link;
      rodape(P, [bt('btn btn-s', 'Fechar', function () { P.fechar(); }),
                 bt('btn btn-p', 'Copiar link', function () { copiar(j.link).then(function (ok) { avisa(ok ? 'Link copiado.' : 'Não consegui copiar. Selecione e copie à mão.'); }); })]);
    }, function (er) { cx.textContent = ''; mostra(a, erroTxt(er)); });
  }

  function popConvite(c) {
    if (!window.moldura) return;
    var P = moldura.pop({ largura: '540px', titulo: 'Contratação' });
    var s = SIT_CONVITE[c.situacao] || [c.situacao, 'espera'];
    cab(P, tag(s), c.nome || '—', fone(c.whatsapp) + (c.porta === 'site' ? ' · veio pelo site' : ''));
    P.corpo.appendChild(info([
      ['Parado há', tempo(c.minutos_parado)],
      ['Último passo', quando(c.ultimo_passo_em)],
      ['Gerado por', c.porta === 'site' ? 'a própria pessoa, no site' : (c.gerado_por || '—')],
      ['Quem trouxe', c.trazido_por === 'fora' ? 'veio de fora' : (c.trazido_por || '—')],
      ['Link vale até', quando(c.vence_em)],
      c.assinatura_situacao ? ['Assinatura', (SIT_ASS[c.assinatura_situacao] || [c.assinatura_situacao])[0]] : null
    ]));
    var link = 'levsoul.com.br/c/' + c.token;
    P.corpo.appendChild(el('div', 'ls-link', esc(link)));
    var dica = { criado: 'O link foi gerado mas não foi enviado. Envie agora pelo robô ou copie a mensagem.',
                 enviado: 'A mensagem chegou; a pessoa ainda não abriu o link.',
                 aberto: 'A pessoa abriu o link e parou na conferência. Um toque de cuidado pelo WhatsApp costuma destravar.',
                 aceito: 'A pessoa aceitou e falta o pagamento. O robô lembra 30 minutos depois do aceite; se continuar parado, vale um toque.',
                 vencido: 'O link venceu. Se a pessoa ainda quiser, faça uma nova contratação.' }[c.situacao];
    if (dica) P.corpo.appendChild(el('p', 'ls-nota', esc(dica)));
    var a = aviso(P.corpo);
    var vivo = ['criado', 'enviado', 'aberto'].indexOf(c.situacao) >= 0;
    var bCanc = vivo || c.situacao === 'vencido' ? bt('btn btn-s', 'Cancelar', function () {
      if (!confirm('Cancelar a contratação de ' + (c.nome || '') + '? O link deixa de funcionar.')) return;
      acao(bCanc, a, function () { return rpc('ls_cx_convite_cancelar', { p_convite_id: c.convite_id, p_motivo: 'cancelado no Cortex' }); },
        function () { P.fechar(); avisa('Contratação cancelada.'); recarregar(); });
    }) : null;
    var bCop = bt('btn btn-s', 'Copiar mensagem', function () {
      acao(bCop, a, function () { return rpc('ls_cx_mensagem_convite', { p_nome: c.nome, p_familia: [], p_token: c.token }); },
        function (txt) { copiar(txt).then(function (ok) { avisa(ok ? 'Mensagem copiada.' : 'Não consegui copiar.'); }); });
    });
    var bRobo = vivo ? bt('btn btn-p', c.situacao === 'criado' ? 'Enviar pelo robô' : 'Reenviar pelo robô', function () {
      acao(bRobo, a, function () { return rpc('ls_cx_convite_enviar', { p_convite_id: c.convite_id, p_modo: 'robo' }); },
        function () { P.fechar(); avisa('Na fila do robô. Sai em até 1 minuto (das 8h às 20h).'); recarregar(); });
    }) : null;
    var bZap = bt('btn btn-s', 'Abrir conversa', function () { abrirWa(c.whatsapp); });
    rodape(P, [bCanc, bZap, bCop, bRobo]);
  }

  /* ── Nova contratação ── */
  function contratar(pre) {
    if (!window.moldura) return;
    pre = pre || {};
    var P = moldura.pop({ largura: '600px', titulo: 'Nova contratação', classe: 'ls-pop' });
    cab(P, '', 'Nova contratação', 'Preencha com a pessoa ainda na conversa.');
    var f = el('div', 'ls-form');
    f.innerHTML =
      campo('Nome completo do titular *', '<input type="text" class="fc" id="ls-c-nome" maxlength="120" autocomplete="off" value="' + esc(pre.nome || '') + '">') +
      '<div class="ls-dupla">' + campo('WhatsApp com DDD *', '<input type="tel" class="fc" id="ls-c-zap" inputmode="tel" autocomplete="off" placeholder="(62) 99999-9999" value="' + esc(pre.whatsapp ? fone(pre.whatsapp) : '') + '">') +
      campo('CPF <small>(se tiver à mão)</small>', '<input type="text" class="fc" id="ls-c-cpf" inputmode="numeric" autocomplete="off" value="' + esc(pre.cpf ? cpfFmt(pre.cpf) : '') + '">') + '</div>' +
      '<div class="ls-campo"><span>Família <small>(sem limite de pessoas)</small></span><div class="ls-fam" id="ls-c-fam"></div>' +
      '<button type="button" class="btn-claro" id="ls-c-fam-mais">+ adicionar alguém da família</button></div>' +
      '<div class="ls-dupla">' + campo('Quem trouxe este cliente? *', '<select class="fc" id="ls-c-trouxe"><option value="">Eu mesma</option><option value="fora">Veio de fora</option></select>') +
      campo('Profissional <small>(opcional)</small>', '<select class="fc" id="ls-c-prof"><option value="">—</option></select>') + '</div>' +
      '<div class="ls-campo"><span>Teve indicação? *</span><div class="seg ls-sn" id="ls-c-ind"><button type="button" data-v="nao">Não</button><button type="button" data-v="sim">Sim</button></div></div>' +
      '<div class="ls-campo" id="ls-c-ind-de" hidden>' + '<input type="text" class="fc" id="ls-c-ind-nome" maxlength="120" autocomplete="off" placeholder="De quem? (nome de quem indicou)">' + '</div>' +
      '<p class="ls-alerta">Pergunte <b>sempre</b> se alguém indicou. Indicação que não for registrada aqui e a casa descobrir depois: perde-se 100% da comissão desta contratação e 100% da próxima. Honestidade é regra.</p>' +
      campo('Observações internas <small>(a pessoa não vê)</small>', '<textarea class="fc ls-ta" id="ls-c-obs" maxlength="500"></textarea>');
    P.corpo.appendChild(f);
    var a = aviso(P.corpo);
    var fam = f.querySelector('#ls-c-fam');
    function linhaFam(n, par) {
      var d = el('div', 'ls-fam-l');
      d.innerHTML = '<input type="text" class="fc" placeholder="Nome" maxlength="120" value="' + esc(n || '') + '"><input type="text" class="fc" placeholder="Parentesco (filho, esposa…)" maxlength="40" value="' + esc(par || '') + '">';
      d.appendChild(bt('btn-ic', svg('M6 6l12 12M18 6 6 18', 16, 2), function () { d.remove(); })).setAttribute('aria-label', 'Tirar');
      fam.appendChild(d);
      d.querySelector('input').focus();
    }
    f.querySelector('#ls-c-fam-mais').addEventListener('click', function () { linhaFam(); });
    var ind = null;
    f.querySelectorAll('#ls-c-ind button').forEach(function (b) {
      b.addEventListener('click', function () {
        ind = b.getAttribute('data-v');
        f.querySelectorAll('#ls-c-ind button').forEach(function (x) { x.classList.toggle('on', x === b); });
        f.querySelector('#ls-c-ind-de').hidden = ind !== 'sim';
        if (ind === 'sim') f.querySelector('#ls-c-ind-nome').focus();
      });
    });
    carregarEquipe().then(function (q) {
      var s1 = f.querySelector('#ls-c-trouxe'), s2 = f.querySelector('#ls-c-prof');
      var eu = q.eu && q.eu.id;
      (q.equipe || []).forEach(function (u) { if (u.id !== eu) s1.insertBefore(el('option', '', esc(u.nome)), s1.lastChild).value = u.id; });
      (q.profissionais || []).forEach(function (p) { var o = el('option', '', esc(p.nome)); o.value = p.id; s2.appendChild(o); });
      if (!(q.profissionais || []).length) s2.closest('.ls-campo').hidden = true;
    });
    var ok = bt('btn btn-p', 'Gerar o link', enviar);
    rodape(P, [bt('btn btn-s', 'Cancelar', function () { P.fechar(); }), ok]);
    setTimeout(function () { var i = f.querySelector('#ls-c-nome'); if (i && !i.value) i.focus(); }, 30);
    function enviar() {
      var nome = f.querySelector('#ls-c-nome').value.trim(), zap = f.querySelector('#ls-c-zap').value, cpf = f.querySelector('#ls-c-cpf').value;
      if (nome.split(/\s+/).length < 2) { mostra(a, 'Escreva o nome completo do titular (nome e sobrenome).'); f.querySelector('#ls-c-nome').focus(); return; }
      var dz = digitos(zap); if (dz.length < 10) { mostra(a, 'Confira o WhatsApp, com DDD.'); f.querySelector('#ls-c-zap').focus(); return; }
      if (digitos(cpf) && digitos(cpf).length !== 11) { mostra(a, 'O CPF tem 11 números. Se não tiver à mão, deixe em branco.'); return; }
      if (!ind) { mostra(a, 'Pergunte se houve indicação e marque Não ou Sim.'); return; }
      var familia = [];
      fam.querySelectorAll('.ls-fam-l').forEach(function (d) {
        var i = d.querySelectorAll('input'); var n = i[0].value.trim();
        if (n.length >= 2) familia.push({ nome: n, parentesco: i[1].value.trim() || null });
      });
      var p = { nome: nome, whatsapp: zap, cpf: digitos(cpf) || null, familia: familia,
                trazido_por: f.querySelector('#ls-c-trouxe').value || null,
                teve_indicacao: ind === 'sim', indicacao: ind === 'sim' ? (f.querySelector('#ls-c-ind-nome').value.trim() || null) : null,
                profissional_id: f.querySelector('#ls-c-prof').value || null,
                observacoes: f.querySelector('#ls-c-obs').value.trim() || null };
      acao(ok, a, function () { return rpc('ls_cx_convite_criar', { p: p }); }, function (j) { passoEnvio(P, j, nome); });
    }
  }
  function passoEnvio(P, j, nome) {
    P.corpo.innerHTML = '';
    cab(P, tag(['Link pronto', 'ok']), primeiro(nome) + ' já pode ativar', 'Agora é só mandar a mensagem. Confira antes:');
    P.corpo.appendChild(el('div', 'ls-msg', esc(j.mensagem).replace(/\n/g, '<br>')));
    P.corpo.appendChild(el('p', 'ls-nota', '<b>Pelo robô</b>: sai do WhatsApp oficial da casa, com o botão "Conferir e ativar" (das 8h às 20h). ' +
      '<b>Eu mesma</b>: copia a mensagem e abre a conversa no seu WhatsApp; é só colar e enviar.'));
    var a = aviso(P.corpo);
    var bRobo = bt('btn btn-p', 'Enviar pelo robô', function () {
      acao(bRobo, a, function () { return rpc('ls_cx_convite_enviar', { p_convite_id: j.convite_id, p_modo: 'robo' }); },
        function () { P.fechar(); avisa('Enviado para o robô. Chega em até 1 minuto.'); st.aba = 'funil'; recarregar(); if (naTela()) desenhar(); });
    });
    var bEu = bt('btn btn-s', 'Eu mesma envio', function () {
      abrirWa(j.whatsapp, j.mensagem);   /* abre já com o texto; copiar é só garantia */
      copiar(j.mensagem);
      acao(bEu, a, function () { return rpc('ls_cx_convite_enviar', { p_convite_id: j.convite_id, p_modo: 'manual' }); },
        function () { P.fechar(); avisa('Conversa aberta com a mensagem pronta. Confira se foi enviada.'); st.aba = 'funil'; recarregar(); });
    });
    rodape(P, [bt('btn btn-s', 'Depois', function () { P.fechar(); recarregar(); }), bEu, bRobo]);
  }

  /* ═══ Assinantes ═══ */
  var FILTROS_ASS = [['ativos', 'Ativos'], ['atraso', 'Em atraso'], ['vencem', 'Vencem em 3 dias'], ['aguardando', 'Aguardando pagamento'], ['pausadas', 'Pausadas'], ['encerradas', 'Encerradas']];
  function passaAss(a, f) {
    if (f === 'ativos') return ['em_dia', 'inadimplente', 'pausada', 'aguardando_pagamento'].indexOf(a.situacao) >= 0;
    if (f === 'atraso') return a.situacao === 'inadimplente';
    if (f === 'vencem') { var d = diasAte(a.proximo_vencimento); return a.situacao === 'em_dia' && d != null && d >= 0 && d <= 3; }
    if (f === 'aguardando') return a.situacao === 'aguardando_pagamento';
    if (f === 'pausadas') return a.situacao === 'pausada';
    if (f === 'encerradas') return a.situacao === 'cancelada' || a.situacao === 'encerrada';
    return true;
  }
  function buscaAss(a, q) {
    if (!q) return true;
    var d = digitos(q);
    return String(a.titular_nome || '').toLowerCase().indexOf(q.toLowerCase()) >= 0 ||
      (d.length >= 3 && (digitos(a.titular_cpf).indexOf(d) >= 0 || digitos(a.titular_whatsapp).indexOf(d) >= 0));
  }
  function telaAss(r) {
    var L = st.ass;
    var wrap = el('div', 'duas-col');
    var sec = el('section', 'lista ls-lista'); sec.setAttribute('aria-label', 'Assinantes');
    var topo = el('div', 'lista-topo');
    var cont = {}; FILTROS_ASS.forEach(function (f) { cont[f[0]] = (L || []).filter(function (a) { return passaAss(a, f[0]); }).length; });
    var seg = el('div', 'seg');
    FILTROS_ASS.forEach(function (f) {
      if (f[0] !== 'ativos' && L && !cont[f[0]] && st.assFiltro !== f[0]) return;   /* filtro vazio some, para a barra caber */
      seg.appendChild(bt(st.assFiltro === f[0] ? 'on' : '', esc(f[1]) + (L ? ' <span class="n' + (f[0] === 'atraso' && cont[f[0]] ? ' ls-urg' : '') + '">' + cont[f[0]] + '</span>' : ''),
        function () { st.assFiltro = f[0]; desenhar(); }));
    });
    topo.appendChild(seg);
    var busca = el('input', 'fc ls-busca'); busca.type = 'search'; busca.placeholder = 'Buscar nome, CPF ou WhatsApp'; busca.value = st.assBusca;
    busca.setAttribute('aria-label', 'Buscar assinante');
    topo.appendChild(busca);
    sec.appendChild(topo);
    var corpo = el('div', 'lista-corpo');
    function pinta() {
      corpo.innerHTML = '';
      if (st.assErro) { corpo.appendChild(vazio(st.assErro, true)); return; }
      if (!L) { corpo.appendChild(vazio('Carregando…')); return; }
      var vis = L.filter(function (a) { return passaAss(a, st.assBusca ? 'todos' : st.assFiltro) && buscaAss(a, st.assBusca); });
      if (!vis.length) corpo.appendChild(vazio(st.assBusca ? 'Ninguém com esse nome, CPF ou WhatsApp.' : (L.length ? 'Ninguém neste filtro.' : 'Ainda não há assinantes no Lev Soul novo.')));
      vis.forEach(function (a) { corpo.appendChild(linhaAss(a)); });
    }
    busca.addEventListener('input', function () { st.assBusca = busca.value.trim(); pinta(); });
    pinta();
    sec.appendChild(corpo);
    wrap.appendChild(sec);
    wrap.appendChild(ladoAss(L));
    r.appendChild(wrap);
  }
  function linhaAss(a) {
    var s = SIT_ASS[a.situacao] || [a.situacao, 'espera'];
    var meta = [a.membros > 1 ? a.membros + ' pessoas' : 'só o titular', a.meio_pagamento === 'cartao' ? 'cartão' : (a.meio_pagamento === 'pix' ? 'Pix' : null)];
    if (a.ligacao_feegow && a.ligacao_feegow !== 'ok') meta.push('sem ligação com o Feegow');
    var dir = tag(s);
    if (a.situacao === 'inadimplente') dir += '<span class="tr laranja">' + esc(a.dias_atraso + (a.dias_atraso === 1 ? ' dia' : ' dias') + ' · ' + brl(a.valor_aberto)) + '</span>';
    else if (a.proximo_vencimento && ['em_dia', 'aguardando_pagamento'].indexOf(a.situacao) >= 0) dir += '<span class="tr">vence ' + esc(ddmm(a.proximo_vencimento)) + '</span>';
    else if (a.situacao === 'pausada' && a.pausada_ate) dir += '<span class="tr">até ' + esc(ddmm(a.pausada_ate)) + '</span>';
    var l = bt('linha ls-l', '', function () { popAss(a.id); });
    l.innerHTML = '<span class="q"><span class="nm">' + esc(a.titular_nome) + '</span><span class="mt">' + esc(meta.filter(Boolean).join(' · ')) + '</span></span><span class="dir">' + dir + '</span>';
    return l;
  }
  function ladoAss(L) {
    var lado = el('div', 'lado');
    var ativos = 0, atraso = 0, aberto = 0;
    (L || []).forEach(function (a) {
      if (['em_dia', 'inadimplente', 'pausada'].indexOf(a.situacao) >= 0) ativos++;
      if (a.situacao === 'inadimplente') { atraso++; aberto += Number(a.valor_aberto || 0); }
    });
    var p = el('section', 'painel');
    p.appendChild(el('div', 'lj-grande com-linha', '<h2 class="lj-grande-rot">Assinantes ativos</h2><span class="lj-grande-n">' + (L ? ativos : '—') + '</span>' +
      (L && atraso ? '<span class="lj-grande-l2 ls-c-pe">' + atraso + (atraso === 1 ? ' em atraso' : ' em atraso') + ', ' + esc(brl(aberto)) + ' em aberto</span>' : '')));
    lado.appendChild(p);
    var prox = (L || []).filter(function (a) { var d = diasAte(a.proximo_vencimento); return a.situacao === 'inadimplente' || (a.situacao === 'em_dia' && d != null && d <= 3); })
      .sort(function (x, y) { return String(x.proximo_vencimento).localeCompare(String(y.proximo_vencimento)); });
    var n = el('section', 'painel');
    n.appendChild(el('div', 'painel-cab', '<h2>Mensalidades para acompanhar</h2><span>atrasadas e as dos próximos 3 dias</span>'));
    if (!L) n.appendChild(vazio('Carregando…'));
    else if (!prox.length) n.appendChild(vazio('Nada atrasado nem vencendo nos próximos dias.'));
    prox.slice(0, 12).forEach(function (a) {
      var atr = a.situacao === 'inadimplente';
      n.appendChild(bt('ls-item', '<span class="d' + (atr ? ' ls-c-pe' : '') + '">' + esc(ddmm(a.proximo_vencimento)) + '</span><span class="t">' + esc(a.titular_nome) +
        (atr ? ' <small>' + a.dias_atraso + (a.dias_atraso === 1 ? ' dia' : ' dias') + '</small>' : '') + '</span><span class="v">' + esc(brl(a.valor_aberto)) + '</span>', function () { popAss(a.id); }));
    });
    n.appendChild(el('p', 'ls-nota ls-pad ls-pad-t', 'Os lembretes saem sozinhos às 9h (3 dias antes, no dia e depois). Quem paga no cartão automático só recebe aviso se a cobrança falhar.'));
    lado.appendChild(n);
    return lado;
  }

  function popAss(id) {
    if (!window.moldura) return;
    var P = moldura.pop({ largura: '640px', titulo: 'Assinante', classe: 'ls-pop' });
    P.corpo.appendChild(vazio('Carregando…'));
    rpc('ls_cx_assinatura', { p_id: id }).then(function (d) { montarAss(P, d); }, function (er) { P.corpo.innerHTML = ''; P.corpo.appendChild(vazio(erroTxt(er), true)); });
  }
  function montarAss(P, d) {
    var A = d.assinatura || {};
    P.corpo.innerHTML = '';
    var s = SIT_ASS[A.situacao] || [A.situacao, 'espera'];
    cab(P, tag(s), A.titular_nome || '—', fone(A.titular_whatsapp) + (A.titular_cpf ? ' · CPF ' + cpfFmt(A.titular_cpf) : ''));
    P.corpo.appendChild(info([
      ['Ativa desde', A.ativa_desde ? ddmmaa(A.ativa_desde) : 'ainda não ativou'],
      ['Próxima mensalidade', A.proximo_vencimento ? ddmm(A.proximo_vencimento) + ' · ' + brl(A.valor_aberto) + (A.dias_atraso ? ' · ' + A.dias_atraso + ' dias em atraso' : '') : '—'],
      ['Como paga', A.meio_pagamento === 'cartao' ? 'Cartão no automático' : (A.meio_pagamento === 'pix' ? 'Pix todo mês' : '—')],
      A.pausada_ate ? ['Pausada até', ddmmaa(A.pausada_ate)] : null,
      ['Ficha no Feegow', LIGACAO[A.ligacao_feegow] || A.ligacao_feegow || '—'],
      ['Entrou', (A.porta === 'site' ? 'pelo site' : 'pela secretaria') + (A.fechado_por ? ' · fechou ' + A.fechado_por : '')]
    ]));
    /* família */
    var m = d.membros || [];
    var bm = el('div', 'ls-bloco'); bm.appendChild(el('h3', 'ls-sub', 'Quem está no Lev Soul (' + m.length + ')'));
    var lm = el('div', 'ls-mini');
    m.forEach(function (x) {
      lm.appendChild(el('div', 'ls-mini-l', '<span class="t">' + esc(x.nome) + ' <small>' + esc(x.papel === 'titular' ? 'titular' : (x.parentesco || 'dependente')) + (x.menor ? ' · menor' : '') + '</small></span>' +
        '<span class="v ' + (x.ligacao_feegow === 'ok' ? 'ls-c-ok' : 'ls-c-at') + '">' + esc(x.ligacao_feegow === 'ok' ? 'Feegow ok' : (LIGACAO[x.ligacao_feegow] || 'sem ficha')) + '</span>'));
    });
    bm.appendChild(lm); P.corpo.appendChild(bm);
    /* mensalidades */
    var cobs = d.cobrancas || [];
    var bc = el('div', 'ls-bloco'); bc.appendChild(el('h3', 'ls-sub', 'Mensalidades'));
    var lc = el('div', 'ls-mini');
    if (!cobs.length) lc.appendChild(el('div', 'ls-mini-l', '<span class="t">Nenhuma ainda.</span>'));
    cobs.forEach(function (c) {
      var sc = SIT_COB[c.situacao] || [c.situacao, 'espera'];
      var linha = el('div', 'ls-mini-l', '<span class="t">' + (c.numero === 1 ? 'Ativação' : c.numero + 'ª mensalidade') + ' <small>vence ' + esc(ddmm(c.vencimento)) +
        (c.paga_em ? ' · paga ' + esc(quando(c.paga_em)) : '') + (c.erro && c.situacao !== 'paga' ? ' · ' + esc(c.erro) : '') + '</small></span>' +
        '<span class="v">' + esc(brl(c.valor)) + ' ' + tag(sc) + '</span>');
      if (ehAdm() && (c.situacao === 'aberta' || c.situacao === 'atrasada')) {
        linha.appendChild(bt('btn btn-s btn-sm', 'Recebi', function () { confirmarPagamento(c, A, function () { popAss(A.id); recarregar(); }); }));
      }
      lc.appendChild(linha);
    });
    bc.appendChild(lc); P.corpo.appendChild(bc);
    /* mensagens */
    var msgs = (d.mensagens || []).slice(0, 6);
    if (msgs.length) {
      var bg = el('div', 'ls-bloco'); bg.appendChild(el('h3', 'ls-sub', 'Mensagens do robô'));
      var lg = el('div', 'ls-mini');
      msgs.forEach(function (x) {
        lg.appendChild(el('div', 'ls-mini-l', '<span class="t">' + esc(FINALIDADE[x.finalidade] || x.finalidade) + '</span><span class="v' + (x.situacao === 'falha' ? ' ls-c-pe' : '') + '">' +
          esc((SIT_MSG[x.situacao] || x.situacao) + ' · ' + quando(x.enviada_em || x.agendada_para)) + '</span>'));
      });
      bg.appendChild(lg); P.corpo.appendChild(bg);
    }
    if (d.comissoes && d.comissoes.length) {
      var bk = el('div', 'ls-bloco'); bk.appendChild(el('h3', 'ls-sub', 'Comissões'));
      var lk = el('div', 'ls-mini');
      d.comissoes.forEach(function (k) {
        lk.appendChild(el('div', 'ls-mini-l', '<span class="t">' + esc(k.usuario || '—') + ' <small>' + esc(PAPEL_COM[k.papel] || k.papel) + ' · ' + Number(k.percentual) + '%</small></span><span class="v">' +
          esc(brl(k.valor)) + ' ' + tag(EST_COM[k.estado]) + '</span>'));
      });
      bk.appendChild(lk); P.corpo.appendChild(bk);
    }
    var a = aviso(P.corpo);
    var ativa = ['em_dia', 'inadimplente', 'pausada', 'aguardando_pagamento'].indexOf(A.situacao) >= 0;
    var bPausa = A.situacao === 'em_dia' || A.situacao === 'inadimplente' ? bt('btn btn-s', 'Pausar 30 dias', function () {
      if (!confirm('Pausar o Lev Soul de ' + primeiro(A.titular_nome) + ' por 30 dias? A mensalidade empurra 30 dias e a pausa é uma só.')) return;
      acao(bPausa, a, function () { return rpc('ls_cx_assinatura_pausar', { p_id: A.id, p_dias: 30 }); },
        function (j) { avisa('Pausada até ' + ddmm(j.pausada_ate) + '.'); popAss(A.id); recarregar(); });
    }) : null;
    var bEnc = ativa ? bt('btn btn-s', 'Encerrar', function () { encerrar(A); }) : null;
    var bLink = A.situacao === 'aguardando_pagamento' && d.convite ? bt('btn btn-s', 'Copiar link de pagamento', function () {
      copiar(d.convite.link).then(function (ok) { avisa(ok ? 'Link copiado.' : 'Não consegui copiar.'); });
    }) : null;
    rodape(P, [bEnc, bPausa, bLink, bt('btn btn-s', 'Abrir conversa', function () { abrirWa(A.titular_whatsapp); }), bt('btn btn-p', 'Fechar', function () { P.fechar(); })]);
  }
  function confirmarPagamento(c, A, depois) {
    var P = moldura.pop({ largura: '440px', titulo: 'Registrar pagamento', sobre: true });
    cab(P, '', brl(c.valor), (c.numero === 1 ? 'Ativação' : c.numero + 'ª mensalidade') + ' de ' + (A.titular_nome || ''));
    var f = el('div', 'ls-form');
    f.innerHTML = campo('Como pagou', '<select class="fc" id="ls-p-meio"><option value="pix">Pix</option><option value="cartao">Cartão</option><option value="manual">Outro (dinheiro, acerto)</option></select>') +
      campo('Observação (opcional)', '<input type="text" class="fc" id="ls-p-obs" maxlength="200" autocomplete="off">');
    P.corpo.appendChild(f);
    P.corpo.appendChild(el('p', 'ls-nota', 'Use só para o que foi pago fora da plataforma. Ao registrar a ativação, a assinatura ativa e o robô manda as boas-vindas.'));
    var a = aviso(P.corpo);
    var ok = bt('btn btn-p', 'Registrar pagamento', function () {
      acao(ok, a, function () { return rpc('ls_cx_cobranca_confirmar', { p_cobranca_id: c.id, p_meio: f.querySelector('#ls-p-meio').value, p_obs: f.querySelector('#ls-p-obs').value.trim() || null }); },
        function () { P.fechar(); avisa('Pagamento registrado.'); depois(); });
    });
    rodape(P, [bt('btn btn-s', 'Cancelar', function () { P.fechar(); }), ok]);
  }
  function encerrar(A) {
    var P = moldura.pop({ largura: '480px', titulo: 'Encerrar assinatura', sobre: true });
    cab(P, '', 'Encerrar o Lev Soul de ' + primeiro(A.titular_nome), 'Antes de encerrar, ofereça a pausa de 30 dias: muita gente volta.');
    var f = el('div', 'ls-form');
    f.innerHTML = campo('Quem pediu', '<select class="fc" id="ls-e-tipo"><option value="cancelada">A própria pessoa pediu</option>' +
      (ehAdm() ? '<option value="encerrada">A casa encerrou</option>' : '') + '</select>') +
      campo('O que pesou na decisão?', '<select class="fc" id="ls-e-mot"><option>Preço apertou</option><option>A vida está corrida</option><option>Não estou usando</option>' +
        '<option>Momento da terapia mudou</option><option>Prefere não dizer</option><option>Outro</option></select>') +
      campo('Detalhe (opcional)', '<input type="text" class="fc" id="ls-e-obs" maxlength="200" autocomplete="off">');
    P.corpo.appendChild(f);
    var a = aviso(P.corpo);
    var ok = bt('btn btn-d', 'Encerrar', function () {
      var mot = f.querySelector('#ls-e-mot').value + (f.querySelector('#ls-e-obs').value.trim() ? ': ' + f.querySelector('#ls-e-obs').value.trim() : '');
      acao(ok, a, function () { return rpc('ls_cx_assinatura_encerrar', { p_id: A.id, p_tipo: f.querySelector('#ls-e-tipo').value, p_motivo: mot }); },
        function () { P.fechar(); avisa('Assinatura encerrada.'); popAss(A.id); recarregar(); });
    });
    rodape(P, [bt('btn btn-s', 'Voltar', function () { P.fechar(); }), ok]);
  }

  /* ═══ Agenda ═══ */
  function telaAgenda(r) {
    var modo = (st.resumo && st.resumo.modo) || (st.trans && st.trans.modo) || 'transicao';
    if (!st.agVista) st.agVista = modo === 'completo' ? 'avisos' : 'transicao';
    var wrap = el('div', 'duas-col');
    var sec = el('section', 'lista ls-lista');
    var topo = el('div', 'lista-topo');
    var nA = st.alertas ? st.alertas.length : null, T = st.trans, kT = (T && T.contadores) || {};
    var seg = el('div', 'seg');
    [['avisos', 'Consultas a conferir', nA], ['transicao', 'Transição', T ? kT.total : null]].forEach(function (v) {
      seg.appendChild(bt(st.agVista === v[0] ? 'on' : '', esc(v[1]) + (v[2] != null ? ' <span class="n' + (v[0] === 'avisos' && v[2] ? ' ls-urg' : '') + '">' + v[2] + '</span>' : ''),
        function () { st.agVista = v[0]; desenhar(); }));
    });
    topo.appendChild(seg);
    topo.appendChild(el('span', 'ls-modo ' + (modo === 'completo' ? 'completo' : ''), modo === 'completo' ? 'Modo completo' : 'Modo transição'));
    sec.appendChild(topo);
    var corpo = el('div', 'lista-corpo');
    if (st.agVista === 'avisos') {
      if (st.alertasErro) corpo.appendChild(vazio(st.alertasErro, true));
      else if (!st.alertas) corpo.appendChild(vazio('Carregando…'));
      else if (!st.alertas.length) corpo.appendChild(el('div', 'lista-vazio', 'Nenhuma consulta Lev Soul para conferir nos próximos 14 dias.' +
        (modo !== 'completo' ? '<br><small>Na transição, só aparece quem já está no Lev Soul novo. Os pacientes atuais não são bloqueados.</small>' : '')));
      (st.alertas || []).forEach(function (x) {
        var c = CHIP[x.chip] || [x.chip, 'espera', ''];
        var l = bt('linha ls-l', '', function () { popAlerta(x); });
        l.innerHTML = '<span class="h ls-h2">' + esc(ddmm(x.data)) + '<small>' + esc(String(x.horario || '').slice(0, 5)) + '</small></span>' +
          '<span class="q"><span class="nm">' + esc(x.paciente_nome) + '</span><span class="mt">' + esc([x.profissional, x.empresa_nome].filter(Boolean).join(' · ') || '—') + '</span></span>' +
          '<span class="dir">' + tag([c[0], c[1]]) + '</span>';
        corpo.appendChild(l);
      });
    } else {
      if (st.transErro) corpo.appendChild(vazio(st.transErro, true));
      else if (!T) corpo.appendChild(vazio('Carregando…'));
      else if (!(T.lista || []).length) corpo.appendChild(vazio('Nenhum paciente com consulta Lev Soul marcada.'));
      ((T && T.lista) || []).forEach(function (x) {
        var e = ETAPA[x.etapa] || [x.etapa, 'espera'];
        var l = bt('linha ls-l', '', function () { popTransicao(x); });
        l.innerHTML = '<span class="h ls-h2">' + esc(ddmm(x.prox_data)) + '<small>' + esc(x.prox_hora || '') + '</small></span>' +
          '<span class="q"><span class="nm">' + esc(x.nome) + '</span><span class="mt">' + esc([x.consultas + (x.consultas === 1 ? ' consulta' : ' consultas'), x.profissional, x.convenio !== 'Lev Soul' ? x.convenio : null].filter(Boolean).join(' · ')) + '</span></span>' +
          '<span class="dir">' + tag(e) + '</span>';
        corpo.appendChild(l);
      });
    }
    sec.appendChild(corpo);
    wrap.appendChild(sec);
    var lado = el('div', 'lado');
    var p = el('section', 'painel');
    if (st.agVista === 'transicao') {
      p.appendChild(el('div', 'painel-cab', '<h2>Transição</h2><span>pacientes com consulta Lev Soul marcada</span>'));
      var k = el('div', 'lj-kpis ls-kpis ls-kpis4');
      k.innerHTML = '<div><span>Pacientes</span><b>' + (T ? kT.total : '—') + '</b></div><div><span>Falta CPF</span><b class="' + (kT.sem_cpf ? 'ls-c-pe' : '') + '">' + (T ? kT.sem_cpf : '—') + '</b></div>' +
        '<div><span>Prontos</span><b>' + (T ? kT.pronto : '—') + '</b></div><div><span>No novo</span><b class="ls-c-ok">' + (T ? kT.no_sistema : '—') + '</b></div>';
      p.appendChild(el('div', 'lj-pad')).appendChild(k);
      p.appendChild(el('div', 'ls-nota ls-pad', '<p>O Lev Soul novo reconhece o paciente do Feegow <b>pelo CPF</b>. Por isso o primeiro passo é deixar o CPF certo na ficha do Feegow de cada um.</p>' +
        '<p>Enquanto a transição não termina, <b>ninguém é bloqueado</b>: os pacientes atuais seguem como sempre.</p>'));
    } else {
      p.appendChild(el('div', 'painel-cab', '<h2>Como funciona</h2><span>próximos 14 dias</span>'));
      p.appendChild(el('div', 'ls-nota ls-pad ls-pad-t', '<p>Aqui aparecem as consultas pelo convênio Lev Soul (ou da empresa) de quem está com algo pendente: mensalidade atrasada, pausa, ativação não paga, fora da lista da empresa.</p>' +
        (modo !== 'completo' ? '<p><b>Modo transição:</b> só avisa de quem já está no Lev Soul novo. Os pacientes atuais não aparecem nem são bloqueados.</p>' : '<p><b>Modo completo:</b> avisa também de quem está marcado como Lev Soul e não está no sistema novo.</p>')));
    }
    lado.appendChild(p);
    wrap.appendChild(lado);
    r.appendChild(wrap);
  }
  function popAlerta(x) {
    var P = moldura.pop({ largura: '500px', titulo: 'Agenda · Lev Soul' });
    var c = CHIP[x.chip] || [x.chip, 'espera', ''];
    cab(P, tag([c[0], c[1]]), x.paciente_nome, ddmm(x.data) + ' às ' + String(x.horario || '').slice(0, 5) + (x.profissional ? ' · ' + x.profissional : ''));
    P.corpo.appendChild(el('p', 'ls-orienta', esc(c[2])));
    P.corpo.appendChild(info([['Ficha no Feegow', String(x.paciente_id)], x.empresa_nome ? ['Empresa', x.empresa_nome] : null,
      x.situacao_assinatura ? ['Assinatura', (SIT_ASS[x.situacao_assinatura] || [x.situacao_assinatura])[0]] : null]));
    rodape(P, [x.assinatura_id ? bt('btn btn-s', 'Ver assinante', function () { P.fechar(); popAss(x.assinatura_id); }) : null, bt('btn btn-p', 'Fechar', function () { P.fechar(); })]);
  }
  function popTransicao(x) {
    var P = moldura.pop({ largura: '520px', titulo: 'Transição' });
    var e = ETAPA[x.etapa] || [x.etapa, 'espera'];
    cab(P, tag(e), x.nome, 'Ficha ' + x.paciente_id + ' no Feegow · ' + (x.convenio || 'Lev Soul'));
    P.corpo.appendChild(info([
      ['Próxima consulta', ddmm(x.prox_data) + ' às ' + (x.prox_hora || '') + (x.profissional ? ' · ' + x.profissional : '')],
      ['Consultas marcadas', String(x.consultas)],
      ['CPF no Feegow', x.cpf ? cpfFmt(x.cpf) : 'em branco'],
      ['Celular no Feegow', x.celular ? fone(x.celular) : 'em branco']
    ]));
    var o = { sem_cpf: 'Falta o CPF (ou ele não confere) na ficha do Feegow. Peça o CPF ao paciente e complete a ficha no Feegow. O Cortex atualiza sozinho.',
              pronto: 'Ficha completa. Pronto para migrar para o Lev Soul novo quando a transição começar.',
              convidado: 'Já existe uma contratação em andamento para este paciente (veja no Funil).',
              no_sistema: 'Já está no Lev Soul novo. A agenda passa a avisar se houver algo pendente com ele.' }[x.etapa];
    if (o) P.corpo.appendChild(el('p', 'ls-orienta', esc(o)));
    rodape(P, [x.whatsapp ? bt('btn btn-s', 'Abrir conversa', function () { abrirWa(x.whatsapp); }) : null, bt('btn btn-p', 'Fechar', function () { P.fechar(); })]);
  }

  /* ═══ Pendências ═══ */
  function bloco(titulo, sub, n, itens, erro, vazioTxt, linha) {
    var p = el('section', 'painel ls-pend');
    p.appendChild(el('div', 'painel-cab', '<h2>' + esc(titulo) + (n ? ' <span class="ls-badge">' + n + '</span>' : '') + '</h2><span>' + esc(sub) + '</span>'));
    if (erro) p.appendChild(vazio(erro, true));
    else if (!itens) p.appendChild(vazio('Carregando…'));
    else if (!itens.length) p.appendChild(el('div', 'lista-vazio ls-ok', esc(vazioTxt)));
    (itens || []).forEach(function (x) { p.appendChild(linha(x)); });
    return p;
  }
  function telaPendencias(r) {
    var g = el('div', 'ls-grade');
    g.appendChild(bloco('Pedidos dos clientes', 'resposta obrigatória', st.pedidos && st.pedidos.length, st.pedidos, st.pedidosErro, 'Nenhum pedido em aberto.', function (x) {
      var s = SIT_PEDIDO[x.situacao] || [x.situacao, 'espera'];
      return bt('ls-item', '<span class="t">' + esc(x.pessoa || '—') + ' <small>' + esc(TIPO_PEDIDO[x.tipo] || x.tipo) + ' · ' + esc(quando(x.criado_em)) + '</small></span><span class="v">' + tag(s) + '</span>',
        function () { popPedido(x); });
    }));
    g.appendChild(bloco('Colaboradores: 1ª mensagem', 'Empresarial', st.colab && st.colab.length, st.colab, st.colabErro, 'Nenhum colaborador esperando mensagem.', function (x) {
      return bt('ls-item', '<span class="t">' + esc(x.nome) + ' <small>' + esc(x.empresa) + ' · liberado ' + esc(quando(x.liberado_em)) + '</small></span><span class="v">' + esc(fone(x.whatsapp)) + '</span>',
        function () { popMensagemColab(x.colaborador_id, x); });
    }));
    g.appendChild(bloco('Cadastros sem Feegow', 'a ligação é pelo CPF', st.cadastros && st.cadastros.length, st.cadastros, st.cadErro, 'Todos os cadastros estão ligados ao Feegow.', function (x) {
      return bt('ls-item', '<span class="t">' + esc(x.nome) + ' <small>' + esc(LIGACAO[x.ligacao_feegow] || x.ligacao_feegow) + '</small></span><span class="v">' + esc(x.cpf ? cpfFmt(x.cpf) : 'sem CPF') + '</span>',
        function () { popCadastro(x); });
    }));
    r.appendChild(g);
  }
  function popPedido(x) {
    var P = moldura.pop({ largura: '520px', titulo: 'Pedido do cliente' });
    cab(P, tag(SIT_PEDIDO[x.situacao]), TIPO_PEDIDO[x.tipo] || x.tipo, (x.pessoa || '') + ' · ' + quando(x.criado_em) + (x.origem ? ' · pelo ' + (x.origem === 'site' ? 'site' : x.origem) : ''));
    P.corpo.appendChild(el('div', 'ls-msg', esc(x.texto || '(sem texto)').replace(/\n/g, '<br>')));
    var f = el('div', 'ls-form');
    f.innerHTML = campo('Como fica', '<select class="fc" id="ls-r-sit"><option value="concluida">Resolvido</option><option value="aprovada">Aprovado</option>' +
      '<option value="em_analise">Em análise (ainda vou resolver)</option><option value="negada">Negado</option></select>') +
      campo('Resposta para o cliente *', '<textarea class="fc ls-ta" id="ls-r-txt" maxlength="600" placeholder="A pessoa vê esta resposta na área do cliente."></textarea>');
    P.corpo.appendChild(f);
    var a = aviso(P.corpo);
    var ok = bt('btn btn-p', 'Responder', function () {
      var t = f.querySelector('#ls-r-txt').value.trim();
      if (t.length < 3) { mostra(a, ERROS.RESPOSTA_OBRIGATORIA); return; }
      acao(ok, a, function () { return rpc('ls_cx_solicitacao_responder', { p_id: x.id, p_situacao: f.querySelector('#ls-r-sit').value, p_resposta: t }); },
        function () { P.fechar(); avisa('Resposta registrada.'); recarregar(); });
    });
    rodape(P, [x.whatsapp ? bt('btn btn-s', 'Abrir conversa', function () { abrirWa(x.whatsapp); }) : null, x.assinatura_id ? bt('btn btn-s', 'Ver assinante', function () { popAss(x.assinatura_id); }) : null, ok]);
  }
  function popCadastro(x) {
    var P = moldura.pop({ largura: '520px', titulo: 'Ligação com o Feegow' });
    cab(P, tag([LIGACAO[x.ligacao_feegow] || x.ligacao_feegow, 'pend']), x.nome, fone(x.whatsapp));
    P.corpo.appendChild(el('p', 'ls-orienta', esc(x.pendencia)));
    if (x.fichas_feegow) P.corpo.appendChild(info([['Fichas com este CPF', x.fichas_feegow]]));
    var f = el('div', 'ls-form');
    f.innerHTML = '<div class="ls-dupla">' + campo('CPF da pessoa', '<input type="text" class="fc" id="ls-k-cpf" inputmode="numeric" autocomplete="off" value="' + esc(x.cpf ? cpfFmt(x.cpf) : '') + '">') +
      campo('Ou o nº da ficha no Feegow', '<input type="text" class="fc" id="ls-k-ficha" inputmode="numeric" autocomplete="off" placeholder="ex.: 12345">') + '</div>';
    P.corpo.appendChild(f);
    P.corpo.appendChild(el('p', 'ls-nota', 'Com o CPF, o Cortex procura a ficha sozinho. Use o nº da ficha só quando o CPF não resolver (ex.: duas fichas com o mesmo CPF: escolha a certa).'));
    var a = aviso(P.corpo);
    var ok = bt('btn btn-p', 'Salvar', function () {
      var cpf = digitos(f.querySelector('#ls-k-cpf').value), ficha = digitos(f.querySelector('#ls-k-ficha').value);
      if (!ficha && cpf.length !== 11) { mostra(a, 'Informe o CPF (11 números) ou o nº da ficha no Feegow.'); return; }
      acao(ok, a, function () {
        return ficha ? rpc('ls_cx_pessoa_ligar', { p_pessoa_id: x.pessoa_id, p_paciente_feegow_id: Number(ficha) }) : rpc('ls_cx_pessoa_cpf', { p_pessoa_id: x.pessoa_id, p_cpf: cpf });
      }, function (j) {
        if (j && j.ligacao && j.ligacao !== 'ok') { mostra(a, 'CPF salvo, mas: ' + (LIGACAO[j.ligacao] || j.ligacao) + '. Confira a ficha no Feegow ou informe o nº da ficha.'); recarregar(); return; }
        P.fechar(); avisa('Ligado ao Feegow.'); recarregar();
      });
    });
    rodape(P, [bt('btn btn-s', 'Fechar', function () { P.fechar(); }), ok]);
  }
  function popMensagemColab(id, pre) {
    var P = moldura.pop({ largura: '560px', titulo: 'Lev Soul Empresarial', sobre: true });
    var topo = el('div', 'pp-cab', '<h2>' + esc(pre ? pre.nome : 'Primeira mensagem') + '</h2>' + (pre ? '<span class="pp-sub">' + esc(fone(pre.whatsapp) + ' · ' + pre.empresa) + '</span>' : ''));
    P.corpo.appendChild(topo);
    var caixa = el('div', 'ls-msg', 'Carregando…'); P.corpo.appendChild(caixa);
    P.corpo.appendChild(el('p', 'ls-nota', 'Esta primeira mensagem vai <b>à mão</b>, pelo WhatsApp da recepção (o robô não pode puxar conversa com texto livre). Abra a conversa, confira e envie. Depois toque em <b>Já enviei</b>.'));
    var a = aviso(P.corpo);
    rodape(P, [bt('btn btn-s', 'Fechar', function () { P.fechar(); })]);
    rpc('ls_cx_colaborador_mensagem', { p_colaborador_id: id }).then(function (j) {
      topo.innerHTML = '<h2>' + esc(j.nome) + '</h2><span class="pp-sub">' + esc(fone(j.whatsapp) + ' · ' + j.empresa) + '</span>';
      caixa.innerHTML = esc(j.texto).replace(/\n/g, '<br>');
      var bCop = bt('btn btn-s', 'Copiar texto', function () { copiar(j.texto).then(function (ok) { avisa(ok ? 'Texto copiado.' : 'Não consegui copiar.'); }); });
      var bZap = bt('btn btn-s', 'Abrir conversa com o texto', function () { abrirWa(j.whatsapp, j.texto); copiar(j.texto); });
      var bOk = bt('btn btn-p', 'Já enviei', function () {
        acao(bOk, a, function () { return rpc('ls_cx_colaborador_enviei', { p_colaborador_id: id }); },
          function () { P.fechar(); avisa('Marcado como enviado.'); recarregar(); });
      });
      rodape(P, [bt('btn btn-s', 'Fechar', function () { P.fechar(); }), bCop, bZap, bOk]);
    }, function (er) { caixa.textContent = ''; mostra(a, erroTxt(er)); });
  }

  /* ═══ Empresas ═══ */
  function telaEmpresas(r) {
    var E = st.empresas;
    var wrap = el('div', 'duas-col');
    var sec = el('section', 'lista ls-lista'); sec.setAttribute('aria-label', 'Empresas');
    var topo = el('div', 'lista-topo');
    topo.appendChild(el('span', 'lista-tit', E ? E.length + (E.length === 1 ? ' empresa' : ' empresas') : 'Empresas'));
    if (ehAdm()) topo.appendChild(bt('btn btn-p btn-sm', 'Nova empresa', function () { formEmpresa(null); }));
    sec.appendChild(topo);
    var corpo = el('div', 'lista-corpo');
    if (st.empErro) corpo.appendChild(vazio(st.empErro, true));
    else if (!E) corpo.appendChild(vazio('Carregando…'));
    else if (!E.length) corpo.appendChild(vazio('Nenhuma empresa parceira ainda.'));
    (E || []).forEach(function (e) {
      var s = e.situacao === 'ativa' ? ['Ativa', 'ok'] : (e.situacao === 'em_negociacao' ? ['Em negociação', 'atencao'] : ['Encerrada', 'espera']);
      var l = bt('linha ls-l', '', function () { popEmpresa(e); });
      l.innerHTML = '<span class="q"><span class="nm">' + esc(e.nome) + '</span><span class="mt">' + esc(e.colaboradores + ' na lista · ' + e.ativados + ' ativaram' +
        (e.aguardando_liberacao ? ' · ' + e.aguardando_liberacao + ' aguardando liberação' : '')) + '</span></span><span class="dir">' + tag(s) + '</span>';
      corpo.appendChild(l);
    });
    sec.appendChild(corpo);
    wrap.appendChild(sec);
    var lado = el('div', 'lado');
    var abertas = (st.liberacoes || []).filter(function (l) { return !l.resposta; });
    lado.appendChild(bloco('Liberações', ehAdm() ? 'você aprova ou nega' : 'a administração aprova', abertas.length, st.liberacoes, st.libErro, 'Nada esperando liberação.', function (l) {
      var s = !l.resposta ? ['Aguardando', 'atencao'] : (l.resposta === 'aprovado' ? ['Aprovado', 'ok'] : ['Negado', 'pend']);
      return bt('ls-item', '<span class="t">' + esc(l.resumo) + ' <small>' + esc((l.tipo === 'dependente_colaborador' ? 'dependente' : 'colaborador') + ' · pedido por ' + (l.pedido_por || '—') + ' · ' + quando(l.pedido_em)) + '</small></span><span class="v">' + tag(s) + '</span>',
        function () { popLiberacao(l); });
    }));
    if (ehAdm()) lado.appendChild(bloco('Empresas interessadas', 'pedidos de conversa pelo site', st.leads && st.leads.length, st.leads, st.leadsErro, 'Nenhum pedido novo.', function (x) {
      return bt('ls-item', '<span class="t">' + esc(x.empresa || '—') + ' <small>' + esc([x.nome, x.cargo, x.colaboradores ? x.colaboradores + ' colaboradores' : null].filter(Boolean).join(' · ')) + '</small></span><span class="v">' + esc(quando(x.criado_em)) + '</span>',
        function () { popLead(x); });
    }));
    wrap.appendChild(lado);
    r.appendChild(wrap);
  }
  function popEmpresa(e) {
    var P = moldura.pop({ largura: '660px', titulo: 'Empresa parceira', classe: 'ls-pop' });
    cab(P, tag(e.situacao === 'ativa' ? ['Ativa', 'ok'] : [e.situacao === 'em_negociacao' ? 'Em negociação' : 'Encerrada', 'espera']), e.nome,
      [e.colaboradores_informados ? e.colaboradores_informados + ' colaboradores informados' : null, e.vigencia_fim ? 'vigência até ' + ddmmaa(e.vigencia_fim) : null].filter(Boolean).join(' · '));
    P.corpo.appendChild(info([['RH', [e.rh_nome, e.rh_whatsapp ? fone(e.rh_whatsapp) : null, e.rh_email].filter(Boolean).join(' · ') || '—'],
      ['Convênio no Feegow', e.convenio_feegow_id ? 'nº ' + e.convenio_feegow_id : 'não definido'], e.cnpj ? ['CNPJ', e.cnpj] : null]));
    var bl = el('div', 'ls-bloco'); bl.appendChild(el('h3', 'ls-sub', 'Colaboradores'));
    var lista = el('div', 'ls-mini', '<div class="ls-mini-l"><span class="t">Carregando…</span></div>'); bl.appendChild(lista);
    P.corpo.appendChild(bl);
    function carregar() {
      rpc('ls_cx_colaboradores', { p_empresa_id: e.id }).then(function (L) {
        lista.innerHTML = '';
        if (!L.length) lista.appendChild(el('div', 'ls-mini-l', '<span class="t">Ninguém na lista ainda. Inclua abaixo.</span>'));
        L.forEach(function (c) {
          var b = bt('ls-mini-l ls-mini-b', '<span class="t">' + esc(c.nome) + ' <small>' + esc(fone(c.whatsapp) + (c.dependentes && c.dependentes.length ? ' · +' + c.dependentes.length + ' da família' : '')) + '</small></span><span class="v">' + tag(SIT_COLAB[c.situacao]) + '</span>',
            function () { popColab(c, e, carregar); });
          lista.appendChild(b);
        });
      }, function (er) { lista.innerHTML = ''; lista.appendChild(el('div', 'ls-mini-l', '<span class="t ls-c-pe">' + esc(erroTxt(er)) + '</span>')); });
    }
    carregar();
    if (e.situacao === 'ativa') {
      var f = el('div', 'ls-form ls-inclui');
      f.innerHTML = '<h3 class="ls-sub">Incluir colaborador</h3><div class="ls-tripla">' + campo('Nome completo', '<input type="text" class="fc" id="ls-i-nome" maxlength="120" autocomplete="off">') +
        campo('WhatsApp', '<input type="tel" class="fc" id="ls-i-zap" autocomplete="off" placeholder="(62) 99999-9999">') +
        campo('CPF <small>(opcional)</small>', '<input type="text" class="fc" id="ls-i-cpf" inputmode="numeric" autocomplete="off">') + '</div>';
      P.corpo.appendChild(f);
      var a = aviso(f);
      var bInc = bt('btn btn-s', 'Incluir na lista', function () {
        var nome = f.querySelector('#ls-i-nome').value.trim(), zap = f.querySelector('#ls-i-zap').value, cpf = digitos(f.querySelector('#ls-i-cpf').value);
        if (nome.split(/\s+/).length < 2) { mostra(a, 'Escreva o nome completo.'); return; }
        if (digitos(zap).length < 10) { mostra(a, 'Confira o WhatsApp, com DDD.'); return; }
        acao(bInc, a, function () { return rpc('ls_cx_colaborador_incluir', { p_empresa_id: e.id, p_nome: nome, p_whatsapp: zap, p_cpf: cpf || null }); }, function (j) {
          f.querySelectorAll('input').forEach(function (i) { i.value = ''; });
          avisa(j.situacao === 'aguardando_liberacao' ? 'Incluído. A administração foi avisada no Telegram para liberar.' : 'Já estava na lista.');
          carregar(); recarregar();
        });
      });
      f.appendChild(bInc);
    }
    rodape(P, [bt('btn btn-s', 'Editar dados', function () { formEmpresa(e, function () { P.fechar(); }); }), bt('btn btn-p', 'Fechar', function () { P.fechar(); })]);
  }
  function popColab(c, e, depois) {
    var P = moldura.pop({ largura: '540px', titulo: e.nome, sobre: true });
    cab(P, tag(SIT_COLAB[c.situacao]), c.nome, fone(c.whatsapp) + (c.cpf ? ' · CPF ' + cpfFmt(c.cpf) : ''));
    P.corpo.appendChild(info([['Incluído em', quando(c.importado_em)], c.liberado_em ? ['Liberado em', quando(c.liberado_em)] : null,
      c.aceite_em ? ['Ativou em', quando(c.aceite_em)] : null, ['Ficha no Feegow', LIGACAO[c.ligacao_feegow] || c.ligacao_feegow || '—']]));
    if (c.dependentes && c.dependentes.length) {
      var bd = el('div', 'ls-bloco'); bd.appendChild(el('h3', 'ls-sub', 'Família'));
      var ld = el('div', 'ls-mini');
      c.dependentes.forEach(function (d) { ld.appendChild(el('div', 'ls-mini-l', '<span class="t">' + esc(d.nome) + ' <small>' + esc(d.parentesco || 'dependente') + '</small></span>')); });
      bd.appendChild(ld); P.corpo.appendChild(bd);
    }
    var liberado = ['liberado', 'mensagem_enviada', 'ativou', 'em_uso'].indexOf(c.situacao) >= 0;
    var a = aviso(P.corpo);
    var bMsg = c.situacao === 'liberado' || c.situacao === 'mensagem_enviada' ? bt('btn btn-p', c.situacao === 'liberado' ? 'Mandar 1ª mensagem' : 'Mensagem de novo', function () {
      popMensagemColab(c.colaborador_id, { nome: c.nome, whatsapp: c.whatsapp, empresa: e.nome });
    }) : null;
    var bDep = liberado ? bt('btn btn-s', 'Incluir familiar', function () { formDependente(c, depois); }) : null;
    var bDes = ['desligado', 'negado'].indexOf(c.situacao) < 0 ? bt('btn btn-s', 'Desligar', function () {
      var mot = prompt('Desligar ' + primeiro(c.nome) + ' da ' + e.nome + '? Escreva o motivo (ex.: saiu da empresa).');
      if (mot == null) return;
      acao(bDes, a, function () { return rpc('ls_cx_colaborador_desligar', { p_colaborador_id: c.colaborador_id, p_motivo: mot || null }); },
        function () { P.fechar(); avisa('Desligado.'); depois(); recarregar(); });
    }) : null;
    rodape(P, [bDes, bDep, bt('btn btn-s', 'Abrir conversa', function () { abrirWa(c.whatsapp); }), bMsg]);
  }
  function formDependente(c, depois) {
    var P = moldura.pop({ largura: '480px', titulo: 'Incluir familiar', sobre: true });
    cab(P, '', 'Familiar de ' + primeiro(c.nome), 'Entra na hora; a administração é avisada e pode negar.');
    var f = el('div', 'ls-form');
    f.innerHTML = campo('Nome completo *', '<input type="text" class="fc" id="ls-d-nome" maxlength="120" autocomplete="off">') +
      '<div class="ls-dupla">' + campo('Parentesco *', '<input type="text" class="fc" id="ls-d-par" maxlength="40" placeholder="filho, esposa…" autocomplete="off">') +
      campo('CPF <small>(opcional)</small>', '<input type="text" class="fc" id="ls-d-cpf" inputmode="numeric" autocomplete="off">') + '</div>' +
      campo('WhatsApp <small>(opcional)</small>', '<input type="tel" class="fc" id="ls-d-zap" autocomplete="off">');
    P.corpo.appendChild(f);
    var a = aviso(P.corpo);
    var ok = bt('btn btn-p', 'Incluir', function () {
      var nome = f.querySelector('#ls-d-nome').value.trim(), par = f.querySelector('#ls-d-par').value.trim();
      if (nome.length < 3 || !par) { mostra(a, 'Nome e parentesco são obrigatórios.'); return; }
      acao(ok, a, function () { return rpc('ls_cx_colaborador_dependente', { p_colaborador_id: c.colaborador_id, p_nome: nome, p_parentesco: par,
        p_whatsapp: f.querySelector('#ls-d-zap').value || null, p_cpf: digitos(f.querySelector('#ls-d-cpf').value) || null }); },
        function (j) { P.fechar(); avisa(j.ja_existia ? 'Essa pessoa já estava na família.' : 'Incluído. A administração foi avisada.'); depois(); recarregar(); });
    });
    rodape(P, [bt('btn btn-s', 'Cancelar', function () { P.fechar(); }), ok]);
  }
  function formEmpresa(e, aoSalvar) {
    var novo = !e; e = e || {};
    var P = moldura.pop({ largura: '600px', titulo: novo ? 'Nova empresa' : 'Editar empresa', sobre: !novo });
    cab(P, '', novo ? 'Nova empresa parceira' : e.nome, novo ? 'Depois de salvar, inclua os colaboradores.' : '');
    function v(k) { return esc(e[k] == null ? '' : e[k]); }
    var f = el('div', 'ls-form');
    f.innerHTML = campo('Nome (como a equipe conhece) *', '<input type="text" class="fc" data-k="nome" maxlength="120" value="' + v('nome') + '">') +
      '<div class="ls-dupla">' + campo('Razão social', '<input type="text" class="fc" data-k="razao_social" maxlength="160" value="' + v('razao_social') + '">') +
      campo('CNPJ', '<input type="text" class="fc" data-k="cnpj" inputmode="numeric" value="' + v('cnpj') + '">') + '</div>' +
      '<div class="ls-tripla">' + campo('RH: nome', '<input type="text" class="fc" data-k="rh_nome" maxlength="120" value="' + v('rh_nome') + '">') +
      campo('RH: WhatsApp', '<input type="tel" class="fc" data-k="rh_whatsapp" value="' + esc(e.rh_whatsapp ? fone(e.rh_whatsapp) : '') + '">') +
      campo('RH: e-mail', '<input type="email" class="fc" data-k="rh_email" value="' + v('rh_email') + '">') + '</div>' +
      '<div class="ls-tripla">' + campo('Vigência: início', '<input type="date" class="fc" data-k="vigencia_inicio" value="' + v('vigencia_inicio') + '">') +
      campo('Vigência: fim', '<input type="date" class="fc" data-k="vigencia_fim" value="' + v('vigencia_fim') + '">') +
      campo('Colaboradores informados', '<input type="number" class="fc" data-k="colaboradores_informados" min="0" value="' + v('colaboradores_informados') + '">') + '</div>' +
      (ehAdm() ? '<div class="ls-dupla">' + campo('Convênio no Feegow (nº)', '<input type="number" class="fc" data-k="convenio_feegow_id" value="' + v('convenio_feegow_id') + '">') +
        campo('Situação', '<select class="fc" data-k="situacao"><option value="ativa">Ativa</option><option value="em_negociacao">Em negociação</option><option value="encerrada">Encerrada</option></select>') + '</div>' : '') +
      campo('Observações', '<textarea class="fc ls-ta" data-k="observacoes" maxlength="600">' + v('observacoes') + '</textarea>');
    P.corpo.appendChild(f);
    var sel = f.querySelector('select[data-k="situacao"]'); if (sel) sel.value = e.situacao || 'ativa';
    var a = aviso(P.corpo);
    var ok = bt('btn btn-p', 'Salvar', function () {
      var p = {}; if (!novo) p.id = e.id;
      f.querySelectorAll('[data-k]').forEach(function (i) { p[i.getAttribute('data-k')] = i.value.trim(); });
      if (p.nome.length < 2) { mostra(a, 'Escreva o nome da empresa.'); return; }
      acao(ok, a, function () { return rpc('ls_cx_empresa_salvar', { p: p }); }, function () { P.fechar(); if (aoSalvar) aoSalvar(); avisa('Empresa salva.'); recarregar(); });
    });
    rodape(P, [bt('btn btn-s', 'Cancelar', function () { P.fechar(); }), ok]);
  }
  function popLiberacao(l) {
    var P = moldura.pop({ largura: '500px', titulo: 'Liberação' });
    var s = !l.resposta ? ['Aguardando', 'atencao'] : (l.resposta === 'aprovado' ? ['Aprovado', 'ok'] : ['Negado', 'pend']);
    cab(P, tag(s), l.resumo, (l.tipo === 'dependente_colaborador' ? 'Familiar de colaborador' : 'Colaborador') + ' · pedido por ' + (l.pedido_por || '—') + ' · ' + quando(l.pedido_em));
    if (l.tipo === 'dependente_colaborador' && !l.resposta) P.corpo.appendChild(el('p', 'ls-nota', 'O familiar já entrou. Se negar, ele sai.'));
    if (l.resposta) P.corpo.appendChild(info([['Respondido', quando(l.respondido_em)], l.observacao ? ['Observação', l.observacao] : null]));
    if (l.resposta || !ehAdm()) { rodape(P, [bt('btn btn-p', 'Fechar', function () { P.fechar(); })]); return; }
    var f = el('div', 'ls-form'); f.innerHTML = campo('Observação (opcional)', '<input type="text" class="fc" id="ls-l-obs" maxlength="200" autocomplete="off">');
    P.corpo.appendChild(f);
    var a = aviso(P.corpo);
    function responder(b, r) {
      acao(b, a, function () { return rpc('ls_cx_liberacao_responder', { p_id: l.id, p_resposta: r, p_obs: f.querySelector('#ls-l-obs').value.trim() || null }); },
        function () { P.fechar(); avisa(r === 'aprovado' ? 'Liberado. Agora a secretária manda a 1ª mensagem.' : 'Negado.'); recarregar(); });
    }
    var bN = bt('btn btn-s', 'Negar', function () { responder(bN, 'negado'); });
    var bA = bt('btn btn-p', 'Aprovar', function () { responder(bA, 'aprovado'); });
    rodape(P, [bN, bA]);
  }
  function popLead(x) {
    var P = moldura.pop({ largura: '500px', titulo: 'Empresa interessada' });
    cab(P, '', x.empresa || '—', [x.nome, x.cargo].filter(Boolean).join(' · '));
    P.corpo.appendChild(info([['WhatsApp', fone(x.whatsapp)], x.colaboradores ? ['Colaboradores', String(x.colaboradores)] : null, ['Pediu em', quando(x.criado_em)], x.observacoes ? ['Recado', x.observacoes] : null]));
    P.corpo.appendChild(el('p', 'ls-nota', 'Proposta de empresa é com a administração: responda em até um dia útil.'));
    var a = aviso(P.corpo);
    var ok = bt('btn btn-p', 'Marcar como tratado', function () {
      acao(ok, a, function () { return rpc('ls_cx_lead_tratar', { p_id: x.id }); }, function () { P.fechar(); avisa('Marcado como tratado.'); recarregar(); });
    });
    rodape(P, [bt('btn btn-s', 'Abrir conversa', function () { abrirWa(x.whatsapp); }), ok]);
  }

  /* ═══ Comissões ═══ */
  function telaComissoes(r) {
    if (!st.comMes) st.comMes = hojeISO().slice(0, 7) + '-01';
    var C = st.com && st.com.mes === st.comMes.slice(0, 7) ? st.com : null;
    var wrap = el('div', 'duas-col');
    var sec = el('section', 'lista ls-lista');
    var topo = el('div', 'lista-topo');
    var nav = el('div', 'ls-mesnav');
    function muda(n) { var a = Number(st.comMes.slice(0, 4)), m = Number(st.comMes.slice(5, 7)) - 1 + n; a += Math.floor(m / 12); m = ((m % 12) + 12) % 12; st.comMes = a + '-' + String(m + 1).padStart(2, '0') + '-01'; st.com = null; desenhar(); carregarComissoes(); }
    var m0 = Number(st.comMes.slice(5, 7)) - 1;
    nav.appendChild(bt('ls-seta', svg('M14.5 6l-6 6 6 6', 18, 2), function () { muda(-1); })).setAttribute('aria-label', 'Mês anterior');
    nav.appendChild(el('b', 'ls-mes', esc(MESES[m0].charAt(0).toUpperCase() + MESES[m0].slice(1) + ' de ' + st.comMes.slice(0, 4))));
    nav.appendChild(bt('ls-seta', svg('M9.5 6l6 6-6 6', 18, 2), function () { muda(1); })).setAttribute('aria-label', 'Próximo mês');
    topo.appendChild(nav);
    topo.appendChild(el('span', 'lista-tit', ehAdm() ? 'de toda a equipe' : 'as suas'));
    sec.appendChild(topo);
    var corpo = el('div', 'lista-corpo');
    if (st.comErro) corpo.appendChild(vazio(st.comErro, true));
    else if (!C) corpo.appendChild(vazio('Carregando…'));
    else if (!(C.itens || []).length) corpo.appendChild(vazio('Nenhuma contratação com comissão neste mês.'));
    ((C && C.itens) || []).forEach(function (k) {
      var l = bt('linha ls-l', '', function () { popComissao(k); });
      l.innerHTML = '<span class="h ls-h2">' + esc(ddmm(k.aceite_em)) + '</span><span class="q"><span class="nm">' + esc(k.titular) + '</span><span class="mt">' +
        esc([ehAdm() ? k.usuario : null, PAPEL_COM[k.papel] || k.papel, Number(k.percentual) + '%'].filter(Boolean).join(' · ')) + '</span></span>' +
        '<span class="dir"><span class="ls-v">' + esc(brl(k.valor)) + '</span>' + tag(EST_COM[k.estado]) + '</span>';
      corpo.appendChild(l);
    });
    sec.appendChild(corpo);
    wrap.appendChild(sec);
    var lado = el('div', 'lado');
    var p = el('section', 'painel');
    p.appendChild(el('div', 'painel-cab', '<h2>Totais do mês</h2><span>por pessoa</span>'));
    var tot = (C && C.totais) || {}, nomes = Object.keys(tot);
    if (!C) p.appendChild(vazio('Carregando…'));
    else if (!nomes.length) p.appendChild(vazio('Sem comissões neste mês.'));
    nomes.forEach(function (n) {
      var t = tot[n] || {};
      p.appendChild(el('div', 'ls-item ls-item-f', '<span class="t">' + esc(n) + ' <small>' + esc(['paga ' + brl(t.paga || 0), t.liberada ? 'liberada ' + brl(t.liberada) : null, t.aguardando ? 'aguardando ' + brl(t.aguardando) : null].filter(Boolean).join(' · ')) + '</small></span>' +
        '<span class="v">' + esc(brl((t.paga || 0) + (t.liberada || 0) + (t.aguardando || 0))) + '</span>'));
    });
    p.appendChild(el('p', 'ls-nota ls-pad ls-pad-t', 'A comissão é sobre a primeira mensalidade e só é paga depois que o cliente paga o segundo mês. Cancelou antes disso, ela é anulada.'));
    lado.appendChild(p);
    wrap.appendChild(lado);
    r.appendChild(wrap);
  }
  function popComissao(k) {
    var P = moldura.pop({ largura: '480px', titulo: 'Comissão' });
    cab(P, tag(EST_COM[k.estado]), brl(k.valor), k.titular + ' · ' + (PAPEL_COM[k.papel] || k.papel) + ' · ' + Number(k.percentual) + '%');
    P.corpo.appendChild(info([['De', k.usuario || '—'], ['Contratou em', quando(k.aceite_em)], k.liberada_em ? ['Liberada em', quando(k.liberada_em)] : null, k.paga_em ? ['Paga em', quando(k.paga_em)] : null]));
    if (!ehAdm() || ['aguardando', 'liberada'].indexOf(k.estado) < 0) { rodape(P, [bt('btn btn-p', 'Fechar', function () { P.fechar(); })]); return; }
    var a = aviso(P.corpo);
    function marca(b, est) {
      var mot = est === 'anulada' ? prompt('Por que anular esta comissão?') : null;
      if (est === 'anulada' && mot == null) return;
      acao(b, a, function () { return rpc('ls_cx_comissao_marcar', { p_id: k.id, p_estado: est, p_motivo: mot }); }, function () { P.fechar(); avisa(est === 'paga' ? 'Marcada como paga.' : 'Anulada.'); carregarComissoes(); });
    }
    var bA = bt('btn btn-s', 'Anular', function () { marca(bA, 'anulada'); });
    var bP = k.estado === 'liberada' ? bt('btn btn-p', 'Marcar como paga', function () { marca(bP, 'paga'); }) : null;
    rodape(P, [bA, bP, bt('btn btn-s', 'Fechar', function () { P.fechar(); })]);
  }

  /* ═══ Visão do dono ═══ */
  function telaDono(r) {
    var D = st.dono;
    if (st.donoErro) { r.appendChild(vazio(st.donoErro, true)); return; }
    if (!D) { r.appendChild(vazio('Carregando…')); return; }
    var g = el('div', 'ls-dono');
    function kpi(rot, val, sub, cls) { return '<div class="ls-kpi"><span>' + esc(rot) + '</span><b class="' + (cls || '') + '">' + esc(val) + '</b>' + (sub ? '<small>' + esc(sub) + '</small>' : '') + '</div>'; }
    var ps = D.por_situacao || {};
    var topo = el('section', 'painel ls-kpi-grade');
    topo.innerHTML = kpi('Assinantes ativos', String(D.ativos || 0), (ps.pausada ? ps.pausada + (ps.pausada === 1 ? ' pausado' : ' pausados') : '')) +
      kpi('Receita recorrente', brlS(D.mrr), 'por mês (em dia + em atraso)') + kpi('Novos no mês', String(D.novos_no_mes || 0)) +
      kpi('Cancelados no mês', String(D.cancelados_no_mes || 0), '', D.cancelados_no_mes ? 'ls-c-pe' : '') +
      kpi('Em atraso', brl(D.inadimplencia_rs || 0), (ps.inadimplente || 0) + ((ps.inadimplente || 0) === 1 ? ' assinante' : ' assinantes'), D.inadimplencia_rs ? 'ls-c-pe' : '');
    g.appendChild(topo);
    function lista(tit, sub, obj, rotulos) {
      var p = el('section', 'painel');
      p.appendChild(el('div', 'painel-cab', '<h2>' + esc(tit) + '</h2><span>' + esc(sub) + '</span>'));
      var ks = Object.keys(obj || {});
      if (!ks.length) p.appendChild(vazio('Sem dados ainda.'));
      ks.sort(function (a, b) { return obj[b] - obj[a]; }).forEach(function (k) {
        p.appendChild(el('div', 'ls-item ls-item-f', '<span class="t">' + esc((rotulos && rotulos[k]) || k) + '</span><span class="v">' + esc(String(obj[k])) + '</span>'));
      });
      return p;
    }
    var col = el('div', 'ls-grade');
    var rotConv = {}; Object.keys(SIT_CONVITE).forEach(function (k) { rotConv[k] = SIT_CONVITE[k][0]; });
    col.appendChild(lista('Funil', 'últimos 30 dias', D.funil_30d, rotConv));
    col.appendChild(lista('Como pagam', 'assinaturas ativas', D.pix_x_cartao, { pix: 'Pix', cartao: 'Cartão', indefinido: 'Ainda não definido' }));
    col.appendChild(lista('Porta de entrada', 'últimos 30 dias', D.por_porta_30d, { assistida: 'Pela secretaria', site: 'Pelo site' }));
    col.appendChild(lista('Origem', 'últimos 30 dias', D.por_origem_30d, { fora: 'Veio de fora', 'sem origem': 'Sem origem' }));
    var emp = {}; (D.empresas || []).forEach(function (e) { emp[e.nome] = e.ativados + ' de ' + e.colaboradores; });
    col.appendChild(lista('Empresas', 'ativaram / na lista', emp));
    /* modo da agenda */
    var modo = (st.resumo && st.resumo.modo) || 'transicao';
    var pm = el('section', 'painel');
    pm.appendChild(el('div', 'painel-cab', '<h2>Agenda</h2><span>avisos das consultas Lev Soul</span>'));
    var cm = el('div', 'ls-pad ls-col');
    cm.appendChild(el('p', 'ls-nota', modo === 'completo'
      ? '<b>Modo completo:</b> a agenda avisa de todos os marcados como Lev Soul, inclusive quem não está no sistema novo.'
      : '<b>Modo transição:</b> a agenda só avisa de quem já está no Lev Soul novo. Troque para completo quando todos os pacientes atuais tiverem migrado.'));
    var a = aviso(cm);
    var bm = bt('btn btn-s', modo === 'completo' ? 'Voltar para o modo transição' : 'Passar para o modo completo', function () {
      var novo = modo === 'completo' ? 'transicao' : 'completo';
      if (novo === 'completo' && !confirm('Passar para o modo completo? A agenda vai avisar de todos os pacientes Lev Soul que ainda não estão no sistema novo.')) return;
      acao(bm, a, function () { return rpc('ls_cx_agenda_modo', { p_modo: novo }); }, function () { avisa(novo === 'completo' ? 'Modo completo ligado.' : 'Modo transição ligado.'); st.alertas = null; recarregar(); });
    });
    cm.appendChild(bm);
    pm.appendChild(cm);
    col.appendChild(pm);
    g.appendChild(col);
    r.appendChild(g);
  }

  /* a tela abre quando nav('levsoul') ativa a seção (sem mexer no mapa de telas do lojinha.js) */
  var ativa = false, secao = document.getElementById('s-levsoul');
  if (secao && window.MutationObserver) new MutationObserver(function () {
    var on = secao.classList.contains('active');
    if (on && !ativa) abrir();
    ativa = on;
  }).observe(secao, { attributes: true, attributeFilter: ['class'] });

  return { abrir: abrir, sair: sair, contratar: function () { contratar(); }, meuLink: meuLink, resumo: carregarResumo };
})();
