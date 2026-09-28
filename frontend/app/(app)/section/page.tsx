import { Suspense } from "react";
import SectionScreen from "./SectionScreen";

export const metadata = { title: "Vertical Section — OceanSight" };

export default function Page() {
  return (
    <Suspense fallback={<div className="skeleton m-6 h-96" />}>
      <SectionScreen />
    </Suspense>
  );
}
