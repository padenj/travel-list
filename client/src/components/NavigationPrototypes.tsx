import React, { useState } from 'react';
import {
  AppShell,
  Container,
  Text,
  Group,
  Stack,
  Button,
  Drawer,
  Burger,
  Divider,
  ActionIcon,
  Paper,
  Box,
  UnstyledButton,
  Collapse,
  Avatar,
} from '@mantine/core';
import {
  IconHome,
  IconList,
  IconCategory,
  IconTemplate,
  IconSettings,
  IconArrowLeft,
  IconMenu2,
  IconX,
  IconChevronRight,
  IconUser,
  IconShield,
  IconUsers,
} from '@tabler/icons-react';

interface PrototypeProps {
  title: string;
  children: React.ReactNode;
}

function PrototypeContainer({ title, children }: PrototypeProps) {
  return (
    <Paper shadow="md" radius="md" p="md" mb="xl">
      <Text size="lg" fw={600} mb="md" c="blue">
        {title}
      </Text>
      <Box style={{ height: '400px', border: '1px solid #e9ecef', borderRadius: '8px', overflow: 'hidden' }}>
        {children}
      </Box>
    </Paper>
  );
}

// Option 1: Contextual Navigation
function ContextualNavPrototype() {
  const [mobileOpened, setMobileOpened] = useState(false);
  const [isSettings, setIsSettings] = useState(false);

  const mainNavItems = [
    { icon: IconHome, label: 'Dashboard', path: '/' },
    { icon: IconList, label: 'Packing Lists', path: '/packing-lists' },
    { icon: IconCategory, label: 'Categories', path: '/categories' },
    { icon: IconTemplate, label: 'Templates', path: '/templates' },
  ];

  const settingsNavItems = [
    { icon: IconUser, label: 'Profile', path: '/settings/profile' },
    { icon: IconUsers, label: 'Family', path: '/settings/family' },
    { icon: IconShield, label: 'Security', path: '/settings/security' },
  ];

  const NavContent = () => (
    <Stack gap="xs" style={{ height: '100%' }}>
      {isSettings && (
        <UnstyledButton
          onClick={() => setIsSettings(false)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 12px',
            borderRadius: '4px',
            color: '#666',
            marginBottom: '8px',
          }}
        >
          <IconArrowLeft size={16} />
          <Text size="sm">Back to Main</Text>
        </UnstyledButton>
      )}
      
      <Text size="xs" fw={600} tt="uppercase" c="dimmed" mb="xs">
        {isSettings ? 'Settings' : 'Main Navigation'}
      </Text>
      
      <div style={{ flex: 1 }}>
        {(isSettings ? settingsNavItems : mainNavItems).map((item) => (
          <UnstyledButton
            key={item.path}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '10px 12px',
              borderRadius: '6px',
              width: '100%',
              marginBottom: '2px',
              backgroundColor: item.path === '/settings/profile' && isSettings ? '#e7f5ff' : 'transparent',
              color: item.path === '/settings/profile' && isSettings ? '#1971c2' : 'inherit',
            }}
          >
            <item.icon size={18} />
            <Text size="sm">{item.label}</Text>
          </UnstyledButton>
        ))}
      </div>
      
      {!isSettings && (
        <div style={{ marginTop: 'auto' }}>
          <Divider mb="xs" />
          <UnstyledButton
            onClick={() => setIsSettings(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '10px 12px',
              borderRadius: '6px',
              width: '100%',
            }}
          >
            <IconSettings size={18} />
            <Text size="sm">Settings</Text>
          </UnstyledButton>
        </div>
      )}
    </Stack>
  );

  return (
    <AppShell
      navbar={{ width: 250, breakpoint: 'sm', collapsed: { mobile: !mobileOpened } }}
      header={{ height: 50 }}
      padding={0}
      style={{ height: '100%' }}
    >
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Group>
            <Burger opened={mobileOpened} onClick={() => setMobileOpened(!mobileOpened)} hiddenFrom="sm" size="sm" />
            <Text fw={600}>Travel List</Text>
          </Group>
          <Avatar size="sm" color="blue">JD</Avatar>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="md">
        <NavContent />
      </AppShell.Navbar>

      <AppShell.Main>
        <Container p="md">
          <Text size="xl" fw={600} mb="md">
            {isSettings ? 'Settings Area' : 'Main Application'}
          </Text>
          <Text c="dimmed">
            {isSettings 
              ? 'This feels like a completely separate settings app. Navigation is contextual.' 
              : 'Main app with standard navigation. Settings is tucked away at bottom.'}
          </Text>
        </Container>
      </AppShell.Main>
    </AppShell>
  );
}

