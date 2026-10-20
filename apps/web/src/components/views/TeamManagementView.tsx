import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../lib/AuthContext';
import type { OrganizationMembership, OrganizationInvitation, OrgRole } from '@forgex/shared-types';
import {
  Users,
  UserPlus,
  Search,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Copy,
  Check,
  XCircle,
} from 'lucide-react';
import { Modal } from '../ui/Modal';

export const TeamManagementView: React.FC = () => {
  const { organization, token, membership: currentMembership, isOwnerOrAdmin } = useAuth();
  const [members, setMembers] = useState<OrganizationMembership[]>([]);
  const [invitations, setInvitations] = useState<OrganizationInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Filters & search
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('ALL');
  const [activeTab, setActiveTab] = useState<'members' | 'invitations'>('members');

  // Invite Modal
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<OrgRole>('ENGINEER');
  const [invitePlantScope, setInvitePlantScope] = useState('');
  const [submittingInvite, setSubmittingInvite] = useState(false);
  const [generatedInviteLink, setGeneratedInviteLink] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  // Change Role Modal
  const [roleModalOpen, setRoleModalOpen] = useState(false);
  const [selectedMember, setSelectedMember] = useState<OrganizationMembership | null>(null);
  const [newRole, setNewRole] = useState<OrgRole>('ENGINEER');
  const [newPlantScope, setNewPlantScope] = useState('');
  const [submittingRoleChange, setSubmittingRoleChange] = useState(false);

  const fetchTeamData = useCallback(async () => {
    if (!token || !organization?.id) return;
    try {
      setLoading(true);
      setError(null);

      // Fetch members
      const memRes = await fetch('/api/v1/org/members', {
        headers: {
          Authorization: `Bearer ${token}`,
          'x-organization-id': organization.id,
        },
      });
      if (memRes.ok) {
        const memJson = await memRes.json();
        setMembers(memJson.data || []);
      }

      // Fetch invitations
      const invRes = await fetch('/api/v1/org/invitations', {
        headers: {
          Authorization: `Bearer ${token}`,
          'x-organization-id': organization.id,
        },
      });
      if (invRes.ok) {
        const invJson = await invRes.json();
        setInvitations(invJson.data || []);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to load team data');
    } finally {
      setLoading(false);
    }
  }, [token, organization?.id]);

  useEffect(() => {
    fetchTeamData();
  }, [fetchTeamData]);

  const handleSendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !organization?.id) return;
    setSubmittingInvite(true);
    setError(null);
    try {
      const assignedPlantIds = invitePlantScope
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      const res = await fetch('/api/v1/org/invitations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'x-organization-id': organization.id,
        },
        body: JSON.stringify({
          email: inviteEmail,
          role: inviteRole,
          assignedPlantIds,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error?.message || 'Failed to send invitation');
      }

      setGeneratedInviteLink(`${window.location.origin}${json.data.invitationUrl}`);
      setSuccessMessage(`Invitation created for ${inviteEmail}`);
      fetchTeamData();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmittingInvite(false);
    }
  };

  const handleChangeRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !organization?.id || !selectedMember) return;
    setSubmittingRoleChange(true);
    setError(null);
    try {
      const assignedPlantIds = newPlantScope
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      const res = await fetch(`/api/v1/org/members/${selectedMember.id}/role`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'x-organization-id': organization.id,
        },
        body: JSON.stringify({
          role: newRole,
          assignedPlantIds,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error?.message || 'Failed to update member role');
      }

      setSuccessMessage(`Updated role for ${selectedMember.user?.fullName || 'member'} to ${newRole}`);
      setRoleModalOpen(false);
      fetchTeamData();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmittingRoleChange(false);
    }
  };

  const handleToggleMemberStatus = async (member: OrganizationMembership) => {
    if (!token || !organization?.id) return;
    const nextStatus = member.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    if (!confirm(`Are you sure you want to change status to ${nextStatus} for ${member.user?.fullName || member.userId}?`)) {
      return;
    }

    try {
      const res = await fetch(`/api/v1/org/members/${member.id}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'x-organization-id': organization.id,
        },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (res.ok) {
        setSuccessMessage(`Member status set to ${nextStatus}`);
        fetchTeamData();
      } else {
        const json = await res.json();
        setError(json.error?.message || 'Failed to update status');
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleRevokeInvitation = async (invitationId: string) => {
    if (!token || !organization?.id) return;
    if (!confirm('Are you sure you want to revoke this invitation?')) return;
    try {
      const res = await fetch(`/api/v1/org/invitations/${invitationId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
          'x-organization-id': organization.id,
        },
      });
      if (res.ok) {
        setSuccessMessage('Invitation revoked successfully');
        fetchTeamData();
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleResendInvitation = async (invitationId: string) => {
    if (!token || !organization?.id) return;
    try {
      const res = await fetch(`/api/v1/org/invitations/${invitationId}/resend`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'x-organization-id': organization.id,
        },
      });
      if (res.ok) {
        setSuccessMessage('Invitation renewed and resent');
        fetchTeamData();
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  const filteredMembers = members.filter((m) => {
    const nameMatch = m.user?.fullName?.toLowerCase().includes(searchQuery.toLowerCase()) || false;
    const emailMatch = m.user?.email?.toLowerCase().includes(searchQuery.toLowerCase()) || false;
    const matchesSearch = searchQuery === '' || nameMatch || emailMatch;
    const matchesRole = roleFilter === 'ALL' || m.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  const getRoleBadge = (role: OrgRole) => {
    switch (role) {
      case 'ORGANIZATION_OWNER':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">Owner</span>;
      case 'ORGANIZATION_ADMIN':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200">Admin</span>;
      case 'PLANT_MANAGER':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">Plant Manager</span>;
      case 'ENGINEER':
      case 'ENGINEER_TECHNICIAN':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">Engineer</span>;
      case 'TECHNICIAN':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-cyan-50 text-cyan-700 border border-cyan-200">Technician</span>;
      case 'VIEWER':
      default:
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">Viewer</span>;
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 bg-[#F5F6F7] text-[#1A202C] font-sans">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-[#1A202C] flex items-center gap-2">
            <Users className="w-5 h-5 text-[#2563EB]" />
            Team & Role-Based Access Control
          </h1>
          <p className="text-xs text-[#64748B] mt-1">
            Manage organization team members, delegate granular operational roles, and enforce plant-scoped access.
          </p>
        </div>

        {isOwnerOrAdmin && (
          <button
            onClick={() => {
              setInviteModalOpen(true);
              setGeneratedInviteLink(null);
              setInviteEmail('');
              setInvitePlantScope('');
            }}
            className="flex items-center gap-2 px-3.5 py-2 bg-[#151C24] hover:bg-black text-white font-semibold text-xs rounded-xl shadow-sm transition self-start md:self-auto"
          >
            <UserPlus className="w-4 h-4" />
            <span>Invite Team Member</span>
          </button>
        )}
      </div>

      {/* Metrics Banner */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <div className="p-3.5 rounded-xl bg-white border border-[#E2E8F0] shadow-sm">
          <div className="text-[11px] text-[#64748B] font-medium">Active Members</div>
          <div className="text-xl font-bold text-[#1A202C] mt-1">
            {members.filter((m) => m.status === 'ACTIVE').length}
          </div>
        </div>
        <div className="p-3.5 rounded-xl bg-white border border-[#E2E8F0] shadow-sm">
          <div className="text-[11px] text-[#64748B] font-medium">Pending Invitations</div>
          <div className="text-xl font-bold text-amber-600 mt-1">
            {invitations.filter((i) => i.status === 'PENDING').length}
          </div>
        </div>
        <div className="p-3.5 rounded-xl bg-white border border-[#E2E8F0] shadow-sm">
          <div className="text-[11px] text-[#64748B] font-medium">Plant Managers</div>
          <div className="text-xl font-bold text-blue-600 mt-1">
            {members.filter((m) => m.role === 'PLANT_MANAGER').length}
          </div>
        </div>
        <div className="p-3.5 rounded-xl bg-white border border-[#E2E8F0] shadow-sm">
          <div className="text-[11px] text-[#64748B] font-medium">Field Technicians</div>
          <div className="text-xl font-bold text-cyan-600 mt-1">
            {members.filter((m) => m.role === 'TECHNICIAN').length}
          </div>
        </div>
      </div>

      {/* Feedback Messages */}
      {successMessage && (
        <div className="mb-4 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>{successMessage}</span>
          </div>
          <button onClick={() => setSuccessMessage(null)} className="text-emerald-700 hover:text-emerald-900">
            <XCircle className="w-4 h-4" />
          </button>
        </div>
      )}

      {error && (
        <div className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-600" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-rose-700 hover:text-rose-900">
            <XCircle className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Tabs & Search Controls */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mb-4">
        <div className="flex bg-[#F1F5F9] p-1 rounded-xl border border-[#E2E8F0] w-full sm:w-auto">
          <button
            onClick={() => setActiveTab('members')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
              activeTab === 'members' ? 'bg-white text-[#1A202C] shadow-sm' : 'text-[#64748B] hover:text-[#1A202C]'
            }`}
          >
            Members ({members.length})
          </button>
          <button
            onClick={() => setActiveTab('invitations')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
              activeTab === 'invitations' ? 'bg-white text-[#1A202C] shadow-sm' : 'text-[#64748B] hover:text-[#1A202C]'
            }`}
          >
            Pending Invites ({invitations.filter((i) => i.status === 'PENDING').length})
          </button>
        </div>

        {activeTab === 'members' && (
          <div className="flex items-center gap-2.5 w-full sm:w-auto">
            {/* Search */}
            <div className="relative flex-1 sm:w-64">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search by name or email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 bg-white border border-[#CBD5E1] focus:border-[#2563EB] rounded-xl text-xs text-[#1A202C] placeholder-[#94A3B8] outline-none transition shadow-sm"
              />
            </div>

            {/* Role Filter */}
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="bg-white border border-[#CBD5E1] text-[#1A202C] text-xs rounded-xl px-3 py-1.5 outline-none focus:border-[#2563EB] shadow-sm"
            >
              <option value="ALL">All Roles</option>
              <option value="ORGANIZATION_OWNER">Owner</option>
              <option value="ORGANIZATION_ADMIN">Admin</option>
              <option value="PLANT_MANAGER">Plant Manager</option>
              <option value="ENGINEER">Engineer</option>
              <option value="TECHNICIAN">Technician</option>
              <option value="VIEWER">Viewer</option>
            </select>

            <button
              onClick={fetchTeamData}
              title="Refresh team data"
              className="p-2 rounded-xl bg-white border border-[#CBD5E1] hover:border-slate-400 text-[#64748B] hover:text-[#1A202C] transition shadow-sm"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Main Table Content */}
      {activeTab === 'members' ? (
        <div className="bg-white border border-[#E2E8F0] rounded-2xl overflow-hidden shadow-sm">
          {loading ? (
            <div className="p-12 text-center text-xs text-[#64748B]">Loading team directory...</div>
          ) : filteredMembers.length === 0 ? (
            <div className="p-12 text-center text-xs text-[#64748B]">
              No team members found matching your search.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-[#64748B] font-mono text-[11px] uppercase tracking-wider">
                  <tr>
                    <th className="py-3 px-4">Member Name</th>
                    <th className="py-3 px-4">Role</th>
                    <th className="py-3 px-4">Assigned Plant Scope</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Joined Date</th>
                    {isOwnerOrAdmin && <th className="py-3 px-4 text-right">Actions</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8F0]">
                  {filteredMembers.map((m) => {
                    const isSelf = m.userId === currentMembership?.userId;
                    const isOwner = m.role === 'ORGANIZATION_OWNER';

                    return (
                      <tr key={m.id} className="hover:bg-[#F8FAFC] transition">
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-3">
                            <div className="w-7 h-7 rounded-full bg-slate-100 text-[#2563EB] flex items-center justify-center font-bold text-xs border border-[#CBD5E1]">
                              {m.user?.fullName ? m.user.fullName.substring(0, 2).toUpperCase() : 'U'}
                            </div>
                            <div>
                              <div className="font-semibold text-[#1A202C] flex items-center gap-1.5">
                                <span>{m.user?.fullName || 'Anonymous Member'}</span>
                                {isSelf && (
                                  <span className="text-[10px] text-[#64748B] font-normal">(You)</span>
                                )}
                              </div>
                              <div className="text-[11px] text-[#64748B] font-sans">{m.user?.email}</div>
                            </div>
                          </div>
                        </td>

                        <td className="py-3 px-4">{getRoleBadge(m.role)}</td>

                        <td className="py-3 px-4">
                          {m.assignedPlantIds && m.assignedPlantIds.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {m.assignedPlantIds.map((p) => (
                                <span
                                  key={p}
                                  className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-mono text-[10px] border border-slate-200"
                                >
                                  {p}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-[#64748B] italic text-[11px]">All Organization Plants</span>
                          )}
                        </td>

                        <td className="py-3 px-4">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              m.status === 'ACTIVE'
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : 'bg-rose-50 text-rose-700 border border-rose-200'
                            }`}
                          >
                            {m.status}
                          </span>
                        </td>

                        <td className="py-3 px-4 text-[#64748B] text-[11px] font-sans">
                          {new Date(m.createdAt).toLocaleDateString()}
                        </td>

                        {isOwnerOrAdmin && (
                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={() => {
                                  setSelectedMember(m);
                                  setNewRole(m.role);
                                  setNewPlantScope((m.assignedPlantIds || []).join(', '));
                                  setRoleModalOpen(true);
                                }}
                                disabled={isOwner && currentMembership?.role !== 'ORGANIZATION_OWNER'}
                                className="px-2.5 py-1 rounded-lg bg-white hover:bg-slate-50 text-[#1A202C] border border-[#CBD5E1] shadow-sm transition text-[11px] font-medium disabled:opacity-40"
                              >
                                Edit Role
                              </button>

                              {!isOwner && (
                                <button
                                  onClick={() => handleToggleMemberStatus(m)}
                                  className={`px-2 py-1 rounded-lg transition text-[11px] ${
                                    m.status === 'ACTIVE'
                                      ? 'text-amber-600 hover:bg-amber-50'
                                      : 'text-emerald-600 hover:bg-emerald-50'
                                  }`}
                                  title={m.status === 'ACTIVE' ? 'Suspend Member' : 'Reactivate Member'}
                                >
                                  {m.status === 'ACTIVE' ? 'Suspend' : 'Reactivate'}
                                </button>
                              )}
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        /* Pending Invitations Table */
        <div className="bg-white border border-[#E2E8F0] rounded-2xl overflow-hidden shadow-sm">
          {invitations.length === 0 ? (
            <div className="p-12 text-center text-xs text-[#64748B]">
              No outstanding invitations. Click "Invite Team Member" to onboard colleagues.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-[#64748B] font-mono text-[11px] uppercase tracking-wider">
                  <tr>
                    <th className="py-3 px-4">Invited Email</th>
                    <th className="py-3 px-4">Designated Role</th>
                    <th className="py-3 px-4">Plant Scope</th>
                    <th className="py-3 px-4">Expiration</th>
                    <th className="py-3 px-4">Status</th>
                    {isOwnerOrAdmin && <th className="py-3 px-4 text-right">Actions</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8F0]">
                  {invitations.map((inv) => (
                    <tr key={inv.id} className="hover:bg-[#F8FAFC] transition">
                      <td className="py-3 px-4 font-semibold text-[#1A202C]">{inv.email}</td>
                      <td className="py-3 px-4">{getRoleBadge(inv.role)}</td>
                      <td className="py-3 px-4 text-[#64748B]">
                        {inv.assignedPlantIds && inv.assignedPlantIds.length > 0
                          ? inv.assignedPlantIds.join(', ')
                          : 'All Plants'}
                      </td>
                      <td className="py-3 px-4 text-[#64748B] font-mono text-[11px]">
                        {new Date(inv.expiresAt).toLocaleDateString()}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            inv.status === 'PENDING'
                              ? 'bg-amber-50 text-amber-700 border border-amber-200'
                              : inv.status === 'ACCEPTED'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-rose-50 text-rose-700 border border-rose-200'
                          }`}
                        >
                          {inv.status}
                        </span>
                      </td>
                      {isOwnerOrAdmin && (
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {inv.status === 'PENDING' && (
                              <>
                                <button
                                  onClick={() => handleResendInvitation(inv.id)}
                                  className="text-xs text-[#1A202C] hover:text-black px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 border border-slate-200"
                                >
                                  Resend
                                </button>
                                <button
                                  onClick={() => handleRevokeInvitation(inv.id)}
                                  className="text-xs text-rose-600 hover:text-rose-700 px-2 py-1 rounded hover:bg-rose-50"
                                >
                                  Revoke
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Invite Modal */}
      <Modal
        isOpen={inviteModalOpen}
        onClose={() => setInviteModalOpen(false)}
        title="Invite Organization Employee"
        subtitle="Invite industrial engineers, technicians, or plant managers with role-scoped authorization."
        maxWidth="md"
      >
        {generatedInviteLink ? (
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs">
              <div className="font-bold flex items-center gap-1.5 mb-1">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                Invitation Generated Successfully!
              </div>
              <p>Share this secure onboarding link with the employee to complete account activation:</p>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={generatedInviteLink}
                className="flex-1 px-3 py-2 bg-slate-50 border border-[#CBD5E1] rounded-xl text-xs text-[#1A202C] font-mono select-all"
              />
              <button
                onClick={() => {
                  navigator.clipboard.writeText(generatedInviteLink);
                  setCopiedLink(true);
                  setTimeout(() => setCopiedLink(false), 2000);
                }}
                className="px-3 py-2 bg-[#151C24] hover:bg-black text-white font-semibold text-xs rounded-xl flex items-center gap-1 shadow-sm"
              >
                {copiedLink ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                <span>{copiedLink ? 'Copied' : 'Copy'}</span>
              </button>
            </div>

            <button
              onClick={() => setInviteModalOpen(false)}
              className="w-full mt-4 py-2 bg-white hover:bg-slate-50 border border-[#CBD5E1] text-[#1A202C] text-xs font-semibold rounded-xl shadow-sm"
            >
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={handleSendInvite} className="space-y-4">
            <div>
              <label className="block text-[11px] font-medium text-[#1A202C] mb-1">
                Employee Business Email
              </label>
              <input
                type="email"
                required
                placeholder="technician@plant.industrial"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-[#CBD5E1] focus:border-[#2563EB] rounded-xl text-xs text-[#1A202C] placeholder-[#94A3B8] outline-none"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-[#1A202C] mb-1">
                Operational Role Assignment
              </label>
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as OrgRole)}
                className="w-full px-3 py-2 bg-white border border-[#CBD5E1] focus:border-[#2563EB] rounded-xl text-xs text-[#1A202C] outline-none"
              >
                <option value="PLANT_MANAGER">Plant Manager (Manages assigned plants, assets, maintenance)</option>
                <option value="ENGINEER">Engineer (Technical manuals, AI Copilot, troubleshooting, cases)</option>
                <option value="TECHNICIAN">Technician (Equipment info, approved instructions, field tasks)</option>
                <option value="VIEWER">Viewer / Auditor (Read-only access)</option>
                {currentMembership?.role === 'ORGANIZATION_OWNER' && (
                  <option value="ORGANIZATION_ADMIN">Organization Admin (Full team and workspace access)</option>
                )}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-[#1A202C] mb-1">
                Assigned Plant Scope (Optional)
              </label>
              <input
                type="text"
                placeholder="PLANT-TX-04, PLANT-OHIO-01 (leave blank for all)"
                value={invitePlantScope}
                onChange={(e) => setInvitePlantScope(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-[#CBD5E1] focus:border-[#2563EB] rounded-xl text-xs text-[#1A202C] placeholder-[#94A3B8] outline-none font-mono"
              />
              <span className="text-[10px] text-[#64748B] mt-1 block">
                Comma-separated plant codes. If omitted, employee has access to all authorized plants.
              </span>
            </div>

            <button
              type="submit"
              disabled={submittingInvite}
              className="w-full py-2.5 bg-[#151C24] hover:bg-black text-white font-semibold text-xs rounded-xl shadow-sm transition disabled:opacity-50"
            >
              {submittingInvite ? 'Generating Invitation...' : 'Send Secure Invitation'}
            </button>
          </form>
        )}
      </Modal>

      {/* Change Role Modal */}
      <Modal
        isOpen={roleModalOpen}
        onClose={() => setRoleModalOpen(false)}
        title={`Change Role: ${selectedMember?.user?.fullName || 'Member'}`}
        subtitle="Modify role authority or plant-scoping constraints."
        maxWidth="md"
      >
        <form onSubmit={handleChangeRole} className="space-y-4">
          <div>
            <label className="block text-[11px] font-medium text-[#1A202C] mb-1">
              New Role Assignment
            </label>
            <select
              value={newRole}
              onChange={(e) => setNewRole(e.target.value as OrgRole)}
              className="w-full px-3 py-2 bg-white border border-[#CBD5E1] focus:border-[#2563EB] rounded-xl text-xs text-[#1A202C] outline-none"
            >
              <option value="VIEWER">Viewer (Read-only)</option>
              <option value="TECHNICIAN">Technician (Maintenance execution)</option>
              <option value="ENGINEER">Engineer (Full diagnostic & knowledge tools)</option>
              <option value="PLANT_MANAGER">Plant Manager (Facility supervision)</option>
              <option value="ORGANIZATION_ADMIN">Organization Admin</option>
              {currentMembership?.role === 'ORGANIZATION_OWNER' && (
                <option value="ORGANIZATION_OWNER">Transfer Organization Owner</option>
              )}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-[#1A202C] mb-1">
              Assigned Plant Scope
            </label>
            <input
              type="text"
              placeholder="PLANT-TX-04, PLANT-OHIO-01"
              value={newPlantScope}
              onChange={(e) => setNewPlantScope(e.target.value)}
              className="w-full px-3 py-2 bg-white border border-[#CBD5E1] focus:border-[#2563EB] rounded-xl text-xs text-[#1A202C] placeholder-[#94A3B8] outline-none font-mono"
            />
          </div>

          <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-[11px] flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600" />
            <span>Role changes take effect immediately across all active API sessions.</span>
          </div>

          <button
            type="submit"
            disabled={submittingRoleChange}
            className="w-full py-2.5 bg-[#151C24] hover:bg-black text-white font-semibold text-xs rounded-xl shadow-sm transition disabled:opacity-50"
          >
            {submittingRoleChange ? 'Saving Changes...' : 'Confirm Role Update'}
          </button>
        </form>
      </Modal>
    </div>
  );
};
