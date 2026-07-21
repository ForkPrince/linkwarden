import { prisma } from "@linkwarden/prisma";

export const PG_SEARCH_ENABLED = process.env.SEARCH_PROVIDER === "postgresql";

const PAGINATION_TAKE_COUNT = Number(process.env.PAGINATION_TAKE_COUNT) || 50;

export async function searchLinksWithPg({
  generalQuery,
  tokens,
  userId,
  publicOnly,
  collectionId,
  tagId,
  pinnedOnly,
  sortField,
  sortDirection,
  cursor,
}: {
  generalQuery: string;
  tokens: { field: string; value: string; isNegative: boolean }[];
  userId?: number;
  publicOnly?: boolean;
  collectionId?: number;
  tagId?: number;
  pinnedOnly?: boolean;
  sortField: string;
  sortDirection: "asc" | "desc";
  cursor?: number;
}) {
  const limit = PAGINATION_TAKE_COUNT;
  const offset = cursor || 0;

  const conditions: string[] = [];
  const params: any[] = [];
  let paramIndex = 1;

  if (generalQuery) {
    conditions.push(
      `(l.search_vector @@ plainto_tsquery('english', $${paramIndex}) OR EXISTS (SELECT 1 FROM "_LinkToTag" ltt JOIN "Tag" t ON t.id = ltt."B" WHERE ltt."A" = l.id AND to_tsvector('english', t.name) @@ plainto_tsquery('english', $${paramIndex})))`
    );
    params.push(generalQuery);
    paramIndex++;
  }

  if (publicOnly) {
    conditions.push(`c."isPublic" = true`);
  } else if (userId) {
    conditions.push(
      `(c."ownerId" = $${paramIndex} OR EXISTS (SELECT 1 FROM "UsersAndCollections" uac WHERE uac."collectionId" = l."collectionId" AND uac."userId" = $${paramIndex}))`
    );
    params.push(userId);
    paramIndex++;
  }

  if (collectionId) {
    conditions.push(`l."collectionId" = $${paramIndex}`);
    params.push(collectionId);
    paramIndex++;
  }

  if (tagId) {
    conditions.push(
      `EXISTS (SELECT 1 FROM "_LinkToTag" ltt WHERE ltt."A" = l.id AND ltt."B" = $${paramIndex})`
    );
    params.push(tagId);
    paramIndex++;
  }

  if (pinnedOnly && userId) {
    conditions.push(
      `EXISTS (SELECT 1 FROM "_PinnedLinks" pl WHERE pl."A" = l.id AND pl."B" = $${paramIndex})`
    );
    params.push(userId);
    paramIndex++;
  }

  for (const { field, value, isNegative } of tokens) {
    switch (field) {
      case "url":
        conditions.push(
          isNegative
            ? `l."url" IS DISTINCT FROM $${paramIndex}`
            : `l."url" = $${paramIndex}`
        );
        params.push(value);
        paramIndex++;
        break;

      case "name":
        conditions.push(
          isNegative
            ? `l."name" IS DISTINCT FROM $${paramIndex}`
            : `l."name" = $${paramIndex}`
        );
        params.push(value);
        paramIndex++;
        break;

      case "description":
        conditions.push(
          isNegative
            ? `l."description" IS DISTINCT FROM $${paramIndex}`
            : `l."description" = $${paramIndex}`
        );
        params.push(value);
        paramIndex++;
        break;

      case "type":
        conditions.push(
          isNegative
            ? `l."type" IS DISTINCT FROM $${paramIndex}`
            : `l."type" = $${paramIndex}`
        );
        params.push(value);
        paramIndex++;
        break;

      case "collection":
        conditions.push(
          isNegative
            ? `c."name" IS DISTINCT FROM $${paramIndex}`
            : `c."name" = $${paramIndex}`
        );
        params.push(value);
        paramIndex++;
        break;

      case "pinned":
        if (value === "true") {
          conditions.push(
            isNegative
              ? `NOT EXISTS (SELECT 1 FROM "_PinnedLinks" pl WHERE pl."A" = l.id AND pl."B" = $${paramIndex})`
              : `EXISTS (SELECT 1 FROM "_PinnedLinks" pl WHERE pl."A" = l.id AND pl."B" = $${paramIndex})`
          );
          params.push(userId);
          paramIndex++;
        } else if (value === "false") {
          conditions.push(
            isNegative
              ? `EXISTS (SELECT 1 FROM "_PinnedLinks" pl WHERE pl."A" = l.id AND pl."B" = $${paramIndex})`
              : `NOT EXISTS (SELECT 1 FROM "_PinnedLinks" pl WHERE pl."A" = l.id AND pl."B" = $${paramIndex})`
          );
          params.push(userId);
          paramIndex++;
        }
        break;

      case "public":
        if (value === "true") {
          conditions.push(
            isNegative
              ? `c."isPublic" = false`
              : `c."isPublic" = true`
          );
        }
        break;

      case "before":
        if (!isNaN(Date.parse(value))) {
          const ts = new Date(value).toISOString();
          conditions.push(
            isNegative
              ? `l."createdAt" >= $${paramIndex}::timestamp`
              : `l."createdAt" < $${paramIndex}::timestamp`
          );
          params.push(ts);
          paramIndex++;
        }
        break;

      case "after":
        if (!isNaN(Date.parse(value))) {
          const ts = new Date(value).toISOString();
          conditions.push(
            isNegative
              ? `l."createdAt" <= $${paramIndex}::timestamp`
              : `l."createdAt" > $${paramIndex}::timestamp`
          );
          params.push(ts);
          paramIndex++;
        }
        break;

      case "tag":
        conditions.push(
          isNegative
            ? `NOT EXISTS (SELECT 1 FROM "_LinkToTag" ltt2 JOIN "Tag" t2 ON t2.id = ltt2."B" WHERE ltt2."A" = l.id AND t2."name" = $${paramIndex})`
            : `EXISTS (SELECT 1 FROM "_LinkToTag" ltt2 JOIN "Tag" t2 ON t2.id = ltt2."B" WHERE ltt2."A" = l.id AND t2."name" = $${paramIndex})`
        );
        params.push(value);
        paramIndex++;
        break;
    }
  }

  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const orderColumn =
    sortField === "name" ? `l."name"` : `l."id"`;

  const countQuery = `SELECT COUNT(DISTINCT l.id) FROM "Link" l LEFT JOIN "Collection" c ON c.id = l."collectionId" ${whereClause}`;

  const searchQuery = `
    SELECT l.id FROM "Link" l
    LEFT JOIN "Collection" c ON c.id = l."collectionId"
    ${whereClause}
    ORDER BY ${orderColumn} ${sortDirection}, l.id ${sortDirection}
    LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
  `;

  params.push(limit, offset);

  const [countResult, idResults] = await Promise.all([
    prisma.$queryRawUnsafe<Array<{ count: bigint }>>(countQuery, ...params.slice(0, -2)),
    prisma.$queryRawUnsafe<Array<{ id: number }>>(searchQuery, ...params),
  ]);

  const totalCount = Number(countResult[0]?.count || 0);
  const ids = idResults.map((r) => r.id);

  if (ids.length === 0) {
    return { ids: [], nextCursor: null, totalCount: 0 };
  }

  const nextCursor = ids.length === limit ? offset + limit : null;

  return { ids, nextCursor, totalCount };
}
