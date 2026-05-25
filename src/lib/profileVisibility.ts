import type { Tables } from "@/integrations/supabase/types";
import { isAdminRole, type AppRole } from "@/lib/roles";

export type ProfileVisibilityStatus = Pick<Tables<"profiles">, "status">;

export function canSeeInactiveProfiles(role: AppRole | null | undefined) {
  return isAdminRole(role);
}

export function isActiveProfile(profile: ProfileVisibilityStatus | null | undefined) {
  return profile?.status === "active";
}

export function filterVisibleProfiles<T extends ProfileVisibilityStatus>(
  profiles: T[],
  role: AppRole | null | undefined,
) {
  return canSeeInactiveProfiles(role) ? profiles : profiles.filter(isActiveProfile);
}

export function filterVisibleProfileIds<T extends ProfileVisibilityStatus & { id: string }>(
  profiles: T[],
  role: AppRole | null | undefined,
) {
  return new Set(filterVisibleProfiles(profiles, role).map((profile) => profile.id));
}
