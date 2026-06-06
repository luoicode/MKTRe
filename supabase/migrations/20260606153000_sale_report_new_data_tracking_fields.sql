ALTER TABLE public.sale_reports
  ADD COLUMN IF NOT EXISTS new_data_reach_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS new_data_zalo_friend_count integer NOT NULL DEFAULT 0;
