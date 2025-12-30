import React, { useState, useEffect } from 'react';
import { 
  Container, 
  Title, 
  Button, 
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
import { getFamilies, getUsers, createFamily, deleteFamily, deleteUser, createFamilyMember, editFamilyMember, resetFamilyMemberPassword } from '../api';
import { getCurrentUserProfile } from '../api';
import FamilyMembersTable from './FamilyMembersTable';
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
  position?: number;
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
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [showFamilyModal, setShowFamilyModal] = useState(false);
  const [showMemberModal, setShowMemberModal] = useState(false);
  const [editingMember, setEditingMember] = useState<any | null>(null);
  const [memberFamilyId, setMemberFamilyId] = useState<string | null>(null);
  const tableRefs = React.useRef<Record<string, any>>({});
  // Family Member form
  // memberForm and modal moved into FamilyMembersTable; SystemAdminPage no longer manages per-family member modals

  const handleAddMember = (familyId: string) => {
    // trigger the shared table's add modal for the given family
    tableRefs.current[familyId]?.openAdd?.();
  };

  // Create or edit family member
  // create/edit moved into FamilyMembersTable; SystemAdminPage delegates to the table instance

  // Edit member handler
  // editing is handled by the FamilyMembersTable's internal edit controls

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

  

  const loadData = async () => {
    try {
      setLoading(true);
      const [familiesRes, usersRes, profileRes] = await Promise.all([
        getFamilies(),
        getUsers(),
        getCurrentUserProfile().catch(() => ({ response: { ok: false }, data: {} }))
      ]);

      if (familiesRes.response.ok) {
        setFamilies(familiesRes.data.families || []);
      }

      if (usersRes.response.ok) {
        setUsers(usersRes.data.users || []);
      }

      if (profileRes && profileRes.response && profileRes.response.ok && profileRes.data && profileRes.data.user) {
        setCurrentUserId(profileRes.data.user.id || null);
      } else {
        setCurrentUserId(null);
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
            // derive family users and respect explicit `position` ordering when provided
            const familyUsers = getUsersByFamily(family.id).slice();
            familyUsers.sort((a, b) => {
              if (typeof a.position === 'number' && typeof b.position === 'number') return a.position - b.position;
              return 0;
            });
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

                <FamilyMembersTable
                  ref={(el) => { tableRefs.current[family.id] = el; }}
                  showHeader={false}
                  familyId={family.id}
                  familyName={family.name}
                  initialMembers={familyUsers}
                  currentUserId={currentUserId}
                />
                {/* seeded templates display removed per request */}
              </Card>
            );
          })
        )}
      </Stack>

      {/* Family member add/edit modal moved into FamilyMembersTable; removed from SystemAdminPage */}

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

      {/* Create User removed - users are created per-family via FamilyMembersTable */}
    </Container>
  );
}