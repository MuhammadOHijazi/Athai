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
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
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

async function downloadAsDataUrl(url: string, extraHeaders: Record<string, string> = {}): Promise<string> {
  const res = await fetch(url, { headers: extraHeaders, signal: AbortSignal.timeout(120_000) });
  if (!res.ok) throw new Error(`Download failed ${res.status}: ${url}`);
  const ct = res.headers.get("content-type") || "application/octet-stream";
  const buf = Buffer.from(await res.arrayBuffer());
  return `data:${ct};base64,${buf.toString("base64")}`;
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
  if (!res.ok) throw new Error(`remove.bg ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const buf = Buffer.from(await res.arrayBuffer());
  return `data:image/png;base64,${buf.toString("base64")}`;
}

// ─── Replicate ────────────────────────────────────────────────────────────────

async function replicatePredict(
  genId: number,
  modelPath: string, // e.g. "stability-ai/triposr"
  input: Record<string, unknown>,
  pollIntervalMs = 10_000,
  maxWaitMs = 600_000,
): Promise<unknown[]> {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) throw new Error("REPLICATE_API_TOKEN not set");

  const headers = {
    Authorization: `Token ${token}`,
    "Content-Type": "application/json",
  };

  // Create prediction using latest model version
  const createRes = await fetch(`https://api.replicate.com/v1/models/${modelPath}/predictions`, {
    method: "POST",
    headers,
    body: JSON.stringify({ input }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!createRes.ok) {
    const t = await createRes.text();
    throw new Error(`Replicate create [${modelPath}] ${createRes.status}: ${t.slice(0, 300)}`);
  }
  const pred = (await createRes.json()) as { id: string; status: string; output?: unknown[]; error?: string };
  log(genId, `Replicate [${modelPath}] prediction id: ${pred.id}`);

  // Poll until done
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, pollIntervalMs));
    const pollRes = await fetch(`https://api.replicate.com/v1/predictions/${pred.id}`, {
      headers,
      signal: AbortSignal.timeout(15_000),
    });
    if (!pollRes.ok) throw new Error(`Replicate poll ${pollRes.status}`);
    const data = (await pollRes.json()) as { status: string; output?: unknown[]; error?: string; logs?: string };
    log(genId, `Replicate status: ${data.status}`);
    if (data.status === "succeeded") return data.output ?? [];
    if (data.status === "failed" || data.status === "canceled") {
      throw new Error(`Replicate [${modelPath}] ${data.status}: ${data.error}`);
    }
  }
  throw new Error(`Replicate [${modelPath}] timed out after ${maxWaitMs / 1000}s`);
}

// ─── Replicate: TripoSR ───────────────────────────────────────────────────────

async function runReplicateTripoSR(genId: number, cleanImg: string): Promise<void> {
  log(genId, "Replicate TripoSR → starting");
  const output = await replicatePredict(genId, "stability-ai/triposr", {
    image: cleanImg,
    do_remove_background: false,
    foreground_ratio: 0.85,
  });

  // Output is an array of file URLs. Find the mesh file (glb or obj).
  const urls = (output ?? []) as string[];
  log(genId, `Replicate TripoSR → output urls: ${JSON.stringify(urls).slice(0, 200)}`);

  // Prefer GLB, fall back to OBJ
  const glbUrl = urls.find((u) => typeof u === "string" && u.toLowerCase().includes(".glb"));
  const objUrl = urls.find((u) => typeof u === "string" && u.toLowerCase().includes(".obj"));
  const meshUrl = glbUrl ?? objUrl ?? urls[0];

  if (!meshUrl || typeof meshUrl !== "string") throw new Error("TripoSR: no mesh URL in output");

  const modelDataUrl = await downloadAsDataUrl(meshUrl, { Authorization: `Token ${process.env.REPLICATE_API_TOKEN}` });
  await markStep(genId, { status: "completed", modelGlbUrl: modelDataUrl });
  log(genId, "Replicate TripoSR → done ✓");
}

// ─── Replicate: InstantMesh ───────────────────────────────────────────────────

