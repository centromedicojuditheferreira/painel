/* ═══════════════════════════════════════════════════════════════════
   GUIAS v1.0 (05/11/2026) — tela Guias + bloco "Guias deste paciente" na janela da Agenda.
   · A recepção procura o paciente (nome, carteirinha ou nº da guia) e vê as guias que o sistema
     tem dele, com quanto RESTA em cada uma. O "Restam" é o mesmo número da mensagem de confirmação
     do WhatsApp (régua do CONF; faltas contam como consumo, de propósito).
   · Guia que existe no SGU e não aparece aqui: "Acusar guia que falta". A acusação fica na lista
     até a guia entrar no banco (coletor ou robô de varredura) e some sozinha; se não entrar em 2 h,
     a Administração é avisada no Telegram (grupo PC Robô). Ver sql/GUIAS_v1_0.sql.
   · Tudo pelas funções cortex_guias / cortex_guia_acusar / cortex_guia_acusada_tirar, com a sessão
     do PIN. Sem o SQL no Supabase, a tela avisa e o bloco da Agenda fica escondido.
   ═══════════════════════════════════════════════════════════════════ */
var SALDO = (function () {
  'use strict';

  var SB = { url: 'https://xcucoryngkkuszztpxyq.supabase.co', key: 'sb_publishable_6ATQUvqBBRS5xx7jAYKlmw_2FwTuHG7' };
  var TZ = 'America/Sao_Paulo';
  var SEM = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
  var COD = {
    '50000470': 'Sessões de psicoterapia', '50001221': 'Consulta de psicologia',
    '2250005103': 'ABA', '50000560': 'Nutrição'
  };
  var IC = {
    lupa: 'M4.5 11a6.5 6.5 0 1 0 13 0 6.5 6.5 0 1 0-13 0M16 16l4 4',
    ok: 'M5.5 12.5l4.2 4.2 8.8-9.4',
    relogio: 'M3.5 12a8.5 8.5 0 1 0 17 0 8.5 8.5 0 1 0-17 0M12 7.5V12l3 2',
    alerta: 'M12 3.5 21.5 20h-19zM12 10v4.5M12 17.2h.01',
    seta: 'M9.5 6l6 6-6 6'
  };
  var CACHE_MS = 60 * 1000, RITMO = 2 * 60 * 1000;

  var st = {
    instalada: true, termo: '', dados: null, erro: '', pedido: 0, carregando: false,
    pacienteFixo: null,          /* veio da Agenda ("Ver na tela Guias"): busca pelo id, não pelo texto */
    vencidasAbertas: {},         /* paciente → mostrar as vencidas */
    cache: {},                   /* paciente_id → { em, dados } (bloco da Agenda) */
    timer: null, digT: null
  };

  /* ── utilidades ── */
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function bt(cls, html, fn) { var b = el('button', cls, html); b.type = 'button'; if (fn) b.addEventListener('click', fn); return b; }
  function esc(s) { var d = document.createElement('span'); d.textContent = s == null ? '' : String(s); return d.innerHTML; }
  function ico(d, t, w) {
    return '<svg width="' + (t || 16) + '" height="' + (t || 16) + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="' + (w || 2) +
      '" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="' + d + '"/></svg>';
  }
  function token() { try { return (window.LAPI && LAPI.token) ? LAPI.token() : null; } catch (e) { return null; } }
  function dataDe(iso) { return new Date(String(iso).slice(0, 10) + 'T12:00:00-03:00'); }
  function ddmm(iso) { var m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? m[3] + '/' + m[2] : '—'; }
  function ddmmaa(iso) { var m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? m[3] + '/' + m[2] + '/' + m[1] : '—'; }
  function diaSem(iso) { return iso ? SEM[dataDe(iso).getUTCDay()] + ' ' + ddmm(iso) : ''; }
  function hojeISO() { return new Date().toLocaleDateString('en-CA', { timeZone: TZ }); }
  function diasAte(iso) { return Math.round((dataDe(iso) - dataDe(hojeISO())) / 86400000); }
  function horaDe(ts) { return ts ? new Date(ts).toLocaleTimeString('pt-BR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }) : ''; }
  function quando(ts) {
    if (!ts) return '';
    var d = new Date(ts).toLocaleDateString('en-CA', { timeZone: TZ });
    return (d === hojeISO() ? 'hoje' : ddmm(d)) + ' às ' + horaDe(ts);
  }
  function cart(c) {   /* 01786835000262103 → 0178.6835000262103 (como no SGU) */
    var d = String(c || '').replace(/\D/g, '');
    if (d.length === 17) return d.slice(0, 4) + '.' + d.slice(4);
    return c || '';
  }
  function plural(n, um, varios) { return n + ' ' + (n === 1 ? um : varios); }
  function emAndamento() { return window.moldura && moldura.atual && moldura.atual() === 'saldo'; }
  function avisa(msg, ko) { if (typeof toast === 'function') toast(msg, ko ? 'ko' : 'ok'); }

  function rpc(fn, args) {
    return fetch(SB.url + '/rest/v1/rpc/' + fn, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SB.key, 'Authorization': 'Bearer ' + SB.key },
      body: JSON.stringify(args || {})
    }).then(function (r) {
      return r.text().then(function (t) {
        var j = null; try { j = JSON.parse(t); } catch (e) {}
        if (r.status === 404 || (j && j.code === 'PGRST202')) { st.instalada = false; var e1 = new Error('SEM_SQL'); e1.semSql = true; throw e1; }
        if (!r.ok) throw new Error((j && (j.message || j.hint)) || ('HTTP ' + r.status));
        st.instalada = true;
        return j;
      });
    });
  }
  function ler(args) { return rpc('cortex_guias', Object.assign({ p_token: token() }, args)); }

  /* ── uma linha de guia (tela e janela da Agenda) ── */
  function tom(g) {
    if (g.vencida) return 'venc';
    if (g.restam <= 0) return 'zero';
    if (g.restam <= 2 || diasAte(g.validade) <= 10) return 'pouco';
    return '';
  }
  function validadeTxt(g) {
    if (g.vencida) return 'venceu em ' + ddmmaa(g.validade);
    var d = diasAte(g.validade);
    if (d === 0) return 'vence hoje';
    if (d <= 10) return 'vence em ' + plural(d, 'dia', 'dias') + ' (' + ddmm(g.validade) + ')';
    return 'vale até ' + ddmmaa(g.validade);
  }
  function linhaGuia(g, curta) {
    var t = tom(g);
    var r = el('div', 'sg-g' + (t ? ' ' + t : ''));
    var nome = COD[g.codigo] || g.descricao || g.codigo;
    var esq = el('div', 'sg-g-esq');
    esq.appendChild(el('div', 'sg-g-l1', '<b>Guia ' + esc(g.numero) + '</b><span>' + esc(nome) + '</span>'));
    var l2 = esc(g.convenio) + ' · <span class="sg-val">' + esc(validadeTxt(g)) + '</span>';
    if (!curta) {
      l2 += '<br>' + esc(plural(g.autorizadas || 0, 'autorizada', 'autorizadas')) + ' · ' + esc((g.faturamento || 0) + ' no faturamento');
      if (g.a_lancar) l2 += ' · ' + esc(plural(g.a_lancar, 'feita, a lançar', 'feitas, a lançar'));
    }
    esq.appendChild(el('div', 'sg-g-l2', l2));
    r.appendChild(esq);
    var n = el('div', 'sg-g-n');
    if (g.vencida) n.innerHTML = '<b>—</b><small>vencida</small>';
    else n.innerHTML = '<b>' + Math.max(0, g.restam || 0) + '</b><small>' + (g.restam <= 0 ? 'esgotada' : (g.restam === 1 ? 'resta' : 'restam')) + '</small>';
    r.appendChild(n);
    return r;
  }

  /* ── acusações ── */
  function linhaAcusada(a, comTirar, aoMudar) {
    var r = el('div', 'sg-ac' + (a.entrou_em ? ' entrou' : ''));
    var txt = '<b>Guia ' + esc(a.numero) + '</b>' + (a.paciente ? '<span>' + esc(a.paciente) + '</span>' : '');
    r.appendChild(el('div', 'sg-ac-q', txt + '<small>Acusada por ' + esc(a.autora || '—') + ' ' + esc(quando(a.criada_em)) + '</small>'));
    if (a.entrou_em) r.appendChild(el('div', 'sg-ac-st ok', ico(IC.ok, 14, 2.4) + 'Entrou ' + esc(quando(a.entrou_em))));
    else {
      r.appendChild(el('div', 'sg-ac-st', ico(IC.relogio, 14, 2) + (a.avisada_em ? 'Ainda fora · Administração avisada' : 'Aguardando entrar')));
      if (comTirar) r.appendChild(bt('btn btn-s btn-sm', 'Tirar', function () {
        if (!window.confirm('Tirar a acusação da guia ' + a.numero + '? (Use só se o número estava errado.)')) return;
        rpc('cortex_guia_acusada_tirar', { p_token: token(), p_id: a.id }).then(function (j) {
          if (j && j.ok) { avisa('Acusação tirada.'); st.cache = {}; if (aoMudar) aoMudar(); }
          else avisa('Não consegui tirar — talvez a guia já tenha entrado.', true);
        }).catch(function () { avisa('Não consegui tirar. Confira a internet.', true); });
      }));
    }
    return r;
  }

  /* janela "Acusar guia que falta" (por cima da janela que estiver aberta) */
  function acusar(o) {
    o = o || {};
    if (!window.moldura) return;
    var P = moldura.pop({ sobre: true, largura: '480px', titulo: 'Acusar guia que falta' });
    var cx = el('div', 'pp-cab');
    if (o.paciente) cx.appendChild(el('h2', null, esc(o.paciente)));
    cx.appendChild(el('span', 'pp-l2', 'Use quando a guia <b>existe no SGU</b> e não aparece no Cortex.'));
    P.corpo.appendChild(cx);
    var lab = el('label', 'busca busca-grande sg-num');
    var campo = el('input'); campo.inputMode = 'numeric'; campo.autocomplete = 'off'; campo.placeholder = 'Número da guia no SGU (ex.: 16779223)';
    campo.value = o.numero || '';
    lab.appendChild(campo);
    P.corpo.appendChild(lab);
    var msg = el('div', 'sg-msg');
    P.corpo.appendChild(msg);
    P.corpo.appendChild(el('div', 'pp-bloco', '<span class="pp-rot">Depois de acusar</span><span class="pp-txt">O sistema fica de olho: quando a guia entrar, ' +
      'a acusação some sozinha e a consulta sai do vermelho. Se não entrar em 2 horas, a Administração é avisada.</span>'));
    P.rodape.hidden = false; P.rodape.classList.add('fim');
    var bC = bt('btn btn-s', 'Cancelar', function () { P.fechar(); });
    var bA = bt('btn btn-p', 'Acusar', enviar);
    P.rodape.appendChild(bC); P.rodape.appendChild(bA);
    campo.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') enviar(); });
    setTimeout(function () { try { campo.focus(); } catch (e) {} }, 30);

    function diz(html, ko) { msg.innerHTML = html; msg.className = 'sg-msg' + (ko ? ' ko' : ' ok'); }
    function enviar() {
      var num = (campo.value || '').replace(/\D/g, '');
      if (num.length < 6 || num.length > 12) { diz('Número esquisito — a guia tem só números (ex.: 16779223).', true); return; }
      bA.disabled = true; bA.textContent = 'Acusando…';
      rpc('cortex_guia_acusar', { p_token: token(), p_numero: num, p_paciente_id: o.pacienteId || null, p_agendamento_id: o.agendamentoId || null })
        .then(function (j) {
          bA.disabled = false; bA.textContent = 'Acusar';
          if (!j) throw new Error('vazio');
          if (j.ok) {
            st.cache = {};
            if (o.aoAcusar) o.aoAcusar();
            P.fechar();
            avisa(j.ja ? 'Essa guia já estava acusada (por ' + (j.acusada.autora || '—') + '). Aguardando entrar.' : 'Guia ' + num + ' acusada. Quando entrar no sistema, some sozinha.');
            return;
          }
          if (j.erro === 'NUMERO_INVALIDO') { diz('Número esquisito — a guia tem só números (ex.: 16779223).', true); return; }
          if (j.erro === 'JA_NO_BANCO') { diz(jaNoBanco(j.guia), true); return; }
          if (j.erro === 'SESSAO_INVALIDA') { diz('Sua sessão terminou. Entre de novo no Cortex.', true); return; }
          diz('Não consegui acusar (' + esc(j.erro || '?') + ').', true);
        })
        .catch(function (e) {
          bA.disabled = false; bA.textContent = 'Acusar';
          diz(e && e.semSql ? 'A Administração ainda não ligou esta função (falta o SQL das Guias).' : 'Não consegui acusar. Confira a internet e tente de novo.', true);
        });
    }
  }
  function jaNoBanco(g) {
    var c = '<b>' + esc(cart(g.carteirinha)) + '</b>';
    if (g.deste_paciente) return 'Essa guia <b>já está no sistema</b> e é deste paciente' + (g.validade ? ' (' + esc(validadeTxt({ validade: g.validade, vencida: diasAte(g.validade) < 0 })) + ')' : '') + '. Não precisa acusar.';
    var f = (g.fichas || []).map(function (x) { return x.nome; });
    if (f.length) return 'Essa guia <b>já está no sistema</b>, mas a carteirinha ' + c + ' está na ficha de <b>' + esc(f.join(', ')) + '</b>. ' +
      'Confira no Feegow se a carteirinha está no paciente certo.';
    return 'Essa guia <b>já está no sistema</b>, mas a carteirinha ' + c + (g.nome_sgu ? ' (' + esc(g.nome_sgu) + ' no SGU)' : '') +
      ' <b>não está na ficha de ninguém</b> no Feegow. Coloque essa carteirinha na ficha do paciente certo: em até 15 minutos a guia aparece aqui.';
  }

  /* ═══ a tela ═══ */
  function sec() { return document.getElementById('s-saldo'); }
  function abrir() {
    var s = sec(); if (!s) return;
    if (!s.querySelector('.sg')) montar(s);
    resumir();
    buscar(true);
    clearInterval(st.timer);
    st.timer = setInterval(function () { if (emAndamento() && !document.hidden) buscar(true); }, RITMO);
  }
  function montar(s) {
    s.innerHTML = '';
    var w = el('div', 'sg');
    var topo = el('div', 'sg-topo');
    var lab = el('label', 'busca busca-grande sg-busca', ico(IC.lupa, 18, 2));
    var campo = el('input'); campo.type = 'search'; campo.id = 'sg-campo'; campo.autocomplete = 'off';
    campo.placeholder = 'Nome do paciente, carteirinha ou número da guia';
    campo.setAttribute('aria-label', 'Procurar guias por nome, carteirinha ou número da guia');
    lab.appendChild(campo);
    topo.appendChild(lab);
    topo.appendChild(bt('btn btn-s sg-acusar', 'Acusar guia que falta', function () { acusar({ aoAcusar: function () { buscar(true); } }); }));
    w.appendChild(topo);
    w.appendChild(el('div', 'sg-dica', 'O número <b>Restam</b> é o mesmo da mensagem de confirmação que o paciente recebe no WhatsApp: já desconta as sessões feitas (faltas também contam).'));
    w.appendChild(el('div', 'sg-acs'));
    w.appendChild(el('div', 'sg-res'));
    s.appendChild(w);
    campo.addEventListener('input', function () {
      st.pacienteFixo = null;
      clearTimeout(st.digT);
      st.digT = setTimeout(function () { buscar(); }, 450);
    });
    campo.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') { clearTimeout(st.digT); st.pacienteFixo = null; buscar(); } });
  }
  function buscar(quieto) {
    var campo = document.getElementById('sg-campo');
    var termo = campo ? campo.value.trim() : '';
    st.termo = termo;
    var args = st.pacienteFixo ? { p_paciente_id: st.pacienteFixo.id } : { p_termo: termo };
    var meu = ++st.pedido;
    if (!quieto) { st.carregando = true; desenhar(); }
    ler(args).then(function (j) {
      if (meu !== st.pedido) return;
      st.carregando = false;
      if (!j || !j.ok) { st.erro = (j && j.erro === 'SESSAO_INVALIDA') ? 'Sua sessão terminou. Entre de novo.' : 'Não consegui ler as guias.'; desenhar(); return; }
      st.erro = ''; st.dados = j;
      desenhar(); resumir();
    }).catch(function (e) {
      if (meu !== st.pedido) return;
      st.carregando = false;
      st.erro = e && e.semSql ? 'SEM_SQL' : 'Não consegui ler as guias. Confira a internet.';
      desenhar();
    });
  }
  function resumir() {
    if (!window.moldura) return;
    var d = st.dados, n = d ? (d.acusadas || []).filter(function (a) { return !a.entrou_em; }).length : 0;
    moldura.resumo('saldo', n ? plural(n, 'guia acusada aguardando entrar', 'guias acusadas aguardando entrar') : '');
  }
  function desenhar() {
    var s = sec(); if (!s) return;
    var acs = s.querySelector('.sg-acs'), res = s.querySelector('.sg-res');
    if (!acs || !res) return;
    acs.innerHTML = ''; res.innerHTML = '';
    if (st.erro === 'SEM_SQL') {
      res.appendChild(el('div', 'sg-vazio', '<b>A tela Guias ainda não está ligada.</b><br>Falta a Administração rodar o <span class="mono">sql/GUIAS_v1_0.sql</span> no Supabase.'));
      return;
    }
    if (st.erro) { res.appendChild(el('div', 'sg-vazio ko', esc(st.erro))); return; }
    var d = st.dados;

    /* acusações (as abertas de todos + as que entraram nas últimas 24 h) */
    var lista = d ? d.acusadas || [] : [];
    if (lista.length) {
      var abertas = lista.filter(function (a) { return !a.entrou_em; }).length;
      var box = el('div', 'sg-box');
      box.appendChild(el('div', 'sg-box-cab', '<b>Guias acusadas</b><small>' +
        (abertas ? esc(plural(abertas, 'aguardando entrar no sistema', 'aguardando entrar no sistema')) : 'todas já entraram') + '</small>'));
      lista.forEach(function (a) { box.appendChild(linhaAcusada(a, true, function () { buscar(true); })); });
      acs.appendChild(box);
    }

    if (st.carregando) { res.appendChild(el('div', 'sg-vazio', 'Procurando…')); return; }
    if (!d) return;
    if (d.modo === 'curto') {
      res.appendChild(el('div', 'sg-vazio', st.termo ? 'Escreva pelo menos 3 letras do nome, a carteirinha ou o número da guia.' :
        'Procure pelo <b>nome</b> do paciente (3 letras ou mais), pela <b>carteirinha</b> ou pelo <b>número da guia</b>.'));
      return;
    }
    var pacs = d.pacientes || [], orfas = d.orfas || [];
    if (!pacs.length && !orfas.length) {
      var v = el('div', 'sg-vazio');
      if (d.modo === 'guia') {
        v.innerHTML = 'A guia <b>' + esc(d.numero) + '</b> não está no sistema.<br>Se ela existe no SGU, acuse: quando entrar, some sozinha.';
        v.appendChild(el('br'));
        v.appendChild(bt('btn btn-p sg-vz-bt', 'Acusar a guia ' + esc(d.numero), function () { acusar({ numero: d.numero, aoAcusar: function () { buscar(true); } }); }));
      } else if (d.modo === 'carteirinha') v.innerHTML = 'Nenhuma ficha com essa carteirinha, e nenhuma guia dela no sistema.';
      else v.innerHTML = 'Nenhum paciente Unimed com esse nome.';
      res.appendChild(v);
      return;
    }
    pacs.forEach(function (p) { res.appendChild(cartaoPaciente(p)); });
    if (d.mais) res.appendChild(el('div', 'sg-mais', 'Mostrando os 12 primeiros. Escreva mais do nome para achar o paciente.'));
    if (orfas.length) res.appendChild(cartaoOrfas(orfas));
  }
  function cartaoPaciente(p) {
    var c = el('section', 'sg-pac');
    var cab = el('div', 'sg-pac-cab');
    var q = el('div', 'sg-pac-q', '<h3>' + esc(p.nome) + '</h3>');
    var carts = (p.carteirinhas || []).map(cart).filter(Boolean);
    q.appendChild(el('small', null, carts.length ? 'Carteirinha ' + esc(carts.join(' · ')) : 'Sem carteirinha Unimed na ficha'));
    cab.appendChild(q);
    if (p.proxima) cab.appendChild(el('div', 'sg-prox', '<small>Próxima consulta</small><b>' + esc(diaSem(p.proxima.data)) + ' · ' + esc(p.proxima.hora) + '</b>'));
    c.appendChild(cab);
    var gs = p.guias || [];
    var vivas = gs.filter(function (g) { return !g.vencida; }), venc = gs.filter(function (g) { return g.vencida; });
    var corpo = el('div', 'sg-pac-corpo');
    if (vivas.length) vivas.forEach(function (g) { corpo.appendChild(linhaGuia(g)); });
    else corpo.appendChild(el('div', 'sg-nenhuma', ico(IC.alerta, 16, 2) + '<span>Nenhuma guia viva no sistema para este paciente.</span>'));
    if (venc.length) {
      var aberta = !!st.vencidasAbertas[p.id];
      var t = bt('sg-venc-bt', (aberta ? 'Esconder' : 'Ver') + ' ' + plural(venc.length, 'guia vencida', 'guias vencidas') + ' (últimos 60 dias)', function () {
        st.vencidasAbertas[p.id] = !aberta; desenhar();
      });
      t.setAttribute('aria-expanded', aberta ? 'true' : 'false');
      corpo.appendChild(t);
      if (aberta) venc.forEach(function (g) { corpo.appendChild(linhaGuia(g)); });
    }
    c.appendChild(corpo);
    var pe = el('div', 'sg-pac-pe');
    pe.appendChild(bt('sg-link', 'A guia está no SGU e não aparece aqui? <b>Acusar</b>', function () {
      acusar({ paciente: p.nome, pacienteId: p.id, aoAcusar: function () { buscar(true); } });
    }));
    c.appendChild(pe);
    return c;
  }
  function cartaoOrfas(orfas) {
    var c = el('section', 'sg-pac sg-orfas');
    c.appendChild(el('div', 'sg-pac-cab', '<div class="sg-pac-q"><h3>Guias sem ficha no Feegow</h3><small>A carteirinha da guia não está no cadastro de nenhum paciente. ' +
      'Coloque a carteirinha na ficha certa no Feegow: em até 15 minutos a guia passa a aparecer no paciente.</small></div>'));
    var corpo = el('div', 'sg-pac-corpo');
    orfas.forEach(function (g) {
      var r = linhaGuia(g);
      var l1 = r.querySelector('.sg-g-l1');
      if (l1 && g.nome_sgu) l1.appendChild(el('em', null, 'no SGU: ' + esc(g.nome_sgu) + ' · ' + esc(cart(g.carteirinha))));
      corpo.appendChild(r);
    });
    c.appendChild(corpo);
    return c;
  }

  /* abre a tela já no paciente (botão "Ver na tela Guias" da janela da Agenda) */
  function mostrarPaciente(id, nome) {
    st.pacienteFixo = { id: id, nome: nome };
    if (window.irPara) irPara('saldo');
    setTimeout(function () {
      var campo = document.getElementById('sg-campo');
      if (campo) campo.value = nome || '';
      st.pacienteFixo = { id: id, nome: nome };
      buscar();
    }, 0);
  }

  /* ═══ bloco "Guias deste paciente" na janela da Agenda ═══ */
  function blocoPaciente(alvo, l) {
    if (!alvo || !l || !l.paciente_id || !st.instalada) { if (alvo) alvo.hidden = true; return; }
    var id = l.paciente_id;
    var b = el('div', 'pp-bloco sg-bloco');
    b.appendChild(el('span', 'pp-rot', 'Guias deste paciente no sistema'));
    var corpo = el('div', 'sg-bloco-corpo', '<span class="sg-mini-vz">Procurando as guias…</span>');
    b.appendChild(corpo);
    alvo.innerHTML = ''; alvo.appendChild(b); alvo.hidden = false;
    var c = st.cache[id];
    if (c && Date.now() - c.em < CACHE_MS) { pintar(c.dados); return; }
    ler({ p_paciente_id: id }).then(function (j) {
      if (!j || !j.ok) { alvo.hidden = true; return; }
      st.cache[id] = { em: Date.now(), dados: j };
      pintar(j);
    }).catch(function () { alvo.hidden = true; });

    function pintar(j) {
      if (!alvo.isConnected) return;
      corpo.innerHTML = '';
      var p = (j.pacientes || [])[0] || { guias: [] };
      var vivas = (p.guias || []).filter(function (g) { return !g.vencida; });
      var venc = (p.guias || []).filter(function (g) { return g.vencida; });
      if (vivas.length) vivas.forEach(function (g) { corpo.appendChild(linhaGuia(g, true)); });
      else corpo.appendChild(el('div', 'sg-nenhuma', ico(IC.alerta, 16, 2) + '<span>Nenhuma guia viva no sistema' +
        (venc.length ? ' (' + plural(venc.length, 'vencida', 'vencidas') + ' nos últimos 60 dias)' : '') + '.</span>'));
      (j.acusadas || []).forEach(function (a) { corpo.appendChild(linhaAcusada(a, false)); });
      var bts = el('div', 'sg-bloco-bts');
      bts.appendChild(bt('btn btn-s btn-sm', 'Acusar guia que falta', function () {
        acusar({ paciente: l.paciente, pacienteId: id, agendamentoId: l.agendamento_id, aoAcusar: function () { delete st.cache[id]; blocoPaciente(alvo, l); } });
      }));
      bts.appendChild(bt('btn btn-s btn-sm', 'Ver na tela Guias', function () { mostrarPaciente(id, l.paciente); }));
      corpo.appendChild(bts);
    }
  }

  return { abrir: abrir, acusar: acusar, blocoPaciente: blocoPaciente, mostrarPaciente: mostrarPaciente };
})();
