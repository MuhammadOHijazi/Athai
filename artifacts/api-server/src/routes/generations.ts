import { Router, type IRouter, type Response } from "express";
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
  if (!auth?.userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  req.userId = auth.userId;
  next();
}

// ─── SSE pub/sub ──────────────────────────────────────────────────────────────
// Map of genId → Set of SSE response objects

const sseClients = new Map<number, Set<Response>>();

function pushUpdate(genId: number, data: Record<string, unknown>) {
  const clients = sseClients.get(genId);
  if (!clients?.size) return;
  const payload = `data: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) {
    try { res.write(payload); } catch { /* client disconnected */ }
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function log(genId: number, msg: string) {
  console.log(`[gen ${genId}] ${msg}`);
}

async function markStep(genId: number, fields: Record<string, unknown>) {
  await db.update(generationsTable).set(fields as any).where(eq(generationsTable.id, genId));
  // Push live update to any listening SSE clients
  pushUpdate(genId, { ...fields, _ts: Date.now() });
}

async function downloadAsDataUrl(url: string, headers: Record<string, string> = {}): Promise<string> {
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(120_000) });
  if (!res.ok) throw new Error(`Download failed ${res.status}`);
  const ct = res.headers.get("content-type") || "application/octet-stream";
  const buf = Buffer.from(await res.arrayBuffer());
  return `data:${ct};base64,${buf.toString("base64")}`;
}

// ─── Fallback: generate a textured 3D plane from the bg-removed image ─────────
// Works 100% offline — no external API needed.

function getPngDimensions(base64: string): { w: number; h: number } {
  try {
    const data = base64.replace(/^data:image\/\w+;base64,/, "");
    const buf = Buffer.from(data, "base64");
    // PNG IHDR: width at bytes 16-19, height at 20-23
    const w = buf.readUInt32BE(16);
    const h = buf.readUInt32BE(20);
    if (w > 0 && h > 0) return { w, h };
  } catch { /* fallback */ }
  return { w: 1, h: 1 };
}

function createTexturedPlaneGltf(imageBase64: string): string {
  const { w: pw, h: ph } = getPngDimensions(imageBase64);
  const aspect = pw / ph;

  // Plane: width = aspect, height = 1, centered at origin, facing +Z
  const hw = aspect * 0.5; // half-width
  const hh = 0.5;          // half-height

  // 4 vertices, 2 tris (double-sided via material flag)
  const positions = new Float32Array([
    -hw, -hh, 0,
     hw, -hh, 0,
     hw,  hh, 0,
    -hw,  hh, 0,
  ]);
  const uvs = new Float32Array([
    0, 1,
    1, 1,
    1, 0,
    0, 0,
  ]);
  const normals = new Float32Array([
    0, 0, 1,
    0, 0, 1,
    0, 0, 1,
    0, 0, 1,
  ]);
  const indices = new Uint16Array([0, 1, 2,  0, 2, 3]);

  const posBytes = Buffer.from(positions.buffer);
  const uvBytes  = Buffer.from(uvs.buffer);
  const normBytes = Buffer.from(normals.buffer);
  const idxBytes  = Buffer.from(indices.buffer);

  // Pad idx to 4-byte alignment
  const idxPad = idxBytes.length % 4 === 0 ? idxBytes : Buffer.concat([idxBytes, Buffer.alloc(4 - (idxBytes.length % 4))]);

  const posOffset  = 0;
  const uvOffset   = posBytes.length;
  const normOffset = uvOffset + uvBytes.length;
  const idxOffset  = normOffset + normBytes.length;
  const totalBytes = idxOffset + idxPad.length;

  const binBuf = Buffer.concat([posBytes, uvBytes, normBytes, idxPad]);
  const binB64 = binBuf.toString("base64");

  const imgUri = imageBase64.startsWith("data:") ? imageBase64 : `data:image/png;base64,${imageBase64}`;

  const gltf = {
    asset: { version: "2.0", generator: "Ath.ai" },
    scenes: [{ nodes: [0] }],
    scene: 0,
    nodes: [{ mesh: 0 }],
    meshes: [{
      primitives: [{
        attributes: { POSITION: 0, TEXCOORD_0: 1, NORMAL: 2 },
        indices: 3,
        material: 0,
      }],
    }],
    materials: [{
      pbrMetallicRoughness: {
        baseColorTexture: { index: 0 },
        metallicFactor: 0,
        roughnessFactor: 0.7,
      },
      doubleSided: true,
    }],
    textures: [{ source: 0 }],
    images: [{ uri: imgUri }],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 4, type: "VEC3", min: [-hw, -hh, 0], max: [hw, hh, 0] },
      { bufferView: 1, componentType: 5126, count: 4, type: "VEC2" },
      { bufferView: 2, componentType: 5126, count: 4, type: "VEC3" },
      { bufferView: 3, componentType: 5123, count: 6,  type: "SCALAR" },
    ],
    bufferViews: [
      { buffer: 0, byteOffset: posOffset,  byteLength: posBytes.length  },
      { buffer: 0, byteOffset: uvOffset,   byteLength: uvBytes.length   },
      { buffer: 0, byteOffset: normOffset, byteLength: normBytes.length },
      { buffer: 0, byteOffset: idxOffset,  byteLength: idxBytes.length  },
    ],
    buffers: [{ byteLength: totalBytes, uri: `data:application/octet-stream;base64,${binB64}` }],
  };

  return `data:model/gltf+json;base64,${Buffer.from(JSON.stringify(gltf)).toString("base64")}`;
}

async function runFallbackGltf(genId: number, cleanImg: string): Promise<void> {
  log(genId, "Fallback: generating textured GLTF plane");
  const gltfUrl = createTexturedPlaneGltf(cleanImg);
  await markStep(genId, { status: "completed", modelGlbUrl: gltfUrl });
  log(genId, "Fallback GLTF done ✓");
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

// ─── Replicate predictions ────────────────────────────────────────────────────

async function replicatePredict(
  genId: number,
  modelPath: string,
  input: Record<string, unknown>,
): Promise<unknown[]> {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) throw new Error("REPLICATE_API_TOKEN not set");
  const headers = { Authorization: `Token ${token}`, "Content-Type": "application/json" };

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
  const pred = (await createRes.json()) as { id: string };
  log(genId, `Replicate [${modelPath}] prediction: ${pred.id}`);

  const deadline = Date.now() + 600_000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 8_000));
    const poll = await fetch(`https://api.replicate.com/v1/predictions/${pred.id}`, { headers, signal: AbortSignal.timeout(15_000) });
    if (!poll.ok) throw new Error(`Replicate poll ${poll.status}`);
    const data = (await poll.json()) as { status: string; output?: unknown[]; error?: string };
    log(genId, `Replicate status: ${data.status}`);
    if (data.status === "succeeded") return data.output ?? [];
    if (data.status === "failed" || data.status === "canceled") throw new Error(`Replicate ${data.status}: ${data.error}`);
  }
  throw new Error(`Replicate timed out`);
}

