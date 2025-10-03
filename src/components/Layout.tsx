import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { AppShell, Text, Button, Group } from '@mantine/core';

interface User {
  username?: string;
  token?: string;
  role?: string;
}

interface LayoutProps {
  children: React.ReactNode;
  user: User;
  onLogout: () => void;
}

export default function Layout({ children, user, onLogout }: LayoutProps): React.ReactElement {
  const location = useLocation();

  const canAccessSystemAdmin = user.role === 'SystemAdmin';
  const canAccessFamilyAdmin = user.role === 'SystemAdmin' || user.role === 'FamilyAdmin';

  return (
    <AppShell
      navbar={{
        width: 250,
        breakpoint: 'sm',
      }}
      header={{ height: 60 }}
      padding="md"
    >
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Text size="xl" fw={500}>Travel List</Text>
          <Group>
            <Text size="sm">Welcome, {user.username}</Text>
            <Text size="xs" c="dimmed">({user.role})</Text>
            <Button variant="light" size="xs" onClick={onLogout}>
              Logout
            </Button>
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="md">
        <Link 
          to="/" 
          style={{ 
            textDecoration: 'none', 
            color: location.pathname === '/' ? 'var(--mantine-color-blue-6)' : 'inherit',
            display: 'block',
            padding: '8px 12px',
            borderRadius: '4px',
            marginBottom: '4px',
            backgroundColor: location.pathname === '/' ? 'var(--mantine-color-blue-0)' : 'transparent'
          }}
        >
          Dashboard
        </Link>

        {canAccessSystemAdmin && (
          <Link 
            to="/admin/system" 
            style={{ 
              textDecoration: 'none',
              color: location.pathname === '/admin/system' ? 'var(--mantine-color-blue-6)' : 'inherit',
              display: 'block',
              padding: '8px 12px',
              borderRadius: '4px',
              marginBottom: '4px',
              backgroundColor: location.pathname === '/admin/system' ? 'var(--mantine-color-blue-0)' : 'transparent'
            }}
          >
            System Administration
          </Link>
        )}

        {canAccessFamilyAdmin && (
          <Link 
            to="/admin/family" 
            style={{ 
              textDecoration: 'none',
              color: location.pathname === '/admin/family' ? 'var(--mantine-color-blue-6)' : 'inherit',
              display: 'block',
              padding: '8px 12px',
              borderRadius: '4px',
              marginBottom: '4px',
              backgroundColor: location.pathname === '/admin/family' ? 'var(--mantine-color-blue-0)' : 'transparent'
            }}
          >
           Family Administration
          </Link>
        )}

        <Link 
          to="/packing-lists" 
          style={{ 
            textDecoration: 'none',
            color: location.pathname === '/packing-lists' ? 'var(--mantine-color-blue-6)' : 'inherit',
            display: 'block',
            padding: '8px 12px',
            borderRadius: '4px',
            marginBottom: '4px',
            backgroundColor: location.pathname === '/packing-lists' ? 'var(--mantine-color-blue-0)' : 'transparent'
          }}
        >
          Packing Lists
        </Link>

        <Link 
          to="/categories" 
          style={{ 
            textDecoration: 'none',
            color: location.pathname === '/categories' ? 'var(--mantine-color-blue-6)' : 'inherit',
            display: 'block',
            padding: '8px 12px',
            borderRadius: '4px',
            marginBottom: '4px',
            backgroundColor: location.pathname === '/categories' ? 'var(--mantine-color-blue-0)' : 'transparent'
          }}
        >
          Manage Categories
        </Link>

        <Link 
          to="/items" 
          style={{ 
            textDecoration: 'none',
            color: location.pathname === '/items' ? 'var(--mantine-color-blue-6)' : 'inherit',
            display: 'block',
            padding: '8px 12px',
            borderRadius: '4px',
            marginBottom: '4px',
            backgroundColor: location.pathname === '/items' ? 'var(--mantine-color-blue-0)' : 'transparent'
          }}
        >
          Manage Items
        </Link>
      </AppShell.Navbar>

      <AppShell.Main>
        {children}
      </AppShell.Main>
    </AppShell>
  );
}