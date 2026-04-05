import { useEffect } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { useGetGeneration, useProcessGeneration, getGetGenerationQueryKey } from "@workspace/api-client-react";
import { useParams, Link } from "wouter";
import { ModelViewer } from "@/components/3d/model-viewer";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Download, ArrowLeft, Loader2, AlertCircle, CheckCircle2, Box, RefreshCw } from "lucide-react";
import { format } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";

function downloadDataUrl(dataUrl: string, filename: string) {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

function ExportButton({
  label,
  ext,
  url,
  isComplete,
}: {
  label: string;
  ext: string;
  url: string | null | undefined;
  isComplete: boolean;
}) {
  const canDownload = isComplete && !!url;

  const handleClick = () => {
    if (!url) return;
    if (url.startsWith("data:")) {
      downloadDataUrl(url, `model.${ext.toLowerCase()}`);
    } else {
      window.open(url, "_blank");
    }
  };

  return (
    <Button
      variant="outline"
      className="w-full justify-between group"
      disabled={!canDownload}
      onClick={handleClick}
    >
      <div className="flex items-center gap-2">
        <Download className="h-4 w-4" />
        <span className="font-medium">{label}</span>
      </div>
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono">.{ext}</span>
    </Button>
  );
}

export default function ModelDetail() {
  const params = useParams();
  const id = parseInt(params.id || "0", 10);
  const queryClient = useQueryClient();

  const { data: generation, isLoading, isError } = useGetGeneration(id, {
    query: {
      enabled: !!id,
      queryKey: getGetGenerationQueryKey(id),
    },
  });

  const processGeneration = useProcessGeneration();

  // Poll status while pending or processing
  useEffect(() => {
    if (!generation) return;
    if (generation.status !== "pending" && generation.status !== "processing") return;

    const interval = window.setInterval(() => {
      queryClient.invalidateQueries({ queryKey: getGetGenerationQueryKey(id) });
    }, 3000);

    return () => window.clearInterval(interval);
  }, [generation?.status, id, queryClient]);

  if (isLoading) {
    return (
      <AppLayout>
        <div className="space-y-6">
          <div className="flex items-center gap-4">
            <Skeleton className="h-8 w-8 rounded-full" />
            <Skeleton className="h-7 w-48" />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Skeleton className="lg:col-span-2 h-[520px] rounded-xl" />
            <div className="space-y-4">
              <Skeleton className="h-48 rounded-xl" />
              <Skeleton className="h-40 rounded-xl" />
            </div>
          </div>
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
          <p className="text-muted-foreground mt-2">This model may have been deleted or doesn't exist.</p>
          <Link href="/models" className="mt-6">
            <Button variant="outline">Back to My Models</Button>
          </Link>
        </div>
      </AppLayout>
    );
  }

  const isComplete = generation.status === "completed";
  const isFailed = generation.status === "failed";
  const isWorking = generation.status === "pending" || generation.status === "processing";

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
            <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium shrink-0 ${
              isComplete ? "bg-green-500/10 text-green-400 border-green-500/20" :
              isFailed ? "bg-red-500/10 text-red-400 border-red-500/20" :
              "bg-accent/10 text-accent border-accent/20 animate-pulse"
            }`}>
              {isWorking && <Loader2 className="h-3 w-3 animate-spin" />}
              {isComplete && <CheckCircle2 className="h-3 w-3" />}
              {isFailed && <AlertCircle className="h-3 w-3" />}
              {generation.status}
            </span>
          </div>
        </div>

        {/* Main grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* 3D Viewer */}
          <div className="lg:col-span-2 rounded-xl overflow-hidden border border-border bg-[#0d0d0d] relative" style={{ minHeight: 480 }}>
            {!isFailed ? (
              <>
                <ModelViewer glbUrl={generation.modelGlbUrl ?? null} />
                {isWorking && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 backdrop-blur-sm z-10 text-white">
                    <div className="relative mb-6">
                      <div className="h-16 w-16 rounded-full border-2 border-accent/30 animate-ping absolute inset-0" />
                      <div className="h-16 w-16 rounded-full border-2 border-accent/60 flex items-center justify-center relative">
                        <Loader2 className="h-7 w-7 text-accent animate-spin" />
                      </div>
                    </div>
                    <h3 className="text-lg font-semibold mb-2">
                      {generation.status === "pending" ? "Queued for processing..." : "Generating 3D model..."}
                    </h3>
                    <p className="text-sm text-white/60 max-w-xs text-center">
                      {generation.status === "pending"
                        ? "Your job is in the queue. It will start shortly."
                        : "AI is removing the background and building your 3D model. This takes 60–120 seconds."}
                    </p>
                    <div className="mt-6 flex gap-1">
                      {[0, 1, 2].map((i) => (
                        <div
                          key={i}
                          className="h-1.5 w-1.5 rounded-full bg-accent/60 animate-bounce"
                          style={{ animationDelay: `${i * 0.2}s` }}
                        />
                      ))}
                    </div>
                  </div>
                )}
                {isComplete && (
                  <div className="absolute top-4 left-4 z-10">
                    <div className="flex items-center gap-1.5 rounded-full bg-black/60 backdrop-blur-md border border-white/10 px-3 py-1 text-xs text-white/80">
                      <Box className="h-3 w-3" />
                      Drag to rotate · Scroll to zoom
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center p-8 text-center" style={{ minHeight: 480 }}>
                <div className="h-16 w-16 rounded-full bg-red-500/10 flex items-center justify-center mb-5">
                  <AlertCircle className="h-8 w-8 text-red-400" />
                </div>
                <p className="font-semibold text-lg text-foreground mb-2">Generation failed</p>
                <p className="text-sm text-muted-foreground max-w-xs leading-relaxed">
                  The AI pipeline couldn't build a 3D model from this image. This can happen with complex backgrounds, low resolution, or API timeouts.
                </p>
                <div className="flex flex-col sm:flex-row items-center gap-3 mt-6">
                  <Button
                    variant="default"
                    className="gap-2 bg-foreground text-background hover:bg-foreground/90"
                    disabled={processGeneration.isPending}
                    onClick={async () => {
                      await processGeneration.mutateAsync({ id });
                      queryClient.invalidateQueries({ queryKey: getGetGenerationQueryKey(id) });
                    }}
                  >
                    {processGeneration.isPending ? (
                      <><Loader2 className="h-4 w-4 animate-spin" /> Retrying...</>
                    ) : (
                      <><RefreshCw className="h-4 w-4" /> Retry generation</>
                    )}
                  </Button>
                  <Link href="/generate">
                    <Button variant="outline">Upload new photo</Button>
                  </Link>
                </div>
              </div>
            )}
          </div>

          {/* Right panel */}
          <div className="space-y-4 overflow-y-auto">
            {/* Reference image + details */}
            <Card className="border-border/50">
              <CardContent className="p-5 space-y-5">
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Reference Photo</h3>
                  <div className="rounded-lg overflow-hidden border border-border/40 bg-muted aspect-square">
                    {generation.uploadedImageUrl ? (
                      <img
                        src={generation.uploadedImageUrl}
                        alt="Reference"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Box className="h-8 w-8 text-muted-foreground/30" />
                      </div>
                    )}
                  </div>
                </div>

                <div className="border-t border-border/40 pt-4 space-y-2.5">
                  {generation.furnitureType && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Type</span>
                      <span className="font-medium">{generation.furnitureType}</span>
                    </div>
                  )}
                  {generation.description && (
                    <p className="text-xs text-muted-foreground leading-relaxed">{generation.description}</p>
                  )}
                  <div className="flex justify-between text-xs text-muted-foreground pt-1">
                    <span>Created</span>
                    <span>{format(new Date(generation.createdAt), "MMM d, yyyy")}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Export */}
            <Card className="border-border/50">
              <CardContent className="p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Export Assets</h3>
                  {!isComplete && (
                    <span className="text-[10px] text-muted-foreground">Available after generation</span>
                  )}
                </div>

                <div className="space-y-2">
                  <ExportButton label="3D Model" ext="GLB" url={generation.modelGlbUrl} isComplete={isComplete} />
                  <ExportButton label="Wavefront" ext="OBJ" url={generation.modelObjUrl} isComplete={isComplete} />
                  <ExportButton label="AR Quick Look" ext="USDZ" url={generation.modelUsdzUrl} isComplete={isComplete} />
                </div>

                {isComplete && (
                  <motion.p
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-center gap-1.5 text-xs text-green-400"
                  >
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