async function runReplicateInstantMesh(genId: number, cleanImg: string): Promise<void> {
  log(genId, "Replicate InstantMesh → starting");
  const output = await replicatePredict(genId, "camenduru/instantmesh", {
    image_path: cleanImg,
    export_mesh: true,
  });

  const urls = (output ?? []) as string[];
  log(genId, `Replicate InstantMesh → output urls: ${JSON.stringify(urls).slice(0, 200)}`);
  const meshUrl = urls.find((u) => typeof u === "string" && (u.includes(".glb") || u.includes(".obj"))) ?? urls[0];
  if (!meshUrl || typeof meshUrl !== "string") throw new Error("InstantMesh: no mesh URL");

  const modelDataUrl = await downloadAsDataUrl(meshUrl, { Authorization: `Token ${process.env.REPLICATE_API_TOKEN}` });

  // Optionally store multiview image (some forks output it)
  const imgUrl = urls.find((u) => typeof u === "string" && (u.includes(".png") || u.includes(".jpg")));
  if (imgUrl) {
    const mvsDataUrl = await downloadAsDataUrl(imgUrl, { Authorization: `Token ${process.env.REPLICATE_API_TOKEN}` });
    await markStep(genId, { multiviewImageUrl: mvsDataUrl });
  }

  await markStep(genId, { status: "completed", modelGlbUrl: modelDataUrl });
  log(genId, "Replicate InstantMesh → done ✓");
}

// ─── Gradio 4.x SSE API (HF Spaces fallback) ─────────────────────────────────

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
    throw new Error(`Gradio [${apiName}] ${submitRes.status}: ${text.slice(0, 200)}`);
  }
  const { event_id } = (await submitRes.json()) as { event_id: string };
  if (!event_id) throw new Error(`No event_id from [${apiName}]`);

  const pollRes = await fetch(`${spaceUrl}/call/${apiName}/${event_id}`, {
    headers: authHeaders,
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!pollRes.ok) throw new Error(`Gradio poll ${pollRes.status}`);

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
  throw new Error(`Gradio [${apiName}]: no complete event`);
}

function fileDataInput(base64: string, mime = "image/png") {
  const pureB64 = base64.replace(/^data:image\/\w+;base64,/, "");
  return { path: "input.png", url: `data:${mime};base64,${pureB64}`, orig_name: "input.png", mime_type: mime, meta: { _type: "gradio.FileData" } };
}

async function resolveGradioUrl(output: unknown, spaceUrl: string): Promise<string | null> {
  if (!output) return null;
  const hfToken = process.env.HF_TOKEN;
  const authHeaders = hfToken ? { Authorization: `Bearer ${hfToken}` } : {};

  let rawUrl: string;
  if (typeof output === "string") {
    rawUrl = output.startsWith("data:") || output.startsWith("http") ? output : `${spaceUrl}/file=${output}`;
  } else {
    const o = output as Record<string, unknown>;
    rawUrl = (o.url || (o.path ? `${spaceUrl}/file=${o.path}` : null) || (o.name ? `${spaceUrl}/file=${o.name}` : null)) as string;
  }
  if (!rawUrl) return null;
  if (rawUrl.startsWith("data:")) return rawUrl;
  try {
    return await downloadAsDataUrl(rawUrl, authHeaders);
  } catch {
    return rawUrl;
  }
}

async function runInstantMesh(genId: number, cleanImg: string): Promise<void> {
  const spaceUrl = "https://tencentarc-instantmesh.hf.space";
  const imgInput = fileDataInput(cleanImg);
  log(genId, "HF InstantMesh → preprocess");
  const pre = await callGradioSSE(spaceUrl, "preprocess", [imgInput, false], 90_000);
  log(genId, "HF InstantMesh → generate_mvs");
  const mvs = await callGradioSSE(spaceUrl, "generate_mvs", [pre[0], 75, 42], 120_000);
  const mvsUrl = await resolveGradioUrl(mvs[0], spaceUrl);
  if (mvsUrl) await markStep(genId, { multiviewImageUrl: mvsUrl });
  log(genId, "HF InstantMesh → make3d");
  const mesh = await callGradioSSE(spaceUrl, "make3d", [mvs[0]], 200_000);
  const glbUrl = await resolveGradioUrl(mesh[1] ?? mesh[0], spaceUrl);
  if (!glbUrl) throw new Error("make3d: no GLB");
  await markStep(genId, { status: "completed", modelGlbUrl: glbUrl });
  log(genId, "HF InstantMesh → done ✓");
}

