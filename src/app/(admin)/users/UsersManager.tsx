"use client";

import { useState } from "react";
import {
  CheckCircle2,
  AlertCircle,
  Pencil,
  Trash2,
  UserPlus,
  Link2,
  X,
  Mail,
} from "lucide-react";

type OrgRole = "MEMBER" | "ADMIN" | "OWNER";

type UserRow = {
  id: string;
  email: string;
  isSuperAdmin: boolean;
  createdAt: string;
  profile: { firstName: string; lastName: string; phone: string | null } | null;
};

type Invite = {
  id: string;
  email: string;
  role: OrgRole;
  token: string;
  createdAt: string;
  expiresAt: string;
};

type Props = {
  initialUsers: UserRow[];
  initialInvites: Invite[];
  currentUserId: string;
  appUrl: string;
};

const ORG_ROLES: OrgRole[] = ["MEMBER", "ADMIN", "OWNER"];
const roleLabel = (r: OrgRole) => ({ MEMBER: "Member", ADMIN: "Admin", OWNER: "Owner" })[r];
const roleBadge = (r: OrgRole) =>
  ({
    OWNER: "bg-[#111] text-white",
    ADMIN: "bg-indigo-50 text-indigo-600 border border-indigo-200",
    MEMBER: "bg-[#F7F6F3] text-[#444] border border-[#E5E3DE]",
  })[r];

const blankForm = { firstName: "", lastName: "", email: "", phone: "", password: "" };

