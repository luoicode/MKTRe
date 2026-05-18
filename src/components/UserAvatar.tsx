import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

const SOFT_BACKGROUNDS = [
  "bg-sky-100 text-sky-700",
  "bg-emerald-100 text-emerald-700",
  "bg-violet-100 text-violet-700",
  "bg-amber-100 text-amber-700",
  "bg-rose-100 text-rose-700",
  "bg-indigo-100 text-indigo-700",
];

export function UserAvatar({
  name,
  avatarUrl,
  size = 40,
  className,
}: {
  name: string | null | undefined;
  avatarUrl?: string | null;
  size?: number;
  className?: string;
}) {
  const displayName = name?.trim() || "User";
  const background = SOFT_BACKGROUNDS[hashName(displayName) % SOFT_BACKGROUNDS.length];
  const src = avatarUrl?.trim();

  return (
    <Avatar
      className={cn("shrink-0 overflow-hidden rounded-full border", className)}
      style={{ width: size, height: size }}
    >
      {src ? (
        <AvatarImage src={src} alt={displayName} className="h-full w-full object-cover" />
      ) : null}
      <AvatarFallback className={cn("text-xs font-bold uppercase", background)}>
        {getInitials(displayName)}
      </AvatarFallback>
    </Avatar>
  );
}

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "U";
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return `${first}${last}`.toUpperCase();
}

function hashName(name: string) {
  return Array.from(name).reduce((sum, char) => sum + char.charCodeAt(0), 0);
}
