import { TRPCError } from "@trpc/server";
import { z } from "zod/v4";

import type { Session } from "@homarr/auth";
import { createId } from "@homarr/common";
import type { Database, InferSelectModel } from "@homarr/db";
import { asc, eq, inArray, like, and, handleTransactionsAsync } from "@homarr/db";
import { apps, groupPermissions, appUserPermissions, appGroupPermissions } from "@homarr/db/schema";
import { selectAppSchema } from "@homarr/db/validationSchemas";
import { getIconForName } from "@homarr/icons";
import { appCreateManySchema, appEditSchema, appManageSchema, appSavePermissionsSchema } from "@homarr/validation/app";
import { byIdSchema, paginatedSchema } from "@homarr/validation/common";
import { getPermissionsWithParents } from "@homarr/definitions";

import { convertIntersectionToZodObject } from "../schema-merger";
import { createTRPCRouter, permissionRequiredProcedure, protectedProcedure, publicProcedure } from "../trpc";
import { AppAccessControl } from "./app/app-access-control";
import { throwIfActionForbiddenAsync } from "./app/app-access";

const defaultIcon = "https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons@master/svg/homarr.svg";

export const appRouter = createTRPCRouter({
  getPaginated: protectedProcedure
    .input(paginatedSchema)
    .output(z.object({ items: z.array(selectAppSchema), totalCount: z.number() }))
    .meta({ openapi: { method: "GET", path: "/api/apps/paginated", tags: ["apps"], protect: true } })
    .query(async ({ input, ctx }) => {
      const accessControl = new AppAccessControl(ctx.db, ctx.session?.user ?? null);
      const visibleAppIds = await accessControl.getVisibleAppIdsAsync();
      const visibilityWhere = visibleAppIds === null ? undefined : inArray(apps.id, visibleAppIds.length > 0 ? visibleAppIds : [""]);
      
      const searchWhere = input.search ? like(apps.name, `%${input.search.trim()}%`) : undefined;
      const whereQuery = searchWhere ? (visibilityWhere ? and(searchWhere, visibilityWhere) : searchWhere) : visibilityWhere;

      const totalCount = await ctx.db.$count(apps, whereQuery);

      const dbApps = await ctx.db.query.apps.findMany({
        limit: input.pageSize,
        offset: (input.page - 1) * input.pageSize,
        where: whereQuery,
        orderBy: asc(apps.name),
      });

      return {
        items: dbApps,
        totalCount,
      };
    }),
  all: protectedProcedure
    .input(z.void())
    .output(z.array(selectAppSchema))
    .meta({ openapi: { method: "GET", path: "/api/apps", tags: ["apps"], protect: true } })
    .query(async ({ ctx }) => {
      const accessControl = new AppAccessControl(ctx.db, ctx.session?.user ?? null);
      const visibleAppIds = await accessControl.getVisibleAppIdsAsync();
      const visibilityWhere = visibleAppIds === null ? undefined : inArray(apps.id, visibleAppIds.length > 0 ? visibleAppIds : [""]);

      return ctx.db.query.apps.findMany({
        where: visibilityWhere,
        orderBy: asc(apps.name),
      });
    }),
  search: protectedProcedure
    .input(z.object({ query: z.string(), limit: z.number().min(1).max(100).default(10) }))
    .output(z.array(selectAppSchema))
    .meta({ openapi: { method: "GET", path: "/api/apps/search", tags: ["apps"], protect: true } })
    .query(async ({ ctx, input }) => {
      const accessControl = new AppAccessControl(ctx.db, ctx.session?.user ?? null);
      const visibleAppIds = await accessControl.getVisibleAppIdsAsync();
      const visibilityWhere = visibleAppIds === null ? undefined : inArray(apps.id, visibleAppIds.length > 0 ? visibleAppIds : [""]);

      const searchWhere = like(apps.name, `%${input.query}%`);
      const whereQuery = visibilityWhere ? and(searchWhere, visibilityWhere) : searchWhere;

      return ctx.db.query.apps.findMany({
        where: whereQuery,
        orderBy: asc(apps.name),
        limit: input.limit,
      });
    }),
  selectable: protectedProcedure
    .input(z.void())
    .output(
      z.array(
        selectAppSchema.pick({ id: true, name: true, iconUrl: true, href: true, pingUrl: true, description: true }),
      ),
    )
    .meta({
      openapi: {
        method: "GET",
        path: "/api/apps/selectable",
        tags: ["apps"],
        protect: true,
      },
    })
    .query(async ({ ctx }) => {
      const accessControl = new AppAccessControl(ctx.db, ctx.session?.user ?? null);
      const visibleAppIds = await accessControl.getVisibleAppIdsAsync();
      const visibilityWhere = visibleAppIds === null ? undefined : inArray(apps.id, visibleAppIds.length > 0 ? visibleAppIds : [""]);

      return ctx.db.query.apps.findMany({
        where: visibilityWhere,
        columns: {
          id: true,
          name: true,
          iconUrl: true,
          description: true,
          href: true,
          pingUrl: true,
        },
        orderBy: asc(apps.name),
      });
    }),
  byId: publicProcedure
    .input(byIdSchema)
    .output(selectAppSchema)
    .meta({ openapi: { method: "GET", path: "/api/apps/{id}", tags: ["apps"], protect: true } })
    .query(async ({ ctx, input }) => {
      const repository = new AppRepository(ctx.db, ctx.session?.user ?? null);
      const app = await repository.getByIdAsync(input.id);

      if (!app) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "App not found",
        });
      }

      return app;
    }),
  byIds: publicProcedure.input(z.array(z.string())).query(async ({ ctx, input }) => {
    const repository = new AppRepository(ctx.db, ctx.session?.user ?? null);
    return await repository.getByIdsAsync(input);
  }),
  create: permissionRequiredProcedure
    .requiresPermission("app-create")
    .input(appManageSchema)
    .output(z.object({ appId: z.string() }).and(selectAppSchema))
    .meta({ openapi: { method: "POST", path: "/api/apps", tags: ["apps"], protect: true } })
    .mutation(async ({ ctx, input }) => {
      const id = createId();
      const insertValues = {
        id,
        name: input.name,
        description: input.description,
        iconUrl: input.iconUrl,
        href: input.href,
        pingUrl: input.pingUrl === "" ? null : input.pingUrl,
      };
      await ctx.db.insert(apps).values(insertValues);

      // TODO: breaking change necessary for removing appId property
      return { appId: id, ...insertValues };
    }),
  createMany: permissionRequiredProcedure
    .requiresPermission("app-create")
    .input(appCreateManySchema)
    .output(z.void())
    .mutation(async ({ ctx, input }) => {
      await ctx.db.insert(apps).values(
        input.map((app) => ({
          id: createId(),
          name: app.name,
          description: app.description,
          iconUrl: app.iconUrl ?? getIconForName(ctx.db, app.name).sync()?.url ?? defaultIcon,
          href: app.href,
        })),
      );
    }),
  update: permissionRequiredProcedure
    .requiresPermission("app-modify-all")
    .input(convertIntersectionToZodObject(appEditSchema))
    .output(z.void())
    .meta({ openapi: { method: "PATCH", path: "/api/apps/{id}", tags: ["apps"], protect: true } })
    .mutation(async ({ ctx, input }) => {
      const app = await ctx.db.query.apps.findFirst({
        where: eq(apps.id, input.id),
      });

      if (!app) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "App not found",
        });
      }

      await ctx.db
        .update(apps)
        .set({
          name: input.name,
          description: input.description,
          iconUrl: input.iconUrl,
          href: input.href,
          pingUrl: input.pingUrl === "" ? null : input.pingUrl,
        })
        .where(eq(apps.id, input.id));
    }),
  delete: permissionRequiredProcedure
    .requiresPermission("app-full-all")
    .output(z.void())
    .meta({ openapi: { method: "DELETE", path: "/api/apps/{id}", tags: ["apps"], protect: true } })
    .input(byIdSchema)
    .mutation(async ({ ctx, input }) => {
      await ctx.db.delete(apps).where(eq(apps.id, input.id));
    }),
  getAppPermissions: protectedProcedure.input(byIdSchema).query(async ({ input, ctx }) => {
    await throwIfActionForbiddenAsync(ctx, eq(apps.id, input.id), "full");

    const dbGroupPermissions = await ctx.db.query.groupPermissions.findMany({
      where: inArray(
        groupPermissions.permission,
        getPermissionsWithParents(["app-use-all", "app-full-all"]),
      ),
      columns: {
        groupId: false,
      },
      with: {
        group: {
          columns: {
            id: true,
            name: true,
          },
        },
      },
    });

    const userPermissions = await ctx.db.query.appUserPermissions.findMany({
      where: eq(appUserPermissions.appId, input.id),
      with: {
        user: {
          columns: {
            id: true,
            name: true,
            image: true,
            email: true,
          },
        },
      },
    });

    const dbGroupAppPermission = await ctx.db.query.appGroupPermissions.findMany({
      where: eq(appGroupPermissions.appId, input.id),
      with: {
        group: {
          columns: {
            id: true,
            name: true,
          },
        },
      },
    });

    return {
      inherited: dbGroupPermissions.sort((permissionA, permissionB) => {
        return permissionA.group.name.localeCompare(permissionB.group.name);
      }),
      users: userPermissions
        .map(({ user, permission }) => ({
          user,
          permission,
        }))
        .sort((permissionA, permissionB) => {
          return (permissionA.user.name ?? "").localeCompare(permissionB.user.name ?? "");
        }),
      groups: dbGroupAppPermission
        .map(({ group, permission }) => ({
          group: {
            id: group.id,
            name: group.name,
          },
          permission,
        }))
        .sort((permissionA, permissionB) => {
          return permissionA.group.name.localeCompare(permissionB.group.name);
        }),
    };
  }),
  saveUserAppPermissions: protectedProcedure
    .input(appSavePermissionsSchema)
    .mutation(async ({ input, ctx }) => {
      await throwIfActionForbiddenAsync(ctx, eq(apps.id, input.entityId), "full");

      await handleTransactionsAsync(ctx.db, {
        async handleAsync(db, schema) {
          await ctx.db.transaction(async (transaction) => {
            await transaction
              .delete(schema.appUserPermissions)
              .where(eq(schema.appUserPermissions.appId, input.entityId));
            if (input.permissions.length === 0) {
              return;
            }
            await transaction.insert(schema.appUserPermissions).values(
              input.permissions.map((permission) => ({
                userId: permission.principalId,
                permission: permission.permission,
                appId: input.entityId,
              })),
            );
          });
        },
        handleSync(db) {
          db.transaction((transaction) => {
            transaction
              .delete(appUserPermissions)
              .where(eq(appUserPermissions.appId, input.entityId))
              .run();
            if (input.permissions.length === 0) {
              return;
            }
            transaction
              .insert(appUserPermissions)
              .values(
                input.permissions.map((permission) => ({
                  userId: permission.principalId,
                  permission: permission.permission,
                  appId: input.entityId,
                })),
              )
              .run();
          });
        },
      });
    }),
  saveGroupAppPermissions: protectedProcedure
    .input(appSavePermissionsSchema)
    .mutation(async ({ input, ctx }) => {
      await throwIfActionForbiddenAsync(ctx, eq(apps.id, input.entityId), "full");

      await handleTransactionsAsync(ctx.db, {
        async handleAsync(db, schema) {
          await db.transaction(async (transaction) => {
            await transaction
              .delete(schema.appGroupPermissions)
              .where(eq(schema.appGroupPermissions.appId, input.entityId));
            if (input.permissions.length === 0) {
              return;
            }
            await transaction.insert(schema.appGroupPermissions).values(
              input.permissions.map((permission) => ({
                groupId: permission.principalId,
                permission: permission.permission,
                appId: input.entityId,
              })),
            );
          });
        },
        handleSync(db) {
          db.transaction((transaction) => {
            transaction
              .delete(appGroupPermissions)
              .where(eq(appGroupPermissions.appId, input.entityId))
              .run();
            if (input.permissions.length === 0) {
              return;
            }
            transaction
              .insert(appGroupPermissions)
              .values(
                input.permissions.map((permission) => ({
                  groupId: permission.principalId,
                  permission: permission.permission,
                  appId: input.entityId,
                })),
              )
              .run();
          });
        },
      });
    }),
});

type App = InferSelectModel<typeof apps>;

export class AppRepository {
  private readonly accessControl: AppAccessControl;

  constructor(
    private db: Database,
    user: Session["user"] | null,
  ) {
    this.accessControl = new AppAccessControl(db, user);
  }

  public async getByIdAsync(id: string): Promise<App | null> {
    const apps = await this.getByIdsAsync([id]);
    return apps[0] ?? null;
  }

  public async getByIdsAsync(ids: string[]): Promise<App[]> {
    const canUserSeeApps = await this.accessControl.canUserSeeAppsAsync(ids);
    const dbApps = await this.db.query.apps.findMany({
      where: inArray(apps.id, ids),
    });

    return canUserSeeApps ? dbApps : [];
  }
}
