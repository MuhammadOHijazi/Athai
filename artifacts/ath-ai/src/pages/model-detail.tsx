import { useEffect } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { useGetGeneration, getGetGenerationQueryKey } from "@workspace/api-client-react";
import { useParams, Link } from "wouter";
import { ModelViewer } from "@/components/3d/model-viewer";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Download, ArrowLeft, Loader2, AlertCircle } from "lucide-react";
import { format } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";

export default function ModelDetail() {
  const params = useParams();
  const id = parseInt(params.id || "0", 10);
  const queryClient = useQueryClient();

  const { data: generation, isLoading, isError } = useGetGeneration(id, {
    query: {
      enabled: !!id,
      queryKey: getGetGenerationQueryKey(id)
    }
  });

  // Poll status if pending or processing
  useEffect(() => {
    if (!generation) return;
    
    let interval: number;
    if (generation.status === "pending" || generation.status === "processing") {
      interval = window.setInterval(() => {
        queryClient.invalidateQueries({ queryKey: getGetGenerationQueryKey(id) });
      }, 3000);
    }

    return () => {
      if (interval) window.clearInterval(interval);
    };
  }, [generation?.status, id, queryClient]);

  if (isLoading) {
    return (
      <AppLayout>
        <div className="space-y-6 animate-pulse">
          <div className="h-8 w-1/4 bg-muted rounded"></div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 h-[600px] bg-muted rounded-xl"></div>
            <div className="space-y-4">
              <div className="h-40 bg-muted rounded-xl"></div>
              <div className="h-40 bg-muted rounded-xl"></div>
            </div>
          </div>
        </div>
      </AppLayout>
    );
  }

  if (isError || !generation) {
    return (
      <AppLayout>
        <div className="p-12 text-center flex flex-col items-center">
          <AlertCircle className="h-12 w-12 text-destructive mb-4" />
          <h2 className="text-xl font-bold">Model not found</h2>
          <p className="text-muted-foreground mt-2">This model may have been deleted or doesn't exist.</p>
          <Link href="/models" className="mt-6">
            <Button variant="outline">Back to Models</Button>
          </Link>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6 h-full flex flex-col max-h-screen pb-6">
        <div className="flex items-center justify-between shrink-0">
          <div className="flex items-center gap-4">
            <Link href="/models">
              <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl font-bold tracking-tight flex items-center gap-3">
                {generation.title}
                <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  generation.status === 'completed' ? 'bg-green-500/10 text-green-500' :
                  generation.status === 'failed' ? 'bg-destructive/10 text-destructive' :
                  'bg-accent/10 text-accent animate-pulse'
                }`}>
                  {generation.status}
                </span>
              </h1>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 min-h-0">
          <div className="lg:col-span-2 rounded-xl overflow-hidden border border-border bg-[#111] relative min-h-[400px] lg:min-h-0">
            {generation.status === 'completed' || generation.status === 'processing' || generation.status === 'pending' ? (
              <>
                <ModelViewer glbUrl={generation.modelGlbUrl} />
                {(generation.status === 'pending' || generation.status === 'processing') && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm z-10 text-white">
                    <Loader2 className="h-10 w-10 animate-spin text-accent mb-4" />
                    <h3 className="text-lg font-medium">Generating 3D Model...</h3>
                    <p className="text-sm text-white/70 mt-2 max-w-sm text-center">
                      Our AI is analyzing the geometry and generating the model. This typically takes 1-2 minutes.
                    </p>
                  </div>
                )}
              </>
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center p-8 text-center text-muted-foreground bg-muted/10">
                <AlertCircle className="h-10 w-10 text-destructive mb-4" />
                <p className="font-medium text-destructive">Generation Failed</p>
                <p className="text-sm mt-2 max-w-xs">We couldn't generate a 3D model from this image. Please try again with a clearer photo.</p>
              </div>
            )}
          </div>

          <div className="space-y-6 overflow-y-auto">
            <Card>
              <CardContent className="p-6 space-y-6">
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">Reference Image</h3>
                  <div className="rounded-lg overflow-hidden border border-border/50 bg-muted aspect-square">
                    {generation.uploadedImageUrl ? (
                      <img src={generation.uploadedImageUrl} alt="Reference" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">No image</div>
                    )}
                  </div>
                </div>

                <div className="space-y-4 pt-4 border-t border-border/50">
                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground mb-1">Details</h3>
                    {generation.furnitureType && <p className="text-sm"><span className="font-medium">Type:</span> {generation.furnitureType}</p>}
                    {generation.description && <p className="text-sm mt-1 text-muted-foreground">{generation.description}</p>}
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">
                      Created on {format(new Date(generation.createdAt), "MMMM d, yyyy 'at' h:mm a")}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6 space-y-4">
                <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Export Assets</h3>
                <div className="space-y-2">
                  <Button 
                    variant="outline" 
                    className="w-full justify-start" 
                    disabled={!generation.modelGlbUrl}
                    onClick={() => generation.modelGlbUrl && window.open(generation.modelGlbUrl, '_blank')}
                  >
                    <Download className="mr-2 h-4 w-4" />
                    Download GLB
                  </Button>
                  <Button 
                    variant="outline" 
                    className="w-full justify-start" 
                    disabled={!generation.modelObjUrl}
                    onClick={() => generation.modelObjUrl && window.open(generation.modelObjUrl, '_blank')}
                  >
                    <Download className="mr-2 h-4 w-4" />
                    Download OBJ
                  </Button>
                  <Button 
                    variant="outline" 
                    className="w-full justify-start" 
                    disabled={!generation.modelUsdzUrl}
                    onClick={() => generation.modelUsdzUrl && window.open(generation.modelUsdzUrl, '_blank')}
                  >
                    <Download className="mr-2 h-4 w-4" />
                    Download USDZ (AR)
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
