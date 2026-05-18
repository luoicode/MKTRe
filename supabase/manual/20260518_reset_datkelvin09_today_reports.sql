-- Manual production reset for a single account's reports on the current Vietnam date.
-- Purpose: allow datkelvin09@mktre.local to submit today's slot again after a test submission.
-- Safe scope: only this profile and only reports whose report_date = today in Asia/Ho_Chi_Minh.

begin;

with target_day as (
  select (now() at time zone 'Asia/Ho_Chi_Minh')::date as report_date
)
update public.slot_reports as sr
set
  status = 'draft'::public.report_status,
  submitted_at = null,
  approved_at = null,
  approved_by = null,
  rejected_reason = null,
  updated_at = now()
from public.profiles as p, target_day
where sr.user_id = p.id
  and sr.report_date = target_day.report_date
  and (
    lower(p.email) = 'datkelvin09@mktre.local'
    or lower(p.username) = 'datkelvin09'
  );

-- Verify affected rows after running.
with target_day as (
  select (now() at time zone 'Asia/Ho_Chi_Minh')::date as report_date
)
select
  sr.id,
  sr.report_date,
  rs.slot_name,
  sr.status,
  sr.submitted_at,
  sr.updated_at
from public.slot_reports as sr
join public.profiles as p on p.id = sr.user_id
left join public.report_slots as rs on rs.id = sr.slot_id
cross join target_day
where sr.report_date = target_day.report_date
  and (
    lower(p.email) = 'datkelvin09@mktre.local'
    or lower(p.username) = 'datkelvin09'
  )
order by rs.sort_order nulls last, sr.updated_at desc;

commit;
