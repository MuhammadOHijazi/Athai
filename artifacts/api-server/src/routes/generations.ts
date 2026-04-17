import { Router, type IRouter, type Response } from "express";
import { eq, and, desc } from "drizzle-orm";
import { getAuth } from "@clerk/express";
import { spawn } from "child_process";
import path from "path";
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
const APP_JSON = "application/json";

const providerConfig = {
  modelProviderPrimary: process.env.MODEL_PROVIDER_PRIMARY ?? "hf_sigmitch",
  hfSpaceIdPrimary: process.env.HF_SPACE_ID_PRIMARY ?? "SIGMitch/InstantMesh",
  hfSpaceBaseUrlPrimary: (process.env.HF_SPACE_BASE_URL_PRIMARY ?? "https://sigmitch-instantmesh.hf.space").replace(/\/$/, ""),
  hfTimeoutSubmitMs: Number(process.env.HF_TIMEOUT_SUBMIT_MS ?? 30_000),
  hfTimeoutJobMs: Number(process.env.HF_TIMEOUT_JOB_MS ?? 12 * 60_000),
  hfRetryMax: Number(process.env.HF_RETRY_MAX ?? 3),
  hfPollBaseMs: Number(process.env.HF_POLL_BASE_MS ?? 3_000),
  hfPollMaxMs: Number(process.env.HF_POLL_MAX_MS ?? 15_000),
  sigmitchSampleSteps: Number(process.env.SIGMITCH_SAMPLE_STEPS ?? 75),
  sigmitchSampleSeed: Number(process.env.SIGMITCH_SAMPLE_SEED ?? 42),
};

type FailureCode =
  | "HF_SUBMIT_TIMEOUT"
  | "HF_QUEUE_TIMEOUT"
  | "HF_SCHEMA_MISMATCH"
  | "HF_FILE_RESOLVE_FAILED"
  | "HF_BRIDGE_FAILED"
  | "REMOVE_BG_FAILED";

class PipelineError extends Error {
  constructor(
    public readonly code: FailureCode,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "PipelineError";
  }
}

type GenerationTraceEvent = {
  at: string;
  stage: string;
  status: "info" | "error";
  message: string;
  code?: FailureCode;
};

const generationTraceStore = new Map<number, GenerationTraceEvent[]>();
const TRACE_LIMIT = 120;

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

function resetTrace(genId: number) {
  generationTraceStore.set(genId, []);
}

function recordTrace(genId: number, event: Omit<GenerationTraceEvent, "at">) {
  const trace = generationTraceStore.get(genId) ?? [];
  trace.push({
    at: new Date().toISOString(),
    ...event,
  });
  if (trace.length > TRACE_LIMIT) {
    trace.splice(0, trace.length - TRACE_LIMIT);
  }
  generationTraceStore.set(genId, trace);
}

function getTrace(genId: number) {
  return generationTraceStore.get(genId) ?? [];
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

// ─── HF Gradio Spaces (fallback) ─────────────────────────────────────────────

function normalizeToArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (value == null) return [];
  return [value];
}

function parseSsePayload(raw: string): unknown[] {
  const lines = raw.split("\n");
  const allDataPayloads: string[] = [];
  let completePayload: string | null = null;
  let currentEvent = "";
  for (const line of lines) {
    if (line.startsWith("event:")) {
      currentEvent = line.slice(6).trim();
      continue;
    }
    if (!line.startsWith("data:")) continue;
    const payload = line.slice(5).trim();
    if (currentEvent === "error") {
      throw new PipelineError("HF_SCHEMA_MISMATCH", `Gradio error event: ${payload}`);
    }
    if (currentEvent === "complete") {
      completePayload = payload;
    }
    allDataPayloads.push(payload);
  }

  if (completePayload) {
    try {
      const parsed = JSON.parse(completePayload) as Record<string, unknown>;
      if (Array.isArray(parsed.data)) return parsed.data;
      if ("data" in parsed) return normalizeToArray(parsed.data);
      return normalizeToArray(parsed);
    } catch {
      return normalizeToArray(completePayload);
    }
  }

  // Handle cases where endpoint returns direct JSON without SSE framing.
  const trimmed = raw.trim();
  if (!trimmed) return [];
  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    if (Array.isArray(parsed.data)) return parsed.data;
    if ("data" in parsed) return normalizeToArray(parsed.data);
    return normalizeToArray(parsed);
  } catch {
    if (allDataPayloads.length > 0) return allDataPayloads;
    return [trimmed];
  }
}

