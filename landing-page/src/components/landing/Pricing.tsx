import { motion } from "motion/react";
import { Check } from "lucide-react";
import { SectionHeader } from "./Section";

const includes = [
  "Full Zorvex AI platform",
  "CRM, Property, HR, Finance & Tasks",
  "AI Command Center & Assistant",
  "Executive real-time dashboard",
  "Commission automation",
  "Standard support & onboarding",
];

export function Pricing() {
  return (
    <section id="pricing" className="relative py-32">
      <SectionHeader
        eyebrow="Pricing"
        title={<>Simple pricing that <span className="text-gradient">scales with your business</span></>}
      />
      <div className="mx-auto grid max-w-5xl gap-6 px-6 md:grid-cols-5">
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7 }}
          className="relative md:col-span-3"
        >
          <div className="bg-gradient-primary absolute -inset-px rounded-3xl opacity-60 blur-md" />
          <div className="glass-strong shadow-elegant relative rounded-3xl p-10">
            <div className="text-primary text-xs font-medium uppercase tracking-[0.2em]">Starter</div>
            <div className="mt-4 flex items-baseline gap-2">
              <span className="text-5xl font-bold tracking-tight" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>AED 3,000</span>
              <span className="text-muted-foreground">/month</span>
            </div>
            <p className="text-muted-foreground mt-3 text-sm">Everything you need to run your entire real estate business in one place.</p>
            <a href="#cta" className="bg-gradient-primary text-primary-foreground shadow-glow mt-6 inline-flex w-full items-center justify-center rounded-full px-6 py-3 font-medium transition hover:scale-[1.02]">
              Start Free Demo
            </a>
            <ul className="mt-8 space-y-3 text-sm">
              {includes.map((i) => (
                <li key={i} className="flex items-center gap-3">
                  <span className="bg-primary/15 text-primary grid h-5 w-5 place-items-center rounded-full">
                    <Check className="h-3 w-3" />
                  </span>
                  {i}
                </li>
              ))}
            </ul>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7, delay: 0.1 }}
          className="glass shadow-elegant flex flex-col rounded-3xl p-10 md:col-span-2"
        >
          <div className="text-muted-foreground text-xs font-medium uppercase tracking-[0.2em]">Enterprise</div>
          <div className="mt-4 text-3xl font-bold tracking-tight" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Custom</div>
          <p className="text-muted-foreground mt-3 text-sm">For larger brokerages and multi-branch operations needing custom workflows, dedicated support and SLAs.</p>
          <a href="#cta" className="glass text-foreground mt-6 inline-flex items-center justify-center rounded-full px-6 py-3 font-medium transition hover:bg-white/10">
            Contact Sales
          </a>
          <ul className="text-muted-foreground mt-8 space-y-2 text-sm">
            <li>• Dedicated success manager</li>
            <li>• Custom integrations</li>
            <li>• Priority SLA & training</li>
          </ul>
        </motion.div>
      </div>
    </section>
  );
}