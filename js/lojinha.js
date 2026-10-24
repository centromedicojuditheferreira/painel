// ================================================================
//  Conveniência e login: os dados ficam no Supabase (LOJA v1.0), sempre
//  pelas funções do servidor em js/loja_api.js (LAPI). O Firebase
//  saiu do Cortex; só a tela de migração (js/loja_login.js) ainda o lê,
//  uma vez, para trazer os dados.
// ================================================================

let CU=null, PC=[], PRC=[], CFG={taxa_debito:1.5,taxa_credito:3,valor_bonificacao_padrao:100};
const isAdmin=()=>CU&&CU.admin===true;
let CPID=null, CPNM=null, CXTIPO='sangria', PFILTRO='todos';

const fmt=v=>'R$ '+Number(v||0).toFixed(2).replace('.',',').replace(/\B(?=(\d{3})+(?!\d))/g,'.');
const fmtDT=ts=>{if(!ts)return'-';const d=ts.toDate?ts.toDate():new Date(ts);return d.toLocaleDateString('pt-BR')+' '+d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});};
const fmtD=ts=>{if(!ts)return'-';const d=ts.toDate?ts.toDate():new Date(ts);return d.toLocaleDateString('pt-BR');};
const tsMs=ts=>{if(!ts)return 0;const d=ts.toDate?ts.toDate():new Date(ts);return d.getTime();};
const OCULTOS_PADRAO=['gabriel ferreira','marinalva ferreira'];   /* notinhas ocultas por padrão (Marinalva desde 24/10/26) */
const ehOculto=p=>!p?false:(p.oculto===true||(p.oculto==null&&OCULTOS_PADRAO.includes(String(p.nome||'').trim().toLowerCase())));
const saldoOculto=p=>ehOculto(p)&&!isAdmin();   /* notinha oculta: a secretária vê o nome, nunca o valor (24/10/26) */
const semErro=m=>m.marcado_erro!==true;
const ordDesc=(a,b)=>tsMs(b.timestamp)-tsMs(a.timestamp);
const ordAsc=(a,b)=>tsMs(a.timestamp)-tsMs(b.timestamp);
window.addEventListener('unhandledrejection',e=>{const msg=(e.reason&&e.reason.message)||String(e.reason);console.error('[FALHA]',e.reason);try{toast('Erro: '+msg,'ko');}catch(_){}});
const today0=()=>{const d=new Date();d.setHours(0,0,0,0);return d;};
const today23=()=>{const d=new Date();d.setHours(23,59,59,999);return d;};
const todayISO=()=>new Date().toISOString().split('T')[0];
const firstISO=()=>{const d=new Date();d.setDate(1);return d.toISOString().split('T')[0];};
const closeM=id=>document.getElementById(id).style.display='none';
const openM=id=>document.getElementById(id).style.display='flex';
function toast(msg,tp=''){const t=document.getElementById('toast');t.textContent=msg;t.className='toast show'+(tp?' '+tp:'');setTimeout(()=>t.classList.remove('show'),3200);}
function tipoBadge(t){const m={venda_paciente:'<span class="bg bg-g">Venda Pac.</span>',venda_profissional:'<span class="bg bg-b">Notinha</span>',entrada_estoque:'<span class="bg bg-p">Estoque</span>',pagamento_notinha:'<span class="bg bg-g">Pagamento</span>',bonificacao:'<span class="bg bg-a">Bonificação</span>',sangria:'<span class="bg bg-r">Sangria</span>',suprimento:'<span class="bg bg-g">Suprimento</span>',edicao_profissional:'<span class="bg bg-x">Edição</span>',ajuste_estoque:'<span class="bg bg-a">Balanço</span>',edicao_produto:'<span class="bg bg-x">Produto</span>'};return m[t]||('<span class="bg bg-x">'+t+'</span>');}
function pagBadge(p){if(!p)return'<span style="color:var(--muted)">-</span>';const m={dinheiro:'Dinheiro',pix:'PIX',debito:'Débito',credito:'Crédito',notinha:'Notinha'};return m[p]||p;}

function gerarLink(profId){
  const url=window.location.href.split('?')[0]+'?prof='+profId;
  document.getElementById('link-url').value=url;
  openM('m-link');
}
function copiarLink(){navigator.clipboard.writeText(document.getElementById('link-url').value).then(()=>toast('Link copiado!','ok'));}

let PFILTRO_POS='todos';
async function loadPosicao(){
  const lista=await LAPI.produtos();const tb=document.getElementById('pos-tb');tb.innerHTML='';
  let prods=lista.sort((a,b)=>a.nome.localeCompare(b.nome));
  if(PFILTRO_POS==='conveniencia')prods=prods.filter(p=>p.ativo&&p.grupo==='conveniencia');
  else if(PFILTRO_POS==='livraria')prods=prods.filter(p=>p.ativo&&p.grupo==='livraria');
  else prods=prods.filter(p=>p.ativo);
  if(!prods.length){tb.innerHTML='<tr><td colspan="7" style="text-align:center;color:var(--muted);padding:20px">Nenhum produto encontrado</td></tr>';return;}
  prods.forEach(p=>{
    const est=p.estoque_atual||0;const tr=document.createElement('tr');
    const estCor=est<=0?'color:var(--red)':est<=5?'color:var(--amb)':'color:var(--grn)';
    tr.innerHTML='<td style="font-weight:500">'+balEsc(p.nome)+'</td><td>'+(p.grupo==='conveniencia'?'Conveniência':p.grupo==='livraria'?'Livraria':balEsc(p.grupo))+'</td><td style="font-family:var(--mo);font-weight:700;'+estCor+'">'+est+' '+balEsc(p.unidade||'un')+'</td><td style="font-family:var(--mo)">'+fmt(p.preco_venda)+'</td><td style="font-family:var(--mo);color:var(--muted)">'+fmt(p.preco_custo)+'</td><td>'+(p.ativo?'<span class="bg bg-g">Ativo</span>':'<span class="bg bg-x">Inativo</span>')+'</td><td></td>';
    const be=document.createElement('button');be.className='btn btn-s btn-sm';be.textContent='Editar';be.onclick=()=>editProd(p);tr.lastChild.appendChild(be);   /* sem JSON no onclick: nome com apóstrofo quebrava o botão */
    tb.appendChild(tr);
  });
}
function filtroPos(f,el){PFILTRO_POS=f;document.querySelectorAll('.itab').forEach(x=>x.classList.remove('active'));el.classList.add('active');loadPosicao();}

