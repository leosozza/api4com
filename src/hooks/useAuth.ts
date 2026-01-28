import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { User, Session } from '@supabase/supabase-js';

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setIsLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      setIsLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;
    return data;
  };

  const signUp = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    });
    if (error) throw error;
    return data;
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  };

  // Reset session: sign out then immediately sign in anonymously
  // This ensures we always have a valid session for RLS/edge functions
  const resetSession = async () => {
    console.log('Resetting session...');
    try {
      // First sign out
      await supabase.auth.signOut();
      console.log('Signed out, creating new anonymous session...');
      
      // Then sign in anonymously
      const { data, error } = await supabase.auth.signInAnonymously();
      if (error) {
        console.error('Failed to create anonymous session:', error);
        throw error;
      }
      
      console.log('New anonymous session created:', data.user?.id);
      return data;
    } catch (error) {
      console.error('Reset session failed:', error);
      throw error;
    }
  };

  // Ensure we have a valid session (create anonymous if needed)
  const ensureSession = async (): Promise<Session | null> => {
    console.log('Ensuring session exists...');
    
    // Check current session
    const { data: { session: currentSession } } = await supabase.auth.getSession();
    
    if (currentSession) {
      console.log('Session exists:', currentSession.user.id);
      return currentSession;
    }
    
    console.log('No session found, creating anonymous session...');
    
    // No session - try to sign in anonymously
    const { data, error } = await supabase.auth.signInAnonymously();
    
    if (error) {
      console.error('Failed to create anonymous session:', error);
      return null;
    }
    
    console.log('Anonymous session created:', data.user?.id);
    return data.session;
  };

  return {
    user,
    session,
    isLoading,
    isAuthenticated: !!session,
    signIn,
    signUp,
    signOut,
    resetSession,
    ensureSession,
  };
}
