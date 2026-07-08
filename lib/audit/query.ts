// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  ilike,
  lte,
  or,
} from "drizzle-orm";

import { AUDIT_ACTIONS } from "@/lib/audit/actions";
import { getDb } from "@/lib/db";
import { auditLog, users } from "@/lib/db/schema";

export type AuditLogSort =
  | "created_at_asc"
  | "created_at_desc"
  | "action_asc"
  | "action_desc"
  | "actor_asc"
  | "actor_desc"
  | "resource_asc"
  | "resource_desc";

export type AuditLogQuery = {
  page?: number;
  pageSize?: number;
  sort?: AuditLogSort;
  search?: string;
  action?: string;
  actor?: string;
  resource?: string;
  from?: string;
  to?: string;
  repositoryId?: string;
};

export type AuditLogEntry = {
  id: string;
  createdAt: string;
  action: string;
  resource: string;
  clientIp: string | null;
  metadata: Record<string, unknown> | null;
  actor: {
    userId: string | null;
    email: string | null;
    name: string | null;
  };
  repositoryId: string | null;
};

export type AuditLogListResponse = {
  entries: AuditLogEntry[];
  total: number;
  page: number;
  pageSize: number;
  actions: string[];
};

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;
const VALID_SORTS = new Set<AuditLogSort>([
  "created_at_asc",
  "created_at_desc",
  "action_asc",
  "action_desc",
  "actor_asc",
  "actor_desc",
  "resource_asc",
  "resource_desc",
]);

export function parseAuditLogQuery(
  searchParams: URLSearchParams,
): AuditLogQuery {
  const page = Math.max(1, Number.parseInt(searchParams.get("page") ?? "1", 10) || 1);
  const rawPageSize = Number.parseInt(searchParams.get("pageSize") ?? "", 10);
  const pageSize = Number.isFinite(rawPageSize)
    ? Math.min(MAX_PAGE_SIZE, Math.max(1, rawPageSize))
    : DEFAULT_PAGE_SIZE;

  const sortParam = searchParams.get("sort") ?? "created_at_desc";
  const sort = VALID_SORTS.has(sortParam as AuditLogSort)
    ? (sortParam as AuditLogSort)
    : "created_at_desc";

  const search = searchParams.get("search")?.trim() || undefined;
  const action = searchParams.get("action")?.trim() || undefined;
  const actor = searchParams.get("actor")?.trim() || undefined;
  const resource = searchParams.get("resource")?.trim() || undefined;
  const from = searchParams.get("from")?.trim() || undefined;
  const to = searchParams.get("to")?.trim() || undefined;

  return { page, pageSize, sort, search, action, actor, resource, from, to };
}

function buildWhereConditions(query: AuditLogQuery) {
  const conditions = [];

  if (query.repositoryId) {
    conditions.push(eq(auditLog.repositoryId, query.repositoryId));
  }

  if (query.action) {
    conditions.push(eq(auditLog.action, query.action));
  }

  if (query.actor) {
    const pattern = `%${query.actor}%`;
    conditions.push(
      or(ilike(users.email, pattern), ilike(users.name, pattern))!,
    );
  }

  if (query.resource) {
    conditions.push(ilike(auditLog.resource, `%${query.resource}%`));
  }

  if (query.search) {
    const pattern = `%${query.search}%`;
    conditions.push(
      or(
        ilike(auditLog.action, pattern),
        ilike(auditLog.resource, pattern),
        ilike(users.email, pattern),
        ilike(users.name, pattern),
      )!,
    );
  }

  if (query.from) {
    const fromDate = new Date(query.from);
    if (!Number.isNaN(fromDate.getTime())) {
      conditions.push(gte(auditLog.createdAt, fromDate));
    }
  }

  if (query.to) {
    const toDate = new Date(query.to);
    if (!Number.isNaN(toDate.getTime())) {
      conditions.push(lte(auditLog.createdAt, toDate));
    }
  }

  return conditions.length > 0 ? and(...conditions) : undefined;
}

function buildOrderBy(sort: AuditLogSort) {
  switch (sort) {
    case "created_at_asc":
      return asc(auditLog.createdAt);
    case "action_asc":
      return asc(auditLog.action);
    case "action_desc":
      return desc(auditLog.action);
    case "actor_asc":
      return asc(users.email);
    case "actor_desc":
      return desc(users.email);
    case "resource_asc":
      return asc(auditLog.resource);
    case "resource_desc":
      return desc(auditLog.resource);
    case "created_at_desc":
    default:
      return desc(auditLog.createdAt);
  }
}

function toEntry(row: {
  id: string;
  createdAt: Date;
  action: string;
  resource: string;
  clientIp: string | null;
  metadata: unknown;
  repositoryId: string | null;
  userId: string | null;
  actorEmail: string | null;
  actorName: string | null;
}): AuditLogEntry {
  return {
    id: row.id,
    createdAt: row.createdAt.toISOString(),
    action: row.action,
    resource: row.resource,
    clientIp: row.clientIp,
    metadata:
      row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
        ? (row.metadata as Record<string, unknown>)
        : null,
    repositoryId: row.repositoryId,
    actor: {
      userId: row.userId,
      email: row.actorEmail,
      name: row.actorName,
    },
  };
}

export async function listAuditLog(
  query: AuditLogQuery,
): Promise<AuditLogListResponse> {
  const db = getDb();
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
  const sort = query.sort ?? "created_at_desc";
  const where = buildWhereConditions(query);
  const offset = (page - 1) * pageSize;

  const baseQuery = db
    .select({
      id: auditLog.id,
      createdAt: auditLog.createdAt,
      action: auditLog.action,
      resource: auditLog.resource,
      clientIp: auditLog.clientIp,
      metadata: auditLog.metadata,
      repositoryId: auditLog.repositoryId,
      userId: auditLog.userId,
      actorEmail: users.email,
      actorName: users.name,
    })
    .from(auditLog)
    .leftJoin(users, eq(auditLog.userId, users.id));

  const countQuery = db
    .select({ total: count() })
    .from(auditLog)
    .leftJoin(users, eq(auditLog.userId, users.id));

  const [rows, [countRow], actionRows] = await Promise.all([
    baseQuery
      .where(where)
      .orderBy(buildOrderBy(sort))
      .limit(pageSize)
      .offset(offset),
    countQuery.where(where),
    listDistinctActions(query.repositoryId),
  ]);

  return {
    entries: rows.map(toEntry),
    total: countRow?.total ?? 0,
    page,
    pageSize,
    actions: actionRows,
  };
}

async function listDistinctActions(repositoryId?: string): Promise<string[]> {
  const db = getDb();

  if (repositoryId) {
    const rows = await db
      .selectDistinct({ action: auditLog.action })
      .from(auditLog)
      .where(eq(auditLog.repositoryId, repositoryId))
      .orderBy(asc(auditLog.action));

    return rows.map((row) => row.action);
  }

  return [...AUDIT_ACTIONS];
}

export async function listRepositoryAuditActions(
  repositoryId: string,
): Promise<string[]> {
  return listDistinctActions(repositoryId);
}
