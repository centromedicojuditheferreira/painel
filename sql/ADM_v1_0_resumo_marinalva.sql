-- ═══════════════════════════════════════════════════════════════════
-- ADM v1.0 — Início da Marinalva (06/11/2026)
-- Uma função só, lida pelo Cortex com a sessão do PIN (só a Administração):
-- devolve, prontos, os números do Início dela — psicologia do mês, conveniência
-- dos últimos 7 dias, contas do mês e produtos acabando. Nada em R$ da Unimed
-- (faturamento fica só no acesso do dono). Nenhuma tabela nova; nada aberto ao anon.
-- Regras usadas (as mesmas da casa):
--   · atendimento de psicologia = especialidade que começa com "Psicologia" (16 no cadastro, ABA/Neuro/GESTAUT inclusos)
--     com status da classe "atendido" da chave fx0 rep_status_classes (2,3,4,5,208); marcadas = status 1 e 7;
--     faltas = classe "falta" da mesma chave (1,6,7,11,22 — a régua do repasse).
--   · comparecimento = atendidos / (atendidos + faltas) dos 3 meses fechados anteriores.
--   · conveniência: venda_paciente = vendido; pagamento_notinha = recebido de notinha; venda_profissional = lançado em notinha (a receber);
--     lançamentos marcados como erro ficam fora; dias em horário de Brasília.
--   · acabando = produto ativo com estoque de 0 a 2 que vendeu nos últimos 30 dias (os negativos vão em separado: venda sem entrada).
--   · contas: a competência do mês é criada se não existir (fin__gerar_mes); conta "no cartão" fica fora dos totais, como no Financeiro.
-- ═══════════════════════════════════════════════════════════════════

