import { Suspense } from "react";
import Ocean3DScreen from "./Ocean3DScreen";

export const metadata = { title: "3-D ocean", description: "Downsampled 3-D view of the reconstructed ocean by latitude, longitude and depth." };

export default function Page() {
  return (
    <Suspense fallback={<div className="skeleton m-6 h-96" />}>
      <Ocean3DScreen />
    </Suspense>
  );
}
