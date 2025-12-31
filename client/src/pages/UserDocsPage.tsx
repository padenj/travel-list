import React, { useState, useEffect, useRef } from 'react';
import { 
  Container, 
  Title, 
  Text, 
  Paper, 
  TextInput,
  Stack,
  Anchor,
  Box,
  Divider,
  ActionIcon,
  Drawer,
  UnstyledButton,
  Group
} from '@mantine/core';
import { useDisclosure, useMediaQuery } from '@mantine/hooks';
import { IconSearch, IconMenu2, IconX } from '@tabler/icons-react';
import Fuse from 'fuse.js';

interface DocSection {
  id: string;
  title: string;
  content: React.ReactNode;
}

const docSections: DocSection[] = [
  {
    id: 'getting-started',
    title: 'Getting Started',
    content: (
      <>
        <Text mb="md">
          Welcome to Travel List! This guide will help you organize your packing for trips with your family.
        </Text>
        <Text mb="md">
          Travel List helps you create, manage, and share packing lists for your trips. You can organize items by categories, create reusable item groups, and collaborate with family members.
        </Text>
        <Box mb="lg" style={{ backgroundColor: '#f8f9fa', padding: '24px', borderRadius: '8px', textAlign: 'center' }}>
          <svg width="100%" height="200" viewBox="0 0 800 200" style={{ maxWidth: '600px', margin: '0 auto' }}>
            <rect width="800" height="200" fill="#e9ecef" rx="8"/>
            <text x="400" y="100" textAnchor="middle" fill="#495057" fontSize="16" fontFamily="sans-serif">
              [Screenshot: Dashboard showing trip overview with upcoming trips]
            </text>
            <text x="400" y="125" textAnchor="middle" fill="#868e96" fontSize="12" fontFamily="sans-serif">
              Your dashboard displays all active packing lists and quick actions
            </text>
          </svg>
        </Box>
      </>
    )
  },
  {
    id: 'creating-packing-lists',
    title: 'Creating Packing Lists',
    content: (
      <>
        <Text mb="md">
          Create a new packing list for each trip to organize what you need to bring.
        </Text>
        <Title order={4} mb="sm">Steps to create a packing list:</Title>
        <Stack gap="sm" mb="lg">
          <Text>1. Navigate to "Packing Lists" from the main menu</Text>
          <Text>2. Click the "Create New List" button</Text>
          <Text>3. Enter a name for your trip (e.g., "Summer Vacation 2024")</Text>
          <Text>4. Optionally set a trip date to help you stay organized</Text>
          <Text>5. Click "Save" to create your list</Text>
        </Stack>
        <Box mb="lg" style={{ backgroundColor: '#f8f9fa', padding: '24px', borderRadius: '8px', textAlign: 'center' }}>
          <svg width="100%" height="200" viewBox="0 0 800 200" style={{ maxWidth: '600px', margin: '0 auto' }}>
            <rect width="800" height="200" fill="#e9ecef" rx="8"/>
            <text x="400" y="90" textAnchor="middle" fill="#495057" fontSize="16" fontFamily="sans-serif">
              [Screenshot: Create Packing List dialog]
            </text>
            <text x="400" y="115" textAnchor="middle" fill="#868e96" fontSize="12" fontFamily="sans-serif">
              Dialog showing name field, date picker, and save button
            </text>
          </svg>
        </Box>
      </>
    )
  },
  {
    id: 'adding-items',
    title: 'Adding Items to Lists',
    content: (
      <>
        <Text mb="md">
          Once you've created a packing list, you can add items in several ways.
        </Text>
        <Title order={4} mb="sm">Method 1: Add individual items</Title>
        <Stack gap="sm" mb="md">
          <Text>1. Open your packing list</Text>
          <Text>2. Click "Add Item"</Text>
          <Text>3. Enter the item name (e.g., "Sunscreen")</Text>
          <Text>4. Select a category (e.g., "Toiletries")</Text>
          <Text>5. Optionally set quantity</Text>
          <Text>6. Click "Add" to save</Text>
        </Stack>
        <Title order={4} mb="sm">Method 2: Use item groups (templates)</Title>
        <Text mb="sm">
          Item groups let you add multiple related items at once. For example, a "Beach Essentials" group might include sunscreen, towels, and swimwear.
        </Text>
        <Stack gap="sm" mb="lg">
          <Text>1. Click "Add from Item Group"</Text>
          <Text>2. Select a pre-made group</Text>
          <Text>3. All items in that group are added to your list</Text>
        </Stack>
        <Box mb="lg" style={{ backgroundColor: '#f8f9fa', padding: '24px', borderRadius: '8px', textAlign: 'center' }}>
          <svg width="100%" height="200" viewBox="0 0 800 200" style={{ maxWidth: '600px', margin: '0 auto' }}>
            <rect width="800" height="200" fill="#e9ecef" rx="8"/>
            <text x="400" y="90" textAnchor="middle" fill="#495057" fontSize="16" fontFamily="sans-serif">
              [Screenshot: Add Items drawer with category selection]
            </text>
            <text x="400" y="115" textAnchor="middle" fill="#868e96" fontSize="12" fontFamily="sans-serif">
              Shows item name field, category dropdown, and quantity input
            </text>
          </svg>
        </Box>
      </>
    )
  },
  {
    id: 'managing-items',
    title: 'Managing Items',
    content: (
      <>
        <Text mb="md">
          Once items are in your list, you can check them off, edit them, or remove them.
        </Text>
        <Title order={4} mb="sm">Checking items off:</Title>
        <Text mb="md">
          Click the checkbox next to any item to mark it as packed. Checked items remain visible so you can track what's been packed.
        </Text>
        <Title order={4} mb="sm">Editing items:</Title>
        <Stack gap="sm" mb="md">
          <Text>1. Click the edit icon next to an item</Text>
          <Text>2. Update the name, category, or quantity</Text>
          <Text>3. Click "Save" to apply changes</Text>
        </Stack>
        <Title order={4} mb="sm">Removing items:</Title>
        <Text mb="lg">
          Click the delete icon to remove an item from your list. This only affects this specific packing list.
        </Text>
        <Box mb="lg" style={{ backgroundColor: '#f8f9fa', padding: '24px', borderRadius: '8px', textAlign: 'center' }}>
          <svg width="100%" height="200" viewBox="0 0 800 200" style={{ maxWidth: '600px', margin: '0 auto' }}>
            <rect width="800" height="200" fill="#e9ecef" rx="8"/>
            <text x="400" y="90" textAnchor="middle" fill="#495057" fontSize="16" fontFamily="sans-serif">
              [Screenshot: Packing list with some items checked off]
            </text>
            <text x="400" y="115" textAnchor="middle" fill="#868e96" fontSize="12" fontFamily="sans-serif">
              Shows list with checkboxes, edit and delete buttons
            </text>
          </svg>
        </Box>
      </>
    )
  },
  {
    id: 'categories',
    title: 'Working with Categories',
    content: (
      <>
        <Text mb="md">
          Categories help you organize items logically (e.g., "Clothing", "Electronics", "Toiletries").
        </Text>
        <Title order={4} mb="sm">Using existing categories:</Title>
        <Text mb="md">
          When adding an item, simply select from the category dropdown. Your list will automatically group items by category for easier viewing.
        </Text>
        <Title order={4} mb="sm">Creating new categories:</Title>
        <Stack gap="sm" mb="lg">
          <Text>1. Go to "Manage Categories" from the main menu</Text>
          <Text>2. Click "Add Category"</Text>
          <Text>3. Enter a name (e.g., "Sports Equipment")</Text>
          <Text>4. Click "Save"</Text>
          <Text>5. The category is now available for all family members</Text>
        </Stack>
        <Box mb="lg" style={{ backgroundColor: '#f8f9fa', padding: '24px', borderRadius: '8px', textAlign: 'center' }}>
          <svg width="100%" height="200" viewBox="0 0 800 200" style={{ maxWidth: '600px', margin: '0 auto' }}>
            <rect width="800" height="200" fill="#e9ecef" rx="8"/>
            <text x="400" y="90" textAnchor="middle" fill="#495057" fontSize="16" fontFamily="sans-serif">
              [Screenshot: Categories page showing list of categories]
            </text>
            <text x="400" y="115" textAnchor="middle" fill="#868e96" fontSize="12" fontFamily="sans-serif">
              Grid or list view of all available categories with add button
            </text>
          </svg>
        </Box>
      </>
    )
  },
  {
    id: 'item-groups',
    title: 'Creating Item Groups',
    content: (
      <>
        <Text mb="md">
          Item groups (templates) let you save collections of items you frequently pack together.
        </Text>
        <Title order={4} mb="sm">Creating an item group:</Title>
        <Stack gap="sm" mb="md">
          <Text>1. Navigate to "Manage Item Groups" from the main menu</Text>
          <Text>2. Click "Create New Group"</Text>
          <Text>3. Give your group a descriptive name (e.g., "Weekend Getaway", "Ski Trip Essentials")</Text>
          <Text>4. Add items to the group, specifying category and default quantity for each</Text>
          <Text>5. Click "Save"</Text>
        </Stack>
        <Title order={4} mb="sm">Using item groups:</Title>
        <Text mb="lg">
          When creating or editing a packing list, click "Add from Item Group" and select your saved group. All items will be added at once, saving you time on future trips.
        </Text>
        <Box mb="lg" style={{ backgroundColor: '#f8f9fa', padding: '24px', borderRadius: '8px', textAlign: 'center' }}>
          <svg width="100%" height="200" viewBox="0 0 800 200" style={{ maxWidth: '600px', margin: '0 auto' }}>
            <rect width="800" height="200" fill="#e9ecef" rx="8"/>
            <text x="400" y="90" textAnchor="middle" fill="#495057" fontSize="16" fontFamily="sans-serif">
              [Screenshot: Item Group editor with list of items]
            </text>
            <text x="400" y="115" textAnchor="middle" fill="#868e96" fontSize="12" fontFamily="sans-serif">
              Shows group name, list of included items with categories
            </text>
          </svg>
        </Box>
      </>
    )
  },
  {
    id: 'family-collaboration',
    title: 'Family Collaboration',
    content: (
      <>
        <Text mb="md">
          Travel List is designed for families to collaborate on trip planning.
        </Text>
        <Title order={4} mb="sm">Family members:</Title>
        <Text mb="md">
          All members of your family group can view and edit shared packing lists. Changes made by one person are immediately visible to everyone.
        </Text>
        <Title order={4} mb="sm">Managing family members:</Title>
        <Text mb="md">
          If you're a family admin, you can invite new members or manage existing ones from Settings → Family.
        </Text>
        <Stack gap="sm" mb="lg">
          <Text>1. Go to Settings (click your profile icon)</Text>
          <Text>2. Select "Family" tab</Text>
          <Text>3. View current members</Text>
          <Text>4. Invite new members by email (if supported)</Text>
          <Text>5. Adjust member permissions as needed</Text>
        </Stack>
        <Box mb="lg" style={{ backgroundColor: '#f8f9fa', padding: '24px', borderRadius: '8px', textAlign: 'center' }}>
          <svg width="100%" height="200" viewBox="0 0 800 200" style={{ maxWidth: '600px', margin: '0 auto' }}>
            <rect width="800" height="200" fill="#e9ecef" rx="8"/>
            <text x="400" y="90" textAnchor="middle" fill="#495057" fontSize="16" fontFamily="sans-serif">
              [Screenshot: Family management page showing member list]
            </text>
            <text x="400" y="115" textAnchor="middle" fill="#868e96" fontSize="12" fontFamily="sans-serif">
              Table showing family member names, roles, and action buttons
            </text>
          </svg>
        </Box>
      </>
    )
  },
  {
    id: 'settings',
    title: 'Account Settings',
    content: (
      <>
        <Text mb="md">
          Customize your account and manage your profile from the Settings area.
        </Text>
        <Title order={4} mb="sm">Accessing settings:</Title>
        <Stack gap="sm" mb="md">
          <Text>1. Click your profile avatar in the top right corner</Text>
          <Text>2. Select "Settings" from the menu</Text>
          <Text>3. Choose from Profile, Family, or Security tabs</Text>
        </Stack>
        <Title order={4} mb="sm">Profile settings:</Title>
        <Text mb="md">
          Update your username, email, or other personal information.
        </Text>
        <Title order={4} mb="sm">Security settings:</Title>
        <Text mb="lg">
          Change your password or manage security preferences to keep your account safe.
        </Text>
        <Box mb="lg" style={{ backgroundColor: '#f8f9fa', padding: '24px', borderRadius: '8px', textAlign: 'center' }}>
          <svg width="100%" height="200" viewBox="0 0 800 200" style={{ maxWidth: '600px', margin: '0 auto' }}>
            <rect width="800" height="200" fill="#e9ecef" rx="8"/>
            <text x="400" y="90" textAnchor="middle" fill="#495057" fontSize="16" fontFamily="sans-serif">
              [Screenshot: Settings page with tabs]
            </text>
            <text x="400" y="115" textAnchor="middle" fill="#868e96" fontSize="12" fontFamily="sans-serif">
              Shows Profile, Family, and Security tabs with form fields
            </text>
          </svg>
        </Box>
      </>
    )
  },
  {
    id: 'mobile-usage',
    title: 'Using on Mobile',
    content: (
      <>
        <Text mb="md">
          Travel List is fully optimized for mobile devices so you can check off items while packing on the go.
        </Text>
        <Title order={4} mb="sm">Mobile navigation:</Title>
        <Stack gap="sm" mb="md">
          <Text>• Tap the menu icon (☰) in the top left to access all sections</Text>
          <Text>• Your profile menu is in the top right corner</Text>
          <Text>• Swipe-friendly gestures for quick actions</Text>
          <Text>• Optimized touch targets for easy tapping</Text>
        </Stack>
        <Title order={4} mb="sm">Offline support:</Title>
        <Text mb="lg">
          The app works offline so you can check items even without internet. Changes will sync when you're back online.
        </Text>
        <Box mb="lg" style={{ backgroundColor: '#f8f9fa', padding: '24px', borderRadius: '8px', textAlign: 'center' }}>
          <svg width="100%" height="200" viewBox="0 0 800 200" style={{ maxWidth: '600px', margin: '0 auto' }}>
            <rect width="800" height="200" fill="#e9ecef" rx="8"/>
            <text x="400" y="90" textAnchor="middle" fill="#495057" fontSize="16" fontFamily="sans-serif">
              [Screenshot: Mobile view of packing list]
            </text>
            <text x="400" y="115" textAnchor="middle" fill="#868e96" fontSize="12" fontFamily="sans-serif">
              Shows compact mobile layout with drawer menu open
            </text>
          </svg>
        </Box>
      </>
    )
  },
  {
    id: 'tips-tricks',
    title: 'Tips & Tricks',
    content: (
      <>
        <Text mb="md">
          Make the most of Travel List with these helpful tips:
        </Text>
        <Stack gap="md" mb="lg">
          <Box>
            <Title order={4} mb="xs">Create master item groups</Title>
            <Text>Build comprehensive item groups for different trip types (beach vacation, camping, business trip) to save time on future packing.</Text>
          </Box>
          <Box>
            <Title order={4} mb="xs">Assign items to family members</Title>
            <Text>If your trip involves multiple people, items can be assigned so everyone knows what they're responsible for packing.</Text>
          </Box>
          <Box>
            <Title order={4} mb="xs">Copy existing lists</Title>
            <Text>When planning a similar trip, duplicate a previous packing list as a starting point instead of creating from scratch.</Text>
          </Box>
          <Box>
            <Title order={4} mb="xs">Use categories consistently</Title>
            <Text>Stick to a consistent category structure across your family so items are organized the same way in all lists.</Text>
          </Box>
          <Box>
            <Title order={4} mb="xs">Review before departure</Title>
            <Text>Go through your list 1-2 days before leaving to ensure nothing is forgotten and quantities are correct.</Text>
          </Box>
        </Stack>
      </>
    )
  },
  {
    id: 'troubleshooting',
    title: 'Troubleshooting',
    content: (
      <>
        <Text mb="md">
          Common issues and how to resolve them:
        </Text>
        <Stack gap="md" mb="lg">
          <Box>
            <Title order={4} mb="xs">Changes not syncing</Title>
            <Text>• Check your internet connection</Text>
            <Text>• Refresh the page (pull down on mobile)</Text>
            <Text>• Sign out and sign back in if issues persist</Text>
          </Box>
          <Box>
            <Title order={4} mb="xs">Can't see family members' changes</Title>
            <Text>• Make sure you're viewing the same packing list</Text>
            <Text>• Refresh to get the latest updates</Text>
            <Text>• Verify you're all in the same family group (Settings → Family)</Text>
          </Box>
          <Box>
            <Title order={4} mb="xs">Items appearing in wrong category</Title>
            <Text>• Edit the item and select the correct category</Text>
            <Text>• Categories can be renamed in "Manage Categories" if needed</Text>
          </Box>
          <Box>
            <Title order={4} mb="xs">Forgot password</Title>
            <Text>• Use the "Forgot Password" link on the login page</Text>
            <Text>• Contact your family admin if you need account help</Text>
          </Box>
        </Stack>
      </>
    )
  }
];

