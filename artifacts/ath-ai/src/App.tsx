import { useEffect, useRef } from "react";
import { ClerkProvider, SignIn, SignUp, Show, useClerk, useAuth } from "@clerk/react";
import { Switch, Route, useLocation, Router as WouterRouter, Redirect } from "wouter";
import { QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { queryClient } from "@/lib/queryClient";
import { setAuthTokenGetter } from "@workspace/api-client-react";
import NotFound from "@/pages/not-found";

import Home from "@/pages/home";
import Dashboard from "@/pages/dashboard";
import Generate from "@/pages/generate";
import Models from "@/pages/models";
import ModelDetail from "@/pages/model-detail";
import Settings from "@/pages/settings";
import athaiBrandLogo from "@assets/logo.png";

const clerkPubKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}

if (!clerkPubKey) {
  throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY in .env file");
}

function AuthPageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background flex">
      {/* Left panel — branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-[#0a0a0a] border-r border-border/30 flex-col justify-between p-12 relative overflow-hidden">
        {/* Ambient glow */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(180,140,100,0.08)_0%,_transparent_60%)] pointer-events-none" />
        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-accent/20 to-transparent" />

        {/* Logo */}
        <div className="flex items-center gap-2.5 relative z-10">
          <img src={athaiBrandLogo} alt="Ath.ai" className="h-6 w-auto" />
          <span className="font-semibold tracking-tight text-sm text-foreground/90">Ath.ai</span>
        </div>

        {/* Center content */}
        <div className="space-y-8 relative z-10">
          <div className="inline-flex items-center gap-2 rounded-full border border-accent/20 bg-accent/5 px-3 py-1 text-xs font-medium text-accent">
            <span className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse" />
            AI-Powered 3D Generation
          </div>
          <div>
            <h2 className="text-4xl font-bold tracking-tight text-foreground leading-tight mb-4">
              From a single photo<br />to a production<br />3D asset.
            </h2>
            <p className="text-muted-foreground text-base leading-relaxed max-w-sm">
              Upload any furniture photo. Remove.bg strips the background. InstantMesh generates the model. You download GLB, OBJ, or USDZ.
            </p>
          </div>

          {/* Step list */}
          <div className="space-y-4">
            {[
              { n: "01", label: "Upload a photo of any furniture" },
              { n: "02", label: "AI removes background & generates 3D" },
              { n: "03", label: "Preview interactively, then export" },
            ].map((s) => (
              <div key={s.n} className="flex items-center gap-4">
                <span className="text-xs font-mono text-accent/60 w-6 shrink-0">{s.n}</span>
                <span className="text-sm text-muted-foreground">{s.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom tagline */}
        <p className="text-xs text-muted-foreground/40 relative z-10">
          Built for designers, architects & studios.
        </p>
      </div>

      {/* Right panel — auth form */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 sm:p-10">
        {/* Mobile logo */}
        <div className="flex lg:hidden items-center gap-2 mb-8">
          <img src={athaiBrandLogo} alt="Ath.ai" className="h-5 w-auto" />
          <span className="font-semibold tracking-tight text-sm">Ath.ai</span>
        </div>
        {children}
      </div>
    </div>
  );
}

function SignInPage() {
  return (
    <AuthPageShell>
      <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} />
    </AuthPageShell>
  );
}

function SignUpPage() {
  return (
    <AuthPageShell>
      <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} />
    </AuthPageShell>
  );
}

function ClerkAuthTokenProvider() {
  const { getToken, isSignedIn } = useAuth();

  useEffect(() => {
    if (!isSignedIn) {
      setAuthTokenGetter(null);
    } else {
      setAuthTokenGetter(() => getToken());
    }
    return () => {
      setAuthTokenGetter(null);
    };
  }, [getToken, isSignedIn]);

  return null;
}

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const queryClientHook = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (
        prevUserIdRef.current !== undefined &&
        prevUserIdRef.current !== userId
      ) {
        queryClientHook.clear();
      }
      prevUserIdRef.current = userId;
    });
    return unsubscribe;
  }, [addListener, queryClientHook]);

  return null;
}

function HomeRedirect() {
  return (
    <>
      <Show when="signed-in">
        <Redirect to="/dashboard" />
      </Show>
      <Show when="signed-out">
        <Home />
      </Show>
    </>
  );
}

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  return (
    <>
      <Show when="signed-in">
        <Component />
      </Show>
      <Show when="signed-out">
        <Redirect to="/sign-in" />
      </Show>
    </>
  );
}

function AuthRoute({ component: Component }: { component: React.ComponentType }) {
  return (
    <>
      <Show when="signed-out">
        <Component />
      </Show>
      <Show when="signed-in">
        <Redirect to="/dashboard" />
      </Show>
    </>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={HomeRedirect} />
      <Route path="/sign-in/*?" component={() => <AuthRoute component={SignInPage} />} />
      <Route path="/sign-up/*?" component={() => <AuthRoute component={SignUpPage} />} />
      <Route path="/dashboard" component={() => <ProtectedRoute component={Dashboard} />} />
      <Route path="/generate" component={() => <ProtectedRoute component={Generate} />} />
      <Route path="/models" component={() => <ProtectedRoute component={Models} />} />
      <Route path="/models/:id" component={() => <ProtectedRoute component={ModelDetail} />} />
      <Route path="/settings" component={() => <ProtectedRoute component={Settings} />} />
      <Route component={NotFound} />
    </Switch>
  );
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();

  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <ClerkAuthTokenProvider />
        <ClerkQueryClientCacheInvalidator />
        <Router />
      </QueryClientProvider>
    </ClerkProvider>
  );
}

function App() {
  return (
    <TooltipProvider>
      <WouterRouter base={basePath}>
        <ClerkProviderWithRoutes />
      </WouterRouter>
      <Toaster />
    </TooltipProvider>
  );
}

export default App;
