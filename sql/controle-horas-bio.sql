-- CONTROLE DE HORAS: biometria do celular (WebAuthn / passkey). O app nunca recebe digital nem rosto: guarda só a chave PÚBLICA gerada pelo aparelho.
create table if not exists public.horas_credenciais (
  id text primary key,                      -- credentialId (base64url)
  funcionario_id text not null,
  funcionario_nome text,
  public_key jsonb not null,                -- JWK P-256 (ES256)
  counter bigint not null default 0,
  rp_id text,
  aparelho text,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  ultimo_uso timestamptz
);
create index if not exists horas_cred_func on public.horas_credenciais (funcionario_id) where ativo;
alter table public.horas_credenciais enable row level security;
revoke all on public.horas_credenciais from public, anon, authenticated;
alter table public.horas_batidas add column if not exists bio boolean not null default false;
alter table public.horas_batidas add column if not exists credencial text;
update public.horas_config set payload = (payload - 'cafeConta' - 'cafeMinutos') || '{"biometria":true}'::jsonb where id = 'config';
