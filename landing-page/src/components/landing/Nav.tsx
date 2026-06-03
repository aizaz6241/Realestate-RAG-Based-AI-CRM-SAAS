import { motion } from "motion/react";
import { Sparkles } from "lucide-react";
import { openDemoDialog } from "./DemoDialog";

export function Nav() {
  return (
    <motion.header
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.6 }}
      className="fixed top-0 left-0 right-0 z-50 flex justify-center px-4 pt-4"
    >
      <nav className="glass-strong shadow-elegant flex items-center gap-8 rounded-full px-3 py-2 pl-5">
        <a href="#" className="flex items-center gap-2 font-semibold tracking-tight">
          <span className="bg-gradient-primary grid h-7 w-7 place-items-center rounded-lg shadow-glow">
            <Sparkles className="h-4 w-4 text-white" />
          </span>
          <span className="text-foreground">Zorvex<span className="text-primary">AI</span></span>
        </a>
        <ul className="hidden md:flex items-center gap-6 text-sm text-muted-foreground">
          <li><a href="#platform" className="hover:text-foreground transition">Platform</a></li>
          <li><a href="#features" className="hover:text-foreground transition">Features</a></li>
          <li><a href="#ai" className="hover:text-foreground transition">AI</a></li>
          <li><a href="#pricing" className="hover:text-foreground transition">Pricing</a></li>
        </ul>
        <div className="flex items-center gap-2">
          <a
            href="https://realestate-rag-based-ai-crm-saas-mh.vercel.app/login"
            className="text-sm font-medium text-muted-foreground hover:text-foreground transition px-3 py-2"
          >
            Login
          </a>
          <button
            onClick={openDemoDialog}
            className="bg-gradient-primary text-primary-foreground rounded-full px-4 py-2 text-sm font-medium shadow-glow transition hover:scale-105"
          >
            Book Demo
          </button>
        </div>
      </nav>
    </motion.header>
  );
}