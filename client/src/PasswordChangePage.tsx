import React, { useState, FormEvent } from 'react';
import { Text, Stack } from '@mantine/core';
import { changePassword } from './api';
import PasswordRequirements from './components/PasswordRequirements';
import { isPasswordValid } from './utils/password';

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

  const passwordsMatch = newPassword && confirmPassword && newPassword === confirmPassword;
  const allChecksPass = isPasswordValid(newPassword);
  const passwordStrength = newPassword ? (1 + [/[A-Z]/.test(newPassword), /[a-z]/.test(newPassword), /[0-9]/.test(newPassword), /[^A-Za-z0-9]/.test(newPassword)].filter(Boolean).length) : 0;
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
            
            {newPassword && (
              <PasswordRequirements password={newPassword} />
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
