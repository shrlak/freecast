export interface RemoteClient { id: string; name: string; connected: boolean; requested: boolean }
export interface RemoteControlState { type: 'remote-control'; selfId: string | null; controllerId: string | null; canControl: boolean; clients: RemoteClient[] }
