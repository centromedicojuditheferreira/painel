-- ═══ CORTE v2.5 · "Aguardar 20h" vale uma vez por CORTE, não por data (05/11/2026) ═══
--
-- Antes: o sistema lembrava a data da 1ª consulta sem guia do momento da espera (aguardar_primeiro).
--   Remarcar a série começando em outra data — ou deixar passar uma consulta sem guia — liberava
--   outra espera no mesmo corte, sem guia nenhuma ter chegado.
-- Agora (decisão do dono, 05/11/26): a espera só renova quando, depois dela, o paciente teve consulta
--   COBERTA nesta terapia (na data havia guia da mesma terapia, válida, numa carteirinha dele).
--   Sem isso: "já aguardou neste corte, agora é cortar".
--   Espera em andamento: marcar de novo não estica o prazo, seja qual for a data da consulta.
--
-- O que muda: função nova corte__espera_renovou; coluna ja_esperou da corte_fila; função corte_aguardar.
-- Não muda: quem está na fila, os estados do corte, Telegram (só o "urgente" acompanha o ja_esperou).
-- Remendo por âncora; aborta sem gravar nada se o texto da view não bater. Backup em bkp_definicoes
--   (motivo = 'antes do CORTE v2.5').

do $corte25$
declare
  v_fila text := pg_get_viewdef('public.corte_fila'::regclass, true);
  a text := $x$COALESCE(cn.aguardar_ate <= par.agora AND cn.aguardar_primeiro = f.primeiro_descoberto, false) AS ja_esperou$x$;
  b text := $x$COALESCE(cn.aguardar_ate <= par.agora AND NOT public.corte__espera_renovou((('corte:'::text || f.paciente_id) || ':'::text) || f.especialidade, cn.aguardar_em), false) AS ja_esperou$x$;
