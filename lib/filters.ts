// Filter constants shared by client components.

export const ALL = {
  type: "All task types", client: "All clients", stakeholder: "All stakeholders", risk: "Any risk", region: "All regions",
} as const;

export const WINDOWS = [
  { key: "90", label: "Last 90 days" },
  { key: "180", label: "Last 6 months" },
  { key: "365", label: "Last 12 months" },
];
export const DEFAULT_WINDOW = "365";
