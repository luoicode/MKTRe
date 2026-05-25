import type { Tables } from "@/integrations/supabase/types";

export type AppRole = "admin" | "manager" | "leader" | "employee" | "sale" | null | undefined;
export type ProfileVisibilityStatus = Pick<Tables<"profiles">, "status">;

export function canSeeInactiveProfiles(role: AppRole) {
  return role === "admin";
}

export function isActiveProfile(profile: ProfileVisibilityStatus | null | undefined) {
  return profile?.status === "active";
}

export function filterVisibleProfiles<T extends ProfileVisibilityStatus>(
  profiles: T[],
  role: AppRole,
) {
  return canSeeInactiveProfiles(role) ? profiles : profiles.filter(isActiveProfile);
}

export function filterVisibleProfileIds<T extends ProfileVisibilityStatus & { id: string }>(
  profiles: T[],
  role: AppRole,
) {
  return new Set(filterVisibleProfiles(profiles, role).map((profile) => profile.id));
}
