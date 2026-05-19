export function buildAddress({
  address1,
  address2,
  city,
  state,
  zipCode,
  country,
}: {
  address1?: string | null;
  address2?: string | null;
  city?: string | null;
  state?: string | null;
  zipCode?: string | null;
  country?: string | null;
}) {
  const line1 = address1;

  const line2 = address2;

  const cityState = [city, state].filter(Boolean).join(", ");

  const line3 = [cityState, zipCode].filter(Boolean).join(" ");

  return [line1, line2, line3, country].filter(Boolean).join("\n");
}

export function calculateDueDate(terms: string | null | undefined): string {
  const now = new Date();
  let date: Date | null = null;
  switch (terms) {
    case "NET15":            date = new Date(now.setDate(now.getDate() + 15)); break;
    case "NET30":            date = new Date(now.setDate(now.getDate() + 30)); break;
    case "NET45":            date = new Date(now.setDate(now.getDate() + 45)); break;
    case "NET60":            date = new Date(now.setDate(now.getDate() + 60)); break;
    case "DUE_UPON_RECEIPT": date = new Date(); break;
    case "PREPAID":          date = new Date(); break;
    default:                 return "";
  }
  return date.toISOString().split("T")[0];
}