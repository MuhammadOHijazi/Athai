import { AppLayout } from "@/components/layout/app-layout";
import { useListGenerations } from "@workspace/api-client-react";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Box, PlusSquare, Loader2, CheckCircle2, AlertCircle, Clock } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";

const STATUS_CONFIG: Record<string, { label: string; classes: string; icon: React.ComponentType<any> }> = {
  completed: { label: "Completed", classes: "bg-green-500/15 text-green-400 border-green-500/25", icon: CheckCircle2 },
  failed: { label: "Failed", classes: "bg-red-500/15 text-red-400 border-red-500/25", icon: AlertCircle },
  processing: { label: "Processing", classes: "bg-accent/15 text-accent border-accent/25 animate-pulse", icon: Loader2 },
  pending: { label: "Pending", classes: "bg-muted text-muted-foreground border-border", icon: Clock },
};

export default function Models() {
  const { data: generations, isLoading } = useListGenerations();

  return (
    <AppLayout>
      <div className="space-y-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">My Models</h1>
            <p className="text-muted-foreground mt-1">All your generated 3D assets, saved to your account.</p>
          </div>
          <Link href="/generate">
            <Button size="lg" className="gap-2 bg-foreground text-background hover:bg-foreground/90">
              <PlusSquare className="h-4 w-4" />
              New Generation
            </Button>
          </Link>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {Array.from({ length: 6 }).map((_, i) => (
              <Card key={i} className="overflow-hidden border-border/50">
                <Skeleton className="h-48 w-full rounded-none" />
                <CardContent className="p-4 space-y-2">
                  <Skeleton className="h-5 w-2/3" />
                  <Skeleton className="h-3.5 w-1/3" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : generations?.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-14 border border-dashed border-border rounded-xl bg-muted/10 text-center">
            <div className="h-16 w-16 bg-muted rounded-full flex items-center justify-center mb-5">
              <Box className="h-8 w-8 text-muted-foreground/40" />
            </div>
            <h2 className="text-xl font-semibold mb-2">No models yet</h2>
            <p className="text-muted-foreground mb-6 text-center max-w-sm text-sm leading-relaxed">
              Upload a furniture photo and our AI will generate a full 3D model. It'll be saved here automatically.
            </p>
            <Link href="/generate">
              <Button size="lg" className="gap-2 bg-foreground text-background hover:bg-foreground/90">
                Generate your first model
              </Button>
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {generations?.map((gen, i) => {
              const cfg = STATUS_CONFIG[gen.status] ?? STATUS_CONFIG.pending;
              const StatusIcon = cfg.icon;
              return (
                <motion.div
                  key={gen.id}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05, duration: 0.35, ease: "easeOut" }}
                >
                  <Link href={`/models/${gen.id}`}>
                    <Card className="overflow-hidden cursor-pointer group hover:border-accent/60 border-border/50 transition-all duration-300 h-full flex flex-col">
                      <div className="h-48 w-full bg-muted relative overflow-hidden flex-shrink-0">
                        {gen.previewImageUrl || gen.uploadedImageUrl ? (
                          <img
                            src={gen.previewImageUrl || gen.uploadedImageUrl || ""}
                            alt={gen.title}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 ease-out"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Box className="h-10 w-10 text-muted-foreground/20" />
                          </div>
                        )}

                        {/* Hover overlay */}
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors duration-300" />

                        {/* Status badge */}
                        <div className="absolute top-3 right-3">
                          <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider backdrop-blur-md ${cfg.classes}`}>
                            <StatusIcon className="h-2.5 w-2.5" />
                            {cfg.label}
                          </span>
                        </div>
                      </div>

                      <CardContent className="p-4 flex-1 flex flex-col justify-between">
                        <div>
                          <h3 className="font-semibold text-base line-clamp-1 group-hover:text-accent transition-colors duration-200">{gen.title}</h3>
                          {gen.furnitureType && (
                            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{gen.furnitureType}</p>
                          )}
                        </div>
                        <div className="mt-3 pt-3 border-t border-border/40 flex items-center justify-between text-xs text-muted-foreground">
                          <span>{format(new Date(gen.createdAt), "MMM d, yyyy")}</span>
                          {gen.status === "completed" && (
                            <span className="text-green-400 flex items-center gap-1">
                              <CheckCircle2 className="h-3 w-3" /> Ready
                            </span>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
