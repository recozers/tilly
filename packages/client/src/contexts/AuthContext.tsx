import { createContext, useContext, ReactNode } from 'react';
import { useConvexAuth } from 'convex/react';
import { useAuthActions } from '@convex-dev/auth/react';

interface User {
  id: string;
  email?: string;
}

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  signInWithGoogle: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps): JSX.Element {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const { signIn, signOut } = useAuthActions();

  const handleSignIn = async (email: string, password: string) => {
    await signIn('password', { email, password, flow: 'signIn' });
  };

  const handleSignUp = async (email: string, password: string) => {
    await signIn('password', { email, password, flow: 'signUp' });
  };

  const handleSignOut = async () => {
    await signOut();
  };

  const handleSignInWithGoogle = async () => {
    await signIn('google');
  };

  // For Convex Auth, user info comes from the identity
  // We'll need to fetch it separately or get it from the auth state
  const user: User | null = isAuthenticated ? { id: 'authenticated', email: undefined } : null;

  const value: AuthContextValue = {
    user,
    isLoading,
    isAuthenticated,
    signIn: handleSignIn,
    signUp: handleSignUp,
    signOut: handleSignOut,
    signInWithGoogle: handleSignInWithGoogle,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuthContext(): AuthContextValue {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuthContext must be used within an AuthProvider');
  }
  return context;
}
