"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowRight } from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Locale } from "@/lib/rmw-types";

export type GuidedTourStep = { target: string; title: string; body: string };

export function GuidedTourOverlay({
  locale,
  open,
  onOpenChange,
  steps,
  ariaLabel,
  badgeLabel,
}: {
  locale: Locale;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  steps: GuidedTourStep[];
  ariaLabel: string;
  badgeLabel: string;
}) {
  const allSteps = useMemo(() => steps, [steps]);
  const [availableSteps, setAvailableSteps] = useState(allSteps);
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => {
      const valid = allSteps.filter((s) => Boolean(document.querySelector(`[data-tour="${s.target}"]`)));
      if (valid.length > 0) {
        setAvailableSteps(valid);
        setIndex(0);
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [allSteps, open]);

  const step = availableSteps[Math.min(index, availableSteps.length - 1)] || availableSteps[0];
  const stepTarget = step?.target;

  useEffect(() => {
    if (!open || !stepTarget) return;
    const update = () => {
      const element = document.querySelector<HTMLElement>(`[data-tour="${stepTarget}"]`);
      if (element) {
        element.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
        setRect(element.getBoundingClientRect());
      } else {
        setRect(null);
      }
    };
    update();
    const timer = setTimeout(update, 200);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open, stepTarget]);

  if (!open || !step || !rect) return null;

  const panelWidth = 340;
  const preferredLeft = rect.right + 24;
  const panelLeft = preferredLeft + panelWidth <= window.innerWidth - 24
    ? preferredLeft
    : Math.max(24, rect.left - panelWidth - 24);
  const panelTop = Math.max(86, Math.min(window.innerHeight - 290, rect.top + 16));

  const finish = () => {
    setIndex(0);
    onOpenChange(false);
  };

  return <div className="fixed inset-0 z-[80]" role="dialog" aria-modal="true" aria-label={ariaLabel}>
    <div
      className="absolute rounded-2xl border-2 border-white/95 transition-all duration-300"
      style={{
        left: Math.max(8, rect.left - 6),
        top: Math.max(8, rect.top - 6),
        width: rect.width + 12,
        height: rect.height + 12,
        boxShadow: "0 0 0 9999px rgba(15, 19, 32, .76)",
      }}
    />
    <aside className="absolute w-[340px] rounded-2xl border border-white/20 bg-white p-6 shadow-2xl transition-all duration-300" style={{ left: panelLeft, top: panelTop }}>
      <div className="flex items-center justify-between">
        <Badge variant="secondary">{index + 1} / {availableSteps.length}</Badge>
        <span className="text-[10px] font-semibold uppercase tracking-[.16em] text-muted-foreground">{badgeLabel}</span>
      </div>
      <h2 className="mt-4 text-xl font-semibold tracking-tight">{step.title}</h2>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">{step.body}</p>
      <div className="mt-6 flex items-center justify-between">
        <Button variant="ghost" disabled={index === 0} onClick={() => setIndex((current) => current - 1)}>
          {locale === "zh-CN" ? "上一步" : "Back"}
        </Button>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={finish}>
            {locale === "zh-CN" ? "退出" : "Exit"}
          </Button>
          <Button className="h-10 px-4" onClick={() => {
            if (index < availableSteps.length - 1) {
              setIndex((current) => current + 1);
            } else {
              finish();
            }
          }}>
            {index === availableSteps.length - 1 ? (locale === "zh-CN" ? "完成" : "Done") : (locale === "zh-CN" ? "下一步" : "Next")}
            <ArrowRight size={16} />
          </Button>
        </div>
      </div>
    </aside>
  </div>;
}
