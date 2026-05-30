import { GUARDS_METADATA } from '@nestjs/common/constants';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { AiMemoryController } from './ai-memory.controller.js';
import type { AiMemoryService } from './ai-memory.service.js';

describe('AiMemoryController', () => {
  let service: {
    getStatus: jest.Mock;
    setEnabled: jest.Mock;
    clear: jest.Mock;
  };
  let controller: AiMemoryController;

  beforeEach(() => {
    service = {
      getStatus: jest.fn(),
      setEnabled: jest.fn(),
      clear: jest.fn(),
    };
    controller = new AiMemoryController(service as unknown as AiMemoryService);
  });

  it('requires JWT auth at controller level', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, AiMemoryController);

    expect(guards).toContain(JwtAuthGuard);
  });

  it('reads memory status for the current user', () => {
    controller.status({ userId: 'user-a', email: 'a@example.com', role: 'USER' });

    expect(service.getStatus).toHaveBeenCalledWith('user-a');
  });

  it('updates memory preference for the current user', () => {
    controller.update(
      { userId: 'user-a', email: 'a@example.com', role: 'USER' },
      { enabled: true },
    );

    expect(service.setEnabled).toHaveBeenCalledWith('user-a', true);
  });

  it('clears memory for the current user', async () => {
    await controller.clear({ userId: 'user-a', email: 'a@example.com', role: 'USER' });

    expect(service.clear).toHaveBeenCalledWith('user-a');
  });
});
