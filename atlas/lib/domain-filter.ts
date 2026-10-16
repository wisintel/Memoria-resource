export const allDomainsFilterValue = "__all_domains__";
export const noDomainFilterValue = "__no_domain__";

export function isAllDomainsFilter(value: string | null | undefined) {
  return value === allDomainsFilterValue;
}
