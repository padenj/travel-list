import React from 'react';
import { Container, Stack, Anchor } from '@mantine/core';
import { Link, Outlet } from 'react-router-dom';
import { IconArrowLeft } from '@tabler/icons-react';

export default function SettingsPage(): React.ReactElement {
  return (
    <Container size="lg">
      <Stack gap="md">
        <Anchor component={Link} to="/" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <IconArrowLeft size={18} />
          <span>Back to Dashboard</span>
        </Anchor>

        {/* Nested routes will render here: /settings/family, /settings/profile, /settings/security */}
        <Outlet />
      </Stack>
    </Container>
  );
}