async function callGradioSSE(
  genId: number,
  spaceUrl: string,
  apiName: string,
  data: unknown[],
  timeoutMs = providerConfig.hfTimeoutJobMs,
  sessionHash?: string,
): Promise<unknown[]> {
  const hfToken = process.env.HF_TOKEN;
  const authH: Record<string, string> = hfToken ? { Authorization: `Bearer ${hfToken}` } : {};

  let submitAttempt = 0;
  let eventId: string | null = null;
  while (submitAttempt < providerConfig.hfRetryMax) {
    submitAttempt += 1;
    try {
      const reqBody: Record<string, unknown> = { data };
      if (sessionHash) reqBody.session_hash = sessionHash;
      const submitRes = await fetch(`${spaceUrl}/call/${apiName}`, {
        method: "POST",
        headers: { "Content-Type": APP_JSON, ...authH },
        body: JSON.stringify(reqBody),
        signal: AbortSignal.timeout(providerConfig.hfTimeoutSubmitMs),
      });
      if (!submitRes.ok) {
        const t = await submitRes.text();
        if (submitRes.status >= 500 && submitAttempt < providerConfig.hfRetryMax) {
          const waitMs = Math.min(providerConfig.hfPollMaxMs, providerConfig.hfPollBaseMs * submitAttempt);
          recordTrace(genId, { stage: "hf_submit", status: "info", message: `Retry submit ${submitAttempt}/${providerConfig.hfRetryMax} after ${submitRes.status}` });
          await new Promise((r) => setTimeout(r, waitMs));
          continue;
        }
        throw new PipelineError("HF_SCHEMA_MISMATCH", `Gradio [${apiName}] ${submitRes.status}: ${t.slice(0, 240)}`);
      }
      const parsed = (await submitRes.json()) as { event_id?: string };
      if (!parsed.event_id) {
        throw new PipelineError("HF_SCHEMA_MISMATCH", `Missing event_id for ${apiName}`);
      }
      eventId = parsed.event_id;
      break;
    } catch (err) {
      const isTimeout = err instanceof Error && err.name === "TimeoutError";
      if (isTimeout && submitAttempt < providerConfig.hfRetryMax) {
        const waitMs = Math.min(providerConfig.hfPollMaxMs, providerConfig.hfPollBaseMs * submitAttempt);
        recordTrace(genId, { stage: "hf_submit", status: "info", message: `Timeout retry ${submitAttempt}/${providerConfig.hfRetryMax}` });
        await new Promise((r) => setTimeout(r, waitMs));
        continue;
      }
      if (isTimeout) throw new PipelineError("HF_SUBMIT_TIMEOUT", `HF submit timeout for ${apiName}`);
      throw err;
    }
  }

  if (!eventId) {
    throw new PipelineError("HF_SUBMIT_TIMEOUT", `Unable to submit ${apiName}`);
  }

  // ZeroGPU keeps the SSE stream open until the job finishes (can be 5+ min in queue).
  // Use the full remaining timeout for each stream fetch so we don't prematurely cut it.
  const startedAt = Date.now();
  let pollAttempt = 0;
  while (Date.now() - startedAt < timeoutMs) {
    pollAttempt += 1;
    const remainingMs = Math.max(15_000, timeoutMs - (Date.now() - startedAt));
    try {
      const pollRes = await fetch(`${spaceUrl}/call/${apiName}/${eventId}`, {
        headers: authH,
        signal: AbortSignal.timeout(remainingMs),
      });
      if (!pollRes.ok) {
        if (pollRes.status >= 500) {
          recordTrace(genId, { stage: "hf_poll", status: "info", message: `Transient poll ${pollRes.status}; retrying` });
          await new Promise((r) => setTimeout(r, providerConfig.hfPollBaseMs));
          continue;
        }
        const txt = await pollRes.text();
        throw new PipelineError("HF_SCHEMA_MISMATCH", `Gradio poll ${pollRes.status}: ${txt.slice(0, 240)}`);
      }
      const raw = await pollRes.text();
      const parsed = parseSsePayload(raw);
      if (parsed.length > 0) {
        return parsed;
      }
      // Empty response (only heartbeats) — ZeroGPU may still be queueing, retry
      if (pollAttempt % 3 === 0) {
        recordTrace(genId, { stage: "hf_poll", status: "info", message: `Still waiting for ${apiName} (attempt ${pollAttempt})` });
      }
    } catch (err) {
      // Retry on timeouts AND connection resets (TypeError: terminated from ZeroGPU queue drops)
      const isRetryable =
        (err instanceof Error && err.name === "TimeoutError") ||
        (err instanceof TypeError && (err.message.includes("terminated") || err.message.includes("network")));
      if (!isRetryable) throw err;
      recordTrace(genId, { stage: "hf_poll", status: "info", message: `Poll interrupted on attempt ${pollAttempt}: ${err.message}; retrying` });
      await new Promise((r) => setTimeout(r, providerConfig.hfPollBaseMs));
    }
  }

  throw new PipelineError("HF_QUEUE_TIMEOUT", `Gradio [${apiName}] exceeded timeout`);
}

