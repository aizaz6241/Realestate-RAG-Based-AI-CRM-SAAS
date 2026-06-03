import { motion } from "motion/react";
import { ArrowRight } from "lucide-react";

export function FinalCTA() {
  return (
    <section id="cta" className="relative px-6 pb-32 pt-16">
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.8 }}
        className="relative mx-auto max-w-5xl overflow-hidden rounded-[2rem] p-12 text-center md:p-20"
      >
        <div className="bg-gradient-primary absolute inset-0 opacity-90" />
        <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse at top, oklch(1 0 0 / 0.25), transparent 60%)" }} />
        <div className="grid-bg absolute inset-0 opacity-30" />
        <div className="relative">
          <h2
            className="text-balance text-4xl font-bold leading-tight tracking-tight text-white md:text-6xl"
            style={{ fontFamily: "'Space Grotesk', sans-serif" }}
          >
            Stop managing tools. <br /> Start running your business.
          </h2>
          <p className="mx-auto mt-6 max-w-2xl text-white/85 md:text-lg">
            Zorvex AI replaces fragmented systems with one intelligent command center built for modern real estate companies.
          </p>
          <button
            onClick={() => window.dispatchEvent(new Event("open-demo"))}
            className="text-primary mt-10 inline-flex items-center gap-2 rounded-full bg-white px-8 py-4 font-medium shadow-2xl transition hover:scale-[1.03]"
          >
            Book a Demo <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </motion.div>

      <footer className="text-muted-foreground mx-auto mt-20 max-w-6xl border-t border-white/5 pt-8 text-center text-sm">
        © {new Date().getFullYear()} Zorvex AI · The AI Operating System for Real Estate
      </footer>
    </section>
  );
}