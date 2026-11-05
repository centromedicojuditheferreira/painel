-- ═══════════════════════════════════════════════════════════════════
-- GUIAS v1.0 (05/11/2026) — tela Guias do Cortex
--
-- O que faz
--   · A recepção procura um paciente (nome, carteirinha ou nº da guia) e vê as guias
--     que o sistema tem dele, com quanto RESTA em cada uma.
--   · O "restam" é o MESMO número que vai no WhatsApp da confirmação (conf_agenda_mat):
--     autorizadas − o que já está no faturamento (f0) − as sessões deste mês que o
--     paciente já fez e ainda não entraram no faturamento (falta conta, de propósito).
--     A conta de guias__regua é cópia fiel da régua do CONF (CTEs carts/regua/gap/rl1/rl2/
--     regua_liq). Conferido em 05/11/2026: 196 de 196 linhas da confirmação com o mesmo número.
--     Mudou a régua do CONF? Mude aqui também.
--   · Guia que existe no SGU e não está aqui: a recepção ACUSA (guias_acusadas). A acusação
--     some sozinha quando a guia entra no banco (coletor ou o robô de varredura). Se não
--     entrar em 2 h (chave guias_acusadas_regua), avisa no grupo "PC Robô" do Telegram;
--     quando entrar depois do aviso, manda "✅ entrou".
--
-- Segurança: tudo pelas funções cortex_guias / cortex_guia_acusar / cortex_guia_acusada_tirar,
-- que conferem a sessão do PIN (como fin_cobrar_lista). A tabela nasce fechada (RLS, sem grant).
-- Nada aqui mexe no CONF, no planejador, na f0 ou na guias_sgu.
--
-- Rodar inteiro, uma vez, no SQL Editor do Supabase.
-- ═══════════════════════════════════════════════════════════════════

-- ─────────────────────────────── 1. acusações ───────────────────────────────
create table if not exists public.guias_acusadas (
  id                 bigint generated always as identity primary key,
  numero_guia        text not null,
  paciente_id        bigint,
  paciente           text,                 -- nome no momento da acusação
  agendamento_id     bigint,               -- de onde veio (janela da Agenda), se veio
  autora             text,                 -- nome do login do Cortex
  criada_em          timestamptz not null default now(),
  entrou_em          timestamptz,          -- a guia apareceu na guias_sgu
  avisada_em         timestamptz,          -- Telegram "ainda fora" (ou silenciada com a chave desligada)
  avisada_entrou_em  timestamptz,          -- Telegram "✅ entrou" (só quando houve o aviso antes)
  tirada_em          timestamptz,          -- a recepção tirou (número errado etc.)
  tirada_por         text
);
create unique index if not exists ux_guias_acusadas_aberta
  on public.guias_acusadas (numero_guia) where entrou_em is null and tirada_em is null;
create index if not exists ix_guias_acusadas_paciente on public.guias_acusadas (paciente_id);
alter table public.guias_acusadas enable row level security;
revoke all on public.guias_acusadas from anon, authenticated;
comment on table public.guias_acusadas is
  'GUIAS v1.0. Guia que a recepção diz existir no SGU e não está na guias_sgu. Fecha sozinha (entrou_em) quando a guia entra; sem entrar em 2 h, avisa no grupo PC Robô (guias_acusadas_rodada).';

-- ─────────────────────────────── 2. chaves ───────────────────────────────
insert into public.fx0_parametros_geral (chave, valor, descricao) values
  ('guias_acusadas_ativo', 'true'::jsonb,
   'GUIAS v1.0. Liga/desliga o Telegram das guias acusadas pela recepção que não entraram no banco. false = marca como avisada sem mandar.'),
  ('guias_acusadas_regua', '{"horas": 2, "inicio": 8, "fim": 22}'::jsonb,
   'GUIAS v1.0. horas = quanto esperar a guia acusada entrar antes de avisar; inicio/fim = janela (hora de Brasília) em que o aviso pode sair. Fora da janela, espera.')
on conflict (chave) do nothing;

-- ─────────────────────────────── 3. ajudantes ───────────────────────────────
create or replace function public.cortex__sem_acento(p text)
returns text language sql immutable as $$
  select lower(translate(coalesce(p, ''),
    'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇçÑñ',
    'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNn'))
$$;

