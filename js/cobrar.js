/* ═══════════════════════════════════════════════════════════════════
   FIN v2.0 — quadrado "Cobrar" (02/11/2026, decisões do dono)
   Paciente Particular ou Lev Soul que chegou no Feegow (Aguardando, Chamando, Em atendimento,
   Atendido, Aguardando pagamento) aparece aqui até o Feegow ter a conta COM o pagamento e o
   valor certo (Lev Soul R$ 60 por sessão; Particular, o valor da agenda). Aluguel não entra.
   · Tudo se lança no Feegow: este quadrado só mostra e some sozinho quando o robô lê o lançamento
     (o robô lê o Feegow de 3 em 3 min; o quadrado lê o banco de minuto em minuto).
   · O Telegram (grupo Financeiro) avisa na chegada, de 10 em 10 min por 3 vezes e depois de 6 em 6 h
     (regra 'fin_cobrar' da COB); quando resolve, sai "✅ Cobrança lançada".
   · Lê fin_cobrar_lista com a sessão do Cortex. Sem o SQL FIN v2.0 (ou com a regra desligada),
     fica quieto e tenta de novo a cada 10 min.
   ═══════════════════════════════════════════════════════════════════ */
var FCOB = (function(){
"use strict";
var CFG = { url: "https://xcucoryngkkuszztpxyq.supabase.co", key: "sb_publishable_6ATQUvqBBRS5xx7jAYKlmw_2FwTuHG7" };
var IC = { esq:"M14.5 6l-6 6 6 6", dir:"M9.5 6l6 6-6 6" };
var DIAS = ["dom","seg","ter","qua","qui","sex","sáb"];
var SIT = {
  sem_lancamento:  { rot:"Nada lançado no Feegow", cor:"#D70015",
                     fazer:"Lançar no Feegow a conta e o pagamento deste paciente, com a forma certa (dinheiro, Pix, débito ou crédito) e o valor certo." },
  sem_pagamento:   { rot:"Conta sem pagamento", cor:"#D70015",
                     fazer:"A conta já está no Feegow, mas falta o pagamento. Abrir a conta e registrar o pagamento com a forma certa." },
  valor_diferente: { rot:"Valor diferente do esperado", cor:"#C93400",
                     fazer:"O valor pago não bate com o esperado. Conferir no Feegow e corrigir. Se o valor é outro de propósito, avise a Administração." }
};
var st = { itens: [], ate: 0, voando: false, denovo: false, pronto: false, ligado: false, offSrv: 0, pop: null, pinta: null };

function esc(s){ return String(s == null ? "" : s).replace(/[&<>"']/g, function(c){ return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]; }); }
function ico(d, tam, traco){
  return '<svg width="' + (tam || 16) + '" height="' + (tam || 16) + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="' + (traco || 2) +
         '" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="' + d + '"></path></svg>';
}
function novo(tag, cls, html){ var e = document.createElement(tag); if(cls) e.className = cls; if(html != null) e.innerHTML = html; return e; }
function botao(cls, html, fn){ var b = novo("button", cls, html); b.type = "button"; if(fn) b.addEventListener("click", fn); return b; }
function logado(){ return typeof CU !== "undefined" && !!CU && !!(window.LAPI && LAPI.token && LAPI.token()); }

function rpc(fn, args){
  return fetch(CFG.url + "/rest/v1/rpc/" + fn, {
    method: "POST",
    headers: { "Content-Type": "application/json", "apikey": CFG.key, "Authorization": "Bearer " + CFG.key },
    body: JSON.stringify(args || {})
  }).then(function(r){
    return r.text().then(function(t){
      var j = null; try { j = JSON.parse(t); } catch(e){}
      if(!r.ok) throw new Error((j && (j.message || j.hint || j.details)) || ("HTTP " + r.status));
      if(j && j.ok === false) throw new Error(j.erro || "ERRO");
      return j;
    });
  });
}

/* ── textos (sempre no horário de Brasília) ── */
function brl(v){ return "R$ " + Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function agoraSrv(){ return Date.now() + st.offSrv; }
function diaSP(ms){ return new Date(ms).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }); }   /* AAAA-MM-DD */
function diaTxt(d){
  var hoje = diaSP(agoraSrv()), ontem = diaSP(agoraSrv() - 864e5);
  if(d === hoje) return "hoje";
  if(d === ontem) return "ontem";
  var p = String(d || "").split("-"), dt = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  return DIAS[dt.getDay()] + " " + p[2] + "/" + p[1];
}
function horaTxt(iso){
  return new Date(iso).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
}
function desdeTxt(iso){
  if(!iso) return "";
  var d = diaSP(Date.parse(iso));
  return "desde " + (d === diaSP(agoraSrv()) ? "" : diaTxt(d) + " ") + horaTxt(iso);
}
function sitDe(x){ return SIT[x.situacao] || SIT.sem_lancamento; }
function situacaoCurta(x){
  if(x.situacao === "sem_lancamento") return "nada lançado";
  if(x.situacao === "sem_pagamento") return "conta sem pagamento";
  return "pago " + brl(x.pago) + ", esperado " + brl(x.esperado);
}
function feegowTxt(x){
  if(x.situacao === "sem_lancamento") return "Nada lançado para este paciente neste dia.";
  return "Lançado " + brl(x.lancado) + " · pago " + brl(x.pago) + (x.formas ? " (" + x.formas + ")" : "") + ".";
}

/* ── a lista ── */
function carregar(forcar){
  if(!logado()){ if(st.itens.length){ st.itens = []; avisa(); } return; }
  if(st.voando){ if(forcar) st.denovo = true; return; }
  if(!forcar && Date.now() < st.ate) return;
  st.voando = true; st.denovo = false;
  rpc("fin_cobrar_lista", { p_token: LAPI.token() })
    .then(function(d){
      st.offSrv = d && d.agora ? Date.parse(d.agora) - Date.now() : 0;
      st.ligado = !!(d && d.ligado);
      st.itens = (d && d.itens) || [];
      st.pronto = true;
      st.ate = Date.now() + (st.ligado ? 55 * 1000 : 10 * 60 * 1000);
      avisa();
    })
    .catch(function(e){
      var semSql = /Could not find the function|PGRST202|HTTP 404/.test(String(e && e.message));
      st.ate = Date.now() + (semSql ? 10 * 60 * 1000 : 60 * 1000);
      if(semSql){ st.pronto = true; st.ligado = false; }   /* sem o SQL: não segura os avisos do navegador das outras telas */
      if(st.itens.length && (semSql || (e && e.message === "SESSAO_INVALIDA"))){ st.itens = []; avisa(); }
    })
    .then(function(){ st.voando = false; if(st.denovo){ st.denovo = false; carregar(true); } });
}
function avisa(){
  if(window.GV && GV.chipsMudaram) GV.chipsMudaram();
  if(window.ALERTA) ALERTA.atualizar();
  if(st.pop && st.pop.aberto && st.pinta) st.pinta();
}

/* ── a janela ── */
function abrir(chave){
  if(!window.moldura) return;
  var vista = { item: chave || null };
  var P = moldura.pop({ largura: "640px", titulo: "Cobrança dos pacientes", aoFechar: function(){ st.pop = null; st.pinta = null; } });
  st.pop = P;
  st.pinta = function(){ if(vista.item) pintaItem(P, vista); else pintaLista(P, vista); };
  st.pinta();
  carregar(true);
}

function linhaHtml(x){
  var quando = (diaTxt(x.data) === "hoje" ? "" : diaTxt(x.data) + " ") + (x.primeira || "");
  return '<span class="w">' + esc(quando) + '</span><span class="q"><b>' + esc(x.paciente) + '</b><small>' +
         esc(x.origem + " · " + situacaoCurta(x)) + '</small></span>' +
         (x.desde ? '<span class="tr desde" title="Desde quando está aqui">' + esc(desdeTxt(x.desde)) + '</span>' : '') + ico(IC.dir, 14, 2);
}

function pintaLista(P, vista){
  var L = st.itens;
  P.corpo.innerHTML = "";
  P.corpo.appendChild(novo("div", "pp-cab",
    '<span class="pp-alerta">' + (L.length ? (L.length === 1 ? "1 paciente para cobrar" : L.length + " pacientes para cobrar") : "Ninguém para cobrar agora") + '</span>' +
    '<h2>Pacientes que chegaram sem a cobrança no Feegow</h2>'));
  P.corpo.appendChild(novo("div", "pp-caixa",
    '<span class="pp-txt">Lance no <b>Feegow</b> a conta <b>com o pagamento</b>: a forma certa e o valor certo. Lançou, o paciente sai daqui sozinho em poucos minutos.</span>' +
    '<span class="pp-l2">Lev Soul: R$ 60 por sessão. Particular: o valor da agenda. Enquanto estiver aqui, a Administração é avisada no Telegram: na chegada, de 10 em 10 minutos por 3 vezes e depois de 6 em 6 horas.</span>'));
  if(L.length){
    var b = novo("div", "pp-bloco");
    b.appendChild(novo("span", "pp-rot", "Cobrar"));
    var ul = novo("div", "pp-lista");
    L.forEach(function(x){
      var bt = botao("pp-linha", linhaHtml(x), function(){ vista.item = x.chave; st.pinta(); });
      bt.setAttribute("data-fcob", x.chave);
      ul.appendChild(bt);
    });
    b.appendChild(ul);
    P.corpo.appendChild(b);
  } else {
    P.corpo.appendChild(novo("div", "lista-vazio", '<b class="ok">Tudo cobrado</b><br>Quando um paciente Particular ou Lev Soul chegar, ele aparece aqui até a cobrança estar no Feegow.'));
  }
  P.rodape.hidden = false; P.rodape.innerHTML = ""; P.rodape.classList.add("fim");
  P.rodape.appendChild(botao("btn btn-s", "Atualizar", function(){ carregar(true); }));
  P.rodape.appendChild(botao("btn btn-s", "Fechar", function(){ P.fechar(); }));
}

function pintaItem(P, vista){
  var L = st.itens, i = -1;
  L.forEach(function(y, k){ if(y.chave === vista.item) i = k; });
  if(i < 0){ vista.item = null; pintaLista(P, vista); return; }
  var x = L[i], ant = L[i - 1], prox = L[i + 1], s = sitDe(x);
  P.corpo.innerHTML = "";
  P.corpo.appendChild(novo("div", "pp-cab",
    '<span class="pp-quando">' + esc(diaTxt(x.data) + " · " + (x.primeira || "") + (x.desde ? " · na lista " + desdeTxt(x.desde) : "")) + '</span>' +
    '<h2>' + esc(x.paciente) + '</h2>' +
    '<span class="pp-l1">' + esc(x.origem + (x.sessoes > 1 ? " · " + x.sessoes + " sessões" : "") + " · esperado " + brl(x.esperado)) + '</span>'));

  var cx = novo("div", "pp-caixa",
    '<span class="pp-tag" style="color:' + s.cor + '">' + esc(s.rot) + '</span>' +
    '<span class="pp-txt">' + esc(s.fazer) + '</span>' +
    '<span class="pp-l2">' + esc("No Feegow: " + feegowTxt(x)) + '</span>');
  if(x.avisos > 0){
    cx.appendChild(novo("span", "pp-l2", esc("Administração avisada no Telegram " + (x.avisos === 1 ? "1 vez" : x.avisos + " vezes") +
      (x.mandado_por ? " · repassado às secretárias por " + String(x.mandado_por).split(" ")[0] : "") + ".")));
  }
  P.corpo.appendChild(cx);

  var bl = novo("div", "pp-bloco");
  bl.appendChild(novo("span", "pp-rot", (x.itens || []).length === 1 ? "Atendimento" : "Atendimentos"));
  var ul = novo("div", "pp-lista");
  (x.itens || []).forEach(function(a){
    var li = novo("div", "pp-linha",
      '<span class="w">' + esc(a.hora) + '</span><span class="q"><b>' + esc(a.procedimento) + '</b><small>' +
      esc(a.profissional + " · " + a.origem) + '</small></span><span class="tr">' + esc(brl(a.valor)) + '</span>');
    li.style.cursor = "default";
    ul.appendChild(li);
  });
  bl.appendChild(ul);
  P.corpo.appendChild(bl);

  P.rodape.hidden = false; P.rodape.innerHTML = ""; P.rodape.classList.remove("fim");
  P.rodape.appendChild(botao("btn btn-s", ico(IC.esq, 16, 2.2) + "Lista", function(){ vista.item = null; st.pinta(); }));
  P.rodape.appendChild(novo("span", "pop-pos", (i + 1) + " de " + L.length));
  var dirs = novo("span", "");
  var bA = botao("btn btn-s", "Anterior", function(){ if(ant){ vista.item = ant.chave; st.pinta(); } }); bA.disabled = !ant;
  var bP = botao("btn btn-p", "Próximo" + ico(IC.dir, 16, 2.2), function(){ if(prox){ vista.item = prox.chave; st.pinta(); } }); bP.disabled = !prox;
  dirs.appendChild(bA); dirs.appendChild(document.createTextNode(" ")); dirs.appendChild(bP);
  P.rodape.appendChild(dirs);
}

/* de 15 em 15 s confere se já passou 1 minuto desde a última leitura; ao voltar para a aba, lê na hora */
setInterval(function(){ carregar(false); }, 15 * 1000);
document.addEventListener("visibilitychange", function(){ if(!document.hidden) carregar(true); });

return {
  n: function(){ return st.itens.length; },
  itens: function(){ return st.itens.slice(); },
  pronto: function(){ return st.pronto; },
  situacaoCurta: situacaoCurta,
  abrir: abrir,
  carregar: carregar
};
})();
