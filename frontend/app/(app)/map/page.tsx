import { Suspense } from "react";
import MapScreen from "./MapScreen";

export const metadata = { title: "Ocean Map — OceanSight" };

export default function MapPage() {
  return (
    <Suspense fallback={<div className="flex-1 skeleton m-4" />}>
      <MapScreen />
    </Suspense>
  );
}
