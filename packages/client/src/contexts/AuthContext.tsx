import { createContext, useContext, ReactNode } from 'react';
import { useConvexAuth } from 'convex/react';
import { useAuthActions } from '@convex-dev/auth/react';

interface User {
  id: string;
  email?: string;
}

interface AuthResult {
  signingIn: boolean;
}

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  signIn: (email: string, password: string) => Promise<AuthResult>;
  signUp: (email: string, password: string, name?: string) => Promise<AuthResult>;
  signOut: () => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  verifyEmail: (email: string, code: string) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  confirmResetPassword: (email: string, code: string, newPassword: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps): JSX.Element {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const { signIn, signOut } = useAuthActions();

  const handleSignIn = async (email: string, password: string): Promise<AuthResult> => {
    const result = await signIn('password', { email, password, flow: 'signIn' });
    // signingIn will be false if verification is needed
    return { signingIn: result.signingIn };
  };

  const handleSignUp = async (email: string, password: string, name?: string): Promise<AuthResult> => {
    const params: Record<string, string> = { email, password, flow: 'signUp' };
    if (name) {
      params.name = name;
    }
    const result = await signIn('password', params);
    // signingIn will be false if verification is needed
    return { signingIn: result.signingIn };
  };

  const handleSignOut = async () => {
    await signOut();
  };

  const handleSignInWithGoogle = async () => {
    await signIn('google');
  };

  const handleVerifyEmail = async (email: string, code: string) => {
    await signIn('password', { email, code, flow: 'email-verification' });
  };

  const handleResetPassword = async (email: string) => {
    await signIn('password', { email, flow: 'reset' });
  };

  const handleConfirmResetPassword = async (email: string, code: string, newPassword: string) => {
    await signIn('password', { email, code, newPassword, flow: 'reset-verification' });
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
    verifyEmail: handleVerifyEmail,
    resetPassword: handleResetPassword,
    confirmResetPassword: handleConfirmResetPassword,
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
