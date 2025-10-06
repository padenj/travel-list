import React from 'react';
import { Title, Text, Container, Card, Group } from '@mantine/core';

interface User {
  username?: string;
  token?: string;
  role?: string;
}

interface DashboardProps {
  user: User;
}

export default function Dashboard({ user }: DashboardProps): React.ReactElement {
  // Family setup wizard removed: families are created via System Administration
  

  return (
    <Container size="lg">
      {/* Global impersonation banner is displayed in Layout; no local banner needed here */}
      <Group justify="space-between" mb="xl">
        <Title order={1}>Dashboard</Title>
        {/* System Administration button removed per request */}
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
            • Manage Categories - Organize your packing categories
          </Text>
          <Text size="sm" c="dimmed" mb="xs">
            • Manage Items - Create and organize packing items
          </Text>
          <Text size="sm" c="dimmed" mb="xs">
            • Manage Templates - Create reusable packing lists
          </Text>
          <Text size="sm" c="dimmed">
            • Packing Lists - Plan your trips
          </Text>
        </div>
      </Card>

      {/* FamilySetupWizard removed. Family creation is handled via System Administration. */}

      {/* Impersonation handled by global banner in Layout; dashboard focuses on core content */}
    </Container>
  );
}