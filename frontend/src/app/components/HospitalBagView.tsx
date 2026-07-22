"use client";

import EssentialsView from "./EssentialsView";

interface HospitalBagViewProps {
  userId?: string;
  onSuggestEssentials?: () => void;
  refreshKey?: number;
}

export default function HospitalBagView(props: HospitalBagViewProps) {
  return <EssentialsView {...props} filterMode="hospital_bag" />;
}
