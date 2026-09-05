import { AppError } from '@/shared/utils.js';

type UserRole = 'admin' | 'member';

type AuthUser = {
  id: number | bigint;
  username: string;
  role?: UserRole;
  can_use_global_provider_account?: number | boolean;
};

type AuthLoginUser = Omit<AuthUser, 'role'> & {
  password_hash: string;
  /** Plain string on the DB row; normalized to UserRole before it is used. */
  role?: string;
};

function toUserRole(role: unknown): UserRole {
  return role === 'admin' ? 'admin' : 'member';
}

type AuthDependencies = {
  users: {
    hasUsers(): boolean;
    createUser(username: string, passwordHash: string, role: UserRole): AuthUser;
    getUserByUsername(username: string): AuthLoginUser | undefined;
    updateLastLogin(userId: number): void;
  };
  transaction: {
    begin(): void;
    commit(): void;
    rollback(): void;
  };
  hashPassword(password: string): Promise<string>;
  comparePassword(password: string, passwordHash: string): Promise<boolean>;
  generateToken(user: AuthUser): string;
  recordActivity?(entry: {
    userId: number;
    username: string;
    action: string;
    detail?: string;
  }): void;
};

function numericUserId(userId: number | bigint): number {
  return Number(userId);
}

function isUniqueConstraintError(error: unknown): boolean {
  return typeof error === 'object'
    && error !== null
    && 'code' in error
    && error.code === 'SQLITE_CONSTRAINT_UNIQUE';
}

/**
 * Creates the Auth application service around explicit persistence, crypto,
 * transaction, and token dependencies.
 */
export function createAuthService(dependencies: AuthDependencies) {
  return {
    getStatus() {
      return {
        needsSetup: !dependencies.users.hasUsers(),
        isAuthenticated: false,
      };
    },

    async register(usernameInput: unknown, passwordInput: unknown) {
      const username = typeof usernameInput === 'string' ? usernameInput : '';
      const password = typeof passwordInput === 'string' ? passwordInput : '';

      if (!username || !password) {
        throw new AppError('Username and password are required', {
          code: 'AUTH_CREDENTIALS_REQUIRED',
          statusCode: 400,
        });
      }
      if (username.length < 3 || password.length < 6) {
        throw new AppError(
          'Username must be at least 3 characters, password at least 6 characters',
          { code: 'AUTH_CREDENTIALS_TOO_SHORT', statusCode: 400 },
        );
      }

      dependencies.transaction.begin();
      try {
        // The very first account to register becomes the admin/owner of the
        // installation. Everyone who signs up afterwards is a member: they can
        // log in but see no projects until an admin grants access.
        const role: UserRole = dependencies.users.hasUsers() ? 'member' : 'admin';

        const passwordHash = await dependencies.hashPassword(password);
        const user = dependencies.users.createUser(username, passwordHash, role);
        const token = dependencies.generateToken({ ...user, role });
        dependencies.transaction.commit();
        dependencies.users.updateLastLogin(numericUserId(user.id));
        dependencies.recordActivity?.({
          userId: numericUserId(user.id),
          username: user.username,
          action: 'register',
          detail: role === 'admin' ? 'primeiro usuário (admin)' : 'aguardando liberação',
        });

        return {
          success: true,
          user: {
            id: user.id,
            username: user.username,
            role,
            can_use_global_provider_account: role === 'admin',
          },
          token,
        };
      } catch (error) {
        dependencies.transaction.rollback();
        if (isUniqueConstraintError(error)) {
          throw new AppError('Username already exists', {
            code: 'AUTH_USERNAME_CONFLICT',
            statusCode: 409,
          });
        }
        throw error;
      }
    },

    async login(usernameInput: unknown, passwordInput: unknown) {
      const username = typeof usernameInput === 'string' ? usernameInput : '';
      const password = typeof passwordInput === 'string' ? passwordInput : '';
      if (!username || !password) {
        throw new AppError('Username and password are required', {
          code: 'AUTH_CREDENTIALS_REQUIRED',
          statusCode: 400,
        });
      }

      const user = dependencies.users.getUserByUsername(username);
      const validPassword = user
        ? await dependencies.comparePassword(password, user.password_hash)
        : false;
      if (!user || !validPassword) {
        throw new AppError('Invalid username or password', {
          code: 'AUTH_INVALID_CREDENTIALS',
          statusCode: 401,
        });
      }

      dependencies.users.updateLastLogin(numericUserId(user.id));
      dependencies.recordActivity?.({
        userId: numericUserId(user.id),
        username: user.username,
        action: 'login',
      });
      return {
        success: true,
        user: {
          id: user.id,
          username: user.username,
          role: toUserRole(user.role),
          can_use_global_provider_account: Boolean(user.can_use_global_provider_account),
        },
        token: dependencies.generateToken({ ...user, role: toUserRole(user.role) }),
      };
    },

    getCurrentUser(user: unknown) {
      return { user };
    },

    refreshSession(user: unknown) {
      if (
        typeof user !== 'object'
        || user === null
        || !('id' in user)
        || !('username' in user)
        || (typeof user.id !== 'number' && typeof user.id !== 'bigint')
        || typeof user.username !== 'string'
      ) {
        throw new AppError('Authenticated user is required', {
          code: 'AUTH_USER_REQUIRED',
          statusCode: 401,
        });
      }

      return { token: dependencies.generateToken(user as AuthUser) };
    },

    logout() {
      return { success: true, message: 'Logged out successfully' };
    },
  };
}
