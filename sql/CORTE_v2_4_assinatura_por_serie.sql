-- ═══ CORTE v2.4 · a assinatura "Excluí" vale por SÉRIE, não por paciente (05/11/2026) ═══
--
-- Problema (achado nas pendências da recepção, 05/11/26):
--   corte_notas guarda UMA linha por paciente+terapia, para sempre. Um "Excluí" de um corte antigo
--   (ex.: 09/09) continuava valendo quando, semanas depois, a série nova perdia a cobertura: o paciente
--   entrava direto como "Apagou incompleto" em vez de "Cortar agora" (Paulo Sérgio, Heitor).
--   Série remarcada depois do corte, sem guia nova, também caía como "Apagou incompleto"
--   (Maria Regina, Pedro, Isabelle). Dos 32 avisos "Faxina pela metade" já mandados, só 10 eram de verdade.
--
-- Regra nova (decisão do dono, 05/11/26):
--   · a assinatura vale só para as consultas que JÁ EXISTIAM quando foi feita
--     (agendado_em do Feegow ≤ hora da assinatura). Se alguma delas continua lá → "Apagou incompleto" (como antes);
--   · consulta sem guia criada DEPOIS da assinatura = série nova:
--       – houve consulta entre o corte e agora → corte novo: fluxo normal (Cortar hoje/agora, Aguardar 20h…);
--       – não houve → "Remarcou sem guia" (estado normal + reagendou_sem_guia = true). Aviso no Telegram
--         na hora e de 6 em 6 h, o mesmo tempo que a "Faxina pela metade" dava a esses casos.
--   · assinar "Excluí" de novo continua sem renovar o prazo — a não ser que a assinatura antiga seja de antes
--     de TODAS as consultas sem guia de agora (aí é um corte novo e vale a partir de agora).
--
-- O que muda: corte_fila (+4 colunas no fim: excluido_antigo, reagendou_sem_guia, alvo_criado_em, alvo_criado_por),
--   gatilho corte_notas_ancora, função nova corte__excluido_vale (SECURITY DEFINER: o Cortex grava como anon,
--   que não lê a pre_cobertura_mat), cob_regras (+ corte_reagendou_sem_guia) e cob_atuais.
-- Não muda: QUEM está na fila do corte (as linhas são as mesmas), pend_atuais, Agenda, planejador, faturamento.
--
-- Remendo por âncoras: se o texto atual das views não bater, aborta sem gravar nada. Backup em bkp_definicoes.
-- Desfazer: recriar as views/função a partir de bkp_definicoes (motivo = 'antes do CORTE v2.4'),
--   apagar a função corte__excluido_vale e a linha corte_reagendou_sem_guia da cob_regras.

do $corte24$
declare
  v_fila text := pg_get_viewdef('public.corte_fila'::regclass, true);
  v_cob  text := pg_get_viewdef('public.cob_atuais'::regclass, true);
  a text[];
  b text[];
  i int;
