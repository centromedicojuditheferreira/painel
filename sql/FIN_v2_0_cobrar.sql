-- ═══════════════════════════════════════════════════════════════════════════════
-- FIN v2.0 · COBRAR (05/11/2026) — paciente que chegou sem a cobrança no Feegow
-- Decisões do dono (02/11 e 05/11/2026):
--   · Paciente Particular ou Lev Soul (convênios 12/21/22) que chegou no Feegow (Aguardando, Chamando,
--     Em atendimento, Atendido, Aguardando pagamento) aparece no Cortex (Início → Agora → Cobrar; tela Caixa)
--     até o Feegow ter a CONTA com o PAGAMENTO e o VALOR CERTO. Lev Soul: R$ 60 por sessão; Particular: o
--     valor da agenda. Aluguel (regimes aluguel_medico / nutri_aluguel) fica fora.
--   · Tudo se lança no Feegow; o Cortex só mostra e some sozinho na leitura seguinte (robô de 3 em 3 min).
--   · Telegram, grupo Financeiro: aviso na chegada, de 10 em 10 min por 3 vezes, depois de 6 em 6 h, só no
--     expediente (cob_expediente); resolvido → "✅ Cobrança lançada". Botão "📤 Mandei pras secretárias" e
--     recado pronto, como as demais cobranças.
--   · O "atendido sem cobrança" antigo (30 min depois do fim da sessão, FIN v1.2) fica redundante: o cron
--     fin-sem-cobranca sai do ar no BLOCO 2 (a função continua no banco).
-- Situações: sem_lancamento (nada para o paciente no dia) · sem_pagamento (conta sem pagamento) ·
--            valor_diferente (pago ≠ esperado) · ok.
-- Chave de cada item: paciente_id:data (duas sessões no mesmo dia somam o esperado).
--
-- COMO RODAR (SQL Editor do Supabase):
--   BLOCO 0 — conserto do cob__enviar_aviso (o cron fin-sem-cobranca falhava desde 04/11). Rodar sempre.
--   BLOCO 1 — instala tudo DESLIGADO (fin_cobrar_ativo = false). Pode rodar antes do merge do PR B.
--   BLOCO 2 — liga: data de início, cron fin-cobrar de 5 em 5 min, desliga o fin-sem-cobranca. Rodar DEPOIS
--             do merge do PR B (o quadrado só aparece com a função fin_cobrar_lista no banco).
-- Idempotente: pode rodar de novo.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────── BLOCO 0 ───────────────────────────────
-- robo_telegram_fin_recado manda p_itens nulo e cob_mensagens.itens é NOT NULL: coalesce no insert.
CREATE OR REPLACE FUNCTION public.cob__enviar_aviso(p_origem text, p_tipo text, p_itens jsonb, p_texto text, p_html boolean, p_recado text, p_chat text, p_criada timestamp with time zone DEFAULT now())
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_mid bigint;
  v_req bigint;
begin
  if nullif(btrim(p_chat), '') is null then return null; end if;
  insert into public.cob_mensagens (criada_em, origem, tipo, itens, texto, recado, html, chat_id)
  values (coalesce(p_criada, now()), p_origem, p_tipo, coalesce(p_itens, '[]'::jsonb), p_texto, nullif(btrim(p_recado), ''), coalesce(p_html, false), p_chat)
  returning id into v_mid;
  v_req := public.tg_api('sendMessage', jsonb_build_object(
             'chat_id', p_chat, 'parse_mode', 'HTML', 'disable_web_page_preview', true,
             'text', public.cob__montar(p_texto, coalesce(p_html, false), p_recado, null),
             'reply_markup', jsonb_build_object('inline_keyboard', jsonb_build_array(jsonb_build_array(
                public.tg__botao('📤 Mandei pras secretárias', 'cobv:' || v_mid))))));
  update public.cob_mensagens set pedido_id = v_req where id = v_mid;
  return v_mid;
end $function$;

