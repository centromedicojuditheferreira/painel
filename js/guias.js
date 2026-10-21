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
    avisoFila("Mandei pro robô. O resultado aparece na lista em instantes.", false);
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
  el.textContent = msg;
  el.style.color = ehErro ? "var(--critico)" : "var(--ok)";
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
  /* EXCL v2: a view oc_exclusoes já vem filtrada (sem histórico, sem aprovadas) e traz situacao/cobranca/datas_status */
  return fetch(GCFG.url + "/rest/v1/oc_exclusoes?select=*&order=protegido_em.desc", { headers: cab() })
    .then(function(r){ if(!r.ok) throw new Error("HTTP "+r.status+" — o EXCL_v2_0.sql já rodou?"); return r.json(); })
    .then(function(dados){ estado.excl = dados; estado.exclErro = ""; badgesTopo(); if(estado.tela==="excl") desenharExcl(); })
    .catch(function(e){ estado.exclErro = e.message; if(estado.excl===null) estado.excl = []; badgesTopo(); if(estado.tela==="excl") desenharExcl(); });
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
function exclAberta(x){ return true; } /* EXCL v2: toda linha da view é pendência (sem resposta, aguardando o dono ou negada) */
/* EXCL v2: sem marco — a view só devolve o que ainda espera resposta; aprovada/recriada/voltou some sozinha */
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
  if(exclN) sec.appendChild(cat("Exclusões", "Sessões já realizadas que sumiram do Feegow — resolver na tela de Exclusões", exclN, TOM.r, function(){ irParaTela("excl"); }));
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

/* ═══ 🔁 Renovações — design novo: lista das guias mandadas ao robô + "Resultados do robô" ═══
   Gravações iguais às de antes: enviarFila (POST) e dispensarFila (PATCH) em pre_guias_reconferir. */
