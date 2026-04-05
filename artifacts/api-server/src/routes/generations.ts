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

// ─── Helpers ─────────────────────────────────────────────────────────────────

function log(genId: number, msg: string) {
  console.log(`[gen ${genId}] ${msg}`);
}

async function markStep(genId: number, fields: Record<string, unknown>) {
  await db.update(generationsTable).set(fields as any).where(eq(generationsTable.id, genId));
}

// ─── remove.bg ───────────────────────────────────────────────────────────────

async function removeBackground(base64Image: string): Promise<string> {
  const apiKey = process.env.REMOVE_BG_API_KEY;
  if (!apiKey) throw new Error("REMOVE_BG_API_KEY not set");

  const base64Data = base64Image.replace(/^data:image\/\w+;base64,/, "");
  const params = new URLSearchParams();
  params.append("image_file_b64", base64Data);
  params.append("size", "auto");
  params.append("type", "product");

  const res = await fetch("https://api.remove.bg/v1.0/removebg", {
    method: "POST",
    headers: { "X-Api-Key": apiKey, "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`remove.bg ${res.status}: ${t.slice(0, 200)}`);
  }

  const buf = Buffer.from(await res.arrayBuffer());
  return `data:image/png;base64,${buf.toString("base64")}`;
}

// ─── Gradio 4.x SSE API ──────────────────────────────────────────────────────

async function callGradioSSE(
  spaceUrl: string,
  apiName: string,
  data: unknown[],
  timeoutMs = 300_000,
): Promise<unknown[]> {
  const hfToken = process.env.HF_TOKEN;
  const authHeaders: Record<string, string> = hfToken ? { Authorization: `Bearer ${hfToken}` } : {};

  const submitRes = await fetch(`${spaceUrl}/call/${apiName}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders },
    body: JSON.stringify({ data }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!submitRes.ok) {
    const text = await submitRes.text();
    throw new Error(`Gradio submit [${apiName}] ${submitRes.status}: ${text.slice(0, 300)}`);
  }

  const { event_id } = (await submitRes.json()) as { event_id: string };
  if (!event_id) throw new Error(`No event_id from [${apiName}]`);

  const pollRes = await fetch(`${spaceUrl}/call/${apiName}/${event_id}`, {
    headers: authHeaders,
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!pollRes.ok) throw new Error(`Gradio poll [${apiName}] ${pollRes.status}`);

  const raw = await pollRes.text();
  for (const block of raw.split("\n\n")) {
    const lines = block.split("\n");
    const evtType = lines.find((l) => l.startsWith("event:"))?.replace("event:", "").trim();
    const payload = lines.find((l) => l.startsWith("data:"))?.replace("data:", "").trim();
    if (!evtType || !payload) continue;
    if (evtType === "error") throw new Error(`Gradio [${apiName}] error: ${payload}`);
    if (evtType === "complete") {
      try { return JSON.parse(payload) as unknown[]; } catch { return [payload]; }
    }
  }
  throw new Error(`Gradio [${apiName}]: no complete event found`);
}

function fileDataInput(base64: string, mime = "image/png") {
  const pureB64 = base64.replace(/^data:image\/\w+;base64,/, "");
  return {
    path: "input.png",
    url: `data:${mime};base64,${pureB64}`,
    orig_name: "input.png",
    mime_type: mime,
    meta: { _type: "gradio.FileData" },
  };
}

async function resolveGradioUrl(output: unknown, spaceUrl: string): Promise<string | null> {
  if (!output) return null;
  if (typeof output === "string") {
    if (output.startsWith("data:") || output.startsWith("http")) return output;
    return `${spaceUrl}/file=${output}`;
  }
  const o = output as Record<string, unknown>;
  const rawUrl = (o.url || (o.path ? `${spaceUrl}/file=${o.path}` : null) || (o.name ? `${spaceUrl}/file=${o.name}` : null)) as string | null;
  if (!rawUrl) return null;

  // Download and encode as data URL so it persists beyond Gradio session
  try {
    const hfToken = process.env.HF_TOKEN;
    const dlRes = await fetch(rawUrl, {
      headers: hfToken ? { Authorization: `Bearer ${hfToken}` } : {},
      signal: AbortSignal.timeout(60_000),
    });
    if (!dlRes.ok) return rawUrl;
    const ct = dlRes.headers.get("content-type") || "application/octet-stream";
    const buf = Buffer.from(await dlRes.arrayBuffer());
    return `data:${ct};base64,${buf.toString("base64")}`;
  } catch {
    return rawUrl;
  }
}

// ─── InstantMesh pipeline (full 3-step multiview) ────────────────────────────

async function runInstantMesh(genId: number, cleanImg: string): Promise<void> {
  const spaceUrl = "https://tencentarc-instantmesh.hf.space";
  const imgInput = fileDataInput(cleanImg);

  // Step 1 – preprocess (bg already removed)
  log(genId, "InstantMesh → Step 1: preprocess");
  const pre = await callGradioSSE(spaceUrl, "preprocess", [imgInput, false], 90_000);
  const preprocessed = pre[0];
  if (!preprocessed) throw new Error("preprocess: empty result");

  // Step 2 – multi-view synthesis
  log(genId, "InstantMesh → Step 2: generate_mvs");
  const mvs = await callGradioSSE(spaceUrl, "generate_mvs", [preprocessed, 75, 42], 120_000);
  const mvsImages = mvs[0];

  // Save multiview image for the UI to show
  if (mvsImages) {
    const mvsUrl = await resolveGradioUrl(mvsImages, spaceUrl);
    if (mvsUrl) {
      await markStep(genId, { multiviewImageUrl: mvsUrl });
      log(genId, "InstantMesh → multiview saved");
    }
  }

  // Step 3 – reconstruct 3D mesh
  log(genId, "InstantMesh → Step 3: make3d");
  const mesh = await callGradioSSE(spaceUrl, "make3d", [mvsImages], 200_000);
  // make3d returns [video_path, model_path]
  const glbOut = mesh[1] ?? mesh[0];
  const glbUrl = await resolveGradioUrl(glbOut, spaceUrl);
  if (!glbUrl) throw new Error("make3d: no GLB URL");

  await markStep(genId, { status: "completed", modelGlbUrl: glbUrl });
  log(genId, "InstantMesh → done ✓");
}

// ─── Stable Fast 3D fallback (single-step, StabilityAI) ──────────────────────

async function runStableFast3D(genId: number, cleanImg: string): Promise<void> {
  const spaceUrl = "https://stabilityai-stable-fast-3d.hf.space";
  log(genId, "StableFast3D → calling run");
  const imgInput = fileDataInput(cleanImg);
  // run(image, remesh_option, vertex_count, texture_size)
  const out = await callGradioSSE(spaceUrl, "run", [imgInput, "none", -1, 1024], 180_000);
  const glbOut = out[0];
  const glbUrl = await resolveGradioUrl(glbOut, spaceUrl);
  if (!glbUrl) throw new Error("StableFast3D: no GLB URL");

  await markStep(genId, { status: "completed", modelGlbUrl: glbUrl });
  log(genId, "StableFast3D → done ✓");
}

// ─── TripoSR fallback (very reliable, single-step) ───────────────────────────

async function runTripoSR(genId: number, cleanImg: string): Promise<void> {
  const spaceUrl = "https://stabilityai-triposr.hf.space";
  log(genId, "TripoSR → preprocess");
  const imgInput = fileDataInput(cleanImg);

  // Preprocess (bg already removed, ratio=0.85)
  const pre = await callGradioSSE(spaceUrl, "preprocess", [imgInput, false, 0.85], 60_000);
  const preprocessed = pre[0];
  if (!preprocessed) throw new Error("TripoSR preprocess: empty");

  log(genId, "TripoSR → generate");
  // generate(preprocessed, mc_resolution, formats)
  const out = await callGradioSSE(spaceUrl, "generate", [preprocessed, 256, ["glb"]], 120_000);
  const glbOut = out[0];
  const glbUrl = await resolveGradioUrl(glbOut, spaceUrl);
  if (!glbUrl) throw new Error("TripoSR: no GLB URL");

  await markStep(genId, { status: "completed", modelGlbUrl: glbUrl });
  log(genId, "TripoSR → done ✓");
}

// ─── Full AI pipeline ─────────────────────────────────────────────────────────

async function runAiProcessing(genId: number, imageBase64: string): Promise<void> {
  log(genId, "Starting AI pipeline");
  try {
    // 1. Mark as processing
    await markStep(genId, { status: "processing" });

    // 2. Remove background
    let processedImg = imageBase64;
    try {
      log(genId, "Calling remove.bg");
      processedImg = await removeBackground(imageBase64);
      // Immediately save the bg-removed image so the UI can show it
      await markStep(genId, { previewImageUrl: processedImg });
      log(genId, "remove.bg done ✓");
    } catch (bgErr) {
      log(genId, `remove.bg failed, using original: ${bgErr}`);
    }

    // 3. Try 3D generation with fallback chain
    const pipelines = [
      { name: "InstantMesh", fn: () => runInstantMesh(genId, processedImg) },
      { name: "StableFast3D", fn: () => runStableFast3D(genId, processedImg) },
      { name: "TripoSR", fn: () => runTripoSR(genId, processedImg) },
    ];

    let lastError: unknown;
    for (const pipeline of pipelines) {
      try {
        log(genId, `Trying ${pipeline.name}`);
        await pipeline.fn();
        return; // success — exit early
      } catch (err) {
        log(genId, `${pipeline.name} failed: ${err}`);
        lastError = err;
        // Reset multiview so UI doesn't show stale data
        await markStep(genId, { multiviewImageUrl: null });
      }
    }

    throw lastError;
  } catch (err) {
    log(genId, `All pipelines failed: ${err}`);
    await markStep(genId, { status: "failed" });
  }
}

// ─── Routes ───────────────────────────────────────────────────────────────────

router.get("/generations", requireAuth, async (req: any, res): Promise<void> => {
  const rows = await db
    .select().from(generationsTable)
    .where(eq(generationsTable.userId, req.userId))
    .orderBy(desc(generationsTable.createdAt));
  res.json(ListGenerationsResponse.parse(rows));
});

router.post("/generations", requireAuth, async (req: any, res): Promise<void> => {
  const parsed = CreateGenerationBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [gen] = await db.insert(generationsTable).values({
    userId: req.userId,
    title: parsed.data.title,
    uploadedImageUrl: parsed.data.uploadedImageUrl,
    furnitureType: parsed.data.furnitureType ?? null,
    description: parsed.data.description ?? null,
    status: "pending",
  }).returning();

  res.status(201).json(GetGenerationResponse.parse(gen));
});

router.get("/generations/:id", requireAuth, async (req: any, res): Promise<void> => {
  const params = GetGenerationParams.safeParse({ id: req.params.id });
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const [gen] = await db.select().from(generationsTable).where(
    and(eq(generationsTable.id, params.data.id), eq(generationsTable.userId, req.userId))
  );
  if (!gen) { res.status(404).json({ error: "Not found" }); return; }
  res.json(GetGenerationResponse.parse(gen));
});

router.patch("/generations/:id", requireAuth, async (req: any, res): Promise<void> => {
  const params = UpdateGenerationParams.safeParse({ id: req.params.id });
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = UpdateGenerationBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const update: Record<string, string | null> = {};
  if (parsed.data.title != null) update.title = parsed.data.title;
  if (parsed.data.description != null) update.description = parsed.data.description;

  const [gen] = await db.update(generationsTable).set(update)
    .where(and(eq(generationsTable.id, params.data.id), eq(generationsTable.userId, req.userId)))
    .returning();
  if (!gen) { res.status(404).json({ error: "Not found" }); return; }
  res.json(UpdateGenerationResponse.parse(gen));
});

router.delete("/generations/:id", requireAuth, async (req: any, res): Promise<void> => {
  const params = DeleteGenerationParams.safeParse({ id: req.params.id });
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const [gen] = await db.delete(generationsTable)
    .where(and(eq(generationsTable.id, params.data.id), eq(generationsTable.userId, req.userId)))
    .returning();
  if (!gen) { res.status(404).json({ error: "Not found" }); return; }
  res.sendStatus(204);
});

router.post("/generations/:id/process", requireAuth, async (req: any, res): Promise<void> => {
  const params = ProcessGenerationParams.safeParse({ id: req.params.id });
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const [gen] = await db.select().from(generationsTable).where(
    and(eq(generationsTable.id, params.data.id), eq(generationsTable.userId, req.userId))
  );
  if (!gen) { res.status(404).json({ error: "Not found" }); return; }
  if (!gen.uploadedImageUrl) { res.status(400).json({ error: "No image to process" }); return; }

  // Reset intermediate fields for re-runs
  await db.update(generationsTable).set({
    status: "processing",
    previewImageUrl: null,
    multiviewImageUrl: null,
    modelGlbUrl: null,
  }).where(eq(generationsTable.id, gen.id));

  // Fire-and-forget the AI pipeline
  runAiProcessing(gen.id, gen.uploadedImageUrl);

  const [updated] = await db.select().from(generationsTable).where(eq(generationsTable.id, gen.id));
  res.json(ProcessGenerationResponse.parse(updated));
});

export default router;
