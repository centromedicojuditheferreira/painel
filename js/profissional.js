/* ── modo do login (Administração/Secretaria × Profissional) ── */
var LO_MODO = 'adm';
function loModo(m){
  LO_MODO = m;
  var ba = document.getElementById('lo-modo-adm'), bp = document.getElementById('lo-modo-prof');
  if(ba) ba.classList.toggle('on', m === 'adm');
  if(bp) bp.classList.toggle('on', m === 'prof');
  var pin = document.getElementById('lo-pin'), ul = document.getElementById('lo-usr-lbl'), pl = document.getElementById('lo-pin-lbl');
  var err = document.getElementById('lo-err'); if(err) err.style.display = 'none';
  var hint = document.querySelector('#lo .lo-hint'); if(hint) hint.style.display = (m === 'prof') ? 'none' : '';
  if(pin) pin.value = '';
  if(m === 'prof'){
    if(ul) ul.textContent = 'Profissional';
    if(pl) pl.textContent = 'Senha';
    if(pin){ pin.removeAttribute('maxlength'); pin.removeAttribute('inputmode'); pin.placeholder = 'sua senha'; }
    PF.loginLista();
  } else {
    if(ul) ul.textContent = 'Secretaria';
    if(pl) pl.textContent = 'PIN';
    if(pin){ pin.setAttribute('maxlength','8'); pin.setAttribute('inputmode','numeric'); pin.placeholder = '****'; }
    loadLoginUsers();
  }
}

