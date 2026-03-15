"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/components/auth-provider";

interface User {
  id: string;
  email: string;
  createdAt: string;
}

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

export default function UsersPage() {
  const { token } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);

  // New user form
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [createSuccess, setCreateSuccess] = useState("");

  // Change password form
  const [currentPwd, setCurrentPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [changingPwd, setChangingPwd] = useState(false);
  const [pwdError, setPwdError] = useState("");
  const [pwdSuccess, setPwdSuccess] = useState("");

  const fetchUsers = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/auth/users`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setUsers(await res.json());
    } finally {
      setLoadingUsers(false);
    }
  }, [token]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError("");
    setCreateSuccess("");
    setCreating(true);
    try {
      const res = await fetch(`${API}/api/auth/users`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ email: newEmail, password: newPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to create user");
      setCreateSuccess(`User ${data.email} created`);
      setNewEmail("");
      setNewPassword("");
      fetchUsers();
    } catch (err: any) {
      setCreateError(err.message);
    } finally {
      setCreating(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwdError("");
    setPwdSuccess("");
    setChangingPwd(true);
    try {
      const res = await fetch(`${API}/api/auth/change-password`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ currentPassword: currentPwd, newPassword: newPwd }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to change password");
      setPwdSuccess("Password changed successfully");
      setCurrentPwd("");
      setNewPwd("");
    } catch (err: any) {
      setPwdError(err.message);
    } finally {
      setChangingPwd(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Users</h1>
        <p className="text-sm text-gray-500 mt-1">Manage access to the content system</p>
      </div>

      {/* User list */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-800">
          <h2 className="text-sm font-semibold text-white">All Users</h2>
        </div>
        {loadingUsers ? (
          <div className="px-6 py-8 text-center text-gray-500 text-sm">Loading…</div>
        ) : (
          <ul className="divide-y divide-gray-800">
            {users.map((u) => (
              <li key={u.id} className="flex items-center justify-between px-6 py-4">
                <div>
                  <p className="text-sm font-medium text-white">{u.email}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Added {new Date(u.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  </p>
                </div>
                <span className="text-xs text-gray-600 font-mono">{u.id.slice(0, 8)}…</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Add user */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h2 className="text-sm font-semibold text-white mb-4">Add User</h2>
          <form onSubmit={handleCreateUser} className="space-y-3">
            <input
              id="new-user-email"
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              required
              placeholder="Email"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3.5 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
            />
            <input
              id="new-user-password"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              placeholder="Password"
              minLength={8}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3.5 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
            />
            {createError && <p className="text-xs text-red-400">{createError}</p>}
            {createSuccess && <p className="text-xs text-green-400">{createSuccess}</p>}
            <button
              id="create-user-submit"
              type="submit"
              disabled={creating}
              className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium py-2.5 rounded-lg transition-all"
            >
              {creating ? "Creating…" : "Create User"}
            </button>
          </form>
        </div>

        {/* Change password */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h2 className="text-sm font-semibold text-white mb-4">Change My Password</h2>
          <form onSubmit={handleChangePassword} className="space-y-3">
            <input
              id="current-password"
              type="password"
              value={currentPwd}
              onChange={(e) => setCurrentPwd(e.target.value)}
              required
              placeholder="Current password"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3.5 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
            />
            <input
              id="new-password"
              type="password"
              value={newPwd}
              onChange={(e) => setNewPwd(e.target.value)}
              required
              placeholder="New password"
              minLength={8}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3.5 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
            />
            {pwdError && <p className="text-xs text-red-400">{pwdError}</p>}
            {pwdSuccess && <p className="text-xs text-green-400">{pwdSuccess}</p>}
            <button
              id="change-password-submit"
              type="submit"
              disabled={changingPwd}
              className="w-full bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white text-sm font-medium py-2.5 rounded-lg transition-all"
            >
              {changingPwd ? "Changing…" : "Change Password"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
