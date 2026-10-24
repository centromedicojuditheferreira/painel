/* ═══════════════════════════════════════════════════════════════════
   Cópia do Firebase para a migração ao Supabase (Financeiro, etapa 2)
   Um botão na tela Administração → Exportar, só para o administrador.
   Só LÊ: baixa num arquivo .json tudo o que a lojinha e o login guardam no Firebase
   (secretárias, produtos, profissionais da notinha, movimentações e configurações).
   Os PINs não vão no arquivo: no lugar do pin_hash fica só "pin_definido".
   ═══════════════════════════════════════════════════════════════════ */
var MIGRA = (function () {
  'use strict';

  var COLECOES = ['secretarias', 'produtos', 'profissionais', 'movimentacoes', 'configuracoes'];
  var LOTE = 500;
  var ocupado = false;

  function ehAdmin() { return typeof isAdmin === 'function' && isAdmin(); }
  function milhar(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }

  /* Timestamp do Firestore vira {"$ts": "ISO"}; o resto vai como está */
  function limpa(v) {
    if (v == null) return v;
    if (typeof v.toDate === 'function' && typeof v.seconds === 'number') return { $ts: v.toDate().toISOString() };
    if (typeof v.toDate === 'function') { var d = v.toDate(); return { $ts: d instanceof Date ? d.toISOString() : String(d) }; }
    if (Array.isArray(v)) return v.map(limpa);
    if (typeof v === 'object') { var o = {}; Object.keys(v).forEach(function (k) { o[k] = limpa(v[k]); }); return o; }
    return v;
  }
  function semPin(nome, dados) {
    if (nome !== 'secretarias') return dados;
    var o = {}; Object.keys(dados).forEach(function (k) { if (k !== 'pin_hash') o[k] = dados[k]; });
    o.pin_definido = !!dados.pin_hash;
    return o;
  }

  /* lê a coleção inteira em lotes, pela ordem do id, para não pedir tudo de uma vez */
  function lerColecao(nome, aoAndar) {
    var docs = [];
    function lote(ultimo) {
      var q = db.collection(nome).orderBy(firebase.firestore.FieldPath.documentId()).limit(LOTE);
      if (ultimo) q = q.startAfter(ultimo);
      return q.get().then(function (snap) {
        snap.docs.forEach(function (d) { docs.push({ id: d.id, dados: semPin(nome, limpa(d.data())) }); });
        aoAndar(nome, docs.length);
        return snap.docs.length === LOTE ? lote(snap.docs[snap.docs.length - 1]) : docs;
      });
    }
    return lote(null);
  }

  function baixar(nomeArq, obj) {
    var blob = new Blob([JSON.stringify(obj, null, 1)], { type: 'application/json;charset=utf-8' });
    var url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = nomeArq; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 1000);
  }

  function exportar(btn, status) {
    if (ocupado) return;
    if (!ehAdmin()) { status.textContent = 'Só o administrador baixa a cópia.'; return; }
    if (typeof db === 'undefined' || !db || !window.firebase) { status.textContent = 'O Firebase não carregou. Recarregue a página (F5).'; return; }
    ocupado = true; btn.disabled = true; btn.textContent = 'Lendo o Firebase…';
    var saida = { gerado_em: new Date().toISOString(), projeto: 'caixa-conveniencia', versao: 1, gerado_por: (CU && CU.nome) || '',
                  observacao: 'Cópia só de leitura do Firebase do Cortex, para a migração ao Supabase. Sem os PINs.', colecoes: {} };
    var total = 0;
    COLECOES.reduce(function (p, nome) {
      return p.then(function () {
        return lerColecao(nome, function (n, k) { status.textContent = 'Lendo ' + n + '… ' + milhar(k); })
          .then(function (docs) { saida.colecoes[nome] = { total: docs.length, docs: docs }; total += docs.length; });
      });
    }, Promise.resolve()).then(function () {
      var hoje = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
      baixar('firebase_cortex_' + hoje + '.json', saida);
      status.innerHTML = '<b>Pronto:</b> ' + COLECOES.map(function (n) { return n + ' ' + milhar(saida.colecoes[n].total); }).join(' · ') +
        ' (' + milhar(total) + ' registros). Anexe o arquivo na conversa com o Claude.';
    }).catch(function (e) {
      status.textContent = 'Não consegui ler o Firebase: ' + (e && e.message ? e.message : String(e));
    }).then(function () { ocupado = false; btn.disabled = false; btn.textContent = 'Baixar cópia (.json)'; });
  }

  function montar() {
    var s = document.getElementById('s-exportar');
    if (!s || s.querySelector('.mig-card')) return;
    var box = document.createElement('div');
    box.style.cssText = 'max-width:460px;margin-top:18px';
    box.innerHTML = '<div class="card mig-card"><h3 style="font-size:15px;font-weight:600;margin-bottom:8px">Cópia do Firebase</h3>' +
      '<p style="font-size:13px;color:var(--muted);line-height:1.5;margin-bottom:12px">Baixa tudo o que a lojinha e o login guardam no Firebase, para a migração ao Supabase. ' +
      'Só lê, não altera nada, e os PINs não vão no arquivo. Basta uma vez.</p>' +
      '<button type="button" class="btn btn-p" style="width:100%;justify-content:center;padding:12px">Baixar cópia (.json)</button>' +
      '<p class="mig-status" style="font-size:13px;line-height:1.5;margin-top:10px" aria-live="polite"></p></div>';
    s.appendChild(box);
    var btn = box.querySelector('button'), status = box.querySelector('.mig-status');
    btn.addEventListener('click', function () { exportar(btn, status); });
  }
  montar();

  return { exportar: function () { var c = document.querySelector('.mig-card'); if (c) exportar(c.querySelector('button'), c.querySelector('.mig-status')); } };
})();