create or replace function public.cortex__cart(p text)
returns text language sql immutable as $$
  select lpad(regexp_replace(coalesce(p, ''), '[^0-9]', '', 'g'), 17, '0')
$$;

-- sessão do PIN → nome de quem está logado (null = sessão inválida)
create or replace function public.cortex__quem(p_token text)
returns text language sql stable security definer set search_path = public, extensions as $$
  select u.nome
    from public.loja_sessoes s
    join public.loja_usuarios u on u.id = s.usuario_id
   where s.token_hash = encode(digest(coalesce(p_token, ''), 'sha256'), 'hex')
     and s.encerrada_em is null and s.expira_em > now()
     and u.ativo and not coalesce(u.pin_trocar, false)
   limit 1
$$;
revoke all on function public.cortex__quem(text) from public, anon, authenticated;

-- ─────────────────────── 4. a régua (cópia fiel da do CONF) ───────────────────────
-- Uma linha por (paciente, guia, procedimento) das guias das carteirinhas dos pacientes pedidos.
-- restam = regua_liq.qt_atual da conf_agenda_mat; a_lancar = o que a régua tirou por sessões já feitas.
create or replace function public.guias__regua(p_pacientes bigint[])
returns table (paciente_id bigint, numero_guia text, codigo text, descricao text, carteirinha text,
               data_autorizacao date, validade date, autorizadas integer, no_faturamento integer,
               a_lancar integer, restam integer)
language sql stable set search_path = public as $$
  with par as (
    select coalesce((select array_agg((t.x)::bigint) from fx0_parametros_geral p, lateral jsonb_array_elements_text(p.valor) t(x)
                      where p.chave = 'status_faturaveis'), array[1,2,3,4,5,6,7,208]::bigint[]) as sts,
           coalesce((select (p.valor ->> 'local')::bigint from fx0_parametros_geral p where p.chave = 'convenios_unimed'), 2::bigint) as conv_local,
           coalesce((select (p.valor ->> 'intercambio')::bigint from fx0_parametros_geral p where p.chave = 'convenios_unimed'), 8::bigint) as conv_inter,
           (now() at time zone 'America/Sao_Paulo')::date as hoje
  ), carts as materialized (
    select cp.paciente_id, public.cortex__cart(cp.carteirinha) as cart_norm
      from carteirinhas_pacientes cp
     where coalesce(cp.carteirinha, '') <> '' and cp.paciente_id = any(p_pacientes)
     group by 1, 2
  ), regua as materialized (
    select row_number() over () as rid,
           s.numero_guia, s.codigo, s.descricao, s.carteirinha, s.qt_autorizada, s.qt_usada, s.qt_atual, s.data_autorizacao,
           public.cortex__cart(s.carteirinha) as cart_norm,
           least(s.validade_senha, coalesce(s.validade_carteirinha, s.validade_senha)) as validade_efetiva
      from fx1_saldo_guias_sgu s
     -- "= any(array(...))": o filtro desce até a guias_sgu dentro da view (sem recalcular o saldo de todas as guias)
     where lpad(regexp_replace(coalesce(s.carteirinha, ''), '[^0-9]', '', 'g'), 17, '0') = any(array(select c.cart_norm from carts c))
  ), gap as materialized (
    select ag.paciente_id,
           case when cpx.codigo in ('50000470','50001221') then 'psicologia' when cpx.codigo = '2250005103' then 'aba' else 'nutricao' end as bucket,
           ag.data
      from agendamentos ag cross join par
      join procedimentos pr on pr.id = ag.procedimento_id
      join codigos_procedimento cpx on cpx.codigo = regexp_replace(coalesce(pr.codigo, ''), '[^0-9]', '', 'g') and cpx.ativo
     where (ag.convenio_id = par.conv_local or ag.convenio_id = par.conv_inter)
       and ag.status_id = any(par.sts) and ag.paciente_id = any(p_pacientes) and ag.protegido_em is null
       and ag.data >= date_trunc('month', par.hoje)::date and ag.data < par.hoje
       and not exists (select 1 from f0_faturamento f
                        where f.paciente_id = ag.paciente_id and f.data_execucao = ag.data
                          and f.status not in ('cancelada', 'impedida')
                          and regexp_replace(coalesce(f.codigo_procedimento, ''), '[^0-9]', '', 'g') = any(
                                case when cpx.codigo in ('50000470','50001221') then array['50000470','50001221'] else array[cpx.codigo] end))
  ), gap_n as materialized (
    select g.paciente_id, g.bucket, count(*) as n from gap g group by 1, 2
  ), rl1 as (
    select c.paciente_id, g.rid, g.numero_guia, g.validade_efetiva, g.qt_atual,
           case when g.codigo in ('50000470','50001221') then 'psicologia' when g.codigo = '2250005103' then 'aba' else 'nutricao' end as bucket,
           (select count(*) from gap gp
             where gp.paciente_id = c.paciente_id
               and gp.bucket = case when g.codigo in ('50000470','50001221') then 'psicologia' when g.codigo = '2250005103' then 'aba' else 'nutricao' end
               and gp.data >= coalesce(g.data_autorizacao, gp.data) and gp.data <= g.validade_efetiva) as n_cobre
      from regua g join carts c on c.cart_norm = g.cart_norm
     where g.qt_atual > 0
  ), rl2 as (
    select r.*, coalesce(gn.n, 0) as gap_total,
           sum(least(r.qt_atual::bigint, r.n_cobre)) over (partition by r.paciente_id, r.bucket order by r.validade_efetiva, r.numero_guia) as acum
      from rl1 r left join gap_n gn on gn.paciente_id = r.paciente_id and gn.bucket = r.bucket
  ), regua_liq as (
    select r.paciente_id, r.rid,
           (r.qt_atual::numeric - (least(r.acum, r.gap_total::numeric)
                                   - least(r.acum - least(r.qt_atual::bigint, r.n_cobre)::numeric, r.gap_total::numeric)))::integer as qt_liq
      from rl2 r
  )
  select c.paciente_id, g.numero_guia, g.codigo, g.descricao, g.carteirinha, g.data_autorizacao, g.validade_efetiva,
         g.qt_autorizada, g.qt_usada,
         coalesce(g.qt_atual - l.qt_liq, 0)::integer,
         coalesce(l.qt_liq, g.qt_atual)::integer
    from regua g
    join carts c on c.cart_norm = g.cart_norm
    left join regua_liq l on l.paciente_id = c.paciente_id and l.rid = g.rid
