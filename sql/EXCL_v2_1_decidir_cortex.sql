-- ═══════════════════════════════════════════════════════════════════
-- EXCL v2.1 — o dono aprova ou nega a exclusão também pelo Cortex (09/11/2026)
--
-- Defeito: o botão "👑 Aprovar e liberar" do Cortex chamava oc_liberar_protecao,
-- que o EXCL v2 desligou (só levanta o erro "a aprovação agora é pelo Telegram")
-- → HTTP 400 na tela.
--
-- Correção: cortex_excl_decidir confere a sessão do Cortex (o mesmo token do PIN)
-- e só deixa passar o DONO (loja_usuarios.dono). Depois chama exatamente as
-- mesmas funções do botão do Telegram:
--   · aprovar → oc_aprovar_exclusao (enterra as sessões, cancela a cobrança presa,
--               cobrança já lançada/enviada fica como está, fecha o pedido)
--   · negar   → oc_negar_exclusao (volta para a recepção como "Sem resposta")
-- O Telegram continua funcionando igual; quem decidir primeiro fecha o pedido
-- (o botão do outro lado responde "Este pedido já foi encerrado").
-- ═══════════════════════════════════════════════════════════════════

create or replace function public.cortex_excl_decidir(p_token text, p_ref text, p_decisao text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
declare
  s      record;
  v_quem text;
  v_resp text;
begin
  select * into s from public.loja__sessao(p_token);
  if s.o_erro is not null or (s.o_usuario).id is null then
    return public.loja__erro_json(coalesce(s.o_erro, 'SESSAO_INVALIDA'));
  end if;
  if not coalesce((s.o_usuario).dono, false) then
    return jsonb_build_object('ok', false, 'erro', 'SO_DONO', 'msg', 'Só o Gabriel aprova ou nega exclusão.');
  end if;
  if coalesce(p_decisao, '') not in ('aprovar', 'negar') then
    return jsonb_build_object('ok', false, 'erro', 'DADOS', 'msg', 'Decisão inválida.');
  end if;
  if coalesce(p_ref, '') !~ '^excl:' then
    return jsonb_build_object('ok', false, 'erro', 'DADOS', 'msg', 'Exclusão não encontrada.');
  end if;

  v_quem := coalesce(nullif(btrim((s.o_usuario).nome), ''), 'dono') || ' (Cortex)';

  -- secretária marcou "Estava certo apagar" mas o pedido não ficou registrado: registra agora (sem Telegram)
  if p_decisao = 'aprovar'
     and not exists (select 1 from public.oc_aprovacoes q where q.referencia = p_ref and q.decisao is null)
     and exists (select 1 from public.oc_exclusoes e where e.oc_ref = p_ref and e.aguardando_dono) then
    insert into public.oc_aprovacoes (referencia, paciente, agendamento_ids, pedido_por, nota)
    select e.oc_ref, public.oc__nome(e.paciente), e.agendamento_ids, e.autora, e.nota
      from public.oc_exclusoes e where e.oc_ref = p_ref;
  end if;

  v_resp := case when p_decisao = 'aprovar' then public.oc_aprovar_exclusao(p_ref, v_quem)
                 else public.oc_negar_exclusao(p_ref, v_quem) end;
  return jsonb_build_object('ok', true, 'msg', v_resp);
end $function$;

revoke all on function public.cortex_excl_decidir(text, text, text) from public;
grant execute on function public.cortex_excl_decidir(text, text, text) to anon, authenticated;
