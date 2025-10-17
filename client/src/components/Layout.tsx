// Clean Layout component
import React, { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { AppShell, Text, Group, Container, Avatar, Menu, UnstyledButton, Divider, Button } from '@mantine/core';
import { IconSettings } from '@tabler/icons-react';
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

function VersionText(): React.ReactElement {
  const [version, setVersion] = useState<string | null>(null);
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await fetch('/api/build-info');
        if (!res.ok) return;
        const body = await res.json();
        if (mounted && body && body.build && body.build.version) setVersion(body.build.version);
      } catch (e) {
        // ignore
      }
    })();
    return () => { mounted = false; };
  }, []);
  return <span>{version || 'dev'}</span>;
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

  const isSettingsContext = location.pathname.startsWith('/settings');

  function getInitials(name?: string | null): string {
    if (!name) return '?';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

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
            {/* Profile menu: show initials avatar as menu target */}
            <Menu withinPortal position="bottom-end">
              <Menu.Target>
                <UnstyledButton>
                  <Avatar color="blue" radius="xl">
                    {getInitials(user.username)}
                  </Avatar>
                </UnstyledButton>
              </Menu.Target>

              <Menu.Dropdown>
                <Menu.Label>
                  <Text fw={600}>{user.username}</Text>
                </Menu.Label>
                <Divider />
                {canAccessFamilyAdmin && (
                  <Menu.Item onClick={() => navigate('/settings')}>Settings</Menu.Item>
                )}
                {canAccessSystemAdmin && (
                  <Menu.Item onClick={() => navigate('/admin/system')}>System Admin</Menu.Item>
                )}
                <Menu.Item color="red" onClick={onLogout}>Logout</Menu.Item>
                {/* Version info fetched from the running backend (baked into image at build time) */}
                <Menu.Label>
                  <Text size="xs" color="dimmed">Version: <VersionText /></Text>
                </Menu.Label>
              </Menu.Dropdown>
            </Menu>
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="md">
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <div>
            {isSettingsContext ? (
              // Show settings-oriented navigation instead of primary app nav
              <div>
                <Link to="/settings/profile" style={linkStyle('/settings/profile')}>Profile</Link>
                <Link to="/settings/family" style={linkStyle('/settings/family')}>Family</Link>
                <Link to="/settings/security" style={linkStyle('/settings/security')}>Security</Link>
              </div>
            ) : (
              // Default primary navigation
              <div>
                <Link to="/" style={linkStyle('/')}> 
                  Dashboard
                </Link>

                {/* System Administration remains available from the profile menu */}

                <Link to="/packing-lists" style={linkStyle('/packing-lists')}>
                  Packing Lists
                </Link>

                <Link to="/categories" style={linkStyle('/categories')}>
                  Manage Categories
                </Link>

                {/* Manage Items page removed - item management now via Categories */}

                <Link to="/templates" style={linkStyle('/templates')}>
                  Manage Templates
                </Link>
              </div>
            )}
          </div>

          <div style={{ marginTop: 'auto' }}>
            <Divider />
            <div style={{ marginTop: 8 }}>
              <Link to="/settings" style={linkStyle('/settings')}>
                <Group gap="xs" align="center">
                  <IconSettings size={16} />
                  <span>Settings</span>
                </Group>
              </Link>
            </div>
          </div>
        </div>
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