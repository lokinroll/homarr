import { TRPCError } from "@trpc/server";

import type { Session } from "@homarr/auth";
import { constructAppPermissions } from "@homarr/auth/shared";
import type { Database, SQL } from "@homarr/db";
import { eq, inArray } from "@homarr/db";
import { groupMembers, appGroupPermissions, appUserPermissions } from "@homarr/db/schema";
import type { AppPermission } from "@homarr/definitions";

export const throwIfActionForbiddenAsync = async (
  ctx: { db: Database; session: Session | null },
  appWhere: SQL<unknown>,
  permission: AppPermission,
) => {
  const { db, session } = ctx;
  const groupsOfCurrentUser = await db.query.groupMembers.findMany({
    where: eq(groupMembers.userId, session?.user.id ?? ""),
  });
  const app = await db.query.apps.findFirst({
    where: appWhere,
    columns: {
      id: true,
    },
    with: {
      userPermissions: {
        where: eq(appUserPermissions.userId, session?.user.id ?? ""),
      },
      groupPermissions: {
        where: inArray(
          appGroupPermissions.groupId,
          groupsOfCurrentUser.map((group) => group.groupId).concat(""),
        ),
      },
    },
  });

  if (!app) {
    notAllowed();
  }

  const { hasUseAccess, hasFullAccess } = constructAppPermissions(app, session);

  if (hasFullAccess) {
    return; // As full access is required and user has full access, allow
  }

  if (permission === "use" && hasUseAccess) {
    return; // As use access is required and user has use access, allow
  }

  notAllowed();
};

function notAllowed(): never {
  throw new TRPCError({
    code: "NOT_FOUND",
    message: "App not found",
  });
}
