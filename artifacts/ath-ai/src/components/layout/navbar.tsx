import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import athaiBrandLogo from "@assets/image_1775398238106.png";

export function Navbar() {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-white/5 bg-background/80 backdrop-blur-md">
      <div className="container mx-auto flex h-16 items-center justify-between px-4 sm:px-8">
        <Link href="/" className="flex items-center gap-2 transition-opacity hover:opacity-80">
          <img src={athaiBrandLogo} alt="Ath.ai Logo" className="h-6 w-auto" />
          <span className="font-semibold tracking-tight text-foreground">Ath.ai</span>
        </Link>
        
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-muted-foreground">
          <a href="#how-it-works" className="transition-colors hover:text-foreground">How it Works</a>
          <a href="#features" className="transition-colors hover:text-foreground">Features</a>
          <a href="#pricing" className="transition-colors hover:text-foreground">Pricing</a>
        </nav>

        <div className="flex items-center gap-4">
          <Link href="/sign-in">
            <Button variant="ghost" className="hidden sm:inline-flex text-muted-foreground hover:text-foreground">
              Log in
            </Button>
          </Link>
          <Link href="/sign-up">
            <Button className="bg-foreground text-background hover:bg-foreground/90 transition-all">
              Get Started
            </Button>
          </Link>
        </div>
      </div>
    </header>
  );
}