// Option 2: Nested Sidebar
function NestedSidebarPrototype() {
  const [mobileOpened, setMobileOpened] = useState(false);
  const [settingsExpanded, setSettingsExpanded] = useState(false);

  return (
    <AppShell
      navbar={{ width: 280, breakpoint: 'sm', collapsed: { mobile: !mobileOpened } }}
      header={{ height: 50 }}
      padding={0}
      style={{ height: '100%' }}
    >
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Group>
            <Burger opened={mobileOpened} onClick={() => setMobileOpened(!mobileOpened)} hiddenFrom="sm" size="sm" />
            <Text fw={600}>Travel List</Text>
          </Group>
          <Avatar size="sm" color="blue">JD</Avatar>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="md">
        <Stack gap="xs" style={{ height: '100%' }}>
          <Text size="xs" fw={600} tt="uppercase" c="dimmed" mb="xs">Main</Text>
          
          {[
            { icon: IconHome, label: 'Dashboard' },
            { icon: IconList, label: 'Packing Lists' },
            { icon: IconCategory, label: 'Categories' },
            { icon: IconTemplate, label: 'Templates' },
          ].map((item) => (
            <UnstyledButton
              key={item.label}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '8px 12px',
                borderRadius: '4px',
                width: '100%',
              }}
            >
              <item.icon size={16} />
              <Text size="sm">{item.label}</Text>
            </UnstyledButton>
          ))}

          <Divider my="md" />
          
          <UnstyledButton
            onClick={() => setSettingsExpanded(!settingsExpanded)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 12px',
              borderRadius: '4px',
              width: '100%',
              backgroundColor: settingsExpanded ? '#f8f9fa' : 'transparent',
            }}
          >
            <IconSettings size={16} />
            <Text size="sm" style={{ flex: 1 }}>Settings</Text>
            <IconChevronRight 
              size={14} 
              style={{ 
                transform: settingsExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                transition: 'transform 0.2s ease'
              }} 
            />
          </UnstyledButton>

          <Collapse in={settingsExpanded}>
            <Stack gap="xs" ml="md" mt="xs">
              {[
                { icon: IconUser, label: 'Profile' },
                { icon: IconUsers, label: 'Family' },
                { icon: IconShield, label: 'Security' },
              ].map((item) => (
                <UnstyledButton
                  key={item.label}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '6px 8px',
                    borderRadius: '4px',
                    fontSize: '14px',
                    color: '#666',
                    backgroundColor: item.label === 'Profile' ? '#e7f5ff' : 'transparent',
                  }}
                >
                  <item.icon size={14} />
                  <Text size="xs">{item.label}</Text>
                </UnstyledButton>
              ))}
            </Stack>
          </Collapse>
        </Stack>
      </AppShell.Navbar>

      <AppShell.Main>
        <Container p="md">
          <Text size="xl" fw={600} mb="md">Nested Navigation</Text>
          <Text c="dimmed">
            Settings are nested under main navigation. Clear hierarchy with expandable sections.
          </Text>
        </Container>
      </AppShell.Main>
    </AppShell>
  );
}