-- ─────────────────────────────── BLOCO 1 ───────────────────────────────
-- chaves
insert into public.fx0_parametros_geral (chave, valor, descricao) values
  ('fin_cobrar_ativo', 'false'::jsonb,
   'FIN v2.0. true = o Cortex mostra o Cobrar (Início/Caixa) e o Telegram (grupo Financeiro) avisa; false = a função responde "desligado" e nada é avisado (a memória fin_cobrar_vista continua sendo gravada pelo cron).'),
  ('fin_cobrar_inicio', to_jsonb(current_date::text),
   'FIN v2.0. Data (AAAA-MM-DD) a partir da qual os atendimentos entram no Cobrar. Atendimento anterior não aparece nem é cobrado.'),
  ('fin_cobrar_valor_levsoul', '60'::jsonb,
   'FIN v2.0. Valor esperado por sessão nos convênios Lev Soul (fin_convenios_cobrados). Particular = valor da agenda.'),
  ('fin_cobrar_status', '[2,3,4,5,208]'::jsonb,
   'FIN v2.0. Status do Feegow que contam como "chegou": 2 Em atendimento, 3 Atendido, 4 Aguardando, 5 Chamando, 208 Aguardando pagamento.'),
  ('fin_cobrar_regua', '{"rajada_min": 10, "rajada_vezes": 3, "repete_min": 360}'::jsonb,
   'FIN v2.0. Telegram: 1º aviso na chegada; depois de rajada_min em rajada_min por rajada_vezes vezes; depois de repete_min em repete_min, até lançar. Só no expediente (cob_expediente).')
on conflict (chave) do nothing;

-- memória: quando cada cobrança apareceu, foi avisada e resolveu (como a cob_vista)
create table if not exists public.fin_cobrar_vista (
  chave            text primary key,                  -- paciente_id:data
  paciente_id      bigint,
  data             date,
  situacao         text,
  apareceu_em      timestamptz not null default now(),
  ultimo_visto_em  timestamptz,
  resolvido_em     timestamptz,
  ciclo            integer not null default 1,
  avisos           integer not null default 0,
  ultimo_aviso_em  timestamptz,
  ultima_msg       bigint
);
comment on table public.fin_cobrar_vista is 'FIN v2.0. Memória do Cobrar: quando cada paciente/dia apareceu sem cobrança, quantas vezes o Telegram avisou e quando resolveu. Resolveu e voltou = ciclo novo.';
revoke all on public.fin_cobrar_vista from anon, authenticated;

-- a lista: um item por paciente por dia
create or replace function public.fin_cobrar_itens(p_agora timestamptz default now())
returns table (chave text, paciente_id bigint, data date, paciente text, origem text, sessoes integer, esperado numeric,
               lancado numeric, pago numeric, formas text, situacao text, primeira time, itens jsonb)