export default function UsersManager({ initialUsers, initialInvites, currentUserId, appUrl }: Props) {
  const [users, setUsers] = useState<UserRow[]>(initialUsers);
  const [invites, setInvites] = useState<Invite[]>(initialInvites);
  const [toast, setToast] = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const [modal, setModal] = useState<"add" | "edit" | "invite" | null>(null);
  const [editTarget, setEditTarget] = useState<UserRow | null>(null);
  const [form, setForm] = useState(blankForm);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<OrgRole>("MEMBER");
  const [inviteFirstName, setInviteFirstName] = useState("");
  const [inviteLastName, setInviteLastName] = useState("");
  const [saving, setSaving] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  function showToast(type: "success" | "error", msg: string) {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3500);
  }

  function set(key: keyof typeof form, value: string) {
    setForm((p) => ({ ...p, [key]: value }));
  }

  function openAdd() {
    setForm(blankForm);
    setModal("add");
  }

  function openEdit(user: UserRow) {
    setEditTarget(user);
    setForm({
      firstName: user.profile?.firstName ?? "",
      lastName: user.profile?.lastName ?? "",
      email: user.email,
      phone: user.profile?.phone ?? "",
      password: "",
    });
    setModal("edit");
  }

  function closeModal() {
    setModal(null);
    setEditTarget(null);
  }

  async function handleAdd() {
    if (!form.firstName.trim() || !form.lastName.trim() || !form.email.trim() || !form.password) {
      showToast("error", "All fields except phone are required");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create user");
      setUsers((prev) => [...prev, data]);
      closeModal();
      showToast("success", "User created");
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Error");
    } finally {
      setSaving(false);
    }
  }

  async function handleEdit() {
    if (!editTarget) return;
    if (!form.firstName.trim() || !form.lastName.trim() || !form.email.trim()) {
      showToast("error", "Name and email are required");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/users/${editTarget.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to update user");
      setUsers((prev) => prev.map((u) => (u.id === editTarget.id ? data : u)));
      closeModal();
      showToast("success", "User updated");
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Error");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      const res = await fetch(`/api/users/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to delete user");
      }
      setUsers((prev) => prev.filter((u) => u.id !== id));
      setDeleteId(null);
      showToast("success", "User removed");
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Error");
    }
  }

  async function handleInvite() {
    if (!inviteEmail.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: inviteEmail.trim(),
          role: inviteRole,
          firstName: inviteFirstName.trim(),
          lastName: inviteLastName.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to send invite");
      setInvites((prev) => [data.invite, ...prev]);
      setInviteEmail("");
      closeModal();
      showToast("success", "Invite created");
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Error");
    } finally {
      setSaving(false);
    }
  }

  async function revokeInvite(id: string) {
    try {
      const res = await fetch(`/api/invites/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setInvites((prev) => prev.filter((i) => i.id !== id));
      showToast("success", "Invite revoked");
    } catch {
      showToast("error", "Failed to revoke invite");
    }
  }

  function copyLink(invite: Invite) {
    navigator.clipboard.writeText(`${appUrl}/invite/${invite.token}`);
    setCopiedId(invite.id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  const inputCls = "w-full text-sm text-[#111] border border-[#E5E3DE] rounded-xl px-3 py-2.5 placeholder:text-[#ccc] focus:outline-none focus:border-[#111] transition-colors";
  const labelCls = "text-xs font-semibold uppercase tracking-widest text-[#999]";

  return (
    <>
      {toast && (
        <div className={`fixed top-5 right-5 z-50 flex items-center gap-2.5 px-4 py-3 rounded-xl text-sm font-medium shadow-lg border ${toast.type === "success" ? "bg-white border-green-200 text-green-700" : "bg-white border-red-200 text-red-600"}`}>
          {toast.type === "success" ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}
          {toast.msg}
        </div>
      )}

      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl border border-[#E5E3DE] p-6 w-full max-w-sm shadow-xl space-y-4">
            <p className="text-sm font-semibold text-[#111]">Remove this user?</p>
            <p className="text-sm text-[#666]">This action cannot be undone.</p>
            <div className="flex gap-3 pt-1">
              <button onClick={() => handleDelete(deleteId)} className="flex-1 text-sm font-semibold px-4 py-2.5 rounded-xl bg-red-600 text-white hover:bg-red-700 transition-colors">Remove</button>
              <button onClick={() => setDeleteId(null)} className="flex-1 text-sm font-semibold px-4 py-2.5 rounded-xl border border-[#E5E3DE] bg-white hover:bg-[#F7F6F3] transition-colors">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl border border-[#E5E3DE] p-6 w-full max-w-md shadow-xl space-y-5">
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold text-[#111]">
                {modal === "add" ? "Add User" : modal === "edit" ? "Edit User" : "Invite User"}
              </p>
              <button onClick={closeModal} className="text-[#999] hover:text-[#111] transition-colors"><X size={16} /></button>
            </div>

            {modal === "invite" ? (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className={labelCls}>Email</label>
                  <input type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="colleague@company.com" className={inputCls} />
                </div>
                <div className="space-y-1.5">
                  <label className={labelCls}>Role</label>
                  <div className="flex gap-2">
                    {ORG_ROLES.map((r) => (
                      <button key={r} type="button" onClick={() => setInviteRole(r)} className={`flex-1 text-xs font-semibold py-2 rounded-xl border-2 transition-all ${inviteRole === r ? "border-[#111] bg-[#111] text-white" : "border-[#E5E3DE] text-[#666] hover:border-[#ccc]"}`}>
                        {roleLabel(r)}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className={labelCls}>First Name</label>
                    <input value={inviteFirstName} onChange={(e) => setInviteFirstName(e.target.value)} placeholder="Jane" className={inputCls} />
                  </div>
                  <div className="space-y-1.5">
                    <label className={labelCls}>Last Name</label>
                    <input value={inviteLastName} onChange={(e) => setInviteLastName(e.target.value)} placeholder="Doe" className={inputCls} />
                  </div>
                </div>
                <p className="text-xs text-[#999]">An invite link will be generated for the user to set their password.</p>
                <div className="flex gap-3 pt-1">
                  <button onClick={handleInvite} disabled={saving} className="flex-1 text-sm font-semibold px-4 py-2.5 rounded-xl bg-[#111] text-white hover:bg-[#333] disabled:opacity-50 transition-colors">{saving ? "Sending…" : "Create Invite"}</button>
                  <button onClick={closeModal} className="flex-1 text-sm font-semibold px-4 py-2.5 rounded-xl border border-[#E5E3DE] bg-white hover:bg-[#F7F6F3] transition-colors">Cancel</button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className={labelCls}>First Name</label>
                    <input value={form.firstName} onChange={(e) => set("firstName", e.target.value)} placeholder="Jane" className={inputCls} />
                  </div>
                  <div className="space-y-1.5">
                    <label className={labelCls}>Last Name</label>
                    <input value={form.lastName} onChange={(e) => set("lastName", e.target.value)} placeholder="Doe" className={inputCls} />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className={labelCls}>Email</label>
                  <input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="jane@company.com" className={inputCls} />
                </div>
                <div className="space-y-1.5">
                  <label className={labelCls}>Phone <span className="normal-case font-normal text-[#bbb] tracking-normal">(optional)</span></label>
                  <input value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="+1 555 000 0000" className={inputCls} />
                </div>
                {modal === "add" && (
                  <div className="space-y-1.5">
                    <label className={labelCls}>Password</label>
                    <input type="password" value={form.password} onChange={(e) => set("password", e.target.value)} placeholder="Temporary password" className={inputCls} />
                  </div>
                )}
                <div className="flex gap-3 pt-1">
                  <button onClick={modal === "add" ? handleAdd : handleEdit} disabled={saving} className="flex-1 text-sm font-semibold px-4 py-2.5 rounded-xl bg-[#111] text-white hover:bg-[#333] disabled:opacity-50 transition-colors">{saving ? "Saving…" : modal === "add" ? "Create User" : "Save Changes"}</button>
                  <button onClick={closeModal} className="flex-1 text-sm font-semibold px-4 py-2.5 rounded-xl border border-[#E5E3DE] bg-white hover:bg-[#F7F6F3] transition-colors">Cancel</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="space-y-6">
        <div className="bg-white border border-[#E5E3DE] rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-[#E5E3DE]">
            <p className="text-xs font-semibold uppercase tracking-widest text-[#888]">Users <span className="ml-1 text-[#ccc] font-normal normal-case tracking-normal">{users.length}</span></p>
            <div className="flex gap-2">
              <button onClick={() => setModal("invite")} className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border border-[#E5E3DE] hover:bg-[#F7F6F3] transition-colors text-[#666]">
                <Mail size={13} /> Invite
              </button>
              <button onClick={openAdd} className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-[#111] text-white hover:bg-[#333] transition-colors">
                <UserPlus size={13} /> Add User
              </button>
            </div>
          </div>

          <div className="divide-y divide-[#F0EEE9]">
            {users.length === 0 && <p className="px-6 py-8 text-sm text-[#999] text-center">No users yet.</p>}
            {users.map((user) => {
              const name = user.profile ? `${user.profile.firstName} ${user.profile.lastName}` : "—";
              const isMe = user.id === currentUserId;
              return (
                <div key={user.id} className="flex items-center gap-4 px-6 py-3.5">
                  <div className="w-8 h-8 rounded-full bg-[#F7F6F3] border border-[#E5E3DE] flex items-center justify-center text-xs font-semibold text-[#666] shrink-0">
                    {user.profile?.firstName?.[0] ?? user.email[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-[#111] truncate">{name}</span>
                      {isMe && <span className="text-[10px] font-semibold text-[#999] border border-[#E5E3DE] px-1.5 py-0.5 rounded-md">you</span>}
                      {user.isSuperAdmin && <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-md bg-amber-50 text-amber-600 border border-amber-200">Super Admin</span>}
                    </div>
                    <p className="text-xs text-[#999] truncate">{user.email}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => openEdit(user)} className="w-7 h-7 rounded-lg flex items-center justify-center text-[#999] hover:text-[#111] hover:bg-[#F7F6F3] transition-colors">
                      <Pencil size={13} />
                    </button>
                    <button onClick={() => !isMe && setDeleteId(user.id)} disabled={isMe} className="w-7 h-7 rounded-lg flex items-center justify-center text-[#999] hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {invites.length > 0 && (
          <div className="bg-white border border-[#E5E3DE] rounded-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-[#E5E3DE]">
              <p className="text-xs font-semibold uppercase tracking-widest text-[#888]">Pending Invites <span className="ml-1 text-[#ccc] font-normal normal-case tracking-normal">{invites.length}</span></p>
            </div>
            <div className="divide-y divide-[#F0EEE9]">
              {invites.map((inv) => {
                const daysLeft = Math.ceil((new Date(inv.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                return (
                  <div key={inv.id} className="flex items-center gap-4 px-6 py-3.5">
                    <div className="w-8 h-8 rounded-full bg-[#F7F6F3] border border-[#E5E3DE] flex items-center justify-center text-[#bbb] shrink-0">
                      <Mail size={13} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[#111] truncate">{inv.email}</p>
                      <div className="flex items-center gap-2">
                        <p className="text-xs text-[#bbb]">Expires in {daysLeft} day{daysLeft !== 1 ? "s" : ""}</p>
                        <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-md ${roleBadge(inv.role)}`}>{roleLabel(inv.role)}</span>
                      </div>
                    </div>
                    <button onClick={() => copyLink(inv)} className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors ${copiedId === inv.id ? "border-green-200 text-green-600 bg-green-50" : "border-[#E5E3DE] text-[#666] hover:bg-[#F7F6F3]"}`}>
                      <Link2 size={12} /> {copiedId === inv.id ? "Copied!" : "Copy Link"}
                    </button>
                    <button onClick={() => revokeInvite(inv.id)} className="w-7 h-7 rounded-lg flex items-center justify-center text-[#999] hover:text-red-500 hover:bg-red-50 transition-colors">
                      <Trash2 size={13} />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
