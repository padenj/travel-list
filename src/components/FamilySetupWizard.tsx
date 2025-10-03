import React, { useState, useEffect } from 'react';
import { 
  Modal, 
  Title, 
  Text, 
  Button, 
  Stepper, 
  TextInput, 
  Group, 
  Stack,
  Alert,
  Card,
  Loader
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { IconCheck, IconInfoCircle, IconEdit } from '@tabler/icons-react';
import { createFamily, getCurrentUserProfile } from '../api';

interface FamilySetupWizardProps {
  opened: boolean;
  onClose: () => void;
  onComplete: (familyData: any) => void;
  userRole: string;
}

export default function FamilySetupWizard({ opened, onClose, onComplete, userRole }: FamilySetupWizardProps): React.ReactElement {
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const [checkingFamily, setCheckingFamily] = useState(false);
  const [existingFamily, setExistingFamily] = useState<any>(null);
  const [isEditMode, setIsEditMode] = useState(false);

  const familyForm = useForm({
    initialValues: {
      name: '',
    },
    validate: {
      name: (value) => (!value || value.trim() === '' ? 'Family name is required' : null),
    },
  });

  // Check for existing family when modal opens
  useEffect(() => {
    if (opened && userRole === 'SystemAdmin') {
      checkExistingFamily();
    }
  }, [opened, userRole]);

  const checkExistingFamily = async () => {
    try {
      setCheckingFamily(true);
      const response = await getCurrentUserProfile();
      
      if (response.response.ok && response.data.family) {
        setExistingFamily(response.data.family);
        setIsEditMode(true);
        familyForm.setValues({ name: response.data.family.name });
      } else {
        setExistingFamily(null);
        setIsEditMode(false);
        familyForm.setValues({ name: '' });
      }
    } catch (error) {
      console.error('Error checking existing family:', error);
      setExistingFamily(null);
      setIsEditMode(false);
    } finally {
      setCheckingFamily(false);
    }
  };

  const handleCreateFamily = async (values: { name: string }) => {
    try {
      setLoading(true);
      const response = await createFamily(values);
      
      if (response.response.ok) {
        notifications.show({
          title: 'Success',
          message: 'Family created successfully!',
          color: 'green',
        });
        onComplete(response.data.family);
        setActive(2); // Move to completion step
      } else {
        notifications.show({
          title: 'Error',
          message: response.data.error || 'Failed to create family',
          color: 'red',
        });
      }
    } catch (error) {
      notifications.show({
        title: 'Error',
        message: 'Network error',
        color: 'red',
      });
    } finally {
      setLoading(false);
    }
  };

  const nextStep = () => setActive((current) => (current < 2 ? current + 1 : current));
  const prevStep = () => setActive((current) => (current > 0 ? current - 1 : current));

  const handleClose = () => {
    setActive(0);
    familyForm.reset();
    onClose();
  };

  const renderStepContent = () => {
    switch (active) {
      case 0:
        return (
          <Stack>
            <Alert icon={<IconInfoCircle size={16} />} title="Welcome to Travel List Setup">
              Let's get your family set up for managing packing lists. This wizard will help you create your family group and get started.
            </Alert>
            
            <Card withBorder>
              <Text fw={500} mb="sm">What you'll be able to do:</Text>
              <ul style={{ margin: 0, paddingLeft: '1.2rem' }}>
                <li>Create and manage family members</li>
                <li>Organize packing items by categories</li>
                <li>Create reusable packing templates</li>
                <li>Generate packing lists for trips</li>
                <li>Work offline and sync when connected</li>
              </ul>
            </Card>

            <Text size="sm" c="dimmed">
              Click "Next" to continue with the setup process.
            </Text>
          </Stack>
        );

      case 1:
        return (
          <Stack>
            {checkingFamily ? (
              <Group justify="center">
                <Loader size="sm" />
                <Text>Checking your current family status...</Text>
              </Group>
            ) : (
              <>
                {isEditMode ? (
                  <>
                    <Alert icon={<IconEdit size={16} />} color="blue" title="Edit Your Family">
                      You're already assigned to the family "{existingFamily?.name}". You can update your family name below.
                    </Alert>
                    <Text>Update your family information:</Text>
                  </>
                ) : (
                  <Text>Let's create your family group. You can add family members later from the Family Administration page.</Text>
                )}
                
                <form id="family-form" onSubmit={familyForm.onSubmit(handleCreateFamily)}>
                  <Stack>
                    <TextInput
                      label="Family Name"
                      placeholder="Enter your family name (e.g., 'The Smith Family')"
                      description="This will be used to organize your packing lists and family members"
                      {...familyForm.getInputProps('name')}
                    />
                  </Stack>
                </form>

                <Alert icon={<IconInfoCircle size={16} />} color="blue">
                  {isEditMode 
                    ? "After updating your family, you can continue managing family members and organizing your packing items."
                    : "After creating your family, you'll be able to add family members and start organizing your packing items. You will be automatically added to the family as an administrator."
                  }
                </Alert>
              </>
            )}
          </Stack>
        );

      case 2:
        return (
          <Stack ta="center">
            <IconCheck size={48} color="green" style={{ margin: '0 auto' }} />
            <Title order={3}>{isEditMode ? 'Family Updated!' : 'Setup Complete!'}</Title>
            <Text>
              Your family has been {isEditMode ? 'updated' : 'created'} successfully. You can now:
            </Text>
            
            <div style={{ textAlign: 'left' }}>
              <ul>
                <li>Add family members from the Family Administration page</li>
                <li>Start organizing your packing categories and items</li>
                <li>Create templates for different types of trips</li>
                <li>Generate packing lists for your travels</li>
              </ul>
            </div>

            <Text size="sm" c="dimmed">
              You can access all features from the navigation menu.
            </Text>
          </Stack>
        );

      default:
        return null;
    }
  };

  const renderButtons = () => {
    switch (active) {
      case 0:
        return (
          <Group justify="flex-end">
            <Button variant="light" onClick={handleClose}>
              Skip Setup
            </Button>
            <Button onClick={nextStep}>Next</Button>
          </Group>
        );

      case 1:
        return (
          <Group justify="space-between">
            <Button variant="light" onClick={prevStep} disabled={checkingFamily}>
              Back
            </Button>
            <Button 
              type="submit"
              form="family-form"
              loading={loading || checkingFamily}
              disabled={checkingFamily}
            >
              {isEditMode ? 'Update Family' : 'Create Family'}
            </Button>
          </Group>
        );

      case 2:
        return (
          <Group justify="center">
            <Button onClick={handleClose}>
              Get Started
            </Button>
          </Group>
        );

      default:
        return null;
    }
  };

  // Only show for SystemAdmin users (who can create families)
  if (userRole !== 'SystemAdmin') {
    return <></>;
  }

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      title={isEditMode ? "Family Management" : "Family Setup Wizard"}
      size="lg"
      closeOnClickOutside={false}
      closeOnEscape={false}
    >
      <Stack>
        <Stepper active={active} onStepClick={setActive}>
          <Stepper.Step label="Welcome" description="Introduction">
            {/* Step content is rendered below */}
          </Stepper.Step>
          <Stepper.Step label={isEditMode ? "Edit Family" : "Create Family"} description="Basic information">
            {/* Step content is rendered below */}
          </Stepper.Step>
          <Stepper.Step label="Complete" description={isEditMode ? "Family updated" : "Setup finished"}>
            {/* Step content is rendered below */}
          </Stepper.Step>
        </Stepper>

        <div style={{ minHeight: '300px', paddingTop: '1rem' }}>
          {renderStepContent()}
        </div>

        {renderButtons()}
      </Stack>
    </Modal>
  );
}