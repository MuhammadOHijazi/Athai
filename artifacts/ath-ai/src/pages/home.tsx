import { motion, useScroll, useTransform } from "framer-motion";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { ArrowRight, Box, CheckCircle2, Cuboid, Layers, Sparkles, Upload, Zap, Quote, Star, Users } from "lucide-react";
import { useRef } from "react";

const fadeUpVariants = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: "easeOut" } },
};

const staggerContainer = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
    },
  },
};

export default function Home() {
  const targetRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: targetRef,
    offset: ["start end", "end start"],
  });

  const y = useTransform(scrollYProgress, [0, 1], ["0%", "20%"]);
  const opacity = useTransform(scrollYProgress, [0, 0.5, 1], [1, 1, 0]);

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground selection:bg-accent/30 selection:text-white">
      <Navbar />

      <main className="flex-1">
        {/* Section 1: Hero */}
        <section className="relative pt-32 pb-20 md:pt-48 md:pb-32 overflow-hidden border-b border-border/40">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_var(--tw-gradient-stops))] from-accent/5 via-background to-background" />
          
          <div className="container mx-auto px-4 sm:px-8 relative z-10">
            <div className="max-w-4xl mx-auto text-center">
              <motion.div
                initial="hidden"
                animate="visible"
                variants={fadeUpVariants}
                className="inline-flex items-center rounded-full border border-border/40 bg-muted/50 backdrop-blur-sm px-3 py-1 text-sm font-medium mb-8"
              >
                <span className="flex h-2 w-2 rounded-full bg-accent mr-2 animate-pulse"></span>
                Ath.ai 1.0 is now available
              </motion.div>
              
              <motion.h1 
                initial="hidden"
                animate="visible"
                variants={{
                  hidden: { opacity: 0, y: 30 },
                  visible: { opacity: 1, y: 0, transition: { duration: 0.6, delay: 0.1, ease: "easeOut" } }
                }}
                className="text-5xl md:text-7xl lg:text-8xl font-bold tracking-tight mb-8 text-foreground"
              >
                Production-grade 3D.<br />
                <span className="text-muted-foreground">From a single photo.</span>
              </motion.h1>
              
              <motion.p 
                initial="hidden"
                animate="visible"
                variants={{
                  hidden: { opacity: 0, y: 30 },
                  visible: { opacity: 1, y: 0, transition: { duration: 0.6, delay: 0.2, ease: "easeOut" } }
                }}
                className="text-xl md:text-2xl text-muted-foreground mb-12 max-w-2xl mx-auto leading-relaxed"
              >
                The precision AI tool for designers, architects, and studios. 
                Transform reference photos into spatial assets with quiet confidence.
              </motion.p>
              
              <motion.div 
                initial="hidden"
                animate="visible"
                variants={{
                  hidden: { opacity: 0, y: 30 },
                  visible: { opacity: 1, y: 0, transition: { duration: 0.6, delay: 0.3, ease: "easeOut" } }
                }}
                className="flex flex-col sm:flex-row items-center justify-center gap-4"
              >
                <Link href="/sign-up">
                  <Button size="lg" className="w-full sm:w-auto h-14 px-8 bg-foreground text-background hover:bg-foreground/90 text-base font-medium rounded-md shadow-xl shadow-foreground/5">
                    Start Generating
                  </Button>
                </Link>
                <Link href="#demo">
                  <Button size="lg" variant="outline" className="w-full sm:w-auto h-14 px-8 text-base font-medium rounded-md border-border/60 hover:bg-muted/50 backdrop-blur-sm">
                    View Demo
                  </Button>
                </Link>
              </motion.div>
            </div>
          </div>

          <motion.div 
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, delay: 0.6, ease: "easeOut" }}
            className="container mx-auto px-4 sm:px-8 mt-20 relative z-10"
            ref={targetRef}
          >
            <motion.div style={{ y, opacity }} className="rounded-xl overflow-hidden border border-border/40 shadow-2xl bg-[#0a0a0a] aspect-video md:aspect-[21/9] relative">
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-full h-full bg-[linear-gradient(rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.05)_1px,transparent_1px)] bg-[size:40px_40px] [transform:perspective(500px)_rotateX(60deg)] [transform-origin:center_top] opacity-20" />
                <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0a] to-transparent opacity-80" />
                
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center gap-8 md:gap-16 w-full max-w-4xl px-8">
                  <div className="flex-1 hidden md:block">
                    <div className="aspect-square rounded-lg border border-white/10 bg-white/5 p-4 flex flex-col">
                      <div className="flex items-center gap-2 mb-4 text-white/50 text-xs font-mono uppercase tracking-widest border-b border-white/10 pb-2">
                        <Upload className="h-3 w-3" /> Input Image
                      </div>
                      <div className="flex-1 rounded border border-white/10 bg-white/10 overflow-hidden relative">
                         <div className="absolute inset-0 flex items-center justify-center text-white/30 text-sm">Input Photo</div>
                      </div>
                    </div>
                  </div>
                  
                  <div className="shrink-0 flex flex-col items-center">
                    <ArrowRight className="h-8 w-8 text-accent animate-pulse" />
                    <div className="mt-4 px-3 py-1 rounded-full border border-accent/30 bg-accent/10 text-accent text-xs font-mono">Processing</div>
                  </div>
                  
                  <div className="flex-1">
                    <div className="aspect-square rounded-lg border border-accent/20 bg-accent/5 p-4 flex flex-col">
                      <div className="flex items-center gap-2 mb-4 text-accent/70 text-xs font-mono uppercase tracking-widest border-b border-accent/20 pb-2">
                        <Cuboid className="h-3 w-3" /> Output Model
                      </div>
                      <div className="flex-1 flex items-center justify-center relative">
                        <Box className="h-24 w-24 text-accent/50 animate-[spin_10s_linear_infinite]" />
                        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(59,130,246,0.2)_0%,transparent_70%)]" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        </section>

        {/* Section 2: Social Proof Logos */}
        <section className="py-12 border-b border-border/40 bg-muted/20">
          <div className="container mx-auto px-4 sm:px-8">
            <p className="text-center text-sm font-medium text-muted-foreground mb-8">TRUSTED BY LEADING DESIGN STUDIOS</p>
            <div className="flex flex-wrap justify-center gap-8 md:gap-16 opacity-50 grayscale">
              {['Studio Arch', 'Forma', 'KINETIC', 'Matter', 'NEXUS'].map((name, i) => (
                <div key={i} className="text-xl md:text-2xl font-bold tracking-tighter">{name}</div>
              ))}
            </div>
          </div>
        </section>

        {/* Section 3: The Workflow */}
        <section id="how-it-works" className="py-24 md:py-32 bg-background">
          <div className="container mx-auto px-4 sm:px-8">
            <div className="max-w-3xl mb-16 md:mb-24">
              <h2 className="text-sm font-semibold tracking-widest text-accent uppercase mb-3">The Workflow</h2>
              <h3 className="text-3xl md:text-5xl font-bold tracking-tight text-foreground">Spatial intelligence, simplified.</h3>
            </div>

            <motion.div 
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-100px" }}
              variants={staggerContainer}
              className="grid grid-cols-1 md:grid-cols-3 gap-12 md:gap-8"
            >
              {[
                { icon: Upload, title: "1. Capture", desc: "Upload a single photograph of any furniture piece. No scanning, no photogrammetry required." },
                { icon: Zap, title: "2. Process", desc: "Our proprietary AI reconstructs the unseen geometry, generating a complete 3D mesh in minutes." },
                { icon: Layers, title: "3. Export", desc: "Download production-ready GLB, OBJ, or USDZ files for immediate use in your design workflow." }
              ].map((step, i) => (
                <motion.div key={i} variants={fadeUpVariants} className="group">
                  <div className="h-12 w-12 rounded-lg bg-muted flex items-center justify-center mb-6 group-hover:bg-accent/10 transition-colors border border-border/50 group-hover:border-accent/30">
                    <step.icon className="h-5 w-5 text-foreground group-hover:text-accent transition-colors" />
                  </div>
                  <h4 className="text-xl font-semibold mb-3">{step.title}</h4>
                  <p className="text-muted-foreground leading-relaxed">{step.desc}</p>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </section>

        {/* Section 4: Features */}
        <section id="features" className="py-24 md:py-32 bg-muted/30 border-y border-border/40">
          <div className="container mx-auto px-4 sm:px-8">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
              <div>
                <h2 className="text-sm font-semibold tracking-widest text-accent uppercase mb-3">Features</h2>
                <h3 className="text-3xl md:text-4xl lg:text-5xl font-bold tracking-tight text-foreground mb-6">Designed for professionals.</h3>
                <p className="text-lg text-muted-foreground mb-8">
                  We built Ath.ai to integrate seamlessly into existing architectural and interior design pipelines. No toys, just tools.
                </p>
                
                <ul className="space-y-6">
                  {[
                    "High-fidelity mesh generation with clean topology.",
                    "Export to industry-standard formats (GLB, OBJ, USDZ).",
                    "Native web-based 3D viewer for instant review.",
                    "Fast processing times (under 2 minutes)."
                  ].map((feature, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <CheckCircle2 className="h-6 w-6 text-accent shrink-0" />
                      <span className="text-foreground font-medium">{feature}</span>
                    </li>
                  ))}
                </ul>

                <div className="mt-10">
                  <Link href="/sign-up">
                    <Button variant="outline" className="h-12 px-6 rounded-md border-border/60 hover:bg-background">
                      Explore all features
                    </Button>
                  </Link>
                </div>
              </div>
              
              <div className="relative">
                <div className="aspect-square md:aspect-[4/3] lg:aspect-square rounded-2xl border border-border bg-card p-6 md:p-8 shadow-sm flex flex-col">
                  <div className="flex items-center justify-between mb-6 pb-4 border-b border-border/40">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full bg-accent/10 flex items-center justify-center">
                        <Box className="h-4 w-4 text-accent" />
                      </div>
                      <div>
                        <div className="text-sm font-medium">Lounge Chair</div>
                        <div className="text-xs text-muted-foreground">GLB • 2.4MB</div>
                      </div>
                    </div>
                    <Button variant="ghost" size="icon" className="h-8 w-8"><Sparkles className="h-4 w-4" /></Button>
                  </div>
                  
                  <div className="flex-1 bg-[#111] rounded-xl border border-white/5 relative overflow-hidden flex items-center justify-center">
                     <div className="w-full h-full bg-[linear-gradient(rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.05)_1px,transparent_1px)] bg-[size:20px_20px] opacity-20" />
                     <Cuboid className="h-24 w-24 text-white/20 absolute" />
                  </div>
                </div>
                
                {/* Decorative elements */}
                <div className="absolute -top-4 -right-4 h-24 w-24 bg-accent/20 blur-3xl rounded-full" />
                <div className="absolute -bottom-8 -left-8 h-32 w-32 bg-foreground/10 blur-3xl rounded-full" />
              </div>
            </div>
          </div>
        </section>

        {/* Section 5: Use Cases */}
        <section className="py-24 md:py-32 bg-background">
          <div className="container mx-auto px-4 sm:px-8">
            <div className="text-center max-w-3xl mx-auto mb-16 md:mb-24">
              <h2 className="text-sm font-semibold tracking-widest text-accent uppercase mb-3">Use Cases</h2>
              <h3 className="text-3xl md:text-5xl font-bold tracking-tight text-foreground">Accelerate every workflow.</h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {[
                { title: "Interior Design", desc: "Instantly create 3D assets of bespoke furniture pieces found in showrooms to use in client renderings." },
                { title: "Architecture", desc: "Populate architectural visualizations with realistic, context-specific assets rather than generic stock models." },
                { title: "E-Commerce", desc: "Generate 3D viewers and AR experiences for product pages from existing catalog photography." }
              ].map((useCase, i) => (
                <div key={i} className="p-8 rounded-2xl border border-border/60 bg-card hover:border-accent/50 transition-colors">
                  <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center mb-6">
                    <Users className="h-5 w-5 text-foreground" />
                  </div>
                  <h4 className="text-xl font-semibold mb-3">{useCase.title}</h4>
                  <p className="text-muted-foreground leading-relaxed">{useCase.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Section 6: Social Proof / Testimonials */}
        <section className="py-24 bg-foreground text-background">
          <div className="container mx-auto px-4 sm:px-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-16 items-center">
              <div>
                <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-8">What the industry is saying</h2>
                <div className="flex items-center gap-2 mb-8">
                  {[...Array(5)].map((_, i) => <Star key={i} className="h-5 w-5 fill-accent text-accent" />)}
                </div>
                <blockquote className="text-xl md:text-2xl leading-relaxed text-white/90 font-medium mb-8">
                  "Ath.ai has fundamentally changed how we source 3D assets for our interior renderings. We no longer spend hours modeling custom pieces or compromising with generic stock models. We just snap a photo and we have a usable mesh in minutes."
                </blockquote>
                <div className="flex items-center gap-4">
                  <div className="h-12 w-12 rounded-full bg-white/10 flex items-center justify-center text-lg font-bold">SM</div>
                  <div>
                    <div className="font-semibold">Sarah Mitchell</div>
                    <div className="text-sm text-white/60">Principal Designer, Studio Arch</div>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-6">
                {[
                  { quote: "The topology is surprisingly clean. It's the first AI-to-3D tool that produces meshes we can actually drop into our scenes without extensive retopology.", author: "James Chen", role: "3D Artist" },
                  { quote: "A game changer for our e-commerce clients. Being able to generate AR-ready USDZ files from existing product photos has saved us countless hours.", author: "Elena Rostova", role: "Creative Director" }
                ].map((testimonial, i) => (
                  <div key={i} className="p-6 rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm">
                    <Quote className="h-6 w-6 text-accent mb-4 opacity-50" />
                    <p className="text-white/80 leading-relaxed mb-4">"{testimonial.quote}"</p>
                    <div className="text-sm">
                      <span className="font-semibold text-white">{testimonial.author}</span>
                      <span className="text-white/50 ml-2">{testimonial.role}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Section 7: Pricing / Waitlist */}
        <section id="pricing" className="py-24 md:py-32 bg-muted/20 border-y border-border/40">
          <div className="container mx-auto px-4 sm:px-8 text-center">
            <h2 className="text-sm font-semibold tracking-widest text-accent uppercase mb-3">Pricing</h2>
            <h3 className="text-3xl md:text-5xl font-bold tracking-tight text-foreground mb-16">Simple, transparent pricing.</h3>
            
            <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-8 text-left">
              <div className="p-8 rounded-2xl border border-border bg-card shadow-sm flex flex-col relative overflow-hidden">
                <div className="mb-8">
                  <h4 className="text-xl font-semibold mb-2">Starter</h4>
                  <div className="text-4xl font-bold mb-2">$0<span className="text-lg text-muted-foreground font-normal">/mo</span></div>
                  <p className="text-muted-foreground text-sm">Perfect for evaluating the technology.</p>
                </div>
                <ul className="space-y-4 mb-8 flex-1">
                  {['5 generations per month', 'GLB export format', 'Standard processing priority', 'Web-based viewer'].map((feature, i) => (
                    <li key={i} className="flex items-center gap-3 text-sm">
                      <CheckCircle2 className="h-4 w-4 text-accent shrink-0" /> {feature}
                    </li>
                  ))}
                </ul>
                <Link href="/sign-up">
                  <Button className="w-full" variant="outline">Start Free</Button>
                </Link>
              </div>

              <div className="p-8 rounded-2xl border border-accent bg-card shadow-md flex flex-col relative overflow-hidden">
                <div className="absolute top-0 right-0 bg-accent text-white text-xs font-bold px-3 py-1 rounded-bl-lg">POPULAR</div>
                <div className="mb-8">
                  <h4 className="text-xl font-semibold mb-2 text-accent">Pro</h4>
                  <div className="text-4xl font-bold mb-2">$49<span className="text-lg text-muted-foreground font-normal">/mo</span></div>
                  <p className="text-muted-foreground text-sm">For independent professionals and studios.</p>
                </div>
                <ul className="space-y-4 mb-8 flex-1">
                  {['Unlimited generations', 'GLB, OBJ, and USDZ exports', 'High-priority processing queue', 'Commercial usage rights', 'API access (coming soon)'].map((feature, i) => (
                    <li key={i} className="flex items-center gap-3 text-sm">
                      <CheckCircle2 className="h-4 w-4 text-accent shrink-0" /> {feature}
                    </li>
                  ))}
                </ul>
                <Link href="/sign-up">
                  <Button className="w-full bg-foreground text-background hover:bg-foreground/90">Upgrade to Pro</Button>
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* Section 8: FAQ */}
        <section className="py-24 md:py-32 bg-background">
          <div className="container mx-auto px-4 sm:px-8 max-w-3xl">
            <div className="text-center mb-16">
              <h2 className="text-3xl font-bold tracking-tight text-foreground">Frequently Asked Questions</h2>
            </div>
            
            <Accordion type="single" collapsible className="w-full">
              {[
                { q: "What types of photos work best?", a: "For optimal results, use well-lit photos showing the full object with a relatively clean background. The AI handles diverse angles, but a 3/4 perspective often captures the most geometric information." },
                { q: "How long does generation take?", a: "Standard generations take 1-2 minutes depending on the complexity of the object and server load. Pro users receive priority queue access, often completing in under a minute." },
                { q: "What export formats are supported?", a: "All users can export to GLB. Pro users additionally have access to OBJ (widely compatible with 3D software) and USDZ (perfect for Apple AR experiences)." },
                { q: "Can I use the generated models commercially?", a: "Yes, Pro tier users retain full commercial rights to all generated models for use in client projects, marketing materials, and commercial applications." }
              ].map((faq, i) => (
                <AccordionItem key={i} value={`item-${i}`}>
                  <AccordionTrigger className="text-left font-medium text-lg">{faq.q}</AccordionTrigger>
                  <AccordionContent className="text-muted-foreground leading-relaxed text-base">
                    {faq.a}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </section>

        {/* Section 9: Final CTA Section */}
        <section className="py-24 md:py-40 bg-foreground text-background relative overflow-hidden">
          <div className="absolute inset-0 opacity-10 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-white via-transparent to-transparent" />
          
          <div className="container mx-auto px-4 sm:px-8 relative z-10 text-center">
            <h2 className="text-4xl md:text-6xl font-bold tracking-tight mb-6">Ready to build?</h2>
            <p className="text-xl text-white/70 mb-10 max-w-2xl mx-auto">
              Join leading design studios using Ath.ai to accelerate their 3D workflows.
            </p>
            <Link href="/sign-up">
              <Button size="lg" className="h-14 px-8 bg-white text-black hover:bg-white/90 text-base font-medium rounded-md">
                Create Free Account
              </Button>
            </Link>
            <p className="mt-6 text-sm text-white/50">No credit card required. Start generating today.</p>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
