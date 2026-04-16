// services/cache.ts
class AppCache {
  private static instance: AppCache;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private cache: Map<string, { data: any; timestamp: number }> = new Map();
  private TTL = 5 * 60 * 1000; // 5 minutos de vida útil para cache em memória
  private readonly PREFIX = 'kizombatok_';

  static getInstance() {
    if (!AppCache.instance) {
      AppCache.instance = new AppCache();
    }
    return AppCache.instance;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  set(key: string, data: any, persistent: boolean = false) {
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });

    if (persistent) {
      try {
        // Usar replacer para evitar erros de estrutura circular
        const seen = new WeakSet();
        localStorage.setItem(this.PREFIX + key, JSON.stringify({
          data,
          timestamp: Date.now()
        }, (k, v) => {
          if (typeof v === "object" && v !== null) {
            if (seen.has(v)) return "[Circular]";
            seen.add(v);
          }
          return v;
        }));
      } catch (e) {
        console.warn('Erro ao salvar no localStorage:', e);
      }
    }
  }

  get(key: string, persistent: boolean = false) {
    // 1. Tentar memory cache primeiro
    const item = this.cache.get(key);
    if (item) {
      // Verificar se expirou (para memória usamos o TTL curto)
      if (Date.now() - item.timestamp < this.TTL) {
        return item.data;
      }
      this.cache.delete(key);
    }

    // 2. Tentar localStorage se persistente
    if (persistent) {
      try {
        const storedItem = localStorage.getItem(this.PREFIX + key);
        if (storedItem) {
          const { data, timestamp } = JSON.parse(storedItem);
          // Verificar se não expirou (1 hora para dados persistentes)
          if (Date.now() - timestamp < 60 * 60 * 1000) {
            // Repopular memory cache para acesso futuro mais rápido
            this.cache.set(key, { data, timestamp });
            return data;
          } else {
            localStorage.removeItem(this.PREFIX + key);
          }
        }
      } catch (e) {
        console.warn('Erro ao ler do localStorage:', e);
      }
    }

    return null;
  }

  // Limpar cache quando fizer novas ações (like, comment, etc)
  invalidate(key: string) {
    this.cache.delete(key);
    localStorage.removeItem(this.PREFIX + key);
  }

  // Limpar tudo (logout, etc)
  clear() {
    this.cache.clear();
    // Limpar apenas chaves do nosso app no localStorage
    Object.keys(localStorage)
      .filter(key => key.startsWith(this.PREFIX))
      .forEach(key => localStorage.removeItem(key));
  }
}

export const appCache = AppCache.getInstance();
