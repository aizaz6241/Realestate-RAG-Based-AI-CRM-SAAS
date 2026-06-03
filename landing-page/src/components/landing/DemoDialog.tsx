import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

export const openDemoDialog = () => window.dispatchEvent(new Event("open-demo"));

export function DemoDialog() {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const handler = () => {
      setDone(false);
      setOpen(true);
    };
    window.addEventListener("open-demo", handler);
    return () => window.removeEventListener("open-demo", handler);
  }, []);

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    const name = String(data.get("name") || "").trim();
    const email = String(data.get("email") || "").trim();
    const phone = String(data.get("phone") || "").trim();

    if (!name || name.length > 100) return toast.error("Please enter a valid name");
    if (!/^\S+@\S+\.\S+$/.test(email)) return toast.error("Please enter a valid email");
    if (!phone || phone.length > 30) return toast.error("Please enter a valid phone");

    setSubmitting(true);
    await new Promise((r) => setTimeout(r, 700));
    setSubmitting(false);
    setDone(true);
    form.reset();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="glass-strong border-white/10 sm:max-w-md">
        {done ? (
          <div className="py-8 text-center">
            <div className="bg-gradient-primary shadow-glow mx-auto grid h-14 w-14 place-items-center rounded-full">
              <CheckCircle2 className="h-7 w-7 text-white" />
            </div>
            <h3 className="mt-5 text-xl font-semibold" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
              Request received
            </h3>
            <p className="text-muted-foreground mt-2 text-sm">
              Our team will reach out within 24 hours to schedule your personalized demo.
            </p>
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle style={{ fontFamily: "'Space Grotesk', sans-serif" }} className="text-2xl">
                Book your demo
              </DialogTitle>
              <DialogDescription>
                See how Zorvex AI runs your entire real estate business from one command center.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={onSubmit} className="mt-2 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Full name</Label>
                <Input id="name" name="name" required maxLength={100} placeholder="John Carter" />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="email">Work email</Label>
                  <Input id="email" name="email" type="email" required maxLength={255} placeholder="you@company.com" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone</Label>
                  <Input id="phone" name="phone" type="tel" required maxLength={30} placeholder="+1 555 000 0000" />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="company">Company</Label>
                <Input id="company" name="company" maxLength={120} placeholder="Acme Realty" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="notes">Notes</Label>
                <Textarea id="notes" name="notes" maxLength={1000} rows={3} placeholder="Tell us about your team size and goals…" />
              </div>
              <button
                type="submit"
                disabled={submitting}
                className="bg-gradient-primary text-primary-foreground shadow-glow group inline-flex w-full items-center justify-center gap-2 rounded-full px-6 py-3 font-medium transition hover:scale-[1.01] disabled:opacity-70"
              >
                {submitting ? "Sending…" : (<>Request demo <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" /></>)}
              </button>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}