async function runTripoSR(genId: number, cleanImg: string): Promise<void> {
  const spaceUrl = "https://stabilityai-triposr.hf.space";
  const imgInput = fileDataInput(cleanImg);
  const pre = await callGradioSSE(spaceUrl, "preprocess", [imgInput, false, 0.85], 60_000);
  const out = await callGradioSSE(spaceUrl, "generate", [pre[0], 256, ["glb"]], 120_000);
  const glbUrl = await resolveGradioUrl(out[0], spaceUrl);
  if (!glbUrl) throw new Error("TripoSR: no GLB");
  await markStep(genId, { status: "completed", modelGlbUrl: glbUrl });
  log(genId, "HF TripoSR → done ✓");
}

// ─── Full AI pipeline ─────────────────────────────────────────────────────────

async function runAiProcessing(genId: number, imageBase64: string): Promise<void> {
  log(genId, "Starting AI pipeline");
  try {
    await markStep(genId, { status: "processing" });

    // 1. Remove background
    let cleanImg = imageBase64;
    try {
      log(genId, "remove.bg →");
      cleanImg = await removeBackground(imageBase64);
      await markStep(genId, { previewImageUrl: cleanImg });
      log(genId, "remove.bg done ✓");
    } catch (err) {
      log(genId, `remove.bg failed, using original: ${err}`);
    }

    // 2. Try pipelines in order: Replicate first (most reliable), then HF Spaces
    const hasReplicate = !!process.env.REPLICATE_API_TOKEN;

    const pipelines: { name: string; fn: () => Promise<void> }[] = [
      ...(hasReplicate
        ? [
            { name: "Replicate/TripoSR", fn: () => runReplicateTripoSR(genId, cleanImg) },
            { name: "Replicate/InstantMesh", fn: () => runReplicateInstantMesh(genId, cleanImg) },
          ]
        : []),
      { name: "HF/InstantMesh", fn: () => runInstantMesh(genId, cleanImg) },
      { name: "HF/TripoSR", fn: () => runTripoSR(genId, cleanImg) },
    ];

    if (!hasReplicate) {
      log(genId, "⚠️  REPLICATE_API_TOKEN not set — only HF Spaces available (currently unreliable)");
    }

    let lastError: unknown;
    for (const p of pipelines) {
      try {
        log(genId, `Trying ${p.name}`);
        await p.fn();
        return;
      } catch (err) {
        log(genId, `${p.name} failed: ${err}`);
        lastError = err;
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
  const rows = await db.select().from(generationsTable).where(eq(generationsTable.userId, req.userId)).orderBy(desc(generationsTable.createdAt));
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
  const [gen] = await db.select().from(generationsTable).where(and(eq(generationsTable.id, params.data.id), eq(generationsTable.userId, req.userId)));
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
  const [gen] = await db.update(generationsTable).set(update).where(and(eq(generationsTable.id, params.data.id), eq(generationsTable.userId, req.userId))).returning();
  if (!gen) { res.status(404).json({ error: "Not found" }); return; }
  res.json(UpdateGenerationResponse.parse(gen));
});

router.delete("/generations/:id", requireAuth, async (req: any, res): Promise<void> => {
  const params = DeleteGenerationParams.safeParse({ id: req.params.id });
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [gen] = await db.delete(generationsTable).where(and(eq(generationsTable.id, params.data.id), eq(generationsTable.userId, req.userId))).returning();
  if (!gen) { res.status(404).json({ error: "Not found" }); return; }
  res.sendStatus(204);
});

router.post("/generations/:id/process", requireAuth, async (req: any, res): Promise<void> => {
  const params = ProcessGenerationParams.safeParse({ id: req.params.id });
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [gen] = await db.select().from(generationsTable).where(and(eq(generationsTable.id, params.data.id), eq(generationsTable.userId, req.userId)));
  if (!gen) { res.status(404).json({ error: "Not found" }); return; }
  if (!gen.uploadedImageUrl) { res.status(400).json({ error: "No image to process" }); return; }

  await db.update(generationsTable).set({
    status: "processing",
    previewImageUrl: null,
    multiviewImageUrl: null,
    modelGlbUrl: null,
  }).where(eq(generationsTable.id, gen.id));

  runAiProcessing(gen.id, gen.uploadedImageUrl);

  const [updated] = await db.select().from(generationsTable).where(eq(generationsTable.id, gen.id));
  res.json(ProcessGenerationResponse.parse(updated));
});

export default router;
