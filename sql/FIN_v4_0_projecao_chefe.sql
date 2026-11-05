-- ═══════════════════════════════════════════════════════════════════
-- FIN v4.0 — Projeção de caixa do chefe (05/11/2026)
-- Só o usuário dono da Administração (loja_usuarios.dono). Nada aqui grava: é leitura.
--
-- Decisões do dono (05/11/26):
--  · horizonte: 6 competências a partir do mês atual; a tela vai até 1 mês depois do
--    pagamento da Unimed da última competência (Unimed paga no último dia útil do 2º mês
--    seguinte: outubro cai em dezembro) → 9 colunas de calendário.
--  · Unimed por estágio: dia (espelho do Feegow) → planejador → lançador → enviada → definitiva (F5).
--    Enquanto não há demonstrativo (F5), projeta 100 % do enviado. Imposto de 10,77 % fica como parâmetro,
--    desligado por padrão porque o Simples já está nas contas fixas (ver fin_unimed_imposto_aplicar).
--  · repasse dos profissionais: recibo congelado = lacrado; mês corrente = motor do recibo até hoje
--    + o que falta marcado × taxa de comparecimento do profissional; meses futuros = agenda marcada × taxa.
--  · conveniência: média de 3 meses; dinheiro (venda a paciente + pagamento de notinha) entra;
--    notinha (venda a profissional) aparece à parte, marcada, e NÃO soma.
--  · sem saldo inicial até plugar o banco; cartão só as parcelas já compradas.
-- ═══════════════════════════════════════════════════════════════════

insert into public.fx0_parametros_geral (chave, valor, descricao)
values ('fin_unimed_imposto_pct', '10.77'::jsonb, 'FIN v4.0 · alíquota de imposto sobre o que a clínica recebe da Unimed (%). Informada pelo dono em 05/11/26.')
on conflict (chave) do nothing;

-- O Simples já está cadastrado como conta fixa mensal; descontar 10,77 % de novo da Unimed contaria o imposto duas vezes.
-- Enquanto o dono não decidir, a projeção mostra a Unimed bruta (aplicar = false). Mude para true para descontar.
insert into public.fx0_parametros_geral (chave, valor, descricao)
values ('fin_unimed_imposto_aplicar', 'false'::jsonb, 'FIN v4.0 · true = a projeção do chefe desconta fin_unimed_imposto_pct da Unimed; false = mostra bruta (o Simples já está nas contas fixas).')
on conflict (chave) do nothing;

insert into public.fx0_parametros_geral (chave, valor, descricao)
values ('fin_projecao_competencias', '6'::jsonb, 'FIN v4.0 · quantas competências a projeção do chefe cobre (a tela vai até 1 mês depois da Unimed da última).')
on conflict (chave) do nothing;

-- ── Unimed "do dia": o que o espelho do Feegow diz que vale a faturar numa competência ──
-- Lê os mesmos status faturáveis do planejador (status_faturaveis) e o valor da tabela de códigos.
-- Até p_ate conta o que aconteceu; de p_ate+1 ao fim do mês conta só o marcado × p_taxa.
create or replace function public.fin__unimed_dia(p_comp date, p_ate date, p_taxa numeric)
returns table(bruto numeric, realizado numeric, previsto numeric, sessoes int, marcadas int)
language sql stable security definer set search_path to 'public' as $$
  with s as (select coalesce((select array(select x::bigint from jsonb_array_elements_text(valor) x)
                                from public.fx0_parametros_geral where chave = 'status_faturaveis'), '{}'::bigint[]) ids),
  l as (
    select a.data,
           case when a.convenio_id = 2 then cp.valor_local else cp.valor_intercambio end v
      from public.agendamentos a cross join s
      join public.procedimentos p on p.id = a.procedimento_id
      join public.codigos_procedimento cp on cp.codigo = p.codigo and cp.ativo
     where a.convenio_id in (2, 8)
       and a.data >= p_comp and a.data < (p_comp + interval '1 month')::date
       and a.status_id = any(s.ids)
       and not exists (select 1 from public.feriados f where f.data = a.data))
  select round(coalesce(sum(case when data <= p_ate then v else v * p_taxa end), 0), 2),
         round(coalesce(sum(case when data <= p_ate then v end), 0), 2),
         round(coalesce(sum(case when data >  p_ate then v * p_taxa end), 0), 2),
         count(*) filter (where data <= p_ate)::int,
         count(*) filter (where data >  p_ate)::int
    from l;
