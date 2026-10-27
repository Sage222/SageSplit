import React, { useState } from 'react';
import { X, Lock, User, AlertCircle, KeyRound } from 'lucide-react';
import { UserAccount } from '../types';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  users: UserAccount[];
  currentUser: UserAccount;
  onAuthenticate: (username: string, password: string) => Promise<void>;
  allowDismiss: boolean;
}

export const LoginModal: React.FC<LoginModalProps> = ({
  isOpen,
  onClose,
  users,
  currentUser,
  onAuthenticate,
  allowDismiss,
}) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await onAuthenticate(username, password);
      setUsername('');
      setPassword('');
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Invalid username or password.');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickFill = (u: UserAccount) => {
    setUsername(u.username);
    setPassword(u.password || '');
    setError(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-[2px]">
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white shadow-xl overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div className="flex items-center gap-2.5">
            <KeyRound className="h-4 w-4 text-slate-800" />
            <h2 className="text-base font-semibold text-slate-900">
              Sign In / Switch Active Account
            </h2>
          </div>
          {allowDismiss && (
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
              aria-label="Close sign in dialog"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <p className="text-xs text-slate-600 leading-relaxed">
            Enter your account username and password configured by the workspace administrator in
            the Settings tab.
          </p>

          {error && (
            <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-700">
              <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">Username</label>
            <div className="relative">
              <User className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                type="text"
                required
                autoFocus
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="e.g., admin or maya"
                className="w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3.5 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">Password</label>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                className="w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3.5 py-2 text-sm font-mono text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:outline-none"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            {allowDismiss && (
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
              >
                Cancel
              </button>
            )}
            <button
              type="submit"
              disabled={loading}
              className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
            >
              {loading ? 'Verifying...' : 'Sign In with Password'}
            </button>
          </div>
        </form>

        {/* Quick Fill Directory for evaluating accounts */}
        <div className="border-t border-slate-200 bg-slate-50 px-6 py-4">
          <div className="text-xs font-medium text-slate-700 mb-2">
            Configured Workspace Accounts (Click to Autofill Credentials)
          </div>
          <div className="grid grid-cols-1 gap-1.5 max-h-40 overflow-y-auto">
            {users.map((u) => {
              const isCurrent = u.id === currentUser.id;
              return (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => handleQuickFill(u)}
                  className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-xs hover:border-slate-400 transition-colors"
                >
                  <div className="truncate">
                    <span className="font-medium text-slate-900">{u.displayName}</span>
                    <span className="text-slate-500 ml-1.5 font-mono">@{u.username}</span>
                    <span className="text-slate-400 mx-1.5">·</span>
                    <span className="text-slate-600">
                      {u.role === 'admin' ? 'Admin Account' : 'Member'}
                    </span>
                  </div>
                  <div className="font-mono text-slate-500 shrink-0 ml-2">
                    {isCurrent ? 'Active' : `pw: ${u.password}`}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
