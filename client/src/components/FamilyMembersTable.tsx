import React, { useState, useRef, useEffect, useImperativeHandle } from 'react';
import {
  Button,
  Table,
  Group,
  Text,
  Modal,
  TextInput,
  Select,
  ActionIcon,
  Stack,
  Divider,
  Container,
  Title
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { IconTrash, IconPlus } from '@tabler/icons-react';
import { createFamilyMember, editFamilyMember, resetFamilyMemberPassword, deleteUser, updateFamilyMemberOrder } from '../api';
import PasswordRequirements from './PasswordRequirements';
import { isPasswordValid } from '../utils/password';

interface User {
  id: string;
  name?: string;
  username?: string;
  email?: string;
  role?: string;
}

interface Props {
  familyId: string;
  familyName?: string;
  initialMembers: User[];
  currentUserId?: string | null;
  showHeader?: boolean;
}
function FamilyMembersTable({ familyId, familyName, initialMembers, currentUserId, showHeader }: Props, ref: any) {
  const [members, setMembers] = useState<User[]>(initialMembers || []);
  const [showMemberModal, setShowMemberModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);
  const [editingMember, setEditingMember] = useState<User | null>(null);
  const [resettingMember, setResettingMember] = useState<User | null>(null);
  const [savingOrder, setSavingOrder] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [placeholderIndex, setPlaceholderIndex] = useState<number | null>(null);
  const rowRefs = useRef<Record<string, HTMLTableRowElement | null>>({});
  const ghostRef = useRef<HTMLDivElement | null>(null);
  const currentPlaceholderIndex = useRef<number | null>(null);

  useEffect(() => {
    setMembers(initialMembers || []);
  }, [initialMembers]);

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

  const editForm = useForm({
    initialValues: { name: '', username: '', role: 'FamilyMember' },
    validate: { name: (v) => (!v ? 'Name is required' : null) },
  });

  const resetForm = useForm({ initialValues: { newPassword: '', requireChange: true }, validate: { newPassword: (v) => (!v ? 'Password is required' : (!isPasswordValid(v) ? 'Password does not meet requirements' : null)) } });

  const handleAdd = () => {
    memberForm.reset();
    setShowMemberModal(true);
  };

  const handleCreate = async (values: any) => {
    try {
      const res = await createFamilyMember(familyId, {
        name: values.name,
        canLogin: values.canLogin,
        username: values.canLogin ? values.username : undefined,
        password: values.canLogin ? values.password : undefined,
        role: values.canLogin ? values.role : 'FamilyMember',
      });
      if (res.response.ok) {
        notifications.show({ title: 'Member added', message: 'Family member added successfully.', color: 'green' });
        setShowMemberModal(false);
        memberForm.reset();
        // append to local state and trust ordering
        setMembers(prev => [...prev, res.data.member]);
      } else {
        notifications.show({ title: 'Error', message: res.data.error || 'Failed to add member', color: 'red' });
      }
    } catch (err) {
      notifications.show({ title: 'Error', message: 'Network error', color: 'red' });
    }
  };

  const handleEdit = (member: User) => {
    setEditingMember(member);
    editForm.setValues({ name: member.name || '', username: member.username || '', role: member.role || 'FamilyMember' });
    setShowEditModal(true);
  };

  const submitEdit = async (values: any) => {
    if (!editingMember) return;
    try {
      const res = await editFamilyMember(familyId, editingMember.id, { name: values.name, username: values.username, role: values.role });
      if (res.response.ok) {
        notifications.show({ title: 'Member updated', message: 'Member details saved', color: 'green' });
        setShowEditModal(false);
        setEditingMember(null);
        setMembers(prev => prev.map(m => m.id === editingMember.id ? { ...m, ...res.data.member } : m));
      } else {
        notifications.show({ title: 'Error', message: res.data?.error || 'Failed to update member', color: 'red' });
      }
    } catch (err) {
      notifications.show({ title: 'Error', message: 'Network error', color: 'red' });
    }
  };

  const handleReset = (member: User) => {
    setResettingMember(member);
    resetForm.reset();
    setShowResetModal(true);
  };

  const submitReset = async (values: any) => {
    if (!resettingMember) return;
    if (!window.confirm(`Reset password for ${resettingMember.name || resettingMember.username || 'this member'}?`)) return;
    try {
      const res = await resetFamilyMemberPassword(familyId, resettingMember.id, values.newPassword, !!values.requireChange);
      if (res.response.ok) {
        notifications.show({ title: 'Password reset', message: 'Password has been reset', color: 'green' });
        setShowResetModal(false);
        setResettingMember(null);
      } else {
        notifications.show({ title: 'Error', message: res.data?.error || 'Failed to reset password', color: 'red' });
      }
    } catch (err) {
      notifications.show({ title: 'Error', message: 'Network error', color: 'red' });
    }
  };

  const handleDelete = async (memberId: string, memberName: string) => {
    if (!window.confirm(`Are you sure you want to remove ${memberName} from this family?`)) return;
    try {
      const res = await deleteUser(memberId);
      if (res.response.ok) {
        notifications.show({ title: 'Member removed', message: 'Family member removed.', color: 'green' });
        setMembers(prev => prev.filter(m => m.id !== memberId));
      } else {
        notifications.show({ title: 'Error', message: res.data.error || 'Failed to remove member', color: 'red' });
      }
    } catch (err) {
      notifications.show({ title: 'Error', message: 'Network error', color: 'red' });
    }
  };

  const persistOrder = async (order?: User[]) => {
    const ids = (order || members).map(m => m.id);
    setSavingOrder(true);
    try {
      const res = await updateFamilyMemberOrder(familyId, ids);
      if (res.response.ok) {
        notifications.show({ title: 'Order saved', message: 'Member order updated', color: 'green' });
      } else {
        notifications.show({ title: 'Error', message: res.data?.error || 'Failed to save order', color: 'red' });
      }
    } catch (err) {
      notifications.show({ title: 'Error', message: 'Network error', color: 'red' });
    } finally {
      setSavingOrder(false);
    }
  };

  useImperativeHandle(ref, () => ({ openAdd: handleAdd }));

  // drag/drop handlers (adapted from original)
  return (
    <div style={{ width: '100%' }}>
      {showHeader && (
        <>
          <Group justify="space-between" mb="xl">
            <Title order={3}>{familyName || 'Family Members'}</Title>
            <Button leftSection={<IconPlus size={16} />} onClick={handleAdd}>Add Member</Button>
          </Group>
          <Divider mb="md" />
        </>
      )}
      <Text fw={500} mb="sm">Family Members ({members.length})</Text>
      {members.length === 0 ? (
        <Text c="dimmed" size="sm">No members in this family</Text>
      ) : (
        <Table style={{ width: '100%' }}>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Name</Table.Th>
              <Table.Th>Username</Table.Th>
              <Table.Th>Email</Table.Th>
              <Table.Th>Role</Table.Th>
              <Table.Th>Actions</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {members.map((member: any, index: number) => (
              <Table.Tr key={member.id} ref={(el) => { rowRefs.current[member.id] = el; }} style={{ opacity: draggingId === member.id ? 0.3 : 1 }}>
                <Table.Td style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div
                    draggable
                    onDragStart={(e) => { e.dataTransfer?.setData('text/plain', member.id); if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'; setDraggingId(member.id); setPlaceholderIndex(index); }}
                    onDragEnd={() => { setDraggingId(null); setPlaceholderIndex(null); }}
                    style={{ cursor: 'grab', padding: '4px 8px', borderRadius: 4, userSelect: 'none', display: 'inline-flex', alignItems: 'center' }}
                    title="Drag to reorder"
                  >
                    <span style={{ fontSize: 14, lineHeight: 1 }}>≡</span>
                  </div>
                  <div>{member.name || member.username || 'Unknown'}</div>
                </Table.Td>
                <Table.Td>{member.username || '-'}</Table.Td>
                <Table.Td>{member.email || '-'}</Table.Td>
                <Table.Td>{member.role || 'FamilyMember'}</Table.Td>
                <Table.Td style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <>
                    <Button size="xs" variant="default" onClick={() => handleEdit(member)}>Edit</Button>
                    {member.username && (
                      <Button size="xs" color="yellow" variant="light" onClick={() => handleReset(member)}>Reset Password</Button>
                    )}
                    {member.id !== currentUserId && (
                      <ActionIcon color="red" variant="light" onClick={() => handleDelete(member.id, member.name || member.username || 'Unknown')}>
                        <IconTrash size={16} />
                      </ActionIcon>
                    )}
                  </>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
        <Button onClick={() => persistOrder()} loading={savingOrder} disabled={members.length === 0}>Save Order</Button>
      </div>

      <Modal opened={showMemberModal} onClose={() => setShowMemberModal(false)} title="Add Family Member" size="lg">
        <form onSubmit={memberForm.onSubmit(handleCreate)}>
          <Stack>
            <TextInput label="Name" placeholder="Enter member name" {...memberForm.getInputProps('name')} />
            <Group>
              <label>
                <input type="checkbox" checked={memberForm.values.canLogin} onChange={(e) => memberForm.setFieldValue('canLogin', e.target.checked)} style={{ marginRight: 8 }} />
                Can log in?
              </label>
            </Group>
            {memberForm.values.canLogin && (
              <>
                <TextInput label="Username" placeholder="Enter username" {...memberForm.getInputProps('username')} />
                <TextInput label="Password" placeholder="Minimum 8 chars" type="password" {...memberForm.getInputProps('password')} />
                <Select label="Role" data={[{ value: 'FamilyMember', label: 'Family Member' }, { value: 'FamilyAdmin', label: 'Family Admin' }]} {...memberForm.getInputProps('role')} />
              </>
            )}
            <Group justify="flex-end">
              <Button variant="light" onClick={() => setShowMemberModal(false)}>Cancel</Button>
              <Button type="submit">Add Member</Button>
            </Group>
          </Stack>
        </form>
      </Modal>

      <Modal opened={showEditModal} onClose={() => { setShowEditModal(false); setEditingMember(null); }} title="Edit Family Member" size="lg">
        <form onSubmit={editForm.onSubmit(submitEdit)}>
          <Stack>
            <TextInput label="Name" placeholder="Enter member name" {...editForm.getInputProps('name')} />
            <TextInput label="Username" placeholder="Enter username" {...editForm.getInputProps('username')} />
            <Select label="Role" data={[{ value: 'FamilyMember', label: 'Family Member' }, { value: 'FamilyAdmin', label: 'Family Admin' }]} {...editForm.getInputProps('role')} />
            <Group justify="flex-end">
              <Button variant="light" onClick={() => { setShowEditModal(false); setEditingMember(null); }}>Cancel</Button>
              <Button type="submit">Save</Button>
            </Group>
          </Stack>
        </form>
      </Modal>

      <Modal opened={showResetModal} onClose={() => { setShowResetModal(false); setResettingMember(null); }} title="Reset Password" size="lg">
        <form onSubmit={resetForm.onSubmit(submitReset)}>
          <Stack>
                  <Text size="sm">Resetting password for: <strong>{resettingMember?.name || resettingMember?.username}</strong></Text>
                  <TextInput label="New Password" type="password" placeholder="Enter new password" {...resetForm.getInputProps('newPassword')} />
                  {resetForm.values.newPassword && <PasswordRequirements password={resetForm.values.newPassword} />}
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input type="checkbox" checked={resetForm.values.requireChange} onChange={(e) => resetForm.setFieldValue('requireChange', e.target.checked)} />
                    <span>Require user to change password at next login</span>
                  </label>
            <Group justify="flex-end">
              <Button variant="light" onClick={() => { setShowResetModal(false); setResettingMember(null); }}>Cancel</Button>
              <Button type="submit" color="yellow">Reset</Button>
            </Group>
          </Stack>
        </form>
      </Modal>
    </div>
  );
}

export default React.forwardRef(FamilyMembersTable);