export default function UserDocsPage(): React.ReactElement {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeSection, setActiveSection] = useState<string>('getting-started');
  const [tocOpened, { open: openToc, close: closeToc }] = useDisclosure(false);
  const isMobile = useMediaQuery('(max-width: 767px)');
  const sectionRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});

  // Configure Fuse for fuzzy search
  const fuse = new Fuse(docSections, {
    keys: ['title', 'id'],
    threshold: 0.3,
    includeScore: true
  });

  // Get filtered sections based on search
  const filteredSections = searchQuery.trim() 
    ? fuse.search(searchQuery).map(result => result.item)
    : docSections;

  // Handle scroll to update active section
  useEffect(() => {
    const handleScroll = () => {
      const scrollPosition = window.scrollY + 100;
      
      for (const section of docSections) {
        const element = sectionRefs.current[section.id];
        if (element) {
          const { offsetTop, offsetHeight } = element;
          if (scrollPosition >= offsetTop && scrollPosition < offsetTop + offsetHeight) {
            setActiveSection(section.id);
            break;
          }
        }
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToSection = (sectionId: string) => {
    const element = sectionRefs.current[sectionId];
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setActiveSection(sectionId);
      if (isMobile) {
        closeToc();
      }
    }
  };

  const TableOfContents = () => (
    <Stack gap="xs">
      <Text fw={600} mb="sm">Contents</Text>
      {docSections.map((section) => (
        <UnstyledButton
          key={section.id}
          onClick={() => scrollToSection(section.id)}
          style={{
            padding: '8px 12px',
            borderRadius: '6px',
            backgroundColor: activeSection === section.id ? '#e7f5ff' : 'transparent',
            color: activeSection === section.id ? '#1971c2' : 'inherit',
            textAlign: 'left',
            border: activeSection === section.id ? '1px solid #1971c2' : '1px solid transparent',
            transition: 'all 0.2s ease'
          }}
        >
          <Text size="sm">{section.title}</Text>
        </UnstyledButton>
      ))}
    </Stack>
  );

  return (
    <Container size="xl" py="xl">
      {/* Header */}
      <Box mb="xl">
        <Group justify="space-between" mb="md">
          <Title order={1}>User Guide</Title>
          {isMobile && (
            <ActionIcon onClick={openToc} size="lg" variant="light">
              <IconMenu2 size={20} />
            </ActionIcon>
          )}
        </Group>
        <Text c="dimmed" mb="lg">
          Everything you need to know about using Travel List to organize your trips
        </Text>
        
        {/* Search */}
        <TextInput
          placeholder="Search documentation..."
          leftSection={<IconSearch size={16} />}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.currentTarget.value)}
          size="md"
          rightSection={
            searchQuery && (
              <ActionIcon onClick={() => setSearchQuery('')} variant="subtle">
                <IconX size={16} />
              </ActionIcon>
            )
          }
        />
      </Box>

      <div style={{ display: 'flex', gap: '24px', alignItems: 'flex-start' }}>
        {/* Table of Contents - Desktop */}
        {!isMobile && (
          <Paper 
            shadow="sm" 
            p="md" 
            style={{ 
              width: '250px', 
              position: 'sticky', 
              top: '20px',
              maxHeight: 'calc(100vh - 100px)',
              overflowY: 'auto'
            }}
          >
            <TableOfContents />
          </Paper>
        )}

        {/* Main Content */}
        <Box style={{ flex: 1, minWidth: 0 }}>
          {filteredSections.length > 0 ? (
            <Stack gap="xl">
              {filteredSections.map((section) => (
                <Paper
                  key={section.id}
                  ref={(el) => { sectionRefs.current[section.id] = el; }}
                  shadow="sm"
                  p="xl"
                  id={section.id}
                >
                  <Title order={2} mb="md">{section.title}</Title>
                  <Divider mb="md" />
                  {section.content}
                </Paper>
              ))}
            </Stack>
          ) : (
            <Paper shadow="sm" p="xl">
              <Text c="dimmed" ta="center">
                No sections found matching "{searchQuery}"
              </Text>
            </Paper>
          )}
        </Box>
      </div>

      {/* Mobile TOC Drawer */}
      <Drawer
        opened={tocOpened}
        onClose={closeToc}
        title="Contents"
        position="left"
        size="280px"
      >
        <TableOfContents />
      </Drawer>
    </Container>
  );
}