/* ═══ BALANCO DE ESTOQUE (contagem, preco e exclusao em uma tela so) ═══ */
let BAL=[],BAL_FILTRO='todos',BAL_BUSCA='';
const balEsc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const balNum=v=>{const n=parseFloat(String(v==null?'':v).replace(',','.'));return isNaN(n)?null:n;};
function balMudou(r){
  if(!r.ativo)return false;
  return r.excluir||(r.contado!==null&&r.contado!==r.estoque)||(r.precoNovo!==null&&r.precoNovo!==r.preco);
}
async function loadBalanco(){
  const tb=document.getElementById('bal-tb');tb.innerHTML='<tr><td colspan="5" style="text-align:center;color:var(--muted);padding:20px">Carregando...</td></tr>';
  const lista=await LAPI.produtos();
  BAL=lista.map(p=>{return{id:p.id,nome:p.nome||'',grupo:p.grupo||'',unidade:p.unidade||'un',estoque:Number(p.estoque_atual)||0,preco:Number(p.preco_venda)||0,ativo:p.ativo!==false,contado:null,precoNovo:null,excluir:false};})
    .sort((a,b)=>a.nome.localeCompare(b.nome));
  const cont={};BAL.forEach(r=>{if(r.ativo){const k=r.nome.trim().toLowerCase();cont[k]=(cont[k]||0)+1;}});
  BAL.forEach(r=>{r.repetido=r.ativo&&cont[r.nome.trim().toLowerCase()]>1;});
  document.getElementById('bal-busca').value=BAL_BUSCA;
  renderBalanco();
}
function filtroBal(f,el){BAL_FILTRO=f;document.querySelectorAll('#s-balanco .itab').forEach(x=>x.classList.remove('active'));el.classList.add('active');renderBalanco();}
function buscaBal(v){BAL_BUSCA=(v||'').trim().toLowerCase();renderBalanco();}
function balVisivel(r){
  if(BAL_FILTRO==='excluidos'){if(r.ativo)return false;}
  else{if(!r.ativo)return false;if(BAL_FILTRO!=='todos'&&r.grupo!==BAL_FILTRO)return false;}
  return !BAL_BUSCA||r.nome.toLowerCase().includes(BAL_BUSCA);
}
function renderBalanco(){
  const tb=document.getElementById('bal-tb');tb.innerHTML='';
  const head=document.getElementById('bal-head');const exc=BAL_FILTRO==='excluidos';
  head.innerHTML=exc?'<th>Produto</th><th>Grupo</th><th>Estava com</th><th>Preço</th><th></th>':'<th>Produto</th><th>No sistema</th><th>Contado</th><th>Preço (R$)</th><th>Excluir</th>';
  const abas=document.querySelectorAll('#s-balanco .itab');abas.forEach(x=>x.classList.toggle('active',x.getAttribute('onclick').indexOf("'"+BAL_FILTRO+"'")>=0));
  const rows=BAL.filter(balVisivel);
  if(!rows.length){tb.innerHTML='<tr><td colspan="5" style="text-align:center;color:var(--muted);padding:20px">'+(exc?'Nenhum produto excluído.':'Nenhum produto encontrado.')+'</td></tr>';atualizaBarBal();return;}
  rows.forEach(r=>{
    const tr=document.createElement('tr');tr.dataset.id=r.id;
    if(exc){
      tr.innerHTML='<td class="bal-nm" style="font-weight:500">'+balEsc(r.nome)+'</td><td>'+balEsc(r.grupo)+'</td><td style="font-family:var(--mo)">'+r.estoque+' '+balEsc(r.unidade)+'</td><td style="font-family:var(--mo)">'+fmt(r.preco)+'</td><td></td>';
      const b=document.createElement('button');b.className='btn btn-s btn-sm';b.textContent='Reativar';b.onclick=()=>reativarProduto(r);
      tr.lastElementChild.appendChild(b);tb.appendChild(tr);return;
    }
    if(r.excluir)tr.classList.add('bal-exc');
    const estCor=r.estoque<=0?'color:var(--red)':r.estoque<=5?'color:var(--amb)':'';
    tr.innerHTML='<td><span class="bal-nm" style="font-weight:600">'+balEsc(r.nome)+'</span>'+(r.repetido?'<span class="bal-rep" title="Existe outro produto com este mesmo nome">nome repetido</span>':'')+'<div style="font-size:11px;color:var(--muted)">'+balEsc(r.grupo)+'</div></td>'+
      '<td style="font-family:var(--mo);font-weight:700;'+estCor+'">'+r.estoque+' '+balEsc(r.unidade)+'</td>'+
      '<td class="bal-c'+(r.contado!==null&&r.contado!==r.estoque?' bal-mud':'')+'"><input type="number" class="fc" min="0" step="1" inputmode="numeric" value="'+(r.contado!==null?r.contado:r.estoque)+'"><span class="bal-dif"></span></td>'+
      '<td class="bal-p'+(r.precoNovo!==null&&r.precoNovo!==r.preco?' bal-mud':'')+'"><input type="number" class="fc" min="0" step="0.01" inputmode="decimal" value="'+(r.precoNovo!==null?r.precoNovo:r.preco).toFixed(2)+'"></td>'+
      '<td><label class="bal-chk"><input type="checkbox"'+(r.excluir?' checked':'')+'> Excluir</label></td>';
    const inC=tr.querySelector('td.bal-c input'),dif=tr.querySelector('.bal-dif'),inP=tr.querySelector('td.bal-p input'),chk=tr.querySelector('td label input');
    const pintaC=()=>{const v=balNum(inC.value);const mud=v!==null&&v!==r.estoque;inC.parentElement.classList.toggle('bal-mud',mud);dif.textContent=mud?((v-r.estoque>0?'+':'')+(v-r.estoque)):'';dif.style.color=v!==null&&v<r.estoque?'var(--red)':'var(--grn)';};
    inC.addEventListener('input',()=>{const v=balNum(inC.value);r.contado=(v===null||v<0)?null:Math.round(v);pintaC();atualizaBarBal();});
    inC.addEventListener('focus',()=>inC.select());
    inP.addEventListener('input',()=>{const v=balNum(inP.value);r.precoNovo=(v===null||v<0)?null:Math.round(v*100)/100;inP.parentElement.classList.toggle('bal-mud',r.precoNovo!==null&&r.precoNovo!==r.preco);atualizaBarBal();});
    inP.addEventListener('focus',()=>inP.select());
    chk.addEventListener('change',()=>{r.excluir=chk.checked;tr.classList.toggle('bal-exc',r.excluir);atualizaBarBal();});
    pintaC();tb.appendChild(tr);
  });
  atualizaBarBal();
}
function resumoBal(){
  let q=0,p=0,e=0;
  BAL.forEach(r=>{if(!r.ativo)return;if(r.excluir){e++;return;}if(r.contado!==null&&r.contado!==r.estoque)q++;if(r.precoNovo!==null&&r.precoNovo!==r.preco)p++;});
  return{q,p,e,total:q+p+e};
}
function atualizaBarBal(){
  const s=resumoBal();const n=document.getElementById('bal-n');const b=document.getElementById('bal-salvar');
  if(!s.total){n.textContent='Nenhuma alteração ainda';b.disabled=true;return;}
  const partes=[];if(s.q)partes.push(s.q+' quantidade'+(s.q>1?'s':''));if(s.p)partes.push(s.p+' preço'+(s.p>1?'s':''));if(s.e)partes.push(s.e+' exclus'+(s.e>1?'ões':'ão'));
  n.innerHTML='<b>'+s.total+'</b> alteraç'+(s.total>1?'ões':'ão')+' para salvar: '+partes.join(', ');b.disabled=false;
}
async function salvarBalanco(){
  const s=resumoBal();if(!s.total)return;
  const linhas=[];if(s.q)linhas.push('- '+s.q+' quantidade(s) corrigida(s)');if(s.p)linhas.push('- '+s.p+' preço(s) alterado(s)');if(s.e)linhas.push('- '+s.e+' produto(s) excluído(s)');
  if(!confirm('Salvar o balanço?\n\n'+linhas.join('\n')))return;
  const b=document.getElementById('bal-salvar');b.disabled=true;b.textContent='Salvando...';
  /* só as linhas que mudaram; o servidor grava o balanço inteiro de uma vez (ou nada) e confere com o estoque de agora */
  const itens=BAL.filter(balMudou).map(r=>r.excluir?{produto_id:r.id,excluir:true}:
    {produto_id:r.id,contado:(r.contado!==null&&r.contado!==r.estoque)?r.contado:null,preco:(r.precoNovo!==null&&r.precoNovo!==r.preco)?r.precoNovo:null});
  let res;
  try{res=await LAPI.balanco(itens);}
  catch(e){b.textContent='Salvar balanço';b.disabled=false;toast('O balanço NÃO foi salvo: '+(e.message||e)+' Nada foi gravado; confira e tente de novo.','ko');return;}
  b.textContent='Salvar balanço';
  try{await loadCaches();}catch(e){}
  toast('Balanço salvo! '+res.feitos+' produto(s) atualizado(s).','ok');
  loadBalanco();
}
async function reativarProduto(r){
  if(!confirm('Colocar "'+r.nome+'" de volta no estoque?'))return;
  await LAPI.produtoReativar(r.id);
  await loadCaches();toast('"'+r.nome+'" voltou para o estoque.','ok');loadBalanco();
}

