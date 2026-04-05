import { Router, type IRouter } from "express";
import { eq, and, desc } from "drizzle-orm";
import { getAuth } from "@clerk/express";
import { db, generationsTable } from "@workspace/db";
import {
  CreateGenerationBody,
  UpdateGenerationBody,
  GetGenerationParams,
  UpdateGenerationParams,
  DeleteGenerationParams,
  ProcessGenerationParams,
  ListGenerationsResponse,
  GetGenerationResponse,
  UpdateGenerationResponse,
  ProcessGenerationResponse,
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

// Simulate async AI processing — in a real app this would call the Gradio API
async function simulateProcessing(generationId: number): Promise<void> {
  // After 3 seconds mark as processing
  setTimeout(async () => {
    try {
      await db
        .update(generationsTable)
        .set({ status: "processing" })
        .where(eq(generationsTable.id, generationId));

      // After another 5 seconds mark as completed with mock model URLs
      setTimeout(async () => {
        try {
          await db
            .update(generationsTable)
            .set({
              status: "completed",
              previewImageUrl: null,
              modelGlbUrl: null,
              modelObjUrl: null,
              modelUsdzUrl: null,
            })
            .where(eq(generationsTable.id, generationId));
        } catch (_err) {
          // Silently handle
        }
      }, 5000);
    } catch (_err) {
      // Silently handle
    }
  }, 3000);
}

router.get("/generations", requireAuth, async (req: any, res): Promise<void> => {
  const rows = await db
    .select()
    .from(generationsTable)
    .where(eq(generationsTable.userId, req.userId))
    .orderBy(desc(generationsTable.createdAt));
  res.json(ListGenerationsResponse.parse(rows));
});

router.post("/generations", requireAuth, async (req: any, res): Promise<void> => {
  const parsed = CreateGenerationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [generation] = await db
    .insert(generationsTable)
    .values({
      userId: req.userId,
      title: parsed.data.title,
      uploadedImageUrl: parsed.data.uploadedImageUrl,
      furnitureType: parsed.data.furnitureType ?? null,
      description: parsed.data.description ?? null,
      status: "pending",
    })
    .returning();

  res.status(201).json(GetGenerationResponse.parse(generation));
});

router.get("/generations/:id", requireAuth, async (req: any, res): Promise<void> => {
  const params = GetGenerationParams.safeParse({ id: req.params.id });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [generation] = await db
    .select()
    .from(generationsTable)
    .where(and(eq(generationsTable.id, params.data.id), eq(generationsTable.userId, req.userId)));

  if (!generation) {
    res.status(404).json({ error: "Generation not found" });
    return;
  }

  res.json(GetGenerationResponse.parse(generation));
});

router.patch("/generations/:id", requireAuth, async (req: any, res): Promise<void> => {
  const params = UpdateGenerationParams.safeParse({ id: req.params.id });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateGenerationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const updateData: Record<string, string | null> = {};
  if (parsed.data.title != null) updateData.title = parsed.data.title;
  if (parsed.data.description != null) updateData.description = parsed.data.description;

  const [generation] = await db
    .update(generationsTable)
    .set(updateData)
    .where(and(eq(generationsTable.id, params.data.id), eq(generationsTable.userId, req.userId)))
    .returning();

  if (!generation) {
    res.status(404).json({ error: "Generation not found" });
    return;
  }

  res.json(UpdateGenerationResponse.parse(generation));
});

router.delete("/generations/:id", requireAuth, async (req: any, res): Promise<void> => {
  const params = DeleteGenerationParams.safeParse({ id: req.params.id });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [generation] = await db
    .delete(generationsTable)
    .where(and(eq(generationsTable.id, params.data.id), eq(generationsTable.userId, req.userId)))
    .returning();

  if (!generation) {
    res.status(404).json({ error: "Generation not found" });
    return;
  }

  res.sendStatus(204);
});

router.post("/generations/:id/process", requireAuth, async (req: any, res): Promise<void> => {
  const params = ProcessGenerationParams.safeParse({ id: req.params.id });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [generation] = await db
    .select()
    .from(generationsTable)
    .where(and(eq(generationsTable.id, params.data.id), eq(generationsTable.userId, req.userId)));

  if (!generation) {
    res.status(404).json({ error: "Generation not found" });
    return;
  }

  // Kick off async processing simulation
  simulateProcessing(generation.id);

  const [updated] = await db
    .update(generationsTable)
    .set({ status: "processing" })
    .where(eq(generationsTable.id, generation.id))
    .returning();

  res.json(ProcessGenerationResponse.parse(updated));
});

export default router;
