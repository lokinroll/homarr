import type { Session } from "@homarr/auth";
import { constructIntegrationPermissions } from "@homarr/auth/shared";
import type { Database } from "@homarr/db";
import { eq, inArray, or } from "@homarr/db";
import {
  groupMembers,
  integrationGroupPermissions,
  integrations,
  integrationUserPermissions,
  items,
} from "@homarr/db/schema";

export class IntegrationAccessControl {
  constructor(
    private db: Database,
    private user: Session["user"] | null,
  ) {}

  async canUserSeeIntegrationAsync(integrationId: string) {
    return await this.canUserSeeIntegrationsAsync([integrationId]);
  }

  async canUserSeeIntegrationsAsync(integrationIds: string[]) {
    if (integrationIds.length === 0) return true;

    if (this.user) {
      if (
        this.user.permissions.includes("integration-full-all") ||
        this.user.permissions.includes("integration-use-all") ||
        this.user.permissions.includes("admin")
      ) {
        return true;
      }

      const groupsOfCurrentUser = await this.db.query.groupMembers.findMany({
        where: eq(groupMembers.userId, this.user.id),
      });

      const dbIntegrations = await this.db.query.integrations.findMany({
        where: inArray(integrations.id, integrationIds),
        with: {
          userPermissions: {
            where: eq(integrationUserPermissions.userId, this.user.id),
          },
          groupPermissions: {
            where: inArray(
              integrationGroupPermissions.groupId,
              groupsOfCurrentUser.map((group) => group.groupId).concat(""),
            ),
          },
        },
      });

      const publicIntegrationIds = await this.getAllIntegrationIdsOnPublicBoardsAsync();

      return integrationIds.every((integrationId) => {
        const integration = dbIntegrations.find((i) => i.id === integrationId);
        if (integration) {
          const permissions = constructIntegrationPermissions(integration, { user: this.user } as Session);
          if (permissions.hasUseAccess) {
            return true;
          }
        }

        return publicIntegrationIds.includes(integrationId);
      });
    }

    const integrationIdsOnPublicBoards = await this.getAllIntegrationIdsOnPublicBoardsAsync();
    return integrationIds.every((integrationId) => integrationIdsOnPublicBoards.includes(integrationId));
  }

  async getVisibleIntegrationIdsAsync(): Promise<string[] | null> {
    if (this.user) {
      if (
        this.user.permissions.includes("integration-full-all") ||
        this.user.permissions.includes("integration-use-all") ||
        this.user.permissions.includes("admin")
      ) {
        return null;
      }

      const groupsOfCurrentUser = await this.db.query.groupMembers.findMany({
        where: eq(groupMembers.userId, this.user.id),
      });

      const userIntegrations = await this.db.query.integrationUserPermissions.findMany({
        where: eq(integrationUserPermissions.userId, this.user.id),
      });

      const groupIntegrations = await this.db.query.integrationGroupPermissions.findMany({
        where: inArray(
          integrationGroupPermissions.groupId,
          groupsOfCurrentUser.map((group) => group.groupId).concat(""),
        ),
      });

      const publicBoardIntegrations = await this.getAllIntegrationIdsOnPublicBoardsAsync();

      const visibleIds = new Set([
        ...userIntegrations.map((p) => p.integrationId),
        ...groupIntegrations.map((p) => p.integrationId),
        ...publicBoardIntegrations,
      ]);

      return Array.from(visibleIds);
    }

    return await this.getAllIntegrationIdsOnPublicBoardsAsync();
  }

  private async getAllIntegrationIdsOnPublicBoardsAsync() {
    const itemsWithIntegrations = await this.db.query.items.findMany({
      where: or(eq(items.kind, "app"), eq(items.kind, "bookmarks")), // bookmarks might have integrations too? No, mostly widgets.
      with: {
        board: {
          columns: {
            isPublic: true,
          },
        },
        integrations: true,
      },
    });

    return itemsWithIntegrations
      .filter((item) => item.board.isPublic)
      .flatMap((item) => item.integrations.map((integration) => integration.integrationId));
  }
}
