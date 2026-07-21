import { MEILI_INDEX_VERSION } from "@linkwarden/lib/constants";
import { PG_SEARCH_ENABLED } from "@linkwarden/lib/pgSearchClient";
import { prisma } from "@linkwarden/prisma";
import { WorkerStats } from "@linkwarden/types/global";

export default async function getWorkerStats(userId: number) {
  const linkPending = await prisma.link.count({
    where: {
      url: { not: null },
      lastPreserved: null,
    },
  });

  const linkDone = await prisma.link.count({
    where: {
      lastPreserved: { not: null },
      OR: [
        { image: { not: "unavailable" } },
        { pdf: { not: "unavailable" } },
        { readable: { not: "unavailable" } },
        { monolith: { not: "unavailable" } },
      ],
    },
  });

  const linkFailed = await prisma.link.count({
    where: {
      url: { not: null },
      lastPreserved: { not: null },
      image: "unavailable",
      pdf: "unavailable",
      readable: "unavailable",
      monolith: "unavailable",
    },
  });

  const data: WorkerStats = {
    link: {
      pending: linkPending,
      done: linkDone,
      failed: linkFailed,
    },
    search: PG_SEARCH_ENABLED
      ? {
          pending: 0,
          done: await prisma.link.count(),
        }
      : {
          pending: await prisma.link.count({
            where: {
              OR: [
                { indexVersion: { not: MEILI_INDEX_VERSION } },
                { indexVersion: null },
              ],
            },
          }),
          done: await prisma.link.count({
            where: {
              indexVersion: MEILI_INDEX_VERSION,
            },
          }),
        },
  };

  return {
    data,
    success: true,
    message: "Worker stats fetched successfully.",
    status: 200,
  };
}
