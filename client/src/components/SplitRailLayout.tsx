import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { 
  Text, 
  Group, 
  Container, 
  Avatar, 
  Menu, 
  UnstyledButton, 
  Divider, 
  Button,
  Paper,
  Stack,
  ActionIcon,
  Burger,
  Drawer
} from '@mantine/core';
import { useDisclosure, useMediaQuery } from '@mantine/hooks';
import {
  IconHome,
  IconList,
  IconCategory,
  IconTemplate,
  IconSettings,
  IconX,
  IconUser,
  IconUsers,
  IconShield,
} from '@tabler/icons-react';
import { useImpersonation } from '../contexts/ImpersonationContext';
import VersionText from './VersionText';
import ServiceWorkerStatus from './ServiceWorkerStatus';
import GlobalListEditDrawer from './GlobalListEditDrawer';
import { ListEditDrawerProvider } from '../contexts/ListEditDrawerContext';

interface User {
  username?: string;
  token?: string;
  role?: string;
}

interface SplitRailLayoutProps {
  children: React.ReactNode;
  user: User;
  onLogout: () => void;
}

const railItems = [
  { id: 'dashboard', icon: IconHome, label: 'Dashboard', path: '/' },
  { id: 'lists', icon: IconList, label: 'Packing Lists', path: '/packing-lists' },
  { id: 'categories', icon: IconCategory, label: 'Categories', path: '/categories' },
  { id: 'templates', icon: IconTemplate, label: 'Item Groups', path: '/templates' },
  { id: 'settings', icon: IconSettings, label: 'Settings', path: '/settings' },
];

const settingsTabs = [
  { id: 'profile', label: 'Profile', icon: IconUser, path: '/settings/profile' },
  { id: 'family', label: 'Family', icon: IconUsers, path: '/settings/family' },
  { id: 'security', label: 'Security', icon: IconShield, path: '/settings/security' },
];

