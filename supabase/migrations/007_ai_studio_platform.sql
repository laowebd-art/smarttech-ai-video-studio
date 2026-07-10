-- ============================================================================
-- AI Studio platform layer: the AI Router's provider catalog/config, plus
-- schema groundwork for multi-provider capabilities, organizations,
-- billing, and API keys — laid down now so future modules are additive,
-- not a rewrite. Only provider_configs is actually read by running code
-- today (server/lib/router/router.ts); the rest is intentionally schema-only
-- until their corresponding modules are built.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- ai_providers — catalog of every provider the platform knows about,
-- independent of whether an adapter is implemented yet. Informational;
-- server/lib/adapters/registerAdapters.ts is the actual source of truth for
-- what's callable right now. This table is what a future Admin Panel /
-- Settings "AI Providers" page would list and let an admin enable/disable.
-- ---------------------------------------------------------------------------
create table if not exists public.ai_providers (
  id uuid primary key default uuid_generate_v4(),
  slug text not null unique,            -- matches ProviderAdapter.providerName, e.g. 'openai', 'elevenlabs', 'kling'
  display_name text not null,
  category text not null,               -- matches a Capability value, informational grouping
  status text not null default 'planned' check (status in ('active', 'planned', 'disabled')),
  website_url text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- provider_configs — the AI Router reads this table directly. One row per
-- (capability, provider) pair. Lower priority number = tried first. Disabled
-- rows are skipped. If no rows exist for a capability, the router falls back
-- to adapter registration order, so the app works before this is seeded.
-- ---------------------------------------------------------------------------
create table if not exists public.provider_configs (
  id uuid primary key default uuid_generate_v4(),
  capability text not null,
  provider_name text not null,
  priority int not null default 100,
  enabled boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (capability, provider_name)
);

drop trigger if exists trg_provider_configs_updated_at on public.provider_configs;
create trigger trg_provider_configs_updated_at before update on public.provider_configs
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- organizations — groundwork for multi-user/enterprise accounts. The app is
-- still functionally single-owner today (see profiles); these tables let
-- that grow into shared workspaces later without a schema migration blocking it.
-- ---------------------------------------------------------------------------
create table if not exists public.organizations (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'admin', 'member')),
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

-- ---------------------------------------------------------------------------
-- subscriptions / credits — billing groundwork only. No Stripe/payment
-- integration exists yet; these tables exist so a future Billing module
-- doesn't need a schema migration to ship, and so `credits.balance` can be
-- checked/decremented by a future usage-gating layer without redesigning
-- ai_usage_logs (Phase 2) or render_jobs (Phase 5), which remain the actual
-- source of truth for what happened.
-- ---------------------------------------------------------------------------
create table if not exists public.subscriptions (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  plan text not null default 'free' check (plan in ('free', 'personal', 'business', 'enterprise')),
  status text not null default 'active' check (status in ('active', 'past_due', 'canceled', 'trialing')),
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_subscriptions_updated_at on public.subscriptions;
create trigger trg_subscriptions_updated_at before update on public.subscriptions
  for each row execute function public.set_updated_at();

create table if not exists public.credits (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  balance numeric(12, 2) not null default 0,
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_credits_updated_at on public.credits;
create trigger trg_credits_updated_at before update on public.credits
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- api_keys — for a future "API Keys" module letting a user call this
-- platform's own API programmatically (distinct from provider keys, which
-- are server secrets and never touch this table). Only a hash is ever
-- stored; the full key is shown once at creation time and never again.
-- ---------------------------------------------------------------------------
create table if not exists public.api_keys (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  key_prefix text not null,   -- first 8 chars, shown in the UI for identification
  key_hash text not null,     -- sha256 of the full key — never store plaintext
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.ai_providers enable row level security;
alter table public.provider_configs enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.subscriptions enable row level security;
alter table public.credits enable row level security;
alter table public.api_keys enable row level security;

-- Provider catalog/config is platform-level, read-only from the client side.
-- Writes happen via seed files or a future service-role-only admin tool —
-- there is intentionally no insert/update/delete policy for authenticated users.
create policy "ai_providers_select_all" on public.ai_providers
  for select using (true);
create policy "provider_configs_select_all" on public.provider_configs
  for select using (true);

create policy "organizations_select_member" on public.organizations
  for select using (
    owner_id = auth.uid() or exists (
      select 1 from public.organization_members m where m.organization_id = organizations.id and m.user_id = auth.uid()
    )
  );
create policy "organizations_insert_own" on public.organizations
  for insert with check (owner_id = auth.uid());
create policy "organizations_update_owner" on public.organizations
  for update using (owner_id = auth.uid());
create policy "organizations_delete_owner" on public.organizations
  for delete using (owner_id = auth.uid());

create policy "organization_members_select_own" on public.organization_members
  for select using (
    user_id = auth.uid() or exists (
      select 1 from public.organizations o where o.id = organization_members.organization_id and o.owner_id = auth.uid()
    )
  );

create policy "subscriptions_select_own" on public.subscriptions
  for select using (user_id = auth.uid());

create policy "credits_select_own" on public.credits
  for select using (user_id = auth.uid());

create policy "api_keys_select_own" on public.api_keys
  for select using (user_id = auth.uid());
create policy "api_keys_insert_own" on public.api_keys
  for insert with check (user_id = auth.uid());
create policy "api_keys_update_own" on public.api_keys
  for update using (user_id = auth.uid());
create policy "api_keys_delete_own" on public.api_keys
  for delete using (user_id = auth.uid());
