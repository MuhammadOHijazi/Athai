import { AppLayout } from "@/components/layout/app-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { PlusSquare, Box, Clock, Activity, ArrowRight } from "lucide-react";
import { useGetDashboardSummary, useGetRecentGenerations } from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";

export default function Dashboard() {
  const { data: summary, isLoading: isLoadingSummary } = useGetDashboardSummary();
  const { data: recentGenerations, isLoading: isLoadingRecent } = useGetRecentGenerations();

  return (
    <AppLayout>
      <div className="space-y-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Overview</h1>
            <p className="text-muted-foreground mt-1">Your 3D generation activity and stats.</p>
          </div>
          <Link href="/generate">
            <Button className="gap-2">
              <PlusSquare className="h-4 w-4" />
              New Generation
            </Button>
          </Link>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Models</CardTitle>
              <Box className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {isLoadingSummary ? (
                <Skeleton className="h-7 w-16" />
              ) : (
                <div className="text-2xl font-bold">{summary?.totalGenerations || 0}</div>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Completed</CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {isLoadingSummary ? (
                <Skeleton className="h-7 w-16" />
              ) : (
                <div className="text-2xl font-bold">{summary?.completedGenerations || 0}</div>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Processing</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {isLoadingSummary ? (
                <Skeleton className="h-7 w-16" />
              ) : (
                <div className="text-2xl font-bold">{summary?.processingGenerations || 0}</div>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pending</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {isLoadingSummary ? (
                <Skeleton className="h-7 w-16" />
              ) : (
                <div className="text-2xl font-bold">{summary?.pendingGenerations || 0}</div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold tracking-tight">Recent Activity</h2>
            <Link href="/models">
              <Button variant="ghost" size="sm" className="gap-1">
                View all
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>

          <Card>
            <div className="divide-y divide-border">
              {isLoadingRecent ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="p-4 flex items-center gap-4">
                    <Skeleton className="h-12 w-12 rounded-md" />
                    <div className="space-y-2 flex-1">
                      <Skeleton className="h-4 w-1/4" />
                      <Skeleton className="h-3 w-1/5" />
                    </div>
                  </div>
                ))
              ) : recentGenerations?.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground flex flex-col items-center">
                  <Box className="h-8 w-8 mb-4 opacity-20" />
                  <p>No recent generations.</p>
                  <Link href="/generate" className="mt-4 text-accent hover:underline">
                    Create your first 3D model
                  </Link>
                </div>
              ) : (
                recentGenerations?.map((gen) => (
                  <Link key={gen.id} href={`/models/${gen.id}`}>
                    <div className="p-4 flex items-center gap-4 hover:bg-muted/50 transition-colors cursor-pointer group">
                      <div className="h-12 w-12 rounded-md bg-muted flex items-center justify-center overflow-hidden border border-border/50 group-hover:border-border transition-colors">
                        {gen.previewImageUrl || gen.uploadedImageUrl ? (
                          <img src={gen.previewImageUrl || gen.uploadedImageUrl || ""} alt={gen.title} className="h-full w-full object-cover" />
                        ) : (
                          <Box className="h-5 w-5 text-muted-foreground" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="font-medium text-sm truncate">{gen.title}</h4>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {format(new Date(gen.createdAt), "MMM d, yyyy")}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                          gen.status === 'completed' ? 'bg-green-500/10 text-green-500' :
                          gen.status === 'failed' ? 'bg-destructive/10 text-destructive' :
                          'bg-accent/10 text-accent'
                        }`}>
                          {gen.status}
                        </span>
                      </div>
                    </div>
                  </Link>
                ))
              )}
            </div>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}
