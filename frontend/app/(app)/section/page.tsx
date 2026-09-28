import { Suspense } from "react";
import SectionScreen from "./SectionScreen";

export const metadata = { title: "Section", description: "Vertical cross-sections of reconstructed temperature, anomaly and uncertainty along any transect." };

export default function Page() {
  return (
    <Suspense fallback={<div className="skeleton m-6 h-96" />}>
      <SectionScreen />
    </Suspense>
  );
}
