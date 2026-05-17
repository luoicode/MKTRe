-- Manual reset for test dashboard/report/KPI data.
-- Run this in Supabase SQL Editor only when you intentionally want to clear
-- all report and KPI test data for every user.
--
-- This does NOT delete users, roles, teams, assets, tasks, onboarding, or profile data.

begin;

-- Remove stale report/KPI notifications first. These rows are not part of dashboard
-- calculation, but would otherwise point to deleted report/KPI test data.
delete from public.notifications
where type in (
  'report_slot_due',
  'report_slot_overdue',
  'report_missing',
  'kpi_low',
  'kpi_team_low',
  'kpi_system',
  'kpi_personal',
  'kpi_assigned'
)
or entity_type in ('report', 'slot_report', 'kpi');

-- report_audit_logs and slot_report_attachments reference slot_reports with
-- ON DELETE CASCADE, so deleting slot_reports clears the related audit/attachment rows.
delete from public.slot_reports;

-- Reset KPI targets used by Dashboard/KPI pages.
delete from public.kpi_targets;

notify pgrst, 'reload schema';

commit;
