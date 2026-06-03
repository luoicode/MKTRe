import { createFileRoute } from "@tanstack/react-router";
import { TasksWorkspace } from "@/components/workspace/TasksWorkspace";

export const Route = createFileRoute("/_authenticated/sale/tasks")({
  component: () => <TasksWorkspace department="sale" />,
});
