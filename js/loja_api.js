/* ═══════════════════════════════════════════════════════════════════
   LOJA v1.0 — a lojinha e o login falam com o Supabase por aqui.
   As tabelas loja_* ficam fechadas: o Cortex só chama as funções loja_* do
   servidor, que conferem a sessão e fazem as contas (preço, taxa, saldo,
   estoque). Depois do PIN, o servidor devolve um token; ele fica só na
   memória da página (recarregou, entra de novo, como era com o Firebase).
   ═══════════════════════════════════════════════════════════════════ */
var LAPI = (function () {
  'use strict';

  var SB = { url: 'https://xcucoryngkkuszztpxyq.supabase.co', key: 'sb_publishable_6ATQUvqBBRS5xx7jAYKlmw_2FwTuHG7' };
  var token = null, aoCair = null, caiu = false;

  function chamar(fn, args) {
    return fetch(SB.url + '/rest/v1/rpc/' + fn, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SB.key, 'Authorization': 'Bearer ' + SB.key },
      body: JSON.stringify(args || {})
    }).then(function (r) {
      return r.text().then(function (t) {
        var j = null; try { j = JSON.parse(t); } catch (e) {}
        if (!r.ok) {   /* status vai junto: 404 = função ainda não instalada no Supabase */
          var er = new Error((j && (j.message || j.hint || j.details)) || ('O servidor respondeu ' + r.status + '.'));
          er.status = r.status; throw er;
        }
        if (j && j.ok === false) {
          var e = new Error(j.msg || j.erro || 'Não deu certo.'); e.codigo = j.erro;
          /* sessão caiu (12 h sem uso, saiu em outro lugar, PIN trocado pelo administrador): volta para a entrada */
          if ((j.erro === 'SESSAO_INVALIDA' || j.erro === 'TROCAR_PIN') && token && aoCair && !caiu) {
            caiu = true; var c = j.erro, m = j.msg;
            setTimeout(function () { aoCair(c, m); }, 0);
          }
          throw e;
        }
        return j;
      });
    }, function () { throw new Error('Sem conexão com o servidor. Confira a internet e tente de novo.'); });
  }
  function comSessao(fn, args) {
    var a = { p_token: token }; Object.keys(args || {}).forEach(function (k) { a[k] = args[k]; });
    return chamar(fn, a);
  }
  function isoDe(d) { return d == null ? null : (d instanceof Date ? d.toISOString() : String(d)); }

  return {
    token: function () { return token; },
    definirToken: function (t) { token = t || null; caiu = false; },
    aoCair: function (fn) { aoCair = fn; },
    /* SEGURANÇA Fase 2: o porteiro do banco recusou a sessão (venceu ou saiu em outro lugar) → volta para a entrada */
    cair: function (msg) {
      if (token && aoCair && !caiu) {
        caiu = true;
        setTimeout(function () { aoCair('SESSAO_INVALIDA', msg || 'Sua sessão terminou. Entre de novo.'); }, 0);
      }
    },

    /* entrada */
    loginLista: function () { return chamar('loja_login_lista'); },
    entrar: function (usuarioId, pin) { return chamar('loja_entrar', { p_usuario_id: usuarioId, p_pin: pin }); },
    trocarPin: function (atual, novo) { return comSessao('loja_trocar_pin', { p_pin_atual: atual, p_pin_novo: novo }); },
    sair: function () {
      var t = token; token = null;
      return t ? chamar('loja_sair', { p_token: t }).catch(function () {}) : Promise.resolve();
    },

    /* leituras */
    caches: function () { return comSessao('loja_caches'); },
    config: function () { return comSessao('loja_config_ler').then(function (j) { return j.config; }); },
    produtos: function () { return comSessao('loja_produtos').then(function (j) { return j.produtos; }); },
    profissionais: function () { return comSessao('loja_profissionais').then(function (j) { return j.profissionais; }); },
    /* f = { ini, fim (Date), tipo, profissional, crescente } — o que vier vazio não filtra */
    movimentos: function (f) {
      f = f || {};
      return comSessao('loja_movimentos', { p_ini: isoDe(f.ini), p_fim: isoDe(f.fim), p_tipo: f.tipo || null,
                                            p_profissional_id: f.profissional || null, p_crescente: !!f.crescente })
        .then(function (j) { return j.movimentos; });
    },
    notinhaPublica: function (profId) { return chamar('loja_notinha_publica', { p_profissional_id: profId }); },

    /* gravações */
    venda: function (cliente, forma, profissionalId, itens) {
      return comSessao('loja_venda', { p_cliente: cliente, p_forma: forma, p_profissional_id: profissionalId || null, p_itens: itens });
    },
    pagamentoNotinha: function (profId, valor, forma, obs) {
      return comSessao('loja_pagamento_notinha', { p_profissional_id: profId, p_valor: valor, p_forma: forma, p_obs: obs || null });
    },
    bonificacao: function (profIds) { return comSessao('loja_bonificacao', { p_profissional_ids: profIds }); },
    marcarErro: function (movId, motivo) { return comSessao('loja_marcar_erro', { p_movimento_id: movId, p_motivo: motivo }); },
    caixaMov: function (tipo, valor, motivo) { return comSessao('loja_caixa_mov', { p_tipo: tipo, p_valor: valor, p_motivo: motivo || null }); },
    entradaEstoque: function (prodId, qtd, custoUn, custoTot, precoVenda, obs) {
      return comSessao('loja_entrada_estoque', { p_produto_id: prodId, p_quantidade: qtd, p_custo_unitario: custoUn, p_custo_total: custoTot,
                                                 p_preco_venda: precoVenda, p_obs: obs || null });
    },
    produtoCriar: function (nome, grupo, unidade) {
      return comSessao('loja_produto_criar', { p_nome: nome, p_grupo: grupo, p_unidade: unidade || 'un' }).then(function (j) { return j.produto; });
    },
    produtoSalvar: function (id, nome, grupo, unidade, custo, venda) {
      return comSessao('loja_produto_salvar', { p_id: id, p_nome: nome, p_grupo: grupo, p_unidade: unidade, p_preco_custo: custo, p_preco_venda: venda });
    },
    balanco: function (itens) { return comSessao('loja_balanco', { p_itens: itens }); },
    produtoReativar: function (id) { return comSessao('loja_produto_reativar', { p_id: id }); },
    profissionalCriar: function (nome, bonif) {
      return comSessao('loja_profissional_criar', { p_nome: nome, p_bonificacao: bonif }).then(function (j) { return j.profissional; });
    },
    /* saldoNovo = null quando a pessoa não mexeu no saldo */
    profissionalSalvar: function (id, nome, bonif, saldoNovo) {
      return comSessao('loja_profissional_salvar', { p_id: id, p_nome: nome, p_bonificacao: bonif, p_saldo_novo: saldoNovo == null ? null : saldoNovo });
    },
    profissionalAtivo: function (id, ativo) { return comSessao('loja_profissional_ativo', { p_id: id, p_ativo: !!ativo }); },
    profissionalOculto: function (id, oculto) { return comSessao('loja_profissional_oculto', { p_id: id, p_oculto: !!oculto }); },
    configSalvar: function (deb, cred, bonif) {
      return comSessao('loja_config_salvar', { p_taxa_debito: deb, p_taxa_credito: cred, p_bonificacao: bonif });
    },
    usuarios: function () { return comSessao('loja_usuarios_lista').then(function (j) { return j.usuarios; }); },
    usuarioCriar: function (nome, pin) { return comSessao('loja_usuario_criar', { p_nome: nome, p_pin: pin }); },
    usuarioSalvar: function (id, nome, pin) { return comSessao('loja_usuario_salvar', { p_id: id, p_nome: nome, p_pin: pin || null }); },
    usuarioAtivo: function (id, ativo) { return comSessao('loja_usuario_ativo', { p_id: id, p_ativo: !!ativo }); },

    /* gaveta (FIN v1.5): contagem às cegas; o esperado nunca vem para o navegador */
    gavetaEstado: function () { return comSessao('fin_gaveta_estado'); },
    gavetaContar: function (tipo, cedulas) { return comSessao('fin_gaveta_contar', { p_tipo: tipo, p_cedulas: cedulas }); },
    gavetaExplicar: function (id, texto) { return comSessao('fin_gaveta_explicar', { p_id: id, p_texto: texto }); },
    gavetaMov: function (tipo, valor, obs) { return comSessao('fin_gaveta_mov', { p_tipo: tipo, p_valor: valor, p_obs: obs || null }); },
    gavetaMovErro: function (id, motivo) { return comSessao('fin_gaveta_mov_erro', { p_id: id, p_motivo: motivo }); },
    gavetaMovs: function (dias) { return comSessao('fin_gaveta_movs', { p_dias: dias || 31 }).then(function (j) { return j.movimentos; }); },

    /* FIN v3.0 — Financeiro da Administração (contas do mês, contas fixas; dívidas e projeção só no acesso do dono).
       O servidor decide o que cada um vê: a Marinalva recebe as parcelas sem "nº X de Y" e sem a observação do dono. */
    finCategorias: function () { return comSessao('fin_categorias').then(function (j) { return j.categorias; }); },
    finContasMes: function (competencia) { return comSessao('fin_contas_mes', { p_competencia: competencia || null }); },
    finBaixa: function (id, valor, data, obs, desfazer) {
      return comSessao('fin_baixa', { p_id: id, p_valor: valor == null ? null : valor, p_data: data || null, p_obs: obs || null, p_desfazer: !!desfazer });
    },
    finContasFixas: function () { return comSessao('fin_contas_fixas').then(function (j) { return j.contas; }); },
    finContaFixaSalvar: function (c) {
      return comSessao('fin_conta_fixa_salvar', { p_id: c.id || null, p_nome: c.nome, p_categoria: c.categoria, p_dia: c.dia == null ? null : c.dia,
        p_valor: c.valor == null ? null : c.valor, p_base: c.base || 'informado', p_doc: c.doc || null, p_recebedor: c.recebedor || null,
        p_obs: c.obs || null, p_ativa: c.ativa !== false });
    },
    /* "no cartão" (os dois) e a observação que só o dono vê (obsDono null = não mexe; '' = apaga) */
    finContaFixaMarcar: function (id, noCartao, obsDono) {
      return comSessao('fin_conta_fixa_marcar', { p_id: id, p_no_cartao: noCartao == null ? null : !!noCartao, p_obs_dono: obsDono == null ? null : obsDono });
    },
    finDividas: function () { return comSessao('fin_dividas').then(function (j) { return j.dividas; }); },
    finDividaSalvar: function (d) {
      return comSessao('fin_divida_salvar', { p_id: d.id || null, p_credor: d.credor, p_tipo: d.tipo, p_descricao: d.descricao || null,
        p_dia: d.dia == null ? null : d.dia, p_parcela: d.parcela == null ? null : d.parcela, p_base: d.base || 'informado',
        p_parcelas_total: d.total == null ? null : d.total, p_primeira: d.primeira || null, p_saldo: d.saldo == null ? null : d.saldo,
        p_saldo_em: d.saldoEm || null, p_doc: d.doc || null, p_obs: d.obs || null, p_ativa: d.ativa !== false });
    },
    finProjecao: function (meses) { return comSessao('fin_projecao', { p_meses: meses || 12 }); },
    /* FIN v3.1 (só o dono): parcelas de cada dívida e do cartão mês a mês até a última; e o mês da última parcela de quem não tem o total */
    finDividasProjecao: function () { return comSessao('fin_dividas_projecao'); },
    finDividaFim: function (id, ultima) { return comSessao('fin_divida_fim', { p_id: id, p_ultima: ultima || null }); },

    /* migração do Firebase (com a senha de administração) */
    viradaImportar: function (senha, colecao, docs) { return chamar('loja_virada_importar', { p_senha: senha, p_colecao: colecao, p_docs: docs }); },
    viradaConcluir: function (senha, contagens, pins) { return chamar('loja_virada_concluir', { p_senha: senha, p_contagens: contagens, p_pins: pins }); }
  };
})();
