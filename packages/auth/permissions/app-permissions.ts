import type { Session } from "next-auth";

import type { AppPermission } from "@homarr/definitions";

export interface AppPermissionsProps {
  userPermissions: {
    permission: AppPermission;
  }[];
  groupPermissions: {
    permission: AppPermission;
  }[];
}

export const constructAppPermissions = (app: AppPermissionsProps, session: Session | null) => {
  const permissions = app.userPermissions
    .concat(app.groupPermissions)
    .map(({ permission }) => permission);

  return {
    hasFullAccess:
      (session?.user.permissions.includes("app-full-all") ?? false) ||
      (session?.user.permissions.includes("admin") ?? false) ||
      permissions.includes("full"),
    hasUseAccess:
      permissions.length >= 1 ||
      (session?.user.permissions.includes("app-use-all") ?? false) ||
      (session?.user.permissions.includes("admin") ?? false),
  };
};
