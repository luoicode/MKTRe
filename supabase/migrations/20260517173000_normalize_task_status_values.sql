DO $$
DECLARE
  v_data_type text;
BEGIN
  SELECT data_type
  INTO v_data_type
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'tasks'
    AND column_name = 'status';

  IF v_data_type IS NULL THEN
    RETURN;
  END IF;

  IF v_data_type = 'USER-DEFINED' THEN
    UPDATE public.tasks
    SET status = (
      CASE
        WHEN lower(trim(status::text)) IN ('in_progress', 'doing', 'started', 'processing', 'process', 'dang_lam', 'đang làm', 'da_lam', 'đã làm') THEN 'in_progress'
        WHEN lower(trim(status::text)) IN ('pending_review', 'review', 'dang_duyet', 'đang duyệt', 'cho_duyet', 'chờ duyệt', 'waiting_review') THEN 'pending_review'
        WHEN lower(trim(status::text)) IN ('done', 'completed', 'complete', 'hoan_thanh', 'hoàn thành', 'finished') THEN 'done'
        ELSE 'todo'
      END
    )::public.task_status
    WHERE status::text NOT IN ('todo', 'in_progress', 'pending_review', 'done');
  ELSE
    UPDATE public.tasks
    SET status = CASE
      WHEN lower(trim(status::text)) IN ('in_progress', 'doing', 'started', 'processing', 'process', 'dang_lam', 'đang làm', 'da_lam', 'đã làm') THEN 'in_progress'
      WHEN lower(trim(status::text)) IN ('pending_review', 'review', 'dang_duyet', 'đang duyệt', 'cho_duyet', 'chờ duyệt', 'waiting_review') THEN 'pending_review'
      WHEN lower(trim(status::text)) IN ('done', 'completed', 'complete', 'hoan_thanh', 'hoàn thành', 'finished') THEN 'done'
      ELSE 'todo'
    END
    WHERE status IS NULL
       OR status::text NOT IN ('todo', 'in_progress', 'pending_review', 'done');
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
