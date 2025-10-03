import React, { useState, FormEvent } from 'react';
import { Text, List, ThemeIcon, Progress, Stack } from '@mantine/core';
import { IconCheck, IconX } from '@tabler/icons-react';
import { changePassword } from './api';

interface PasswordChangePageProps {
  username: string;
  onChange: () => void;
  onCancel?: () => void;
}

export default function PasswordChangePage({ username, onChange, onCancel }: PasswordChangePageProps): React.ReactElement {
  const [oldPassword, setOldPassword] = useState<string>('');
  const [newPassword, setNewPassword] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [success, setSuccess] = useState<boolean>(false);

  // Password validation checks
  const passwordChecks = {
    length: newPassword.length >= 8,
    uppercase: /[A-Z]/.test(newPassword),
    lowercase: /[a-z]/.test(newPassword),
    number: /[0-9]/.test(newPassword),
    symbol: /[^A-Za-z0-9]/.test(newPassword),
  };

  const passwordsMatch = newPassword && confirmPassword && newPassword === confirmPassword;
  const typeCount = [passwordChecks.uppercase, passwordChecks.lowercase, passwordChecks.number, passwordChecks.symbol].filter(Boolean).length;
  const allChecksPass = passwordChecks.length && typeCount >= 2;
  const passwordStrength = passwordChecks.length ? (1 + typeCount) : 0; // 1 for length + up to 4 for types
  const isFormValid = allChecksPass && passwordsMatch && oldPassword;

  async function handleSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    
    if (!isFormValid) {
      setError('Please fix all password requirements before submitting.');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess(false);
    
    try {
      const { response: res, data } = await changePassword(username, oldPassword, newPassword);
      
      if (!res.ok) {
        // Provide more user-friendly error messages
        if (data.error === 'INVALID_CREDENTIALS') {
          setError('Current password is incorrect. Please try again.');
        } else if (data.error === 'PASSWORD_TOO_WEAK') {
          setError('Password does not meet security requirements.');
        } else {
          setError(data.error || 'Password change failed');
        }
      } else {
        setSuccess(true);
        onChange();
      }
    } catch (err) {
      setError('Network error. Please try again.');
      console.error('Password change error:', err);
    } finally {
      setLoading(false);
    }
  }

  const getPasswordStrengthColor = () => {
    if (passwordStrength <= 2) return 'red';
    if (passwordStrength <= 4) return 'yellow';
    return 'green';
  };

  const getPasswordStrengthLabel = () => {
    if (passwordStrength <= 2) return 'Weak';
    if (passwordStrength <= 4) return 'Medium';
    return 'Strong';
  };

  return (
    <div style={{ 
      maxWidth: 500, 
      margin: '2rem auto', 
      padding: 24, 
      border: '1px solid #eee', 
      borderRadius: 8 
    }}>
      <h2>Change Password</h2>
      <form onSubmit={handleSubmit}>
        <Stack gap="md">
          {/* Current Password */}
          <div>
            <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>
              Current Password
            </label>
            <input
              type="password"
              placeholder="Enter your current password"
              value={oldPassword}
              onChange={e => setOldPassword(e.target.value)}
              style={{ width: '100%', padding: 8, marginBottom: 8 }}
              required
            />
          </div>

          {/* New Password */}
          <div>
            <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>
              New Password
            </label>
            <input
              type="password"
              placeholder="Enter your new password"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              style={{ width: '100%', padding: 8, marginBottom: 8 }}
              required
            />
            
            {/* Password Strength Indicator */}
            {newPassword && (
              <div style={{ marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <Text size="sm">Password Strength: {getPasswordStrengthLabel()}</Text>
                  <Text size="sm">{passwordStrength}/5</Text>
                </div>
                <Progress 
                  value={(passwordStrength / 5) * 100} 
                  color={getPasswordStrengthColor()}
                  size="sm"
                />
              </div>
            )}

            {/* Password Requirements Checklist */}
            {newPassword && (
              <List size="sm" spacing="xs">
                <List.Item
                  icon={
                    <ThemeIcon size={16} color={passwordChecks.length ? 'green' : 'red'} variant="filled">
                      {passwordChecks.length ? <IconCheck size={12} /> : <IconX size={12} />}
                    </ThemeIcon>
                  }
                >
                  <Text size="sm" c={passwordChecks.length ? 'green' : 'red'}>
                    At least 8 characters
                  </Text>
                </List.Item>
                <List.Item
                  icon={
                    <ThemeIcon size={16} color={typeCount >= 2 ? 'green' : 'red'} variant="filled">
                      {typeCount >= 2 ? <IconCheck size={12} /> : <IconX size={12} />}
                    </ThemeIcon>
                  }
                >
                  <Text size="sm" c={typeCount >= 2 ? 'green' : 'red'}>
                    At least 2 of the following types:
                  </Text>
                </List.Item>
                <List ml="md" size="sm" spacing="xs">
                  <List.Item
                    icon={
                      <ThemeIcon size={14} color={passwordChecks.uppercase ? 'green' : 'gray'} variant="filled">
                        {passwordChecks.uppercase ? <IconCheck size={10} /> : <IconX size={10} />}
                      </ThemeIcon>
                    }
                  >
                    <Text size="sm" c={passwordChecks.uppercase ? 'green' : 'gray'}>
                      Uppercase letters (A-Z)
                    </Text>
                  </List.Item>
                  <List.Item
                    icon={
                      <ThemeIcon size={14} color={passwordChecks.lowercase ? 'green' : 'gray'} variant="filled">
                        {passwordChecks.lowercase ? <IconCheck size={10} /> : <IconX size={10} />}
                      </ThemeIcon>
                    }
                  >
                    <Text size="sm" c={passwordChecks.lowercase ? 'green' : 'gray'}>
                      Lowercase letters (a-z)
                    </Text>
                  </List.Item>
                  <List.Item
                    icon={
                      <ThemeIcon size={14} color={passwordChecks.number ? 'green' : 'gray'} variant="filled">
                        {passwordChecks.number ? <IconCheck size={10} /> : <IconX size={10} />}
                      </ThemeIcon>
                    }
                  >
                    <Text size="sm" c={passwordChecks.number ? 'green' : 'gray'}>
                      Numbers (0-9)
                    </Text>
                  </List.Item>
                  <List.Item
                    icon={
                      <ThemeIcon size={14} color={passwordChecks.symbol ? 'green' : 'gray'} variant="filled">
                        {passwordChecks.symbol ? <IconCheck size={10} /> : <IconX size={10} />}
                      </ThemeIcon>
                    }
                  >
                    <Text size="sm" c={passwordChecks.symbol ? 'green' : 'gray'}>
                      Symbols (!@#$%^&*)
                    </Text>
                  </List.Item>
                </List>
              </List>
            )}
          </div>

          {/* Confirm Password */}
          <div>
            <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>
              Confirm New Password
            </label>
            <input
              type="password"
              placeholder="Re-enter your new password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              style={{ 
                width: '100%', 
                padding: 8, 
                marginBottom: 8,
                borderColor: confirmPassword && !passwordsMatch ? 'red' : undefined
              }}
              required
            />
            {confirmPassword && !passwordsMatch && (
              <Text size="sm" c="red">
                Passwords do not match
              </Text>
            )}
            {confirmPassword && passwordsMatch && (
              <Text size="sm" c="green">
                ✓ Passwords match
              </Text>
            )}
          </div>

          {/* Error Message */}
          {error && (
            <div style={{ 
              color: 'red', 
              backgroundColor: '#fee', 
              padding: 12, 
              borderRadius: 4,
              border: '1px solid #fcc'
            }}>
              {error}
            </div>
          )}

          {/* Success Message */}
          {success && (
            <div style={{ 
              color: 'green', 
              backgroundColor: '#efe', 
              padding: 12, 
              borderRadius: 4,
              border: '1px solid #cfc'
            }}>
              Password changed successfully!
            </div>
          )}

          {/* Submit Button */}
          <button 
            type="submit" 
            style={{ 
              width: '100%', 
              padding: 12,
              backgroundColor: isFormValid ? '#228be6' : '#ccc',
              color: 'white',
              border: 'none',
              borderRadius: 4,
              cursor: isFormValid ? 'pointer' : 'not-allowed',
              fontSize: '16px'
            }} 
            disabled={loading || !isFormValid}
          >
            {loading ? 'Changing Password...' : 'Change Password'}
          </button>

          {/* Cancel Button */}
          {onCancel && (
            <button 
              type="button" 
              style={{ 
                width: '100%', 
                padding: 12,
                backgroundColor: 'transparent',
                color: '#666',
                border: '1px solid #ddd',
                borderRadius: 4,
                cursor: 'pointer',
                fontSize: '16px'
              }} 
              onClick={onCancel}
            >
              Cancel
            </button>
          )}
        </Stack>
      </form>
    </div>
  );
}