async function runReplicateTripoSR(genId: number, cleanImg: string): Promise<void> {
  log(genId, "Replicate TripoSR →");
  const output = await replicatePredict(genId, "stability-ai/triposr", {
    image: cleanImg,
    do_remove_background: false,
    foreground_ratio: 0.85,
  });
  const urls = (output ?? []) as string[];
  log(genId, `TripoSR output: ${JSON.stringify(urls).slice(0, 200)}`);
  const token = process.env.REPLICATE_API_TOKEN!;
  const authH = { Authorization: `Token ${token}` };
  const glbUrl = urls.find((u) => typeof u === "string" && u.toLowerCase().includes(".glb"));
  const objUrl = urls.find((u) => typeof u === "string" && u.toLowerCase().includes(".obj"));
  const meshUrl = glbUrl ?? objUrl ?? (typeof urls[0] === "string" ? urls[0] : null);
  if (!meshUrl) throw new Error("TripoSR: no mesh URL");
  const modelDataUrl = await downloadAsDataUrl(meshUrl, authH);
  await markStep(genId, { status: "completed", modelGlbUrl: modelDataUrl });
  log(genId, "Replicate TripoSR done ✓");
}

async function runReplicateInstantMesh(genId: number, cleanImg: string): Promise<void> {
  log(genId, "Replicate InstantMesh →");
  const output = await replicatePredict(genId, "camenduru/instantmesh", {
    image_path: cleanImg,
    export_mesh: true,
  });
  const urls = (output ?? []) as string[];
  const token = process.env.REPLICATE_API_TOKEN!;
  const authH = { Authorization: `Token ${token}` };
  const meshUrl = urls.find((u) => typeof u === "string" && (u.includes(".glb") || u.includes(".obj"))) ?? urls[0];
  if (!meshUrl || typeof meshUrl !== "string") throw new Error("InstantMesh: no mesh URL");
  const imgUrl = urls.find((u) => typeof u === "string" && (u.includes(".png") || u.includes(".jpg")));
  if (imgUrl) {
    try {
      const mvsUrl = await downloadAsDataUrl(imgUrl, authH);
      await markStep(genId, { multiviewImageUrl: mvsUrl });
    } catch { /* non-fatal */ }
  }
  const modelDataUrl = await downloadAsDataUrl(meshUrl, authH);
  await markStep(genId, { status: "completed", modelGlbUrl: modelDataUrl });
  log(genId, "Replicate InstantMesh done ✓");
}

