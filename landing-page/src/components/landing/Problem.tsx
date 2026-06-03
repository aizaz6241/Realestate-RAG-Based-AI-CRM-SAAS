import { motion } from "motion/react";
import { AlertCircle, Clock, EyeOff, PhoneOff, Users } from "lucide-react";
import { SectionHeader } from "./Section";

const pains = [
  { icon: AlertCircle, title: "Scattered leads", body: "Leads live across WhatsApp, spreadsheets and disconnected CRMs." },
  { icon: Clock, title: "Hours wasted on reporting", body: "Managers stitch reports manually instead of running the business." },
  { icon: EyeOff, title: "No real-time visibility", body: "Owners can't see what's actually happening across teams." },
  { icon: PhoneOff, title: "Missed follow-ups", body: "Slow response times and dropped leads cost real commissions." },
  { icon: Users, title: "Disconnected departments", body: "Sales, HR, finance and operations work in separate silos." },
];

export function Problem() {
  return (
    <section className="relative py-32">
      <SectionHeader
        eyebrow="The Problem"
        title={<>Most real estate companies are running on <span className="text-gradient">fragmented systems.</span></>}
        description="The cost isn't just time — it's lost deals, lost margin, and lost control."
      />
      <div className="mx-auto grid max-w-6xl gap-5 px-6 md:grid-cols-2 lg:grid-cols-3">
        {pains.map((p, i) => (
          <motion.div
            key={p.title}
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.08, duration: 0.6 }}
            className="glass shadow-elegant group relative overflow-hidden rounded-2xl p-6"
          >
            <div
              className="absolute -right-12 -top-12 h-32 w-32 rounded-full opacity-20 blur-3xl transition group-hover:opacity-40"
              style={{ background: "oklch(0.65 0.25 30)" }}
            />
            <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-destructive/15 text-destructive">
              <p.icon className="h-5 w-5" />
            </div>
            <h3 className="text-lg font-semibold">{p.title}</h3>
            <p className="text-muted-foreground mt-2 text-sm leading-relaxed">{p.body}</p>
          </motion.div>
        ))}
      </div>
    </section>
  );
}