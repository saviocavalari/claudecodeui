import { getConnection } from '@/modules/database/connection.js';
import type { ProviderAccountProvider } from '@/shared/types.js';

export type ProviderAccountGrantRow = {
  owner_user_id: number;
  provider: ProviderAccountProvider;
  profile_id: string;
  grantee_user_id: number;
};

/** Persistence API used by Providers to authorize access to owner-held account credentials. */
export const providerAccountAccessDb = {
  listGrantedToUser(provider: ProviderAccountProvider, userId: number): ProviderAccountGrantRow[] {
    try {
      return getConnection().prepare(`
        SELECT owner_user_id, provider, profile_id, grantee_user_id
        FROM provider_account_access
        WHERE provider = ? AND grantee_user_id = ?
      `).all(provider, userId) as ProviderAccountGrantRow[];
    } catch (error) {
      if (error instanceof Error && error.message.includes('no such table')) return [];
      throw error;
    }
  },

  listGranteeIds(ownerUserId: number, provider: ProviderAccountProvider, profileId: string): number[] {
    let rows: { grantee_user_id: number }[];
    try {
      rows = getConnection().prepare(`
        SELECT grantee_user_id
        FROM provider_account_access
        WHERE owner_user_id = ? AND provider = ? AND profile_id = ?
        ORDER BY grantee_user_id
      `).all(ownerUserId, provider, profileId) as { grantee_user_id: number }[];
    } catch (error) {
      if (error instanceof Error && error.message.includes('no such table')) return [];
      throw error;
    }
    return rows.map((row) => row.grantee_user_id);
  },

  replaceGrants(
    ownerUserId: number,
    provider: ProviderAccountProvider,
    profileId: string,
    granteeUserIds: number[],
  ): void {
    const db = getConnection();
    db.transaction(() => {
      db.prepare(`
        DELETE FROM provider_account_access
        WHERE owner_user_id = ? AND provider = ? AND profile_id = ?
      `).run(ownerUserId, provider, profileId);
      const insert = db.prepare(`
        INSERT INTO provider_account_access (owner_user_id, provider, profile_id, grantee_user_id)
        VALUES (?, ?, ?, ?)
      `);
      for (const granteeUserId of granteeUserIds) {
        insert.run(ownerUserId, provider, profileId, granteeUserId);
      }
    })();
  },

  deleteProfileGrants(ownerUserId: number, provider: ProviderAccountProvider, profileId: string): void {
    getConnection().prepare(`
      DELETE FROM provider_account_access
      WHERE owner_user_id = ? AND provider = ? AND profile_id = ?
    `).run(ownerUserId, provider, profileId);
  },
};