// ─── HF Gradio Spaces (fallback) ─────────────────────────────────────────────

async function callGradioSSE(spaceUrl: string, apiName: string, data: unknown[], timeoutMs = 300_000): Promise<unknown[]> {
  const hfToken = process.env.HF_TOKEN;
  const authH: Record<string, string> = hfToken ? { Authorization: `Bearer ${hfToken}` } : {};
  const submitRes = await fetch(`${spaceUrl}/call/${apiName}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authH },
    body: JSON.stringify({ data }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!submitRes.ok) {
    const t = await submitRes.text();
    throw new Error(`Gradio [${apiName}] ${submitRes.status}: ${t.slice(0, 200)}`);
  }
  const { event_id } = (await submitRes.json()) as { event_id: string };
  const pollRes = await fetch(`${spaceUrl}/call/${apiName}/${event_id}`, { headers: authH, signal: AbortSignal.timeout(timeoutMs) });
  if (!pollRes.ok) throw new Error(`Gradio poll ${pollRes.status}`);
  const raw = await pollRes.text();
  for (const block of raw.split("\n\n")) {
    const lines = block.split("\n");
    const evtType = lines.find((l) => l.startsWith("event:"))?.replace("event:", "").trim();
    const payload = lines.find((l) => l.startsWith("data:"))?.replace("data:", "").trim();
    if (evtType === "error") throw new Error(`Gradio [${apiName}] error: ${payload}`);
    if (evtType === "complete" && payload) {
      try { return JSON.parse(payload); } catch { return [payload]; }
    }
  }
  throw new Error(`Gradio [${apiName}]: no complete event`);
}

function fileDataInput(base64: string) {
  const pureB64 = base64.replace(/^data:image\/\w+;base64,/, "");
  return { path: "input.png", url: `data:image/png;base64,${pureB64}`, orig_name: "input.png", mime_type: "image/png", meta: { _type: "gradio.FileData" } };
}

async function resolveGradioFile(output: unknown, spaceUrl: string): Promise<string | null> {
  if (!output) return null;
  const hfH = process.env.HF_TOKEN ? { Authorization: `Bearer ${process.env.HF_TOKEN}` } : {};
  let rawUrl: string;
  if (typeof output === "string") {
    rawUrl = output.startsWith("data:") || output.startsWith("http") ? output : `${spaceUrl}/file=${output}`;
  } else {
    const o = output as Record<string, unknown>;
    rawUrl = (o.url ?? (o.path ? `${spaceUrl}/file=${o.path}` : o.name ? `${spaceUrl}/file=${o.name}` : null)) as string;
  }
  if (!rawUrl) return null;
  if (rawUrl.startsWith("data:")) return rawUrl;
  try { return await downloadAsDataUrl(rawUrl, hfH); } catch { return rawUrl; }
}

async function runHfInstantMesh(genId: number, cleanImg: string): Promise<void> {
  const url = "https://tencentarc-instantmesh.hf.space";
  const img = fileDataInput(cleanImg);
  log(genId, "HF InstantMesh → preprocess");
  const pre = await callGradioSSE(url, "preprocess", [img, false], 90_000);
  log(genId, "HF InstantMesh → generate_mvs");
  const mvs = await callGradioSSE(url, "generate_mvs", [pre[0], 75, 42], 120_000);
  const mvsUrl = await resolveGradioFile(mvs[0], url);
  if (mvsUrl) await markStep(genId, { multiviewImageUrl: mvsUrl });
  log(genId, "HF InstantMesh → make3d");
  const mesh = await callGradioSSE(url, "make3d", [mvs[0]], 200_000);
  const glbUrl = await resolveGradioFile(mesh[1] ?? mesh[0], url);
  if (!glbUrl) throw new Error("make3d: no GLB");
  await markStep(genId, { status: "completed", modelGlbUrl: glbUrl });
}

async function runHfTripoSR(genId: number, cleanImg: string): Promise<void> {
  const url = "https://stabilityai-triposr.hf.space";
  const img = fileDataInput(cleanImg);
  const pre = await callGradioSSE(url, "preprocess", [img, false, 0.85], 60_000);
  const out = await callGradioSSE(url, "generate", [pre[0], 256, ["glb"]], 120_000);
  const glbUrl = await resolveGradioFile(out[0], url);
  if (!glbUrl) throw new Error("HF TripoSR: no GLB");
  await markStep(genId, { status: "completed", modelGlbUrl: glbUrl });
}

// ─── Full AI pipeline ─────────────────────────────────────────────────────────

async function runAiProcessing(genId: number, imageBase64: string): Promise<void> {
  log(genId, "Starting AI pipeline");
  try {
    await markStep(genId, { status: "processing" });

    // Step 1: Background removal
    let cleanImg = imageBase64;
    try {
      log(genId, "remove.bg →");
      cleanImg = await removeBackground(imageBase64);
      await markStep(genId, { previewImageUrl: cleanImg });
      log(genId, "remove.bg done ✓");
    } catch (err) {
      log(genId, `remove.bg failed, using original: ${err}`);
    }

    // Step 2: 3D generation — try pipelines in order
    const hasReplicate = !!process.env.REPLICATE_API_TOKEN;

    if (!hasReplicate) {
      log(genId, "⚠️  REPLICATE_API_TOKEN not set — HF Spaces currently unreliable, will use fallback");
    }

    const pipelines: { name: string; fn: () => Promise<void> }[] = [
      ...(hasReplicate ? [
        { name: "Replicate/TripoSR",     fn: () => runReplicateTripoSR(genId, cleanImg) },
        { name: "Replicate/InstantMesh", fn: () => runReplicateInstantMesh(genId, cleanImg) },
      ] : []),
      { name: "HF/InstantMesh", fn: () => runHfInstantMesh(genId, cleanImg) },
      { name: "HF/TripoSR",     fn: () => runHfTripoSR(genId, cleanImg) },
      // Always-available fallback: textured GLTF plane from the bg-removed image
      { name: "Fallback/GLTF",  fn: () => runFallbackGltf(genId, cleanImg) },
    ];

    for (const p of pipelines) {
      try {
        log(genId, `Trying ${p.name}`);
        await p.fn();
        return; // success
      } catch (err) {
        log(genId, `${p.name} failed: ${err}`);
        await markStep(genId, { multiviewImageUrl: null });
      }
    }

    // Should never reach here because Fallback/GLTF always works
    throw new Error("All pipelines failed (including fallback)");
  } catch (err) {
    log(genId, `Fatal: ${err}`);
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

// ─── SSE live-progress stream ─────────────────────────────────────────────────
// Client subscribes while generation is in progress; receives JSON patches
// as each pipeline step completes.

router.get("/generations/:id/stream", requireAuth, async (req: any, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).end(); return; }

  // SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("X-Accel-Buffering", "no"); // disable nginx buffering
  res.flushHeaders();

  // Send initial heartbeat
  res.write(": ping\n\n");

  // Register client
  if (!sseClients.has(id)) sseClients.set(id, new Set());
  sseClients.get(id)!.add(res);

  // Heartbeat every 15s to keep connection alive
  const heartbeat = setInterval(() => {
    try { res.write(": ping\n\n"); } catch { clearInterval(heartbeat); }
  }, 15_000);

  // Cleanup on disconnect
  req.on("close", () => {
    clearInterval(heartbeat);
    sseClients.get(id)?.delete(res);
  });
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

  // Fire-and-forget
  runAiProcessing(gen.id, gen.uploadedImageUrl);

  const [updated] = await db.select().from(generationsTable).where(eq(generationsTable.id, gen.id));
  res.json(ProcessGenerationResponse.parse(updated));
});

export default router;