async function loadLoginUsers(){
  // Check for public professional view
  const params=new URLSearchParams(window.location.search);const profParam=params.get('prof');
  if(profParam){showPublicView(profParam);return;}
  if(LO_MODO==='prof'){PF.loginLista();return;}
  const sel=document.getElementById('lo-usr');
  let r;
  try{r=await LAPI.loginLista();}
  catch(e){if(LO_MODO!=='prof')sel.innerHTML='<option value="">Sem conexão com o servidor. Recarregue a página (F5).</option>';return;}
  if(LO_MODO==='prof')return;   /* trocou para a entrada de profissional enquanto carregava */
  if(r.virada_pendente){sel.innerHTML='';if(window.LOGIN_LOJA)LOGIN_LOJA.virada();return;}   /* migração do Firebase ainda não feita */
  if(window.LOGIN_LOJA)LOGIN_LOJA.limpar();
  sel.innerHTML='';
  r.usuarios.forEach(u=>{const o=document.createElement('option');o.value=u.id;o.textContent=u.nome;sel.appendChild(o);});
}
async function showPublicView(profId){
  document.getElementById('lo').style.display='none';
  document.getElementById('pub-view').style.display='block';
  let r;
  try{r=await LAPI.notinhaPublica(profId);}
  catch(e){document.getElementById('pub-nm').textContent=e.codigo==='NAO_ENCONTRADO'?'Profissional não encontrado':'Não consegui abrir a notinha agora. Tente de novo mais tarde.';return;}
  const sd=r.saldo_devedor||0;
  document.getElementById('pub-nm').textContent=r.nome;
  const sdEl=document.getElementById('pub-sd');sdEl.textContent=sd===0?'Em dia':fmt(Math.abs(sd));sdEl.className=sd>0?'deve':sd<0?'credito':'';
  document.getElementById('pub-sd-sub').textContent=sd>0?'devendo na conveniência':sd<0?'de crédito':'nenhum valor em aberto';
  document.getElementById('pub-sd-rot').textContent=sd>0?'Saldo devedor':sd<0?'Crédito':'Saldo';
  const tb=document.getElementById('pub-tb');tb.innerHTML='';
  const movs=r.movimentos;   /* o servidor já manda sem os marcados como erro, do mais novo ao mais velho */
  if(!movs.length){tb.innerHTML='<p class="pub-vazio">Nenhum lançamento.</p>';return;}
  const esc=x=>{const e=document.createElement('span');e.textContent=x==null?'':String(x);return e.innerHTML;};
  const rot={venda_profissional:'Compra',pagamento_notinha:'Pagamento',bonificacao:'Bonificação',edicao_profissional:'Ajuste'};
  movs.forEach(m=>{const isCompra=m.tipo==='venda_profissional';const isPgto=['pagamento_notinha','bonificacao'].includes(m.tipo);
    const l=document.createElement('div');l.className='pub-l';
    l.innerHTML='<span class="nm">'+esc(m.produto_nome||m.descricao||'-')+'</span><span class="v '+(isCompra?'compra':isPgto?'pgto':'outro')+'">'+(isCompra?'+ ':isPgto?'− ':'')+fmt(m.valor_total)+'</span>'+
      '<span class="mt">'+esc(fmtD(m.timestamp)+' · '+(rot[m.tipo]||m.tipo))+'</span>';
    tb.appendChild(l);});
}

