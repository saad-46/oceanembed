import { Suspense } from "react";
import AnalysisScreen from "./AnalysisScreen";

export const metadata = { title: "Events & regions", description: "Upper-ocean conditions along observed cyclone tracks and over regions, with measured, reconstructed and derived values labelled." };

export default function Page() {
  return (
    <Suspense fallback={<div className="skeleton m-6 h-96" />}>
      <AnalysisScreen />
    </Suspense>
  );
}
