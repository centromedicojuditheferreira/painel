/* ═══════════════════════════════════════════════════════════════════
   PROF_COBRA v1.0 — quadrado "Profissionais" (30/10/2026)
   A recepção cobra pelo WhatsApp os profissionais que ainda não confirmaram a agenda.
   · Semana: segunda 18h, terça 9h e terça 17h (dia do prazo e dia da trava).
     Fim do mês: dia 1º às 11h e às 15h; depois, todo dia às 9h até o profissional confirmar.
     Domingo, feriado ou fora do expediente: próximo dia aberto, 9h. Sem consulta no período: não cobra.
   · Lê prof_cobranca_lista com a sessão do Cortex (de minuto em minuto); "Enviei" grava em prof_cobranca_enviei.
   · Semana: o "Enviei" tira o profissional da lista até a próxima hora da régua.
     Fim do mês: ele continua na lista, esperando, até confirmar.
   · Sem o "Enviei" em 40 min, o Telegram avisa no grupo (cob_regras 'prof_cobranca'), e de hora em hora.
   Sem o SQL PROF_COBRA v1.0 no banco, fica quieto (tenta de novo a cada 10 min).
   ═══════════════════════════════════════════════════════════════════ */
var PCOB = (function(){
"use strict";
var CFG = { url: "https://xcucoryngkkuszztpxyq.supabase.co", key: "sb_publishable_6ATQUvqBBRS5xx7jAYKlmw_2FwTuHG7" };
var IC = { esq:"M14.5 6l-6 6 6 6", dir:"M9.5 6l6 6-6 6", ok:"M5.5 12.5l4.2 4.2 8.8-9.4",
           wpp:"M20.5 11.6a8.5 8.5 0 0 1-12.6 7.4L3.5 20.5l1.5-4.3A8.5 8.5 0 1 1 20.5 11.6z" };
var MESES = ["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];
var DIAS = ["dom","seg","ter","qua","qui","sex","sáb"];
var MSG = {
  SESSAO_INVALIDA: "Sua sessão no Cortex caiu. Saia e entre de novo.",
  TROCAR_PIN: "Troque o seu PIN antes de continuar.",
  COBRANCA_MUDOU: "Esta cobrança mudou: o profissional confirmou ou chegou a próxima hora da régua. A lista foi atualizada."
};
var st = { itens: [], ate: 0, voando: false, denovo: false, geracao: 0, offSrv: 0, alertaMin: 40, pop: null, pinta: null };

function esc(s){ return String(s == null ? "" : s).replace(/[&<>"']/g, function(c){ return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]; }); }
function ico(d, tam, traco){
  return '<svg width="' + (tam || 16) + '" height="' + (tam || 16) + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="' + (traco || 2) +
         '" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="' + d + '"></path></svg>';
}
function novo(tag, cls, html){ var e = document.createElement(tag); if(cls) e.className = cls; if(html != null) e.innerHTML = html; return e; }
function botao(cls, html, fn){ var b = novo("button", cls, html); b.type = "button"; if(fn) b.addEventListener("click", fn); return b; }
function logado(){ return typeof CU !== "undefined" && !!CU && !!(window.LAPI && LAPI.token && LAPI.token()); }
function humano(e){ return MSG[e && e.message] || ("Não deu certo: " + (e && e.message)); }

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

/* ── datas e textos (sempre no horário de Brasília) ── */
function agoraSrv(){ return Date.now() + st.offSrv; }
function diaSP(ms){ return new Date(ms).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }); }   /* AAAA-MM-DD */
function horaTxt(iso){
  return new Date(iso).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .replace(/^0(\d)/, "$1").replace(/:00$/, "h");
}
function diaTxt(iso){
  var d = diaSP(Date.parse(iso)), hoje = diaSP(agoraSrv()), ontem = diaSP(agoraSrv() - 864e5), amanha = diaSP(agoraSrv() + 864e5);
  if(d === hoje) return "hoje";
  if(d === ontem) return "ontem";
  if(d === amanha) return "amanhã";
  var p = d.split("-"), dt = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  return DIAS[dt.getDay()] + " " + p[2] + "/" + p[1];
}
function quandoTxt(iso){ return iso ? diaTxt(iso) + " às " + horaTxt(iso) : ""; }
function ddmm(s){ var p = String(s || "").slice(0, 10).split("-"); return p[2] + "/" + p[1]; }
function mesDe(s){ return MESES[Number(String(s || "").slice(5, 7)) - 1] || ""; }
function perTxt(x){
  return x.tipo === "fechamento_mes"
    ? "Fechamento de " + mesDe(x.periodo_fim) + " (" + ddmm(x.periodo_inicio) + " a " + ddmm(x.periodo_fim) + ")"
    : "Agenda de " + ddmm(x.periodo_inicio) + " a " + ddmm(x.periodo_fim);
}
function avisoTxt(x){ return (x.tipo !== "fechamento_mes" && x.ultimo) ? "último aviso" : x.n_momento + "º aviso"; }
function primeiroNome(s){ return String(s || "").split(" ")[0]; }
function normTel(t){ var d = String(t || "").replace(/\D/g, ""); if(d.length === 10 || d.length === 11) d = "55" + d; return /^55\d{10,11}$/.test(d) ? d : ""; }
function foneBonito(d){ var s = d.slice(2); return "(" + s.slice(0, 2) + ") " + s.slice(2, s.length - 4) + "-" + s.slice(-4); }
function linkWpp(tel, txt){ return "https://web.whatsapp.com/send?phone=" + tel + "&text=" + encodeURIComponent(txt); }

/* ── a lista ── */
function chaveDe(x){ return x.profissional_id + "|" + x.chave + "|" + x.momento; }
function aEnviar(){ return st.itens.filter(function(x){ return x.situacao === "a_enviar"; }); }
function esperando(){ return st.itens.filter(function(x){ return x.situacao !== "a_enviar"; }); }
function ordenada(){ return aEnviar().concat(esperando()); }

function carregar(forcar){
  if(!logado()){ if(st.itens.length){ st.itens = []; avisa(); } return; }
  if(st.voando){ if(forcar) st.denovo = true; return; }   /* já tem uma leitura no ar: lê de novo quando ela voltar */
  if(!forcar && Date.now() < st.ate) return;
  st.voando = true; st.denovo = false;
  var ger = st.geracao;
  rpc("prof_cobranca_lista", { p_token: LAPI.token() })
    .then(function(d){
      if(ger !== st.geracao){ st.denovo = true; return; }   /* saiu um "Enviei" enquanto lia: esta leitura já é velha */
      st.offSrv = d && d.agora ? Date.parse(d.agora) - Date.now() : 0;
      st.alertaMin = (d && d.alerta_min) || 40;
      st.itens = ((d && d.itens) || []).map(function(x){ x.telefone = normTel(x.telefone); return x; });
      st.ate = Date.now() + 55 * 1000;
      avisa();
    })
    .catch(function(e){
      var semSql = /Could not find the function|PGRST202|HTTP 404/.test(String(e && e.message));
      st.ate = Date.now() + (semSql ? 10 * 60 * 1000 : 60 * 1000);
      if(st.itens.length && (semSql || (e && e.message === "SESSAO_INVALIDA"))){ st.itens = []; avisa(); }
    })
    .then(function(){ st.voando = false; if(st.denovo){ st.denovo = false; carregar(true); } });
}
function avisa(){
  if(window.GV && GV.chipsMudaram) GV.chipsMudaram();
  if(st.pop && st.pop.aberto && st.pinta) st.pinta();
}

/* ── a janela ── */
function abrir(chave){
  if(!window.moldura) return;
  var vista = { item: chave || null };
  var P = moldura.pop({ largura: "660px", titulo: "Cobrança dos profissionais", aoFechar: function(){ st.pop = null; st.pinta = null; } });
  st.pop = P;
  st.pinta = function(){ if(vista.item) pintaItem(P, vista); else pintaLista(P, vista); };
  st.pinta();
  carregar(true);
}

function linhaHtml(x){
  if(x.situacao === "a_enviar"){
    return '<span class="w">' + esc(horaTxt(x.momento)) + '</span><span class="q"><b>' + esc(x.nome) + '</b><small>' +
           esc(perTxt(x) + " · " + avisoTxt(x)) + '</small></span>' +
           '<span class="tr desde" title="Hora desta cobrança">desde ' + esc(quandoTxt(x.momento).replace(/^hoje às /, "")) + '</span>' + ico(IC.dir, 14, 2);
  }
  return '<span class="w">' + ico(IC.ok, 14, 2.4) + '</span><span class="q"><b>' + esc(x.nome) + '</b><small>' +
         esc("Enviada " + quandoTxt(x.enviada_em) + (x.enviada_por ? " por " + primeiroNome(x.enviada_por) : "") +
             (x.proximo ? " · próxima: " + quandoTxt(x.proximo) : "")) + '</small></span>' + ico(IC.dir, 14, 2);
}

function pintaLista(P, vista){
  var A = aEnviar(), E = esperando();
  P.corpo.innerHTML = "";
  P.corpo.appendChild(novo("div", "pp-cab",
    '<span class="pp-alerta">' + (A.length ? (A.length === 1 ? "1 mensagem para mandar" : A.length + " mensagens para mandar") : "Nada para mandar agora") + '</span>' +
    '<h2>Profissionais sem confirmar a agenda</h2>'));
  P.corpo.appendChild(novo("div", "pp-caixa",
    '<span class="pp-txt">Abra cada profissional, mande a <b>mensagem pronta</b> pelo WhatsApp e toque em <b>Enviei</b>.</span>' +
    '<span class="pp-l2">Sem o Enviei em ' + st.alertaMin + ' minutos, a Administração é avisada no Telegram, e de novo a cada hora.</span>'));
  function grupo(rot, L){
    var b = novo("div", "pp-bloco");
    b.appendChild(novo("span", "pp-rot", esc(rot)));
    var ul = novo("div", "pp-lista");
    L.forEach(function(x){
      var bt = botao("pp-linha", linhaHtml(x), function(){ vista.item = chaveDe(x); st.pinta(); });
      bt.setAttribute("data-pcob", chaveDe(x));
      ul.appendChild(bt);
    });
    b.appendChild(ul);
    P.corpo.appendChild(b);
  }
  if(A.length) grupo("Mandar agora", A);
  if(E.length) grupo("Fim do mês: mensagem enviada, esperando o profissional confirmar", E);
  if(!A.length && !E.length) P.corpo.appendChild(novo("div", "lista-vazio", '<b class="ok">Ninguém para cobrar agora</b><br>Quando chegar a hora de uma cobrança, o quadrado Profissionais aparece no alto da tela.'));
  P.rodape.hidden = false; P.rodape.innerHTML = ""; P.rodape.classList.add("fim");
  P.rodape.appendChild(botao("btn btn-s", "Fechar", function(){ P.fechar(); }));
}

function pintaItem(P, vista){
  var L = ordenada();
  var i = -1;
  L.forEach(function(y, k){ if(chaveDe(y) === vista.item) i = k; });
  if(i < 0){ vista.item = null; pintaLista(P, vista); return; }
  var x = L[i], ant = L[i - 1], prox = L[i + 1];
  var mandar = x.situacao === "a_enviar";
  P.corpo.innerHTML = "";
  P.corpo.appendChild(novo("div", "pp-cab",
    '<span class="pp-quando">' + esc("Cobrança " + (x.tipo === "fechamento_mes" ? "do fim do mês" : "da semana") + " · " + avisoTxt(x) + " · " + quandoTxt(x.momento)) + '</span>' +
    '<h2>' + esc(x.nome) + '</h2>' +
    '<span class="pp-l1">' + esc(perTxt(x) + " · " + x.consultas + (x.consultas === 1 ? " consulta" : " consultas")) + '</span>'));

  var cx;
  if(mandar){
    cx = novo("div", "pp-caixa",
      '<span class="pp-tag" style="color:#D70015">Mandar agora</span>' +
      '<span class="pp-txt">Abra o WhatsApp com a mensagem pronta, envie e toque em <b>Enviei</b>.</span>');
    var depois = x.tipo === "fechamento_mes"
      ? "Fim do mês: ele continua na lista até confirmar." + (x.proximo ? " Próxima cobrança: " + quandoTxt(x.proximo) + "." : "")
      : (x.proximo ? "Se ele não confirmar, a próxima cobrança é " + quandoTxt(x.proximo) + "."
                   : "É o último aviso: a conferência trava " + quandoTxt(x.fechamento) + ".");
    cx.appendChild(novo("span", "pp-l2", esc(depois)));
  } else {
    cx = novo("div", "pp-caixa",
      '<span class="pp-tag" style="color:#248A3D">Mensagem enviada</span>' +
      '<span class="pp-txt">' + esc("Enviada " + quandoTxt(x.enviada_em) + (x.enviada_por ? " por " + x.enviada_por : "") + ". Agora é esperar ele confirmar.") + '</span>' +
      (x.proximo ? '<span class="pp-l2">' + esc("Próxima cobrança: " + quandoTxt(x.proximo) + ".") + '</span>' : ""));
  }
  P.corpo.appendChild(cx);

  var fone = novo("div", "pp-fone");
  if(x.telefone){
    fone.innerHTML = '<span><small>Celular</small><b>' + esc(foneBonito(x.telefone)) + '</b></span>';
    var bc = botao("btn btn-s btn-sm", "Copiar", function(){ copia(x.telefone.slice(2), bc, "Copiado", "Copiar"); });
    bc.title = "Copiar o número (só dígitos, sem o 55)";
    fone.appendChild(bc);
  } else {
    fone.innerHTML = '<span><small>Celular</small><b class="falha-semcel">Sem celular no cadastro do profissional</b></span>';
  }
  P.corpo.appendChild(fone);
  if(!x.telefone) P.corpo.appendChild(novo("span", "pp-l2", "Cadastre o celular na Conferência (janela do profissional) e volte aqui."));

  var bm = novo("div", "pp-bloco");
  var cab = novo("div", "pp-msg-cab", '<span class="pp-rot">Mensagem pronta</span>');
  var acoes = novo("span", "falha-acoes");
  var bmsg = botao("btn btn-s btn-sm", "Copiar", function(){ copia(x.texto || "", bmsg, "Copiada", "Copiar"); });
  bmsg.title = "Copiar só o texto";
  acoes.appendChild(bmsg);
  var a = null;
  if(x.telefone && x.texto){
    a = novo("a", "btn btn-p btn-sm falha-wpp", ico(IC.wpp, 15, 2) + "Abrir no WhatsApp");
    a.href = linkWpp(x.telefone, x.texto); a.target = "whatsapp_cmjf"; a.rel = "noopener";
    a.title = "Abre o WhatsApp Web na conversa, com a mensagem já escrita: é só apertar enviar";
    acoes.appendChild(a);
  } else {
    var off = botao("btn btn-p btn-sm", "Abrir no WhatsApp"); off.disabled = true;
    off.title = x.telefone ? "Sem mensagem pronta" : "Sem celular no cadastro do profissional";
    acoes.appendChild(off);
  }
  if(mandar){
    var be = botao("btn btn-s btn-sm falha-mandei", ico(IC.ok, 14, 2.4) + "Enviei", function(){
      enviei(x, be, function(){
        var seguinte = aEnviar().filter(function(y){ return chaveDe(y) !== chaveDe(x); })[0];
        vista.item = seguinte ? chaveDe(seguinte) : null;
        st.pinta();
      });
    });
    be.title = "Toque depois de mandar a mensagem no WhatsApp";
    acoes.appendChild(be);
    if(a) a.addEventListener("click", function(){ be.className = "btn btn-p btn-sm falha-mandei"; });
  }
  cab.appendChild(acoes);
  bm.appendChild(cab);
  bm.appendChild(novo("div", "pp-msg", esc(x.texto || "—")));
  P.corpo.appendChild(bm);

  P.rodape.hidden = false; P.rodape.innerHTML = ""; P.rodape.classList.remove("fim");
  P.rodape.appendChild(botao("btn btn-s", ico(IC.esq, 16, 2.2) + "Lista", function(){ vista.item = null; st.pinta(); }));
  P.rodape.appendChild(novo("span", "pop-pos", (i + 1) + " de " + L.length));
  var dirs = novo("span", "");
  var bA = botao("btn btn-s", "Anterior", function(){ if(ant){ vista.item = chaveDe(ant); st.pinta(); } }); bA.disabled = !ant;
  var bP = botao("btn btn-p", "Próxima" + ico(IC.dir, 16, 2.2), function(){ if(prox){ vista.item = chaveDe(prox); st.pinta(); } }); bP.disabled = !prox;
  dirs.appendChild(bA); dirs.appendChild(document.createTextNode(" ")); dirs.appendChild(bP);
  P.rodape.appendChild(dirs);
}

function copia(txt, el, ok, base){
  (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject())
    .then(function(){ el.textContent = ok; setTimeout(function(){ el.textContent = base; }, 2200); },
          function(){ window.prompt("Copie:", txt); });
}

function enviei(x, btn, depois){
  btn.disabled = true; btn.textContent = "Salvando…";
  rpc("prof_cobranca_enviei", { p_token: LAPI.token(), p_profissional_id: x.profissional_id, p_chave: x.chave, p_momento: x.momento })
    .then(function(){
      st.geracao++;
      if(x.tipo === "fechamento_mes"){
        x.situacao = "enviada";
        x.enviada_em = new Date(agoraSrv()).toISOString();
        x.enviada_por = (typeof CU !== "undefined" && CU && CU.nome) || null;
      } else {
        st.itens = st.itens.filter(function(y){ return chaveDe(y) !== chaveDe(x); });
      }
      depois();
      avisa();
      carregar(true);
    })
    .catch(function(e){
      if(e && e.message === "COBRANCA_MUDOU"){
        st.geracao++;
        alert(MSG.COBRANCA_MUDOU);
        st.itens = st.itens.filter(function(y){ return chaveDe(y) !== chaveDe(x); });
        depois(); avisa(); carregar(true);
        return;
      }
      btn.disabled = false; btn.innerHTML = ico(IC.ok, 14, 2.4) + "Enviei";
      alert("Não consegui marcar como enviada. " + humano(e) + " Tente de novo.");
    });
}

/* de 15 em 15 s confere se já passou 1 minuto desde a última leitura; ao voltar para a aba, lê na hora */
setInterval(function(){ carregar(false); }, 15 * 1000);
document.addEventListener("visibilitychange", function(){ if(!document.hidden) carregar(true); });

return {
  n: function(){ return st.itens.length; },
  nEnviar: function(){ return aEnviar().length; },
  abrir: abrir,
  carregar: carregar
};
})();
