import { AppLayout } from "@/components/layout/app-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function Settings() {
  return (
    <AppLayout>
      <div className="space-y-8 max-w-3xl">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
          <p className="text-muted-foreground mt-1">Manage your account and preferences.</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Account Details</CardTitle>
            <CardDescription>Manage your profile and personal information.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-4 bg-muted/50 rounded-lg border border-border/50">
              <p className="text-sm text-muted-foreground mb-4">Account management is handled securely via Clerk.</p>
              <Button variant="outline">Manage Account</Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>API Access</CardTitle>
            <CardDescription>Generate keys for developer access.</CardDescription>
          </CardHeader>
          <CardContent>
             <div className="p-8 text-center text-muted-foreground border border-dashed rounded-lg">
                API access is coming soon.
             </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
