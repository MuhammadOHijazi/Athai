import { useEffect, useRef, useCallback } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { useGetGeneration, useProcessGeneration, getGetGenerationQueryKey } from "@workspace/api-client-react";
import { useParams, Link } from "wouter";
import { ModelViewer } from "@/components/3d/model-viewer";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Download, ArrowLeft, Loader2, AlertCircle, CheckCircle2,
  Box, RefreshCw, ImageIcon, Layers, Sparkles, Upload, Zap
} from "lucide-react";
import { format } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import type { GetGenerationResponse } from "@workspace/api-client-react";
import { z } from "zod";

type Generation = z.infer<typeof GetGenerationResponse>;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function downloadDataUrl(dataUrl: string, filename: string) {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

type StepStatus = "waiting" | "active" | "done" | "skipped";

function inferStepStatuses(gen: Generation): [StepStatus, StepStatus, StepStatus, StepStatus] {
  const done  = gen.status === "completed";
  const failed = gen.status === "failed";
  const working = gen.status === "processing" || gen.status === "pending";
  const s1: StepStatus = "done";
  const s2: StepStatus = gen.previewImageUrl ? "done" : (working ? "active" : (failed ? "skipped" : "waiting"));
  const s3: StepStatus = gen.multiviewImageUrl ? "done"
    : (gen.previewImageUrl && working ? "active" : (gen.previewImageUrl && done ? "skipped" : "waiting"));
  const s4: StepStatus = done ? "done" : (failed ? "skipped" : (working ? "active" : "waiting"));
  return [s1, s2, s3, s4];
}

// ─── Step card ────────────────────────────────────────────────────────────────

function StepCard({ step, label, sublabel, status, imageUrl, icon: Icon, isLast }: {
  step: number; label: string; sublabel: string; status: StepStatus;
  imageUrl?: string | null; icon: React.ComponentType<any>; isLast?: boolean;
}) {
  const cfg = {
    waiting: { ring: "border-border/40", bg: "bg-muted/30", badge: "bg-muted text-muted-foreground", text: "Waiting" },
    active:  { ring: "border-accent/50",  bg: "bg-accent/5",  badge: "bg-accent/20 text-accent animate-pulse", text: "Processing…" },
    done:    { ring: "border-green-500/40", bg: "bg-green-500/5", badge: "bg-green-500/15 text-green-400", text: "Done" },
    skipped: { ring: "border-border/20", bg: "bg-muted/10", badge: "bg-muted/50 text-muted-foreground/50", text: "–" },
  }[status];

  return (
    <div className="flex items-stretch gap-0">
      <div className="flex-1 min-w-0">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: (step - 1) * 0.08 }}
          className={`rounded-xl border-2 ${cfg.ring} ${cfg.bg} overflow-hidden flex flex-col h-full transition-all duration-500`}
        >
          <div className="relative aspect-square bg-muted/20 flex items-center justify-center overflow-hidden">
            <AnimatePresence mode="wait">
              {imageUrl ? (
                <motion.img key={imageUrl.slice(-20)} src={imageUrl} alt={label}
                  initial={{ opacity: 0, scale: 1.04 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
                  transition={{ duration: 0.4 }} className="w-full h-full object-cover"
                />
              ) : (
                <motion.div key="placeholder" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  className="flex flex-col items-center gap-2 p-4 text-center">
                  {status === "active"
                    ? <Loader2 className="h-7 w-7 text-accent animate-spin" />
                    : <Icon className="h-7 w-7 text-muted-foreground/30" />}
                </motion.div>
              )}
            </AnimatePresence>
            {status === "done" && imageUrl && (
              <div className="absolute top-2 right-2 h-6 w-6 rounded-full bg-green-500/20 border border-green-500/40 flex items-center justify-center">
                <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />
              </div>
            )}
          </div>
          <div className="p-3 border-t border-border/30 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 mb-0.5">
                <span className="text-[10px] font-mono text-muted-foreground/50">{String(step).padStart(2, "0")}</span>
                <span className="text-xs font-semibold truncate">{label}</span>
              </div>
              <p className="text-[10px] text-muted-foreground leading-tight truncate">{sublabel}</p>
            </div>
            <span className={`shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${cfg.badge}`}>{cfg.text}</span>
          </div>
        </motion.div>
      </div>
      {!isLast && (
        <div className="flex items-center px-2 shrink-0">
          <div className={`h-px w-5 ${status === "done" ? "bg-green-500/40" : "bg-border/40"} transition-colors duration-500`} />
          <svg width="5" height="8" viewBox="0 0 5 8" className={status === "done" ? "text-green-500/40" : "text-border/40"}>
            <path d="M0 0L5 4L0 8Z" fill="currentColor" />
          </svg>
        </div>
      )}
    </div>
  );
}

// ─── Export button ─────────────────────────────────────────────────────────────

function ExportButton({ label, ext, url, isComplete }: { label: string; ext: string; url?: string | null; isComplete: boolean }) {
  return (
    <Button variant="outline" className="w-full justify-between" disabled={!isComplete || !url}
      onClick={() => { if (!url) return; url.startsWith("data:") ? downloadDataUrl(url, `model.${ext.toLowerCase()}`) : window.open(url, "_blank"); }}>
      <div className="flex items-center gap-2"><Download className="h-4 w-4" /><span className="font-medium">{label}</span></div>
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono">.{ext}</span>
    </Button>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ModelDetail() {
  const params = useParams();
  const id = parseInt(params.id || "0", 10);
  const queryClient = useQueryClient();
  const pollIntervalRef = useRef<number | null>(null);

  const { data: generation, isLoading, isError } = useGetGeneration(id, {
    query: { enabled: !!id, queryKey: getGetGenerationQueryKey(id) },
  });
  const processGeneration = useProcessGeneration();

  // Merge SSE patches directly into the React Query cache
  const applyPatch = useCallback((patch: Record<string, unknown>) => {
    queryClient.setQueryData(getGetGenerationQueryKey(id), (old: Generation | undefined) => {
      if (!old) return old;
      return { ...old, ...patch };
    });
  }, [id, queryClient]);

  // SSE subscriber — replaces polling, falls back to polling if SSE fails
  useEffect(() => {
    if (!generation) return;
    if (generation.status !== "pending" && generation.status !== "processing") {
      // Clear any stale poll interval
      if (pollIntervalRef.current) { clearInterval(pollIntervalRef.current); pollIntervalRef.current = null; }
      return;
    }

    let es: EventSource | null = null;
    let fallbackActive = false;

    function startFallbackPolling() {
      if (fallbackActive) return;
      fallbackActive = true;
      pollIntervalRef.current = window.setInterval(() => {
        queryClient.invalidateQueries({ queryKey: getGetGenerationQueryKey(id) });
      }, 3000);
    }

    try {
      es = new EventSource(`${basePath}/api/generations/${id}/stream`, { withCredentials: true });

      es.onmessage = (e) => {
        try {
          const patch = JSON.parse(e.data);
          applyPatch(patch);
          // If status is terminal, also do a full invalidate to ensure consistency
          if (patch.status === "completed" || patch.status === "failed") {
            queryClient.invalidateQueries({ queryKey: getGetGenerationQueryKey(id) });
          }
        } catch { /* ignore parse errors */ }
      };

      es.onerror = () => {
        es?.close();
        startFallbackPolling();
      };
    } catch {
      startFallbackPolling();
    }

    return () => {
      es?.close();
      if (pollIntervalRef.current) { clearInterval(pollIntervalRef.current); pollIntervalRef.current = null; }
    };
  }, [generation?.status, id, applyPatch, queryClient]);

  if (isLoading) {
    return (
      <AppLayout>
        <div className="space-y-6">
          <div className="flex items-center gap-4"><Skeleton className="h-8 w-8 rounded-full" /><Skeleton className="h-7 w-48" /></div>
          <div className="grid grid-cols-4 gap-3">{[0,1,2,3].map(i => <Skeleton key={i} className="aspect-square rounded-xl" />)}</div>
          <Skeleton className="h-[420px] rounded-xl" />
        </div>
      </AppLayout>
    );
  }

  if (isError || !generation) {
    return (
      <AppLayout>
        <div className="p-16 text-center flex flex-col items-center">
          <AlertCircle className="h-12 w-12 text-destructive mb-4" />
          <h2 className="text-xl font-bold">Model not found</h2>
          <Link href="/models" className="mt-6"><Button variant="outline">Back to My Models</Button></Link>
        </div>
      </AppLayout>
    );
  }

  const isComplete = generation.status === "completed";
  const isFailed   = generation.status === "failed";
  const isWorking  = generation.status === "pending" || generation.status === "processing";

  const [s1, s2, s3, s4] = inferStepStatuses(generation);

  // Detect whether the model is a full 3D reconstruction or the textured-plane fallback
  const isFallbackModel = isComplete && !!generation.modelGlbUrl &&
    generation.modelGlbUrl.includes("model/gltf") && !generation.multiviewImageUrl;

  const pipeline = [
    { step: 1, label: "Original Upload",       sublabel: "Your reference photo",   status: s1, imageUrl: generation.uploadedImageUrl, icon: Upload   },
    { step: 2, label: "Background Removed",     sublabel: "remove.bg API",          status: s2, imageUrl: generation.previewImageUrl,  icon: ImageIcon },
    { step: 3, label: "Multi-View Synthesis",   sublabel: "InstantMesh MVS",        status: s3, imageUrl: generation.multiviewImageUrl,icon: Layers    },
    { step: 4, label: isFallbackModel ? "Textured 3D Preview" : "3D Model Ready",
                  sublabel: isFallbackModel ? "Offline fallback (service temporarily busy)" : "GLB / OBJ / USDZ",
                  status: s4, imageUrl: null, icon: isFallbackModel ? Zap : Sparkles },
  ];

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Link href="/models">
            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full shrink-0">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div className="flex items-center gap-3 min-w-0">
            <h1 className="text-2xl font-bold tracking-tight truncate">{generation.title}</h1>
            <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium shrink-0 ${
              isComplete ? "bg-green-500/10 text-green-400 border-green-500/20" :
              isFailed   ? "bg-red-500/10 text-red-400 border-red-500/20" :
                           "bg-accent/10 text-accent border-accent/20"
            }`}>
              {isWorking  && <Loader2 className="h-3 w-3 animate-spin" />}
              {isComplete && <CheckCircle2 className="h-3 w-3" />}
              {isFailed   && <AlertCircle className="h-3 w-3" />}
              {isWorking ? "Generating…" : generation.status}
            </span>
          </div>
        </div>

        {/* ── Pipeline steps ── */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Generation Pipeline</p>
            {isWorking && (
              <span className="inline-flex items-center gap-1 text-[10px] text-accent font-medium">
                <span className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse" />
                Live updates
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 items-stretch">
            {pipeline.map((p, i) => (
              <StepCard key={p.step} {...p} isLast={i === pipeline.length - 1} />
            ))}
          </div>
          {isFallbackModel && (
            <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
              className="mt-3 flex items-start gap-2 rounded-lg bg-amber-500/8 border border-amber-500/20 p-3">
              <Zap className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-300/90 leading-relaxed">
                <span className="font-semibold">Textured preview mode</span> — The 3D generation service is temporarily busy. Your model will be a flat textured preview until the service recovers and you re-generate.
              </p>
            </motion.div>
          )}
        </div>

        {/* ── 3D Viewer + sidebar ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 rounded-xl overflow-hidden border border-border bg-[#0d0d0d] relative" style={{ minHeight: 420 }}>
            {isFailed ? (
              <div className="w-full h-full flex flex-col items-center justify-center p-8 text-center" style={{ minHeight: 420 }}>
                <div className="h-16 w-16 rounded-full bg-red-500/10 flex items-center justify-center mb-5">
                  <AlertCircle className="h-8 w-8 text-red-400" />
                </div>
                <p className="font-semibold text-lg mb-2">Generation failed</p>
                <p className="text-sm text-muted-foreground max-w-xs leading-relaxed">
                  Something went wrong at every stage of the pipeline. Check the server logs for details.
                </p>
                <div className="flex flex-col sm:flex-row gap-3 mt-6">
                  <Button className="gap-2 bg-foreground text-background hover:bg-foreground/90"
                    disabled={processGeneration.isPending}
                    onClick={async () => {
                      await processGeneration.mutateAsync({ id });
                      queryClient.invalidateQueries({ queryKey: getGetGenerationQueryKey(id) });
                    }}>
                    {processGeneration.isPending
                      ? <><Loader2 className="h-4 w-4 animate-spin" /> Retrying…</>
                      : <><RefreshCw className="h-4 w-4" /> Retry generation</>
                    }
                  </Button>
                  <Link href="/generate"><Button variant="outline">Upload new photo</Button></Link>
                </div>
              </div>
            ) : (
              <>
                <ModelViewer glbUrl={generation.modelGlbUrl ?? null} />
                {isWorking && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/75 backdrop-blur-sm z-10 text-white">
                    <div className="relative mb-6">
                      <div className="h-16 w-16 rounded-full border-2 border-accent/20 animate-ping absolute inset-0" />
                      <div className="h-16 w-16 rounded-full border-2 border-accent/50 flex items-center justify-center relative">
                        <Loader2 className="h-7 w-7 text-accent animate-spin" />
                      </div>
                    </div>
                    <h3 className="text-lg font-semibold mb-1">
                      {s2 === "active" ? "Removing background…" :
                       s3 === "active" ? "Generating multi-view…" :
                       "Building 3D mesh…"}
                    </h3>
                    <p className="text-sm text-white/50 max-w-xs text-center">
                      Each step above updates live as it completes.
                    </p>
                    <div className="flex gap-1 mt-5">
                      {[0,1,2].map(i => (
                        <div key={i} className="h-1.5 w-1.5 rounded-full bg-accent/50 animate-bounce" style={{ animationDelay: `${i*0.2}s` }} />
                      ))}
                    </div>
                  </div>
                )}
                {isComplete && (
                  <div className="absolute top-3 left-3 z-10">
                    <div className="flex items-center gap-1.5 rounded-full bg-black/60 backdrop-blur-md border border-white/10 px-3 py-1 text-xs text-white/70">
                      <Box className="h-3 w-3" />
                      {isFallbackModel ? "Textured 3D preview · " : ""}Drag to rotate · Scroll to zoom
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            <Card className="border-border/50">
              <CardContent className="p-5 space-y-4">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Details</h3>
                {generation.furnitureType && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Type</span>
                    <span className="font-medium">{generation.furnitureType}</span>
                  </div>
                )}
                {generation.description && (
                  <p className="text-xs text-muted-foreground leading-relaxed">{generation.description}</p>
                )}
                <div className="flex justify-between text-xs text-muted-foreground pt-2 border-t border-border/40">
                  <span>Created</span>
                  <span>{format(new Date(generation.createdAt), "MMM d, yyyy")}</span>
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/50">
              <CardContent className="p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Export Assets</h3>
                  {!isComplete && <span className="text-[10px] text-muted-foreground">Ready after generation</span>}
                </div>
                <div className="space-y-2">
                  <ExportButton label={isFallbackModel ? "3D Preview" : "3D Model"} ext={isFallbackModel ? "gltf" : "glb"}
                    url={generation.modelGlbUrl} isComplete={isComplete} />
                  <ExportButton label="Wavefront" ext="OBJ" url={generation.modelObjUrl} isComplete={isComplete} />
                  <ExportButton label="AR Quick Look" ext="USDZ" url={generation.modelUsdzUrl} isComplete={isComplete} />
                </div>
                {isComplete && (
                  <motion.p initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                    className="flex items-center gap-1.5 text-xs text-green-400">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Saved to your account
                  </motion.p>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
