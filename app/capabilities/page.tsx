import { readCapabilities } from "@/lib/data";
import { CapabilityWorkspace } from "./capability-workspace";

export const dynamic = "force-dynamic";

export default async function CapabilitiesPage() {
  const { model, readiness } = await readCapabilities();
  return <CapabilityWorkspace initialModel={model} initialReadiness={readiness} />;
}
