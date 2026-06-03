import { motion, useInView } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { SectionHeader } from "./Section";

const stats = [
  { value: 60, suffix: "%", label: "Less administrative workload" },
  { value: 4.2, suffix: "x", label: "Faster lead response time" },
  { value: 38, suffix: "%", label: "Higher agent productivity" },
  { value: 100, suffix: "%", label: "Real-time business visibility" },
];

function Counter({ to, suffix }: { to: number; suffix: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const [v, setV] = useState(0);
  useEffect(() => {
    if (!inView) return;
    const start = performance.now();
    const dur = 1600;
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min((t - start) / dur, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setV(to * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, to]);
  const display = to % 1 === 0 ? Math.round(v).toString() : v.toFixed(1);
  return <span ref={ref}>{display}{suffix}</span>;
}

export function Benefits() {
  return (
    <section className="relative py-32">
      <SectionHeader
        eyebrow="The Impact"
        title={<>What changes <span className="text-gradient">after Zorvex AI</span></>}
      />
      <div className="mx-auto grid max-w-6xl gap-5 px-6 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((s, i) => (
          <motion.div
            key={s.label}
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.1 }}
            className="glass shadow-elegant rounded-2xl p-8 text-center"
          >
            <div
              className="text-gradient text-5xl font-bold tracking-tight md:text-6xl"
              style={{ fontFamily: "'Space Grotesk', sans-serif" }}
            >
              <Counter to={s.value} suffix={s.suffix} />
            </div>
            <div className="text-muted-foreground mt-3 text-sm">{s.label}</div>
          </motion.div>
        ))}
      </div>
    </section>
  );
}