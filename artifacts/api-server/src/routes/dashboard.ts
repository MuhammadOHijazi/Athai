import { Router, type IRouter } from "express";
import { eq, count, desc } from "drizzle-orm";
import { getAuth } from "@clerk/express";
import { db, generationsTable } from "@workspace/db";
import {
  GetDashboardSummaryResponse,
  GetRecentGenerationsResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

function requireAuth(req: any, res: any, next: any) {
  const auth = getAuth(req);
  const userId = auth?.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  req.userId = userId;
  next();
}

router.get("/dashboard/summary", requireAuth, async (req: any, res): Promise<void> => {
  const rows = await db
    .select()
    .from(generationsTable)
    .where(eq(generationsTable.userId, req.userId));

  const total = rows.length;
  const completed = rows.filter((r) => r.status === "completed").length;
  const processing = rows.filter((r) => r.status === "processing").length;
  const pending = rows.filter((r) => r.status === "pending").length;

  res.json(
    GetDashboardSummaryResponse.parse({
      totalGenerations: total,
      completedGenerations: completed,
      processingGenerations: processing,
      pendingGenerations: pending,
    }),
  );
});

router.get("/dashboard/recent", requireAuth, async (req: any, res): Promise<void> => {
  const rows = await db
    .select()
    .from(generationsTable)
    .where(eq(generationsTable.userId, req.userId))
    .orderBy(desc(generationsTable.createdAt))
    .limit(10);

  res.json(GetRecentGenerationsResponse.parse(rows));
});

export default router;
