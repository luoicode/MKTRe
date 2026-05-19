import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type WorkspacePageHeaderProps = {
  icon?: ReactNode;
  title: string;
  subtitle?: ReactNode;
  badge?: ReactNode;
  actions?: ReactNode;
  rightContent?: ReactNode;
  children?: ReactNode;
  className?: string;
  contentClassName?: string;
};

export function WorkspacePageHeader({
  icon,
  title,
  subtitle,
  badge,
  actions,
  rightContent,
  children,
  className,
  contentClassName,
}: WorkspacePageHeaderProps) {
  const hasRightContent = Boolean(badge || actions || rightContent);

  return (
    <section
      className={cn("shrink-0 rounded-3xl border bg-background/95 p-4 shadow-sm md:p-5", className)}
    >
      <div
        className={cn(
          "flex min-h-[72px] flex-col gap-4 md:flex-row md:items-center md:justify-between",
          contentClassName,
        )}
      >
        <div className="flex min-w-0 items-center gap-3">
          {icon ? (
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              {icon}
            </div>
          ) : null}
          <div className="min-w-0">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <h1 className="truncate text-2xl font-bold tracking-tight text-foreground">
                {title}
              </h1>
              {badge}
            </div>
            {subtitle ? <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p> : null}
          </div>
        </div>

        {hasRightContent ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2 md:justify-end">
            {rightContent}
            {actions}
          </div>
        ) : null}
      </div>
      {children ? <div className="mt-4">{children}</div> : null}
    </section>
  );
}
