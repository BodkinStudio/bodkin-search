export const analyticsEventNames = [
  "page_view",
  "acquisition_clicked",
  "product_opened",
  "identity_known",
  "enquiry_submitted",
  "registration_completed",
  "trial_started",
  "activation_achieved",
  "lead_qualified",
  "opportunity_created",
  "customer_acquired",
  "payment_succeeded",
] as const;
export const templateLabels = {
  enquiry: "Website enquiry",
  signup: "Browser signup",
  external: "External product",
  sales: "Sales-led customer",
};
export type FunnelTemplate = keyof typeof templateLabels;
export type FunnelStage = {
  position: number;
  label: string;
  event: string;
  action: string | null;
  instrumented: boolean;
};
const templates = {
  enquiry: ["page_view", "acquisition_clicked", "enquiry_submitted"],
  signup: [
    "page_view",
    "acquisition_clicked",
    "registration_completed",
    "activation_achieved",
  ],
  external: [
    "page_view",
    "acquisition_clicked",
    "product_opened",
    "registration_completed",
    "trial_started",
    "payment_succeeded",
  ],
  sales: [
    "page_view",
    "enquiry_submitted",
    "lead_qualified",
    "opportunity_created",
    "customer_acquired",
  ],
};
export function defaultStages(template: FunnelTemplate): FunnelStage[] {
  return templates[template].map((event, position) => ({
    position,
    event,
    label: event.replaceAll("_", " "),
    action: null,
    instrumented: false,
  }));
}
