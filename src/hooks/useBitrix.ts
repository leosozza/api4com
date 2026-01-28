import { useCallback } from 'react';
import { useBitrixContext } from '@/contexts/BitrixContext';
import type { BX24UserInfo } from '@/types/bitrix24';

interface TelephonyCallParams {
  USER_ID: string;
  PHONE_NUMBER: string;
  LINE_NUMBER?: string;
  CALL_LIST_ID?: number;
  [key: string]: unknown;
}

interface TelephonyRegisterParams {
  USER_ID: string;
  PHONE_NUMBER: string;
  TYPE: 1 | 2; // 1 = outbound, 2 = inbound
  LINE_NUMBER?: string;
  CRM_CREATE?: 0 | 1;
  SHOW?: 0 | 1;
  [key: string]: unknown;
}

interface TelephonyFinishParams {
  CALL_ID: string;
  USER_ID: string;
  DURATION: number;
  STATUS_CODE?: string;
  RECORD_URL?: string;
  ADD_TO_CHAT?: 0 | 1;
  [key: string]: unknown;
}

export function useBitrix() {
  const context = useBitrixContext();

  // Telephony methods
  const registerExternalCall = useCallback(async (params: TelephonyRegisterParams): Promise<{ CALL_ID: string }> => {
    return context.callMethod<{ CALL_ID: string }>('telephony.externalcall.register', params);
  }, [context]);

  const finishExternalCall = useCallback(async (params: TelephonyFinishParams): Promise<unknown> => {
    return context.callMethod('telephony.externalcall.finish', params);
  }, [context]);

  const showExternalCall = useCallback(async (callId: string, userId: string): Promise<unknown> => {
    return context.callMethod('telephony.externalcall.show', {
      CALL_ID: callId,
      USER_ID: userId,
    });
  }, [context]);

  const hideExternalCall = useCallback(async (callId: string, userId: string): Promise<unknown> => {
    return context.callMethod('telephony.externalcall.hide', {
      CALL_ID: callId,
      USER_ID: userId,
    });
  }, [context]);

  // CRM methods
  const searchCrmByPhone = useCallback(async (phone: string): Promise<unknown> => {
    return context.callMethod('crm.duplicate.findbycomm', {
      TYPE: 'PHONE',
      VALUES: [phone],
    });
  }, [context]);

  const createLead = useCallback(async (data: Record<string, unknown>): Promise<{ ID: string }> => {
    return context.callMethod<{ ID: string }>('crm.lead.add', { fields: data });
  }, [context]);

  // User methods
  const getUsers = useCallback(async (filter?: Record<string, unknown>): Promise<BX24UserInfo[]> => {
    return context.callMethod<BX24UserInfo[]>('user.get', { filter: filter || {} });
  }, [context]);

  const getCurrentUser = useCallback(async (): Promise<BX24UserInfo> => {
    return context.callMethod<BX24UserInfo>('user.current');
  }, [context]);

  // Event binding
  const bindEvent = useCallback(async (event: string, handler: string): Promise<unknown> => {
    return context.callMethod('event.bind', {
      EVENT: event,
      HANDLER: handler,
    });
  }, [context]);

  const unbindEvent = useCallback(async (event: string, handler: string): Promise<unknown> => {
    return context.callMethod('event.unbind', {
      EVENT: event,
      HANDLER: handler,
    });
  }, [context]);

  // External line registration
  const registerExternalLine = useCallback(async (lineNumber: string, lineName: string): Promise<unknown> => {
    return context.callMethod('telephony.externalLine.add', {
      NUMBER: lineNumber,
      NAME: lineName,
    });
  }, [context]);

  const getExternalLines = useCallback(async (): Promise<unknown[]> => {
    return context.callMethod<unknown[]>('telephony.externalLine.get');
  }, [context]);

  return {
    // Context values
    isInitialized: context.isInitialized,
    isLoading: context.isLoading,
    isInBitrix: context.isInBitrix,
    auth: context.auth,
    currentUser: context.currentUser,
    companyId: context.companyId,
    linkedCompany: context.linkedCompany,
    isAdmin: context.isAdmin,
    error: context.error,

    // Generic method
    callMethod: context.callMethod,
    refreshAuth: context.refreshAuth,

    // UI methods
    resizeWindow: context.resizeWindow,
    fitWindow: context.fitWindow,

    // Telephony methods
    registerExternalCall,
    finishExternalCall,
    showExternalCall,
    hideExternalCall,

    // CRM methods
    searchCrmByPhone,
    createLead,

    // User methods
    getUsers,
    getCurrentUser,

    // Event methods
    bindEvent,
    unbindEvent,

    // External lines
    registerExternalLine,
    getExternalLines,
  };
}
