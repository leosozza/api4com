import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import type { BX24, BX24Auth, BX24CallMethodResult, BX24UserInfo } from '@/types/bitrix24';
import { supabase } from '@/integrations/supabase/client';

interface BitrixContextState {
  isInitialized: boolean;
  isLoading: boolean;
  isInBitrix: boolean;
  auth: BX24Auth | null;
  currentUser: BX24UserInfo | null;
  companyId: string | null;
  isAdmin: boolean;
  error: string | null;
}

interface BitrixContextValue extends BitrixContextState {
  callMethod: <T = unknown>(
    method: string,
    params?: Record<string, unknown>
  ) => Promise<T>;
  refreshAuth: () => Promise<BX24Auth | null>;
  resizeWindow: (width: number, height: number) => void;
  fitWindow: () => void;
}

const BitrixContext = createContext<BitrixContextValue | null>(null);

interface BitrixProviderProps {
  children: ReactNode;
}

export function BitrixProvider({ children }: BitrixProviderProps) {
  const [state, setState] = useState<BitrixContextState>({
    isInitialized: false,
    isLoading: true,
    isInBitrix: false,
    auth: null,
    currentUser: null,
    companyId: null,
    isAdmin: false,
    error: null,
  });

  const getBX24 = useCallback((): BX24 | null => {
    return window.BX24 || null;
  }, []);

  const callMethod = useCallback(<T = unknown>(
    method: string,
    params?: Record<string, unknown>
  ): Promise<T> => {
    return new Promise((resolve, reject) => {
      const bx24 = getBX24();
      if (!bx24) {
        reject(new Error('BX24 SDK not available'));
        return;
      }

      bx24.callMethod<T>(method, params, (result: BX24CallMethodResult<T>) => {
        if (result.error) {
          reject(new Error(result.error_description || result.error));
        } else {
          resolve(result.result);
        }
      });
    });
  }, [getBX24]);

  const refreshAuth = useCallback((): Promise<BX24Auth | null> => {
    return new Promise((resolve) => {
      const bx24 = getBX24();
      if (!bx24) {
        resolve(null);
        return;
      }

      bx24.refreshAuth((auth: BX24Auth) => {
        setState(prev => ({ ...prev, auth }));
        resolve(auth);
      });
    });
  }, [getBX24]);

  const resizeWindow = useCallback((width: number, height: number) => {
    const bx24 = getBX24();
    if (bx24) {
      bx24.resizeWindow(width, height);
    }
  }, [getBX24]);

  const fitWindow = useCallback(() => {
    const bx24 = getBX24();
    if (bx24) {
      bx24.fitWindow();
    }
  }, [getBX24]);

  // Find or create company based on Bitrix member_id
  const findOrCreateCompany = useCallback(async (auth: BX24Auth): Promise<string | null> => {
    try {
      // First, try to find existing company by member_id
      const { data: existingCompany, error: findError } = await supabase
        .from('companies')
        .select('id')
        .eq('bitrix_member_id', auth.member_id)
        .maybeSingle();

      if (findError) {
        console.error('Error finding company:', findError);
        return null;
      }

      if (existingCompany) {
        return existingCompany.id;
      }

      // Company doesn't exist - it will be created during installation
      // For now, return null and the app will show setup wizard
      return null;
    } catch (error) {
      console.error('Error in findOrCreateCompany:', error);
      return null;
    }
  }, []);

  // Fetch current user info from Bitrix
  const fetchCurrentUser = useCallback(async (): Promise<BX24UserInfo | null> => {
    try {
      const user = await callMethod<BX24UserInfo>('user.current');
      return user;
    } catch (error) {
      console.error('Error fetching current user:', error);
      return null;
    }
  }, [callMethod]);

  // Initialize BX24 SDK
  useEffect(() => {
    const initBitrix = () => {
      const bx24 = getBX24();
      
      if (!bx24) {
        // Not in Bitrix iframe - development mode
        console.log('BX24 SDK not found - running in development mode');
        setState(prev => ({
          ...prev,
          isInitialized: true,
          isLoading: false,
          isInBitrix: false,
        }));
        return;
      }

      // Initialize BX24 SDK
      bx24.init(async () => {
        console.log('BX24 SDK initialized');
        
        const auth = bx24.getAuth();
        const isAdmin = bx24.isAdmin();

        if (!auth) {
          setState(prev => ({
            ...prev,
            isInitialized: true,
            isLoading: false,
            isInBitrix: true,
            error: 'Failed to get authentication data',
          }));
          return;
        }

        // Fetch current user and company
        let currentUser: BX24UserInfo | null = null;
        let companyId: string | null = null;

        try {
          currentUser = await callMethod<BX24UserInfo>('user.current');
          companyId = await findOrCreateCompany(auth);
        } catch (error) {
          console.error('Error during initialization:', error);
        }

        setState({
          isInitialized: true,
          isLoading: false,
          isInBitrix: true,
          auth,
          currentUser,
          companyId,
          isAdmin,
          error: null,
        });

        // Fit window to content
        bx24.fitWindow();
      });
    };

    // Wait for BX24 script to load
    if (window.BX24) {
      initBitrix();
    } else {
      // Check periodically for BX24 availability
      const checkInterval = setInterval(() => {
        if (window.BX24) {
          clearInterval(checkInterval);
          initBitrix();
        }
      }, 100);

      // Timeout after 3 seconds - assume development mode
      setTimeout(() => {
        clearInterval(checkInterval);
        if (!window.BX24) {
          console.log('BX24 SDK timeout - running in development mode');
          setState(prev => ({
            ...prev,
            isInitialized: true,
            isLoading: false,
            isInBitrix: false,
          }));
        }
      }, 3000);
    }
  }, [getBX24, callMethod, findOrCreateCompany]);

  const value: BitrixContextValue = {
    ...state,
    callMethod,
    refreshAuth,
    resizeWindow,
    fitWindow,
  };

  return (
    <BitrixContext.Provider value={value}>
      {children}
    </BitrixContext.Provider>
  );
}

export function useBitrixContext(): BitrixContextValue {
  const context = useContext(BitrixContext);
  if (!context) {
    throw new Error('useBitrixContext must be used within a BitrixProvider');
  }
  return context;
}

export { BitrixContext };
