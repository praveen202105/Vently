import { FocusService } from './focus.service.js';

describe('FocusService', () => {
  let service: FocusService;

  beforeEach(() => {
    service = new FocusService();
  });

  it('tracks visible sockets per user and clears a disconnected socket', () => {
    service.setVisibility('user-a', 'socket-1', true);
    service.setVisibility('user-a', 'socket-2', true);

    expect(service.isUserVisible('user-a')).toBe(true);

    service.clearSocket('socket-1');
    expect(service.isUserVisible('user-a')).toBe(true);

    service.clearSocket('socket-2');
    expect(service.isUserVisible('user-a')).toBe(false);
  });

  it('can mark a visible socket hidden without clearing other users', () => {
    service.setVisibility('user-a', 'socket-1', true);
    service.setVisibility('user-b', 'socket-2', true);

    service.setVisibility('user-a', 'socket-1', false);

    expect(service.isUserVisible('user-a')).toBe(false);
    expect(service.isUserVisible('user-b')).toBe(true);
  });
});
