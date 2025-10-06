// Clean Layout component
import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { AppShell, Text, Button, Group, Container } from '@mantine/core';
import { useImpersonation } from '../contexts/ImpersonationContext';

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
  const navigate = useNavigate();
  const { impersonatingFamilyId, impersonatingFamilyName, stopImpersonation } = useImpersonation();

  const canAccessSystemAdmin = user.role === 'SystemAdmin';
  const canAccessFamilyAdmin = user.role === 'SystemAdmin' || user.role === 'FamilyAdmin';

  const linkStyle = (path: string) => ({
    textDecoration: 'none',
    color: location.pathname === path ? 'var(--mantine-color-blue-6)' : 'inherit',
    display: 'block',
    padding: '8px 12px',
    borderRadius: '4px',
    marginBottom: '4px',
    backgroundColor: location.pathname === path ? 'var(--mantine-color-blue-0)' : 'transparent',
  });

  return (
    <AppShell
      navbar={{ width: 250, breakpoint: 'sm' }}
      header={{ height: 60 }}
      padding="md"
    >
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <div>
            <Text size="xl" fw={500}>Travel List</Text>
          </div>
          <Group>
            <Text size="sm">Welcome, {user.username}</Text>
            <Text size="xs" c="dimmed">({user.role})</Text>
            <Button variant="light" size="xs" onClick={onLogout}>Logout</Button>
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="md">
        <Link to="/" style={linkStyle('/')}>
          Dashboard
        </Link>

        {canAccessSystemAdmin && (
          <Link to="/admin/system" style={linkStyle('/admin/system')}>
            System Administration
          </Link>
        )}

        {canAccessFamilyAdmin && (
          <Link to="/admin/family" style={linkStyle('/admin/family')}>
            Family Administration
          </Link>
        )}

        <Link to="/packing-lists" style={linkStyle('/packing-lists')}>
          Packing Lists
        </Link>

        <Link to="/categories" style={linkStyle('/categories')}>
          Manage Categories
        </Link>

        <Link to="/items" style={linkStyle('/items')}>
          Manage Items
        </Link>

        <Link to="/templates" style={linkStyle('/templates')}>
          Manage Templates
        </Link>
      </AppShell.Navbar>

      <AppShell.Main>
        {impersonatingFamilyId && (
          <Container fluid style={{ backgroundColor: '#e6f6ff', padding: '8px 12px', borderRadius: 6, marginBottom: 12 }}>
            <Group style={{ justifyContent: 'space-between' }}>
              <Text fw={600} color="blue">Viewing as family: {impersonatingFamilyName || impersonatingFamilyId}</Text>
              <Group>
                <Button size="xs" variant="light" color="blue" onClick={() => { stopImpersonation(); navigate('/admin/system'); }}>
                  End Impersonation
                </Button>
              </Group>
            </Group>
          </Container>
        )}

        {children}
      </AppShell.Main>
    </AppShell>
  );
}