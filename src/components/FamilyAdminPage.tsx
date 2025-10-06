import React, { useState, useEffect } from 'react';
import { 
  Container, 
  Title, 
  Button, 
  Table, 
  Group, 
  Text, 
  Modal, 
  TextInput, 
  Select, 
  Alert,
  ActionIcon,
  Stack,
  Divider
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { IconTrash, IconPlus } from '@tabler/icons-react';
import { getCurrentUserProfile, createFamilyMember, deleteUser, getFamily } from '../api';
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
  const [loading, setLoading] = useState(true);
  const [family, setFamily] = useState<any>(null);
  const [members, setMembers] = useState<User[]>([]);
  const [showMemberModal, setShowMemberModal] = useState(false);
  const { impersonatingFamilyId } = useImpersonation();

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
      // If impersonation is active and user is a SystemAdmin, load the impersonated family
      if (impersonatingFamilyId) {
        const famRes = await getFamily(impersonatingFamilyId);
        if (famRes.response.ok && famRes.data.family) {
          setFamily(famRes.data.family);
          setMembers(famRes.data.family.members || []);
        } else {
          setFamily(null);
          setMembers([]);
        }
      } else {
        const response = await getCurrentUserProfile();
        if (response.response.ok && response.data.family) {
          setFamily(response.data.family);
          setMembers(response.data.family.members || []);
        } else {
          setFamily(null);
          setMembers([]);
        }
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
  }, []);

  const handleAddMember = () => {
    memberForm.reset();
    setShowMemberModal(true);
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

  if (loading) {
    return (
      <Container size="md">
        <Group justify="center" mt="xl">
          <Text>Loading family members...</Text>
        </Group>
      </Container>
    );
  }

  if (!family) {
    return (
      <Container size="md">
        <Alert color="red" title="No Family Found">
          You are not assigned to any family. Please contact your system administrator.
        </Alert>
      </Container>
    );
  }

  return (
    <Container size="md">
      <Group justify="space-between" mb="xl">
        <Title order={2}>Family Administration</Title>
        <Button leftSection={<IconPlus size={16} />} onClick={handleAddMember}>
          Add Member
        </Button>
      </Group>
      <Divider mb="md" />
      <Text fw={500} mb="sm">Family Members ({members.length})</Text>
      {members.length === 0 ? (
        <Text c="dimmed" size="sm">No members in your family</Text>
      ) : (
        <Table>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Name</Table.Th>
              <Table.Th>Username</Table.Th>
              <Table.Th>Role</Table.Th>
              <Table.Th>Actions</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {members.map((member: any) => (
              <Table.Tr key={member.id}>
                <Table.Td>{member.name || member.username || 'Unknown'}</Table.Td>
                <Table.Td>{member.username || '-'}</Table.Td>
                <Table.Td>{member.role || 'FamilyMember'}</Table.Td>
                <Table.Td>
                  {member.id !== family?.members?.find((m: any) => m.id === member.id)?.id || member.id !== members.find((m: any) => m.id === member.id)?.id ? (
                    <ActionIcon color="red" variant="light" onClick={() => handleDeleteMember(member.id, member.name || member.username || 'Unknown')}>
                      <IconTrash size={16} />
                    </ActionIcon>
                  ) : (
                    // If this is the current user, do not show delete button
                    <Text size="xs" c="dimmed">(You)</Text>
                  )}
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}
      <Modal opened={showMemberModal} onClose={() => setShowMemberModal(false)} title="Add Family Member" size="lg">
        <form onSubmit={memberForm.onSubmit(handleCreateMember)}>
          <Stack>
            <TextInput
              label="Name"
              placeholder="Enter member name"
              {...memberForm.getInputProps('name')}
            />
            <Group>
              <label>
                <input
                  type="checkbox"
                  checked={memberForm.values.canLogin}
                  onChange={(e) => memberForm.setFieldValue('canLogin', e.target.checked)}
                  style={{ marginRight: 8 }}
                />
                Can log in?
              </label>
            </Group>
            {memberForm.values.canLogin && (
              <>
                <TextInput
                  label="Username"
                  placeholder="Enter username"
                  {...memberForm.getInputProps('username')}
                />
                <TextInput
                  label="Password"
                  placeholder="Minimum 8 chars, upper/lower/number/symbol"
                  type="password"
                  {...memberForm.getInputProps('password')}
                />
                <Select
                  label="Role"
                  data={[{ value: 'FamilyMember', label: 'Family Member' }, { value: 'FamilyAdmin', label: 'Family Admin' }]}
                  {...memberForm.getInputProps('role')}
                />
              </>
            )}
            <Group justify="flex-end">
              <Button variant="light" onClick={() => setShowMemberModal(false)}>
                Cancel
              </Button>
              <Button type="submit">Add Member</Button>
            </Group>
          </Stack>
        </form>
      </Modal>
    </Container>
  );
}