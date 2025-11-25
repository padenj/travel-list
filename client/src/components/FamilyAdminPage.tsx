import React, { useState, useEffect, useRef } from 'react';
import { Container, Title, Button, Group, Text, Divider } from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { IconTrash, IconPlus } from '@tabler/icons-react';
import { getCurrentUserProfile, createFamilyMember, deleteUser, getFamily, updateFamilyMemberOrder, editFamilyMember, resetFamilyMemberPassword } from '../api';
import FamilyMembersTable from './FamilyMembersTable';
import { useImpersonation } from '../contexts/ImpersonationContext';

interface User {
  id: string;
  name?: string;
  username?: string;
  role?: string;
  email?: string;
  familyId?: string;
  created_at?: string;
}

export default function FamilyAdminPage(): React.ReactElement {
  const [_loading, setLoading] = useState(true); // Fixed syntax issues
  const [family, setFamily] = useState<any>(null);
  const [members, setMembers] = useState<User[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [showMemberModal, setShowMemberModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);
  const { impersonatingFamilyId } = useImpersonation();
  const [editingMember, setEditingMember] = useState<User | null>(null);
  const [resettingMember, setResettingMember] = useState<User | null>(null);
  const [savingOrder, setSavingOrder] = useState(false);
  const tableRef = useRef<any>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [placeholderIndex, setPlaceholderIndex] = useState<number | null>(null);
  const rowRefs = useRef<Record<string, HTMLTableRowElement | null>>({});
  const ghostRef = useRef<HTMLDivElement | null>(null);
  const currentPlaceholderIndex = useRef<number | null>(null);

  const memberForm = useForm({
    initialValues: {
      name: '',
      canLogin: false,
      username: '',
      password: '',
      role: 'FamilyMember',
    },
    validate: {
      name: (value) => (!value ? 'Name is required' : null),
      username: (value, values) => (values.canLogin && !value ? 'Username is required' : null),
      password: (value, values) => {
        if (!values.canLogin) return null;
        if (!value) return 'Password is required';
        if (value.length < 8) return 'Password must be at least 8 characters';
        let typeCount = 0;
        if (/[A-Z]/.test(value)) typeCount++;
        if (/[a-z]/.test(value)) typeCount++;
        if (/[0-9]/.test(value)) typeCount++;
        if (/[^A-Za-z0-9]/.test(value)) typeCount++;
        if (typeCount < 2) return 'Password must contain at least 2 of: uppercase, lowercase, numbers, symbols';
        return null;
      },
    },
  });

  const loadFamily = async () => {
    setLoading(true);
    try {
      // Always fetch current user profile to get current user id
      let profileRes;
      try {
        profileRes = await getCurrentUserProfile();
        if (profileRes.response.ok && profileRes.data && profileRes.data.user) {
          setCurrentUserId(profileRes.data.user.id || null);
        }
      } catch (e) {
        // ignore profile fetch errors but proceed to fetch family if possible
        console.debug('Failed to load current user profile', e);
      }

      if (impersonatingFamilyId) {
        const famRes = await getFamily(impersonatingFamilyId);
        if (famRes.response.ok && famRes.data.family) {
          console.log('🔍 Client: Loading family members from getFamily API:', famRes.data.family.members?.map((m: any) => ({ id: m.id, name: m.name, username: m.username, position: m.position })));
          setFamily(famRes.data.family);
          setMembers(famRes.data.family.members || []);
        } else {
          setFamily(null);
          setMembers([]);
        }
      } else if (profileRes && profileRes.response.ok && profileRes.data.family) {
        console.log('🔍 Client: Loading family members from getCurrentUserProfile API:', profileRes.data.family.members?.map((m: any) => ({ id: m.id, name: m.name, username: m.username, position: m.position })));
        setFamily(profileRes.data.family);
        setMembers(profileRes.data.family.members || []);
      } else {
        // fallback: try to load family from current user profile again
        setFamily(null);
        setMembers([]);
      }
    } catch (error) {
      notifications.show({ title: 'Error', message: 'Failed to load family', color: 'red' });
      setFamily(null);
      setMembers([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFamily();
  }, [impersonatingFamilyId]);

  const handleAddMember = () => {
    memberForm.reset();
    setShowMemberModal(true);
  };

  const handleEditMember = (member: User) => {
    setEditingMember(member);
    editForm.setValues({ name: member.name || '', username: member.username || '', role: member.role || 'FamilyMember' });
    setShowEditModal(true);
  };

  const handleResetPassword = (member: User) => {
    setResettingMember(member);
    resetForm.reset();
    setShowResetModal(true);
  };

  const handleCreateMember = async (values: any) => {
    if (!family?.id) return;
    try {
      const response = await createFamilyMember(family.id, {
        name: values.name,
        canLogin: values.canLogin,
        username: values.canLogin ? values.username : undefined,
        password: values.canLogin ? values.password : undefined,
        role: values.canLogin ? values.role : 'FamilyMember',
      });
      if (response.response.ok) {
        notifications.show({ title: 'Member added', message: 'Family member added successfully.', color: 'green' });
        setShowMemberModal(false);
        memberForm.reset();
        loadFamily();
      } else {
        notifications.show({ title: 'Error', message: response.data.error || 'Failed to add member', color: 'red' });
      }
    } catch (error) {
      notifications.show({ title: 'Error', message: 'Network error', color: 'red' });
    }
  };

  const handleDeleteMember = async (memberId: string, memberName: string) => {
    if (!window.confirm(`Are you sure you want to remove ${memberName} from your family?`)) return;
    try {
      const response = await deleteUser(memberId);
      if (response.response.ok) {
        notifications.show({ title: 'Member removed', message: 'Family member removed.', color: 'green' });
        loadFamily();
      } else {
        notifications.show({ title: 'Error', message: response.data.error || 'Failed to remove member', color: 'red' });
      }
    } catch (error) {
      notifications.show({ title: 'Error', message: 'Network error', color: 'red' });
    }
  };

  const editForm = useForm({
    initialValues: {
      name: '',
      username: '',
      role: 'FamilyMember',
    },
    validate: {
      name: (v) => (!v ? 'Name is required' : null),
      username: (v) => (v && v.length < 3 ? 'Username too short' : null),
    },
  });

  const resetForm = useForm({
    initialValues: { newPassword: '' },
    validate: {
      newPassword: (value) => {
        if (!value) return 'Password is required';
        if (value.length < 8) return 'Password must be at least 8 characters';
        let typeCount = 0;
        if (/[A-Z]/.test(value)) typeCount++;
        if (/[a-z]/.test(value)) typeCount++;
        if (/[0-9]/.test(value)) typeCount++;
        if (/[^A-Za-z0-9]/.test(value)) typeCount++;
        if (typeCount < 2) return 'Password must contain at least 2 of: uppercase, lowercase, numbers, symbols';
        return null;
      },
    },
  });

  const submitEditMember = async (values: any) => {
    if (!family?.id || !editingMember) return;
    try {
      const res = await editFamilyMember(family.id, editingMember.id, { name: values.name, username: values.username, role: values.role });
      if (res.response.ok) {
        notifications.show({ title: 'Member updated', message: 'Member details saved', color: 'green' });
        setShowEditModal(false);
        setEditingMember(null);
        loadFamily();
      } else {
        notifications.show({ title: 'Error', message: res.data?.error || 'Failed to update member', color: 'red' });
      }
    } catch (err) {
      notifications.show({ title: 'Error', message: 'Network error', color: 'red' });
    }
  };

  const submitResetPassword = async (values: any) => {
    if (!family?.id || !resettingMember) return;
    if (!window.confirm(`Reset password for ${resettingMember.name || resettingMember.username || 'this member'}?`)) return;
    try {
      const res = await resetFamilyMemberPassword(family.id, resettingMember.id, values.newPassword);
      if (res.response.ok) {
        notifications.show({ title: 'Password reset', message: 'Password has been reset', color: 'green' });
        setShowResetModal(false);
        setResettingMember(null);
        resetForm.reset();
      } else {
        notifications.show({ title: 'Error', message: res.data?.error || 'Failed to reset password', color: 'red' });
      }
    } catch (err) {
      notifications.show({ title: 'Error', message: 'Network error', color: 'red' });
    }
  };

  const persistOrder = async (order?: User[]) => {
    if (!family?.id) return;
    const ids = (order || members).map(m => m.id);
    setSavingOrder(true);
    try {
      const res = await updateFamilyMemberOrder(family.id, ids);
      if (res.response.ok) {
        notifications.show({ title: 'Order saved', message: 'Member order updated', color: 'green' });
        // Don't reload family data - trust the local state since we just successfully persisted it
      } else {
        notifications.show({ title: 'Error', message: res.data?.error || 'Failed to save order', color: 'red' });
        // Don't reload on error to avoid cascading failures - just show error
      }
    } catch (err) {
      console.error('Error persisting order:', err);
      notifications.show({ title: 'Error', message: 'Network error', color: 'red' });
      // Don't reload on error to avoid cascading failures - just show error
    } finally {
      setSavingOrder(false);
    }
  };

  return (
    <Container size="md">
      <Group justify="space-between" mb="xl">
        <Title order={3}>{family?.name || 'Family Members'}</Title>
        <Button leftSection={<IconPlus size={16} />} onClick={() => tableRef.current?.openAdd()}>+ Add Member</Button>
      </Group>
      <Divider mb="md" />
      <FamilyMembersTable ref={tableRef} showHeader={false} familyId={family?.id || ''} familyName={family?.name} initialMembers={members} currentUserId={currentUserId} />
    </Container>
  );
}