async function doLogin(){
  if(LO_MODO==='prof'){return PF.entrarPeloLogin();}
  const uid=document.getElementById('lo-usr').value;const pin=document.getElementById('lo-pin').value;
  const err=document.getElementById('lo-err');err.style.display='none';
  if(!uid){err.textContent='Escolha o seu nome.';err.style.display='block';return;}
  if(!pin){err.textContent='Digite seu PIN.';err.style.display='block';return;}
  let r;   /* o PIN é conferido no servidor (5 erros seguidos travam o usuário por 15 minutos) */
  try{r=await LAPI.entrar(uid,pin);}
  catch(e){err.textContent=e.message||String(e);err.style.display='block';if(e.codigo==='PIN_INCORRETO')document.getElementById('lo-pin').value='';return;}
  LAPI.definirToken(r.token);
  const u={id:r.usuario.id,nome:r.usuario.nome,admin:r.usuario.admin===true};
  if(r.pin_trocar&&window.LOGIN_LOJA){LOGIN_LOJA.trocarPin(u,pin,function(){CU=u;entrarApp();});return;}   /* PIN provisório: cria o seu antes de entrar */
  CU=u;entrarApp();
}
document.getElementById('lo-pin').addEventListener('keydown',e=>{if(e.key==='Enter')doLogin();});

function entrarApp(){
  if(window.ENTRADA)ENTRADA.boasVindas(CU);else document.getElementById('lo').style.display='none';   /* saudação (js/entrada.js) esconde a entrada no fim */
  document.getElementById('app').style.display='block';
  document.getElementById('sb-nm').textContent=CU.nome;document.getElementById('sb-av').textContent=CU.nome[0].toUpperCase();
  const pp=document.getElementById('sb-papel');if(pp)pp.textContent=CU.admin===true?'Administração':'Secretária';
  aplicarPermissoes();
  setDatas();updateDate();setInterval(updateDate,60000);loadCaches();loadCfg();
  nav('guias');GV.startTimers();
}
function aplicarPermissoes(){
  const admin=isAdmin();
  const ap=document.getElementById('app');if(ap)ap.classList.toggle('eh-admin',!!admin);
  ['nav-posicao','nav-exportar','nav-cfg','nav-dashboard'].forEach(id=>{const el=document.getElementById(id);if(el)el.style.display=admin?'':' none';});
  ['cx-detalhes-fis','cx-detalhes-ban'].forEach(id=>{const el=document.getElementById(id);if(el)el.style.display=admin?'':'none';});
  const cxa=document.getElementById('cx-acoes');if(cxa)cxa.style.display=admin?'flex':'none';
}
function doLogout(){try{GV.stopTimers();}catch(e){}try{LJ.sair();}catch(e){}try{FIN.sair();}catch(e){}LAPI.sair();CU=null;PC=[];PRC=[];document.getElementById('app').style.display='none';document.getElementById('lo').style.display='flex';document.getElementById('lo-pin').value='';return loadLoginUsers();}
LAPI.aoCair(function(codigo,msg){   /* sessão caiu no meio do uso: volta para a entrada e diz por quê (depois que a lista de nomes recarrega) */
  if(!CU)return;
  const txt=codigo==='TROCAR_PIN'?'O administrador definiu um PIN novo para você. Entre com ele.':(msg||'Sua sessão terminou. Entre de novo.');
  Promise.resolve(doLogout()).then(()=>setTimeout(()=>{const err=document.getElementById('lo-err');if(err){err.textContent=txt;err.style.display='block';}},0));
});
function updateDate(){document.getElementById('tb-dt').textContent=new Date().toLocaleDateString('pt-BR',{weekday:'long',day:'2-digit',month:'long'});}
function setDatas(){const t=todayISO(),f=firstISO();['cx-ini','h-ini','ex-ini','rel-ini'].forEach(id=>{const e=document.getElementById(id);if(e)e.value=f;});['cx-fim','h-fim','ex-fim','rel-fim'].forEach(id=>{const e=document.getElementById(id);if(e)e.value=t;});}

