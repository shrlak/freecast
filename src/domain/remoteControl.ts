import type { ConnectionQuality } from './connectionQuality';
export interface RemoteClient { id: string; name: string; connected: boolean; requested: boolean; role?: 'remote' | 'team'; quality?: ConnectionQuality | null }
export interface RemoteControlState { type: 'remote-control'; selfId: string | null; controllerId: string | null; canControl: boolean; clients: RemoteClient[] }
