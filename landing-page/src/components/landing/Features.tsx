import { motion } from "motion/react";
import { Brain, Briefcase, Building2, CheckCircle2, LineChart, ShieldCheck, Wallet } from "lucide-react";
import { SectionHeader } from "./Section";

const features = [
  { icon: Briefcase, title: "Sales & CRM", points: ["Manage leads from inquiry to closing", "Smart pipeline tracking"] },
  { icon: Building2, title: "Property Management", points: ["Listings, owners, inventory & status", "Price history analytics"] },
  { icon: ShieldCheck, title: "HR & Workforce", points: ["Attendance, shifts, leave management", "Employee performance tracking"] },
  { icon: Wallet, title: "Finance & Payroll", points: ["Salary, deductions, payroll automation", "Commission calculations"] },
  { icon: CheckCircle2, title: "Task Management", points: ["AI-verified task execution", "No fake completion allowed"] },
  { icon: LineChart, title: "Executive Dashboard", points: ["Real-time company performance", "Live KPI tracking"] },
  { icon: Brain, title: "AI Command Center", points: ["Ask anything about your business", "AI executes & analyzes live data"], featured: true },
];

export function Features() {
  return (
    <section id="features" className="relative py-32">
      <SectionHeader
        eyebrow="The Platform"
        title={<>One platform. <span className="text-gradient">Every department.</span></>}
        description="Replace seven tools with one intelligent system that connects every part of your real estate business."
      />
      <div className="mx-auto grid max-w-6xl gap-5 px-6 md:grid-cols-2 lg:grid-cols-3">
        {features.map((f, i) => (
          <motion.div
            key={f.title}
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.06, duration: 0.6 }}
            whileHover={{ y: -6 }}
            className={`glass group relative overflow-hidden rounded-2xl p-6 transition ${
              f.featured ? "lg:col-span-3 lg:p-10" : ""
            }`}
          >
            <div className="bg-gradient-primary absolute -inset-px rounded-2xl opacity-0 blur-xl transition group-hover:opacity-20" />
            <div className="relative">
              <div className="bg-gradient-primary shadow-glow mb-5 inline-flex h-12 w-12 items-center justify-center rounded-xl">
                <f.icon className="text-primary-foreground h-5 w-5" />
              </div>
              <h3 className={`font-semibold ${f.featured ? "text-2xl" : "text-xl"}`}>{f.title}</h3>
              <ul className="text-muted-foreground mt-3 space-y-1.5 text-sm">
                {f.points.map((p) => (
                  <li key={p} className="flex items-start gap-2">
                    <span className="bg-primary mt-2 h-1 w-1 shrink-0 rounded-full" />
                    {p}
                  </li>
                ))}
              </ul>
            </div>
          </motion.div>
        ))}
      </div>
    </section>
  );
}