/* ═══════════════════════════════════════════════════════════════════
   Financeiro · Extrato (FIN v1.3) — por enquanto só no administrador.
   O que entrou no dia:
     · pagamentos lançados no Feegow, pela função fin_cortex_extrato do Supabase,
       que confere a senha de administração no servidor (as tabelas fin_* seguem fechadas);
     · vendas e pagamentos de notinha da conveniência, lidos do Firebase (só leitura)
       até a lojinha ir para o Supabase.
   Sem totais: é a tela que as secretárias vão usar depois. Cada linha mostra a prova
   de que o dinheiro entrou (Pix → banco, cartão → Cielo, dinheiro → contagem da gaveta);
   nesta etapa as provas ainda estão em espera.
   ═══════════════════════════════════════════════════════════════════ */
var FIN = (function () {
  'use strict';

  var SB = { url: 'https://xcucoryngkkuszztpxyq.supabase.co', key: 'sb_publishable_6ATQUvqBBRS5xx7jAYKlmw_2FwTuHG7' };
  var TZ = 'America/Sao_Paulo';
  var RECARGA_MS = 3 * 60 * 1000;          /* o robô do Feegow roda de 3 em 3 minutos */

  var st = { senha: null, dados: null, conv: [], convErro: '', erro: '', dia: null, filtro: 'tudo',
             off: null, pedido: 0, carregando: false, carregadoEm: null, timer: null, portaErro: '', portaOcupada: false };

  /* ── utilidades ── */
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function bt(cls, html, fn) { var b = el('button', cls, html); b.type = 'button'; if (fn) b.addEventListener('click', fn); return b; }
  function esc(s) { var d = document.createElement('span'); d.textContent = s == null ? '' : String(s); return d.innerHTML; }
  function svg(d, t, w) { return window.moldura ? moldura.svg(d, t, w) : ''; }
  function brl(v) { return typeof fmt === 'function' ? fmt(v) : 'R$ ' + Number(v || 0).toFixed(2).replace('.', ','); }
  function ehAdmin() { return typeof isAdmin === 'function' && isAdmin(); }
  var IC = { esq: 'M14.5 6l-6 6 6 6', dir: 'M9.5 6l6 6-6 6' };
  var SEM = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
  /* datas como texto "AAAA-MM-DD", sempre no dia de Brasília */
  function dataDe(iso) { return new Date(iso + 'T12:00:00-03:00'); }
  function ddmm(iso) { var m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? m[3] + '/' + m[2] : '—'; }
  function diaLongo(iso) { return SEM[dataDe(iso).getUTCDay()] + ', ' + ddmm(iso); }
  function horaBR(d) { return d ? d.toLocaleTimeString('pt-BR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }) : '—'; }
  function tsDate(ts) { if (!ts) return null; return ts.toDate ? ts.toDate() : new Date(ts); }
  function raiz() {
    var s = document.getElementById('s-financeiro'); if (!s) return null;
    var r = s.querySelector(':scope > .fin-raiz');
    if (!r) { r = el('div', 'fin-raiz'); s.appendChild(r); }
    return r;
  }
  function naTela() { var s = document.getElementById('s-financeiro'); return !!(s && s.classList.contains('active')); }
  function resumo(t) { if (window.moldura) moldura.resumo('extrato', t); }
  function altura(r) {
    var l = r.querySelector('.lista.alta'); if (!l) return;
    var topo = l.getBoundingClientRect().top + window.scrollY;
    l.style.height = Math.max(520, window.innerHeight - topo - 24) + 'px';
  }
  window.addEventListener('resize', function () { var r = raiz(); if (r && naTela()) altura(r); });

  /* ── as provas (nesta etapa, todas em espera) ── */
  function provaDe(forma) {
    if (forma === 15 || forma === 'pix') return { rot: 'aguardando o banco', cls: 'espera',
      txt: 'Pix: a prova é a entrada no extrato do Inter. Fica em espera até o robô do Inter rodar e a chave CNPJ estar no Inter.' };
    if (forma === 8 || forma === 9 || forma === 'credito' || forma === 'debito') return { rot: 'aguardando a Cielo', cls: 'espera',
      txt: 'Cartão: a prova é a venda na Cielo, item por item. Fica em espera até o acesso à Cielo.' };
    if (forma === 1 || forma === 'dinheiro') return { rot: 'vai para a contagem', cls: 'espera',
      txt: 'Dinheiro: a prova é a contagem da gaveta, às cegas, na chegada de cada secretária.' };
    if (forma === 5) return { rot: 'direto ao profissional', cls: 'aluguel',
      txt: 'DOC é o aluguel: o paciente paga direto ao profissional. Não entra no caixa da clínica e aparece só para conferir.' };
    return { rot: 'forma fora do combinado', cls: 'fora',
      txt: 'A recepção recebe em dinheiro, Pix, cartão e DOC. Esta forma não tem prova: confira o lançamento no Feegow.' };
  }
  var FORMA_CONV = { dinheiro: 'Dinheiro', pix: 'Pix', debito: 'Débito', credito: 'Crédito' };
  function formaFeegow(p) {
    if (p.forma === 8) return 'Crédito'; if (p.forma === 9) return 'Débito'; if (p.forma === 15) return 'Pix';
    if (p.forma === 1) return 'Dinheiro'; if (p.forma === 5) return 'DOC';
    return p.forma_nome || ('forma ' + p.forma);
  }

  /* ── Supabase ── */
  function rpc(fn, args) {
    return fetch(SB.url + '/rest/v1/rpc/' + fn, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SB.key, 'Authorization': 'Bearer ' + SB.key },
      body: JSON.stringify(args || {})
    }).then(function (r) {
      return r.text().then(function (t) {
        var j = null; try { j = JSON.parse(t); } catch (e) {}
        if (!r.ok) throw new Error((j && (j.message || j.hint || j.details)) || ('HTTP ' + r.status));
        if (j && j.ok === false) { var e = new Error(j.erro || 'ERRO'); e.codigo = j.erro; throw e; }
        return j;
      });
    });
  }
  function msgSenha(c) {
    if (c === 'BLOQUEADO_TEMPORARIAMENTE') return 'Muitas tentativas erradas. Espere 15 minutos e tente de novo.';
    if (c === 'SENHA_INVALIDA') return 'Senha incorreta.';
    return '';
  }

  /* ── conveniência (Firebase, só leitura) ── */
  function conveniencia(dia) {
    if (typeof db === 'undefined' || !db) return Promise.reject(new Error('Firebase da conveniência indisponível.'));
    var ini = new Date(dia + 'T00:00:00-03:00'), fim = new Date(dia + 'T23:59:59.999-03:00');
    return db.collection('movimentacoes').where('timestamp', '>=', ini).where('timestamp', '<=', fim).orderBy('timestamp').get()
      .then(function (snap) { return agruparConv(snap.docs.map(function (d) { var x = d.data(); x.id = d.id; return x; })); });
  }
  /* venda com vários produtos vira uma linha (os itens da mesma venda são gravados juntos, com a mesma hora) */
  function agruparConv(movs) {
    var out = [], porVenda = {};
    movs.forEach(function (m) {
      if (m.marcado_erro === true || !FORMA_CONV[m.forma_pagamento]) return;
      var d = tsDate(m.timestamp);
      if (m.tipo === 'venda_paciente') {
        var k = [d ? d.getTime() : m.id, m.secretaria_id || '', m.forma_pagamento, m.cliente_tipo || '', m.profissional_id || ''].join('|');
        var v = porVenda[k];
        if (!v) {
          v = porVenda[k] = { tipo: 'venda', id: m.id, quando: d, forma: m.forma_pagamento, valor: 0, itens: [],
                              cliente: m.cliente_tipo === 'profissional' ? (m.profissional_nome || 'Profissional') : 'Paciente',
                              profissional: m.cliente_tipo === 'profissional', secretaria: m.secretaria_nome || '' };
          out.push(v);
        }
        v.valor += Number(m.valor_total || 0);
        v.itens.push({ nome: m.produto_nome || m.descricao || 'Produto', qtd: Number(m.quantidade || 1), valor: Number(m.valor_total || 0) });
      } else if (m.tipo === 'pagamento_notinha') {
        out.push({ tipo: 'notinha', id: m.id, quando: d, forma: m.forma_pagamento, valor: Number(m.valor_total || 0),
                   profissional_nome: m.profissional_nome || 'Profissional', secretaria: m.secretaria_nome || '', descricao: m.descricao || '' });
      }
    });
    return out;
  }

  /* ── carga ── */
  function carregar(dia) {
    if (!st.senha) { desenhar(); return Promise.resolve(); }
    var meu = ++st.pedido;
    st.carregando = true; marcarCarregando();
    return rpc('fin_cortex_extrato', { p_senha: st.senha, p_dia: dia || st.dia || null })
      .then(function (d) { return completar(d, meu); })
      .catch(function (e) { falhou(e, meu); });
  }
  /* com a resposta do Feegow na mão, lê a conveniência do mesmo dia e desenha */
  function completar(d, meu) {
    if (meu !== st.pedido) return;
    return conveniencia(d.dia).then(function (c) { return { conv: c, erro: '' }; },
                                   function (e) { return { conv: [], erro: e.message || String(e) }; })
      .then(function (cv) {
        if (meu !== st.pedido) return;
        st.dados = d; st.dia = d.dia; st.conv = cv.conv; st.convErro = cv.erro; st.erro = '';
        st.carregando = false; st.carregadoEm = new Date();
        if (naTela()) desenhar();
      });
  }
  function falhou(e, meu) {
    if (meu !== st.pedido) return;
    st.carregando = false;
    if (e.codigo === 'SENHA_INVALIDA' || e.codigo === 'BLOQUEADO_TEMPORARIAMENTE') {   /* a senha mudou ou travou: pede de novo */
      st.senha = null; st.dados = null; st.portaErro = msgSenha(e.codigo); relogio(false);
    } else st.erro = 'Não consegui ler o extrato: ' + (e.message || String(e));
    if (naTela()) desenhar();
  }
  function marcarCarregando() { var r = raiz(); var w = r && r.querySelector('.duas-col'); if (w) w.classList.add('carregando'); }
  function relogio(ligar) {
    if (st.timer) { clearInterval(st.timer); st.timer = null; }
    if (ligar) st.timer = setInterval(function () { if (naTela() && st.senha && !document.hidden) carregar(st.dia); }, RECARGA_MS);
  }
  document.addEventListener('visibilitychange', function () { if (!document.hidden && naTela() && st.senha && st.dados) carregar(st.dia); });

  /* ── entrada pela senha de administração ── */
  function desenharPorta() {
    var r = raiz(); if (!r) return;
    resumo('');
    r.innerHTML = '';
    var box = el('section', 'painel cf-porta fin-porta'); box.setAttribute('aria-label', 'Senha de administração');
    box.innerHTML = '<h2>Senha de administração</h2><p>O Financeiro abre com a senha de administração, a mesma do ⚙️ Acessos dos profissionais. Ela é pedida uma vez por sessão.</p>' +
      '<div class="cf-porta-l"><input type="password" class="fc" id="fin-senha" autocomplete="off" aria-label="Senha de administração" placeholder="Senha de administração">' +
      '<button type="button" class="btn btn-p" id="fin-entrar">Entrar</button></div><p class="cf-porta-erro" id="fin-porta-erro"' + (st.portaErro ? '' : ' hidden') + '>' + esc(st.portaErro) + '</p>';
    r.appendChild(box);
    var inp = box.querySelector('#fin-senha'), ok = box.querySelector('#fin-entrar'), er = box.querySelector('#fin-porta-erro');
    function tenta() {
      var s = inp.value; if (!s || st.portaOcupada) return;
      st.portaOcupada = true; ok.disabled = true; ok.textContent = 'Entrando…'; er.hidden = true;
      var meu = ++st.pedido;
      rpc('fin_cortex_extrato', { p_senha: s, p_dia: st.dia || null }).then(function (d) {
        st.portaOcupada = false; st.senha = s; st.portaErro = ''; relogio(true);
        return completar(d, meu);                  /* a mesma resposta já serve: não pede de novo */
      }).catch(function (e) {
        st.portaOcupada = false; ok.disabled = false; ok.textContent = 'Entrar';
        er.textContent = msgSenha(e.codigo) || ('Não consegui conferir a senha: ' + (e.message || String(e))); er.hidden = false;
        inp.select();
      });
    }
    ok.addEventListener('click', tenta);
    inp.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') tenta(); });
    setTimeout(function () { if (document.body.contains(inp)) inp.focus(); }, 0);
  }

  /* ── tela ── */
  function desenhar() {
    var r = raiz(); if (!r) return;
    if (!ehAdmin()) { resumo(''); r.innerHTML = '<div class="lista-vazio">O Financeiro é só do administrador.</div>'; return; }
    if (!st.senha) { desenharPorta(); return; }
    acoesTopo();
    var d = st.dados;
    if (!d) {
      r.innerHTML = st.erro ? '<div class="lista-vazio erro">' + esc(st.erro) + '</div>' : '<div class="lista-vazio">Carregando o extrato…</div>';
      return;
    }
    var pags = d.pagamentos || [], sem = d.sem_cobranca || [], conv = st.conv || [];
    var n = { atend: pags.length + sem.length, conv: conv.length };
    var lanc = pags.length + conv.length;
    resumo(diaLongo(d.dia) + (d.dia === d.hoje ? ' (hoje)' : '') + ' · ' + (lanc === 1 ? '1 lançamento' : lanc + ' lançamentos') +
      (sem.length ? ' · ' + (sem.length === 1 ? '1 atendido sem cobrança' : sem.length + ' atendidos sem cobrança') : '') +
      (st.carregadoEm ? ' · carregado às ' + horaBR(st.carregadoEm) : ''));
    var antes = r.querySelector('.lista-corpo'), rolou = antes ? antes.scrollTop : 0, mesmoDia = r.getAttribute('data-dia') === d.dia;
    r.innerHTML = ''; r.setAttribute('data-dia', d.dia);

    var wrap = el('div', 'duas-col');
    var sec = el('section', 'lista alta fin-lista'); sec.setAttribute('aria-label', 'Extrato do dia');
    sec.appendChild(faixaDias(d));
    var topo = el('div', 'lista-topo');
    topo.appendChild(seg([['tudo', 'Tudo', n.atend + n.conv], ['atendimentos', 'Atendimentos', n.atend], ['conveniencia', 'Conveniência', n.conv]], st.filtro,
      function (v) { st.filtro = v; desenhar(); }));
    topo.appendChild(el('span', 'mostrando', 'Sem totais: cada valor com a sua prova'));
    sec.appendChild(topo);

    var corpo = el('div', 'lista-corpo');
    if (st.erro) corpo.appendChild(el('div', 'lista-vazio erro', esc(st.erro)));
    var verAt = st.filtro !== 'conveniencia', verCv = st.filtro !== 'atendimentos';
    if (verAt && sem.length) {
      corpo.appendChild(cab('Atendido sem cobrança', sem.length === 1 ? '1 atendimento' : sem.length + ' atendimentos', 'pend'));
      sem.forEach(function (s, i) { corpo.appendChild(linhaSem(s, i)); });
    }
    if (verAt) {
      corpo.appendChild(cab('Atendimentos · Feegow', pags.length === 1 ? '1 lançamento' : pags.length + ' lançamentos'));
      if (!pags.length) corpo.appendChild(el('div', 'lista-vazio', 'Nenhum pagamento lançado no Feegow neste dia.'));
      pags.forEach(function (p, i) { corpo.appendChild(linhaPag(p, i)); });
    }
    if (verCv) {
      corpo.appendChild(cab('Conveniência', conv.length === 1 ? '1 lançamento' : conv.length + ' lançamentos'));
      if (st.convErro) corpo.appendChild(el('div', 'lista-vazio erro', 'Não consegui ler a conveniência: ' + esc(st.convErro)));
      else if (!conv.length) corpo.appendChild(el('div', 'lista-vazio', 'Nenhuma venda ou pagamento de notinha neste dia.'));
      conv.forEach(function (c, i) { corpo.appendChild(linhaConv(c, i)); });
    }
    sec.appendChild(corpo);
    wrap.appendChild(sec);
    wrap.appendChild(lado(d));
    r.appendChild(wrap);
    altura(r);
    if (mesmoDia) corpo.scrollTop = rolou;
  }
  function acoesTopo() {
    var ac = window.moldura ? moldura.acoesDe('extrato') : null; if (!ac || ac.querySelector('.fin-rec')) return;
    var b = bt('btn btn-s fin-rec', 'Recarregar', function () { carregar(st.dia); });
    b.title = 'Ler de novo o Feegow e a conveniência';
    ac.appendChild(b);
  }
  function seg(opcoes, atual, onPick) {
    var s = el('div', 'seg'); s.setAttribute('role', 'group'); s.setAttribute('aria-label', 'Mostrar');
    opcoes.forEach(function (o) {
      var on = o[0] === atual;
      var b = bt(on ? 'on' : '', esc(o[1]) + ' <span class="n">' + o[2] + '</span>', function () { if (!on) onPick(o[0]); });
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      s.appendChild(b);
    });
    return s;
  }
  function cab(tit, sub, cls) { return el('div', 'dia-cab fin-cab' + (cls ? ' ' + cls : ''), '<b>' + esc(tit) + '</b><span>' + esc(sub) + '</span>'); }

  /* faixa de dias (do início do financeiro até hoje), como na Agenda; o número é o de atendidos sem cobrança */
  function faixaDias(d) {
    var dias = d.dias && d.dias.length ? d.dias : [{ dia: d.dia, sem_cobranca: (d.sem_cobranca || []).length }];
    var VIS = 7, N = dias.length, maxOff = Math.max(0, N - VIS);
    var k = dias.findIndex(function (x) { return x.dia === d.dia; });
    if (st.off == null || k < st.off || k >= st.off + VIS) st.off = Math.min(maxOff, Math.max(0, k - VIS + 1));
    var off = Math.min(st.off, maxOff);
    var w = el('div', 'dias');
    var a = bt('dias-seta', svg(IC.esq, 18, 2.2), function () { st.off = Math.max(0, off - VIS); redesenharDias(); });
    a.setAttribute('aria-label', 'Dias anteriores'); a.disabled = off <= 0;
    var grade = el('div', 'dias-grade');
    dias.slice(off, off + VIS).forEach(function (x) {
      var on = x.dia === d.dia, hoje = x.dia === d.hoje;
      var b = bt('dia2' + (on ? ' on' : ''), '<span class="sd"><span class="s">' + (hoje ? 'hoje' : esc(SEM[dataDe(x.dia).getUTCDay()].slice(0, 3).toLowerCase())) + '</span>' +
        '<span class="d">' + esc(ddmm(x.dia)) + '</span></span><span class="r' + (x.sem_cobranca ? ' p' : '') + '">' + x.sem_cobranca + '</span>',
        function () { if (!on) { st.dia = x.dia; carregar(x.dia); } });
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      b.title = x.sem_cobranca ? (x.sem_cobranca === 1 ? '1 atendido sem cobrança' : x.sem_cobranca + ' atendidos sem cobrança') : 'Nenhum atendido sem cobrança';
      grade.appendChild(b);
    });
    var p = bt('dias-seta dir', svg(IC.dir, 18, 2.2), function () { st.off = Math.min(maxOff, off + VIS); redesenharDias(); });
    p.setAttribute('aria-label', 'Próximos dias'); p.disabled = off >= maxOff;
    w.appendChild(a); w.appendChild(grade); w.appendChild(p);
    /* celular: a faixa rola de lado; o dia escolhido fica à vista */
    setTimeout(function () {
      var on = grade.querySelector('.dia2.on'); if (!on || grade.scrollWidth <= grade.clientWidth) return;
      var g = grade.getBoundingClientRect(), c = on.getBoundingClientRect();
      if (c.right > g.right) grade.scrollLeft += c.right - g.right; else if (c.left < g.left) grade.scrollLeft -= g.left - c.left;
    }, 0);
    return w;
  }
  function redesenharDias() {
    var r = raiz(), velho = r && r.querySelector('.fin-lista > .dias'); if (!velho || !st.dados) return;
    velho.parentNode.replaceChild(faixaDias(st.dados), velho);
  }

  /* ── linhas ── */
  function dirHtml(valor, forma, prova, extra) {
    return '<span class="dir"><span class="valor">' + esc(brl(valor)) + '</span><span class="tr">' + esc(forma) +
      ' · <span class="fin-prova ' + prova.cls + '">' + esc(prova.rot) + '</span>' + (extra || '') + '</span></span>';
  }
  function atendTxt(a) { return [a.profissional, a.procedimento, a.origem].filter(Boolean).join(' · '); }
  function linhaPag(p, i) {
    var at = p.atendimentos || [], a0 = at[0], d = st.dados;
    var meta = a0 ? atendTxt(a0) + (at.length > 1 ? ' · +' + (at.length - 1) : '') : (p.paciente ? 'sem atendimento no dia' : 'conta ' + (p.conta_id || '—') + ' no Feegow');
    if (p.conta_data && p.conta_data !== d.dia) meta += ' · conta de ' + ddmm(p.conta_data);
    var b = bt('linha fin-l', '<span class="h">' + esc(a0 ? a0.horario : '—') + '</span>' +
      '<span class="q"><span class="nm">' + esc(p.paciente || 'Recebimento sem paciente') + '</span><span class="mt">' + esc(meta) + '</span></span>' +
      dirHtml(p.valor, formaFeegow(p), provaDe(p.forma)), function () { detalhe('pag', i); });
    b.setAttribute('aria-haspopup', 'dialog');
    return b;
  }
  function linhaConv(c, i) {
    var nm = c.tipo === 'venda' ? c.itens.map(function (x) { return x.nome + (x.qtd > 1 ? ' ×' + x.qtd : ''); }).join(', ') : 'Pagamento de notinha';
    var meta = c.tipo === 'venda' ? 'Venda · ' + c.cliente + (c.profissional ? ' (pagou na hora)' : '') : 'Notinha de ' + c.profissional_nome;
    if (c.secretaria) meta += ' · por ' + c.secretaria;
    var b = bt('linha fin-l', '<span class="h">' + esc(horaBR(c.quando)) + '</span>' +
      '<span class="q"><span class="nm">' + esc(nm) + '</span><span class="mt">' + esc(meta) + '</span></span>' +
      dirHtml(c.valor, FORMA_CONV[c.forma], provaDe(c.forma)), function () { detalhe('conv', i); });
    b.setAttribute('aria-haspopup', 'dialog');
    return b;
  }
  function linhaSem(s, i) {
    var b = bt('linha fin-l', '<span class="h">' + esc(s.horario || '—') + '</span>' +
      '<span class="q"><span class="nm">' + esc(s.paciente) + '</span><span class="mt">' + esc([s.profissional, s.procedimento, s.origem].filter(Boolean).join(' · ')) + '</span></span>' +
      '<span class="dir"><span class="tag fin-sem">Sem cobrança</span>' + (Number(s.valor_agenda) > 0 ? '<span class="tr">agenda ' + esc(brl(s.valor_agenda)) + '</span>' : '') + '</span>',
      function () { detalhe('sem', i); });
    b.setAttribute('aria-haspopup', 'dialog');
    return b;
  }

  /* ── lado direito ── */
  function lado(d) {
    var l = el('div', 'lado');
    l.appendChild(el('section', 'painel nota-lado', '<h2>Como ler</h2>' +
      '<p>Cada linha é um valor lançado no Feegow ou na conveniência, com a prova de que entrou:</p>' +
      '<ul class="fin-leg"><li><b>Pix</b> → entrada no banco (Inter)</li><li><b>Cartão</b> → venda na Cielo</li>' +
      '<li><b>Dinheiro</b> → contagem da gaveta</li><li><b>DOC</b> → aluguel, direto ao profissional</li></ul>' +
      '<p class="cinza">Sem totais: é a tela que as secretárias vão usar. Por enquanto, aberta só para o administrador.</p>'));
    var s = el('section', 'painel fin-provas');
    s.appendChild(el('div', 'painel-cab', '<h2>Provas</h2><span>o que já está ligado</span>'));
    [['Banco (Inter)', d.banco_ligado ? 'Robô ligado; a conferência do Pix entra na etapa 4' : 'Robô do Inter ainda não ligado'],
     ['Cielo', 'Aguardando o acesso à Cielo'],
     ['Contagem da gaveta', 'Depois da conveniência no Supabase (etapas 2 e 3)']].forEach(function (x) {
      s.appendChild(el('div', 'lj-cl', '<span>' + esc(x[0]) + '</span><b>' + esc(x[1]) + '</b>'));
    });
    l.appendChild(s);
    return l;
  }

  /* ── janela de detalhe ── */
  function campos(lista) {
    var c = el('div', 'lj-campos');
    lista.forEach(function (x) { if (x && x[1] != null && x[1] !== '') c.appendChild(el('div', 'lj-cl', '<span>' + esc(x[0]) + '</span><b>' + esc(x[1]) + '</b>')); });
    return c;
  }
  function caixaProva(forma) {
    var pv = provaDe(forma);
    return el('div', 'pp-caixa', '<span class="pp-tag fin-tag ' + pv.cls + '">Prova: ' + esc(pv.rot) + '</span><span class="pp-txt">' + esc(pv.txt) + '</span>');
  }
  function detalhe(tipo, i) {
    if (!window.moldura || !st.dados) return;
    var d = st.dados;
    var P = moldura.pop({ largura: '560px', titulo: tipo === 'conv' ? 'Conveniência' : (tipo === 'sem' ? 'Atendido sem cobrança' : 'Pagamento no Feegow') });
    if (tipo === 'pag') {
      var p = d.pagamentos[i]; if (!p) { P.fechar(); return; }
      var at = p.atendimentos || [];
      P.corpo.appendChild(el('div', 'pp-cab', '<h2>' + esc(p.paciente || 'Recebimento sem paciente') + '</h2><span class="pp-sub">' + esc(formaFeegow(p) + ' · ' + brl(p.valor) + ' · ' + diaLongo(d.dia)) + '</span>'));
      P.corpo.appendChild(campos([
        ['Valor', brl(p.valor)], ['Forma', p.forma_nome], ['Parcelas', p.parcelas || p.transacao_parcelas],
        ['Autorização do cartão', p.transacao_autorizacao], ['Número da transação', p.transacao_numero], ['Descrição', p.descricao],
        ['Conta no Feegow', 'nº ' + p.invoice_id + ' · ' + ddmm(p.conta_data) + ' · ' + brl(p.conta_valor)], ['Pagamento no Feegow', 'nº ' + p.pagamento_id]
      ]));
      var bl = el('div', 'pp-bloco');
      bl.appendChild(el('span', 'pp-rot', p.ligacao === 'feegow' ? 'Atendimento ligado na conta' : (at.length ? 'Atendimentos do paciente no dia da conta' : 'Atendimento')));
      if (!at.length) bl.appendChild(el('span', 'pp-txt', p.paciente ? 'Nenhum atendimento do paciente no dia da conta.' : 'A conta não é de paciente.'));
      at.forEach(function (a) { bl.appendChild(el('span', 'pp-txt', esc((a.horario || '—') + ' · ' + atendTxt(a)))); });
      if (p.ligacao === 'dia') bl.appendChild(el('span', 'pp-l2', 'A conta não foi ligada ao atendimento no Feegow; estes são os atendimentos do paciente no dia.'));
      P.corpo.appendChild(bl);
      P.corpo.appendChild(caixaProva(p.forma));
    } else if (tipo === 'conv') {
      var c = st.conv[i]; if (!c) { P.fechar(); return; }
      P.corpo.appendChild(el('div', 'pp-cab', '<h2>' + (c.tipo === 'venda' ? 'Venda' : 'Pagamento de notinha') + '</h2><span class="pp-sub">' +
        esc(FORMA_CONV[c.forma] + ' · ' + brl(c.valor) + ' · ' + diaLongo(d.dia) + ' às ' + horaBR(c.quando)) + '</span>'));
      var lista = [['Valor', brl(c.valor)], ['Forma', FORMA_CONV[c.forma]]];
      if (c.tipo === 'venda') lista.push(['Cliente', c.cliente + (c.profissional ? ' (pagou na hora)' : '')]);
      else lista.push(['Profissional', c.profissional_nome], ['Descrição', c.descricao]);
      lista.push(['Registrado por', c.secretaria]);
      P.corpo.appendChild(campos(lista));
      if (c.tipo === 'venda') {
        var it = el('div', 'pp-bloco'); it.appendChild(el('span', 'pp-rot', c.itens.length === 1 ? 'Produto' : 'Produtos'));
        c.itens.forEach(function (x) { it.appendChild(el('span', 'pp-txt', esc(x.nome + (x.qtd > 1 ? ' ×' + x.qtd : '') + ' · ' + brl(x.valor)))); });
        P.corpo.appendChild(it);
      }
      P.corpo.appendChild(caixaProva(c.forma));
    } else {
      var s = d.sem_cobranca[i]; if (!s) { P.fechar(); return; }
      P.corpo.appendChild(el('div', 'pp-cab', '<span class="pp-alerta">Sem cobrança no Feegow</span><h2>' + esc(s.paciente) + '</h2><span class="pp-sub">' +
        esc(diaLongo(d.dia) + ' às ' + (s.horario || '—')) + '</span>'));
      P.corpo.appendChild(campos([['Profissional', s.profissional], ['Procedimento', s.procedimento], ['Origem', s.origem],
        ['Valor na agenda', Number(s.valor_agenda) > 0 ? brl(s.valor_agenda) : '']]));
      P.corpo.appendChild(el('div', 'pp-caixa', '<span class="pp-rot">O que fazer</span><span class="pp-txt">Lançar a conta e o pagamento do paciente no Feegow. ' +
        'A linha sai daqui sozinha depois que o Feegow é lido de novo (de 3 em 3 minutos).</span>'));
    }
  }

  /* ── entrada e saída ── */
  function abrir0() {
    if (!ehAdmin()) { desenhar(); return; }
    if (!st.senha) { desenharPorta(); return; }
    desenhar();
    relogio(true);
    carregar(st.dia);
  }
  function sair() {
    relogio(false);
    st.senha = null; st.dados = null; st.conv = []; st.convErro = ''; st.erro = ''; st.dia = null; st.off = null;
    st.portaErro = ''; st.portaOcupada = false; st.pedido++;
    var r = raiz(); if (r) { r.innerHTML = ''; r.removeAttribute('data-dia'); }
  }

  return { abrir: abrir0, sair: sair, recarregar: function () { return carregar(st.dia); } };
})();
