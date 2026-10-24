// ================================================================
//  PASSO 1: COLE AQUI SUA CONFIGURACAO DO FIREBASE
//  Firebase Console > Seu Projeto > Configuracoes > SDK Web
// ================================================================
const firebaseConfig = {
  apiKey:            "AIzaSyBt4RC-8zLII3KFZJCYIyfGmU1zjTOjkPs",
  authDomain:        "caixa-conveniencia.firebaseapp.com",
  projectId:         "caixa-conveniencia",
  storageBucket:     "caixa-conveniencia.firebasestorage.app",
  messagingSenderId: "822153474776",
  appId:             "1:822153474776:web:30cfee51f47e5735a85dad"
};
// ================================================================

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

let CU=null, PC=[], PRC=[], CFG={taxa_debito:1.5,taxa_credito:3,valor_bonificacao_padrao:100};
const isAdmin=()=>CU&&CU.admin===true;
let CPID=null, CPNM=null, CXTIPO='sangria', PFILTRO='todos';

const fmt=v=>'R$ '+Number(v||0).toFixed(2).replace('.',',').replace(/\B(?=(\d{3})+(?!\d))/g,'.');
const fmtDT=ts=>{if(!ts)return'-';const d=ts.toDate?ts.toDate():new Date(ts);return d.toLocaleDateString('pt-BR')+' '+d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});};
const fmtD=ts=>{if(!ts)return'-';const d=ts.toDate?ts.toDate():new Date(ts);return d.toLocaleDateString('pt-BR');};
const tsMs=ts=>{if(!ts)return 0;const d=ts.toDate?ts.toDate():new Date(ts);return d.getTime();};
const OCULTOS_PADRAO=['gabriel ferreira'];
const ehOculto=p=>!p?false:(p.oculto===true||(p.oculto==null&&OCULTOS_PADRAO.includes(String(p.nome||'').trim().toLowerCase())));
const semErro=m=>m.marcado_erro!==true;
const ordDesc=(a,b)=>tsMs(b.timestamp)-tsMs(a.timestamp);
const ordAsc=(a,b)=>tsMs(a.timestamp)-tsMs(b.timestamp);
window.addEventListener('unhandledrejection',e=>{const msg=(e.reason&&e.reason.message)||String(e.reason);console.error('[FALHA]',e.reason);try{toast('Erro: '+msg,'ko');}catch(_){}});
const today0=()=>{const d=new Date();d.setHours(0,0,0,0);return d;};
const today23=()=>{const d=new Date();d.setHours(23,59,59,999);return d;};
const todayISO=()=>new Date().toISOString().split('T')[0];
const firstISO=()=>{const d=new Date();d.setDate(1);return d.toISOString().split('T')[0];};
async function hashPIN(p){const e=new TextEncoder().encode(p);const b=await crypto.subtle.digest('SHA-256',e);return Array.from(new Uint8Array(b)).map(x=>x.toString(16).padStart(2,'0')).join('');}
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
  const snap=await db.collection('produtos').get();const tb=document.getElementById('pos-tb');tb.innerHTML='';
  let prods=snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>a.nome.localeCompare(b.nome));
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
  const snap=await db.collection('produtos').get();
  BAL=snap.docs.map(d=>{const p=d.data();return{id:d.id,nome:p.nome||'',grupo:p.grupo||'',unidade:p.unidade||'un',estoque:Number(p.estoque_atual)||0,preco:Number(p.preco_venda)||0,ativo:p.ativo!==false,contado:null,precoNovo:null,excluir:false};})
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
function movBase(r){
  return{produto_id:r.id,produto_nome:r.nome,produto_grupo:r.grupo,quantidade:null,preco_unitario:r.preco,valor_total:0,valor_liquido:0,taxa_valor:0,cliente_tipo:null,forma_pagamento:null,profissional_id:null,profissional_nome:null,secretaria_id:CU.id,secretaria_nome:CU.nome,timestamp:firebase.firestore.FieldValue.serverTimestamp(),marcado_erro:false,motivo_erro:null};
}
async function salvarBalanco(){
  const s=resumoBal();if(!s.total)return;
  const linhas=[];if(s.q)linhas.push('- '+s.q+' quantidade(s) corrigida(s)');if(s.p)linhas.push('- '+s.p+' preço(s) alterado(s)');if(s.e)linhas.push('- '+s.e+' produto(s) excluído(s)');
  if(!confirm('Salvar o balanço?\n\n'+linhas.join('\n')))return;
  const b=document.getElementById('bal-salvar');b.disabled=true;b.textContent='Salvando...';
  const mudadas=BAL.filter(balMudou);let feitos=0,falhas=0;
  for(const r of mudadas){
    const ref=db.collection('produtos').doc(r.id);
    try{
      if(r.excluir){
        await ref.update({ativo:false});
        await db.collection('movimentacoes').add({...movBase(r),tipo:'edicao_produto',descricao:'Produto excluído do estoque pelo balanço (tinha '+r.estoque+' '+r.unidade+')'});
        feitos++;continue;
      }
      if(r.contado!==null&&r.contado!==r.estoque){
        const novo=r.contado;
        await db.runTransaction(async t=>{
          const snap=await t.get(ref);const atual=Number((snap.data()||{}).estoque_atual)||0;
          if(atual===novo)return;
          t.update(ref,{estoque_atual:novo});
          t.set(db.collection('movimentacoes').doc(),{...movBase(r),tipo:'ajuste_estoque',quantidade:novo-atual,descricao:'Balanço: '+atual+' → '+novo+' '+r.unidade});
        });
      }
      if(r.precoNovo!==null&&r.precoNovo!==r.preco){
        await ref.update({preco_venda:r.precoNovo});
        await db.collection('movimentacoes').add({...movBase(r),tipo:'edicao_produto',preco_unitario:r.precoNovo,descricao:'Preço de venda: '+fmt(r.preco)+' → '+fmt(r.precoNovo)});
      }
      feitos++;
    }catch(e){console.error('[BALANCO]',r.nome,e);falhas++;}
  }
  b.textContent='Salvar balanço';
  await loadCaches();
  if(falhas)toast('Salvou '+feitos+', mas '+falhas+' deu erro. Confira a lista e tente de novo.','ko');else toast('Balanço salvo! '+feitos+' produto(s) atualizado(s).','ok');
  loadBalanco();
}
async function reativarProduto(r){
  if(!confirm('Colocar "'+r.nome+'" de volta no estoque?'))return;
  await db.collection('produtos').doc(r.id).update({ativo:true});
  await db.collection('movimentacoes').add({...movBase(r),tipo:'edicao_produto',descricao:'Produto reativado no estoque'});
  await loadCaches();toast('"'+r.nome+'" voltou para o estoque.','ok');loadBalanco();
}

async function loadLoginUsers(){
  // Check for public professional view
  const params=new URLSearchParams(window.location.search);const profParam=params.get('prof');
  if(profParam){showPublicView(profParam);return;}
  if(LO_MODO==='prof'){PF.loginLista();return;}
  const snap=await db.collection('secretarias').where('ativo','==',true).get();
  const sel=document.getElementById('lo-usr');sel.innerHTML='';
  if(snap.empty){sel.innerHTML='<option value="__first__">Criar Administrador (Primeiro Acesso)</option>';return;}
  snap.forEach(doc=>{const o=document.createElement('option');o.value=doc.id;o.textContent=doc.data().nome;sel.appendChild(o);});
}
async function showPublicView(profId){
  document.getElementById('lo').style.display='none';
  document.getElementById('pub-view').style.display='block';
  const[profDoc,mvSnap]=await Promise.all([db.collection('profissionais').doc(profId).get(),db.collection('movimentacoes').where('profissional_id','==',profId).get()]);
  if(!profDoc.exists){document.getElementById('pub-nm').textContent='Profissional não encontrado';return;}
  const pd=profDoc.data();const sd=pd.saldo_devedor||0;
  document.getElementById('pub-nm').textContent=pd.nome;
  const sdEl=document.getElementById('pub-sd');sdEl.textContent=sd===0?'Em dia':fmt(Math.abs(sd));sdEl.className=sd>0?'deve':sd<0?'credito':'';
  document.getElementById('pub-sd-sub').textContent=sd>0?'devendo na conveniência':sd<0?'de crédito':'nenhum valor em aberto';
  document.getElementById('pub-sd-rot').textContent=sd>0?'Saldo devedor':sd<0?'Crédito':'Saldo';
  const tb=document.getElementById('pub-tb');tb.innerHTML='';
  const movs=mvSnap.docs.map(d=>({id:d.id,...d.data()})).filter(semErro).sort(ordDesc);
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
  if(!pin){err.textContent='Digite seu PIN.';err.style.display='block';return;}
  if(uid==='__first__'){
    if(pin.length<4){err.textContent='PIN minimo 4 digitos.';err.style.display='block';return;}
    const ph=await hashPIN(pin);
    const ref=await db.collection('secretarias').add({nome:'Administrador',pin_hash:ph,ativo:true,admin:true,criado_em:firebase.firestore.FieldValue.serverTimestamp()});
    await db.collection('configuracoes').doc('geral').set({taxa_debito:1.5,taxa_credito:3.0,valor_bonificacao_padrao:100});
    CU={id:ref.id,nome:'Administrador',admin:true};entrarApp();return;
  }
  const doc=await db.collection('secretarias').doc(uid).get();
  if(!doc.exists){err.textContent='Usuario nao encontrado.';err.style.display='block';return;}
  const ph=await hashPIN(pin);
  if(doc.data().pin_hash!==ph){err.textContent='PIN incorreto.';err.style.display='block';document.getElementById('lo-pin').value='';return;}
  CU={id:uid,nome:doc.data().nome,admin:doc.data().admin===true||doc.data().nome==='Administrador'};entrarApp();
}
document.getElementById('lo-pin').addEventListener('keydown',e=>{if(e.key==='Enter')doLogin();});

