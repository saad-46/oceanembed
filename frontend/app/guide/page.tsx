import { redirect } from "next/navigation";
import { stepHref } from "@/lib/guide";

/** Entry point for Guided Exploration: opens step 1 on the real map. */
export default function Page() {
  redirect(stepHref(0));
}