const TTLS={guias:'Guias da Agenda',dashboard:'Dashboard',venda:'Nova Venda',estoque:'Entrada de Estoque',balanco:'Balanço de Estoque',notinhas:'Notinhas',caixa:'Caixa',posicao:'Estoque Atual',profissionais:'Profissionais',historico:'Historico',exportar:'Exportar CSV',cfg:'Configuracoes'};
function nav(s,sub){
  if(s==='venda'&&window.LJ){LJ.abrirVenda();return;}   /* Nova venda agora é a janela no canto (js/loja_nova.js) */
  if(s==='caixa'&&!isAdmin()){s='guias';sub=undefined;}   /* Caixa: só a Administração (24/10/26) */
  document.querySelectorAll('.sec').forEach(x=>x.classList.remove('active'));
  document.getElementById('s-'+s).classList.add('active');
  document.getElementById('tb-ttl').textContent=TTLS[s]||s;
  if(window.moldura)moldura.aoNavegar(s,sub);
  const fn={guias:function(){GV.boot(sub);},dashboard:loadDashboard,estoque:function(){LJ.estoque();},balanco:loadBalanco,notinhas:function(){LJ.notinhas();},caixa:function(){LJ.caixa();},posicao:loadPosicao,profissionais:loadProfTable,historico:function(){LJ.historico();},cfg:loadCfg,financeiro:function(){if(window.FIN)FIN.abrir();}};
  if(fn[s])fn[s]();
}

async function loadCaches(){   /* produtos e profissionais ativos + taxas (uma chamada só) */
  const r=await LAPI.caches();
  PC=r.produtos.sort((a,b)=>a.nome.localeCompare(b.nome));PRC=r.profissionais.sort((a,b)=>a.nome.localeCompare(b.nome));CFG=r.config;
}

async function loadCfg(){
  CFG=await LAPI.config();
  const fd=document.getElementById('cfg-deb'),fc=document.getElementById('cfg-cred'),fb=document.getElementById('cfg-bonif');
  if(fd)fd.value=CFG.taxa_debito||'';if(fc)fc.value=CFG.taxa_credito||'';if(fb)fb.value=CFG.valor_bonificacao_padrao||'';
  if(isAdmin())loadSecLista();   /* a lista de usuários é só do administrador */
}
async function salvarCfg(){
  CFG={taxa_debito:parseFloat(document.getElementById('cfg-deb').value)||0,taxa_credito:parseFloat(document.getElementById('cfg-cred').value)||0,valor_bonificacao_padrao:parseFloat(document.getElementById('cfg-bonif').value)||0};
  await LAPI.configSalvar(CFG.taxa_debito,CFG.taxa_credito,CFG.valor_bonificacao_padrao);toast('Configurações salvas!','ok');
}

async function loadDashboard(){
  try{
    const[mvs,prs]=await Promise.all([LAPI.movimentos({ini:today0(),fim:today23()}),LAPI.profissionais()]);
    const movs=mvs.filter(semErro);const prSnap=prs.filter(p=>p.ativo===true);
    let fis=0,ban=0,vd=0,vq=0,gc=0,gl=0;
    movs.forEach(m=>{const v=m.valor_total||0,l=m.valor_liquido||v;
      if(m.tipo==='venda_paciente'){if(m.forma_pagamento==='dinheiro')fis+=v;else if(m.forma_pagamento==='pix')ban+=v;else ban+=l;vd+=v;vq++;if(m.produto_grupo==='conveniencia')gc+=v;if(m.produto_grupo==='livraria')gl+=v;}
      if(m.tipo==='venda_profissional'){vd+=v;vq++;if(m.produto_grupo==='conveniencia')gc+=v;if(m.produto_grupo==='livraria')gl+=v;}
      if(m.tipo==='pagamento_notinha'){if(m.forma_pagamento==='dinheiro')fis+=v;else if(m.forma_pagamento==='pix')ban+=v;else ban+=(m.valor_liquido||v);}
      if(m.tipo==='sangria')fis-=v;if(m.tipo==='suprimento')fis+=v;
    });
    let tn=0,qn=0;prSnap.forEach(x=>{if(ehOculto(x))return;const s=x.saldo_devedor||0;if(s>0){tn+=s;qn++;}});
    document.getElementById('d-fisico').textContent=fmt(fis);document.getElementById('d-banco').textContent=fmt(ban);
    document.getElementById('d-not').textContent=fmt(tn);document.getElementById('d-not-s').textContent=qn+' profissionais devendo';
    document.getElementById('d-vd').textContent=fmt(vd);document.getElementById('d-vd-s').textContent=vq+' vendas hoje';
    const tb=document.getElementById('d-movs');tb.innerHTML='';
    const ul=movs.slice(0,8);
    if(!ul.length)tb.innerHTML='<tr><td colspan="4" style="text-align:center;color:var(--muted);padding:20px">Nenhuma movimentação hoje</td></tr>';
    else ul.forEach(m=>{const tr=document.createElement('tr');tr.innerHTML='<td>'+tipoBadge(m.tipo)+'</td><td>'+(m.produto_nome||m.descricao||'-')+'</td><td style="font-family:var(--mo)">'+fmt(m.valor_total)+'</td><td style="color:var(--muted);font-size:12px">'+(fmtDT(m.timestamp).split(' ')[1]||'-')+'</td>';tb.appendChild(tr);});
    document.getElementById('d-grupos').innerHTML='<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px"><span style="font-size:13px;font-weight:500">Conveniência</span><span style="font-family:var(--mo);font-weight:700">'+fmt(gc)+'</span></div><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px"><span style="font-size:13px;font-weight:500">Livraria</span><span style="font-family:var(--mo);font-weight:700">'+fmt(gl)+'</span></div><div style="border-top:1px solid var(--bdr);padding-top:12px;display:flex;justify-content:space-between;align-items:center"><span style="font-size:13px;font-weight:600">Total</span><span style="font-family:var(--mo);font-weight:700;color:var(--grn)">'+fmt(gc+gl)+'</span></div>';
  }catch(e){toast('Erro: '+e.message,'ko');console.error(e);}
}

