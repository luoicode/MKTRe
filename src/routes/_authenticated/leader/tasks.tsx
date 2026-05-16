import { createFileRoute } from "@tanstack/react-router";
import { TasksWorkspace } from "@/components/workspace/TasksWorkspace";

export const Route = createFileRoute("/_authenticated/leader/tasks")({ component: TasksWorkspace });
