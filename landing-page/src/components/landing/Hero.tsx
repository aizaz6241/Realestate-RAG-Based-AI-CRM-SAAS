import { motion, useScroll, useTransform } from "motion/react";
import { ArrowRight, Play } from "lucide-react";
import { useRef } from "react";
import heroImg from "@/assets/hero-dashboard.jpg";

export function Hero() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const y = useTransform(scrollYProgress, [0, 1], [0, 200]);
  const opacity = useTransform(scrollYProgress, [0, 0.8], [1, 0]);
  const scale = useTransform(scrollYProgress, [0, 1], [1, 0.92]);

  return (
    <section ref={ref} className="relative min-h-screen overflow-hidden pt-32 pb-20">
      <div className="grid-bg absolute inset-0" />
      <div className="glow-orb left-[10%] top-[10%] h-[400px] w-[400px]" style={{ background: "oklch(0.5 0.25 280)" }} />
      <div className="glow-orb right-[5%] top-[20%] h-[500px] w-[500px]" style={{ background: "oklch(0.5 0.22 240)" }} />

      <motion.div style={{ y, opacity }} className="relative mx-auto max-w-6xl px-6 text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="glass mx-auto mb-8 inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs text-muted-foreground"
        >
          <span className="bg-primary h-1.5 w-1.5 animate-pulse rounded-full" />
          The AI Operating System for Real Estate Businesses
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.8 }}
          className="font-display text-balance text-5xl font-bold leading-[1.05] tracking-tight md:text-7xl lg:text-[5.5rem]"
          style={{ fontFamily: "'Space Grotesk', sans-serif" }}
        >
          Run your entire real estate
          <br />
          business from one
          <span className="text-gradient block">intelligent command center.</span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="text-muted-foreground mx-auto mt-8 max-w-2xl text-lg leading-relaxed md:text-xl"
        >
          Zorvex AI unifies Sales, CRM, Property Management, HR, Finance, Commissions and AI into one centralized system — so you close more deals and eliminate operational chaos.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7 }}
          className="mt-10 flex flex-wrap items-center justify-center gap-4"
        >
          <button
            onClick={() => window.dispatchEvent(new Event("open-demo"))}
            className="bg-gradient-primary text-primary-foreground shadow-glow group inline-flex items-center gap-2 rounded-full px-7 py-3.5 font-medium transition hover:scale-[1.03]"
          >
            Book a Demo
            <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
          </button>
          <a href="#platform" className="glass text-foreground inline-flex items-center gap-2 rounded-full px-7 py-3.5 font-medium transition hover:bg-white/10">
            <Play className="h-4 w-4" /> View Platform
          </a>
        </motion.div>
      </motion.div>

      <motion.div
        style={{ scale }}
        initial={{ opacity: 0, y: 80 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.9, duration: 1 }}
        className="relative mx-auto mt-20 max-w-6xl px-6"
      >
        <div className="glass-strong shadow-elegant relative overflow-hidden rounded-3xl p-2">
          <div className="bg-gradient-primary absolute -top-px left-10 right-10 h-px opacity-60" />
          <img
            src={heroImg}
            alt="Zorvex AI command center dashboard"
            width={1920}
            height={1080}
            className="w-full rounded-2xl"
          />
          {/* floating cards */}
          <motion.div
            animate={{ y: [0, -12, 0] }}
            transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
            className="glass-strong shadow-elegant absolute -left-4 top-1/4 hidden rounded-2xl p-4 md:block"
          >
            <div className="text-xs text-muted-foreground">Closed this month</div>
            <div className="text-2xl font-semibold">AED 4.2M</div>
            <div className="text-primary mt-1 text-xs">↑ 28.4%</div>
          </motion.div>
          <motion.div
            animate={{ y: [0, 12, 0] }}
            transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
            className="glass-strong shadow-elegant absolute -right-4 bottom-1/4 hidden rounded-2xl p-4 md:block"
          >
            <div className="text-xs text-muted-foreground">AI actions today</div>
            <div className="text-2xl font-semibold">1,284</div>
            <div className="text-primary mt-1 text-xs">Automated</div>
          </motion.div>
        </div>
        <div className="bg-gradient-primary absolute inset-x-20 -bottom-20 h-40 rounded-full opacity-30 blur-3xl" />
      </motion.div>
    </section>
  );
}