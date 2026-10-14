var GV = (function(){
"use strict";

/* ── conexão (Supabase · projeto do faturamento) ── */
var GCFG = {
  url: "https://xcucoryngkkuszztpxyq.supabase.co",
  key: "sb_publishable_6ATQUvqBBRS5xx7jAYKlmw_2FwTuHG7"
};
/* assinatura vem do login único da conveniência (PIN) */
function autora(){ return (typeof CU!=="undefined" && CU && CU.nome) ? CU.nome : ""; }
function ehDono(){ return (typeof CU!=="undefined" && CU && CU.admin===true); }

/* ── dicionário das situações (voz da recepção) · v2.0 ── */
var SIT = {
  sem_guia:              {rot:"Sem guia",             cls:"s0", g:"g0", acao:"🚫 REGRA DA CASA: consulta não pode estar na agenda sem guia. Solicitar guia AGORA — ou desmarcar."},
  guia_vencida:          {rot:"Guia vencida",         cls:"s0", g:"g0", acao:"🚫 Guia vencida sai da agenda. Falar com a Unimed pra ATUALIZAR A VALIDADE (ou guia nova) AGORA — ou desmarcar."},
  saldo_esgotado:        {rot:"Saldo esgotado",       cls:"s0", g:"g0", acao:"🚫 Sem sessão sobrando = sem guia. Solicitar renovação AGORA — ou desmarcar."},
  sem_carteirinha:       {rot:"Sem carteirinha",      cls:"s0", g:"g0", acao:"Completar o cadastro do paciente HOJE — sem carteirinha nem dá pra casar guia."},
  guia_de_outra_terapia: {rot:"Guia de OUTRA terapia",cls:"s0", g:"g0", acao:"🚫 A guia viva do paciente é de outra terapia. Conferir se o erro é o procedimento marcado ou a guia pedida — corrigir AGORA ou desmarcar."},
  procedimento_errado:   {rot:"Procedimento errado",  cls:"s0", g:"g0", acao:"🚫 O procedimento do agendamento não é nenhum dos 4 códigos Unimed. Corrigir no Feegow — desse jeito não fatura e o painel fica cego."},
  aba_intercambio:       {rot:"ABA no Intercâmbio",   cls:"s0", g:"g0", acao:"🚫 ABA não é coberto no convênio Intercâmbio. Corrigir o convênio ou o procedimento ANTES da sessão."},
  psico_com_guia_aba:    {rot:"Psico com guia de ABA", cls:"s0", g:"g0", acao:"🚫 O paciente tem guia de ABA viva — não é pra ter sessão de psicologia acontecendo. Corrigir o procedimento do agendamento no Feegow AGORA."},
  ultima_sessao:         {rot:"Última sessão",        cls:"s1", g:"g1", acao:"É a última sessão do saldo — solicitar guia nova já, pra agenda seguinte não furar."},
  duplicidade_dia:       {rot:"Duas no mesmo dia",    cls:"s1", g:"g1", acao:"Só uma consulta da mesma terapia fatura por dia. Remarcar ou excluir uma delas."},
  sem_saldo_na_fila:     {rot:"Fila passa do saldo",  cls:"s1", g:"g1", acao:"Solicitar guia nova ANTES desta data — a fila do paciente consome o saldo antes de chegar aqui."},
  guia_ainda_nao_vale:   {rot:"Guia só vale depois",  cls:"s1", g:"g1", acao:"Conferir a data de autorização com a Unimed."},
  sessao_em_feriado:     {rot:"Cai no feriado",       cls:"sinfo", g:"ginfo", acao:"Remarcar — o sistema não fatura sessão em feriado."},
  ultima_viavel_validade:{rot:"Última viável (validade)", cls:"s1", g:"g1", acao:"A guia ainda tem saldo, mas a VALIDADE morre antes da próxima consulta — esta é a última que a cobertura alcança. Solicitar renovação já."},
  coberto:               {rot:"Coberta",              cls:"s2", g:"g2", acao:""}
};
var SIT_ORDEM = ["sem_guia","guia_de_outra_terapia","psico_com_guia_aba","guia_vencida","saldo_esgotado","procedimento_errado","aba_intercambio","sem_carteirinha"];
var TRATAMENTOS = [["pendente","Pendente"],["guia_solicitada","Guia solicitada"],["resolvido","Resolvido"],["sem_solucao","Sem solução"],["desmarcado","Desmarcado"]];
var TRAT_CAD  = [["pendente","Pendente"],["corrigido","Corrigido"],["estava_certo","Estava certo"],["sem_solucao","Sem solução"]];
var TRAT_EXCL = [["pendente","Pendente"],["restaurei","Restaurei no Feegow"],["estava_certo","Estava certo apagar"],["sem_solucao","Sem solução"]];
var QUEM_FEZ  = [["","— quem apagou? —"],["fui_eu","Fui eu"],["outra_pessoa","Outra pessoa"],["nao_sei","Não sei"]];
var CAD_TIT = { carteirinha_repetida:"Carteirinha repetida", convenio_invertido:"Convênio × carteirinha invertidos", paciente_duplicado:"Paciente duplicado" };

var SIT_FILA = {
  aguardando:    {rot:"Na fila do robô",            cls:"sinfo", g:"ginfo"},
  conferindo:    {rot:"Robô no SGU agora…",         cls:"sinfo", g:"ginfo"},
  renovada:      {rot:"Validade atualizada ✔",      cls:"s2",    g:"g2"},
  sem_mudanca:   {rot:"SGU ainda com a data velha", cls:"s1",    g:"g1"},
  fora_do_banco: {rot:"Guia fora do nosso banco",   cls:"sinfo", g:"ginfo"},
  erro:          {rot:"Erro ao conferir",           cls:"s0",    g:"g0"}
};
var FILA_FINAIS = ["renovada","sem_mudanca","fora_do_banco","erro"];

var estado = { linhas:[], filtroDia:null, filtroSit:"pendencias", filtroTipo:null, busca:"",
               tela:"agenda", fila:null, filaErro:"", filaDraft:"", _filaJson:"",
               cad:null, cadErro:"", excl:null, exclErro:"", donoModo:"resumo",
               corte:null, corteErro:"", falhas:null, falhasErro:"",
               malotes:null, malotesErro:"", malotesUlt:{},
               _carregouEm:0 };

/* ═══ REST ═══ */
function cab(extra){
  var h = { "apikey": GCFG.key, "Authorization": "Bearer " + GCFG.key };
  for (var k in (extra||{})) h[k] = extra[k];
  return h;
}
function carregar(){
  var main = document.getElementById("gv-conteudo");
  if(estado.tela === "agenda" && !estado.linhas.length)
    main.innerHTML = '<div class="carregando">Buscando a agenda no banco…</div>';
  fetch(GCFG.url + "/rest/v1/pre_agenda_cobertura?select=*", { headers: cab() })
    .then(function(r){
      if(!r.ok) throw new Error("HTTP " + r.status + " — confira a chave e se o 10_SQL_PAINEL_V2.sql já rodou.");
      return r.json();
    })
    .then(function(dados){
      estado.linhas = regrasAba(dados); estado._carregouEm = Date.now();
      var tela = new Date().toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"});
      var regua = (dados[0] && dados[0].calculado_em)
        ? new Date(dados[0].calculado_em).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"}) : null;
      var el = document.getElementById("gv-atualizado");
      if(el){ el.textContent = "atualizado às " + (regua || tela); el.title = regua ? ("régua calculada às " + regua + " · tela carregada às " + tela) : ""; }
      badgesTopo();
      if(estado.tela === "agenda") desenharAgenda();
    })
    .catch(function(e){
      if(estado.tela !== "agenda") return;
      main.innerHTML = '<div class="erro">Não consegui ler a view <span class="mono">pre_agenda_cobertura</span>.<br>' + escapa(e.message) + '</div>';
    });
}
function salvarNota(agid, tratamento, nota, aoSalvar){
  var corpo = [{ agendamento_id: agid, tratamento: tratamento, nota: nota || null, autora: autora() || null }];
  fetch(GCFG.url + "/rest/v1/pre_agenda_notas?on_conflict=agendamento_id", {
    method: "POST",
    headers: cab({ "Content-Type": "application/json", "Prefer": "resolution=merge-duplicates,return=minimal" }),
    body: JSON.stringify(corpo)
  }).then(function(r){
    if(!r.ok) throw new Error("HTTP " + r.status);
    var l = estado.linhas.find(function(x){ return x.agendamento_id === agid; });
    if(l){ l.tratamento = tratamento; l.nota = nota; l.autora_nota = autora(); }
    aoSalvar(true);
  }).catch(function(){ aoSalvar(false); });
}
function salvarOcNota(tipo, referencia, campos, aoSalvar){
  var corpo = [{ tipo: tipo, referencia: referencia,
                 quem_fez: campos.quem_fez || null,
                 tratamento: campos.tratamento || "pendente",
                 nota: campos.nota || null, autora: autora() || null }];
  fetch(GCFG.url + "/rest/v1/oc_notas?on_conflict=tipo,referencia", {
    method: "POST",
    headers: cab({ "Content-Type": "application/json", "Prefer": "resolution=merge-duplicates,return=minimal" }),
    body: JSON.stringify(corpo)
  }).then(function(r){
    if(!r.ok) throw new Error("HTTP " + r.status);
    aoSalvar(true);
  }).catch(function(){ aoSalvar(false); });
}

/* ═══ fila de reconferência (🔁 Renovações) ═══ */
function carregarFila(){
  fetch(GCFG.url + "/rest/v1/pre_guias_reconferir?select=*&dispensada_em=is.null&order=criado_em.desc&limit=80", { headers: cab() })
    .then(function(r){
      if(!r.ok) throw new Error("HTTP " + r.status + " — o 09_SQL_FILA_RECONFERENCIA.sql já rodou?");
      return r.json();
    })
    .then(function(dados){
      var json = JSON.stringify(dados);
      var mudou = json !== estado._filaJson;
      estado._filaJson = json;
      estado.fila = dados; estado.filaErro = "";
      badgesTopo();
      if(estado.tela === "fila" && mudou) desenharFila();
    })
    .catch(function(e){
      estado.filaErro = e.message;
      if(estado.fila === null) estado.fila = [];
      badgesTopo();
      if(estado.tela === "fila") desenharFila();
    });
}
function enviarFila(){
  var campo = document.getElementById("filaNum");
  if(!campo) return;
  var num = (campo.value || "").replace(/\D/g, "");
  if(num.length < 6){ avisoFila("Número esquisito — a guia tem só números (ex.: 16337779).", true); return; }
  var vivo = (estado.fila || []).some(function(l){
    return l.numero_guia === num && (l.situacao === "aguardando" || l.situacao === "conferindo");
  });
  if(vivo){ avisoFila("Essa guia já está na fila — o robô já vai olhar.", true); return; }
  fetch(GCFG.url + "/rest/v1/pre_guias_reconferir", {
    method: "POST",
    headers: cab({ "Content-Type": "application/json", "Prefer": "return=minimal" }),
    body: JSON.stringify([{ numero_guia: num, autora: autora() || null }])
  }).then(function(r){
    if(r.status === 409){ avisoFila("Essa guia já está na fila — o robô já vai olhar.", true); return; }
    if(!r.ok) throw new Error("HTTP " + r.status);
    campo.value = ""; estado.filaDraft = "";
    avisoFila("Mandei pro robô ✔ O resultado aparece aqui embaixo em instantes.", false);
    carregarFila();
  }).catch(function(e){ avisoFila("Não consegui mandar (" + e.message + ")", true); });
}
function dispensarFila(id){
  fetch(GCFG.url + "/rest/v1/pre_guias_reconferir?id=eq." + id, {
    method: "PATCH",
    headers: cab({ "Content-Type": "application/json", "Prefer": "return=minimal" }),
    body: JSON.stringify({ dispensada_em: new Date().toISOString(), dispensada_por: autora() || null })
  }).then(function(r){
    if(!r.ok) throw new Error("HTTP " + r.status);
    estado.fila = (estado.fila || []).filter(function(l){ return l.id !== id; });
    estado._filaJson = JSON.stringify(estado.fila);
    badgesTopo();
    if(estado.tela === "fila") desenharFila();
  }).catch(function(){ avisoFila("Não consegui dispensar — tente de novo.", true); });
}
function avisoFila(msg, ehErro){
  var el = document.getElementById("filaAviso");
  if(!el) return;
  el.textContent = msg; el.style.display = "block";
  el.style.background = ehErro ? "var(--critico-fundo)" : "var(--ok-fundo)";
  el.style.color = ehErro ? "var(--critico)" : "var(--ok)";
  if(!ehErro){ setTimeout(function(){ el.style.display = "none"; }, 6000); }
}
function ligarPollFila(){ if(!GV._pf) GV._pf = setInterval(carregarFila, 20*1000); }
function desligarPollFila(){ if(GV._pf){ clearInterval(GV._pf); GV._pf = null; } }

/* ═══ 🧾 cadastros · 🗑️ exclusões — cargas ═══ */
function loadCad(){
  var qGrupos = fetch(GCFG.url + "/rest/v1/cad_alertas?select=*", { headers: cab() })
    .then(function(r){ if(!r.ok) throw new Error("HTTP "+r.status+" — o 10_SQL_PAINEL_V2.sql já rodou?"); return r.json(); });
  var qNotas = fetch(GCFG.url + "/rest/v1/oc_notas?tipo=eq.cadastro&select=referencia,tratamento,nota,autora,atualizado_em", { headers: cab() })
    .then(function(r){ return r.ok ? r.json() : []; })
    .catch(function(){ return []; });
  return Promise.all([qGrupos, qNotas])
    .then(function(res){ estado.cad = porPaciente(res[0], res[1]); estado.cadErro = ""; badgesTopo(); if(estado.tela==="cad") desenharCad(); })
    .catch(function(e){ estado.cadErro = e.message; if(estado.cad===null) estado.cad = []; badgesTopo(); if(estado.tela==="cad") desenharCad(); });
}

/* ── nomes vêm colados num texto só: "Fulano (#12) · Beltrana (#34, cadastrado 01/02/25)" ── */
function pacientesDoTexto(txt){
  var out = [], re = /([^·]+?)\s*\(#(\d+)(?:,[^)]*)?\)/g, m;
  while((m = re.exec(txt || "")) !== null){
    out.push({ id: String(m[2]), nome: m[1].replace(/^[\s·]+/, "").replace(/[\s·]+$/, "") });
  }
  return out;
}
/* ── chave de agrupamento que é lixo (zeros, "01", 01010101010): NUNCA juntar fichas ── */
function chaveLixo(ocref){
  var m = /^(cpf|cart):(\d+)$/.exec(ocref || "");
  if(!m) return false;
  var bruto = m[2], d = bruto.replace(/^0+/, "");
  if(d === "") return true;
  if(d.length <= 3) return true;
  if(/^(\d)\1+$/.test(bruto)) return true;
  if(/^(01)+$/.test(d) || /^(10)+$/.test(d)) return true;
  return false;
}
function porPaciente(grupos, notas){
  var nota = {};
  (notas || []).forEach(function(n){ nota[n.referencia] = n; });
  var mapa = {};
  (grupos || []).forEach(function(g){
    var gente = pacientesDoTexto(g.paciente);
    if(!gente.length && g.paciente_ids && g.paciente_ids.length)
      gente = g.paciente_ids.map(function(i){ return { id: String(i), nome: "(#" + i + ")" }; });
    var lixo = chaveLixo(g.oc_ref);
    gente.forEach(function(p){
      if(!mapa[p.id]) mapa[p.id] = { paciente_id: p.id, paciente: p.nome, oc_ref: "pac:" + p.id,
                                     problemas: [], futuras: 0, lixo: false };
      var f = mapa[p.id];
      if(p.nome && p.nome.indexOf("(#") !== 0) f.paciente = p.nome;
      f.futuras = Math.max(f.futuras, g.consultas_futuras || 0);
      if(lixo) f.lixo = true;
      f.problemas.push({
        tipo: g.tipo, oc_ref: g.oc_ref, carteirinha: g.carteirinha, detalhe: g.detalhe,
        lixo: lixo, no_grupo: gente.length,
        outros: gente.filter(function(x){ return x.id !== p.id; })
      });
    });
  });
  var lista = Object.keys(mapa).map(function(k){ return mapa[k]; });
  var corte = Date.now() - 3*3600*1000;
  lista.forEach(function(f){
    var n = nota[f.oc_ref];
    f.tratamento = n ? n.tratamento : null;
    f.nota = n ? n.nota : null;
    f.autora = n ? n.autora : null;
    f.nota_atualizada_em = n ? n.atualizado_em : null;
    f.reincidente = !!(n && n.tratamento === "corrigido" && new Date(n.atualizado_em).getTime() < corte);
  });
  lista.sort(function(a, b){
    if(b.futuras !== a.futuras) return b.futuras - a.futuras;
    if(b.problemas.length !== a.problemas.length) return b.problemas.length - a.problemas.length;
    return (a.paciente || "").localeCompare(b.paciente || "");
  });
  return lista;
}
function loadExcl(){
  var qFam = fetch(GCFG.url + "/rest/v1/oc_exclusoes?select=*&order=protegido_em.desc", { headers: cab() })
    .then(function(r){ if(!r.ok) throw new Error("HTTP "+r.status+" — o 10_SQL_PAINEL_V2.sql já rodou?"); return r.json(); });
  var qDisp = fetch(GCFG.url + "/rest/v1/oc_notas?tipo=eq.exclusao_dispensada&select=referencia,autora,atualizado_em", { headers: cab() })
    .then(function(r){ return r.ok ? r.json() : []; })
    .catch(function(){ return []; });
  return Promise.all([qFam, qDisp])
    .then(function(res){
      var disp = {};
      (res[1] || []).forEach(function(n){ disp[n.referencia] = n; });
      var linhas = (res[0] || []).map(function(x){
        var d = disp[x.oc_ref];
        if(d){ x.dispensada_em = d.atualizado_em || true; x.dispensada_por = d.autora; }
        return x;
      }).filter(exclVisivel);
      estado.excl = linhas; estado.exclErro = ""; badgesTopo();
      if(estado.tela==="excl") desenharExcl();
    })
    .catch(function(e){ estado.exclErro = e.message; if(estado.excl===null) estado.excl = []; badgesTopo(); if(estado.tela==="excl") desenharExcl(); });
}
/* ✕ do dono: some com o card SEM soltar a proteção do faturamento */
function dispensarExclusao(l, btn){
  if(!ehDono()) return;
  if(!confirm("Tirar da tela a exclusão de " + (l.paciente || "—") + "?\n\n" +
              "Atenção: os " + l.n_sessoes + " agendamentos CONTINUAM protegidos no faturamento. " +
              "Isto só esconde o card. Pra soltar de verdade, use 👑 Aprovar e liberar.")) return;
  if(btn){ btn.disabled = true; btn.textContent = "…"; }
  fetch(GCFG.url + "/rest/v1/oc_notas?on_conflict=tipo,referencia", {
    method: "POST",
    headers: cab({ "Content-Type": "application/json",
                   "Prefer": "resolution=merge-duplicates,return=minimal" }),
    body: JSON.stringify([{ tipo: "exclusao_dispensada", referencia: l.oc_ref, autora: autora() || null }])
  }).then(function(r){
    if(!r.ok) throw new Error("HTTP " + r.status);
    return loadExcl();
  }).catch(function(e){
    alert("Não consegui dispensar: " + e.message);
    if(btn){ btn.disabled = false; btn.textContent = "✕"; }
  });
}
function aprovarExclusao(l, btn){
  if(!ehDono()) return;
  if(btn){ btn.disabled = true; btn.textContent = "liberando…"; }
  fetch(GCFG.url + "/rest/v1/rpc/oc_liberar_protecao", {
    method: "POST",
    headers: cab({ "Content-Type": "application/json" }),
    body: JSON.stringify({ p_ids: l.agendamento_ids, p_quem: autora() || null })
  }).then(function(r){
    if(!r.ok) throw new Error("HTTP " + r.status);
    return fetch(GCFG.url + "/rest/v1/oc_notas?tipo=eq.exclusao&referencia=eq." + encodeURIComponent(l.oc_ref), {
      method: "PATCH",
      headers: cab({ "Content-Type": "application/json", "Prefer": "return=minimal" }),
      body: JSON.stringify({ aprovada_em: new Date().toISOString(), aprovada_por: autora() || null })
    });
  }).then(function(){ return loadExcl(); })
    .then(function(){ if(estado.tela==="dono") desenharAdmin(); })
    .catch(function(e){ alert("Não consegui aprovar: " + e.message); if(btn){ btn.disabled=false; btn.textContent="👑 Aprovar e liberar"; } });
}

/* ═══ utilidades ═══ */
/* ═══ 🧩 regras de ABA ═══
   O paciente com guia de ABA viva não pode ter sessão de psicologia acontecendo.
   A régua já calcula 'outra_guia_terapia' para TODA consulta — inclusive as verdes —
   então basta reclassificar aqui, sem tocar no banco. */
function regrasAba(linhas){
  (linhas || []).forEach(function(l){
    /* v2.1 · última viável por validade: coberta, mas a régua avisa */
    if(l.ultima_viavel && l.situacao === "coberto"){
      l.situacao = "ultima_viavel_validade";
      l.gravidade = 1;
    }
    if(l.especialidade === "psicologia" && l.outra_guia_terapia === "aba" && l.situacao !== "sessao_em_feriado"){
      l.situacao = "psico_com_guia_aba";
      l.gravidade = 0;
    }
  });
  return linhas || [];
}
/* Tudo que é problema de ABA: consulta de ABA com qualquer pendência,
   mais a psicologia que está acontecendo por cima de guia de ABA. */
function ehProblemaAba(l){
  if(tratada(l)) return false;
  if(l.situacao === "psico_com_guia_aba") return true;
  if(l.especialidade !== "aba") return false;
  return l.situacao !== "coberto" && l.situacao !== "sessao_em_feriado";
}
function escapa(s){ var d=document.createElement("div"); d.textContent=(s==null?"":String(s)); return d.innerHTML; }
function fmtData(v){ if(!v) return "—"; return String(v).split("T")[0].split("-").reverse().join("/"); }
function fmtQuando(iso){
  if(!iso) return "";
  var d = new Date(iso);
  return d.toLocaleDateString("pt-BR",{day:"2-digit",month:"2-digit"}) + " " +
         d.toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"});
}
function tratada(l){ return l.tratamento === "resolvido" || l.tratamento === "desmarcado"; }
function ehPendencia(l){ return (l.gravidade === 0 || l.corte_hoje === true) && !tratada(l); } /* v2: só o VERMELHO · v2.1: + o amarelo do DIA do corte */
function ehAviso(l){ return l.situacao !== "coberto" && l.gravidade !== 0 && !tratada(l); }
function cadAberto(c){ return !c.tratamento || c.tratamento === "pendente"; }
function exclAberta(x){ return (!x.tratamento || x.tratamento === "pendente") || x.aguardando_dono === true; }
/* ═══ 🗑️ Exclusões — marco fixo ═══
   Nada anterior ao marco aparece (limpeza do legado, decisão do dono em 17/08).
   Do marco em diante a família FICA na tela até ser resolvida:
     · restaurada no Feegow  → a conferência da madrugada vê e a linha sai sozinha
     · aprovada pelo dono    → oc_liberar_protecao solta a proteção e a linha sai
     · dispensada pelo dono  → o ✕ some com o card sem soltar a proteção
   Secretária nenhuma tira card daqui — só o administrador. */
var MARCO_EXCLUSOES = "2026-08-17";
function depoisDoMarco(x){
  if(!x.protegido_em) return false;
  return String(x.protegido_em).slice(0, 10) >= MARCO_EXCLUSOES;
}
function exclVisivel(x){ return depoisDoMarco(x) && !x.dispensada_em; }
function primeiroCelular(cel, tel){
  var campos = [cel, tel];
  for (var i=0;i<campos.length;i++){
    if(!campos[i]) continue;
    var partes = String(campos[i]).split("/");
    for (var j=0;j<partes.length;j++){
      var d = partes[j].replace(/\D/g,"");
      if(d.slice(0,2)==="55" && (d.length===12||d.length===13)) d = d.slice(2);
      if(d.length===11 && d[2]==="9") return "55"+d;
      if(d.length===10 && "6789".indexOf(d[2])>=0) return "55"+d;
    }
  }
  return "";
}
function foneBonito(n){
  var d = n.slice(2), ddd = d.slice(0,2), resto = d.slice(2);
  return "("+ddd+") "+resto.slice(0, resto.length-4)+"-"+resto.slice(-4);
}

/* ═══ badges (abas + sidebar) + FAIXA piscante ═══ */
function badgesTopo(){
  var pend = estado.linhas.filter(ehPendencia).length;
  var prontos = (estado.fila || []).filter(function(l){ return FILA_FINAIS.indexOf(l.situacao) >= 0; }).length;
  var cadN  = (estado.cad  || []).filter(cadAberto).length;
  var exclN = (estado.excl || []).filter(exclAberta).length;
  function b(id, n){ var el = document.getElementById(id); if(!el) return; el.hidden = !n; el.textContent = n; }
  var corteN  = (estado.corte  || []).filter(corteAtivo).length;
  var falhasN = (estado.falhas || []).length;
  b("gv-b-agenda", pend); b("gv-b-fila", prontos); b("gv-b-cad", cadN); b("gv-b-excl", exclN);
  b("gv-b-corte", corteN); b("gv-b-falhas", falhasN);
  b("gv-sbb", pend + cadN + exclN + corteN + falhasN);
  desenharFaixa();
}
function desenharFaixa(){
  var f = document.getElementById("gv-faixa");
  if(f) f.hidden = true;                       /* a faixa antiga saiu: os chips moram na barra da moldura */
  if(!window.moldura) return;
  var cadN  = (estado.cad  || []).filter(cadAberto).length;
  var exclN = (estado.excl || []).filter(exclAberta).length;
  var chips = [];
  categorias().forEach(function(c){
    chips.push({ chave:c.chave, rot:c.rot, n:c.n, dica:c.sub,
      acao:function(){ irParaTela("agenda"); abrirCatAgenda(c.chave); } });
  });
  if(chips.length && (cadN || exclN)) chips.push({ sep:true });
  if(cadN) chips.push({ chave:"cadastros", rot:"Cadastros", n:cadN, dica:"Abrir Cadastros", acao:function(){ irParaTela("cad"); } });
  if(exclN) chips.push({ chave:"exclusoes", rot:"Exclusões", n:exclN, dica:"Abrir Exclusões", acao:function(){ irParaTela("excl"); } });
  moldura.alertas(chips);
}
function irParaTela(t){
  if(window.irPara && window.moldura) moldura.irTelaGuias(t); else trocaTela(t);
}

/* ═══ 📅 agenda ═══ */
/* ═══ 📅 agenda — design novo: lista de consultas + painel "Resolver agora" ═══
   Mesmos dados e mesma gravação de antes (salvarNota → pre_agenda_notas); só a tela mudou. */
var ESP_ROT  = { psicologia:"Psicologia", aba:"ABA", nutricao:"Nutrição" };
var TRAT_ROT = { pendente:"Pendente", guia_solicitada:"Guia solicitada", resolvido:"Resolvido", sem_solucao:"Sem solução", desmarcado:"Desmarcado" };
var TOM = { r:"#D70015", o:"#C93400", c:"#636366", v:"#248A3D" };
/* textos da tela (voz do modelo novo); as regras continuam no SIT lá de cima */
var SIT_TXT = {
  sem_guia:               { rot:"Sem guia", tom:"r", sub:"Solicitar a guia agora ou desmarcar", acao:"Regra da casa: consulta não pode estar na agenda sem guia. Solicitar a guia agora ou desmarcar." },
  guia_vencida:           { rot:"Guia vencida", tom:"r", sub:"Atualizar a validade com a Unimed ou desmarcar", acao:"Guia vencida sai da agenda. Falar com a Unimed para atualizar a validade (ou pedir guia nova) agora, ou desmarcar." },
  saldo_esgotado:         { rot:"Saldo esgotado", tom:"r", sub:"Solicitar a renovação agora ou desmarcar", acao:"Sem sessão sobrando é o mesmo que sem guia. Solicitar a renovação agora ou desmarcar." },
  sem_carteirinha:        { rot:"Sem carteirinha", tom:"r", sub:"Completar o cadastro do paciente hoje", acao:"Completar o cadastro do paciente hoje: sem carteirinha não dá para casar a guia." },
  guia_de_outra_terapia:  { rot:"Guia de outra terapia", tom:"r", sub:"Conferir procedimento ou guia e corrigir", acao:"A guia viva do paciente é de outra terapia. Conferir se o erro é o procedimento marcado ou a guia pedida e corrigir agora, ou desmarcar." },
  procedimento_errado:    { rot:"Procedimento errado", tom:"r", sub:"Corrigir o procedimento no Feegow", acao:"O procedimento do agendamento não é nenhum dos 4 códigos Unimed. Corrigir no Feegow: assim não fatura e o painel fica cego." },
  aba_intercambio:        { rot:"ABA no Intercâmbio", tom:"r", sub:"Corrigir convênio ou procedimento", acao:"ABA não é coberto no Intercâmbio. Corrigir o convênio ou o procedimento antes da sessão." },
  psico_com_guia_aba:     { rot:"Psicologia com guia de ABA", tom:"r", sub:"Corrigir o procedimento no Feegow", acao:"O paciente tem guia de ABA viva: não deveria haver sessão de psicologia. Corrigir o procedimento do agendamento no Feegow agora." },
  ultima_sessao:          { rot:"Última sessão", tom:"o", sub:"Última do saldo: pedir guia nova já", acao:"É a última sessão do saldo. Solicitar guia nova já, para a agenda seguinte não furar." },
  duplicidade_dia:        { rot:"Duas no mesmo dia", tom:"o", sub:"Remarcar ou excluir uma delas", acao:"Só uma consulta da mesma terapia fatura por dia. Remarcar ou excluir uma delas." },
  sem_saldo_na_fila:      { rot:"Fila passa do saldo", tom:"o", sub:"Pedir guia nova antes desta data", acao:"Solicitar guia nova antes desta data: a fila do paciente consome o saldo antes de chegar aqui." },
  guia_ainda_nao_vale:    { rot:"Guia só vale depois", tom:"o", sub:"Conferir a data com a Unimed", acao:"Conferir a data de autorização com a Unimed." },
  sessao_em_feriado:      { rot:"Cai no feriado", tom:"c", sub:"Remarcar", acao:"Remarcar: o sistema não fatura sessão em feriado." },
  ultima_viavel_validade: { rot:"Última viável (validade)", tom:"o", sub:"Corte hoje: renovar a validade já", acao:"A guia ainda tem saldo, mas a validade termina antes da próxima consulta: esta é a última que a cobertura alcança. Solicitar a renovação já." },
  coberto:                { rot:"Coberta", tom:"v", sub:"", acao:"" }
};
var ABA_TXT = { rot:"ABA", tom:"r", sub:"Sem guia de ABA, ABA no Intercâmbio ou psicologia sobre guia de ABA",
  acao:"Tudo que é de ABA: sessão de ABA sem guia de ABA, ABA no convênio Intercâmbio e psicologia acontecendo por cima de guia de ABA. Corrigir o procedimento ou o convênio no Feegow, ou pedir a guia certa." };
var IC = {
  esq:"M14.5 6l-6 6 6 6", dir:"M9.5 6l6 6-6 6", x:"M6 6l12 12M18 6 6 18", ok:"M5.5 12.5l4.2 4.2 8.8-9.4",
  fora:"M14 5h5v5M19 5l-8 8M17 14v5H5V7h5"
};
function ico(d, tam, traco, cor){
  return '<svg width="'+(tam||16)+'" height="'+(tam||16)+'" viewBox="0 0 24 24" fill="none" stroke="'+(cor||"currentColor")+'" stroke-width="'+(traco||2)+
         '" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="'+d+'"></path></svg>';
}
function novo(tag, cls, html){ var e = document.createElement(tag); if(cls) e.className = cls; if(html != null) e.innerHTML = html; return e; }
function botao(cls, html, fn){ var b = novo("button", cls, html); b.type = "button"; if(fn) b.addEventListener("click", fn); return b; }
function semAcento(s){ return String(s||"").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase(); }
function sitTxt(s){ return SIT_TXT[s] || { rot:s, tom:"c", sub:"", acao:"" }; }
function rotTipo(k){ return k === "__aba__" ? "ABA" : sitTxt(k).rot; }
function ses(n){ return n + (n === 1 ? " sessão" : " sessões"); }
function capital(t){ t = String(t||""); return t.charAt(0).toUpperCase() + t.slice(1); }

function contagens(){
  var c = { pendencias:0, avisos:0, tratadas:0, cobertas:0 };
  estado.linhas.forEach(function(l){
    if(ehPendencia(l)) c.pendencias++;
    else if(ehAviso(l)) c.avisos++;
    else if(l.situacao === "coberto") c.cobertas++;
    else c.tratadas++;
  });
  return c;
}
/* categorias do "Resolver agora" (mesma conta da faixa antiga) */
function categorias(){
  var cont = {};
  estado.linhas.forEach(function(l){ if(ehPendencia(l)) cont[l.situacao] = (cont[l.situacao]||0)+1; });
  var abaN = estado.linhas.filter(ehProblemaAba).length;
  delete cont["aba_intercambio"];
  delete cont["psico_com_guia_aba"];
  var tipos = SIT_ORDEM.filter(function(s){ return cont[s]; });
  Object.keys(cont).forEach(function(s){ if(tipos.indexOf(s) < 0) tipos.push(s); });
  var out = [];
  if(abaN) out.push({ chave:"__aba__", rot:"ABA", sub:ABA_TXT.sub, n:abaN, cor:TOM.r });
  tipos.forEach(function(s){ var m = sitTxt(s); out.push({ chave:s, rot:m.rot, sub:m.sub, n:cont[s], cor:TOM[m.tom] || TOM.r }); });
  return out;
}
function linhasDaCategoria(k){
  return estado.linhas.filter(function(l){ return k === "__aba__" ? ehProblemaAba(l) : (ehPendencia(l) && l.situacao === k); });
}
function metaLinha(l){
  return (ESP_ROT[l.especialidade] || l.especialidade || "—") + " · " + (l.profissional || "—") + " · " +
         (l.convenio || ("convênio " + l.convenio_id)) + (l.status ? " · " + l.status : "");
}
function quandoCurto(l){ return (l.dias_ate === 0 ? "hoje" : String(l.dia_semana||"").slice(0,3) + " " + l.data_fmt) + " · " + l.horario; }
function detalheTxt(l){
  var g = l.numero_guia || "—", fim = l.guia_fim_fmt || "—";
  switch(l.situacao){
    case "coberto": return "Guia " + g + " · " + ses(l.saldo_guia) + " · vence " + fim + ".";
    case "guia_vencida": return "A última guia, " + g + ", venceu em " + fim +
      (typeof l.dias_para_vencer === "number" ? " (há " + Math.abs(l.dias_para_vencer) + (Math.abs(l.dias_para_vencer) === 1 ? " dia)." : " dias).") : ".");
    case "saldo_esgotado": return "A guia " + g + " vale até " + fim + ", mas o saldo zerou.";
    case "psico_com_guia_aba": return "Guia de ABA viva" + (l.outra_guia_numero ? " " + l.outra_guia_numero : "") +
      (l.outra_guia_qt != null ? " · " + ses(l.outra_guia_qt) : "") + (l.outra_guia_fim ? " · vence " + fmtData(l.outra_guia_fim) : "") +
      ". O agendamento está como psicologia" + (l.numero_guia ? " (guia de psicologia " + l.numero_guia + ")" : "") + ".";
    case "guia_de_outra_terapia": return "A guia viva " + (l.outra_guia_numero || "—") + " é de " + (ESP_ROT[l.outra_guia_terapia] || l.outra_guia_terapia || "outra terapia") +
      (l.outra_guia_qt != null ? " · " + ses(l.outra_guia_qt) : "") + (l.outra_guia_fim ? " · vence " + fmtData(l.outra_guia_fim) : "") + ".";
    case "procedimento_errado": return "Procedimento no Feegow: " + (l.procedimento || "vazio") +
      (l.quem_criou ? ", marcado por " + l.quem_criou : "") + (l.agendado_em ? " em " + fmtQuando(l.agendado_em) : "") + ".";
    case "aba_intercambio": return "Convênio Intercâmbio" + (l.numero_guia ? " · guia " + l.numero_guia : "") + ": ABA não é coberto.";
    case "ultima_sessao": return "Guia " + g + " · última sessão do saldo · vence " + fim + ".";
    case "ultima_viavel_validade": return "Guia " + g + " · " + ses(l.saldo_guia) + " no saldo · vence " + fim + ".";
    case "duplicidade_dia": return (l.dup_no_dia || 2) + " consultas de " + (ESP_ROT[l.especialidade] || l.especialidade || "mesma terapia").toLowerCase() + " neste dia: só uma fatura.";
    case "sem_saldo_na_fila": return "É a " + l.posicao_efetiva + "ª consulta da fila, e o saldo na data é " + l.saldo_na_data + ".";
    case "guia_ainda_nao_vale": return l.guia_inicio ? "Guia autorizada só a partir de " + fmtData(l.guia_inicio) + "." : "";
    case "sessao_em_feriado": return "Este dia é feriado.";
  }
  return "";
}
function desenharAgenda(){
  var main = document.getElementById("gv-conteudo");
  if(!main) return;
  var antes = main.querySelector(".lista-corpo");
  var rolagem = (antes && !estado._agTopo) ? antes.scrollTop : 0;
  estado._agTopo = false;
  main.innerHTML = "";
  var wrap = novo("div", "duas-col");
  wrap.appendChild(agLista());
  var lado = novo("div", "lado"); lado.appendChild(agPainel()); wrap.appendChild(lado);
  main.appendChild(wrap);
  ajustaAltura();
  var corpo = main.querySelector(".lista-corpo");
  if(corpo) corpo.scrollTop = rolagem;
  desenharFaixa();
  resumoAgenda();
}
function agMudou(){ estado.agLimite = 150; estado._agTopo = true; desenharAgenda(); }
function ajustaAltura(){
  var l = document.querySelector("#gv-conteudo .lista.alta");
  if(!l) return;
  var topo = l.getBoundingClientRect().top + window.scrollY;
  l.style.height = Math.max(520, window.innerHeight - topo - 24) + "px";
}
window.addEventListener("resize", function(){ if(estado.tela === "agenda") ajustaAltura(); });
function resumoAgenda(){
  if(!window.moldura) return;
  var d = diasUnicos();
  var n = estado.linhas.length;
  moldura.resumo("agenda", n ? (n + " consulta" + (n === 1 ? "" : "s") + (d.length ? " de " + d[0].data_fmt + " a " + d[d.length-1].data_fmt : "")) : "");
}
function diasUnicos(){
  var m = {};
  estado.linhas.forEach(function(l){
    if(!m[l.data]) m[l.data] = { data:l.data, dia_semana:l.dia_semana, data_fmt:l.data_fmt, pend:0, feriado:false, hoje:l.dias_ate === 0 };
    if(ehPendencia(l)) m[l.data].pend++;
    if(l.em_feriado) m[l.data].feriado = true;
  });
  return Object.keys(m).sort().map(function(k){ return m[k]; });
}
function passaFiltro(l){
  if(estado.filtroDia && l.data !== estado.filtroDia) return false;
  if(estado.busca && semAcento(l.paciente).indexOf(semAcento(estado.busca)) < 0) return false;
  if(estado.filtroTipo === "__aba__") return ehProblemaAba(l);
  if(estado.filtroSit==="pendencias"){
    if(!ehPendencia(l)) return false;
    if(estado.filtroTipo && l.situacao !== estado.filtroTipo) return false;
    return true;
  }
  if(estado.filtroSit==="avisos")   return ehAviso(l);
  if(estado.filtroSit==="tratadas") return l.situacao!=="coberto" && (tratada(l) || (l.tratamento && l.tratamento!=="pendente"));
  if(estado.filtroSit==="cobertas") return l.situacao==="coberto";
  return true;
}
function agLista(){
  var cont = contagens();
  var sec = novo("section", "lista alta"); sec.setAttribute("aria-label", "Consultas");
  var topo = novo("div", "lista-topo"), esq = novo("div", "lista-topo-esq");
  var seg = novo("div", "seg"); seg.setAttribute("role", "group"); seg.setAttribute("aria-label", "Mostrar");
  [["pendencias","Pendências",TOM.r,cont.pendencias],["avisos","Avisos",TOM.o,cont.avisos],["tratadas","Já tratadas","#AEAEB2",cont.tratadas],
   ["cobertas","Cobertas",TOM.v,cont.cobertas],["tudo","Tudo","#D2D2D7",estado.linhas.length]].forEach(function(f){
    var on = estado.filtroSit === f[0];
    var b = botao(on ? "on" : "", '<span class="q" style="background:'+f[2]+'"></span>' + f[1] + ' <span class="n">' + f[3] + '</span>', function(){
      estado.filtroSit = f[0]; if(f[0] !== "pendencias") estado.filtroTipo = null; agMudou();
    });
    b.setAttribute("aria-pressed", on ? "true" : "false");
    seg.appendChild(b);
  });
  esq.appendChild(seg);
  if(estado.filtroTipo){
    var so = botao("so-tipo", "Só " + escapa(rotTipo(estado.filtroTipo)) + " " + ico(IC.x, 12, 2.6), function(){ estado.filtroTipo = null; agMudou(); });
    so.title = "Tirar este filtro";
    esq.appendChild(so);
  }
  topo.appendChild(esq);
  var vis = estado.linhas.filter(passaFiltro);
  var lim = estado.agLimite || 150;
  topo.appendChild(novo("span", "mostrando", vis.length ? "Mostrando " + Math.min(lim, vis.length) + " de " + vis.length : ""));
  sec.appendChild(topo);
  sec.appendChild(agDias(cont));
  var corpo = novo("div", "lista-corpo");
  if(!estado.linhas.length){
    corpo.appendChild(novo("div", "lista-vazio", estado._carregouEm ? "Nenhuma consulta na agenda." : "Buscando a agenda no banco…"));
  } else if(!vis.length){
    corpo.appendChild(novo("div", "lista-vazio", estado.filtroSit === "pendencias" && !estado.filtroTipo && !estado.busca
      ? "Nenhuma pendência vermelha. Tudo coberto ou já tratado: os avisos ficam no filtro ao lado."
      : "Nada aqui com esses filtros."));
  }
  var infoDia = {}; diasUnicos().forEach(function(d){ infoDia[d.data] = d; });
  var porDia = {}; vis.forEach(function(l){ porDia[l.data] = (porDia[l.data]||0)+1; });
  var dia = null;
  vis.slice(0, lim).forEach(function(l){
    if(dia !== l.data){
      dia = l.data;
      var d = infoDia[l.data] || {};
      corpo.appendChild(novo("div", "dia-cab", '<b>' + (d.hoje ? "Hoje · " : "") + escapa(capital(l.dia_semana)) + ", " + escapa(l.data_fmt) +
        (d.feriado ? " · feriado" : "") + '</b><span>' + porDia[l.data] + '</span>'));
    }
    corpo.appendChild(agLinha(l));
  });
  if(vis.length > lim){
    var m = novo("div", "lista-mais");
    m.appendChild(botao("btn btn-s", "Mostrar mais " + Math.min(150, vis.length - lim), function(){ estado.agLimite = lim + 150; desenharAgenda(); }));
    corpo.appendChild(m);
  }
  sec.appendChild(corpo);
  return sec;
}
function agLinha(l){
  var m = sitTxt(l.situacao), t = l.tratamento || "pendente";
  var b = botao("linha" + (estado._agAberto === l.agendamento_id ? " aberta" : ""),
    '<span class="h">' + escapa(l.horario) + '</span>' +
    '<span class="q"><span class="nm">' + escapa(l.paciente) + '</span><span class="mt">' + escapa(metaLinha(l)) + '</span></span>' +
    '<span class="dir"><span class="tag" style="color:' + (tratada(l) ? "#AEAEB2" : (TOM[m.tom] || TOM.c)) + '">' + escapa(m.rot) + '</span>' +
    (t !== "pendente" ? '<span class="tr">' + escapa(TRAT_ROT[t] || t) + '</span>' : '') + '</span>',
    function(){ abrirPacAgenda(l.agendamento_id, "lista"); });
  b.setAttribute("aria-haspopup", "dialog");
  b.setAttribute("data-ag", l.agendamento_id);
  return b;
}
function agDias(cont){
  var dias = diasUnicos(), N = dias.length, VIS = 6;
  var maxOff = Math.max(0, N - VIS);
  if(estado.filtroDia){                                   /* o dia escolhido fica sempre à vista */
    var k = dias.findIndex(function(d){ return d.data === estado.filtroDia; });
    var off0 = estado.agOff || 0;
    if(k >= 0 && (k < off0 || k >= off0 + VIS)) estado.agOff = Math.min(maxOff, Math.max(0, k - VIS + 1));
  }
  var off = Math.min(estado.agOff || 0, maxOff);
  var w = novo("div", "dias");
  var a = botao("dias-seta", ico(IC.esq, 18, 2.2), function(){ estado.agOff = Math.max(0, off - VIS); desenharAgenda(); });
  a.setAttribute("aria-label", "Dias anteriores"); a.disabled = off <= 0;
  var grade = novo("div", "dias-grade");
  function cel(sem, data, rod, cls, on, fn){
    var b = botao("dia2" + (on ? " on" : ""), '<span class="s">' + sem + '</span><span class="d">' + data + '</span><span class="r ' + cls + '">' + rod + '</span>', fn);
    b.setAttribute("aria-pressed", on ? "true" : "false");
    return b;
  }
  grade.appendChild(cel("Todos", N + " dias", String(cont.pendencias), cont.pendencias ? "p" : "", estado.filtroDia === null,
    function(){ estado.filtroDia = null; agMudou(); }));
  dias.slice(off, off + VIS).forEach(function(d){
    grade.appendChild(cel(d.hoje ? "hoje" : escapa(String(d.dia_semana).slice(0,3)), escapa(d.data_fmt),
      d.feriado && !d.pend ? "feriado" : String(d.pend), d.pend ? "p" : (d.feriado ? "f" : ""), estado.filtroDia === d.data,
      function(){ estado.filtroDia = (estado.filtroDia === d.data ? null : d.data); agMudou(); }));
  });
  var p = botao("dias-seta dir", ico(IC.dir, 18, 2.2), function(){ estado.agOff = Math.min(maxOff, off + VIS); desenharAgenda(); });
  p.setAttribute("aria-label", "Próximos dias"); p.disabled = off >= maxOff;
  w.appendChild(a); w.appendChild(grade); w.appendChild(p);
  return w;
}
function agPainel(){
  var cont = contagens();
  var sec = novo("section", "painel"); sec.setAttribute("aria-labelledby", "ra-titulo");
  sec.appendChild(novo("div", "painel-cab", '<h2 id="ra-titulo">Resolver agora</h2><span>' + cont.pendencias + ' pendência' + (cont.pendencias === 1 ? '' : 's') + ' na agenda</span>'));
  function cat(rot, sub, n, cor, fn){
    var b = botao("cat", '<span class="q" style="background:' + cor + '"></span><span class="t"><b>' + escapa(rot) + '</b><small>' + escapa(sub) + '</small></span>' +
      '<span class="n">' + n + '</span>' + ico(IC.dir, 16, 2), fn);
    return b;
  }
  var cats = categorias();
  cats.forEach(function(c){ var b = cat(c.rot, c.sub, c.n, c.cor, function(){ abrirCatAgenda(c.chave); }); b.setAttribute("aria-haspopup", "dialog"); sec.appendChild(b); });
  var cadN  = (estado.cad  || []).filter(cadAberto).length;
  var exclN = (estado.excl || []).filter(exclAberta).length;
  if(cadN)  sec.appendChild(cat("Cadastros", "Fichas com problema de cadastro, na tela de Cadastros", cadN, TOM.r, function(){ irParaTela("cad"); }));
  if(exclN) sec.appendChild(cat("Exclusões", "Séries apagadas inteiras no Feegow, na tela de Exclusões", exclN, TOM.r, function(){ irParaTela("excl"); }));
  if(!cats.length && !cadN && !exclN) sec.appendChild(novo("div", "lista-vazio", estado._carregouEm ? "Nada para resolver agora." : "Buscando…"));
  return sec;
}
/* janela de uma categoria: lista as consultas e leva para a lista filtrada */
function abrirCatAgenda(k){
  if(!window.moldura) return;
  var P = moldura.pop({ largura:"620px" });
  var m = k === "__aba__" ? ABA_TXT : sitTxt(k);
  var rows = linhasDaCategoria(k);
  P.corpo.appendChild(novo("div", "pp-cab", '<span class="pp-alerta">Resolver agora</span><h2>' + escapa(rotTipo(k)) + '</h2>' +
    '<span class="pp-sub">' + rows.length + (rows.length === 1 ? ' consulta' : ' consultas') + '</span>'));
  if(m.acao) P.corpo.appendChild(novo("div", "pp-caixa", '<span class="pp-rot">O que fazer</span><span class="pp-txt">' + escapa(m.acao) + '</span>'));
  var lista = novo("div", "pp-lista");
  rows.forEach(function(l){
    var t = l.tratamento || "pendente";
    lista.appendChild(botao("pp-linha", '<span class="w">' + escapa(quandoCurto(l)) + '</span><span class="q"><b>' + escapa(l.paciente) + '</b><small>' + escapa(metaLinha(l)) + '</small></span>' +
      (t !== "pendente" ? '<span class="tr">' + escapa(TRAT_ROT[t] || t) + '</span>' : '') + ico(IC.dir, 14, 2),
      function(){ abrirPacAgenda(l.agendamento_id, k); }));
  });
  if(!rows.length) lista.appendChild(novo("div", "lista-vazio", "Nenhuma consulta aqui agora."));
  P.corpo.appendChild(lista);
  P.rodape.hidden = false; P.rodape.classList.add("fim");
  P.rodape.appendChild(botao("btn btn-s", "Fechar", function(){ P.fechar(); }));
  P.rodape.appendChild(botao("btn btn-p", "Ver só estes na lista", function(){
    P.fechar();
    estado.filtroSit = "pendencias"; estado.filtroTipo = k; estado.filtroDia = null;
    estado.agLimite = 150; estado._agTopo = true;
    irParaTela("agenda");
  }));
}
/* janela do paciente: o que houve, o que fazer, telefone, tratamento e anotação */
function abrirPacAgenda(agid, ctx){
  if(!window.moldura) return;
  var atualId = agid, msg = null, msgId = null, notaTimer = null;
  var P = moldura.pop({ largura:"620px", aoFechar:function(){ estado._agAberto = null; marcaAberta(); } });
  function lista(){ return ctx === "lista" ? estado.linhas.filter(passaFiltro) : linhasDaCategoria(ctx); }
  function marcaAberta(){
    document.querySelectorAll("#gv-conteudo .linha.aberta").forEach(function(x){ x.classList.remove("aberta"); });
    if(estado._agAberto){ var r = document.querySelector('#gv-conteudo .linha[data-ag="' + estado._agAberto + '"]'); if(r) r.classList.add("aberta"); }
  }
  function pinta(){
    var l = estado.linhas.find(function(x){ return x.agendamento_id === atualId; });
    if(!l){ P.fechar(); return; }
    estado._agAberto = atualId; marcaAberta();
    var m = sitTxt(l.situacao), t = l.tratamento || "pendente";
    P.topo.innerHTML = "";
    if(ctx !== "lista") P.topo.appendChild(botao("pop-volta", ico(IC.esq, 16, 2.2) + escapa(rotTipo(ctx)), function(){ abrirCatAgenda(ctx); }));
    P.corpo.innerHTML = "";
    P.corpo.appendChild(novo("div", "pp-cab",
      '<span class="pp-quando">' + (l.dias_ate === 0 ? "Hoje, " : "") + escapa(l.dia_semana) + ", " + escapa(l.data_fmt) + " às " + escapa(l.horario) + '</span>' +
      '<h2>' + escapa(l.paciente) + '</h2>' +
      '<span class="pp-l1">' + escapa(ESP_ROT[l.especialidade] || l.especialidade || "—") + " com " + escapa(l.profissional || "—") + '</span>' +
      '<span class="pp-l2">' + escapa(l.convenio || ("convênio " + l.convenio_id)) + (l.status ? " · " + escapa(l.status) : "") + '</span>'));
    var cx = novo("div", "pp-caixa", '<span class="pp-tag" style="color:' + (tratada(l) ? TOM.c : (TOM[m.tom] || TOM.c)) + '">' + escapa(m.rot) + '</span>');
    var det = detalheTxt(l);
    if(det) cx.appendChild(novo("span", "pp-txt", escapa(det)));
    if(l.ultima_viavel && l.proximo_agendamento_id){
      var n = l.futuros_apos || 0;
      cx.appendChild(novo("span", "pp-txt", "Última consulta viável: sem guia nova, o corte é às " + (l.dia_semana === "sábado" ? "11h" : "21h") +
        " deste dia. Há " + n + (n === 1 ? " consulta futura" : " consultas futuras") + " na fila: abrir a próxima no Feegow e apagar esta e as seguintes."));
      var a = novo("a", "btn-claro", "Abrir a próxima no Feegow " + ico(IC.fora, 14, 2));
      a.href = "https://app.feegow.com/main/?P=Agenda-1&Pers=1&AgendamentoID=" + l.proximo_agendamento_id;
      a.target = "_blank"; a.rel = "noopener";
      cx.appendChild(a);
    }
    P.corpo.appendChild(cx);
    if(m.acao) P.corpo.appendChild(novo("div", "pp-bloco", '<span class="pp-rot">O que fazer</span><span class="pp-txt">' + escapa(m.acao) + '</span>'));
    var cel = primeiroCelular(l.celulares_raw, l.telefones_raw);
    var fone = novo("div", "pp-fone");
    if(cel){
      var dig = foneDigitos(cel);
      fone.innerHTML = '<span><small>Celular</small><b>' + escapa(foneBonito(cel)) + '</b></span>';
      var bc = botao("btn btn-s btn-sm", "Copiar", function(){
        (navigator.clipboard ? navigator.clipboard.writeText(dig) : Promise.reject())
          .then(function(){ bc.textContent = "Copiado"; setTimeout(function(){ bc.textContent = "Copiar"; }, 1600); },
                function(){ window.prompt("Copie o número:", dig); });
      });
      bc.title = "Copia só os dígitos, sem o 55: é assim que a busca da plataforma acha";
      fone.appendChild(bc);
    } else fone.innerHTML = '<span><small>Celular</small><b>Sem celular no cadastro</b></span>';
    P.corpo.appendChild(fone);
    var blocoT = novo("div", "pp-bloco", '<span class="pp-rot">O que você fez?</span>');
    var ops = novo("div", "pp-opcoes"); ops.setAttribute("role", "group"); ops.setAttribute("aria-label", "O que você fez?");
    TRATAMENTOS.forEach(function(tt){
      var on = tt[0] === t;
      var b = botao("pp-op" + (on ? " on" : ""), '<span class="cx">' + (on ? ico(IC.ok, 12, 3, "#FFFFFF") : "") + '</span>' + escapa(tt[1]), function(){
        clearTimeout(notaTimer);
        if(tt[0] === (l.tratamento || "pendente") && notaEl.value.trim() === (l.nota || "")) return;
        salva(l, tt[0], notaEl.value.trim());
      });
      b.setAttribute("aria-pressed", on ? "true" : "false");
      ops.appendChild(b);
    });
    blocoT.appendChild(ops);
    P.corpo.appendChild(blocoT);
    var blocoN = novo("div", "pp-bloco", '<label class="pp-rot" for="nota-agenda">Anotação</label>');
    var notaEl = novo("textarea", "pp-nota"); notaEl.id = "nota-agenda"; notaEl.rows = 2;
    notaEl.placeholder = "Protocolo, com quem falou…"; notaEl.value = l.nota || "";
    notaEl.addEventListener("change", function(){
      var v = notaEl.value.trim();
      if(v === (l.nota || "")) return;
      clearTimeout(notaTimer);                          /* espera um instante: se o clique foi numa opção, ela grava tudo junto */
      notaTimer = setTimeout(function(){ salva(l, l.tratamento || "pendente", v); }, 220);
    });
    blocoN.appendChild(notaEl);
    P.corpo.appendChild(blocoN);
    var sv = novo("div", "pp-salvo");
    var txt, cor, est = msgId === atualId ? msg : null;
    if(est === "salvando"){ txt = "Salvando…"; cor = "#AEAEB2"; }
    else if(est === "ok"){ txt = "Salvo agora. Fica registrado quem marcou e quando."; cor = TOM.v; }
    else if(est === "erro"){ txt = "Não consegui salvar. Confira a internet e tente de novo."; cor = TOM.r; }
    else { txt = t !== "pendente" ? "Marcado antes como " + (TRAT_ROT[t] || t).toLowerCase() + (l.autora_nota ? ", por " + l.autora_nota : "") + "." : "Ainda pendente."; cor = "#AEAEB2"; }
    sv.innerHTML = ico(IC.ok, 14, 2.2, cor) + '<span' + (est === "erro" ? ' style="color:' + TOM.r + '"' : '') + '>' + escapa(txt) + '</span>';
    sv.setAttribute("aria-live", "polite");
    P.corpo.appendChild(sv);
    /* anterior / próxima dentro da lista de onde veio */
    var L = lista(), ordem = {};
    estado.linhas.forEach(function(x, i){ ordem[x.agendamento_id] = i; });
    var eu = ordem[atualId], pos = -1, ant = null, prox = null;
    L.forEach(function(x, j){
      if(x.agendamento_id === atualId) pos = j;
      if(ordem[x.agendamento_id] < eu) ant = x;
      if(ordem[x.agendamento_id] > eu && !prox) prox = x;
    });
    P.rodape.hidden = false; P.rodape.innerHTML = "";
    var bA = botao("btn btn-s", ico(IC.esq, 16, 2.2) + "Anterior", function(){ if(ant){ atualId = ant.agendamento_id; pinta(); } });
    bA.disabled = !ant;
    var bP = botao("btn btn-p", "Próxima" + ico(IC.dir, 16, 2.2), function(){ if(prox){ atualId = prox.agendamento_id; pinta(); } });
    bP.disabled = !prox;
    P.rodape.appendChild(bA);
    P.rodape.appendChild(novo("span", "pop-pos", pos >= 0 ? (pos + 1) + " de " + L.length : "Saiu da lista · " + L.length + " restantes"));
    P.rodape.appendChild(bP);
  }
  function salva(l, trat, nota){
    var id = l.agendamento_id;
    msgId = id; msg = "salvando"; if(P.aberto) pinta();
    salvarNota(id, trat, nota, function(ok){
      if(msgId === id) msg = ok ? "ok" : "erro";
      if(ok){ badgesTopo(); if(estado.tela === "agenda") desenharAgenda(); }
      if(P.aberto) pinta();
    });
  }
  pinta();
}

/* ═══ 🔁 Renovações: tela ═══ */
function desenharFila(){
  var main = document.getElementById("gv-conteudo");
  main.innerHTML = "";
  var topo = document.createElement("div"); topo.className = "fila-topo";
  topo.innerHTML =
    '<h2>🔁 Renovações — reconferir no SGU</h2>'+
    '<p>A Unimed renovou a validade (senha ou carteirinha) de uma guia que <b>já existe</b>? '+
    'Digite o número: o robô abre a guia no SGU, confere as duas datas e atualiza o sistema sozinho. '+
    'O resultado aparece aqui embaixo — leu, tira com o ✕.</p>'+
    '<div class="fila-form">'+
      '<input id="filaNum" inputmode="numeric" autocomplete="off" placeholder="Número da guia (só números)">'+
      '<button class="gv-btn" id="filaEnviar">Mandar pro robô</button>'+
    '</div>'+
    '<div class="fila-aviso" id="filaAviso"></div>';
  main.appendChild(topo);

  var campo = topo.querySelector("#filaNum");
  campo.value = estado.filaDraft || "";
  campo.addEventListener("input", function(){ estado.filaDraft = campo.value; });
  campo.addEventListener("keydown", function(ev){ if(ev.key === "Enter") enviarFila(); });
  topo.querySelector("#filaEnviar").addEventListener("click", enviarFila);
  if(estado.filaDraft){
    campo.focus();
    try{ campo.setSelectionRange(campo.value.length, campo.value.length); }catch(e){}
  }

  if(estado.fila === null){
    var c = document.createElement("div"); c.className = "carregando";
    c.textContent = "Buscando a fila no banco…"; main.appendChild(c); return;
  }
  if(estado.filaErro){
    var er = document.createElement("div"); er.className = "erro";
    er.innerHTML = 'Não consegui ler a fila <span class="mono">pre_guias_reconferir</span>.<br>' + escapa(estado.filaErro);
    main.appendChild(er); return;
  }
  if(!estado.fila.length){
    var v = document.createElement("div"); v.className = "vazio";
    v.innerHTML = "<b>Nada na fila ✔</b>Renovou uma guia com a Unimed? Digite o número acima que o robô confere no SGU.";
    main.appendChild(v); return;
  }
  var linhas = estado.fila.slice().sort(function(a, b){
    var fa = FILA_FINAIS.indexOf(a.situacao) >= 0 ? 1 : 0;
    var fb = FILA_FINAIS.indexOf(b.situacao) >= 0 ? 1 : 0;
    if(fa !== fb) return fa - fb;
    return a.criado_em < b.criado_em ? 1 : -1;
  });
  linhas.forEach(function(l){ main.appendChild(fcardDe(l)); });
}
function fcardDe(l){
  var meta = SIT_FILA[l.situacao] || {rot:l.situacao, cls:"sinfo", g:"ginfo"};
  var card = document.createElement("article");
  card.className = "fcard " + meta.g;
  var esq = document.createElement("div");
  var quando = "por " + escapa(l.autora || "—") + " · " + fmtQuando(l.criado_em) +
               (l.conferida_em ? " · conferida " + fmtQuando(l.conferida_em) : "");
  esq.innerHTML =
    '<div class="fnum">guia ' + escapa(l.numero_guia) +
      (l.paciente ? ' · <span class="fpac">' + escapa(l.paciente) + '</span>' : '') + '</div>'+
    '<div class="fmeta">' + quando + '</div>'+
    '<div class="fsit ' + meta.cls + '"><span class="rotulo">' + escapa(meta.rot) + '</span></div>'+
    (l.detalhe ? '<div class="fdet">' + escapa(l.detalhe) + '</div>' : '');
  card.appendChild(esq);
  var dir = document.createElement("div");
  if(FILA_FINAIS.indexOf(l.situacao) >= 0){
    var x = document.createElement("button");
    x.className = "fx"; x.textContent = "✕"; x.title = "Li — pode tirar da tela";
    x.setAttribute("aria-label","Dispensar este aviso");
    x.onclick = function(){ dispensarFila(l.id); };
    dir.appendChild(x);
  } else {
    dir.innerHTML = '<span class="fespera" title="O robô ainda vai olhar">⏳</span>';
  }
  card.appendChild(dir);
  return card;
}

/* ═══ 🧾 Cadastros: tela ═══ */
function desenharCad(){
  var main = document.getElementById("gv-conteudo");
  main.innerHTML = "";
  var topo = document.createElement("div"); topo.className = "oc-topo";
  topo.innerHTML =
    '<h2>🧾 Cadastros com problema</h2>'+
    '<p>Um card por <b>paciente</b>: abra a ficha dele no Feegow e resolva o que está listado. '+
    'O robô recompara com o espelho da Unimed a cada 15 minutos — <b>corrigiu? o card some sozinho na próxima rodada.</b> '+
    'Marque o que você fez pra ninguém conferir a mesma coisa duas vezes.</p>'+
    '<p>⚠️ <b>Card vermelho-escuro com aviso de dado inválido: NUNCA junte as fichas.</b> '+
    'CPF de zeros ou carteirinha "0"/"01" agrupam gente que não tem nada a ver uma com a outra — '+
    'ali o conserto é buscar o número certo, não mesclar.</p>';
  main.appendChild(topo);
  if(estado.cad === null){
    var c = document.createElement("div"); c.className = "carregando";
    c.textContent = "Buscando os alertas de cadastro…"; main.appendChild(c); return;
  }
  if(estado.cadErro){
    var er = document.createElement("div"); er.className = "erro";
    er.innerHTML = 'Não consegui ler <span class="mono">cad_alertas</span>.<br>' + escapa(estado.cadErro);
    main.appendChild(er); return;
  }
  if(!estado.cad.length){
    var v = document.createElement("div"); v.className = "vazio";
    v.innerHTML = "<b>Nenhum problema de cadastro ✔</b>Carteirinhas, convênios e duplicidades estão batendo com o espelho da Unimed.";
    main.appendChild(v); return;
  }
  estado.cad.forEach(function(cc){ main.appendChild(ccardDe(cc)); });
}
function textoProblema(p){
  var nomes = p.outros.map(function(x){ return escapa(x.nome) + ' <span class="mono">#' + escapa(x.id) + '</span>'; }).join(" · ");
  if(p.tipo === "convenio_invertido") return escapa(p.detalhe || "");
  if(p.tipo === "carteirinha_repetida"){
    if(p.lixo) return '<b>Carteirinha inválida</b> <span class="mono">' + escapa(p.carteirinha || "—") + '</span> — está assim em ' +
      p.no_grupo + ' fichas diferentes. <b>Buscar o número real na Unimed e preencher.</b> ' +
      '🚫 Não juntar com: ' + (nomes || "—") + '.';
    return 'Mesma carteirinha <span class="mono">' + escapa(p.carteirinha || "—") + '</span> em ' +
      (p.outros.length === 1 ? 'outra ficha' : 'outras ' + p.outros.length + ' fichas') + ': ' + nomes +
      '. <b>Juntar os cadastros</b> — ou corrigir o número, se forem pessoas diferentes.';
  }
  if(p.tipo === "paciente_duplicado"){
    if(p.lixo) return '<b>CPF inválido</b> no cadastro — o mesmo número está em ' + p.no_grupo + ' fichas. ' +
      '<b>Corrigir o CPF do paciente.</b> 🚫 Não juntar com as outras fichas: são pessoas diferentes.';
    if(String(p.oc_ref || "").indexOf("nn:") === 0)
      return 'Mesmo nome e nascimento de: ' + nomes + '. <b>Conferir e juntar</b> — o agendamento e a guia podem estar caindo em fichas diferentes.';
    return 'Mesmo CPF de: ' + nomes + '. <b>Conferir e juntar</b> — se os nomes forem diferentes, o CPF é que está errado em uma delas.';
  }
  return escapa(p.detalhe || "");
}
function ccardDe(c){
  var card = document.createElement("article");
  card.className = "fcard " + (cadAberto(c) ? "g0" : "g2");
  var esq = document.createElement("div");
  var tags = "";
  if(c.futuras > 0) tags += '<span class="tagx fut">'+c.futuras+' futura'+(c.futuras===1?'':'s')+'</span>';
  if(c.problemas.length > 1) tags += '<span class="tagx aguarda">'+c.problemas.length+' problemas</span>';
  if(c.lixo) tags += '<span class="tagx reinc" title="Dado inválido no cadastro — não juntar fichas">não juntar</span>';
  if(c.reincidente) tags += '<span class="tagx reinc" title="Marcou corrigido faz tempo e o problema continua no espelho">reincidente</span>';

  var itens = c.problemas.map(function(p){
    return '<div style="margin-top:7px">'+
             '<span class="rotulo" style="background:var(--critico-fundo);color:var(--critico);display:inline-block;'+
             'border-radius:7px;font:700 12px \'Public Sans\';padding:3px 9px">'+ escapa(CAD_TIT[p.tipo] || p.tipo) +'</span>'+
             '<div class="fdet">'+ textoProblema(p) +'</div>'+
           '</div>';
  }).join("");

  esq.innerHTML =
    '<div class="fnum"><span class="fpac">' + escapa(c.paciente || "—") + '</span> · ficha ' +
      '<span class="mono">#' + escapa(c.paciente_id) + '</span>' + tags + '</div>' + itens;

  var acoes = document.createElement("div"); acoes.className = "acoes";
  var sel = document.createElement("select");
  sel.setAttribute("aria-label","O que você fez");
  TRAT_CAD.forEach(function(t){
    var o = document.createElement("option"); o.value = t[0]; o.textContent = t[1];
    if((c.tratamento||"pendente")===t[0]) o.selected = true;
    sel.appendChild(o);
  });
  sel.className = "trat-"+(c.tratamento||"pendente");
  var nota = document.createElement("input");
  nota.className = "nota"; nota.placeholder = "Anotar (o que corrigiu, com quem falou…)";
  nota.value = c.nota || "";
  var salvo = document.createElement("span"); salvo.className = "salvo"; salvo.textContent = "salvo ✔";
  var at = document.createElement("span"); at.className = "autora-tag";
  if(c.autora) at.textContent = "por "+c.autora;
  function persistir(){
    salvo.textContent = "salvando…"; salvo.classList.add("mostra");
    salvarOcNota("cadastro", c.oc_ref, { tratamento: sel.value, nota: nota.value.trim() }, function(okp){
      salvo.textContent = okp ? "salvo ✔" : "erro ao salvar ✖";
      salvo.style.color = okp ? "var(--ok)" : "var(--critico)";
      if(okp){
        c.tratamento = sel.value; c.nota = nota.value.trim(); c.autora = autora();
        setTimeout(function(){ salvo.classList.remove("mostra"); }, 1600);
        badgesTopo(); desenharCad();
      }
    });
  }
  sel.addEventListener("change", persistir);
  nota.addEventListener("keydown", function(ev){ if(ev.key==="Enter"){ nota.blur(); } });
  nota.addEventListener("blur", function(){ if(nota.value.trim() !== (c.nota||"")) persistir(); });
  acoes.appendChild(sel); acoes.appendChild(nota); acoes.appendChild(salvo); acoes.appendChild(at);
  esq.appendChild(acoes);
  card.appendChild(esq);
  card.appendChild(document.createElement("div"));
  return card;
}

/* ═══ 🗑️ Exclusões (apagar-todas): tela ═══ */
function desenharExcl(){
  var main = document.getElementById("gv-conteudo");
  main.innerHTML = "";
  var topo = document.createElement("div"); topo.className = "oc-topo edu";
  topo.innerHTML =
    '<h2>🗑️ Apagar-todas — proteção do faturamento</h2>'+
    '<p><b>Regra da casa:</b> nunca use "excluir TODAS as sessões" no Feegow — sempre <b>"somente este"</b> ou <b>"deste dia em diante"</b>. '+
    'Quando a série inteira é apagada, o robô PROTEGE os agendamentos (eles não somem do faturamento) e a família aparece aqui.</p>'+
    '<p>Apagou sem querer? <b>Restaure os agendamentos no Feegow</b> e marque "Restaurei" — a conferência da madrugada vê que voltou e o card some sozinho. '+
    'Era pra apagar mesmo (alta, desistência)? Marque <b>"Estava certo apagar"</b> — o dono aprova e o sistema libera.</p>'+
    '<p>⏳ <b>O card fica aqui até ser resolvido</b> — não some na virada do dia. Só o administrador pode tirá-lo da tela.</p>';
  main.appendChild(topo);
  if(estado.excl === null){
    var c = document.createElement("div"); c.className = "carregando";
    c.textContent = "Buscando as famílias protegidas…"; main.appendChild(c); return;
  }
  if(estado.exclErro){
    var er = document.createElement("div"); er.className = "erro";
    er.innerHTML = 'Não consegui ler <span class="mono">oc_exclusoes</span>.<br>' + escapa(estado.exclErro);
    main.appendChild(er); return;
  }
  if(!estado.excl.length){
    var v = document.createElement("div"); v.className = "vazio";
    v.innerHTML = "<b>Nada pendente ✔</b>Nenhuma série apagada esperando conserto.";
    main.appendChild(v); return;
  }
  estado.excl.forEach(function(x){ main.appendChild(xcardDe(x)); });
}
function xcardDe(x){
  var card = document.createElement("article");
  card.className = "fcard " + (x.aguardando_dono ? "g1" : (exclAberta(x) ? "g0" : "g2"));
  var esq = document.createElement("div");
  var tags = "";
  if(x.aguardando_dono) tags += '<span class="tagx aguarda">aguardando o dono</span>';
  if(x.reincidente) tags += '<span class="tagx reinc" title="Marcou restaurei faz tempo e a proteção continua de pé — o Feegow ainda não mostrou as sessões de volta">restaurei — e não voltou</span>';
  esq.innerHTML =
    '<div class="fnum"><span class="fpac">' + escapa(x.paciente || "—") + '</span> · ' + escapa(x.profissional || "—") + tags + '</div>'+
    '<div class="fmeta">' + escapa(x.dia_semana || "?") + ' às ' + escapa(x.horario || "?") +
      ' · <b>' + x.n_sessoes + ' sessões apagadas</b> · protegido em ' + fmtQuando(x.protegido_em) + '</div>'+
    '<div class="fdet">Datas: ' + escapa(x.datas_fmt || "—") + '</div>';
  var acoes = document.createElement("div"); acoes.className = "acoes";
  var selQ = document.createElement("select");
  selQ.setAttribute("aria-label","Quem apagou");
  QUEM_FEZ.forEach(function(t){
    var o = document.createElement("option"); o.value = t[0]; o.textContent = t[1];
    if((x.quem_fez||"")===t[0]) o.selected = true;
    selQ.appendChild(o);
  });
  var selT = document.createElement("select");
  selT.setAttribute("aria-label","O que você fez");
  TRAT_EXCL.forEach(function(t){
    var o = document.createElement("option"); o.value = t[0]; o.textContent = t[1];
    if((x.tratamento||"pendente")===t[0]) o.selected = true;
    selT.appendChild(o);
  });
  selT.className = "trat-"+(x.tratamento||"pendente");
  var nota = document.createElement("input");
  nota.className = "nota"; nota.placeholder = "Anotar (por que apagou, com quem confirmou…)";
  nota.value = x.nota || "";
  var salvo = document.createElement("span"); salvo.className = "salvo"; salvo.textContent = "salvo ✔";
  var at = document.createElement("span"); at.className = "autora-tag";
  if(x.autora) at.textContent = "por "+x.autora;
  function persistir(){
    salvo.textContent = "salvando…"; salvo.classList.add("mostra");
    salvarOcNota("exclusao", x.oc_ref,
      { quem_fez: selQ.value || null, tratamento: selT.value, nota: nota.value.trim() },
      function(okp){
        salvo.textContent = okp ? "salvo ✔" : "erro ao salvar ✖";
        salvo.style.color = okp ? "var(--ok)" : "var(--critico)";
        if(okp){
          x.quem_fez = selQ.value || null; x.tratamento = selT.value;
          x.nota = nota.value.trim(); x.autora = autora();
          x.aguardando_dono = (selT.value === "estava_certo" && !x.aprovada_em);
          setTimeout(function(){ salvo.classList.remove("mostra"); }, 1600);
          badgesTopo(); desenharExcl();
        }
      });
  }
  selQ.addEventListener("change", persistir);
  selT.addEventListener("change", persistir);
  nota.addEventListener("keydown", function(ev){ if(ev.key==="Enter"){ nota.blur(); } });
  nota.addEventListener("blur", function(){ if(nota.value.trim() !== (x.nota||"")) persistir(); });
  acoes.appendChild(selQ); acoes.appendChild(selT); acoes.appendChild(nota); acoes.appendChild(salvo); acoes.appendChild(at);
  esq.appendChild(acoes);
  card.appendChild(esq);
  var dir = document.createElement("div");
  dir.style.cssText = "display:flex;flex-direction:column;gap:6px;align-items:flex-end";
  if(x.aguardando_dono && ehDono()){
    var b = document.createElement("button");
    b.className = "gv-btn verde mini"; b.textContent = "👑 Aprovar e liberar";
    b.title = "Confirma que era pra apagar mesmo — a reconciliação enterra na próxima rodada";
    b.onclick = function(){ aprovarExclusao(x, b); };
    dir.appendChild(b);
  }
  if(ehDono()){
    var bx = document.createElement("button");
    bx.className = "fx"; bx.textContent = "✕";
    bx.title = "Tirar da tela (só o administrador) — NÃO solta a proteção do faturamento";
    bx.setAttribute("aria-label", "Dispensar este card");
    bx.onclick = function(){ dispensarExclusao(x, bx); };
    dir.appendChild(bx);
  }
  card.appendChild(dir);
  return card;
}

/* ═══ 👑 visão do dono · v2 ═══ */
function qAdm(rota){
  return fetch(GCFG.url + rota, { headers: cab() })
    .then(function(r){ if(!r.ok) throw new Error(rota + " → HTTP " + r.status); return r.json(); });
}
function buscarAdmin(){
  return Promise.all([
    qAdm("/rest/v1/pre_adm_reincidencias?select=*"),
    qAdm("/rest/v1/pre_adm_atendidas_sem_guia?select=*"),
    qAdm("/rest/v1/pre_agenda_notas?select=agendamento_id,tratamento,autora,atualizado_em"),
    loadCad(), loadExcl()
  ]);
}
function rankTxt(obj){
  var ks = Object.keys(obj);
  if(!ks.length) return "";
  return ks.sort(function(a,b){ return obj[b]-obj[a]; })
           .map(function(k){ return k + " " + obj[k]; }).join(" · ");
}
function rankQuemCriouObj(){
  var o = {};
  estado.linhas.forEach(function(l){ if(ehPendencia(l)) o[l.quem_criou || "?"] = (o[l.quem_criou || "?"]||0)+1; });
  return o;
}
function rankFuiEuObj(){
  var o = {};
  (estado.excl||[]).forEach(function(x){ if(x.quem_fez === "fui_eu") o[x.autora || "?"] = (o[x.autora || "?"]||0)+1; });
  return o;
}
function respostas7Obj(notas7){
  var corte7 = Date.now() - 7*24*3600*1000;
  var o = {};
  notas7.forEach(function(n){ if(n.autora) o[n.autora] = (o[n.autora]||0)+1; });
  (estado.cad||[]).concat(estado.excl||[]).forEach(function(r){
    if(r.autora && r.nota_atualizada_em && new Date(r.nota_atualizada_em).getTime() >= corte7)
      o[r.autora] = (o[r.autora]||0)+1;
  });
  return o;
}
function resumoTexto(P, reinc, atend, notas7){
  var cadT = (estado.cad||[]).length,  cadA = (estado.cad||[]).filter(cadAberto).length;
  var cadR = (estado.cad||[]).filter(function(c){ return c.reincidente; }).length;
  var exT  = (estado.excl||[]).length, exA  = (estado.excl||[]).filter(exclAberta).length;
  var exG  = (estado.excl||[]).filter(function(x){ return x.aguardando_dono; }).length;
  var l = [];
  l.push("📊 GUIAS DA AGENDA — resumo de " + new Date().toLocaleDateString("pt-BR") +
         " " + new Date().toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"}));
  l.push("🔴 Pendências vermelhas: " + P.pend + " · 🟡 avisos: " + P.avisos + " · hoje: " + P.hoje + " · amanhã: " + P.amanha);
  l.push("Por terapia (vermelhas): psico " + (P.porEsp.psicologia||0) + " · ABA " + (P.porEsp.aba||0) + " · nutrição " + (P.porEsp.nutricao||0));
  l.push("⚠️ Consultaram SEM guia (30d): " + atend.length +
         (atend.length ? " → " + atend.slice(0,5).map(function(a){ return a.paciente.split(" ")[0] + " " + a.data_fmt; }).join(", ") + (atend.length>5?"…":"") : ""));
  l.push("🔁 Reincidências (disse que resolveu, não resolveu): " + reinc.length +
         (reinc.length ? " → " + reinc.slice(0,5).map(function(r){ return r.paciente.split(" ")[0] + " (" + (r.autora_nota||"?") + ")"; }).join(", ") + (reinc.length>5?"…":"") : ""));
  l.push("🧾 Cadastros com problema: " + cadT + " (" + cadA + " sem resposta · " + cadR + " reincidentes)");
  l.push("🗑️ Apagar-todas: " + exT + " famílias (" + exA + " abertas · " + exG + " aguardando sua aprovação)");
  var rc = rankTxt(rankQuemCriouObj()); if(rc) l.push("👤 Vermelhas por quem marcou: " + rc);
  var rf = rankTxt(rankFuiEuObj());    if(rf) l.push("🙋 \"Fui eu\" nas exclusões: " + rf);
  l.push("✍️ Respostas da equipe (7d): " + (rankTxt(respostas7Obj(notas7)) || "nenhuma"));
  return l.join("\n");
}
function desenharAdmin(){
  if(!ehDono()){ trocaTela("agenda"); return; }
  var main = document.getElementById("gv-conteudo");
  main.innerHTML = '<div class="carregando">Montando os relatórios do dono…</div>';
  buscarAdmin().then(function(res){
    var reinc = res[0], atendTudo = res[1], notas = res[2];
    var atend = atendTudo.filter(function(a){ return a.dias_atras <= 30; });
    var corte7 = Date.now() - 7*24*3600*1000;
    var notas7 = notas.filter(function(n){ return new Date(n.atualizado_em).getTime() >= corte7; });
    var P = { pend:0, avisos:0, hoje:0, amanha:0, porEsp:{} };
    estado.linhas.forEach(function(l){
      if(ehAviso(l)) P.avisos++;
      if(!ehPendencia(l)) return;
      P.pend++;
      P.porEsp[l.especialidade] = (P.porEsp[l.especialidade]||0)+1;
      if(l.dias_ate === 0) P.hoje++;
      if(l.dias_ate === 1) P.amanha++;
    });
    var cadA = (estado.cad||[]).filter(cadAberto).length;
    var exA  = (estado.excl||[]).filter(exclAberta).length;
    var aguard = (estado.excl||[]).filter(function(x){ return x.aguardando_dono; });

    var h = '<div class="adm-titulo"><h2>👑 Visão do dono</h2>'+
            '<button class="gv-btn'+(estado.donoModo==="resumo"?" escuro":"")+'" id="admModoR">Resumo executivo</button>'+
            '<button class="gv-btn'+(estado.donoModo==="completo"?" escuro":"")+'" id="admModoC">Relatório completo</button>'+
            '<button class="gv-btn verde" id="admCopiar">📋 Copiar resumo</button></div>';

    if(estado.donoModo === "resumo"){
      h += '<div class="adm-pre" id="admPre"></div>';
      main.innerHTML = h;
      document.getElementById("admPre").textContent = resumoTexto(P, reinc, atend, notas7);
    } else {
      h += '<div class="adm-cards">'+
        '<div class="adm-card '+(P.pend?'vermelho':'verde')+'"><div class="num">'+P.pend+'</div><div class="rot">pendências vermelhas</div></div>'+
        '<div class="adm-card '+(P.avisos?'ambar':'verde')+'"><div class="num">'+P.avisos+'</div><div class="rot">avisos amarelos</div></div>'+
        '<div class="adm-card"><div class="num">'+P.hoje+' / '+P.amanha+'</div><div class="rot">hoje / amanhã</div></div>'+
        '<div class="adm-card '+(atend.length?'vermelho':'verde')+'"><div class="num">'+atend.length+'</div><div class="rot">consultaram sem guia · 30d</div></div>'+
        '<div class="adm-card '+(reinc.length?'ambar':'verde')+'"><div class="num">'+reinc.length+'</div><div class="rot">reincidências</div></div>'+
        '<div class="adm-card '+(cadA?'vermelho':'verde')+'"><div class="num">'+cadA+'</div><div class="rot">cadastros abertos</div></div>'+
        '<div class="adm-card '+(exA?'vermelho':'verde')+'"><div class="num">'+exA+'</div><div class="rot">apagar-todas abertas</div></div>'+
        '<div class="adm-card '+(aguard.length?'ambar':'verde')+'"><div class="num">'+aguard.length+'</div><div class="rot">aguardando aprovação</div></div>'+
        '<div class="adm-card"><div class="num">'+(P.porEsp.psicologia||0)+'·'+(P.porEsp.aba||0)+'·'+(P.porEsp.nutricao||0)+'</div><div class="rot">psico · aba · nutrição</div></div>'+
      '</div>';

      if(aguard.length){
        h += '<div class="adm-sec">👑 Aguardando a sua aprovação <small>(a secretária marcou "estava certo apagar")</small></div>';
        h += '<table class="adm"><tr><th>Paciente</th><th>Profissional</th><th>Quando</th><th>Sessões</th><th>Quem respondeu</th><th>Ação</th></tr>';
        aguard.forEach(function(x, i){
          h += '<tr><td><b>'+escapa(x.paciente)+'</b></td><td>'+escapa(x.profissional||"—")+'</td>'+
               '<td>'+escapa(x.dia_semana||"?")+' às '+escapa(x.horario||"?")+'</td>'+
               '<td>'+x.n_sessoes+'<br><small>'+escapa(x.datas_fmt||"")+'</small></td>'+
               '<td>'+escapa(x.autora||"—")+(x.nota?'<br><small>'+escapa(x.nota)+'</small>':'')+'</td>'+
               '<td><button class="gv-btn verde mini adm-aprova" data-i="'+i+'">👑 Aprovar</button></td></tr>';
        });
        h += '</table>';
      }

      h += '<div class="adm-sec">🔁 Falou que resolveu — e não resolveu <small>(tratado há mais de 2h e o problema continua VERMELHO)</small></div>';
      if(!reinc.length){ h += '<div class="adm-vazio">Nenhuma reincidência. As meninas estão fechando o que abrem ✔</div>'; }
      else {
        h += '<table class="adm"><tr><th>Consulta</th><th>Paciente</th><th>Problema atual</th><th>Disse</th><th>Quem</th><th>Há quanto</th><th>Nota</th></tr>';
        reinc.forEach(function(r){
          var m = SIT[r.situacao]||{rot:r.situacao,cls:"s1"};
          h += '<tr><td>'+escapa(r.data_fmt)+' '+escapa(r.horario)+'</td><td><b>'+escapa(r.paciente)+'</b><br><small>'+escapa(r.especialidade)+'</small></td>'+
               '<td><span class="tag-sit tag-'+(m.cls==="s0"?"s0":"s1")+'">'+escapa(m.rot)+'</span></td>'+
               '<td>'+escapa(r.tratamento==="resolvido"?"Resolvido":"Guia solicitada")+'</td>'+
               '<td>'+escapa(r.autora_nota||"—")+'</td><td>'+r.horas_desde_tratamento+'h</td>'+
               '<td><small>'+escapa(r.nota||"")+'</small></td></tr>';
        });
        h += '</table>';
      }

      h += '<div class="adm-sec">🚨 Paciente consultou SEM guia <small>(últimos 30 dias · ✔ = o faturamento também marcou)</small></div>';
      if(!atend.length){ h += '<div class="adm-vazio">Nenhuma consulta sem guia no período ✔</div>'; }
      else {
        h += '<table class="adm"><tr><th>Data</th><th>Paciente</th><th>Terapia</th><th>Profissional</th><th>Status</th><th>Faturamento</th></tr>';
        atend.forEach(function(a){
          h += '<tr><td>'+escapa(a.data_fmt)+' '+escapa(a.horario)+'<br><small>'+a.dias_atras+'d atrás</small></td>'+
               '<td><b>'+escapa(a.paciente)+'</b></td><td>'+escapa(a.especialidade)+'</td>'+
               '<td>'+escapa(a.profissional||"—")+'</td><td>'+escapa(a.status)+'</td>'+
               '<td>'+(a.f0_confirma?'<span class="tag-sit tag-s0">✔ sem_guia no f0</span>':'<small>só pela régua</small>')+'</td></tr>';
        });
        h += '</table>';
      }

      var rkC = rankQuemCriouObj(), rkCk = Object.keys(rkC).sort(function(a,b){ return rkC[b]-rkC[a]; });
      h += '<div class="adm-sec">👤 Quem marcou as consultas VERMELHAS <small>(usuário do Feegow que criou o agendamento)</small></div>';
      if(!rkCk.length){ h += '<div class="adm-vazio">Nenhuma pendência vermelha pra atribuir ✔</div>'; }
      else {
        h += '<table class="adm"><tr><th>Pessoa</th><th>Consultas vermelhas</th></tr>';
        rkCk.forEach(function(k){ h += '<tr><td><b>'+escapa(k)+'</b></td><td>'+rkC[k]+'</td></tr>'; });
        h += '</table>';
      }

      var rkF = rankFuiEuObj(), rkFk = Object.keys(rkF).sort(function(a,b){ return rkF[b]-rkF[a]; });
      if(rkFk.length){
        h += '<div class="adm-sec">🙋 Apagar-todas: quem assumiu "fui eu"</div>';
        h += '<table class="adm"><tr><th>Pessoa</th><th>Exclusões</th></tr>';
        rkFk.forEach(function(k){ h += '<tr><td><b>'+escapa(k)+'</b></td><td>'+rkF[k]+'</td></tr>'; });
        h += '</table>';
      }

      var rk7 = respostas7Obj(notas7), rk7k = Object.keys(rk7).sort(function(a,b){ return rk7[b]-rk7[a]; });
      h += '<div class="adm-sec">✍️ Respostas registradas <small>(últimos 7 dias · agenda + cadastros + exclusões, por pessoa)</small></div>';
      if(!rk7k.length){ h += '<div class="adm-vazio" style="background:var(--info-fundo);color:var(--info)">Ninguém registrou resposta nos últimos 7 dias.</div>'; }
      else {
        h += '<table class="adm"><tr><th>Pessoa</th><th>Respostas</th></tr>';
        rk7k.forEach(function(k){ h += '<tr><td><b>'+escapa(k)+'</b></td><td>'+rk7[k]+'</td></tr>'; });
        h += '</table>';
      }
      main.innerHTML = h;
      var aps = main.querySelectorAll(".adm-aprova");
      for(var i=0;i<aps.length;i++){
        (function(btn){
          btn.addEventListener("click", function(){ aprovarExclusao(aguard[parseInt(btn.getAttribute("data-i"),10)], btn); });
        })(aps[i]);
      }
    }
    document.getElementById("admModoR").onclick = function(){ estado.donoModo = "resumo"; desenharAdmin(); };
    document.getElementById("admModoC").onclick = function(){ estado.donoModo = "completo"; desenharAdmin(); };
    document.getElementById("admCopiar").onclick = function(){
      var txt = resumoTexto(P, reinc, atend, notas7);
      var fim = function(okc){ alert(okc ? "Resumo copiado — é só colar no WhatsApp." : txt); };
      if(navigator.clipboard && navigator.clipboard.writeText){
        navigator.clipboard.writeText(txt).then(function(){ fim(true); }, function(){ fim(false); });
      } else { fim(false); }
    };
  }).catch(function(e){
    main.innerHTML = '<div class="erro">Não consegui montar a visão do dono.<br>'+escapa(e.message)+
      '<br><small>As views pre_adm_* / cad_alertas / oc_exclusoes existem? Rode o 10_SQL_PAINEL_V2.sql.</small></div>';
  });
}

/* ═══ navegação interna · boot · relógio de 10 min ═══ */
/* ═══ ✂️ CORTE + 📵 FALHAS · v2.1 (24/08/2026) ═══
   Lê corte_fila e conf_falhas (11_SQL_CORTE.sql). Assinatura da tesoura
   grava em corte_notas. Número de celular: só dígitos SEM o 55, copiável
   — a plataforma da casa busca assim. */
var SIT_CORTE = {
  cortar_hoje:       {rot:"CORTAR HOJE",        cls:"s0", g:"g0"},
  cortar_agora:      {rot:"Cortar agora",       cls:"s0", g:"g0"},
  prazo_vencido:     {rot:"Prazo VENCIDO",      cls:"s0", g:"g0"},
  aguardando:        {rot:"Aguardando guia",    cls:"sinfo", g:"ginfo"},
  indulto:           {rot:"Indulto ativo",      cls:"sinfo", g:"ginfo"},
  excluido_conferir: {rot:"Excluída — conferindo", cls:"s1", g:"g1"}
};
function corteAtivo(c){
  return c.estado === "cortar_hoje" || c.estado === "cortar_agora" ||
         c.estado === "prazo_vencido" || c.apagou_incompleto === true;
}
function foneDigitos(cel){ return (cel || "").replace(/^55/, ""); }
function botaoFone(cel){
  var b = document.createElement("button");
  b.type = "button"; b.className = "fone";
  var dig = foneDigitos(cel);
  b.innerHTML = "📱 <span class=\"mono\">" + escapa(dig) + "</span>";
  b.title = "Copiar o número (só dígitos, sem o 55) — é assim que a busca da plataforma acha";
  b.onclick = function(){
    (navigator.clipboard ? navigator.clipboard.writeText(dig) : Promise.reject())
      .then(function(){ b.innerHTML = "✔ copiado"; },
            function(){ window.prompt("Copie o número:", dig); });
    setTimeout(function(){ b.innerHTML = "📱 <span class=\"mono\">" + escapa(dig) + "</span>"; }, 1600);
  };
  return b;
}
function fmtPrazo(p){
  if(!p) return "";
  var d = new Date(p);
  if(isNaN(d)) return escapa(p);
  var dias = ["dom","seg","ter","qua","qui","sex","sáb"];
  return dias[d.getDay()] + " " + String(d.getDate()).padStart(2,"0") + "/" +
         String(d.getMonth()+1).padStart(2,"0") + " às " +
         String(d.getHours()).padStart(2,"0") + "h" +
         (d.getMinutes() ? String(d.getMinutes()).padStart(2,"0") : "");
}

/* ── ✂️ dados ── */
function loadCorte(){
  fetch(GCFG.url + "/rest/v1/corte_fila?select=*", { headers: cab() })
    .then(function(r){ if(!r.ok) throw new Error("HTTP "+r.status); return r.json(); })
    .then(function(rows){ estado.corte = rows || []; estado.corteErro = "";
                          if(estado.tela === "corte") desenharCorte(); badgesTopo(); })
    .catch(function(e){ estado.corteErro = String(e.message||e);
                        if(estado.tela === "corte") desenharCorte(); });
}
function salvarCorteNota(ref, campos, aoSalvar){
  var corpo = Object.assign({ referencia: ref, autora: autora() }, campos);
  fetch(GCFG.url + "/rest/v1/corte_notas?on_conflict=referencia", {
    method: "POST",
    headers: Object.assign({ "Content-Type": "application/json",
                             "Prefer": "resolution=merge-duplicates" }, cab()),
    body: JSON.stringify(corpo)
  }).then(function(r){ if(!r.ok) throw new Error("HTTP "+r.status);
                       if(aoSalvar) aoSalvar(true); loadCorte(); })
    .catch(function(){ if(aoSalvar) aoSalvar(false); });
}

/* ── ✂️ tela ── */
function desenharCorte(){
  var host = document.getElementById("gv-conteudo"); if(!host) return;
  host.innerHTML = "";
  var topo = document.createElement("div"); topo.className = "gv-explica";
  topo.innerHTML =
    "<b>✂️ A tesoura do dia.</b> Quem está aqui <b>perdeu a cobertura</b>: ou hoje é a última " +
    "consulta viável (corte às <b>21h</b> — sábado, <b>11h</b>), ou os futuros já estão sem guia. " +
    "O caminho: abrir o link do <b>PRÓXIMO</b> agendamento no Feegow e apagar <b>\u201ceste e os " +
    "próximos\u201d</b> (nunca os anteriores!) — depois assinar aqui no botão <b>Excluí</b>. " +
    "O card some sozinho quando o espelho confirmar. <b>Aguardando</b> = guia solicitada, " +
    "prazo máximo de 2 dias; venceu, corta.";
  host.appendChild(topo);
  if(estado.corteErro){
    var er = document.createElement("p"); er.className = "gv-vazio";
    er.textContent = "⚠️ " + estado.corteErro + " — o 11_SQL_CORTE.sql já rodou no banco?";
    host.appendChild(er); return;
  }
  if(estado.corte === null){
    var lo = document.createElement("p"); lo.className = "gv-vazio";
    lo.textContent = "Carregando a fila…"; host.appendChild(lo); return;
  }
  var rows = estado.corte.slice();
  if(!rows.length){
    var ok = document.createElement("p"); ok.className = "gv-vazio";
    ok.textContent = "✂️ Fila limpa — ninguém pra cortar. A agenda está blindada.";
    host.appendChild(ok); return;
  }
  var ordem = { cortar_hoje:0, prazo_vencido:1, cortar_agora:2, excluido_conferir:3, aguardando:4, indulto:5 };
  rows.sort(function(a,b){ return (ordem[a.estado]||9) - (ordem[b.estado]||9); });
  rows.forEach(function(c){ host.appendChild(cardCorte(c)); });
}
function cardCorte(c){
  var meta = SIT_CORTE[c.estado] || {rot:c.estado, cls:"sinfo", g:"ginfo"};
  var card = document.createElement("article");
  card.className = "card " + meta.g + (c.estado === "indulto" ? " tratada" : "");
  var det = [];
  det.push("<b>" + (c.n_descobertos||0) + "</b> futuro(s) sem cobertura: " + escapa(c.datas_fmt||"—"));
  if(c.motivos) det.push("motivo: " + escapa(c.motivos));
  if(c.prazo) det.push("⏱️ prazo: <b>" + fmtPrazo(c.prazo) + "</b>");
  if(c.estado === "aguardando")
    det.push("🔁 guia " + (c.hold_fila_em ? "na fila do robô" : "solicitada no balcão") + " — segurando o corte");
  if(c.apagou_incompleto)
    det.push('<span class="reinc">⚠️ APAGOU INCOMPLETO — assinado como excluída, mas os futuros AINDA existem. Foi apagado só um? Abrir o Feegow e apagar \u201ceste e os próximos\u201d.</span>');
  if(c.tratamento === "indulto" && c.indulto_ate)
    det.push("🕊️ indulto até <b>" + fmtData(c.indulto_ate) + "</b>" + (c.autora ? " · por " + escapa(c.autora) : ""));
  if(c.tratamento === "excluido" && c.nota_atualizada_em)
    det.push("✂️ assinada como excluída " + (c.autora ? "por <b>" + escapa(c.autora) + "</b> " : "") + "em " + fmtQuando(c.nota_atualizada_em));
  card.innerHTML =
    '<div class="hora">✂️</div>' +
    '<div class="quem">' +
      '<div class="paciente">' + escapa(c.paciente) + '</div>' +
      '<div class="meta"><span class="esp">' + escapa(c.especialidade) + '</span></div>' +
    '</div>' +
    '<div class="sit ' + meta.cls + '"><span class="rotulo">' + escapa(meta.rot) + '</span>' +
      '<div class="detalhe">' + det.join("<br>") + '</div></div>';
  var acoes = document.createElement("div"); acoes.className = "acoes";
  if(c.alvo_agendamento_id){
    var lk = document.createElement("a");
    lk.className = "fone"; lk.target = "_blank"; lk.rel = "noopener";
    lk.href = "https://app.feegow.com/main/?P=Agenda-1&Pers=1&AgendamentoID=" + c.alvo_agendamento_id;
    lk.innerHTML = "🎯 abrir o PRÓXIMO no Feegow";
    lk.title = "Abre direto no agendamento a apagar — dele em diante";
    acoes.appendChild(lk);
  }
  var cel = primeiroCelular(c.celulares_raw, c.telefones_raw);
  if(cel) acoes.appendChild(botaoFone(cel));
  var bEx = document.createElement("button"); bEx.type = "button";
  bEx.className = "fone"; bEx.innerHTML = "✂️ Excluí no Feegow";
  bEx.title = "Assinar que os futuros foram apagados (este e os próximos)";
  bEx.onclick = function(){
    if(!autora()){ alert("Entre com seu PIN primeiro — a assinatura precisa de nome."); return; }
    if(!confirm("Confirmar: os agendamentos futuros de " + c.paciente + " (" + c.especialidade + ") foram apagados no Feegow?")) return;
    bEx.disabled = true;
    salvarCorteNota(c.oc_ref, { tratamento: "excluido", indulto_ate: null },
      function(ok){ if(!ok){ bEx.disabled = false; alert("Não consegui salvar — tente de novo."); } });
  };
  acoes.appendChild(bEx);
  var bIn = document.createElement("button"); bIn.type = "button";
  bIn.className = "fone"; bIn.innerHTML = "🕊️ Indulto…";
  bIn.title = "Segurar o corte por alguns dias (assinado)";
  bIn.onclick = function(){
    if(!autora()){ alert("Entre com seu PIN primeiro — o indulto é assinado."); return; }
    var d = parseInt(window.prompt("Não cortar por quantos dias? (1 a 14)", "3"), 10);
    if(!d || d < 1 || d > 14) return;
    var ate = new Date(); ate.setDate(ate.getDate() + d);
    var iso = ate.getFullYear() + "-" + String(ate.getMonth()+1).padStart(2,"0") + "-" + String(ate.getDate()).padStart(2,"0");
    var motivo = window.prompt("Motivo do indulto (fica registrado):", "") || "";
    salvarCorteNota(c.oc_ref, { tratamento: "indulto", indulto_ate: iso, nota: motivo }, null);
  };
  acoes.appendChild(bIn);
  card.appendChild(acoes);
  return card;
}

/* ── 📵 dados ── */
function loadFalhas(){
  fetch(GCFG.url + "/rest/v1/conf_falhas?select=*", { headers: cab() })
    .then(function(r){ if(!r.ok) throw new Error("HTTP "+r.status); return r.json(); })
    .then(function(rows){ estado.falhas = rows || []; estado.falhasErro = "";
                          if(estado.tela === "falhas") desenharFalhas(); badgesTopo(); })
    .catch(function(e){ estado.falhasErro = String(e.message||e);
                        if(estado.tela === "falhas") desenharFalhas(); });
}

/* ── 📵 textos (espelho do kit v1.7 / robô v1.9 — mudou lá, muda aqui) ── */
var TPL_AVISOS = {
  "OK": "✅ Sua guia está em dia — é só chegar que a gente cuida do resto.",
  "3 SESSÕES RESTANTES": "Sua guia tem *3 sessões* restantes. Vale já pedir a renovação com seu médico ou na Unimed — assim seus horários seguem garantidos, sem correria.",
  "2 SESSÕES RESTANTES": "Sua guia tem só *2 sessões* restantes. Sem guia nova registrada, os horários fixos são liberados quando ela acabar. Se puder, adiante a renovação esta semana.",
  "ÚLTIMA SESSÃO": "⚠️ Esta é a *última sessão* da sua guia. Se a guia nova não entrar no sistema *até as 21h do dia da consulta* (aos sábados, *11h*), os próximos horários são liberados automaticamente. Já solicitou? Responda esta mensagem que a gente confere junto.",
  "VENCE EM 10 A 15 DIAS": "A validade da sua guia está chegando ao fim. Já dá pra pedir a atualização da data na Unimed com calma.",
  "VENCE EM MENOS DE 10 DIAS": "Sua guia vence em *menos de 10 dias*. Peça a atualização da validade na Unimed pra seus horários seguirem garantidos.",
  "VENCE EM 3 DIAS OU MENOS": "⚠️ Sua guia vence em *3 dias ou menos* — e guia vencida sai da agenda. Fale com a Unimed *hoje* pra atualizar a validade e manter seus horários.",
  "GUIA VENCIDA": "Sua guia está *vencida* — e guia vencida sai da agenda. Fale com a Unimed pra atualizar a validade ou solicite guia nova com seu médico. Dúvidas, é só responder aqui."
};
function linkConfirmacao(id){ return "https://api.feegow.com.br/confirmation/" + id + ":1005416"; }
function textoFalha(f){
  var nome = f.nome_paciente || "paciente";
  var abre = "Oi, " + nome + "! Aqui é do Centro Médico JF / Lev Soul 🤍\n\n";
  if(f.tipo === "lembrete"){
    return abre +
      "Lembrete do seu atendimento de *hoje, " + (f.data_fmt||"") + "*, às *" + (f.horario||"") + "*, com *" +
      (f.profissional||"—") + "* (" + (f.especialidade||"—") + ").\n\n" +
      "Qualquer imprevisto, é só responder esta mensagem.\n\n" +
      "Pra confirmar ou desmarcar, é só tocar aqui:\n" + linkConfirmacao(f.agendamento_id) + "\n\nAté daqui a pouco.";
  }
  var corpo = abre +
    "Passando pra confirmar seu atendimento:\n\n" +
    "📅 *" + (f.data_fmt||"") + "*, às *" + (f.horario||"") + "*\n" +
    "Profissional: *" + (f.profissional||"—") + "* · " + (f.especialidade||"—") + "\n" +
    "Local: Rua Caetano Puglise, 170 – Jundiaí, Anápolis\n\n";
  if(f.usa_template_guia){
    corpo += "—\n*Sua guia Unimed*\n" +
      "Sessões disponíveis: *" + (f.qt_atual!=null ? f.qt_atual : "—") + "*\n" +
      "Válida até: *" + (f.validade_fmt||"—") + "*\n" +
      (TPL_AVISOS[f.situacao] || "") + "\n—\n\n";
  }
  corpo += "Pra *confirmar ou desmarcar*, é só tocar no link:\n" + linkConfirmacao(f.agendamento_id) +
    "\n\nQualquer imprevisto, responda esta mensagem que a gente encontra junto o melhor caminho.";
  return corpo;
}

/* ── 📵 tela ── */
function desenharFalhas(){
  var host = document.getElementById("gv-conteudo"); if(!host) return;
  host.innerHTML = "";
  var topo = document.createElement("div"); topo.className = "gv-explica";
  topo.innerHTML =
    "<b>📵 Mensagens que o robô NÃO conseguiu entregar</b> (consultas de hoje em diante). " +
    "A regra da casa: <b>ninguém sai da agenda sem ter sido avisado</b> — então é a recepção quem manda na mão: " +
    "<b>copiar o número</b>, achar a conversa na plataforma, <b>copiar a mensagem pronta</b> e enviar. " +
    "SEM CELULAR = completar o cadastro primeiro.";
  host.appendChild(topo);
  if(estado.falhasErro){
    var er = document.createElement("p"); er.className = "gv-vazio";
    er.textContent = "⚠️ " + estado.falhasErro + " — o 11_SQL_CORTE.sql já rodou no banco?";
    host.appendChild(er); return;
  }
  if(estado.falhas === null){
    var lo = document.createElement("p"); lo.className = "gv-vazio";
    lo.textContent = "Carregando…"; host.appendChild(lo); return;
  }
  if(!estado.falhas.length){
    var ok = document.createElement("p"); ok.className = "gv-vazio";
    ok.textContent = "📵 Nenhuma falha — todas as mensagens do período chegaram.";
    host.appendChild(ok); return;
  }
  estado.falhas.forEach(function(f){ host.appendChild(cardFalha(f)); });
}
function cardFalha(f){
  var semCel = (f.status_envio === "SEM CELULAR");
  var card = document.createElement("article");
  card.className = "card " + (semCel ? "g0" : "g1");
  var det = [];
  det.push("consulta <b>" + escapa(f.data_fmt||"") + "</b> às <b>" + escapa(f.horario||"") + "</b> · " + escapa(f.profissional||"—"));
  det.push("mensagem: <b>" + escapa(f.tipo) + "</b> · falha: <b>" + escapa(f.status_envio) + "</b>" +
           (f.erro_detalhe ? ' <span class="mono">(' + escapa(String(f.erro_detalhe).slice(0,80)) + ')</span>' : ""));
  if(f.ultima_tentativa) det.push("última tentativa " + fmtQuando(f.ultima_tentativa));
  if(semCel) det.push("<b>cadastro sem celular</b> — completar no Feegow antes de qualquer coisa");
  card.innerHTML =
    '<div class="hora">' + escapa(f.horario||"—") + '</div>' +
    '<div class="quem">' +
      '<div class="paciente">' + escapa(f.nome_paciente||("ID:"+f.paciente_id)) + '</div>' +
      '<div class="meta"><span class="esp">' + escapa(f.especialidade||"—") + '</span></div>' +
    '</div>' +
    '<div class="sit ' + (semCel ? "s0" : "s1") + '"><span class="rotulo">' + (semCel ? "Sem celular" : "Envio falhou") + '</span>' +
      '<div class="detalhe">' + det.join("<br>") + '</div></div>';
  var acoes = document.createElement("div"); acoes.className = "acoes";
  var cel = primeiroCelular(f.celulares_raw, f.telefones_raw);
  if(cel) acoes.appendChild(botaoFone(cel));
  var bMsg = document.createElement("button"); bMsg.type = "button";
  bMsg.className = "fone"; bMsg.innerHTML = "📋 copiar a mensagem pronta";
  bMsg.title = "O texto do padrão novo, com os dados deste paciente preenchidos";
  bMsg.onclick = function(){
    var txt = textoFalha(f);
    (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject())
      .then(function(){ bMsg.innerHTML = "✔ copiada — é só colar na conversa"; },
            function(){ window.prompt("Copie a mensagem:", txt); });
    setTimeout(function(){ bMsg.innerHTML = "📋 copiar a mensagem pronta"; }, 2200);
  };
  acoes.appendChild(bMsg);
  card.appendChild(acoes);
  return card;
}

/* ═══════════════════ 📦 MALOTES (F4) ═══════════════════ */
/* Parser TISS 4.03 — espelho fiel do subir_malotes.py, testado contra o
   lote 50 real (35 guias · 35 linhas · R$ 2.020,00). */
var FX4NS = "http://www.ans.gov.br/padroes/tiss/schemas";
function fx4Tag(el, nome){
  if(!el) return null;
  var ns = el.getElementsByTagNameNS(FX4NS, nome);
  if(!ns.length) return null;
  var t = (ns[0].textContent || "").trim();
  return t === "" ? null : t;
}
function fx4TagFilho(el, caminho){
  var cur = el;
  for(var i=0;i<caminho.length;i++){
    if(!cur) return null;
    var f = cur.getElementsByTagNameNS(FX4NS, caminho[i]);
    cur = f.length ? f[0] : null;
  }
  if(!cur) return null;
  var t = (cur.textContent || "").trim();
  return t === "" ? null : t;
}
function fx4Num(s){ if(s===null||s===undefined||s==="") return null;
  var v = parseFloat(s); return isNaN(v) ? null : v; }

function fx4ParseXML(texto, nomeArquivo){
  var doc = new DOMParser().parseFromString(texto, "text/xml");
  var erro = doc.getElementsByTagName("parsererror");
  if(erro && erro.length) throw new Error("XML ilegível: " + String(erro[0].textContent||"").slice(0,120));
  var cab2 = doc.getElementsByTagNameNS(FX4NS, "cabecalho")[0];
  var idt  = cab2 ? cab2.getElementsByTagNameNS(FX4NS, "identificacaoTransacao")[0] : null;
  var lote = doc.getElementsByTagNameNS(FX4NS, "loteGuias")[0];
  if(!lote) throw new Error("XML sem loteGuias — isso é um malote TISS?");
  var semExt = (nomeArquivo||"").replace(/\.xml$/i, "");
  var base = {
    numero_lote:             fx4Tag(lote, "numeroLote"),
    nome_beneficiario:       semExt,
    arquivo_origem:          nomeArquivo || null,
    tipo_transacao:          fx4Tag(idt, "tipoTransacao"),
    sequencial_transacao:    fx4Tag(idt, "sequencialTransacao"),
    data_registro_transacao: fx4Tag(idt, "dataRegistroTransacao"),
    hora_registro_transacao: fx4Tag(idt, "horaRegistroTransacao"),
    codigo_prestador_origem: fx4TagFilho(cab2, ["origem","identificacaoPrestador","codigoPrestadorNaOperadora"]),
    registro_ans_destino:    fx4TagFilho(cab2, ["destino","registroANS"]),
    padrao:                  fx4Tag(cab2, "Padrao"),
    hash:                    fx4TagFilho(doc.documentElement, ["epilogo","hash"])
  };
  var linhas = [];
  var guias = lote.getElementsByTagNameNS(FX4NS, "guiaSP-SADT");
  for(var g=0; g<guias.length; g++){
    var G = guias[g];
    var sol = null;
    var ds = G.getElementsByTagNameNS(FX4NS, "dadosSolicitante");
    if(ds.length){
      var ps = ds[0].getElementsByTagNameNS(FX4NS, "profissionalSolicitante");
      sol = ps.length ? ps[0] : null;
    }
    var vt = G.getElementsByTagNameNS(FX4NS, "valorTotal");
    vt = vt.length ? vt[vt.length-1] : null;
    var bg = {};
    for(var k in base) bg[k] = base[k];
    bg.registro_ans_guia           = fx4TagFilho(G, ["cabecalhoGuia","registroANS"]);
    bg.numero_guia_prestador       = fx4TagFilho(G, ["cabecalhoGuia","numeroGuiaPrestador"]);
    bg.numero_guia_operadora       = fx4TagFilho(G, ["dadosAutorizacao","numeroGuiaOperadora"]);
    bg.data_autorizacao            = fx4TagFilho(G, ["dadosAutorizacao","dataAutorizacao"]);
    bg.senha                       = fx4TagFilho(G, ["dadosAutorizacao","senha"]);
    bg.data_validade_senha         = fx4TagFilho(G, ["dadosAutorizacao","dataValidadeSenha"]);
    bg.numero_carteira             = fx4TagFilho(G, ["dadosBeneficiario","numeroCarteira"]);
    bg.atendimento_rn              = fx4TagFilho(G, ["dadosBeneficiario","atendimentoRN"]);
    bg.tipo_ident                  = fx4TagFilho(G, ["dadosBeneficiario","tipoIdent"]);
    bg.cod_prestador_solicitante   = fx4TagFilho(G, ["dadosSolicitante","contratadoSolicitante","codigoPrestadorNaOperadora"]);
    bg.nome_contratado_solicitante = fx4TagFilho(G, ["dadosSolicitante","nomeContratadoSolicitante"]);
    bg.prof_solicitante_nome       = fx4Tag(sol, "nomeProfissional");
    bg.prof_solicitante_conselho   = fx4Tag(sol, "conselhoProfissional");
    bg.prof_solicitante_numero     = fx4Tag(sol, "numeroConselhoProfissional");
    bg.prof_solicitante_uf         = fx4Tag(sol, "UF");
    bg.prof_solicitante_cbos       = fx4Tag(sol, "CBOS");
    bg.data_solicitacao            = fx4TagFilho(G, ["dadosSolicitacao","dataSolicitacao"]);
    bg.carater_atendimento         = fx4TagFilho(G, ["dadosSolicitacao","caraterAtendimento"]);
    bg.indicacao_clinica           = fx4TagFilho(G, ["dadosSolicitacao","indicacaoClinica"]);
    bg.cod_prestador_executante    = fx4TagFilho(G, ["dadosExecutante","contratadoExecutante","codigoPrestadorNaOperadora"]);
    bg.cnes                        = fx4TagFilho(G, ["dadosExecutante","CNES"]);
    bg.tipo_atendimento            = fx4TagFilho(G, ["dadosAtendimento","tipoAtendimento"]);
    bg.indicacao_acidente          = fx4TagFilho(G, ["dadosAtendimento","indicacaoAcidente"]);
    bg.regime_atendimento          = fx4TagFilho(G, ["dadosAtendimento","regimeAtendimento"]);
    bg.valor_procedimentos         = fx4Num(fx4Tag(vt, "valorProcedimentos"));
    bg.valor_diarias               = fx4Num(fx4Tag(vt, "valorDiarias"));
    bg.valor_taxas_alugueis        = fx4Num(fx4Tag(vt, "valorTaxasAlugueis"));
    bg.valor_materiais             = fx4Num(fx4Tag(vt, "valorMateriais"));
    bg.valor_medicamentos          = fx4Num(fx4Tag(vt, "valorMedicamentos"));
    bg.valor_opme                  = fx4Num(fx4Tag(vt, "valorOPME"));
    bg.valor_gases_medicinais      = fx4Num(fx4Tag(vt, "valorGasesMedicinais"));
    bg.valor_total_geral           = fx4Num(fx4Tag(vt, "valorTotalGeral"));
    var procs = G.getElementsByTagNameNS(FX4NS, "procedimentoExecutado");
    for(var p=0; p<procs.length; p++){
      var P = procs[p];
      var eqs = P.getElementsByTagNameNS(FX4NS, "equipeSadt");
      var eq = eqs.length ? eqs[0] : null;
      var L = {};
      for(var k2 in bg) L[k2] = bg[k2];
      L.sequencial_item        = fx4Tag(P, "sequencialItem");
      L.data_execucao          = fx4Tag(P, "dataExecucao");
      L.hora_inicial           = fx4Tag(P, "horaInicial");
      L.hora_final             = fx4Tag(P, "horaFinal");
      L.codigo_tabela          = fx4TagFilho(P, ["procedimento","codigoTabela"]);
      L.codigo_procedimento    = fx4TagFilho(P, ["procedimento","codigoProcedimento"]);
      L.descricao_procedimento = fx4TagFilho(P, ["procedimento","descricaoProcedimento"]);
      L.quantidade_executada   = fx4Num(fx4Tag(P, "quantidadeExecutada"));
      L.via_acesso             = fx4Tag(P, "viaAcesso");
      L.tecnica_utilizada      = fx4Tag(P, "tecnicaUtilizada");
      L.reducao_acrescimo      = fx4Num(fx4Tag(P, "reducaoAcrescimo"));
      L.valor_unitario         = fx4Num(fx4Tag(P, "valorUnitario"));
      L.valor_total            = fx4Num(fx4Tag(P, "valorTotal"));
      L.grau_part              = fx4Tag(eq, "grauPart");
      L.prof_exec_cpf          = fx4TagFilho(eq, ["codProfissional","cpfContratado"]);
      L.prof_exec_nome         = fx4Tag(eq, "nomeProf");
      L.prof_exec_conselho     = fx4Tag(eq, "conselho");
      L.prof_exec_numero       = fx4Tag(eq, "numeroConselhoProfissional");
      L.prof_exec_uf           = fx4Tag(eq, "UF");
      L.prof_exec_cbos         = fx4Tag(eq, "CBOS");
      linhas.push(L);
    }
  }
  return { numero_lote: base.numero_lote, linhas: linhas };
}

/* ── infra ── */
function fx4Rpc(fn, corpo){
  return fetch(GCFG.url + "/rest/v1/rpc/" + fn, {
    method: "POST",
    headers: cab({"Content-Type":"application/json"}),
    body: JSON.stringify(corpo)
  }).then(function(r){
    return r.text().then(function(t){
      var j = null; try{ j = JSON.parse(t); }catch(e){}
      if(!r.ok){
        var msg = (j && (j.message || j.hint || j.details)) || ("HTTP " + r.status);
        throw new Error(msg);
      }
      return j;
    });
  });
}
function fx4Dinheiro(v){
  if(v === null || v === undefined) return "—";
  return "R$ " + Number(v).toFixed(2).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}
function fx4Data(iso){
  if(!iso) return "—";
  var m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? (m[3] + "/" + m[2] + "/" + m[1].slice(2)) : String(iso);
}
function fx4PedeXML(cb){
  var i = document.createElement("input");
  i.type = "file"; i.accept = ".xml,text/xml";
  i.onchange = function(){ if(i.files && i.files[0]) cb(i.files[0]); };
  i.click();
}
function fx4LerArquivo(file, cb, cbErro){
  var fr = new FileReader();
  fr.onload  = function(){ cb(fr.result); };
  fr.onerror = function(){ cbErro(new Error("não consegui ler o arquivo")); };
  fr.readAsText(file, "ISO-8859-1");   /* o TISS da Unimed sai em ISO-8859-1 */
}

/* ── dados ── */
function loadMalotes(){
  var q = function(rota){
    return fetch(GCFG.url + "/rest/v1/" + rota, { headers: cab() })
      .then(function(r){
        if(!r.ok) throw new Error("HTTP " + r.status + " — o fx4_sql_modulo_malotes.sql já rodou no banco?");
        return r.json();
      });
  };
  Promise.all([
    q("fx4_fila_malote?select=*"),
    q("fx4_malotes?select=*&estado=neq.enviado&order=id.desc"),
    q("fx4_rejeicoes_sgu?select=*&order=criada_em.desc&limit=100"),
    q("fx4_conferencias_xml?select=malote_id,veredito,problemas,resumo,arquivo,qt_guias,qt_linhas,valor_total,conferida_em&order=id.desc&limit=60")
  ]).then(function(res){
    estado.malotes = { fila: res[0], vivos: res[1], rej: res[2], confs: res[3] };
    estado.malotesErro = "";
    var b = document.getElementById("gv-b-malotes");
    if(b){
      var pend = res[1].length + res[2].filter(function(r){ return !r.tratada; }).length;
      b.textContent = pend; b.hidden = (pend === 0);
    }
    if(estado.tela === "malotes") desenharMalotes();
  }).catch(function(e){
    estado.malotesErro = e.message || String(e);
    if(estado.tela === "malotes") desenharMalotes();
  });
}
function fx4UltConf(mid){
  var cs = (estado.malotes && estado.malotes.confs) || [];
  for(var i=0;i<cs.length;i++) if(cs[i].malote_id === mid) return cs[i];
  return null;
}

/* ── ações ── */
function fx4Fechar(convId, prestadores){
  var rot = (convId === 8) ? "Intercâmbio" : "Local";
  if(!confirm("Assinar o X do MALOTE FECHADO?\n\n" + rot + " · " + prestadores.length +
      " guia(s).\n\nIsso congela a lista: as guias saem da fila e o malote passa a esperar o XML."))
    return;
  fx4Rpc("fx4_marcar_fechado", { p_convenio_id: convId, p_prestadores: prestadores, p_quem: autora() })
    .then(function(){ loadMalotes(); })
    .catch(function(e){ alert("Não deu pra fechar o malote:\n" + e.message); });
}
function fx4Conferir(m, file, observacao){
  fx4LerArquivo(file, function(texto){
    var r;
    try { r = fx4ParseXML(texto, file.name); }
    catch(e){ alert("Problema no arquivo:\n" + e.message); return; }
    if(!r.linhas.length){ alert("O XML não tem nenhuma linha de procedimento."); return; }
    estado.malotesUlt[m.id] = { rodando: true };
    desenharMalotes();
    fx4Rpc("fx4_conferir_xml", {
      p_malote_id: m.id, p_linhas: r.linhas, p_arquivo: file.name,
      p_quem: autora(), p_observacao: observacao || null
    }).then(function(res){
      estado.malotesUlt[m.id] = res;
      loadMalotes();
    }).catch(function(e){
      estado.malotesUlt[m.id] = { erro: e.message };
      desenharMalotes();
    });
  }, function(e){ alert(e.message); });
}
function fx4Correcao(m){
  var obs = window.prompt(
    "CORREÇÃO PÓS-SGU\n\nCole aqui O QUE O SGU FALOU (o motivo da rejeição).\n" +
    "Guia que sumir do XML novo vira rejeição registrada com este motivo — e a linha volta pra conferência (F3) corrigir.", "");
  if(obs === null) return;
  if(!obs.trim()){ alert("Sem o motivo do SGU não dá — é ele que vai pra análise do dono."); return; }
  fx4PedeXML(function(file){ fx4Conferir(m, file, obs.trim()); });
}
function fx4Enviado(m){
  if(!confirm("Confirmar: o SGU ACEITOU o lote " + (m.numero_lote || "?") + "?\n\n" +
      "Isso carimba a data de envio e é DEFINITIVO — se o SGU acusou qualquer problema, use Correção antes."))
    return;
  fx4Rpc("fx4_marcar_enviado", { p_malote_id: m.id, p_quem: autora() })
    .then(function(){ delete estado.malotesUlt[m.id]; loadMalotes(); })
    .catch(function(e){ alert("Não deu pra marcar enviado:\n" + e.message); });
}
function fx4Tratar(r){
  var nota = window.prompt("Marcar como tratada. Nota (opcional):", "");
  if(nota === null) return;
  fx4Rpc("fx4_tratar_rejeicao", { p_id: r.id, p_quem: autora(), p_nota: nota.trim() || null })
    .then(function(){ loadMalotes(); })
    .catch(function(e){ alert(e.message); });
}

/* ── desenho ── */
function fx4RotEstado(e){
  return { fechado:                 ["Fechado — esperando o XML do lote", "meio"],
           conferido_ok:            ["Conferido ✔ — pronto pro SGU",      "ok"],
           conferido_com_problemas: ["Barrado na conferência",            "ruim"],
           em_correcao:             ["Aguardando XML corrigido",          "ruim"] }[e] || [e, "meio"];
}
function fx4BlocoCard(convId, rot, bloco, guias){
  var card = document.createElement("article");
  card.className = "fx4-card";
  var nums = guias.map(function(g){ return g.numero_guia_prestador; });
  var soma = guias.reduce(function(a,g){ return a + (Number(g.valor_esperado_total)||0); }, 0);
  var d1 = guias[0].data_mais_antiga, d2 = guias[guias.length-1].data_mais_antiga;
  card.innerHTML =
    '<div class="fx4-tit">📦 ' + escapa(rot) + ' · Bloco ' + bloco +
      '<span class="fx4-badge">' + guias.length + ' guia' + (guias.length>1?'s':'') + '</span></div>' +
    '<div class="fx4-meta">datas mais antigas ' + fx4Data(d1) + ' → ' + fx4Data(d2) +
      ' · valor esperado ' + fx4Dinheiro(soma) +
      ' · <b>ordem de faturamento: a data mais velha primeiro</b></div>';
  var ta = document.createElement("textarea");
  ta.className = "fx4-nums"; ta.readOnly = true;
  ta.rows = Math.min(10, Math.max(4, nums.length));
  ta.value = nums.join("\n");
  card.appendChild(ta);
  var acoes = document.createElement("div"); acoes.className = "fx4-acoes";
  var bCop = document.createElement("button"); bCop.type="button"; bCop.className="gv-btn";
  bCop.textContent = "📋 Copiar os números";
  bCop.onclick = function(){
    (navigator.clipboard ? navigator.clipboard.writeText(nums.join("\n")) : Promise.reject())
      .then(function(){ bCop.textContent = "✔ copiados — colar no Feegow"; },
            function(){ ta.focus(); ta.select(); document.execCommand("copy");
                        bCop.textContent = "✔ copiados — colar no Feegow"; });
    setTimeout(function(){ bCop.textContent = "📋 Copiar os números"; }, 2400);
  };
  acoes.appendChild(bCop);
  var bX = document.createElement("button"); bX.type="button"; bX.className="gv-btn";
  bX.textContent = "✔ Malote fechado no Feegow";
  bX.title = "Assinar o X: congela esta lista e o malote passa a esperar o XML";
  bX.onclick = function(){ fx4Fechar(convId, nums); };
  acoes.appendChild(bX);
  card.appendChild(acoes);
  return card;
}
function fx4ProbHTML(problemas){
  if(!problemas || !problemas.length) return "";
  var porGuia = {};
  problemas.forEach(function(p){
    var k = p.guia_prestador || "(geral)";
    (porGuia[k] = porGuia[k] || []).push(p);
  });
  var h = "";
  Object.keys(porGuia).sort().forEach(function(k){
    h += "<div style='margin:4px 0'><b>guia " + escapa(k) + "</b>";
    porGuia[k].forEach(function(p){
      h += "<br>&nbsp;&nbsp;• <b>" + escapa(p.problema) + "</b>" +
           (p.codigo ? " · " + escapa(p.codigo) : "") +
           (p.detalhe ? " — " + escapa(p.detalhe) : "");
    });
    h += "</div>";
  });
  return h;
}
function fx4MaloteCard(m){
  var re = fx4RotEstado(m.estado);
  var card = document.createElement("article");
  card.className = "fx4-card " + re[1];
  card.innerHTML =
    '<div class="fx4-tit">Malote #' + m.id +
      (m.numero_lote ? ' · lote <b>' + escapa(m.numero_lote) + '</b>' : '') +
      '<span class="fx4-badge">' + escapa((m.convenio_id === 8) ? "Intercâmbio" : "Local") + '</span>' +
      '<span class="fx4-badge">' + escapa(re[0]) + '</span></div>' +
    '<div class="fx4-meta">' + m.qt_guias + ' guia(s) congelada(s)' +
      (m.arquivo ? ' · último XML: <b>' + escapa(m.arquivo) + '</b>' : '') +
      (m.criado_por ? ' · fechado por ' + escapa(m.criado_por) : '') +
      ' · ' + fx4Data(m.criado_em) + '</div>';

  var ult = estado.malotesUlt[m.id];
  var conf = fx4UltConf(m.id);
  if(ult && ult.rodando){
    var lo = document.createElement("div"); lo.className = "fx4-meta";
    lo.innerHTML = "<b>⏳ conferindo o XML contra a raiz…</b>";
    card.appendChild(lo);
  } else if(ult && ult.erro){
    var er = document.createElement("div"); er.className = "fx4-prob";
    er.innerHTML = "<b>erro na conferência:</b> " + escapa(ult.erro);
    card.appendChild(er);
  } else {
    var fonte = (ult && ult.veredito) ? ult :
                (conf ? { veredito: conf.veredito, problemas: conf.problemas || [],
                          qt_guias: conf.qt_guias, qt_linhas: conf.qt_linhas,
                          valor_total: conf.valor_total, removidas: (conf.resumo||{}).removidas,
                          f0_espelhadas: (conf.resumo||{}).f0_espelhadas } : null);
    if(fonte){
      if(fonte.veredito === "ok"){
        var okb = document.createElement("div"); okb.className = "fx4-okbox";
        okb.innerHTML = "<b>✔ Conferência limpa.</b> " + fonte.qt_guias + " guias · " +
          fonte.qt_linhas + " sessões · " + fx4Dinheiro(fonte.valor_total) +
          ((fonte.removidas && fonte.removidas.length)
            ? "<br>✂️ rejeição registrada: guia(s) " + escapa(fonte.removidas.join(", ")) + " fora do lote."
            : "") +
          (((fonte.f0_espelhadas|0) > 0)
            ? "<br>🪞 " + fonte.f0_espelhadas + " linha(s) do faturamento espelhada(s) no que o malote realmente faturou (código/guia/senha/valor)."
            : "") +
          "<br>As sessões já estão <b>em lote</b> no faturamento. Agora é subir no SGU.";
        card.appendChild(okb);
      } else {
        var pr = document.createElement("div"); pr.className = "fx4-prob";
        pr.innerHTML = "<b>🚫 Barrado.</b> Nada foi gravado — corrigir no Feegow/SGU e subir o XML de novo.<br>" +
          fx4ProbHTML(fonte.problemas || []);
        card.appendChild(pr);
      }
    }
  }

  var acoes = document.createElement("div"); acoes.className = "fx4-acoes";
  if(m.estado !== "conferido_ok"){
    var bUp = document.createElement("button"); bUp.type="button"; bUp.className="gv-btn";
    bUp.textContent = "🧾 Conferir o XML do lote";
    bUp.title = "Baixar o XML no Feegow e subir aqui — a conferência roda na hora, contra a raiz";
    bUp.onclick = function(){ fx4PedeXML(function(f){ fx4Conferir(m, f, null); }); };
    acoes.appendChild(bUp);
  }
  if(m.estado === "conferido_ok"){
    var bEnv = document.createElement("button"); bEnv.type="button"; bEnv.className="gv-btn";
    bEnv.textContent = "📤 Enviado no SGU (aceito)";
    bEnv.onclick = function(){ fx4Enviado(m); };
    acoes.appendChild(bEnv);
  }
  if(m.estado === "conferido_ok" || m.estado === "em_correcao" || m.estado === "conferido_com_problemas"){
    var bCor = document.createElement("button"); bCor.type="button"; bCor.className="gv-btn";
    bCor.textContent = "✂️ Correção (SGU rejeitou guia)";
    bCor.title = "Sobe o XML corrigido + o motivo do SGU; guia que sumiu vira rejeição registrada";
    bCor.onclick = function(){ fx4Correcao(m); };
    acoes.appendChild(bCor);
  }
  card.appendChild(acoes);
  return card;
}
function desenharMalotes(){
  var host = document.getElementById("gv-conteudo"); if(!host) return;
  host.innerHTML = "";
  var topo = document.createElement("div"); topo.className = "gv-explica";
  topo.innerHTML =
    "<b>📦 Malotes Unimed</b> — o caminho é sempre o mesmo: " +
    "<b>1)</b> copiar o bloco e fechar o malote no Feegow · " +
    "<b>2)</b> assinar o <b>✔ Malote fechado</b> (congela a lista) · " +
    "<b>3)</b> baixar o XML e <b>conferir aqui</b> — só malote 100% limpo segue · " +
    "<b>4)</b> subir no SGU e marcar <b>📤 Enviado</b> SÓ quando o SGU aceitar. " +
    "SGU rejeitou guia? <b>✂️ Correção</b> com o motivo — a guia volta pra fila sozinha quando sanar.";
  host.appendChild(topo);

  if(estado.malotesErro){
    var er = document.createElement("p"); er.className = "gv-vazio";
    er.textContent = "⚠️ " + estado.malotesErro;
    host.appendChild(er); return;
  }
  if(estado.malotes === null){
    var lo = document.createElement("p"); lo.className = "gv-vazio";
    lo.textContent = "Carregando…"; host.appendChild(lo); return;
  }

  /* 1 · malotes em andamento */
  var vivos = estado.malotes.vivos || [];
  if(vivos.length){
    var s1 = document.createElement("div"); s1.className = "fx4-sec";
    s1.textContent = "Malotes em andamento";
    host.appendChild(s1);
    vivos.forEach(function(m){ host.appendChild(fx4MaloteCard(m)); });
  }

  /* 2 · blocos prontos pra fechar */
  var fila = estado.malotes.fila || [];
  var s2 = document.createElement("div"); s2.className = "fx4-sec";
  s2.textContent = "Blocos prontos (guias 100% conferidas, da data mais velha pra mais nova)";
  host.appendChild(s2);
  if(!fila.length){
    var vz = document.createElement("p"); vz.className = "gv-vazio";
    vz.textContent = "Nenhuma guia pronta agora — a fila enche conforme a conferência (F3) aprova.";
    host.appendChild(vz);
  } else {
    var grupos = {};
    fila.forEach(function(g){
      var k = g.convenio_id + "·" + g.bloco;
      (grupos[k] = grupos[k] || []).push(g);
    });
    Object.keys(grupos).sort().forEach(function(k){
      var gs = grupos[k];
      host.appendChild(fx4BlocoCard(gs[0].convenio_id, gs[0].convenio, gs[0].bloco, gs));
    });
  }

  /* 3 · rejeições do SGU */
  var rej = estado.malotes.rej || [];
  var s3 = document.createElement("div"); s3.className = "fx4-sec";
  s3.textContent = "Rejeições do SGU (análise 1 a 1 do dono)";
  host.appendChild(s3);
  if(!rej.length){
    var vz2 = document.createElement("p"); vz2.className = "gv-vazio";
    vz2.textContent = "Nenhuma rejeição registrada. Que continue assim.";
    host.appendChild(vz2);
  } else {
    rej.forEach(function(r){
      var c = document.createElement("article");
      c.className = "fx4-card " + (r.tratada ? "ok" : "ruim");
      c.innerHTML =
        '<div class="fx4-tit">guia ' + escapa(r.numero_guia_prestador) +
          (r.numero_lote ? ' · lote ' + escapa(r.numero_lote) : '') +
          '<span class="fx4-badge">' + (r.tratada ? "tratada ✔" : "pendente") + '</span></div>' +
        '<div class="fx4-meta">' +
          (r.paciente_nome ? escapa(r.paciente_nome) + ' · ' : '') +
          fx4Data(r.criada_em) + (r.autora ? ' · por ' + escapa(r.autora) : '') + '</div>' +
        '<div class="fx4-meta"><b>SGU:</b> ' + escapa(r.motivo_sgu || "—") +
          (r.nota_dono ? '<br><b>nota do dono:</b> ' + escapa(r.nota_dono) : '') + '</div>';
      if(!r.tratada && ehDono()){
        var a = document.createElement("div"); a.className = "fx4-acoes";
        var b = document.createElement("button"); b.type="button"; b.className="gv-btn";
        b.textContent = "✔ Marcar tratada";
        b.onclick = function(){ fx4Tratar(r); };
        a.appendChild(b); c.appendChild(a);
      }
      host.appendChild(c);
    });
  }
}

function trocaTela(t){
  if(t === "dono" && !ehDono()) t = "agenda";
  estado.tela = t;
  var abas = document.querySelectorAll("#s-guias .gv-aba");
  for(var i=0;i<abas.length;i++){
    abas[i].classList.toggle("on", abas[i].getAttribute("data-tela") === t);
  }
  var rg = document.getElementById("gv-regua");
  if(rg) rg.style.display = (t === "agenda") ? "" : "none";
  var fx = document.getElementById("gv-faixa");
  if(fx && t !== "agenda") fx.hidden = true;
  if(t === "fila") ligarPollFila(); else desligarPollFila();
  if(t === "agenda"){ desenharAgenda(); }
  else if(t === "fila"){ desenharFila(); carregarFila(); }
  else if(t === "cad"){ desenharCad(); loadCad(); }
  else if(t === "excl"){ desenharExcl(); loadExcl(); }
  else if(t === "corte"){ desenharCorte(); loadCorte(); }
  else if(t === "falhas"){ desenharFalhas(); loadFalhas(); }
  else if(t === "malotes"){ desenharMalotes(); loadMalotes(); }
  else if(t === "prof"){ PF.secretaria(); }
  else if(t === "dono"){ desenharAdmin(); }
  if(window.moldura) moldura.aoTrocarTela(t);
}
function refreshDonoAba(){
  var el = document.getElementById("gv-aba-dono");
  if(el) el.style.display = ehDono() ? "" : "none";
}
function recarregarTudo(){ carregar(); carregarFila(); loadCad(); loadExcl(); loadCorte(); loadFalhas(); loadMalotes(); }
function boot(t){
  if(!GV._init){
    GV._init = true;
    var abas = document.querySelectorAll("#s-guias .gv-aba");
    for(var i=0;i<abas.length;i++){
      (function(b){ b.addEventListener("click", function(){ trocaTela(b.getAttribute("data-tela")); }); })(abas[i]);
    }
    var bu = document.getElementById("gv-busca");
    if(bu) bu.addEventListener("input", function(e){
      estado.busca = e.target.value.trim().toLowerCase();
      estado.agLimite = 150; estado._agTopo = true;
      if(estado.tela === "agenda") desenharAgenda();
    });
    var rc = document.getElementById("gv-recarregar");
    if(rc) rc.addEventListener("click", recarregarTudo);
  }
  refreshDonoAba();
  trocaTela(t || "agenda");
  if(Date.now() - estado._carregouEm > 45*1000) recarregarTudo();
}
function startTimers(){
  if(GV._t10) return;
  GV._t10 = setInterval(function(){
    if(typeof CU === "undefined" || !CU) return;   /* deslogado: não faz nada */
    try{ nav("guias"); }catch(e){ boot(); }        /* volta pra tela principal e recarrega */
  }, 10*60*1000);
}
function stopTimers(){
  if(GV._t10){ clearInterval(GV._t10); GV._t10 = null; }
  desligarPollFila();
}

return { boot: boot, startTimers: startTimers, stopTimers: stopTimers, recarregarTudo: recarregarTudo,
         tela: function(t){ trocaTela(t); }, telaAtual: function(){ return estado.tela; },
         filtroTipo: function(){ return estado.filtroTipo; }, ehDono: ehDono };
})();