var PF = (function(){
"use strict";
/* conexão: o mesmo projeto e a mesma chave publicável do módulo GV */
var PCFG = { url: "https://xcucoryngkkuszztpxyq.supabase.co", key: "sb_publishable_6ATQUvqBBRS5xx7jAYKlmw_2FwTuHG7" };
var FOTO_LADO_MAX = 900, FOTO_QUALIDADE = 0.72, FOTO_CAMERA = 'user';  /* 'user' = selfie · 'environment' = câmera de trás */

var DIAS = ['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'];
var TIPOS = {
  foi_atendido:'O paciente foi atendido', nao_compareceu:'O paciente faltou',
  desmarcou_antes:'O paciente desmarcou antes', cancelei_eu:'Eu cancelei / não atendi',
  horario_errado:'O horário está errado', paciente_errado:'O paciente está errado',
  convenio_errado:'O convênio está errado', outro:'Outra coisa (explique)'
};
var MSG = {
  SENHA_INVALIDA:'Senha incorreta.', BLOQUEADO_TEMPORARIAMENTE:'Muitas tentativas. Aguarde 15 minutos e tente de novo.',
  PAPEL_ERRADO:'Este acesso não é de profissional.', DETALHE_OBRIGATORIO:'Explique o que está errado no campo de detalhe.',
  AGENDAMENTO_NAO_E_SEU:'Esta consulta não está na sua agenda.',
  SEMANA_FECHADA:'Este período já encerrou e seguiu para o faturamento. Fale com a recepção.',
  FOTO_OBRIGATORIA:'A confirmação exige o registro fotográfico.', FOTO_GRANDE:'A foto ficou grande demais. Tente novamente.',
  FOTO_INVALIDA:'Não foi possível ler a foto. Tente de novo.', SEM_FOTO:'Esta confirmação não tem foto.',
  SENHA_CURTA:'Senha muito curta.', TELEFONE_INVALIDO:'Telefone inválido — DDD + número, só dígitos.',
  PROFISSIONAL_NAO_EXISTE:'Este profissional não existe no Feegow.', ADMIN_JA_EXISTE:'A senha de administração já foi definida.',
  HORA_INVALIDA:'Hora inválida — use HH:MM.', DIA_INVALIDO:'Dia inválido.', PERIODO_INVERTIDO:'A data inicial é depois da final.', PERIODO_INCOMPLETO:'Preencha as duas datas.',
  AINDA_NAO_ABRIU:'A conferência deste período ainda não foi liberada.', SEM_RECIBO:'Ainda não há recibo gerado para este mês.', SEM_REGIME:'Este profissional ainda não tem regime definido.', REGIME_INVALIDO:'Regime inválido.', JA_CONFIRMADA:'Este período já foi confirmado. A próxima conferência será liberada na data indicada.',
  SEM_ACESSO:'Este profissional ainda não tem acesso — o administrador cria no ⚙️.',
  CONVITE_INVALIDO:'Este link de acesso não é válido ou já foi usado. Se você já escolheu a sua senha, entre com o seu nome e a senha; se não, peça um novo link à recepção.',
  CONVITE_EXPIRADO:'Este link de acesso venceu. Peça um novo link à recepção.',
  CONVITE_USADO:'Este link já foi usado. Entre com o seu nome e a senha que você escolheu.'
};
var sess = { id:null, senha:null, nome:null, semanas:[], semana:null, fotoObrigatoria:true };
var secr = { senha:null, semana:null, semanas:[] };
var adm  = { senha:null, dados:null, filtro:'' };
function painelAdmin(){ return (typeof CU !== 'undefined' && CU && CU.admin === true); }
var semanaAtual = null, relogioOffset = 0, contadorTimer = null, previaAtual = null;

function $(s, el){ return (el || document).querySelector(s); }
function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
function humano(e){ return MSG[e.message] || ('Não deu certo: ' + e.message); }
function dLocal(s){ var p = s.split('-').map(Number); return new Date(p[0], p[1]-1, p[2]); }
function ddmm(s){ var d = dLocal(s); return String(d.getDate()).padStart(2,'0') + '/' + String(d.getMonth()+1).padStart(2,'0'); }
function hhmm(t){ return (t || '').slice(0,5); }
function mesNome(s){ return ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'][dLocal(s).getMonth()]; }
function fmtTs(iso){ return iso ? new Date(iso).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}) : ''; }
function fmtDiaHora(iso){
  var d = new Date(iso);
  var dia = d.toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo',weekday:'long',day:'2-digit',month:'2-digit'});
  var h = d.toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit'}).replace(':00','h');
  return dia + ', às ' + h;
}
function agora(){ return Date.now() + relogioOffset; }
function brl(v){ return 'R$ ' + (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function dmy(d){ if(!d) return ''; var p = String(d).slice(0,10).split('-'); return p[2] + '/' + p[1] + '/' + p[0]; }
function pedidoAberto(it){ return it.pedido_id && it.pedido_situacao === 'aberto'; }

function rpc(fn, args){
  return fetch(PCFG.url + '/rest/v1/rpc/' + fn, {
    method:'POST',
    headers:{ 'Content-Type':'application/json', 'apikey':PCFG.key, 'Authorization':'Bearer ' + PCFG.key },
    body: JSON.stringify(args || {})
  }).then(function(r){
    return r.text().then(function(t){
      var j = null; try{ j = JSON.parse(t); }catch(e){}
      if(!r.ok) throw new Error((j && (j.message || j.hint || j.details)) || ('HTTP ' + r.status));
      if(j && j.ok === false) throw new Error(j.erro || 'ERRO');
      return j;
    });
  });
}

/* ═══ modal genérico (usa as classes .mo/.mb do painel) ═══ */
function modal(tituloHtml, corpoHtml, rodapeHtml){
  var bg = document.createElement('div'); bg.className = 'mo'; bg.style.display = 'flex';
  bg.innerHTML = '<div class="mb"><div class="mh"><h3>' + tituloHtml + '</h3><button type="button" class="btn btn-s btn-sm" data-x>X</button></div>' +
                 '<div class="mbody">' + corpoHtml + '</div>' + (rodapeHtml ? '<div class="mf">' + rodapeHtml + '</div>' : '') + '</div>';
  document.body.appendChild(bg);
  var fecha = function(){ if(bg.parentNode) bg.parentNode.removeChild(bg); };
  bg.addEventListener('click', function(e){ if(e.target === bg) fecha(); });
  bg.querySelector('[data-x]').onclick = fecha;
  return { el: bg, fecha: fecha };
}
function erroEm(el, txt){ el.textContent = txt; el.style.display = 'block'; }

/* ═══ LOGIN (dentro da tela de login do painel) ═══ */
function loginLista(){
  var sel = document.getElementById('lo-usr'); if(!sel) return;
  sel.innerHTML = '<option value="">carregando…</option>';
  rpc('prof_acessos_lista').then(function(lista){
    var profs = (lista || []).filter(function(p){ return p.papel === 'profissional'; });
    sel.innerHTML = '<option value="">escolha seu nome</option>' + profs.map(function(p){
      return '<option value="' + p.profissional_id + '">' + esc(p.nome) + '</option>'; }).join('');
    if(!profs.length) sel.innerHTML = '<option value="">nenhum profissional cadastrado ainda</option>';
  }).catch(function(e){
    sel.innerHTML = '<option value="">não foi possível carregar</option>';
    var err = document.getElementById('lo-err'); if(err) erroEm(err, 'Sem conexão com o sistema. ' + e.message);
  });
}
function entrarCom(id, senha){
  return rpc('prof_entrar', { p_profissional_id: Number(id), p_senha: senha }).then(function(r){
    relogioOffset = new Date(r.agora).getTime() - Date.now();
    sess.id = r.profissional_id; sess.senha = senha; sess.nome = r.nome; sess.semanas = r.semanas; sess.semana = r.semana_inicio;
    sess.fotoObrigatoria = r.foto_obrigatoria !== false;
    sess.horaPrazo = new Date(r.prazo).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit'}).replace(':00','h');
    var hp = document.getElementById('pf-hora-prazo'); if(hp) hp.textContent = sess.horaPrazo;
    document.getElementById('lo').style.display = 'none';
    document.getElementById('prof-view').style.display = 'block';
    document.getElementById('pf-nome').textContent = r.nome;
    document.getElementById('lo-pin').value = '';
    return carregaSemana(sess.semana);
  });
}
function entrarPeloLogin(){
  var v = document.getElementById('lo-usr').value, senha = document.getElementById('lo-pin').value;
  var err = document.getElementById('lo-err'); err.style.display = 'none';
  if(!v) return erroEm(err, 'Escolha seu nome.');
  if(!senha) return erroEm(err, 'Digite a senha.');
  return entrarCom(v, senha).catch(function(e){ erroEm(err, humano(e)); });
}
function sair(){ location.reload(); }

/* ═══ 1º ACESSO por link (convite) — v2.2 ═══ */
function limpaUrl(){ try{ history.replaceState(null, '', location.pathname + '?conferir=1'); }catch(e){} }
function convite(token){
  var m = modal('Primeiro acesso', '<p class="pf-vazio">Conferindo o link…</p>', ''); m.el.style.zIndex = '10000';   /* acima da tela de login */
  rpc('prof_convite_info', { p_token: token }).then(function(r){
    m.fecha();
    var mm = modal('Primeiro acesso — ' + esc(r.nome),
      '<p style="font-size:15px;margin-bottom:10px">Bem-vindo(a) ao Cortex, o sistema de conferência do Centro Médico Judithe Ferreira. Escolha uma senha — é com ela que você entra nas próximas vezes, com o seu nome.</p>' +
      '<div class="fg"><label class="fl">Senha (pelo menos 4 caracteres)</label><input type="password" class="fc" id="pf-cv-s1" autocomplete="new-password"></div>' +
      '<div class="fg"><label class="fl">Repita a senha</label><input type="password" class="fc" id="pf-cv-s2" autocomplete="new-password"></div>' +
      '<div class="fg"><label class="fl">Celular com WhatsApp (DDD + número) — para os avisos da conferência' + (r.tem_telefone ? '. Já temos um número; preencha só se quiser trocar' : '') + '</label><input type="tel" class="fc" id="pf-cv-tel" inputmode="numeric" placeholder="62999990000"></div>' +
      '<p class="pf-erro" id="pf-cv-erro" style="display:none"></p>',
      '<button type="button" class="pf-btn pf-pri" id="pf-cv-ok">Salvar senha e entrar</button>');
    mm.el.style.zIndex = '10000';
    $('[data-x]', mm.el).onclick = function(){ mm.fecha(); limpaUrl(); };
    $('#pf-cv-ok', mm.el).onclick = function(){
      var s1 = $('#pf-cv-s1', mm.el).value, s2 = $('#pf-cv-s2', mm.el).value, tel = $('#pf-cv-tel', mm.el).value, err = $('#pf-cv-erro', mm.el);
      err.style.display = 'none';
      if(s1.length < 4) return erroEm(err, 'A senha precisa ter pelo menos 4 caracteres.');
      if(s1 !== s2) return erroEm(err, 'As senhas não conferem.');
      var b = $('#pf-cv-ok', mm.el); b.disabled = true; b.textContent = 'Salvando…';
      rpc('prof_convite_definir_senha', { p_token: token, p_senha: s1, p_telefone: tel || null })
        .then(function(d){
          limpaUrl(); mm.fecha();
          return entrarCom(d.profissional_id, s1).catch(function(e){ alert('Senha salva. ' + humano(e) + ' Entre pela tela de entrada com o seu nome e a senha escolhida.'); });
        })
        .catch(function(e){ erroEm(err, humano(e)); b.disabled = false; b.textContent = 'Salvar senha e entrar'; });
    };
  }).catch(function(e){
    m.fecha();
    var me = modal('Link de acesso', '<p style="font-size:15px">' + esc(humano(e)) + '</p>',
      '<button type="button" class="pf-btn pf-pri" data-volta>Ir para a tela de entrada</button>');
    me.el.style.zIndex = '10000';
    $('[data-volta]', me.el).onclick = function(){ me.fecha(); limpaUrl(); };
    $('[data-x]', me.el).onclick = function(){ me.fecha(); limpaUrl(); };
  });
}

/* ═══ faixa do prazo ═══ */
function pintaPrazo(ids, dados, modo){
  var box = document.getElementById(ids.prazo);
  var prazo = new Date(dados.prazo), fech = new Date(dados.fechamento);
  var ini = dLocal(dados.semana_inicio), fim = dLocal(dados.semana_fim);
  var pIni = dados.periodo_inicio || dados.semana_inicio, pFim = dados.periodo_fim || dados.semana_fim;
  var dIni = dLocal(pIni), dFim = dLocal(pFim);
  document.getElementById(ids.semana).textContent = (dados.periodo_especial ? 'Período de ' : 'Semana de ') + ddmm(pIni) + ' (' + DIAS[dIni.getDay()].toLowerCase() + ') a ' + ddmm(pFim) + ' (' + DIAS[dFim.getDay()].toLowerCase() + ')';
  var alvo = modo === 'sec' ? fech : prazo;
  var render = function(){
    var ms = alvo.getTime() - agora();
    box.classList.remove('alerta','passou','fechada');
    var conta = document.getElementById(ids.conta), ate = document.getElementById(ids.ate);
    if(modo === 'prof'){
      if(dados.motivo === 'confirmada'){ box.classList.remove('alerta','passou','fechada'); conta.textContent = 'Agenda confirmada'; ate.textContent = 'Registrada em ' + fmtTs(dados.confirmada_em) + '. A próxima conferência será liberada ' + fmtDiaHora(dados.proxima_abertura) + '.'; return; }
      if(dados.motivo === 'antes_da_abertura'){
        var msA = new Date(dados.abre_em).getTime() - agora();
        box.classList.add('fechada');
        var hA = Math.floor(Math.max(0, msA)/36e5), dA = Math.floor(hA/24);
        conta.textContent = 'Liberação ' + fmtDiaHora(dados.abre_em);
        ate.textContent = msA > 0 ? ('Faltam ' + (dA >= 1 ? dA + ' dia' + (dA>1?'s':'') + ' e ' + (hA%24) + ' h' : hA + ' h') + '. Você será avisado pelo WhatsApp.') : 'Liberando… atualize a página.';
        return;
      }
      if(agora() > fech.getTime() || dados.motivo === 'fechada'){ box.classList.add('fechada'); conta.textContent = 'Período encerrado'; ate.textContent = 'A agenda seguiu para o faturamento com as informações registradas.' + (dados.proxima_abertura ? ' A próxima conferência será liberada ' + fmtDiaHora(dados.proxima_abertura) + '.' : ''); return; }
      if(dados.periodo_especial){ conta.textContent = 'Aguardando a sua conferência'; ate.textContent = 'Confira com calma, consulta por consulta. Só confirme quando tudo estiver certo.'; return; }
      if(ms <= 0){ box.classList.add('passou'); conta.textContent = 'Prazo encerrado'; ate.textContent = 'O prazo era ' + fmtDiaHora(dados.prazo) + '. Se ainda houver alguma correção, informe a recepção imediatamente.'; return; }
    } else if(ms <= 0){
      box.classList.add('fechada'); conta.textContent = 'Semana fechada';
      ate.textContent = 'Fechou ' + fmtDiaHora(dados.fechamento) + '. Profissionais tinham até ' + fmtDiaHora(dados.prazo) + '.'; return;
    }
    var h = Math.floor(ms/36e5), d = Math.floor(h/24), hr = h%24, min = Math.floor((ms%36e5)/6e4);
    if(h < 24) box.classList.add('alerta');
    conta.textContent = d >= 1 ? ('Faltam ' + d + ' dia' + (d>1?'s':'') + ' e ' + hr + ' h') : (h >= 1 ? ('Faltam ' + h + ' h e ' + min + ' min') : ('Faltam ' + min + ' min'));
    ate.textContent = modo === 'sec' ? ('Fechamento ' + fmtDiaHora(dados.fechamento) + ' · profissionais até ' + fmtDiaHora(dados.prazo))
                                     : ('Prazo para conferir e confirmar: ' + fmtDiaHora(dados.prazo) + '.' + (dados.modo_teste ? ' (acesso de teste até ' + fmtTs(dados.teste_ate) + ')' : ''));
  };
  render(); clearInterval(contadorTimer); contadorTimer = setInterval(render, 30000);
}
function pintaSemanas(host, semanas, atual, onPick){
  host.innerHTML = '';
  semanas.forEach(function(s, i){
    var b = document.createElement('button'); b.type = 'button';
    b.textContent = (i === 0 ? 'Semana atual · ' : '') + ddmm(s.inicio) + ' – ' + ddmm(s.fim);
    b.setAttribute('aria-current', s.inicio === atual ? 'true' : 'false');
    if(s.inicio === atual) b.classList.add('on');
    b.onclick = function(){ onPick(s.inicio); };
    host.appendChild(b);
  });
}

/* ═══ PROFISSIONAL — a semana ═══ */
function carregaSemana(inicio){
  var lista = document.getElementById('pf-lista');
  lista.innerHTML = '<p class="pf-vazio">Carregando…</p>';
  return rpc('prof_listar_semana', { p_profissional_id: sess.id, p_senha: sess.senha, p_semana_inicio: inicio }).then(function(d){
    relogioOffset = new Date(d.agora).getTime() - Date.now();
    semanaAtual = d; sess.semana = d.semana_inicio;
    pintaPrazo({ prazo:'pf-prazo', semana:'pf-semana', conta:'pf-conta', ate:'pf-ate' }, d, 'prof');
    document.getElementById('pf-semanas').innerHTML = '';
    previaAtual = null; var pv = document.getElementById('pf-previa'); if(pv) pv.innerHTML = '';
    if(d.aberta === false){ renderFechada(d); return; }
    renderItens(d); renderRodape(d); carregaPrevia(d);
  }).catch(function(e){ lista.innerHTML = '<p class="pf-erro">' + esc(humano(e)) + '</p>'; });
}
function classeStatus(it){
  if(it.em_feriado) return 'neutro';
  if(it.futuro) return 'fut';
  var t = (it.status_exibido || '').toLowerCase();
  if(t.indexOf('atendido') === 0) return 'ok';
  if(t.indexOf('não compareceu') === 0 || t.indexOf('nao compareceu') === 0) return 'falta';
  return 'neutro';
}
function presencaHtml(d){
  var p = d.presenca; if(!p || (!p.atendidos && !p.faltas)) return '';
  var mes = p.mes ? MESES[dLocal(p.mes).getMonth()] : '';
  return '<div class="pf-presenca"><b>' + esc(p.pct_texto || '—') + '</b> de presença em ' + esc(mes.toLowerCase()) + ' até agora' +
         '<br><small>' + p.atendidos + ' atendido' + (p.atendidos === 1 ? '' : 's') + ' · ' + p.faltas + ' falta' + (p.faltas === 1 ? '' : 's') + (p.so_unimed ? ' · somente Unimed' : '') + '</small></div>';
}
var MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
/* ═══ prévia do repasse (valor + %) — v2.3: só no período que fecha o mês, para quem gera recibo ═══ */
function carregaPrevia(d){
  var box = document.getElementById('pf-previa'); if(!box) return;
  if(d.tipo_periodo !== 'fechamento_mes' || !d.regime || !d.regime.gera_recibo) return;
  rpc('prof_recibo_previa', { p_profissional_id: sess.id, p_senha: sess.senha, p_competencia: d.periodo_fim })
    .then(function(r){
      previaAtual = r; box.innerHTML = previaHtml(r);
      var b = document.getElementById('pf-baixar'); if(b) b.textContent = 'Baixar prévia em PDF — agenda e repasse (sem valor de confirmação)';
    })
    .catch(function(){ previaAtual = null; box.innerHTML = ''; });
}
function previaLinhas(r){
  return (r.resumo || []).map(function(x){
    var un = (x.quantidade > 0 && x.descricao !== 'Particular' && !/R\$/.test(x.descricao)) ? (x.quantidade + ' × ' + brl(x.valor / x.quantidade)) : (x.quantidade + (x.descricao === 'Particular' ? ' (sobre o valor cobrado)' : ''));
    return { descricao: x.descricao, un: un, valor: brl(x.valor) };
  });
}
function previaHtml(r){
  var h = '<div class="pf-previa"><div class="pf-previa-h"><b>Prévia do repasse — ' + esc(r.mes_nome) + '</b><span>muda conforme as correções · ainda não é o recibo</span></div>' +
    '<div class="pf-previa-tot">' + brl(r.total) + '</div>' +
    '<div class="pf-previa-sub">' + r.atendidos + ' atendimento' + (r.atendidos === 1 ? '' : 's') + ' · ' + r.faltas + ' falta' + (r.faltas === 1 ? '' : 's') +
      (r.mostra_pct ? ' · <b>' + esc(r.pct_texto) + ' de agenda</b>' : '') + '</div>' +
    '<table class="pf-previa-t">';
  previaLinhas(r).forEach(function(l){ h += '<tr><td>' + esc(l.descricao) + '</td><td class="un">' + esc(l.un) + '</td><td class="num"><b>' + l.valor + '</b></td></tr>'; });
  if(!(r.resumo || []).length) h += '<tr><td colspan="3">Nenhum atendimento pago neste mês até agora.</td></tr>';
  h += '</table><p class="pf-previa-nota">Atendido = sessão realizada. Falta = cancelamento, não comparecimento ou agendamento não realizado. O recibo definitivo é gerado quando você confirma o mês.</p></div>';
  return h;
}
function renderItens(d){
  var itens = d.itens || [];
  var lista = document.getElementById('pf-lista');
  document.getElementById('pf-resumo').innerHTML = itens.length ? (itens.length + ' consulta' + (itens.length === 1 ? '' : 's')) : '';
  if(!itens.length){ lista.innerHTML = '<p class="pf-vazio">Nenhuma consulta sua nesta semana.</p>'; return; }
  lista.innerHTML = linhasHtml(itens) + '<button type="button" class="pf-btn pf-baixar" id="pf-baixar">' + (previaAtual ? 'Baixar prévia em PDF — agenda e repasse (sem valor de confirmação)' : 'Baixar prévia em PDF (sem valor de confirmação)') + '</button>';
  document.getElementById('pf-baixar').onclick = function(){ baixarRelatorio(d); };
}
function linhasHtml(itens){
  var porDia = {}, ordem = [];
  itens.forEach(function(i){ if(!porDia[i.data]){ porDia[i.data] = []; ordem.push(i.data); } porDia[i.data].push(i); });
  var html = '';
  ordem.forEach(function(data){
    var dt = dLocal(data);
    var feriado = porDia[data].some(function(i){ return i.em_feriado; });
    html += '<section class="pf-dia"><h2>' + DIAS[dt.getDay()] + ', ' + ddmm(data) + (feriado ? ' — feriado' : '') + '</h2>';
    porDia[data].forEach(function(it){
      html += '<div class="pf-item' + (it.futuro ? ' futuro' : '') + '">' +
        '<div class="pf-hora">' + (hhmm(it.horario) || '—') + '</div>' +
        '<p class="pf-nome">' + esc(it.paciente || '(sem paciente)') + '</p>' +
        '<p class="pf-sub">' + esc(it.convenio || 'sem convênio') + '</p>' +
        '<div class="pf-status ' + classeStatus(it) + '">' + esc(it.status_exibido || it.status || '') + '</div>' +
        '</div>';
    });
    html += '</section>';
  });
  return html;
}
function renderFechada(d){
  var lista = document.getElementById('pf-lista'), aviso = document.querySelector('#prof-view .pf-aviso');
  document.getElementById('pf-resumo').innerHTML = '';
  var quando = d.proxima_abertura ? fmtDiaHora(d.proxima_abertura) : (d.abre_em ? fmtDiaHora(d.abre_em) : '');
  var txt;
  var pI = d.periodo_inicio || d.semana_inicio, pF = d.periodo_fim || d.semana_fim, rot = d.periodo_especial ? 'o período ' : 'a semana ';
  if(d.motivo === 'confirmada') txt = 'Sua agenda de ' + ddmm(pI) + ' a ' + ddmm(pF) + ' foi confirmada em ' + fmtTs(d.confirmada_em) + ' e seguirá para o faturamento com as informações conferidas. A próxima conferência será liberada ' + quando + '.';
  else if(d.motivo === 'antes_da_abertura') txt = 'A conferência da agenda de ' + ddmm(pI) + ' a ' + ddmm(pF) + ' será liberada ' + quando + '. Ela permanece aberta até a sua confirmação. Você será avisado pelo WhatsApp.';
  else txt = 'O prazo de conferência da agenda de ' + ddmm(pI) + ' a ' + ddmm(pF) + ' encerrou, e ela seguiu para o faturamento com as informações registradas. A próxima conferência será liberada ' + quando + '.';
  if(aviso) aviso.innerHTML = esc(txt);
  var h = '';
  if(d.motivo === 'confirmada'){
    h += '<p class="pf-vazio">Não há pendências neste período.</p>' +
         '<div><button type="button" class="pf-btn pf-baixar" id="pf-baixar">Baixar comprovante da conferência (PDF)</button></div>';
  } else {
    h += '<p class="pf-vazio">' + (d.motivo === 'antes_da_abertura' ? 'Nenhuma conferência liberada no momento.' : 'Nenhuma pendência.') + '</p>';
  }
  var lst = d.recibos || [];
  if(d.recibo || lst.length){
    h += '<div class="pf-dia"><h2>Recibos de repasse</h2></div><div id="pf-recibos"></div><div id="pf-recibo-area"></div>';
  }
  lista.innerHTML = h;
  if(d.motivo === 'confirmada') document.getElementById('pf-baixar').onclick = function(){ baixarRelatorio(d); };
  if(d.recibo || lst.length){
    var box = document.getElementById('pf-recibos'), area = document.getElementById('pf-recibo-area');
    var rh = '';
    lst.forEach(function(r){
      rh += '<div class="pf-item"><div class="pf-hora"></div><p class="pf-nome">' + esc(r.mes_nome || dmy(r.competencia)) + '</p><p class="pf-sub">' + brl(r.total) + (r.versao > 1 ? ' · versão ' + r.versao : '') + '</p>' +
            '<div class="pf-status neutro"><button type="button" class="pf-btn" data-ver="' + r.competencia + '">Ver</button> <button type="button" class="pf-btn" data-pdf="' + r.competencia + '">PDF</button></div></div>';
    });
    box.innerHTML = rh;
    var abre = function(comp, baixar){
      var pronto = (d.recibo && d.recibo.competencia === comp) ? Promise.resolve(d.recibo)
                 : rpc('prof_recibo', { p_profissional_id: sess.id, p_senha: sess.senha, p_competencia: comp });
      pronto.then(function(r){ if(baixar) baixarRecibo(r); else { area.innerHTML = reciboHtml(r); area.scrollIntoView({ behavior: 'smooth' }); } })
            .catch(function(e){ alert(humano(e)); });
    };
    Array.prototype.forEach.call(box.querySelectorAll('button[data-ver]'), function(b){ b.onclick = function(){ abre(b.getAttribute('data-ver'), false); }; });
    Array.prototype.forEach.call(box.querySelectorAll('button[data-pdf]'), function(b){ b.onclick = function(){ abre(b.getAttribute('data-pdf'), true); }; });
    if(d.recibo && d.motivo === 'confirmada' && d.recibo.competencia === (d.presenca && d.presenca.mes)) area.innerHTML = reciboHtml(d.recibo);
  }
  var btn = document.getElementById('pf-confirmar'), ok = document.getElementById('pf-confirmada'), nota = document.getElementById('pf-nota');
  btn.style.display = 'none'; ok.style.display = 'none'; nota.textContent = '';
}
function renderRodape(d){
  var aviso = document.querySelector('#prof-view .pf-aviso');
  var fechaMes = (d.tipo_periodo === 'fechamento_mes');
  var qual = (fechaMes && d.periodo_especial) ? ('de ' + mesNome(d.periodo_fim)) : (fechaMes ? 'dos últimos dias do mês' : 'da semana');
  if(aviso) aviso.innerHTML =
    '<p>Esta é a sua agenda ' + qual + ', como está registrada no sistema da clínica. É por ela que os atendimentos são faturados e que o seu repasse é calculado.</p>' +
    '<div class="pf-regra"><p><b>Antes de confirmar, confira consulta por consulta.</b></p>' +
    '<p>Encontrou algo errado — situação, horário, paciente ou convênio? <b>Avise a recepção pelo WhatsApp e não confirme ainda.</b> A correção é feita no Feegow e aparece aqui até a manhã seguinte. Volte, confira de novo e só então confirme.</p></div>' +
    '<p>Ao confirmar, você declara que a agenda está correta' + (fechaMes ? '. A conferência do mês é encerrada e o seu recibo de repasse é gerado na hora.' : ' e ela segue para o faturamento.') + ' Depois de confirmada, a agenda não pode mais ser alterada por aqui.</p>' +
    (d.periodo_especial ? '' : '<p>O prazo é <b>segunda-feira às ' + esc(sess.horaPrazo || '22h') + '</b>; após esse horário, o período segue para o faturamento com as informações registradas.</p>') +
    (ehCelular() ? '' : '<p>A confirmação é feita pelo celular, com registro fotográfico.</p>');
  document.getElementById('pf-confirmar').style.display = '';
  var btn = document.getElementById('pf-confirmar'), ok = document.getElementById('pf-confirmada'), nota = document.getElementById('pf-nota');
  var abertos = (d.itens || []).filter(pedidoAberto).length;
  ok.style.display = 'none'; btn.textContent = fechaMes ? 'Está tudo certo — confirmar o mês' : 'Está tudo certo — confirmar a semana';
  nota.textContent = (d.fechada && !d.periodo_especial) ? 'O período encerrou. A confirmação será registrada como posterior ao prazo.'
    : (d.prazo_passou && !d.periodo_especial) ? 'O prazo encerrou. A confirmação será registrada como posterior ao prazo.'
    : ('Só confirme se não houver nenhuma correção pendente na recepção. ' + (ehCelular() ? 'A confirmação inclui um registro fotográfico.' : 'A confirmação é feita pelo celular.'));
  btn.onclick = function(){ abreConfirmacao(d); };
}

/* ═══ confirmação com foto ═══ */
function ehCelular(){ return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent)); }
function abreConfirmacao(d){
  if(!ehCelular()){
    var mm = modal('A confirmação é feita pelo celular',
      '<p style="font-size:17px">A confirmação inclui um <b>registro fotográfico</b> feito na hora, pela câmera do celular.</p><p style="font-size:17px">Acesse pelo celular, com o mesmo link, e toque em <b>Confirmar agenda</b>.</p>',
      '<button type="button" class="pf-btn pf-pri" data-volta>Entendi</button>');
    $('[data-volta]', mm.el).onclick = mm.fecha;
    return;
  }
  var m = modal('Confirmar a agenda',
    '<label class="pf-declara"><input type="checkbox" id="pf-cf-declaro"><span>Conferi consulta por consulta. Está tudo certo e <b>não há nenhuma correção pendente</b> na recepção.</span></label>' +
    '<p style="font-size:16px;margin-bottom:10px">' + (sess.fotoObrigatoria ? 'Para registrar a confirmação, tire uma foto sua agora. Ela fica anexada ao comprovante.' : 'Se desejar, registre uma foto.') + '</p>' +
    '<div class="pf-foto"><input type="file" id="pf-file" accept="image/*" capture="' + FOTO_CAMERA + '" style="display:none"><button type="button" class="pf-btn" id="pf-tirar">Tirar a foto</button>' +
      '<img id="pf-prev" style="display:none" alt="sua foto"><p id="pf-info" style="display:none;font-size:13px;color:#666"></p></div>' +
    '<p class="pf-erro" id="pf-cf-erro" style="display:none"></p>',
    '<button type="button" class="pf-btn" data-volta>Voltar</button><button type="button" class="pf-btn pf-pri" id="pf-cf-ok"' + (sess.fotoObrigatoria ? ' disabled' : '') + '>Registrar confirmação</button>');
  var el = m.el, foto = null;
  var liberar = function(){ $('#pf-cf-ok', el).disabled = (sess.fotoObrigatoria && !foto) || !$('#pf-cf-declaro', el).checked; };
  $('#pf-cf-declaro', el).onchange = liberar; liberar();
  $('[data-volta]', el).onclick = m.fecha;
  $('#pf-tirar', el).onclick = function(){ $('#pf-file', el).click(); };
  $('#pf-file', el).onchange = function(ev){
    var f = ev.target.files && ev.target.files[0]; if(!f) return;
    $('#pf-cf-erro', el).style.display = 'none';
    comprimeFoto(f).then(function(res){
      foto = res;
      $('#pf-prev', el).src = res.dataUrl; $('#pf-prev', el).style.display = 'block';
      $('#pf-info', el).textContent = Math.round(res.bytes/1024) + ' KB'; $('#pf-info', el).style.display = 'block';
      $('#pf-tirar', el).textContent = 'Tirar outra foto'; liberar();
    }).catch(function(e){ erroEm($('#pf-cf-erro', el), 'Não foi possível preparar a foto: ' + e.message); });
  };
  $('#pf-cf-ok', el).onclick = function(){
    if(!$('#pf-cf-declaro', el).checked) return erroEm($('#pf-cf-erro', el), 'Marque a declaração de que a agenda está correta.');
    if(sess.fotoObrigatoria && !foto) return erroEm($('#pf-cf-erro', el), MSG.FOTO_OBRIGATORIA);
    var b = $('#pf-cf-ok', el); b.disabled = true; b.textContent = 'Registrando…';
    rpc('prof_confirmar_semana', { p_profissional_id: sess.id, p_senha: sess.senha, p_semana_inicio: d.semana_inicio,
                                   p_observacao: 'Declarou: conferiu consulta por consulta; nenhuma correção pendente na recepção.',
                                   p_foto_base64: foto ? foto.dataUrl : null, p_foto_mime: foto ? 'image/jpeg' : null })
      .then(function(){ m.fecha(); return carregaSemana(d.semana_inicio); })
      .catch(function(e){ erroEm($('#pf-cf-erro', el), humano(e)); b.disabled = false; b.textContent = 'Registrar confirmação'; });
  };
}
/* ═══ relatório em PDF do que foi confirmado (jsPDF carregado só na hora) ═══ */
function reciboHtml(r){
  var h = '<div class="rc-card"><div class="rc-head"><b>Centro Médico Judithe Ferreira</b><span>Anápolis / GO • Recibo de Repasse — ' + esc(r.mes_nome) + '</span></div>' +
    '<div class="rc-info"><div>Profissional</div><div>' + esc(r.profissional) + '</div>' +
    '<div>Período</div><div>' + dmy(r.periodo_inicio) + ' a ' + dmy(r.periodo_fim) + '</div>' +
    '<div>Data de emissão</div><div>' + (r.emitido_em ? fmtTs(r.emitido_em).slice(0,10) : '—') + (r.versao > 1 ? ' (versão ' + r.versao + ')' : '') + '</div>' +
    '<div>Consultas finalizadas</div><div>' + r.finalizadas + '</div>' +
    (r.mostra_pct ? '<div>Porcentagem de agenda</div><div>' + esc(r.pct_texto) + '</div>' : '') + '</div>' +
    '<div class="rc-sec">Resumo</div><table class="rc-t"><tr><th>Descrição</th><th>Quantidade</th><th>Valor Total</th></tr>';
  (r.resumo || []).forEach(function(x){ h += '<tr><td>' + esc(x.descricao) + '</td><td class="num">' + x.quantidade + '</td><td class="num">' + brl(x.valor) + '</td></tr>'; });
  h += '<tr class="tot"><td>TOTAL A RECEBER</td><td></td><td class="num">' + brl(r.total) + '</td></tr></table>';
  h += '<div class="rc-sec">Detalhamento por paciente</div><table class="rc-t"><tr><th>Paciente</th><th>Data</th><th>Horário</th>' + (r.coluna_descricao ? '<th>Descrição</th>' : '') + '<th>Status</th></tr>';
  (r.detalhe || []).forEach(function(x){ h += '<tr><td>' + esc(x.paciente) + '</td><td>' + dmy(x.data) + '</td><td>' + esc(x.horario) + '</td>' + (r.coluna_descricao ? '<td>' + esc(x.descricao || '') + '</td>' : '') + '<td class="' + (x.status === 'Atendido' ? 'ok' : 'falta') + '">' + esc(x.status) + '</td></tr>'; });
  h += '</table><div class="rc-foot">Documento interno de repasse. Atendido = sessão realizada (inclui lançamentos em aguardando). Falta = cancelamento, não comparecimento ou agendamento não realizado.</div></div>';
  return h;
}
function carregaScript(src, pronto){
  return new Promise(function(resolve, reject){
    if(pronto()) return resolve();
    var sc = document.createElement('script'); sc.src = src;
    sc.onload = function(){ pronto() ? resolve() : reject(new Error('não carregou ' + src)); };
    sc.onerror = function(){ reject(new Error('sem internet para baixar o gerador de PDF')); };
    document.head.appendChild(sc);
  });
}
function baixarRecibo(r){
  carregaJsPdf().then(function(jsPDF){
    return carregaScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js', function(){ return !!(jsPDF.API && jsPDF.API.autoTable); }).then(function(){ return jsPDF; });
  }).then(function(jsPDF){
    var doc = new jsPDF({ unit: 'mm', format: 'a4' });
    var L = 20, W = 170, navy = [31, 58, 95], y = 18;
    doc.setFillColor(navy[0], navy[1], navy[2]); doc.rect(L, y - 8, W, 16, 'F');
    doc.setTextColor(255); doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.text('Centro Médico Judithe Ferreira', L + 4, y);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.text('Anápolis / GO • Recibo de Repasse — ' + r.mes_nome, L + 4, y + 5.5);
    doc.setTextColor(0); y += 14;
    var info = [['Profissional', r.profissional], ['Período', dmy(r.periodo_inicio) + ' a ' + dmy(r.periodo_fim)],
                ['Data de emissão', (r.emitido_em ? fmtTs(r.emitido_em).slice(0,10) : '—') + (r.versao > 1 ? ' (versão ' + r.versao + ')' : '')],
                ['Consultas finalizadas', String(r.finalizadas)]];
    if(r.mostra_pct) info.push(['Porcentagem de agenda', r.pct_texto]);
    doc.autoTable({ startY: y, margin: { left: L, right: 20 }, body: info, theme: 'grid',
      styles: { fontSize: 9.5, cellPadding: 2, lineColor: [204, 204, 204], lineWidth: 0.2, textColor: 20 },
      columnStyles: { 0: { cellWidth: 45, fontStyle: 'bold', fillColor: [243, 246, 250] } }, alternateRowStyles: { fillColor: [255, 255, 255] } });
    y = doc.lastAutoTable.finalY + 8;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(navy[0], navy[1], navy[2]); doc.text('Resumo', L, y); y += 3;
    var body = (r.resumo || []).map(function(x){ return [x.descricao, String(x.quantidade), brl(x.valor)]; });
    body.push([{ content: 'TOTAL A RECEBER', styles: { fontStyle: 'bold', fillColor: [233, 238, 245] } }, { content: '', styles: { fillColor: [233, 238, 245] } }, { content: brl(r.total), styles: { fontStyle: 'bold', fillColor: [233, 238, 245], halign: 'right' } }]);
    doc.autoTable({ startY: y, margin: { left: L, right: 20 }, head: [['Descrição', 'Quantidade', 'Valor Total']], body: body, theme: 'grid',
      headStyles: { fillColor: navy, textColor: 255, fontStyle: 'bold', fontSize: 9.5 },
      styles: { fontSize: 9.5, cellPadding: 2, lineColor: [204, 204, 204], lineWidth: 0.2, textColor: 20 },
      columnStyles: { 0: { cellWidth: 95 }, 1: { cellWidth: 30, halign: 'right' }, 2: { cellWidth: 45, halign: 'right' } } });
    y = doc.lastAutoTable.finalY + 8;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(navy[0], navy[1], navy[2]); doc.text('Detalhamento por paciente', L, y); y += 3;
    var head = r.coluna_descricao ? [['Paciente', 'Data', 'Horário', 'Descrição', 'Status']] : [['Paciente', 'Data', 'Horário', 'Status']];
    var det = (r.detalhe || []).map(function(x){
      var st = { content: x.status, styles: { fontStyle: 'bold', textColor: x.status === 'Atendido' ? [31, 122, 58] : [176, 58, 46] } };
      return r.coluna_descricao ? [x.paciente, dmy(x.data), x.horario, x.descricao || '', st] : [x.paciente, dmy(x.data), x.horario, st];
    });
    var cols = r.coluna_descricao ? { 0: { cellWidth: 70 }, 1: { cellWidth: 24 }, 2: { cellWidth: 20 }, 3: { cellWidth: 30 }, 4: { cellWidth: 26 } }
                                  : { 0: { cellWidth: 95 }, 1: { cellWidth: 28 }, 2: { cellWidth: 22 }, 3: { cellWidth: 25 } };
    doc.autoTable({ startY: y, margin: { left: L, right: 20, bottom: 22 }, head: head, body: det, theme: 'grid',
      headStyles: { fillColor: navy, textColor: 255, fontStyle: 'bold', fontSize: 9 },
      styles: { fontSize: 8.5, cellPadding: 1.6, lineColor: [204, 204, 204], lineWidth: 0.2, textColor: 20 },
      alternateRowStyles: { fillColor: [247, 249, 252] }, columnStyles: cols });
    var pages = doc.internal.getNumberOfPages();
    for(var i = 1; i <= pages; i++){
      doc.setPage(i); doc.setFont('helvetica', 'italic'); doc.setFontSize(8); doc.setTextColor(110);
      doc.text(doc.splitTextToSize('Documento interno de repasse. Atendido = sessão realizada (inclui lançamentos em aguardando). Falta = cancelamento, não comparecimento ou agendamento não realizado.', W), L, 285);
    }
    doc.save('Recibo ' + r.mes_nome.replace(' / ', ' ') + ' - ' + r.profissional + '.pdf');
  }).catch(function(e){ alert('Não deu para gerar o PDF: ' + e.message); });
}
function carregaJsPdf(){
  return new Promise(function(resolve, reject){
    if(window.jspdf && window.jspdf.jsPDF) return resolve(window.jspdf.jsPDF);
    var sc = document.createElement('script');
    sc.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
    sc.onload = function(){ (window.jspdf && window.jspdf.jsPDF) ? resolve(window.jspdf.jsPDF) : reject(new Error('jsPDF não carregou')); };
    sc.onerror = function(){ reject(new Error('sem internet para baixar o gerador de PDF')); };
    document.head.appendChild(sc);
  });
}
function baixarRelatorio(d){
  var btn = document.getElementById('pf-baixar'); if(btn){ btn.disabled = true; btn.textContent = 'Gerando…'; }
  carregaJsPdf().then(function(jsPDF){
    var doc = new jsPDF({ unit: 'mm', format: 'a4' });
    var itens = d.itens || [], y = 18, L = 14, W = 182, alt = 297;
    var previa = !d.confirmada_em;
    var marcaDagua = function(){
      if(!previa) return;
      doc.saveGraphicsState && doc.saveGraphicsState();
      doc.setTextColor(215, 60, 60); doc.setFont('helvetica', 'bold'); doc.setFontSize(40);
      doc.text('DEMONSTRATIVO', 105, 160, { align: 'center', angle: 35 });
      doc.setFontSize(18); doc.text('AGENDA AINDA NÃO CONFIRMADA', 105, 175, { align: 'center', angle: 35 });
      doc.restoreGraphicsState && doc.restoreGraphicsState();
      doc.setTextColor(0);
    };
    if(previa){
      doc.setFillColor(215, 60, 60); doc.rect(L, 10, W, 11, 'F');
      doc.setTextColor(255); doc.setFont('helvetica', 'bold'); doc.setFontSize(12);
      doc.text('DOCUMENTO DEMONSTRATIVO — AGENDA AINDA NÃO CONFIRMADA PELO PROFISSIONAL', L + W/2, 17.5, { align: 'center' });
      doc.setTextColor(0); y = 30;
    }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(14);
    doc.text('Conferência de agenda — ' + (d.nome || sess.nome || ''), L, y); y += 7;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
    doc.text('Centro Médico Judithe Ferreira · ' + (d.periodo_especial ? 'período ' : 'semana ') + ddmm(d.periodo_inicio || d.semana_inicio) + ' a ' + ddmm(d.periodo_fim || d.semana_fim) +
             (previa ? ' · prévia gerada em ' + fmtTs(new Date().toISOString()) + ' — sem valor de confirmação'
                     : ' · confirmada em ' + fmtTs(d.confirmada_em) + (d.confirmada_com_foto ? ' (com registro fotográfico)' : '')), L, y); y += 4;
    doc.setDrawColor(0); doc.line(L, y, L + W, y); y += 6;
    marcaDagua();
    if(previa && previaAtual && previaAtual.previa){
      var r = previaAtual;
      doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(15, 107, 92);
      doc.text('Prévia do repasse — ' + r.mes_nome + ' · ' + brl(r.total), L, y); y += 5.5;
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(60);
      doc.text(r.atendidos + ' atendimentos · ' + r.faltas + ' faltas' + (r.mostra_pct ? ' · ' + r.pct_texto + ' de agenda' : '') + ' · calculado em ' + fmtTs(r.calculado_em) + ' — muda conforme as correções; não é o recibo', L, y); y += 5;
      doc.setTextColor(0); doc.setFontSize(10);
      previaLinhas(r).forEach(function(l){
        doc.text(doc.splitTextToSize(l.descricao, 96)[0], L, y);
        doc.text(l.un, L + 100, y);
        doc.text(l.valor, L + W, y, { align: 'right' }); y += 5;
      });
      doc.setFont('helvetica', 'bold'); doc.text('TOTAL (prévia)', L, y); doc.text(brl(r.total), L + W, y, { align: 'right' }); y += 3;
      doc.setDrawColor(0); doc.line(L, y, L + W, y); y += 7;
      doc.setFont('helvetica', 'normal');
    }
    var porDia = {}, ordem = [];
    itens.forEach(function(i){ if(!porDia[i.data]){ porDia[i.data] = []; ordem.push(i.data); } porDia[i.data].push(i); });
    if(!itens.length){ doc.text('Nenhuma consulta na semana.', L, y); }
    ordem.forEach(function(data){
      if(y > alt - 30){ doc.addPage(); y = 18; marcaDagua(); }
      var dt = dLocal(data), fer = porDia[data].some(function(i){ return i.em_feriado; });
      doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
      doc.text(DIAS[dt.getDay()] + ', ' + ddmm(data) + (fer ? ' — feriado' : ''), L, y); y += 1.5;
      doc.setDrawColor(120); doc.line(L, y, L + W, y); y += 5;
      doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
      porDia[data].forEach(function(it){
        if(y > alt - 15){ doc.addPage(); y = 18; marcaDagua(); }
        doc.text(hhmm(it.horario) || '—', L, y);
        doc.text(doc.splitTextToSize(it.paciente || '(sem paciente)', 78)[0], L + 14, y);
        doc.text(doc.splitTextToSize(it.convenio || '', 44)[0], L + 96, y);
        doc.text(it.status_exibido || it.status || '', L + W, y, { align: 'right' });
        y += 5.5;
      });
      y += 3;
    });
    doc.setFontSize(8); doc.setTextColor(120);
    doc.text((previa ? 'PRÉVIA — sem valor de confirmação. ' : '') + 'Emitido em ' + fmtTs(new Date().toISOString()) + ' pelo sistema de conferência de agenda do Centro Médico Judithe Ferreira.', L, alt - 10);
    doc.save((previa ? 'previa_' : 'conferencia_') + (d.nome || 'profissional').replace(/[^a-z0-9]+/gi, '_') + '_' + d.semana_inicio + '.pdf');
  }).catch(function(e){ alert('Não deu para gerar o PDF: ' + e.message); })
    .then(function(){ if(btn){ btn.disabled = false; btn.textContent = d.confirmada_em ? 'Baixar comprovante da conferência (PDF)' : (previaAtual ? 'Baixar prévia em PDF — agenda e repasse (sem valor de confirmação)' : 'Baixar prévia em PDF (sem valor de confirmação)'); } });
}
function comprimeFoto(file){
  return new Promise(function(resolve, reject){
    var url = URL.createObjectURL(file), img = new Image();
    img.onload = function(){
      try{
        var fator = Math.min(1, FOTO_LADO_MAX / Math.max(img.width, img.height));
        var w = Math.round(img.width*fator), h = Math.round(img.height*fator);
        var c = document.createElement('canvas'); c.width = w; c.height = h;
        c.getContext('2d').drawImage(img, 0, 0, w, h);
        var q = FOTO_QUALIDADE, dataUrl = c.toDataURL('image/jpeg', q);
        while(dataUrl.length > 560*1024*4/3 && q > 0.35){ q -= 0.12; dataUrl = c.toDataURL('image/jpeg', q); }
        URL.revokeObjectURL(url);
        resolve({ dataUrl: dataUrl, bytes: Math.round((dataUrl.length - dataUrl.indexOf(',') - 1)*3/4) });
      }catch(e){ reject(e); }
    };
    img.onerror = function(){ URL.revokeObjectURL(url); reject(new Error('imagem inválida')); };
    img.src = url;
  });
}

/* ═══ SECRETARIA — tela Conferência (design novo) ═══
   Mesmas chamadas de antes: prof_secretaria_painel, prof_atender_pedido, prof_balcao_telefone e
   prof_foto_confirmacao. Só a cara mudou: lista à esquerda, prazo e pedidos à direita, detalhe em janela. */
var AVISO_TIPO = { abertura:'Abertura', lembrete:'Lembrete', ultimo:'Última chamada', encerrado:'Encerramento' };
var cf = { d:null, filtro:'faltam', busca:'', vis:[], timer:null, pinta:null, aberto:null, topo:false };
function el(tag, cls, html){ var e = document.createElement(tag); if(cls) e.className = cls; if(html != null) e.innerHTML = html; return e; }
function bt(cls, html, fn){ var b = el('button', cls, html); b.type = 'button'; if(fn) b.addEventListener('click', fn); return b; }
function svgI(d, t, w){ return window.moldura ? moldura.svg(d, t, w) : ''; }
function semAc(s){ return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }
function iniciais(n){ var p = String(n || '').trim().split(/\s+/).filter(Boolean); if(!p.length) return '?'; return (p[0][0] + (p.length > 1 ? p[p.length-1][0] : '')).toUpperCase(); }
function quando(iso){ return fmtTs(iso).replace(', ', ' às '); }
function diaHora(iso){ return fmtDiaHora(iso).replace(' às 12h', ' ao meio-dia'); }
function capital(t){ t = String(t || ''); return t.charAt(0).toUpperCase() + t.slice(1); }
function noTela(){ return !!document.getElementById('gv-conteudo') && !!window.GV && GV.telaAtual && GV.telaAtual() === 'prof'; }
function periodoTxt(d){
  var pIni = d.periodo_inicio || d.semana_inicio, pFim = d.periodo_fim || d.semana_fim;
  return (d.periodo_especial ? 'Período de ' : 'Semana de ') + ddmm(pIni) + ' (' + DIAS[dLocal(pIni).getDay()].toLowerCase() + ') a ' +
         ddmm(pFim) + ' (' + DIAS[dLocal(pFim).getDay()].toLowerCase() + ')';
}
function quandoAg(p){ return (p.data ? DIAS[dLocal(p.data).getDay()].slice(0,3) + ' ' + ddmm(p.data) : '') + (p.horario ? ' ' + hhmm(p.horario) : ''); }
function pedEstado(p){
  if(p.situacao === 'aberto') return p.mudou_no_feegow ? { rot:'Mudança já chegou', cor:'#248A3D' } : { rot:'Aberto', cor:'#D70015' };
  if(p.situacao === 'atendido') return { rot:'Corrigido', cor:'#636366' };
  if(p.situacao === 'recusado') return { rot:'Não procede', cor:'#636366' };
  return { rot: String(p.situacao || '—'), cor:'#636366' };
}
function avisosDe(p){
  var a = p.avisos || [], env = 0, pen = 0, err = 0;
  a.forEach(function(x){ if(x.situacao === 'enviado') env++; else if(x.situacao === 'pendente') pen++; else if(x.situacao === 'erro') err++; });
  if(!p.telefone) return { txt:'sem telefone', cls:'laranja' };
  if(err) return { txt: err + (err === 1 ? ' aviso com erro' : ' avisos com erro'), cls:'vermelho' };
  if(pen) return { txt: pen + (pen === 1 ? ' aviso a enviar' : ' avisos a enviar'), cls:'' };
  if(env) return { txt: env + (env === 1 ? ' aviso enviado' : ' avisos enviados'), cls:'' };
  return { txt:'—', cls:'' };
}
function ordenaProfs(l){
  return l.slice().sort(function(a, b){
    if(!!a.confirmado_em !== !!b.confirmado_em) return a.confirmado_em ? 1 : -1;
    if(!a.confirmado_em) return (b.pendentes - a.pendentes) || String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR');
    return a.confirmado_em < b.confirmado_em ? 1 : (a.confirmado_em > b.confirmado_em ? -1 : 0);
  });
}
function linhaProf(p){
  var meta = p.consultas + (p.consultas === 1 ? ' consulta' : ' consultas') + ' · ' + (p.pendentes === 1 ? '1 pendente' : p.pendentes + ' pendentes') +
    (p.pedidos_abertos ? ' · ' + (p.pedidos_abertos === 1 ? '1 pedido aberto' : p.pedidos_abertos + ' pedidos abertos') : '') +
    (!p.ultimo_acesso_em ? ' · ainda não entrou' : '') + (p.teste_ate ? ' · teste até ' + fmtTs(p.teste_ate) : '');
  var rot = p.confirmado_em ? 'Confirmou ' + quando(p.confirmado_em) : 'Ainda não';
  var cor = p.confirmado_em ? (p.confirmado_fora_do_prazo ? '#C93400' : '#248A3D') : '#D70015';
  var av = avisosDe(p);
  return '<span class="cf-ini" aria-hidden="true">' + esc(iniciais(p.nome)) + '</span>' +
    '<span class="q"><span class="nm">' + esc(p.nome) + '</span><span class="mt">' + esc(meta) + '</span></span>' +
    '<span class="dir"><span class="tag" style="color:' + cor + '">' + esc(rot) + (p.confirmado_em && p.confirmado_fora_do_prazo ? ' · atrasado' : '') + '</span>' +
    '<span class="tr' + (av.cls ? ' ' + av.cls : '') + '">' + esc(av.txt) + '</span></span>';
}
function marcaLinha(){
  document.querySelectorAll('#cf-conf .cf-linha.aberta').forEach(function(x){ x.classList.remove('aberta'); });
  if(cf.aberto != null){ var r = document.querySelector('#cf-conf .cf-linha[data-prof="' + cf.aberto + '"]'); if(r) r.classList.add('aberta'); }
}
function alturaLista(){
  var l = document.querySelector('#cf-conf .lista.alta'); if(!l) return;
  var topo = l.getBoundingClientRect().top + window.scrollY;
  l.style.height = Math.max(520, window.innerHeight - topo - 24) + 'px';
}
/* cabeçalho da página: botão de acessos (administrador) e a busca */
function acoesTopo(aberta){
  var ac = window.moldura && moldura.acoesDe('conferencia'); if(!ac) return;
  if(painelAdmin() && !ac.querySelector('.cf-acessos')) ac.appendChild(bt('btn btn-s cf-acessos', 'Acessos e configurações', function(){ admin(); }));
  var bu = ac.querySelector('.cf-busca');
  if(aberta && !bu){
    bu = el('label', 'busca cf-busca', svgI('M4.5 11a6.5 6.5 0 1 0 13 0 6.5 6.5 0 1 0-13 0M16 16l4 4', 16, 2) +
      '<input type="search" placeholder="Buscar profissional" aria-label="Buscar profissional" autocomplete="off">');
    var inp = bu.querySelector('input'); inp.value = cf.busca;
    inp.addEventListener('input', function(){
      cf.busca = inp.value; cf.topo = true;
      if(cf.d && document.getElementById('cf-conf')) desenhaSec(cf.d);    /* só redesenha se a lista estiver na tela */
    });
    ac.appendChild(bu);
  }
  if(bu) bu.hidden = !aberta;
}
/* relógio do prazo (atualiza a cada 30 s enquanto a tela está aberta) */
function pintaContagem(){
  var d = cf.d, c = document.getElementById('cf-conta'), l1 = document.getElementById('cf-l1'), l2 = document.getElementById('cf-l2');
  if(!d || !c){ pararRelogio(); return; }
  var ms = new Date(d.prazo).getTime() - agora(), mf = new Date(d.fechamento).getTime() - agora();
  c.className = 'cf-prazo-conta';
  if(mf <= 0){
    c.textContent = 'Semana fechada';
    l1.innerHTML = 'Fechou ' + esc(diaHora(d.fechamento)) + '.';
    l2.textContent = 'Os profissionais tinham até ' + diaHora(d.prazo) + '. A agenda seguiu para o faturamento com o que estava no Feegow.';
  } else if(ms <= 0){
    c.textContent = 'Prazo encerrado'; c.classList.add('laranja');
    l1.innerHTML = 'Os profissionais tinham até <b>' + esc(diaHora(d.prazo)) + '</b>';
    l2.textContent = 'Fechamento ' + diaHora(d.fechamento) + '. Depois disso a agenda segue para o faturamento com o que estiver no Feegow.';
  } else {
    var min = Math.floor(ms / 6e4), h = Math.floor(min / 60), dd = Math.floor(h / 24);
    c.textContent = dd > 0 ? 'Faltam ' + dd + (dd === 1 ? ' dia e ' : ' dias e ') + (h % 24) + ' h' : (h > 0 ? 'Faltam ' + h + ' h e ' + (min % 60) + ' min' : 'Faltam ' + min + ' min');
    if(ms < 864e5) c.classList.add('laranja');
    l1.innerHTML = 'Profissionais até <b>' + esc(diaHora(d.prazo)) + '</b>';
    l2.textContent = 'Fechamento ' + diaHora(d.fechamento) + '. Depois disso a agenda segue para o faturamento com o que estiver no Feegow.';
  }
}
function iniciarRelogio(){ pintaContagem(); clearInterval(cf.timer); cf.timer = setInterval(pintaContagem, 30000); }
function pararRelogio(){ clearInterval(cf.timer); cf.timer = null; }

/* porta: a senha do balcão (pedida uma vez por sessão, como antes) */
function secretaria(){
  var host = document.getElementById('gv-conteudo'); if(!host) return;
  if(secr.senha){ carregaSec(secr.semana); return; }
  pararRelogio(); cf.d = null;
  if(window.moldura) moldura.resumo('conferencia', '');
  acoesTopo(false);
  host.innerHTML = '';
  var box = el('section', 'painel cf-porta'); box.setAttribute('aria-label', 'Senha do balcão');
  box.innerHTML = '<h2>Senha do balcão</h2><p>A conferência dos profissionais abre com a senha do balcão.</p>' +
    '<div class="cf-porta-l"><input type="password" class="fc" id="pf-sec-senha" autocomplete="off" aria-label="Senha do balcão" placeholder="Senha do balcão">' +
    '<button type="button" class="btn btn-p" id="pf-sec-ok">Abrir</button></div><p class="cf-porta-erro" id="pf-sec-erro" hidden></p>';
  host.appendChild(box);
  var inp = $('#pf-sec-senha', box), ok = $('#pf-sec-ok', box), er = $('#pf-sec-erro', box);
  var tenta = function(){
    var s = inp.value; if(!s) return;
    ok.disabled = true; er.hidden = true;
    rpc('prof_secretaria_painel', { p_senha: s, p_semana_inicio: null })
      .then(function(d){ secr.senha = s; secr.semana = d.semana_inicio; secr.semanas = semanasDe(d.semana_inicio); if(noTela()) desenhaSec(d); })
      .catch(function(e){ er.textContent = humano(e); er.hidden = false; ok.disabled = false; });
  };
  ok.onclick = tenta;
  inp.addEventListener('keydown', function(e){ if(e.key === 'Enter') tenta(); });
  inp.focus();
}
function semanasDe(inicio){
  var out = [], d0 = dLocal(inicio);
  for(var k=0;k<6;k++){
    var a = new Date(d0.getTime() - k*7*864e5), b = new Date(a.getTime() + 6*864e5);
    var iso = function(x){ return x.getFullYear() + '-' + String(x.getMonth()+1).padStart(2,'0') + '-' + String(x.getDate()).padStart(2,'0'); };
    out.push({ inicio: iso(a), fim: iso(b) });
  }
  return out;
}
function carregaSec(inicio){
  var host = document.getElementById('gv-conteudo'); if(!host) return Promise.resolve();
  var tela = host.querySelector('#cf-conf');
  if(tela) tela.classList.add('carregando'); else host.innerHTML = '<div class="lista-vazio">Carregando…</div>';
  return rpc('prof_secretaria_painel', { p_senha: secr.senha, p_semana_inicio: inicio })
    .then(function(d){ secr.semana = d.semana_inicio; if(noTela()) desenhaSec(d); })
    .catch(function(e){
      if(e.message === 'SENHA_INVALIDA' || e.message === 'BLOQUEADO_TEMPORARIAMENTE'){ secr.senha = null; if(noTela()) secretaria(); return; }
      var t2 = host.querySelector('#cf-conf');
      if(t2){ t2.classList.remove('carregando'); if(typeof toast === 'function') toast(humano(e), 'ko'); }
      else if(noTela()) host.innerHTML = '<div class="lista-vazio erro">' + esc(humano(e)) + '</div>';
    });
}
function recarregarSec(){ if(secr.senha && noTela() && document.getElementById('cf-conf')) carregaSec(secr.semana); }
function desenhaSec(d){
  var host = document.getElementById('gv-conteudo'); if(!host) return;
  relogioOffset = new Date(d.agora).getTime() - Date.now();
  cf.d = d;
  var profs = d.profissionais || [], ped = d.pedidos || [];
  var nConf = profs.filter(function(p){ return p.confirmado_em; }).length;
  var pIni = d.periodo_inicio || d.semana_inicio, pFim = d.periodo_fim || d.semana_fim;
  var fechou = new Date(d.fechamento).getTime() <= agora(), passou = new Date(d.prazo).getTime() <= agora();
  if(window.moldura) moldura.resumo('conferencia', (d.periodo_especial ? capital(mesNome(pIni)) + ', de ' : 'Semana de ') + ddmm(pIni) + ' a ' + ddmm(pFim) + ' · ' +
    nConf + ' de ' + profs.length + ' já confirmaram · ' + (fechou ? 'semana fechada' : passou ? 'prazo dos profissionais encerrado' : 'prazo ' + fmtDiaHora(d.prazo).replace('-feira', '')));
  acoesTopo(true);
  var abertos = ped.filter(function(p){ return p.situacao === 'aberto'; }), resolvidos = ped.filter(function(p){ return p.situacao !== 'aberto'; });
  var badge = document.getElementById('gv-b-prof');
  if(badge){ badge.textContent = abertos.length; badge.hidden = !abertos.length; }

  var antes = host.querySelector('#cf-conf .lista-corpo');
  var rolagem = (antes && !cf.topo) ? antes.scrollTop : 0;
  cf.topo = false;
  host.innerHTML = '';
  var wrap = el('div', 'duas-col'); wrap.id = 'cf-conf';

  /* lista dos profissionais */
  var q = semAc(cf.busca).trim();
  var base = profs.filter(function(p){ return !q || semAc(p.nome).indexOf(q) >= 0; });
  var cont = { faltam:0, confirmaram:0, todos: base.length };
  base.forEach(function(p){ cont[p.confirmado_em ? 'confirmaram' : 'faltam']++; });
  var f = cf.filtro;
  var vis = ordenaProfs(f === 'todos' ? base : base.filter(function(p){ return f === 'faltam' ? !p.confirmado_em : !!p.confirmado_em; }));
  cf.vis = vis.map(function(p){ return p.profissional_id; });
  var sec = el('section', 'lista alta'); sec.setAttribute('aria-label', 'Profissionais');
  var topo = el('div', 'lista-topo');
  var seg = el('div', 'seg'); seg.setAttribute('role', 'group'); seg.setAttribute('aria-label', 'Mostrar');
  [['faltam', 'Ainda não confirmaram', '#D70015'], ['confirmaram', 'Confirmaram', '#248A3D'], ['todos', 'Todos', '#AEAEB2']].forEach(function(x){
    var on = f === x[0];
    var b = bt(on ? 'on' : '', '<span class="q" style="background:' + x[2] + '"></span>' + x[1] + ' <span class="n">' + cont[x[0]] + '</span>', function(){
      if(cf.filtro === x[0]) return;
      cf.filtro = x[0]; cf.topo = true; desenhaSec(cf.d);
    });
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
    seg.appendChild(b);
  });
  topo.appendChild(seg);
  topo.appendChild(el('span', 'mostrando', vis.length === 1 ? '1 profissional' : vis.length + ' profissionais'));
  sec.appendChild(topo);
  var corpo = el('div', 'lista-corpo');
  if(!vis.length){
    var V = q ? ['Ninguém com esse nome', 'Confira a grafia ou limpe a busca.', 'tit'] :
      !profs.length ? ['Nenhum profissional com acesso ainda', 'O administrador cria os acessos em Acessos e configurações.', 'tit'] :
      f === 'faltam' ? ['Todo mundo confirmou', 'A conferência deste período está completa.', 'ok'] :
                       ['Ninguém confirmou ainda', 'As confirmações aparecem aqui conforme chegam.', 'tit'];
    corpo.appendChild(el('div', 'lista-vazio', '<b class="' + V[2] + '">' + V[0] + '</b><br>' + V[1]));
  }
  [['Ainda não confirmaram', vis.filter(function(p){ return !p.confirmado_em; })],
   ['Confirmaram', vis.filter(function(p){ return !!p.confirmado_em; })]].forEach(function(g){
    if(!g[1].length) return;
    corpo.appendChild(el('div', 'dia-cab', '<b>' + g[0] + '</b><span>' + (g[1].length === 1 ? '1 profissional' : g[1].length + ' profissionais') + '</span>'));
    g[1].forEach(function(p){
      var b = bt('linha cf-linha' + (cf.aberto === p.profissional_id ? ' aberta' : ''), linhaProf(p), function(){ abrirProf(p.profissional_id); });
      b.setAttribute('aria-haspopup', 'dialog'); b.setAttribute('data-prof', p.profissional_id);
      corpo.appendChild(b);
    });
  });
  sec.appendChild(corpo);
  wrap.appendChild(sec);

  /* lado: prazo, pedidos de correção e como funciona */
  var lado = el('div', 'lado');
  var pz = el('section', 'painel cf-prazo'); pz.setAttribute('aria-label', 'Prazo');
  pz.innerHTML = '<h2 class="cf-prazo-per">' + esc(periodoTxt(d)) + '</h2><span class="cf-prazo-conta" id="cf-conta"></span>' +
    '<span class="cf-prazo-l1" id="cf-l1"></span><span class="cf-prazo-l2" id="cf-l2"></span>' +
    '<div class="cf-barra"><div style="width:' + (profs.length ? Math.round(nConf / profs.length * 100) : 0) + '%"></div></div>' +
    '<span class="cf-prazo-n">' + nConf + ' de ' + profs.length + ' confirmaram</span>';
  if(secr.semanas && secr.semanas.length){
    var ls = el('label', 'cf-semana-sel', '<span>Ver a semana</span>');
    var sel = el('select', 'fc');
    var temAtual = false;
    secr.semanas.forEach(function(s, i){
      var o = el('option', '', (i === 0 ? 'Semana atual · ' : '') + ddmm(s.inicio) + ' – ' + ddmm(s.fim));
      o.value = s.inicio; if(s.inicio === d.semana_inicio){ o.selected = true; temAtual = true; }
      sel.appendChild(o);
    });
    if(!temAtual){ var o2 = el('option', '', ddmm(d.semana_inicio) + ' – ' + ddmm(d.semana_fim)); o2.value = d.semana_inicio; o2.selected = true; sel.appendChild(o2); }
    sel.addEventListener('change', function(){ cf.topo = true; carregaSec(sel.value); });
    ls.appendChild(sel);
    pz.appendChild(ls);
  }
  lado.appendChild(pz);
  var pd = el('section', 'painel'); pd.setAttribute('aria-label', 'Pedidos de correção');
  pd.appendChild(el('div', 'painel-cab', '<h2>Pedidos de correção</h2><span>' + (abertos.length === 1 ? '1 aberto' : abertos.length + ' abertos') + '</span>'));
  if(!abertos.length) pd.appendChild(el('p', 'cf-ped-vazio', 'Nenhum pedido aberto. Quando um profissional pedir correção, ele aparece aqui: corrija no Feegow e marque “Corrigi no Feegow” ou “Não procede”.'));
  var linhaPed = function(p){
    var E = pedEstado(p);
    var b = bt('cat cf-ped' + (p.situacao !== 'aberto' ? ' resolvido' : ''), '<span class="q" style="background:' + E.cor + '"></span>' +
      '<span class="t"><b>' + esc((p.profissional || '—') + ' · ' + (TIPOS[p.tipo] || p.tipo)) + '</b><small>' +
      esc([p.paciente || '(paciente não encontrado)', quandoAg(p), p.convenio].filter(Boolean).join(' · ')) + '</small></span>' +
      '<span class="cf-ped-st" style="color:' + E.cor + '">' + esc(E.rot) + '</span>', function(){ abrirPedido(p.id); });
    b.setAttribute('aria-haspopup', 'dialog');
    return b;
  };
  abertos.forEach(function(p){ pd.appendChild(linhaPed(p)); });
  if(resolvidos.length){
    pd.appendChild(el('div', 'dia-cab', '<b>Resolvidos</b><span>' + resolvidos.length + '</span>'));
    resolvidos.forEach(function(p){ pd.appendChild(linhaPed(p)); });
  }
  lado.appendChild(pd);
  lado.appendChild(el('section', 'painel nota-lado', '<h2>Como funciona</h2>' +
    '<p>Cada profissional confere a própria agenda pelo celular e confirma até o prazo.</p>' +
    '<p class="cinza">Se algo estiver errado, ele avisa o balcão pelo WhatsApp e vocês corrigem no Feegow. Quando a semana fecha, a agenda segue para o faturamento com o que estiver no Feegow.</p>'));
  wrap.appendChild(lado);
  host.appendChild(wrap);
  alturaLista();
  var c2 = host.querySelector('#cf-conf .lista-corpo'); if(c2) c2.scrollTop = rolagem;
  iniciarRelogio();
  if(cf.pinta) cf.pinta();
}

/* janela do profissional */
function abrirProf(id, ids){
  if(!window.moldura || !cf.d) return;
  ids = (ids || cf.vis || []).slice();
  var atual = id, modo = null, telRasc = '', erro = null, foto = null, fotoErro = null, fotoCarregando = false, ocupado = false;
  var P = moldura.pop({ largura: '600px', aoFechar: function(){ cf.aberto = null; cf.pinta = null; marcaLinha(); } });
  function limpa(){ modo = null; erro = null; foto = null; fotoErro = null; fotoCarregando = false; }
  function pinta(){
    var d = cf.d, p = (d.profissionais || []).find(function(x){ return x.profissional_id === atual; });
    if(!p){ P.fechar(); return; }
    cf.aberto = atual; marcaLinha();
    P.topo.innerHTML = '<span class="pop-titulo-topo">Conferência dos profissionais</span>';
    P.corpo.innerHTML = '';
    var pIni = d.periodo_inicio || d.semana_inicio, pFim = d.periodo_fim || d.semana_fim;
    P.corpo.appendChild(el('div', 'pp-cab', '<span class="pp-quando">' + esc((d.periodo_especial ? 'Conferência de ' + mesNome(pIni) : 'Semana') + ' · ' + ddmm(pIni) + ' a ' + ddmm(pFim)) + '</span>' +
      '<h2>' + esc(p.nome) + '</h2><span class="pp-l1">' + esc(p.consultas + (p.consultas === 1 ? ' consulta' : ' consultas') + ' no período · ' +
        (p.pendentes === 1 ? '1 ainda marcada ou em atendimento' : p.pendentes + ' ainda marcadas ou em atendimento')) + '</span>' +
      (p.teste_ate ? '<span class="pp-l2">Acesso de teste aberto até ' + esc(fmtTs(p.teste_ate)) + '</span>' : '')));

    var cx = el('div', 'pp-caixa');
    var conf = !!p.confirmado_em;
    var tg = el('span', 'pp-tag', esc(conf ? 'Confirmou em ' + quando(p.confirmado_em) : 'Ainda não confirmou'));
    tg.style.color = conf ? (p.confirmado_fora_do_prazo ? '#C93400' : '#248A3D') : '#D70015';
    cx.appendChild(tg);
    cx.appendChild(el('span', 'pp-txt', esc(conf ? (p.confirmado_fora_do_prazo ? 'Confirmou depois do prazo.' : 'Dentro do prazo.') + (p.foto ? ' A confirmação tem foto.' : '')
      : (p.ultimo_acesso_em ? 'Já entrou no Cortex (último acesso ' + fmtTs(p.ultimo_acesso_em) + '). Prazo: ' + fmtDiaHora(d.prazo).replace('-feira', '') + '.'
                            : 'Ainda não entrou no Cortex. Se não tem o link de acesso, o administrador gera um em Acessos e configurações.'))));
    if(conf && p.foto){
      var fb = bt('btn-claro', svgI('M4 7.5h3l1.5-2h7l1.5 2h3v11H4zM9 13a3 3 0 1 0 6 0 3 3 0 1 0-6 0', 14, 2) +
        (foto ? 'Esconder a foto' : (fotoCarregando ? 'Carregando a foto…' : 'Ver a foto')), function(){
          if(foto){ foto = null; pinta(); return; }
          if(fotoCarregando) return;
          fotoCarregando = true; fotoErro = null; pinta();
          var quem = atual;
          rpc('prof_foto_confirmacao', { p_senha: secr.senha, p_profissional_id: p.profissional_id, p_semana_inicio: d.semana_inicio })
            .then(function(r){ if(quem !== atual) return; fotoCarregando = false; foto = r; if(P.aberto) pinta(); })
            .catch(function(e){ if(quem !== atual) return; fotoCarregando = false; fotoErro = humano(e); if(P.aberto) pinta(); });
        });
      cx.appendChild(fb);
      if(fotoErro) cx.appendChild(el('span', 'pp-txt txt-vermelho', esc(fotoErro)));
      if(foto) cx.appendChild(el('div', 'cf-foto2', '<img src="data:' + esc(foto.mime) + ';base64,' + foto.base64 + '" alt="Foto da confirmação">' +
        '<span><b>Foto da confirmação</b><small>' + esc(fmtTs(foto.criado_em)) + ' · ' + Math.round((foto.tamanho || 0) / 1024) + ' KB</small></span>'));
    }
    P.corpo.appendChild(cx);

    var fone = el('div', 'pp-fone cf-fone', '<span><small>Telefone dos avisos</small><b' + (p.telefone ? '' : ' class="txt-laranja"') + '>' +
      esc(p.telefone || 'Sem telefone: não recebe os avisos') + '</b></span>');
    fone.appendChild(bt('btn btn-s', modo === 'tel' ? 'Voltar' : (p.telefone ? 'Editar' : 'Cadastrar'), function(){
      if(modo === 'tel'){ modo = null; erro = null; } else { modo = 'tel'; telRasc = p.telefone || ''; erro = null; }
      pinta();
    }));
    P.corpo.appendChild(fone);
    if(modo === 'tel'){
      var ed = el('div', 'pp-bloco cf-tel-ed');
      ed.appendChild(el('span', 'pp-l2', 'É o número que recebe os avisos da conferência semanal. DDD + número, só dígitos.'));
      var lin = el('div', 'cf-tel-l');
      var inp = el('input', 'fc'); inp.type = 'text'; inp.inputMode = 'numeric'; inp.placeholder = '62999990000'; inp.value = telRasc; inp.setAttribute('aria-label', 'Telefone');
      inp.addEventListener('input', function(){ telRasc = inp.value; });
      var sv = bt('btn btn-p', 'Salvar', function(){
        if(ocupado) return;
        ocupado = true; sv.disabled = true; sv.textContent = 'Salvando…';
        rpc('prof_balcao_telefone', { p_senha: secr.senha, p_profissional_id: p.profissional_id, p_telefone: inp.value })
          .then(function(){ ocupado = false; modo = null; erro = null; return carregaSec(d.semana_inicio); })
          .catch(function(e){ ocupado = false; erro = humano(e); if(P.aberto) pinta(); });
      });
      inp.addEventListener('keydown', function(e){ if(e.key === 'Enter') sv.click(); });
      lin.appendChild(inp); lin.appendChild(sv);
      ed.appendChild(lin);
      if(erro) ed.appendChild(el('span', 'cf-erro2', esc(erro)));
      P.corpo.appendChild(ed);
      setTimeout(function(){ if(document.body.contains(inp) && document.activeElement !== inp) inp.focus(); }, 0);
    }

    var av = p.avisos || [];
    var avb = el('div', 'pp-bloco');
    avb.appendChild(el('span', 'pp-rot', 'Avisos de WhatsApp desta semana'));
    if(!p.telefone) avb.appendChild(el('span', 'pp-txt txt-laranja', 'Sem telefone: os avisos de abertura, lembrete, última chamada e encerramento não saem.'));
    else if(!av.length) avb.appendChild(el('span', 'pp-txt', 'Nenhum aviso agendado para esta semana.'));
    else {
      var la = el('div', 'cf-avisos');
      av.forEach(function(a){
        var st = a.situacao === 'enviado' ? 'enviado' + (a.enviado_em ? ' ' + fmtTs(a.enviado_em) : '') : a.situacao === 'pendente' ? 'a enviar' :
                 a.situacao === 'erro' ? 'com erro' : a.situacao === 'cancelado' ? 'cancelado' : String(a.situacao || '—');
        la.appendChild(el('div', 'cf-aviso', '<span>' + esc(AVISO_TIPO[a.tipo] || a.tipo) + '</span><span class="' +
          (a.situacao === 'erro' ? 'txt-vermelho' : a.situacao === 'enviado' ? 'txt-verde' : 'cinza') + '">' + esc(st) + '</span>'));
      });
      avb.appendChild(la);
    }
    P.corpo.appendChild(avb);

    var meus = (d.pedidos || []).filter(function(x){ return x.profissional_id === p.profissional_id; });
    if(meus.length){
      var pb = el('div', 'pp-bloco');
      pb.appendChild(el('span', 'pp-rot', 'Pedidos de correção'));
      var lp = el('div', 'pp-lista');
      meus.forEach(function(x){
        var E = pedEstado(x);
        lp.appendChild(bt('pp-linha', '<span class="q"><b>' + esc(TIPOS[x.tipo] || x.tipo) + '</b><small>' +
          esc([x.paciente || '(paciente não encontrado)', quandoAg(x)].filter(Boolean).join(' · ')) + '</small></span>' +
          '<span class="tr" style="color:' + E.cor + ';font-weight:600">' + esc(E.rot) + '</span>' + svgI('M9.5 6l6 6-6 6', 16, 2), function(){
            var volta = p.profissional_id, lista = ids;
            abrirPedido(x.id, function(){ abrirProf(volta, lista); });
          }));
      });
      pb.appendChild(lp);
      P.corpo.appendChild(pb);
    }

    var i = ids.indexOf(atual);
    P.rodape.innerHTML = '';
    P.rodape.hidden = ids.length < 2 || i < 0;
    if(!P.rodape.hidden){
      var bA = bt('btn btn-s', svgI('M14.5 6l-6 6 6 6', 16, 2.2) + 'Anterior', function(){ if(i > 0 && !ocupado){ atual = ids[i - 1]; limpa(); pinta(); } });
      bA.disabled = i <= 0;
      var bP = bt('btn btn-p', 'Próxima' + svgI('M9.5 6l6 6-6 6', 16, 2.2), function(){ if(i < ids.length - 1 && !ocupado){ atual = ids[i + 1]; limpa(); pinta(); } });
      bP.disabled = i >= ids.length - 1;
      P.rodape.appendChild(bA); P.rodape.appendChild(el('span', 'pop-pos', (i + 1) + ' de ' + ids.length)); P.rodape.appendChild(bP);
    }
  }
  cf.pinta = function(){ if(P.aberto) pinta(); };
  pinta();
}

/* janela do pedido de correção */
function quemAssina(){
  return (typeof CU !== 'undefined' && CU && CU.nome) ? CU.nome : (prompt('Seu nome (fica registrado no pedido):') || '');
}
function abrirPedido(pid, voltar){
  if(!window.moldura || !cf.d) return;
  var modo = null, texto = '', erro = null, ocupado = false, focar = false;
  var P = moldura.pop({ largura: '600px', aoFechar: function(){ cf.pinta = null; } });
  P.rodape.classList.add('fim'); P.rodape.hidden = false;
  P.rodape.appendChild(bt('btn btn-s', 'Fechar', function(){ P.fechar(); }));
  function atender(p, como, resposta){
    var quem = quemAssina();
    if(!quem){ ocupado = false; pinta(); return; }
    rpc('prof_atender_pedido', { p_senha: secr.senha, p_pedido_id: p.id, p_situacao: como, p_quem: quem, p_resposta: resposta })
      .then(function(){ ocupado = false; modo = null; texto = ''; erro = null; return carregaSec(cf.d.semana_inicio); })
      .catch(function(e){ ocupado = false; erro = humano(e); if(P.aberto) pinta(); });
  }
  function pinta(){
    var d = cf.d, p = (d.pedidos || []).find(function(x){ return x.id === pid; });
    if(!p){ P.fechar(); return; }
    P.topo.innerHTML = '';
    if(voltar) P.topo.appendChild(bt('pop-volta', svgI('M14.5 6l-6 6 6 6', 16, 2.2) + esc(p.profissional || 'Voltar'), function(){ voltar(); }));
    else P.topo.innerHTML = '<span class="pop-titulo-topo">Pedido de correção</span>';
    P.corpo.innerHTML = '';
    var aberto = p.situacao === 'aberto', E = pedEstado(p);
    P.corpo.appendChild(el('div', 'pp-cab', '<span class="pp-quando">' + esc('Pedido de ' + (p.profissional || '—') + ' · ' + fmtTs(p.criado_em)) +
      (p.fora_do_prazo ? ' · <span class="txt-laranja">fora do prazo</span>' : '') + '</span>' +
      '<h2>' + esc(TIPOS[p.tipo] || p.tipo) + '</h2>' +
      '<span class="pp-l1">' + esc([p.paciente || '(paciente não encontrado)', p.data ? DIAS[dLocal(p.data).getDay()] + ' ' + ddmm(p.data) + (p.horario ? ' às ' + hhmm(p.horario) : '') : '', p.convenio].filter(Boolean).join(' · ')) + '</span>'));
    var cx = el('div', 'pp-caixa');
    var tg = el('span', 'pp-tag', esc(aberto ? (p.mudou_no_feegow ? 'Aberto · a mudança já chegou do Feegow' : 'Aberto') : E.rot)); tg.style.color = E.cor;
    cx.appendChild(tg);
    if(p.detalhe) cx.appendChild(el('span', 'pp-txt', '<b>O que ele escreveu:</b> ' + esc(p.detalhe)));
    cx.appendChild(el('span', 'pp-txt', 'Status quando pediu: ' + esc(p.status_no_pedido || '—') + ' · agora: <b>' + esc(p.status_atual || '—') + '</b>'));
    if(p.agendamento_sumiu) cx.appendChild(el('span', 'pp-txt txt-vermelho', 'O agendamento sumiu do Feegow.'));
    if(!aberto) cx.appendChild(el('span', 'pp-txt', esc((p.situacao === 'atendido' ? 'Corrigido' : p.situacao === 'recusado' ? 'Não procede' : p.situacao) +
      (p.atendido_por ? ', por ' + p.atendido_por : '') + (p.atendido_em ? ', em ' + fmtTs(p.atendido_em) : '')) + (p.resposta ? '. <b>Resposta:</b> ' + esc(p.resposta) : '.')));
    P.corpo.appendChild(cx);
    if(aberto){
      if(modo === 'recusar'){
        var c = el('div', 'mal-conf');
        c.appendChild(el('b', '', 'Por que não procede?'));
        c.appendChild(el('span', 'pp-l2', 'O profissional vai ver esta resposta.'));
        var ta = el('textarea', 'pp-nota'); ta.rows = 3; ta.value = texto; ta.setAttribute('aria-label', 'Resposta ao profissional');
        ta.addEventListener('input', function(){ texto = ta.value; if(erro && texto.trim()){ erro = null; var e1 = c.querySelector('.mal-erro-txt'); if(e1) e1.remove(); } });
        c.appendChild(ta);
        if(erro) c.appendChild(el('span', 'mal-erro-txt', esc(erro)));
        var l = el('div', 'mal-conf-bt');
        l.appendChild(bt('btn btn-s', 'Cancelar', function(){ if(ocupado) return; modo = null; texto = ''; erro = null; pinta(); }));
        var s = bt('btn btn-p', 'Enviar resposta', function(){
          if(ocupado) return;
          if(!texto.trim()){ erro = 'Escreva o motivo: o profissional vai ver.'; focar = true; pinta(); return; }
          ocupado = true; s.disabled = true; s.textContent = 'Salvando…';
          atender(p, 'recusado', texto);
        });
        l.appendChild(s);
        c.appendChild(l);
        P.corpo.appendChild(c);
        if(focar){ focar = false; setTimeout(function(){ if(document.body.contains(ta)) ta.focus(); }, 0); }
      } else {
        var ac = el('div', 'pp-bloco mal-acoes');
        ac.appendChild(el('span', 'pp-rot', 'Corrigiu no Feegow?'));
        var lb = el('div', 'pp-adm-bt');
        var b1 = bt('btn btn-g btn-p', 'Corrigi no Feegow', function(){
          if(ocupado) return;
          ocupado = true; b1.disabled = true; b1.textContent = 'Salvando…';
          atender(p, 'atendido', null);
        });
        lb.appendChild(b1);
        lb.appendChild(bt('btn btn-g btn-s', 'Não procede', function(){ if(ocupado) return; modo = 'recusar'; texto = ''; erro = null; focar = true; pinta(); }));
        ac.appendChild(lb);
        if(erro) ac.appendChild(el('span', 'mal-erro-txt', esc(erro)));
        P.corpo.appendChild(ac);
      }
    }
  }
  cf.pinta = function(){ if(P.aberto && !modo) pinta(); };
  pinta();
}

/* ═══ ⚙️ ADMINISTRAÇÃO — acessos, balcão, configurações (só o administrador do painel) ═══ */
function admin(){
  if(!painelAdmin()) return;
  var host = document.getElementById('gv-conteudo'); if(!host) return;
  if(adm.senha){ carregaAdmin(); return; }
  rpc('prof_admin_existe').then(function(r){
    if(!r.existe) return bootstrapAdmin();
    var m = modal('Senha de administração',
      '<p class="sub" style="margin-bottom:8px">É a senha do módulo dos profissionais (não é o PIN do Cortex). Pedida uma vez por sessão.</p>' +
      '<div class="fg"><input type="password" class="fc" id="pf-adm-senha" autocomplete="off"></div><p class="pf-erro" id="pf-adm-erro" style="display:none"></p>',
      '<button type="button" class="pf-btn" data-volta>Voltar</button><button type="button" class="pf-btn pf-pri" id="pf-adm-ok">Entrar</button>');
    $('[data-volta]', m.el).onclick = m.fecha;
    var tenta = function(){
      var sn = $('#pf-adm-senha', m.el).value; if(!sn) return;
      $('#pf-adm-ok', m.el).disabled = true;
      rpc('prof_admin_listar', { p_senha_admin: sn }).then(function(d){ adm.senha = sn; adm.dados = d; m.fecha(); desenhaAdmin(); })
        .catch(function(e){ erroEm($('#pf-adm-erro', m.el), humano(e)); $('#pf-adm-ok', m.el).disabled = false; });
    };
    $('#pf-adm-ok', m.el).onclick = tenta;
    $('#pf-adm-senha', m.el).addEventListener('keydown', function(e){ if(e.key === 'Enter') tenta(); });
    $('#pf-adm-senha', m.el).focus();
  }).catch(function(e){ alert(humano(e)); });
}
function bootstrapAdmin(){
  var m = modal('Primeiro acesso — defina a senha de administração',
    '<p class="sub" style="margin-bottom:8px">Esta senha protege o cadastro dos profissionais e as configurações. Mínimo 6 caracteres. Guarde-a.</p>' +
    '<div class="fg"><label class="fl">Senha</label><input type="password" class="fc" id="pf-b1" autocomplete="new-password"></div>' +
    '<div class="fg"><label class="fl">Repita</label><input type="password" class="fc" id="pf-b2" autocomplete="new-password"></div><p class="pf-erro" id="pf-b-erro" style="display:none"></p>',
    '<button type="button" class="pf-btn" data-volta>Voltar</button><button type="button" class="pf-btn pf-pri" id="pf-b-ok">Definir</button>');
  $('[data-volta]', m.el).onclick = m.fecha;
  $('#pf-b-ok', m.el).onclick = function(){
    var s1 = $('#pf-b1', m.el).value, s2 = $('#pf-b2', m.el).value;
    if(s1.length < 6) return erroEm($('#pf-b-erro', m.el), 'Mínimo 6 caracteres.');
    if(s1 !== s2) return erroEm($('#pf-b-erro', m.el), 'As senhas não conferem.');
    rpc('prof_admin_bootstrap', { p_senha: s1 }).then(function(){ adm.senha = s1; m.fecha(); carregaAdmin(); })
      .catch(function(e){ erroEm($('#pf-b-erro', m.el), humano(e)); });
  };
}
function carregaAdmin(){
  var host = document.getElementById('gv-conteudo'); if(!host) return;
  host.innerHTML = '<p class="gv-vazio">Carregando…</p>';
  rpc('prof_admin_listar', { p_senha_admin: adm.senha }).then(function(d){ adm.dados = d; desenhaAdmin(); })
    .catch(function(e){ if(e.message === 'SENHA_INVALIDA' || e.message === 'BLOQUEADO_TEMPORARIAMENTE'){ adm.senha = null; admin(); return; } host.innerHTML = '<p class="gv-vazio">⚠️ ' + esc(humano(e)) + '</p>'; });
}
function campo(id, label, tipo, valor, extra){
  return '<label for="' + id + '">' + label + '</label><input type="' + (tipo || 'text') + '" id="' + id + '" value="' + esc(valor == null ? '' : valor) + '" ' + (extra || '') + '>';
}
function msgEm(el, txt, erro){ el.textContent = txt; el.className = 'pf-adm-msg' + (erro ? ' erro' : ''); }
function desenhaAdmin(){
  var host = document.getElementById('gv-conteudo'); if(!host) return;
  var d = adm.dados, P = d.parametros || {}, H = P.avisos_horas || {}, B = d.balcao || {}, J = d.janela || {}, PE = P.periodo_especial || {};
  host.innerHTML = '';
  var topo = document.createElement('div'); topo.className = 'oc-topo';
  topo.innerHTML = '<h2>Profissionais: acessos e configurações</h2>' +
    '<p>Cada profissional entra na página de confirmação com a própria senha. Telefone é o que recebe os avisos de WhatsApp (só dígitos, com DDD). ' +
    'Remover um acesso não apaga o histórico de semanas e pedidos.</p>' +
    '<div class="pf-form"><button type="button" class="gv-btn" id="pf-adm-voltar">Voltar para a conferência</button>' +
    '<button type="button" class="gv-btn" id="pf-adm-recarregar">Atualizar</button>' +
    '<button type="button" class="gv-btn verde" id="pf-adm-repasse">Repasse: quanto cada um recebe</button>' +
    '<button type="button" class="gv-btn verde" id="pf-adm-f5">Demonstrativos Unimed (F5)</button></div>';
  host.appendChild(topo);
  $('#pf-adm-voltar', topo).onclick = function(){ host.innerHTML = ''; carregaSec(secr.semana); };
  $('#pf-adm-recarregar', topo).onclick = carregaAdmin;
  $('#pf-adm-repasse', topo).onclick = function(){ carregaRepasse(null); };
  $('#pf-adm-f5', topo).onclick = carregaF5;

  var urlSugerida = P.url_pagina || (location.href.split('?')[0].split('#')[0] + '?conferir=1');
  var grid = document.createElement('div'); grid.className = 'pf-adm-grid';
  grid.innerHTML =
    '<div class="pf-adm-card"><h3>Configurações do módulo</h3>' +
      campo('pf-c-url', 'Link da página (vai nos avisos)', 'text', urlSugerida, 'placeholder="https://…/?conferir=1"') +
      '<div class="linha2"><div>' + campo('pf-c-prazo', 'Prazo dos profissionais (segunda)', 'time', P.prazo_profissional_hora) + '</div>' +
      '<div>' + campo('pf-c-fech', 'Fechamento real (terça)', 'time', P.fechamento_hora) + '</div></div>' +
      '<label for="pf-c-abdia">Aviso de abertura sai no</label>' +
      '<select id="pf-c-abdia" class="fc" style="width:100%"><option value="domingo"' + (P.abertura_dia !== 'segunda' ? ' selected' : '') + '>domingo (a semana toda já dá para conferir)</option>' +
      '<option value="segunda"' + (P.abertura_dia === 'segunda' ? ' selected' : '') + '>segunda-feira</option></select>' +
      '<label>Horários dos avisos (vazio = desligado)</label><div class="linha2">' +
        '<div>' + campo('pf-h-abertura', 'Abertura (no dia escolhido acima)', 'time', H.abertura) + '</div>' +
        '<div>' + campo('pf-h-lembrete', 'Lembrete (segunda)', 'time', H.lembrete) + '</div>' +
        '<div>' + campo('pf-h-ultimo', 'Última chamada (segunda)', 'time', H.ultimo) + '</div>' +
        '<div>' + campo('pf-h-encerrado', 'Encerrado (terça)', 'time', H.encerrado) + '</div>' +
        '<div>' + campo('pf-h-secretaria', 'Resumo ao balcão (terça)', 'time', H.secretaria) + '</div>' +
        '<div>' + campo('pf-c-ret', 'Guardar fotos (dias)', 'number', P.fotos_retencao_dias, 'min="7" max="3650"') + '</div></div>' +
      '<label style="display:flex;align-items:center;gap:8px;text-transform:none;letter-spacing:0;font-size:13px;margin-top:10px"><input type="checkbox" id="pf-c-foto"' + (P.foto_obrigatoria ? ' checked' : '') + '> exigir foto ao confirmar</label>' +
      '<div class="rodape"><button type="button" class="gv-btn verde" id="pf-c-salvar">Salvar configurações</button><span class="pf-adm-msg" id="pf-c-msg"></span></div></div>' +
    '<div class="pf-adm-card"><h3>Período especial (só para a semana da vez)</h3>' +
      '<p class="sub">Semana da vez: <b>' + (J.semana_inicio ? ddmm(J.semana_inicio) + ' – ' + ddmm(J.semana_fim || J.semana_inicio) : '—') + '</b>' + (J.periodo_especial && J.periodo_inicio ? ' · hoje cobrindo <b>' + ddmm(J.periodo_inicio) + ' – ' + ddmm(J.periodo_fim) + '</b>' : ' · sem período especial') + '</p>' +
      '<p class="sub">Use quando a conferência precisar cobrir mais dias do que a semana (a primeira rodada, por exemplo). Prazo, fechamento e abertura não mudam.</p>' +
      '<div class="linha2"><div>' + campo('pf-pe-ini', 'De', 'date', PE.inicio) + '</div><div>' + campo('pf-pe-fim', 'Até', 'date', PE.fim) + '</div></div>' +
      '<div class="rodape"><button type="button" class="gv-btn verde" id="pf-pe-aplicar">Aplicar à semana da vez</button><button type="button" class="gv-btn" id="pf-pe-limpar">Limpar</button><span class="pf-adm-msg" id="pf-pe-msg"></span></div></div>' +
    '<div class="pf-adm-card"><h3>Balcão (secretaria)</h3>' +
      '<p class="sub">Senha compartilhada do balcão para a aba Semana. O telefone recebe o resumo de terça.</p>' +
      campo('pf-b-tel', 'Telefone do balcão', 'text', P.telefone_secretaria || B.telefone, 'inputmode="numeric" placeholder="62999990000"') +
      '<div class="linha2"><div>' + campo('pf-b-s1', 'Nova senha (vazio = mantém)', 'password', '', 'autocomplete="new-password"') + '</div>' +
      '<div>' + campo('pf-b-s2', 'Repita', 'password', '', 'autocomplete="new-password"') + '</div></div>' +
      '<div class="rodape"><button type="button" class="gv-btn verde" id="pf-b-salvar">Salvar balcão</button><span class="pf-adm-msg" id="pf-b-msg"></span></div>' +
      '<h3 style="margin-top:16px">Senha de administração</h3>' +
      '<div class="linha2"><div>' + campo('pf-a-s1', 'Nova senha', 'password', '', 'autocomplete="new-password"') + '</div>' +
      '<div>' + campo('pf-a-s2', 'Repita', 'password', '', 'autocomplete="new-password"') + '</div></div>' +
      '<div class="rodape"><button type="button" class="gv-btn" id="pf-a-salvar">Trocar senha de administração</button><span class="pf-adm-msg" id="pf-a-msg"></span></div></div>';
  host.appendChild(grid);

  $('#pf-c-salvar', grid).onclick = function(){
    var horas = {}, ids = { abertura:'pf-h-abertura', lembrete:'pf-h-lembrete', ultimo:'pf-h-ultimo', encerrado:'pf-h-encerrado', secretaria:'pf-h-secretaria' };
    Object.keys(ids).forEach(function(k){ var v = $('#' + ids[k], grid).value; if(v) horas[k] = v; });
    var msg = $('#pf-c-msg', grid); msgEm(msg, 'salvando…');
    rpc('prof_admin_parametros', { p_senha_admin: adm.senha, p_url_pagina: $('#pf-c-url', grid).value, p_telefone_secretaria: $('#pf-b-tel', grid).value,
        p_prazo_profissional_hora: $('#pf-c-prazo', grid).value || null, p_fechamento_hora: $('#pf-c-fech', grid).value || null,
        p_avisos_horas: horas, p_foto_obrigatoria: $('#pf-c-foto', grid).checked, p_fotos_retencao_dias: Number($('#pf-c-ret', grid).value) || null,
        p_abertura_dia: $('#pf-c-abdia', grid).value })
      .then(function(){ msgEm(msg, 'salvo ✔'); }).catch(function(e){ msgEm(msg, humano(e), true); });
  };
  $('#pf-pe-aplicar', grid).onclick = function(){
    var ini = $('#pf-pe-ini', grid).value, fim = $('#pf-pe-fim', grid).value, msg = $('#pf-pe-msg', grid);
    if(!ini || !fim) return msgEm(msg, 'Preencha as duas datas.', true);
    if(!J.semana_inicio) return msgEm(msg, 'Atualize a página (SQL v1.8 ainda não instalado).', true);
    msgEm(msg, 'salvando…');
    rpc('prof_admin_parametros', { p_senha_admin: adm.senha, p_periodo_especial: { semana: J.semana_inicio, inicio: ini, fim: fim } })
      .then(function(){ msgEm(msg, 'aplicado ✔'); carregaAdmin(); }).catch(function(e){ msgEm(msg, humano(e), true); });
  };
  $('#pf-pe-limpar', grid).onclick = function(){
    var msg = $('#pf-pe-msg', grid); msgEm(msg, 'limpando…');
    rpc('prof_admin_parametros', { p_senha_admin: adm.senha, p_periodo_especial: { limpar: true } })
      .then(function(){ msgEm(msg, 'limpo ✔'); carregaAdmin(); }).catch(function(e){ msgEm(msg, humano(e), true); });
  };
  $('#pf-b-salvar', grid).onclick = function(){
    var s1 = $('#pf-b-s1', grid).value, s2 = $('#pf-b-s2', grid).value, msg = $('#pf-b-msg', grid);
    if(s1 !== s2) return msgEm(msg, 'As senhas não conferem.', true);
    msgEm(msg, 'salvando…');
    rpc('prof_admin_balcao', { p_senha_admin: adm.senha, p_senha_nova: s1 || null, p_telefone: $('#pf-b-tel', grid).value })
      .then(function(){ msgEm(msg, 'salvo ✔'); if(s1){ secr.senha = s1; } $('#pf-b-s1', grid).value = ''; $('#pf-b-s2', grid).value = ''; })
      .catch(function(e){ msgEm(msg, humano(e), true); });
  };
  $('#pf-a-salvar', grid).onclick = function(){
    var s1 = $('#pf-a-s1', grid).value, s2 = $('#pf-a-s2', grid).value, msg = $('#pf-a-msg', grid);
    if(s1.length < 6) return msgEm(msg, 'Mínimo 6 caracteres.', true);
    if(s1 !== s2) return msgEm(msg, 'As senhas não conferem.', true);
    rpc('prof_admin_trocar_senha', { p_senha_admin: adm.senha, p_senha_nova: s1 })
      .then(function(){ adm.senha = s1; msgEm(msg, 'trocada ✔'); $('#pf-a-s1', grid).value = ''; $('#pf-a-s2', grid).value = ''; })
      .catch(function(e){ msgEm(msg, humano(e), true); });
  };

  var sec = document.createElement('div'); sec.className = 'adm-sec';
  var profs = d.profissionais || [];
  sec.innerHTML = 'Profissionais <small>(' + profs.filter(function(p){ return p.tem_acesso; }).length + ' com acesso de ' + profs.length + ' com agenda nos últimos 90 dias)</small> ' +
    '<input class="pf-adm-busca" id="pf-adm-busca" type="search" placeholder="Buscar nome…" value="' + esc(adm.filtro) + '">';
  host.appendChild(sec);
  var tb = document.createElement('div'); tb.className = 'adm-rolagem'; host.appendChild(tb);
  var render = function(){
    var f = (adm.filtro || '').toLowerCase();
    var lista = profs.filter(function(p){ return !f || (p.nome_feegow || '').toLowerCase().indexOf(f) >= 0 || (p.nome_exibicao || '').toLowerCase().indexOf(f) >= 0; });
    var h = '<table class="adm"><tr><th>Profissional (Feegow)</th><th>Consultas 90d</th><th>Acesso</th><th>Nome na página</th><th>Telefone</th><th>1º acesso</th><th>Semana da vez</th><th>Ações</th></tr>';
    if(!lista.length) h += '<tr><td colspan="8">Ninguém com esse nome.</td></tr>';
    lista.forEach(function(p){
      h += '<tr><td><b>' + esc(p.nome_feegow) + '</b>' + (p.situacao_feegow !== 'ativo' ? ' <span class="tag-sit tag-s1">' + esc(p.situacao_feegow) + '</span>' : '') + '</td>' +
        '<td>' + p.consultas_90d + ' <small>(' + p.unimed_90d + ' Unimed)</small></td>' +
        '<td>' + (p.tem_acesso ? (p.ativo ? '<span class="tag-sit" style="background:var(--ok-fundo);color:var(--ok)">sim</span>' : '<span class="tag-sit tag-s1">inativo</span>') + (p.bloqueado ? ' <span class="tag-sit tag-s0">bloqueado 15 min</span>' : '') : '<span class="tag-sit">não</span>') + '</td>' +
        '<td>' + esc(p.nome_exibicao || '—') + '</td><td>' + esc(p.telefone || '—') + '</td>' +
        '<td style="font-size:12.5px">' + (p.senha_definida_em ? '<span class="tag-sit" style="background:var(--ok-fundo);color:var(--ok)">senha definida ' + fmtTs(p.senha_definida_em) + '</span>'
          : p.convite_token ? '<span class="tag-sit tag-s1">link gerado · vale até ' + fmtTs(p.convite_expira_em) + '</span>'
          : p.aguardando_1o_acesso ? '<span class="tag-sit tag-s0">link vencido — gere outro</span>'
          : (p.tem_acesso ? '<small>senha criada pelo administrador</small>' : '—')) + '</td>' +
        '<td style="font-size:12.5px">' + (p.tem_acesso ? ((p.confirmou_em ? '<span class="tag-sit" style="background:var(--ok-fundo);color:var(--ok)">confirmou ' + fmtTs(p.confirmou_em) + '</span>' : '<span class="tag-sit">não confirmou</span>') + (p.teste_ate ? '<br><span class="tag-sit tag-s1">teste até ' + fmtTs(p.teste_ate) + '</span>' : '') + (p.ultimo_acesso_em ? '<br><small>último acesso ' + fmtTs(p.ultimo_acesso_em) + '</small>' : '')) : '—') + '</td>' +
        '<td style="white-space:nowrap">' + '<button type="button" class="gv-btn verde mini" data-convite="' + p.profissional_id + '" title="Gera (ou copia) o link para o profissional escolher a própria senha">Link de acesso</button> ' + (p.tem_acesso
          ? '<button type="button" class="gv-btn mini" data-edita="' + p.profissional_id + '">Editar</button> <button type="button" class="gv-btn mini" data-remove="' + p.profissional_id + '">Remover</button>' +
            (p.teste_ate ? ' <button type="button" class="gv-btn mini" data-teste="' + p.profissional_id + '" data-min="0">Fechar teste</button>' : ' <button type="button" class="gv-btn mini" data-teste="' + p.profissional_id + '" data-min="120" title="Abre a conferência agora para este profissional, por 2 horas, ignorando o domingo">Abrir p/ teste 2h</button>') +
            (p.confirmou_em ? ' <button type="button" class="gv-btn mini" data-desfaz="' + p.profissional_id + '" title="Apaga a confirmação (e a foto) desta semana para ele poder confirmar de novo">Desfazer confirmação</button>' : '')
          : '<button type="button" class="gv-btn verde mini" data-edita="' + p.profissional_id + '">Criar acesso</button>') + '</td></tr>';
    });
    tb.innerHTML = h + '</table>';
    Array.prototype.forEach.call(tb.querySelectorAll('button[data-edita]'), function(b){ b.onclick = function(){ editaAcesso(Number(b.getAttribute('data-edita'))); }; });
    Array.prototype.forEach.call(tb.querySelectorAll('button[data-convite]'), function(b){ b.onclick = function(){ linkAcesso(Number(b.getAttribute('data-convite'))); }; });
    Array.prototype.forEach.call(tb.querySelectorAll('button[data-remove]'), function(b){ b.onclick = function(){ removeAcesso(Number(b.getAttribute('data-remove'))); }; });
    Array.prototype.forEach.call(tb.querySelectorAll('button[data-teste]'), function(b){ b.onclick = function(){
      rpc('prof_admin_abrir_teste', { p_senha_admin: adm.senha, p_profissional_id: Number(b.getAttribute('data-teste')), p_minutos: Number(b.getAttribute('data-min')) })
        .then(carregaAdmin).catch(function(e){ alert(humano(e)); }); }; });
    Array.prototype.forEach.call(tb.querySelectorAll('button[data-desfaz]'), function(b){ b.onclick = function(){
      if(!confirm('Desfazer a confirmação desta semana? A foto também é apagada.')) return;
      rpc('prof_admin_desfazer_confirmacao', { p_senha_admin: adm.senha, p_profissional_id: Number(b.getAttribute('data-desfaz')), p_semana_inicio: null })
        .then(carregaAdmin).catch(function(e){ alert(humano(e)); }); }; });
  };
  render();
  $('#pf-adm-busca', sec).addEventListener('input', function(e){ adm.filtro = e.target.value; render(); });
}
/* ═══ 🔗 link de 1º acesso (convite) — v2.2 ═══ */
function linkDoConvite(token){ return location.origin + location.pathname + '?conferir=1&convite=' + encodeURIComponent(token); }
function linkAcesso(profId, forcarNovo){
  var p = (adm.dados.profissionais || []).find(function(x){ return x.profissional_id === profId; }); if(!p) return;
  var pronto = (!forcarNovo && p.convite_token)
    ? Promise.resolve({ token: p.convite_token, expira_em: p.convite_expira_em, nome: p.nome_exibicao || p.nome_feegow, reaproveitado: true })
    : rpc('prof_admin_convite', { p_senha_admin: adm.senha, p_profissional_id: profId }).then(function(r){ carregaAdmin(); return r; });
  pronto.then(function(r){ mostraLink(p, r); }).catch(function(e){ alert(humano(e)); });
}
/* mensagem do convite — v2.6: com período especial do fechamento do mês em vigor, fala do mês inteiro; senão, da rotina semanal */
function msgConvite(primeiro, link, expira){
  var P = (adm.dados && adm.dados.parametros) || {}, pe = P.periodo_especial || {};
  var ate = new Date(expira).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit' });
  var fech = pe.fechamento ? new Date(String(pe.fechamento).replace(' ', 'T') + ':00-03:00') : null;
  var mesInteiro = pe.alvo === 'cauda' && pe.fim && fech && !isNaN(fech) && Date.now() < fech.getTime();
  var hora = String(P.prazo_profissional_hora || '22:00').replace(':00', 'h');
  var passos = function(confirmar, extra2, extra4){
    return '1️⃣ *Crie sua senha* — abra o link abaixo pelo celular e escolha uma senha. Nas próximas vezes, é só abrir o mesmo link e entrar com o seu nome e essa senha.\n\n' +
      '2️⃣ *Confira consulta por consulta* — cada uma aparece como *Atendido* ou *Não compareceu*.' + extra2 + '\n\n' +
      '3️⃣ *Achou algo errado?* Avise a recepção por aqui e *não confirme ainda*. A correção aparece no Cortex até a manhã seguinte — aí é só conferir de novo.\n\n' +
      '4️⃣ *Tudo 100% certo?* Toque em *"' + confirmar + '"*, marque a declaração e tire uma selfie.' + extra4 + ' ✅\n\n' +
      '⚠️ Depois de confirmado, não dá mais para alterar — por isso, só confirme quando estiver tudo certinho.\n\n';
  };
  var corpo;
  if(mesInteiro){
    var mes = mesNome(pe.fim);
    corpo = 'Novidade boa: a partir de agora, a conferência da agenda e o seu recibo de repasse ficam no *Cortex*, o sistema da clínica. Chega de recibo indo e voltando pelo WhatsApp.\n\n' +
      'Nesta primeira vez, *' + mes + ' inteiro* está aberto para você conferir. É assim:\n\n' +
      passos('Está tudo certo — confirmar o mês', ' Na mesma tela você já vê a prévia do seu repasse de ' + mes + ', com o valor e a % de agenda.',
             ' Pronto: seu recibo de ' + mes + ' sai na hora, na tela e em PDF.') +
      'A partir da próxima semana, a conferência passa a ser semanal, toda segunda-feira, e no fim do mês o recibo sai do mesmo jeito.\n\n';
  } else {
    corpo = 'A conferência da sua agenda e o seu recibo de repasse ficam no *Cortex*, o sistema da clínica.\n\n' +
      'Toda semana você confere a agenda da semana anterior, até segunda-feira às ' + hora + '. É assim:\n\n' +
      passos('Está tudo certo — confirmar', '', '') +
      'No fim do mês, ao confirmar os últimos dias, o seu recibo de repasse sai na hora, na tela e em PDF — e antes de confirmar você já vê a prévia do valor.\n\n';
  }
  return 'Olá, ' + primeiro + '! Tudo bem? 😊\n\n' + corpo +
    'Qualquer dúvida, é só me chamar. 🤍\n\n' +
    '👇 Seu link de primeiro acesso (é pessoal e vale até ' + ate + '):\n' + link;
}
function mostraLink(p, r){
  var link = linkDoConvite(r.token), nome = String(r.nome || p.nome_exibicao || p.nome_feegow || '').trim();
  var primeiro = nome.split(' ')[0] || ''; primeiro = primeiro.charAt(0) + primeiro.slice(1).toLowerCase();
  var msg = msgConvite(primeiro, link, r.expira_em);
  var m = modal('🔗 Link de acesso — ' + esc(nome),
    '<p style="font-size:13.5px;color:#555;margin-bottom:8px">' + (r.reaproveitado ? 'Este link já tinha sido gerado e ainda vale' : (r.criado ? 'Acesso criado e link gerado' : 'Link gerado')) +
      ' — válido até <b>' + fmtTs(r.expira_em) + '</b>. Quem abrir escolhe a própria senha; o link deixa de funcionar depois de usado.' +
      (p.senha_definida_em || (p.tem_acesso && !p.aguardando_1o_acesso && !r.criado) ? ' <b>Atenção:</b> este profissional já tem senha — ao usar o link, ela será trocada.' : '') + '</p>' +
    '<div class="fg"><label class="fl">Link</label><input type="text" class="fc" id="pf-lk-url" readonly value="' + esc(link) + '"></div>' +
    '<div class="fg"><label class="fl">Mensagem pronta para o WhatsApp</label><textarea class="fc" id="pf-lk-msg" rows="14" style="font-family:inherit;font-size:13px">' + esc(msg) + '</textarea></div>' +
    '<p id="pf-lk-ok" style="display:none;color:var(--ok);font-size:13px">Copiado ✔</p>',
    '<button type="button" class="pf-btn" id="pf-lk-novo" title="Gera outro link e invalida este">Gerar novo link</button>' +
    '<button type="button" class="pf-btn" id="pf-lk-cl">Copiar só o link</button>' +
    '<button type="button" class="pf-btn pf-pri" id="pf-lk-cm">Copiar mensagem</button>');
  var copia = function(texto, el){
    var feito = function(){ var ok = $('#pf-lk-ok', m.el); ok.style.display = 'block'; setTimeout(function(){ ok.style.display = 'none'; }, 2000); };
    var manual = function(){ el.focus(); el.select(); try{ document.execCommand('copy'); feito(); }catch(e){ alert('Selecione o texto e copie (Ctrl+C).'); } };
    if(navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(texto).then(feito).catch(manual); else manual();
  };
  $('#pf-lk-cl', m.el).onclick = function(){ copia(link, $('#pf-lk-url', m.el)); };
  $('#pf-lk-cm', m.el).onclick = function(){ copia($('#pf-lk-msg', m.el).value, $('#pf-lk-msg', m.el)); };
  $('#pf-lk-novo', m.el).onclick = function(){ if(!confirm('Gerar um novo link? O anterior deixa de funcionar.')) return; m.fecha(); linkAcesso(p.profissional_id, true); };
}
function editaAcesso(profId){
  var p = (adm.dados.profissionais || []).find(function(x){ return x.profissional_id === profId; }); if(!p) return;
  var novo = !p.tem_acesso;
  var m = modal((novo ? 'Criar acesso — ' : 'Editar — ') + esc(p.nome_feegow),
    '<div class="fg"><label class="fl">Nome como aparece para o profissional</label><input type="text" class="fc" id="pf-e-nome" value="' + esc(p.nome_exibicao || p.nome_feegow) + '"></div>' +
    '<div class="fg"><label class="fl">Telefone (DDD + número, só dígitos)</label><input type="text" class="fc" id="pf-e-tel" inputmode="numeric" value="' + esc(p.telefone || '') + '" placeholder="62999990000"></div>' +
    '<div class="fg"><label class="fl">' + (novo ? 'Senha' : 'Nova senha (vazio = mantém a atual)') + '</label><input type="password" class="fc" id="pf-e-s1" autocomplete="new-password"></div>' +
    '<div class="fg"><label class="fl">Repita a senha</label><input type="password" class="fc" id="pf-e-s2" autocomplete="new-password"></div>' +
    (novo ? '' : '<label style="display:flex;align-items:center;gap:8px;font-size:13px"><input type="checkbox" id="pf-e-ativo"' + (p.ativo ? ' checked' : '') + '> acesso ativo</label>') +
    '<p class="pf-erro" id="pf-e-erro" style="display:none"></p>',
    '<button type="button" class="pf-btn" data-volta>Voltar</button><button type="button" class="pf-btn pf-pri" id="pf-e-ok">' + (novo ? 'Criar' : 'Salvar') + '</button>');
  $('[data-volta]', m.el).onclick = m.fecha;
  $('#pf-e-ok', m.el).onclick = function(){
    var s1 = $('#pf-e-s1', m.el).value, s2 = $('#pf-e-s2', m.el).value, err = $('#pf-e-erro', m.el);
    if(novo && s1.length < 4) return erroEm(err, 'Senha com pelo menos 4 caracteres.');
    if(s1 !== s2) return erroEm(err, 'As senhas não conferem.');
    var ativoEl = $('#pf-e-ativo', m.el);
    $('#pf-e-ok', m.el).disabled = true;
    rpc('prof_admin_salvar_acesso', { p_senha_admin: adm.senha, p_profissional_id: profId, p_nome: $('#pf-e-nome', m.el).value,
        p_senha: s1 || null, p_telefone: $('#pf-e-tel', m.el).value, p_ativo: ativoEl ? ativoEl.checked : true })
      .then(function(){ m.fecha(); carregaAdmin(); })
      .catch(function(e){ erroEm(err, humano(e)); $('#pf-e-ok', m.el).disabled = false; });
  };
}
function removeAcesso(profId){
  var p = (adm.dados.profissionais || []).find(function(x){ return x.profissional_id === profId; }); if(!p) return;
  if(!confirm('Remover o acesso de ' + p.nome_feegow + '?\n\nO histórico de semanas e pedidos continua guardado. Para só impedir a entrada, use Editar → desmarcar "acesso ativo".')) return;
  rpc('prof_admin_remover_acesso', { p_senha_admin: adm.senha, p_profissional_id: profId })
    .then(function(){ carregaAdmin(); }).catch(function(e){ alert(humano(e)); });
}

/* ═══ 💵 F5 — DEMONSTRATIVOS UNIMED (administrador) · v1.1 (22/09/2026) ═══
   Sobe o XML "análise de conta" da Unimed (ensaio → valer), lista os itens presos
   aguardando decisão, o catálogo de glosas e os demonstrativos lançados.
   Tudo via RPC f5_* (senha de administração = adm.senha). */
var F5_ROTULO = { paga:'✅ Pagas', paga_parcial:'✅ Pagas a menor', divida:'❌ Glosadas → dívida', cancelar:'❌ Glosadas → canceladas (já pagas)',
  duplicata:'♻️ Duplicatas (f0 segue a paga)', estorno:'↩️ Estornos', sem_par:'🧾 Pagas sem par (consumo fora do sistema)',
  sem_par_glosada:'📝 Glosadas sem par (só registro)', decidir:'🔒 Presas aguardando decisão' };
var F5_DECISOES = [['divida','Dívida'],['cancelar','Cancelar'],['paga','Paga'],['ignorar','Ignorar']];
var F5_TRATAMENTOS = [['divida','dívida'],['paga','paga'],['cancelar','cancelar'],['estorno','estorno'],['decidir','decidir']];
function f5Get(rota){
  return fetch(PCFG.url + '/rest/v1/' + rota, { headers:{ 'apikey':PCFG.key, 'Authorization':'Bearer ' + PCFG.key } })
    .then(function(r){ if(!r.ok) throw new Error('HTTP ' + r.status); return r.json(); });
}
function f5Num(v){ return brl(v == null ? 0 : v); }
function carregaF5(){
  var host = document.getElementById('gv-conteudo'); if(!host) return;
  host.innerHTML = '<p class="gv-vazio">Carregando…</p>';
  Promise.all([ f5Get('f5_vw_alertas_abertos?select=*'), f5Get('f5_vw_demonstrativos?select=*&limit=36'), f5Get('f5_glosa_codigos?select=*&order=codigo') ])
    .then(function(r){ desenhaF5({ presos:r[0], dems:r[1], cat:r[2] }); })
    .catch(function(e){ host.innerHTML = '<p class="gv-vazio">⚠️ ' + esc(humano(e)) + '</p>'; });
}
function desenhaF5(d){
  var host = document.getElementById('gv-conteudo'); if(!host) return;
  host.innerHTML = '';
  var topo = document.createElement('div'); topo.className = 'oc-topo';
  topo.innerHTML = '<h2>💵 Demonstrativos Unimed — F5</h2>' +
    '<p>Suba o XML "análise de conta" que a Unimed devolve. O ensaio só mostra o que aconteceria; lançar a valer marca as guias como pagas, devolve as glosadas para a dívida ou cancela as já pagas, e prende o que o sistema não reconhece para você decidir aqui.</p>' +
    '<div class="pf-form"><button type="button" class="gv-btn" id="f5-voltar">← Administração</button>' +
    '<button type="button" class="gv-btn" id="f5-atualizar">↻ Atualizar</button>' +
    '<button type="button" class="gv-btn verde" id="f5-subir">📄 Subir XML do demonstrativo (ensaio)</button><span class="pf-adm-msg" id="f5-msg"></span></div>';
  host.appendChild(topo);
  $('#f5-voltar', topo).onclick = carregaAdmin;
  $('#f5-atualizar', topo).onclick = carregaF5;
  $('#f5-subir', topo).onclick = f5Subir;

  /* presos */
  var sec = document.createElement('div'); sec.className = 'adm-sec';
  sec.innerHTML = '🔒 Itens presos aguardando a sua decisão <small>(' + d.presos.length + ')</small>';
  host.appendChild(sec);
  var box = document.createElement('div'); host.appendChild(box);
  if(!d.presos.length){ box.innerHTML = '<p class="gv-vazio">Nada preso. 👍</p>'; }
  else {
    var h = '<table class="adm"><tr><th>Dem</th><th>Lote · guia</th><th>Sessão</th><th>Valores</th><th>Motivo</th><th>Decidir</th></tr>';
    d.presos.forEach(function(p){
      h += '<tr><td>' + esc(p.numero_demonstrativo) + '<br><small>' + esc(p.convenio || '') + '</small></td>' +
        '<td>L' + esc(p.numero_lote) + ' · ' + esc(p.numero_guia_prestador) + '<br><small>op. ' + esc(p.numero_guia_operadora) + '</small></td>' +
        '<td>' + esc(dmy(p.data_realizacao)) + '<br><small>' + esc(p.codigo_procedimento) + '</small></td>' +
        '<td>inf ' + f5Num(p.valor_informado) + '<br>lib ' + f5Num(p.valor_liberado) + (p.glosa_codigo ? '<br><small>glosa ' + esc(p.glosa_codigo) + (p.glosa_descricao ? ' — ' + esc(p.glosa_descricao) : '') + '</small>' : '') + '</td>' +
        '<td style="max-width:320px">' + esc(p.motivo || '') + (p.f0_id ? '<br><small>f0 #' + p.f0_id + '</small>' : '<br><small>sem par na f0 — só cabe ignorar</small>') + '</td>' +
        '<td style="white-space:nowrap">' + F5_DECISOES.map(function(x){ return '<button type="button" class="gv-btn mini" data-dec="' + x[0] + '" data-item="' + p.item_id + '">' + x[1] + '</button>'; }).join(' ') + '</td></tr>';
    });
    box.innerHTML = h + '</table>';
    box.addEventListener('click', function(ev){
      var b = ev.target.closest('button[data-dec]'); if(!b) return;
      var dec = b.getAttribute('data-dec'), id = Number(b.getAttribute('data-item'));
      var obs = prompt('Decisão "' + dec + '" para o item ' + id + '. Observação (opcional):'); if(obs === null) return;
      b.disabled = true;
      rpc('f5_decidir_item', { p_item_id:id, p_decisao:dec, p_senha:adm.senha, p_quem:'painel', p_observacao:obs || null })
        .then(function(r){ alert('Feito: ' + (r.acao || dec)); carregaF5(); })
        .catch(function(e){ alert(humano(e)); b.disabled = false; });
    });
  }

  /* catálogo */
  sec = document.createElement('div'); sec.className = 'adm-sec';
  sec.innerHTML = '📚 Catálogo de glosas <small>(tratamento por código; código novo entra como "decidir")</small>';
  host.appendChild(sec);
  var cat = document.createElement('div'); host.appendChild(cat);
  var hc = '<table class="adm"><tr><th>Código</th><th>Descrição</th><th>Tratamento</th><th>Zera guia</th><th>Decidido</th><th></th></tr>';
  d.cat.forEach(function(c){
    hc += '<tr data-cod="' + esc(c.codigo) + '"><td><b>' + esc(c.codigo) + '</b></td>' +
      '<td><input type="text" class="pf-adm-busca" data-desc value="' + esc(c.descricao || '') + '" style="width:100%;min-width:220px"></td>' +
      '<td><select class="pf-adm-busca" data-trat style="width:auto">' + F5_TRATAMENTOS.map(function(t){ return '<option value="' + t[0] + '"' + (t[0] === c.tratamento ? ' selected' : '') + '>' + t[1] + '</option>'; }).join('') + '</select></td>' +
      '<td><input type="checkbox" data-zera' + (c.zera_guia ? ' checked' : '') + '></td>' +
      '<td><small>' + (c.decidido_por ? esc(c.decidido_por) + ' · ' + fmtTs(c.decidido_em) : '—') + '</small></td>' +
      '<td><button type="button" class="gv-btn mini" data-salvar>Salvar</button></td></tr>';
  });
  cat.innerHTML = hc + '</table><div class="pf-form" style="margin-top:8px"><button type="button" class="gv-btn" id="f5-reproc">↻ Reprocessar presos pelo catálogo</button><span class="pf-adm-msg" id="f5-reproc-msg"></span></div>';
  cat.addEventListener('click', function(ev){
    var b = ev.target.closest('button[data-salvar]'); if(!b) return;
    var tr = b.closest('tr'), cod = tr.getAttribute('data-cod');
    b.disabled = true;
    rpc('f5_decidir_codigo', { p_codigo:cod, p_tratamento:$('[data-trat]', tr).value, p_zera_guia:$('[data-zera]', tr).checked,
                               p_senha:adm.senha, p_quem:'painel', p_descricao:$('[data-desc]', tr).value || null })
      .then(function(r){ alert('Código ' + cod + ' → ' + r.tratamento + (r.presos_com_este_codigo ? ' · ' + r.presos_com_este_codigo + ' preso(s) com este código: use "Reprocessar presos"' : '')); b.disabled = false; })
      .catch(function(e){ alert(humano(e)); b.disabled = false; });
  });
  $('#f5-reproc', cat).onclick = function(){
    var msg = $('#f5-reproc-msg', cat); msgEm(msg, 'reprocessando…');
    rpc('f5_reprocessar_presos', { p_senha:adm.senha, p_quem:'painel' })
      .then(function(r){ msgEm(msg, r.reprocessados + ' item(ns) aplicado(s) ✔'); carregaF5(); })
      .catch(function(e){ msgEm(msg, humano(e), true); });
  };

  /* demonstrativos lançados */
  sec = document.createElement('div'); sec.className = 'adm-sec';
  sec.innerHTML = '📑 Demonstrativos lançados <small>(líquido esperado = (liberado − estornos) − 2%; confira com o "Valor Líquido" do portal)</small>';
  host.appendChild(sec);
  var dm = document.createElement('div'); host.appendChild(dm);
  if(!d.dems.length){ dm.innerHTML = '<p class="gv-vazio">Nenhum demonstrativo lançado ainda.</p>'; }
  else {
    var hd = '<table class="adm"><tr><th>Nº</th><th>Convênio</th><th>Pagamento</th><th>Lotes</th><th>Itens</th><th>Liberado</th><th>Estornos</th><th>Líquido esperado</th><th>Presos</th><th>Lançado</th></tr>';
    d.dems.forEach(function(x){
      hd += '<tr><td><b>' + esc(x.numero_demonstrativo) + '</b></td><td>' + esc(x.convenio || '') + '</td><td>' + esc(dmy(x.data_emissao)) + '</td>' +
        '<td><small>' + esc((x.lotes || []).join(', ')) + '</small></td><td>' + x.qt_itens + '</td><td>' + f5Num(x.valor_liberado) + '</td><td>' + f5Num(x.valor_estornos) + '</td>' +
        '<td><b>' + f5Num(x.valor_liquido_esperado) + '</b></td><td>' + (x.presos_abertos ? '🔒 ' + x.presos_abertos : '—') + '</td>' +
        '<td><small>' + esc(x.importado_por || '') + ' · ' + fmtTs(x.importado_em) + '</small></td></tr>';
    });
    dm.innerHTML = hd + '</table>';
  }
}
function f5Subir(){
  fx4PedeXML(function(file){
    fx4LerArquivo(file, function(txt){ f5Rodar(txt, file.name, 'ensaio'); }, function(e){ alert(humano(e)); });
  });
}
function f5Rodar(txt, nome, modo){
  var m = modal(modo === 'valer' ? 'Lançando a valer…' : 'Ensaio…', '<p class="sub">Lendo ' + esc(nome) + ' e casando com o sistema. Alguns segundos.</p>', '');
  rpc('f5_importar_demonstrativo', { p_xml:txt, p_modo:modo, p_senha:adm.senha, p_quem:'painel', p_arquivo:nome })
    .then(function(r){ m.fecha(); f5Relatorio(r, txt, nome); })
    .catch(function(e){ m.fecha(); alert(humano(e)); });
}
function f5Relatorio(r, txt, nome){
  var D = r.demonstrativo || {}, V = r.vereditos || {}, G = r.glosas_por_codigo || {};
  var h = '<p class="sub"><b>Demonstrativo ' + esc(D.numero) + '</b> · ' + esc(D.convenio) + ' · pagamento ' + esc(dmy(D.emissao)) + ' · lotes ' + esc((D.lotes || []).join(', ')) + ' · ' + D.guias + ' guias · ' + D.itens + ' itens' +
    (D.totais_conferem ? ' · totais ✔' : ' · <b style="color:#b00">totais NÃO conferem</b>') + ' · no malote ' + D.itens_no_malote + '/' + D.itens + '</p>' +
    '<div class="pf-adm-grid" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;margin:8px 0">' +
      '<div class="pf-adm-card"><small>Informado</small><br><b>' + f5Num(D.informado) + '</b></div>' +
      '<div class="pf-adm-card"><small>Liberado</small><br><b>' + f5Num(D.liberado) + '</b></div>' +
      '<div class="pf-adm-card"><small>Glosa</small><br><b>' + f5Num(D.glosa) + '</b></div>' +
      '<div class="pf-adm-card"><small>Estornos</small><br><b>' + f5Num(D.estornos) + '</b></div>' +
      '<div class="pf-adm-card" style="border:2px solid var(--tinta)"><small>LÍQUIDO ESPERADO (−' + D.retencao_pct + '%)</small><br><b style="font-size:18px">' + f5Num(D.liquido_esperado) + '</b><br><small>confira com o portal</small></div></div>';
  h += '<table class="adm"><tr><th>Veredito</th><th>Itens</th><th>Liberado</th></tr>';
  Object.keys(V).sort(function(a,b){ return V[b].n - V[a].n; }).forEach(function(k){
    h += '<tr><td>' + esc(F5_ROTULO[k] || k) + '</td><td>' + V[k].n + '</td><td>' + f5Num(V[k].valor_liberado) + '</td></tr>';
  });
  h += '</table>';
  var gk = Object.keys(G);
  if(gk.length){
    h += '<div class="adm-sec" style="margin-top:12px">Glosas por código</div><table class="adm"><tr><th>Código</th><th>Descrição</th><th>Itens</th><th>Valor</th><th>Tratamento</th></tr>';
    gk.forEach(function(k){ h += '<tr><td><b>' + esc(k) + '</b></td><td>' + esc(G[k].descricao || '(sem descrição)') + '</td><td>' + G[k].n + '</td><td>' + f5Num(G[k].valor) + '</td><td>' + esc(G[k].tratamento) + '</td></tr>'; });
    h += '</table>';
  }
  if((r.presos || []).length){
    h += '<div class="adm-sec" style="margin-top:12px">🔒 Ficariam presos (' + r.presos.length + ')</div><table class="adm"><tr><th>Lote · guia</th><th>Sessão</th><th>Lib</th><th>Motivo</th></tr>';
    r.presos.slice(0, 40).forEach(function(p){ h += '<tr><td>L' + esc(p.lote) + ' · ' + esc(p.guia_prestador) + '</td><td>' + esc(dmy(p.data)) + ' ' + esc(p.codigo) + '</td><td>' + f5Num(p.liberado) + '</td><td>' + esc(p.motivo) + '</td></tr>'; });
    if(r.presos.length > 40) h += '<tr><td colspan="4">… e mais ' + (r.presos.length - 40) + '</td></tr>';
    h += '</table>';
  }
  h += '<p class="sub" style="margin-top:10px">Baixas na guia: ' + (r.baixas || []).length + '</p>';
  if((r.avisos || []).length) h += '<ul>' + r.avisos.map(function(a){ return '<li>⚠️ ' + esc(a) + '</li>'; }).join('') + '</ul>';
  var m = modal((r.modo === 'valer' ? '✅ Lançado a valer' : '🔎 Ensaio') + ' — ' + esc(nome), h,
    '<button type="button" class="pf-btn" data-volta>Fechar</button>' +
    (r.modo === 'ensaio' ? '<button type="button" class="pf-btn pf-pri" id="f5-valer">✅ Lançar a valer</button>' : ''));
  var mb = m.el.querySelector('.mb'); if(mb) mb.style.maxWidth = '900px';
  $('[data-volta]', m.el).onclick = function(){ m.fecha(); if(r.modo === 'valer') carregaF5(); };
  var bv = $('#f5-valer', m.el);
  if(bv) bv.onclick = function(){
    if(!D.totais_conferem && !confirm('Os totais do arquivo não conferem com a soma dos itens. Lançar mesmo assim vai ser recusado pelo banco. Tentar?')) return;
    if(!confirm('Lançar o demonstrativo ' + D.numero + ' a valer? Isto marca as guias como pagas e devolve as glosadas para a dívida.')) return;
    m.fecha(); f5Rodar(txt, nome, 'valer');
  };
}

/* ═══ 💰 REPASSE — regimes, regime por profissional, recibos do mês (administrador) ═══ */
var CAMPOS_REGIME = {
  psicologo: [['plano_alto','Plano — acima do corte (R$)'],['plano_baixo','Plano — abaixo do corte (R$)'],['corte_pct','Corte (%)'],['usa_corte','Usa o corte? (true/false)'],['lev_soul','Lev Soul (R$)'],['aba','ABA (R$)'],['particular_pct','Particular (%)']],
  faixa:     [['ate_n','Sessões na 1ª faixa'],['valor_ate','Valor 1ª faixa (R$)'],['valor_apos','Valor depois (R$)'],['aba','ABA (R$)'],['particular_pct','Particular (%)']],
  nutri:     [['local','Unimed Local (R$)'],['intercambio','Unimed Intercâmbio (R$)']],
  sem_recibo: []
};
function carregaRepasse(comp){
  var host = document.getElementById('gv-conteudo'); if(!host) return;
  host.innerHTML = '<p class="gv-vazio">Carregando…</p>';
  rpc('rep_admin_listar', { p_senha_admin: adm.senha, p_competencia: comp }).then(function(d){ desenhaRepasse(d); })
    .catch(function(e){ host.innerHTML = '<p class="gv-vazio">⚠️ ' + esc(humano(e)) + '</p>'; });
}
function desenhaPreviaAdmin(pv, box, totEl, d){
  if(pv.mes_em_andamento){
    box.innerHTML = '<p class="gv-vazio">' + esc(pv.mes_nome) + ' ainda não terminou. Os valores aparecem a partir do dia 1 do mês seguinte — antes disso, as consultas que ainda vão acontecer contariam como falta.</p>';
    return;
  }
  var L = pv.linhas || [];
  if(!L.length){ box.innerHTML = '<p class="gv-vazio">Nenhum profissional com recibo neste mês.</p>'; return; }
  if(totEl) totEl.textContent = '(total ' + brl(pv.total_a_receber) + ' · ' + pv.n_recibos + ' com recibo emitido · ' + pv.n_previas + ' em prévia' + (pv.n_sem_regime ? ' · ' + pv.n_sem_regime + ' sem regime' : '') + ')';
  var verde = 'style="background:var(--ok-fundo);color:var(--ok)"';
  var h = '<p class="sub" style="margin:2px 0 10px">Calculado agora, pelas mesmas regras do recibo. Enquanto o profissional não confirma, o valor é uma <b>prévia</b> e muda com as correções no Feegow (que chegam até a manhã seguinte). Depois da confirmação, vale o <b>recibo emitido</b>.</p>' +
    '<div style="overflow-x:auto"><table class="adm rp-pv"><tr><th>Profissional</th><th class="num">Atendidos</th><th class="num">Faltas</th><th>% de agenda</th><th class="num">A receber</th><th>Conferência</th><th></th></tr>';
  L.forEach(function(x, i){
    var nome = '<b>' + esc(x.nome) + '</b>' + (x.situacao && x.situacao !== 'ativo' ? ' <span class="tag-sit tag-s1">' + esc(x.situacao) + '</span>' : '');
    var conf = x.confirmou_em ? '<span class="tag-sit" ' + verde + '>confirmou ' + fmtTs(x.confirmou_em) + '</span>'
             : (x.tem_acesso ? '<span class="tag-sit">aguardando</span>' : '<span class="tag-sit">sem acesso</span>');
    if(x.erro){
      h += '<tr><td>' + nome + '</td><td colspan="4"><span class="tag-sit tag-s0">' + (x.erro === 'SEM_REGIME' ? 'defina o regime na tabela abaixo' : esc(humano(new Error(x.erro)))) + '</span></td><td>' + conf + '</td><td></td></tr>';
      return;
    }
    var pct = esc(x.pct_texto || '—');
    if(x.usa_corte) pct += '<span class="rp-sub">' + (x.atingiu_corte
      ? '<span class="tag-sit" ' + verde + '>≥ ' + x.corte_pct + '% · plano ' + brl(x.plano_alto) + '</span>'
      : '<span class="tag-sit tag-s1">abaixo de ' + x.corte_pct + '% · plano ' + brl(x.plano_baixo) + '</span>') + '</span>';
    var val = '<b>' + brl(x.a_receber) + '</b><span class="rp-sub">' +
      (x.fonte === 'recibo' ? 'recibo v' + x.recibo_versao + ' · ' + fmtTs(x.recibo_gerado_em) : 'prévia') + '</span>' +
      (x.difere ? '<span class="rp-sub"><span class="tag-sit tag-s1">cálculo de agora: ' + brl(x.previa_total) + '</span> <button type="button" class="gv-btn mini" data-pv-regerar="' + x.profissional_id + '">Regerar</button></span>' : '');
    h += '<tr><td>' + nome + '<span class="rp-reg">' + esc(x.regime_nome || '') + '</span></td>' +
      '<td class="num">' + x.atendidos + '</td><td class="num">' + x.faltas + '</td><td>' + pct + '</td>' +
      '<td class="num">' + val + '</td><td>' + conf + '</td>' +
      '<td><button type="button" class="gv-btn mini" data-pv-conta="' + i + '">conta</button></td></tr>' +
      '<tr class="rp-conta" id="rp-conta-' + i + '" style="display:none"><td colspan="7">' +
      (previaLinhas(x).map(function(l){ return esc(l.descricao) + ': ' + esc(l.un) + ' = <b>' + l.valor + '</b>'; }).join(' · ') || 'Nenhum atendimento pago no mês.') +
      ' · <b>total ' + brl(x.previa_total) + '</b>' + (x.fonte === 'recibo' && x.difere ? ' (o recibo emitido é de ' + brl(x.recibo_total) + ')' : '') + '</td></tr>';
  });
  h += '<tr class="tot"><td colspan="4">TOTAL DO MÊS</td><td class="num">' + brl(pv.total_a_receber) + '</td><td colspan="2"></td></tr></table></div>';
  box.innerHTML = h;
  Array.prototype.forEach.call(box.querySelectorAll('button[data-pv-conta]'), function(b){ b.onclick = function(){
    var tr = document.getElementById('rp-conta-' + b.getAttribute('data-pv-conta')); tr.style.display = tr.style.display === 'none' ? '' : 'none'; }; });
  Array.prototype.forEach.call(box.querySelectorAll('button[data-pv-regerar]'), function(b){ b.onclick = function(){
    b.disabled = true;
    rpc('rep_admin_gerar', { p_senha_admin: adm.senha, p_competencia: d.competencia, p_profissional_id: Number(b.getAttribute('data-pv-regerar')) })
      .then(function(){ carregaRepasse(d.competencia); }).catch(function(e){ alert(humano(e)); b.disabled = false; }); }; });
}
function desenhaRepasse(d){
  var host = document.getElementById('gv-conteudo'); if(!host) return;
  host.innerHTML = '';
  var topo = document.createElement('div'); topo.className = 'oc-topo';
  topo.innerHTML = '<h2>💰 Repasse — ' + esc(d.mes_nome) + '</h2>' +
    '<p>Os recibos são gerados automaticamente quando o profissional confirma os últimos dias do mês. Aqui você define os regimes e os valores, escolhe o regime de cada profissional e pode gerar ou atualizar os recibos de um mês.</p>' +
    '<div class="pf-form"><button type="button" class="gv-btn" id="rp-voltar">← Administração</button>' +
    '<label for="rp-mes" style="margin-left:8px">Mês</label><input type="month" id="rp-mes" class="pf-adm-busca" style="width:auto" value="' + String(d.competencia).slice(0,7) + '">' +
    '<button type="button" class="gv-btn verde" id="rp-gerar">Gerar / atualizar recibos do mês</button><span class="pf-adm-msg" id="rp-msg"></span></div>';
  host.appendChild(topo);
  $('#rp-voltar', topo).onclick = carregaAdmin;
  $('#rp-mes', topo).onchange = function(e){ carregaRepasse(e.target.value + '-01'); };
  $('#rp-gerar', topo).onclick = function(){
    if(!confirm('Gerar ou atualizar os recibos de ' + d.mes_nome + ' para todos os profissionais com regime? Recibos já gerados ganham uma nova versão.')) return;
    var msg = $('#rp-msg', topo); msgEm(msg, 'gerando…');
    rpc('rep_admin_gerar', { p_senha_admin: adm.senha, p_competencia: d.competencia, p_profissional_id: null })
      .then(function(r){ msgEm(msg, r.gerados + ' gerado(s)' + (r.erros ? ', ' + r.erros + ' sem regime/recibo' : '') + ' ✔'); carregaRepasse(d.competencia); })
      .catch(function(e){ msgEm(msg, humano(e), true); });
  };

  // v2.5: quanto cada um vai receber
  var secP = document.createElement('div'); secP.className = 'adm-sec';
  secP.innerHTML = 'Quanto cada um vai receber — ' + esc(d.mes_nome) + ' <small id="rp-pv-tot"></small>';
  host.appendChild(secP);
  var boxP = document.createElement('div'); boxP.innerHTML = '<p class="gv-vazio">Calculando…</p>'; host.appendChild(boxP);
  rpc('rep_admin_previa', { p_senha_admin: adm.senha, p_competencia: d.competencia })
    .then(function(pv){ desenhaPreviaAdmin(pv, boxP, $('#rp-pv-tot', secP), d); })
    .catch(function(e){ boxP.innerHTML = '<p class="gv-vazio">⚠️ ' + esc(humano(e)) + '</p>'; });

  // recibos do mês
  var sec = document.createElement('div'); sec.className = 'adm-sec';
  sec.innerHTML = 'Regime e recibo de cada profissional <small>(recibos emitidos: ' + brl(d.total_mes) + ')</small>';
  host.appendChild(sec);
  var tb = document.createElement('div'); tb.className = 'adm-rolagem'; host.appendChild(tb);
  var profs = d.profissionais || [], regs = d.regimes || [];
  var opts = function(sel){ return '<option value=""' + (!sel ? ' selected' : '') + '>— sem regime —</option>' + regs.map(function(g){ return '<option value="' + g.codigo + '"' + (g.codigo === sel ? ' selected' : '') + '>' + esc(g.nome) + '</option>'; }).join(''); };
  var h = '<table class="adm"><tr><th>Profissional</th><th>Regime</th><th>Descrição no detalhe</th><th>Recibo do mês</th><th>Ações</th></tr>';
  profs.forEach(function(p){
    var r = p.recibo;
    h += '<tr><td><b>' + esc(p.nome) + '</b>' + (p.situacao !== 'ativo' ? ' <span class="tag-sit tag-s1">' + esc(p.situacao) + '</span>' : '') + (!p.tem_acesso ? ' <small>(sem acesso)</small>' : '') + '</td>' +
      '<td><select data-regime="' + p.profissional_id + '" class="pf-adm-busca" style="width:auto;max-width:280px">' + opts(p.regime) + '</select></td>' +
      '<td><input type="checkbox" data-coldesc="' + p.profissional_id + '"' + (p.coluna_descricao ? ' checked' : '') + '></td>' +
      '<td>' + (r ? '<b>' + brl(r.total) + '</b> · ' + esc(r.pct_texto || '') + ' · ' + (r.finalizadas || 0) + ' consultas<br><small>v' + r.versao + ' · ' + fmtTs(r.gerado_em) + ' · ' + esc(r.gerado_por) + '</small>' : (p.gera_recibo === false ? '<span class="tag-sit">sem recibo</span>' : (p.regime ? '<span class="tag-sit tag-s1">não gerado</span>' : '<span class="tag-sit tag-s0">defina o regime</span>'))) + '</td>' +
      '<td style="white-space:nowrap">' + (p.regime && p.gera_recibo !== false ? '<button type="button" class="gv-btn mini" data-gerar="' + p.profissional_id + '">' + (r ? 'Regerar' : 'Gerar') + '</button>' : '') +
      (r ? ' <button type="button" class="gv-btn mini" data-ver="' + p.profissional_id + '">Ver</button> <button type="button" class="gv-btn mini" data-pdf="' + p.profissional_id + '">PDF</button>' : '') + '</td></tr>';
  });
  tb.innerHTML = h + '</table><div id="rp-recibo-area"></div>';
  var salvaRegime = function(id){
    var sel = tb.querySelector('select[data-regime="' + id + '"]'), chk = tb.querySelector('input[data-coldesc="' + id + '"]');
    rpc('rep_admin_definir_regime', { p_senha_admin: adm.senha, p_profissional_id: id, p_regime: sel.value || null, p_coluna_descricao: chk.checked })
      .then(function(r){ if(r && r.ok === false) alert(humano(new Error(r.erro))); else carregaRepasse(d.competencia); }).catch(function(e){ alert(humano(e)); });
  };
  Array.prototype.forEach.call(tb.querySelectorAll('select[data-regime]'), function(el){ el.onchange = function(){ salvaRegime(Number(el.getAttribute('data-regime'))); }; });
  Array.prototype.forEach.call(tb.querySelectorAll('input[data-coldesc]'), function(el){ el.onchange = function(){ salvaRegime(Number(el.getAttribute('data-coldesc'))); }; });
  Array.prototype.forEach.call(tb.querySelectorAll('button[data-gerar]'), function(b){ b.onclick = function(){
    rpc('rep_admin_gerar', { p_senha_admin: adm.senha, p_competencia: d.competencia, p_profissional_id: Number(b.getAttribute('data-gerar')) })
      .then(function(r){ if(r.erros) alert('Não gerado: ' + (r.detalhe[0] && humano(new Error(r.detalhe[0].erro)))); carregaRepasse(d.competencia); }).catch(function(e){ alert(humano(e)); }); }; });
  var abre = function(id, baixar){
    rpc('rep_admin_recibo', { p_senha_admin: adm.senha, p_profissional_id: id, p_competencia: d.competencia })
      .then(function(r){ if(r && r.ok === false) return alert(humano(new Error(r.erro))); if(baixar) baixarRecibo(r); else { var a = document.getElementById('rp-recibo-area'); a.innerHTML = reciboHtml(r); a.scrollIntoView({ behavior: 'smooth' }); } })
      .catch(function(e){ alert(humano(e)); });
  };
  Array.prototype.forEach.call(tb.querySelectorAll('button[data-ver]'), function(b){ b.onclick = function(){ abre(Number(b.getAttribute('data-ver')), false); }; });
  Array.prototype.forEach.call(tb.querySelectorAll('button[data-pdf]'), function(b){ b.onclick = function(){ abre(Number(b.getAttribute('data-pdf')), true); }; });

  // regimes e valores
  var sec2 = document.createElement('div'); sec2.className = 'adm-sec'; sec2.innerHTML = 'Regimes e valores <small>(mudar aqui vale para os recibos gerados daqui em diante)</small>';
  host.appendChild(sec2);
  var grid = document.createElement('div'); grid.className = 'pf-adm-grid';
  grid.innerHTML = regs.map(function(g){
    var campos = CAMPOS_REGIME[g.tipo] || [];
    return '<div class="pf-adm-card" data-rg="' + g.codigo + '"><h3>' + esc(g.nome) + '</h3><label>Nome</label><input type="text" data-nome value="' + esc(g.nome) + '">' +
      (campos.length ? '<div class="rg-grid">' + campos.map(function(c){ return '<div><label>' + c[1] + '</label><input type="text" data-param="' + c[0] + '" value="' + esc(g.parametros[c[0]] == null ? '' : String(g.parametros[c[0]])) + '"></div>'; }).join('') + '</div>' : '<p class="sub">Regime sem recibo — nada a configurar.</p>') +
      '<div class="rodape"><button type="button" class="gv-btn verde" data-salvar>Salvar</button><span class="pf-adm-msg"></span></div></div>';
  }).join('');
  host.appendChild(grid);
  Array.prototype.forEach.call(grid.querySelectorAll('button[data-salvar]'), function(b){ b.onclick = function(){
    var card = b.closest('.pf-adm-card'), params = {}, msg = card.querySelector('.pf-adm-msg');
    Array.prototype.forEach.call(card.querySelectorAll('input[data-param]'), function(i){
      var v = i.value.trim().replace(',', '.'); var k = i.getAttribute('data-param');
      if(v === 'true' || v === 'false') params[k] = (v === 'true'); else if(v !== '' && !isNaN(Number(v))) params[k] = Number(v); else if(v !== '') params[k] = v;
    });
    msgEm(msg, 'salvando…');
    rpc('rep_admin_salvar_regime', { p_senha_admin: adm.senha, p_codigo: card.getAttribute('data-rg'), p_nome: card.querySelector('input[data-nome]').value, p_parametros: params })
      .then(function(){ msgEm(msg, 'salvo ✔'); }).catch(function(e){ msgEm(msg, humano(e), true); });
  }; });
}

return { loginLista: loginLista, entrarPeloLogin: entrarPeloLogin, sair: sair, secretaria: secretaria, recarregarSec: recarregarSec, admin: admin, convite: convite };
})();
