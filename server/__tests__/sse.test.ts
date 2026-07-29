import { afterEach, describe, expect, it, vi } from 'vitest';
import { addClient, broadcastEvent, getClients, removeClient } from '../sse';

type MockResponse = {
  write: ReturnType<typeof vi.fn>;
  end: ReturnType<typeof vi.fn>;
};

function makeReq(user: { id: string; role: string; familyId: string | null }, clientId: string) {
  return {
    ip: '127.0.0.1',
    headers: {
      'user-agent': `vitest-${clientId}`,
      'x-client-id': clientId,
    },
    socket: { remoteAddress: '127.0.0.1', remotePort: 4000 + Number(clientId.replace(/\D/g, '') || 1) },
    user,
  } as any;
}

function makeRes(): MockResponse {
  return {
    write: vi.fn(),
    end: vi.fn(),
  };
}

async function flushImmediate() {
  await new Promise(resolve => setImmediate(resolve));
}

describe('sse family event scoping', () => {
  const addedResponses: MockResponse[] = [];

  afterEach(() => {
    for (const res of addedResponses.splice(0)) {
      removeClient(res as any);
    }
    expect(getClients()).toHaveLength(0);
  });

  it('sends family_active_list_changed only to matching family and SystemAdmin clients', async () => {
    const family1Res = makeRes();
    const family2Res = makeRes();
    const adminRes = makeRes();

    addClient(family1Res as any, makeReq({ id: 'u1', role: 'FamilyAdmin', familyId: 'family-1' }, 'c1'));
    addClient(family2Res as any, makeReq({ id: 'u2', role: 'FamilyMember', familyId: 'family-2' }, 'c2'));
    addClient(adminRes as any, makeReq({ id: 'u3', role: 'SystemAdmin', familyId: null }, 'c3'));
    addedResponses.push(family1Res, family2Res, adminRes);

    broadcastEvent({ type: 'family_active_list_changed', familyId: 'family-1', listId: 'list-9' });
    await flushImmediate();

    expect(family1Res.write).toHaveBeenCalledTimes(1);
    expect(adminRes.write).toHaveBeenCalledTimes(1);
    expect(family2Res.write).not.toHaveBeenCalled();
  });

  it('continues broadcasting non-family-scoped events to all clients', async () => {
    const firstRes = makeRes();
    const secondRes = makeRes();

    addClient(firstRes as any, makeReq({ id: 'u10', role: 'FamilyAdmin', familyId: 'family-1' }, 'c10'));
    addClient(secondRes as any, makeReq({ id: 'u11', role: 'FamilyMember', familyId: 'family-2' }, 'c11'));
    addedResponses.push(firstRes, secondRes);

    broadcastEvent({ type: 'packing_list_changed', listId: 'list-1' });
    await flushImmediate();

    expect(firstRes.write).toHaveBeenCalledTimes(1);
    expect(secondRes.write).toHaveBeenCalledTimes(1);
  });
});
