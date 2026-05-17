import { createFileRoute } from "@tanstack/react-router";
import { PersonalReportsWorkspace } from "@/components/workspace/PersonalReportsWorkspace";

export const Route = createFileRoute("/_authenticated/employee/reports")({
  component: PersonalReportsWorkspace,
});
