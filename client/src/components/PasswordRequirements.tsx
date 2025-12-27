import React from 'react';
import { List, ThemeIcon, Text, Progress } from '@mantine/core';
import { IconCheck, IconX } from '@tabler/icons-react';
import { getPasswordChecks } from '../utils/password';

interface Props {
  password: string;
}

export default function PasswordRequirements({ password }: Props) {
  const checks = getPasswordChecks(password || '');
  const strengthLabel = checks.strength <= 2 ? 'Weak' : checks.strength <= 4 ? 'Medium' : 'Strong';
  const strengthColor = checks.strength <= 2 ? 'red' : checks.strength <= 4 ? 'yellow' : 'green';

  return (
    <div>
      {password && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <Text size="sm">Password Strength: {strengthLabel}</Text>
            <Text size="sm">{checks.strength}/5</Text>
          </div>
          <Progress value={(checks.strength / 5) * 100} color={strengthColor} size="sm" />
        </div>
      )}

      {password && (
        <List size="sm" spacing="xs">
          <List.Item
            icon={
              <ThemeIcon size={16} color={checks.length ? 'green' : 'red'} variant="filled">
                {checks.length ? <IconCheck size={12} /> : <IconX size={12} />}
              </ThemeIcon>
            }
          >
            <Text size="sm" c={checks.length ? 'green' : 'red'}>At least 8 characters</Text>
          </List.Item>
          <List.Item
            icon={
              <ThemeIcon size={16} color={checks.typeCount >= 2 ? 'green' : 'red'} variant="filled">
                {checks.typeCount >= 2 ? <IconCheck size={12} /> : <IconX size={12} />}
              </ThemeIcon>
            }
          >
            <Text size="sm" c={checks.typeCount >= 2 ? 'green' : 'red'}>At least 2 of: uppercase, lowercase, numbers, symbols</Text>
          </List.Item>
          <List ml="md" size="sm" spacing="xs">
            <List.Item
              icon={<ThemeIcon size={14} color={checks.uppercase ? 'green' : 'gray'} variant="filled">{checks.uppercase ? <IconCheck size={10} /> : <IconX size={10} />}</ThemeIcon>}
            >
              <Text size="sm" c={checks.uppercase ? 'green' : 'gray'}>Uppercase letters (A-Z)</Text>
            </List.Item>
            <List.Item
              icon={<ThemeIcon size={14} color={checks.lowercase ? 'green' : 'gray'} variant="filled">{checks.lowercase ? <IconCheck size={10} /> : <IconX size={10} />}</ThemeIcon>}
            >
              <Text size="sm" c={checks.lowercase ? 'green' : 'gray'}>Lowercase letters (a-z)</Text>
            </List.Item>
            <List.Item
              icon={<ThemeIcon size={14} color={checks.number ? 'green' : 'gray'} variant="filled">{checks.number ? <IconCheck size={10} /> : <IconX size={10} />}</ThemeIcon>}
            >
              <Text size="sm" c={checks.number ? 'green' : 'gray'}>Numbers (0-9)</Text>
            </List.Item>
            <List.Item
              icon={<ThemeIcon size={14} color={checks.symbol ? 'green' : 'gray'} variant="filled">{checks.symbol ? <IconCheck size={10} /> : <IconX size={10} />}</ThemeIcon>}
            >
              <Text size="sm" c={checks.symbol ? 'green' : 'gray'}>Symbols (!@#$%^&*)</Text>
            </List.Item>
          </List>
        </List>
      )}
    </div>
  );
}