$$;
revoke all on function public.guias__regua(bigint[]) from public, anon, authenticated;

-- uma guia em JSON (o que a tela mostra)
create or replace function public.guias__json(p_numero text, p_codigo text, p_descricao text, p_carteirinha text,
                                              p_autorizacao date, p_validade date, p_autorizadas integer, p_faturamento integer,
                                              p_a_lancar integer, p_restam integer, p_hoje date)
returns jsonb language sql stable set search_path = public as $$
  select jsonb_build_object(
    'numero', p_numero, 'codigo', p_codigo, 'descricao', p_descricao,
    'terapia', case when p_codigo in ('50000470','50001221') then 'psicologia' when p_codigo = '2250005103' then 'aba'
                    when p_codigo = '50000560' then 'nutricao' else 'outra' end,
    'convenio', case when regexp_replace(coalesce(p_carteirinha, ''), '[^0-9]', '', 'g') like
                          coalesce((select valor #>> '{}' from fx0_parametros_geral where chave = 'cad_prefixo_local'), '0178') || '%'
                     then 'Unimed Local' else 'Intercâmbio' end,
    'carteirinha', p_carteirinha, 'autorizacao', p_autorizacao, 'validade', p_validade,
    'vencida', p_validade < p_hoje, 'autorizadas', p_autorizadas, 'faturamento', p_faturamento,
    'a_lancar', p_a_lancar, 'restam', p_restam)
$$;
revoke all on function public.guias__json(text, text, text, text, date, date, integer, integer, integer, integer, date) from public, anon, authenticated;

-- acusação em JSON
create or replace function public.guias__acusada_json(a public.guias_acusadas)
returns jsonb language sql stable as $$
  select jsonb_build_object('id', a.id, 'numero', a.numero_guia, 'paciente_id', a.paciente_id, 'paciente', a.paciente,
                            'autora', a.autora, 'criada_em', a.criada_em, 'entrou_em', a.entrou_em, 'avisada_em', a.avisada_em)
$$;
revoke all on function public.guias__acusada_json(public.guias_acusadas) from public, anon, authenticated;

-- ─────────────────────────── 5. o que o Cortex lê ───────────────────────────
-- p_paciente_id preenchido = janela da Agenda (um paciente só).
-- Senão, p_termo: só números com 6 a 9 dígitos = nº da guia; 10 ou mais = carteirinha; texto (3+ letras) = nome.
create or replace function public.cortex_guias(p_token text, p_termo text default null, p_paciente_id bigint default null)
returns jsonb
language plpgsql stable security definer set search_path = public, extensions as $$
declare
  v_quem   text := public.cortex__quem(p_token);
  v_hoje   date := (now() at time zone 'America/Sao_Paulo')::date;
  v_corte  date;
  v_t      text := btrim(coalesce(p_termo, ''));
  v_dig    text;
  v_modo   text;
  v_pacs   bigint[] := '{}';
  v_carts  text[]   := '{}';     -- carteirinhas procuradas (para achar guia sem ficha)
  v_nomes  text[]   := '{}';     -- palavras do nome procurado
  v_lim    integer  := 12;
  v_mais   boolean  := false;
  v_cl     bigint   := coalesce((select (valor ->> 'local')::bigint from fx0_parametros_geral where chave = 'convenios_unimed'), 2);
  v_ci     bigint   := coalesce((select (valor ->> 'intercambio')::bigint from fx0_parametros_geral where chave = 'convenios_unimed'), 8);
  v_nums   text[];
  v_pacj   jsonb;
  v_orfas  jsonb;
  v_acus   jsonb;
begin
  if v_quem is null then return jsonb_build_object('ok', false, 'erro', 'SESSAO_INVALIDA'); end if;
  v_corte := v_hoje - 60;

  if p_paciente_id is not null then
    v_modo := 'paciente';
    v_pacs := array[p_paciente_id];
  else
    v_dig := regexp_replace(v_t, '[^0-9]', '', 'g');
    if v_t !~ '[[:alpha:]]' and length(v_dig) between 6 and 9 then
      v_modo := 'guia';
      select coalesce(array_agg(distinct public.cortex__cart(g.carteirinha)), '{}') into v_carts
        from guias_sgu g where regexp_replace(g.numero_guia, '[^0-9]', '', 'g') = v_dig;
    elsif v_t !~ '[[:alpha:]]' and length(v_dig) >= 10 then
      v_modo := 'carteirinha';
      v_carts := array[public.cortex__cart(v_dig)];
    elsif length(v_t) >= 3 then
      v_modo := 'nome';
      select coalesce(array_agg(w), '{}') into v_nomes
        from unnest(regexp_split_to_array(public.cortex__sem_acento(v_t), '\s+')) w where w <> '';
    else
      v_modo := 'curto';     -- busca vazia ou curta: só as acusações (a tela abre com elas)
    end if;

    if v_modo = 'curto' then
      null;
    elsif v_modo in ('guia', 'carteirinha') then
      select coalesce(array_agg(distinct cp.paciente_id), '{}') into v_pacs
        from carteirinhas_pacientes cp
       where coalesce(cp.carteirinha, '') <> '' and public.cortex__cart(cp.carteirinha) = any(v_carts);
    else
      -- nome: pacientes com carteirinha Unimed ou com agendamento Unimed; quem tem guia viva e consulta marcada vem primeiro
      with vivas as materialized (
        select distinct public.cortex__cart(g.carteirinha) as c from guias_sgu g where g.validade_senha >= v_hoje
      ), cand as materialized (
        select p.id, p.nome from pacientes p
         where not exists (select 1 from unnest(v_nomes) w where position(w in public.cortex__sem_acento(p.nome)) = 0)
      ), cand2 as (
        select c.id, c.nome,
               exists (select 1 from carteirinhas_pacientes cp join vivas v on v.c = public.cortex__cart(cp.carteirinha)
                        where cp.paciente_id = c.id and coalesce(cp.carteirinha, '') <> '') as tem_guia,
               exists (select 1 from agendamentos a where a.paciente_id = c.id and a.convenio_id in (v_cl, v_ci) and a.data >= v_hoje) as tem_consulta,
               (exists (select 1 from carteirinhas_pacientes cp where cp.paciente_id = c.id and cp.convenio ilike 'unimed%')
                or exists (select 1 from agendamentos a where a.paciente_id = c.id and a.convenio_id in (v_cl, v_ci))) as unimed
          from cand c
      ), ordem as (
        select id from cand2 where unimed order by tem_guia desc, tem_consulta desc, nome limit v_lim + 1
      )
      select coalesce(array_agg(id), '{}') into v_pacs from ordem;
      if coalesce(array_length(v_pacs, 1), 0) > v_lim then
        v_mais := true;
        v_pacs := v_pacs[1:v_lim];
      end if;
    end if;
  end if;

  -- pacientes, cada um com as guias (vivas + vencidas dos últimos 60 dias)
  with r as (
    select * from public.guias__regua(v_pacs)
  )
  select coalesce(jsonb_agg(x.j order by x.ord), '[]'::jsonb) into v_pacj
    from (
      select array_position(v_pacs, p.id) as ord,
             jsonb_build_object(
               'id', p.id, 'nome', p.nome,
               'carteirinhas', coalesce((select jsonb_agg(distinct cp.carteirinha) from carteirinhas_pacientes cp
                                          where cp.paciente_id = p.id and cp.convenio ilike 'unimed%'), '[]'::jsonb),
               'proxima', (select jsonb_build_object('data', a.data, 'hora', to_char(a.horario::interval, 'HH24:MI'), 'procedimento', pr.nome)
                             from agendamentos a left join procedimentos pr on pr.id = a.procedimento_id
                            where a.paciente_id = p.id and a.convenio_id in (v_cl, v_ci) and a.status_id in (1, 7)
                              and (a.data > v_hoje or (a.data = v_hoje and a.horario >= (now() at time zone 'America/Sao_Paulo')::time))
                            order by a.data, a.horario limit 1),
               'guias', coalesce((select jsonb_agg(public.guias__json(r.numero_guia, r.codigo, r.descricao, r.carteirinha, r.data_autorizacao,
                                                                      r.validade, r.autorizadas, r.no_faturamento, r.a_lancar, r.restam, v_hoje)
                                                   order by (r.validade >= v_hoje) desc, (r.restam > 0) desc,
                                                            case when r.validade >= v_hoje then r.validade end asc,
                                                            r.validade desc, r.numero_guia, r.codigo)
                                    from r where r.paciente_id = p.id
                                     and (r.validade >= v_corte or (v_modo = 'guia' and regexp_replace(r.numero_guia, '[^0-9]', '', 'g') = v_dig))),
                                 '[]'::jsonb)) as j
        from pacientes p where p.id = any(v_pacs)
    ) x;

  -- guias sem ficha: a carteirinha não está no cadastro de ninguém (só nas buscas por guia, carteirinha e nome)
  if v_modo in ('guia', 'carteirinha', 'nome') then
    -- primeiro os números (na guias_sgu, barato); depois o saldo só dessas guias (a view filtra pelo número)
    with fichas as materialized (
      select distinct public.cortex__cart(cp.carteirinha) as c from carteirinhas_pacientes cp where coalesce(cp.carteirinha, '') <> ''
    )
    select coalesce(array_agg(g.numero_guia), '{}') into v_nums
      from guias_sgu g
     where not exists (select 1 from fichas f where f.c = public.cortex__cart(g.carteirinha))
       and case v_modo
             when 'guia'        then regexp_replace(g.numero_guia, '[^0-9]', '', 'g') = v_dig
             when 'carteirinha' then public.cortex__cart(g.carteirinha) = any(v_carts)
             else not exists (select 1 from unnest(v_nomes) w where position(w in public.cortex__sem_acento(g.nome_beneficiario)) = 0)
           end;
    select coalesce(jsonb_agg(public.guias__json(s.numero_guia, s.codigo, s.descricao, s.carteirinha, s.data_autorizacao,
                                                 least(s.validade_senha, coalesce(s.validade_carteirinha, s.validade_senha)),
                                                 s.qt_autorizada, s.qt_usada, 0, s.qt_atual, v_hoje)
                              || jsonb_build_object('nome_sgu', g.nome_beneficiario)
                              order by s.validade_senha desc, s.numero_guia, s.codigo), '[]'::jsonb)
      into v_orfas
      from fx1_saldo_guias_sgu s
      join guias_sgu g on g.numero_guia = s.numero_guia
     where s.numero_guia = any(v_nums)
       and (least(s.validade_senha, coalesce(s.validade_carteirinha, s.validade_senha)) >= v_corte or v_modo = 'guia');
  else
    v_orfas := '[]'::jsonb;
  end if;

  -- acusações: do paciente (Agenda) · da busca · e, na tela, as abertas de todos + as que entraram nas últimas 24 h
  select coalesce(jsonb_agg(public.guias__acusada_json(a) order by (a.entrou_em is null) desc, coalesce(a.entrou_em, a.criada_em) desc), '[]'::jsonb)
    into v_acus
    from guias_acusadas a
   where a.tirada_em is null
     and (a.entrou_em is null or a.entrou_em > now() - interval '24 hours')
     and (case when v_modo = 'paciente' then a.paciente_id = p_paciente_id else true end);

  return jsonb_build_object('ok', true, 'modo', v_modo, 'hoje', v_hoje, 'agora', now(), 'mais', v_mais,
                            'numero', case when v_modo = 'guia' then v_dig end,
                            'pacientes', v_pacj, 'orfas', coalesce(v_orfas, '[]'::jsonb), 'acusadas', v_acus);
end $$;
revoke all on function public.cortex_guias(text, text, bigint) from public;
grant execute on function public.cortex_guias(text, text, bigint) to anon, authenticated;

-- ─────────────────────────── 6. acusar e tirar ───────────────────────────
create or replace function public.cortex_guia_acusar(p_token text, p_numero text, p_paciente_id bigint default null, p_agendamento_id bigint default null)
returns jsonb
language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  v_quem text := public.cortex__quem(p_token);
  v_num  text := regexp_replace(coalesce(p_numero, ''), '[^0-9]', '', 'g');
  v_pac  text;
  v_g    record;
  v_a    public.guias_acusadas;
begin
  if v_quem is null then return jsonb_build_object('ok', false, 'erro', 'SESSAO_INVALIDA'); end if;
  if length(v_num) not between 6 and 12 then return jsonb_build_object('ok', false, 'erro', 'NUMERO_INVALIDO'); end if;

  -- já está no banco? então o problema é a carteirinha (não está na ficha), não a guia
  select g.numero_guia, g.nome_beneficiario, g.carteirinha,
         least(g.validade_senha, coalesce(g.validade_carteirinha, g.validade_senha)) as validade,
         coalesce((select jsonb_agg(distinct jsonb_build_object('id', cp.paciente_id, 'nome', cp.paciente))
                     from carteirinhas_pacientes cp
                    where coalesce(cp.carteirinha, '') <> '' and public.cortex__cart(cp.carteirinha) = public.cortex__cart(g.carteirinha)), '[]'::jsonb) as fichas
    into v_g
    from guias_sgu g where regexp_replace(g.numero_guia, '[^0-9]', '', 'g') = v_num
   limit 1;
  if found then
    return jsonb_build_object('ok', false, 'erro', 'JA_NO_BANCO', 'guia', jsonb_build_object(
      'numero', v_g.numero_guia, 'nome_sgu', v_g.nome_beneficiario, 'carteirinha', v_g.carteirinha,
      'validade', v_g.validade, 'fichas', v_g.fichas,
      'deste_paciente', p_paciente_id is not null and v_g.fichas @> jsonb_build_array(jsonb_build_object('id', p_paciente_id))));
  end if;

  select * into v_a from guias_acusadas where numero_guia = v_num and entrou_em is null and tirada_em is null;
  if found then
    return jsonb_build_object('ok', true, 'ja', true, 'acusada', public.guias__acusada_json(v_a));
  end if;

  if p_paciente_id is not null then select nome into v_pac from pacientes where id = p_paciente_id; end if;
  insert into guias_acusadas (numero_guia, paciente_id, paciente, agendamento_id, autora)
  values (v_num, p_paciente_id, v_pac, p_agendamento_id, v_quem)
  returning * into v_a;
  return jsonb_build_object('ok', true, 'ja', false, 'acusada', public.guias__acusada_json(v_a));
end $$;
revoke all on function public.cortex_guia_acusar(text, text, bigint, bigint) from public;
grant execute on function public.cortex_guia_acusar(text, text, bigint, bigint) to anon, authenticated;

create or replace function public.cortex_guia_acusada_tirar(p_token text, p_id bigint)
returns jsonb
language plpgsql volatile security definer set search_path = public, extensions as $$
declare v_quem text := public.cortex__quem(p_token);
begin
  if v_quem is null then return jsonb_build_object('ok', false, 'erro', 'SESSAO_INVALIDA'); end if;
  update guias_acusadas set tirada_em = now(), tirada_por = v_quem
   where id = p_id and entrou_em is null and tirada_em is null;
  return jsonb_build_object('ok', found);
end $$;
revoke all on function public.cortex_guia_acusada_tirar(text, bigint) from public;
grant execute on function public.cortex_guia_acusada_tirar(text, bigint) to anon, authenticated;

-- ─────────────────────────── 7. rodada (cron, 5 em 5 min) ───────────────────────────
create or replace function public.guias_acusadas_rodada()
returns text
language plpgsql volatile security definer set search_path = public as $$
declare
  v_ativo boolean := coalesce((select (valor #>> '{}')::boolean from fx0_parametros_geral where chave = 'guias_acusadas_ativo'), true);
  v_reg   jsonb   := coalesce((select valor from fx0_parametros_geral where chave = 'guias_acusadas_regua'), '{"horas": 2, "inicio": 8, "fim": 22}'::jsonb);
  v_hora  integer := extract(hour from (now() at time zone 'America/Sao_Paulo'))::integer;
  v_pode  boolean;
  lin     record;
  n_entr  integer := 0;
  n_ok    integer := 0;
  n_av    integer := 0;
  n_mudo  integer := 0;
begin
  if not pg_try_advisory_xact_lock(hashtext('guias_acusadas_rodada')) then return 'ocupado'; end if;

  -- a) entrou no banco: fecha sozinha
  update guias_acusadas a set entrou_em = now()
   where a.entrou_em is null and a.tirada_em is null
     and exists (select 1 from guias_sgu g where regexp_replace(g.numero_guia, '[^0-9]', '', 'g') = a.numero_guia);
  get diagnostics n_entr = row_count;

  v_pode := v_hora >= coalesce((v_reg ->> 'inicio')::integer, 8) and v_hora < coalesce((v_reg ->> 'fim')::integer, 22);

  -- b) entrou depois do aviso: "✅ entrou"
  for lin in select * from guias_acusadas where entrou_em is not null and avisada_em is not null and avisada_entrou_em is null loop
    if v_ativo then
      exit when not v_pode;
      perform public.robo_telegram_pc('✅ A guia acusada pela recepção entrou no sistema' || E'\n' ||
        'Guia ' || lin.numero_guia || coalesce(' · ' || lin.paciente, '') || E'\n' ||
        'Entrou às ' || to_char(lin.entrou_em at time zone 'America/Sao_Paulo', 'HH24:MI "de" DD/MM'));
    end if;
    update guias_acusadas set avisada_entrou_em = now() where id = lin.id;
    n_ok := n_ok + 1;
  end loop;

  -- c) passou do prazo e não entrou: avisa uma vez
  for lin in select * from guias_acusadas
              where entrou_em is null and tirada_em is null and avisada_em is null
                and criada_em <= now() - make_interval(hours => coalesce((v_reg ->> 'horas')::integer, 2))
              order by criada_em loop
    if not v_ativo then
      update guias_acusadas set avisada_em = now() where id = lin.id;
      n_mudo := n_mudo + 1;
      continue;
    end if;
    exit when not v_pode;
    perform public.robo_telegram_pc('🧾 Guia acusada pela recepção e ainda fora do sistema' || E'\n' ||
      'Guia ' || lin.numero_guia || coalesce(' · ' || lin.paciente, '') || E'\n' ||
      'Acusada por ' || coalesce(lin.autora, '—') || ' em ' || to_char(lin.criada_em at time zone 'America/Sao_Paulo', 'DD/MM "às" HH24:MI') || E'\n' ||
      'O coletor do SGU não trouxe. Confira no SGU se o número existe e é deste prestador.');
    update guias_acusadas set avisada_em = now() where id = lin.id;
    n_av := n_av + 1;
  end loop;

  return format('entraram %s · "entrou" avisados %s · avisos %s · silenciados %s', n_entr, n_ok, n_av, n_mudo);
end $$;
revoke all on function public.guias_acusadas_rodada() from public, anon, authenticated;

select cron.schedule('guias-acusadas', '*/5 * * * *', $$select public.guias_acusadas_rodada()$$);

-- ─────────────────────────── conferência rápida (opcional) ───────────────────────────
-- select public.guias_acusadas_rodada();
-- select * from public.guias_acusadas order by id desc limit 20;