function entrarApp(){
  document.getElementById('lo').style.display='none';document.getElementById('app').style.display='block';
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
function doLogout(){try{GV.stopTimers();}catch(e){}try{LJ.sair();}catch(e){}try{FIN.sair();}catch(e){}CU=null;PC=[];PRC=[];document.getElementById('app').style.display='none';document.getElementById('lo').style.display='flex';document.getElementById('lo-pin').value='';loadLoginUsers();}
function updateDate(){document.getElementById('tb-dt').textContent=new Date().toLocaleDateString('pt-BR',{weekday:'long',day:'2-digit',month:'long'});}
function setDatas(){const t=todayISO(),f=firstISO();['cx-ini','h-ini','ex-ini','rel-ini'].forEach(id=>{const e=document.getElementById(id);if(e)e.value=f;});['cx-fim','h-fim','ex-fim','rel-fim'].forEach(id=>{const e=document.getElementById(id);if(e)e.value=t;});}

const TTLS={guias:'Guias da Agenda',dashboard:'Dashboard',venda:'Nova Venda',estoque:'Entrada de Estoque',balanco:'Balanço de Estoque',notinhas:'Notinhas',caixa:'Caixa',posicao:'Estoque Atual',profissionais:'Profissionais',historico:'Historico',exportar:'Exportar CSV',cfg:'Configuracoes'};
function nav(s,sub){
  if(s==='venda'&&window.LJ){LJ.abrirVenda();return;}   /* Nova venda agora é a janela no canto (js/loja_nova.js) */
  document.querySelectorAll('.sec').forEach(x=>x.classList.remove('active'));
  document.getElementById('s-'+s).classList.add('active');
  document.getElementById('tb-ttl').textContent=TTLS[s]||s;
  if(window.moldura)moldura.aoNavegar(s,sub);
  const fn={guias:function(){GV.boot(sub);},dashboard:loadDashboard,venda:loadVendaForm,estoque:window.LJ?LJ.estoque:resetEstoque,balanco:loadBalanco,notinhas:window.LJ?LJ.notinhas:loadNotinhas,caixa:window.LJ?LJ.caixa:loadCaixa,posicao:loadPosicao,profissionais:loadProfTable,historico:window.LJ?LJ.historico:loadHistorico,cfg:loadCfg,financeiro:function(){if(window.FIN)FIN.abrir();}};
  if(fn[s])fn[s]();
}

async function loadCaches(){
  const[ps,prs]=await Promise.all([db.collection('produtos').where('ativo','==',true).get(),db.collection('profissionais').where('ativo','==',true).get()]);
  PC=ps.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>a.nome.localeCompare(b.nome));PRC=prs.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>a.nome.localeCompare(b.nome));
}

async function loadCfg(){
  const doc=await db.collection('configuracoes').doc('geral').get();if(doc.exists)CFG=doc.data();
  const fd=document.getElementById('cfg-deb'),fc=document.getElementById('cfg-cred'),fb=document.getElementById('cfg-bonif');
  if(fd)fd.value=CFG.taxa_debito||'';if(fc)fc.value=CFG.taxa_credito||'';if(fb)fb.value=CFG.valor_bonificacao_padrao||'';
  loadSecLista();
}
async function salvarCfg(){
  CFG={taxa_debito:parseFloat(document.getElementById('cfg-deb').value)||0,taxa_credito:parseFloat(document.getElementById('cfg-cred').value)||0,valor_bonificacao_padrao:parseFloat(document.getElementById('cfg-bonif').value)||0};
  await db.collection('configuracoes').doc('geral').set(CFG);toast('Configurações salvas!','ok');
}

