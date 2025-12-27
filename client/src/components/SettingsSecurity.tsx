import React from 'react';
import { Card, Text } from '@mantine/core';

export default function SettingsSecurity(): React.ReactElement {
  return (
    <Card>
      <Text fw={600}>Security (placeholder)</Text>
      <Text size="sm">Security-related settings (passwords, 2FA) will go here.</Text>
    </Card>
  );
}