language sql stable security definer set search_path = public as $$
  with cfg as (
    select coalesce((select (g.valor #>> '{}')::date from fx0_parametros_geral g where g.chave = 'fin_cobrar_inicio'), current_date) as inicio,
           coalesce((select (g.valor #>> '{}')::numeric from fx0_parametros_geral g where g.chave = 'fin_cobrar_valor_levsoul'), 60) as levsoul,
           coalesce((select array_agg(x::bigint) from fx0_parametros_geral g, jsonb_array_elements_text(g.valor) x where g.chave = 'fin_cobrar_status'), array[2,3,4,5,208]::bigint[]) as status,
           coalesce((select array_agg(x::bigint) from fx0_parametros_geral g, jsonb_array_elements_text(g.valor) x where g.chave = 'fin_convenios_cobrados'), array[12,21,22]::bigint[]) as convenios,
           coalesce((select array_agg(x) from fx0_parametros_geral g, jsonb_array_elements_text(g.valor) x where g.chave = 'fin_regimes_aluguel'), array['aluguel_medico','nutri_aluguel']) as aluguel
  ),
  at as (
    select a.paciente_id, a.data, a.agendamento_id, a.horario,
           case when a.convenio_id = any (cfg.convenios) then cfg.levsoul else coalesce(a.valor, 0) end as valor_esp,
           case when a.convenio_id is null then 'Particular' else coalesce(c.nome, 'convênio ' || a.convenio_id) end as origem_item,
           coalesce(pr.nome, 'profissional ' || a.profissional_id) as profissional,
           coalesce(pc.nome, 'procedimento ' || a.procedimento_id) as procedimento
      from agendamentos a
      cross join cfg
      left join convenios c         on c.id = a.convenio_id
      left join rep_profissionais r on r.profissional_id = a.profissional_id
      left join profissionais pr    on pr.id = a.profissional_id
      left join procedimentos pc    on pc.id = a.procedimento_id
     where a.data >= cfg.inicio
       and a.data <= (p_agora at time zone 'America/Sao_Paulo')::date
       and a.status_id = any (cfg.status)
       and (a.convenio_id = any (cfg.convenios)
            or (a.convenio_id is null and coalesce(a.valor, 0) > 0 and coalesce(r.regime, '') <> all (cfg.aluguel)))
  ),
  grp as (
    select paciente_id, data, count(*)::integer as sessoes, sum(valor_esp) as esperado, min(horario) as primeira,
           string_agg(distinct origem_item, ' + ') as origem,
           jsonb_agg(jsonb_build_object('hora', to_char(horario, 'HH24:MI'), 'procedimento', procedimento, 'profissional', public.cob__nome(profissional),
                                        'origem', origem_item, 'valor', valor_esp) order by horario) as itens
      from at group by paciente_id, data
  ),
  ct as (
    select c.paciente_id, c.data, sum(c.valor) as lancado
      from fin_feegow_conta c where c.sumiu_em is null group by c.paciente_id, c.data
  ),
  pg as (
    select c.paciente_id, c.data, sum(p.valor) as pago,
           string_agg(distinct coalesce(f.nome, 'código ' || p.forma_pagamento), ', ') as formas
      from fin_feegow_conta c
      join fin_feegow_pagamento p on p.invoice_id = c.invoice_id and p.sumiu_em is null
      left join fin_feegow_forma f on f.codigo = p.forma_pagamento
     where c.sumiu_em is null group by c.paciente_id, c.data
  )
  select g.paciente_id || ':' || g.data as chave, g.paciente_id, g.data,
         coalesce(public.cob__nome(pa.nome), 'paciente ' || g.paciente_id) as paciente,
         g.origem, g.sessoes, g.esperado, coalesce(ct.lancado, 0), coalesce(pg.pago, 0), pg.formas,
         case when ct.paciente_id is null or coalesce(ct.lancado, 0) = 0 then 'sem_lancamento'
              when coalesce(pg.pago, 0) = 0 then 'sem_pagamento'
              when abs(coalesce(pg.pago, 0) - g.esperado) > 0.009 then 'valor_diferente'
              else 'ok' end as situacao,
         g.primeira, g.itens
    from grp g
    left join pacientes pa on pa.id = g.paciente_id
    left join ct on ct.paciente_id = g.paciente_id and ct.data = g.data
    left join pg on pg.paciente_id = g.paciente_id and pg.data = g.data
$$;
revoke all on function public.fin_cobrar_itens(timestamptz) from anon, authenticated;

-- textos
create or replace function public.fin__cobrar_sit(p text) returns text language sql immutable as $$
  select case p when 'sem_lancamento' then 'nada lançado no Feegow'
                when 'sem_pagamento'  then 'conta lançada, sem o pagamento'
                when 'valor_diferente' then 'valor pago diferente do esperado'
                else coalesce(p, '') end
$$;

-- o cron: fotografa, avisa (na chegada → rajada → de 6 em 6 h) e dá baixa ("✅ Cobrança lançada")
create or replace function public.fin_cobrar_rodada(p_agora timestamptz default now())
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_ativo boolean := coalesce((select (valor #>> '{}')::boolean from fx0_parametros_geral where chave = 'fin_cobrar_ativo'), false);
  v_regua jsonb   := coalesce((select valor from fx0_parametros_geral where chave = 'fin_cobrar_regua'), '{"rajada_min": 10, "rajada_vezes": 3, "repete_min": 360}'::jsonb);
  v_raj   integer := coalesce((v_regua ->> 'rajada_min')::integer, 10);
  v_vez   integer := coalesce((v_regua ->> 'rajada_vezes')::integer, 3);
  v_rep   integer := coalesce((v_regua ->> 'repete_min')::integer, 360);
  v_exp   boolean := public.cob__no_expediente(p_agora);
  v_local timestamp := p_agora at time zone 'America/Sao_Paulo';
  r       record;
  v_txt   text; v_rec text; v_mid bigint;
  v_novas integer := 0; v_res integer := 0; v_avi integer := 0;
begin
  -- 1. fotografa o que está aberto agora
  with i as (select * from public.fin_cobrar_itens(p_agora) where situacao <> 'ok')
  insert into public.fin_cobrar_vista (chave, paciente_id, data, situacao, apareceu_em, ultimo_visto_em)
  select i.chave, i.paciente_id, i.data, i.situacao, p_agora, p_agora from i
  on conflict (chave) do update
     set ultimo_visto_em = excluded.ultimo_visto_em,
         situacao        = excluded.situacao,
         apareceu_em     = case when fin_cobrar_vista.resolvido_em is not null then excluded.apareceu_em else fin_cobrar_vista.apareceu_em end,
         ciclo           = case when fin_cobrar_vista.resolvido_em is not null then fin_cobrar_vista.ciclo + 1 else fin_cobrar_vista.ciclo end,
         avisos          = case when fin_cobrar_vista.resolvido_em is not null then 0 else fin_cobrar_vista.avisos end,
         ultimo_aviso_em = case when fin_cobrar_vista.resolvido_em is not null then null else fin_cobrar_vista.ultimo_aviso_em end,
         ultima_msg      = case when fin_cobrar_vista.resolvido_em is not null then null else fin_cobrar_vista.ultima_msg end,
         resolvido_em    = null;
  get diagnostics v_novas = row_count;

  -- 2. baixa: estava aberta e não veio nesta foto
  for r in select v.chave, v.avisos, v.data, coalesce(public.cob__nome(pa.nome), 'paciente ' || v.paciente_id) as paciente
             from public.fin_cobrar_vista v left join pacientes pa on pa.id = v.paciente_id
            where v.resolvido_em is null and v.ultimo_visto_em < p_agora loop
    update public.fin_cobrar_vista set resolvido_em = p_agora where chave = r.chave;
    v_res := v_res + 1;
    if v_ativo and r.avisos > 0 then
      perform public.robo_telegram_fin(format('✅ Cobrança lançada · %s · %s', public.fin__html(r.paciente), to_char(r.data, 'DD/MM')), true);
    end if;
  end loop;

  -- 3. avisos (só com a chave ligada e dentro do expediente)
  if v_ativo and v_exp then
    for r in select v.chave, v.avisos, v.apareceu_em, i.*
               from public.fin_cobrar_vista v
               join public.fin_cobrar_itens(p_agora) i on i.chave = v.chave
              where v.resolvido_em is null
                and (v.avisos = 0
                     or (v.avisos <= v_vez and v.ultimo_aviso_em <= p_agora - make_interval(mins => v_raj))
                     or (v.avisos >  v_vez and v.ultimo_aviso_em <= p_agora - make_interval(mins => v_rep)))
              order by i.data, i.primeira
              limit 20 loop
      v_txt := format(E'💰 Cobrar · %s\n%s %s · %s · %s\nEsperado %s · %s%s\n⏱ %s · %s aviso',
                      public.fin__html(r.paciente),
                      case when r.data = v_local::date then 'hoje' else to_char(r.data, 'DD/MM') end,
                      to_char(r.primeira, 'HH24:MI'), public.fin__html(r.origem),
                      public.fin__html(coalesce((r.itens -> 0 ->> 'procedimento'), '') || case when r.sessoes > 1 then ' (+' || (r.sessoes - 1) || ')' else '' end
                                       || ' com ' || coalesce((r.itens -> 0 ->> 'profissional'), '')),
                      public.fin__brl(r.esperado), public.fin__cobrar_sit(r.situacao),
                      case when r.situacao = 'valor_diferente' then ' (pago ' || public.fin__brl(r.pago) || coalesce(', ' || public.fin__html(r.formas), '') || ')' else '' end,
                      case when r.avisos = 0 then 'na recepção desde ' || to_char(r.apareceu_em at time zone 'America/Sao_Paulo', 'HH24:MI')
                           else 'aberto há ' || public.cob__duracao(greatest(1, (extract(epoch from p_agora - r.apareceu_em) / 60)::integer)) end,
                      case when r.avisos = 0 then '1º' else (r.avisos + 1) || 'º' end);
      v_rec := format('Paciente %s (%s) chegou %s às %s e %s. Pode lançar no Feegow a conta com o pagamento (%s), com a forma certa? Me avisa quando lançar, por favor.',
                      r.paciente, r.origem,
                      case when r.data = v_local::date then 'hoje' else 'no dia ' || to_char(r.data, 'DD/MM') end,
                      to_char(r.primeira, 'HH24:MI'),
                      case r.situacao when 'sem_lancamento' then 'ainda não tem nada lançado'
                                      when 'sem_pagamento' then 'a conta está lançada, mas sem o pagamento'
                                      else 'o valor pago (' || public.fin__brl(r.pago) || ') não bate com o esperado' end,
                      public.fin__brl(r.esperado));
      v_mid := public.robo_telegram_fin_recado(v_txt, true, v_rec);
      update public.fin_cobrar_vista set avisos = avisos + 1, ultimo_aviso_em = p_agora, ultima_msg = v_mid where chave = r.chave;
      v_avi := v_avi + 1;
    end loop;
  end if;

  return format('%s na foto · %s resolvida(s) · %s aviso(s)%s', v_novas, v_res, v_avi,
                case when not v_ativo then ' (desligado)' when not v_exp then ' (fora do expediente)' else '' end);
end $$;
revoke all on function public.fin_cobrar_rodada(timestamptz) from anon, authenticated;

-- o que o Cortex lê (sessão do PIN, como prof_cobranca_lista)
create or replace function public.fin_cobrar_lista(p_token text)
returns jsonb
language plpgsql stable security definer set search_path = public, extensions as $$
declare
  v_ok    boolean;
  v_ativo boolean := coalesce((select (valor #>> '{}')::boolean from fx0_parametros_geral where chave = 'fin_cobrar_ativo'), false);
  v_regua jsonb   := coalesce((select valor from fx0_parametros_geral where chave = 'fin_cobrar_regua'), '{}'::jsonb);
  v_hoje  date    := (now() at time zone 'America/Sao_Paulo')::date;
begin
  select true into v_ok
    from public.loja_sessoes s
    join public.loja_usuarios u on u.id = s.usuario_id
   where s.token_hash = encode(digest(coalesce(p_token, ''), 'sha256'), 'hex')
     and s.encerrada_em is null and s.expira_em > now()
     and u.ativo and not coalesce(u.pin_trocar, false);
  if not found then return jsonb_build_object('ok', false, 'erro', 'SESSAO_INVALIDA'); end if;
  if not v_ativo then return jsonb_build_object('ok', true, 'agora', now(), 'ligado', false, 'itens', '[]'::jsonb, 'ok_hoje', '[]'::jsonb); end if;
  return jsonb_build_object(
    'ok', true, 'agora', now(), 'ligado', true, 'regua', v_regua,
    'itens', coalesce((
      select jsonb_agg(jsonb_build_object(
               'chave', i.chave, 'paciente_id', i.paciente_id, 'data', i.data, 'paciente', i.paciente, 'origem', i.origem,
               'sessoes', i.sessoes, 'esperado', i.esperado, 'lancado', i.lancado, 'pago', i.pago, 'formas', i.formas,
               'situacao', i.situacao, 'primeira', to_char(i.primeira, 'HH24:MI'), 'itens', i.itens,
               'desde', case when v.resolvido_em is null then v.apareceu_em end,
               'avisos', coalesce(v.avisos, 0),
               'mandado_por', (select m.verificado_por from public.cob_mensagens m where m.id = v.ultima_msg))
             order by (i.data = v_hoje) desc, i.data desc, i.primeira)
        from public.fin_cobrar_itens(now()) i
        left join public.fin_cobrar_vista v on v.chave = i.chave
       where i.situacao <> 'ok'), '[]'::jsonb),
    'ok_hoje', coalesce((
      select jsonb_agg(jsonb_build_object(
               'chave', i.chave, 'paciente', i.paciente, 'origem', i.origem, 'sessoes', i.sessoes,
               'primeira', to_char(i.primeira, 'HH24:MI'), 'formas', i.formas, 'itens', i.itens)
             order by i.primeira)
        from public.fin_cobrar_itens(now()) i
       where i.situacao = 'ok' and i.data = v_hoje), '[]'::jsonb));
end $$;
revoke all on function public.fin_cobrar_lista(text) from public;
grant execute on function public.fin_cobrar_lista(text) to anon, authenticated;

-- ─────────────────────────────── BLOCO 2 ───────────────────────────────
-- Rodar DEPOIS do merge do PR B. Liga o Cobrar a partir de HOJE (mude a data se quiser pegar dias anteriores),
-- põe o cron de 5 em 5 min e tira do ar o aviso antigo "atendido sem cobrança" (redundante).
update public.fx0_parametros_geral set valor = to_jsonb(current_date::text), atualizado_em = now() where chave = 'fin_cobrar_inicio';
update public.fx0_parametros_geral set valor = 'true'::jsonb, atualizado_em = now() where chave = 'fin_cobrar_ativo';
select cron.unschedule(jobid) from cron.job where jobname in ('fin-cobrar', 'fin-sem-cobranca');
select cron.schedule('fin-cobrar', '*/5 * * * *', $$select public.fin_cobrar_rodada()$$);
select public.fin_cobrar_rodada();   -- primeira foto: o acumulado de hoje entra sem avisar duas vezes (cada item avisa uma vez, na hora)
