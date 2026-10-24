/* ═══════════════════════════════════════════════════════════════════
   LOJA v1.0 — duas telas novas dentro da entrada (#lo), no mesmo desenho:
   · troca do PIN provisório no primeiro acesso (obrigatória);
   · migração do Firebase (virada): aparece só enquanto o Supabase ainda
     não recebeu os dados. Pede a senha de administração, lê o Firebase
     (só leitura), grava no Supabase, pede um PIN provisório para cada
     pessoa ativa e conclui. Depois de concluída, nunca mais aparece.
   ═══════════════════════════════════════════════════════════════════ */
var LOGIN_LOJA = (function () {
  'use strict';

  /* Firebase antigo da conveniência: só para a leitura da migração */
  var FB = {
    versao: '10.12.0',
    config: { apiKey: 'AIzaSyBt4RC-8zLII3KFZJCYIyfGmU1zjTOjkPs', authDomain: 'caixa-conveniencia.firebaseapp.com', projectId: 'caixa-conveniencia',
              storageBucket: 'caixa-conveniencia.firebasestorage.app', messagingSenderId: '822153474776', appId: '1:822153474776:web:30cfee51f47e5735a85dad' }
  };
  var COLECOES = ['secretarias', 'produtos', 'profissionais', 'movimentacoes', 'configuracoes'];
  var ROT = { secretarias: 'Usuários do login', produtos: 'Produtos', profissionais: 'Profissionais da notinha', movimentacoes: 'Movimentações', configuracoes: 'Configurações' };
  var LOTE = 500;
  var SETA = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h13M13 6l6 6-6 6"/></svg>';

  var lo = document.getElementById('lo'), caixa = lo && lo.querySelector('.lo-caixa');
  var ops = document.getElementById('lo-ops'), senhaBox = document.getElementById('lo-senha'), err = document.getElementById('lo-err');
  var painel = null;
  if (!lo || !caixa) return { trocarPin: function (u, p, fim) { fim(); }, virada: function () {}, limpar: function () {} };

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function milhar(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }
  function erro(msg) { if (!err) return; err.textContent = msg || ''; err.style.display = msg ? 'block' : 'none'; }
  function primeiroNome(n) { return String(n || '').trim().split(/\s+/)[0] || ''; }
  function focar(i) { setTimeout(function () { if (document.body.contains(i)) i.focus(); }, 40); }

  function novoPainel(cls) {
    limpar(); erro('');
    painel = document.createElement('div'); painel.className = 'lo-painel ' + cls;
    caixa.insertBefore(painel, err || null);
    if (ops) ops.hidden = true;
    if (senhaBox) senhaBox.hidden = true;
    return painel;
  }
  /* volta a entrada ao normal (os nomes reaparecem quando a lista for recarregada); aviso de erro só some se havia um painel aberto */
  function limpar() {
    if (painel) { painel.remove(); painel = null; erro(''); }
    if (ops) ops.hidden = false;
  }

  /* ── troca do PIN provisório ── */
  function trocarPin(u, pinAtual, aoConcluir) {
    var P = novoPainel('lo-troca');
    P.innerHTML = '<p class="lo-p-tit">Olá, ' + esc(primeiroNome(u.nome)) + '. Crie o seu PIN.</p>' +
      '<p class="lo-p-txt">O PIN que você usou é provisório. Escolha um novo, de 4 a 8 números, que só você saiba.</p>' +
      '<label class="lo-sr" for="lo-novo1">PIN novo</label>' +
      '<input type="password" class="lo-p-in" id="lo-novo1" placeholder="PIN novo" maxlength="8" inputmode="numeric" autocomplete="new-password">' +
      '<div class="lo-p-linha"><label class="lo-sr" for="lo-novo2">Repita o PIN novo</label>' +
      '<input type="password" class="lo-p-in" id="lo-novo2" placeholder="Repita o PIN novo" maxlength="8" inputmode="numeric" autocomplete="new-password">' +
      '<button type="button" class="btn-lo" id="lo-novo-ok">Salvar' + SETA + '</button></div>' +
      '<button type="button" class="lo-p-volta">Voltar</button>';
    var a = P.querySelector('#lo-novo1'), b = P.querySelector('#lo-novo2'), ok = P.querySelector('#lo-novo-ok'), ocupado = false;
    function voltar(msg) {
      LAPI.sair(); limpar();
      var pin = document.getElementById('lo-pin'); if (pin) pin.value = '';
      var lista = typeof loadLoginUsers === 'function' ? loadLoginUsers() : null;
      if (msg) Promise.resolve(lista).then(function () { setTimeout(function () { erro(msg); }, 0); });   /* depois que a lista de nomes recarrega */
    }
    function salvar() {
      if (ocupado) return;
      if (!/^\d{4,8}$/.test(a.value)) { erro('O PIN novo precisa ter de 4 a 8 números.'); focar(a); return; }
      if (a.value !== b.value) { erro('Os dois PINs não são iguais. Digite de novo.'); b.value = ''; focar(b); return; }
      if (a.value === pinAtual) { erro('O PIN novo precisa ser diferente do provisório.'); a.value = ''; b.value = ''; focar(a); return; }
      ocupado = true; ok.classList.add('aguarde'); erro('');
      LAPI.trocarPin(pinAtual, a.value).then(function () {
        limpar();
        var pin = document.getElementById('lo-pin'); if (pin) pin.value = '';
        aoConcluir();
      }, function (e) {
        ocupado = false; ok.classList.remove('aguarde');
        if (e.codigo === 'SESSAO_INVALIDA' || e.codigo === 'PIN_INCORRETO' || e.codigo === 'BLOQUEADO') { voltar(e.message); return; }
        erro(e.message || String(e));
      });
    }
    ok.addEventListener('click', salvar);
    a.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); focar(b); } });
    b.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); salvar(); } });
    P.querySelector('.lo-p-volta').addEventListener('click', function () { voltar(''); });
    var e2 = document.getElementById('lo-entrar'); if (e2) e2.classList.remove('aguarde');
    focar(a);
  }

  /* ── migração do Firebase (virada) ── */
  function script(src) {
    return new Promise(function (ok, falha) {
      if (document.querySelector('script[data-virada="' + src + '"]')) { ok(); return; }
      var s = document.createElement('script'); s.src = src; s.setAttribute('data-virada', src);
      s.onload = function () { ok(); };
      s.onerror = function () { s.remove(); falha(new Error('Não consegui carregar o Firebase. Confira a internet e tente de novo.')); };
      document.head.appendChild(s);
    });
  }
  function abrirFirebase() {
    var base = 'https://www.gstatic.com/firebasejs/' + FB.versao + '/';
    return script(base + 'firebase-app-compat.js').then(function () { return script(base + 'firebase-firestore-compat.js'); }).then(function () {
      var app = (firebase.apps || []).filter(function (x) { return x.name === 'virada'; })[0] || firebase.initializeApp(FB.config, 'virada');
      return app.firestore();
    });
  }
  /* datas do Firestore viram {"$ts": "ISO"}; o resto vai como está */
  function limpa(v) {
    if (v == null) return v;
    if (typeof v.toDate === 'function') { var d = v.toDate(); return { $ts: d instanceof Date ? d.toISOString() : String(d) }; }
    if (Array.isArray(v)) return v.map(limpa);
    if (typeof v === 'object') { var o = {}; Object.keys(v).forEach(function (k) { o[k] = limpa(v[k]); }); return o; }
    return v;
  }
  function semPin(nome, dados) {   /* o PIN antigo não vai para o servidor: cada pessoa recebe um provisório */
    if (nome !== 'secretarias') return dados;
    var o = {}; Object.keys(dados).forEach(function (k) { if (k !== 'pin_hash') o[k] = dados[k]; });
    return o;
  }

  function virada() {
    var P = novoPainel('lo-virada');
    var st = { senha: '', dados: null, cont: {}, ocupado: false };

    function passoSenha(msg) {
      st.ocupado = false;
      P.innerHTML = '<p class="lo-p-tit">Migração da conveniência</p>' +
        '<p class="lo-p-txt">A conveniência e o login estão saindo do Firebase e indo para o Supabase. Falta trazer os dados, uma vez só. ' +
        'Quem faz é o administrador, com a senha de administração (a mesma do Acessos).</p>' +
        '<div class="lo-p-linha"><label class="lo-sr" for="lo-vir-senha">Senha de administração</label>' +
        '<input type="password" class="lo-p-in lo-p-senha" id="lo-vir-senha" placeholder="Senha" autocomplete="current-password">' +
        '<button type="button" class="btn-lo" id="lo-vir-ok">Começar' + SETA + '</button></div>';
      var i = P.querySelector('#lo-vir-senha');
      function ir() {
        if (st.ocupado) return;
        if (!i.value) { erro('Digite a senha de administração.'); focar(i); return; }
        st.senha = i.value; erro(''); copiar();
      }
      P.querySelector('#lo-vir-ok').addEventListener('click', ir);
      i.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); ir(); } });
      erro(msg || '');
      focar(i);
    }

    function marca(c, txt, ok) {
      var b = P.querySelector('li[data-c="' + c + '"] b'); if (!b) return;
      b.textContent = txt; b.className = ok ? 'ok' : '';
    }
    function copiar() {
      st.ocupado = true;
      P.innerHTML = '<p class="lo-p-tit">Migração da conveniência</p><p class="lo-p-txt">Copiando do Firebase para o Supabase. Não feche esta tela.</p>' +
        '<ul class="lo-p-lista">' + COLECOES.map(function (c) { return '<li data-c="' + c + '"><span>' + esc(ROT[c]) + '</span><b>aguardando</b></li>'; }).join('') + '</ul>';
      LAPI.viradaImportar(st.senha, 'configuracoes', [])            /* confere a senha antes de ler o Firebase */
        .then(abrirFirebase)
        .then(lerTudo)
        .then(function (dados) { st.dados = dados; return gravarTudo(dados); })
        .then(passoPins)
        .catch(function (e) {
          st.ocupado = false;
          if (e.codigo === 'SENHA_INVALIDA' || e.codigo === 'BLOQUEADO_TEMPORARIAMENTE') { passoSenha(e.message); return; }
          if (e.codigo === 'VIRADA_CONCLUIDA') { limpar(); if (typeof loadLoginUsers === 'function') loadLoginUsers(); return; }
          erro((e && e.message) || String(e));
          var b = document.createElement('button'); b.type = 'button'; b.className = 'btn-lo lo-p-ok'; b.innerHTML = 'Tentar de novo' + SETA;
          b.addEventListener('click', function () { erro(''); copiar(); });   /* pode repetir: o que já foi gravado não duplica */
          P.appendChild(b);
        });
    }
    function lerColecao(fs, nome) {
      var docs = [];
      function lote(ultimo) {
        var q = fs.collection(nome).orderBy(firebase.firestore.FieldPath.documentId()).limit(LOTE);
        if (ultimo) q = q.startAfter(ultimo);
        return q.get().then(function (snap) {
          snap.docs.forEach(function (d) { docs.push({ id: d.id, dados: semPin(nome, limpa(d.data())) }); });
          marca(nome, 'lendo… ' + milhar(docs.length));
          return snap.docs.length === LOTE ? lote(snap.docs[snap.docs.length - 1]) : docs;
        });
      }
      return lote(null);
    }
    function lerTudo(fs) {
      var dados = {};
      return COLECOES.reduce(function (p, nome) {
        return p.then(function () { return lerColecao(fs, nome).then(function (docs) { dados[nome] = docs; marca(nome, milhar(docs.length) + ' lidos'); }); });
      }, Promise.resolve()).then(function () { return dados; });
    }
    function gravarTudo(dados) {
      return COLECOES.reduce(function (p, nome) {
        return p.then(function () {
          var docs = dados[nome], feitos = 0, ultimo = null;
          var partes = []; for (var i = 0; i < docs.length; i += LOTE) partes.push(docs.slice(i, i + LOTE));
          if (!partes.length) partes.push([]);
          return partes.reduce(function (q, parte) {
            return q.then(function () {
              return LAPI.viradaImportar(st.senha, nome, parte).then(function (r) {
                feitos += parte.length; ultimo = r;
                marca(nome, 'gravando… ' + milhar(feitos) + ' de ' + milhar(docs.length));
              });
            });
          }, Promise.resolve()).then(function () {
            if (!ultimo || ultimo.na_tabela !== docs.length) {
              throw new Error(ROT[nome] + ': o Firebase tem ' + milhar(docs.length) + ' e o Supabase ficou com ' + milhar(ultimo ? ultimo.na_tabela : 0) + '. Tente de novo.');
            }
            st.cont[nome] = docs.length;
            marca(nome, milhar(docs.length) + ' ✓', true);
          });
        });
      }, Promise.resolve());
    }

    function passoPins() {
      st.ocupado = false;
      var ativos = st.dados.secretarias.filter(function (d) { return d.dados.ativo !== false; })
        .map(function (d) { return { id: d.id, nome: String(d.dados.nome || '').trim() || '(sem nome)' }; })
        .sort(function (a, b) { return a.nome.localeCompare(b.nome, 'pt-BR'); });
      var c = st.cont;
      P.innerHTML = '<p class="lo-p-tit">Tudo copiado.</p>' +
        '<p class="lo-p-txt">' + milhar(c.produtos) + ' produtos, ' + milhar(c.profissionais) + ' profissionais e ' + milhar(c.movimentacoes) +
        ' movimentações. Agora defina um PIN provisório para cada pessoa (4 a 8 números). No primeiro acesso, cada uma cria o seu.</p>' +
        '<div class="lo-p-pins">' + ativos.map(function (u, i) {
          return '<label class="lo-p-pin"><span>' + esc(u.nome) + '</span><input type="text" inputmode="numeric" maxlength="8" autocomplete="off" ' +
                 'placeholder="PIN provisório" data-id="' + esc(u.id) + '" data-nome="' + esc(u.nome) + '" aria-label="PIN provisório de ' + esc(u.nome) + '"></label>';
        }).join('') + '</div>' +
        '<button type="button" class="btn-lo lo-p-ok">Concluir migração' + SETA + '</button>';
      var ins = Array.prototype.slice.call(P.querySelectorAll('.lo-p-pin input'));
      ins.forEach(function (inp, i) { inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); if (ins[i + 1]) ins[i + 1].focus(); else concluir(); } }); });
      var ok = P.querySelector('.lo-p-ok');
      function concluir() {
        if (st.ocupado) return;
        var pins = {};
        for (var i = 0; i < ins.length; i++) {
          var v = ins[i].value.trim();
          if (!/^\d{4,8}$/.test(v)) { erro('Defina um PIN provisório de 4 a 8 números para ' + ins[i].getAttribute('data-nome') + '.'); focar(ins[i]); return; }
          pins[ins[i].getAttribute('data-id')] = v;
        }
        st.ocupado = true; ok.classList.add('aguarde'); erro('');
        LAPI.viradaConcluir(st.senha, st.cont, pins).then(passoPronto, function (e) {
          st.ocupado = false; ok.classList.remove('aguarde');
          if (e.codigo === 'SENHA_INVALIDA' || e.codigo === 'BLOQUEADO_TEMPORARIAMENTE') { passoSenha(e.message); return; }
          if (e.codigo === 'VIRADA_CONCLUIDA') { limpar(); if (typeof loadLoginUsers === 'function') loadLoginUsers(); return; }
          erro(e.message || String(e));
        });
      }
      ok.addEventListener('click', concluir);
      if (ins[0]) focar(ins[0]);
    }

    function passoPronto(r) {
      st.senha = '';
      var aj = (r.ajustes_estoque || []).map(function (a) { return esc(a.produto) + ' (guardado ' + a.guardado + ', lançamentos ' + a.lancamentos + ')'; });
      var an = (r.ajustes_notinha || []).map(function (a) { return esc(a.profissional); });
      P.innerHTML = '<p class="lo-p-tit">Migração concluída.</p>' +
        '<p class="lo-p-txt">A conveniência e o login agora funcionam pelo Supabase.' +
        (aj.length ? ' Estoque que não fechava com os lançamentos: ' + aj.join(', ') + '. O estoque ficou como estava; um ajuste da migração no histórico fecha a conta.' : '') +
        (an.length ? ' Notinhas com anotação da migração: ' + an.join(', ') + '.' : '') +
        ' Avise cada pessoa do PIN provisório: no primeiro acesso, ela cria o dela.</p>' +
        '<button type="button" class="btn-lo lo-p-ok">Ir para a entrada' + SETA + '</button>';
      P.querySelector('.lo-p-ok').addEventListener('click', function () { limpar(); if (typeof loadLoginUsers === 'function') loadLoginUsers(); });
    }

    passoSenha('');
  }

  return { trocarPin: trocarPin, virada: virada, limpar: limpar };
})();
