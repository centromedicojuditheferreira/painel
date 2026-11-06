-- ═══════════════════════════════════════════════════════════════════
-- FIN v3.3 — o cartão e a Marinalva (06/11/2026)
-- Pedido do dono: a aba "No cartão" sai do acesso dela; as contas fixas que vão no cartão (Claude, Apple,
-- Spotify, ChatGPT, Microsoft, Wix…) ela não vê; só Feegow e SM Click, que ela mesma paga com o cartão da
-- clínica — aparecem para ela como conta normal, e na baixa ela declara "paguei com o cartão".
--   · fin_conta_fixa.cartao_socia (novo): conta no cartão que a sócia vê e dá baixa. Marcado em Feegow e SM Click.
--   · fin_contas_mes: no acesso que não é do dono, conta no cartão só entra se cartao_socia, com status normal
--     (a vencer / vencida / sem data / paga) para a baixa funcionar; o dono vê tudo como antes.
--   · fin_contas_fixas: mesma regra na lista de contas fixas.
--   · fin_baixa ganha p_via ('cartao' grava baixa_via = 'cartao'; o resto segue 'cortex').
--   · fin_conta_fixa_cartao_socia(p_token, p_id, p_sim): só o dono marca/desmarca.
--   · fin_contas_lembrete_texto (Telegram "Contas a pagar"): passa a lembrar também as contas cartao_socia.
-- Totais, projeção e lembretes do dono não mudam: conta no cartão continua fora dos totais (já está na fatura).
-- ═══════════════════════════════════════════════════════════════════

alter table public.fin_conta_fixa add column if not exists cartao_socia boolean not null default false;
comment on column public.fin_conta_fixa.cartao_socia is 'FIN v3.3: conta paga no cartão da clínica que a sócia (Marinalva) vê e dá baixa. As demais contas "no cartão" só o dono vê.';

update public.fin_conta_fixa set cartao_socia = true, atualizado_em = now()
 where coalesce(no_cartao, false) and nome in ('Feegow', 'SM Click (WhatsApp)') and not cartao_socia;