begin
  if position('desc_criado_min' in v_fila) > 0 then
    raise exception 'CORTE v2.4 já instalado (corte_fila já tem desc_criado_min). Nada foi feito.';
  end if;

  -- 0. backup do que vai mudar
  insert into public.bkp_definicoes (objeto, tipo, definicao, motivo) values
    ('public.corte_fila', 'view', v_fila, 'antes do CORTE v2.4'),
    ('public.cob_atuais', 'view', v_cob, 'antes do CORTE v2.4'),
    ('public.corte_notas_ancora()', 'function', pg_get_functiondef('public.corte_notas_ancora'::regproc), 'antes do CORTE v2.4');

  -- 1. a assinatura vale para as consultas sem guia de agora?
  execute $ddl$
    create or replace function public.corte__excluido_vale(p_ref text, p_excluido_em timestamptz)
    returns boolean
    language sql stable security definer set search_path = public
    as $f$
      -- CORTE v2.4 (05/11/26). Mesma conta da corte_fila (janela da pre_cobertura_mat, consultas futuras sem cobertura).
      -- true  = alguma consulta sem guia de agora já existia quando assinaram "Excluí" (a assinatura vale)
      -- false = todas foram criadas depois da assinatura (série nova: a assinatura é de um corte anterior)
      -- null  = nenhuma consulta sem guia na janela
      select bool_or(coalesce(m.agendado_em, '-infinity'::timestamptz) <= p_excluido_em)
        from public.pre_cobertura_mat m
       where 'corte:' || m.paciente_id || ':' || m.especialidade = p_ref
         and m.situacao <> 'procedimento_errado'
         and not coalesce(m.coberta, false)
         and (m.data > (now() at time zone 'America/Sao_Paulo')::date
              or (m.data = (now() at time zone 'America/Sao_Paulo')::date
                  and coalesce(m.horario, '23:59')::time > (now() at time zone 'America/Sao_Paulo')::time))
    $f$
  $ddl$;
  execute 'revoke all on function public.corte__excluido_vale(text, timestamptz) from public';
  execute 'grant execute on function public.corte__excluido_vale(text, timestamptz) to anon, authenticated, service_role';

  -- 2. gatilho: assinar de novo não renova — salvo quando a assinatura antiga é de uma série que já não existe
  execute $ddl$
    create or replace function public.corte_notas_ancora()
    returns trigger
    language plpgsql
    as $f$
    begin
      if new.tratamento = 'excluido' then
        if tg_op = 'UPDATE' and old.tratamento = 'excluido' then
          new.excluido_em := coalesce(old.excluido_em, old.atualizado_em);   -- assinar de novo não renova
          -- CORTE v2.4: ...a não ser que a assinatura antiga seja de antes de TODAS as consultas sem guia de agora
          -- (série nova, criada depois do corte anterior). Aí é um corte novo e a assinatura vale a partir de agora.
          if public.corte__excluido_vale(new.referencia, new.excluido_em) is false then
            new.excluido_em := now();
          end if;
        else
          new.excluido_em := now();
        end if;
      else
        new.excluido_em := null;
      end if;
      return new;
    end
    $f$
  $ddl$;

  -- 3. corte_fila
  a := array[
    E'            m.em_feriado,\n            NOT COALESCE(m.coberta, false) AND (m.data > par_1.hoje OR',
    E'            min(b.horario) FILTER (WHERE b.desc_hoje) AS hoje_horario\n           FROM base b',
    $x$WHEN cn.tratamento = 'excluido'::text THEN 'excluido_conferir'::text$x$,
    $x$COALESCE(cn.tratamento = 'excluido'::text AND COALESCE(cn.excluido_em, cn.atualizado_em) < (par.agora -$x$,
    E'    k.ultima_consulta,\n    k.dia_corte\n   FROM fam f'
  ];
  b := array[
    E'            m.em_feriado,\n            m.agendado_em,\n            m.quem_criou,\n            NOT COALESCE(m.coberta, false) AND (m.data > par_1.hoje OR',
    E'            min(b.horario) FILTER (WHERE b.desc_hoje) AS hoje_horario,\n'
    || E'            min(COALESCE(b.agendado_em, \'-infinity\'::timestamp with time zone)) FILTER (WHERE b.desc_fut) AS desc_criado_min,\n'
    || E'            (array_agg(b.agendado_em ORDER BY b.data, b.horario) FILTER (WHERE b.desc_fut))[1] AS alvo_criado_em,\n'
    || E'            (array_agg(b.quem_criou ORDER BY b.data, b.horario) FILTER (WHERE b.desc_fut))[1] AS alvo_criado_por\n'
    || E'           FROM base b',
    $x$WHEN cn.tratamento = 'excluido'::text AND COALESCE(f.desc_criado_min, '-infinity'::timestamp with time zone) <= COALESCE(cn.excluido_em, cn.atualizado_em) THEN 'excluido_conferir'::text$x$,
    $x$COALESCE(cn.tratamento = 'excluido'::text AND COALESCE(f.desc_criado_min, '-infinity'::timestamp with time zone) <= COALESCE(cn.excluido_em, cn.atualizado_em) AND COALESCE(cn.excluido_em, cn.atualizado_em) < (par.agora -$x$,
    E'    k.ultima_consulta,\n    k.dia_corte,\n'
    || E'    COALESCE(cn.tratamento = \'excluido\'::text AND COALESCE(f.desc_criado_min, \'-infinity\'::timestamp with time zone) > COALESCE(cn.excluido_em, cn.atualizado_em), false) AS excluido_antigo,\n'
    || E'    COALESCE(cn.tratamento = \'excluido\'::text AND COALESCE(f.desc_criado_min, \'-infinity\'::timestamp with time zone) > COALESCE(cn.excluido_em, cn.atualizado_em) AND (k.ultima_consulta IS NULL OR k.ultima_consulta <= (COALESCE(cn.excluido_em, cn.atualizado_em) AT TIME ZONE \'America/Sao_Paulo\'::text)::date), false) AS reagendou_sem_guia,\n'
    || E'    f.alvo_criado_em,\n    f.alvo_criado_por\n   FROM fam f'
  ];
  for i in 1 .. array_length(a, 1) loop
    if (length(v_fila) - length(replace(v_fila, a[i], ''))) / length(a[i]) <> 1 then
      raise exception 'CORTE v2.4: a âncora % da corte_fila não bateu (a view mudou desde a análise). Nada foi feito.', i;
    end if;
    v_fila := replace(v_fila, a[i], b[i]);
  end loop;
  execute 'create or replace view public.corte_fila as ' || v_fila;
  comment on column public.corte_fila.excluido_antigo is 'CORTE v2.4: a assinatura "Excluí" é de antes de todas as consultas sem guia de agora (série nova) — não vale para elas';
  comment on column public.corte_fila.reagendou_sem_guia is 'CORTE v2.4: série criada depois do "Excluí", sem consulta no meio: remarcaram sem guia nova no sistema';
  comment on column public.corte_fila.alvo_criado_em is 'CORTE v2.4: quando a primeira consulta sem guia foi criada no Feegow (agendado_em)';
  comment on column public.corte_fila.alvo_criado_por is 'CORTE v2.4: quem criou no Feegow a primeira consulta sem guia (quem_criou)';

  -- 4. Telegram: tipo novo, com o mesmo tempo da "Faxina pela metade"
  insert into public.cob_regras (tipo, ordem, emoji, rotulo, rotulo_plural, unidade, unidades, acao,
                                 primeiro_min, primeiro_relogio, repete_min, repete_relogio, modo, ativo,
                                 nota, recado, recado_titulo, recado_titulo_plural)
  values ('corte_reagendou_sem_guia', 225, '📆', 'Remarcou sem guia', 'Remarcados sem guia', null, null,
          'O paciente foi cortado e a agenda foi remarcada sem guia nova no sistema. Guia a caminho: “Aguardar 20h” no Cortex (uma vez só). Sem guia: apagar de novo “esta e as próximas” e assinar.',
          0, 'expediente', 360, 'expediente', 'individual', true,
          'CORTE v2.4 (05/11/26): série criada depois da assinatura “Excluí”, sem consulta no meio. Antes caía como “Faxina pela metade”; ficou com o mesmo tempo dela (na hora e de 6 em 6 h).',
          'O paciente foi cortado e a agenda foi remarcada sem guia nova no sistema. Se a guia está a caminho, marca “Aguardar 20h” no Cortex; se não, apaga de novo “esta e as próximas” e assina. Me avisa quando fizer, por favor.',
          'Remarcado sem guia', 'Remarcados sem guia')
  on conflict (tipo) do nothing;

  -- 5. cob_atuais
  a := array[
    E'WHEN c.apagou_incompleto THEN \'corte_apagou_incompleto\'::text\n',
    $x$WHEN c.estado = 'prazo_vencido'::text THEN 'Guia pedida; o prazo venceu'::text$x$,
    E'            WHEN c.ja_esperou THEN \'já esperou as 20 h\'::text\n            ELSE NULL::text\n        END) AS linha'
  ];
  b := array[
    E'WHEN c.apagou_incompleto THEN \'corte_apagou_incompleto\'::text\n            WHEN c.reagendou_sem_guia THEN \'corte_reagendou_sem_guia\'::text\n',
    $x$WHEN c.reagendou_sem_guia THEN concat_ws('; '::text, ('Cortado'::text || COALESCE(' por '::text || cob__nome(c.autora), ''::text)) || COALESCE(' em '::text || to_char((COALESCE(c.excluido_em, c.nota_atualizada_em) AT TIME ZONE 'America/Sao_Paulo'::text), 'DD/MM'::text), ''::text), (('remarcado'::text || COALESCE(' por '::text || cob__nome(c.alvo_criado_por), ''::text)) || COALESCE(' em '::text || to_char((c.alvo_criado_em AT TIME ZONE 'America/Sao_Paulo'::text), 'DD/MM'::text), ''::text)) || ', sem guia nova no sistema'::text)
            WHEN c.estado = 'prazo_vencido'::text THEN 'Guia pedida; o prazo venceu'::text$x$,
    E'            WHEN c.ja_esperou THEN \'já esperou as 20 h\'::text\n            ELSE NULL::text\n        END,\n'
    || E'        CASE\n            WHEN c.reagendou_sem_guia THEN \'remarcado sem guia\'::text || COALESCE(\' por \'::text || cob__nome(c.alvo_criado_por), \'\'::text)\n            ELSE NULL::text\n        END) AS linha'
  ];
  for i in 1 .. array_length(a, 1) loop
    if (length(v_cob) - length(replace(v_cob, a[i], ''))) / length(a[i]) <> 1 then
      raise exception 'CORTE v2.4: a âncora % da cob_atuais não bateu (a view mudou desde a análise). Nada foi feito.', i;
    end if;
    v_cob := replace(v_cob, a[i], b[i]);
  end loop;
  execute 'create or replace view public.cob_atuais as ' || v_cob;

  -- [ENSAIO]
end
$corte24$;
