import { format } from "date-fns";

export function formatCurrency(amount: number, currency: string = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency,
    minimumFractionDigits: 2,
  }).format(amount);
}

export function formatDate(dateString: string | null | undefined) {
  if (!dateString) return "—";
  try {
    return format(new Date(dateString), "MMM d, yyyy");
  } catch (e) {
    return dateString;
  }
}

export function formatDateTime(dateString: string | null | undefined) {
  if (!dateString) return "—";
  try {
    return format(new Date(dateString), "MMM d, yyyy h:mm a");
  } catch (e) {
    return dateString;
  }
}
