import { AppLayout } from "@/components/layout/app-layout";
import { useListGenerations } from "@workspace/api-client-react";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Box, PlusSquare } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";

export default function Models() {
  const { data: generations, isLoading } = useListGenerations();

  return (
    <AppLayout>
      <div className="space-y-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">My Models</h1>
            <p className="text-muted-foreground mt-1">All your generated 3D assets.</p>
          </div>
          <Link href="/generate">
            <Button className="gap-2">
              <PlusSquare className="h-4 w-4" />
              New Generation
            </Button>
          </Link>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <Card key={i} className="overflow-hidden">
                <Skeleton className="h-48 w-full rounded-none" />
                <CardContent className="p-4 space-y-2">
                  <Skeleton className="h-5 w-2/3" />
                  <Skeleton className="h-4 w-1/3" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : generations?.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 md:p-24 border border-dashed rounded-xl bg-muted/20">
            <div className="h-16 w-16 bg-muted rounded-full flex items-center justify-center mb-6">
              <Box className="h-8 w-8 text-muted-foreground" />
            </div>
            <h2 className="text-xl font-semibold mb-2">No models yet</h2>
            <p className="text-muted-foreground mb-6 text-center max-w-sm">
              You haven't generated any 3D models. Upload a photo of a piece of furniture to get started.
            </p>
            <Link href="/generate">
              <Button>Generate your first model</Button>
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {generations?.map((gen) => (
              <Link key={gen.id} href={`/models/${gen.id}`}>
                <Card className="overflow-hidden cursor-pointer group hover:border-accent transition-colors duration-300 h-full flex flex-col">
                  <div className="h-48 w-full bg-muted relative overflow-hidden flex-shrink-0">
                    {gen.previewImageUrl || gen.uploadedImageUrl ? (
                      <img 
                        src={gen.previewImageUrl || gen.uploadedImageUrl || ""} 
                        alt={gen.title} 
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 ease-out" 
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Box className="h-10 w-10 text-muted-foreground opacity-20" />
                      </div>
                    )}
                    <div className="absolute top-3 right-3">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider backdrop-blur-md ${
                        gen.status === 'completed' ? 'bg-green-500/20 text-green-100 border border-green-500/30' :
                        gen.status === 'failed' ? 'bg-destructive/20 text-destructive-foreground border border-destructive/30' :
                        'bg-accent/20 text-white border border-accent/30'
                      }`}>
                        {gen.status}
                      </span>
                    </div>
                  </div>
                  <CardContent className="p-4 flex-1 flex flex-col justify-between">
                    <div>
                      <h3 className="font-semibold text-lg line-clamp-1 group-hover:text-accent transition-colors">{gen.title}</h3>
                      {gen.furnitureType && (
                        <p className="text-sm text-muted-foreground mt-1 line-clamp-1">{gen.furnitureType}</p>
                      )}
                    </div>
                    <div className="mt-4 pt-4 border-t border-border/50 text-xs text-muted-foreground">
                      {format(new Date(gen.createdAt), "MMM d, yyyy")}
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
