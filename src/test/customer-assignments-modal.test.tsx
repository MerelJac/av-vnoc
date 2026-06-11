import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CustomerAssignmentsModal from "@/app/(admin)/users/CustomerAssignmentsModal";

const customers = [
  { id: "c1", name: "Acme Corp" },
  { id: "c2", name: "Globex" },
  { id: "c3", name: "Initech" },
];

const mockFetch = vi.fn();

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("fetch", mockFetch);
  mockFetch.mockImplementation(async (url: string, init?: RequestInit) => {
    if (url === "/api/customers" && !init?.method) {
      return { ok: true, json: async () => ({ success: true, data: customers }) };
    }
    if (url.startsWith("/api/users/") && init?.method === "PUT") {
      return { ok: true, json: async () => ({ success: true, data: {} }) };
    }
    return { ok: false, json: async () => ({ error: "unexpected" }) };
  });
});

function renderModal(overrides: Partial<Parameters<typeof CustomerAssignmentsModal>[0]> = {}) {
  const props = {
    userId: "u-9",
    userLabel: "tech@callone.com",
    initialCustomerIds: ["c1"],
    onClose: vi.fn(),
    onSaved: vi.fn(),
    ...overrides,
  };
  render(<CustomerAssignmentsModal {...props} />);
  return props;
}

describe("CustomerAssignmentsModal", () => {
  it("loads the customer list and pre-checks current assignments", async () => {
    renderModal();

    const acme = await screen.findByRole("checkbox", { name: /Acme Corp/ });
    expect(acme).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /Globex/ })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: /Initech/ })).not.toBeChecked();
  });

  it("shows the all-customers hint when nothing is selected", async () => {
    renderModal({ initialCustomerIds: [] });

    await screen.findByRole("checkbox", { name: /Acme Corp/ });
    expect(screen.getByText(/sees all customers/i)).toBeInTheDocument();
  });

  it("saves the replaced assignment set via PUT and reports it back", async () => {
    const props = renderModal();

    await userEvent.click(await screen.findByRole("checkbox", { name: /Globex/ }));
    await userEvent.click(screen.getByRole("button", { name: /Save/ }));

    await vi.waitFor(() => expect(props.onSaved).toHaveBeenCalledWith(["c1", "c2"]));

    const putCall = mockFetch.mock.calls.find(([, init]) => init?.method === "PUT");
    expect(putCall).toBeDefined();
    const [url, init] = putCall as [string, RequestInit];
    expect(url).toBe("/api/users/u-9/customers");
    expect(init.headers).toMatchObject({ "Content-Type": "application/json" });
    expect(JSON.parse(init.body as string)).toEqual({ customerIds: ["c1", "c2"] });
  });

  it("can clear every assignment (back to all customers)", async () => {
    const props = renderModal();

    await userEvent.click(await screen.findByRole("checkbox", { name: /Acme Corp/ }));
    await userEvent.click(screen.getByRole("button", { name: /Save/ }));

    await vi.waitFor(() => expect(props.onSaved).toHaveBeenCalledWith([]));
    const putCall = mockFetch.mock.calls.find(([, init]) => init?.method === "PUT");
    expect(JSON.parse((putCall as [string, RequestInit])[1].body as string)).toEqual({
      customerIds: [],
    });
  });

  it("surfaces an error and keeps the modal open when the save fails", async () => {
    mockFetch.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === "/api/customers" && !init?.method) {
        return { ok: true, json: async () => ({ success: true, data: customers }) };
      }
      return { ok: false, json: async () => ({ error: "Failed to update customer assignments" }) };
    });
    const props = renderModal();

    await userEvent.click(await screen.findByRole("checkbox", { name: /Globex/ }));
    await userEvent.click(screen.getByRole("button", { name: /Save/ }));

    expect(await screen.findByText(/Failed to update customer assignments/)).toBeInTheDocument();
    expect(props.onSaved).not.toHaveBeenCalled();
  });

  it("closes without saving on Cancel", async () => {
    const props = renderModal();

    await screen.findByRole("checkbox", { name: /Acme Corp/ });
    await userEvent.click(screen.getByRole("button", { name: /Cancel/ }));

    expect(props.onClose).toHaveBeenCalled();
    expect(mockFetch.mock.calls.find(([, init]) => init?.method === "PUT")).toBeUndefined();
  });
});