async function loadDashboard(){
  try{
    const[mvSnap,prSnap]=await Promise.all([db.collection('movimentacoes').where('timestamp','>=',today0()).where('timestamp','<=',today23()).orderBy('timestamp','desc').get(),db.collection('profissionais').where('ativo','==',true).get()]);
    const movs=mvSnap.docs.map(d=>({id:d.id,...d.data()})).filter(semErro);
    let fis=0,ban=0,vd=0,vq=0,gc=0,gl=0;
    movs.forEach(m=>{const v=m.valor_total||0,l=m.valor_liquido||v;
      if(m.tipo==='venda_paciente'){if(m.forma_pagamento==='dinheiro')fis+=v;else if(m.forma_pagamento==='pix')ban+=v;else ban+=l;vd+=v;vq++;if(m.produto_grupo==='conveniencia')gc+=v;if(m.produto_grupo==='livraria')gl+=v;}
      if(m.tipo==='venda_profissional'){vd+=v;vq++;if(m.produto_grupo==='conveniencia')gc+=v;if(m.produto_grupo==='livraria')gl+=v;}
      if(m.tipo==='pagamento_notinha'){if(m.forma_pagamento==='dinheiro')fis+=v;else if(m.forma_pagamento==='pix')ban+=v;else ban+=(m.valor_liquido||v);}
      if(m.tipo==='sangria')fis-=v;if(m.tipo==='suprimento')fis+=v;
    });
    let tn=0,qn=0;prSnap.forEach(d=>{const x=d.data();if(ehOculto(x))return;const s=x.saldo_devedor||0;if(s>0){tn+=s;qn++;}});
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

function srchP(pref){
  const q=document.getElementById(pref+'-srch').value.toLowerCase().trim();const res=document.getElementById(pref+'-psr');
  if(!q){res.style.display='none';if(pref==='e')document.getElementById('e-novo-prod-card').style.display='none';return;}
  const mt=PC.filter(p=>p.nome.toLowerCase().includes(q)).slice(0,8);
  if(!mt.length){
    if(pref==='e'){res.style.display='none';document.getElementById('e-novo-prod-card').style.display='block';return;}
    res.style.display='none';return;
  }
  document.getElementById('e-novo-prod-card') && (document.getElementById('e-novo-prod-card').style.display='none');
  res.style.display='block';res.innerHTML='';
  mt.forEach(p=>{const div=document.createElement('div');div.className='psr-item';div.innerHTML='<span>'+p.nome+' <span style="color:var(--muted);font-size:11px">'+p.grupo+'</span></span><span style="font-family:var(--mo);color:var(--grnm)">'+fmt(p.preco_venda)+'</span>';div.onclick=()=>selP(p,pref);res.appendChild(div);});
  if(pref==='e'){const addDiv=document.createElement('div');addDiv.className='psr-item';addDiv.innerHTML='<span style="color:var(--grnm);font-weight:600">+ Nao encontrei - Criar novo produto</span>';addDiv.onclick=()=>{res.style.display='none';document.getElementById('e-novo-prod-card').style.display='block';};res.appendChild(addDiv);}
}
function selP(p,pref){
  document.getElementById(pref+'-pid').value=p.id;document.getElementById(pref+'-srch').value='';document.getElementById(pref+'-psr').style.display='none';
  const sel=document.getElementById(pref+'-psel');sel.style.display='block';
  sel.innerHTML='<strong>'+p.nome+'</strong> - '+p.grupo+' - '+fmt(p.preco_venda)+'/un <button onclick="clrP(\''+pref+'\')" style="float:right;background:none;border:none;cursor:pointer;color:inherit;font-size:11px;opacity:.7">trocar</button>';
  if(pref==='v'){document.getElementById('v-prc').value=fmt(p.preco_venda);calcV();}
}
function clrP(pref){document.getElementById(pref+'-pid').value='';document.getElementById(pref+'-psel').style.display='none';if(pref==='v'){document.getElementById('v-prc').value='';document.getElementById('v-tot').textContent='R$ 0,00';}}

let CARRINHO=[];
async function loadVendaForm(){
  await loadCaches();
  CARRINHO=[];renderCarrinho();
  document.getElementById('v-tot').textContent='R$ 0,00';document.getElementById('v-taxa').textContent='';
  document.querySelectorAll('input[name="v-tipo"]')[0].checked=true;switchTipo();
  const sel=document.getElementById('v-prof');sel.innerHTML='<option value="">Selecione...</option>';
  PRC.forEach(p=>{const o=document.createElement('option');o.value=p.id;o.textContent=p.nome+(p.saldo_devedor>0?' - deve '+fmt(p.saldo_devedor):'');sel.appendChild(o);});
}
function switchTipo(){const t=document.querySelector('input[name="v-tipo"]:checked').value;document.getElementById('v-pag-blk').style.display=t==='paciente'?'block':'none';document.getElementById('v-prof-blk').style.display=t==='profissional'?'block':'none';calcCarrinho();}
function switchPgtoprof(){const v=document.querySelector('input[name="v-pgto-prof"]:checked').value;document.getElementById('v-prof-pag').style.display=v==='agora'?'block':'none';calcCarrinho();}
function addItemCarrinho(){
  const div=document.createElement('div');div.className='carrinho-item';div.style.cssText='display:flex;gap:8px;align-items:center;padding:10px;background:var(--surf2);border-radius:8px;border:1px solid var(--bdr)';
  const idx=CARRINHO.length;CARRINHO.push({pid:'',pnm:'',grupo:'',preco:0,qtd:1});
  div.innerHTML='<div class="p-wrap" style="flex:1;position:relative"><input type="text" class="fc" placeholder="Buscar produto..." style="font-size:13px" oninput="srchPItem(this,'+idx+')"><div class="psr" id="psr-'+idx+'" style="display:none"></div></div><input type="number" min="1" value="1" class="fc" style="width:70px;font-size:13px" onchange="setQtdItem('+idx+',this.value)"><span style="font-family:var(--mo);font-size:13px;color:var(--muted);min-width:70px;text-align:right" id="item-preco-'+idx+'">R$ 0,00</span><button onclick="removeItem('+idx+')" style="background:none;border:none;cursor:pointer;color:var(--red);font-size:16px;padding:0 4px">×</button>';
  document.getElementById('v-carrinho').appendChild(div);
}
function srchPItem(input,idx){
  const q=input.value.toLowerCase().trim();const res=document.getElementById('psr-'+idx);
  if(!q){res.style.display='none';return;}
  const mt=PC.filter(p=>p.nome.toLowerCase().includes(q)).slice(0,6);
  if(!mt.length){res.style.display='none';return;}
  res.style.display='block';res.innerHTML='';
  mt.forEach(p=>{const div=document.createElement('div');div.className='psr-item';div.innerHTML='<span>'+p.nome+'</span><span style="font-family:var(--mo);color:var(--grnm)">'+fmt(p.preco_venda)+'</span>';div.onclick=()=>{CARRINHO[idx]={pid:p.id,pnm:p.nome,grupo:p.grupo,preco:p.preco_venda,qtd:CARRINHO[idx].qtd||1};input.value=p.nome;res.style.display='none';document.getElementById('item-preco-'+idx).textContent=fmt(p.preco_venda*(CARRINHO[idx].qtd||1));calcCarrinho();};res.appendChild(div);});
}
function setQtdItem(idx,v){CARRINHO[idx].qtd=parseInt(v)||1;if(CARRINHO[idx].preco)document.getElementById('item-preco-'+idx).textContent=fmt(CARRINHO[idx].preco*CARRINHO[idx].qtd);calcCarrinho();}
function removeItem(idx){CARRINHO[idx]={pid:'',pnm:'',grupo:'',preco:0,qtd:1};const els=document.getElementById('v-carrinho').children;if(els[idx])els[idx].remove();calcCarrinho();}
function renderCarrinho(){document.getElementById('v-carrinho').innerHTML='';CARRINHO=[];addItemCarrinho();}
function calcCarrinho(){
  const itens=CARRINHO.filter(x=>x.pid);const tot=itens.reduce((s,x)=>s+x.preco*x.qtd,0);
  document.getElementById('v-tot').textContent=fmt(tot);
  const tipo=document.querySelector('input[name="v-tipo"]:checked').value;const ti=document.getElementById('v-taxa');
  if(tipo==='paciente'){const pag=document.getElementById('v-pag').value;if(pag==='debito'){const tx=CFG.taxa_debito||0;ti.textContent='Taxa debito '+tx+'% - Liquido: '+fmt(tot*(1-tx/100));}else if(pag==='credito'){const tx=CFG.taxa_credito||0;ti.textContent='Taxa credito '+tx+'% - Liquido: '+fmt(tot*(1-tx/100));}else ti.textContent='';}
  else if(tipo==='profissional'){const pgp=document.querySelector('input[name="v-pgto-prof"]:checked');const pgtVal=pgp?pgp.value:'notinha';if(pgtVal==='agora'){const pag=document.getElementById('v-pag-prof').value;if(pag==='debito'){const tx=CFG.taxa_debito||0;ti.textContent='Taxa debito '+tx+'% - Liquido: '+fmt(tot*(1-tx/100));}else if(pag==='credito'){const tx=CFG.taxa_credito||0;ti.textContent='Taxa credito '+tx+'% - Liquido: '+fmt(tot*(1-tx/100));}else ti.textContent='';}else ti.textContent='Sera lancado na notinha do profissional';}
}
function calcV(){calcCarrinho();}
async function confirmarVenda(){
  const itens=CARRINHO.filter(x=>x.pid);if(!itens.length){toast('Adicione pelo menos um produto.','ko');return;}
  const tipo=document.querySelector('input[name="v-tipo"]:checked').value;
  const tot=itens.reduce((s,x)=>s+x.preco*x.qtd,0);
  if(tipo==='paciente'){
    const pag=document.getElementById('v-pag').value;let tx=0,liq=tot;
    if(pag==='debito'){tx=tot*(CFG.taxa_debito||0)/100;liq=tot-tx;}if(pag==='credito'){tx=tot*(CFG.taxa_credito||0)/100;liq=tot-tx;}
    const batch=db.batch();
    itens.forEach(item=>{
      const ref=db.collection('movimentacoes').doc();
      batch.set(ref,{tipo:'venda_paciente',cliente_tipo:'paciente',produto_id:item.pid,produto_nome:item.pnm,produto_grupo:item.grupo,quantidade:item.qtd,preco_unitario:item.preco,valor_total:item.preco*item.qtd,valor_liquido:(item.preco*item.qtd)*(liq/tot),taxa_valor:(item.preco*item.qtd)*(tx/tot),forma_pagamento:pag,profissional_id:null,profissional_nome:null,secretaria_id:CU.id,secretaria_nome:CU.nome,timestamp:firebase.firestore.FieldValue.serverTimestamp(),marcado_erro:false,motivo_erro:null});
      const pRef=db.collection('produtos').doc(item.pid);batch.update(pRef,{estoque_atual:firebase.firestore.FieldValue.increment(-item.qtd)});
    });
    await batch.commit();
  }else{
    const profId=document.getElementById('v-prof').value;const prof=PRC.find(x=>x.id===profId);if(!profId||!prof){toast('Selecione o profissional.','ko');return;}
    const pgpEl=document.querySelector('input[name="v-pgto-prof"]:checked');const pgpVal=pgpEl?pgpEl.value:'notinha';
    const batch=db.batch();
    itens.forEach(item=>{
      const ref=db.collection('movimentacoes').doc();const vt=item.preco*item.qtd;
      if(pgpVal==='notinha'){
        batch.set(ref,{tipo:'venda_profissional',cliente_tipo:'profissional',produto_id:item.pid,produto_nome:item.pnm,produto_grupo:item.grupo,quantidade:item.qtd,preco_unitario:item.preco,valor_total:vt,valor_liquido:vt,taxa_valor:0,forma_pagamento:'notinha',profissional_id:profId,profissional_nome:prof.nome,secretaria_id:CU.id,secretaria_nome:CU.nome,timestamp:firebase.firestore.FieldValue.serverTimestamp(),marcado_erro:false,motivo_erro:null});
      }else{
        const pag=document.getElementById('v-pag-prof').value;let tx=0,liq=vt;if(pag==='debito'){tx=vt*(CFG.taxa_debito||0)/100;liq=vt-tx;}if(pag==='credito'){tx=vt*(CFG.taxa_credito||0)/100;liq=vt-tx;}
        batch.set(ref,{tipo:'venda_paciente',cliente_tipo:'profissional',produto_id:item.pid,produto_nome:item.pnm,produto_grupo:item.grupo,quantidade:item.qtd,preco_unitario:item.preco,valor_total:vt,valor_liquido:liq,taxa_valor:tx,forma_pagamento:pag,profissional_id:profId,profissional_nome:prof.nome,secretaria_id:CU.id,secretaria_nome:CU.nome,timestamp:firebase.firestore.FieldValue.serverTimestamp(),marcado_erro:false,motivo_erro:null});
      }
      const pRef=db.collection('produtos').doc(item.pid);batch.update(pRef,{estoque_atual:firebase.firestore.FieldValue.increment(-item.qtd)});
    });
    if(pgpVal==='notinha'){batch.update(db.collection('profissionais').doc(profId),{saldo_devedor:firebase.firestore.FieldValue.increment(tot)});}
    await batch.commit();
  }
  toast('Venda registrada! '+fmt(tot),'ok');await loadCaches();loadVendaForm();
}

function resetEstoque(){['e-srch','e-obs'].forEach(id=>document.getElementById(id).value='');['e-pid'].forEach(id=>document.getElementById(id).value='');document.getElementById('e-psel').style.display='none';document.getElementById('e-psr').style.display='none';document.getElementById('e-novo-prod-card').style.display='none';document.getElementById('e-qtd').value=1;document.getElementById('e-cst').value='';document.getElementById('e-cst-un').value='';document.getElementById('e-preco-venda').value='';}
function calcCustoTotal(){const qtd=parseInt(document.getElementById('e-qtd').value)||1;const un=parseFloat(document.getElementById('e-cst-un').value)||0;document.getElementById('e-cst').value=un>0?(un*qtd).toFixed(2):'';}
function calcCustoUn(){const qtd=parseInt(document.getElementById('e-qtd').value)||1;const tot=parseFloat(document.getElementById('e-cst').value)||0;document.getElementById('e-cst-un').value=tot>0&&qtd>0?(tot/qtd).toFixed(2):'';}
function criarProdutoInline(){
  const nm=document.getElementById('e-srch').value.trim();if(!nm){toast('Digite o nome do produto.','ko');return;}
  const gr=document.getElementById('e-np-gr').value;const un=document.getElementById('e-np-un').value.trim()||'un';
  db.collection('produtos').add({nome:nm,grupo:gr,unidade:un,preco_custo:0,preco_venda:0,estoque_atual:0,ativo:true,criado_em:firebase.firestore.FieldValue.serverTimestamp()}).then(ref=>{
    const p={id:ref.id,nome:nm,grupo:gr,unidade:un,preco_custo:0,preco_venda:0,estoque_atual:0,ativo:true};
    PC.push(p);selP(p,'e');document.getElementById('e-novo-prod-card').style.display='none';toast('Produto criado!','ok');
  });
}
async function confirmarEstoque(){
  const pid=document.getElementById('e-pid').value;const p=PC.find(x=>x.id===pid);if(!p){toast('Selecione um produto.','ko');return;}
  const qtd=parseInt(document.getElementById('e-qtd').value)||1;
  const cstUn=parseFloat(document.getElementById('e-cst-un').value)||0;
  const cstTot=parseFloat(document.getElementById('e-cst').value)||0;
  const novoPrecoVenda=parseFloat(document.getElementById('e-preco-venda').value)||0;
  const obs=document.getElementById('e-obs').value.trim();
  await db.collection('movimentacoes').add({tipo:'entrada_estoque',produto_id:p.id,produto_nome:p.nome,produto_grupo:p.grupo,quantidade:qtd,preco_unitario:cstUn,custo_unitario:cstUn,valor_total:cstTot,valor_liquido:cstTot,taxa_valor:0,descricao:obs||'Entrada de estoque',cliente_tipo:null,forma_pagamento:null,profissional_id:null,profissional_nome:null,secretaria_id:CU.id,secretaria_nome:CU.nome,timestamp:firebase.firestore.FieldValue.serverTimestamp(),marcado_erro:false,motivo_erro:null});
  const upd={estoque_atual:firebase.firestore.FieldValue.increment(qtd)};
  if(cstUn>0)upd.preco_custo=cstUn;
  if(novoPrecoVenda>0)upd.preco_venda=novoPrecoVenda;
  await db.collection('produtos').doc(pid).update(upd);
  if(novoPrecoVenda>0){const idx=PC.findIndex(x=>x.id===pid);if(idx>=0)PC[idx].preco_venda=novoPrecoVenda;}
  toast('Entrada: '+qtd+'x '+p.nome,'ok');await loadCaches();resetEstoque();
}

async function loadNotinhas(){
  CPID=null;CPNM=null;
  document.getElementById('not-grid').style.display='grid';document.getElementById('not-det').style.display='none';
  const snap=await db.collection('profissionais').where('ativo','==',true).get();
  const grid=document.getElementById('not-grid');grid.innerHTML='';
  const profs=snap.docs.map(d=>({id:d.id,...d.data()})).filter(p=>!ehOculto(p)).sort((a,b)=>a.nome.localeCompare(b.nome));
  if(!profs.length){grid.innerHTML='<p style="color:var(--muted)">Nenhum profissional cadastrado.</p>';return;}
  profs.forEach(p=>{
    const s=p.saldo_devedor||0;
    const card=document.createElement('div');card.className='nc';card.onclick=()=>abrirDetNot(p.id,p.nome);
    const cls=s>0?'dev':s<0?'crd':'ok';const sl=s>0?fmt(s):s<0?'Credito: '+fmt(Math.abs(s)):'Em dia';
    card.innerHTML='<div style="display:flex;justify-content:space-between"><div class="nc-nm">'+p.nome+'</div><span id="lnk-'+p.id+'" style="cursor:pointer;font-size:15px;opacity:.6">&#128279;</span></div><div class="nc-sd '+cls+'">'+sl+'</div><div class="nc-it">Bonificacao: '+fmt(p.bonificacao_mensal!=null?p.bonificacao_mensal:(CFG.valor_bonificacao_padrao||100))+'/mes</div>';
    grid.appendChild(card);
    document.getElementById('lnk-'+p.id).onclick=e=>{e.stopPropagation();gerarLink(p.id);};
  });
}
async function abrirDetNot(id,nm){
  CPID=id;CPNM=nm;document.getElementById('not-grid').style.display='none';document.getElementById('not-det').style.display='block';document.getElementById('nd-nm').textContent=nm;
  const[mvSnap,prDoc]=await Promise.all([db.collection('movimentacoes').where('profissional_id','==',id).get(),db.collection('profissionais').doc(id).get()]);
  const movs=mvSnap.docs.map(d=>({id:d.id,...d.data()})).filter(semErro).sort(ordDesc);
  let cp=0,pg=0;movs.forEach(m=>{if(m.tipo==='venda_profissional')cp+=m.valor_total||0;if(['pagamento_notinha','bonificacao'].includes(m.tipo))pg+=m.valor_total||0;});
  const sd=prDoc.data().saldo_devedor||0;
  const sdEl=document.getElementById('nd-sd');sdEl.textContent=fmt(Math.abs(sd));sdEl.style.color=sd>0?'var(--red)':'var(--grn)';
  document.getElementById('nd-cp').textContent=fmt(cp);document.getElementById('nd-pg').textContent=fmt(pg);
  const tb=document.getElementById('nd-tb');tb.innerHTML='';
  if(!movs.length){tb.innerHTML='<tr><td colspan="7" style="text-align:center;color:var(--muted);padding:20px">Nenhum lancamento</td></tr>';return;}
  movs.forEach(m=>{const tr=document.createElement('tr');tr.innerHTML='<td style="font-size:12px">'+fmtDT(m.timestamp)+'</td><td>'+(m.produto_nome||m.descricao||'-')+'</td><td style="text-align:center">'+(m.quantidade||'-')+'</td><td style="font-family:var(--mo)">'+fmt(m.valor_total)+'</td><td>'+tipoBadge(m.tipo)+'</td><td style="color:var(--muted);font-size:12px">'+(m.secretaria_nome||'-')+'</td><td><button class="btn btn-s btn-sm" onclick="abrirMarcarErro(\''+m.id+'\')">Erro</button></td>';tb.appendChild(tr);});
}
function voltarNot(){document.getElementById('not-grid').style.display='grid';document.getElementById('not-det').style.display='none';loadNotinhas();}

function abrirPgto(){
  const prof=PRC.find(x=>x.id===CPID);const sd=prof?prof.saldo_devedor||0:0;
  document.getElementById('mpg-info').textContent=CPNM+' - Saldo devedor: '+fmt(sd);document.getElementById('mpg-val').value='';openM('m-pgto');
}
async function confirmarPgto(){
  const val=parseFloat(document.getElementById('mpg-val').value)||0;const pag=document.getElementById('mpg-pag').value;if(val<=0){toast('Informe um valor valido.','ko');return;}
  let tx=0,liq=val;if(pag==='debito'){tx=val*(CFG.taxa_debito||0)/100;liq=val-tx;}if(pag==='credito'){tx=val*(CFG.taxa_credito||0)/100;liq=val-tx;}
  await db.collection('movimentacoes').add({tipo:'pagamento_notinha',profissional_id:CPID,profissional_nome:CPNM,descricao:'Pagamento de notinha',valor_total:val,valor_liquido:liq,taxa_valor:tx,forma_pagamento:pag,quantidade:null,produto_id:null,produto_nome:null,produto_grupo:null,preco_unitario:null,cliente_tipo:'profissional',secretaria_id:CU.id,secretaria_nome:CU.nome,timestamp:firebase.firestore.FieldValue.serverTimestamp(),marcado_erro:false,motivo_erro:null});
  await db.collection('profissionais').doc(CPID).update({saldo_devedor:firebase.firestore.FieldValue.increment(-val)});
  closeM('m-pgto');await loadCaches();toast('Pagamento registrado!','ok');abrirDetNot(CPID,CPNM);
}

function abrirBaixaNotinha(){
  const sel=document.getElementById('baixa-prof');sel.innerHTML='<option value="">Selecione...</option>';
  PRC.forEach(p=>{const o=document.createElement('option');o.value=p.id;o.textContent=p.nome+(p.saldo_devedor>0?' — deve '+fmt(p.saldo_devedor):'');sel.appendChild(o);});
  document.getElementById('baixa-val').value='';document.getElementById('baixa-obs').value='';
  document.getElementById('baixa-saldo-info').style.display='none';
  sel.onchange=()=>{const p=PRC.find(x=>x.id===sel.value);const info=document.getElementById('baixa-saldo-info');if(p&&p.saldo_devedor>0){info.textContent='Saldo devedor: '+fmt(p.saldo_devedor);info.style.display='block';}else info.style.display='none';};
  openM('m-baixa');
}
async function confirmarBaixaNotinha(){
  const profId=document.getElementById('baixa-prof').value;const prof=PRC.find(x=>x.id===profId);
  if(!profId||!prof){toast('Selecione o profissional.','ko');return;}
  const val=parseFloat(document.getElementById('baixa-val').value)||0;if(val<=0){toast('Informe um valor valido.','ko');return;}
  const pag=document.getElementById('baixa-pag').value;const obs=document.getElementById('baixa-obs').value.trim();
  let tx=0,liq=val;if(pag==='debito'){tx=val*(CFG.taxa_debito||0)/100;liq=val-tx;}if(pag==='credito'){tx=val*(CFG.taxa_credito||0)/100;liq=val-tx;}
  await db.collection('movimentacoes').add({tipo:'pagamento_notinha',profissional_id:profId,profissional_nome:prof.nome,descricao:'Pagamento de notinha'+(obs?' — '+obs:''),valor_total:val,valor_liquido:liq,taxa_valor:tx,forma_pagamento:pag,quantidade:null,produto_id:null,produto_nome:null,produto_grupo:null,preco_unitario:null,cliente_tipo:'profissional',secretaria_id:CU.id,secretaria_nome:CU.nome,timestamp:firebase.firestore.FieldValue.serverTimestamp(),marcado_erro:false,motivo_erro:null});
  await db.collection('profissionais').doc(profId).update({saldo_devedor:firebase.firestore.FieldValue.increment(-val)});
  closeM('m-baixa');await loadCaches();toast('Pagamento de '+fmt(val)+' registrado!','ok');loadProfTable();
}
function abrirBonif(){
  const lista=document.getElementById('bonif-lista');lista.innerHTML='';
  PRC.forEach(p=>{const v=CFG.valor_bonificacao_padrao!=null?CFG.valor_bonificacao_padrao:100;const div=document.createElement('div');div.style.cssText='display:flex;align-items:center;justify-content:space-between;padding:10px 12px;border:1px solid var(--bdr);border-radius:6px;font-size:13px';div.innerHTML='<label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-weight:500"><input type="checkbox" value="'+p.id+'" data-nm="'+balEsc(p.nome)+'" data-val="'+v+'" style="width:15px;height:15px"> '+balEsc(p.nome)+'</label><span style="font-family:var(--mo);color:var(--amb)">'+fmt(v)+'</span>';lista.appendChild(div);});
  openM('m-bonif');
}
async function confirmarBonif(){
  const checks=document.querySelectorAll('#bonif-lista input[type=checkbox]:checked');if(!checks.length){toast('Nenhum profissional selecionado.','ko');return;}
  const val=CFG.valor_bonificacao_padrao!=null?CFG.valor_bonificacao_padrao:100;
  const batch=db.batch();
  checks.forEach(cb=>{
    const profId=cb.value,nm=cb.dataset.nm;
    const ref=db.collection('movimentacoes').doc();
    batch.set(ref,{tipo:'bonificacao',profissional_id:profId,profissional_nome:nm,descricao:'Bonificacao mensal — R$ '+val.toFixed(2),valor_total:val,valor_liquido:val,taxa_valor:0,forma_pagamento:null,quantidade:null,produto_id:null,produto_nome:null,produto_grupo:null,preco_unitario:null,cliente_tipo:'profissional',secretaria_id:CU.id,secretaria_nome:CU.nome,timestamp:firebase.firestore.FieldValue.serverTimestamp(),marcado_erro:false,motivo_erro:null});
    batch.update(db.collection('profissionais').doc(profId),{saldo_devedor:firebase.firestore.FieldValue.increment(-val)});
  });
  await batch.commit();closeM('m-bonif');await loadCaches();toast('Bonificacoes aplicadas!','ok');loadProfTable();
}

const REL_TIPOS=['venda_profissional','pagamento_notinha','bonificacao','venda_paciente'];
const PAGNM={dinheiro:'Dinheiro',pix:'PIX',debito:'Cartao Debito',credito:'Cartao Credito',notinha:'Notinha'};
const RELW=57;
function relDesc(base,suf){const max=30,s=suf||'',b=String(base||'-');return (b.length+s.length>max?b.substring(0,max-s.length-1)+'.':b)+s;}
function relLinha(m){
  const dt=fmtD(m.timestamp);const q=m.quantidade||1;let desc='',sin='  ';
  if(m.tipo==='venda_profissional'){desc=relDesc(m.produto_nome,q>1?' x'+q:'');sin='+ ';}
  else if(m.tipo==='pagamento_notinha'){desc=relDesc('PAGAMENTO',m.forma_pagamento?' - '+(PAGNM[m.forma_pagamento]||m.forma_pagamento):'');sin='- ';}
  else if(m.tipo==='bonificacao'){desc='BONIFICACAO MENSAL';sin='- ';}
  else{desc=relDesc(m.produto_nome,' [pago]');sin='  ';}
  return '  '+dt+'  '+desc.padEnd(30)+sin+fmt(m.valor_total).padStart(11);
}
function relRodape(d,saldo){
  let t='  '+'-'.repeat(53)+'\n';
  if(d.compras>0)t+='  '+'Compras na notinha'.padEnd(42)+'+ '+fmt(d.compras).padStart(11)+'\n';
  if(d.pagos>0)t+='  '+'Pagamentos'.padEnd(42)+'- '+fmt(d.pagos).padStart(11)+'\n';
  if(d.bonif>0)t+='  '+'Bonificacoes'.padEnd(42)+'- '+fmt(d.bonif).padStart(11)+'\n';
  if(d.avista>0)t+='  '+'[pago] Pagas na hora (fora do saldo)'.padEnd(42)+'  '+fmt(d.avista).padStart(11)+'\n';
  const lbl=saldo>0?'SALDO DEVEDOR ATUAL':saldo<0?'CREDITO A FAVOR':'SALDO ATUAL (em dia)';
  t+='  '+lbl.padEnd(42)+'  '+fmt(Math.abs(saldo)).padStart(11)+'\n';
  return t;
}
function abrirRel(){
  const sel=document.getElementById('rel-prof');
  sel.innerHTML='<option value="">Todos os profissionais</option>';
  PRC.filter(p=>isAdmin()||!ehOculto(p)).forEach(p=>{const o=document.createElement('option');o.value=p.id;o.textContent=p.nome+(ehOculto(p)?' (oculto)':'');sel.appendChild(o);});
  sel.value=CPID||'';
  document.getElementById('rel-ini').value=firstISO();
  document.getElementById('rel-fim').value=todayISO();
  document.getElementById('rel-txt').value='';
  openM('m-rel');
  gerarRel();
}
async function gerarRel(){
  const out=document.getElementById('rel-txt');if(!out)return;
  try{
    const vi=document.getElementById('rel-ini').value,vf=document.getElementById('rel-fim').value;
    if(!vi||!vf){out.value='Informe as duas datas.';return;}
    const ini=new Date(vi+'T00:00:00'),fim=new Date(vf+'T23:59:59');
    const profId=document.getElementById('rel-prof').value;
    out.value='Gerando extrato...';
    const[mvSnap,prSnap]=await Promise.all([
      db.collection('movimentacoes').where('timestamp','>=',ini).where('timestamp','<=',fim).orderBy('timestamp').get(),
      db.collection('profissionais').get()
    ]);
    const SALDO={},NOME={},OCULTO={};
    prSnap.forEach(d=>{const x=d.data();SALDO[d.id]=x.saldo_devedor||0;NOME[d.id]=x.nome;OCULTO[d.id]=ehOculto(x);});
    let movs=mvSnap.docs.map(d=>d.data()).filter(m=>semErro(m)&&m.profissional_id&&REL_TIPOS.includes(m.tipo));
    if(profId)movs=movs.filter(m=>m.profissional_id===profId);
    else movs=movs.filter(m=>!OCULTO[m.profissional_id]);
    movs.sort(ordAsc);
    const por={};
    movs.forEach(m=>{
      const k=m.profissional_id;const v=m.valor_total||0;
      if(!por[k])por[k]={nome:NOME[k]||m.profissional_nome||'(sem nome)',itens:[],compras:0,pagos:0,bonif:0,avista:0};
      por[k].itens.push(m);
      if(m.tipo==='venda_profissional')por[k].compras+=v;
      else if(m.tipo==='pagamento_notinha')por[k].pagos+=v;
      else if(m.tipo==='bonificacao')por[k].bonif+=v;
      else por[k].avista+=v;
    });
    const iniF=ini.toLocaleDateString('pt-BR'),fimF=fim.toLocaleDateString('pt-BR');
    let txt='';
    if(profId){
      const nm=NOME[profId]||CPNM||'Profissional';const sd=SALDO[profId]||0;
      txt+='EXTRATO DE NOTINHA\n'+nm+'\nPeriodo: '+iniF+' a '+fimF+'\n'+'='.repeat(RELW)+'\n';
      const d=por[profId];
      if(!d){
        txt+='\n  Nenhuma movimentacao neste periodo.\n\n';
        txt+=relRodape({compras:0,pagos:0,bonif:0,avista:0},sd);
      }else{
        txt+='\n';d.itens.forEach(m=>{txt+=relLinha(m)+'\n';});
        txt+=relRodape(d,sd);
      }
      txt+='='.repeat(RELW)+'\nCentro Medico Judithe Ferreira\n';
    }else{
      txt+='EXTRATO DE NOTINHAS - TODOS OS PROFISSIONAIS\nPeriodo: '+iniF+' a '+fimF+'\n'+'='.repeat(RELW)+'\n';
      const ks=Object.keys(por).sort((a,b)=>por[a].nome.localeCompare(por[b].nome));
      if(!ks.length){out.value=txt+'\n  Nenhuma movimentacao de profissional no periodo.\n';return;}
      let tc=0,tp=0,tb=0,ts=0;
      ks.forEach(k=>{
        const d=por[k];tc+=d.compras;tp+=d.pagos;tb+=d.bonif;
        txt+='\n'+d.nome+'\n'+'-'.repeat(RELW)+'\n';
        d.itens.forEach(m=>{txt+=relLinha(m)+'\n';});
        txt+=relRodape(d,SALDO[k]||0);
      });
      Object.keys(SALDO).forEach(k=>{if(SALDO[k]>0&&!OCULTO[k])ts+=SALDO[k];});
      txt+='\n'+'='.repeat(RELW)+'\n';
      txt+='  '+'TOTAL COMPRAS NO PERIODO'.padEnd(42)+'+ '+fmt(tc).padStart(11)+'\n';
      txt+='  '+'TOTAL PAGAMENTOS'.padEnd(42)+'- '+fmt(tp).padStart(11)+'\n';
      txt+='  '+'TOTAL BONIFICACOES'.padEnd(42)+'- '+fmt(tb).padStart(11)+'\n';
      txt+='  '+'DEVIDO HOJE (TODOS)'.padEnd(42)+'  '+fmt(ts).padStart(11)+'\n';
    }
    out.value=txt;
  }catch(e){
    console.error(e);
    out.value='ERRO AO GERAR EXTRATO\n\n'+(e.message||e)+'\n\nAbra o console (F12) para detalhes.';
    toast('Erro: '+(e.message||e),'ko');
  }
}
function copiarRel(){const t=document.getElementById('rel-txt').value;if(!t)return;navigator.clipboard.writeText(t).then(()=>toast('Copiado!','ok'));}
function copiarRelWA(){const t=document.getElementById('rel-txt').value;if(!t)return;navigator.clipboard.writeText('```\n'+t+'```').then(()=>toast('Copiado com formatacao do WhatsApp!','ok'));}

async function loadCaixa(){
  const vi=document.getElementById('cx-ini').value,vf=document.getElementById('cx-fim').value;
  if(!vi||!vf){toast('Informe as duas datas.','ko');return;}
  const ini=new Date(vi+'T00:00:00');const fim=new Date(vf+'T23:59:59');
  const snap=await db.collection('movimentacoes').where('timestamp','>=',ini).where('timestamp','<=',fim).orderBy('timestamp','desc').get();
  const movs=snap.docs.map(d=>({id:d.id,...d.data()})).filter(semErro);
  let edin=0,pnot=0,supr=0,sang=0,pix=0,deb=0,cred=0,tax=0;
  movs.forEach(m=>{const v=m.valor_total||0,l=m.valor_liquido||v,t=m.taxa_valor||0;
    if(m.tipo==='venda_paciente'||m.tipo==='pagamento_notinha'){if(m.forma_pagamento==='dinheiro'){if(m.tipo==='venda_paciente')edin+=v;else pnot+=v;}else if(m.forma_pagamento==='pix')pix+=v;else if(m.forma_pagamento==='debito'){deb+=l;tax+=t;}else if(m.forma_pagamento==='credito'){cred+=l;tax+=t;}}
    if(m.tipo==='sangria')sang+=v;if(m.tipo==='suprimento')supr+=v;
  });
  const fis=edin+pnot+supr-sang,ban=pix+deb+cred;
  document.getElementById('cx-fis').textContent=fmt(fis);document.getElementById('cx-ban').textContent=fmt(ban);
  document.getElementById('cx-edin').textContent=fmt(edin);document.getElementById('cx-pnot').textContent=fmt(pnot);
  document.getElementById('cx-supr').textContent=fmt(supr);document.getElementById('cx-sang').textContent=fmt(sang);
  document.getElementById('cx-pix').textContent=fmt(pix);document.getElementById('cx-deb').textContent=fmt(deb);
  document.getElementById('cx-cred').textContent=fmt(cred);document.getElementById('cx-tax').textContent=fmt(tax);
  const tb=document.getElementById('cx-tb');tb.innerHTML='';
  if(!movs.length){tb.innerHTML='<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:20px">Nenhuma movimentacao no periodo</td></tr>';return;}
  movs.forEach(m=>{const tr=document.createElement('tr');tr.innerHTML='<td style="font-size:12px">'+fmtDT(m.timestamp)+'</td><td>'+tipoBadge(m.tipo)+'</td><td>'+(m.produto_nome||m.descricao||'-')+'</td><td>'+pagBadge(m.forma_pagamento)+'</td><td style="font-family:var(--mo)">'+fmt(m.valor_total)+'</td><td style="font-family:var(--mo);color:var(--grn)">'+fmt(m.valor_liquido||m.valor_total)+'</td>';tb.appendChild(tr);});
}
function abrirCxMov(tipo){CXTIPO=tipo;document.getElementById('mcx-ttl').textContent=tipo==='sangria'?'Sangria':'Suprimento';document.getElementById('mcx-val').value='';document.getElementById('mcx-mot').value='';openM('m-cx');}
async function confirmarCxMov(){
  const val=parseFloat(document.getElementById('mcx-val').value)||0;const mot=document.getElementById('mcx-mot').value.trim();if(val<=0){toast('Informe um valor.','ko');return;}
  await db.collection('movimentacoes').add({tipo:CXTIPO,descricao:mot||CXTIPO,valor_total:val,valor_liquido:val,taxa_valor:0,forma_pagamento:'dinheiro',profissional_id:null,profissional_nome:null,produto_id:null,produto_nome:null,produto_grupo:null,quantidade:null,preco_unitario:null,cliente_tipo:null,secretaria_id:CU.id,secretaria_nome:CU.nome,timestamp:firebase.firestore.FieldValue.serverTimestamp(),marcado_erro:false,motivo_erro:null});
  closeM('m-cx');toast(CXTIPO+' registrada!','ok');loadCaixa();
}

function abrirMarcarErro(id){document.getElementById('merr-id').value=id;document.getElementById('merr-mot').value='';openM('m-err');}
async function confirmarErro(){
  const id=document.getElementById('merr-id').value;const mot=document.getElementById('merr-mot').value.trim();if(!mot){toast('Descreva o motivo do erro.','ko');return;}
  const docSnap=await db.collection('movimentacoes').doc(id).get();const m=docSnap.data();
  await db.collection('movimentacoes').doc(id).update({marcado_erro:true,motivo_erro:mot});
  if(m.tipo==='venda_profissional'&&m.profissional_id)await db.collection('profissionais').doc(m.profissional_id).update({saldo_devedor:firebase.firestore.FieldValue.increment(-(m.valor_total||0))});
  if(m.tipo==='pagamento_notinha'&&m.profissional_id)await db.collection('profissionais').doc(m.profissional_id).update({saldo_devedor:firebase.firestore.FieldValue.increment(m.valor_total||0)});
  if(m.tipo==='bonificacao'&&m.profissional_id)await db.collection('profissionais').doc(m.profissional_id).update({saldo_devedor:firebase.firestore.FieldValue.increment(m.valor_total||0)});
  if(['venda_paciente','venda_profissional'].includes(m.tipo)&&m.produto_id)await db.collection('produtos').doc(m.produto_id).update({estoque_atual:firebase.firestore.FieldValue.increment(m.quantidade||1)});
  if(m.tipo==='entrada_estoque'&&m.produto_id)await db.collection('produtos').doc(m.produto_id).update({estoque_atual:firebase.firestore.FieldValue.increment(-(m.quantidade||1))});
  if(m.tipo==='ajuste_estoque'&&m.produto_id)await db.collection('produtos').doc(m.produto_id).update({estoque_atual:firebase.firestore.FieldValue.increment(-(m.quantidade||0))});
  closeM('m-err');toast('Lancamento marcado como erro.','ok');
  if(CPID)abrirDetNot(CPID,CPNM);else loadHistorico();
}

async function loadProdutos(){
  const snap=await db.collection('produtos').get();const tb=document.getElementById('p-tb');tb.innerHTML='';
  let prods=snap.docs.map(d=>({id:d.id,...d.data()}));
  if(PFILTRO==='conveniencia')prods=prods.filter(p=>p.ativo&&p.grupo==='conveniencia');
  else if(PFILTRO==='livraria')prods=prods.filter(p=>p.ativo&&p.grupo==='livraria');
  else if(PFILTRO==='inativo')prods=prods.filter(p=>!p.ativo);
  else prods=prods.filter(p=>p.ativo);
  if(!prods.length){tb.innerHTML='<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:20px">Nenhum produto encontrado</td></tr>';return;}
  prods.forEach(p=>{const tr=document.createElement('tr');tr.innerHTML='<td style="font-weight:500">'+p.nome+'</td><td>'+p.grupo+'</td><td style="font-family:var(--mo)">'+fmt(p.preco_venda)+'</td><td style="font-family:var(--mo);color:var(--muted)">'+fmt(p.preco_custo)+'</td><td>'+(p.ativo?'<span class="bg bg-g">Ativo</span>':'<span class="bg bg-x">Inativo</span>')+'</td><td style="display:flex;gap:6px"><button class="btn btn-s btn-sm" onclick=\'editProd('+JSON.stringify(p)+')\'>Editar</button><button class="btn btn-s btn-sm" onclick="toggleProd(\''+p.id+'\','+p.ativo+')">'+(p.ativo?'Desativar':'Ativar')+'</button></td>';tb.appendChild(tr);});
}
function filtroP(f,el){PFILTRO=f;document.querySelectorAll('.itab').forEach(x=>x.classList.remove('active'));el.classList.add('active');loadProdutos();}
function abrirProd(){document.getElementById('mp-id').value='';document.getElementById('mp-ttl').textContent='Novo Produto';['mp-nm','mp-un','mp-cst','mp-prc'].forEach(id=>document.getElementById(id).value='');openM('m-prod');}
function editProd(p){document.getElementById('mp-id').value=p.id;document.getElementById('mp-ttl').textContent='Editar Produto';document.getElementById('mp-nm').value=p.nome;document.getElementById('mp-gr').value=p.grupo;document.getElementById('mp-un').value=p.unidade||'';document.getElementById('mp-cst').value=p.preco_custo||'';document.getElementById('mp-prc').value=p.preco_venda||'';openM('m-prod');}
async function salvarProd(){
  const id=document.getElementById('mp-id').value;const nm=document.getElementById('mp-nm').value.trim();if(!nm){toast('Informe o nome.','ko');return;}
  const data={nome:nm,grupo:document.getElementById('mp-gr').value,unidade:document.getElementById('mp-un').value.trim()||'un',preco_custo:parseFloat(document.getElementById('mp-cst').value)||0,preco_venda:parseFloat(document.getElementById('mp-prc').value)||0,ativo:true};
  if(id)await db.collection('produtos').doc(id).update(data);else await db.collection('produtos').add({...data,estoque_atual:0,criado_em:firebase.firestore.FieldValue.serverTimestamp()});
  closeM('m-prod');await loadCaches();toast('Produto salvo!','ok');loadProdutos();
}
async function toggleProd(id,ativo){await db.collection('produtos').doc(id).update({ativo:!ativo});await loadCaches();loadProdutos();}

async function loadProfTable(){
  const snap=await db.collection('profissionais').get();const tb=document.getElementById('pr-tb');tb.innerHTML='';
  if(snap.empty){tb.innerHTML='<tr><td colspan="5" style="text-align:center;color:var(--muted);padding:20px">Nenhum profissional cadastrado</td></tr>';return;}
  const docs=snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>a.nome.localeCompare(b.nome));
  docs.forEach(p=>{
    const sd=p.saldo_devedor||0;const tr=document.createElement('tr');
    const sdTxt=sd>0?fmt(sd):sd<0?'Crédito '+fmt(Math.abs(sd)):'Em dia';
    const sdClr=sd>0?'var(--red)':sd<0?'var(--grn)':'var(--muted)';
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
  await db.collection('profissionais').doc(id).update({oculto:!oculto});
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
  document.getElementById('mpr-saldo-blk').style.display='block';
  document.getElementById('mpr-saldo').value=p.saldo_devedor||0;
  openM('m-prof');
}
async function salvarProf(){
  const id=document.getElementById('mpr-id').value;const nm=document.getElementById('mpr-nm').value.trim();if(!nm){toast('Informe o nome.','ko');return;}
  const bonif=parseFloat(document.getElementById('mpr-bonif').value)||0;
  if(id){
    const before=PRC.find(x=>x.id===id);
    const upd={nome:nm,bonificacao_mensal:bonif};
    const novoSaldo=parseFloat(document.getElementById('mpr-saldo').value);
    const logs=[];
    if(!isNaN(novoSaldo)&&novoSaldo!==(before?before.saldo_devedor||0:0)){upd.saldo_devedor=novoSaldo;logs.push('Saldo corrigido manualmente para '+fmt(novoSaldo));}
    if(before&&before.nome!==nm)logs.push('Nome alterado de "'+before.nome+'" para "'+nm+'"');
    await db.collection('profissionais').doc(id).update(upd);
    if(logs.length){
      await db.collection('movimentacoes').add({tipo:'edicao_profissional',descricao:logs.join(' | '),profissional_id:id,profissional_nome:nm,valor_total:0,valor_liquido:0,taxa_valor:0,forma_pagamento:null,produto_id:null,produto_nome:null,produto_grupo:null,quantidade:null,preco_unitario:null,cliente_tipo:null,secretaria_id:CU.id,secretaria_nome:CU.nome,timestamp:firebase.firestore.FieldValue.serverTimestamp(),marcado_erro:false,motivo_erro:null});
    }
  }else{
    await db.collection('profissionais').add({nome:nm,bonificacao_mensal:bonif,saldo_devedor:0,ativo:true,criado_em:firebase.firestore.FieldValue.serverTimestamp()});
  }
  closeM('m-prof');await loadCaches();toast('Profissional salvo!','ok');loadProfTable();
}
async function toggleProf(id,ativo){
  const p=PRC.find(x=>x.id===id)||{nome:'Profissional'};
  await db.collection('profissionais').doc(id).update({ativo:!ativo});
  await db.collection('movimentacoes').add({tipo:'edicao_profissional',descricao:(ativo?'Profissional desativado':'Profissional reativado')+': '+p.nome,profissional_id:id,profissional_nome:p.nome,valor_total:0,valor_liquido:0,taxa_valor:0,forma_pagamento:null,produto_id:null,produto_nome:null,produto_grupo:null,quantidade:null,preco_unitario:null,cliente_tipo:null,secretaria_id:CU.id,secretaria_nome:CU.nome,timestamp:firebase.firestore.FieldValue.serverTimestamp(),marcado_erro:false,motivo_erro:null});
  await loadCaches();loadProfTable();
}

async function loadHistorico(){
  const vi=document.getElementById('h-ini').value,vf=document.getElementById('h-fim').value;
  if(!vi||!vf){toast('Informe as duas datas.','ko');return;}
  const ini=new Date(vi+'T00:00:00');const fim=new Date(vf+'T23:59:59');const tipo=document.getElementById('h-tipo').value;
  const snap=await db.collection('movimentacoes').where('timestamp','>=',ini).where('timestamp','<=',fim).orderBy('timestamp','desc').get();
  const tb=document.getElementById('h-tb');tb.innerHTML='';
  const movs=snap.docs.map(d=>({id:d.id,...d.data()})).filter(m=>!tipo||m.tipo===tipo);
  if(!movs.length){tb.innerHTML='<tr><td colspan="8" style="text-align:center;color:var(--muted);padding:20px">Nenhum lancamento encontrado</td></tr>';return;}
  movs.forEach(m=>{const tr=document.createElement('tr');if(m.marcado_erro)tr.classList.add('err-row');tr.innerHTML='<td style="font-size:12px">'+fmtDT(m.timestamp)+'</td><td>'+tipoBadge(m.tipo)+'</td><td>'+(m.produto_nome||m.descricao||'-')+'</td><td style="color:var(--txt2)">'+(m.profissional_nome||m.cliente_tipo||'-')+'</td><td>'+pagBadge(m.forma_pagamento)+'</td><td style="font-family:var(--mo)">'+fmt(m.valor_total)+'</td><td style="color:var(--muted);font-size:12px">'+(m.secretaria_nome||'-')+'</td><td>'+(m.marcado_erro?'<span class="bg bg-r" title="'+(m.motivo_erro||'')+'">Erro</span>':'<button class="btn btn-s btn-sm" onclick="abrirMarcarErro(\''+m.id+'\')">Erro</button>')+'</td>';tb.appendChild(tr);});
}

async function loadSecLista(){
  const snap=await db.collection('secretarias').get();
  const div=document.getElementById('sec-lista');div.innerHTML='';
  snap.forEach(doc=>{
    const s={id:doc.id,...doc.data()};
    const row=document.createElement('div');
    row.style.cssText='display:flex;align-items:center;gap:8px;padding:10px 0;border-bottom:1px solid var(--bdr)';
    const info=document.createElement('div');info.style.flex='1';
    info.innerHTML='<div style="font-weight:600">'+s.nome+'</div><div style="font-size:11px;color:var(--muted)">'+(s.admin?'Administrador':'Secretaria')+'</div>';
    const badge=document.createElement('span');badge.className=s.ativo?'bg bg-g':'bg bg-x';badge.textContent=s.ativo?'Ativo':'Inativo';
    const be=document.createElement('button');be.className='btn btn-s btn-sm';be.textContent='Editar';be.onclick=()=>editarSec(s);
    const bt=document.createElement('button');bt.className='btn btn-s btn-sm';bt.textContent=s.ativo?'Desativar':'Ativar';bt.onclick=()=>toggleSec(s.id,s.ativo);
    row.appendChild(info);row.appendChild(badge);row.appendChild(be);row.appendChild(bt);
    div.appendChild(row);
  });
}

async function toggleSec(id,ativo){
  if(!confirm((ativo?'Desativar':'Ativar')+' esta secretaria?'))return;
  await db.collection('secretarias').doc(id).update({ativo:!ativo});
  toast((ativo?'Secretaria desativada':'Secretaria ativada')+'!','ok');
  loadSecLista();loadLoginUsers();
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
  if(!nm){toast('Informe o nome.','ko');return;}if(p1.length<4){toast('PIN minimo 4 digitos.','ko');return;}if(p1!==p2){toast('PINs nao conferem.','ko');return;}
  const ph=await hashPIN(p1);await db.collection('secretarias').add({nome:nm,pin_hash:ph,ativo:true,admin:false,criado_em:firebase.firestore.FieldValue.serverTimestamp()});
  closeM('m-sec');toast('Secretaria adicionada!','ok');loadSecLista();loadLoginUsers();
}
async function salvarEditSec(){
  const id=document.getElementById('es-id').value;
  const nm=document.getElementById('es-nm').value.trim();
  const p1=document.getElementById('es-pin').value;
  const p2=document.getElementById('es-pin2').value;
  if(!nm){toast('Informe o nome.','ko');return;}
  const upd={nome:nm};
  if(p1){
    if(p1.length<4){toast('PIN minimo 4 digitos.','ko');return;}
    if(p1!==p2){toast('PINs nao conferem.','ko');return;}
    upd.pin_hash=await hashPIN(p1);
  }
  await db.collection('secretarias').doc(id).update(upd);
  closeM('m-edit-sec');toast('Secretaria atualizada!','ok');loadSecLista();loadLoginUsers();
}

async function exportCSV(){
  const ini=new Date(document.getElementById('ex-ini').value+'T00:00:00');const fim=new Date(document.getElementById('ex-fim').value+'T23:59:59');const tipo=document.getElementById('ex-tipo').value;
  let q=db.collection('movimentacoes').where('timestamp','>=',ini).where('timestamp','<=',fim).orderBy('timestamp');
  const snap=await q.get();let rows=snap.docs.map(d=>({id:d.id,...d.data()}));
  if(tipo==='vendas')rows=rows.filter(r=>r.tipo==='venda_paciente');else if(tipo==='notinhas')rows=rows.filter(r=>r.tipo==='venda_profissional');else if(tipo==='estoque')rows=rows.filter(r=>r.tipo==='entrada_estoque');else if(tipo==='caixa')rows=rows.filter(r=>['sangria','suprimento'].includes(r.tipo));
  const HDR=['Data','Hora','Tipo','Produto/Desc.','Grupo','Qtd','Preco Unit.','Valor Total','Valor Liquido','Taxa','Forma Pgto','Cliente Tipo','Profissional','Secretaria','Marcado Erro','Motivo Erro'];
  const ESC=v=>v==null?'':String(v).replace(/;/g,',');
  const linhas=[HDR.join(';')];
  rows.forEach(m=>{const d=m.timestamp?m.timestamp.toDate():new Date();linhas.push([d.toLocaleDateString('pt-BR'),d.toLocaleTimeString('pt-BR'),ESC(m.tipo),ESC(m.produto_nome||m.descricao),ESC(m.produto_grupo),ESC(m.quantidade),ESC(m.preco_unitario),ESC(m.valor_total),ESC(m.valor_liquido),ESC(m.taxa_valor),ESC(m.forma_pagamento),ESC(m.cliente_tipo),ESC(m.profissional_nome),ESC(m.secretaria_nome),m.marcado_erro?'SIM':'NAO',ESC(m.motivo_erro)].join(';'));});
  const blob=new Blob(['\uFEFF'+linhas.join('\n')],{type:'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='conveniencia_'+document.getElementById('ex-ini').value+'_'+document.getElementById('ex-fim').value+'.csv';a.click();URL.revokeObjectURL(url);
  toast(rows.length+' registros exportados!','ok');
}

document.addEventListener('DOMContentLoaded',function(){var q=new URLSearchParams(location.search);if(q.has('convite')){loModo('prof');PF.convite(q.get('convite'));}else if(q.has('conferir')){loModo('prof');}else{loadLoginUsers();}});
