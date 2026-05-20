import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

export function PageShell({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex min-h-0 w-full min-w-0 flex-col gap-3 md:h-full md:overflow-hidden lg:gap-4",
        className,
      )}
      {...props}
    />
  );
}

export function PageHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("shrink-0 rounded-2xl border bg-background/95 p-3 shadow-sm md:p-4", className)}
      {...props}
    />
  );
}

export function PageContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("min-h-0 flex-1 min-w-0", className)} {...props} />;
}

export function ScrollArea({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement> & { children?: ReactNode }) {
  return (
    <div
      className={cn(
        "min-h-0 min-w-0 flex-1 overflow-visible md:overflow-y-auto md:overflow-x-hidden",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
