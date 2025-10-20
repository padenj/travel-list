import React, { useState, useEffect, useRef } from 'react';
import { 
  Container, 
  Title, 
  Button, 
  Table, 
  Group, 
  Text, 
  Modal, 
  TextInput, 
  Select, 
  ActionIcon,
  Stack,
  Divider
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { IconTrash, IconPlus } from '@tabler/icons-react';
import { getCurrentUserProfile, createFamilyMember, deleteUser, getFamily, updateFamilyMemberOrder } from '../api';
import { useImpersonation } from '../contexts/ImpersonationContext';

interface User {
  id: string;
  name?: string;
  username?: string;
  role?: string;
  email?: string;
  familyId?: string;
  created_at?: string;
}

export default function FamilyAdminPage(): React.ReactElement {
  const [_loading, setLoading] = useState(true); // Fixed syntax issues
  const [family, setFamily] = useState<any>(null);
  const [members, setMembers] = useState<User[]>([]);
  const [showMemberModal, setShowMemberModal] = useState(false);
  const { impersonatingFamilyId } = useImpersonation();
  const [savingOrder, setSavingOrder] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [placeholderIndex, setPlaceholderIndex] = useState<number | null>(null);
  const rowRefs = useRef<Record<string, HTMLTableRowElement | null>>({});
  const ghostRef = useRef<HTMLDivElement | null>(null);
  const currentPlaceholderIndex = useRef<number | null>(null);

  const memberForm = useForm({
    initialValues: {
      name: '',
      canLogin: false,
      username: '',
      password: '',
      role: 'FamilyMember',
    },
    validate: {
      name: (value) => (!value ? 'Name is required' : null),
      username: (value, values) => (values.canLogin && !value ? 'Username is required' : null),
      password: (value, values) => {
        if (!values.canLogin) return null;
        if (!value) return 'Password is required';
        if (value.length < 8) return 'Password must be at least 8 characters';
        let typeCount = 0;
        if (/[A-Z]/.test(value)) typeCount++;
        if (/[a-z]/.test(value)) typeCount++;
        if (/[0-9]/.test(value)) typeCount++;
        if (/[^A-Za-z0-9]/.test(value)) typeCount++;
        if (typeCount < 2) return 'Password must contain at least 2 of: uppercase, lowercase, numbers, symbols';
        return null;
      },
    },
  });

  const loadFamily = async () => {
    setLoading(true);
    try {
      if (impersonatingFamilyId) {
        const famRes = await getFamily(impersonatingFamilyId);
        if (famRes.response.ok && famRes.data.family) {
          console.log('🔍 Client: Loading family members from getFamily API:', famRes.data.family.members?.map((m: any) => ({ id: m.id, name: m.name, username: m.username, position: m.position })));
          setFamily(famRes.data.family);
          setMembers(famRes.data.family.members || []);
        } else {
          setFamily(null);
          setMembers([]);
        }
      } else {
        const response = await getCurrentUserProfile();
        if (response.response.ok && response.data.family) {
          console.log('🔍 Client: Loading family members from getCurrentUserProfile API:', response.data.family.members?.map((m: any) => ({ id: m.id, name: m.name, username: m.username, position: m.position })));
          setFamily(response.data.family);
          setMembers(response.data.family.members || []);
        } else {
          setFamily(null);
          setMembers([]);
        }
      }
    } catch (error) {
      notifications.show({ title: 'Error', message: 'Failed to load family', color: 'red' });
      setFamily(null);
      setMembers([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFamily();
  }, [impersonatingFamilyId]);

  const handleAddMember = () => {
    memberForm.reset();
    setShowMemberModal(true);
  };

  const handleCreateMember = async (values: any) => {
    if (!family?.id) return;
    try {
      const response = await createFamilyMember(family.id, {
        name: values.name,
        canLogin: values.canLogin,
        username: values.canLogin ? values.username : undefined,
        password: values.canLogin ? values.password : undefined,
        role: values.canLogin ? values.role : 'FamilyMember',
      });
      if (response.response.ok) {
        notifications.show({ title: 'Member added', message: 'Family member added successfully.', color: 'green' });
        setShowMemberModal(false);
        memberForm.reset();
        loadFamily();
      } else {
        notifications.show({ title: 'Error', message: response.data.error || 'Failed to add member', color: 'red' });
      }
    } catch (error) {
      notifications.show({ title: 'Error', message: 'Network error', color: 'red' });
    }
  };

  const handleDeleteMember = async (memberId: string, memberName: string) => {
    if (!window.confirm(`Are you sure you want to remove ${memberName} from your family?`)) return;
    try {
      const response = await deleteUser(memberId);
      if (response.response.ok) {
        notifications.show({ title: 'Member removed', message: 'Family member removed.', color: 'green' });
        loadFamily();
      } else {
        notifications.show({ title: 'Error', message: response.data.error || 'Failed to remove member', color: 'red' });
      }
    } catch (error) {
      notifications.show({ title: 'Error', message: 'Network error', color: 'red' });
    }
  };

  const persistOrder = async (order?: User[]) => {
    if (!family?.id) return;
    const ids = (order || members).map(m => m.id);
    setSavingOrder(true);
    try {
      const res = await updateFamilyMemberOrder(family.id, ids);
      if (res.response.ok) {
        notifications.show({ title: 'Order saved', message: 'Member order updated', color: 'green' });
        // Don't reload family data - trust the local state since we just successfully persisted it
      } else {
        notifications.show({ title: 'Error', message: res.data?.error || 'Failed to save order', color: 'red' });
        // Don't reload on error to avoid cascading failures - just show error
      }
    } catch (err) {
      console.error('Error persisting order:', err);
      notifications.show({ title: 'Error', message: 'Network error', color: 'red' });
      // Don't reload on error to avoid cascading failures - just show error
    } finally {
      setSavingOrder(false);
    }
  };

  return (
    <Container size="md">
      <Group justify="space-between" mb="xl">
        <Title order={2}>Family Administration</Title>
        <Button leftSection={<IconPlus size={16} />} onClick={handleAddMember}>
          Add Member
        </Button>
      </Group>
      <Divider mb="md" />
      <Text fw={500} mb="sm">Family Members ({members.length})</Text>
      {members.length === 0 ? (
        <Text c="dimmed" size="sm">No members in your family</Text>
      ) : (
        <Table>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Name</Table.Th>
              <Table.Th>Username</Table.Th>
              <Table.Th>Role</Table.Th>
              <Table.Th>Actions</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody
            onDragOver={(e) => {
              // Allow drops on the entire tbody
              e.preventDefault();
              if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
              
              const clientY = (e as React.DragEvent).clientY;
              const rects = members.map(m => {
                const r = rowRefs.current[m.id];
                return r ? r.getBoundingClientRect() : null;
              });
              let foundIndex = members.length; // allow placeholder at end
              for (let i = 0; i < rects.length; i++) {
                const r = rects[i];
                if (!r) continue;
                if (clientY < r.top + r.height / 2) {
                  foundIndex = i;
                  break;
                }
              }
              if (foundIndex !== placeholderIndex) {
                console.log('📍 Tbody placeholder index changed:', foundIndex);
              }
              setPlaceholderIndex(foundIndex);
            }}
            onDrop={(e) => {
              e.preventDefault();
              console.log('🎯 Tbody drop triggered');
              const draggedId = e.dataTransfer?.getData('text/plain');
              if (!draggedId) {
                console.log('❌ Tbody: No draggedId found');
                return;
              }
              const draggedIndex = members.findIndex((m) => m.id === draggedId);
              const targetIndex = placeholderIndex ?? members.length;
              console.log('🎯 Tbody drop attempt:', { draggedId, draggedIndex, targetIndex, placeholderIndex });
              if (draggedIndex === -1) {
                console.log('❌ Tbody: DraggedIndex not found');
                return;
              }
              // No-op if dropping to same place
              if (draggedIndex === targetIndex || draggedIndex + 1 === targetIndex) {
                console.log('⏭️ Tbody: No-op drop (same position)', { draggedIndex, targetIndex });
                setDraggingId(null);
                setPlaceholderIndex(null);
                return;
              }
              
              const newMembers = [...members];
              const [removed] = newMembers.splice(draggedIndex, 1);
              // If removing an earlier index shifts target left, adjust when necessary
              let insertAt = targetIndex;
              if (draggedIndex < targetIndex) insertAt = targetIndex - 1;
              newMembers.splice(insertAt, 0, removed);
              console.log('✅ Tbody reordering:', { 
                from: draggedIndex, 
                to: targetIndex, 
                insertAt,
                before: members.map(m => m.name || m.username),
                after: newMembers.map(m => m.name || m.username)
              });
              setMembers(newMembers);
              // persist immediately
              persistOrder(newMembers);
              setDraggingId(null);
              setPlaceholderIndex(null);
            }}
          >
            {members.map((member: any, index: number) => {
              const isDragging = draggingId === member.id;
              const showPlaceholderBefore = placeholderIndex === index && draggingId !== null && draggingId !== member.id;
              return (
                <React.Fragment key={member.id}>
                  {showPlaceholderBefore && (
                    <Table.Tr>
                      <Table.Td colSpan={4} style={{ padding: 8 }}>
                        <div style={{ height: 8, background: 'linear-gradient(90deg,#4c9aff, #6ad0ff)', borderRadius: 4, transition: 'height 200ms' }} />
                      </Table.Td>
                    </Table.Tr>
                  )}
                  <Table.Tr
                    ref={(el) => { rowRefs.current[member.id] = el; }}
                    onDragOver={(e) => {
                      // compute placeholder index based on mouse Y so the drop indicator follows the pointer
                      e.preventDefault();
                      if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
                      const clientY = (e as React.DragEvent).clientY;
                      const rects = members.map(m => {
                        const r = rowRefs.current[m.id];
                        return r ? r.getBoundingClientRect() : null;
                      });
                      let foundIndex = members.length; // allow placeholder at end
                      for (let i = 0; i < rects.length; i++) {
                        const r = rects[i];
                        if (!r) continue;
                        if (clientY < r.top + r.height / 2) {
                          foundIndex = i;
                          break;
                        }
                      }
                      if (foundIndex !== placeholderIndex) {
                        console.log('📍 Placeholder index changed:', foundIndex);
                      }
                      setPlaceholderIndex(foundIndex);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      const draggedId = e.dataTransfer?.getData('text/plain');
                      if (!draggedId) {
                        console.log('❌ No draggedId found');
                        return;
                      }
                      const draggedIndex = members.findIndex((m) => m.id === draggedId);
                      const targetIndex = placeholderIndex ?? index;
                      console.log('🎯 Drop attempt:', { draggedId, draggedIndex, targetIndex, placeholderIndex, currentRowIndex: index });
                      if (draggedIndex === -1) {
                        console.log('❌ DraggedIndex not found');
                        return;
                      }
                      // No-op if dropping to same place
                      if (draggedIndex === targetIndex || draggedIndex + 1 === targetIndex) {
                        console.log('⏭️ No-op drop (same position)', { draggedIndex, targetIndex });
                        setDraggingId(null);
                        setPlaceholderIndex(null);
                        return;
                      }
                      const newMembers = [...members];
                      const [removed] = newMembers.splice(draggedIndex, 1);
                      // If removing an earlier index shifts target left, adjust when necessary
                      let insertAt = targetIndex;
                      if (draggedIndex < targetIndex) insertAt = targetIndex - 1;
                      newMembers.splice(insertAt, 0, removed);
                      console.log('✅ Reordering:', { 
                        from: draggedIndex, 
                        to: targetIndex, 
                        insertAt,
                        before: members.map(m => m.name || m.username),
                        after: newMembers.map(m => m.name || m.username)
                      });
                      setMembers(newMembers);
                      // persist immediately
                      persistOrder(newMembers);
                      setDraggingId(null);
                      setPlaceholderIndex(null);
                    }}
                    style={{ transition: 'transform 180ms ease, opacity 150ms', opacity: isDragging ? 0.3 : 1 }}
                  >
                    <Table.Td style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer?.setData('text/plain', member.id);
                          if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
                          setDraggingId(member.id);
                          setPlaceholderIndex(index);
                        }}
                        onDragEnd={() => { setDraggingId(null); setPlaceholderIndex(null); }}
                        onTouchStart={(e) => {
                          console.log('📱 Touch start for member:', member.name || member.username);
                          const touch = e.touches[0];
                          setDraggingId(member.id);
                          setPlaceholderIndex(index);

                          // create ghost element
                          const ghost = document.createElement('div');
                          ghost.style.position = 'absolute';
                          ghost.style.top = `${touch.clientY + 8}px`;
                          ghost.style.left = `${touch.clientX + 8}px`;
                          ghost.style.padding = '8px 12px';
                          ghost.style.background = 'rgba(0,0,0,0.75)';
                          ghost.style.color = 'white';
                          ghost.style.borderRadius = '6px';
                          ghost.style.zIndex = '9999';
                          ghost.style.pointerEvents = 'none';
                          ghost.style.boxShadow = '0 6px 18px rgba(0,0,0,0.2)';
                          ghost.textContent = member.name || member.username || 'Member';
                          document.body.appendChild(ghost);
                          ghostRef.current = ghost;

                          const onTouchMove = (ev: TouchEvent) => {
                            // Only prevent default if we can actually cancel the event
                            if (ev.cancelable) {
                              ev.preventDefault();
                            }
                            console.log('📱 Touch move, placeholder index:', placeholderIndex);
                            const t = ev.touches[0];
                            if (ghostRef.current) {
                              ghostRef.current.style.top = `${t.clientY + 8}px`;
                              ghostRef.current.style.left = `${t.clientX + 8}px`;
                            }
                            const rects = members.map(m => {
                              const r = rowRefs.current[m.id];
                              return r ? r.getBoundingClientRect() : null;
                            });
                            console.log('📱 Touch move - rects:', rects.map((r, i) => r ? `${i}: valid` : `${i}: null`));
                            console.log('📱 Touch move - touch Y:', t.clientY);
                            let foundIndex = members.length; // allow drop after last row
                            for (let i = 0; i < rects.length; i++) {
                              const r = rects[i];
                              if (!r) {
                                console.log(`📱 Touch move - rect ${i} is null, skipping`);
                                continue;
                              }
                              console.log(`📱 Touch move - checking rect ${i}: top=${r.top}, height=${r.height}, midpoint=${r.top + r.height / 2}`);
                              if (t.clientY < r.top + r.height / 2) {
                                console.log(`📱 Touch move - found drop position at index ${i}`);
                                foundIndex = i;
                                break;
                              }
                            }
                            console.log('📱 Touch move - calculated foundIndex:', foundIndex);
                            currentPlaceholderIndex.current = foundIndex;
                            setPlaceholderIndex(foundIndex);
                          };

                          const onTouchEnd = (ev: TouchEvent) => {
                            console.log('📱 Touch end triggered');
                            if (ev.cancelable) {
                              ev.preventDefault();
                            }
                            if (ghostRef.current) {
                              try { document.body.removeChild(ghostRef.current); } catch (e) {}
                              ghostRef.current = null;
                            }
                            document.removeEventListener('touchmove', onTouchMove);
                            document.removeEventListener('touchend', onTouchEnd);

                            const finalIndex = currentPlaceholderIndex.current ?? index;
                            const draggedIndex = members.findIndex(m => m.id === member.id);
                            console.log('📱 Touch end - draggedIndex:', draggedIndex, 'finalIndex:', finalIndex);
                            if (draggedIndex !== -1 && finalIndex !== draggedIndex && finalIndex !== draggedIndex + 1) {
                              console.log('📱 Touch end - will reorder');
                              const newMembers = [...members];
                              const [removed] = newMembers.splice(draggedIndex, 1);
                              let insertAt = finalIndex;
                              if (draggedIndex < finalIndex) insertAt = finalIndex - 1;
                              newMembers.splice(insertAt, 0, removed);
                              setMembers(newMembers);
                              // persist immediately
                              console.log('📱 Touch end - calling persistOrder');
                              persistOrder(newMembers);
                            } else {
                              console.log('📱 Touch end - no reorder needed');
                            }
                            setDraggingId(null);
                            setPlaceholderIndex(null);
                            currentPlaceholderIndex.current = null;
                          };

                          document.addEventListener('touchmove', onTouchMove, { passive: false });
                          document.addEventListener('touchend', onTouchEnd, { passive: false });
                        }}
                        style={{ cursor: 'grab', padding: '4px 8px', borderRadius: 4, userSelect: 'none', display: 'inline-flex', alignItems: 'center', transition: 'transform 120ms' }}
                        aria-label={`Drag handle for ${member.name || member.username || 'member'}`}
                        title="Drag to reorder"
                      >
                        <span style={{ fontSize: 14, lineHeight: 1 }}>≡</span>
                      </div>
                      <div>{member.name || member.username || 'Unknown'}</div>
                    </Table.Td>
                    <Table.Td>{member.username || '-'}</Table.Td>
                    <Table.Td>{member.role || 'FamilyMember'}</Table.Td>
                    <Table.Td style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      {member.id !== family?.members?.find((m: any) => m.id === member.id)?.id || member.id !== members.find((m: any) => m.id === member.id)?.id ? (
                        <ActionIcon color="red" variant="light" onClick={() => handleDeleteMember(member.id, member.name || member.username || 'Unknown')}>
                          <IconTrash size={16} />
                        </ActionIcon>
                      ) : (
                        <Text size="xs" c="dimmed">(You)</Text>
                      )}
                    </Table.Td>
                  </Table.Tr>
                </React.Fragment>
              );
              })}
              {placeholderIndex === members.length && draggingId !== null && (
                <Table.Tr>
                  <Table.Td colSpan={4} style={{ padding: 8 }}>
                    <div style={{ height: 8, background: 'linear-gradient(90deg,#4c9aff, #6ad0ff)', borderRadius: 4, transition: 'height 200ms' }} />
                  </Table.Td>
                </Table.Tr>
              )}
          </Table.Tbody>
        </Table>
      )}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
  <Button onClick={() => persistOrder()} loading={savingOrder} disabled={members.length === 0}>Save Order</Button>
      </div>
      <Modal opened={showMemberModal} onClose={() => setShowMemberModal(false)} title="Add Family Member" size="lg">
        <form onSubmit={memberForm.onSubmit(handleCreateMember)}>
          <Stack>
            <TextInput
              label="Name"
              placeholder="Enter member name"
              {...memberForm.getInputProps('name')}
            />
            <Group>
                            <label>
                <input
                  type="checkbox"
                  checked={memberForm.values.canLogin}
                  onChange={(e) => memberForm.setFieldValue('canLogin', e.target.checked)}
                  style={{ marginRight: 8 }}
                />
                Can log in?
              </label>
            </Group>
            {memberForm.values.canLogin && (
              <>
                <TextInput
                  label="Username"
                  placeholder="Enter username"
                  {...memberForm.getInputProps('username')}
                />
                <TextInput
                  label="Password"
                  placeholder="Minimum 8 chars, upper/lower/number/symbol"
                  type="password"
                  {...memberForm.getInputProps('password')}
                />
                <Select
                  label="Role"
                  data={[{ value: 'FamilyMember', label: 'Family Member' }, { value: 'FamilyAdmin', label: 'Family Admin' }]}
                  {...memberForm.getInputProps('role')}
                />
              </>
            )}
            <Group justify="flex-end">
              <Button variant="light" onClick={() => setShowMemberModal(false)}>
                Cancel
              </Button>
              <Button type="submit">Add Member</Button>
            </Group>
          </Stack>
        </form>
      </Modal>
    </Container>
  );
}