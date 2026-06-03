import { motion } from "motion/react";
import type { ReactNode } from "react";

export function SectionHeader({ eyebrow, title, description }: { eyebrow?: string; title: ReactNode; description?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-100px" }}
      transition={{ duration: 0.7 }}
      className="mx-auto mb-16 max-w-3xl text-center"
    >
      {eyebrow && (
        <div className="text-primary mb-4 text-sm font-medium uppercase tracking-[0.2em]">{eyebrow}</div>
      )}
      <h2
        className="text-balance text-4xl font-bold leading-tight tracking-tight md:text-5xl lg:text-6xl"
        style={{ fontFamily: "'Space Grotesk', sans-serif" }}
      >
        {title}
      </h2>
      {description && (
        <p className="text-muted-foreground mt-6 text-lg leading-relaxed">{description}</p>
      )}
    </motion.div>
  );
}