import { motion } from "motion/react";
import { SectionHeader } from "./Section";

const items = [
  { quote: "We replaced four tools in our first month. The executive dashboard alone is worth it.", name: "Khalid R.", role: "Founder, Brokerage Group" },
  { quote: "Our agents respond to leads in minutes, not hours. Our commissions jumped almost instantly.", name: "Sara M.", role: "Sales Director" },
  { quote: "It actually feels like a command center. I finally see my entire business in real time.", name: "Omar A.", role: "CEO, Real Estate Holding" },
];

export function Testimonials() {
  return (
    <section className="relative py-32">
      <SectionHeader eyebrow="Loved by operators" title={<>Built for the people <span className="text-gradient">running real estate.</span></>} />
      <div className="mx-auto grid max-w-6xl gap-5 px-6 md:grid-cols-3">
        {items.map((t, i) => (
          <motion.figure
            key={t.name}
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.1 }}
            className="glass shadow-elegant flex flex-col gap-6 rounded-2xl p-7"
          >
            <blockquote className="text-lg leading-relaxed">"{t.quote}"</blockquote>
            <figcaption className="border-border/50 mt-auto flex items-center gap-3 border-t pt-5">
              <div className="bg-gradient-primary h-10 w-10 rounded-full" />
              <div>
                <div className="text-sm font-medium">{t.name}</div>
                <div className="text-muted-foreground text-xs">{t.role}</div>
              </div>
            </figcaption>
          </motion.figure>
        ))}
      </div>
    </section>
  );
}