function abrirBaixaNotinha(){
  const sel=document.getElementById('baixa-prof');sel.innerHTML='<option value="">Selecione...</option>';
  PRC.forEach(p=>{const o=document.createElement('option');o.value=p.id;o.textContent=p.nome+(p.saldo_devedor>0&&!saldoOculto(p)?' — deve '+fmt(p.saldo_devedor):'');sel.appendChild(o);});
  document.getElementById('baixa-val').value='';document.getElementById('baixa-obs').value='';
  document.getElementById('baixa-saldo-info').style.display='none';
  sel.onchange=()=>{const p=PRC.find(x=>x.id===sel.value);const info=document.getElementById('baixa-saldo-info');if(p&&p.saldo_devedor>0&&!saldoOculto(p)){info.textContent='Saldo devedor: '+fmt(p.saldo_devedor);info.style.display='block';}else info.style.display='none';};
  openM('m-baixa');
}
async function confirmarBaixaNotinha(){
  const profId=document.getElementById('baixa-prof').value;const prof=PRC.find(x=>x.id===profId);
  if(!profId||!prof){toast('Selecione o profissional.','ko');return;}
  const val=parseFloat(document.getElementById('baixa-val').value)||0;if(val<=0){toast('Informe um valor valido.','ko');return;}
  const pag=document.getElementById('baixa-pag').value;const obs=document.getElementById('baixa-obs').value.trim();
  await LAPI.pagamentoNotinha(profId,val,pag,obs);   /* taxa do cartão e baixa no saldo feitas no servidor */
  closeM('m-baixa');await loadCaches();toast('Pagamento de '+fmt(val)+' registrado!','ok');loadProfTable();
}
function abrirBonif(){
  const lista=document.getElementById('bonif-lista');lista.innerHTML='';
  PRC.forEach(p=>{const v=CFG.valor_bonificacao_padrao!=null?CFG.valor_bonificacao_padrao:100;const div=document.createElement('div');div.style.cssText='display:flex;align-items:center;justify-content:space-between;padding:10px 12px;border:1px solid var(--bdr);border-radius:6px;font-size:13px';div.innerHTML='<label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-weight:500"><input type="checkbox" value="'+p.id+'" data-nm="'+balEsc(p.nome)+'" data-val="'+v+'" style="width:15px;height:15px"> '+balEsc(p.nome)+'</label><span style="font-family:var(--mo);color:var(--amb)">'+fmt(v)+'</span>';lista.appendChild(div);});
  openM('m-bonif');
}
async function confirmarBonif(){
  const checks=document.querySelectorAll('#bonif-lista input[type=checkbox]:checked');if(!checks.length){toast('Nenhum profissional selecionado.','ko');return;}
  await LAPI.bonificacao(Array.from(checks).map(cb=>cb.value));   /* cada um recebe a bonificação padrão da configuração, como antes */
  closeM('m-bonif');await loadCaches();toast('Bonificacoes aplicadas!','ok');loadProfTable();
}