$$;

-- ── taxa de comparecimento (atendido ÷ (atendido + falta)) nos últimos 3 meses fechados ──
-- p_profissional_id nulo = Unimed da clínica inteira (convênios 2 e 8); com id = agenda daquele profissional.
create or replace function public.fin__taxa_presenca(p_profissional_id bigint, p_ate date)
returns numeric
language sql stable security definer set search_path to 'public' as $$
  with c as (select valor from public.fx0_parametros_geral where chave = 'rep_status_classes'),
  k as (select coalesce((select array(select x::bigint from jsonb_array_elements_text(valor -> 'atendido') x) from c), '{}'::bigint[]) at_ids,
               coalesce((select array(select x::bigint from jsonb_array_elements_text(valor -> 'falta') x) from c), '{}'::bigint[]) fa_ids),
  q as (select count(*) filter (where a.status_id = any(k.at_ids)) n_at,
               count(*) filter (where a.status_id = any(k.fa_ids)) n_fa
          from public.agendamentos a cross join k
         where a.data >= (date_trunc('month', p_ate) - interval '3 months')::date
           and a.data <  date_trunc('month', p_ate)::date
           and (case when p_profissional_id is null then a.convenio_id in (2, 8) else a.profissional_id = p_profissional_id end))
  select case when n_at + n_fa >= 20 then round(n_at::numeric / (n_at + n_fa), 4) end from q;
$$;

