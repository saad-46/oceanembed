import { Suspense } from "react";
import AnalysisScreen from "./AnalysisScreen";

export const metadata = { title: "Analysis — OceanSight" };

export default function Page() {
  return (
    <Suspense fallback={<div className="skeleton m-6 h-96" />}>
      <AnalysisScreen />
    </Suspense>
  );
}
