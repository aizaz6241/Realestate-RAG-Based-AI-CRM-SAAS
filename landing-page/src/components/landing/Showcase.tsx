import { motion, useScroll, useTransform } from "motion/react";
import { useRef } from "react";
import heroImg from "@/assets/hero-dashboard.jpg";

export function Showcase() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const y = useTransform(scrollYProgress, [0, 1], [80, -80]);
  const rotate = useTransform(scrollYProgress, [0, 1], [4, -4]);

  return (
    <section ref={ref} className="relative overflow-hidden py-32">
      <div className="mx-auto max-w-7xl px-6">
        <motion.div
          style={{ y, rotateX: rotate }}
          className="glass-strong shadow-elegant relative rounded-3xl p-3"
        >
          <img src={heroImg} alt="Zorvex AI dashboard preview" loading="lazy" width={1920} height={1080} className="w-full rounded-2xl" />
        </motion.div>
      </div>
    </section>
  );
}