var FILA_TXT = {
  aguardando:    { rot:"Na fila do robô", curto:"Na fila do robô", cor:"#636366", sub:"O robô ainda vai olhar", acao:"O robô abre a guia no SGU e confere as duas datas (senha e carteirinha). O resultado aparece na lista em instantes." },
  conferindo:    { rot:"Robô no SGU agora…", curto:"Na fila do robô", cor:"#636366", sub:"O robô ainda vai olhar", acao:"O robô abre a guia no SGU e confere as duas datas (senha e carteirinha). O resultado aparece na lista em instantes." },
  renovada:      { rot:"Validade atualizada", curto:"Atualizadas", cor:"#248A3D", sub:"Já atualizada no sistema: é só ler", acao:"O robô atualizou a validade no sistema. A Agenda do painel atualiza em poucos minutos. É só ler e tirar da tela." },
  sem_mudanca:   { rot:"SGU ainda com a data velha", curto:"Data velha no SGU", cor:"#C93400", sub:"Esperar uns minutos e mandar de novo", acao:"O SGU ainda mostra a data antiga. Se a Unimed confirmou a renovação, aguarde alguns minutos e mande o número de novo." },
  fora_do_banco: { rot:"Guia fora do nosso banco", curto:"Fora do banco", cor:"#636366", sub:"Conferir se o número foi digitado certo", acao:"Essa guia não está no nosso banco. Se for guia nova da Unimed, o coletor captura sozinho. Se for renovação de guia antiga, confira se o número foi digitado certo." },
  erro:          { rot:"Erro ao conferir", curto:"Erro", cor:"#D70015", sub:"Mandar de novo", acao:"O robô não conseguiu conferir. Mande o número de novo." }
};
function filaTxt(s){ return FILA_TXT[s] || { rot:s, curto:s, cor:"#636366", sub:"", acao:"" }; }
function filaChave(l){ return (l.situacao === "aguardando" || l.situacao === "conferindo") ? "fila" : l.situacao; }
function filaFinal(l){ return FILA_FINAIS.indexOf(l.situacao) >= 0; }
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
function filaOrdenada(){
  return (estado.fila || []).slice().sort(function(a, b){
    var fa = filaFinal(a) ? 1 : 0, fb = filaFinal(b) ? 1 : 0;
    if(fa !== fb) return fa - fb;
    return a.criado_em < b.criado_em ? 1 : -1;
  });
}
/* ordem da tela: filtra e agrupa por dia na ordem em que o dia aparece (as que ainda estão na fila vêm primeiro) */
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
  if(l.situacao === "fora_do_banco") return "Essa guia não está no nosso banco. Se for guia nova da Unimed, o coletor captura sozinho; se for renovação de guia antiga, confira se o número foi digitado certo.";
  if(l.situacao === "sem_mudanca") return "O SGU ainda mostra a data antiga: senha até " + dataBr(l.senha_depois) + " · carteirinha até " + dataBr(l.cart_depois) + ". Se a Unimed confirmou a renovação, aguarde alguns minutos e mande de novo.";
  if(l.situacao === "renovada"){
    var f = function(a, b){ return a === b ? "sem mudança (" + dataBr(b) + ")" : dataBr(a) + " → " + dataBr(b); };
    return "Renovou! Senha: " + f(l.senha_antes, l.senha_depois) + " · carteirinha: " + f(l.cart_antes, l.cart_depois) + ". A Agenda do painel atualiza em poucos minutos.";
  }
  if(l.situacao === "conferindo") return "O robô está com a guia aberta no SGU, conferindo as duas datas.";
  if(l.situacao === "erro") return "O robô não conseguiu conferir esta guia.";
  return "O robô ainda vai olhar esta guia.";
}
function filaCampo(){
  /* número da guia + "Mandar pro robô" no cabeçalho (criado uma vez por visita, para não perder o que está sendo digitado) */
  var ac = window.moldura && moldura.acoesDe("renovacoes");
  if(!ac || ac.querySelector("#filaNum")) return;
  var box = novo("div", "fila-envio");
  box.innerHTML =
    '<div class="fila-linha"><label class="busca" for="filaNum">' + ico("M9.5 4 7.5 20M16.5 4l-2 16M4.5 9h15M3.5 15h15", 16, 2) +
    '<input id="filaNum" type="text" inputmode="numeric" autocomplete="off" placeholder="Número da guia (só números)" aria-label="Número da guia"></label>' +
    '<button type="button" class="btn btn-p" id="filaEnviar">Mandar pro robô</button></div>' +
    '<span class="fila-aviso2" id="filaAviso" role="status"></span>';
  ac.appendChild(box);
  var campo = box.querySelector("#filaNum");
  campo.value = estado.filaDraft || "";
  campo.addEventListener("input", function(){ estado.filaDraft = campo.value; });
  campo.addEventListener("keydown", function(ev){ if(ev.key === "Enter") enviarFila(); });
  box.querySelector("#filaEnviar").addEventListener("click", enviarFila);
}
function desenharFila(){
  var main = document.getElementById("gv-conteudo");
  filaCampo();
  var antes = main.querySelector(".lista-corpo");
  var rolagem = antes && !estado._filaTopo ? antes.scrollTop : 0;
  estado._filaTopo = false;
  main.innerHTML = "";
  var todas = filaOrdenada();
  var cont = { todos: todas.length, renovada:0, sem_mudanca:0, fora_do_banco:0, erro:0, fila:0 };
  todas.forEach(function(l){ var k = filaChave(l); cont[k] = (cont[k] || 0) + 1; });
  var nLer = cont.renovada + cont.sem_mudanca + cont.fora_do_banco + cont.erro;
  if(window.moldura) moldura.resumo("renovacoes", estado.fila === null ? "" :
    (nLer === 1 ? "1 resultado para ler" : nLer + " resultados para ler") + " · " +
    (cont.fila === 0 ? "nenhuma guia na fila do robô" : (cont.fila === 1 ? "1 guia na fila do robô" : cont.fila + " guias na fila do robô")));
  var filtro = estado.filaFiltro || "todos";
  var vis = filaEmOrdem(filtro);

  var wrap = novo("div", "duas-col");
  var sec = novo("section", "lista alta"); sec.setAttribute("aria-label", "Guias mandadas ao robô");
  var topo = novo("div", "lista-topo");
  var seg = novo("div", "seg"); seg.setAttribute("role", "group"); seg.setAttribute("aria-label", "Mostrar");
  var defs = [["todos","Todos","#AEAEB2"],["renovada",FILA_TXT.renovada.curto,FILA_TXT.renovada.cor],["sem_mudanca",FILA_TXT.sem_mudanca.curto,FILA_TXT.sem_mudanca.cor],
              ["fora_do_banco",FILA_TXT.fora_do_banco.curto,FILA_TXT.fora_do_banco.cor]];
  if(cont.erro) defs.push(["erro","Erro",FILA_TXT.erro.cor]);
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
  else if(!vis.length) corpo.appendChild(novo("div", "lista-vazio", '<b class="ok">Nada na fila</b><br>Renovou uma guia com a Unimed? Digite o número lá em cima que o robô confere no SGU.'));
  var porDia = {};
  vis.forEach(function(l){ var k = diaRotulo(l.criado_em); (porDia[k] = porDia[k] || []).push(l); });
  var dia = null;
  vis.forEach(function(l){
    var k = diaRotulo(l.criado_em);
    if(dia !== k){ dia = k; corpo.appendChild(novo("div", "dia-cab", '<b>' + escapa(k) + '</b><span>' + (porDia[k].length === 1 ? "1 guia" : porDia[k].length + " guias") + '</span>')); }
    var t = filaTxt(l.situacao);
    var b = botao("linha" + (estado._filaAberta === l.id ? " aberta" : ""),
      '<span class="h">' + escapa(horaDe(l.criado_em)) + '</span>' +
      '<span class="q"><span class="nm">Guia ' + escapa(l.numero_guia) + '</span><span class="mt">' + escapa((l.paciente || "Paciente não identificado") + " · por " + (l.autora || "—")) + '</span></span>' +
      '<span class="dir"><span class="tag" style="color:' + t.cor + '">' + escapa(t.rot) + '</span></span>',
      function(){ abrirFilaItem(l.id, filtro); });
    b.setAttribute("aria-haspopup", "dialog"); b.setAttribute("data-fila", l.id);
    corpo.appendChild(b);
  });
  sec.appendChild(corpo);
  wrap.appendChild(sec);

  var lado = novo("div", "lado");
  var res = novo("section", "painel"); res.setAttribute("aria-labelledby", "res-titulo");
  res.appendChild(novo("div", "painel-cab", '<h2 id="res-titulo">Resultados do robô</h2><span>' + (nLer === 1 ? "1 para ler" : nLer + " para ler") + '</span>'));
  ["fila","renovada","sem_mudanca","fora_do_banco","erro"].forEach(function(k){
    if((k === "fila" || k === "erro") && !cont[k]) return;
    var t = k === "fila" ? FILA_TXT.aguardando : filaTxt(k);
    var b = botao("cat", '<span class="q" style="background:' + t.cor + '"></span><span class="t"><b>' + escapa(k === "fila" ? "Na fila do robô" : t.rot) + '</b><small>' + escapa(t.sub) + '</small></span>' +
      '<span class="n">' + (cont[k] || 0) + '</span>' + ico(IC.dir, 16, 2), function(){ abrirFilaCat(k); });
    b.setAttribute("aria-haspopup", "dialog");
    res.appendChild(b);
  });
  lado.appendChild(res);
  lado.appendChild(novo("section", "painel nota-lado",
    '<h2>Como funciona</h2><p>A Unimed renovou a validade (senha ou carteirinha) de uma guia que <b>já existe</b>? Digite o número lá em cima: o robô abre a guia no SGU, confere as duas datas e atualiza o sistema sozinho.</p>' +
    '<p class="cinza">O resultado aparece na lista. Leu, tire da tela.</p>'));
  wrap.appendChild(lado);
  main.appendChild(wrap);
  ajustaAltura();
  var c2 = main.querySelector(".lista-corpo"); if(c2) c2.scrollTop = rolagem;
}
function abrirFilaCat(k){
  if(!window.moldura) return;
  var P = moldura.pop({ largura:"620px", titulo:"Resultado do robô" });
  var t = k === "fila" ? FILA_TXT.aguardando : filaTxt(k);
  var lista = filaOrdenada().filter(function(l){ return filaChave(l) === k; });
  P.corpo.appendChild(novo("div", "pp-cab", '<span class="pp-alerta" style="color:' + t.cor + '">' + (lista.length === 1 ? "1 guia" : lista.length + " guias") + '</span>' +
    '<h2>' + escapa(k === "fila" ? "Na fila do robô" : t.rot) + '</h2>'));
  P.corpo.appendChild(novo("div", "pp-caixa", '<span class="pp-rot">O que fazer</span><span class="pp-txt">' + escapa(t.acao) + '</span>'));
  var ul = novo("div", "pp-lista");
  lista.forEach(function(l){
    ul.appendChild(botao("pp-linha", '<span class="w">' + escapa(fmtQuando(l.criado_em)) + '</span><span class="q"><b>Guia ' + escapa(l.numero_guia) + '</b><small>' +
      escapa((l.paciente || "Paciente não identificado") + " · por " + (l.autora || "—")) + '</small></span>' + ico(IC.dir, 14, 2),
      function(){ estado.filaFiltro = k; desenharFila(); abrirFilaItem(l.id, k); }));
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
  var P = moldura.pop({ largura:"620px", titulo:"Guia mandada ao robô", aoFechar:function(){ estado._filaAberta = null; marca(); } });
  function lista(){ return filaEmOrdem(filtro); }
  function marca(){
    document.querySelectorAll("#gv-conteudo .linha.aberta").forEach(function(x){ x.classList.remove("aberta"); });
    if(estado._filaAberta){ var r = document.querySelector('#gv-conteudo .linha[data-fila="' + estado._filaAberta + '"]'); if(r) r.classList.add("aberta"); }
  }
  function pinta(){
    var L = lista();
    var i = L.findIndex(function(x){ return x.id === atualId; });
    if(i < 0){ if(!L.length){ P.fechar(); return; } i = 0; atualId = L[0].id; }
    var l = L[i], t = filaTxt(l.situacao);
    estado._filaAberta = l.id; marca();
    P.corpo.innerHTML = "";
    P.corpo.appendChild(novo("div", "pp-cab", '<span class="pp-quando">Mandada por ' + escapa(l.autora || "—") + " · " + escapa(fmtQuando(l.criado_em).replace(" ", " às ")) + '</span>' +
      '<h2>Guia ' + escapa(l.numero_guia) + '</h2><span class="pp-l1"' + (l.paciente ? '' : ' style="color:var(--cinza)"') + '>' + escapa(l.paciente || "Paciente não identificado") + '</span>'));
    var cx = novo("div", "pp-caixa", '<span class="pp-tag" style="color:' + t.cor + '">' + escapa(t.rot) + '</span><span class="pp-txt">' + escapa(filaDetalhe(l)) + '</span>');
    if(l.detalhe) cx.appendChild(novo("span", "pp-txt cinza", escapa(l.detalhe)));
    P.corpo.appendChild(cx);
    if(l.situacao === "renovada" || l.situacao === "sem_mudanca"){
      var g = novo("div", "pp-datas", '<span></span><span class="c">Antes</span><span class="c">No SGU agora</span>');
      [["Senha", l.senha_antes, l.senha_depois], ["Carteirinha", l.cart_antes, l.cart_depois]].forEach(function(d){
        var mudou = d[1] !== d[2];
        g.innerHTML += '<b>' + d[0] + '</b><span class="c">' + dataBr(d[1]) + '</span><span' + (mudou ? ' class="mudou"' : ' class="c"') + '>' + (mudou ? dataBr(d[2]) : "sem mudança") + '</span>';
      });
      P.corpo.appendChild(g);
    }
    P.corpo.appendChild(novo("span", "pp-l2", l.conferida_em ? "Conferida no SGU em " + escapa(fmtQuando(l.conferida_em).replace(" ", " às ")) : "Ainda não conferida"));
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
    bT.disabled = !filaFinal(l); bT.title = filaFinal(l) ? "Li — pode tirar da tela" : "O robô ainda vai olhar";
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
  guia_sem_ficha:       { curto:"Guia sem ficha", titulo:"Guia puxada no SGU sem ficha no Feegow", sub:"Criar ou completar a ficha com a carteirinha",
    acao:"A Unimed autorizou a guia, mas a carteirinha dela não está em nenhuma ficha do Feegow — o sistema não sabe de quem é a guia e não fatura as sessões. Procurar o paciente por CPF ou telefone (pode estar com outro nome); se não existir, criar a ficha com a carteirinha e o convênio indicados. Carteirinha que começa com 0178 é Unimed Local; qualquer outra, Intercâmbio." }
};
var CAD_LIXO = { titulo:"Dado inválido: nunca juntar", sub:"CPF de zeros ou carteirinha 0 e 01 agrupam gente diferente",
  acao:"CPF de zeros ou carteirinha “0” e “01” agrupam gente que não tem nada a ver uma com a outra. Aqui o conserto é buscar o número certo e preencher. Nunca junte essas fichas." };
var TRAT_CAD_ROT = { pendente:"Pendente", corrigido:"Corrigido", estava_certo:"Estava certo", sem_solucao:"Sem solução" };
var IC_ALERTA = "M12 3.5 21.5 20h-19zM12 10v4.5M12 17.2h.01";
function cadTxt(t){ return CAD_TXT[t] || { curto:t, titulo:t, sub:"", acao:"" }; }
var CAD_TIPOS_LISTA = ["convenio_invertido","paciente_duplicado","carteirinha_repetida","guia_sem_ficha"];   /* v2.1: ordem dos filtros e do painel "Problemas" */
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
    if(p.lixo) return '<b>Carteirinha inválida</b> “' + escapa(p.carteirinha || "—") + '”: está assim em ' + p.no_grupo + ' fichas diferentes. <b>Buscar o número real na Unimed e preencher.</b> Não juntar com: ' + lista + '.';
    return 'Mesma carteirinha <b>' + escapa(p.carteirinha || "—") + '</b> em ' + (outros.length === 1 ? 'outra ficha' : 'outras ' + outros.length + ' fichas') + ': ' + lista +
           '. <b>Juntar os cadastros</b>, ou corrigir o número se forem pessoas diferentes.';
  }
  if(p.tipo === "paciente_duplicado"){
    if(p.lixo) return '<b>CPF inválido</b> no cadastro: o mesmo número está em ' + p.no_grupo + ' fichas. <b>Corrigir o CPF do paciente.</b> Não juntar com as outras fichas: são pessoas diferentes.';
    if(String(p.oc_ref || "").indexOf("nn:") === 0) return 'Mesmo nome e nascimento de: ' + lista + '. <b>Conferir e juntar</b>: o agendamento e a guia podem estar caindo em fichas diferentes.';
    return 'Mesmo CPF de: ' + lista + '. <b>Conferir e juntar</b>: se os nomes forem diferentes, o CPF é que está errado em uma delas.';
  }
  if(p.tipo === "guia_sem_ficha"){
    var ds = escapa(p.detalhe || "");
    return ds.replace("Procurar o paciente por CPF ou telefone; se não existir, criar a ficha com essa carteirinha e esse convênio.",
                      "<b>Procurar o paciente por CPF ou telefone; se não existir, criar a ficha com essa carteirinha e esse convênio.</b>");
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
  var cont = { todos: base.length, convenio_invertido:0, paciente_duplicado:0, carteirinha_repetida:0, guia_sem_ficha:0 };
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
  var contT = { convenio_invertido:0, paciente_duplicado:0, carteirinha_repetida:0, guia_sem_ficha:0 };
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

/* ═══ 🗑️ Exclusões — EXCL v2 (21/10/2026): "o passado não se apaga" ═══
   Sessão PASSADA que some do Feegow fica guardada aqui até a recepção resolver:
     · foi engano → remarca (aba "Agendamentos cancelados") ou cria de novo no Feegow;
                    o robô vê a sessão viva e a linha some sozinha (até 30 min)
     · foi certo  → botão "Excluído certo" → o dono aprova ou nega pelo Telegram
   Gravação: salvarOcNota("exclusao", ref, {tratamento, nota}) → oc_notas; o pedido ao
   dono sai por gatilho no banco. Nenhum botão de administrador aqui: a decisão é no Telegram. */
var EXCL_SIT = {
  aberta:     { label:"Sem resposta", cor:"#D70015", sub:"Corrigir no Feegow ou marcar “Excluído certo”",
                acao:"Foi engano? Remarque a sessão no Feegow (aba “Agendamentos cancelados”, no rodapé da agenda) ou crie de novo: a linha some sozinha em até 30 minutos. Era para excluir mesmo? Marque “Excluído certo” — o dono decide pelo Telegram." },
  aguardando: { label:"Aguardando o dono", cor:"#C93400", sub:"A recepção marcou “Excluído certo”",
                acao:"O pedido já está no Telegram do administrador. Aprovado: a sessão sai do sistema e a cobrança é cancelada. Negado: a linha volta para “Sem resposta”." },
  negada:     { label:"Negada pelo dono", cor:"#8E44AD", sub:"O dono não aceitou a exclusão",
                acao:"O administrador negou: a sessão aconteceu ou precisa continuar no sistema. Remarque no Feegow (ou crie de novo) para a linha sair." }
};
function exclSit(x){
  if(x.situacao === "aguardando" || x.situacao === "negada") return x.situacao;
  if(x.aguardando_dono) return "aguardando";
  return "aberta";
}
function exclVisiveis(){
  var q = semAcento(estado.exclBusca || "").trim();
  var f = estado.exclFiltro || "aberta";
  return (estado.excl || []).filter(function(x){
    if(q && semAcento((x.paciente || "") + " " + (x.profissional || "")).indexOf(q) < 0) return false;
    return f === "todas" || exclSit(x) === f;
  });
}
function protegidasRot(iso){ var d = diaRotulo(iso); return "Apagadas " + (d === "Hoje" ? "hoje" : d === "Ontem" ? "ontem" : "em " + d.charAt(0).toLowerCase() + d.slice(1)); }
function sessoesTxt(n){ return n === 1 ? "1 sessão" : n + " sessões"; }
function exclLinha2(x){ return (x.profissional || "—") + " · " + (x.dia_semana || "?") + " às " + (x.horario || "?") + " · " + (x.datas_status || x.datas_fmt || "—"); }
function desenharExcl(){
  var main = document.getElementById("gv-conteudo");
  campoBusca("exclusoes", "exclBusca", "Buscar paciente ou profissional", estado.exclBusca, function(v){ estado.exclBusca = v; estado._exclTopo = true; desenharExcl(); });
  var antes = main.querySelector(".lista-corpo");
  var rolagem = antes && !estado._exclTopo ? antes.scrollTop : 0;
  estado._exclTopo = false;
  main.innerHTML = "";
  var todas = estado.excl || [];
  var abertas = todas.filter(function(x){ return exclSit(x) !== "aguardando"; }).length;
  var agu = todas.filter(function(x){ return exclSit(x) === "aguardando"; }).length;
  if(window.moldura) moldura.resumo("exclusoes", estado.excl === null ? "" :
    (abertas === 1 ? "1 sessão apagada esperando resposta" : abertas + " sessões apagadas esperando resposta") + " · " +
    (agu === 0 ? "nenhuma aguardando o dono" : (agu === 1 ? "1 aguardando o dono" : agu + " aguardando o dono")));
  var q = semAcento(estado.exclBusca || "").trim();
  var base = todas.filter(function(x){ return !q || semAcento((x.paciente || "") + " " + (x.profissional || "")).indexOf(q) >= 0; });
  var cont = { aberta:0, aguardando:0, negada:0, todas: base.length };
  base.forEach(function(x){ cont[exclSit(x)]++; });
  var filtro = estado.exclFiltro || "aberta";
  var vis = exclVisiveis();

  var wrap = novo("div", "duas-col");
  var sec = novo("section", "lista alta"); sec.setAttribute("aria-label", "Sessões apagadas");
  var topo = novo("div", "lista-topo");
  var seg = novo("div", "seg"); seg.setAttribute("role", "group"); seg.setAttribute("aria-label", "Mostrar");
  [["aberta","Sem resposta",EXCL_SIT.aberta.cor],["aguardando","Aguardando o dono",EXCL_SIT.aguardando.cor],["negada","Negadas",EXCL_SIT.negada.cor],["todas","Todas","#AEAEB2"]].forEach(function(d){
    var on = filtro === d[0];
    var b = botao(on ? "on" : "", '<span class="q" style="background:' + d[2] + '"></span>' + d[1] + ' <span class="n">' + cont[d[0]] + '</span>',
      function(){ estado.exclFiltro = d[0]; estado._exclTopo = true; desenharExcl(); });
    b.setAttribute("aria-pressed", on ? "true" : "false");
    seg.appendChild(b);
  });
  topo.appendChild(seg);
  topo.appendChild(novo("span", "mostrando", vis.length === 1 ? "1 linha" : vis.length + " linhas"));
  sec.appendChild(topo);
  var corpo = novo("div", "lista-corpo");
  if(estado.excl === null) corpo.appendChild(novo("div", "lista-vazio", "Buscando as sessões guardadas…"));
  else if(estado.exclErro) corpo.appendChild(novo("div", "lista-vazio erro", "Não consegui ler as exclusões. " + escapa(estado.exclErro)));
  else if(!vis.length) corpo.appendChild(novo("div", "lista-vazio", q ? "<b>Ninguém com esse nome</b><br>Confira a grafia ou limpe a busca." : '<b class="ok">Nada pendente</b><br>Nenhuma sessão apagada nesta situação.'));
  var dia = null, porDia = {};
  vis.forEach(function(x){ var k = protegidasRot(x.protegido_em); porDia[k] = (porDia[k] || 0) + 1; });
  vis.forEach(function(x){
    var k = protegidasRot(x.protegido_em);
    if(dia !== k){ dia = k; corpo.appendChild(novo("div", "dia-cab", '<b>' + escapa(k) + '</b><span>' + (porDia[k] === 1 ? "1 linha" : porDia[k] + " linhas") + '</span>')); }
    var s = exclSit(x), S = EXCL_SIT[s];
    var sub = s === "negada" ? '<span class="tr" style="color:' + EXCL_SIT.negada.cor + ';font-weight:600">Corrija no Feegow</span>' :
              s === "aguardando" && x.pedido_em ? '<span class="tr">Pedido às ' + escapa(horaDe(x.pedido_em)) + '</span>' :
              (x.cobranca ? '<span class="tr">Cobrança: ' + escapa(x.cobranca) + '</span>' : '');
    var b = botao("linha" + (estado._exclAberta === x.oc_ref ? " aberta" : ""),
      '<span class="h">' + escapa(horaDe(x.protegido_em)) + '</span>' +
      '<span class="q"><span class="nm">' + escapa(x.paciente || "—") + '</span><span class="mt">' + escapa(exclLinha2(x)) + '</span></span>' +
      '<span class="dir"><span class="tag" style="color:' + S.cor + '">' + escapa(S.label) + '</span>' + sub + '</span>',
      function(){ abrirExclItem(x.oc_ref, filtro); });
    b.setAttribute("aria-haspopup", "dialog"); b.setAttribute("data-excl", x.oc_ref);
    corpo.appendChild(b);
  });
  sec.appendChild(corpo);
  wrap.appendChild(sec);

  var lado = novo("div", "lado");
  var pn = novo("section", "painel"); pn.setAttribute("aria-labelledby", "excl-sit");
  pn.appendChild(novo("div", "painel-cab", '<h2 id="excl-sit">Situação</h2><span>' + (todas.length === 1 ? "1 linha" : todas.length + " linhas") + '</span>'));
  var contT = { aberta:0, aguardando:0, negada:0 };
  todas.forEach(function(x){ contT[exclSit(x)]++; });
  ["aberta","aguardando","negada"].forEach(function(k){
    var S = EXCL_SIT[k];
    var b = botao("cat", '<span class="q" style="background:' + S.cor + '"></span><span class="t"><b>' + S.label + '</b><small>' + escapa(S.sub) + '</small></span><span class="n">' + contT[k] + '</span>' + ico(IC.dir, 16, 2),
      function(){ abrirExclCat(k); });
    b.setAttribute("aria-haspopup", "dialog");
    pn.appendChild(b);
  });
  lado.appendChild(pn);
  lado.appendChild(novo("section", "painel nota-lado",
    '<h2>Regra da casa</h2><p>Para excluir uma série no Feegow, <b>clique na PRÓXIMA sessão</b> (uma que ainda vai acontecer) antes de escolher “excluir os posteriores”. Nunca comece por uma sessão que já passou.</p>' +
    '<p>Sessão que já aconteceu e some do Feegow <b>não se apaga</b>: o robô guarda e ela aparece aqui. Enquanto estiver aqui, fica fora do recibo do profissional e a cobrança fica presa.</p>' +
    '<p class="cinza">Foi engano: remarque ou crie de novo no Feegow, e a linha some sozinha. Foi certo: marque “Excluído certo” — só o administrador aprova, pelo Telegram.</p>'));
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
  var P = moldura.pop({ largura:"640px", titulo:"Sessões apagadas" });
  P.corpo.appendChild(novo("div", "pp-cab", '<span class="pp-alerta" style="color:' + S.cor + '">' + (lista.length === 1 ? "1 linha" : lista.length + " linhas") + '</span><h2>' + S.label + '</h2>'));
  P.corpo.appendChild(novo("div", "pp-caixa", '<span class="pp-rot">O que fazer</span><span class="pp-txt">' + escapa(S.acao) + '</span>'));
  var ul = novo("div", "pp-lista");
  lista.forEach(function(x){
    ul.appendChild(botao("pp-linha", '<span class="w">' + escapa(fmtQuando(x.protegido_em)) + '</span><span class="q"><b>' + escapa(x.paciente || "—") + '</b><small>' +
      escapa(exclLinha2(x)) + '</small></span>' + ico(IC.dir, 14, 2),
      function(){ estado.exclFiltro = k; estado.exclBusca = ""; var i = document.getElementById("exclBusca"); if(i) i.value = ""; desenharExcl(); abrirExclItem(x.oc_ref, k); }));
  });
  if(!lista.length) ul.appendChild(novo("div", "lista-vazio", "Nenhuma linha nesta situação agora."));
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
  var P = moldura.pop({ largura:"640px", titulo:"Sessão apagada no Feegow", aoFechar:function(){ estado._exclAberta = null; estado._exclPinta = null; marca(); } });
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
    var s = exclSit(x), S = EXCL_SIT[s];
    var tratAtual = s === "aguardando" ? "estava_certo" : "pendente";
    P.corpo.innerHTML = "";
    var tags = s === "negada" ? '<span class="etqs"><span class="etq vermelho" title="O administrador negou a exclusão pelo Telegram">O dono negou — corrija no Feegow' + (x.negada_em ? ' (' + escapa(fmtQuando(x.negada_em)) + ')' : '') + '</span></span>' : "";
    P.corpo.appendChild(novo("div", "pp-cab", '<span class="pp-quando">Apagada do Feegow · vista em ' + escapa(fmtQuando(x.protegido_em).replace(" ", " às ")) + '</span>' +
      '<h2>' + escapa(x.paciente || "—") + '</h2><span class="pp-l1">' + escapa((x.profissional || "—") + " · toda " + (x.dia_semana || "?") + " às " + (x.horario || "?") + (x.procedimento ? " · " + x.procedimento : "") + (x.convenio ? " · " + x.convenio : "")) + '</span>' + tags));
    P.corpo.appendChild(novo("div", "pp-caixa",
      '<span class="pp-tag" style="color:' + S.cor + '">' + escapa(S.label) + '</span>' +
      '<span class="pp-txt"><b>' + escapa(sessoesTxt(x.n_sessoes)) + '</b> · ' + escapa(x.datas_status || x.datas_fmt || "—") + '</span>' +
      '<span class="pp-txt">Cobrança: ' + escapa(x.cobranca || "—") + '</span>' +
      '<span class="pp-txt cinza">Guardada pelo robô: continua no sistema até a recepção resolver. Enquanto estiver aqui, fica fora do recibo do profissional.</span>'));
    P.corpo.appendChild(novo("div", "pp-bloco", '<span class="pp-rot">O que fazer</span><span class="pp-txt">' + escapa(S.acao) + '</span>'));
    var notaEl = novo("textarea", "pp-nota");
    var bn = novo("div", "pp-bloco", '<label class="pp-rot" for="nota-excl">Anotação</label>');
    notaEl.id = "nota-excl"; notaEl.rows = 2; notaEl.placeholder = "Por que foi excluída, com quem confirmou…"; notaEl.value = x.nota || "";
    notaEl.addEventListener("change", function(){
      var v = notaEl.value.trim(); if(v === (x.nota || "")) return;
      clearTimeout(notaTimer); notaTimer = setTimeout(function(){ salva(x, { tratamento: tratAtual, nota: v }); }, 220);
    });
    bn.appendChild(notaEl);
    P.corpo.appendChild(bn);
    var bt = novo("div", "pp-bloco", '<span class="pp-rot">Foi excluída de propósito?</span>');
    var linhaB = novo("div", "pp-adm-bt");
    if(s === "aguardando"){
      var bEsp = botao("btn btn-s", "Pedido enviado ao dono" + (x.pedido_em ? " · " + escapa(fmtQuando(x.pedido_em)) : ""), null);
      bEsp.disabled = true;
      linhaB.appendChild(bEsp);
    } else {
      var bOk = botao("btn btn-p", "Excluído certo", function(){
        clearTimeout(notaTimer);
        if(!confirm("Confirmar: a sessão de " + (x.paciente || "—") + " (" + (x.datas_fmt || "") + ") foi excluída de propósito?\n\nO administrador vai receber o pedido no Telegram e decidir. Até lá a linha fica em “Aguardando o dono”.")) return;
        salva(x, { tratamento: "estava_certo", nota: notaEl.value.trim() });
      });
      bOk.title = "Manda o pedido de aprovação para o Telegram do administrador";
      linhaB.appendChild(bOk);
    }
    bt.appendChild(linhaB);
    P.corpo.appendChild(bt);
    var est = msgId === x.oc_ref ? msg : null, txt, cor;
    if(est === "salvando"){ txt = "Salvando…"; cor = "#AEAEB2"; }
    else if(est === "ok"){ txt = "Salvo agora · por " + (autora() || "você"); cor = "#248A3D"; }
    else if(est === "erro"){ txt = "Não consegui salvar. Confira a internet e tente de novo."; cor = "#D70015"; }
    else { txt = (s === "aguardando" || x.nota) ? "Registrado antes" + (x.autora ? " por " + x.autora : "") + "." : "A anotação salva sozinha ao sair do campo"; cor = "#AEAEB2"; }
    var sv = novo("div", "pp-salvo", ico(IC.ok, 14, 2.2, cor) + '<span' + (est === "erro" ? ' style="color:#D70015"' : '') + '>' + escapa(txt) + '</span>');
    sv.setAttribute("aria-live", "polite");
    P.corpo.appendChild(sv);
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
        x.tratamento = campos.tratamento; x.nota = campos.nota; x.autora = autora();
        if(campos.tratamento === "estava_certo"){
          x.aguardando_dono = true; x.situacao = "aguardando";
          x.pedido_em = x.pedido_em || new Date().toISOString(); x.pedido_por = autora();
        }
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
  l.push("🗑️ Exclusões: " + exT + " (" + (exT - exG) + " sem resposta · " + exG + " aguardando sua aprovação no Telegram)");
  var rc = rankTxt(rankQuemCriouObj()); if(rc) l.push("👤 Vermelhas por quem marcou: " + rc);
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
        '<div class="adm-card '+(exA?'vermelho':'verde')+'"><div class="num">'+exA+'</div><div class="rot">exclusões sem resposta</div></div>'+
        '<div class="adm-card '+(aguard.length?'ambar':'verde')+'"><div class="num">'+aguard.length+'</div><div class="rot">aguardando aprovação</div></div>'+
        '<div class="adm-card"><div class="num">'+(P.porEsp.psicologia||0)+'·'+(P.porEsp.aba||0)+'·'+(P.porEsp.nutricao||0)+'</div><div class="rot">psico · aba · nutrição</div></div>'+
      '</div>';

      if(aguard.length){
        h += '<div class="adm-sec">👑 Aguardando a sua aprovação <small>(a recepção marcou "Excluído certo" · aprove ou negue pelo Telegram)</small></div>';
        h += '<table class="adm"><tr><th>Paciente</th><th>Profissional</th><th>Quando</th><th>Sessões</th><th>Cobrança</th><th>Quem marcou</th></tr>';
        aguard.forEach(function(x){
          h += '<tr><td><b>'+escapa(x.paciente)+'</b></td><td>'+escapa(x.profissional||"—")+'</td>'+
               '<td>'+escapa(x.dia_semana||"?")+' às '+escapa(x.horario||"?")+'</td>'+
               '<td>'+x.n_sessoes+'<br><small>'+escapa(x.datas_status||x.datas_fmt||"")+'</small></td>'+
               '<td><small>'+escapa(x.cobranca||"—")+'</small></td>'+
               '<td>'+escapa(x.autora||"—")+(x.nota?'<br><small>'+escapa(x.nota)+'</small>':'')+'</td></tr>';
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

      var rk7 = respostas7Obj(notas7), rk7k = Object.keys(rk7).sort(function(a,b){ return rk7[b]-rk7[a]; });
      h += '<div class="adm-sec">✍️ Respostas registradas <small>(últimos 7 dias · agenda + cadastros + exclusões, por pessoa)</small></div>';
      if(!rk7k.length){ h += '<div class="adm-vazio" style="background:var(--info-fundo);color:var(--info)">Ninguém registrou resposta nos últimos 7 dias.</div>'; }
      else {
        h += '<table class="adm"><tr><th>Pessoa</th><th>Respostas</th></tr>';
        rk7k.forEach(function(k){ h += '<tr><td><b>'+escapa(k)+'</b></td><td>'+rk7[k]+'</td></tr>'; });
        h += '</table>';
      }
      main.innerHTML = h;
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

/* ── 📵 tela — design novo: mensagens que o robô não entregou ──
   Não grava nada: copia o número e a mensagem pronta (textoFalha, igual antes). */
var FALHA_TXT = {
  falhou:      { label:"Envio falhou", cor:"#C93400", sub:"Mandar na mão pela plataforma",
                 acao:"Copiar o número, achar a conversa na plataforma, copiar a mensagem pronta e enviar. Ninguém sai da agenda sem ter sido avisado." },
  sem_celular: { label:"Sem celular", cor:"#D70015", sub:"Completar o cadastro no Feegow primeiro",
                 acao:"O cadastro não tem celular. Completar no Feegow antes de qualquer coisa; depois mandar a mensagem pronta." }
};
function falhaSit(f){ return f.status_envio === "SEM CELULAR" ? "sem_celular" : "falhou"; }
function tipoMsgRot(t){ return t === "lembrete" ? "Lembrete" : "Confirmação"; }
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
    var x = String(a.data_atendimento || "") + String(a.horario || ""), y = String(b.data_atendimento || "") + String(b.horario || "");
    return x < y ? -1 : x > y ? 1 : 0;
  });
}
function falhaVisiveis(){
  var q = semAcento(estado.falhaBusca || "").trim(), f = estado.falhaFiltro || "todos";
  return falhaOrdenada().filter(function(x){
    if(q && semAcento(x.nome_paciente || "").indexOf(q) < 0) return false;
    return f === "todos" || falhaSit(x) === f;
  });
}
function desenharFalhas(){
  var main = document.getElementById("gv-conteudo"); if(!main) return;
  campoBusca("falhas", "falhaBusca", "Buscar paciente", estado.falhaBusca, function(v){ estado.falhaBusca = v; estado._falhaTopo = true; desenharFalhas(); });
  var antes = main.querySelector(".lista-corpo");
  var rolagem = antes && !estado._falhaTopo ? antes.scrollTop : 0;
  estado._falhaTopo = false;
  main.innerHTML = "";
  var todas = estado.falhas || [];
  var semCel = todas.filter(function(x){ return falhaSit(x) === "sem_celular"; }).length;
  if(window.moldura) moldura.resumo("falhas", estado.falhas === null ? "" :
    (todas.length === 1 ? "1 mensagem que o robô não entregou" : todas.length + " mensagens que o robô não entregou") + " · " +
    (semCel === 1 ? "1 paciente sem celular" : semCel + " pacientes sem celular") + " · consultas de hoje em diante");
  var q = semAcento(estado.falhaBusca || "").trim();
  var base = todas.filter(function(x){ return !q || semAcento(x.nome_paciente || "").indexOf(q) >= 0; });
  var cont = { todos: base.length, falhou:0, sem_celular:0 };
  base.forEach(function(x){ cont[falhaSit(x)]++; });
  var filtro = estado.falhaFiltro || "todos";
  var vis = falhaVisiveis();

  var wrap = novo("div", "duas-col");
  var sec = novo("section", "lista alta"); sec.setAttribute("aria-label", "Mensagens não entregues");
  var topo = novo("div", "lista-topo");
  var seg = novo("div", "seg"); seg.setAttribute("role", "group"); seg.setAttribute("aria-label", "Mostrar");
  [["todos","Todas","#AEAEB2"],["falhou","Envio falhou",FALHA_TXT.falhou.cor],["sem_celular","Sem celular",FALHA_TXT.sem_celular.cor]].forEach(function(d){
    var on = filtro === d[0];
    var b = botao(on ? "on" : "", '<span class="q" style="background:' + d[2] + '"></span>' + d[1] + ' <span class="n">' + cont[d[0]] + '</span>',
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
  else if(!vis.length) corpo.appendChild(novo("div", "lista-vazio", q ? "<b>Ninguém com esse nome</b><br>Confira a grafia ou limpe a busca." : '<b class="ok">Nenhuma falha</b><br>Todas as mensagens do período chegaram.'));
  var dia = null, porDia = {};
  vis.forEach(function(x){ porDia[x.data_atendimento] = (porDia[x.data_atendimento] || 0) + 1; });
  vis.forEach(function(x){
    if(dia !== x.data_atendimento){
      dia = x.data_atendimento;
      corpo.appendChild(novo("div", "dia-cab", '<b>Consultas de ' + escapa(diaConsulta(x.data_atendimento)) + '</b><span>' + (porDia[dia] === 1 ? "1 mensagem" : porDia[dia] + " mensagens") + '</span>'));
    }
    var S = FALHA_TXT[falhaSit(x)];
    var b = botao("linha" + (estado._falhaAberta === x.agendamento_id + x.tipo ? " aberta" : ""),
      '<span class="h">' + escapa(x.horario || "—") + '</span>' +
      '<span class="q"><span class="nm">' + escapa(x.nome_paciente || ("ID:" + x.paciente_id)) + '</span><span class="mt">' +
      escapa((x.profissional || "—") + " · " + tipoMsgRot(x.tipo) + (x.situacao ? " · guia: " + String(x.situacao).toLowerCase() : "")) + '</span></span>' +
      '<span class="dir"><span class="tag" style="color:' + S.cor + '">' + S.label + '</span>' +
      (x.ultima_tentativa ? '<span class="tr">tentou ' + escapa(fmtQuando(x.ultima_tentativa).replace(" ", " às ")) + '</span>' : '') + '</span>',
      function(){ abrirFalhaItem(x.agendamento_id + x.tipo); });
    b.setAttribute("aria-haspopup", "dialog"); b.setAttribute("data-falha", x.agendamento_id + x.tipo);
    corpo.appendChild(b);
  });
  sec.appendChild(corpo);
  wrap.appendChild(sec);

  var lado = novo("div", "lado");
  var pn = novo("section", "painel"); pn.setAttribute("aria-labelledby", "falha-sit");
  pn.appendChild(novo("div", "painel-cab", '<h2 id="falha-sit">Situação</h2><span>' + (todas.length === 1 ? "1 mensagem" : todas.length + " mensagens") + '</span>'));
  var contT = { falhou:0, sem_celular:0 };
  todas.forEach(function(x){ contT[falhaSit(x)]++; });
  ["falhou","sem_celular"].forEach(function(k){
    var S = FALHA_TXT[k];
    var b = botao("cat", '<span class="q" style="background:' + S.cor + '"></span><span class="t"><b>' + S.label + '</b><small>' + escapa(S.sub) + '</small></span><span class="n">' + contT[k] + '</span>' + ico(IC.dir, 16, 2),
      function(){ abrirFalhaCat(k); });
    b.setAttribute("aria-haspopup", "dialog");
    pn.appendChild(b);
  });
  lado.appendChild(pn);
  lado.appendChild(novo("section", "painel nota-lado",
    '<h2>Regra da casa</h2><p>São as mensagens que o robô <b>não conseguiu entregar</b>, de consultas de hoje em diante.</p>' +
    '<p><b>Ninguém sai da agenda sem ter sido avisado</b>: a recepção manda na mão. Copiar o número, achar a conversa na plataforma, copiar a mensagem pronta e enviar.</p>' +
    '<p class="cinza">Sem celular: completar o cadastro no Feegow primeiro.</p>'));
  wrap.appendChild(lado);
  main.appendChild(wrap);
  ajustaAltura();
  var c2 = main.querySelector(".lista-corpo"); if(c2) c2.scrollTop = rolagem;
}
function abrirFalhaCat(k){
  if(!window.moldura) return;
  var S = FALHA_TXT[k];
  var lista = (estado.falhas || []).filter(function(x){ return falhaSit(x) === k; });
  var P = moldura.pop({ largura:"640px", titulo:"Mensagens não entregues" });
  P.corpo.appendChild(novo("div", "pp-cab", '<span class="pp-alerta" style="color:' + S.cor + '">' + (lista.length === 1 ? "1 mensagem" : lista.length + " mensagens") + '</span><h2>' + S.label + '</h2>'));
  P.corpo.appendChild(novo("div", "pp-caixa", '<span class="pp-rot">O que fazer</span><span class="pp-txt">' + escapa(S.acao) + '</span>'));
  var ul = novo("div", "pp-lista");
  lista.forEach(function(x){
    ul.appendChild(botao("pp-linha", '<span class="w">' + escapa(String(x.data_fmt || "").slice(0,5) + " " + (x.horario || "")) + '</span><span class="q"><b>' + escapa(x.nome_paciente || "—") + '</b><small>' +
      escapa((x.profissional || "—") + " · " + tipoMsgRot(x.tipo)) + '</small></span>' + ico(IC.dir, 14, 2),
      function(){ estado.falhaFiltro = k; estado.falhaBusca = ""; var i = document.getElementById("falhaBusca"); if(i) i.value = ""; desenharFalhas(); abrirFalhaItem(x.agendamento_id + x.tipo); }));
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
  var P = moldura.pop({ largura:"640px", titulo:"Mensagem não entregue", aoFechar:function(){ estado._falhaAberta = null; marca(); } });
  function k(x){ return x.agendamento_id + x.tipo; }
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
    var s = falhaSit(x), S = FALHA_TXT[s];
    P.corpo.innerHTML = "";
    P.corpo.appendChild(novo("div", "pp-cab", '<span class="pp-quando">Consulta de ' + escapa(diaConsulta(x.data_atendimento)) + " às " + escapa(x.horario || "—") + '</span>' +
      '<h2>' + escapa(x.nome_paciente || ("ID:" + x.paciente_id)) + '</h2><span class="pp-l1">' + escapa((x.profissional || "—") + (x.especialidade ? " · " + x.especialidade : "")) + '</span>'));
    P.corpo.appendChild(novo("div", "pp-caixa",
      '<span class="pp-tag" style="color:' + S.cor + '">' + S.label + '</span>' +
      '<span class="pp-txt">Mensagem de ' + tipoMsgRot(x.tipo).toLowerCase() + ' · falha: ' + escapa(String(x.status_envio || "").toLowerCase()) +
      (x.erro_detalhe ? ' (' + escapa(String(x.erro_detalhe).slice(0, 80).toLowerCase()) + ')' : '') + '</span>' +
      (x.ultima_tentativa ? '<span class="pp-l2">Última tentativa ' + escapa(fmtQuando(x.ultima_tentativa).replace(" ", " às ")) + '</span>' : '') +
      (s === "sem_celular" ? '<span class="pp-txt" style="color:#D70015"><b>Cadastro sem celular:</b> completar no Feegow antes de qualquer coisa.</span>' : '')));
    var cel = primeiroCelular(x.celulares_raw, x.telefones_raw);
    if(cel){
      var dig = foneDigitos(cel);
      var fone = novo("div", "pp-fone", '<span><small>Celular</small><b>' + escapa(foneBonito(cel)) + '</b></span>');
      var bc = botao("btn btn-s btn-sm", "Copiar", function(){ copia(dig, bc, "Copiado", "Copiar"); });
      bc.title = "Copiar o número (só dígitos, sem o 55): é assim que a busca da plataforma acha";
      fone.appendChild(bc);
      P.corpo.appendChild(fone);
    }
    var txt = textoFalha(x);
    var bm = novo("div", "pp-bloco");
    var cab = novo("div", "pp-msg-cab", '<span class="pp-rot">Mensagem pronta · ' + tipoMsgRot(x.tipo).toLowerCase() + '</span>');
    var bmsg = botao("btn btn-p btn-sm", "Copiar a mensagem", function(){ copia(txt, bmsg, "Copiada: é só colar na conversa", "Copiar a mensagem"); });
    bmsg.title = "O texto do padrão novo, com os dados deste paciente preenchidos";
    cab.appendChild(bmsg);
    bm.appendChild(cab);
    bm.appendChild(novo("div", "pp-msg", escapa(txt)));
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