-- ── a projeção ──
create or replace function public.fin_projecao_chefe(p_token text)
returns jsonb
language plpgsql security definer set search_path to 'public', 'extensions' as $$
declare
  a record;
  v_hoje date := public.fin__hoje();
  v_ini  date := date_trunc('month', v_hoje)::date;
  v_ncomp int := coalesce((select (valor #>> '{}')::int from public.fx0_parametros_geral where chave = 'fin_projecao_competencias'), 6);
  v_fim  date;                 -- última coluna do calendário
  v_imp  numeric := coalesce((select (valor #>> '{}')::numeric from public.fx0_parametros_geral where chave = 'fin_unimed_imposto_pct'), 10.77);
  v_imp_aplicar boolean := coalesce((select (valor #>> '{}')::boolean from public.fx0_parametros_geral where chave = 'fin_unimed_imposto_aplicar'), false);
  v_taxa_u numeric;            -- comparecimento Unimed da clínica
  v_c date; i int; k int;
  v_meses jsonb := '[]'::jsonb;
  v_unimed jsonb := '[]'::jsonb;
  v_rep jsonb := '[]'::jsonb;
  v_fixas numeric[] := '{}'; v_parc numeric[] := '{}'; v_cart numeric[] := '{}'; v_rep_tot numeric[] := '{}';
  v_uni_col numeric[] := '{}'; v_uni_estagio text[] := '{}';
  v_conv_din numeric; v_conv_not numeric;
  v_conv_din_m jsonb; v_conv_not_m jsonb;
  -- unimed por competência
  v_dia record; v_est text; v_bruto numeric; v_f0 record; v_rec_ate date;
  -- repasse
  p record; v_calc jsonb; v_taxa_p numeric; v_vals numeric[]; v_selos text[]; v_tot numeric; v_media_sessao numeric; v_marc int; v_sel text; v_v numeric;
  v_n_at int; v_tot_ate numeric; v_ult_recibo record;
  v_at_ids bigint[]; v_fa_ids bigint[]; v_marc_ids bigint[];
begin
  select * into a from public.fin__adm(p_token);
  if a.o_erro is not null then return public.loja__erro_json(a.o_erro); end if;
  if not (a.o_usuario).dono then return jsonb_build_object('ok', false, 'erro', 'SEM_ACESSO', 'msg', 'Sem acesso.'); end if;
  perform public.fin__gerar_mes(v_ini);

  v_ncomp := greatest(1, least(v_ncomp, 12));
  v_fim := (v_ini + make_interval(months => v_ncomp - 1 + 2 + 1))::date;   -- última competência + 2 (Unimed) + 1
  v_taxa_u := coalesce(public.fin__taxa_presenca(null, v_hoje), 1);

  select coalesce((select array(select x::bigint from jsonb_array_elements_text(valor -> 'atendido') x)), '{}'::bigint[]),
         coalesce((select array(select x::bigint from jsonb_array_elements_text(valor -> 'falta') x)), '{}'::bigint[])
    into v_at_ids, v_fa_ids
    from public.fx0_parametros_geral where chave = 'rep_status_classes';
  -- "marcado" para a estimativa = status que ainda podem virar atendimento (os de lembrete da confirmação: Marcado e Confirmado)
  v_marc_ids := coalesce((select array(select x::bigint from jsonb_array_elements_text(valor) x) from public.fx0_parametros_geral where chave = 'conf_status_lembrete'), array[1, 7]::bigint[]);

  -- ── colunas do calendário ──
  i := 0;
  for v_c in select gs::date from generate_series(v_ini, v_fim, interval '1 month') gs loop
    i := i + 1;
    v_meses := v_meses || to_jsonb(v_c);

    -- contas fixas (mesma regra da fin_projecao: no mês atual só o que falta pagar; "no cartão" fica fora).
    -- Aqui também ficam fora as categorias 'cartao' (o cartão entra só pelas parcelas, decisão do dono) e 'repasse' (calculado pelo motor do recibo).
    select coalesce(sum(case when m.id is not null then case when m.pago_em is null then m.valor_previsto else 0 end
                             else public.fin__valor_base('fixa', f.id, f.base_projecao, f.valor_informado, v_c) end), 0)
      into v_v
      from public.fin_conta_fixa f
      left join public.fin_conta_mes m on m.conta_fixa_id = f.id and m.competencia = v_c
     where not f.no_cartao and f.categoria not in ('cartao', 'repasse') and ((f.ativa and f.desde <= v_c) or m.id is not null);
    v_fixas[i] := round(v_v, 2);

    -- parcelas de dívidas
    select coalesce(sum(case when m.id is not null then case when m.pago_em is null then m.valor_previsto else 0 end
                             else public.fin__valor_base('divida', d.id, d.base_projecao, d.valor_parcela, v_c) end), 0)
      into v_v
      from public.fin_divida d
      left join public.fin_conta_mes m on m.divida_id = d.id and m.competencia = v_c
     where public.fin__divida_no_mes(d, v_c) or m.id is not null;
    v_parc[i] := round(v_v, 2);

    -- cartão: só as parcelas já compradas
    select coalesce(sum(valor), 0) into v_v from public.fin_cartao_parcela where competencia = v_c;
    v_cart[i] := round(v_v, 2);

    v_rep_tot[i] := 0; v_uni_col[i] := 0; v_uni_estagio[i] := null;
  end loop;

  -- ── Unimed: competências de (ini − 2) até (ini + ncomp − 1); cada uma cai 2 meses depois ──
  -- cada coluna do calendário recebe a Unimed da competência de 2 meses antes (até a última coluna)
  for v_c in select gs::date from generate_series((v_ini - interval '2 months')::date, (v_fim - interval '2 months')::date, interval '1 month') gs loop
    v_rec_ate := case when v_c > v_hoje then (v_c - 1) else least(v_hoje, (v_c + interval '1 month - 1 day')::date) end;
    select * into v_dia from public.fin__unimed_dia(v_c, v_rec_ate, v_taxa_u);
    select coalesce(sum(valor_esperado) filter (where status in ('planejada','lancada','conferida','enviada','paga','divergente','erro_lancamento')), 0) planejador,
           coalesce(sum(valor_esperado) filter (where status in ('lancada','conferida','enviada','paga')), 0) lancador,
           coalesce(sum(valor_esperado) filter (where status in ('enviada','paga')), 0) enviada,
           coalesce(sum(valor_pago) filter (where status = 'paga'), 0) definitiva,
           count(*) filter (where status = 'paga') n_paga,
           count(*) filter (where status in ('planejada','lancada','conferida','enviada','paga','divergente','erro_lancamento')) n_plan
      into v_f0
      from public.f0_faturamento where competencia = to_char(v_c, 'YYYY-MM');

    -- estágio mais avançado com valor; competência ainda em curso fica no "dia" (o planejador roda depois do mês fechar)
    if v_f0.n_paga > 0 then v_est := 'definitiva'; v_bruto := v_f0.definitiva;
    elsif v_c < v_ini and v_f0.enviada > 0 then v_est := 'enviada'; v_bruto := v_f0.enviada;
    elsif v_c < v_ini and v_f0.lancador > 0 then v_est := 'lancador'; v_bruto := v_f0.lancador;
    elsif v_c < v_ini and v_f0.n_plan > 0 then v_est := 'planejador'; v_bruto := v_f0.planejador;
    else v_est := case when v_c > v_hoje then 'estimado' else 'dia' end; v_bruto := v_dia.bruto;
    end if;

    k := (extract(year from v_c) - extract(year from v_ini)) * 12 + (extract(month from v_c) - extract(month from v_ini)) + 2 + 1;   -- coluna em que cai
    if k between 1 and i then
      v_uni_col[k] := round(v_bruto * (case when v_imp_aplicar then 1 - v_imp / 100 else 1 end), 2);
      v_uni_estagio[k] := v_est;
    end if;
    v_unimed := v_unimed || jsonb_build_object(
      'competencia', v_c, 'cai_em', (v_c + interval '2 months')::date, 'coluna', case when k between 1 and i then k - 1 end,
      'estagio', v_est, 'bruto', round(v_bruto, 2), 'liquido', round(v_bruto * (case when v_imp_aplicar then 1 - v_imp / 100 else 1 end), 2),
      'dia', v_dia.bruto, 'dia_realizado', v_dia.realizado, 'dia_previsto', v_dia.previsto, 'sessoes', v_dia.sessoes, 'marcadas', v_dia.marcadas,
      'planejador', round(v_f0.planejador, 2), 'lancador', round(v_f0.lancador, 2), 'enviada', round(v_f0.enviada, 2), 'definitiva', round(v_f0.definitiva, 2));
  end loop;

  -- ── repasse: um profissional por linha, uma coluna por mês (pago no fim do próprio mês, regra do dono) ──
  for p in select rp.profissional_id, pr.nome
             from public.rep_profissionais rp
             join public.rep_regimes rg on rg.codigo = rp.regime and rg.gera_recibo
             join public.profissionais pr on pr.id = rp.profissional_id
            where not exists (select 1 from public.prof_desativacoes d where d.profissional_id = rp.profissional_id and d.reativado_em is null)
            order by pr.nome loop
    v_vals := '{}'; v_selos := '{}'; v_tot := 0;
    v_taxa_p := coalesce(public.fin__taxa_presenca(p.profissional_id, v_hoje), v_taxa_u);
    -- valor médio por sessão atendida: do último recibo congelado; sem recibo, do cálculo do mês corrente
    select rc.total, (rc.dados ->> 'atendidos')::int n_at into v_ult_recibo
      from public.rep_recibos rc where rc.profissional_id = p.profissional_id order by rc.competencia desc, rc.versao desc limit 1;
    v_media_sessao := case when coalesce(v_ult_recibo.n_at, 0) > 0 then v_ult_recibo.total / v_ult_recibo.n_at end;

    for k in 1 .. i loop
      v_c := (v_ini + make_interval(months => k - 1))::date;
      if v_c <= v_ini then
        -- mês corrente (a projeção começa no mês atual; meses passados não entram nas colunas)
        v_calc := public.rep__calcular_ate(p.profissional_id, v_c, v_hoje);
        if coalesce((v_calc ->> 'ok')::boolean, false) then
          v_tot_ate := (v_calc ->> 'total')::numeric; v_n_at := (v_calc ->> 'atendidos')::int;
          if v_media_sessao is null and v_n_at > 0 then v_media_sessao := v_tot_ate / v_n_at; end if;
          select count(*) into v_marc from public.agendamentos ag
           where ag.profissional_id = p.profissional_id and ag.data > v_hoje and ag.data < (v_c + interval '1 month')::date
             and ag.status_id = any(v_marc_ids) and not exists (select 1 from public.feriados f where f.data = ag.data);
          v_v := v_tot_ate + coalesce(v_marc * v_taxa_p * v_media_sessao, 0);
          v_sel := case when exists (select 1 from public.rep_recibos rc where rc.profissional_id = p.profissional_id and rc.competencia = v_c) then 'lacrado'
                        when (v_calc ->> 'completo')::boolean then 'fechado' else 'dia' end;
        else v_v := 0; v_sel := 'sem_regime'; end if;
      else
        select count(*) into v_marc from public.agendamentos ag
         where ag.profissional_id = p.profissional_id and ag.data >= v_c and ag.data < (v_c + interval '1 month')::date
           and ag.status_id = any(v_marc_ids) and not exists (select 1 from public.feriados f where f.data = ag.data);
        v_v := coalesce(v_marc * v_taxa_p * v_media_sessao, 0);
        v_sel := case when v_marc = 0 then 'sem_agenda' else 'estimado' end;
      end if;
      v_vals[k] := round(coalesce(v_v, 0), 2); v_selos[k] := v_sel;
      v_rep_tot[k] := v_rep_tot[k] + v_vals[k]; v_tot := v_tot + v_vals[k];
    end loop;
    if v_tot > 0 then
      v_rep := v_rep || jsonb_build_object('profissional_id', p.profissional_id, 'nome', p.nome, 'taxa', v_taxa_p,
                                          'media_sessao', round(coalesce(v_media_sessao, 0), 2), 'valores', to_jsonb(v_vals), 'selos', to_jsonb(v_selos));
    end if;
  end loop;

  -- ── conveniência: média dos 3 últimos meses fechados ──
  with m as (select to_char(quando at time zone 'America/Sao_Paulo', 'YYYY-MM') mes, tipo, valor_total
               from public.loja_movimentos
              where not coalesce(marcado_erro, false)
                and quando >= ((v_ini - interval '3 months')::date::timestamp at time zone 'America/Sao_Paulo')
                and quando <  (v_ini::timestamp at time zone 'America/Sao_Paulo')),
  g as (select mes, sum(valor_total) filter (where tipo in ('venda_paciente', 'pagamento_notinha')) din,
                    sum(valor_total) filter (where tipo = 'venda_profissional') nota
          from m group by mes)
  select round(coalesce(avg(din), 0), 2), round(coalesce(avg(nota), 0), 2),
         jsonb_agg(jsonb_build_object('mes', mes, 'dinheiro', round(coalesce(din, 0), 2), 'notinha', round(coalesce(nota, 0), 2)) order by mes)
    into v_conv_din, v_conv_not, v_conv_din_m
    from g;

  return jsonb_build_object('ok', true, 'hoje', v_hoje, 'inicio', v_ini, 'fim', v_fim, 'competencias', v_ncomp,
    'imposto_pct', v_imp, 'imposto_aplicado', v_imp_aplicar, 'taxa_unimed', v_taxa_u,
    'meses', v_meses,
    'unimed', jsonb_build_object('por_coluna', to_jsonb(v_uni_col), 'estagio', to_jsonb(v_uni_estagio), 'competencias', v_unimed),
    'conveniencia', jsonb_build_object('dinheiro', v_conv_din, 'notinha', v_conv_not, 'meses', coalesce(v_conv_din_m, '[]'::jsonb)),
    'repasse', jsonb_build_object('por_coluna', to_jsonb(v_rep_tot), 'profissionais', v_rep),
    'fixas', to_jsonb(v_fixas), 'parcelas', to_jsonb(v_parc), 'cartao', to_jsonb(v_cart),
    'saldo_ligado', false);
end $$;

revoke all on function public.fin_projecao_chefe(text) from public;
grant execute on function public.fin_projecao_chefe(text) to anon, authenticated;
revoke all on function public.fin__unimed_dia(date, date, numeric) from public, anon, authenticated;
revoke all on function public.fin__taxa_presenca(bigint, date) from public, anon, authenticated;
