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
  Card,
  Stack,
  Divider
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { IconTrash, IconPlus, IconAlertCircle } from '@tabler/icons-react';
import { getFamilies, getUsers, createFamily, createUser, deleteFamily, deleteUser, createFamilyMember, editFamilyMember, resetFamilyMemberPassword } from '../api';
import { useNavigate } from 'react-router-dom';
import { useImpersonation } from '../contexts/ImpersonationContext';

interface User {
  id: string;
  name: string;
  username?: string;
  role?: string;
  email?: string;
  familyId?: string;
  created_at: string;
}

interface Family {
  id: string;
  name: string;
  created_at: string;
}

export default function SystemAdminPage(): React.ReactElement {
  const [families, setFamilies] = useState<Family[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [creatingFamily, setCreatingFamily] = useState(false);
    // Removed unused familyTemplates state declaration
    // const [familyTemplates, setFamilyTemplates] = useState<Record<string, any[]>>({});
  const [loading, setLoading] = useState(true);
  const [showFamilyModal, setShowFamilyModal] = useState(false);
  const [showUserModal, setShowUserModal] = useState(false);
  const [showMemberModal, setShowMemberModal] = useState(false);
  const [editingMember, setEditingMember] = useState<any | null>(null);
  const [memberFamilyId, setMemberFamilyId] = useState<string | null>(null);
  // Family Member form
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

  const handleAddMember = (familyId: string) => {
  console.log('[DEBUG] Add Member button clicked for familyId:', familyId);
  setMemberFamilyId(familyId);
  setEditingMember(null);
  memberForm.reset();
  setShowMemberModal(true);
  console.log('[DEBUG] showMemberModal set to true');
  };

  // Create or edit family member
  const handleCreateMember = async (values: any) => {
    console.log('[DEBUG] handleCreateMember called with values:', values, 'memberFamilyId:', memberFamilyId, 'editingMember:', editingMember);
    if (!memberFamilyId) {
      console.log('[DEBUG] No memberFamilyId set, aborting');
      return;
    }
    try {
      let response;
      if (editingMember) {
        console.log('[DEBUG] Calling editFamilyMember API');
        response = await editFamilyMember(memberFamilyId, editingMember.id, {
          name: values.name,
          username: values.canLogin ? values.username : undefined,
          role: values.canLogin ? values.role : 'FamilyMember',
        });
      } else {
        console.log('[DEBUG] Calling createFamilyMember API');
        response = await createFamilyMember(memberFamilyId, {
          name: values.name,
          canLogin: values.canLogin,
          username: values.canLogin ? values.username : undefined,
          password: values.canLogin ? values.password : undefined,
          role: values.canLogin ? values.role : 'FamilyMember',
        });
      }
      console.log('[DEBUG] API response:', response);
      if (response.response.ok) {
        notifications.show({
          title: editingMember ? 'Member updated' : 'Member added',
          message: editingMember ? 'Family member updated successfully.' : 'Family member added successfully.',
          color: 'green',
        });
        setShowMemberModal(false);
        memberForm.reset();
        setEditingMember(null);
        loadData();
      } else {
        notifications.show({
          title: 'Error',
          message: response.data.error || 'Failed to save family member',
          color: 'red',
        });
        console.log('[DEBUG] API error:', response.data.error);
      }
    } catch (error) {
      notifications.show({
        title: 'Error',
        message: 'Network error',
        color: 'red',
      });
      console.log('[DEBUG] Exception in handleCreateMember:', error);
    }
  };

  // Edit member handler
  const handleEditMember = (familyId: string, member: any) => {
    console.log('[DEBUG] Edit Member button clicked for familyId:', familyId, 'member:', member);
    setMemberFamilyId(familyId);
    setEditingMember(member);
    memberForm.setValues({
      name: member.name || '',
      canLogin: !!member.username,
      username: member.username || '',
      password: '',
      role: member.role || 'FamilyMember',
    });
    setShowMemberModal(true);
    console.log('[DEBUG] showMemberModal set to true (edit)');
  };

  // Password reset handler
  const handleResetPassword = async (familyId: string, memberId: string) => {
    const newPassword = window.prompt('Enter new password for this member:');
    if (!newPassword) return;
    try {
      const response = await resetFamilyMemberPassword(familyId, memberId, newPassword);
      if (response.response.ok) {
        notifications.show({
          title: 'Password Reset',
          message: 'Password reset successfully. Member will be required to change password on next login.',
          color: 'green',
        });
        loadData();
      } else {
        notifications.show({
          title: 'Error',
          message: response.data.error || 'Failed to reset password',
          color: 'red',
        });
      }
    } catch (error) {
      notifications.show({
        title: 'Error',
        message: 'Network error',
        color: 'red',
      });
    }
  };

  const familyForm = useForm({
    initialValues: {
      name: '',
    },
    validate: {
      name: (value) => (!value ? 'Family name is required' : null),
    },
  });

  const userForm = useForm({
    initialValues: {
      username: '',
      password: '',
      role: 'FamilyMember',
      email: '',
      familyId: '',
    },
    validate: {
      username: (value) => (!value ? 'Username is required' : null),
      password: (value) => {
        if (!value) return 'Password is required';
        if (value.length < 8) return 'Password must be at least 8 characters';
        
        // Count character types
        let typeCount = 0;
        if (/[A-Z]/.test(value)) typeCount++; // Uppercase
        if (/[a-z]/.test(value)) typeCount++; // Lowercase
        if (/[0-9]/.test(value)) typeCount++; // Numbers
        if (/[^A-Za-z0-9]/.test(value)) typeCount++; // Symbols
        
        if (typeCount < 2) return 'Password must contain at least 2 of: uppercase, lowercase, numbers, symbols';
        return null;
      },
      email: (value) => (!value ? 'Email is required' : null),
      familyId: (value) => (!value ? 'Family is required' : null),
    },
  });

  const loadData = async () => {
    try {
      setLoading(true);
      const [familiesRes, usersRes] = await Promise.all([
        getFamilies(),
        getUsers()
      ]);

      if (familiesRes.response.ok) {
        setFamilies(familiesRes.data.families || []);
      }

      if (usersRes.response.ok) {
        setUsers(usersRes.data.users || []);
      }
    } catch (error) {
      notifications.show({
        title: 'Error',
        message: 'Failed to load data',
        color: 'red',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const { startImpersonation } = useImpersonation();
  const navigate = useNavigate();

  const handleCreateFamily = async (values: { name: string }) => {
    try {
      setCreatingFamily(true);
      const response = await createFamily(values);
      if (response.response.ok) {
        notifications.show({
          title: 'Success',
          message: 'Family created successfully',
          color: 'green',
        });
        setShowFamilyModal(false);
        familyForm.reset();
        // Only reload families (faster) — users can be fetched later when needed
        try {
          const familiesRes = await getFamilies();
          if (familiesRes.response.ok) setFamilies(familiesRes.data.families || []);
        } catch (err) {
          // fallback to full load if needed
          loadData();
        }
      } else {
        notifications.show({
          title: 'Error',
          message: response.data.error || 'Failed to create family',
          color: 'red',
        });
      }
    } catch (error) {
      notifications.show({
        title: 'Error',
        message: 'Network error',
        color: 'red',
      });
    } finally {
      setCreatingFamily(false);
    }
  };

  const handleCreateUser = async (values: any) => {
    try {
      const response = await createUser(values);
      if (response.response.ok) {
        notifications.show({
          title: 'Success',
          message: 'User created successfully',
          color: 'green',
        });
        setShowUserModal(false);
        userForm.reset();
        loadData();
      } else {
        notifications.show({
          title: 'Error',
          message: response.data.error || 'Failed to create user',
          color: 'red',
        });
      }
    } catch (error) {
      notifications.show({
        title: 'Error',
        message: 'Network error',
        color: 'red',
      });
    }
  };

  const handleDeleteFamily = async (familyId: string, familyName: string) => {
    if (window.confirm(`Are you sure you want to delete the family "${familyName}"? This will also remove all users in this family.`)) {
      try {
        const response = await deleteFamily(familyId);
        if (response.response.ok) {
          notifications.show({
            title: 'Success',
            message: 'Family deleted successfully',
            color: 'green',
          });
          loadData();
        } else {
          notifications.show({
            title: 'Error',
            message: response.data.error || 'Failed to delete family',
            color: 'red',
          });
        }
      } catch (error) {
        notifications.show({
          title: 'Error',
          message: 'Network error',
          color: 'red',
        });
      }
    }
  };

  const handleDeleteUser = async (userId: string, username: string) => {
    if (window.confirm(`Are you sure you want to delete the user "${username}"?`)) {
      try {
        const response = await deleteUser(userId);
        if (response.response.ok) {
          notifications.show({
            title: 'Success',
            message: 'User deleted successfully',
            color: 'green',
          });
          loadData();
        } else {
          notifications.show({
            title: 'Error',
            message: response.data.error || 'Failed to delete user',
            color: 'red',
          });
        }
      } catch (error) {
        notifications.show({
          title: 'Error',
          message: 'Network error',
          color: 'red',
        });
      }
    }
  };

  const getUsersByFamily = (familyId: string) => {
    return users.filter(user => user.familyId === familyId);
  };

  // Helper function for future use
  // const getFamilyName = (familyId: string) => {
  //   const family = families.find(f => f.id === familyId);
  //   return family ? family.name : 'Unknown Family';
  // };

  if (loading) {
    return (
      <Container size="xl">
        <Text>Loading...</Text>
      </Container>
    );
  }

  return (
    <Container size="xl">
      <Group justify="space-between" mb="xl">
        <Title order={1}>System Administration</Title>
        <Group>
          <Button leftSection={<IconPlus size={16} />} onClick={() => setShowFamilyModal(true)}>
            Add Family
          </Button>
          <Button leftSection={<IconPlus size={16} />} onClick={() => setShowUserModal(true)}>
            Add User
          </Button>
        </Group>
      </Group>

      <Alert icon={<IconAlertCircle size={16} />} title="System Administrator Access" mb="xl">
        You have full access to manage all families and users in the system.
      </Alert>

      <Stack gap="xl">
        {families.length === 0 ? (
          <Card withBorder>
            <Text ta="center" c="dimmed">No families found. Create your first family to get started.</Text>
          </Card>
        ) : (
          families.map((family) => {
            const familyUsers = getUsersByFamily(family.id);
            return (
              <Card key={family.id} withBorder>
                <Group justify="space-between" mb="md">
                  <div>
                    <Text fw={500} size="lg">{family.name || 'Unnamed Family'}</Text>
                    <Text size="sm" c="dimmed">
                      Created: {new Date(family.created_at).toLocaleDateString()}
                    </Text>
                  </div>
                  <Group>
                    <Button size="xs" variant="light" onClick={() => handleAddMember(family.id)}>
                      Add Family Member
                    </Button>
                    <Button size="xs" variant="light" onClick={() => { startImpersonation(family.id); navigate('/'); }}>
                      View Family
                    </Button>
                    <ActionIcon 
                      color="red" 
                      variant="light"
                      onClick={() => handleDeleteFamily(family.id, family.name || 'Unnamed Family')}
                    >
                      <IconTrash size={16} />
                    </ActionIcon>
                  </Group>
                </Group>

                <Divider mb="md" />

                <Text fw={500} mb="sm">Family Members ({familyUsers.length})</Text>
                {familyUsers.length === 0 ? (
                  <Text c="dimmed" size="sm">No users in this family</Text>
                ) : (
                  <Table>
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>Name</Table.Th>
                        <Table.Th>Username</Table.Th>
                        <Table.Th>Role</Table.Th>
                        <Table.Th>Email</Table.Th>
                        <Table.Th>Created</Table.Th>
                        <Table.Th>Actions</Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {familyUsers.map((user) => (
                        <Table.Tr key={user.id}>
                          <Table.Td>{user.name || user.username || 'Unknown'}</Table.Td>
                          <Table.Td>{user.username || '-'}</Table.Td>
                          <Table.Td>{user.role || 'No Role'}</Table.Td>
                          <Table.Td>{user.email || '-'}</Table.Td>
                          <Table.Td>{new Date(user.created_at).toLocaleDateString()}</Table.Td>
                          <Table.Td>
                            <Button size="xs" variant="light" onClick={() => handleEditMember(family.id, user)} style={{ marginRight: 8 }}>
                              Edit
                            </Button>
                            {user.username && (
                              <Button size="xs" variant="light" color="yellow" onClick={() => handleResetPassword(family.id, user.id)} style={{ marginRight: 8 }}>
                                Reset Password
                              </Button>
                            )}
                            <ActionIcon
                              color="red"
                              variant="light"
                              size="sm"
                              onClick={() => handleDeleteUser(user.id, user.username || 'Unknown User')}
                            >
                              <IconTrash size={14} />
                            </ActionIcon>
                          </Table.Td>
                        </Table.Tr>
                      ))}
                    </Table.Tbody>
                  </Table>
                )}
                {/* seeded templates display removed per request */}
              </Card>
            );
          })
        )}
      </Stack>

      {/* Add/Edit Family Member Modal */}
      <Modal opened={showMemberModal} onClose={() => setShowMemberModal(false)} title={editingMember ? 'Edit Family Member' : 'Add Family Member'} size="lg">
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
              <Button type="submit">{editingMember ? 'Save Changes' : 'Add Member'}</Button>
            </Group>
          </Stack>
        </form>
      </Modal>

      {/* Create Family Modal */}
      <Modal opened={showFamilyModal} onClose={() => setShowFamilyModal(false)} title="Create New Family">
        <form onSubmit={familyForm.onSubmit(handleCreateFamily)}>
          <Stack>
            <TextInput
              label="Family Name"
              placeholder="Enter family name"
              {...familyForm.getInputProps('name')}
            />
            <Group justify="flex-end">
              <Button variant="light" onClick={() => setShowFamilyModal(false)}>
                Cancel
              </Button>
              <Button type="submit" loading={creatingFamily}>{creatingFamily ? 'Creating...' : 'Create Family'}</Button>
            </Group>
          </Stack>
        </form>
      </Modal>

      {/* Create User Modal */}
      <Modal opened={showUserModal} onClose={() => setShowUserModal(false)} title="Create New User" size="lg">
        <form onSubmit={userForm.onSubmit(handleCreateUser)}>
          <Stack>
            <TextInput
              label="Username"
              placeholder="Enter username"
              {...userForm.getInputProps('username')}
            />
            <TextInput
              label="Password"
              placeholder="Minimum 16 chars, upper/lower/number/symbol"
              type="password"
              {...userForm.getInputProps('password')}
            />
            <Select
              label="Role"
              data={[
                { value: 'SystemAdmin', label: 'System Administrator' },
                { value: 'FamilyAdmin', label: 'Family Administrator' },
                { value: 'FamilyMember', label: 'Family Member' },
              ]}
              {...userForm.getInputProps('role')}
            />
            <TextInput
              label="Email"
              placeholder="Enter email address"
              type="email"
              {...userForm.getInputProps('email')}
            />
            <Select
              label="Family"
              placeholder="Select family"
              data={families.map(f => ({ value: f.id, label: f.name || 'Unnamed Family' }))}
              {...userForm.getInputProps('familyId')}
            />
            <Group justify="flex-end">
              <Button variant="light" onClick={() => setShowUserModal(false)}>
                Cancel
              </Button>
              <Button type="submit">Create User</Button>
            </Group>
          </Stack>
        </form>
      </Modal>
    </Container>
  );
}