CREATE TABLE "appGroupPermissions" (
	"app_id" varchar(64) NOT NULL,
	"group_id" varchar(64) NOT NULL,
	"permission" varchar(128) NOT NULL,
	CONSTRAINT "appGroupPermissions_app_id_group_id_permission_pk" PRIMARY KEY("app_id","group_id","permission")
);
--> statement-breakpoint
CREATE TABLE "appUserPermission" (
	"app_id" varchar(64) NOT NULL,
	"user_id" varchar(64) NOT NULL,
	"permission" varchar(128) NOT NULL,
	CONSTRAINT "appUserPermission_app_id_user_id_permission_pk" PRIMARY KEY("app_id","user_id","permission")
);
--> statement-breakpoint
ALTER TABLE "appGroupPermissions" ADD CONSTRAINT "appGroupPermissions_app_id_app_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."app"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appGroupPermissions" ADD CONSTRAINT "appGroupPermissions_group_id_group_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."group"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appUserPermission" ADD CONSTRAINT "appUserPermission_app_id_app_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."app"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appUserPermission" ADD CONSTRAINT "appUserPermission_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;