// Option 3: App Drawer + Top Tab Bar
function AppDrawerPrototype() {
  const [drawerOpened, setDrawerOpened] = useState(false);
  const [isSettings, setIsSettings] = useState(false);

  return (
    <div style={{ height: '100%', position: 'relative' }}>
      {/* Header */}
      <Paper shadow="sm" p="md" style={{ borderBottom: '1px solid #e9ecef' }}>
        <Group justify="space-between">
          <Group>
            <ActionIcon variant="subtle" onClick={() => setDrawerOpened(true)}>
              <IconMenu2 size={18} />
            </ActionIcon>
            <Text fw={600}>Travel List</Text>
          </Group>
          <Avatar size="sm" color="blue">JD</Avatar>
        </Group>
      </Paper>

      {/* Settings Tab Bar */}
      {isSettings && (
        <Paper p="sm" style={{ borderBottom: '1px solid #e9ecef', backgroundColor: '#f8f9fa' }}>
          <Group justify="space-between" mb="xs">
            <Text fw={600} size="sm">Settings</Text>
            <ActionIcon size="sm" variant="subtle" onClick={() => setIsSettings(false)}>
              <IconX size={14} />
            </ActionIcon>
          </Group>
          <Group gap="md">
            {['Profile', 'Family', 'Security'].map((tab) => (
              <Button
                key={tab}
                variant={tab === 'Profile' ? 'filled' : 'subtle'}
                size="xs"
              >
                {tab}
              </Button>
            ))}
          </Group>
        </Paper>
      )}

      {/* Main Content */}
      <Container p="md" style={{ height: 'calc(100% - 120px)' }}>
        <Text size="xl" fw={600} mb="md">
          {isSettings ? 'Settings Mode' : 'Main App'}
        </Text>
        <Text c="dimmed">
          {isSettings 
            ? 'Settings mode with top tab bar. Feels like a modal overlay experience.'
            : 'Main app content. Drawer slides up from bottom on mobile.'}
        </Text>
      </Container>

      {/* Bottom Drawer */}
      <Drawer
        opened={drawerOpened}
        onClose={() => setDrawerOpened(false)}
        position="bottom"
        size="70%"
        radius="md"
        title="Navigation"
      >
        <Stack gap="md">
          <div>
            <Text size="sm" fw={600} mb="sm" c="dimmed">MAIN AREAS</Text>
            <Stack gap="xs">
              {[
                { icon: IconHome, label: 'Dashboard' },
                { icon: IconList, label: 'Packing Lists' },
                { icon: IconCategory, label: 'Categories' },
                { icon: IconTemplate, label: 'Templates' },
              ].map((item) => (
                <UnstyledButton
                  key={item.label}
                  onClick={() => setDrawerOpened(false)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '12px',
                    borderRadius: '8px',
                    border: '1px solid #e9ecef',
                  }}
                >
                  <item.icon size={20} />
                  <Text>{item.label}</Text>
                </UnstyledButton>
              ))}
            </Stack>
          </div>

          <Divider />

          <UnstyledButton
            onClick={() => {
              setIsSettings(true);
              setDrawerOpened(false);
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '12px',
              borderRadius: '8px',
              border: '2px solid #e7f5ff',
              backgroundColor: '#f8f9fa',
            }}
          >
            <IconSettings size={20} />
            <Text fw={500}>Settings</Text>
          </UnstyledButton>
        </Stack>
      </Drawer>
    </div>
  );
}

