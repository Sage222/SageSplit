import React, { useState } from 'react';
import {
  UserPlus,
  Eye,
  EyeOff,
  Trash2,
  Edit3,
  Check,
  X,
  AlertCircle,
  FolderPlus,
} from 'lucide-react';
import { UserAccount, UserRole, ExpenseGroup } from '../types';

interface SettingsViewProps {
  users: UserAccount[];
  groups: ExpenseGroup[];
  currentUser: UserAccount;
  onCreateUser: (payload: {
    displayName: string;
    username: string;
    password: string;
    role: UserRole;
    groupIds: string[];
  }) => Promise<void>;
  onUpdateUser: (
    id: string,
    payload: {
      displayName?: string;
      username?: string;
      password?: string;
      role?: UserRole;
      groupIds?: string[];
    }
  ) => Promise<void>;
  onDeleteUser: (id: string) => Promise<void>;
  onCreateGroup: (name: string) => Promise<void>;
  onDeleteGroup: (id: string) => Promise<void>;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  users,
  groups,
  currentUser,
  onCreateUser,
  onUpdateUser,
  onDeleteUser,
  onCreateGroup,
  onDeleteGroup,
}) => {
  const isAdmin = currentUser.role === 'admin';

  // New user form state
  const [newDisplayName, setNewDisplayName] = useState('');
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<UserRole>('member');
  const [newUserGroupIds, setNewUserGroupIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [creatingUser, setCreatingUser] = useState(false);

  // New group form state
  const [newGroupName, setNewGroupName] = useState('');
  const [creatingGroup, setCreatingGroup] = useState(false);

  // Password visibility & inline edit
  const [visiblePasswords, setVisiblePasswords] = useState<Record<string, boolean>>({});
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editDisplayName, setEditDisplayName] = useState('');
  const [editUsername, setEditUsername] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [editRole, setEditRole] = useState<UserRole>('member');
  const [editUserGroupIds, setEditUserGroupIds] = useState<string[]>([]);

  if (!isAdmin) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-8 text-center space-y-2">
        <h2 className="text-sm font-semibold text-slate-900">Admin Access Required</h2>
        <p className="text-xs text-slate-500">
          Only an administrator account can manage users, passwords, and expense groups.
        </p>
      </div>
    );
  }

  const getUserGroupIds = (userId: string): string[] => {
    return groups.filter((g) => g.memberUserIds.includes(userId)).map((g) => g.id);
  };

  const startEditingUser = (u: UserAccount) => {
    setEditingUserId(u.id);
    setEditDisplayName(u.displayName);
    setEditUsername(u.username);
    setEditPassword(u.password || '');
    setEditRole(u.role);
    setEditUserGroupIds(getUserGroupIds(u.id));
    setError(null);
  };

  const handleSaveUserEdit = async (userId: string) => {
    setError(null);
    try {
      await onUpdateUser(userId, {
        displayName: editDisplayName,
        username: editUsername,
        password: editPassword,
        role: editRole,
        groupIds: editUserGroupIds,
      });
      setEditingUserId(null);
    } catch (err: any) {
      setError(err?.message || 'Failed to update user.');
    }
  };

  const handleToggleUserGroupDirect = async (userId: string, groupId: string) => {
    setError(null);
    const currentGroupIds = getUserGroupIds(userId);
    const nextGroupIds = currentGroupIds.includes(groupId)
      ? currentGroupIds.filter((id) => id !== groupId)
      : [...currentGroupIds, groupId];

    try {
      await onUpdateUser(userId, { groupIds: nextGroupIds });
    } catch (err: any) {
      setError(err?.message || 'Failed to update user groups.');
    }
  };

  const handleCreateUserSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setCreatingUser(true);
    try {
      await onCreateUser({
        displayName: newDisplayName,
        username: newUsername,
        password: newPassword,
        role: newRole,
        groupIds: newUserGroupIds,
      });
      setNewDisplayName('');
      setNewUsername('');
      setNewPassword('');
      setNewRole('member');
      setNewUserGroupIds([]);
    } catch (err: any) {
      setError(err?.message || 'Failed to create user.');
    } finally {
      setCreatingUser(false);
    }
  };

  const handleCreateGroupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGroupName.trim()) return;
    setError(null);
    setCreatingGroup(true);
    try {
      await onCreateGroup(newGroupName.trim());
      setNewGroupName('');
    } catch (err: any) {
      setError(err?.message || 'Failed to create group.');
    } finally {
      setCreatingGroup(false);
    }
  };

  return (
    <div className="space-y-6">
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
          <span>{error}</span>
        </div>
      )}

      {/* Expense Groups Section */}
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="text-sm font-semibold text-slate-900">Expense Groups</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Create expense groups for individual holidays, trips, or events.
          </p>
        </div>

        <div className="p-5 space-y-4">
          <form onSubmit={handleCreateGroupSubmit} className="flex gap-2">
            <input
              type="text"
              required
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              placeholder="e.g. Summer Holiday, Japan Trip, Weekend Cabin"
              className="flex-1 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:outline-none"
            />
            <button
              type="submit"
              disabled={creatingGroup}
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50 whitespace-nowrap"
            >
              <FolderPlus className="h-3.5 w-3.5" />
              <span>Create Group</span>
            </button>
          </form>

          {groups.length > 0 && (
            <div className="divide-y divide-slate-200 rounded-lg border border-slate-200">
              {groups.map((g) => {
                const memberNames = users
                  .filter((u) => g.memberUserIds.includes(u.id))
                  .map((u) => u.displayName)
                  .join(', ');
                return (
                  <div
                    key={g.id}
                    className="flex items-center justify-between px-4 py-2.5 text-sm"
                  >
                    <div>
                      <span className="font-medium text-slate-900">{g.name}</span>
                      <span className="text-xs text-slate-500 ml-2">
                        · {memberNames || 'No users assigned'}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => onDeleteGroup(g.id)}
                      className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                      title="Delete group"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* User Accounts & Group Assignment Section */}
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="text-sm font-semibold text-slate-900">
            User Accounts, Passwords & Group Assignments
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Create user accounts and assign specific users to specific expense groups.
          </p>
        </div>

        <div className="p-5 space-y-5">
          <form
            onSubmit={handleCreateUserSubmit}
            className="rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-3"
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-5">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Name</label>
                <input
                  type="text"
                  required
                  value={newDisplayName}
                  onChange={(e) => setNewDisplayName(e.target.value)}
                  placeholder="Name"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 focus:border-slate-900 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Username</label>
                <input
                  type="text"
                  required
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  placeholder="username"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-mono text-slate-900 focus:border-slate-900 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Password</label>
                <input
                  type="text"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="password"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-mono text-slate-900 focus:border-slate-900 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Role</label>
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value as UserRole)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 focus:border-slate-900 focus:outline-none"
                >
                  <option value="member">Member</option>
                  <option value="admin">Admin</option>
                </select>
              </div>

              <div className="flex items-end">
                <button
                  type="submit"
                  disabled={creatingUser}
                  className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50"
                >
                  <UserPlus className="h-3.5 w-3.5" />
                  <span>Add User</span>
                </button>
              </div>
            </div>

            {groups.length > 0 && (
              <div className="pt-1 flex flex-wrap items-center gap-2">
                <span className="text-xs font-medium text-slate-600">
                  Assign to Expense Groups:
                </span>
                {groups.map((g) => {
                  const selected = newUserGroupIds.includes(g.id);
                  return (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() =>
                        setNewUserGroupIds((prev) =>
                          prev.includes(g.id)
                            ? prev.filter((id) => id !== g.id)
                            : [...prev, g.id]
                        )
                      }
                      className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
                        selected
                          ? 'border-slate-900 bg-slate-900 text-white'
                          : 'border-slate-300 bg-white text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {selected && <Check className="h-3 w-3" />}
                      <span>{g.name}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </form>

          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
                  <th className="py-2.5 px-4">Name</th>
                  <th className="py-2.5 px-4">Username</th>
                  <th className="py-2.5 px-4">Password</th>
                  <th className="py-2.5 px-4">Role</th>
                  <th className="py-2.5 px-4">Assigned Expense Groups</th>
                  <th className="py-2.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {users.map((u) => {
                  const isEditing = editingUserId === u.id;
                  const showPw = Boolean(visiblePasswords[u.id]);
                  const isCurrent = u.id === currentUser.id;
                  const userGroupIds = getUserGroupIds(u.id);

                  return (
                    <tr key={u.id} className="hover:bg-slate-50/70">
                      <td className="py-2.5 px-4 align-top">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editDisplayName}
                            onChange={(e) => setEditDisplayName(e.target.value)}
                            className="w-32 rounded border border-slate-300 px-2 py-1 text-xs"
                          />
                        ) : (
                          <span className="font-medium text-slate-900">
                            {u.displayName}
                            {isCurrent ? ' (You)' : ''}
                          </span>
                        )}
                      </td>

                      <td className="py-2.5 px-4 align-top font-mono text-xs text-slate-600">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editUsername}
                            onChange={(e) => setEditUsername(e.target.value)}
                            className="w-28 rounded border border-slate-300 px-2 py-1 text-xs font-mono"
                          />
                        ) : (
                          `@${u.username}`
                        )}
                      </td>

                      <td className="py-2.5 px-4 align-top font-mono text-xs">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editPassword}
                            onChange={(e) => setEditPassword(e.target.value)}
                            className="w-28 rounded border border-slate-300 px-2 py-1 text-xs font-mono"
                          />
                        ) : (
                          <div className="inline-flex items-center gap-2">
                            <span>{showPw ? u.password : '••••••••'}</span>
                            <button
                              type="button"
                              onClick={() =>
                                setVisiblePasswords((prev) => ({
                                  ...prev,
                                  [u.id]: !prev[u.id],
                                }))
                              }
                              className="text-slate-400 hover:text-slate-700"
                            >
                              {showPw ? (
                                <EyeOff className="h-3.5 w-3.5" />
                              ) : (
                                <Eye className="h-3.5 w-3.5" />
                              )}
                            </button>
                          </div>
                        )}
                      </td>

                      <td className="py-2.5 px-4 align-top text-xs text-slate-600">
                        {isEditing ? (
                          <select
                            value={editRole}
                            onChange={(e) => setEditRole(e.target.value as UserRole)}
                            className="rounded border border-slate-300 px-2 py-1 text-xs"
                          >
                            <option value="member">Member</option>
                            <option value="admin">Admin</option>
                          </select>
                        ) : u.role === 'admin' ? (
                          'Admin'
                        ) : (
                          'Member'
                        )}
                      </td>

                      {/* Expense Group Assignment directly on User Account */}
                      <td className="py-2.5 px-4 align-top">
                        {groups.length === 0 ? (
                          <span className="text-xs text-slate-400">No groups created</span>
                        ) : (
                          <div className="flex flex-wrap gap-1.5">
                            {groups.map((g) => {
                              const isMember = isEditing
                                ? editUserGroupIds.includes(g.id)
                                : userGroupIds.includes(g.id);
                              return (
                                <button
                                  key={g.id}
                                  type="button"
                                  onClick={() => {
                                    if (isEditing) {
                                      setEditUserGroupIds((prev) =>
                                        prev.includes(g.id)
                                          ? prev.filter((id) => id !== g.id)
                                          : [...prev, g.id]
                                      );
                                    } else {
                                      handleToggleUserGroupDirect(u.id, g.id);
                                    }
                                  }}
                                  className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs font-medium transition-colors ${
                                    isMember
                                      ? 'border-slate-900 bg-slate-900 text-white'
                                      : 'border-slate-200 bg-white text-slate-500 hover:border-slate-400 hover:text-slate-900'
                                  }`}
                                  title={
                                    isMember
                                      ? `Remove ${u.displayName} from ${g.name}`
                                      : `Add ${u.displayName} to ${g.name}`
                                  }
                                >
                                  {isMember && <Check className="h-2.5 w-2.5" />}
                                  <span>{g.name}</span>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </td>

                      <td className="py-2.5 px-4 align-top text-right">
                        <div className="inline-flex items-center gap-1.5">
                          {isEditing ? (
                            <>
                              <button
                                type="button"
                                onClick={() => handleSaveUserEdit(u.id)}
                                className="rounded bg-slate-900 px-2 py-1 text-xs text-white"
                              >
                                <Check className="h-3 w-3" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingUserId(null)}
                                className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-600"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() => startEditingUser(u)}
                                className="rounded border border-slate-200 px-2 py-1 text-xs text-slate-700 hover:bg-slate-100"
                                title="Edit user"
                              >
                                <Edit3 className="h-3 w-3" />
                              </button>
                              {users.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => onDeleteUser(u.id)}
                                  className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                                  title="Delete user"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
