import { providerRegistry } from '@/modules/providers/provider.registry.js';
import { providerAccountsService } from '@/modules/providers/services/provider-accounts.service.js';
import type { LLMProvider, ProviderAuthStatus } from '@/shared/types.js';

export const providerAuthService = {
  /**
   * Resolves a provider and returns its installation/authentication status.
   */
  async getProviderAuthStatus(
    providerName: string,
    userId?: string | number | null,
  ): Promise<ProviderAuthStatus> {
    const provider = providerRegistry.resolveProvider(providerName);
    if (providerAccountsService.isSupported(provider.id) && userId !== undefined) {
      const runtime = await providerAccountsService.getRuntimeContext(
        provider.id,
        userId,
        { requireAccount: false },
      );
      return provider.auth.getStatus({ env: runtime.env });
    }
    return provider.auth.getStatus();
  },

  /**
   * Returns whether a provider runtime appears installed.
   * Falls back to true if status lookup itself fails so callers preserve the
   * original runtime error instead of replacing it with a status-check failure.
   */
  async isProviderInstalled(
    providerName: LLMProvider,
    userId?: string | number | null,
  ): Promise<boolean> {
    try {
      const status = await this.getProviderAuthStatus(providerName, userId);
      return status.installed;
    } catch {
      return true;
    }
  },
};
