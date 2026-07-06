// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { eq } from "drizzle-orm";

import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";

export type OidcProfile = {
  issuer: string;
  sub: string;
  email: string;
  name: string;
  emailVerified: boolean;
};

export async function upsertOidcUser(profile: OidcProfile) {
  const db = getDb();
  const normalizedEmail = profile.email.trim().toLowerCase();

  const [existingBySub] = await db
    .select()
    .from(users)
    .where(eq(users.oidcSub, profile.sub))
    .limit(1);

  if (existingBySub) {
    const [updated] = await db
      .update(users)
      .set({
        email: normalizedEmail,
        name: profile.name,
        oidcIssuer: profile.issuer,
      })
      .where(eq(users.id, existingBySub.id))
      .returning();

    return updated ?? existingBySub;
  }

  const [existingByEmail] = await db
    .select()
    .from(users)
    .where(eq(users.email, normalizedEmail))
    .limit(1);

  if (existingByEmail) {
    const [updated] = await db
      .update(users)
      .set({
        name: profile.name,
        oidcIssuer: profile.issuer,
        oidcSub: profile.sub,
      })
      .where(eq(users.id, existingByEmail.id))
      .returning();

    return updated ?? existingByEmail;
  }

  const [created] = await db
    .insert(users)
    .values({
      email: normalizedEmail,
      name: profile.name,
      oidcIssuer: profile.issuer,
      oidcSub: profile.sub,
      systemRole: "user",
    })
    .returning();

  if (!created) {
    throw new Error("Failed to create OIDC user");
  }

  return created;
}