export default function SplitRailLayout({ children, user, onLogout }: SplitRailLayoutProps): React.ReactElement {
  const location = useLocation();
  const navigate = useNavigate();
  const { impersonatingFamilyId, impersonatingFamilyName, stopImpersonation } = useImpersonation();
  
  const [mobileDrawerOpened, { open: openMobileDrawer, close: closeMobileDrawer }] = useDisclosure(false);
  const [isRailExpanded, setIsRailExpanded] = useState(false);
  
  // Media queries for responsive behavior
  const isDesktop = useMediaQuery('(min-width: 1024px)');
  const isTablet = useMediaQuery('(min-width: 768px) and (max-width: 1023px)');
  const isMobile = useMediaQuery('(max-width: 767px)');
  
  // Settings context detection
  const isSettingsContext = location.pathname.startsWith('/settings');
  
  // Rail expansion logic
  useEffect(() => {
    if (isDesktop) {
      setIsRailExpanded(true); // Expanded by default on desktop
    } else if (isTablet) {
      setIsRailExpanded(false); // Collapsed by default on tablet
    }
  }, [isDesktop, isTablet]);

  const canAccessSystemAdmin = user.role === 'SystemAdmin';
  const canAccessFamilyAdmin = user.role === 'SystemAdmin' || user.role === 'FamilyAdmin';

  function getInitials(name?: string | null): string {
    if (!name) return '?';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  function getActiveRailItem(): string {
    if (isSettingsContext) return 'settings';
    const path = location.pathname;
    if (path === '/') return 'dashboard';
    if (path.startsWith('/packing-lists')) return 'lists';
    if (path.startsWith('/categories')) return 'categories';
    if (path.startsWith('/templates')) return 'templates';
    return 'dashboard';
  }

  function getActiveSettingsTab(): string {
    const path = location.pathname;
    if (path.startsWith('/settings/profile')) return 'profile';
    if (path.startsWith('/settings/family')) return 'family';
    if (path.startsWith('/settings/security')) return 'security';
    return 'profile';
  }

  const activeRailItem = getActiveRailItem();
  const activeSettingsTab = getActiveSettingsTab();

  // Mobile Navigation Drawer Content
  const MobileNavContent = () => (
    <Stack gap="md">
      <Group justify="space-between">
        <Text fw={600}>Navigation</Text>
        <ActionIcon variant="subtle" onClick={closeMobileDrawer}>
          <IconX size={18} />
        </ActionIcon>
      </Group>
      
      <Divider />
      
      <Stack gap="xs">
        {railItems.filter(item => item.id !== 'settings').map((item) => (
          <UnstyledButton
            key={item.id}
            component={Link}
            to={item.path}
            onClick={closeMobileDrawer}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '12px',
              borderRadius: '8px',
              backgroundColor: activeRailItem === item.id ? '#e7f5ff' : 'transparent',
              color: activeRailItem === item.id ? '#1971c2' : 'inherit',
              border: '1px solid #e9ecef',
            }}
          >
            <item.icon size={20} />
            <Text>{item.label}</Text>
          </UnstyledButton>
        ))}
      </Stack>

      {canAccessFamilyAdmin && (
        <>
          <Divider />
          <UnstyledButton
            component={Link}
            to="/settings/profile"
            onClick={closeMobileDrawer}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '12px',
              borderRadius: '8px',
              backgroundColor: isSettingsContext ? '#e7f5ff' : 'transparent',
              color: isSettingsContext ? '#1971c2' : 'inherit',
              border: '2px solid #e7f5ff',
            }}
          >
            <IconSettings size={20} />
            <Text fw={500}>Settings</Text>
          </UnstyledButton>
        </>
      )}
    </Stack>
  );

  // Desktop Rail Content
  const RailContent = () => (
    <Stack gap="xs" style={{ height: '100%' }}>
      <div style={{ padding: isRailExpanded ? '12px' : '8px', textAlign: 'center' }}>
        <Text fw={600} size={isRailExpanded ? 'sm' : 'xs'} truncate>
          {isRailExpanded ? 'Travel List' : 'TL'}
        </Text>
      </div>
      
      <Divider />
      
      <div style={{ flex: 1, padding: '8px' }}>
        {railItems.map((item) => {
          const isActive = activeRailItem === item.id;
          const isSettingsItem = item.id === 'settings';
          
          // Don't show settings if user doesn't have access
          if (isSettingsItem && !canAccessFamilyAdmin) {
            return null;
          }
          
          return (
            <UnstyledButton
              key={item.id}
              component={Link}
              to={item.path}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '10px',
                borderRadius: '6px',
                backgroundColor: isActive ? '#e7f5ff' : 'transparent',
                color: isActive ? '#1971c2' : 'inherit',
                width: '100%',
                marginBottom: '4px',
                overflow: 'hidden',
                justifyContent: isRailExpanded ? 'flex-start' : 'center',
              }}
            >
              <item.icon size={18} />
              {isRailExpanded && <Text size="sm" truncate>{item.label}</Text>}
            </UnstyledButton>
          );
        })}
      </div>
    </Stack>
  );

  // Settings Tab Bar
  const SettingsTabBar = () => (
    <Paper p="md" shadow="sm" style={{ borderBottom: '1px solid #e9ecef', backgroundColor: '#f8f9fa' }}>
      <Group justify="space-between" mb="sm">
        <Group>
          <Text fw={600}>Settings</Text>
          <ActionIcon 
            size="sm" 
            variant="subtle" 
            component={Link}
            to="/"
            title="Back to Dashboard"
          >
            <IconX size={14} />
          </ActionIcon>
        </Group>
        <Group>
          <Text size="sm" c="dimmed">User: {user.username}</Text>
        </Group>
      </Group>
      
      <Group gap="sm">
        {settingsTabs.map((tab) => (
          <Button
            key={tab.id}
            component={Link}
            to={tab.path}
            variant={activeSettingsTab === tab.id ? 'filled' : 'light'}
            size="sm"
            leftSection={<tab.icon size={16} />}
          >
            {tab.label}
          </Button>
        ))}
      </Group>
    </Paper>
  );

  if (isMobile) {
    // Mobile Layout: Full-width with drawer
    return (
      <ListEditDrawerProvider>
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
        {/* Mobile Header */}
        <Paper shadow="sm" p="md" style={{ borderBottom: '1px solid #e9ecef' }}>
          <Group justify="space-between">
            <Group>
              <Burger opened={mobileDrawerOpened} onClick={openMobileDrawer} size="sm" />
              <Text fw={600}>Travel List</Text>
            </Group>
            
            {/* Right-side controls: profile menu (SW/version moved into mobile drawer) */}
            <Group spacing="xs">
              <Menu position="bottom-end">
                <Menu.Target>
                  <UnstyledButton>
                    <Avatar color="blue" radius="xl" size="sm">
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
                    <Menu.Item component={Link} to="/settings/profile">Settings</Menu.Item>
                  )}
                  {canAccessSystemAdmin && (
                    <Menu.Item component={Link} to="/admin/system">System Admin</Menu.Item>
                  )}
                  <Menu.Item color="red" onClick={onLogout}>Logout</Menu.Item>
                </Menu.Dropdown>
              </Menu>
            </Group>
          </Group>
        </Paper>

        {/* Settings Tab Bar for Mobile */}
        {isSettingsContext && <SettingsTabBar />}

        {/* Main Content */}
        <div style={{ flex: 1, overflow: 'auto' }}>
          {impersonatingFamilyId && (
            <Container fluid style={{ backgroundColor: '#e6f6ff', padding: '8px 12px', marginBottom: 12 }}>
              <Group justify="space-between">
                <Text fw={600} color="blue" size="sm">Viewing as family: {impersonatingFamilyName || impersonatingFamilyId}</Text>
                <Button size="xs" variant="light" color="blue" onClick={() => { stopImpersonation(); navigate('/admin/system'); }}>
                  End
                </Button>
              </Group>
            </Container>
          )}
          
          <div style={{ padding: '16px' }}>
            {children}
          </div>
        </div>

        {/* Mobile Navigation Drawer */}
        <Drawer
          opened={mobileDrawerOpened}
          onClose={closeMobileDrawer}
          position="left"
          size="280px"
          title=""
          padding="md"
        >
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <div style={{ flex: '1 1 auto', overflow: 'auto' }}>
              <MobileNavContent />
            </div>
            <div style={{ borderTop: '1px solid #e9ecef', paddingTop: 12, paddingBottom: 8, display: 'flex', justifyContent: 'center', gap: 12, alignItems: 'center' }}>
              <ServiceWorkerStatus compact={false} />
              <Text size="xs" color="dimmed">v<VersionText /></Text>
            </div>
          </div>
        </Drawer>
        <GlobalListEditDrawer />
      </div>
    </ListEditDrawerProvider>
    );
  }

  // Desktop/Tablet Layout: Split Rail
  const railWidth = isRailExpanded ? 200 : 60;
  
  return (
    <ListEditDrawerProvider>
    <div style={{ height: '100vh', display: 'flex' }}>
      {/* Icon Rail */}
      <Paper
        shadow="sm"
        style={{
          width: railWidth,
          transition: 'width 0.3s ease',
          borderRight: '1px solid #e9ecef',
          display: 'flex',
          flexDirection: 'column',
          zIndex: 100,
        }}
        onMouseEnter={() => !isDesktop && setIsRailExpanded(true)}
        onMouseLeave={() => !isDesktop && setIsRailExpanded(false)}
      >
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <RailContent />
          <div style={{ marginTop: 'auto', padding: isRailExpanded ? '12px' : '8px' }}>
            <div style={{ marginBottom: 8 }}>
              <ServiceWorkerStatus compact={!isRailExpanded} />
            </div>
            <Text size="xs" color="dimmed">Version: <VersionText /></Text>
          </div>
        </div>
      </Paper>

      {/* Main Content Area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Top Header */}
        <Paper p="md" shadow="sm" style={{ borderBottom: '1px solid #e9ecef' }}>
          <Group justify="space-between">
            <Text fw={600} tt="capitalize">
              {isSettingsContext ? 'Settings' : railItems.find(item => item.id === activeRailItem)?.label || 'Dashboard'}
            </Text>
            
            {/* Profile menu */}
            <Menu position="bottom-end">
              <Menu.Target>
                <UnstyledButton>
                  <Avatar color="blue" radius="xl" size="sm">
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
                  <Menu.Item component={Link} to="/settings/profile">Settings</Menu.Item>
                )}
                {canAccessSystemAdmin && (
                  <Menu.Item component={Link} to="/admin/system">System Admin</Menu.Item>
                )}
                <Menu.Item color="red" onClick={onLogout}>Logout</Menu.Item>
              </Menu.Dropdown>
            </Menu>
          </Group>
          <div style={{ marginTop: 6 }}>
            <Text size="xs" color="dimmed">Version: <VersionText /></Text>
          </div>
        </Paper>

        {/* Settings Tab Bar for Desktop */}
        {isSettingsContext && <SettingsTabBar />}

        {/* Main Content */}
        <div style={{ flex: 1, overflow: 'auto' }}>
          {impersonatingFamilyId && (
            <Container fluid style={{ backgroundColor: '#e6f6ff', padding: '8px 12px', marginBottom: 12 }}>
              <Group justify="space-between">
                <Text fw={600} color="blue">Viewing as family: {impersonatingFamilyName || impersonatingFamilyId}</Text>
                <Button size="xs" variant="light" color="blue" onClick={() => { stopImpersonation(); navigate('/admin/system'); }}>
                  End Impersonation
                </Button>
              </Group>
            </Container>
          )}
          
          <Container size="xl" p="md">
            {children}
          </Container>
          <GlobalListEditDrawer />
        </div>
      </div>
    </div>
    </ListEditDrawerProvider>
  );
}