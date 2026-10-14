import type { FabricObject } from 'fabric';

export interface ExtendedFabricObject extends FabricObject {
    id?: string;
    __skipEmit?: boolean;
}

export interface SocketDetails {
    clientId?: string | null;
}

export interface SerializedObjectData {
    id?: string;
    type?: string;
    [key: string]: unknown;
}