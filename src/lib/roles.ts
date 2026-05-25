export const APP_ROLES = {
  ADMIN: "admin",
  MANAGER: "manager",
  MARKETING_LEADER: "leader",
  MARKETING_EMPLOYEE: "employee",
  SALE: "sale",
  SALE_LEADER: "leader_sale",
} as const;

export type AppRole = (typeof APP_ROLES)[keyof typeof APP_ROLES];

export const ADMIN_ROLES = [APP_ROLES.ADMIN] as const;
export const MANAGEMENT_ROLES = [APP_ROLES.ADMIN, APP_ROLES.MANAGER] as const;
export const MARKETING_ROLES = [APP_ROLES.MARKETING_LEADER, APP_ROLES.MARKETING_EMPLOYEE] as const;
export const SALE_ROLES = [APP_ROLES.SALE, APP_ROLES.SALE_LEADER] as const;
export const LEADER_ROLES = [APP_ROLES.MARKETING_LEADER, APP_ROLES.SALE_LEADER] as const;
export const TEAM_MANAGER_ROLES = [
  APP_ROLES.ADMIN,
  APP_ROLES.MANAGER,
  APP_ROLES.MARKETING_LEADER,
  APP_ROLES.SALE_LEADER,
] as const;

export const ROLE_LABELS: Record<AppRole, string> = {
  admin: "Admin",
  manager: "Trưởng phòng Marketing",
  leader: "Leader Marketing",
  employee: "Nhân viên Marketing",
  sale: "Nhân viên Sale",
  leader_sale: "Leader Sale",
};

export const ROLE_HOME_PATH: Record<AppRole, string> = {
  admin: "/admin/dashboard",
  manager: "/manager/dashboard",
  leader: "/leader/dashboard",
  employee: "/employee/dashboard",
  sale: "/sale/dashboard",
  leader_sale: "/sale/dashboard",
};

export const ROLE_BASE_PATH: Record<AppRole, string> = {
  admin: "/admin",
  manager: "/manager",
  leader: "/leader",
  employee: "/employee",
  sale: "/sale",
  leader_sale: "/sale",
};

export const ROLE_PROFILE_PATH: Record<AppRole, string> = {
  admin: "/admin/profile",
  manager: "/manager/profile",
  leader: "/leader/profile",
  employee: "/employee/profile",
  sale: "/sale/profile",
  leader_sale: "/sale/profile",
};

export function isAppRole(role: string | null | undefined): role is AppRole {
  return Object.values(APP_ROLES).includes(role as AppRole);
}

export function isAdminRole(role: string | null | undefined): role is "admin" {
  return role === APP_ROLES.ADMIN;
}

export function isManagementRole(role: string | null | undefined) {
  return role === APP_ROLES.ADMIN || role === APP_ROLES.MANAGER;
}

export function isMarketingRole(role: string | null | undefined) {
  return role === APP_ROLES.MARKETING_LEADER || role === APP_ROLES.MARKETING_EMPLOYEE;
}

export function isSaleRole(role: string | null | undefined) {
  return role === APP_ROLES.SALE || role === APP_ROLES.SALE_LEADER;
}

export function isLeaderRole(role: string | null | undefined) {
  return role === APP_ROLES.MARKETING_LEADER || role === APP_ROLES.SALE_LEADER;
}

export function canManageTeam(role: string | null | undefined) {
  return isManagementRole(role) || isLeaderRole(role);
}

export function canViewAllFloatingLeads(role: string | null | undefined) {
  return isManagementRole(role);
}

export function getRoleHomePath(role: AppRole) {
  return ROLE_HOME_PATH[role];
}

export function getRoleBasePath(role: AppRole) {
  return ROLE_BASE_PATH[role];
}

export function getRoleProfilePath(role: AppRole) {
  return ROLE_PROFILE_PATH[role];
}