function editProd(p){document.getElementById('mp-id').value=p.id;document.getElementById('mp-ttl').textContent='Editar Produto';document.getElementById('mp-nm').value=p.nome;document.getElementById('mp-gr').value=p.grupo;document.getElementById('mp-un').value=p.unidade||'';document.getElementById('mp-cst').value=p.preco_custo||'';document.getElementById('mp-prc').value=p.preco_venda||'';openM('m-prod');}
async function salvarProd(){
  const id=document.getElementById('mp-id').value;const nm=document.getElementById('mp-nm').value.trim();if(!nm){toast('Informe o nome.','ko');return;}
  if(!id){toast('Produto não encontrado.','ko');return;}
  await LAPI.produtoSalvar(id,nm,document.getElementById('mp-gr').value,document.getElementById('mp-un').value.trim()||'un',parseFloat(document.getElementById('mp-cst').value)||0,parseFloat(document.getElementById('mp-prc').value)||0);
  closeM('m-prod');await loadCaches();toast('Produto salvo!','ok');loadPosicao();
}
async function loadProfTable(){
  const docs=(await LAPI.profissionais()).sort((a,b)=>a.nome.localeCompare(b.nome));const tb=document.getElementById('pr-tb');tb.innerHTML='';
  if(!docs.length){tb.innerHTML='<tr><td colspan="5" style="text-align:center;color:var(--muted);padding:20px">Nenhum profissional cadastrado</td></tr>';return;}
  docs.forEach(p=>{
    const sd=p.saldo_devedor||0;const tr=document.createElement('tr');
    const sdTxt=saldoOculto(p)?'—':sd>0?fmt(sd):sd<0?'Crédito '+fmt(Math.abs(sd)):'Em dia';
    const sdClr=saldoOculto(p)?'var(--muted)':sd>0?'var(--red)':sd<0?'var(--grn)':'var(--muted)';
    const bonif=p.bonificacao_mensal!=null?p.bonificacao_mensal:(CFG.valor_bonificacao_padrao!=null?CFG.valor_bonificacao_padrao:100);
    const be=document.createElement('button');be.className='btn btn-s btn-sm';be.textContent='Editar';be.onclick=()=>editProf(p);
    const bt=document.createElement('button');bt.className='btn btn-s btn-sm';bt.textContent=p.ativo?'Desativar':'Ativar';bt.onclick=()=>toggleProf(p.id,p.ativo);
    const status=(p.ativo?'<span class="bg bg-g">Ativo</span>':'<span class="bg bg-x">Inativo</span>')+(ehOculto(p)?' <span class="bg bg-x">Oculto</span>':'');
    tr.innerHTML='<td style="font-weight:500">'+balEsc(p.nome)+'</td><td style="font-family:var(--mo);color:'+sdClr+'">'+sdTxt+'</td><td style="font-family:var(--mo)">'+fmt(bonif)+'</td><td>'+status+'</td><td></td>';
    const acoes=tr.querySelector('td:last-child');acoes.style.cssText='display:flex;gap:6px';
    acoes.appendChild(be);acoes.appendChild(bt);
    if(isAdmin()){const bo=document.createElement('button');bo.className='btn btn-s btn-sm';bo.textContent=ehOculto(p)?'Exibir':'Ocultar';bo.title='Ocultar a notinha da tela Notinhas e do extrato geral';bo.onclick=()=>toggleOculto(p.id,ehOculto(p));acoes.appendChild(bo);}
    tb.appendChild(tr);
  });
}
async function toggleOculto(id,oculto){
  await LAPI.profissionalOculto(id,!oculto);
  await loadCaches();toast(oculto?'Notinha visivel novamente.':'Notinha ocultada.','ok');loadProfTable();
}
function abrirProf(){
  document.getElementById('mpr-id').value='';
  document.getElementById('mpr-ttl').textContent='Novo Profissional';
  document.getElementById('mpr-nm').value='';
  document.getElementById('mpr-bonif').value=CFG.valor_bonificacao_padrao!=null?CFG.valor_bonificacao_padrao:100;
  document.getElementById('mpr-saldo-blk').style.display='none';
  document.getElementById('mpr-saldo').value='';
  openM('m-prof');
}
function editProf(p){
  document.getElementById('mpr-id').value=p.id;
  document.getElementById('mpr-ttl').textContent='Editar: '+p.nome;
  document.getElementById('mpr-nm').value=p.nome;
  const bonif=p.bonificacao_mensal!=null?p.bonificacao_mensal:(CFG.valor_bonificacao_padrao!=null?CFG.valor_bonificacao_padrao:100);
  document.getElementById('mpr-bonif').value=bonif;
  const semSaldo=saldoOculto(p);   /* notinha oculta: a secretária não vê nem corrige o saldo */
  document.getElementById('mpr-saldo-blk').style.display=semSaldo?'none':'block';
  document.getElementById('mpr-saldo').value=semSaldo?'':(p.saldo_devedor||0);
  document.getElementById('mpr-saldo').dataset.ini=semSaldo?'':String(p.saldo_devedor||0);   /* só vira correção se a pessoa digitar outro valor */
  openM('m-prof');
}
async function salvarProf(){
  const id=document.getElementById('mpr-id').value;const nm=document.getElementById('mpr-nm').value.trim();if(!nm){toast('Informe o nome.','ko');return;}
  const bonif=parseFloat(document.getElementById('mpr-bonif').value)||0;
  if(id){
    /* o servidor corrige o saldo (e registra "Saldo corrigido manualmente…" / "Nome alterado…" no histórico, como antes) */
    const campo=document.getElementById('mpr-saldo');const novoSaldo=parseFloat(campo.value);
    const mexeu=String(campo.value).trim()!==String(campo.dataset.ini==null?'':campo.dataset.ini).trim();
    await LAPI.profissionalSalvar(id,nm,bonif,mexeu&&!isNaN(novoSaldo)?novoSaldo:null);
  }else{
    await LAPI.profissionalCriar(nm,bonif);
  }
  closeM('m-prof');await loadCaches();toast('Profissional salvo!','ok');loadProfTable();
}
async function toggleProf(id,ativo){
  await LAPI.profissionalAtivo(id,!ativo);   /* o servidor registra no histórico */
  await loadCaches();loadProfTable();
}

