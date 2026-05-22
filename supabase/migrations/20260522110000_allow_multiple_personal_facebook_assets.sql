-- Allow users to create more than one personal Facebook asset.
-- Older environments may have had a broad owner/type uniqueness guard; keep only the fixed-asset guard.

alter table public.assets drop constraint if exists assets_owner_profile_id_asset_type_key;
alter table public.assets drop constraint if exists assets_owner_profile_asset_type_key;

drop index if exists public.assets_owner_profile_id_asset_type_key;
drop index if exists public.idx_assets_owner_profile_asset_type;
drop index if exists public.idx_assets_personal_user_type;

create unique index if not exists idx_assets_fixed_user_type
  on public.assets(owner_profile_id, asset_type)
  where asset_group = 'fixed';
