import { AppLayout } from "@/components/layout/app-layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { PlusSquare, Box, CheckCircle2, Clock, Loader2, ArrowRight, Sparkles } from "lucide-react";
import { useGetDashboardSummary, useGetRecentGenerations } from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { useUser } from "@clerk/react";
import { motion } from "framer-motion";

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  visible: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.07, duration: 0.4, ease: "easeOut" } }),
};

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    completed: "bg-green-500/10 text-green-400 border-green-500/20",
    failed: "bg-red-500/10 text-red-400 border-red-500/20",
    processing: "bg-accent/10 text-accent border-accent/20 animate-pulse",
    pending: "bg-muted text-muted-foreground border-border",
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${map[status] || map.pending}`}>
      {status}
    </span>
  );
}

export default function Dashboard() {
  const { user } = useUser();
  const { data: summary, isLoading: isLoadingSummary } = useGetDashboardSummary();
  const { data: recentGenerations, isLoading: isLoadingRecent } = useGetRecentGenerations();

  const firstName = user?.firstName || "there";

  const stats = [
    { label: "Total Models", value: summary?.totalGenerations ?? 0, icon: Box, color: "text-foreground" },
    { label: "Completed", value: summary?.completedGenerations ?? 0, icon: CheckCircle2, color: "text-green-400" },
    { label: "Processing", value: summary?.processingGenerations ?? 0, icon: Loader2, color: "text-accent" },
    { label: "Pending", value: summary?.pendingGenerations ?? 0, icon: Clock, color: "text-muted-foreground" },
  ];

  return (
    <AppLayout>
      <div className="space-y-10">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              Welcome back, {firstName}
            </h1>
            <p className="text-muted-foreground mt-1">Your 3D generation workspace.</p>
          </div>
          <Link href="/generate">
            <Button size="lg" className="gap-2 bg-foreground text-background hover:bg-foreground/90">
              <Sparkles className="h-4 w-4" />
              New Generation
            </Button>
          </Link>
        </div>

        {/* Stats */}
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
          {stats.map((s, i) => (
            <motion.div key={s.label} custom={i} initial="hidden" animate="visible" variants={fadeUp}>
              <Card className="border-border/50 hover:border-border transition-colors">
                <CardContent className="p-5">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{s.label}</span>
                    <s.icon className={`h-4 w-4 ${s.color}`} />
                  </div>
                  {isLoadingSummary ? (
                    <Skeleton className="h-8 w-12" />
                  ) : (
                    <span className="text-3xl font-bold tracking-tight">{s.value}</span>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>

        {/* How it works — shown when no generations */}
        {!isLoadingRecent && recentGenerations?.length === 0 && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="rounded-xl border border-dashed border-border bg-muted/10 p-10 text-center"
          >
            <div className="mx-auto h-14 w-14 rounded-full bg-muted flex items-center justify-center mb-5">
              <Box className="h-7 w-7 text-muted-foreground" />
            </div>
            <h2 className="text-xl font-semibold mb-2">No models yet</h2>
            <p className="text-muted-foreground max-w-sm mx-auto text-sm leading-relaxed mb-6">
              Upload a clear photo of any furniture. Our AI removes the background, builds a full 3D model, and saves it to your account.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-8">
              {[
                "Upload a furniture photo",
                "AI generates 3D model",
                "Download GLB / OBJ / USDZ",
              ].map((step, i) => (
                <div key={step} className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="h-5 w-5 rounded-full bg-accent/10 text-accent text-[10px] font-bold flex items-center justify-center shrink-0">
                    {i + 1}
                  </span>
                  {step}
                  {i < 2 && <ArrowRight className="h-3 w-3 text-border hidden sm:block" />}
                </div>
              ))}
            </div>
            <Link href="/generate">
              <Button size="lg" className="gap-2 bg-foreground text-background hover:bg-foreground/90">
                <Sparkles className="h-4 w-4" />
                Generate your first model
              </Button>
            </Link>
          </motion.div>
        )}

        {/* Recent activity */}
        {(isLoadingRecent || (recentGenerations && recentGenerations.length > 0)) && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold tracking-tight">Recent Activity</h2>
              <Link href="/models">
                <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground hover:text-foreground">
                  View all
                  <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </Link>
            </div>

            <Card className="border-border/50 overflow-hidden">
              <div className="divide-y divide-border/50">
                {isLoadingRecent
                  ? Array.from({ length: 4 }).map((_, i) => (
                      <div key={i} className="p-4 flex items-center gap-4">
                        <Skeleton className="h-12 w-12 rounded-lg shrink-0" />
                        <div className="space-y-2 flex-1">
                          <Skeleton className="h-4 w-1/3" />
                          <Skeleton className="h-3 w-1/5" />
                        </div>
                        <Skeleton className="h-5 w-16 rounded-full" />
                      </div>
                    ))
                  : recentGenerations?.map((gen, i) => (
                      <motion.div
                        key={gen.id}
                        custom={i}
                        initial="hidden"
                        animate="visible"
                        variants={fadeUp}
                      >
                        <Link href={`/models/${gen.id}`}>
                          <div className="p-4 flex items-center gap-4 hover:bg-muted/30 transition-colors cursor-pointer group">
                            <div className="h-12 w-12 rounded-lg bg-muted border border-border/50 flex items-center justify-center overflow-hidden shrink-0 group-hover:border-border transition-colors">
                              {gen.previewImageUrl || gen.uploadedImageUrl ? (
                                <img
                                  src={gen.previewImageUrl || gen.uploadedImageUrl || ""}
                                  alt={gen.title}
                                  className="h-full w-full object-cover"
                                />
                              ) : (
                                <Box className="h-5 w-5 text-muted-foreground/40" />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <h4 className="font-medium text-sm truncate group-hover:text-accent transition-colors">{gen.title}</h4>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {format(new Date(gen.createdAt), "MMM d, yyyy 'at' h:mm a")}
                                {gen.furnitureType && ` · ${gen.furnitureType}`}
                              </p>
                            </div>
                            <div className="flex items-center gap-3">
                              <StatusBadge status={gen.status} />
                              <ArrowRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors" />
                            </div>
                          </div>
                        </Link>
                      </motion.div>
                    ))}
              </div>
            </Card>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
