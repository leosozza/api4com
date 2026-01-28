// TypeScript declarations for Bitrix24 BX24 SDK

export interface BX24Auth {
  access_token: string;
  refresh_token: string;
  domain: string;
  member_id: string;
  client_endpoint: string;
  expires_in: number;
}

export interface BX24Placement {
  placement: string;
  options: Record<string, unknown>;
}

export interface BX24CallMethodResult<T = unknown> {
  result: T;
  error?: string;
  error_description?: string;
  total?: number;
  next?: number;
}

export interface BX24UserInfo {
  ID: string;
  NAME: string;
  LAST_NAME: string;
  EMAIL: string;
  PERSONAL_PHOTO?: string;
  WORK_POSITION?: string;
  UF_DEPARTMENT?: number[];
  IS_ONLINE?: 'Y' | 'N';
}

export interface BX24 {
  // Initialization
  init(callback: () => void): void;
  install(callback?: () => void): void;
  installFinish(): void;
  
  // Authentication
  getAuth(): BX24Auth | null;
  refreshAuth(callback: (auth: BX24Auth) => void): void;
  
  // REST API calls
  callMethod<T = unknown>(
    method: string,
    params?: Record<string, unknown>,
    callback?: (result: BX24CallMethodResult<T>) => void
  ): void;
  
  callBatch(
    calls: Record<string, { method: string; params?: Record<string, unknown> }>,
    callback?: (results: Record<string, BX24CallMethodResult>) => void,
    bHalt?: boolean
  ): void;
  
  // User info
  isAdmin(): boolean;
  getLang(): string;
  
  // Placement API
  placement: {
    info(): BX24Placement;
    getInterface(callback: (data: unknown) => void): void;
    call(command: string, params?: Record<string, unknown>, callback?: () => void): void;
    bindEvent(eventName: string, callback: (data: unknown) => void): void;
  };
  
  // UI helpers
  resizeWindow(width: number, height: number, callback?: () => void): void;
  fitWindow(callback?: () => void): void;
  reloadWindow(callback?: () => void): void;
  setTitle(title: string, callback?: () => void): void;
  scrollParentWindow(scroll: number, callback?: () => void): void;
  
  // Selection dialogs
  selectUser(callback: (user: BX24UserInfo | null) => void): void;
  selectUsers(callback: (users: BX24UserInfo[]) => void): void;
  selectAccess(params: unknown, callback: (access: unknown) => void): void;
  selectCRM(params: unknown, callback: (items: unknown) => void): void;
  
  // App options
  appOption: {
    get(name: string): string | null;
    set(name: string, value: string, callback?: () => void): void;
  };
  
  // User options
  userOption: {
    get(name: string): string | null;
    set(name: string, value: string, callback?: () => void): void;
  };
}

declare global {
  interface Window {
    BX24?: BX24;
  }
}

export {};