function fileDataInput(base64: string) {
  const pureB64 = base64.replace(/^data:image\/\w+;base64,/, "");
  return { path: "input.png", url: `data:image/png;base64,${pureB64}`, orig_name: "input.png", mime_type: "image/png", meta: { _type: "gradio.FileData" } };
}

async function resolveGradioFile(output: unknown, spaceUrl: string): Promise<string | null> {
  if (!output) return null;
  const hfH: Record<string, string> = {};
  if (process.env.HF_TOKEN) {
    hfH.Authorization = `Bearer ${process.env.HF_TOKEN}`;
  }
  let rawUrl: string;
  if (typeof output === "string") {
    rawUrl = output.startsWith("data:") || output.startsWith("http") ? output : `${spaceUrl}/file=${output.replace(/^\//, "")}`;
  } else {
    const o = output as Record<string, unknown>;
    rawUrl = (o.url ?? (o.path ? `${spaceUrl}/file=${String(o.path).replace(/^\//, "")}` : o.name ? `${spaceUrl}/file=${String(o.name).replace(/^\//, "")}` : null)) as string;
  }
  if (!rawUrl) return null;
  if (rawUrl.startsWith("data:")) return rawUrl;
  try {
    return await downloadAsDataUrl(rawUrl, hfH);
  } catch {
    return rawUrl;
  }
}

function ensureOutput(stage: string, value: unknown): unknown {
  if (value == null || value === "") {
    throw new PipelineError("HF_SCHEMA_MISMATCH", `Missing output for ${stage}`);
  }
  return value;
}

/** Run the full InstantMesh pipeline via a Python subprocess (gradio_client). */
async function runHfSigmitchInstantMesh(genId: number, cleanImg: string): Promise<void> {
  recordTrace(genId, { stage: "provider_select", status: "info", message: `Provider python-bridge (SIGMitch/InstantMesh)` });
  log(genId, "SIGMitch/InstantMesh → python bridge");

  // Bridge script lives next to this source file; use package root to resolve it
  // (works in both dev ts-node and compiled ESM output)
  const bridgePath = path.resolve(process.cwd(), "artifacts/api-server/src/instantmesh_bridge.py");
  const timeoutMs = providerConfig.hfTimeoutJobMs;

  const result = await new Promise<{ multiviewImageB64?: string; modelObjB64?: string; modelGlbB64?: string; error?: string }>(
    (resolve, reject) => {
      const env: NodeJS.ProcessEnv = {
        ...process.env,
        HF_SPACE_ID: providerConfig.hfSpaceIdPrimary,
        SIGMITCH_SAMPLE_STEPS: String(providerConfig.sigmitchSampleSteps),
        SIGMITCH_SAMPLE_SEED: String(providerConfig.sigmitchSampleSeed),
      };

      const proc = spawn("python3", [bridgePath], { env });

      let stdout = "";
      let stderr = "";

      proc.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
      proc.stderr.on("data", (chunk: Buffer) => {
        const line = chunk.toString();
        stderr += line;
        // Forward bridge progress lines to trace
        for (const l of line.split("\n")) {
          if (l.trim()) log(genId, `[bridge] ${l.trim()}`);
        }
      });

      const timer = setTimeout(() => {
        proc.kill("SIGTERM");
        reject(new PipelineError("HF_QUEUE_TIMEOUT", `Python bridge exceeded ${timeoutMs}ms timeout`));
      }, timeoutMs);

      proc.on("close", (code) => {
        clearTimeout(timer);
        if (code !== 0 && !stdout.trim()) {
          reject(new PipelineError("HF_BRIDGE_FAILED", `Python bridge exited ${code}: ${stderr.slice(-400)}`));
          return;
        }
        try {
          const lines = stdout.trim().split("\n");
          const jsonLine = lines.filter((l) => l.startsWith("{")).pop() ?? lines[lines.length - 1];
          resolve(JSON.parse(jsonLine));
        } catch (e) {
          reject(new PipelineError("HF_BRIDGE_FAILED", `Could not parse bridge output: ${stdout.slice(-400)}`));
        }
      });

      proc.on("error", (err) => {
        clearTimeout(timer);
        reject(new PipelineError("HF_BRIDGE_FAILED", `Could not spawn python3: ${err.message}`));
      });

      // Write base64 image to stdin and close
      const pureB64 = cleanImg.replace(/^data:image\/\w+;base64,/, "");
      proc.stdin.write(pureB64, "utf8");
      proc.stdin.end();
    }
  );

  if (result.error) {
    throw new PipelineError("HF_BRIDGE_FAILED", result.error);
  }

  if (result.multiviewImageB64) {
    await markStep(genId, { multiviewImageUrl: result.multiviewImageB64 });
    recordTrace(genId, { stage: "sigmitch_generate_mvs", status: "info", message: "Multi-view generation completed" });
  }

  if (!result.modelGlbB64) {
    throw new PipelineError("HF_FILE_RESOLVE_FAILED", "make3d: no GLB artifact from bridge");
  }

  await markStep(genId, {
    status: "completed",
    modelGlbUrl: result.modelGlbB64,
    modelObjUrl: result.modelObjB64 ?? null,
  });
  recordTrace(genId, { stage: "sigmitch_make3d", status: "info", message: "SIGMitch returned mesh artifacts" });
  log(genId, "SIGMitch/InstantMesh done ✓");
}