async function loadSecLista(){
  const lista=await LAPI.usuarios();
  const div=document.getElementById('sec-lista');div.innerHTML='';
  lista.forEach(s=>{
    const row=document.createElement('div');
    row.style.cssText='display:flex;align-items:center;gap:8px;padding:10px 0;border-bottom:1px solid var(--bdr)';
    const info=document.createElement('div');info.style.flex='1';
    info.innerHTML='<div style="font-weight:600">'+balEsc(s.nome)+'</div><div style="font-size:11px;color:var(--muted)">'+(s.admin?'Administrador':'Secretaria')+
      (s.ativo&&!s.pin_definido?' · sem PIN':s.ativo&&s.pin_trocar?' · PIN provisório (troca no próximo acesso)':'')+(s.bloqueado?' · travado por PIN errado':'')+'</div>';
    const badge=document.createElement('span');badge.className=s.ativo?'bg bg-g':'bg bg-x';badge.textContent=s.ativo?'Ativo':'Inativo';
    const be=document.createElement('button');be.className='btn btn-s btn-sm';be.textContent='Editar';be.onclick=()=>editarSec(s);
    const bt=document.createElement('button');bt.className='btn btn-s btn-sm';bt.textContent=s.ativo?'Desativar':'Ativar';bt.onclick=()=>toggleSec(s.id,s.ativo);
    row.appendChild(info);row.appendChild(badge);row.appendChild(be);row.appendChild(bt);
    div.appendChild(row);
  });
}

async function toggleSec(id,ativo){
  if(!confirm((ativo?'Desativar':'Ativar')+' esta secretaria?'))return;
  const r=await LAPI.usuarioAtivo(id,!ativo);
  toast((ativo?'Secretaria desativada':'Secretaria ativada')+'!'+(!ativo&&r.pin_definido===false?' Defina um PIN para ela em Editar.':''),'ok');
  loadSecLista();
}
function editarSec(s){
  document.getElementById('es-id').value=s.id;
  document.getElementById('es-nm').value=s.nome;
  document.getElementById('es-pin').value='';
  document.getElementById('es-pin2').value='';
  document.getElementById('es-ttl').textContent='Editando: '+s.nome;
  openM('m-edit-sec');
}
function abrirSec(){document.getElementById('ms-nm').value='';document.getElementById('ms-pin').value='';document.getElementById('ms-pin2').value='';openM('m-sec');}
async function salvarSec(){
  const nm=document.getElementById('ms-nm').value.trim();const p1=document.getElementById('ms-pin').value;const p2=document.getElementById('ms-pin2').value;
  if(!nm){toast('Informe o nome.','ko');return;}if(!/^\d{4,8}$/.test(p1)){toast('O PIN precisa ter de 4 a 8 números.','ko');return;}if(p1!==p2){toast('PINs nao conferem.','ko');return;}
  await LAPI.usuarioCriar(nm,p1);   /* PIN provisório: ela cria o dela no primeiro acesso */
  closeM('m-sec');toast('Secretaria adicionada! No primeiro acesso ela cria o próprio PIN.','ok');loadSecLista();
}
async function salvarEditSec(){
  const id=document.getElementById('es-id').value;
  const nm=document.getElementById('es-nm').value.trim();
  const p1=document.getElementById('es-pin').value;
  const p2=document.getElementById('es-pin2').value;
  if(!nm){toast('Informe o nome.','ko');return;}
  if(p1){
    if(!/^\d{4,8}$/.test(p1)){toast('O PIN precisa ter de 4 a 8 números.','ko');return;}
    if(p1!==p2){toast('PINs nao conferem.','ko');return;}
  }
  await LAPI.usuarioSalvar(id,nm,p1||null);   /* PIN de outra pessoa vira provisório; o seu, não */
  closeM('m-edit-sec');toast(p1&&id!==(CU&&CU.id)?'Secretaria atualizada! O PIN novo é provisório: ela troca no próximo acesso.':'Secretaria atualizada!','ok');loadSecLista();
}

async function exportCSV(){
  const ini=new Date(document.getElementById('ex-ini').value+'T00:00:00');const fim=new Date(document.getElementById('ex-fim').value+'T23:59:59');const tipo=document.getElementById('ex-tipo').value;
  let rows=await LAPI.movimentos({ini:ini,fim:fim,crescente:true});
  if(tipo==='vendas')rows=rows.filter(r=>r.tipo==='venda_paciente');else if(tipo==='notinhas')rows=rows.filter(r=>r.tipo==='venda_profissional');else if(tipo==='estoque')rows=rows.filter(r=>r.tipo==='entrada_estoque');else if(tipo==='caixa')rows=rows.filter(r=>['sangria','suprimento'].includes(r.tipo));
  const HDR=['Data','Hora','Tipo','Produto/Desc.','Grupo','Qtd','Preco Unit.','Valor Total','Valor Liquido','Taxa','Forma Pgto','Cliente Tipo','Profissional','Secretaria','Marcado Erro','Motivo Erro'];
  const ESC=v=>v==null?'':String(v).replace(/;/g,',');
  const linhas=[HDR.join(';')];
  rows.forEach(m=>{const d=m.timestamp?new Date(m.timestamp):new Date();linhas.push([d.toLocaleDateString('pt-BR'),d.toLocaleTimeString('pt-BR'),ESC(m.tipo),ESC(m.produto_nome||m.descricao),ESC(m.produto_grupo),ESC(m.quantidade),ESC(m.preco_unitario),ESC(m.valor_total),ESC(m.valor_liquido),ESC(m.taxa_valor),ESC(m.forma_pagamento),ESC(m.cliente_tipo),ESC(m.profissional_nome),ESC(m.secretaria_nome),m.marcado_erro?'SIM':'NAO',ESC(m.motivo_erro)].join(';'));});
  const blob=new Blob(['\uFEFF'+linhas.join('\n')],{type:'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='conveniencia_'+document.getElementById('ex-ini').value+'_'+document.getElementById('ex-fim').value+'.csv';a.click();URL.revokeObjectURL(url);
  toast(rows.length+' registros exportados!','ok');
}

document.addEventListener('DOMContentLoaded',function(){var q=new URLSearchParams(location.search);if(q.has('convite')){loModo('prof');PF.convite(q.get('convite'));}else if(q.has('conferir')){loModo('prof');}else{loadLoginUsers();}});
