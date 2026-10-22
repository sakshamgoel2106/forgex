import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../lib/AuthContext';
import type { OrganizationMembership, OrganizationInvitation, OrgRole, Machine } from '@forgex/shared-types';
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
  QrCode,
  Printer,
  KeyRound,
  Clock,
  ShieldCheck,
  Lock,
  Eye,
  EyeOff,
  Link as LinkIcon,
  CheckCheck,
  Sparkles,
} from 'lucide-react';
import { Modal } from '../ui/Modal';
import { QrSvg } from '../../lib/qrSvg';
import { PasswordStrengthMeter } from '../auth/PasswordStrengthMeter';
import { useToast } from '../../lib/ToastContext';

export const TeamManagementView: React.FC = () => {
  const { toast } = useToast();
  const {
    organization,
    token,
    membership: currentMembership,
    isOwnerOrAdmin,
    triggerMemberPasswordReset,
    verifyResetOtp,
    resetPassword,
    revokeMemberSessions,
    getMemberCredentialsSummary,
    linkMemberGoogle,
    unlinkMemberGoogle,
    googleConfig,
  } = useAuth();
  const [members, setMembers] = useState<OrganizationMembership[]>([]);
  const [invitations, setInvitations] = useState<OrganizationInvitation[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Filters & search
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('ALL');
  const [activeTab, setActiveTab] = useState<'members' | 'invitations'>('members');

  // Add Employee / Invite Modal State
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [inviteFullName, setInviteFullName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteEmployeeId, setInviteEmployeeId] = useState('');
  const [inviteDepartment, setInviteDepartment] = useState('Mechanical Maintenance');
  const [inviteDesignation, setInviteDesignation] = useState('Reliability Specialist');
  const [inviteRole, setInviteRole] = useState<OrgRole>('TECHNICIAN');
  const [invitePlantScope, setInvitePlantScope] = useState('');
  const [inviteMachineIds, setInviteMachineIds] = useState<string[]>([]);
  const [generateActivationCode, setGenerateActivationCode] = useState(false);

  const [submittingInvite, setSubmittingInvite] = useState(false);
  const [createdInviteResult, setCreatedInviteResult] = useState<{
    invitationUrl: string;
    activationCode?: string;
    invitationId: string;
    email: string;
    role: string;
  } | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  // QR Modal State
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [selectedInviteForQr, setSelectedInviteForQr] = useState<OrganizationInvitation | null>(null);
  const [qrActivationUrl, setQrActivationUrl] = useState<string | null>(null);
  const [qrExpiresAt, setQrExpiresAt] = useState<string | null>(null);
  const [loadingQr, setLoadingQr] = useState(false);
  const [copiedQrLink, setCopiedQrLink] = useState(false);

  // Change Role Modal
  const [roleModalOpen, setRoleModalOpen] = useState(false);
  const [selectedMember, setSelectedMember] = useState<OrganizationMembership | null>(null);
  const [newRole, setNewRole] = useState<OrgRole>('TECHNICIAN');
  const [newPlantScope, setNewPlantScope] = useState('');
  const [submittingRoleChange, setSubmittingRoleChange] = useState(false);

  // Employee Account Management & Credentials Modal State (Requirement 2 & 3)
  const [credsModalOpen, setCredsModalOpen] = useState(false);
  const [selectedMemberForCreds, setSelectedMemberForCreds] = useState<OrganizationMembership | null>(null);
  const [credsSummary, setCredsSummary] = useState<any | null>(null);
  const [loadingCreds, setLoadingCreds] = useState(false);
  const [credsActionSubmitting, setCredsActionSubmitting] = useState(false);
  const [credsSuccessMessage, setCredsSuccessMessage] = useState<string | null>(null);
  const [credsErrorMessage, setCredsErrorMessage] = useState<string | null>(null);

  // Reset Password Panel within Credentials Modal
  const [showResetPasswordPanel, setShowResetPasswordPanel] = useState(false);
  const [resetOtp, setResetOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPasswordText, setShowPasswordText] = useState(false);
  const [resetSubmitting, setResetSubmitting] = useState(false);
  const [resetDebugOtp, setResetDebugOtp] = useState<string | null>(null);
  const [resetPasswordError, setResetPasswordError] = useState<string | null>(null);

  // Google Account Linking within Credentials Modal
  const [showGoogleLinkBox, setShowGoogleLinkBox] = useState(false);
  const [googleEmailInput, setGoogleEmailInput] = useState('');
  const [googleLinkError, setGoogleLinkError] = useState<string | null>(null);

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

      // Fetch machines for machine scoping
      const macRes = await fetch('/api/v1/machines', {
        headers: {
          Authorization: `Bearer ${token}`,
          'x-organization-id': organization.id,
        },
      });
      if (macRes.ok) {
        const macJson = await macRes.json();
        setMachines(macJson.data || []);
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

  // Open QR Code Modal for an existing invitation
  const handleOpenQrModal = async (inv: OrganizationInvitation) => {
    setSelectedInviteForQr(inv);
    setQrModalOpen(true);
    setLoadingQr(true);
    setQrActivationUrl(null);
    setQrExpiresAt(null);

    try {
      const res = await fetch(`/api/v1/org/invitations/${inv.id}/qr`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'x-organization-id': organization?.id || '',
        },
      });
      const json = await res.json();
      if (res.ok && json.success && json.data) {
        setQrActivationUrl(`${window.location.origin}${json.data.qrActivationUrl}`);
        setQrExpiresAt(json.data.qrExpiresAt);
      } else {
        setError(json.error?.message || 'Failed to generate in-person QR code.');
      }
    } catch (err: any) {
      setError('Network error generating QR code.');
    } finally {
      setLoadingQr(false);
    }
  };

  // Submit Add Employee / Invite
  const handleSendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !organization?.id) return;

    if (!inviteEmail.trim()) {
      const msg = 'Employee email is required to dispatch an invitation.';
      setError(msg);
      toast.error('Validation Error', msg);
      return;
    }

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
          email: inviteEmail.trim().toLowerCase(),
          role: inviteRole,
          fullName: inviteFullName.trim() || undefined,
          employeeId: inviteEmployeeId.trim() || undefined,
          department: inviteDepartment.trim() || undefined,
          designation: inviteDesignation.trim() || undefined,
          assignedPlantIds,
          assignedMachineIds: inviteMachineIds,
          generateActivationCode,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error?.message || 'Failed to send invitation');
      }

      setCreatedInviteResult({
        invitationUrl: `${window.location.origin}${json.data.invitationUrl}`,
        activationCode: json.data.activationCode,
        invitationId: json.data.invitation.id,
        email: inviteEmail,
        role: inviteRole,
      });

      toast.success('Invitation Dispatched', `Employee invitation sent to ${inviteEmail.trim()}`);
      setSuccessMessage(`Employee created: ${inviteEmail}`);
      fetchTeamData();
    } catch (err: any) {
      setError(err.message);
      toast.error('Invitation Failed', err.message);
    } finally {
      setSubmittingInvite(false);
    }
  };

  // Submit Role Change
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

      toast.success('Role Updated', `Updated role for ${selectedMember.user?.fullName || 'member'} to ${newRole}`);
      setSuccessMessage(`Updated role for ${selectedMember.user?.fullName || 'member'} to ${newRole}`);
      setRoleModalOpen(false);
      fetchTeamData();
    } catch (err: any) {
      setError(err.message);
      toast.error('Role Update Failed', err.message);
    } finally {
      setSubmittingRoleChange(false);
    }
  };

  // Toggle Member Status (ACTIVE / SUSPENDED)
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
        toast.success('Status Changed', `Member status updated to ${nextStatus}`);
        setSuccessMessage(`Member status set to ${nextStatus}`);
        fetchTeamData();
      } else {
        const json = await res.json();
        const msg = json.error?.message || 'Failed to update status';
        setError(msg);
        toast.error('Status Change Failed', msg);
      }
    } catch (err: any) {
      setError(err.message);
      toast.error('Status Change Failed', err.message);
    }
  };

  // Revoke Invitation
  const handleRevokeInvitation = async (invitationId: string) => {
    if (!token || !organization?.id) return;
    if (!confirm('Are you sure you want to revoke this employee invitation?')) return;
    try {
      const res = await fetch(`/api/v1/org/invitations/${invitationId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
          'x-organization-id': organization.id,
        },
      });
      if (res.ok) {
        toast.success('Invitation Revoked', 'Employee activation invitation cancelled.');
        setSuccessMessage('Invitation revoked successfully');
        fetchTeamData();
      }
    } catch (err: any) {
      setError(err.message);
      toast.error('Revocation Failed', err.message);
    }
  };

  // Resend Invitation
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
        toast.success('Invitation Resent', 'Activation email refreshed and resent to employee.');
        setSuccessMessage('Invitation renewed and resent');
        fetchTeamData();
      }
    } catch (err: any) {
      setError(err.message);
      toast.error('Resend Failed', err.message);
    }
  };

  // Open Employee Credentials & Account Management Modal (Section 2)
  const handleOpenCredentialsModal = async (m: OrganizationMembership) => {
    setSelectedMemberForCreds(m);
    setCredsModalOpen(true);
    setLoadingCreds(true);
    setCredsSuccessMessage(null);
    setCredsErrorMessage(null);
    setCredsSummary(null);

    // Reset inline forms
    setShowResetPasswordPanel(false);
    setResetOtp('');
    setNewPassword('');
    setConfirmPassword('');
    setShowPasswordText(false);
    setResetDebugOtp(null);
    setResetPasswordError(null);
    setShowGoogleLinkBox(false);
    setGoogleEmailInput('');
    setGoogleLinkError(null);

    try {
      const res = await getMemberCredentialsSummary(m.id);
      if (res.success && res.data) {
        setCredsSummary(res.data);
      } else {
        setCredsErrorMessage(res.error || 'Failed to load credentials summary.');
      }
    } catch (err: any) {
      setCredsErrorMessage(err?.message || 'Error loading credentials summary.');
    } finally {
      setLoadingCreds(false);
    }
  };

  // Trigger Admin-Initiated Employee Password Recovery (Section 2 & 3)
  const handleTriggerMemberReset = async () => {
    if (!selectedMemberForCreds) return;
    const targetEmail = selectedMemberForCreds.user?.email || 'this employee';
    if (!confirm(`Dispatch a password recovery verification code directly to ${targetEmail}? The employee must verify their identity and set their password.`)) {
      return;
    }
    setCredsActionSubmitting(true);
    setCredsErrorMessage(null);
    setCredsSuccessMessage(null);
    setResetPasswordError(null);
    try {
      const res = await triggerMemberPasswordReset(selectedMemberForCreds.id);
      if (res.success) {
        toast.success('Recovery Code Sent', `Password recovery code dispatched to ${targetEmail}`);
        setCredsSuccessMessage(res.message || 'Password recovery instructions have been dispatched to the employee.');
        setSuccessMessage(`Password recovery dispatched to ${targetEmail}`);
        if (res.debugOtp) {
          setResetDebugOtp(res.debugOtp);
        }
        // Automatically open the verification & reset panel!
        setShowResetPasswordPanel(true);
      } else {
        const msg = res.error || 'Failed to trigger password recovery.';
        setCredsErrorMessage(msg);
        toast.error('Dispatch Failed', msg);
      }
    } catch (err: any) {
      const msg = err?.message || 'Network error.';
      setCredsErrorMessage(msg);
      toast.error('Network Error', msg);
    } finally {
      setCredsActionSubmitting(false);
    }
  };

  // Verify OTP and complete password reset directly inside the modal
  const handleVerifyOtpAndSubmitReset = async () => {
    if (!selectedMemberForCreds || !credsSummary?.email) return;
    if (resetOtp.trim().length !== 6) {
      const msg = 'Please enter the 6-digit OTP code received in email.';
      setResetPasswordError(msg);
      toast.error('Invalid Code', msg);
      return;
    }
    if (newPassword.length < 8) {
      const msg = 'Password must be at least 8 characters long.';
      setResetPasswordError(msg);
      toast.error('Weak Password', msg);
      return;
    }
    if (newPassword !== confirmPassword) {
      const msg = 'New password and confirm password do not match.';
      setResetPasswordError(msg);
      toast.error('Password Mismatch', msg);
      return;
    }

    setResetSubmitting(true);
    setResetPasswordError(null);
    try {
      // Step 1: verify OTP code
      const otpRes = await verifyResetOtp(credsSummary.email, resetOtp.trim());
      if (!otpRes.success || !otpRes.resetSessionToken) {
        const msg = otpRes.error || 'Invalid or expired OTP code.';
        setResetPasswordError(msg);
        toast.error('Verification Failed', msg);
        setResetSubmitting(false);
        return;
      }

      // Step 2: apply new password with verified session token
      const resetRes = await resetPassword(otpRes.resetSessionToken, newPassword, confirmPassword);
      if (!resetRes.success) {
        const msg = resetRes.error || 'Failed to set new password.';
        setResetPasswordError(msg);
        toast.error('Reset Failed', msg);
        setResetSubmitting(false);
        return;
      }

      toast.success('Password Configured', 'Password successfully updated for employee account.');
      setCredsSuccessMessage('Password successfully updated! Account credentials are now configured.');
      setShowResetPasswordPanel(false);
      setResetOtp('');
      setNewPassword('');
      setConfirmPassword('');
      setResetDebugOtp(null);

      // Refresh credentials summary so hasPassword is true
      if (selectedMemberForCreds) {
        const summaryRes = await getMemberCredentialsSummary(selectedMemberForCreds.id);
        if (summaryRes.success && summaryRes.data) {
          setCredsSummary(summaryRes.data);
        }
      }
      fetchTeamData();
    } catch (err: any) {
      const msg = err?.message || 'An error occurred while updating the password.';
      setResetPasswordError(msg);
      toast.error('Password Reset Error', msg);
    } finally {
      setResetSubmitting(false);
    }
  };

  // Link Google account via manual email entry
  const handleLinkGoogleEmail = async () => {
    if (!selectedMemberForCreds || !googleEmailInput.trim()) return;
    setCredsActionSubmitting(true);
    setGoogleLinkError(null);
    setCredsErrorMessage(null);
    try {
      const res = await linkMemberGoogle(selectedMemberForCreds.id, {
        email: googleEmailInput.trim(),
      });
      if (res.success) {
        toast.success('Google SSO Linked', `Google account ${googleEmailInput.trim()} linked successfully.`);
        setCredsSuccessMessage(res.message || 'Google account linked successfully.');
        setCredsSummary((prev: any) => (prev ? { ...prev, googleLinked: true, googleEmail: googleEmailInput.trim() } : null));
        setShowGoogleLinkBox(false);
        setGoogleEmailInput('');
        fetchTeamData();
      } else {
        const msg = res.error || 'Failed to link Google account.';
        setGoogleLinkError(msg);
        toast.error('Linking Failed', msg);
      }
    } catch (err: any) {
      const msg = err?.message || 'Network error linking Google account.';
      setGoogleLinkError(msg);
      toast.error('Network Error', msg);
    } finally {
      setCredsActionSubmitting(false);
    }
  };

  // Link Google account via Google One-Tap or OAuth token client
  const handleGoogleOAuthPopup = () => {
    const win = window as any;
    if (!selectedMemberForCreds) return;

    if (win.google?.accounts?.oauth2 && googleConfig.clientId) {
      try {
        setCredsActionSubmitting(true);
        const client = win.google.accounts.oauth2.initTokenClient({
          client_id: googleConfig.clientId,
          scope: 'email profile openid',
          callback: async (tokenResponse: any) => {
            if (tokenResponse.error) {
              setGoogleLinkError('Google authorization was cancelled or failed.');
              setCredsActionSubmitting(false);
              return;
            }
            try {
              const infoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
                headers: { Authorization: `Bearer ${tokenResponse.access_token}` },
              });
              const profile = await infoRes.json();
              if (profile.email) {
                const res = await linkMemberGoogle(selectedMemberForCreds.id, {
                  email: profile.email,
                  googleId: profile.sub,
                });
                if (res.success) {
                  setCredsSuccessMessage(res.message || 'Google account linked successfully.');
                  setCredsSummary((prev: any) => (prev ? { ...prev, googleLinked: true, googleEmail: profile.email } : null));
                  setShowGoogleLinkBox(false);
                  fetchTeamData();
                } else {
                  setGoogleLinkError(res.error || 'Failed to link Google account.');
                }
              } else {
                setGoogleLinkError('Google profile did not contain a verified email.');
              }
            } catch (err: any) {
              setGoogleLinkError('Failed to retrieve verified profile from Google.');
            } finally {
              setCredsActionSubmitting(false);
            }
          },
        });
        client.requestAccessToken({ prompt: 'consent' });
        return;
      } catch (err) {
        console.warn('Google OAuth2 error:', err);
        setCredsActionSubmitting(false);
      }
    }

    if (win.google?.accounts?.id && googleConfig.clientId) {
      try {
        win.google.accounts.id.initialize({
          client_id: googleConfig.clientId,
          callback: async (response: any) => {
            if (response.credential) {
              try {
                setCredsActionSubmitting(true);
                const payload = JSON.parse(atob(response.credential.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
                const email = (payload.email || '').toLowerCase().trim();
                const googleId = payload.sub;
                const res = await linkMemberGoogle(selectedMemberForCreds.id, {
                  credential: response.credential,
                  email,
                  googleId,
                });
                if (res.success) {
                  setCredsSuccessMessage(res.message || 'Google account linked successfully.');
                  setCredsSummary((prev: any) => (prev ? { ...prev, googleLinked: true, googleEmail: email } : null));
                  setShowGoogleLinkBox(false);
                  fetchTeamData();
                } else {
                  setGoogleLinkError(res.error || 'Failed to link Google account.');
                }
              } catch (err: any) {
                setGoogleLinkError('Failed to parse Google credentials.');
              } finally {
                setCredsActionSubmitting(false);
              }
            }
          },
        });
        win.google.accounts.id.prompt();
        return;
      } catch (err) {
        console.warn('Google GIS prompt failed:', err);
      }
    }

    // Fallback if scripts are unavailable
    setShowGoogleLinkBox(true);
  };

  // Unlink Google account
  const handleUnlinkGoogle = async () => {
    if (!selectedMemberForCreds) return;
    const targetName = selectedMemberForCreds.user?.fullName || selectedMemberForCreds.user?.email;
    if (!confirm(`Are you sure you want to unlink Google SSO for ${targetName}? Please ensure this employee has a password set so they can still sign in.`)) {
      return;
    }
    setCredsActionSubmitting(true);
    setCredsErrorMessage(null);
    setCredsSuccessMessage(null);
    try {
      const res = await unlinkMemberGoogle(selectedMemberForCreds.id);
      if (res.success) {
        toast.success('Google SSO Unlinked', `Google SSO disconnected for ${targetName}`);
        setCredsSuccessMessage(res.message || 'Google account unlinked successfully.');
        setCredsSummary((prev: any) => (prev ? { ...prev, googleLinked: false, googleEmail: null } : null));
        fetchTeamData();
      } else {
        const msg = res.error || 'Failed to unlink Google account.';
        setCredsErrorMessage(msg);
        toast.error('Unlink Failed', msg);
      }
    } catch (err: any) {
      const msg = err?.message || 'Network error.';
      setCredsErrorMessage(msg);
      toast.error('Network Error', msg);
    } finally {
      setCredsActionSubmitting(false);
    }
  };

  // Revoke All Active Sessions for Employee (Section 2)
  const handleRevokeSessions = async () => {
    if (!selectedMemberForCreds) return;
    const targetName = selectedMemberForCreds.user?.fullName || selectedMemberForCreds.user?.email;
    if (!confirm(`Terminate all active sessions and refresh tokens for ${targetName}? The employee will be forced to sign in again.`)) {
      return;
    }
    setCredsActionSubmitting(true);
    setCredsErrorMessage(null);
    setCredsSuccessMessage(null);
    try {
      const res = await revokeMemberSessions(selectedMemberForCreds.id);
      if (res.success) {
        toast.success('Sessions Terminated', `Active sessions revoked for ${targetName}`);
        setCredsSuccessMessage(res.message || 'All active sessions have been terminated.');
        setSuccessMessage(`All active sessions terminated for ${targetName}`);
        if (credsSummary) {
          setCredsSummary({ ...credsSummary, activeSessionsCount: 0 });
        }
      } else {
        const msg = res.error || 'Failed to revoke sessions.';
        setCredsErrorMessage(msg);
        toast.error('Revocation Failed', msg);
      }
    } catch (err: any) {
      const msg = err?.message || 'Network error.';
      setCredsErrorMessage(msg);
      toast.error('Network Error', msg);
    } finally {
      setCredsActionSubmitting(false);
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
      case 'SUPERVISOR':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">Supervisor</span>;
      case 'PLANT_MANAGER':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">Plant Manager</span>;
      case 'ENGINEER':
      case 'ENGINEER_TECHNICIAN':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">Engineer</span>;
      case 'TECHNICIAN':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-cyan-50 text-cyan-700 border border-cyan-200">Technician</span>;
      case 'WORKER':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-orange-50 text-orange-700 border border-orange-200">Worker</span>;
      case 'VIEWER':
      default:
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">Viewer</span>;
    }
  };

  return (
    <div className="flex-1 min-h-0 min-w-0 w-full h-full overflow-y-auto p-6 bg-[#F5F6F7] text-[#1A202C] font-sans">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
              SETTINGS → TEAM MANAGEMENT
            </span>
          </div>
          <h1 className="text-xl font-bold tracking-tight text-[#1A202C] flex items-center gap-2 mt-1">
            <Users className="w-5 h-5 text-[#2563EB]" />
            Team & Identity Access Governance
          </h1>
          <p className="text-xs text-[#64748B] mt-1">
            Manage authorized employees, assign factory roles, generate shop-floor QR codes, and enforce multi-tenant isolation.
          </p>
        </div>

        {isOwnerOrAdmin && (
          <button
            onClick={() => {
              setInviteModalOpen(true);
              setCreatedInviteResult(null);
              setInviteEmail('');
              setInviteFullName('');
              setInviteEmployeeId('');
              setInvitePlantScope('');
              setInviteMachineIds([]);
              setGenerateActivationCode(false);
            }}
            className="flex items-center gap-2 px-3.5 py-2 bg-[#151C24] hover:bg-black text-white font-semibold text-xs rounded-xl shadow-sm transition self-start md:self-auto"
          >
            <UserPlus className="w-4 h-4" />
            <span>Add Employee</span>
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
          <div className="text-[11px] text-[#64748B] font-medium">Total Registered Assets</div>
          <div className="text-xl font-bold text-[#2563EB] mt-1">
            {machines.length}
          </div>
        </div>
        <div className="p-3.5 rounded-xl bg-white border border-[#E2E8F0] shadow-sm">
          <div className="text-[11px] text-[#64748B] font-medium">Tenant Organization</div>
          <div className="text-sm font-mono font-bold text-[#1A202C] mt-1 truncate">
            {organization?.name || 'Primary Tenant'}
          </div>
        </div>
      </div>

      {/* Feedback Alerts */}
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
            Active Employees ({members.length})
          </button>
          <button
            onClick={() => setActiveTab('invitations')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
              activeTab === 'invitations' ? 'bg-white text-[#1A202C] shadow-sm' : 'text-[#64748B] hover:text-[#1A202C]'
            }`}
          >
            Pending Invitations ({invitations.filter((i) => i.status === 'PENDING').length})
          </button>
        </div>

        {activeTab === 'members' && (
          <div className="flex items-center gap-2.5 w-full sm:w-auto">
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

            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="bg-white border border-[#CBD5E1] text-[#1A202C] text-xs rounded-xl px-3 py-1.5 outline-none focus:border-[#2563EB] shadow-sm"
            >
              <option value="ALL">All Roles</option>
              <option value="ORGANIZATION_OWNER">Owner</option>
              <option value="ORGANIZATION_ADMIN">Admin</option>
              <option value="SUPERVISOR">Supervisor</option>
              <option value="TECHNICIAN">Technician</option>
              <option value="WORKER">Worker</option>
              <option value="ENGINEER">Engineer</option>
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

      {/* Main Content: Members Table */}
      {activeTab === 'members' ? (
        <div className="bg-white border border-[#E2E8F0] rounded-2xl overflow-hidden shadow-sm">
          {loading ? (
            <div className="p-12 text-center text-xs text-[#64748B]">Loading employee directory...</div>
          ) : filteredMembers.length === 0 ? (
            <div className="p-12 text-center text-xs text-[#64748B]">
              No employees found matching your search.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-[#64748B] font-mono text-[11px] uppercase tracking-wider">
                  <tr>
                    <th className="py-3 px-4">Employee</th>
                    <th className="py-3 px-4">Role</th>
                    <th className="py-3 px-4">Plant & Scopes</th>
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
                            <div className="w-8 h-8 rounded-full bg-slate-100 text-[#2563EB] flex items-center justify-center font-bold text-xs border border-[#CBD5E1]">
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

                        <td className="py-3 px-4 text-[#64748B] font-mono text-[11px]">
                          {m.assignedPlantIds && m.assignedPlantIds.length > 0
                            ? m.assignedPlantIds.join(', ')
                            : 'All Authorized Plants'}
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

                        <td className="py-3 px-4 text-[#64748B] font-mono text-[11px]">
                          {new Date(m.createdAt).toLocaleDateString()}
                        </td>

                        {isOwnerOrAdmin && (
                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={() => handleOpenCredentialsModal(m)}
                                className="px-2.5 py-1 text-xs text-amber-700 hover:text-amber-900 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg transition font-medium flex items-center gap-1 shadow-xs"
                                title="Employee Account Management & Credentials"
                              >
                                <KeyRound className="w-3 h-3 text-amber-600" />
                                <span>Credentials</span>
                              </button>

                              {!isSelf && (
                                <>
                                  <button
                                    onClick={() => {
                                      setSelectedMember(m);
                                      setNewRole(m.role);
                                      setNewPlantScope(m.assignedPlantIds?.join(', ') || '');
                                      setRoleModalOpen(true);
                                    }}
                                    className="px-2.5 py-1 text-xs text-[#2563EB] hover:text-blue-700 hover:bg-blue-50 rounded-lg transition font-medium"
                                  >
                                    Edit Role
                                  </button>

                                  <button
                                    onClick={() => handleToggleMemberStatus(m)}
                                    disabled={isOwner}
                                    title={isOwner ? 'Cannot suspend Organization Owner' : 'Toggle account status'}
                                    className={`px-2.5 py-1 text-xs rounded-lg transition font-medium ${
                                      m.status === 'ACTIVE'
                                        ? 'text-rose-600 hover:text-rose-700 hover:bg-rose-50 disabled:opacity-30'
                                        : 'text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50'
                                    }`}
                                  >
                                    {m.status === 'ACTIVE' ? 'Suspend' : 'Reactivate'}
                                  </button>
                                </>
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
              No outstanding invitations. Click "Add Employee" to invite team members.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-[#64748B] font-mono text-[11px] uppercase tracking-wider">
                  <tr>
                    <th className="py-3 px-4">Invited Employee</th>
                    <th className="py-3 px-4">Role</th>
                    <th className="py-3 px-4">Department & Scopes</th>
                    <th className="py-3 px-4">Expiration</th>
                    <th className="py-3 px-4">Status</th>
                    {isOwnerOrAdmin && <th className="py-3 px-4 text-right">Actions</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8F0]">
                  {invitations.map((inv) => (
                    <tr key={inv.id} className="hover:bg-[#F8FAFC] transition">
                      <td className="py-3 px-4">
                        <div className="font-semibold text-[#1A202C]">{inv.email}</div>
                        {inv.employeeId && (
                          <div className="text-[10px] text-[#64748B] font-mono">ID: {inv.employeeId}</div>
                        )}
                      </td>
                      <td className="py-3 px-4">{getRoleBadge(inv.role)}</td>
                      <td className="py-3 px-4 text-[#64748B]">
                        <div className="text-xs">{inv.department || 'Operations'}</div>
                        {inv.assignedMachineIds && inv.assignedMachineIds.length > 0 && (
                          <div className="text-[10px] text-blue-600 font-mono">
                            {inv.assignedMachineIds.length} Machine(s) Assigned
                          </div>
                        )}
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
                          <div className="flex items-center justify-end gap-1.5">
                            {inv.status === 'PENDING' && (
                              <>
                                <button
                                  onClick={() => handleOpenQrModal(inv)}
                                  className="text-xs text-blue-700 hover:text-blue-900 px-2.5 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 border border-blue-200 flex items-center gap-1 font-medium transition"
                                >
                                  <QrCode className="w-3.5 h-3.5" />
                                  <span>In-Person QR</span>
                                </button>
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

      {/* ============================================================ */}
      {/* MODAL 1: ADD EMPLOYEE / INVITATION (Section 5 & 6) */}
      {/* ============================================================ */}
      <Modal
        isOpen={inviteModalOpen}
        onClose={() => setInviteModalOpen(false)}
        title="Add Employee & Assign Permissions"
        subtitle="Provision an employee profile with role-scoped authority, plant boundaries, and activation credentials."
        maxWidth="lg"
      >
        {createdInviteResult ? (
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs">
              <div className="font-bold flex items-center gap-1.5 mb-1 text-sm">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                Employee Account Provisioned!
              </div>
              <p>Invitation created for {createdInviteResult.email} as {createdInviteResult.role}.</p>
            </div>

            {/* Invitation URL Copy Box */}
            <div className="space-y-1">
              <label className="block text-[11px] font-semibold text-[#1A202C]">
                ACTIVATION URL LINK
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={createdInviteResult.invitationUrl}
                  className="flex-1 px-3 py-2 bg-slate-50 border border-[#CBD5E1] rounded-xl text-xs text-[#1A202C] font-mono select-all"
                />
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(createdInviteResult.invitationUrl);
                    setCopiedLink(true);
                    setTimeout(() => setCopiedLink(false), 2000);
                  }}
                  className="px-3 py-2 bg-[#151C24] hover:bg-black text-white font-semibold text-xs rounded-xl flex items-center gap-1 shadow-sm"
                >
                  {copiedLink ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  <span>{copiedLink ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
            </div>

            {/* Factory Activation Code (if enabled) */}
            {createdInviteResult.activationCode && (
              <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-amber-900 flex items-center gap-1.5">
                    <KeyRound className="w-3.5 h-3.5 text-amber-700" />
                    FACTORY SHOP-FLOOR ACTIVATION CODE
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(createdInviteResult.activationCode || '');
                      setCopiedCode(true);
                      setTimeout(() => setCopiedCode(false), 2000);
                    }}
                    className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded text-[11px] font-semibold"
                  >
                    {copiedCode ? 'Copied Code!' : 'Copy Code'}
                  </button>
                </div>
                <div className="font-mono text-xl font-black text-amber-900 tracking-widest text-center py-1 bg-white rounded-lg border border-amber-300">
                  {createdInviteResult.activationCode}
                </div>
                <p className="text-[10px] text-amber-800">
                  Deliver this 8-character code securely to the factory worker. Valid for workstation activation. Strictly locked after 5 failed attempts.
                </p>
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  const inv = invitations.find((i) => i.id === createdInviteResult.invitationId);
                  if (inv) handleOpenQrModal(inv);
                }}
                className="flex-1 py-2 bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-700 font-semibold text-xs rounded-xl flex items-center justify-center gap-1.5 transition"
              >
                <QrCode className="w-3.5 h-3.5" />
                <span>Show In-Person QR Code</span>
              </button>
              <button
                type="button"
                onClick={() => setInviteModalOpen(false)}
                className="py-2 px-4 bg-[#151C24] hover:bg-black text-white text-xs font-semibold rounded-xl"
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSendInvite} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-[#1A202C] mb-1">
                  Full Name
                </label>
                <input
                  type="text"
                  placeholder="Alex Rivera"
                  value={inviteFullName}
                  onChange={(e) => setInviteFullName(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-[#CBD5E1] rounded-xl text-xs text-[#1A202C] outline-none focus:border-[#2563EB]"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-[#1A202C] mb-1">
                  Work Email Address *
                </label>
                <input
                  type="email"
                  required
                  placeholder="alex.rivera@plant.industrial"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-[#CBD5E1] rounded-xl text-xs text-[#1A202C] outline-none focus:border-[#2563EB]"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-[#1A202C] mb-1">
                  Employee ID / Barcode (Optional)
                </label>
                <input
                  type="text"
                  placeholder="EMP-8021"
                  value={inviteEmployeeId}
                  onChange={(e) => setInviteEmployeeId(e.target.value.toUpperCase())}
                  className="w-full px-3 py-2 bg-white border border-[#CBD5E1] rounded-xl text-xs text-[#1A202C] font-mono outline-none focus:border-[#2563EB]"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-[#1A202C] mb-1">
                  Department
                </label>
                <select
                  value={inviteDepartment}
                  onChange={(e) => setInviteDepartment(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-[#CBD5E1] rounded-xl text-xs text-[#1A202C] outline-none focus:border-[#2563EB]"
                >
                  <option value="Mechanical Maintenance">Mechanical Maintenance</option>
                  <option value="Electrical & Instrumentation">Electrical & Instrumentation</option>
                  <option value="Reliability Engineering">Reliability Engineering</option>
                  <option value="Plant Operations">Plant Operations</option>
                  <option value="Quality Assurance">Quality Assurance</option>
                  <option value="Environmental & Safety">Environmental & Safety</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-[#1A202C] mb-1">
                  Designation / Title
                </label>
                <input
                  type="text"
                  placeholder="Senior Vibration Specialist"
                  value={inviteDesignation}
                  onChange={(e) => setInviteDesignation(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-[#CBD5E1] rounded-xl text-xs text-[#1A202C] outline-none focus:border-[#2563EB]"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-[#1A202C] mb-1">
                  Role Assignment *
                </label>
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as OrgRole)}
                  className="w-full px-3 py-2 bg-white border border-[#CBD5E1] rounded-xl text-xs text-[#1A202C] outline-none focus:border-[#2563EB]"
                >
                  <option value="WORKER">Worker (Standard operating procedures & reporting)</option>
                  <option value="TECHNICIAN">Technician (Maintenance & repair execution)</option>
                  <option value="SUPERVISOR">Supervisor (Work orders, queues, team monitoring)</option>
                  <option value="ENGINEER">Engineer (Full diagnostic & knowledge tools)</option>
                  <option value="ORGANIZATION_ADMIN">Administrator (Staff, machines, documents)</option>
                  {currentMembership?.role === 'ORGANIZATION_OWNER' && (
                    <option value="ORGANIZATION_OWNER">Organization Owner (Full control)</option>
                  )}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-[#1A202C] mb-1">
                Factory / Site Scopes (Optional)
              </label>
              <input
                type="text"
                placeholder="PLANT-TX-04, PLANT-DE-02 (leave blank for all authorized plants)"
                value={invitePlantScope}
                onChange={(e) => setInvitePlantScope(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-[#CBD5E1] rounded-xl text-xs text-[#1A202C] font-mono outline-none focus:border-[#2563EB]"
              />
            </div>

            {/* Machine Assignments */}
            {machines.length > 0 && (
              <div>
                <label className="block text-[11px] font-medium text-[#1A202C] mb-1">
                  Assigned Industrial Machines (Optional Scope)
                </label>
                <div className="max-h-28 overflow-y-auto border border-[#CBD5E1] rounded-xl p-2 bg-slate-50 space-y-1">
                  {machines.map((m) => (
                    <label key={m.id} className="flex items-center gap-2 text-xs text-[#1A202C] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={inviteMachineIds.includes(m.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setInviteMachineIds([...inviteMachineIds, m.id]);
                          } else {
                            setInviteMachineIds(inviteMachineIds.filter((id) => id !== m.id));
                          }
                        }}
                        className="rounded border-gray-300 text-blue-600"
                      />
                      <span className="font-mono text-[11px] text-blue-600 font-semibold">{m.assetTag}</span>
                      <span className="truncate">{m.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Factory Activation Code Checkbox */}
            <div className="pt-2 border-t border-[#E2E8F0]">
              <label className="flex items-start gap-2 text-xs text-[#1A202C] cursor-pointer">
                <input
                  type="checkbox"
                  checked={generateActivationCode}
                  onChange={(e) => setGenerateActivationCode(e.target.checked)}
                  className="mt-0.5 rounded border-gray-300 text-blue-600"
                />
                <div>
                  <span className="font-semibold text-[#1A202C]">Generate Shop-Floor Activation Code</span>
                  <p className="text-[10px] text-[#64748B]">
                    Enables in-person onboarding for floor workers who do not have corporate email access.
                  </p>
                </div>
              </label>
            </div>

            <button
              type="submit"
              disabled={submittingInvite}
              className="w-full py-2.5 bg-[#151C24] hover:bg-black text-white font-semibold text-xs rounded-xl shadow-sm transition disabled:opacity-50"
            >
              {submittingInvite ? 'Creating Employee Profile...' : 'Complete & Send Invitation'}
            </button>
          </form>
        )}
      </Modal>

      {/* ============================================================ */}
      {/* MODAL 2: IN-PERSON QR ACTIVATION PLACARD (Section 7) */}
      {/* ============================================================ */}
      <Modal
        isOpen={qrModalOpen}
        onClose={() => setQrModalOpen(false)}
        title="In-Person QR Code Activation"
        subtitle="Generate a temporary, single-use activation barcode for on-site employee device pairing."
        maxWidth="md"
      >
        <div className="space-y-4">
          {loadingQr ? (
            <div className="py-12 text-center space-y-3">
              <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-xs text-[#64748B]">Generating 30-minute in-person activation token...</p>
            </div>
          ) : qrActivationUrl ? (
            <div className="space-y-4">
              {/* QR Placard Box */}
              <div className="p-6 bg-white rounded-2xl border-2 border-slate-300 text-center max-w-xs mx-auto space-y-3 shadow-lg">
                <div className="flex justify-between items-center border-b border-slate-200 pb-2">
                  <span className="font-mono text-[10px] font-black uppercase tracking-wider text-slate-800">
                    FORGEX AI • ACTIVATION
                  </span>
                  <span className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 font-mono text-[9px] font-bold">
                    30-MIN TOKEN
                  </span>
                </div>

                <div className="flex justify-center p-2 bg-white rounded-lg">
                  <QrSvg value={qrActivationUrl} size={180} />
                </div>

                <div className="space-y-1">
                  <div className="font-bold text-xs text-[#1A202C]">{selectedInviteForQr?.email}</div>
                  <div className="text-[10px] text-blue-600 font-mono font-bold">
                    Role: {selectedInviteForQr?.role}
                  </div>
                  {qrExpiresAt && (
                    <div className="text-[10px] text-slate-500 font-mono flex items-center justify-center gap-1">
                      <Clock className="w-3 h-3" />
                      <span>Valid until {new Date(qrExpiresAt).toLocaleTimeString()}</span>
                    </div>
                  )}
                </div>

                <div className="text-[9px] text-slate-400 font-mono pt-2 border-t border-slate-200">
                  SCAN WITH ANY MOBILE CAMERA OR SHOP-FLOOR TABLET TO COMPLETE ACTIVATION
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(qrActivationUrl);
                    setCopiedQrLink(true);
                    setTimeout(() => setCopiedQrLink(false), 2000);
                  }}
                  className="flex-1 py-2 bg-white border border-[#CBD5E1] text-[#1A202C] hover:bg-slate-50 text-xs font-semibold rounded-xl flex items-center justify-center gap-1 transition"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>{copiedQrLink ? 'Copied Link' : 'Copy Activation Link'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-4 py-2 bg-[#151C24] hover:bg-black text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 transition"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Print Badge</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="p-6 text-center text-xs text-rose-600">
              Failed to load in-person QR activation barcode.
            </div>
          )}
        </div>
      </Modal>

      {/* ============================================================ */}
      {/* MODAL 3: CHANGE ROLE MODAL */}
      {/* ============================================================ */}
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
              <option value="WORKER">Worker (Field operations)</option>
              <option value="TECHNICIAN">Technician (Maintenance execution)</option>
              <option value="SUPERVISOR">Supervisor (Plant queue & ticket management)</option>
              <option value="ENGINEER">Engineer (Full diagnostic & knowledge tools)</option>
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
              placeholder="PLANT-TX-04, PLANT-DE-02"
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

      {/* ============================================================ */}
      {/* MODAL 4: EMPLOYEE ACCOUNT MANAGEMENT & CREDENTIALS (Req 2 & 3) */}
      {/* ============================================================ */}
      <Modal
        isOpen={credsModalOpen}
        onClose={() => {
          setCredsModalOpen(false);
          setSelectedMemberForCreds(null);
          setCredsSummary(null);
          setCredsSuccessMessage(null);
          setCredsErrorMessage(null);
          setShowResetPasswordPanel(false);
          setShowGoogleLinkBox(false);
          setResetOtp('');
          setNewPassword('');
          setConfirmPassword('');
          setResetPasswordError(null);
        }}
        title={`Security & Credentials: ${selectedMemberForCreds?.user?.fullName || selectedMemberForCreds?.user?.email || 'Member'}`}
        subtitle="Identity Governance • Password Recovery • Device Session Controls"
        maxWidth="3xl"
      >
        <div className="space-y-4">
          {/* Zero-Trust Notice (Compact) */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-lg text-[11px] text-slate-600">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
              <span><strong>Zero-Knowledge Security:</strong> Admins cannot see or set employee passwords directly. All recovery OTP codes are verified directly by the employee.</span>
            </div>
            <span className="text-[10px] text-slate-400 font-mono shrink-0 hidden sm:inline">RFC-6238 Standard</span>
          </div>

          {/* Feedback banners */}
          {credsSuccessMessage && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
              <span>{credsSuccessMessage}</span>
            </div>
          )}
          {credsErrorMessage && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{credsErrorMessage}</span>
            </div>
          )}

          {loadingCreds ? (
            <div className="py-12 text-center space-y-2">
              <div className="w-7 h-7 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-xs text-slate-500">Inspecting credential and session status...</p>
            </div>
          ) : credsSummary ? (
            <div className="space-y-4">
              {/* Account Identity Card (Horizontal Grid - Auth Provider Removed) */}
              <div className="p-4 bg-white border border-slate-200 rounded-xl space-y-3">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-xs">
                      {(selectedMemberForCreds?.user?.fullName || credsSummary.email || 'U').charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <span className="text-xs font-bold text-slate-900 block leading-tight">
                        {selectedMemberForCreds?.user?.fullName || 'Organization Member'}
                      </span>
                      <span className="text-[11px] font-mono text-slate-500">
                        {credsSummary.email}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                      {credsSummary.role}
                    </span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      credsSummary.status === 'ACTIVE'
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-rose-100 text-rose-800'
                    }`}>
                      {credsSummary.status}
                    </span>
                  </div>
                </div>

                {/* Horizontal Identity Badges */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs pt-0.5">
                  {/* Password Status */}
                  <div className="p-2.5 bg-slate-50 border border-slate-200/80 rounded-lg">
                    <span className="text-[10px] text-slate-400 block uppercase font-bold tracking-wider">Password Status</span>
                    <div className="flex items-center gap-1.5 mt-1">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${credsSummary.hasPassword ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                      <span className={`font-semibold text-xs ${credsSummary.hasPassword ? 'text-slate-800' : 'text-amber-700'}`}>
                        {credsSummary.hasPassword ? 'Configured & Active' : 'Not Set (Passwordless)'}
                      </span>
                    </div>
                  </div>

                  {/* Google SSO Status with 1-click Link/Unlink */}
                  <div className="p-2.5 bg-slate-50 border border-slate-200/80 rounded-lg">
                    <span className="text-[10px] text-slate-400 block uppercase font-bold tracking-wider">Google SSO</span>
                    <div className="flex items-center justify-between gap-1 mt-1">
                      <div className="flex items-center gap-1.5 truncate">
                        <span className={`w-2 h-2 rounded-full shrink-0 ${credsSummary.googleLinked ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                        <span className="font-semibold text-xs text-slate-800 truncate" title={credsSummary.googleEmail || (credsSummary.googleLinked ? 'Linked' : 'Not Linked')}>
                          {credsSummary.googleLinked ? (credsSummary.googleEmail || 'Linked') : 'Not Linked'}
                        </span>
                      </div>
                      {credsSummary.googleLinked ? (
                        <button
                          type="button"
                          onClick={handleUnlinkGoogle}
                          disabled={credsActionSubmitting}
                          className="px-2 py-0.5 text-[10px] text-rose-600 hover:text-rose-700 hover:bg-rose-50 border border-rose-200 rounded font-bold transition shrink-0"
                        >
                          Unlink
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setShowGoogleLinkBox(!showGoogleLinkBox);
                            setGoogleLinkError(null);
                          }}
                          disabled={credsActionSubmitting}
                          className="px-2 py-0.5 text-[10px] text-blue-600 hover:text-blue-700 hover:bg-blue-100 border border-blue-200 rounded font-bold transition shrink-0 flex items-center gap-1"
                        >
                          <LinkIcon className="w-3 h-3" />
                          <span>Link</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Active Device Sessions */}
                  <div className="p-2.5 bg-slate-50 border border-slate-200/80 rounded-lg">
                    <span className="text-[10px] text-slate-400 block uppercase font-bold tracking-wider">Active Device Sessions</span>
                    <div className="flex items-center gap-1.5 mt-1">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${credsSummary.activeSessionsCount > 0 ? 'bg-blue-500 animate-pulse' : 'bg-slate-300'}`} />
                      <span className="font-mono font-bold text-xs text-slate-800">
                        {credsSummary.activeSessionsCount} active {credsSummary.activeSessionsCount === 1 ? 'session' : 'sessions'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Inline Google Link Drawer (compact) */}
                {showGoogleLinkBox && (
                  <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-lg space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-blue-900 flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                        Link Google SSO Account
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setShowGoogleLinkBox(false);
                          setGoogleLinkError(null);
                        }}
                        className="text-slate-400 hover:text-slate-600 font-bold"
                      >
                        ✕
                      </button>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2 items-center">
                      {googleConfig?.clientId && (
                        <button
                          type="button"
                          onClick={handleGoogleOAuthPopup}
                          disabled={credsActionSubmitting}
                          className="w-full sm:w-auto px-3 py-1.5 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 shadow-sm flex items-center justify-center gap-1.5 shrink-0"
                        >
                          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24">
                            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                          </svg>
                          <span>One-Tap Prompt</span>
                        </button>
                      )}
                      <div className="flex-1 flex gap-2 w-full">
                        <input
                          type="email"
                          placeholder="Enter Google email (e.g. employee@gmail.com)"
                          value={googleEmailInput}
                          onChange={(e) => setGoogleEmailInput(e.target.value)}
                          className="flex-1 px-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                        />
                        <button
                          type="button"
                          onClick={handleLinkGoogleEmail}
                          disabled={credsActionSubmitting || !googleEmailInput.trim()}
                          className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg transition disabled:opacity-50 shrink-0"
                        >
                          {credsActionSubmitting ? 'Linking...' : 'Link'}
                        </button>
                      </div>
                    </div>
                    {googleLinkError && (
                      <p className="text-[11px] text-rose-600 font-medium">
                        {googleLinkError}
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Security Operations: Balanced 2-Column Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Column 1: Password & Credential Recovery */}
                <div className="p-4 bg-white border border-slate-200 rounded-xl space-y-3 flex flex-col justify-between shadow-sm">
                  <div>
                    <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900">
                        <KeyRound className="w-4 h-4 text-blue-600" />
                        <span>Password & Access Recovery</span>
                      </div>
                    </div>
                    <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                      Dispatches a single-use 6-digit OTP code to <strong className="text-slate-700 font-mono">{credsSummary.email}</strong> to securely verify identity and configure a new password.
                    </p>
                  </div>

                  <div className="pt-2 space-y-2">
                    <button
                      type="button"
                      disabled={credsActionSubmitting || credsSummary.status === 'SUSPENDED'}
                      onClick={handleTriggerMemberReset}
                      className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs rounded-lg transition disabled:opacity-50 flex items-center justify-center gap-1.5 shadow-sm"
                    >
                      <KeyRound className="w-3.5 h-3.5" />
                      <span>{showResetPasswordPanel ? 'Re-send Reset OTP Code' : 'Send Reset OTP Code'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setShowResetPasswordPanel(!showResetPasswordPanel)}
                      className="w-full py-1 text-center text-[11px] text-blue-600 hover:text-blue-800 font-semibold transition"
                    >
                      {showResetPasswordPanel ? '▲ Hide verification & password form' : '▼ Have the OTP code? Fill OTP & change password'}
                    </button>
                  </div>
                </div>

                {/* Column 2: Device Sessions & Access Governance */}
                <div className="p-4 bg-white border border-slate-200 rounded-xl space-y-3 flex flex-col justify-between shadow-sm">
                  <div>
                    <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900">
                        <Lock className="w-4 h-4 text-amber-600" />
                        <span>Sessions & Access Governance</span>
                      </div>
                    </div>

                    {/* Terminate Active Sessions */}
                    <div className="py-2.5 flex items-center justify-between gap-2 border-b border-slate-100">
                      <div className="space-y-0.5">
                        <span className="text-xs font-semibold text-slate-800 block">Revoke Device Sessions</span>
                        <span className="text-[11px] text-slate-500 block">
                          Terminates {credsSummary.activeSessionsCount} active login {credsSummary.activeSessionsCount === 1 ? 'session' : 'sessions'}.
                        </span>
                      </div>
                      <button
                        type="button"
                        disabled={credsActionSubmitting || credsSummary.activeSessionsCount === 0}
                        onClick={handleRevokeSessions}
                        className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-medium text-xs rounded-lg transition disabled:opacity-40 shrink-0"
                      >
                        Revoke All
                      </button>
                    </div>

                    {/* Account Suspension / Reactivation */}
                    <div className="pt-2.5 flex items-center justify-between gap-2">
                      <div className="space-y-0.5">
                        <span className="text-xs font-semibold text-slate-800 block">
                          {credsSummary.status === 'ACTIVE' ? 'Suspend Account Access' : 'Reactivate Account'}
                        </span>
                        <span className="text-[11px] text-slate-500 block">
                          {credsSummary.status === 'ACTIVE' ? 'Block API access and login.' : 'Restore organization privileges.'}
                        </span>
                      </div>
                      <button
                        type="button"
                        disabled={credsActionSubmitting}
                        onClick={async () => {
                          if (selectedMemberForCreds) {
                            await handleToggleMemberStatus(selectedMemberForCreds);
                            handleOpenCredentialsModal(selectedMemberForCreds);
                          }
                        }}
                        className={`px-3 py-1.5 font-medium text-xs rounded-lg transition disabled:opacity-50 shrink-0 ${
                          credsSummary.status === 'ACTIVE'
                            ? 'bg-rose-600 hover:bg-rose-700 text-white'
                            : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                        }`}
                      >
                        {credsSummary.status === 'ACTIVE' ? 'Suspend' : 'Reactivate'}
                      </button>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-400">
                    <span>Audit Trail: Active</span>
                    <span>Tokens Revocable</span>
                  </div>
                </div>
              </div>

              {/* Inline OTP Verification & New Password Setup Form (Wide 2-Column Form) */}
              {showResetPasswordPanel && (
                <div className="p-4 bg-white border-2 border-blue-200 rounded-xl space-y-4 shadow-sm animate-in fade-in duration-150">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                    <div className="flex items-center gap-2">
                      <KeyRound className="w-4 h-4 text-blue-600" />
                      <span className="text-xs font-bold text-slate-900">
                        Verify OTP & Establish New Password
                      </span>
                    </div>
                    <span className="text-[11px] text-slate-500">
                      Target: <strong className="text-slate-800 font-mono">{credsSummary.email}</strong>
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Left Sub-Column: OTP Entry */}
                    <div className="space-y-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200/80">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                          6-Digit Email Verification Code (OTP) *
                        </label>
                        <input
                          type="text"
                          maxLength={6}
                          value={resetOtp}
                          onChange={(e) => setResetOtp(e.target.value.replace(/\D/g, ''))}
                          placeholder="123456"
                          className="w-full px-3 py-2 text-center font-mono text-lg font-bold tracking-[0.3em] border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                        />
                      </div>

                      <div className="text-[11px] text-slate-500 space-y-1">
                        <p>A single-use OTP has been sent to the verified work email above. Valid for 10 minutes.</p>
                        {resetDebugOtp && (
                          <div className="mt-1 font-mono text-[10px] text-blue-700 bg-blue-100/80 px-2 py-1 rounded flex items-center justify-between">
                            <span>Dev Code: <strong>{resetDebugOtp}</strong></span>
                            <button
                              type="button"
                              onClick={() => setResetOtp(resetDebugOtp)}
                              className="underline text-blue-900 font-sans cursor-pointer font-bold"
                            >
                              Autofill
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Right Sub-Column: New Password & Confirm */}
                    <div className="space-y-3">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                          New Password *
                        </label>
                        <div className="relative">
                          <input
                            type={showPasswordText ? 'text' : 'password'}
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            placeholder="At least 8 characters"
                            className="w-full px-3 py-1.5 pr-9 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPasswordText(!showPasswordText)}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                          >
                            {showPasswordText ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                        <PasswordStrengthMeter password={newPassword} />
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                          Confirm New Password *
                        </label>
                        <div className="relative">
                          <input
                            type={showPasswordText ? 'text' : 'password'}
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            placeholder="Re-type new password"
                            className="w-full px-3 py-1.5 pr-9 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                        {confirmPassword && (
                          <p className={`text-[10px] mt-1 font-medium ${newPassword === confirmPassword ? 'text-emerald-600' : 'text-amber-600'}`}>
                            {newPassword === confirmPassword ? '✓ Passwords match' : '✗ Passwords do not match'}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Error display */}
                  {resetPasswordError && (
                    <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 text-xs flex items-center gap-2">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-rose-500" />
                      <span>{resetPasswordError}</span>
                    </div>
                  )}

                  {/* Bottom Actions */}
                  <div className="flex items-center justify-between pt-1 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => {
                        setShowResetPasswordPanel(false);
                        setResetOtp('');
                        setNewPassword('');
                        setConfirmPassword('');
                        setResetPasswordError(null);
                      }}
                      className="px-3 py-1.5 text-xs text-slate-600 hover:text-slate-800 font-medium"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={resetSubmitting || resetOtp.length !== 6 || newPassword.length < 8 || newPassword !== confirmPassword}
                      onClick={handleVerifyOtpAndSubmitReset}
                      className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs rounded-lg transition disabled:opacity-50 flex items-center gap-1.5 shadow-sm"
                    >
                      {resetSubmitting ? (
                        <>
                          <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          <span>Verifying & Setting...</span>
                        </>
                      ) : (
                        <>
                          <CheckCheck className="w-3.5 h-3.5" />
                          <span>Verify OTP & Set Password</span>
                        </>
                      )}
                    </button>
                  </div>

                  <div className="text-[10px] text-slate-400">
                    💡 Tip: Off-site employees can also reset their password from the Sign-In screen anytime via the <strong>"Forgot Password"</strong> tab.
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="p-4 text-center text-xs text-slate-500">
              No credential data available for this member.
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
};

export default TeamManagementView;
