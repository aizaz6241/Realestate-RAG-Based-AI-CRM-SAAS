import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { SectionHeader } from "./Section";

function Typewriter({ text, delay = 0 }: { text: string; delay?: number }) {
  const [shown, setShown] = useState("");
  useEffect(() => {
    const t = setTimeout(() => {
      let i = 0;
      const id = setInterval(() => {
        setShown(text.slice(0, ++i));
        if (i >= text.length) clearInterval(id);
      }, 22);
      return () => clearInterval(id);
    }, delay);
    return () => clearTimeout(t);
  }, [text, delay]);
  return <span>{shown}</span>;
}

export function AISection() {
  return (
    <section id="ai" className="relative py-32">
      <div className="glow-orb left-1/2 top-1/4 h-[500px] w-[500px] -translate-x-1/2" style={{ background: "oklch(0.5 0.25 280)" }} />
      <SectionHeader
        eyebrow="AI Command Center"
        title={<>Not just AI chat — <span className="text-gradient">business intelligence that acts.</span></>}
        description="Zorvex AI is a multi-agent system that connects directly to your live business data and executes real workflows on your behalf."
      />

      <motion.div
        initial={{ opacity: 0, y: 40 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.8 }}
        className="mx-auto max-w-3xl px-6"
      >
        <div className="glass-strong shadow-elegant space-y-4 rounded-3xl p-6 md:p-8">
          <div className="flex justify-end">
            <div className="bg-secondary text-secondary-foreground max-w-[80%] rounded-2xl rounded-tr-sm px-4 py-3 text-sm">
              Show overdue tasks
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="bg-gradient-primary shadow-glow grid h-8 w-8 shrink-0 place-items-center rounded-full">
              <Sparkles className="text-primary-foreground h-4 w-4" />
            </div>
            <div className="glass max-w-[85%] rounded-2xl rounded-tl-sm px-4 py-3 text-sm leading-relaxed">
              <Typewriter delay={400} text="Found 12 overdue tasks across 4 agents. Would you like me to reassign and send follow-up reminders automatically?" />
            </div>
          </div>
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 2.5 }}
            className="flex flex-wrap gap-2 pl-11"
          >
            {["Yes, automate it", "Show by agent", "Export report"].map((c) => (
              <button key={c} className="glass hover:bg-white/10 rounded-full px-3 py-1.5 text-xs transition">
                {c}
              </button>
            ))}
          </motion.div>
        </div>
      </motion.div>
    </section>
  );
}