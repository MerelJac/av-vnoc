// src/app/(app)/customers/CustomersTree.tsx
"use client";
import { useState } from "react";
import Link from "next/link";
import type { CustomerNode, SiteNode } from "./types";

interface Props {
  customers: CustomerNode[];
  onAddCustomer: () => void;
  onEditCustomer: (c: CustomerNode) => void;
  onDeleteCustomer: (c: CustomerNode) => void;
  onAddSite: (c: CustomerNode) => void;
  onEditSite: (c: CustomerNode, s: SiteNode) => void;
  onDeleteSite: (c: CustomerNode, s: SiteNode) => void;
}

export function CustomersTree(props: Props) {
  const { customers, onAddCustomer } = props;
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const q = query.trim().toLowerCase();
  const filtered = q
    ? customers.filter((c) =>
        c.name.toLowerCase().includes(q) || c.sites.some((s) => s.name.toLowerCase().includes(q)))
    : customers;

  return (
    <div className="flex-1 flex flex-col min-h-0 border border-border rounded-lg overflow-hidden bg-card">
      <div className="flex items-center justify-between gap-2 p-3 border-b border-border shrink-0">
        <input
          className="flex-1 bg-background border border-border rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          placeholder="Search customers or sites…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button className="bg-primary text-primary-foreground px-3 py-1.5 rounded-md text-sm font-medium whitespace-nowrap" onClick={onAddCustomer}>
          + Add customer
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {filtered.length === 0 && (
          <p className="text-sm text-muted-foreground p-4 text-center">No customers yet.</p>
        )}
        {filtered.map((c) => (
          <CustomerRow key={c.id} customer={c} expanded={expanded.has(c.id)} onToggle={() => toggle(c.id)} {...props} />
        ))}
      </div>
    </div>
  );
}

function CustomerRow({
  customer, expanded, onToggle,
  onEditCustomer, onDeleteCustomer, onAddSite, onEditSite, onDeleteSite,
}: { customer: CustomerNode; expanded: boolean; onToggle: () => void } & Omit<Props, "customers" | "onAddCustomer">) {
  return (
    <div className="mb-1">
      <div className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted/50 group">
        <button className="text-muted-foreground w-4" onClick={onToggle} aria-label={expanded ? "Collapse" : "Expand"}>
          {expanded ? "▼" : "▶"}
        </button>
        <span className="flex-1 text-sm font-medium truncate">{customer.name}</span>
        <span className="text-xs text-muted-foreground">{customer.sites.length} {customer.sites.length === 1 ? "site" : "sites"}</span>
        <RowActions
          onAdd={() => onAddSite(customer)}
          onEdit={() => onEditCustomer(customer)}
          onDelete={() => onDeleteCustomer(customer)}
          addLabel="Add site"
        />
      </div>
      {expanded && (
        <div className="ml-6 border-l border-border pl-2">
          {customer.sites.length === 0 && (
            <p className="text-xs text-muted-foreground px-2 py-1.5">No sites yet.</p>
          )}
          {customer.sites.map((s) => (
            <div key={s.id} className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted/50 group">
              <span className="flex-1 text-sm truncate">
                {s.name}
                {(s.city || s.state) && <span className="text-xs text-muted-foreground ml-2">{[s.city, s.state].filter(Boolean).join(", ")}</span>}
              </span>
              <Link href={`/rooms?site=${s.id}`} className="text-xs text-muted-foreground hover:text-foreground">
                {s.roomCount} {s.roomCount === 1 ? "room" : "rooms"}
              </Link>
              <RowActions onEdit={() => onEditSite(customer, s)} onDelete={() => onDeleteSite(customer, s)} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function RowActions({ onAdd, onEdit, onDelete, addLabel }: { onAdd?: () => void; onEdit: () => void; onDelete: () => void; addLabel?: string }) {
  return (
    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
      {onAdd && (
        <button className="text-xs text-muted-foreground hover:text-foreground px-1" onClick={onAdd} title={addLabel}>＋</button>
      )}
      <button className="text-xs text-muted-foreground hover:text-foreground px-1" onClick={onEdit} title="Edit">✎</button>
      <button className="text-xs text-muted-foreground hover:text-red-500 px-1" onClick={onDelete} title="Delete">🗑</button>
    </div>
  );
}
