import { useEffect } from "react";
import { X, ZoomIn } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface ImageLightboxProps {
  src: string | null;
  alt?: string;
  onClose: () => void;
}

export function ImageLightbox({ src, alt = "Image", onClose }: ImageLightboxProps) {
  useEffect(() => {
    if (!src) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [src, onClose]);

  return (
    <AnimatePresence>
      {src && (
        <motion.div
          key="lightbox"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/90 backdrop-blur-md p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.92, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.92, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="relative max-w-5xl max-h-[90vh] w-full flex items-center justify-center"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={src}
              alt={alt}
              className="max-w-full max-h-[85vh] rounded-xl object-contain shadow-2xl"
            />
            <button
              onClick={onClose}
              className="absolute -top-3 -right-3 h-9 w-9 rounded-full bg-background border border-border flex items-center justify-center text-foreground hover:bg-muted transition-colors shadow-lg"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </motion.div>
          <p className="absolute bottom-4 left-0 right-0 text-center text-xs text-white/40">
            Click anywhere outside or press Esc to close
          </p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

interface LightboxTriggerProps {
  src: string | null | undefined;
  alt?: string;
  children: React.ReactNode;
  className?: string;
  onOpen: (src: string) => void;
}

export function LightboxTrigger({ src, alt, children, className, onOpen }: LightboxTriggerProps) {
  if (!src) return <>{children}</>;
  return (
    <div
      className={`relative group cursor-zoom-in ${className ?? ""}`}
      onClick={(e) => { e.stopPropagation(); onOpen(src); }}
      role="button"
      tabIndex={0}
      aria-label={`View ${alt ?? "image"} full size`}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); onOpen(src); } }}
    >
      {children}
      <div className="absolute inset-0 rounded-[inherit] bg-black/0 group-hover:bg-black/30 transition-colors duration-200 flex items-center justify-center pointer-events-none">
        <ZoomIn className="h-6 w-6 text-white opacity-0 group-hover:opacity-100 transition-opacity duration-200 drop-shadow-lg" />
      </div>
    </div>
  );
}
