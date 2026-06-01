// src/app/(app)/customers/CustomersClient.tsx
"use client";
import { useState, useCallback } from "react";
import { CustomersTree } from "./CustomersTree";
import { CustomerModal } from "./CustomerModal";
import { SiteModal } from "./SiteModal";
import { ConfirmDeleteModal } from "./ConfirmDeleteModal";
import type { CustomerNode, SiteNode } from "./types";

interface Props { initialCustomers: CustomerNode[]; }

type Modal =
  | { kind: "add-customer" }
  | { kind: "edit-customer"; customer: CustomerNode }
  | { kind: "add-site"; customer: CustomerNode }
  | { kind: "edit-site"; customer: CustomerNode; site: SiteNode }
  | { kind: "delete-customer"; customer: CustomerNode }
  | { kind: "delete-site"; site: SiteNode }
  | null;

export function CustomersClient({ initialCustomers }: Props) {
  const [customers, setCustomers] = useState(initialCustomers);
  const [modal, setModal] = useState<Modal>(null);

  const refresh = useCallback(() => {
    fetch("/api/customers")
      .then((r) => r.json())
      .then((j) => { if (j.success) setCustomers(j.data); });
  }, []);

  const close = () => setModal(null);
  const afterWrite = () => { close(); refresh(); };

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex items-center justify-between mb-4 shrink-0">
        <h1 className="text-2xl font-bold text-foreground">Customers</h1>
      </div>

      <CustomersTree
        customers={customers}
        onAddCustomer={() => setModal({ kind: "add-customer" })}
        onEditCustomer={(customer) => setModal({ kind: "edit-customer", customer })}
        onDeleteCustomer={(customer) => setModal({ kind: "delete-customer", customer })}
        onAddSite={(customer) => setModal({ kind: "add-site", customer })}
        onEditSite={(customer, site) => setModal({ kind: "edit-site", customer, site })}
        onDeleteSite={(_customer, site) => setModal({ kind: "delete-site", site })}
      />

      {modal?.kind === "add-customer" && <CustomerModal onClose={close} onSaved={afterWrite} />}
      {modal?.kind === "edit-customer" && <CustomerModal customer={modal.customer} onClose={close} onSaved={afterWrite} />}
      {modal?.kind === "add-site" && (
        <SiteModal customerId={modal.customer.id} customerName={modal.customer.name} onClose={close} onSaved={afterWrite} />
      )}
      {modal?.kind === "edit-site" && (
        <SiteModal customerId={modal.customer.id} customerName={modal.customer.name} site={modal.site} onClose={close} onSaved={afterWrite} />
      )}
      {modal?.kind === "delete-customer" && (
        <ConfirmDeleteModal
          title={`Delete "${modal.customer.name}"?`}
          resourceUrl={`/api/customers/${modal.customer.id}`}
          describeImpact={(d) => {
            const i = d.impact ?? { sites: 0, rooms: 0, devices: 0 };
            return `Removes ${i.sites} sites, ${i.rooms} rooms, and ${i.devices} devices.`;
          }}
          onClose={close}
          onDeleted={afterWrite}
        />
      )}
      {modal?.kind === "delete-site" && (
        <ConfirmDeleteModal
          title={`Delete "${modal.site.name}"?`}
          resourceUrl={`/api/sites/${modal.site.id}`}
          describeImpact={(d) => {
            const i = d.impact ?? { rooms: 0, devices: 0 };
            return `Removes ${i.rooms} rooms and ${i.devices} devices.`;
          }}
          onClose={close}
          onDeleted={afterWrite}
        />
      )}
    </div>
  );
}
