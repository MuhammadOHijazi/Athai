import { useState, useRef, useCallback } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useCreateGeneration, useProcessGeneration } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { Upload, X, CheckCircle2, Loader2, Sparkles, AlertCircle, Image as ImageIcon, ArrowRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

type UploadState =
  | "idle"
  | "file_selected"
  | "submitting"
  | "processing"
  | "success"
  | "error";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function Generate() {
  const [, setLocation] = useLocation();
  const [uploadState, setUploadState] = useState<UploadState>("idle");
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [furnitureType, setFurnitureType] = useState("");
  const [description, setDescription] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const createGeneration = useCreateGeneration();
  const processGeneration = useProcessGeneration();

  const canSubmit = uploadState === "file_selected" && !!imageDataUrl && title.trim().length > 0 && !fileError;

  const validateAndSetFile = useCallback((file: File) => {
    setFileError(null);
    if (!ACCEPTED_TYPES.includes(file.type)) {
      setFileError("Please upload a PNG, JPG, or WebP image.");
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setFileError(`File too large. Max 10MB (yours is ${formatBytes(file.size)}).`);
      return;
    }
    setImageFile(file);
    const reader = new FileReader();
    reader.onloadend = () => {
      setImageDataUrl(reader.result as string);
      setUploadState("file_selected");
    };
    reader.readAsDataURL(file);
  }, []);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) validateAndSetFile(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) validateAndSetFile(file);
  };

  const handleRemoveImage = () => {
    setImageDataUrl(null);
    setImageFile(null);
    setUploadState("idle");
    setFileError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || !imageDataUrl) return;

    setUploadState("submitting");
    setErrorMsg("");

    try {
      const generation = await createGeneration.mutateAsync({
        data: {
          title: title.trim(),
          uploadedImageUrl: imageDataUrl,
          furnitureType: furnitureType.trim() || undefined,
          description: description.trim() || undefined,
        },
      });

      setUploadState("processing");

      await processGeneration.mutateAsync({ id: generation.id });

      setUploadState("success");

      // Redirect to model detail after a beat
      setTimeout(() => setLocation(`/models/${generation.id}`), 1200);
    } catch (err: any) {
      console.error("Generation error:", err);
      setUploadState("error");
      setErrorMsg(err?.message || "Something went wrong. Please try again.");
    }
  };

  const isLoading = uploadState === "submitting" || uploadState === "processing";

  return (
    <AppLayout>
      <div className="max-w-3xl mx-auto space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold tracking-tight">New Generation</h1>
          <p className="text-muted-foreground mt-1.5">
            Upload a clear photo of furniture. Our AI removes the background and builds a 3D model in under 2 minutes.
          </p>
        </div>

        {/* How it works pill strip */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground overflow-x-auto pb-1">
          {[
            { icon: Upload, label: "Upload photo" },
            { icon: Sparkles, label: "Background removed" },
            { icon: ImageIcon, label: "3D model built" },
            { icon: CheckCircle2, label: "Download GLB / OBJ" },
          ].map((step, i, arr) => (
            <div key={step.label} className="flex items-center gap-2 shrink-0">
              <div className="flex items-center gap-1.5 bg-muted/60 rounded-full px-2.5 py-1">
                <step.icon className="h-3.5 w-3.5 text-accent" />
                <span>{step.label}</span>
              </div>
              {i < arr.length - 1 && <ArrowRight className="h-3 w-3 text-border" />}
            </div>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Upload zone */}
          <div
            className={cn(
              "relative border-2 border-dashed rounded-xl transition-all duration-200 cursor-pointer group",
              isDragging ? "border-accent bg-accent/5 scale-[1.01]" : "border-border",
              uploadState === "file_selected" && !fileError ? "border-transparent" : "",
              fileError ? "border-destructive/50 bg-destructive/5" : ""
            )}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => !imageDataUrl && fileInputRef.current?.click()}
          >
            <input
              type="file"
              ref={fileInputRef}
              className="hidden"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleFileInput}
            />

            <AnimatePresence mode="wait">
              {imageDataUrl ? (
                <motion.div
                  key="preview"
                  initial={{ opacity: 0, scale: 0.97 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.97 }}
                  className="relative rounded-xl overflow-hidden"
                >
                  <img
                    src={imageDataUrl}
                    alt="Preview"
                    className="w-full max-h-80 object-cover"
                  />
                  {/* Overlay strip */}
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-4 flex items-end justify-between">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-green-400" />
                      <div>
                        <p className="text-xs font-medium text-white truncate max-w-[200px]">{imageFile?.name}</p>
                        <p className="text-[10px] text-white/60">{imageFile ? formatBytes(imageFile.size) : ""} · Ready</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); handleRemoveImage(); }}
                      className="h-7 w-7 rounded-full bg-white/10 hover:bg-white/20 border border-white/20 flex items-center justify-center transition-colors"
                    >
                      <X className="h-3.5 w-3.5 text-white" />
                    </button>
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="empty"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="py-16 px-8 text-center"
                >
                  <div className={cn(
                    "mx-auto w-14 h-14 rounded-full flex items-center justify-center mb-4 transition-colors",
                    isDragging ? "bg-accent/20" : "bg-muted"
                  )}>
                    <Upload className={cn("h-6 w-6 transition-colors", isDragging ? "text-accent" : "text-muted-foreground")} />
                  </div>
                  <p className="font-medium text-foreground mb-1">
                    {isDragging ? "Drop to upload" : "Click or drag & drop"}
                  </p>
                  <p className="text-xs text-muted-foreground">PNG, JPG, WebP · Max 10MB</p>
                  <p className="text-xs text-muted-foreground mt-1">Best results: clear photo, single piece, good lighting</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* File validation error */}
          <AnimatePresence>
            {fileError && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                className="flex items-center gap-2 text-sm text-destructive"
              >
                <AlertCircle className="h-4 w-4 shrink-0" />
                {fileError}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Details */}
          <Card className="border-border/50">
            <CardContent className="p-6 space-y-5">
              <h3 className="text-sm font-semibold text-foreground/80 uppercase tracking-wider">Details</h3>

              <div className="space-y-2">
                <Label htmlFor="title" className="text-sm font-medium">
                  Model name <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="title"
                  placeholder="e.g. Eames Lounge Chair"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className={cn("h-10", !title.trim() && uploadState === "file_selected" ? "border-amber-500/40" : "")}
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div className="space-y-2">
                  <Label htmlFor="type" className="text-sm font-medium">Furniture type</Label>
                  <Input
                    id="type"
                    placeholder="e.g. Chair, Sofa, Table"
                    value={furnitureType}
                    onChange={(e) => setFurnitureType(e.target.value)}
                    className="h-10"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description" className="text-sm font-medium">Notes</Label>
                  <Input
                    id="description"
                    placeholder="Material, style, etc."
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="h-10"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* CTA */}
          <div className="space-y-3">
            <Button
              type="submit"
              size="lg"
              disabled={!canSubmit || isLoading}
              className={cn(
                "w-full h-13 text-base font-semibold transition-all duration-200",
                uploadState === "success" ? "bg-green-600 hover:bg-green-600" : "bg-foreground text-background hover:bg-foreground/90"
              )}
            >
              <AnimatePresence mode="wait">
                {uploadState === "submitting" && (
                  <motion.span key="submitting" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" /> Saving to your account...
                  </motion.span>
                )}
                {uploadState === "processing" && (
                  <motion.span key="processing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" /> Generating 3D model...
                  </motion.span>
                )}
                {uploadState === "success" && (
                  <motion.span key="success" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4" /> Saved — opening viewer...
                  </motion.span>
                )}
                {(uploadState === "idle" || uploadState === "file_selected" || uploadState === "error") && (
                  <motion.span key="ready" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4" />
                    {!imageDataUrl ? "Upload an image to continue" : !title.trim() ? "Add a name to continue" : "Generate 3D Model"}
                  </motion.span>
                )}
              </AnimatePresence>
            </Button>

            {/* Helper text under button */}
            <p className="text-center text-xs text-muted-foreground">
              {isLoading
                ? "AI is processing your image — this typically takes 60–120 seconds."
                : "Your model will be saved to your account automatically."}
            </p>

            {/* Error message */}
            <AnimatePresence>
              {uploadState === "error" && errorMsg && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
                >
                  <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                  <div>
                    <p className="font-medium">Generation failed</p>
                    <p className="text-xs text-destructive/80 mt-0.5">{errorMsg}</p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </form>
      </div>
    </AppLayout>
  );
}