// Option 4: Split Rail Navigation
function SplitRailPrototype() {
  const [expandedRail, setExpandedRail] = useState(false);
  const [activeSection, setActiveSection] = useState('dashboard');

  const railItems = [
    { id: 'dashboard', icon: IconHome, label: 'Dashboard' },
    { id: 'lists', icon: IconList, label: 'Lists' },
    { id: 'categories', icon: IconCategory, label: 'Categories' },
    { id: 'templates', icon: IconTemplate, label: 'Templates' },
    { id: 'settings', icon: IconSettings, label: 'Settings' },
  ];

  return (
    <div style={{ height: '100%', display: 'flex' }}>
      {/* Icon Rail */}
      <Paper
        shadow="sm"
        style={{
          width: expandedRail ? '200px' : '60px',
          transition: 'width 0.3s ease',
          borderRight: '1px solid #e9ecef',
          display: 'flex',
          flexDirection: 'column',
        }}
        onMouseEnter={() => setExpandedRail(true)}
        onMouseLeave={() => setExpandedRail(false)}
      >
        <div style={{ padding: '12px' }}>
          <Text fw={600} size="sm" truncate>
            {expandedRail ? 'Travel List' : 'TL'}
          </Text>
        </div>
        
        <Stack gap="xs" p="xs" style={{ flex: 1 }}>
          {railItems.map((item) => (
            <UnstyledButton
              key={item.id}
              onClick={() => setActiveSection(item.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '10px',
                borderRadius: '6px',
                backgroundColor: activeSection === item.id ? '#e7f5ff' : 'transparent',
                color: activeSection === item.id ? '#1971c2' : 'inherit',
                width: '100%',
                overflow: 'hidden',
              }}
            >
              <item.icon size={18} />
              {expandedRail && <Text size="sm" truncate>{item.label}</Text>}
            </UnstyledButton>
          ))}
        </Stack>
      </Paper>

      {/* Main Content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <Paper p="md" shadow="sm" style={{ borderBottom: '1px solid #e9ecef' }}>
          <Group justify="space-between">
            <Text fw={600} tt="capitalize">{activeSection}</Text>
            <Avatar size="sm" color="blue">JD</Avatar>
          </Group>
        </Paper>

        <Container p="md" style={{ flex: 1 }}>
          {activeSection === 'settings' ? (
            <div>
              <Text size="xl" fw={600} mb="md">Settings Panel</Text>
              <Group gap="md" mb="md">
                {['Profile', 'Family', 'Security'].map((tab) => (
                  <Button key={tab} variant={tab === 'Profile' ? 'filled' : 'outline'} size="sm">
                    {tab}
                  </Button>
                ))}
              </Group>
              <Text c="dimmed">
                Icon rail persists, settings content shows in main area. Clean and space-efficient.
              </Text>
            </div>
          ) : (
            <div>
              <Text size="xl" fw={600} mb="md">Main Content Area</Text>
              <Text c="dimmed">
                Persistent icon rail on left. Hover to expand labels. Very space-efficient on mobile.
              </Text>
            </div>
          )}
        </Container>
      </div>
    </div>
  );
}

export default function NavigationPrototypes() {
  return (
    <Container size="xl" py="xl">
      <Text size="xl" fw={600} mb="xl">Navigation Prototypes</Text>
      
      <PrototypeContainer title="Option 1: Contextual Navigation (Recommended)">
        <ContextualNavPrototype />
      </PrototypeContainer>

      <PrototypeContainer title="Option 2: Nested Sidebar">
        <NestedSidebarPrototype />
      </PrototypeContainer>

      <PrototypeContainer title="Option 3: App Drawer + Top Tab Bar">
        <AppDrawerPrototype />
      </PrototypeContainer>

      <PrototypeContainer title="Option 4: Split Rail Navigation">
        <SplitRailPrototype />
      </PrototypeContainer>

      <Paper p="md" mt="xl" style={{ backgroundColor: '#f8f9fa' }}>
        <Text fw={600} mb="sm">Quick Comparison:</Text>
        <Stack gap="xs">
          <Text size="sm"><strong>Option 1:</strong> Best mobile experience, clear context separation</Text>
          <Text size="sm"><strong>Option 2:</strong> Familiar nested structure, good for power users</Text>
          <Text size="sm"><strong>Option 3:</strong> Modern mobile-first approach, overlay feel</Text>
          <Text size="sm"><strong>Option 4:</strong> Most space-efficient, VS Code-style</Text>
        </Stack>
      </Paper>
    </Container>
  );
}