create or replace function public.cortex_adm_resumo(p_token text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
declare
  a         record;
  v_agora   timestamptz := now();
  v_hoje    date := public.fin__hoje();
  v_hora    time := (now() at time zone 'America/Sao_Paulo')::time;
  v_mes     date := date_trunc('month', public.fin__hoje())::date;
  v_mes_ant date := (date_trunc('month', public.fin__hoje()) - interval '1 month')::date;
  v_ini     date := (date_trunc('month', public.fin__hoje()) - interval '6 months')::date;   -- 6 meses fechados + o atual
  v_fim     date := (date_trunc('month', public.fin__hoje()) + interval '1 month')::date;
  v_st_at   bigint[];
  v_st_falta bigint[];
  v_st_marc bigint[] := array[1, 7];
  v_unimed  bigint[];
  v_est_min integer := 3;        -- "acabando": estoque abaixo disto (0, 1 ou 2)
  v_psi     jsonb;
  v_conv    jsonb;
  v_contas  jsonb;
begin
  select * into a from public.fin__adm(p_token);
  if a.o_erro is not null then return public.loja__erro_json(a.o_erro); end if;

  -- classes de status e convênios Unimed: das chaves da casa, com os valores conhecidos de reserva
  select coalesce((select array(select jsonb_array_elements_text(valor -> 'atendido'))::bigint[] from public.fx0_parametros_geral where chave = 'rep_status_classes'), array[2, 3, 4, 5, 208]::bigint[]),
         coalesce((select array(select jsonb_array_elements_text(valor -> 'falta'))::bigint[]    from public.fx0_parametros_geral where chave = 'rep_status_classes'), array[1, 6, 7, 11, 22]::bigint[]),
         coalesce((select array[(valor ->> 'local')::bigint, (valor ->> 'intercambio')::bigint] from public.fx0_parametros_geral where chave = 'convenios_unimed'), array[2, 8]::bigint[])
    into v_st_at, v_st_falta, v_unimed;

  -- ── psicologia ──
  with psi as (
    select id from public.especialidades where nome ilike 'psicologia%'
  ), ag as (
    select ag.data, ag.horario, ag.status_id, ag.convenio_id, ag.profissional_id
      from public.agendamentos ag
     where ag.especialidade_id in (select id from psi) and ag.data >= v_ini and ag.data < v_fim
  ), meses as (
    select date_trunc('month', ag.data)::date as mes,
           count(*) filter (where status_id = any(v_st_at)) as atendidos,
           count(*) filter (where status_id = any(v_st_at) and convenio_id = any(v_unimed)) as unimed,
           count(*) filter (where status_id = any(v_st_falta)) as faltas,
           count(*) filter (where status_id = any(v_st_marc)) as marcadas,
           count(distinct profissional_id) filter (where status_id = any(v_st_at)) as psicologos
      from ag group by 1
  )
  select jsonb_build_object(
    'mes', v_mes,
    'meses', coalesce((select jsonb_agg(jsonb_build_object('mes', to_char(m.mes, 'YYYY-MM'), 'atendidos', m.atendidos, 'unimed', m.unimed,
                                                            'faltas', m.faltas, 'marcadas', m.marcadas, 'psicologos', m.psicologos) order by m.mes) from meses m), '[]'::jsonb),
    'atendidos_mes',   coalesce((select atendidos  from meses where mes = v_mes), 0),
    'unimed_mes',      coalesce((select unimed     from meses where mes = v_mes), 0),
    'psicologos_mes',  coalesce((select psicologos from meses where mes = v_mes), 0),
    'faltas_mes',      coalesce((select faltas     from meses where mes = v_mes), 0),
    'mes_anterior_total',     coalesce((select atendidos from meses where mes = v_mes_ant), 0),
    'mes_anterior_mesmo_dia', (select count(*) from ag where status_id = any(v_st_at) and date_trunc('month', data)::date = v_mes_ant
                                                    and extract(day from data) <= extract(day from v_hoje)),
    'marcadas_restantes', (select count(*) from ag where status_id = any(v_st_marc) and data >= v_mes and data < v_fim
                                                 and (data > v_hoje or (data = v_hoje and horario >= v_hora))),
    'hoje_atendidos', (select count(*) from ag where data = v_hoje and status_id = any(v_st_at)),
    'hoje_marcadas',  (select count(*) from ag where data = v_hoje and status_id = any(v_st_marc)),
    'comparecimento', (select round(sum(atendidos)::numeric / nullif(sum(atendidos + faltas), 0), 3)
                         from meses where mes < v_mes and mes >= (v_mes - interval '3 months')::date)
  ) into v_psi;

  -- ── conveniência: últimos 7 dias (hoje incluso) ──
  with mv as (
    select (m.quando at time zone 'America/Sao_Paulo')::date as dia, m.tipo, m.valor_total, m.quantidade, m.produto_id, m.produto_nome, m.forma_pagamento, m.quando
      from public.loja_movimentos m
     where coalesce(m.marcado_erro, false) = false
       and m.quando >= ((v_hoje - 6)::timestamp at time zone 'America/Sao_Paulo')
  ), dias as (
    select d::date as dia,
           coalesce(sum(mv.valor_total) filter (where mv.tipo = 'venda_paciente'), 0)     as vendas,
           count(*) filter (where mv.tipo = 'venda_paciente')                             as vendas_n,
           coalesce(sum(mv.valor_total) filter (where mv.tipo = 'pagamento_notinha'), 0)  as recebido,
           coalesce(sum(mv.valor_total) filter (where mv.tipo = 'venda_profissional'), 0) as notinha
      from generate_series(v_hoje - 6, v_hoje, interval '1 day') d
      left join mv on mv.dia = d::date
     group by 1
  ), giro30 as (
    select produto_id, max(quando) as ultima
      from public.loja_movimentos
     where tipo in ('venda_paciente', 'venda_profissional') and coalesce(marcado_erro, false) = false
       and quando >= v_agora - interval '30 days' and produto_id is not null
     group by 1
  )
  select jsonb_build_object(
    'dias', coalesce((select jsonb_agg(jsonb_build_object('dia', d.dia, 'vendas', d.vendas, 'vendas_n', d.vendas_n, 'recebido', d.recebido, 'notinha', d.notinha) order by d.dia) from dias d), '[]'::jsonb),
    'vendas',   (select coalesce(sum(vendas), 0)   from dias),
    'vendas_n', (select coalesce(sum(vendas_n), 0) from dias),
    'recebido', (select coalesce(sum(recebido), 0) from dias),
    'notinha',  (select coalesce(sum(notinha), 0)  from dias),
    'formas', coalesce((select jsonb_object_agg(coalesce(f.forma_pagamento, 'outro'), f.s)
                          from (select forma_pagamento, sum(valor_total) s from mv where tipo in ('venda_paciente', 'pagamento_notinha') group by 1) f), '{}'::jsonb),
    'mais_vendidos', coalesce((select jsonb_agg(jsonb_build_object('nome', x.nome, 'qtd', x.qtd) order by x.qtd desc, x.nome)
                                 from (select produto_nome as nome, sum(quantidade) as qtd from mv
                                        where tipo in ('venda_paciente', 'venda_profissional') and produto_nome is not null
                                        group by 1 order by 2 desc, 1 limit 3) x), '[]'::jsonb),
    'acabando', coalesce((select jsonb_agg(jsonb_build_object('nome', x.nome, 'estoque', x.estoque) order by x.ultima desc)
                            from (select p.nome, coalesce(p.estoque_atual, 0) as estoque, g.ultima
                                    from public.loja_produtos p join giro30 g on g.produto_id = p.id
                                   where p.ativo and coalesce(p.estoque_atual, 0) >= 0 and coalesce(p.estoque_atual, 0) < v_est_min
                                   order by g.ultima desc limit 6) x), '[]'::jsonb),
    'acabando_n', (select count(*) from public.loja_produtos p join giro30 g on g.produto_id = p.id
                    where p.ativo and coalesce(p.estoque_atual, 0) >= 0 and coalesce(p.estoque_atual, 0) < v_est_min),
    'negativos_n', (select count(*) from public.loja_produtos p where p.ativo and coalesce(p.estoque_atual, 0) < 0)
  ) into v_conv;

  -- ── contas do mês (o que a Marinalva paga) ──
  perform public.fin__gerar_mes(v_mes);
  select jsonb_build_object(
    'competencia', v_mes,
    'total',    count(*) filter (where not coalesce(f.no_cartao, false)),
    'pagas',    count(*) filter (where m.pago_em is not null and not coalesce(f.no_cartao, false)),
    'previsto', coalesce(sum(m.valor_previsto) filter (where not coalesce(f.no_cartao, false)), 0),
    'pago',     coalesce(sum(m.valor_pago)     filter (where not coalesce(f.no_cartao, false)), 0),
    'falta',    coalesce(sum(m.valor_previsto) filter (where m.pago_em is null and not coalesce(f.no_cartao, false)), 0),
    'vencidas', count(*) filter (where m.pago_em is null and not coalesce(f.no_cartao, false) and m.vencimento < v_hoje),
    'sem_valor', count(*) filter (where m.pago_em is null and not coalesce(f.no_cartao, false) and m.valor_previsto is null),
    'proximas', coalesce((select jsonb_agg(jsonb_build_object(
                             'nome', coalesce(f2.nome, d2.credor || coalesce(' · ' || nullif(btrim(d2.descricao), ''), '')),
                             'vencimento', m2.vencimento, 'valor', m2.valor_previsto,
                             'debito', coalesce(f2.debito_banco, d2.debito_banco)) order by m2.vencimento nulls last, coalesce(f2.nome, d2.credor))
                           from public.fin_conta_mes m2
                           left join public.fin_conta_fixa f2 on f2.id = m2.conta_fixa_id
                           left join public.fin_divida d2 on d2.id = m2.divida_id
                          where m2.competencia = v_mes and m2.pago_em is null and not coalesce(f2.no_cartao, false)
                            and m2.vencimento <= v_hoje + 3), '[]'::jsonb)
  ) into v_contas
    from public.fin_conta_mes m
    left join public.fin_conta_fixa f on f.id = m.conta_fixa_id
   where m.competencia = v_mes;

  return jsonb_build_object('ok', true, 'hoje', v_hoje, 'agora', v_agora, 'dono', coalesce((a.o_usuario).dono, false),
                            'psi', v_psi, 'conv', v_conv, 'contas', v_contas);
end $function$;

revoke all on function public.cortex_adm_resumo(text) from public;
grant execute on function public.cortex_adm_resumo(text) to anon, authenticated, service_role;

comment on function public.cortex_adm_resumo(text) is
  'ADM v1.0 (06/11/2026): números do Início da Administração (Marinalva) — psicologia do mês, conveniência 7 dias, contas do mês, produtos acabando. Sessão do PIN, só admin.';
