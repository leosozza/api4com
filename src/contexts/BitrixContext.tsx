import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode, useRef } from 'react';
import type { BX24, BX24Auth, BX24CallMethodResult, BX24UserInfo } from '@/types/bitrix24';
import { supabase } from '@/integrations/supabase/client';
import type { User } from '@supabase/supabase-js';

interface BitrixContextState {
  isInitialized: boolean;
  isLoading: boolean;
  isInBitrix: boolean;
  auth: BX24Auth | null;
  currentUser: BX24UserInfo | null;
  companyId: string | null;
  isAdmin: boolean;
  error: string | null;
  supabaseUser: User | null;
}

interface BitrixContextValue extends BitrixContextState {
  callMethod: <T = unknown>(
    method: string,
    params?: Record<string, unknown>
  ) => Promise<T>;
  refreshAuth: () => Promise<BX24Auth | null>;
  resizeWindow: (width: number, height: number) => void;
  fitWindow: () => void;
  isAuthenticated: boolean;
}

const BitrixContext = createContext<BitrixContextValue | null>(null);

interface BitrixProviderProps {
  children: ReactNode;
}

// Progressive retry intervals for BX24 SDK detection (in ms)
const BX24_RETRY_INTERVALS = [1000, 2000, 3000, 4000, 5000]; // Total: 15s max wait

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
    supabaseUser: null,
  });
  
  const initAttemptedRef = useRef(false);
  const bx24InitializedRef = useRef(false);

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

  // Ensure Supabase anonymous auth
  const ensureSupabaseAuth = useCallback(async (): Promise<User | null> => {
    try {
      // Check for existing session
      const { data: { session } } = await supabase.auth.getSession();
      
      if (session?.user) {
        console.log('[BitrixContext] Existing Supabase session found:', session.user.id);
        return session.user;
      }

      // No session - sign in anonymously
      console.log('[BitrixContext] No session, signing in anonymously...');
      const { data, error } = await supabase.auth.signInAnonymously();
      
      if (error) {
        console.error('[BitrixContext] Anonymous sign-in error:', error);
        return null;
      }
      
      console.log('[BitrixContext] Anonymous sign-in successful:', data.user?.id);
      return data.user;
    } catch (error) {
      console.error('[BitrixContext] Error ensuring Supabase auth:', error);
      return null;
    }
  }, []);

  // Listen for Supabase auth changes and re-establish session if signed out
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('[BitrixContext] Auth state changed:', event, session?.user?.id);
      setState(prev => ({ ...prev, supabaseUser: session?.user ?? null }));
      
      // If signed out, automatically re-establish anonymous session
      if (event === 'SIGNED_OUT') {
        console.log('[BitrixContext] Signed out detected, re-establishing anonymous session...');
        setTimeout(() => {
          ensureSupabaseAuth();
        }, 0);
      }
    });

    return () => subscription.unsubscribe();
  }, [ensureSupabaseAuth]);

  // Initialize BX24 SDK with the given supabase user
  const initializeBX24 = useCallback(async (supabaseUser: User | null) => {
    if (bx24InitializedRef.current) {
      console.log('[BitrixContext] BX24 already initialized, skipping');
      return;
    }

    const bx24 = getBX24();
    
    if (!bx24) {
      console.log('[BitrixContext] BX24 SDK not found - running in development mode');
      setState(prev => ({
        ...prev,
        isInitialized: true,
        isLoading: false,
        isInBitrix: false,
        supabaseUser,
      }));
      return;
    }

    bx24InitializedRef.current = true;
    console.log('[BitrixContext] Initializing BX24 SDK...');

    // Initialize BX24 SDK
    bx24.init(async () => {
      console.log('[BitrixContext] BX24 SDK initialized');
      
      const auth = bx24.getAuth();
      const isAdmin = bx24.isAdmin();

      if (!auth) {
        setState(prev => ({
          ...prev,
          isInitialized: true,
          isLoading: false,
          isInBitrix: true,
          supabaseUser,
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
        console.error('[BitrixContext] Error during initialization:', error);
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
        supabaseUser,
      });

      // Fit window to content
      bx24.fitWindow();
    });
  }, [getBX24, callMethod, findOrCreateCompany]);

  // Initialize with progressive retries for BX24 detection
  useEffect(() => {
    if (initAttemptedRef.current) return;
    initAttemptedRef.current = true;

    const startInit = async () => {
      // First, ensure Supabase auth
      const supabaseUser = await ensureSupabaseAuth();
      
      // If BX24 is already available, initialize immediately
      if (window.BX24) {
        console.log('[BitrixContext] BX24 available immediately');
        initializeBX24(supabaseUser);
        return;
      }

      // Progressive retry for BX24 detection
      let retryIndex = 0;
      let totalWait = 0;
      
      const attemptInit = () => {
        if (window.BX24) {
          console.log(`[BitrixContext] BX24 found after ${totalWait}ms`);
          initializeBX24(supabaseUser);
          return;
        }

        if (retryIndex < BX24_RETRY_INTERVALS.length) {
          const waitTime = BX24_RETRY_INTERVALS[retryIndex];
          totalWait += waitTime;
          console.log(`[BitrixContext] BX24 not found, retry ${retryIndex + 1} in ${waitTime}ms (total: ${totalWait}ms)`);
          retryIndex++;
          setTimeout(attemptInit, waitTime);
        } else {
          // All retries exhausted - fall back to dev mode
          console.log(`[BitrixContext] BX24 not found after ${totalWait}ms - running in development mode`);
          setState(prev => ({
            ...prev,
            isInitialized: true,
            isLoading: false,
            isInBitrix: false,
            supabaseUser,
          }));
        }
      };

      // Start retry loop
      attemptInit();
    };

    startInit();
  }, [ensureSupabaseAuth, initializeBX24]);

  // Watch for late BX24 appearance (if it loads after we went to dev mode)
  useEffect(() => {
    if (state.isInitialized && !state.isInBitrix && !bx24InitializedRef.current) {
      // Check periodically if BX24 becomes available
      const checkInterval = setInterval(() => {
        if (window.BX24) {
          console.log('[BitrixContext] BX24 appeared late, re-initializing...');
          clearInterval(checkInterval);
          initializeBX24(state.supabaseUser);
        }
      }, 1000);

      // Stop checking after 30 seconds
      const stopTimeout = setTimeout(() => {
        clearInterval(checkInterval);
      }, 30000);

      return () => {
        clearInterval(checkInterval);
        clearTimeout(stopTimeout);
      };
    }
  }, [state.isInitialized, state.isInBitrix, state.supabaseUser, initializeBX24]);

  const value: BitrixContextValue = {
    ...state,
    callMethod,
    refreshAuth,
    resizeWindow,
    fitWindow,
    isAuthenticated: !!state.supabaseUser,
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
