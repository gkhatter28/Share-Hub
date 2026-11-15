import React, { useState } from 'react';
import { Check, Lock, Shield, UserCheck } from 'lucide-react';
import { MEMBER_AVATARS } from '@/src/lib/avatars';
import { ROLE_LABELS, STORAGE_LABELS } from '@/src/lib/format';
import type {
  CloudStorageTarget,
  FolderPermission,
  FolderRole,
  TeamMember,
  VaultFolder,
} from '@/src/types/vault';

interface PermissionsViewProps {
  folders: VaultFolder[];
  members: TeamMember[];
  onUpdatePermissions: (
    folderId: string,
    permissions: FolderPermission[],
    summary: string,
  ) => Promise<void>;
  onUpdateFolderConfig: (
    folderId: string,
    updates: Partial<VaultFolder>,
  ) => Promise<void>;
}

export const PermissionsView: React.FC<PermissionsViewProps> = ({
  folders,
  members,
  onUpdatePermissions,
  onUpdateFolderConfig,
}) => {
  const [selectedFolderId, setSelectedFolderId] = useState<string>(folders[0]?.id || '');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);

  const activeFolder = folders.find((f) => f.id === selectedFolderId) || folders[0];

  if (!activeFolder) {
    return (
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-8 text-center text-sm text-slate-500">
        Create an encrypted folder in Vault & Files to configure granular access controls.
      </div>
    );
  }

  const handleRoleChange = async (member: TeamMember, newRole: FolderRole) => {
    setSavingId(member.id);
    const updated: FolderPermission[] = members.map((m) => {
      const existing = activeFolder.permissions.find((p) => p.memberId === m.id);
      if (m.id === member.id) {
        return {
          memberId: m.id,
          role: newRole,
          canShareExternal: newRole === 'owner' || newRole === 'editor' ? existing?.canShareExternal ?? false : false,
        };
      }
      return existing || { memberId: m.id, role: 'viewer', canShareExternal: false };
    });

    try {
      await onUpdatePermissions(
        activeFolder.id,
        updated,
        `Updated ${member.name} role in ${activeFolder.name} to ${ROLE_LABELS[newRole]}.`,
      );
      setSavedNotice(`Updated ${member.name}`);
      setTimeout(() => setSavedNotice(null), 2200);
    } finally {
      setSavingId(null);
    }
  };

  const handleExternalToggle = async (member: TeamMember, canShareExternal: boolean) => {
    setSavingId(member.id);
    const updated: FolderPermission[] = members.map((m) => {
      const existing = activeFolder.permissions.find((p) => p.memberId === m.id);
      if (m.id === member.id) {
        return {
          memberId: m.id,
          role: existing?.role || 'viewer',
          canShareExternal,
        };
      }
      return existing || { memberId: m.id, role: 'viewer', canShareExternal: false };
    });
    try {
      await onUpdatePermissions(
        activeFolder.id,
        updated,
        `${canShareExternal ? 'Enabled' : 'Disabled'} external share links for ${member.name} in ${activeFolder.name}.`,
      );
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* Folder Selector Column */}
      <div className="lg:col-span-4 space-y-2">
        <div className="mb-3">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Encrypted Folders
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Select a folder to manage member roles and zero-knowledge locks
          </p>
        </div>

        {folders.map((folder) => {
          const active = folder.id === activeFolder.id;
          const activeMembers = folder.permissions.filter((p) => p.role !== 'revoked').length;
          return (
            <button
              key={folder.id}
              type="button"
              onClick={() => setSelectedFolderId(folder.id)}
              className={`w-full text-left rounded-xl border p-4 transition-colors cursor-pointer ${
                active
                  ? 'border-blue-500 bg-blue-50/60 dark:bg-blue-950/25'
                  : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] hover:border-slate-300 dark:hover:border-slate-700'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                  {folder.name}
                </span>
                <Lock className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
              </div>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 line-clamp-1">
                {folder.description}
              </p>
              <p className="mt-2 text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                {activeMembers} authorized members · {STORAGE_LABELS[folder.storageTarget]}
              </p>
            </button>
          );
        })}
      </div>

      {/* Granular ACL Matrix */}
      <div className="lg:col-span-8 space-y-5">
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-5 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                {activeFolder.name} — Granular Access Matrix
              </h3>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                {activeFolder.description}
              </p>
            </div>
            {savedNotice && (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                <Check className="h-3.5 w-3.5" />
                {savedNotice}
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-200 dark:border-slate-800">
            <label className="flex items-center justify-between rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0F17] px-3.5 py-2.5 text-xs cursor-pointer">
              <span className="flex items-center gap-2 font-medium text-slate-800 dark:text-slate-200">
                <Shield className="h-4 w-4 text-emerald-500" />
                Zero-Knowledge Folder Lock
              </span>
              <input
                type="checkbox"
                checked={activeFolder.encryptedZeroKnowledge}
                onChange={(e) =>
                  onUpdateFolderConfig(activeFolder.id, {
                    encryptedZeroKnowledge: e.target.checked,
                  })
                }
                className="h-4 w-4 rounded border-slate-300 dark:border-slate-700 text-blue-600"
              />
            </label>

            <div className="flex items-center justify-between rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0F17] px-3.5 py-2 text-xs">
              <span className="font-medium text-slate-700 dark:text-slate-300">Cloud Target</span>
              <select
                value={activeFolder.storageTarget}
                onChange={(e) =>
                  onUpdateFolderConfig(activeFolder.id, {
                    storageTarget: e.target.value as CloudStorageTarget,
                  })
                }
                className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#111827] px-2.5 py-1 text-xs text-slate-900 dark:text-slate-100"
              >
                <option value="primary-vault">CipherVault NVMe</option>
                <option value="s3-archive">AWS S3 Mirror</option>
                <option value="b2-immutable">Backblaze B2 Lock</option>
                <option value="gcs-coldline">GCP Coldline</option>
              </select>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  <th className="py-3 pl-5 pr-3">Team Member & Key</th>
                  <th className="py-3 px-3">Folder Role</th>
                  <th className="py-3 pl-3 pr-5 text-right">External Share Links</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 text-xs">
                {members.map((member) => {
                  const perm = activeFolder.permissions.find((p) => p.memberId === member.id) || {
                    memberId: member.id,
                    role: 'viewer' as FolderRole,
                    canShareExternal: false,
                  };
                  const avatar = MEMBER_AVATARS[member.id];
                  const canShareOption = perm.role === 'owner' || perm.role === 'editor';

                  return (
                    <tr key={member.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30">
                      <td className="py-3.5 pl-5 pr-3">
                        <div className="flex items-center gap-3">
                          {avatar ? (
                            <img
                              src={avatar}
                              alt={member.name}
                              referrerPolicy="no-referrer"
                              className="h-9 w-9 rounded-full object-cover border border-slate-200 dark:border-slate-700 shrink-0"
                            />
                          ) : (
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-200 dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200">
                              {member.name
                                .split(' ')
                                .map((n) => n[0])
                                .join('')}
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="font-semibold text-slate-900 dark:text-slate-100 truncate">
                              {member.name}
                            </p>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                              {member.roleTitle} ·{' '}
                              <span className="font-mono">{member.publicKeyFingerprint.slice(0, 17)}</span>
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3.5 px-3">
                        <select
                          value={perm.role}
                          disabled={savingId === member.id}
                          onChange={(e) => handleRoleChange(member, e.target.value as FolderRole)}
                          className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#0B0F17] px-3 py-1.5 text-xs font-medium text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="owner">Owner (Full Control)</option>
                          <option value="editor">Editor (Upload & Modify)</option>
                          <option value="downloader">Downloader (Decrypt & Save)</option>
                          <option value="viewer">Viewer (Preview Only)</option>
                          <option value="revoked">Revoked (No Access)</option>
                        </select>
                      </td>
                      <td className="py-3.5 pl-3 pr-5 text-right">
                        <label className="inline-flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            disabled={!canShareOption || savingId === member.id}
                            checked={perm.canShareExternal}
                            onChange={(e) => handleExternalToggle(member, e.target.checked)}
                            className="h-4 w-4 rounded border-slate-300 dark:border-slate-700 text-blue-600 disabled:opacity-40"
                          />
                          <span className="text-slate-600 dark:text-slate-300">
                            {perm.canShareExternal ? 'Allowed' : 'Restricted'}
                          </span>
                        </label>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="border-t border-slate-200 dark:border-slate-800 px-5 py-3 text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-2">
            <UserCheck className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
            All permission changes are cryptographically signed and recorded in the immutable Activity Log.
          </div>
        </div>
      </div>
    </div>
  );
};
