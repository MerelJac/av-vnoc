// ── Slice types ────────────────────────────────────────────────────────────

export type QuoteSlice = {
  total: number | null;
  status: string;
  isChangeOrder: boolean;
};

export type ScopeSlice = {
  costPerHour: number | null;
  estimatedHours: number;
  timeEntries: { hours: number }[];
};

export type InvoiceSlice = {
  amount: number | null;
  status: string;
};

export type ProjectCostSlice = {
  costType: string;
  amount: number;
  amountPrice: number | null;
  taxAmount: number | null;
  taxAmountPrice: number | null;
};

// ── Sub-calculators ────────────────────────────────────────────────────────

export function calcContractValue(quotes: QuoteSlice[]) {
  const contractBase = quotes
    .filter((q) => q.status === "ACCEPTED" && !q.isChangeOrder)
    .reduce((s, q) => s + (q.total ?? 0), 0);
  const changeOrderTotal = quotes
    .filter((q) => q.status === "ACCEPTED" && q.isChangeOrder)
    .reduce((s, q) => s + (q.total ?? 0), 0);
  return {
    contractBase,
    changeOrderTotal,
    totalContract: contractBase + changeOrderTotal,
  };
}

export function calcCosts(projectCosts: ProjectCostSlice[]) {
  const byType = (type: string) =>
    projectCosts.filter((c) => c.costType === type);

  const materialEntries = byType("MATERIAL");
  const returnEntries = byType("RETURN");
  const freightEntries = byType("FREIGHT");
  const laborEntries = byType("LABOR");
  const subscriptionEntries = byType("SUBSCRIPTION");
  const warrantyEntries = byType("WARRANTY");
  const otherEntries = byType("OTHER");

  // ── What we actually paid out ──────────────────────────────────────────
  const materialCost = materialEntries.reduce((s, c) => s + c.amount, 0);
  const materialCostTax = materialEntries.reduce(
    (s, c) => s + (c.taxAmount ?? 0),
    0,
  );
  const shippingCost = freightEntries.reduce((s, c) => s + c.amount, 0);
  const shippingCostTax = freightEntries.reduce(
    (s, c) => s + (c.taxAmount ?? 0),
    0,
  );
  const laborCost = laborEntries.reduce((s, c) => s + c.amount, 0);
  const laborCostTax = laborEntries.reduce((s, c) => s + (c.taxAmount ?? 0), 0);
  const subscriptionCost = subscriptionEntries.reduce(
    (s, c) => s + c.amount,
    0,
  );
  const subscriptionCostTax = subscriptionEntries.reduce(
    (s, c) => s + (c.taxAmount ?? 0),
    0,
  );

  const warrantyCost = warrantyEntries.reduce((s, c) => s + c.amount, 0);
  const warrantyCostTax = warrantyEntries.reduce(
    (s, c) => s + (c.taxAmount ?? 0),
    0,
  );

  const otherCost = otherEntries.reduce((s, c) => s + c.amount, 0);
  const otherCostTax = otherEntries.reduce((s, c) => s + (c.taxAmount ?? 0), 0);
  // Return amounts are stored as negative; returnCredit is the absolute value
  const returnCredit = returnEntries.reduce(
    (s, c) => s + Math.abs(c.amount),
    0,
  );

  const grossCost =
    materialCost +
    shippingCost +
    laborCost +
    subscriptionCost +
    warrantyCost +
    otherCost;

  const netCost = grossCost - returnCredit; // actual cash out after returns

  // Tax paid (return tax already stored negative so it naturally reduces this)
  const totalTax =
    materialCostTax +
    shippingCostTax +
    laborCostTax +
    subscriptionCostTax +
    warrantyCostTax +
    otherCostTax;

  const netCostWithTax = netCost + totalTax;

  // ── BOM price allocations (targets, not revenue) ───────────────────────
  // These show what we intend to charge, useful for markup display only

  const materialPrice = materialEntries.reduce(
    (s, c) => s + (c.amountPrice ?? 0),
    0,
  );
  const materialPriceTax = materialEntries.reduce(
    (s, c) => s + (c.taxAmountPrice ?? 0),
    0,
  );
  const shippingPrice = freightEntries.reduce(
    (s, c) => s + (c.amountPrice ?? 0),
    0,
  );
  const shippingPriceTax = freightEntries.reduce(
    (s, c) => s + (c.taxAmountPrice ?? 0),
    0,
  );
  const laborPrice = laborEntries.reduce((s, c) => s + (c.amountPrice ?? 0), 0);
  const laborPriceTax = laborEntries.reduce(
    (s, c) => s + (c.taxAmountPrice ?? 0),
    0,
  );
  const subscriptionPrice = subscriptionEntries.reduce(
    (s, c) => s + (c.amountPrice ?? 0),
    0,
  );
  const subscriptionPriceTax = subscriptionEntries.reduce(
    (s, c) => s + (c.taxAmountPrice ?? 0),
    0,
  );

  const warrantyPrice = warrantyEntries.reduce(
    (s, c) => s + (c.amountPrice ?? 0),
    0,
  );
  const warrantyPriceTax = warrantyEntries.reduce(
    (s, c) => s + (c.taxAmountPrice ?? 0),
    0,
  );

  const otherPrice = otherEntries.reduce((s, c) => s + (c.amountPrice ?? 0), 0);
  const otherPriceTax = otherEntries.reduce(
    (s, c) => s + (c.taxAmountPrice ?? 0),
    0,
  );

  const grossPrice =
    materialPrice +
    shippingPrice +
    laborPrice +
    subscriptionPrice +
    warrantyPrice +
    otherPrice;

  // Return amountPrices are stored as negative; returnCredit is the absolute value

  const returnCreditPrice = returnEntries.reduce(
    (s, c) => s + Math.abs(c.amountPrice ?? 0),
    0,
  );

  const netPrice = grossPrice - returnCreditPrice; // actual cash out after returns

  // Tax paid (return tax already stored negative so it naturally reduces this)
  const totalTaxPrice =
    materialPriceTax +
    shippingPriceTax +
    laborPriceTax +
    subscriptionPriceTax +
    warrantyPriceTax +
    otherPriceTax;

  const netPriceWithTax = netPrice + totalTaxPrice;

  const materialMarkup =
    grossPrice > 0 && grossCost > 0
      ? ((grossPrice - grossCost) / grossCost) * 100
      : null;

  return {
    // Costs by type
    materialCost,
    shippingCost,
    laborCost,
    subscriptionCost,
    warrantyCost,
    otherCost,
    returnCredit,
    // Rolled-up cost totals
    grossCost, // everything before returns
    netCost, // after returns, before tax
    totalTax,
    netCostWithTax, // after returns + tax — the real number
    // BOM price targets (for markup display, not profit calc)
    grossPrice,
    returnCreditPrice,
    materialMarkup,
    netPrice,
    netPriceWithTax,
    // Legacy aliases so existing callers don't break
    grossPoCost: grossCost,
    poCostGrossMinusReturns: netCost,
    materialCosts: materialCost,
    totalTaxPrice: projectCosts.reduce(
      (s, c) => s + (c.taxAmountPrice ?? 0),
      0,
    ),

    // invoices paid
  };
}

