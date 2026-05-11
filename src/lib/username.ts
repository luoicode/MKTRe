// Convert internal username -> synthetic email used by Supabase Auth.
export function usernameToEmail(username: string): string {
  const sanitized = username.toLowerCase().trim().replace(/[^a-z0-9._-]/g, "_");
  return `${sanitized}@msrs.local`;
}