// ─── Full AI pipeline ─────────────────────────────────────────────────────────

async function runAiProcessing(genId: number, imageBase64: string): Promise<void> {
  log(genId, "Starting AI pipeline");
  resetTrace(genId);
  recordTrace(genId, { stage: "pipeline", status: "info", message: "Pipeline started" });
  try {
    await markStep(genId, { status: "processing" });

    // Step 1: Background removal
    let cleanImg = imageBase64;
    try {
      log(genId, "remove.bg →");
      cleanImg = await removeBackground(imageBase64);
      await markStep(genId, { previewImageUrl: cleanImg });
      log(genId, "remove.bg done ✓");
      recordTrace(genId, { stage: "remove_bg", status: "info", message: "Background removed successfully" });
    } catch (err) {
      log(genId, `remove.bg failed, using original: ${err}`);
      const msg = err instanceof Error ? err.message : String(err);
      recordTrace(genId, { stage: "remove_bg", status: "error", code: "REMOVE_BG_FAILED", message: msg });
    }

    // Step 2: 3D generation — HF primary with offline fallback
    const pipelines: { name: string; fn: () => Promise<void> }[] = [
      { name: "HF/SIGMitch-InstantMesh", fn: () => runHfSigmitchInstantMesh(genId, cleanImg) },
      // Always-available fallback: textured GLTF plane from the bg-removed image
      { name: "Fallback/GLTF", fn: () => runFallbackGltf(genId, cleanImg) },
    ];

    for (const p of pipelines) {
      try {
        log(genId, `Trying ${p.name}`);
        recordTrace(genId, { stage: "pipeline", status: "info", message: `Trying ${p.name}` });
        await p.fn();
        recordTrace(genId, { stage: "pipeline", status: "info", message: `${p.name} succeeded` });
        return; // success
      } catch (err) {
        log(genId, `${p.name} failed: ${err}`);
        const code =
          err instanceof PipelineError
            ? err.code
            : "HF_SCHEMA_MISMATCH";
        const message = err instanceof Error ? err.message : String(err);
        recordTrace(genId, { stage: "pipeline", status: "error", code, message: `${p.name} failed: ${message}` });
        await markStep(genId, { multiviewImageUrl: null });
      }
    }

    // Should never reach here because Fallback/GLTF always works
    throw new Error("All pipelines failed (including fallback)");
  } catch (err) {
    log(genId, `Fatal: ${err}`);
    const message = err instanceof Error ? err.message : String(err);
    recordTrace(genId, { stage: "pipeline", status: "error", message: `Fatal: ${message}` });
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

router.get("/generations/:id/debug", requireAuth, async (req: any, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const [gen] = await db
    .select()
    .from(generationsTable)
    .where(and(eq(generationsTable.id, id), eq(generationsTable.userId, req.userId)));
  if (!gen) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  res.json({
    generationId: id,
    status: gen.status,
    trace: getTrace(id),
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
    modelObjUrl: null,
    modelUsdzUrl: null,
  }).where(eq(generationsTable.id, gen.id));

  // Fire-and-forget
  runAiProcessing(gen.id, gen.uploadedImageUrl);

  const [updated] = await db.select().from(generationsTable).where(eq(generationsTable.id, gen.id));
  res.json(ProcessGenerationResponse.parse(updated));
});

export default router;
