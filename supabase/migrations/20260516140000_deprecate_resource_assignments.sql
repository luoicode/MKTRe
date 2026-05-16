do $$
begin
  if to_regclass('public.resource_items') is not null then
    execute 'comment on table public.resource_items is ''Deprecated: resource assignment moved to public.assets. Kept for production data compatibility; client no longer writes or reads this table.''';
  end if;

  if to_regclass('public.resource_links') is not null then
    execute 'comment on table public.resource_links is ''Deprecated: resource links moved to public.assets. Kept for production data compatibility; client no longer writes or reads this table.''';
  end if;
end $$; 

notify pgrst, 'reload schema';
