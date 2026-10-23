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
  guia_vencida:          {rot:"Depois da última",     cls:"sinfo", g:"ginfo", acao:"A guia não alcança esta consulta. O aviso fica na última consulta coberta; se a guia não for renovada até lá, esta vai para o Corte."},
  saldo_esgotado:        {rot:"Saldo esgotado",       cls:"s0", g:"g0", acao:"🚫 Sem sessão sobrando = sem guia. Solicitar renovação AGORA — ou desmarcar."},
  sem_carteirinha:       {rot:"Sem carteirinha",      cls:"s0", g:"g0", acao:"Completar o cadastro do paciente HOJE — sem carteirinha nem dá pra casar guia."},
  guia_de_outra_terapia: {rot:"Guia de OUTRA terapia",cls:"s0", g:"g0", acao:"🚫 A guia viva do paciente é de outra terapia. Conferir se o erro é o procedimento marcado ou a guia pedida — corrigir AGORA ou desmarcar."},
  procedimento_errado:   {rot:"Procedimento errado",  cls:"s0", g:"g0", acao:"🚫 O procedimento do agendamento não é nenhum dos 4 códigos Unimed. Corrigir no Feegow — desse jeito não fatura e o Cortex fica cego."},
  aba_intercambio:       {rot:"ABA no Intercâmbio",   cls:"s0", g:"g0", acao:"🚫 ABA não é coberto no convênio Intercâmbio. Corrigir o convênio ou o procedimento ANTES da sessão."},
  psico_com_guia_aba:    {rot:"Psico com guia de ABA", cls:"s0", g:"g0", acao:"🚫 O paciente tem guia de ABA viva — não é pra ter sessão de psicologia acontecendo. Corrigir o procedimento do agendamento no Feegow AGORA."},
  ultima_sessao:         {rot:"Última sessão (saldo)", cls:"s1", g:"g1", acao:"É a última sessão do saldo — solicitar guia nova já, pra agenda seguinte não furar."},
  duplicidade_dia:       {rot:"Duas no mesmo dia",    cls:"s1", g:"g1", acao:"Só uma consulta da mesma terapia fatura por dia. Remarcar ou excluir uma delas."},
  sem_saldo_na_fila:     {rot:"Fila passa do saldo",  cls:"s1", g:"g1", acao:"Solicitar guia nova ANTES desta data — a fila do paciente consome o saldo antes de chegar aqui."},
  guia_ainda_nao_vale:   {rot:"Guia só vale depois",  cls:"s1", g:"g1", acao:"Conferir a data de autorização com a Unimed."},
  sessao_em_feriado:     {rot:"Cai no feriado",       cls:"sinfo", g:"ginfo", acao:"Remarcar — o sistema não fatura sessão em feriado."},
  ultima_viavel_validade:{rot:"Última viável (validade)", cls:"s1", g:"g1", acao:"A guia ainda tem saldo, mas a VALIDADE morre antes da próxima consulta — esta é a última que ela cobre. Renovar a validade: entrar em contato com o paciente."},
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
      if(renovAberta() && mudou) desenharFila();
    })
    .catch(function(e){
      estado.filaErro = e.message;
      if(estado.fila === null) estado.fila = [];
      badgesTopo();
      if(renovAberta()) desenharFila();
    });
}
var FILA_RECUSA = {   /* v3.4: o banco recusa na entrada (RENOV v2.0) */
  fora: "Essa guia não está no nosso banco. Aqui é só guia que já existe e teve a data renovada. Guia nova o coletor traz sozinho.",
  ja:   function(h){ return "Essa guia já está com o robô" + (h ? ": ele confere de novo às " + h : "") + ". Não precisa mandar de novo."; }
};
function enviarFila(){
  var campo = document.getElementById("filaNum");
  if(!campo) return;
  var num = (campo.value || "").replace(/\D/g, "");
  if(num.length < 6){ avisoFila("Número esquisito — a guia tem só números (ex.: 16337779).", true); return; }
  var viva = (estado.fila || []).find(function(l){
    var k = filaChave(l);
    return l.numero_guia === num && (k === "fila" || k === "espera");
  });
  if(viva){ avisoFila(FILA_RECUSA.ja(viva.proxima_em ? horaDe(viva.proxima_em) : ""), true); return; }
  fetch(GCFG.url + "/rest/v1/pre_guias_reconferir", {
    method: "POST",
    headers: cab({ "Content-Type": "application/json", "Prefer": "return=minimal" }),
    body: JSON.stringify([{ numero_guia: num, autora: autora() || null }])
  }).then(function(r){
    if(r.ok){
      campo.value = ""; estado.filaDraft = "";
      avisoFila("Mandei pro robô. O resultado aparece na lista em instantes.", false);
      carregarFila();
      return;
    }
    return r.json().catch(function(){ return {}; }).then(function(e){
      var m = (e && e.message) || "";
      if(m === "RENOV_FORA_DO_BANCO"){ avisoFila(FILA_RECUSA.fora, true); return; }
      if(m === "RENOV_JA_NA_FILA" || r.status === 409){ avisoFila(FILA_RECUSA.ja(e && e.details), true); return; }
      throw new Error("HTTP " + r.status);
    });
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
    if(renovAberta()) desenharFila();
  }).catch(function(){ avisoFila("Não consegui dispensar — tente de novo.", true); });
}
function avisoFila(msg, ehErro){
  var el = document.getElementById("filaAviso");
  if(!el) return;
  el.textContent = msg;
  el.style.color = ehErro ? "var(--vermelho)" : "var(--verde)";   /* v3.4: o popup mora fora do #s-guias (lá não há --critico/--ok) */
  el.style.fontWeight = ehErro ? "600" : "";
  clearTimeout(GV._avisoT);
  if(!ehErro){ GV._avisoT = setTimeout(function(){ el.textContent = ""; }, 6000); }
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
    /* v2.1: guia puxada no SGU sem ficha no Feegow — não há paciente_id; a "ficha" é a própria carteirinha (oc_ref sgu:…) */
    var semFicha = g.tipo === "guia_sem_ficha";
    if(!gente.length && semFicha) gente = [{ id: String(g.oc_ref), nome: g.paciente || "(sem nome no SGU)" }];
    var lixo = chaveLixo(g.oc_ref);
    gente.forEach(function(p){
      if(!mapa[p.id]) mapa[p.id] = { paciente_id: p.id, paciente: p.nome, oc_ref: semFicha ? String(g.oc_ref) : "pac:" + p.id,
                                     problemas: [], futuras: 0, lixo: false, sem_ficha: semFicha };
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
    if(!!a.sem_ficha !== !!b.sem_ficha) return a.sem_ficha ? -1 : 1;   /* v2.1: guia viva sem ficha vem antes dentro do grupo */
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
  if(l.gravidade === 3) return false;   /* PRE v3.1: depois da última — o aviso é a Última, o resto é do Corte */
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
function ehAviso(l){ return l.situacao !== "coberto" && l.gravidade !== 0 && l.gravidade !== 3 && !tratada(l); }
function soNoTudo(l){ return l.gravidade === 3 && !tratada(l); }   /* PRE v3.1: "Depois da última" — fora de Pendências e Avisos */
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
  var prontos = (estado.fila || []).filter(filaFinal).length;   /* v3.4: quem espera nova conferência ainda não é resultado */
  var cadN  = (estado.cad  || []).filter(cadAberto).length;
  var exclN = (estado.excl || []).filter(exclAberta).length;
  function b(id, n){ var el = document.getElementById(id); if(!el) return; el.hidden = !n; el.textContent = n; }
  var corteN  = (estado.corte  || []).filter(corteAtivo).length;
  var falhasN = (estado.falhas || []).length;
  b("gv-b-agenda", pend); b("gv-b-fila", prontos); b("gv-b-cad", cadN); b("gv-b-excl", exclN);
  b("gv-b-corte", corteN); b("gv-b-falhas", falhasN);
  b("gv-sbb", pend + cadN + exclN + corteN + falhasN);
  desenharFaixa();
  if(estado.tela === "agenda") atualizaLadoAgenda();
}
/* v3.5: o "Resolver agora" da direita mostra Corte, Falhas, Cadastros e Exclusões assim que cada carga chega
   (antes só aparecia no próximo redesenho da Agenda) */
function atualizaLadoAgenda(){
  var lado = document.querySelector("#gv-conteudo .duas-col > .lado");
  if(!lado || !estado.linhas.length) return;
  lado.innerHTML = ""; lado.appendChild(agPainel());
}
function desenharFaixa(){
  var f = document.getElementById("gv-faixa");
  if(f) f.hidden = true;                       /* a faixa antiga saiu: os chips moram na barra da moldura */
  if(!window.moldura) return;
  var cadN  = (estado.cad  || []).filter(cadAberto).length;
  var exclN = (estado.excl || []).filter(exclAberta).length;
  var corteN = (estado.corte || []).filter(corteAtivo).length;   /* v3.2: o Corte também entra aqui (mesmo número do menu) */
  var falhasN = (estado.falhas || []).length;                     /* v3.5: Falhas também ganha o quadrado, ao lado do Corte */
  var chips = [];
  categorias().forEach(function(c){
    chips.push({ chave:c.chave, rot:c.rot, n:c.n, dica:c.sub,
      acao:function(){ irParaTela("agenda"); abrirCatAgenda(c.chave); } });
  });
  if(chips.length && (corteN || falhasN || cadN || exclN)) chips.push({ sep:true });
  if(corteN) chips.push({ chave:"corte", rot:"Corte", n:corteN, dica:"Abrir Corte: consultas para apagar no Feegow", acao:function(){ irParaTela("corte"); } });
  if(falhasN) chips.push({ chave:"falhas", rot:"Falhas", n:falhasN, dica:"Abrir Falhas: mensagens de WhatsApp que não saíram", acao:function(){ irParaTela("falhas"); } });
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
  guia_vencida:           { rot:"Depois da última", tom:"c", sub:"Vai para o Corte se a guia não for renovada", acao:"A guia não alcança esta consulta. O aviso fica na última consulta coberta (Última viável ou Última sessão); se a guia não for renovada até lá, esta vai para o Corte." },
  saldo_esgotado:         { rot:"Saldo esgotado", tom:"r", sub:"Solicitar a renovação agora ou desmarcar", acao:"Sem sessão sobrando é o mesmo que sem guia. Solicitar a renovação agora ou desmarcar." },
  sem_carteirinha:        { rot:"Sem carteirinha", tom:"r", sub:"Completar o cadastro do paciente hoje", acao:"Completar o cadastro do paciente hoje: sem carteirinha não dá para casar a guia." },
  guia_de_outra_terapia:  { rot:"Guia de outra terapia", tom:"r", sub:"Conferir procedimento ou guia e corrigir", acao:"A guia viva do paciente é de outra terapia. Conferir se o erro é o procedimento marcado ou a guia pedida e corrigir agora, ou desmarcar." },
  procedimento_errado:    { rot:"Procedimento errado", tom:"r", sub:"Corrigir o procedimento no Feegow", acao:"O procedimento do agendamento não é nenhum dos 4 códigos Unimed. Corrigir no Feegow: assim não fatura e o Cortex fica cego." },
  aba_intercambio:        { rot:"ABA no Intercâmbio", tom:"r", sub:"Corrigir convênio ou procedimento", acao:"ABA não é coberto no Intercâmbio. Corrigir o convênio ou o procedimento antes da sessão." },
  psico_com_guia_aba:     { rot:"Psicologia com guia de ABA", tom:"r", sub:"Corrigir o procedimento no Feegow", acao:"O paciente tem guia de ABA viva: não deveria haver sessão de psicologia. Corrigir o procedimento do agendamento no Feegow agora." },
  ultima_sessao:          { rot:"Última sessão (saldo)", tom:"o", sub:"Última do saldo: pedir guia nova já", acao:"É a última sessão do saldo. Solicitar guia nova já, para a agenda seguinte não furar." },
  duplicidade_dia:        { rot:"Duas no mesmo dia", tom:"o", sub:"Remarcar ou excluir uma delas", acao:"Só uma consulta da mesma terapia fatura por dia. Remarcar ou excluir uma delas." },
  sem_saldo_na_fila:      { rot:"Fila passa do saldo", tom:"o", sub:"Pedir guia nova antes desta data", acao:"Solicitar guia nova antes desta data: a fila do paciente consome o saldo antes de chegar aqui." },
  guia_ainda_nao_vale:    { rot:"Guia só vale depois", tom:"o", sub:"Conferir a data com a Unimed", acao:"Conferir a data de autorização com a Unimed." },
  sessao_em_feriado:      { rot:"Cai no feriado", tom:"c", sub:"Remarcar", acao:"Remarcar: o sistema não fatura sessão em feriado." },
  ultima_viavel_validade: { rot:"Última viável (validade)", tom:"o", sub:"Corte hoje: renovar a validade (falar com o paciente)", acao:"A guia ainda tem saldo, mas a validade termina antes da próxima consulta: esta é a última que ela cobre. Renovar a validade: entrar em contato com o paciente. Se não renovar até o dia desta consulta, as seguintes vão para o Corte." },
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
/* anterior/próxima dentro da lista L, pela ordem da lista completa T (funciona mesmo se o item atual saiu de L) */
function vizinhos(L, T, chave, atual){
  var ordem = {}; T.forEach(function(x, k){ ordem[chave(x)] = k; });
  var eu = ordem[atual], i = -1, ant = null, prox = null;
  L.forEach(function(x, j){
    var o = ordem[chave(x)];
    if(chave(x) === atual) i = j;
    if(o < eu) ant = x;
    if(o > eu && !prox) prox = x;
  });
  return { i: i, ant: ant, prox: prox };
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
    else if(soNoTudo(l) && !(l.tratamento && l.tratamento !== "pendente")) return;   /* PRE v3.1: só aparece em "Tudo" */
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
    case "guia_vencida":
      if(typeof l.dias_para_vencer === "number" && l.dias_para_vencer >= 0)   /* PRE v3.0: ainda vale hoje, mas acaba antes desta consulta */
        return "A guia " + g + " vale até " + fim + (l.dias_para_vencer === 0 ? " (vence hoje)" : " (daqui a " + l.dias_para_vencer + (l.dias_para_vencer === 1 ? " dia)" : " dias)")) +
          " e acaba antes desta consulta.";
      return "A última guia, " + g + ", venceu em " + fim +
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
window.addEventListener("resize", function(){ ajustaAltura(); });
function resumoAgenda(){
  if(!window.moldura) return;
  var d = diasUnicos();
  var n = estado.linhas.length;
  moldura.resumo("agenda", n ? (n + " consulta" + (n === 1 ? "" : "s") + (d.length ? " de " + d[0].data_fmt + " a " + d[d.length-1].data_fmt : "")) : "");
}
function diasUnicos(){
  var m = {};
  estado.linhas.forEach(function(l){
    if(!m[l.data]) m[l.data] = { data:l.data, dia_semana:l.dia_semana, data_fmt:l.data_fmt, pend:0, resolver:0, feriado:false, hoje:l.dias_ate === 0 };
    if(ehPendencia(l)) m[l.data].pend++;
    if(paraResolver(l)) m[l.data].resolver++;
    if(l.em_feriado) m[l.data].feriado = true;
  });
  return Object.keys(m).sort().map(function(k){ return m[k]; });
}
/* v3.3: a lista da Agenda mostra sempre tudo que tem para resolver — vermelho (hoje) + amarelo (antes da data).
   Cobertas, já tratadas (Resolvido/Desmarcado) e "Depois da última" não entram. */
function paraResolver(l){ return ehPendencia(l) || ehAviso(l); }
function passaFiltro(l){
  if(estado.filtroDia && l.data !== estado.filtroDia) return false;   /* v3.4: a busca saiu da lista (virou a janela da lupa) */
  if(estado.filtroTipo === "__aba__") return ehProblemaAba(l);
  if(estado.filtroTipo) return ehPendencia(l) && l.situacao === estado.filtroTipo;   /* veio de um quadrado do Resolver agora */
  return paraResolver(l);
}
function agLista(){
  var cont = contagens();
  var sec = novo("section", "lista alta"); sec.setAttribute("aria-label", "Consultas para resolver");
  /* v3.4: sem a barra "Para resolver · Mostrando N de N" — o filtro "Só X" fica marcado no próprio quadrado lá em cima */
  var vis = estado.linhas.filter(passaFiltro);
  var lim = estado.agLimite || 150;
  sec.appendChild(agDias(cont));
  var corpo = novo("div", "lista-corpo");
  if(!estado.linhas.length){
    corpo.appendChild(novo("div", "lista-vazio", estado._carregouEm ? "Nenhuma consulta na agenda." : "Buscando a agenda no banco…"));
  } else if(!vis.length){
    var vz = novo("div", "lista-vazio", !estado.filtroTipo && !estado.filtroDia
      ? "Nada para resolver: está tudo coberto ou já tratado."
      : "Nada para resolver com esses filtros.");
    if(estado.filtroTipo || estado.filtroDia){   /* v3.4: se o quadrado do filtro sumiu (zerou), a saída é por aqui */
      vz.appendChild(novo("br"));
      vz.appendChild(botao("btn btn-s vz-tudo", "Mostrar tudo", function(){ estado.filtroTipo = null; estado.filtroDia = null; agMudou(); }));
    }
    corpo.appendChild(vz);
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
  /* v3.3: quadrado mais baixo (dia e data na mesma linha); o número = tudo que tem para resolver no dia
     (vermelho se tem algo para hoje, laranja se só amarelos) */
  function cel(sem, data, rod, cls, on, fn){
    var b = botao("dia2" + (on ? " on" : ""), '<span class="sd"><span class="s">' + sem + '</span>' + (data ? '<span class="d">' + data + '</span>' : '') + '</span>' +
      '<span class="r ' + cls + '">' + rod + '</span>', fn);
    b.setAttribute("aria-pressed", on ? "true" : "false");
    return b;
  }
  var totRes = 0, totPend = 0;
  dias.forEach(function(d){ totRes += d.resolver; totPend += d.pend; });
  var tTodos = cel("Todos", "", String(totRes), totPend ? "p" : (totRes ? "a" : ""), estado.filtroDia === null,
    function(){ estado.filtroDia = null; agMudou(); });
  tTodos.title = N + " dias";
  grade.appendChild(tTodos);
  dias.slice(off, off + VIS).forEach(function(d){
    grade.appendChild(cel(d.hoje ? "hoje" : escapa(String(d.dia_semana).slice(0,3)), escapa(d.data_fmt),
      d.feriado && !d.resolver ? "feriado" : String(d.resolver), d.pend ? "p" : (d.resolver ? "a" : (d.feriado ? "f" : "")), estado.filtroDia === d.data,
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
  var corteN = (estado.corte || []).filter(corteAtivo).length;   /* v3.2 */
  var falhasN = (estado.falhas || []).length;                     /* v3.5 */
  if(corteN) sec.appendChild(cat("Corte", "Consultas para apagar no Feegow, na tela de Corte", corteN, TOM.r, function(){ irParaTela("corte"); }));
  if(falhasN) sec.appendChild(cat("Falhas", "Mensagens de WhatsApp que não saíram, na tela de Falhas", falhasN, TOM.r, function(){ irParaTela("falhas"); }));
  if(cadN)  sec.appendChild(cat("Cadastros", "Fichas com problema de cadastro, na tela de Cadastros", cadN, TOM.r, function(){ irParaTela("cad"); }));
  if(exclN) sec.appendChild(cat("Exclusões", "Séries apagadas inteiras no Feegow, na tela de Exclusões", exclN, TOM.r, function(){ irParaTela("excl"); }));
  if(!cats.length && !corteN && !falhasN && !cadN && !exclN) sec.appendChild(novo("div", "lista-vazio", estado._carregouEm ? "Nada para resolver agora." : "Buscando…"));
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
  var busca = (ctx && typeof ctx === "object") ? String(ctx.busca || "") : null;   /* v3.4: veio da janela da lupa */
  function lista(){ return busca !== null ? linhasDaBusca(busca) : (ctx === "lista" ? estado.linhas.filter(passaFiltro) : linhasDaCategoria(ctx)); }
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
    if(busca !== null) P.topo.appendChild(botao("pop-volta", ico(IC.esq, 16, 2.2) + "Busca", function(){ abrirBusca(busca); }));
    else if(ctx !== "lista") P.topo.appendChild(botao("pop-volta", ico(IC.esq, 16, 2.2) + escapa(rotTipo(ctx)), function(){ abrirCatAgenda(ctx); }));
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

/* ═══ 🔍 Buscar paciente — janela no meio da tela (v3.4) ═══
   A busca saiu do canto do cabeçalho: virou a lupa (ou a tecla /). Procura em TODAS as consultas da
   agenda carregada, cobertas inclusive, e não só nas que têm algo para resolver. */
function linhasDaBusca(t){
  var q = semAcento(String(t || "").trim());
  if(q.length < 2) return [];
  return estado.linhas.filter(function(l){ return semAcento(l.paciente).indexOf(q) >= 0; });
}
function abrirBusca(termo){
  if(!window.moldura) return;
  var P = moldura.pop({ largura:"600px", classe:"pop-busca", titulo:"Buscar paciente" });
  var lab = novo("label", "busca busca-grande", ico("M4.5 11a6.5 6.5 0 1 0 13 0 6.5 6.5 0 1 0-13 0M16 16l4 4", 18, 2));
  var campo = novo("input"); campo.type = "search"; campo.placeholder = "Nome do paciente"; campo.autocomplete = "off";
  campo.setAttribute("aria-label", "Nome do paciente"); campo.value = termo || "";
  lab.appendChild(campo); P.corpo.appendChild(lab);
  var info = novo("span", "busca-info"); info.setAttribute("aria-live", "polite"); P.corpo.appendChild(info);
  var res = novo("div", "pp-lista busca-res"); P.corpo.appendChild(res);
  function pinta(){
    var q = campo.value.trim(), L = linhasDaBusca(q);
    res.innerHTML = "";
    if(q.length < 2){ info.textContent = "Procura em todas as consultas da agenda, cobertas inclusive."; res.hidden = true; return; }
    res.hidden = false;
    info.textContent = L.length ? (L.length === 1 ? "1 consulta" : L.length + " consultas") : "";
    if(!L.length){ res.appendChild(novo("div", "lista-vazio", "Nenhuma consulta de “" + escapa(q) + "” na agenda.")); return; }
    L.slice(0, 80).forEach(function(l){
      var m = sitTxt(l.situacao), t = l.tratamento || "pendente";
      var cor = tratada(l) ? TOM.c : (TOM[m.tom] || TOM.c);
      res.appendChild(botao("pp-linha", '<span class="w">' + escapa(quandoCurto(l)) + '</span><span class="q"><b>' + escapa(l.paciente) + '</b><small>' + escapa(metaLinha(l)) + '</small></span>' +
        '<span class="st"><span style="color:' + cor + '">' + escapa(m.rot) + '</span>' + (t !== "pendente" ? '<small>' + escapa(TRAT_ROT[t] || t) + '</small>' : '') + '</span>' + ico(IC.dir, 14, 2),
        function(){ abrirPacAgenda(l.agendamento_id, { busca: campo.value }); }));
    });
    if(L.length > 80) res.appendChild(novo("div", "lista-vazio", "E mais " + (L.length - 80) + ". Digite mais letras do nome."));
  }
  campo.addEventListener("input", pinta);
  campo.addEventListener("keydown", function(ev){ if(ev.key === "Enter"){ var f = res.querySelector(".pp-linha"); if(f) f.click(); } });
  pinta();
  setTimeout(function(){ if(P.aberto){ campo.focus(); campo.select(); } }, 30);
}

/* ═══ 🔁 Renovação de validade Unimed — popup grande (v3.4) ═══
   Saiu do menu: abre pelo botão do topo da Agenda. Gravações iguais às de antes: enviarFila (POST) e
   dispensarFila (PATCH) em pre_guias_reconferir. RENOV v2.0 (no banco): número fora do nosso banco é
   recusado na entrada; SGU ainda com a data velha (ou erro) → a guia volta sozinha para o robô depois de
   20 min, 1 h e 4 h; esgotou sem renovar → o Gabriel é avisado pelo Telegram. */
var FILA_TXT = {
  aguardando:    { rot:"Na fila do robô", curto:"Na fila do robô", cor:"#636366", sub:"O robô ainda vai olhar", acao:"O robô abre a guia no SGU e confere as duas datas (senha e carteirinha). O resultado aparece na lista em instantes." },
  conferindo:    { rot:"Robô no SGU agora…", curto:"Na fila do robô", cor:"#636366", sub:"O robô ainda vai olhar", acao:"O robô abre a guia no SGU e confere as duas datas (senha e carteirinha). O resultado aparece na lista em instantes." },
  espera:        { rot:"Vai conferir de novo", curto:"Vai conferir de novo", cor:"#2C2D6E", sub:"O robô confere de novo sozinho", acao:"O SGU ainda mostrava a data antiga. O robô confere de novo sozinho depois de 20 minutos, de 1 hora e de 4 horas. Não precisa mandar o número de novo." },
  renovada:      { rot:"Validade atualizada", curto:"Atualizadas", cor:"#248A3D", sub:"Já atualizada no sistema: é só ler", acao:"O robô atualizou a validade no sistema. A Agenda do Cortex atualiza em poucos minutos. É só ler e tirar da tela." },
  nao_renovou:   { rot:"Não renovou no SGU", curto:"Não renovou", cor:"#D70015", sub:"O Gabriel é avisado pelo Telegram", acao:"O robô conferiu várias vezes, ao longo de umas 5 horas, e o SGU continua com a data antiga. O Gabriel é avisado pelo Telegram. Leu, tire da tela." },
  sem_mudanca:   { rot:"SGU ainda com a data velha", curto:"Data velha no SGU", cor:"#C93400", sub:"Esperar uns minutos e mandar de novo", acao:"O SGU ainda mostra a data antiga. Se a Unimed confirmou a renovação, aguarde alguns minutos e mande o número de novo." },
  fora_do_banco: { rot:"Guia fora do nosso banco", curto:"Fora do banco", cor:"#636366", sub:"Conferir se o número foi digitado certo", acao:"Essa guia não está no nosso banco. Se for guia nova da Unimed, o coletor captura sozinho. Se for renovação de guia antiga, confira se o número foi digitado certo." },
  erro:          { rot:"Erro ao conferir", curto:"Erro", cor:"#D70015", sub:"O robô não conseguiu conferir", acao:"O robô não conseguiu conferir a guia no SGU. Quando ele já tentou todas as vezes, o Gabriel é avisado pelo Telegram." }
};
var FILA_SEMPRE = ["todos", "renovada", "espera", "nao_renovou", "fila"];   /* filtros que aparecem mesmo zerados */
function filaTxt(s){ return FILA_TXT[s] || { rot:s, curto:s, cor:"#636366", sub:"", acao:"" }; }
/* chave de tela: fila · espera (vai conferir de novo) · renovada · nao_renovou · e as antigas sem_mudanca/fora_do_banco/erro */
function filaChave(l){
  if(l.situacao === "aguardando" || l.situacao === "conferindo") return "fila";
  if((l.situacao === "sem_mudanca" || l.situacao === "erro") && l.proxima_em) return "espera";
  if(l.situacao === "sem_mudanca" && l.esgotada_em) return "nao_renovou";
  return l.situacao;
}
function filaFinal(l){ var k = filaChave(l); return k !== "fila" && k !== "espera"; }
function filaTxtDe(l){ var k = filaChave(l); return k === "fila" ? filaTxt(l.situacao) : filaTxt(k); }
function filaTag(l){ return filaChave(l) === "espera" ? "Confere de novo " + quandoProx(l.proxima_em) : filaTxtDe(l).rot; }
function dataBr(iso){ if(!iso) return "—"; var p = String(iso).slice(0,10).split("-"); return p[2] + "/" + p[1] + "/" + p[0]; }
function diaRotulo(iso){
  if(!iso) return "—";
  var d = new Date(iso), h = new Date();
  var a = new Date(d.getFullYear(), d.getMonth(), d.getDate()), b = new Date(h.getFullYear(), h.getMonth(), h.getDate());
  var dif = Math.round((b - a) / 86400000);
  if(dif === 0) return "Hoje";
  if(dif === 1) return "Ontem";
  var dias = ["Domingo","Segunda","Terça","Quarta","Quinta","Sexta","Sábado"];
  return dias[d.getDay()] + ", " + String(d.getDate()).padStart(2,"0") + "/" + String(d.getMonth()+1).padStart(2,"0");
}
function horaDe(iso){ if(!iso) return ""; var d = new Date(iso); return String(d.getHours()).padStart(2,"0") + ":" + String(d.getMinutes()).padStart(2,"0"); }
/* "às 15:40" hoje · "amanhã às 01:20" · "24/10 às 09:00" */
function quandoProx(iso){
  if(!iso) return "";
  var d = new Date(iso), h = new Date();
  var a = new Date(d.getFullYear(), d.getMonth(), d.getDate()), b = new Date(h.getFullYear(), h.getMonth(), h.getDate());
  var dif = Math.round((a - b) / 86400000);
  return (dif === 0 ? "" : dif === 1 ? "amanhã " : String(d.getDate()).padStart(2,"0") + "/" + String(d.getMonth()+1).padStart(2,"0") + " ") + "às " + horaDe(iso);
}
function avisoGabriel(l){
  if(l.avisado_em) return "O Gabriel foi avisado pelo Telegram.";
  return "O aviso para o Gabriel sai pelo Telegram" + (new Date().getHours() < 8 ? " às 8h." : " em instantes.");
}
function filaOrdenada(){
  return (estado.fila || []).slice().sort(function(a, b){
    var fa = filaFinal(a) ? 1 : 0, fb = filaFinal(b) ? 1 : 0;
    if(fa !== fb) return fa - fb;
    return a.criado_em < b.criado_em ? 1 : -1;
  });
}
/* ordem da tela: filtra e agrupa por dia na ordem em que o dia aparece (as que ainda estão com o robô vêm primeiro) */
function filaEmOrdem(filtro){
  var t = filaOrdenada();
  if(filtro && filtro !== "todos") t = t.filter(function(l){ return filaChave(l) === filtro; });
  var ordemDias = [], porDia = {};
  t.forEach(function(l){ var k = diaRotulo(l.criado_em); if(!porDia[k]){ porDia[k] = []; ordemDias.push(k); } porDia[k].push(l); });
  var out = [];
  ordemDias.forEach(function(k){ out = out.concat(porDia[k]); });
  return out;
}
function filaDetalhe(l){
  var n = l.tentativas || 0, vezes = n === 1 ? "1 vez" : n + " vezes";
  var k = filaChave(l);
  var datas = "senha até " + dataBr(l.senha_depois) + " · carteirinha até " + dataBr(l.cart_depois);
  if(k === "fila"){
    if(l.situacao === "conferindo") return "O robô está com a guia aberta no SGU, conferindo as duas datas.";
    return n ? "Voltou para o robô: esta é a " + (n + 1) + "ª conferência." : "O robô ainda vai olhar esta guia.";
  }
  if(k === "espera")
    return (l.situacao === "erro" ? "O robô não conseguiu conferir no SGU." : "O SGU ainda mostra a data antiga: " + datas + ".") +
      " O robô confere de novo sozinho " + quandoProx(l.proxima_em) + ". Já conferiu " + vezes + ". Não precisa mandar o número de novo.";
  if(k === "nao_renovou") return "O robô conferiu " + vezes + " e o SGU continua com a data antiga: " + datas + ". " + avisoGabriel(l);
  if(k === "erro") return l.esgotada_em ? "O robô tentou " + vezes + " e não conseguiu conferir esta guia. " + avisoGabriel(l)
                                        : "O robô não conseguiu conferir esta guia. Mande o número de novo.";
  if(k === "fora_do_banco") return "Essa guia não está no nosso banco. Se for guia nova da Unimed, o coletor captura sozinho; se for renovação de guia antiga, confira se o número foi digitado certo.";
  if(k === "sem_mudanca") return "O SGU ainda mostra a data antiga: " + datas + ". Se a Unimed confirmou a renovação, aguarde alguns minutos e mande de novo.";
  if(k === "renovada"){
    var f = function(a, b){ return a === b ? "sem mudança (" + dataBr(b) + ")" : dataBr(a) + " → " + dataBr(b); };
    return "Renovou! Senha: " + f(l.senha_antes, l.senha_depois) + " · carteirinha: " + f(l.cart_antes, l.cart_depois) + "." +
      (n > 1 ? " Apareceu na " + n + "ª conferência." : "") + " A Agenda do Cortex atualiza em poucos minutos.";
  }
  return "";
}
var renov = null;   /* o popup aberto (api do moldura.pop) */
function renovAberta(){ return !!(renov && renov.aberto); }
function abrirRenovacoes(){
  if(!window.moldura || renovAberta()) return;
  renov = moldura.pop({ largura:"min(1320px, calc(100vw - 48px))", classe:"pop-grande", titulo:"Renovação de validade Unimed",
    aoFechar:function(){ renov = null; estado._filaAberta = null; desligarPollFila(); } });
  var c = renov.corpo; c.classList.add("renov");
  c.appendChild(novo("div", "renov-aviso", ico(IC_ALERTA, 30, 2.2) +
    '<div><strong>APENAS GUIAS QUE TIVERAM A DATA RENOVADA</strong><span>Guia nova não entra aqui: o coletor traz sozinho para o sistema.</span></div>'));
  c.appendChild(filaEnvio());
  var area = novo("div", "renov-area"); area.id = "renov-area"; c.appendChild(area);
  estado._filaTopo = true;
  desenharFila();
  carregarFila(); ligarPollFila();
  setTimeout(function(){ var f = document.getElementById("filaNum"); if(f && renovAberta()) f.focus({ preventScroll: true }); }, 30);
}
function filaEnvio(){
  /* número da guia + "Mandar pro robô": fica fora da área que redesenha, para não perder o que está sendo digitado */
  var box = novo("div", "renov-envio");
  box.innerHTML =
    '<label class="busca renov-num" for="filaNum">' + ico("M9.5 4 7.5 20M16.5 4l-2 16M4.5 9h15M3.5 15h15", 18, 2) +
    '<input id="filaNum" type="text" inputmode="numeric" autocomplete="off" placeholder="Número da guia renovada" aria-label="Número da guia renovada"></label>' +
    '<button type="button" class="btn btn-p" id="filaEnviar">Mandar pro robô</button>' +
    '<span class="fila-aviso2" id="filaAviso" role="status"></span>';
  var campo = box.querySelector("#filaNum");
  campo.value = estado.filaDraft || "";
  campo.addEventListener("input", function(){ estado.filaDraft = campo.value; });
  campo.addEventListener("keydown", function(ev){ if(ev.key === "Enter") enviarFila(); });
  box.querySelector("#filaEnviar").addEventListener("click", enviarFila);
  return box;
}
function desenharFila(){
  if(!renovAberta()) return;
  var main = document.getElementById("renov-area");
  if(!main) return;
  var antes = main.querySelector(".lista-corpo");
  var rolagem = antes && !estado._filaTopo ? antes.scrollTop : 0;
  estado._filaTopo = false;
  main.innerHTML = "";
  var todas = filaOrdenada();
  var cont = { todos: todas.length, renovada:0, espera:0, nao_renovou:0, sem_mudanca:0, fora_do_banco:0, erro:0, fila:0 };
  todas.forEach(function(l){ var k = filaChave(l); cont[k] = (cont[k] || 0) + 1; });
  var nLer = todas.filter(filaFinal).length;
  var filtro = estado.filaFiltro || "todos";
  if(FILA_SEMPRE.indexOf(filtro) < 0 && !cont[filtro]) filtro = estado.filaFiltro = "todos";   /* o tipo do filtro sumiu da lista */
  var vis = filaEmOrdem(filtro);

  var wrap = novo("div", "duas-col");
  var sec = novo("section", "lista"); sec.setAttribute("aria-label", "Guias mandadas ao robô");
  var topo = novo("div", "lista-topo");
  var seg = novo("div", "seg"); seg.setAttribute("role", "group"); seg.setAttribute("aria-label", "Mostrar");
  var defs = [["todos","Todos","#AEAEB2"],["renovada",FILA_TXT.renovada.curto,FILA_TXT.renovada.cor],["espera",FILA_TXT.espera.curto,FILA_TXT.espera.cor],
              ["nao_renovou",FILA_TXT.nao_renovou.curto,FILA_TXT.nao_renovou.cor]];
  ["sem_mudanca","fora_do_banco","erro"].forEach(function(k){ if(cont[k]) defs.push([k, FILA_TXT[k].curto, FILA_TXT[k].cor]); });
  defs.push(["fila","Na fila do robô","#D2D2D7"]);
  defs.forEach(function(d){
    var on = filtro === d[0];
    var b = botao(on ? "on" : "", '<span class="q" style="background:' + d[2] + '"></span>' + escapa(d[1]) + ' <span class="n">' + (cont[d[0]] || 0) + '</span>',
      function(){ estado.filaFiltro = d[0]; estado._filaTopo = true; desenharFila(); });
    b.setAttribute("aria-pressed", on ? "true" : "false");
    seg.appendChild(b);
  });
  topo.appendChild(seg);
  topo.appendChild(novo("span", "mostrando", vis.length === 1 ? "1 guia" : vis.length + " guias"));
  sec.appendChild(topo);
  var corpo = novo("div", "lista-corpo");
  if(estado.fila === null) corpo.appendChild(novo("div", "lista-vazio", "Buscando a fila no banco…"));
  else if(estado.filaErro) corpo.appendChild(novo("div", "lista-vazio erro", "Não consegui ler a fila de renovações. " + escapa(estado.filaErro)));
  else if(!vis.length) corpo.appendChild(novo("div", "lista-vazio", filtro === "todos"
    ? '<b class="ok">Nada na fila</b><br>A Unimed renovou a data de uma guia? Digite o número lá em cima que o robô confere no SGU.'
    : "Nenhuma guia aqui agora."));
  var porDia = {};
  vis.forEach(function(l){ var k = diaRotulo(l.criado_em); (porDia[k] = porDia[k] || []).push(l); });
  var dia = null;
  vis.forEach(function(l){
    var k = diaRotulo(l.criado_em);
    if(dia !== k){ dia = k; corpo.appendChild(novo("div", "dia-cab", '<b>' + escapa(k) + '</b><span>' + (porDia[k].length === 1 ? "1 guia" : porDia[k].length + " guias") + '</span>')); }
    var t = filaTxtDe(l);
    var b = botao("linha" + (estado._filaAberta === l.id ? " aberta" : ""),
      '<span class="h">' + escapa(horaDe(l.criado_em)) + '</span>' +
      '<span class="q"><span class="nm">Guia ' + escapa(l.numero_guia) + '</span><span class="mt">' + escapa((l.paciente || "Paciente não identificado") + " · por " + (l.autora || "—")) + '</span></span>' +
      '<span class="dir"><span class="tag" style="color:' + t.cor + '">' + escapa(filaTag(l)) + '</span></span>',
      function(){ abrirFilaItem(l.id, filtro); });
    b.setAttribute("aria-haspopup", "dialog"); b.setAttribute("data-fila", l.id);
    corpo.appendChild(b);
  });
  sec.appendChild(corpo);
  wrap.appendChild(sec);

  var lado = novo("div", "lado");
  var res = novo("section", "painel"); res.setAttribute("aria-labelledby", "res-titulo");
  res.appendChild(novo("div", "painel-cab", '<h2 id="res-titulo">Resultados do robô</h2><span>' + (nLer === 1 ? "1 para ler" : nLer + " para ler") + '</span>'));
  ["fila","espera","renovada","nao_renovou","sem_mudanca","fora_do_banco","erro"].forEach(function(k){
    if(FILA_SEMPRE.indexOf(k) < 0 && !cont[k]) return;
    if(k === "fila" && !cont[k]) return;
    var t = k === "fila" ? FILA_TXT.aguardando : filaTxt(k);
    var b = botao("cat", '<span class="q" style="background:' + t.cor + '"></span><span class="t"><b>' + escapa(k === "fila" ? "Na fila do robô" : t.rot) + '</b><small>' + escapa(t.sub) + '</small></span>' +
      '<span class="n">' + (cont[k] || 0) + '</span>' + ico(IC.dir, 16, 2), function(){ abrirFilaCat(k); });
    b.setAttribute("aria-haspopup", "dialog");
    res.appendChild(b);
  });
  lado.appendChild(res);
  lado.appendChild(novo("section", "painel nota-lado",
    '<h2>Como funciona</h2><p>A Unimed renovou a data (senha ou carteirinha) de uma guia que <b>já existe</b>? Digite o número lá em cima: o robô abre a guia no SGU, confere as duas datas e atualiza o sistema sozinho.</p>' +
    '<p>Se o SGU ainda estiver com a data antiga, o robô confere de novo sozinho depois de 20 minutos, de 1 hora e de 4 horas. Se mesmo assim não renovar, o Gabriel é avisado.</p>' +
    '<p class="cinza">O resultado aparece na lista. Leu, tire da tela.</p>'));
  wrap.appendChild(lado);
  main.appendChild(wrap);
  var c2 = main.querySelector(".lista-corpo"); if(c2) c2.scrollTop = rolagem;
}
function abrirFilaCat(k){
  if(!window.moldura) return;
  var P = moldura.pop({ largura:"620px", titulo:"Resultado do robô", sobre:true });
  var t = k === "fila" ? FILA_TXT.aguardando : filaTxt(k);
  var lista = filaOrdenada().filter(function(l){ return filaChave(l) === k; });
  P.corpo.appendChild(novo("div", "pp-cab", '<span class="pp-alerta" style="color:' + t.cor + '">' + (lista.length === 1 ? "1 guia" : lista.length + " guias") + '</span>' +
    '<h2>' + escapa(k === "fila" ? "Na fila do robô" : t.rot) + '</h2>'));
  P.corpo.appendChild(novo("div", "pp-caixa", '<span class="pp-rot">O que fazer</span><span class="pp-txt">' + escapa(t.acao) + '</span>'));
  var ul = novo("div", "pp-lista");
  lista.forEach(function(l){
    ul.appendChild(botao("pp-linha", '<span class="w">' + escapa(fmtQuando(l.criado_em)) + '</span><span class="q"><b>Guia ' + escapa(l.numero_guia) + '</b><small>' +
      escapa((l.paciente || "Paciente não identificado") + " · por " + (l.autora || "—")) + '</small></span>' + ico(IC.dir, 14, 2),
      function(){ P.fechar(true); estado.filaFiltro = k; desenharFila(); abrirFilaItem(l.id, k); }));
  });
  if(!lista.length) ul.appendChild(novo("div", "lista-vazio", "Nenhuma guia aqui agora."));
  P.corpo.appendChild(ul);
  P.rodape.hidden = false; P.rodape.classList.add("fim");
  P.rodape.appendChild(botao("btn btn-s", "Fechar", function(){ P.fechar(); }));
  P.rodape.appendChild(botao("btn btn-p", "Ver só estes na lista", function(){ P.fechar(); estado.filaFiltro = k; estado._filaTopo = true; desenharFila(); }));
}
function abrirFilaItem(id, filtro){
  if(!window.moldura) return;
  var atualId = id;
  var P = moldura.pop({ largura:"620px", titulo:"Guia mandada ao robô", sobre:true, aoFechar:function(){ estado._filaAberta = null; marca(); } });
  function lista(){ return filaEmOrdem(filtro); }
  function marca(){
    document.querySelectorAll("#renov-area .linha.aberta").forEach(function(x){ x.classList.remove("aberta"); });
    if(estado._filaAberta){ var r = document.querySelector('#renov-area .linha[data-fila="' + estado._filaAberta + '"]'); if(r) r.classList.add("aberta"); }
  }
  function pinta(){
    var L = lista();
    var i = L.findIndex(function(x){ return x.id === atualId; });
    if(i < 0){ if(!L.length){ P.fechar(); return; } i = 0; atualId = L[0].id; }
    var l = L[i], t = filaTxtDe(l), fim = filaFinal(l), n = l.tentativas || 0;
    estado._filaAberta = l.id; marca();
    P.corpo.innerHTML = "";
    P.corpo.appendChild(novo("div", "pp-cab", '<span class="pp-quando">Mandada por ' + escapa(l.autora || "—") + " · " + escapa(fmtQuando(l.criado_em).replace(" ", " às ")) + '</span>' +
      '<h2>Guia ' + escapa(l.numero_guia) + '</h2><span class="pp-l1"' + (l.paciente ? '' : ' style="color:var(--cinza)"') + '>' + escapa(l.paciente || "Paciente não identificado") + '</span>'));
    var cx = novo("div", "pp-caixa", '<span class="pp-tag" style="color:' + t.cor + '">' + escapa(filaTag(l)) + '</span><span class="pp-txt">' + escapa(filaDetalhe(l)) + '</span>');
    /* o texto do robô diz "mande de novo": só vale para as linhas de antes das novas tentativas (RENOV v2.0) */
    if(l.detalhe && l.retentar !== true) cx.appendChild(novo("span", "pp-txt cinza", escapa(l.detalhe)));
    P.corpo.appendChild(cx);
    if(l.situacao === "renovada" || l.situacao === "sem_mudanca"){
      var g = novo("div", "pp-datas", '<span></span><span class="c">Antes</span><span class="c">No SGU agora</span>');
      [["Senha", l.senha_antes, l.senha_depois], ["Carteirinha", l.cart_antes, l.cart_depois]].forEach(function(d){
        var mudou = d[1] !== d[2];
        g.innerHTML += '<b>' + d[0] + '</b><span class="c">' + dataBr(d[1]) + '</span><span' + (mudou ? ' class="mudou"' : ' class="c"') + '>' + (mudou ? dataBr(d[2]) : "sem mudança") + '</span>';
      });
      P.corpo.appendChild(g);
    }
    P.corpo.appendChild(novo("span", "pp-l2", l.conferida_em
      ? "Conferida no SGU em " + escapa(fmtQuando(l.conferida_em).replace(" ", " às ")) + (n > 1 ? " · " + n + " conferências" : "")
      : "Ainda não conferida"));
    P.rodape.hidden = false; P.rodape.innerHTML = "";
    var ant = L[i-1], prox = L[i+1];
    var bA = botao("btn btn-s", ico(IC.esq, 16, 2.2) + "Anterior", function(){ if(ant){ atualId = ant.id; pinta(); } }); bA.disabled = !ant;
    var bT = botao("btn btn-s", "Li, tirar da tela", function(){
      if(!filaFinal(l)) return;
      bT.disabled = true; bT.textContent = "Tirando…";
      var seguinte = prox || ant;
      dispensarFila(l.id);
      setTimeout(function(){ if(!P.aberto) return; if(seguinte){ atualId = seguinte.id; pinta(); } else P.fechar(); }, 450);
    });
    bT.disabled = !fim;
    bT.title = fim ? "Li — pode tirar da tela" : (filaChave(l) === "espera" ? "O robô ainda vai conferir de novo " + quandoProx(l.proxima_em) : "O robô ainda vai olhar");
    var bP = botao("btn btn-p", "Próxima" + ico(IC.dir, 16, 2.2), function(){ if(prox){ atualId = prox.id; pinta(); } }); bP.disabled = !prox;
    P.rodape.appendChild(bA);
    P.rodape.appendChild(novo("span", "pop-pos", (i + 1) + " de " + L.length));
    var dir = novo("span", "pop-dir"); dir.appendChild(bT); dir.appendChild(bP);
    P.rodape.appendChild(dir);
  }
  pinta();
}

/* ═══ 🧾 Cadastros — design novo: uma linha por paciente + "Problemas" ═══
   Gravação igual à de antes: salvarOcNota("cadastro", ficha, {tratamento, nota}) → oc_notas. */
var CAD_TXT = {
  convenio_invertido:   { curto:"Convênio × carteirinha", titulo:"Convênio × carteirinha invertidos", sub:"Corrigir o convênio no Feegow",
    acao:"A carteirinha está no convênio errado: o número diz Unimed Local (começa com 0178) e o cadastro diz Intercâmbio, ou o contrário. Corrigir o convênio no cadastro do Feegow." },
  paciente_duplicado:   { curto:"Paciente duplicado", titulo:"Paciente duplicado", sub:"Conferir e juntar as fichas",
    acao:"O mesmo CPF aparece em mais de uma ficha. Conferir e juntar os cadastros: se os nomes forem diferentes, o CPF é que está errado em uma delas. CPF inválido (de zeros) nunca se junta." },
  carteirinha_repetida: { curto:"Carteirinha repetida", titulo:"Carteirinha repetida", sub:"Juntar, ou corrigir o número",
    acao:"A mesma carteirinha está em mais de uma ficha e a guia vai cair no paciente errado. Juntar os cadastros, ou corrigir o número se forem pessoas diferentes." },
  /* v2.1 */
  /* v2.3 */
  convenio_agendamento: { curto:"Convênio do agendamento", titulo:"Agendamento no convênio errado", sub:"Trocar o convênio do agendamento no Feegow",
    acao:"O paciente tem guia com saldo de um convênio, mas o agendamento está marcado no outro. O lançamento sai no convênio do agendamento: guia Intercâmbio em agendamento Local (ou o contrário) a Unimed glosa. Abrir cada agendamento listado no Feegow e trocar o convênio para o da guia. Carteirinha que começa com 0178 é Unimed Local; qualquer outra, Intercâmbio." },
  /* v2.5 · saiu da Agenda (PRE v3.0) */
  procedimento_agendamento: { curto:"Procedimento do agendamento", titulo:"Agendamento com procedimento errado", sub:"Trocar o procedimento do agendamento no Feegow",
    acao:"O agendamento é da Unimed, mas o procedimento marcado não é nenhum dos 4 códigos que a Unimed paga: do jeito que está não fatura, e a Agenda não consegue conferir a guia dessa sessão. Abrir cada agendamento listado no Feegow e trocar o procedimento: psicologia 50000470 (sessão) ou 50001221 (1ª consulta), ABA 2250005103, nutrição 50000560." },
  guia_sem_ficha:       { curto:"Guia sem ficha", titulo:"Guia puxada no SGU sem ficha no Feegow", sub:"Criar ou completar a ficha com a carteirinha",
    acao:"A Unimed autorizou a guia, mas a carteirinha dela não está em nenhuma ficha do Feegow — o sistema não sabe de quem é a guia e não fatura as sessões. Procurar o paciente por CPF ou telefone (pode estar com outro nome); se não existir, criar a ficha com a carteirinha e o convênio indicados. Carteirinha que começa com 0178 é Unimed Local; qualquer outra, Intercâmbio." }
};
var CAD_LIXO = { titulo:"Dado inválido: nunca juntar", sub:"CPF de zeros ou carteirinha 0 e 01 agrupam gente diferente",
  acao:"CPF de zeros ou carteirinha “0” e “01” agrupam gente que não tem nada a ver uma com a outra. Aqui o conserto é buscar o número certo e preencher. Nunca junte essas fichas." };
var TRAT_CAD_ROT = { pendente:"Pendente", corrigido:"Corrigido", estava_certo:"Estava certo", sem_solucao:"Sem solução" };
var IC_ALERTA = "M12 3.5 21.5 20h-19zM12 10v4.5M12 17.2h.01";
function cadTxt(t){ return CAD_TXT[t] || { curto:t, titulo:t, sub:"", acao:"" }; }
var CAD_TIPOS_LISTA = ["convenio_invertido","convenio_agendamento","procedimento_agendamento","paciente_duplicado","carteirinha_repetida","guia_sem_ficha"];   /* v2.1: ordem dos filtros e do painel "Problemas" */
function cadFichaTxt(c){ return c.sem_ficha ? "Sem ficha no Feegow" : "Ficha #" + escapa(c.paciente_id); }
function cadTipos(c){ var v = {}, out = []; c.problemas.forEach(function(p){ if(!v[p.tipo]){ v[p.tipo] = 1; out.push(p.tipo); } }); return out; }
function futTxt(n){ return !n ? "sem consulta marcada" : (n === 1 ? "1 consulta marcada" : n + " consultas marcadas"); }
function campoBusca(dest, id, ph, valor, aoDigitar){
  /* busca no cabeçalho, criada uma vez por visita */
  var ac = window.moldura && moldura.acoesDe(dest);
  if(!ac || ac.querySelector("#" + id)) return;
  var l = novo("label", "busca", ico("M4.5 11a6.5 6.5 0 1 0 13 0 6.5 6.5 0 1 0-13 0M16 16l4 4", 16, 2));
  var i = novo("input"); i.id = id; i.type = "search"; i.placeholder = ph; i.setAttribute("aria-label", ph); i.autocomplete = "off"; i.value = valor || "";
  i.addEventListener("input", function(){ aoDigitar(i.value); });
  l.appendChild(i); ac.appendChild(l);
}
function textoProblema2(p){
  var outros = p.outros || [];
  var lista = outros.slice(0, 6).map(function(x){ return escapa(x.nome) + " #" + escapa(x.id); }).join(" · ");
  if(outros.length > 6) lista += " e mais " + (outros.length - 6);
  if(!lista) lista = "—";
  if(p.tipo === "convenio_invertido"){
    var d = escapa(p.detalhe || "");
    return d.replace("Corrigir o convênio no cadastro do Feegow.", "<b>Corrigir o convênio no cadastro do Feegow.</b>");
  }
  if(p.tipo === "carteirinha_repetida"){
    if(p.lixo) return '<b>Carteirinha inválida</b> “' + escapa(p.carteirinha || "—") + '”. <b>Buscar o número real na Unimed e preencher.</b> Não juntar com outras fichas que tenham esse mesmo número: são pessoas diferentes.';   /* v2.4: sem contagem — o lixo já conhecido fica escondido */
    return 'Mesma carteirinha <b>' + escapa(p.carteirinha || "—") + '</b> em ' + (outros.length === 1 ? 'outra ficha' : 'outras ' + outros.length + ' fichas') + ': ' + lista +
           '. <b>Juntar os cadastros</b>, ou corrigir o número se forem pessoas diferentes.';
  }
  if(p.tipo === "paciente_duplicado"){
    if(p.lixo) return '<b>CPF inválido</b> no cadastro. <b>Corrigir o CPF do paciente.</b> Não juntar com outras fichas que tenham esse mesmo número: são pessoas diferentes.';   /* v2.4: sem contagem */
    if(String(p.oc_ref || "").indexOf("nn:") === 0) return 'Mesmo nome e nascimento de: ' + lista + '. <b>Conferir e juntar</b>: o agendamento e a guia podem estar caindo em fichas diferentes.';
    return 'Mesmo CPF de: ' + lista + '. <b>Conferir e juntar</b>: se os nomes forem diferentes, o CPF é que está errado em uma delas.';
  }
  if(p.tipo === "convenio_agendamento"){
    var dc = escapa(p.detalhe || "");
    return dc.replace(/(Trocar o convênio dess[ea]s? agendamentos? no Feegow para [^—]+)/, "<b>$1</b>");
  }
  if(p.tipo === "guia_sem_ficha"){
    var ds = escapa(p.detalhe || "");
    return ds.replace("Procurar o paciente por CPF ou telefone; se não existir, criar a ficha com essa carteirinha e esse convênio.",
                      "<b>Procurar o paciente por CPF ou telefone; se não existir, criar a ficha com essa carteirinha e esse convênio.</b>");
  }
  if(p.tipo === "procedimento_agendamento"){   /* v2.5 */
    var dp = escapa(p.detalhe || "");
    return dp.replace(/(Trocar o procedimento no Feegow)/, "<b>$1</b>");
  }
  return escapa(p.detalhe || "");
}
function cadVisiveis(){
  var q = semAcento(estado.cadBusca || "").trim();
  var f = estado.cadFiltro || "todos";
  return (estado.cad || []).filter(function(c){
    if(q && semAcento(c.paciente + " " + c.paciente_id).indexOf(q) < 0) return false;
    if(f !== "todos" && cadTipos(c).indexOf(f) < 0) return false;
    if(estado.cadLixo && !c.lixo) return false;
    return true;
  });
}
function desenharCad(){
  var main = document.getElementById("gv-conteudo");
  campoBusca("cadastros", "cadBusca", "Buscar paciente ou ficha", estado.cadBusca, function(v){ estado.cadBusca = v; estado.cadLimite = 150; estado._cadTopo = true; desenharCad(); });
  var antes = main.querySelector(".lista-corpo");
  var rolagem = antes && !estado._cadTopo ? antes.scrollTop : 0;
  estado._cadTopo = false;
  main.innerHTML = "";
  var todas = estado.cad || [];
  var abertos = todas.filter(cadAberto).length;
  var comFut = todas.filter(function(c){ return c.futuras > 0; }).length;
  if(window.moldura) moldura.resumo("cadastros", estado.cad === null ? "" :
    (abertos === 1 ? "1 ficha com problema sem resposta" : abertos + " fichas com problema sem resposta") + " · " + comFut + " com consulta marcada · o robô recompara a cada 15 minutos");
  var q = semAcento(estado.cadBusca || "").trim();
  var base = todas.filter(function(c){ return !q || semAcento(c.paciente + " " + c.paciente_id).indexOf(q) >= 0; });
  var cont = { todos: base.length, convenio_invertido:0, convenio_agendamento:0, paciente_duplicado:0, carteirinha_repetida:0, guia_sem_ficha:0 };
  base.forEach(function(c){ cadTipos(c).forEach(function(t){ cont[t] = (cont[t] || 0) + 1; }); });
  var vis = cadVisiveis();
  var filtro = estado.cadFiltro || "todos";

  var wrap = novo("div", "duas-col");
  var sec = novo("section", "lista alta"); sec.setAttribute("aria-label", "Fichas com problema");
  var topo = novo("div", "lista-topo"), esq = novo("div", "lista-topo-esq");
  var seg = novo("div", "seg"); seg.setAttribute("role", "group"); seg.setAttribute("aria-label", "Mostrar");
  [["todos","Todos"]].concat(CAD_TIPOS_LISTA.map(function(k){ return [k, CAD_TXT[k].curto]; })).forEach(function(d){
    var on = filtro === d[0];
    var b = botao(on ? "on" : "", escapa(d[1]) + ' <span class="n">' + (cont[d[0]] || 0) + '</span>', function(){ estado.cadFiltro = d[0]; estado.cadLimite = 150; estado._cadTopo = true; desenharCad(); });
    b.setAttribute("aria-pressed", on ? "true" : "false");
    seg.appendChild(b);
  });
  esq.appendChild(seg);
  if(estado.cadLixo) esq.appendChild(botao("so-tipo", "Só dado inválido " + ico(IC.x, 12, 2.6), function(){ estado.cadLixo = false; estado._cadTopo = true; desenharCad(); }));
  topo.appendChild(esq);
  topo.appendChild(novo("span", "mostrando", vis.length === 1 ? "1 ficha" : vis.length + " fichas"));
  sec.appendChild(topo);
  var corpo = novo("div", "lista-corpo");
  if(estado.cad === null) corpo.appendChild(novo("div", "lista-vazio", "Buscando os alertas de cadastro…"));
  else if(estado.cadErro) corpo.appendChild(novo("div", "lista-vazio erro", "Não consegui ler os alertas de cadastro. " + escapa(estado.cadErro)));
  else if(!vis.length) corpo.appendChild(novo("div", "lista-vazio", q ? "Nenhuma ficha com esse nome." :
    '<b class="ok">Nenhum problema de cadastro</b><br>Carteirinhas, convênios e duplicidades estão batendo com o espelho da Unimed, e toda guia viva do SGU tem ficha.'));
  var lim = estado.cadLimite || 150;
  var mostra = vis.slice(0, lim);
  var nCom = vis.filter(function(c){ return c.futuras > 0; }).length, nSem = vis.length - nCom;
  var grupo = null;
  mostra.forEach(function(c){
    var g = c.futuras > 0 ? "com" : "sem";
    if(g !== grupo){
      grupo = g;
      var n = g === "com" ? nCom : nSem;
      corpo.appendChild(novo("div", "dia-cab", '<b>' + (g === "com" ? "Com consulta marcada" : "Sem consulta marcada") + '</b><span>' + (n === 1 ? "1 ficha" : n + " fichas") + '</span>'));
    }
    var tipos = cadTipos(c), t = c.tratamento || "pendente";
    var rot = cadTxt(tipos[0]).curto + (tipos.length > 1 ? " +" + (tipos.length - 1) : "");
    var sub = t !== "pendente" ? (TRAT_CAD_ROT[t] || t) : (c.reincidente ? "Reincidente" : (c.lixo ? "Não juntar" : ""));
    var subCor = t === "corrigido" ? "#248A3D" : (t !== "pendente" ? "#636366" : "#D70015");
    var b = botao("linha" + (estado._cadAberta === c.paciente_id ? " aberta" : ""),
      '<span class="q"><span class="nm">' + escapa(c.paciente || "—") + '</span><span class="mt">' + cadFichaTxt(c) + " · " + futTxt(c.futuras) + '</span></span>' +
      '<span class="dir"><span class="tag" style="color:' + (t === "pendente" ? "#D70015" : "#AEAEB2") + '">' + escapa(rot) + '</span>' +
      (sub ? '<span class="tr" style="color:' + subCor + ';font-weight:600">' + escapa(sub) + '</span>' : '') + '</span>',
      function(){ abrirCadItem(c.paciente_id); });
    b.setAttribute("aria-haspopup", "dialog"); b.setAttribute("data-cad", c.paciente_id);
    corpo.appendChild(b);
  });
  if(vis.length > lim){
    var m = novo("div", "lista-mais");
    m.appendChild(botao("btn btn-s", "Mostrar mais " + Math.min(150, vis.length - lim) + " de " + (vis.length - lim), function(){ estado.cadLimite = lim + 150; desenharCad(); }));
    corpo.appendChild(m);
  }
  sec.appendChild(corpo);
  wrap.appendChild(sec);

  var lado = novo("div", "lado");
  var pr = novo("section", "painel"); pr.setAttribute("aria-labelledby", "cad-prob");
  pr.appendChild(novo("div", "painel-cab", '<h2 id="cad-prob">Problemas</h2><span>' + (todas.length === 1 ? "1 ficha" : todas.length + " fichas") + '</span>'));
  var contT = { convenio_invertido:0, convenio_agendamento:0, paciente_duplicado:0, carteirinha_repetida:0, guia_sem_ficha:0 };
  todas.forEach(function(c){ cadTipos(c).forEach(function(t){ contT[t] = (contT[t] || 0) + 1; }); });
  CAD_TIPOS_LISTA.forEach(function(k){
    var T = cadTxt(k);
    var b = botao("cat", '<span class="q" style="background:#D70015"></span><span class="t"><b>' + escapa(T.titulo) + '</b><small>' + escapa(T.sub) + '</small></span><span class="n">' + (contT[k] || 0) + '</span>' + ico(IC.dir, 16, 2),
      function(){ abrirCadCat(k); });
    b.setAttribute("aria-haspopup", "dialog");
    pr.appendChild(b);
  });
  var nLixo = todas.filter(function(c){ return c.lixo; }).length;
  if(nLixo){
    var bl = botao("cat cat-alerta", '<span class="alerta-ic">' + ico(IC_ALERTA, 16, 2) + '</span><span class="t"><b>' + escapa(CAD_LIXO.titulo) + '</b><small>' + escapa(CAD_LIXO.sub) + '</small></span><span class="n">' + nLixo + '</span>' + ico(IC.dir, 16, 2),
      function(){ abrirCadCat("lixo"); });
    bl.setAttribute("aria-haspopup", "dialog");
    pr.appendChild(bl);
  }
  lado.appendChild(pr);
  lado.appendChild(novo("section", "painel nota-lado",
    '<h2>Como funciona</h2><p>Uma linha por <b>paciente</b>: abra a ficha no Feegow e resolva o que está listado.</p>' +
    '<p><b>Guia sem ficha</b> é guia viva no SGU cuja carteirinha não está em ficha nenhuma: procure o paciente e crie ou complete a ficha. Sem isso a guia não fatura.</p>' +
    '<p><b>Agendamento no convênio errado</b>: a guia do paciente é de um convênio e o agendamento está no outro. Abra o agendamento no Feegow e troque o convênio para o da guia.</p>' +
    '<p><b>Agendamento com procedimento errado</b>: o agendamento é da Unimed, mas o procedimento não é nenhum dos 4 códigos que ela paga. Abra o agendamento no Feegow e troque o procedimento.</p>' +
    '<p>O robô recompara com o espelho da Unimed a cada 15 minutos. <b>Corrigiu? A linha some sozinha na próxima rodada.</b></p>' +
    '<p class="cinza">Marque o que você fez, para ninguém conferir a mesma coisa duas vezes.</p>'));
  wrap.appendChild(lado);
  main.appendChild(wrap);
  ajustaAltura();
  var c2 = main.querySelector(".lista-corpo"); if(c2) c2.scrollTop = rolagem;
}
function abrirCadCat(k){
  if(!window.moldura) return;
  var ehLixo = k === "lixo";
  var T = ehLixo ? CAD_LIXO : cadTxt(k);
  var lista = (estado.cad || []).filter(function(c){ return ehLixo ? c.lixo : cadTipos(c).indexOf(k) >= 0; });
  var P = moldura.pop({ largura:"640px", titulo:"Problemas de cadastro" });
  P.corpo.appendChild(novo("div", "pp-cab", '<span class="pp-alerta">' + (lista.length === 1 ? "1 ficha" : lista.length + " fichas") + '</span><h2>' + escapa(ehLixo ? T.titulo : T.titulo) + '</h2>'));
  P.corpo.appendChild(novo("div", "pp-caixa", '<span class="pp-rot">O que fazer</span><span class="pp-txt">' + escapa(T.acao) + '</span>'));
  var ul = novo("div", "pp-lista");
  lista.slice(0, 300).forEach(function(c){
    ul.appendChild(botao("pp-linha", '<span class="q"><b>' + escapa(c.paciente || "—") + '</b><small>' + cadFichaTxt(c) + " · " + futTxt(c.futuras) + '</small></span>' + ico(IC.dir, 14, 2),
      function(){
        estado.cadFiltro = ehLixo ? "todos" : k; estado.cadLixo = ehLixo; estado.cadBusca = "";
        var inp = document.getElementById("cadBusca"); if(inp) inp.value = "";
        var vis = cadVisiveis(); var pos = vis.indexOf(c);
        estado.cadLimite = Math.max(150, pos + 2); estado._cadTopo = true;
        desenharCad(); abrirCadItem(c.paciente_id);
      }));
  });
  P.corpo.appendChild(ul);
  P.rodape.hidden = false; P.rodape.classList.add("fim");
  P.rodape.appendChild(botao("btn btn-s", "Fechar", function(){ P.fechar(); }));
  P.rodape.appendChild(botao("btn btn-p", "Ver só estes na lista", function(){
    P.fechar();
    if(ehLixo){ estado.cadLixo = true; estado.cadFiltro = "todos"; } else { estado.cadFiltro = k; estado.cadLixo = false; }
    estado.cadBusca = ""; var inp = document.getElementById("cadBusca"); if(inp) inp.value = "";
    estado.cadLimite = 150; estado._cadTopo = true; desenharCad();
  }));
}
function abrirCadItem(id){
  if(!window.moldura) return;
  var atualId = id, msg = null, msgId = null, notaTimer = null;
  var P = moldura.pop({ largura:"640px", titulo:"Cadastro com problema", aoFechar:function(){ estado._cadAberta = null; marca(); } });
  function marca(){
    document.querySelectorAll("#gv-conteudo .linha.aberta").forEach(function(x){ x.classList.remove("aberta"); });
    if(estado._cadAberta){ var r = document.querySelector('#gv-conteudo .linha[data-cad="' + estado._cadAberta + '"]'); if(r) r.classList.add("aberta"); }
  }
  function pinta(){
    var L = cadVisiveis();
    var i = L.findIndex(function(x){ return x.paciente_id === atualId; });
    var c = i >= 0 ? L[i] : (estado.cad || []).find(function(x){ return x.paciente_id === atualId; });
    if(!c){ P.fechar(); return; }
    estado._cadAberta = c.paciente_id; marca();
    var t = c.tratamento || "pendente";
    P.corpo.innerHTML = "";
    var tags = "";
    if(c.futuras > 0) tags += '<span class="etq forte">' + futTxt(c.futuras) + '</span>';
    if(c.problemas.length > 1) tags += '<span class="etq">' + c.problemas.length + ' problemas</span>';
    if(c.lixo) tags += '<span class="etq vermelho">Não juntar</span>';
    if(c.reincidente) tags += '<span class="etq vermelho" title="Marcou corrigido faz tempo e o problema continua no espelho">Reincidente</span>';
    P.corpo.appendChild(novo("div", "pp-cab", '<span class="pp-quando">' + cadFichaTxt(c) + '</span><h2>' + escapa(c.paciente || "—") + '</h2>' +
      (tags ? '<span class="etqs">' + tags + '</span>' : '')));
    c.problemas.forEach(function(p){
      P.corpo.appendChild(novo("div", "pp-caixa", '<span class="pp-tag" style="color:#D70015">' + escapa(cadTxt(p.tipo).titulo) + '</span><span class="pp-txt">' + textoProblema2(p) + '</span>'));
    });
    var fe = novo("a", "btn-claro", "Abrir Pacientes no Feegow " + ico(IC.fora, 14, 2));
    fe.href = "https://app.feegow.com/main/?P=Pacientes&Pers=1"; fe.target = "_blank"; fe.rel = "noopener";
    P.corpo.appendChild(fe);
    var blocoT = novo("div", "pp-bloco", '<span class="pp-rot">O que você fez?</span>');
    var ops = novo("div", "pp-opcoes"); ops.setAttribute("role", "group"); ops.setAttribute("aria-label", "O que você fez?");
    var notaEl = novo("textarea", "pp-nota");
    TRAT_CAD.forEach(function(tt){
      var on = tt[0] === t;
      var b = botao("pp-op" + (on ? " on" : ""), '<span class="cx">' + (on ? ico(IC.ok, 12, 3, "#FFFFFF") : "") + '</span>' + escapa(tt[1]), function(){
        clearTimeout(notaTimer);
        if(tt[0] === (c.tratamento || "pendente") && notaEl.value.trim() === (c.nota || "")) return;
        salva(c, tt[0], notaEl.value.trim());
      });
      b.setAttribute("aria-pressed", on ? "true" : "false");
      ops.appendChild(b);
    });
    blocoT.appendChild(ops);
    P.corpo.appendChild(blocoT);
    var blocoN = novo("div", "pp-bloco", '<label class="pp-rot" for="nota-cad">Anotação</label>');
    notaEl.id = "nota-cad"; notaEl.rows = 2; notaEl.placeholder = "O que corrigiu, com quem falou…"; notaEl.value = c.nota || "";
    notaEl.addEventListener("change", function(){
      var v = notaEl.value.trim(); if(v === (c.nota || "")) return;
      clearTimeout(notaTimer); notaTimer = setTimeout(function(){ salva(c, c.tratamento || "pendente", v); }, 220);
    });
    blocoN.appendChild(notaEl);
    P.corpo.appendChild(blocoN);
    var est = msgId === c.paciente_id ? msg : null, txt, cor;
    if(est === "salvando"){ txt = "Salvando…"; cor = "#AEAEB2"; }
    else if(est === "ok"){ txt = "Salvo agora · por " + (autora() || "você"); cor = "#248A3D"; }
    else if(est === "erro"){ txt = "Não consegui salvar. Confira a internet e tente de novo."; cor = "#D70015"; }
    else { txt = t !== "pendente" ? "Marcado antes como " + (TRAT_CAD_ROT[t] || t).toLowerCase() + (c.autora ? ", por " + c.autora : "") + "." : "Marque o que fez: salva sozinho"; cor = "#AEAEB2"; }
    var sv = novo("div", "pp-salvo", ico(IC.ok, 14, 2.2, cor) + '<span' + (est === "erro" ? ' style="color:#D70015"' : '') + '>' + escapa(txt) + '</span>');
    sv.setAttribute("aria-live", "polite");
    P.corpo.appendChild(sv);
    P.rodape.hidden = false; P.rodape.innerHTML = "";
    var V = vizinhos(L, estado.cad || [], function(y){ return y.paciente_id; }, c.paciente_id), ant = V.ant, prox = V.prox;
    var bA = botao("btn btn-s", ico(IC.esq, 16, 2.2) + "Anterior", function(){ if(ant){ atualId = ant.paciente_id; pinta(); } }); bA.disabled = !ant;
    var bP = botao("btn btn-p", "Próxima" + ico(IC.dir, 16, 2.2), function(){
      if(!prox) return;
      atualId = prox.paciente_id;
      if(L.indexOf(prox) >= (estado.cadLimite || 150)){ estado.cadLimite = L.indexOf(prox) + 2; desenharCad(); }
      pinta();
    }); bP.disabled = !prox;
    P.rodape.appendChild(bA);
    P.rodape.appendChild(novo("span", "pop-pos", i >= 0 ? (i + 1) + " de " + L.length : "Saiu desta lista · " + L.length + " restantes"));
    P.rodape.appendChild(bP);
  }
  function salva(c, trat, nota){
    var id = c.paciente_id;
    msgId = id; msg = "salvando"; if(P.aberto) pinta();
    salvarOcNota("cadastro", c.oc_ref, { tratamento: trat, nota: nota }, function(ok){
      if(ok){ c.tratamento = trat; c.nota = nota; c.autora = autora(); badgesTopo(); if(estado.tela === "cad") desenharCad(); }
      if(msgId === id) msg = ok ? "ok" : "erro";
      if(P.aberto) pinta();
    });
  }
  pinta();
}

/* ═══ 🗑️ Exclusões — design novo: séries apagadas inteiras + "Situação" ═══
   Gravação igual à de antes: salvarOcNota("exclusao", ref, {quem_fez, tratamento, nota}) → oc_notas;
   o dono continua com aprovarExclusao (libera a proteção) e dispensarExclusao (tira da tela). */
var EXCL_SIT = {
  aberta:     { label:"Sem resposta", cor:"#D70015", sub:"Restaurar no Feegow ou confirmar que era para apagar",
                acao:"Abrir o Feegow e conferir. Apagou sem querer? Restaure os agendamentos e marque “Restaurei”. Era para apagar mesmo? Marque “Estava certo apagar”." },
  aguardando: { label:"Aguardando o dono", cor:"#C93400", sub:"A secretária disse que era para apagar",
                acao:"A secretária marcou “Estava certo apagar”. O administrador confere e aprova: aí a proteção é solta e a linha sai sozinha na próxima rodada." },
  resolvida:  { label:"Resolvidas", cor:"#248A3D", sub:"Restauradas ou sem solução, esperando a conferência",
                acao:"Restaurou no Feegow? A conferência da madrugada vê que as sessões voltaram e a linha some sozinha." }
};
var TRAT_EXCL_ROT = { pendente:"Pendente", restaurei:"Restaurei no Feegow", estava_certo:"Estava certo apagar", sem_solucao:"Sem solução" };
var QUEM_ROT = { fui_eu:"Fui eu", outra_pessoa:"Outra pessoa", nao_sei:"Não sei" };
function exclSit(x){ return x.aguardando_dono ? "aguardando" : ((!x.tratamento || x.tratamento === "pendente") ? "aberta" : "resolvida"); }
function exclVisiveis(){
  var q = semAcento(estado.exclBusca || "").trim();
  var f = estado.exclFiltro || "aberta";
  return (estado.excl || []).filter(function(x){
    if(q && semAcento((x.paciente || "") + " " + (x.profissional || "")).indexOf(q) < 0) return false;
    return f === "todas" || exclSit(x) === f;
  });
}
function protegidasRot(iso){ var d = diaRotulo(iso); return "Protegidas " + (d === "Hoje" ? "hoje" : d === "Ontem" ? "ontem" : "em " + d.charAt(0).toLowerCase() + d.slice(1)); }
function sessoesTxt(n){ return n === 1 ? "1 sessão apagada" : n + " sessões apagadas"; }
function desenharExcl(){
  var main = document.getElementById("gv-conteudo");
  campoBusca("exclusoes", "exclBusca", "Buscar paciente ou profissional", estado.exclBusca, function(v){ estado.exclBusca = v; estado._exclTopo = true; desenharExcl(); });
  var antes = main.querySelector(".lista-corpo");
  var rolagem = antes && !estado._exclTopo ? antes.scrollTop : 0;
  estado._exclTopo = false;
  main.innerHTML = "";
  var todas = estado.excl || [];
  var abertas = todas.filter(function(x){ return exclSit(x) !== "resolvida"; }).length;
  var agu = todas.filter(function(x){ return exclSit(x) === "aguardando"; }).length;
  if(window.moldura) moldura.resumo("exclusoes", estado.excl === null ? "" :
    (abertas === 1 ? "1 série apagada esperando conserto" : abertas + " séries apagadas esperando conserto") + " · " +
    (agu === 0 ? "nenhuma aguardando o dono" : (agu === 1 ? "1 aguardando o dono" : agu + " aguardando o dono")));
  var q = semAcento(estado.exclBusca || "").trim();
  var base = todas.filter(function(x){ return !q || semAcento((x.paciente || "") + " " + (x.profissional || "")).indexOf(q) >= 0; });
  var cont = { aberta:0, aguardando:0, resolvida:0, todas: base.length };
  base.forEach(function(x){ cont[exclSit(x)]++; });
  var filtro = estado.exclFiltro || "aberta";
  var vis = exclVisiveis();

  var wrap = novo("div", "duas-col");
  var sec = novo("section", "lista alta"); sec.setAttribute("aria-label", "Séries apagadas");
  var topo = novo("div", "lista-topo");
  var seg = novo("div", "seg"); seg.setAttribute("role", "group"); seg.setAttribute("aria-label", "Mostrar");
  [["aberta","Sem resposta",EXCL_SIT.aberta.cor],["aguardando","Aguardando o dono",EXCL_SIT.aguardando.cor],["resolvida","Resolvidas",EXCL_SIT.resolvida.cor],["todas","Todas","#AEAEB2"]].forEach(function(d){
    var on = filtro === d[0];
    var b = botao(on ? "on" : "", '<span class="q" style="background:' + d[2] + '"></span>' + d[1] + ' <span class="n">' + cont[d[0]] + '</span>',
      function(){ estado.exclFiltro = d[0]; estado._exclTopo = true; desenharExcl(); });
    b.setAttribute("aria-pressed", on ? "true" : "false");
    seg.appendChild(b);
  });
  topo.appendChild(seg);
  topo.appendChild(novo("span", "mostrando", vis.length === 1 ? "1 série" : vis.length + " séries"));
  sec.appendChild(topo);
  var corpo = novo("div", "lista-corpo");
  if(estado.excl === null) corpo.appendChild(novo("div", "lista-vazio", "Buscando as séries protegidas…"));
  else if(estado.exclErro) corpo.appendChild(novo("div", "lista-vazio erro", "Não consegui ler as exclusões. " + escapa(estado.exclErro)));
  else if(!vis.length) corpo.appendChild(novo("div", "lista-vazio", q ? "<b>Ninguém com esse nome</b><br>Confira a grafia ou limpe a busca." : '<b class="ok">Nada pendente</b><br>Nenhuma série apagada nesta situação.'));
  var dia = null, porDia = {};
  vis.forEach(function(x){ var k = protegidasRot(x.protegido_em); porDia[k] = (porDia[k] || 0) + 1; });
  vis.forEach(function(x){
    var k = protegidasRot(x.protegido_em);
    if(dia !== k){ dia = k; corpo.appendChild(novo("div", "dia-cab", '<b>' + escapa(k) + '</b><span>' + (porDia[k] === 1 ? "1 série" : porDia[k] + " séries") + '</span>')); }
    var s = exclSit(x), S = EXCL_SIT[s];
    var rot = s === "resolvida" ? (TRAT_EXCL_ROT[x.tratamento] || x.tratamento) : S.label;
    var sub = x.reincidente ? '<span class="tr" style="color:#D70015;font-weight:600">Restaurei, e não voltou</span>' :
      (x.quem_fez ? '<span class="tr">Quem apagou: ' + escapa((QUEM_ROT[x.quem_fez] || x.quem_fez).toLowerCase()) + '</span>' : '');
    var b = botao("linha" + (estado._exclAberta === x.oc_ref ? " aberta" : ""),
      '<span class="h">' + escapa(horaDe(x.protegido_em)) + '</span>' +
      '<span class="q"><span class="nm">' + escapa(x.paciente || "—") + '</span><span class="mt">' + escapa((x.profissional || "—") + " · " + (x.dia_semana || "?") + " às " + (x.horario || "?") + " · " + sessoesTxt(x.n_sessoes)) + '</span></span>' +
      '<span class="dir"><span class="tag" style="color:' + S.cor + '">' + escapa(rot) + '</span>' + sub + '</span>',
      function(){ abrirExclItem(x.oc_ref, filtro); });
    b.setAttribute("aria-haspopup", "dialog"); b.setAttribute("data-excl", x.oc_ref);
    corpo.appendChild(b);
  });
  sec.appendChild(corpo);
  wrap.appendChild(sec);

  var lado = novo("div", "lado");
  var pn = novo("section", "painel"); pn.setAttribute("aria-labelledby", "excl-sit");
  pn.appendChild(novo("div", "painel-cab", '<h2 id="excl-sit">Situação</h2><span>' + (todas.length === 1 ? "1 série" : todas.length + " séries") + '</span>'));
  var contT = { aberta:0, aguardando:0, resolvida:0 };
  todas.forEach(function(x){ contT[exclSit(x)]++; });
  ["aberta","aguardando","resolvida"].forEach(function(k){
    var S = EXCL_SIT[k];
    var b = botao("cat", '<span class="q" style="background:' + S.cor + '"></span><span class="t"><b>' + S.label + '</b><small>' + escapa(S.sub) + '</small></span><span class="n">' + contT[k] + '</span>' + ico(IC.dir, 16, 2),
      function(){ abrirExclCat(k); });
    b.setAttribute("aria-haspopup", "dialog");
    pn.appendChild(b);
  });
  lado.appendChild(pn);
  lado.appendChild(novo("section", "painel nota-lado",
    '<h2>Regra da casa</h2><p>Nunca use “excluir <b>todas</b> as sessões” no Feegow. Sempre <b>“somente este”</b> ou <b>“deste dia em diante”</b>.</p>' +
    '<p>Quando a série inteira é apagada, o robô <b>protege</b> os agendamentos (eles não somem do faturamento) e a série aparece aqui.</p>' +
    '<p class="cinza">A linha fica até ser resolvida: não some na virada do dia. Só o administrador pode tirá-la da tela.</p>'));
  wrap.appendChild(lado);
  main.appendChild(wrap);
  ajustaAltura();
  var c2 = main.querySelector(".lista-corpo"); if(c2) c2.scrollTop = rolagem;
  if(estado._exclPinta) estado._exclPinta();
}
function abrirExclCat(k){
  if(!window.moldura) return;
  var S = EXCL_SIT[k];
  var lista = (estado.excl || []).filter(function(x){ return exclSit(x) === k; });
  var P = moldura.pop({ largura:"640px", titulo:"Séries apagadas" });
  P.corpo.appendChild(novo("div", "pp-cab", '<span class="pp-alerta" style="color:' + S.cor + '">' + (lista.length === 1 ? "1 série" : lista.length + " séries") + '</span><h2>' + S.label + '</h2>'));
  P.corpo.appendChild(novo("div", "pp-caixa", '<span class="pp-rot">O que fazer</span><span class="pp-txt">' + escapa(S.acao) + '</span>'));
  var ul = novo("div", "pp-lista");
  lista.forEach(function(x){
    ul.appendChild(botao("pp-linha", '<span class="w">' + escapa(fmtQuando(x.protegido_em)) + '</span><span class="q"><b>' + escapa(x.paciente || "—") + '</b><small>' +
      escapa((x.profissional || "—") + " · " + (x.dia_semana || "?") + " às " + (x.horario || "?")) + '</small></span>' + ico(IC.dir, 14, 2),
      function(){ estado.exclFiltro = k; estado.exclBusca = ""; var i = document.getElementById("exclBusca"); if(i) i.value = ""; desenharExcl(); abrirExclItem(x.oc_ref, k); }));
  });
  if(!lista.length) ul.appendChild(novo("div", "lista-vazio", "Nenhuma série nesta situação agora."));
  P.corpo.appendChild(ul);
  P.rodape.hidden = false; P.rodape.classList.add("fim");
  P.rodape.appendChild(botao("btn btn-s", "Fechar", function(){ P.fechar(); }));
  P.rodape.appendChild(botao("btn btn-p", "Ver só estes na lista", function(){
    P.fechar(); estado.exclFiltro = k; estado.exclBusca = ""; var i = document.getElementById("exclBusca"); if(i) i.value = "";
    estado._exclTopo = true; desenharExcl();
  }));
}
function abrirExclItem(ref, filtro){
  if(!window.moldura) return;
  var atual = ref, msg = null, msgId = null, notaTimer = null;
  var P = moldura.pop({ largura:"640px", titulo:"Série apagada inteira", aoFechar:function(){ estado._exclAberta = null; estado._exclPinta = null; marca(); } });
  function marca(){
    document.querySelectorAll("#gv-conteudo .linha.aberta").forEach(function(x){ x.classList.remove("aberta"); });
    if(estado._exclAberta){ var r = document.querySelector('#gv-conteudo .linha[data-excl="' + CSS.escape(estado._exclAberta) + '"]'); if(r) r.classList.add("aberta"); }
  }
  function pinta(){
    var L = exclVisiveis();
    var i = L.findIndex(function(x){ return x.oc_ref === atual; });
    var x = i >= 0 ? L[i] : (estado.excl || []).find(function(y){ return y.oc_ref === atual; });
    if(!x){ P.fechar(); return; }
    estado._exclAberta = x.oc_ref; marca();
    var s = exclSit(x), S = EXCL_SIT[s], t = x.tratamento || "pendente";
    P.corpo.innerHTML = "";
    var tags = x.reincidente ? '<span class="etqs"><span class="etq vermelho" title="Marcou restaurei faz tempo e a proteção continua de pé: o Feegow ainda não mostrou as sessões de volta">Restaurei, e não voltou</span></span>' : "";
    P.corpo.appendChild(novo("div", "pp-cab", '<span class="pp-quando">Protegida em ' + escapa(fmtQuando(x.protegido_em).replace(" ", " às ")) + '</span>' +
      '<h2>' + escapa(x.paciente || "—") + '</h2><span class="pp-l1">' + escapa((x.profissional || "—") + " · toda " + (x.dia_semana || "?") + " às " + (x.horario || "?")) + '</span>' + tags));
    P.corpo.appendChild(novo("div", "pp-caixa",
      '<span class="pp-tag" style="color:' + S.cor + '">' + escapa(s === "resolvida" ? (TRAT_EXCL_ROT[t] || t) : S.label) + '</span>' +
      '<span class="pp-txt"><b>' + sessoesTxt(x.n_sessoes) + '</b> · datas: ' + escapa(x.datas_fmt || "—") + '</span>' +
      '<span class="pp-txt cinza">Protegidos pelo robô: não somem do faturamento enquanto a linha estiver aqui.</span>'));
    P.corpo.appendChild(novo("div", "pp-bloco", '<span class="pp-rot">O que fazer</span><span class="pp-txt">Apagou sem querer? <b>Restaure os agendamentos no Feegow</b> e marque “Restaurei”: a conferência da madrugada vê que voltou e a linha some sozinha. Era para apagar mesmo (alta, desistência)? Marque <b>“Estava certo apagar”</b>: o dono aprova e o sistema libera.</span>'));
    var notaEl = novo("textarea", "pp-nota");
    var bq = novo("div", "pp-bloco", '<span class="pp-rot">Quem apagou?</span>');
    var segQ = novo("div", "seg"); segQ.setAttribute("role", "group"); segQ.setAttribute("aria-label", "Quem apagou?");
    QUEM_FEZ.filter(function(w){ return w[0]; }).forEach(function(w){
      var on = w[0] === (x.quem_fez || "");
      var b = botao(on ? "on" : "", escapa(w[1]), function(){ clearTimeout(notaTimer); if(on) return; salva(x, { quem_fez: w[0], tratamento: t, nota: notaEl.value.trim() }); });
      b.setAttribute("aria-pressed", on ? "true" : "false");
      segQ.appendChild(b);
    });
    bq.appendChild(segQ);
    P.corpo.appendChild(bq);
    var bt = novo("div", "pp-bloco", '<span class="pp-rot">O que você fez?</span>');
    var ops = novo("div", "pp-opcoes"); ops.setAttribute("role", "group"); ops.setAttribute("aria-label", "O que você fez?");
    TRAT_EXCL.forEach(function(tt){
      var on = tt[0] === t;
      var b = botao("pp-op" + (on ? " on" : ""), '<span class="cx">' + (on ? ico(IC.ok, 12, 3, "#FFFFFF") : "") + '</span>' + escapa(tt[1]), function(){
        clearTimeout(notaTimer);
        if(tt[0] === t && notaEl.value.trim() === (x.nota || "")) return;
        salva(x, { quem_fez: x.quem_fez || null, tratamento: tt[0], nota: notaEl.value.trim() });
      });
      b.setAttribute("aria-pressed", on ? "true" : "false");
      ops.appendChild(b);
    });
    bt.appendChild(ops);
    P.corpo.appendChild(bt);
    if(s === "aguardando") P.corpo.appendChild(novo("div", "pp-caixa aviso", '<span class="pp-txt">Aguardando o dono aprovar. Só o administrador libera a proteção ou tira a linha da tela.</span>'));
    var bn = novo("div", "pp-bloco", '<label class="pp-rot" for="nota-excl">Anotação</label>');
    notaEl.id = "nota-excl"; notaEl.rows = 2; notaEl.placeholder = "Por que apagou, com quem confirmou…"; notaEl.value = x.nota || "";
    notaEl.addEventListener("change", function(){
      var v = notaEl.value.trim(); if(v === (x.nota || "")) return;
      clearTimeout(notaTimer); notaTimer = setTimeout(function(){ salva(x, { quem_fez: x.quem_fez || null, tratamento: t, nota: v }); }, 220);
    });
    bn.appendChild(notaEl);
    P.corpo.appendChild(bn);
    var est = msgId === x.oc_ref ? msg : null, txt, cor;
    if(est === "salvando"){ txt = "Salvando…"; cor = "#AEAEB2"; }
    else if(est === "ok"){ txt = "Salvo agora · por " + (autora() || "você"); cor = "#248A3D"; }
    else if(est === "erro"){ txt = "Não consegui salvar. Confira a internet e tente de novo."; cor = "#D70015"; }
    else { txt = (t !== "pendente" || x.quem_fez) ? "Marcado antes" + (x.autora ? " por " + x.autora : "") + "." : "Marque quem apagou e o que fez: salva sozinho"; cor = "#AEAEB2"; }
    var sv = novo("div", "pp-salvo", ico(IC.ok, 14, 2.2, cor) + '<span' + (est === "erro" ? ' style="color:#D70015"' : '') + '>' + escapa(txt) + '</span>');
    sv.setAttribute("aria-live", "polite");
    P.corpo.appendChild(sv);
    if(ehDono()){
      var adm = novo("div", "pp-adm", '<span class="pp-rot">Administrador</span>');
      var linhaB = novo("div", "pp-adm-bt");
      if(x.aguardando_dono){
        var ba = botao("btn btn-p", "Aprovar e liberar", function(){ aprovarExclusao(x, ba); });
        ba.title = "Confirma que era para apagar mesmo: a reconciliação libera na próxima rodada";
        linhaB.appendChild(ba);
      }
      var bx = botao("btn btn-s", "Tirar da tela", function(){ dispensarExclusao(x, bx); });
      bx.title = "Só esconde a linha: NÃO solta a proteção do faturamento";
      linhaB.appendChild(bx);
      adm.appendChild(linhaB);
      P.corpo.appendChild(adm);
    }
    P.rodape.hidden = false; P.rodape.innerHTML = "";
    var V = vizinhos(L, estado.excl || [], function(y){ return y.oc_ref; }, x.oc_ref), ant = V.ant, prox = V.prox;
    var bA = botao("btn btn-s", ico(IC.esq, 16, 2.2) + "Anterior", function(){ if(ant){ atual = ant.oc_ref; pinta(); } }); bA.disabled = !ant;
    var bP = botao("btn btn-p", "Próxima" + ico(IC.dir, 16, 2.2), function(){ if(prox){ atual = prox.oc_ref; pinta(); } }); bP.disabled = !prox;
    P.rodape.appendChild(bA);
    P.rodape.appendChild(novo("span", "pop-pos", i >= 0 ? (i + 1) + " de " + L.length : "Saiu desta lista · " + L.length + " restantes"));
    P.rodape.appendChild(bP);
  }
  function salva(x, campos){
    var id = x.oc_ref;
    msgId = id; msg = "salvando"; if(P.aberto) pinta();
    salvarOcNota("exclusao", x.oc_ref, campos, function(ok){
      if(ok){
        x.quem_fez = campos.quem_fez || null; x.tratamento = campos.tratamento; x.nota = campos.nota; x.autora = autora();
        x.aguardando_dono = (campos.tratamento === "estava_certo" && !x.aprovada_em);
        badgesTopo(); if(estado.tela === "excl") desenharExcl();
      }
      if(msgId === id) msg = ok ? "ok" : "erro";
      if(P.aberto) pinta();
    });
  }
  estado._exclPinta = function(){ if(P.aberto) pinta(); };
  pinta();
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

/* ── ✂️ tela — design novo: a tesoura do dia ──
   Gravações iguais às de antes: salvarCorteNota(ref, {tratamento:"excluido", indulto_ate:null})
   e salvarCorteNota(ref, {tratamento:"indulto", indulto_ate, nota}) → corte_notas. */
var CORTE_TXT = {
  cortar_hoje:       { label:"Cortar hoje", grupo:"Cortar hoje, até as 21h", cor:"#D70015", ordem:0, sub:"Última consulta viável: corte às 21h (sábado, 11h)",
                       acao:"Hoje é a última consulta que a cobertura alcança. Sem guia nova até as 21h (sábado, 11h), abrir o próximo agendamento no Feegow, apagar “este e os próximos” e assinar aqui." },
  prazo_vencido:     { label:"Prazo vencido", grupo:"Prazo vencido", cor:"#D70015", ordem:1, sub:"A guia solicitada não chegou em 2 dias",
                       acao:"A guia foi solicitada, mas o prazo de 2 dias venceu. Cortar: abrir o próximo agendamento no Feegow, apagar “este e os próximos” e assinar aqui." },
  cortar_agora:      { label:"Cortar agora", grupo:"Cortar agora", cor:"#D70015", ordem:2, sub:"Os próximos atendimentos já estão sem guia",
                       acao:"Os próximos atendimentos já estão sem cobertura. Abrir o próximo agendamento no Feegow, apagar “este e os próximos” (nunca os anteriores) e assinar aqui." },
  incompleto:        { label:"Apagou incompleto", grupo:"Apagou incompleto", cor:"#D70015", ordem:3, sub:"Assinada como excluída, mas os futuros ainda existem",
                       acao:"Alguém assinou “Excluí”, mas os futuros continuam no Feegow: provavelmente apagou só um. Abrir o Feegow e apagar “este e os próximos”." },
  excluido_conferir: { label:"Excluída, conferindo", grupo:"Excluída, conferindo", cor:"#C93400", ordem:4, sub:"Assinada: some quando o espelho confirmar",
                       acao:"A exclusão foi assinada. A linha some sozinha quando o espelho do Feegow confirmar que os futuros saíram." },
  aguardando:        { label:"Aguardando guia", grupo:"Aguardando guia", cor:"#636366", ordem:5, sub:"Guia solicitada: prazo máximo de 2 dias",
                       acao:"A guia foi solicitada e está segurando o corte por no máximo 2 dias. Venceu o prazo, corta." },
  indulto:           { label:"Indulto ativo", grupo:"Indulto ativo", cor:"#636366", ordem:6, sub:"Corte segurado por alguns dias, assinado",
                       acao:"Alguém segurou o corte por alguns dias, com motivo registrado. Quando o indulto vence, o paciente volta para a tesoura." }
};
var MOTIVO_ROT = { guia_vencida:"Guia vencida", sessao_em_feriado:"Cai no feriado", sem_saldo_na_fila:"Fila passa do saldo", saldo_esgotado:"Saldo esgotado", sem_guia:"Sem guia" };
function corteEst(c){ return c.apagou_incompleto ? "incompleto" : c.estado; }
function corteTxt(e){ return CORTE_TXT[e] || { label:e, grupo:e, cor:"#636366", ordem:9, sub:"", acao:"" }; }
function motivosTxt(t){ return String(t || "").split(" · ").filter(Boolean).map(function(m){ return MOTIVO_ROT[m] || m; }).join(" · "); }
function corteAssinatura(c){
  if(c.tratamento === "indulto" && c.indulto_ate) return "Indulto até " + fmtData(c.indulto_ate) + (c.autora ? " · por " + c.autora : "") + (c.nota ? " · " + c.nota : "");
  if(c.tratamento === "excluido" && c.nota_atualizada_em) return "Assinada como excluída" + (c.autora ? " por " + c.autora : "") + " em " + fmtQuando(c.nota_atualizada_em).replace(" ", " às ");
  return "";
}
function corteOrdenada(){
  return (estado.corte || []).slice().sort(function(a, b){ return corteTxt(corteEst(a)).ordem - corteTxt(corteEst(b)).ordem; });
}
function corteVisiveis(){
  var q = semAcento(estado.corteBusca || "").trim(), f = estado.corteFiltro || "todos";
  return corteOrdenada().filter(function(c){
    if(q && semAcento(c.paciente).indexOf(q) < 0) return false;
    return f === "todos" || corteEst(c) === f;
  });
}
function futSemCob(n){ return n === 1 ? "1 futura sem cobertura" : (n || 0) + " futuras sem cobertura"; }
function desenharCorte(){
  var main = document.getElementById("gv-conteudo"); if(!main) return;
  campoBusca("corte", "corteBusca", "Buscar paciente", estado.corteBusca, function(v){ estado.corteBusca = v; estado._corteTopo = true; desenharCorte(); });
  var antes = main.querySelector(".lista-corpo");
  var rolagem = antes && !estado._corteTopo ? antes.scrollTop : 0;
  estado._corteTopo = false;
  main.innerHTML = "";
  var todas = corteOrdenada();
  var ativos = todas.filter(corteAtivo).length, nHoje = todas.filter(function(c){ return c.estado === "cortar_hoje"; }).length;
  if(window.moldura) moldura.resumo("corte", estado.corte === null ? "" :
    (ativos === 1 ? "1 paciente para cortar" : ativos + " pacientes para cortar") + " · " + (nHoje === 0 ? "nenhum com corte hoje" : nHoje + " com corte hoje às 21h"));
  var q = semAcento(estado.corteBusca || "").trim();
  var base = todas.filter(function(c){ return !q || semAcento(c.paciente).indexOf(q) >= 0; });
  var cont = { todos: base.length };
  Object.keys(CORTE_TXT).forEach(function(k){ cont[k] = 0; });
  base.forEach(function(c){ cont[corteEst(c)] = (cont[corteEst(c)] || 0) + 1; });
  var filtro = estado.corteFiltro || "todos";
  var vis = corteVisiveis();

  var wrap = novo("div", "duas-col");
  var sec = novo("section", "lista alta"); sec.setAttribute("aria-label", "Pacientes para cortar");
  var topo = novo("div", "lista-topo");
  var seg = novo("div", "seg"); seg.setAttribute("role", "group"); seg.setAttribute("aria-label", "Mostrar");
  var defs = [["todos","Todos","#AEAEB2"],["cortar_hoje","Cortar hoje",TOM.r],["cortar_agora","Cortar agora",TOM.r],["incompleto","Apagou incompleto",TOM.r]];
  ["prazo_vencido","excluido_conferir","aguardando","indulto"].forEach(function(k){ if(cont[k] > 0) defs.push([k, CORTE_TXT[k].label, CORTE_TXT[k].cor]); });
  defs.forEach(function(d){
    var on = filtro === d[0];
    var b = botao(on ? "on" : "", '<span class="q" style="background:' + d[2] + '"></span>' + d[1] + ' <span class="n">' + (cont[d[0]] || 0) + '</span>',
      function(){ estado.corteFiltro = d[0]; estado._corteTopo = true; desenharCorte(); });
    b.setAttribute("aria-pressed", on ? "true" : "false");
    seg.appendChild(b);
  });
  topo.appendChild(seg);
  topo.appendChild(novo("span", "mostrando", vis.length === 1 ? "1 paciente" : vis.length + " pacientes"));
  sec.appendChild(topo);
  var corpo = novo("div", "lista-corpo");
  if(estado.corteErro) corpo.appendChild(novo("div", "lista-vazio erro", "Não consegui ler a fila do corte. " + escapa(estado.corteErro)));
  else if(estado.corte === null) corpo.appendChild(novo("div", "lista-vazio", "Carregando a fila…"));
  else if(!vis.length) corpo.appendChild(novo("div", "lista-vazio", q ? "<b>Ninguém com esse nome</b><br>Confira a grafia ou limpe a busca." : '<b class="ok">Fila limpa</b><br>Ninguém para cortar. A agenda está blindada.'));
  var grupo = null, porEst = {};
  vis.forEach(function(c){ var e = corteEst(c); porEst[e] = (porEst[e] || 0) + 1; });
  vis.forEach(function(c){
    var e = corteEst(c), S = corteTxt(e);
    if(grupo !== e){ grupo = e; corpo.appendChild(novo("div", "dia-cab", '<b>' + escapa(S.grupo) + '</b><span>' + (porEst[e] === 1 ? "1 paciente" : porEst[e] + " pacientes") + '</span>')); }
    var sub = (e === "indulto" || e === "excluido_conferir") ? corteAssinatura(c) : motivosTxt(c.motivos);
    var b = botao("linha" + (estado._corteAberta === c.oc_ref ? " aberta" : "") + (e === "indulto" ? " apagada" : ""),
      '<span class="q"><span class="nm">' + escapa(c.paciente || "—") + '</span><span class="mt">' + escapa((ESP_ROT[c.especialidade] || c.especialidade || "—") + " · " + futSemCob(c.n_descobertos) + ": " + (c.datas_fmt || "—")) + '</span></span>' +
      '<span class="dir"><span class="tag" style="color:' + S.cor + '">' + escapa(S.label) + '</span>' + (sub ? '<span class="tr">' + escapa(sub) + '</span>' : '') + '</span>',
      function(){ abrirCorteItem(c.oc_ref); });
    b.setAttribute("aria-haspopup", "dialog"); b.setAttribute("data-corte", c.oc_ref);
    corpo.appendChild(b);
  });
  sec.appendChild(corpo);
  wrap.appendChild(sec);

  var lado = novo("div", "lado");
  var pn = novo("section", "painel"); pn.setAttribute("aria-labelledby", "corte-sit");
  pn.appendChild(novo("div", "painel-cab", '<h2 id="corte-sit">Situação</h2><span>' + (todas.length === 1 ? "1 paciente" : todas.length + " pacientes") + '</span>'));
  var contT = {}; Object.keys(CORTE_TXT).forEach(function(k){ contT[k] = 0; });
  todas.forEach(function(c){ contT[corteEst(c)] = (contT[corteEst(c)] || 0) + 1; });
  ["cortar_hoje","prazo_vencido","cortar_agora","incompleto","excluido_conferir","aguardando","indulto"].forEach(function(k){
    if(!(contT[k] > 0 || k === "cortar_hoje" || k === "cortar_agora" || k === "aguardando")) return;
    var S = CORTE_TXT[k];
    var b = botao("cat", '<span class="q" style="background:' + S.cor + '"></span><span class="t"><b>' + S.label + '</b><small>' + escapa(S.sub) + '</small></span><span class="n">' + contT[k] + '</span>' + ico(IC.dir, 16, 2),
      function(){ abrirCorteCat(k); });
    b.setAttribute("aria-haspopup", "dialog");
    pn.appendChild(b);
  });
  lado.appendChild(pn);
  lado.appendChild(novo("section", "painel nota-lado",
    '<h2>A tesoura do dia</h2><p>Quem está aqui <b>perdeu a cobertura</b>: ou hoje é a última consulta viável (corte às <b>21h</b>, sábado às <b>11h</b>), ou os próximos já estão sem guia.</p>' +
    '<p>O caminho: abrir o <b>próximo</b> agendamento no Feegow e apagar <b>“este e os próximos”</b>, nunca os anteriores. Depois assinar aqui em <b>Excluí no Feegow</b>.</p>' +
    '<p class="cinza">A linha some sozinha quando o espelho confirmar. Aguardando guia = guia solicitada, prazo máximo de 2 dias; venceu, corta.</p>'));
  wrap.appendChild(lado);
  main.appendChild(wrap);
  ajustaAltura();
  var c2 = main.querySelector(".lista-corpo"); if(c2) c2.scrollTop = rolagem;
  if(estado._cortePinta) estado._cortePinta();
}
function abrirCorteCat(k){
  if(!window.moldura) return;
  var S = corteTxt(k);
  var lista = corteOrdenada().filter(function(c){ return corteEst(c) === k; });
  var P = moldura.pop({ largura:"640px", titulo:"Tesoura do dia" });
  P.corpo.appendChild(novo("div", "pp-cab", '<span class="pp-alerta" style="color:' + S.cor + '">' + (lista.length === 1 ? "1 paciente" : lista.length + " pacientes") + '</span><h2>' + escapa(S.label) + '</h2>'));
  P.corpo.appendChild(novo("div", "pp-caixa", '<span class="pp-rot">O que fazer</span><span class="pp-txt">' + escapa(S.acao) + '</span>'));
  var ul = novo("div", "pp-lista");
  lista.forEach(function(c){
    ul.appendChild(botao("pp-linha", '<span class="q"><b>' + escapa(c.paciente || "—") + '</b><small>' + escapa((ESP_ROT[c.especialidade] || c.especialidade || "—") + " · " + (c.datas_fmt || "—") + (c.motivos ? " · " + motivosTxt(c.motivos) : "")) + '</small></span>' + ico(IC.dir, 14, 2),
      function(){ estado.corteFiltro = k; estado.corteBusca = ""; var i = document.getElementById("corteBusca"); if(i) i.value = ""; desenharCorte(); abrirCorteItem(c.oc_ref); }));
  });
  if(!lista.length) ul.appendChild(novo("div", "lista-vazio", "Ninguém nesta situação agora."));
  P.corpo.appendChild(ul);
  P.rodape.hidden = false; P.rodape.classList.add("fim");
  P.rodape.appendChild(botao("btn btn-s", "Fechar", function(){ P.fechar(); }));
  P.rodape.appendChild(botao("btn btn-p", "Ver só estes na lista", function(){
    P.fechar(); estado.corteFiltro = k; estado.corteBusca = ""; var i = document.getElementById("corteBusca"); if(i) i.value = "";
    estado._corteTopo = true; desenharCorte();
  }));
}
function abrirCorteItem(ref){
  if(!window.moldura) return;
  var atual = ref, modo = "acoes", dias = 3, motivo = "", aviso = null;
  var P = moldura.pop({ largura:"640px", titulo:"Tesoura do dia", aoFechar:function(){ estado._corteAberta = null; estado._cortePinta = null; marca(); } });
  function marca(){
    document.querySelectorAll("#gv-conteudo .linha.aberta").forEach(function(x){ x.classList.remove("aberta"); });
    if(estado._corteAberta){ var r = document.querySelector('#gv-conteudo .linha[data-corte="' + CSS.escape(estado._corteAberta) + '"]'); if(r) r.classList.add("aberta"); }
  }
  function ateIso(d){ var a = new Date(); a.setDate(a.getDate() + d); return a.getFullYear() + "-" + String(a.getMonth()+1).padStart(2,"0") + "-" + String(a.getDate()).padStart(2,"0"); }
  function pinta(){
    var L = corteVisiveis();
    var i = L.findIndex(function(x){ return x.oc_ref === atual; });
    var c = i >= 0 ? L[i] : (estado.corte || []).find(function(x){ return x.oc_ref === atual; });
    if(!c){ P.fechar(); return; }
    estado._corteAberta = c.oc_ref; marca();
    var e = corteEst(c), S = corteTxt(e), ativo = corteAtivo(c);
    var quando = e === "cortar_hoje" ? "Prazo: " + (c.prazo ? fmtPrazo(c.prazo) : "hoje às 21h") :
                 e === "prazo_vencido" ? "Prazo vencido" + (c.prazo ? ": " + fmtPrazo(c.prazo) : "") :
                 e === "incompleto" ? "Assinou, mas os futuros continuam no Feegow" :
                 e === "cortar_agora" ? "Sem cobertura: cortar agora" : S.sub;
    P.corpo.innerHTML = "";
    P.corpo.appendChild(novo("div", "pp-cab", '<span class="pp-quando" style="color:' + (ativo ? "#D70015" : "#636366") + ';font-weight:600">' + escapa(quando) + '</span>' +
      '<h2>' + escapa(c.paciente || "—") + '</h2><span class="pp-l1">' + escapa(ESP_ROT[c.especialidade] || c.especialidade || "—") + '</span>'));
    var cx = novo("div", "pp-caixa", '<span class="pp-tag" style="color:' + S.cor + '">' + escapa(S.label) + '</span>' +
      '<span class="pp-txt"><b>' + futSemCob(c.n_descobertos) + ':</b> ' + escapa(c.datas_fmt || "—") + '</span>' +
      (c.motivos ? '<span class="pp-txt cinza">Motivo: ' + escapa(motivosTxt(c.motivos)) + '</span>' : ''));
    if(e === "incompleto") cx.appendChild(novo("span", "pp-txt", '<b style="color:#D70015">Apagou incompleto:</b> foi assinada como excluída, mas os futuros ainda existem. Foi apagado só um? Abrir o Feegow e apagar “este e os próximos”.'));
    if(e === "aguardando") cx.appendChild(novo("span", "pp-txt", "Guia " + (c.hold_fila_em ? "na fila do robô" : "solicitada no balcão") + ": segurando o corte."));
    var ass = corteAssinatura(c);
    if(ass) cx.appendChild(novo("span", "pp-txt cinza", escapa(ass)));
    P.corpo.appendChild(cx);
    if(c.alvo_agendamento_id){
      var a = novo("a", "btn-claro", "Abrir o próximo no Feegow " + ico(IC.fora, 14, 2));
      a.href = "https://app.feegow.com/main/?P=Agenda-1&Pers=1&AgendamentoID=" + c.alvo_agendamento_id;
      a.target = "_blank"; a.rel = "noopener"; a.title = "Abre direto no agendamento a apagar: dele em diante";
      P.corpo.appendChild(a);
    }
    var cel = primeiroCelular(c.celulares_raw, c.telefones_raw);
    var fone = novo("div", "pp-fone");
    if(cel){
      var dig = foneDigitos(cel);
      fone.innerHTML = '<span><small>Celular</small><b>' + escapa(foneBonito(cel)) + '</b></span>';
      var bc = botao("btn btn-s btn-sm", "Copiar", function(){
        (navigator.clipboard ? navigator.clipboard.writeText(dig) : Promise.reject())
          .then(function(){ bc.textContent = "Copiado"; setTimeout(function(){ bc.textContent = "Copiar"; }, 1600); }, function(){ window.prompt("Copie o número:", dig); });
      });
      fone.appendChild(bc);
    } else fone.innerHTML = '<span><small>Celular</small><b>Sem celular no cadastro</b></span>';
    P.corpo.appendChild(fone);
    var ac = novo("div", "pp-bloco");
    if(modo === "acoes"){
      ac.appendChild(novo("span", "pp-rot", "Depois de apagar no Feegow"));
      var lb = novo("div", "pp-adm-bt");
      lb.appendChild(botao("btn btn-p", "Excluí no Feegow", function(){
        if(!autora()){ aviso = "Entre com seu PIN primeiro: a assinatura precisa de nome."; pinta(); return; }
        modo = "confirma"; aviso = null; pinta();
      }));
      lb.appendChild(botao("btn btn-s", "Segurar o corte", function(){
        if(!autora()){ aviso = "Entre com seu PIN primeiro: o indulto é assinado."; pinta(); return; }
        modo = "indulto"; dias = 3; motivo = ""; aviso = null; pinta();
      }));
      ac.appendChild(lb);
    } else if(modo === "confirma"){
      ac.classList.add("pp-confirma");
      ac.appendChild(novo("span", "pp-txt", "Confirmar: os agendamentos futuros de <b>" + escapa(c.paciente) + "</b> (" + escapa(ESP_ROT[c.especialidade] || c.especialidade || "—") + ") foram apagados no Feegow?"));
      var lc = novo("div", "pp-adm-bt");
      lc.appendChild(botao("btn btn-s", "Cancelar", function(){ modo = "acoes"; pinta(); }));
      var bs = botao("btn btn-p", "Sim, apaguei", function(){
        bs.disabled = true; bs.textContent = "Salvando…";
        salvarCorteNota(c.oc_ref, { tratamento: "excluido", indulto_ate: null }, function(ok){
          modo = "acoes"; aviso = ok ? "ok:Assinado. A linha some quando o espelho confirmar." : "Não consegui salvar. Tente de novo.";
          if(P.aberto) pinta();
        });
      });
      lc.appendChild(bs);
      ac.appendChild(lc);
    } else {
      ac.classList.add("pp-confirma");
      ac.appendChild(novo("span", "pp-rot", "Não cortar por quantos dias?"));
      var st = novo("div", "passo");
      var bm = botao("btn btn-s", "−", function(){ dias = Math.max(1, dias - 1); pinta(); }); bm.setAttribute("aria-label", "Menos um dia"); bm.disabled = dias <= 1;
      var bp = botao("btn btn-s", "+", function(){ dias = Math.min(14, dias + 1); pinta(); }); bp.setAttribute("aria-label", "Mais um dia"); bp.disabled = dias >= 14;
      st.appendChild(bm); st.appendChild(novo("b", "passo-n", String(dias))); st.appendChild(bp);
      st.appendChild(novo("span", "cinza", "De 1 a 14 dias · segura até " + fmtData(ateIso(dias)).slice(0, 5)));
      ac.appendChild(st);
      var mi = novo("input", "fc"); mi.placeholder = "Motivo do indulto (fica registrado)"; mi.value = motivo;
      mi.addEventListener("input", function(){ motivo = mi.value; });
      ac.appendChild(mi);
      var li = novo("div", "pp-adm-bt");
      li.appendChild(botao("btn btn-s", "Cancelar", function(){ modo = "acoes"; pinta(); }));
      var bi = botao("btn btn-p", "Segurar por " + dias + (dias === 1 ? " dia" : " dias"), function(){
        bi.disabled = true; bi.textContent = "Salvando…";
        salvarCorteNota(c.oc_ref, { tratamento: "indulto", indulto_ate: ateIso(dias), nota: motivo || "" }, function(ok){
          modo = "acoes"; aviso = ok ? "ok:Indulto registrado." : "Não consegui salvar. Tente de novo.";
          if(P.aberto) pinta();
        });
      });
      li.appendChild(bi);
      ac.appendChild(li);
    }
    P.corpo.appendChild(ac);
    if(aviso){
      var ok = aviso.indexOf("ok:") === 0;
      P.corpo.appendChild(novo("div", "pp-salvo", ico(ok ? IC.ok : IC_ALERTA, 14, 2.2, ok ? "#248A3D" : "#D70015") + '<span style="color:' + (ok ? "#248A3D" : "#D70015") + '">' + escapa(ok ? aviso.slice(3) : aviso) + '</span>'));
    }
    P.rodape.hidden = false; P.rodape.innerHTML = "";
    var V = vizinhos(L, corteOrdenada(), function(y){ return y.oc_ref; }, c.oc_ref);
    var bA = botao("btn btn-s", ico(IC.esq, 16, 2.2) + "Anterior", function(){ if(V.ant){ atual = V.ant.oc_ref; modo = "acoes"; aviso = null; pinta(); } }); bA.disabled = !V.ant;
    var bP = botao("btn btn-p", "Próxima" + ico(IC.dir, 16, 2.2), function(){ if(V.prox){ atual = V.prox.oc_ref; modo = "acoes"; aviso = null; pinta(); } }); bP.disabled = !V.prox;
    P.rodape.appendChild(bA);
    P.rodape.appendChild(novo("span", "pop-pos", V.i >= 0 ? (V.i + 1) + " de " + L.length : "Saiu desta lista · " + L.length + " restantes"));
    P.rodape.appendChild(bP);
  }
  estado._cortePinta = function(){ if(P.aberto && modo === "acoes") pinta(); };
  pinta();
}

/* ── 📵 dados ──
   v3.5: junta as mensagens dos pacientes (conf_falhas: confirmação, lembrete e aviso de guia) com os avisos aos
   profissionais que não saíram (prof_avisos_falhas, FALHAS v2.0). Sem o SQL novo, a segunda volta vazia e a tela segue. */
function loadFalhas(){
  var qPac = fetch(GCFG.url + "/rest/v1/conf_falhas?select=*", { headers: cab() })
    .then(function(r){ if(!r.ok) throw new Error("HTTP "+r.status); return r.json(); });
  var qProf = fetch(GCFG.url + "/rest/v1/prof_avisos_falhas?select=*", { headers: cab() })
    .then(function(r){ return r.ok ? r.json() : []; })
    .catch(function(){ return []; });
  Promise.all([qPac, qProf])
    .then(function(res){
      estado.falhas = (res[0] || []).map(falhaDePaciente).concat((res[1] || []).map(falhaDeProf));
      estado.falhasErro = "";
      if(estado.tela === "falhas") desenharFalhas(); badgesTopo();
    })
    .catch(function(e){ estado.falhasErro = String(e.message||e);
                        if(estado.tela === "falhas") desenharFalhas(); });
}
function falhaDePaciente(f){ var x = Object.assign({}, f); x.origem = "paciente"; x.chave = "pac:" + f.agendamento_id + ":" + f.tipo; return x; }
function falhaDeProf(p){
  return { origem:"profissional", chave:"prof:" + p.id, tipo:"prof", prof_tipo:p.tipo, nome_paciente:p.nome, telefone:p.telefone,
           texto:p.texto, erro_detalhe:p.erro, status_envio:"ERRO", ultima_tentativa:p.agendado_para, semana_inicio:p.semana_inicio };
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
function abreMsg(f){ return "Oi, " + (f.nome_paciente || "paciente") + "! Aqui é do Centro Médico JF / Lev Soul 🤍\n\n"; }
function textoFalha(f){
  var m = falhaMotivo(f);
  if(f.origem === "profissional") return f.texto || "";
  if(m === "guia_vencida" || m === "sem_guia") return textoSemConsulta(f, m);   /* v3.5: decisão do dono (23/10) */
  if(f.tipo === "aviso_guia") return textoAvisoGuia(f);
  var abre = abreMsg(f);
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
/* v3.5: guia vencida ou sem guia → avisar que a consulta não vai acontecer */
function textoSemConsulta(f, m){
  var porque = m === "guia_vencida" ? "a sua guia Unimed venceu" : "não há guia Unimed autorizada para ela";
  var pedir  = m === "guia_vencida" ? "solicite a renovação da guia (ou a atualização da validade)" : "solicite a guia";
  return abreMsg(f) +
    "Sua consulta de *" + diaConsulta(f.data_atendimento) + "*, às *" + (f.horario||"") + "*, com *" + (f.profissional||"—") +
    "*, *não vai acontecer*: " + porque + ".\n\n" +
    "Para voltar a marcar, " + pedir + " com seu médico ou diretamente na Unimed. Quando estiver tudo certo, é só responder esta mensagem que a gente encontra um novo horário.";
}
/* v3.5: o mesmo texto do template "Guia Perto do Fim – Aviso Antecipado" (CONF v2.0) */
function textoAvisoGuia(f){
  var sab = f.data_atendimento && new Date(String(f.data_atendimento).slice(0,10) + "T12:00:00").getDay() === 6;
  return "Oi, " + (f.nome_paciente || "paciente") + "! Aqui é do Centro Médico JF / Lev Soul.\n\n" +
    "Aviso sobre sua guia Unimed: ela cobre seus atendimentos de " + String(f.especialidade || "terapia").toLowerCase() +
    " somente até a consulta de *" + diaConsulta(f.data_atendimento) + "*.\n\n" +
    "Para manter os próximos horários, a guia nova precisa entrar no sistema até as *" + (sab ? "11h" : "21h") +
    "* desse dia. Solicite a renovação (ou a atualização da validade) com seu médico ou diretamente na Unimed.\n\n" +
    "Já solicitou? Responda esta mensagem que a gente confere junto.";
}

/* ── 📵 tela — mensagens de WhatsApp que não saíram ──
   v3.5: o motivo vem em destaque; quando o erro tem correção, a tela diz o que CORRIGIR. Para mandar, um link abre o
   WhatsApp Web já na conversa e com a mensagem pronta escrita. Continua sem gravar nada. */
var FALHA_TXT = {
  sem_celular:  { label:"Sem celular", cor:"#D70015", sub:"Corrigir o cadastro e depois mandar",
                  porque:"O cadastro não tem um número de celular que sirva para WhatsApp.",
                  corrigir:"Cadastrar o celular do paciente no Feegow.",
                  passo:"Depois de corrigir, abra o WhatsApp com a mensagem pronta e envie." },
  guia_vencida: { label:"Guia vencida", cor:"#C93400", sub:"Avisar que a consulta não vai acontecer",
                  porque:"O robô não manda confirmação quando a guia está vencida.",
                  passo:"Abra o WhatsApp com a mensagem pronta e envie: ela avisa que a consulta não vai acontecer porque a guia venceu." },
  sem_guia:     { label:"Sem guia", cor:"#C93400", sub:"Avisar que a consulta não vai acontecer",
                  porque:"O robô não manda confirmação de consulta sem guia Unimed.",
                  passo:"Abra o WhatsApp com a mensagem pronta e envie: ela avisa que a consulta não vai acontecer porque não tem guia." },
  erro_envio:   { label:"Erro no envio", cor:"#636366", sub:"Não tem o que corrigir: é só mandar",
                  porque:"A plataforma de WhatsApp recusou ou caiu na hora do envio.",
                  passo:"Não tem o que corrigir. Abra o WhatsApp com a mensagem pronta e envie." },
  nao_enviado:  { label:"Não enviado", cor:"#636366", sub:"Mandar a mensagem pronta",
                  porque:"O robô não mandou esta mensagem.",
                  passo:"Abra o WhatsApp com a mensagem pronta e envie." },
  prof:         { label:"Aviso ao profissional", cor:"#2C2D6E", sub:"Mandar o aviso para o profissional",
                  porque:"O robô tentou mandar o aviso da conferência da agenda e a plataforma não entregou.",
                  passo:"Não tem o que corrigir. Abra o WhatsApp com a mensagem pronta e envie para o profissional." }
};
var FALHA_ORDEM = ["sem_celular", "guia_vencida", "sem_guia", "erro_envio", "nao_enviado", "prof"];
function falhaMotivo(f){
  if(f.origem === "profissional") return "prof";
  if(f.status_envio === "SEM CELULAR") return "sem_celular";
  if(f.status_envio === "NÃO ENVIADO"){
    var e = String(f.erro_detalhe || "").toUpperCase();
    if(e === "GUIA VENCIDA") return "guia_vencida";
    if(e === "SEM GUIA" || e === "AGENDADO SEM GUIA") return "sem_guia";
    return "nao_enviado";
  }
  return "erro_envio";
}
var PROF_AVISO_ROT = { abertura:"abertura da conferência", lembrete:"lembrete da conferência", ultimo:"último aviso da conferência",
                       encerrado:"conferência encerrada", secretaria:"fechamento da conferência" };
function tipoMsgRot(f){
  if(f.origem === "profissional") return "Aviso: " + (PROF_AVISO_ROT[f.prof_tipo] || f.prof_tipo || "conferência");
  return f.tipo === "lembrete" ? "Lembrete" : f.tipo === "aviso_guia" ? "Aviso de guia" : "Confirmação";
}
/* celular para o WhatsApp: do paciente, o primeiro celular válido do cadastro; do profissional, o telefone do aviso */
function falhaCelular(f){
  if(f.origem === "profissional"){
    var d = String(f.telefone || "").replace(/\D/g, "");
    if(d.slice(0,2) !== "55" && (d.length === 10 || d.length === 11)) d = "55" + d;
    return d.length >= 12 ? d : "";
  }
  return primeiroCelular(f.celulares_raw, f.telefones_raw);
}
/* sem celular, mas o cadastro já tem um celular válido agora (corrigido depois da tentativa do robô) */
function falhaCorrigida(f){ return falhaMotivo(f) === "sem_celular" && !!falhaCelular(f); }
function falhaPrecisaCorrigir(f){ return !!FALHA_TXT[falhaMotivo(f)].corrigir && !falhaCorrigida(f); }
function linkWhatsapp(cel, txt){ return "https://web.whatsapp.com/send?phone=" + cel + "&text=" + encodeURIComponent(txt); }
function diaConsulta(iso){
  if(!iso) return "—";
  var p = String(iso).slice(0,10).split("-"), d = new Date(+p[0], +p[1]-1, +p[2]), h = new Date();
  var hoje = new Date(h.getFullYear(), h.getMonth(), h.getDate());
  var dif = Math.round((d - hoje) / 86400000), dm = p[2] + "/" + p[1];
  if(dif === 0) return "hoje, " + dm;
  if(dif === 1) return "amanhã, " + dm;
  return ["domingo","segunda","terça","quarta","quinta","sexta","sábado"][d.getDay()] + ", " + dm;
}
function falhaOrdenada(){
  return (estado.falhas || []).slice().sort(function(a, b){
    var pa = a.origem === "profissional" ? 1 : 0, pb = b.origem === "profissional" ? 1 : 0;
    if(pa !== pb) return pa - pb;
    var x = String(a.data_atendimento || a.ultima_tentativa || "") + String(a.horario || ""),
        y = String(b.data_atendimento || b.ultima_tentativa || "") + String(b.horario || "");
    return x < y ? -1 : x > y ? 1 : 0;
  });
}
function falhaVisiveis(){
  var q = semAcento(estado.falhaBusca || "").trim(), f = estado.falhaFiltro || "todos";
  return falhaOrdenada().filter(function(x){
    if(q && semAcento(x.nome_paciente || "").indexOf(q) < 0) return false;
    return f === "todos" || falhaMotivo(x) === f;
  });
}
function falhaGrupo(x){ return x.origem === "profissional" ? "Avisos aos profissionais" : "Consultas de " + diaConsulta(x.data_atendimento); }
function desenharFalhas(){
  var main = document.getElementById("gv-conteudo"); if(!main) return;
  campoBusca("falhas", "falhaBusca", "Buscar nome", estado.falhaBusca, function(v){ estado.falhaBusca = v; estado._falhaTopo = true; desenharFalhas(); });
  var antes = main.querySelector(".lista-corpo");
  var rolagem = antes && !estado._falhaTopo ? antes.scrollTop : 0;
  estado._falhaTopo = false;
  main.innerHTML = "";
  var todas = estado.falhas || [];
  var nCorr = todas.filter(falhaPrecisaCorrigir).length;
  if(window.moldura) moldura.resumo("falhas", estado.falhas === null ? "" :
    (todas.length === 1 ? "1 mensagem de WhatsApp não saiu" : todas.length + " mensagens de WhatsApp não saíram") +
    (nCorr ? " · " + (nCorr === 1 ? "1 precisa de correção" : nCorr + " precisam de correção") : ""));
  var q = semAcento(estado.falhaBusca || "").trim();
  var base = todas.filter(function(x){ return !q || semAcento(x.nome_paciente || "").indexOf(q) >= 0; });
  var cont = { todos: base.length };
  base.forEach(function(x){ var k = falhaMotivo(x); cont[k] = (cont[k] || 0) + 1; });
  var filtro = estado.falhaFiltro || "todos";
  if(filtro !== "todos" && !cont[filtro]) filtro = estado.falhaFiltro = "todos";   /* o motivo do filtro sumiu da lista */
  var vis = falhaVisiveis();

  var wrap = novo("div", "duas-col");
  var sec = novo("section", "lista alta"); sec.setAttribute("aria-label", "Mensagens que não saíram");
  var topo = novo("div", "lista-topo");
  var seg = novo("div", "seg"); seg.setAttribute("role", "group"); seg.setAttribute("aria-label", "Mostrar");
  [["todos", "Todas", "#AEAEB2"]].concat(FALHA_ORDEM.filter(function(k){ return cont[k]; }).map(function(k){ return [k, FALHA_TXT[k].label, FALHA_TXT[k].cor]; }))
    .forEach(function(d){
      var on = filtro === d[0];
      var b = botao(on ? "on" : "", '<span class="q" style="background:' + d[2] + '"></span>' + escapa(d[1]) + ' <span class="n">' + (cont[d[0]] || 0) + '</span>',
        function(){ estado.falhaFiltro = d[0]; estado._falhaTopo = true; desenharFalhas(); });
      b.setAttribute("aria-pressed", on ? "true" : "false");
      seg.appendChild(b);
    });
  topo.appendChild(seg);
  topo.appendChild(novo("span", "mostrando", vis.length === 1 ? "1 mensagem" : vis.length + " mensagens"));
  sec.appendChild(topo);
  var corpo = novo("div", "lista-corpo");
  if(estado.falhasErro) corpo.appendChild(novo("div", "lista-vazio erro", "Não consegui ler as falhas de envio. " + escapa(estado.falhasErro)));
  else if(estado.falhas === null) corpo.appendChild(novo("div", "lista-vazio", "Carregando…"));
  else if(!vis.length) corpo.appendChild(novo("div", "lista-vazio", q ? "<b>Ninguém com esse nome</b><br>Confira a grafia ou limpe a busca." : '<b class="ok">Nenhuma falha</b><br>Todas as mensagens saíram.'));
  var grupo = null, porGrupo = {};
  vis.forEach(function(x){ var g = falhaGrupo(x); porGrupo[g] = (porGrupo[g] || 0) + 1; });
  vis.forEach(function(x){
    var g = falhaGrupo(x);
    if(grupo !== g){
      grupo = g;
      corpo.appendChild(novo("div", "dia-cab", '<b>' + escapa(g) + '</b><span>' + (porGrupo[g] === 1 ? "1 mensagem" : porGrupo[g] + " mensagens") + '</span>'));
    }
    var S = FALHA_TXT[falhaMotivo(x)];
    var hora = x.origem === "profissional" ? horaDe(x.ultima_tentativa) : (x.horario || "—");
    var b = botao("linha" + (estado._falhaAberta === x.chave ? " aberta" : ""),
      '<span class="h">' + escapa(hora) + '</span>' +
      '<span class="q"><span class="nm">' + escapa(x.nome_paciente || ("ID:" + x.paciente_id)) + '</span><span class="mt">' +
      escapa((x.origem === "profissional" ? "" : (x.profissional || "—") + " · ") + tipoMsgRot(x)) + '</span></span>' +
      '<span class="dir"><span class="tag" style="color:' + S.cor + '">' + escapa(S.label) + '</span>' +
      (falhaPrecisaCorrigir(x) ? '<span class="falha-corr">Corrigir</span>' : falhaCorrigida(x) ? '<span class="falha-corr ok">Já corrigido</span>' : '') + '</span>',
      function(){ abrirFalhaItem(x.chave); });
    b.setAttribute("aria-haspopup", "dialog"); b.setAttribute("data-falha", x.chave);
    corpo.appendChild(b);
  });
  sec.appendChild(corpo);
  wrap.appendChild(sec);

  var lado = novo("div", "lado");
  var pn = novo("section", "painel"); pn.setAttribute("aria-labelledby", "falha-sit");
  pn.appendChild(novo("div", "painel-cab", '<h2 id="falha-sit">Motivos</h2><span>' + (todas.length === 1 ? "1 mensagem" : todas.length + " mensagens") + '</span>'));
  var contT = {};
  todas.forEach(function(x){ var k = falhaMotivo(x); contT[k] = (contT[k] || 0) + 1; });
  FALHA_ORDEM.forEach(function(k){
    if(!contT[k]) return;
    var S = FALHA_TXT[k];
    var b = botao("cat", '<span class="q" style="background:' + S.cor + '"></span><span class="t"><b>' + escapa(S.label) + '</b><small>' + escapa(S.sub) + '</small></span><span class="n">' + contT[k] + '</span>' + ico(IC.dir, 16, 2),
      function(){ abrirFalhaCat(k); });
    b.setAttribute("aria-haspopup", "dialog");
    pn.appendChild(b);
  });
  if(!todas.length) pn.appendChild(novo("div", "lista-vazio", estado.falhas === null ? "Carregando…" : "Nenhuma falha agora."));
  lado.appendChild(pn);
  lado.appendChild(novo("section", "painel nota-lado",
    '<h2>Regra da casa</h2><p>São as mensagens de WhatsApp que <b>não saíram</b>: confirmação, lembrete e aviso de guia dos pacientes (consultas de hoje em diante) e os avisos aos profissionais.</p>' +
    '<p><b>Ninguém fica sem aviso.</b> Quando o erro tem correção, corrija primeiro. Depois, abra o WhatsApp com a mensagem pronta e envie.</p>' +
    '<p class="cinza">O item sai sozinho quando o dia da consulta passa ou quando o robô consegue mandar.</p>'));
  wrap.appendChild(lado);
  main.appendChild(wrap);
  ajustaAltura();
  var c2 = main.querySelector(".lista-corpo"); if(c2) c2.scrollTop = rolagem;
}
function abrirFalhaCat(k){
  if(!window.moldura) return;
  var S = FALHA_TXT[k];
  var lista = falhaOrdenada().filter(function(x){ return falhaMotivo(x) === k; });
  var P = moldura.pop({ largura:"640px", titulo:"Mensagens que não saíram" });
  P.corpo.appendChild(novo("div", "pp-cab", '<span class="pp-alerta" style="color:' + S.cor + '">' + (lista.length === 1 ? "1 mensagem" : lista.length + " mensagens") + '</span><h2>' + escapa(S.label) + '</h2>'));
  var cx = novo("div", "pp-caixa", '<span class="pp-rot">Por quê</span><span class="pp-txt">' + escapa(S.porque) + '</span>');
  if(S.corrigir) cx.appendChild(novo("div", "falha-corrigir", '<b>CORRIGIR</b><span>' + escapa(S.corrigir) + '</span>'));
  cx.appendChild(novo("span", "pp-txt", escapa(S.passo)));
  P.corpo.appendChild(cx);
  var ul = novo("div", "pp-lista");
  lista.forEach(function(x){
    var quando = x.origem === "profissional" ? fmtQuando(x.ultima_tentativa) : String(x.data_fmt || "").slice(0,5) + " " + (x.horario || "");
    ul.appendChild(botao("pp-linha", '<span class="w">' + escapa(quando) + '</span><span class="q"><b>' + escapa(x.nome_paciente || "—") + '</b><small>' +
      escapa((x.origem === "profissional" ? "" : (x.profissional || "—") + " · ") + tipoMsgRot(x)) + '</small></span>' + ico(IC.dir, 14, 2),
      function(){ estado.falhaFiltro = k; estado.falhaBusca = ""; var i = document.getElementById("falhaBusca"); if(i) i.value = ""; desenharFalhas(); abrirFalhaItem(x.chave); }));
  });
  if(!lista.length) ul.appendChild(novo("div", "lista-vazio", "Nenhuma mensagem aqui agora."));
  P.corpo.appendChild(ul);
  P.rodape.hidden = false; P.rodape.classList.add("fim");
  P.rodape.appendChild(botao("btn btn-s", "Fechar", function(){ P.fechar(); }));
  P.rodape.appendChild(botao("btn btn-p", "Ver só estes na lista", function(){
    P.fechar(); estado.falhaFiltro = k; estado.falhaBusca = ""; var i = document.getElementById("falhaBusca"); if(i) i.value = "";
    estado._falhaTopo = true; desenharFalhas();
  }));
}
function abrirFalhaItem(chave){
  if(!window.moldura) return;
  var atual = chave;
  var P = moldura.pop({ largura:"660px", titulo:"Mensagem que não saiu", aoFechar:function(){ estado._falhaAberta = null; marca(); } });
  function k(x){ return x.chave; }
  function marca(){
    document.querySelectorAll("#gv-conteudo .linha.aberta").forEach(function(x){ x.classList.remove("aberta"); });
    if(estado._falhaAberta){ var r = document.querySelector('#gv-conteudo .linha[data-falha="' + CSS.escape(estado._falhaAberta) + '"]'); if(r) r.classList.add("aberta"); }
  }
  function copia(txt, botaoEl, okTxt, base){
    (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject())
      .then(function(){ botaoEl.textContent = okTxt; setTimeout(function(){ botaoEl.textContent = base; }, 2200); },
            function(){ window.prompt("Copie:", txt); });
  }
  function pinta(){
    var L = falhaVisiveis();
    var V = vizinhos(L, falhaOrdenada(), k, atual);
    var x = V.i >= 0 ? L[V.i] : (estado.falhas || []).find(function(y){ return k(y) === atual; });
    if(!x){ P.fechar(); return; }
    estado._falhaAberta = k(x); marca();
    var m = falhaMotivo(x), S = FALHA_TXT[m];
    var cel = falhaCelular(x);
    var txt = textoFalha(x);
    P.corpo.innerHTML = "";
    var quando = x.origem === "profissional"
      ? "Aviso ao profissional · " + (PROF_AVISO_ROT[x.prof_tipo] || x.prof_tipo || "")
      : "Consulta de " + diaConsulta(x.data_atendimento) + " às " + (x.horario || "—");
    P.corpo.appendChild(novo("div", "pp-cab", '<span class="pp-quando">' + escapa(quando) + '</span>' +
      '<h2>' + escapa(x.nome_paciente || ("ID:" + x.paciente_id)) + '</h2>' +
      (x.origem === "profissional" ? "" : '<span class="pp-l1">' + escapa((x.profissional || "—") + (x.especialidade ? " · " + x.especialidade : "")) + '</span>')));
    /* motivo + o que corrigir */
    var cx = novo("div", "pp-caixa", '<span class="pp-tag" style="color:' + S.cor + '">' + escapa(S.label) + '</span><span class="pp-txt">' + escapa(S.porque) + '</span>');
    if(S.corrigir){
      var feito = falhaCorrigida(x);
      cx.appendChild(novo("div", "falha-corrigir" + (feito ? " ok" : ""),
        feito ? '<b>CORRIGIDO</b><span>O cadastro já tem celular agora. É só mandar a mensagem.</span>'
              : '<b>CORRIGIR</b><span>' + escapa(S.corrigir) + '</span>'));
    }
    cx.appendChild(novo("span", "pp-l2", escapa(tipoMsgRot(x)) +
      (x.erro_detalhe && m === "erro_envio" || x.origem === "profissional" ? " · " + escapa(String(x.erro_detalhe || "").slice(0, 90)) : "") +
      (x.ultima_tentativa ? " · tentativa em " + escapa(fmtQuando(x.ultima_tentativa).replace(" ", " às ")) : "")));
    P.corpo.appendChild(cx);
    var passo = falhaCorrigida(x) ? "Já corrigido no cadastro: abra o WhatsApp com a mensagem pronta e envie." : S.passo;
    P.corpo.appendChild(novo("div", "pp-bloco", '<span class="pp-rot">O que fazer</span><span class="pp-txt">' + escapa(passo) + '</span>'));
    /* número */
    var fone = novo("div", "pp-fone");
    if(cel){
      var dig = foneDigitos(cel);
      fone.innerHTML = '<span><small>Celular</small><b>' + escapa(foneBonito(cel)) + '</b></span>';
      var bc = botao("btn btn-s btn-sm", "Copiar", function(){ copia(dig, bc, "Copiado", "Copiar"); });
      bc.title = "Copiar o número (só dígitos, sem o 55)";
      fone.appendChild(bc);
    } else fone.innerHTML = '<span><small>Celular</small><b class="falha-semcel">Sem celular válido no cadastro</b></span>';
    P.corpo.appendChild(fone);
    /* mensagem pronta + link do WhatsApp Web */
    var bm = novo("div", "pp-bloco");
    var rotMsg = (m === "guia_vencida" || m === "sem_guia") ? "a consulta não vai acontecer" : tipoMsgRot(x).toLowerCase();
    var cab2 = novo("div", "pp-msg-cab", '<span class="pp-rot">Mensagem pronta · ' + escapa(rotMsg) + '</span>');
    var acoes = novo("span", "falha-acoes");
    var bmsg = botao("btn btn-s btn-sm", "Copiar", function(){ copia(txt, bmsg, "Copiada", "Copiar"); });
    bmsg.title = "Copiar só o texto";
    acoes.appendChild(bmsg);
    if(cel && txt){
      var a = novo("a", "btn btn-p btn-sm falha-wpp", ico("M20.5 11.6a8.5 8.5 0 0 1-12.6 7.4L3.5 20.5l1.5-4.3A8.5 8.5 0 1 1 20.5 11.6z", 15, 2) + "Abrir no WhatsApp");
      a.href = linkWhatsapp(cel, txt); a.target = "whatsapp_cmjf";
      a.title = "Abre o WhatsApp Web na conversa, com a mensagem já escrita: é só apertar enviar";
      acoes.appendChild(a);
    } else {
      var off = botao("btn btn-p btn-sm", "Abrir no WhatsApp"); off.disabled = true;
      off.title = cel ? "Sem mensagem pronta" : "Sem celular válido: corrija o cadastro primeiro";
      acoes.appendChild(off);
    }
    cab2.appendChild(acoes);
    bm.appendChild(cab2);
    bm.appendChild(novo("div", "pp-msg", escapa(txt || "—")));
    P.corpo.appendChild(bm);
    P.rodape.hidden = false; P.rodape.innerHTML = "";
    var bA = botao("btn btn-s", ico(IC.esq, 16, 2.2) + "Anterior", function(){ if(V.ant){ atual = k(V.ant); pinta(); } }); bA.disabled = !V.ant;
    var bP = botao("btn btn-p", "Próxima" + ico(IC.dir, 16, 2.2), function(){ if(V.prox){ atual = k(V.prox); pinta(); } }); bP.disabled = !V.prox;
    P.rodape.appendChild(bA);
    P.rodape.appendChild(novo("span", "pop-pos", V.i >= 0 ? (V.i + 1) + " de " + L.length : L.length + " na lista"));
    P.rodape.appendChild(bP);
  }
  pinta();
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
  /* os enviados ao SGU são só consulta (lado direito e "último envio"): se falharem, o resto da tela segue */
  var enviados = q("fx4_malotes?select=*&estado=eq.enviado&order=enviado_em.desc.nullslast,id.desc&limit=11")
    .then(function(env){
      if(!env.length) return { env: env, confs: [] };
      var ids = env.map(function(m){ return m.id; }).join(",");
      return q("fx4_conferencias_xml?select=malote_id,veredito,qt_guias,qt_linhas,valor_total&veredito=eq.ok&malote_id=in.(" + ids + ")&order=id.desc")
        .then(function(c){ return { env: env, confs: c }; }, function(){ return { env: env, confs: [] }; });
    })
    .catch(function(){ return null; });
  return Promise.all([
    q("fx4_fila_malote?select=*"),
    q("fx4_malotes?select=*&estado=neq.enviado&order=id.desc"),
    q("fx4_rejeicoes_sgu?select=*&order=criada_em.desc&limit=100"),
    q("fx4_conferencias_xml?select=malote_id,veredito,problemas,resumo,arquivo,qt_guias,qt_linhas,valor_total,conferida_em&order=id.desc&limit=60"),
    enviados
  ]).then(function(res){
    estado.malotes = { fila: res[0], vivos: res[1], rej: res[2], confs: res[3],
                       enviados: res[4] ? res[4].env : [], envConfs: res[4] ? res[4].confs : [], envErro: !res[4] };
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

/* ── ações ──
   As gravações são as mesmas de sempre (fx4_marcar_fechado, fx4_conferir_xml, fx4_marcar_enviado,
   fx4_tratar_rejeicao). As confirmações saíram das caixinhas do navegador e foram para dentro da janela. */
function fx4Conferir(m, file, observacao){
  var falhou = function(msg){ estado.malotesUlt[m.id] = { erro: msg }; desenharMalotes(); };
  fx4LerArquivo(file, function(texto){
    var r;
    try { r = fx4ParseXML(texto, file.name); }
    catch(e){ falhou("Problema no arquivo: " + e.message); return; }
    if(!r.linhas.length){ falhou("O XML não tem nenhuma linha de procedimento."); return; }
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
  }, function(e){ falhou(e.message); });
}

/* ── desenho ── */
function fx4ProbHTML(problemas){
  if(!problemas || !problemas.length) return "";
  var porGuia = {};
  problemas.forEach(function(p){
    var k = p.guia_prestador || "(geral)";
    (porGuia[k] = porGuia[k] || []).push(p);
  });
  var h = "";
  Object.keys(porGuia).sort().forEach(function(k){
    h += "<div class='mal-prob-g'><b>Guia " + escapa(k) + "</b>";
    porGuia[k].forEach(function(p){
      h += "<span><b>" + escapa(p.problema) + "</b>" +
           (p.codigo ? " · " + escapa(p.codigo) : "") +
           (p.detalhe ? ": " + escapa(p.detalhe) : "") + "</span>";
    });
    h += "</div>";
  });
  return h;
}
var IC_MAL = {
  bloco:  "M3.5 7.5 12 3.5l8.5 4v9L12 20.5l-8.5-4zM3.5 7.5l8.5 4 8.5-4M12 11.5v9",
  malote: "M5 6h14v12H5zM5 10h14M9 14h6",
  rej:    "M12 3.5 21.5 20h-19zM12 10v4.5M12 17.2h.01"
};
var MAL_EST = {
  fechado:                 { rot:"Fechado, esperando o XML do lote", cor:"#C93400",
                             explica:"A lista está congelada. Baixe o XML do lote no Feegow e confira aqui: só malote 100% limpo segue para o SGU." },
  conferido_ok:            { rot:"Conferido, pronto para o SGU", cor:"#248A3D",
                             explica:"Suba o lote no SGU. Marque “Enviado” só quando o SGU aceitar." },
  conferido_com_problemas: { rot:"Barrado na conferência", cor:"#D70015",
                             explica:"Nada foi gravado. Corrija no Feegow ou no SGU e suba o XML de novo." },
  em_correcao:             { rot:"Aguardando XML corrigido", cor:"#D70015",
                             explica:"Suba o XML corrigido para conferir de novo." }
};
function malEst(e){ return MAL_EST[e] || { rot: String(e || "—"), cor:"#636366", explica:"" }; }
function malConv(id){ return id === 8 ? "Unimed Intercâmbio" : "Unimed Local"; }
function malN(n, um, varios){ n = Number(n) || 0; return n === 1 ? "1 " + um : n + " " + varios; }
/* data e hora de carimbos (timestamptz) no fuso de quem está olhando; datas puras seguem com fx4Data */
function malDia(iso){
  if(!iso) return "—";
  var d = new Date(iso); if(isNaN(d.getTime())) return fx4Data(iso);
  return String(d.getDate()).padStart(2,"0") + "/" + String(d.getMonth()+1).padStart(2,"0") + "/" + String(d.getFullYear()).slice(2);
}
function malDataHora(iso){ return iso ? malDia(iso) + " às " + horaDe(iso) : "—"; }
function malBlocos(){
  var M = estado.malotes; if(!M) return [];
  var g = {}, out = [];
  (M.fila || []).forEach(function(x){
    var k = x.convenio_id + "·" + x.bloco;
    if(!g[k]){ g[k] = { k: k, chave: "b:" + k, convenio_id: x.convenio_id, bloco: x.bloco, guias: [] }; out.push(g[k]); }
    g[k].guias.push(x);
  });
  out.sort(function(a, b){ return a.k < b.k ? -1 : (a.k > b.k ? 1 : 0); });
  out.forEach(function(b){
    b.nums = b.guias.map(function(x){ return x.numero_guia_prestador; });
    b.soma = b.guias.reduce(function(a, x){ return a + (Number(x.valor_esperado_total) || 0); }, 0);
    b.d1 = b.guias[0].data_mais_antiga; b.d2 = b.guias[b.guias.length - 1].data_mais_antiga;
  });
  return out;
}
function malItens(f){
  var M = estado.malotes || {};
  if(f === "andamento") return (M.vivos || []).map(function(m){ return { chave: "m:" + m.id, m: m }; });
  if(f === "rejeicoes") return (M.rej || []).map(function(r){ return { chave: "r:" + r.id, r: r }; });
  return malBlocos().map(function(b){ return { chave: b.chave, b: b }; });
}
function malConfEnv(id){
  var cs = (estado.malotes && estado.malotes.envConfs) || [];
  for(var i=0;i<cs.length;i++) if(cs[i].malote_id === id) return cs[i];
  return null;
}
function malLinha(it){
  var ic, tit, meta, valor = "", rot, cor;
  if(it.b){
    var b = it.b;
    ic = IC_MAL.bloco; tit = malConv(b.convenio_id) + " · Bloco " + b.bloco;
    meta = malN(b.guias.length, "guia", "guias") + " · datas de " + fx4Data(b.d1) + " a " + fx4Data(b.d2) + " · a mais velha primeiro";
    valor = fx4Dinheiro(b.soma); rot = "Pronto para fechar"; cor = "#248A3D";
  } else if(it.m){
    var m = it.m, E = malEst(m.estado), u = estado.malotesUlt[m.id], c = fx4UltConf(m.id);
    ic = IC_MAL.malote; tit = "Malote #" + m.id + (m.numero_lote ? " · lote " + m.numero_lote : "");
    meta = malN(m.qt_guias, "guia congelada", "guias congeladas") + " · " + malConv(m.convenio_id) +
           (m.criado_por ? " · fechado por " + m.criado_por : "") + " · " + malDia(m.criado_em);
    if(c && c.valor_total != null) valor = fx4Dinheiro(c.valor_total);
    if(u && u.rodando){ rot = "Conferindo o XML…"; cor = "#636366"; } else { rot = E.rot; cor = E.cor; }
  } else {
    var r = it.r;
    ic = IC_MAL.rej; tit = "Guia " + r.numero_guia_prestador + (r.numero_lote ? " · lote " + r.numero_lote : "");
    meta = [r.paciente_nome, malDia(r.criada_em), r.autora ? "por " + r.autora : "", "SGU: " + (r.motivo_sgu || "—")]
             .filter(Boolean).join(" · ");
    rot = r.tratada ? "Tratada" : "Pendente, análise do dono"; cor = r.tratada ? "#248A3D" : "#D70015";
  }
  return '<span class="mal-ic">' + ico(ic, 18, 1.7) + '</span>' +
    '<span class="q"><span class="nm">' + escapa(tit) + '</span><span class="mt">' + escapa(meta) + '</span></span>' +
    '<span class="dir">' + (valor ? '<span class="valor">' + escapa(valor) + '</span>' : '') +
      '<span class="tag" style="color:' + cor + '">' + escapa(rot) + '</span></span>';
}
function desenharMalotes(){
  var host = document.getElementById("gv-conteudo"); if(!host) return;
  var M = estado.malotes;
  var blocos = malBlocos(), vivos = (M && M.vivos) || [], rej = (M && M.rej) || [], env = (M && M.enviados) || [];
  var nGuias = blocos.reduce(function(a, b){ return a + b.guias.length; }, 0);
  var semTratar = rej.filter(function(r){ return !r.tratada; }).length;

  /* cabeçalho: resumo e o último envio ao SGU */
  if(window.moldura){
    moldura.resumo("malotes", M ? (blocos.length === 1 ? "1 bloco pronto" : blocos.length + " blocos prontos") + " para fechar · " +
      malN(nGuias, "guia", "guias") + " · " +
      (vivos.length === 0 ? "nenhum malote em andamento" : malN(vivos.length, "malote em andamento", "malotes em andamento")) : "");
    var ac = moldura.acoesDe("malotes");
    if(ac){
      var box = ac.querySelector(".mal-ult");
      if(!box){ box = novo("div", "mal-ult"); ac.appendChild(box); }
      box.innerHTML = '<span>Último envio ao SGU</span><b>' + escapa(env.length ? malDataHora(env[0].enviado_em) : "—") + '</b>';
      box.hidden = !M || !!M.envErro;
    }
  }

  var antes = host.querySelector(".lista-corpo");
  var rolagem = (antes && !estado._malTopo) ? antes.scrollTop : 0;
  estado._malTopo = false;
  var f = estado.malFiltro || "prontos";
  host.innerHTML = "";
  var wrap = novo("div", "duas-col");

  /* lista: prontos / em andamento / rejeições */
  var sec = novo("section", "lista alta"); sec.setAttribute("aria-label", "Malotes");
  var topo = novo("div", "lista-topo");
  var seg = novo("div", "seg"); seg.setAttribute("role", "group"); seg.setAttribute("aria-label", "Mostrar");
  [["prontos", "Prontos para fechar", "#248A3D", blocos.length],
   ["andamento", "Em andamento", "#C93400", vivos.length],
   ["rejeicoes", "Rejeições do SGU", "#D70015", rej.length]].forEach(function(d){
    var on = f === d[0];
    var b = botao(on ? "on" : "", '<span class="q" style="background:' + d[2] + '"></span>' + d[1] + ' <span class="n">' + d[3] + '</span>', function(){
      if((estado.malFiltro || "prontos") === d[0]) return;
      estado.malFiltro = d[0]; estado._malTopo = true; desenharMalotes();
    });
    b.setAttribute("aria-pressed", on ? "true" : "false");
    seg.appendChild(b);
  });
  topo.appendChild(seg);
  topo.appendChild(novo("span", "mostrando", !M ? "" : f === "prontos" ? malN(nGuias, "guia na fila", "guias na fila") :
    f === "andamento" ? vivos.length + " em andamento" : semTratar + " sem tratar"));
  sec.appendChild(topo);
  var corpo = novo("div", "lista-corpo");
  if(estado.malotesErro) corpo.appendChild(novo("div", "lista-vazio erro", escapa(estado.malotesErro)));
  else if(!M) corpo.appendChild(novo("div", "lista-vazio", "Carregando…"));
  else {
    var itens = malItens(f);
    if(!itens.length){
      var V = { prontos:   ["Nenhuma guia pronta agora", "A fila enche conforme a conferência aprova as guias."],
                andamento: ["Nenhum malote em andamento", "Feche um bloco pronto no Feegow para começar um malote."],
                rejeicoes: ["Nenhuma rejeição registrada", "Que continue assim."] }[f];
      corpo.appendChild(novo("div", "lista-vazio", '<b class="ok">' + V[0] + '</b><br>' + V[1]));
    }
    itens.forEach(function(it){
      var bt = botao("linha mal" + (estado._malAberta === it.chave ? " aberta" : ""), malLinha(it), function(){ abrirMalItem(it.chave); });
      bt.setAttribute("aria-haspopup", "dialog"); bt.setAttribute("data-mal", it.chave);
      corpo.appendChild(bt);
    });
  }
  sec.appendChild(corpo);
  wrap.appendChild(sec);

  /* lado: o caminho e os enviados ao SGU */
  var lado = novo("div", "lado");
  var cam = novo("section", "painel"); cam.setAttribute("aria-label", "O caminho, sempre o mesmo");
  cam.appendChild(novo("div", "painel-cab", "<h2>O caminho, sempre o mesmo</h2>"));
  [["1", "Copiar o bloco e fechar no Feegow", "Copie os números das guias e feche o malote no Feegow."],
   ["2", "Assinar “Malote fechado”", "Congela a lista: as guias saem da fila e o malote passa a esperar o XML."],
   ["3", "Baixar o XML e conferir aqui", "Só malote 100% limpo segue."],
   ["4", "Subir no SGU e marcar “Enviado”", "Só quando o SGU aceitar. Isso é definitivo."]].forEach(function(p){
    cam.appendChild(novo("div", "mal-passo", '<span class="n">' + p[0] + '</span><span class="t"><b>' + p[1] + '</b><small>' + p[2] + '</small></span>'));
  });
  cam.appendChild(novo("p", "mal-passo-nota", "SGU rejeitou guia? Use <b>Correção</b> com o motivo: a guia volta para a fila sozinha quando sanar."));
  lado.appendChild(cam);
  var en = novo("section", "painel"); en.setAttribute("aria-label", "Enviados ao SGU");
  var mostra = env.slice(0, 10);
  en.appendChild(novo("div", "painel-cab", "<h2>Enviados ao SGU</h2><span>" +
    (!M || M.envErro ? "" : env.length > 10 ? "últimos 10" : malN(env.length, "malote", "malotes")) + "</span>"));
  if(M && M.envErro) en.appendChild(novo("div", "lista-vazio erro", "Não consegui carregar os envios agora."));
  else if(M && !mostra.length) en.appendChild(novo("div", "lista-vazio", "Nenhum malote enviado ainda."));
  mostra.forEach(function(m){
    var c = malConfEnv(m.id);
    en.appendChild(novo("div", "mal-env", '<span class="q"></span><span class="t"><b>Malote #' + m.id + '</b><small>' +
      escapa(malN(m.qt_guias, "guia", "guias") + (c && c.qt_linhas != null ? " · " + malN(c.qt_linhas, "sessão", "sessões") : "") +
             " · " + malDataHora(m.enviado_em)) + '</small></span>' +
      (c && c.valor_total != null ? '<span class="v">' + fx4Dinheiro(c.valor_total) + '</span>' : '')));
  });
  lado.appendChild(en);
  wrap.appendChild(lado);
  host.appendChild(wrap);
  ajustaAltura();
  var c2 = host.querySelector(".lista-corpo"); if(c2) c2.scrollTop = rolagem;
  if(estado._malPinta) estado._malPinta();
}

/* janela do item: bloco pronto, malote em andamento ou rejeição do SGU */
function abrirMalItem(chave){
  if(!window.moldura) return;
  var atual = chave, modo = null, texto = "", erroTxt = false, aviso = null, copiado = false, ocupado = false, focar = false, esperando = false;
  var P = moldura.pop({ largura: "660px", aoFechar: function(){ estado._malAberta = null; estado._malPinta = null; marca(); } });
  P.rodape.classList.add("fim"); P.rodape.hidden = false;
  P.rodape.appendChild(botao("btn btn-s", "Fechar", function(){ P.fechar(); }));
  function marca(){
    document.querySelectorAll("#gv-conteudo .linha.mal.aberta").forEach(function(x){ x.classList.remove("aberta"); });
    if(estado._malAberta){
      var r = document.querySelector('#gv-conteudo .linha.mal[data-mal="' + CSS.escape(estado._malAberta) + '"]');
      if(r) r.classList.add("aberta");
    }
  }
  function achar(){
    var todos = malItens("prontos").concat(malItens("andamento"), malItens("rejeicoes"));
    for(var i=0;i<todos.length;i++) if(todos[i].chave === atual) return todos[i];
    return null;
  }
  function falha(e){ ocupado = false; aviso = (e && e.message) ? e.message : String(e); if(P.aberto) pinta(); }
  function caixaConfirma(titHtml, txtHtml, rotSim, acao){
    var c = novo("div", "mal-conf");
    c.appendChild(novo("b", "", titHtml));
    c.appendChild(novo("span", "pp-txt", txtHtml));
    var l = novo("div", "mal-conf-bt");
    l.appendChild(botao("btn btn-s", "Cancelar", function(){ if(ocupado) return; modo = null; aviso = null; pinta(); }));
    var s = botao("btn btn-p", rotSim, function(){
      if(ocupado) return;
      ocupado = true; s.disabled = true; s.textContent = "Salvando…";
      acao();
    });
    l.appendChild(s);
    c.appendChild(l);
    return c;
  }
  function copiar(txt, bt){
    var feito = function(){
      copiado = true; bt.textContent = "Copiados: colar no Feegow";
      setTimeout(function(){ copiado = false; if(document.body.contains(bt)) bt.textContent = "Copiar os números"; }, 2400);
    };
    var reserva = function(){
      var ta = document.createElement("textarea");
      ta.value = txt; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.opacity = "0"; ta.style.left = "-9999px";
      document.body.appendChild(ta); ta.select();
      try{ document.execCommand("copy"); }catch(e){}
      ta.remove(); bt.focus(); feito();
    };
    if(navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(feito, reserva);
    else reserva();
  }
  function acoes(titulo, bts){
    var ac = novo("div", "pp-bloco mal-acoes");
    ac.appendChild(novo("span", "pp-rot", titulo));
    var l = novo("div", "pp-adm-bt");
    bts.forEach(function(d){ var bb = botao("btn btn-g " + (d.p ? "btn-p" : "btn-s"), d.rot, d.fn); if(d.dica) bb.title = d.dica; l.appendChild(bb); });
    ac.appendChild(l);
    return ac;
  }
  function pintaBloco(b){
    P.corpo.appendChild(novo("div", "pp-cab", '<span class="pp-quando">Guias 100% conferidas · ordem de faturamento: a data mais velha primeiro</span>' +
      '<h2>' + escapa(malConv(b.convenio_id) + " · Bloco " + b.bloco) + '</h2>' +
      '<span class="pp-l1">' + escapa(malN(b.guias.length, "guia", "guias") + " · datas de " + fx4Data(b.d1) + " a " + fx4Data(b.d2) +
        " · valor esperado " + fx4Dinheiro(b.soma)) + '</span>'));
    P.corpo.appendChild(novo("div", "pp-caixa", '<span class="pp-tag" style="color:#248A3D">Pronto para fechar</span>' +
      '<span class="pp-txt">Copie os números, feche o malote no Feegow com essas guias e assine aqui.</span>'));
    var gb = novo("div", "pp-bloco mal-guias");
    var cab = novo("div", "mal-guias-cab", '<span class="pp-rot">Guias do bloco, da data mais velha para a mais nova</span>');
    var bc = botao("btn btn-s", copiado ? "Copiados: colar no Feegow" : "Copiar os números", function(){ copiar(b.nums.join("\n"), bc); });
    cab.appendChild(bc);
    gb.appendChild(cab);
    var tab = novo("div", "mal-tab");
    b.guias.forEach(function(g, j){
      tab.appendChild(novo("div", "mal-tab-l", '<span class="p">' + (j + 1) + '</span><b>' + escapa(g.numero_guia_prestador) + '</b>' +
        '<span class="nm">' + escapa(g.paciente_nome || "") + '</span><span class="d">' + fx4Data(g.data_mais_antiga) + '</span>' +
        '<span class="v">' + fx4Dinheiro(g.valor_esperado_total) + '</span>'));
    });
    gb.appendChild(tab);
    P.corpo.appendChild(gb);
    if(modo === "fechar"){
      P.corpo.appendChild(caixaConfirma("Assinar o malote fechado?",
        escapa((b.convenio_id === 8 ? "Intercâmbio" : "Local") + " · " + malN(b.nums.length, "guia", "guias")) +
        ". Isso congela a lista: as guias saem da fila e o malote passa a esperar o XML.", "Assinar", function(){
          fx4Rpc("fx4_marcar_fechado", { p_convenio_id: b.convenio_id, p_prestadores: b.nums, p_quem: autora() })
            .then(function(res){
              ocupado = false; modo = null; aviso = null;
              if(res && res.malote_id){ atual = "m:" + res.malote_id; estado.malFiltro = "andamento"; estado._malTopo = true; }
              esperando = true;      /* até o malote novo chegar na lista, a janela fica como está */
              loadMalotes().then(function(){ esperando = false; if(P.aberto && !modo) pinta(); });
            })
            .catch(falha);
        }));
    } else {
      P.corpo.appendChild(acoes("Fechou o malote no Feegow?", [
        { rot: "Malote fechado no Feegow", p: true, dica: "Assinar: congela esta lista e o malote passa a esperar o XML",
          fn: function(){ modo = "fechar"; aviso = null; pinta(); } }
      ]));
    }
  }
  function pintaMalote(m){
    var E = malEst(m.estado), u = estado.malotesUlt[m.id], c = fx4UltConf(m.id);
    var valor = (c && c.valor_total != null) ? fx4Dinheiro(c.valor_total) : "";
    P.corpo.appendChild(novo("div", "pp-cab", '<span class="pp-quando">' +
      escapa((m.criado_por ? "Fechado por " + m.criado_por + " · " : "Fechado em ") + malDia(m.criado_em)) + '</span>' +
      '<h2>' + escapa("Malote #" + m.id + (m.numero_lote ? " · lote " + m.numero_lote : "")) + '</h2>' +
      '<span class="pp-l1">' + escapa(malConv(m.convenio_id) + " · " + malN(m.qt_guias, "guia congelada", "guias congeladas") + (valor ? " · " + valor : "")) + '</span>' +
      (m.arquivo ? '<span class="pp-l2">Último XML: ' + escapa(m.arquivo) + '</span>' : '')));
    var cx = novo("div", "pp-caixa");
    var tg = novo("span", "pp-tag", escapa(E.rot)); tg.style.color = E.cor; cx.appendChild(tg);
    if(E.explica) cx.appendChild(novo("span", "pp-txt", escapa(E.explica)));
    if(u && u.erro) cx.appendChild(novo("span", "pp-txt mal-erro", "<b>Erro na conferência:</b> " + escapa(u.erro)));
    else if(!(u && u.rodando)){
      var fonte = (u && u.veredito) ? u : (c ? { veredito: c.veredito, problemas: c.problemas || [], qt_guias: c.qt_guias, qt_linhas: c.qt_linhas,
        valor_total: c.valor_total, removidas: (c.resumo || {}).removidas, f0_espelhadas: (c.resumo || {}).f0_espelhadas } : null);
      if(fonte && fonte.veredito === "ok"){
        cx.appendChild(novo("span", "pp-txt mal-ok", "<b>Conferência limpa.</b> " +
          escapa(malN(fonte.qt_guias, "guia", "guias") + " · " + malN(fonte.qt_linhas, "sessão", "sessões") + " · " + fx4Dinheiro(fonte.valor_total))));
        if(fonte.removidas && fonte.removidas.length)
          cx.appendChild(novo("span", "pp-txt", "Rejeição registrada: guia " + escapa(fonte.removidas.join(", ")) + " fora do lote. Ela volta para a conferência corrigir."));
        if((fonte.f0_espelhadas | 0) > 0)
          cx.appendChild(novo("span", "pp-txt", escapa(malN(fonte.f0_espelhadas, "linha do faturamento espelhada", "linhas do faturamento espelhadas")) +
            " no que o malote realmente faturou (código, guia, senha e valor)."));
        cx.appendChild(novo("span", "pp-txt", "As sessões já estão <b>em lote</b> no faturamento. Agora é subir no SGU."));
      } else if(fonte){
        var pb = fx4ProbHTML(fonte.problemas || []);
        if(m.estado === "conferido_com_problemas"){ if(pb) cx.appendChild(novo("span", "pp-rot", "O que barrou")); }
        else cx.appendChild(novo("span", "pp-txt mal-erro", "<b>A última conferência barrou.</b> Nada foi gravado."));
        if(pb) cx.appendChild(novo("div", "mal-prob", pb));
      }
    }
    P.corpo.appendChild(cx);
    if(u && u.rodando){
      P.corpo.appendChild(novo("div", "mal-rodando", "Conferindo o XML contra a raiz…"));
    } else if(modo === "enviado"){
      P.corpo.appendChild(caixaConfirma("Confirmar: o SGU aceitou o lote " + escapa(m.numero_lote || "?") + "?",
        "Isso carimba a data de envio e é definitivo. Se o SGU acusou qualquer problema, use Correção antes.", "Confirmar envio", function(){
          fx4Rpc("fx4_marcar_enviado", { p_malote_id: m.id, p_quem: autora() })
            .then(function(){
              delete estado.malotesUlt[m.id];
              ocupado = false; modo = null;
              estado.malFiltro = "prontos"; estado._malTopo = true;
              P.fechar();
              if(typeof toast === "function") toast("Malote #" + m.id + " registrado como enviado ao SGU.", "ok");
              loadMalotes();
            })
            .catch(falha);
        }));
    } else if(modo === "correcao"){
      var cc = novo("div", "mal-conf");
      cc.appendChild(novo("b", "", "Correção pós-SGU"));
      cc.appendChild(novo("span", "pp-l2", "Cole o que o SGU falou (o motivo da rejeição). Guia que sumir do XML novo vira rejeição registrada com este motivo, e a linha volta para a conferência corrigir."));
      var tm = novo("textarea", "pp-nota"); tm.rows = 2; tm.placeholder = "O que o SGU falou"; tm.setAttribute("aria-label", "Motivo do SGU"); tm.value = texto;
      tm.addEventListener("input", function(){
        texto = tm.value;
        if(erroTxt && texto.trim()){ erroTxt = false; var e1 = cc.querySelector(".mal-erro-txt"); if(e1) e1.remove(); }
      });
      cc.appendChild(tm);
      if(erroTxt) cc.appendChild(novo("span", "mal-erro-txt", "Sem o motivo do SGU não dá: é ele que vai para a análise do dono."));
      var lc = novo("div", "mal-conf-bt");
      lc.appendChild(botao("btn btn-s", "Cancelar", function(){ modo = null; texto = ""; erroTxt = false; pinta(); }));
      lc.appendChild(botao("btn btn-p", "Escolher o XML corrigido", function(){
        var obs = texto.trim();
        if(!obs){ erroTxt = true; focar = true; pinta(); return; }
        fx4PedeXML(function(file){ modo = null; texto = ""; erroTxt = false; aviso = null; fx4Conferir(m, file, obs); pinta(); });
      }));
      cc.appendChild(lc);
      P.corpo.appendChild(cc);
      if(focar){ focar = false; setTimeout(function(){ if(document.body.contains(tm)) tm.focus(); }, 0); }
    } else {
      var bts = [];
      if(m.estado !== "conferido_ok") bts.push({ rot: "Conferir o XML do lote", p: true,
        dica: "Baixar o XML no Feegow e subir aqui: a conferência roda na hora, contra a raiz",
        fn: function(){ aviso = null; fx4PedeXML(function(file){ fx4Conferir(m, file, null); pinta(); }); } });
      if(m.estado === "conferido_ok") bts.push({ rot: "Enviado no SGU (aceito)", p: true, dica: "Carimba a data de envio. É definitivo.",
        fn: function(){ modo = "enviado"; aviso = null; pinta(); } });
      if(m.estado === "conferido_ok" || m.estado === "em_correcao" || m.estado === "conferido_com_problemas")
        bts.push({ rot: "Correção (SGU rejeitou guia)", p: false, dica: "Sobe o XML corrigido e o motivo do SGU",
          fn: function(){ modo = "correcao"; texto = ""; erroTxt = false; aviso = null; focar = true; pinta(); } });
      if(bts.length) P.corpo.appendChild(acoes(m.estado === "conferido_ok" ? "O SGU aceitou o lote?" : "Próximo passo", bts));
    }
  }
  function pintaRej(r){
    P.corpo.appendChild(novo("div", "pp-cab", '<span class="pp-quando">' +
      escapa([malDia(r.criada_em), r.autora ? "registrada por " + r.autora : ""].filter(Boolean).join(" · ")) + '</span>' +
      '<h2>' + escapa("Guia " + r.numero_guia_prestador + (r.numero_lote ? " · lote " + r.numero_lote : "")) + '</h2>' +
      (r.paciente_nome ? '<span class="pp-l1">' + escapa(r.paciente_nome) + '</span>' : '') +
      (r.numero_guia_operadora ? '<span class="pp-l2">Guia na operadora: ' + escapa(r.numero_guia_operadora) + '</span>' : '')));
    var cx = novo("div", "pp-caixa");
    var tg = novo("span", "pp-tag", r.tratada ? "Tratada" : "Pendente, análise do dono"); tg.style.color = r.tratada ? "#248A3D" : "#D70015"; cx.appendChild(tg);
    cx.appendChild(novo("span", "pp-txt", "<b>O que o SGU falou:</b> " + escapa(r.motivo_sgu || "—")));
    if(r.tratada){
      var quem = ["Tratada", r.tratada_por ? "por " + r.tratada_por : "", r.tratada_em ? "em " + malDia(r.tratada_em) : ""].filter(Boolean).join(" ");
      cx.appendChild(novo("span", "pp-txt", escapa(quem) + "." + (r.nota_dono ? " <b>Nota do dono:</b> " + escapa(r.nota_dono) : "")));
    }
    P.corpo.appendChild(cx);
    if(r.tratada || !ehDono()) return;
    if(modo === "tratar"){
      var ct = novo("div", "mal-conf");
      ct.appendChild(novo("b", "", "Marcar como tratada"));
      var tn = novo("textarea", "pp-nota"); tn.rows = 2; tn.placeholder = "Nota (opcional)"; tn.setAttribute("aria-label", "Nota do dono"); tn.value = texto;
      tn.addEventListener("input", function(){ texto = tn.value; });
      ct.appendChild(tn);
      var lt = novo("div", "mal-conf-bt");
      lt.appendChild(botao("btn btn-s", "Cancelar", function(){ if(ocupado) return; modo = null; texto = ""; aviso = null; pinta(); }));
      var st = botao("btn btn-p", "Marcar tratada", function(){
        if(ocupado) return;
        ocupado = true; st.disabled = true; st.textContent = "Salvando…";
        fx4Rpc("fx4_tratar_rejeicao", { p_id: r.id, p_quem: autora(), p_nota: texto.trim() || null })
          .then(function(){ ocupado = false; modo = null; texto = ""; aviso = null; loadMalotes(); })
          .catch(falha);
      });
      lt.appendChild(st);
      ct.appendChild(lt);
      P.corpo.appendChild(ct);
      if(focar){ focar = false; setTimeout(function(){ if(document.body.contains(tn)) tn.focus(); }, 0); }
    } else {
      P.corpo.appendChild(acoes("Análise do dono", [
        { rot: "Marcar tratada", p: true, fn: function(){ modo = "tratar"; texto = ""; aviso = null; focar = true; pinta(); } }
      ]));
    }
  }
  function pinta(){
    var it = achar();
    if(!it){ if(!esperando) P.fechar(); return; }
    estado._malAberta = it.chave; marca();
    P.topo.innerHTML = '<span class="pop-titulo-topo">' + (it.b ? "Bloco pronto para fechar" : it.m ? "Malote em andamento" : "Rejeição do SGU") + '</span>';
    P.corpo.innerHTML = "";
    if(it.b) pintaBloco(it.b); else if(it.m) pintaMalote(it.m); else pintaRej(it.r);
    if(aviso) P.corpo.appendChild(novo("div", "pp-salvo erro", ico(IC_ALERTA, 14, 2.2) + '<span>' + escapa(aviso) + '</span>'));
  }
  estado._malPinta = function(){ if(P.aberto && !modo) pinta(); };
  pinta();
}

function trocaTela(t){
  if(t === "dono" && !ehDono()) t = "agenda";
  if(t === "fila"){ t = "agenda"; setTimeout(abrirRenovacoes, 0); }   /* v3.4: Renovações saiu do menu e virou o popup da Agenda */
  estado.tela = t;
  if(window.moldura) moldura.aoTrocarTela(t);      /* cabeçalho primeiro: a tela pode pôr controles nele */
  var abas = document.querySelectorAll("#s-guias .gv-aba");
  for(var i=0;i<abas.length;i++){
    abas[i].classList.toggle("on", abas[i].getAttribute("data-tela") === t);
  }
  var rg = document.getElementById("gv-regua");
  if(rg) rg.style.display = (t === "agenda") ? "" : "none";
  var fx = document.getElementById("gv-faixa");
  if(fx && t !== "agenda") fx.hidden = true;
  if(t === "agenda"){ desenharAgenda(); }      /* a fila do robô só é consultada de 20 em 20 s com o popup aberto */
  else if(t === "cad"){ desenharCad(); loadCad(); }
  else if(t === "excl"){ desenharExcl(); loadExcl(); }
  else if(t === "corte"){ desenharCorte(); loadCorte(); }
  else if(t === "falhas"){ desenharFalhas(); loadFalhas(); }
  else if(t === "malotes"){ desenharMalotes(); loadMalotes(); }
  else if(t === "prof"){ PF.secretaria(); }
  else if(t === "dono"){ desenharAdmin(); }
}
function refreshDonoAba(){
  var el = document.getElementById("gv-aba-dono");
  if(el) el.style.display = ehDono() ? "" : "none";
}
function recarregarTudo(){ carregar(); carregarFila(); loadCad(); loadExcl(); loadCorte(); loadFalhas(); loadMalotes();
  if(estado.tela === "prof" && window.PF && PF.recarregarSec) PF.recarregarSec(); }
function boot(t){
  if(!GV._init){
    GV._init = true;
    var abas = document.querySelectorAll("#s-guias .gv-aba");
    for(var i=0;i<abas.length;i++){
      (function(b){ b.addEventListener("click", function(){ trocaTela(b.getAttribute("data-tela")); }); })(abas[i]);
    }
    /* v3.4: no topo da Agenda, Renovação de validade Unimed (popup grande) e a lupa (busca em janela; tecla /) */
    var rv = document.getElementById("gv-renov");
    if(rv) rv.addEventListener("click", abrirRenovacoes);
    var lu = document.getElementById("gv-lupa");
    if(lu) lu.addEventListener("click", function(){ abrirBusca(""); });
    document.addEventListener("keydown", function(ev){
      if(ev.key !== "/" || ev.ctrlKey || ev.metaKey || ev.altKey) return;
      var a = document.activeElement, tag = a && a.tagName;
      if(tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (a && a.isContentEditable)) return;
      if(typeof CU === "undefined" || !CU) return;
      if(!window.moldura || moldura.atual() !== "agenda" || document.querySelector(".pop")) return;
      ev.preventDefault(); abrirBusca("");
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
         filtroTipo: function(){ return estado.filtroTipo; }, ehDono: ehDono,
         limparFiltroTipo: function(){ estado.filtroTipo = null; agMudou(); },
         abrirRenovacoes: abrirRenovacoes, abrirBusca: abrirBusca };
})();
