import React, { useState } from 'react';
import { Title, Text, Container, Card, Group, Button } from '@mantine/core';
import { IconSettings } from '@tabler/icons-react';
import FamilySetupWizard from './FamilySetupWizard';

interface User {
  username?: string;
  token?: string;
  role?: string;
}

interface DashboardProps {
  user: User;
}

export default function Dashboard({ user }: DashboardProps): React.ReactElement {
  const [showSetupWizard, setShowSetupWizard] = useState(false);

  return (
    <Container size="lg">
      <Group justify="space-between" mb="xl">
        <Title order={1}>Dashboard</Title>
        {user.role === 'SystemAdmin' && (
          <Button 
            leftSection={<IconSettings size={16} />}
            variant="light"
            onClick={() => setShowSetupWizard(true)}
          >
            Manage My Family
          </Button>
        )}
      </Group>
      
      <Card shadow="sm" padding="lg" radius="md" withBorder>
        <Group justify="space-between" mb="xs">
          <Text fw={500}>Welcome to Travel List!</Text>
          <Text size="sm" c="dimmed">
            {user.role}
          </Text>
        </Group>
        
        <Text size="sm" c="dimmed">
          Your packing list assistant is ready to help you organize your travels.
        </Text>
        
        <Text size="sm" mt="md">
          Use the navigation menu to access:
        </Text>
        
        <div style={{ marginTop: '16px' }}>
          {user.role === 'SystemAdmin' && (
            <Text size="sm" c="dimmed" mb="xs">
              • System Administration - Manage all families and users
            </Text>
          )}
          {(user.role === 'SystemAdmin' || user.role === 'FamilyAdmin') && (
            <Text size="sm" c="dimmed" mb="xs">
              • Family Administration - Manage your family members
            </Text>
          )}
          <Text size="sm" c="dimmed" mb="xs">
            • Categories & Items (Coming Soon) - Organize your packing items
          </Text>
          <Text size="sm" c="dimmed" mb="xs">
            • Templates (Coming Soon) - Create reusable packing lists
          </Text>
          <Text size="sm" c="dimmed">
            • Packing Lists (Coming Soon) - Plan your trips
          </Text>
        </div>
      </Card>

      <FamilySetupWizard
        opened={showSetupWizard}
        onClose={() => setShowSetupWizard(false)}
        onComplete={(familyData) => {
          console.log('Family created:', familyData);
          setShowSetupWizard(false);
        }}
        userRole={user.role || ''}
      />
    </Container>
  );
}