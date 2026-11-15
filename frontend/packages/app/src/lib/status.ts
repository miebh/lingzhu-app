/** Semantic text token for a background job's status label. */
export function jobStatusTone(status: string): string {
  switch (status) {
    case "running":
      return "text-text-accent";
    case "completed":
      return "text-state-fg-success";
    case "failed":
      return "text-state-fg-danger";
    default:
      return "text-state-fg-warning";
  }
}
