import { motion } from "motion/react";
import { Brain, Building2, ClipboardList, Coins, FileBarChart, User, Users } from "lucide-react";
import { SectionHeader } from "./Section";

const flow = [
  { icon: Users, label: "Lead" },
  { icon: User, label: "CRM" },
  { icon: Building2, label: "Property" },
  { icon: User, label: "Agent" },
  { icon: ClipboardList, label: "Task" },
  { icon: Coins, label: "Commission" },
  { icon: FileBarChart, label: "Report" },
  { icon: Brain, label: "AI Insight" },
];

export function Solution() {
  return (
    <section id="platform" className="relative py-32">
      <SectionHeader
        eyebrow="The Solution"
        title={<>Meet <span className="text-gradient">Zorvex AI</span></>}
        description="A unified AI-powered operating system built specifically for real estate companies — replacing multiple disconnected tools with one intelligent command center."
      />

      <div className="mx-auto max-w-6xl px-6">
        <div className="glass-strong shadow-elegant relative overflow-hidden rounded-3xl p-10 md:p-16">
          <div className="bg-gradient-primary absolute -top-32 left-1/2 h-64 w-[60%] -translate-x-1/2 rounded-full opacity-30 blur-3xl" />
          <div className="relative flex flex-wrap items-center justify-center gap-3 md:gap-2">
            {flow.map((node, i) => (
              <div key={node.label} className="flex items-center gap-3 md:gap-2">
                <motion.div
                  initial={{ opacity: 0, scale: 0.5 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.1 }}
                  className="glass flex flex-col items-center gap-2 rounded-2xl px-4 py-3 min-w-[92px]"
                >
                  <node.icon className="text-primary h-5 w-5" />
                  <span className="text-xs font-medium">{node.label}</span>
                </motion.div>
                {i < flow.length - 1 && (
                  <motion.div
                    initial={{ scaleX: 0 }}
                    whileInView={{ scaleX: 1 }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.1 + 0.2 }}
                    className="bg-gradient-primary hidden h-px w-6 origin-left md:block"
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}