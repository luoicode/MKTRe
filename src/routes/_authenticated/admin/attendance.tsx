import { createFileRoute } from "@tanstack/react-router";
import { AttendanceWorkspace } from "@/components/workspace/AttendanceWorkspace";

export const Route = createFileRoute("/_authenticated/admin/attendance")({
  component: AttendanceWorkspace,
});
