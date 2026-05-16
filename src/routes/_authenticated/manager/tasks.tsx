import { createFileRoute } from "@tanstack/react-router";
import { TasksWorkspace } from "@/components/workspace/TasksWorkspace";

export const Route = createFileRoute("/_authenticated/manager/tasks")({
  component: TasksWorkspace,
});
