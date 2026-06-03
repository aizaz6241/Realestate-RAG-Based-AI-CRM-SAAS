import { createFileRoute } from "@tanstack/react-router";
import { Nav } from "@/components/landing/Nav";
import { Hero } from "@/components/landing/Hero";
import { Problem } from "@/components/landing/Problem";
import { Solution } from "@/components/landing/Solution";
import { Features } from "@/components/landing/Features";
import { AISection } from "@/components/landing/AISection";
import { Benefits } from "@/components/landing/Benefits";
import { Showcase } from "@/components/landing/Showcase";
import { Pricing } from "@/components/landing/Pricing";
import { Testimonials } from "@/components/landing/Testimonials";
import { FinalCTA } from "@/components/landing/FinalCTA";
import { DemoDialog } from "@/components/landing/DemoDialog";
import { Toaster } from "@/components/ui/sonner";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Zorvex AI — The AI Operating System for Real Estate" },
      { name: "description", content: "Run your entire real estate business from one intelligent command center. Zorvex AI unifies Sales, CRM, Property, HR, Finance and AI into one platform." },
      { property: "og:title", content: "Zorvex AI — The AI Operating System for Real Estate" },
      { property: "og:description", content: "Unify Sales, CRM, Property, HR, Finance and AI into one intelligent command center." },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <main className="bg-background text-foreground relative min-h-screen overflow-x-hidden">
      <Nav />
      <Hero />
      <Problem />
      <Solution />
      <Features />
      <AISection />
      <Benefits />
      <Showcase />
      <Pricing />
      <Testimonials />
      <FinalCTA />
      <DemoDialog />
      <Toaster />
    </main>
  );
}
