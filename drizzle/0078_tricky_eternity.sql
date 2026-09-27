PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_invitation` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`email` text NOT NULL,
	`role` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`inviter_id` text NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`inviter_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "invitation_role_domain" CHECK("__new_invitation"."role" is null or "__new_invitation"."role" in ('owner', 'admin', 'editor', 'viewer', 'member')),
	CONSTRAINT "invitation_status_domain" CHECK("__new_invitation"."status" in ('pending', 'accepted', 'revoked', 'canceled', 'rejected'))
);
--> statement-breakpoint
INSERT INTO `__new_invitation`("id", "organization_id", "email", "role", "status", "expires_at", "created_at", "inviter_id") SELECT "id", "organization_id", "email", "role", "status", "expires_at", "created_at", "inviter_id" FROM `invitation`;--> statement-breakpoint
DROP TABLE `invitation`;--> statement-breakpoint
ALTER TABLE `__new_invitation` RENAME TO `invitation`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `invitation_organizationId_idx` ON `invitation` (`organization_id`);--> statement-breakpoint
CREATE INDEX `invitation_email_idx` ON `invitation` (`email`);--> statement-breakpoint
CREATE TABLE `__new_member` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text DEFAULT 'member' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "member_role_domain" CHECK("__new_member"."role" in ('owner', 'admin', 'editor', 'viewer', 'member'))
);
--> statement-breakpoint
INSERT INTO `__new_member`("id", "organization_id", "user_id", "role", "created_at") SELECT "id", "organization_id", "user_id", "role", "created_at" FROM `member`;--> statement-breakpoint
DROP TABLE `member`;--> statement-breakpoint
ALTER TABLE `__new_member` RENAME TO `member`;--> statement-breakpoint
CREATE INDEX `member_organizationId_idx` ON `member` (`organization_id`);--> statement-breakpoint
CREATE INDEX `member_userId_idx` ON `member` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `member_workspace_user_uidx` ON `member` (`organization_id`,`user_id`);--> statement-breakpoint
CREATE TABLE `__new_workspace_configuration` (
	`organization_id` text PRIMARY KEY NOT NULL,
	`payer_organization_id` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`payer_organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "workspace_status_domain" CHECK("__new_workspace_configuration"."status" in ('active', 'suspended'))
);
--> statement-breakpoint
INSERT INTO `__new_workspace_configuration`("organization_id", "payer_organization_id", "status") SELECT "organization_id", "payer_organization_id", "status" FROM `workspace_configuration`;--> statement-breakpoint
DROP TABLE `workspace_configuration`;--> statement-breakpoint
ALTER TABLE `__new_workspace_configuration` RENAME TO `workspace_configuration`;