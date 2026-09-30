import { Suspense } from "react";
import StratificationScreen from "./StratificationScreen";

export const metadata = { title: "Stratification", description: "Thermocline, halocline, mixed layer and isotherm depths at one point, from the reconstruction and nearby measured profiles." };

export default function Page() {
  return (
    <Suspense fallback={<div className="skeleton m-6 h-96" />}>
      <StratificationScreen />
    </Suspense>
  );
}
