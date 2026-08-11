import type { Metadata } from "next";
import { BlindReviewDashboard } from "@/components/blind-review-dashboard";

export const metadata: Metadata = { title: "RMW 结果盲评", robots: { index: false, follow: false } };

export default function BlindReviewPage() {
  return <BlindReviewDashboard />;
}