begin
  if position('corte__espera_renovou' in v_fila) > 0 then
    raise exception 'CORTE v2.5 já instalado. Nada foi feito.';
  end if;
  if position('desc_criado_min' in v_fila) = 0 then
    raise exception 'CORTE v2.5 precisa do CORTE v2.4 instalado antes. Nada foi feito.';
  end if;
  if (length(v_fila) - length(replace(v_fila, a, ''))) / length(a) <> 1 then
    raise exception 'CORTE v2.5: a âncora do ja_esperou na corte_fila não bateu. Nada foi feito.';
  end if;

  -- 0. backup
  insert into public.bkp_definicoes (objeto, tipo, definicao, motivo) values
    ('public.corte_fila', 'view', v_fila, 'antes do CORTE v2.5'),
    ('public.corte_aguardar(text,text,date,text)', 'function',
     pg_get_functiondef('public.corte_aguardar(text,text,date,text)'::regprocedure), 'antes do CORTE v2.5');

  -- 1. depois da espera, o paciente teve consulta coberta nesta terapia?
  execute $ddl$
    create or replace function public.corte__espera_renovou(p_ref text, p_desde timestamptz)
    returns boolean
    language sql stable security definer set search_path = public
    as $f$
      -- CORTE v2.5 (05/11/26). p_ref = 'corte:<paciente_id>:<terapia>'; p_desde = quando a espera foi marcada.
      -- true  = depois da espera houve consulta coberta (na data havia guia da mesma terapia, válida, numa carteirinha
      --         do paciente): é outro corte, pode aguardar de novo.
      -- false = mesmo corte: já aguardou, é cortar.
      with r as (
        select split_part(p_ref, ':', 2)::bigint as pid,
               split_part(p_ref, ':', 3) as esp,
               (p_desde at time zone 'America/Sao_Paulo')::date as d0,
               (now() at time zone 'America/Sao_Paulo')::date as hoje,
               coalesce((select array_agg(t.x::bigint) from public.fx0_parametros_geral p, jsonb_array_elements_text(p.valor) t(x)
                          where p.chave = 'status_faturaveis'), array[1,2,3,4,5,6,7,208]::bigint[]) as sts,
               array[coalesce((select (p.valor ->> 'local')::bigint from public.fx0_parametros_geral p where p.chave = 'convenios_unimed'), 2),
                     coalesce((select (p.valor ->> 'intercambio')::bigint from public.fx0_parametros_geral p where p.chave = 'convenios_unimed'), 8)] as convs
      )
      select p_desde is not null and exists (
        select 1
          from r
          join public.agendamentos ag on ag.paciente_id = r.pid
          join public.procedimentos pr on pr.id = ag.procedimento_id
         where ag.protegido_em is null
           and ag.status_id = any (r.sts)
           and ag.convenio_id = any (r.convs)
           and ag.data >= r.d0 and ag.data < r.hoje
           and case when regexp_replace(coalesce(pr.codigo, ''), '[^0-9]', '', 'g') in ('50000470', '50001221') then 'psicologia'
                    when regexp_replace(coalesce(pr.codigo, ''), '[^0-9]', '', 'g') = '2250005103' then 'aba'
                    when regexp_replace(coalesce(pr.codigo, ''), '[^0-9]', '', 'g') = '50000560' then 'nutricao' end = r.esp
           and exists (
             select 1
               from public.carteirinhas_pacientes cp
               join public.guias_sgu g
                 on lpad(regexp_replace(coalesce(g.carteirinha, ''), '[^0-9]', '', 'g'), 17, '0')
                  = lpad(regexp_replace(coalesce(cp.carteirinha, ''), '[^0-9]', '', 'g'), 17, '0')
              where cp.paciente_id = r.pid
                and g.data_autorizacao <= ag.data
                and least(g.validade_senha, coalesce(g.validade_carteirinha, g.validade_senha)) >= ag.data
                and exists (
                  select 1
                    from jsonb_array_elements(case when jsonb_typeof(g.procedimentos_json) = 'array' then g.procedimentos_json else '[]'::jsonb end) x(v)
                   where case when regexp_replace(coalesce(x.v ->> 'codigo', ''), '[^0-9]', '', 'g') in ('50000470', '50001221') then 'psicologia'
                              when regexp_replace(coalesce(x.v ->> 'codigo', ''), '[^0-9]', '', 'g') = '2250005103' then 'aba'
                              when regexp_replace(coalesce(x.v ->> 'codigo', ''), '[^0-9]', '', 'g') = '50000560' then 'nutricao' end = r.esp))
      )
    $f$
  $ddl$;
  execute 'revoke all on function public.corte__espera_renovou(text, timestamptz) from public';
  -- quem lê a corte_fila precisa poder chamar a função (Cortex = anon; robôs; conector de leitura do Claude)
  execute 'grant execute on function public.corte__espera_renovou(text, timestamptz) to anon, authenticated, service_role';
  if exists (select 1 from pg_roles where rolname = 'supabase_read_only_user') then
    execute 'grant execute on function public.corte__espera_renovou(text, timestamptz) to supabase_read_only_user';
  end if;

  -- 2. a função do botão "Aguardar 20h"
  execute $ddl$
    create or replace function public.corte_aguardar(p_referencia text, p_motivo text, p_primeiro date, p_autora text)
    returns jsonb
    language plpgsql
    security definer
    set search_path = public
    as $f$
    declare
      v_horas numeric := coalesce((select (valor #>> '{}')::numeric from fx0_parametros_geral
                                    where chave = 'corte_espera_horas'), 20);
      v_old   corte_notas%rowtype;
      v_ate   timestamptz;
    begin
      if p_motivo is null or p_motivo <> all (array['guia_em_analise','guia_autorizada','validade_renovada']) then
        raise exception 'CORTE_MOTIVO_INVALIDO' using hint = 'Escolha o motivo da espera.';
      end if;
      if coalesce(btrim(p_autora), '') = '' then
        raise exception 'CORTE_SEM_ASSINATURA' using hint = 'Entre com seu PIN primeiro: a espera é assinada.';
      end if;
      if p_referencia is null or p_primeiro is null then
        raise exception 'CORTE_SEM_CONSULTA' using hint = 'Paciente sem consulta descoberta: recarregue a tela.';
      end if;

      select * into v_old from corte_notas where referencia = p_referencia for update;
      if found and v_old.aguardar_ate is not null then
        if v_old.aguardar_ate > now() then
          -- já aguardando: volta a ficar em espera, sem esticar o prazo (CORTE v2.5: qualquer que seja a consulta)
          update corte_notas set tratamento = 'aguardar', indulto_ate = null where referencia = p_referencia;
          return jsonb_build_object('ok', true, 'aguardar_ate', v_old.aguardar_ate, 'ja_estava', true);
        end if;
        -- CORTE v2.5: uma espera por corte. Só aguarda de novo se, depois da última espera, houve consulta coberta.
        if not public.corte__espera_renovou(p_referencia, v_old.aguardar_em) then
          raise exception 'CORTE_JA_ESPEROU' using hint = 'Este paciente já aguardou neste corte e a guia não entrou no sistema: agora é cortar.';
        end if;
      end if;

      v_ate := now() + v_horas::float8 * interval '1 hour';
      insert into corte_notas (referencia, tratamento, indulto_ate, autora,
                               aguardar_motivo, aguardar_primeiro, aguardar_em, aguardar_ate)
      values (p_referencia, 'aguardar', null, btrim(p_autora), p_motivo, p_primeiro, now(), v_ate)
      on conflict (referencia) do update
         set tratamento        = 'aguardar',
             indulto_ate       = null,
             autora            = excluded.autora,
             aguardar_motivo   = excluded.aguardar_motivo,
             aguardar_primeiro = excluded.aguardar_primeiro,
             aguardar_em       = excluded.aguardar_em,
             aguardar_ate      = excluded.aguardar_ate;
      return jsonb_build_object('ok', true, 'aguardar_ate', v_ate, 'ja_estava', false);
    end
    $f$
  $ddl$;

  -- 3. corte_fila: ja_esperou por corte
  execute 'create or replace view public.corte_fila as ' || replace(v_fila, a, b);

  -- [ENSAIO]
end
$corte25$;
