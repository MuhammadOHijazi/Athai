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

// --- remove.bg: strip background from a base64 image ---
async function removeBackground(base64Image: string): Promise<string> {
  const apiKey = process.env.REMOVE_BG_API_KEY;
  if (!apiKey) throw new Error("REMOVE_BG_API_KEY not set");

  // Strip data URL prefix if present
  const base64Data = base64Image.replace(/^data:image\/\w+;base64,/, "");

  const formData = new FormData();
  formData.append("image_file_b64", base64Data);
  formData.append("size", "auto");

  const response = await fetch("https://api.remove.bg/v1.0/removebg", {
    method: "POST",
    headers: { "X-Api-Key": apiKey },
    body: formData,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`remove.bg error ${response.status}: ${text}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  return `data:image/png;base64,${buffer.toString("base64")}`;
}

// --- HuggingFace InstantMesh via Gradio REST API ---
async function generateWith3DModel(imageBase64: string): Promise<string> {
  const hfToken = process.env.HF_TOKEN;
  if (!hfToken) throw new Error("HF_TOKEN not set");

  // Use the TrelliS3D space which is more stable for furniture
  // Fall back to InstantMesh
  const spaceId = "TencentARC/InstantMesh";
  const apiUrl = `https://api-inference.huggingface.co/models/${spaceId}`;

  // Convert base64 to blob bytes for the Gradio client
  const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");
  const imageBuffer = Buffer.from(base64Data, "base64");

  // Use Gradio HTTP API directly
  const gradioApiUrl = `https://tencentarc-instantmesh.hf.space/run/predict`;

  // First try Gradio predict endpoint
  const predictRes = await fetch(gradioApiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${hfToken}`,
    },
    body: JSON.stringify({
      fn_index: 0,
      data: [`data:image/png;base64,${base64Data}`],
    }),
    signal: AbortSignal.timeout(180_000),
  });

  if (!predictRes.ok) {
    throw new Error(`InstantMesh predict failed: ${predictRes.status} ${await predictRes.text()}`);
  }

  const result = await predictRes.json() as any;

  // Gradio returns output in result.data array
  if (result.data && result.data.length > 0) {
    const glbOutput = result.data.find((d: any) =>
      typeof d === "string" && (d.includes(".glb") || d.startsWith("data:model"))
    );
    if (glbOutput) return glbOutput;

    // Sometimes returns a dict with name field (file path)
    const fileOutput = result.data.find((d: any) => d?.name || d?.path);
    if (fileOutput) {
      const filePath = fileOutput.name || fileOutput.path;
      // Fetch the actual file from Gradio
      const fileRes = await fetch(`https://tencentarc-instantmesh.hf.space/file=${filePath}`, {
        headers: { Authorization: `Bearer ${hfToken}` },
      });
      if (fileRes.ok) {
        const buf = Buffer.from(await fileRes.arrayBuffer());
        return `data:model/gltf-binary;base64,${buf.toString("base64")}`;
      }
    }
  }

  throw new Error("InstantMesh returned no usable output");
}

// --- Real AI processing pipeline ---
async function runAiProcessing(generationId: number, imageBase64: string): Promise<void> {
  try {
    // 1. Mark as processing
    await db
      .update(generationsTable)
      .set({ status: "processing" })
      .where(eq(generationsTable.id, generationId));

    // 2. Remove background
    let processedImage = imageBase64;
    try {
      processedImage = await removeBackground(imageBase64);
    } catch (err) {
      console.error(`[gen ${generationId}] remove.bg failed, using original:`, err);
    }

    // 3. Generate 3D model via InstantMesh
    const glbDataUrl = await generateWith3DModel(processedImage);

    // 4. Mark as completed with model URL
    await db
      .update(generationsTable)
      .set({
        status: "completed",
        modelGlbUrl: glbDataUrl,
        previewImageUrl: processedImage,
      })
      .where(eq(generationsTable.id, generationId));
  } catch (err) {
    console.error(`[gen ${generationId}] AI processing failed:`, err);
    await db
      .update(generationsTable)
      .set({ status: "failed" })
      .where(eq(generationsTable.id, generationId));
  }
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

  if (!generation.uploadedImageUrl) {
    res.status(400).json({ error: "No image to process" });
    return;
  }

  // Kick off real AI pipeline in background (non-blocking)
  runAiProcessing(generation.id, generation.uploadedImageUrl);

  const [updated] = await db
    .update(generationsTable)
    .set({ status: "processing" })
    .where(eq(generationsTable.id, generation.id))
    .returning();

  res.json(ProcessGenerationResponse.parse(updated));
});

export default router;
