import { Suspense } from "react";
import TourScreen from "./TourScreen";

export const metadata = { title: "Guided tour — OceanSight", description: "A 3-minute interactive story of how OceanSight reconstructs the ocean beneath the surface." };

export default function Page() {
  return (
    <Suspense fallback={<div className="h-dvh bg-bg" />}>
      <TourScreen />
    </Suspense>
  );
}
