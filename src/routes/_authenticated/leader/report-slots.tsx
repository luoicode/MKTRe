import { createFileRoute } from "@tanstack/react-router";
import { EmployeeReport } from "@/routes/_authenticated/employee/report";

export const Route = createFileRoute("/_authenticated/leader/report-slots")({
  component: EmployeeReport,
});
