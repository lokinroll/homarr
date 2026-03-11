import SuperJSON from "superjson";

import type { Session } from "@homarr/auth";
import { constructAppPermissions } from "@homarr/auth/shared";
import type { Database } from "@homarr/db";
import { eq, inArray, or } from "@homarr/db";
import { appGroupPermissions, apps, appUserPermissions, groupMembers, items } from "@homarr/db/schema";

import type { WidgetComponentProps } from "../../../../widgets/src";

export class AppAccessControl {
  constructor(
    private db: Database,
    private user: Session["user"] | null,
  ) {}

  async canUserSeeAppAsync(appId: string) {
    return await this.canUserSeeAppsAsync([appId]);
  }

  async canUserSeeAppsAsync(appIds: string[]) {
    if (appIds.length === 0) return true;

    if (this.user) {
      if (
        this.user.permissions.includes("app-full-all") ||
        this.user.permissions.includes("app-use-all") ||
        this.user.permissions.includes("admin")
      ) {
        return true;
      }

      const groupsOfCurrentUser = await this.db.query.groupMembers.findMany({
        where: eq(groupMembers.userId, this.user.id),
      });

      const dbApps = await this.db.query.apps.findMany({
        where: inArray(apps.id, appIds),
        with: {
          userPermissions: {
            where: eq(appUserPermissions.userId, this.user.id),
          },
          groupPermissions: {
            where: inArray(
              appGroupPermissions.groupId,
              groupsOfCurrentUser.map((group) => group.groupId).concat(""),
            ),
          },
        },
      });

      const publicAppIds = await this.getAllAppIdsOnPublicBoardsAsync();

      return appIds.every((appId) => {
        const app = dbApps.find((a) => a.id === appId);
        if (app) {
          const permissions = constructAppPermissions(app, { user: this.user } as Session);
          if (permissions.hasUseAccess) {
            return true;
          }
        }

        return publicAppIds.includes(appId);
      });
    }

    const appIdsOnPublicBoards = await this.getAllAppIdsOnPublicBoardsAsync();
    return appIds.every((appId) => appIdsOnPublicBoards.includes(appId));
  }

  async getVisibleAppIdsAsync(): Promise<string[] | null> {
    if (this.user) {
      if (
        this.user.permissions.includes("app-full-all") ||
        this.user.permissions.includes("app-use-all") ||
        this.user.permissions.includes("admin")
      ) {
        return null;
      }

      const groupsOfCurrentUser = await this.db.query.groupMembers.findMany({
        where: eq(groupMembers.userId, this.user.id),
      });

      const userApps = await this.db.query.appUserPermissions.findMany({
        where: eq(appUserPermissions.userId, this.user.id),
      });

      const groupApps = await this.db.query.appGroupPermissions.findMany({
        where: inArray(
          appGroupPermissions.groupId,
          groupsOfCurrentUser.map((group) => group.groupId).concat(""),
        ),
      });

      const publicBoardApps = await this.getAllAppIdsOnPublicBoardsAsync();

      const visibleIds = new Set([
        ...userApps.map((p) => p.appId),
        ...groupApps.map((p) => p.appId),
        ...publicBoardApps,
      ]);

      return Array.from(visibleIds);
    }

    return await this.getAllAppIdsOnPublicBoardsAsync();
  }

  private async getAllAppIdsOnPublicBoardsAsync() {
    const itemsWithApps = await this.db.query.items.findMany({
      where: or(eq(items.kind, "app"), eq(items.kind, "bookmarks")),
      with: {
        board: {
          columns: {
            isPublic: true,
          },
        },
      },
    });

    return itemsWithApps
      .filter((item) => item.board.isPublic)
      .flatMap((item) => {
        try {
          if (item.kind === "app") {
            const parsedOptions = SuperJSON.parse<WidgetComponentProps<"app">["options"]>(item.options);
            return [parsedOptions.appId];
          }

          const parsedOptions = SuperJSON.parse<WidgetComponentProps<"bookmarks">["options"]>(item.options);
          return parsedOptions.items;
        } catch {
          return [];
        }
      })
      .filter((id): id is string => id !== null);
  }
}
