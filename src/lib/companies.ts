export const COMPANY_OPTIONS = ["DASNOTRI-01"] as const;

export type CompanyName = (typeof COMPANY_OPTIONS)[number];

export const DEFAULT_COMPANY_NAME: CompanyName = COMPANY_OPTIONS[0];
