// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import {
  bigint,
  boolean,
  index,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const systemRoleEnum = pgEnum("system_role", ["admin", "user"]);

export const repositoryMemberRoleEnum = pgEnum("repository_member_role", [
  "guest",
  "developer",
  "maintainer",
  "admin",
]);

export const anonymousPullOverrideEnum = pgEnum("anonymous_pull_override", [
  "inherit",
  "allow",
  "deny",
]);

export const pullCounterScopeEnum = pgEnum("pull_counter_scope", [
  "tag",
  "image",
  "repository",
]);

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  passwordHash: text("password_hash"),
  oidcIssuer: varchar("oidc_issuer", { length: 512 }),
  oidcSub: varchar("oidc_sub", { length: 255 }),
  systemRole: systemRoleEnum("system_role").notNull().default("user"),
  mustChangePassword: boolean("must_change_password").notNull().default(false),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const repositories = pgTable("repositories", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 255 }).notNull().unique(),
  isPublic: boolean("is_public").notNull().default(false),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const repositoryMembers = pgTable(
  "repository_members",
  {
    repositoryId: uuid("repository_id")
      .notNull()
      .references(() => repositories.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: repositoryMemberRoleEnum("role").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.repositoryId, table.userId] }),
  }),
);

export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
});

export const passwordResetTokens = pgTable(
  "password_reset_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    tokenHashIdx: index("password_reset_tokens_token_hash_idx").on(
      table.tokenHash,
    ),
  }),
);

export const userInvites = pgTable("user_invites", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: varchar("email", { length: 255 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  systemRole: systemRoleEnum("system_role").notNull().default("user"),
  tokenHash: text("token_hash").notNull(),
  invitedBy: uuid("invited_by")
    .notNull()
    .references(() => users.id),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const repositoryInvites = pgTable("repository_invites", {
  id: uuid("id").primaryKey().defaultRandom(),
  repositoryId: uuid("repository_id")
    .notNull()
    .references(() => repositories.id, { onDelete: "cascade" }),
  email: varchar("email", { length: 255 }).notNull(),
  role: repositoryMemberRoleEnum("role").notNull(),
  invitedBy: uuid("invited_by")
    .notNull()
    .references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
});

export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => users.id),
    repositoryId: uuid("repository_id").references(() => repositories.id, {
      onDelete: "set null",
    }),
    action: varchar("action", { length: 255 }).notNull(),
    resource: text("resource").notNull(),
    metadata: jsonb("metadata"),
    clientIp: varchar("client_ip", { length: 45 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    createdAtIdx: index("audit_log_created_at_idx").on(table.createdAt),
    repositoryCreatedAtIdx: index("audit_log_repository_created_at_idx").on(
      table.repositoryId,
      table.createdAt,
    ),
    actionIdx: index("audit_log_action_idx").on(table.action),
  }),
);

export const imageSettings = pgTable(
  "image_settings",
  {
    repositoryId: uuid("repository_id")
      .notNull()
      .references(() => repositories.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    anonymousPull: anonymousPullOverrideEnum("anonymous_pull")
      .notNull()
      .default("inherit"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.repositoryId, table.name] }),
  }),
);

export const pullEvents = pgTable(
  "pull_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    repositoryId: uuid("repository_id")
      .notNull()
      .references(() => repositories.id, { onDelete: "cascade" }),
    imageName: varchar("image_name", { length: 255 }).notNull(),
    tagReference: varchar("tag_reference", { length: 255 }),
    digest: varchar("digest", { length: 255 }).notNull(),
    userId: uuid("user_id").references(() => users.id),
    anonymous: boolean("anonymous").notNull().default(false),
    pulledAt: timestamp("pulled_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    repositoryImageTagIdx: index("pull_events_repository_image_tag_idx").on(
      table.repositoryId,
      table.imageName,
      table.tagReference,
    ),
    repositoryImageDigestPulledAtIdx: index(
      "pull_events_repository_image_digest_pulled_at_idx",
    ).on(table.repositoryId, table.imageName, table.digest, table.pulledAt),
    repositoryDigestPulledAtIdx: index(
      "pull_events_repository_digest_pulled_at_idx",
    ).on(table.repositoryId, table.digest, table.pulledAt),
  }),
);

export const pullCounters = pgTable(
  "pull_counters",
  {
    repositoryId: uuid("repository_id")
      .notNull()
      .references(() => repositories.id, { onDelete: "cascade" }),
    scope: pullCounterScopeEnum("scope").notNull(),
    imageName: varchar("image_name", { length: 255 }).notNull().default(""),
    tagReference: varchar("tag_reference", { length: 255 }).notNull().default(""),
    count: bigint("count", { mode: "number" }).notNull().default(0),
  },
  (table) => ({
    pk: primaryKey({
      columns: [
        table.repositoryId,
        table.scope,
        table.imageName,
        table.tagReference,
      ],
    }),
  }),
);