export function calcLaborEstimates(scopes: ScopeSlice[]) {
  const budgetedLaborCost = scopes.reduce(
    (s, sc) => s + (sc.costPerHour ? sc.estimatedHours * sc.costPerHour : 0),
    0,
  );
  const totalActualHours = scopes.reduce(
    (s, sc) => s + sc.timeEntries.reduce((h, t) => h + t.hours, 0),
    0,
  );
  const totalEstimatedHours = scopes.reduce(
    (s, sc) => s + sc.estimatedHours,
    0,
  );
  return { budgetedLaborCost, totalActualHours, totalEstimatedHours };
}

export function calcInvoicing(invoices: InvoiceSlice[]) {
  const nonVoid = invoices.filter((i) => i.status !== "VOID");
  const invoiced = nonVoid.reduce((s, i) => s + (i.amount ?? 0), 0);
  const collected = nonVoid
    .filter((i) => i.status === "PAID")
    .reduce((s, i) => s + (i.amount ?? 0), 0);
  return { invoiced, collected, outstanding: invoiced - collected };
}

// ── Master calculator ──────────────────────────────────────────────────────

export function calcProjectFinancials(p: {
  quotes: QuoteSlice[];
  projectCosts: ProjectCostSlice[];
  scopes: ScopeSlice[];
  invoices: InvoiceSlice[];
}) {
  const { contractBase, changeOrderTotal, totalContract } = calcContractValue(
    p.quotes,
  );
  const costs = calcCosts(p.projectCosts);
  const { budgetedLaborCost, totalActualHours, totalEstimatedHours } =
    calcLaborEstimates(p.scopes);
  const { invoiced, collected, outstanding } = calcInvoicing(p.invoices);

  // COGS = everything we spent, net of returns, including tax
  const cogs = costs.netCostWithTax;

  const grossCost = costs.grossCost; // everything before returns
  const netCost = costs.netCost; // after returns = costs. before tax
  const totalTax = costs.totalTax;
  const netCostWithTax = costs.netCostWithTax; // after returns + tax — the real number
  // BOM price targets (for markup display = costs. not profit calc)
  const grossPrice = costs.grossPrice;
  const returnCreditPrice = costs.returnCreditPrice;
  const materialMarkup = costs.materialMarkup;
  const netPrice = costs.netPrice;
  const netPriceWithTax = costs.netPriceWithTax;
  // Gross profit = contract value minus what we spent
  // Only meaningful when there's an accepted proposal
  const grossProfit = totalContract - cogs;
  const marginPct =
    totalContract > 0 ? (grossProfit / totalContract) * 100 : null;

  const pctComplete =
    totalEstimatedHours > 0
      ? Math.min((totalActualHours / totalEstimatedHours) * 100, 100)
      : null;

  return {
    contractBase,
    changeOrderTotal,
    totalContract,
    hasContract: totalContract > 0,
    ...costs,
    budgetedLaborCost,
    totalActualHours,
    totalEstimatedHours,
    pctComplete,
    invoiced,
    collected,
    outstanding,
    cogs,
    grossProfit,
    marginPct,
    grossCost, // everything before returns
    netCost, // after returns, before tax
    totalTax,
    netCostWithTax, // after returns + tax — the real number
    // BOM price targets (for markup display, not profit calc)
    grossPrice,
    returnCreditPrice,
    materialMarkup,
    netPrice,
    netPriceWithTax,
  };
}

export type ProjectFinancials = ReturnType<typeof calcProjectFinancials>;
