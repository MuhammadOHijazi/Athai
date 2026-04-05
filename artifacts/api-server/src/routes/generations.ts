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

// ─── remove.bg: strip image background ────────────────────────────────────────
async function removeBackground(base64Image: string): Promise<string> {
  const apiKey = process.env.REMOVE_BG_API_KEY;
  if (!apiKey) throw new Error("REMOVE_BG_API_KEY not set");

  const base64Data = base64Image.replace(/^data:image\/\w+;base64,/, "");

  const params = new URLSearchParams();
  params.append("image_file_b64", base64Data);
  params.append("size", "auto");
  params.append("type", "product");

  const response = await fetch("https://api.remove.bg/v1.0/removebg", {
    method: "POST",
    headers: { "X-Api-Key": apiKey, "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`remove.bg ${response.status}: ${text.slice(0, 200)}`);
  }

  const buf = Buffer.from(await response.arrayBuffer());
  return `data:image/png;base64,${buf.toString("base64")}`;
}

// ─── Gradio 4.x SSE API helper ─────────────────────────────────────────────
async function callGradioSSE(
  spaceUrl: string,
  apiName: string,
  data: unknown[],
  timeoutMs = 300_000,
): Promise<unknown[]> {
  const hfToken = process.env.HF_TOKEN;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (hfToken) headers["Authorization"] = `Bearer ${hfToken}`;

  // Step 1: submit
  const submitRes = await fetch(`${spaceUrl}/call/${apiName}`, {
    method: "POST",
    headers,
    body: JSON.stringify({ data }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!submitRes.ok) {
    const text = await submitRes.text();
    throw new Error(`Gradio submit [${apiName}] failed ${submitRes.status}: ${text.slice(0, 300)}`);
  }

  const { event_id } = (await submitRes.json()) as { event_id: string };
  if (!event_id) throw new Error(`No event_id returned for [${apiName}]`);

  // Step 2: stream SSE result
  const pollRes = await fetch(`${spaceUrl}/call/${apiName}/${event_id}`, {
    headers: hfToken ? { Authorization: `Bearer ${hfToken}` } : {},
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!pollRes.ok) {
    throw new Error(`Gradio poll [${apiName}] failed ${pollRes.status}`);
  }

  const raw = await pollRes.text();

  // Parse SSE text — find the "complete" event
  const blocks = raw.split("\n\n");
  for (const block of blocks) {
    const lines = block.split("\n");
    const eventLine = lines.find((l) => l.startsWith("event:"));
    const dataLine = lines.find((l) => l.startsWith("data:"));
    if (!eventLine || !dataLine) continue;

    const eventType = eventLine.replace("event:", "").trim();
    const payload = dataLine.replace("data:", "").trim();

    if (eventType === "error") {
      throw new Error(`Gradio [${apiName}] error: ${payload}`);
    }
    if (eventType === "complete") {
      try {
        return JSON.parse(payload) as unknown[];
      } catch {
        return [payload];
      }
    }
  }

  throw new Error(`Gradio [${apiName}]: no complete event in SSE response`);
}

// ─── Fetch a Gradio file URL and return it as base64 data URL ─────────────
async function fetchGradioFile(fileUrl: string): Promise<string | null> {
  try {
    const hfToken = process.env.HF_TOKEN;
    const res = await fetch(fileUrl, {
      headers: hfToken ? { Authorization: `Bearer ${hfToken}` } : {},
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") || "model/gltf-binary";
    const buf = Buffer.from(await res.arrayBuffer());
    return `data:${contentType};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

// ─── Extract URL from Gradio file output ──────────────────────────────────
function extractUrl(output: unknown, spaceUrl: string): string | null {
  if (!output) return null;
  if (typeof output === "string") {
    if (output.startsWith("http") || output.startsWith("data:")) return output;
    // Relative path from Gradio
    return `${spaceUrl}/file=${output}`;
  }
  const obj = output as Record<string, unknown>;
  if (obj.url && typeof obj.url === "string") return obj.url;
  if (obj.path && typeof obj.path === "string") return `${spaceUrl}/file=${obj.path}`;
  if (obj.name && typeof obj.name === "string") return `${spaceUrl}/file=${obj.name}`;
  return null;
}

// ─── InstantMesh 3-step pipeline ──────────────────────────────────────────
async function generateInstantMesh(cleanImageBase64: string): Promise<string> {
  const spaceUrl = "https://tencentarc-instantmesh.hf.space";

  const imgMime = cleanImageBase64.startsWith("data:image/")
    ? cleanImageBase64.split(";")[0].split(":")[1]
    : "image/png";
  const imgBase64 = cleanImageBase64.replace(/^data:image\/\w+;base64,/, "");

  // Gradio FileData shape expected by the space
  const imageInput = {
    path: "input.png",
    url: `data:${imgMime};base64,${imgBase64}`,
    orig_name: "input.png",
    mime_type: imgMime,
    meta: { _type: "gradio.FileData" },
  };

  // Step 1 – Preprocess (bg already removed, so do_remove_background = false)
  console.log(`[InstantMesh] Step 1: preprocess`);
  const preprocessOut = await callGradioSSE(spaceUrl, "preprocess", [imageInput, false], 60_000);
  const preprocessedImg = preprocessOut[0];
  if (!preprocessedImg) throw new Error("preprocess returned nothing");

  // Step 2 – Generate multi-view synthesis
  console.log(`[InstantMesh] Step 2: generate_mvs`);
  const mvsOut = await callGradioSSE(spaceUrl, "generate_mvs", [preprocessedImg, 75, 42], 120_000);
  const mvsImages = mvsOut[0];
  if (!mvsImages) throw new Error("generate_mvs returned nothing");

  // Step 3 – Reconstruct 3D mesh
  console.log(`[InstantMesh] Step 3: make3d`);
  const model3dOut = await callGradioSSE(spaceUrl, "make3d", [mvsImages], 180_000);
  // make3d returns [video_path, model_path]
  const glbOutput = model3dOut[1] ?? model3dOut[0];
  const glbUrl = extractUrl(glbOutput, spaceUrl);

  if (!glbUrl) throw new Error("make3d returned no file URL");

  // Download the GLB and encode as data URL for storage
  if (!glbUrl.startsWith("data:")) {
    const dataUrl = await fetchGradioFile(glbUrl);
    if (dataUrl) return dataUrl;
  }
  return glbUrl;
}

// ─── Full AI pipeline ─────────────────────────────────────────────────────
async function runAiProcessing(generationId: number, imageBase64: string): Promise<void> {
  console.log(`[gen ${generationId}] Starting AI pipeline`);

  try {
    // 1. Mark as processing
    await db
      .update(generationsTable)
      .set({ status: "processing" })
      .where(eq(generationsTable.id, generationId));

    // 2. Remove background
    let processedImage = imageBase64;
    try {
      console.log(`[gen ${generationId}] Calling remove.bg`);
      processedImage = await removeBackground(imageBase64);
      console.log(`[gen ${generationId}] Background removed successfully`);
    } catch (bgErr) {
      console.warn(`[gen ${generationId}] remove.bg failed, continuing with original:`, bgErr);
    }

    // 3. Generate 3D model
    console.log(`[gen ${generationId}] Calling InstantMesh`);
    const glbDataUrl = await generateInstantMesh(processedImage);
    console.log(`[gen ${generationId}] InstantMesh succeeded`);

    // 4. Save results
    await db
      .update(generationsTable)
      .set({
        status: "completed",
        modelGlbUrl: glbDataUrl,
        previewImageUrl: processedImage,
      })
      .where(eq(generationsTable.id, generationId));

    console.log(`[gen ${generationId}] Done ✓`);
  } catch (err) {
    console.error(`[gen ${generationId}] AI pipeline failed:`, err);
    await db
      .update(generationsTable)
      .set({ status: "failed" })
      .where(eq(generationsTable.id, generationId));
  }
}

// ─── Routes ───────────────────────────────────────────────────────────────

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

  // Kick off async — non-blocking
  runAiProcessing(generation.id, generation.uploadedImageUrl);

  const [updated] = await db
    .update(generationsTable)
    .set({ status: "processing" })
    .where(eq(generationsTable.id, generation.id))
    .returning();

  res.json(ProcessGenerationResponse.parse(updated));
});

export default router;