-- ── contas do mês: o servidor decide o que cada um vê ──
create or replace function public.fin_contas_mes(p_token text, p_competencia date default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
declare a record; u public.loja_usuarios; v_comp date; v_hoje date := public.fin__hoje();
begin
  select * into a from public.fin__adm(p_token);
  if a.o_erro is not null then return public.loja__erro_json(a.o_erro); end if;
  u := a.o_usuario;
  v_comp := date_trunc('month', coalesce(p_competencia, v_hoje))::date;
  perform public.fin__gerar_mes(v_comp);
  return jsonb_build_object('ok', true, 'competencia', v_comp, 'dono', u.dono,
    'total_previsto', (select coalesce(sum(m.valor_previsto), 0) from public.fin_conta_mes m left join public.fin_conta_fixa f on f.id = m.conta_fixa_id
                        where m.competencia = v_comp and not coalesce(f.no_cartao, false)),
    'total_pago',     (select coalesce(sum(m.valor_pago), 0) from public.fin_conta_mes m left join public.fin_conta_fixa f on f.id = m.conta_fixa_id
                        where m.competencia = v_comp and not coalesce(f.no_cartao, false)),
    'total_no_cartao', (select coalesce(sum(m.valor_previsto), 0) from public.fin_conta_mes m join public.fin_conta_fixa f on f.id = m.conta_fixa_id
                        where m.competencia = v_comp and f.no_cartao),
    'contas', coalesce((
      select jsonb_agg(z.item order by z.venc nulls last, z.nome) from (
        select m.vencimento venc,
               coalesce(f.nome, d.credor || coalesce(' · ' || nullif(btrim(d.descricao), ''), '')) nome,
               jsonb_build_object(
                 'id', m.id,
                 'tipo', case when m.divida_id is null then 'fixa' else 'divida' end,
                 'nome', coalesce(f.nome, d.credor || coalesce(' · ' || nullif(btrim(d.descricao), ''), '')),
                 'categoria', coalesce(f.categoria, 'parcela'),
                 'categoria_nome', c.nome,
                 'vencimento', m.vencimento,
                 'valor_previsto', m.valor_previsto,
                 'valor_pago', m.valor_pago,
                 'pago_em', m.pago_em,
                 'no_cartao', coalesce(f.no_cartao, false),
                 'cartao_socia', coalesce(f.cartao_socia, false),
                 'baixa_via', m.baixa_via,
                 'debito_banco', coalesce(f.debito_banco, d.debito_banco),
                 /* FIN v3.3: para a sócia, a conta do cartão que ela paga tem status normal (dá baixa); para o dono segue "no cartão" */
                 'status', case when m.pago_em is not null then 'paga'
                                when coalesce(f.no_cartao, false) and (u.dono or not coalesce(f.cartao_socia, false)) then 'no_cartao'
                                when m.vencimento is null then 'sem_data'
                                when m.vencimento < v_hoje then 'vencida'
                                else 'a_vencer' end,
                 'baixa_por', bu.nome,
                 'obs', m.obs)
               || case when u.dono and m.divida_id is not null
                       then jsonb_build_object('parcela', public.fin__parcela_num(d.primeira_competencia, v_comp), 'parcelas_total', d.parcelas_total)
                       else '{}'::jsonb end
               || case when u.dono and f.obs_dono is not null then jsonb_build_object('obs_dono', f.obs_dono) else '{}'::jsonb end item
          from public.fin_conta_mes m
          left join public.fin_conta_fixa f on f.id = m.conta_fixa_id
          left join public.fin_divida d on d.id = m.divida_id
          left join public.fin_categoria c on c.codigo = coalesce(f.categoria, 'parcela')
          left join public.loja_usuarios bu on bu.id = m.baixa_por
         where m.competencia = v_comp
           and (u.dono or not coalesce(f.no_cartao, false) or coalesce(f.cartao_socia, false))) z), '[]'::jsonb));
end $function$;

-- ── contas fixas: a sócia não vê as do cartão que não são dela ──
create or replace function public.fin_contas_fixas(p_token text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
declare a record; v_dono boolean;
begin
  select * into a from public.fin__adm(p_token);
  if a.o_erro is not null then return public.loja__erro_json(a.o_erro); end if;
  v_dono := (a.o_usuario).dono;
  return jsonb_build_object('ok', true, 'contas', coalesce((
    select jsonb_agg(jsonb_build_object('id', f.id, 'nome', f.nome, 'categoria', f.categoria, 'categoria_nome', c.nome,
                                        'dia_vencimento', f.dia_vencimento, 'valor_informado', f.valor_informado,
                                        'base_projecao', f.base_projecao, 'recebedor_doc', f.recebedor_doc,
                                        'recebedor_nome', f.recebedor_nome, 'obs', f.obs, 'ativa', f.ativa, 'no_cartao', f.no_cartao,
                                        'cartao_socia', coalesce(f.cartao_socia, false), 'debito_banco', f.debito_banco)
                     || case when v_dono and f.obs_dono is not null then jsonb_build_object('obs_dono', f.obs_dono) else '{}'::jsonb end
                     order by f.ativa desc, f.dia_vencimento nulls last, f.nome)
      from public.fin_conta_fixa f join public.fin_categoria c on c.codigo = f.categoria
     where v_dono or not coalesce(f.no_cartao, false) or coalesce(f.cartao_socia, false)), '[]'::jsonb));
end $function$;

-- ── baixa com "paguei no cartão" ──
drop function if exists public.fin_baixa(text, bigint, numeric, date, text, boolean);
create or replace function public.fin_baixa(p_token text, p_id bigint, p_valor numeric, p_data date default null, p_obs text default null,
                                            p_desfazer boolean default false, p_via text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
declare a record;
begin
  select * into a from public.fin__adm(p_token);
  if a.o_erro is not null then return public.loja__erro_json(a.o_erro); end if;
  if coalesce(p_desfazer, false) then
    update public.fin_conta_mes set valor_pago = null, pago_em = null, baixa_por = null, baixa_via = null,
           banco = null, id_transacao = null, obs = coalesce(p_obs, obs), atualizado_em = now()
     where id = p_id;
  else
    if p_valor is null or p_valor <= 0 then
      return jsonb_build_object('ok', false, 'erro', 'VALOR', 'msg', 'Informe o valor pago.');
    end if;
    update public.fin_conta_mes set valor_pago = round(p_valor, 2), pago_em = coalesce(p_data, public.fin__hoje()),
           baixa_por = (a.o_usuario).id, baixa_via = case when p_via = 'cartao' then 'cartao' else 'cortex' end,
           obs = coalesce(p_obs, obs), atualizado_em = now()
     where id = p_id;
  end if;
  if not found then return jsonb_build_object('ok', false, 'erro', 'NAO_ENCONTRADO', 'msg', 'Conta não encontrada.'); end if;
  return jsonb_build_object('ok', true);
end $function$;
revoke all on function public.fin_baixa(text, bigint, numeric, date, text, boolean, text) from public;
grant execute on function public.fin_baixa(text, bigint, numeric, date, text, boolean, text) to anon, authenticated, service_role;

-- ── só o dono diz qual conta do cartão a sócia vê e paga ──
create or replace function public.fin_conta_fixa_cartao_socia(p_token text, p_id bigint, p_sim boolean)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
declare a record; f public.fin_conta_fixa;
begin
  select * into a from public.fin__adm(p_token);
  if a.o_erro is not null then return public.loja__erro_json(a.o_erro); end if;
  if not coalesce((a.o_usuario).dono, false) then return jsonb_build_object('ok', false, 'erro', 'SEM_ACESSO', 'msg', 'Sem acesso.'); end if;
  update public.fin_conta_fixa set cartao_socia = coalesce(p_sim, false), atualizado_em = now() where id = p_id returning * into f;
  if f.id is null then return jsonb_build_object('ok', false, 'erro', 'NAO_ENCONTRADO', 'msg', 'Conta não encontrada.'); end if;
  return jsonb_build_object('ok', true, 'id', f.id, 'cartao_socia', f.cartao_socia);
end $function$;
revoke all on function public.fin_conta_fixa_cartao_socia(text, bigint, boolean) from public;
grant execute on function public.fin_conta_fixa_cartao_socia(text, bigint, boolean) to anon, authenticated, service_role;

-- ── lembrete do Telegram: as contas do cartão que a sócia paga entram no aviso ──
-- (troca uma condição só, no texto da função que está no banco; rodar de novo não faz nada)
do $$
declare d text;
begin
  select pg_get_functiondef('public.fin_contas_lembrete_texto(timestamptz)'::regprocedure) into d;
  if position('and not coalesce(f.no_cartao, false)' in d) > 0 and position('cartao_socia' in d) = 0 then
    d := replace(d, 'and not coalesce(f.no_cartao, false)', 'and (not coalesce(f.no_cartao, false) or coalesce(f.cartao_socia, false))');
    execute d;
  end if;
end $$;
