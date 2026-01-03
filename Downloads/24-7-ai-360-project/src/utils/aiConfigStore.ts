// Enhanced AI Configuration Store with multiple API keys support
interface APIKeyConfig {
  id: string;
  name: string;
  key: string;
  model: string;
  createdAt: string;
  lastUsed?: string;
  connectionDetails?: {
    modelsCount: number;
    connectedAt: string;
    organization: string;
  };
}

interface AIConfig {
  apiKeys: APIKeyConfig[];
  activeKeyId: string | null;
  lastChecked: number;
}

class AIConfigStore {
  private config: AIConfig;
  private listeners: Set<() => void> = new Set();
  private storageKey = 'ai_config_v3';

  constructor() {
    this.config = this.getDefaultConfig();
    this.loadConfig();
    
    // Listen for storage changes
    window.addEventListener('storage', this.handleStorageChange.bind(this));
  }

  private getDefaultConfig(): AIConfig {
    return {
      apiKeys: [],
      activeKeyId: null,
      lastChecked: 0
    };
  }

  private loadConfig(): void {
    try {
      const stored = localStorage.getItem(this.storageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        this.config = { ...this.getDefaultConfig(), ...parsed };
      }
    } catch (error) {
      console.error('Failed to load config:', error);
      this.config = this.getDefaultConfig();
    }
  }

  private saveConfig(): void {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.config));
    } catch (error) {
      console.error('Failed to save config:', error);
    }
  }

  private handleStorageChange(e: StorageEvent): void {
    if (e.key === this.storageKey) {
      this.loadConfig();
      this.notifyListeners();
    }
  }

  private notifyListeners(): void {
    this.listeners.forEach(listener => {
      try {
        listener();
      } catch (error) {
        console.error('Error in listener:', error);
      }
    });
  }

  private generateId(): string {
    return `key_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Public methods
  getConfig(): AIConfig {
    return { ...this.config };
  }

  getActiveKey(): APIKeyConfig | null {
    if (!this.config.activeKeyId) return null;
    return this.config.apiKeys.find(k => k.id === this.config.activeKeyId) || null;
  }

  getAllKeys(): APIKeyConfig[] {
    return [...this.config.apiKeys];
  }

  addApiKey(name: string, key: string, model: string = 'gpt-4o-mini', connectionDetails?: any): string {
    const id = this.generateId();
    const newKey: APIKeyConfig = {
      id,
      name,
      key,
      model,
      createdAt: new Date().toISOString(),
      connectionDetails
    };

    this.config.apiKeys.push(newKey);
    
    // If this is the first key, make it active
    if (this.config.apiKeys.length === 1) {
      this.config.activeKeyId = id;
    }

    this.saveConfig();
    this.notifyListeners();
    return id;
  }

  updateApiKey(id: string, updates: Partial<APIKeyConfig>): boolean {
    const index = this.config.apiKeys.findIndex(k => k.id === id);
    if (index === -1) return false;

    this.config.apiKeys[index] = {
      ...this.config.apiKeys[index],
      ...updates
    };

    this.saveConfig();
    this.notifyListeners();
    return true;
  }

  deleteApiKey(id: string): boolean {
    const index = this.config.apiKeys.findIndex(k => k.id === id);
    if (index === -1) return false;

    this.config.apiKeys.splice(index, 1);

    // If we deleted the active key, set a new active key
    if (this.config.activeKeyId === id) {
      this.config.activeKeyId = this.config.apiKeys.length > 0 ? this.config.apiKeys[0].id : null;
    }

    this.saveConfig();
    this.notifyListeners();
    return true;
  }

  setActiveKey(id: string): boolean {
    const key = this.config.apiKeys.find(k => k.id === id);
    if (!key) return false;

    this.config.activeKeyId = id;
    this.config.lastChecked = Date.now();
    
    // Update last used timestamp
    this.updateApiKey(id, { lastUsed: new Date().toISOString() });

    this.saveConfig();
    this.notifyListeners();
    return true;
  }

  setModel(model: string, keyId?: string): void {
    const targetId = keyId || this.config.activeKeyId;
    if (!targetId) return;

    this.updateApiKey(targetId, { model });
  }

  async testConnection(apiKey: string): Promise<{ success: boolean; error?: string; details?: any }> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const response = await fetch('https://api.openai.com/v1/models', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey.trim()}`,
          'Content-Type': 'application/json',
        },
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
        try {
          const errorData = await response.json();
          if (errorData.error?.message) {
            errorMessage = errorData.error.message;
          }
        } catch (e) {
          // Use default error message
        }
        return { success: false, error: errorMessage };
      }

      const data = await response.json();
      
      if (!data.data || !Array.isArray(data.data)) {
        return { success: false, error: 'Invalid API response format' };
      }

      const details = {
        modelsCount: data.data.length,
        connectedAt: new Date().toISOString(),
        organization: response.headers.get('openai-organization') || 'Default'
      };

      return { success: true, details };

    } catch (error: any) {
      if (error.name === 'AbortError') {
        return { success: false, error: 'Connection timeout - please check your internet connection' };
      }
      return { success: false, error: error.message || 'Network error occurred' };
    }
  }

  disconnect(): void {
    this.config = this.getDefaultConfig();
    try {
      localStorage.removeItem(this.storageKey);
    } catch (error) {
      console.error('Failed to clear storage:', error);
    }
    this.notifyListeners();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  isValidApiKey(key: string): boolean {
    const trimmed = key.trim();
    return trimmed.startsWith('sk-') && trimmed.length >= 40;
  }

  // Legacy compatibility methods
  getActiveApiKey(): string {
    const activeKey = this.getActiveKey();
    return activeKey?.key || '';
  }

  getActiveModel(): string {
    const activeKey = this.getActiveKey();
    return activeKey?.model || 'gpt-4o-mini';
  }

  isConnected(): boolean {
    return this.config.activeKeyId !== null && this.config.apiKeys.length > 0;
  }
}

export const aiConfigStore = new AIConfigStore();
