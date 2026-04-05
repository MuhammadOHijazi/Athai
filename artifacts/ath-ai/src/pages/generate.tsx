import { useState, useRef, useEffect } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useCreateGeneration, useProcessGeneration, useGetGeneration } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { Upload, Image as ImageIcon, Loader2 } from "lucide-react";
import { ModelViewer } from "@/components/3d/model-viewer";

export default function Generate() {
  const [, setLocation] = useLocation();
  const [image, setImage] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [furnitureType, setFurnitureType] = useState("");
  const [description, setDescription] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const createGeneration = useCreateGeneration();
  const processGeneration = useProcessGeneration();

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!image || !title) return;

    try {
      const generation = await createGeneration.mutateAsync({
        data: {
          title,
          uploadedImageUrl: image,
          furnitureType,
          description
        }
      });

      await processGeneration.mutateAsync({ id: generation.id });
      
      setLocation(`/models/${generation.id}`);
    } catch (error) {
      console.error("Failed to generate model", error);
    }
  };

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto space-y-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Generate Model</h1>
          <p className="text-muted-foreground mt-1">Upload a reference photo to generate a 3D model.</p>
        </div>

        <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Reference Image</CardTitle>
                <CardDescription>Upload a clear photo of the furniture piece.</CardDescription>
              </CardHeader>
              <CardContent>
                <div 
                  className={`border-2 border-dashed rounded-lg flex flex-col items-center justify-center cursor-pointer transition-colors relative overflow-hidden ${
                    image ? 'border-transparent bg-muted' : 'border-border hover:border-accent hover:bg-accent/5 aspect-square'
                  }`}
                  onClick={() => !image && fileInputRef.current?.click()}
                  style={image ? { aspectRatio: 'auto' } : undefined}
                >
                  {image ? (
                    <>
                      <img src={image} alt="Preview" className="w-full h-auto object-cover" />
                      <div className="absolute inset-0 bg-black/50 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center">
                        <Button type="button" variant="secondary" onClick={(e) => { e.stopPropagation(); setImage(null); }}>
                          Remove Image
                        </Button>
                      </div>
                    </>
                  ) : (
                    <div className="text-center p-8 space-y-4">
                      <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                        <Upload className="h-6 w-6 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="font-medium">Click to upload or drag and drop</p>
                        <p className="text-xs text-muted-foreground mt-1">PNG, JPG, JPEG up to 10MB</p>
                      </div>
                    </div>
                  )}
                  <input
                    type="file"
                    ref={fileInputRef}
                    className="hidden"
                    accept="image/*"
                    onChange={handleImageUpload}
                  />
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Details</CardTitle>
                <CardDescription>Provide details to help the AI understand the object.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="title">Title *</Label>
                  <Input 
                    id="title" 
                    placeholder="e.g., Eames Lounge Chair" 
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    required
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="type">Furniture Type</Label>
                  <Input 
                    id="type" 
                    placeholder="e.g., Chair, Table, Sofa" 
                    value={furnitureType}
                    onChange={(e) => setFurnitureType(e.target.value)}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea 
                    id="description" 
                    placeholder="Material details, style, etc." 
                    className="resize-none h-24"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </div>
              </CardContent>
            </Card>

            <Button 
              type="submit" 
              className="w-full h-12 text-base font-medium bg-foreground text-background hover:bg-foreground/90"
              disabled={!image || !title || createGeneration.isPending}
            >
              {createGeneration.isPending ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Starting Generation...
                </>
              ) : (
                "Generate 3D Model"
              )}
            </Button>
          </div>
        </form>
      </div>
    </AppLayout>
  );
}
