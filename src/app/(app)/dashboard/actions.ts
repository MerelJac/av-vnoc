export async function getDashboardData() {
  return {};
}

export type DashboardData = Awaited<ReturnType<typeof getDashboardData>>;
