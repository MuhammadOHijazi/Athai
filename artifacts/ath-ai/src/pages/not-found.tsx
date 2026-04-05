import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <Navbar />

      <main className="flex-1 flex items-center justify-center py-24">
        <div className="container mx-auto px-4 text-center">
          <div className="max-w-md mx-auto">
            <h1 className="text-8xl font-bold tracking-tighter text-muted mb-4">404</h1>
            <h2 className="text-2xl font-semibold mb-4 tracking-tight">Page not found</h2>
            <p className="text-muted-foreground mb-8">
              The page you are looking for doesn't exist or has been moved.
            </p>
            <Link href="/">
              <Button className="h-12 px-8 bg-foreground text-background hover:bg-foreground/90">
                Return Home
              </Button>
            </Link>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
