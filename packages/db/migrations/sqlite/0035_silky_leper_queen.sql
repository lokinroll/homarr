CREATE TABLE `appGroupPermissions` (
	`app_id` text NOT NULL,
	`group_id` text NOT NULL,
	`permission` text NOT NULL,
	PRIMARY KEY(`app_id`, `group_id`, `permission`),
	FOREIGN KEY (`app_id`) REFERENCES `app`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`group_id`) REFERENCES `group`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `appUserPermission` (
	`app_id` text NOT NULL,
	`user_id` text NOT NULL,
	`permission` text NOT NULL,
	PRIMARY KEY(`app_id`, `user_id`, `permission`),
	FOREIGN KEY (`app_id`) REFERENCES `app`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
