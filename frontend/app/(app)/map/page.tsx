import { Suspense } from "react";
import MapScreen from "./MapScreen";

export const metadata = { title: "Ocean map", description: "Explore reconstructed North Indian Ocean temperature, anomaly, uncertainty and heat content by depth and date." };

export default function MapPage() {
  return (
    <Suspense fallback={<div className="flex-1 skeleton m-4" />}>
      <MapScreen />
    </Suspense>
  );
}
