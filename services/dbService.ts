
import { supabase } from './supabaseClient';
import { ChatSession, Message, Folder, Persona, VaultFolder, VaultItem } from '../types';

export interface UsageStats {
    inputTokens: number;
    outputTokens: number;
    modelBreakdown: Record<string, { input: number; output: number }>;
}

// Helper to ensure timestamp is always a BigInt-compatible number
const toTimestamp = (val: string | number | Date): number => {
    if (val instanceof Date) return val.getTime();
    if (typeof val === 'number') return Math.floor(val);
    if (typeof val === 'string') {
        const parsed = new Date(val).getTime();
        return isNaN(parsed) ? Date.now() : parsed;
    }
    return Date.now();
};

const logError = (context: string, error: any) => {
    console.error(`${context}:`, error?.message || error || "Unknown error");
};

// Helper function to check if today is the last day of the month
const isLastDayOfMonth = (): boolean => {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.getDate() === 1;
};

// Helper function to check if we need to reset usage stats
// Resets if: we're on the last day of the month AND last_updated is from a previous month
// This ensures we always have month-to-date totals
const shouldResetUsage = (lastUpdated: string | null): boolean => {
    if (!lastUpdated) return false;
    if (!isLastDayOfMonth()) return false;
    
    const lastUpdatedDate = new Date(lastUpdated);
    const today = new Date();
    
    // Check if last_updated is from a previous month or year
    // This ensures stats reset on the last day of each month for month-to-date tracking
    return lastUpdatedDate.getMonth() !== today.getMonth() || 
           lastUpdatedDate.getFullYear() !== today.getFullYear();
};

// Helper function to reset usage stats
const resetUsageStats = async (userId: string): Promise<void> => {
    try {
        const { error } = await supabase
            .from('user_usage')
            .upsert({ 
                user_id: userId, 
                input_tokens: 0, 
                output_tokens: 0,
                model_stats: {},
                last_updated: new Date().toISOString() 
            });
        
        if (error) {
            logError("Could not reset usage stats", error);
        }
    } catch (e) {
        logError("Usage stats reset failed silently", e);
    }
};

export const dbService = {
  
  // --- Usage Stats ---
  async getUsageStats(): Promise<UsageStats> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { inputTokens: 0, outputTokens: 0, modelBreakdown: {} };

    try {
        const { data, error } = await supabase
        .from('user_usage')
        .select('input_tokens, output_tokens, model_stats, last_updated') 
        .eq('user_id', user.id)
        .single();

        if (error) {
            if (error.code !== 'PGRST116') {
                logError("Usage stats not available", error);
            }
            return { inputTokens: 0, outputTokens: 0, modelBreakdown: {} };
        }

        // Check if we need to reset (on last day of month and stats are from previous month)
        if (data && shouldResetUsage(data.last_updated)) {
            await resetUsageStats(user.id);
            return { inputTokens: 0, outputTokens: 0, modelBreakdown: {} };
        }

        if (data) {
            return { 
                inputTokens: Number(data.input_tokens || 0), 
                outputTokens: Number(data.output_tokens || 0),
                modelBreakdown: data.model_stats || {} 
            };
        }
    } catch (e) {
        logError("Usage stats exception", e);
        return { inputTokens: 0, outputTokens: 0, modelBreakdown: {} };
    }

    return { inputTokens: 0, outputTokens: 0, modelBreakdown: {} };
  },

  async updateUsageStats(inputTokens: number, outputTokens: number, modelId?: string): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    try {
        // First fetch current stats to merge
        const { data: currentData } = await supabase
            .from('user_usage')
            .select('input_tokens, output_tokens, model_stats, last_updated')
            .eq('user_id', user.id)
            .single();
        
        // Check if we need to reset (on last day of month and stats are from previous month)
        if (currentData && shouldResetUsage(currentData.last_updated)) {
            await resetUsageStats(user.id);
            // After reset, start fresh with new tokens
            const newModelStats: Record<string, { input: number; output: number }> = {};
            if (modelId) {
                newModelStats[modelId] = { input: inputTokens, output: outputTokens };
            }
            
            const { error } = await supabase
                .from('user_usage')
                .upsert({ 
                    user_id: user.id, 
                    input_tokens: inputTokens, 
                    output_tokens: outputTokens,
                    model_stats: newModelStats,
                    last_updated: new Date().toISOString() 
                });
            
            if (error) {
                logError("Could not update usage stats after reset", error);
            }
            return;
        }
        
        let newTotalInput = inputTokens;
        let newTotalOutput = outputTokens;
        let newModelStats: Record<string, { input: number; output: number }> = {};

        if (currentData) {
            newTotalInput = Number(currentData.input_tokens || 0) + inputTokens;
            newTotalOutput = Number(currentData.output_tokens || 0) + outputTokens;
            newModelStats = currentData.model_stats || {};
        }

        if (modelId) {
            if (!newModelStats[modelId]) {
                newModelStats[modelId] = { input: 0, output: 0 };
            }
            newModelStats[modelId].input += inputTokens;
            newModelStats[modelId].output += outputTokens;
        }

        const { error } = await supabase
        .from('user_usage')
        .upsert({ 
            user_id: user.id, 
            input_tokens: newTotalInput, 
            output_tokens: newTotalOutput,
            model_stats: newModelStats,
            last_updated: new Date().toISOString() 
        });
        
        if (error) {
            logError("Could not update usage stats", error);
        }
    } catch (e) {
        logError("Usage stats update failed silently", e);
    }
  },

  // --- Folders ---
  async getFolders(): Promise<Folder[]> {
    const { data, error } = await supabase.from('folders').select('*').order('created_at', { ascending: true });
    if (error) {
        logError("Error fetching folders", error);
        return [];
    }
    return data || [];
  },

  async createFolder(name: string): Promise<Folder | null> {
    const { data, error } = await supabase.from('folders').insert([{ name }]).select().single();
    if (error) {
        logError("Create folder error", error);
        return null;
    }
    return data;
  },

  async renameFolder(folderId: string, newName: string): Promise<void> {
    const { error } = await supabase.from('folders').update({ name: newName }).eq('id', folderId);
    if (error) logError("Rename folder error", error);
  },

  async deleteFolder(folderId: string): Promise<void> {
    // Unlink chats first (Move to Recent)
    const { error: unlinkError } = await supabase
        .from('chats')
        .update({ folder_id: null })
        .eq('folder_id', folderId);
    
    if (unlinkError) logError("Error unlinking chats from folder", unlinkError);

    const { error } = await supabase.from('folders').delete().eq('id', folderId);
    if (error) logError("Delete folder error", error);
  },

  // --- Personas ---
  async getPersonas(): Promise<Persona[]> {
    const { data, error } = await supabase.from('personas').select('*').order('created_at', { ascending: true });
    if (error) {
        logError("Error fetching personas", error);
        return [];
    }
    
    return (data || []).map(p => ({
        id: p.id,
        name: p.name,
        avatar: p.avatar,
        systemInstruction: p.system_instruction,
        description: p.description,
        color: p.color
    }));
  },

  async savePersona(persona: Persona): Promise<void> {
    const payload = {
        id: persona.id,
        name: persona.name,
        avatar: persona.avatar,
        system_instruction: persona.systemInstruction,
        description: persona.description,
        color: persona.color
    };
    
    const { error } = await supabase.from('personas').upsert(payload);
    if (error) logError("Save persona error", error);
  },

  async deletePersona(personaId: string): Promise<void> {
    const { error } = await supabase.from('personas').delete().eq('id', personaId);
    if (error) logError("Delete persona error", error);
  },

  // --- Chats ---
  async getChats(): Promise<ChatSession[]> {
    const { data: chatsData, error: chatsError } = await supabase
        .from('chats')
        .select('*')
        .order('last_updated', { ascending: false });

    if (chatsError) {
        logError("Error fetching chats", chatsError);
        throw chatsError;
    }
    if (!chatsData || chatsData.length === 0) return [];

    const { data: messagesData, error: msgsError } = await supabase
        .from('messages')
        .select('*')
        .order('timestamp', { ascending: true });

    if (msgsError) logError("Error fetching messages", msgsError);

    return chatsData.map(c => {
        const chatMsgs = (messagesData || [])
            .filter(m => m.chat_id === c.id)
            .map(m => ({
                id: m.id,
                role: m.role as 'user' | 'model',
                content: m.content,
                timestamp: toTimestamp(m.timestamp),
                type: m.type as 'text' | 'image' | 'audio',
                groundingUrls: m.grounding_urls,
                model: m.model
            }));

        return {
            id: c.id,
            title: c.title,
            folderId: c.folder_id || undefined,
            isPinned: c.is_pinned,
            personaId: c.persona_id,
            lastUpdated: toTimestamp(c.last_updated),
            messages: chatMsgs,
            modelId: c.model_id || undefined,
            useSearch: c.use_search || false
        };
    });
  },

  async createChat(chat: ChatSession): Promise<void> {
    const { error } = await supabase.from('chats').insert([{
        id: chat.id,
        title: chat.title,
        folder_id: chat.folderId || null,
        is_pinned: chat.isPinned,
        persona_id: chat.personaId,
        last_updated: toTimestamp(chat.lastUpdated),
        model_id: chat.modelId || null,
        use_search: chat.useSearch || false
    }]);
    if (error) logError("Create chat error", error);
  },

  async updateChat(chatId: string, updates: Partial<ChatSession>): Promise<void> {
    const payload: any = {};
    if (updates.title !== undefined) payload.title = updates.title;
    if (updates.isPinned !== undefined) payload.is_pinned = updates.isPinned;
    if (updates.folderId !== undefined) payload.folder_id = updates.folderId || null;
    
    if (updates.lastUpdated !== undefined) {
        payload.last_updated = toTimestamp(updates.lastUpdated);
    }
    
    if (updates.personaId !== undefined) payload.persona_id = updates.personaId;
    if (updates.modelId !== undefined) payload.model_id = updates.modelId || null;
    if (updates.useSearch !== undefined) payload.use_search = updates.useSearch;

    const { error } = await supabase.from('chats').update(payload).eq('id', chatId);
    if (error) logError("Update chat error", error);
  },

  async deleteChat(chatId: string): Promise<void> {
    await supabase.from('messages').delete().eq('chat_id', chatId);

    const { error } = await supabase.from('chats').delete().eq('id', chatId);
    if (error) logError("Delete chat error", error);
  },

  // --- Messages ---
  async addMessage(chatId: string, message: Message): Promise<void> {
    const messagePayload: any = {
        id: message.id,
        chat_id: chatId,
        role: message.role,
        content: message.content,
        timestamp: toTimestamp(message.timestamp), 
        type: message.type || 'text',
        grounding_urls: message.groundingUrls || [],
    };
    
    if (message.model) {
        messagePayload.model = message.model;
    }

    const { error } = await supabase.from('messages').insert([messagePayload]);
    if (error) logError("Add message error", error);
  },
  
  async updateMessageContent(messageId: string, content: string, groundingUrls?: any[]): Promise<void> {
    const payload: any = { content };
    if (groundingUrls) payload.grounding_urls = groundingUrls;
    
    const { error } = await supabase.from('messages').update(payload).eq('id', messageId);
    if (error) logError("Update message error", error);
  },

  // --- Vault ---
  async getVaultFolders(): Promise<VaultFolder[]> {
    const { data, error } = await supabase
      .from('vault_folders')
      .select('*')
      .order('created_at', { ascending: true });
    
    if (error) {
      logError("Error fetching vault folders", error);
      return [];
    }
    
    return (data || []).map(f => ({
      id: f.id,
      name: f.name,
      createdAt: toTimestamp(f.created_at)
    }));
  },

  async createVaultFolder(name: string): Promise<VaultFolder | null> {
    const { data, error } = await supabase
      .from('vault_folders')
      .insert([{ name }])
      .select()
      .single();
    
    if (error) {
      logError("Create vault folder error", error);
      return null;
    }
    
    return {
      id: data.id,
      name: data.name,
      createdAt: toTimestamp(data.created_at)
    };
  },

  async getVaultItems(folderId?: string): Promise<VaultItem[]> {
    let query = supabase.from('vault_items').select('*').order('created_at', { ascending: false });
    
    if (folderId) {
      query = query.eq('folder_id', folderId);
    }
    
    const { data, error } = await query;
    
    if (error) {
      logError("Error fetching vault items", error);
      return [];
    }
    
    return (data || []).map(i => ({
      id: i.id,
      folderId: i.folder_id,
      content: i.content,
      sourceContext: i.source_context,
      createdAt: toTimestamp(i.created_at),
      isPinned: i.is_pinned || false
    }));
  },

  async saveVaultItem(item: VaultItem): Promise<void> {
    const { error } = await supabase.from('vault_items').insert([{
      id: item.id,
      folder_id: item.folderId,
      content: item.content,
      source_context: item.sourceContext,
      created_at: new Date(item.createdAt).toISOString(),
      is_pinned: item.isPinned
    }]);
    
    if (error) logError("Save vault item error", error);
  },

  async toggleVaultItemPin(itemId: string, isPinned: boolean): Promise<void> {
    const { error } = await supabase
      .from('vault_items')
      .update({ is_pinned: isPinned })
      .eq('id', itemId);
    
    if (error) logError("Toggle vault item pin error", error);
  },

  async moveVaultItem(itemId: string, folderId: string | null): Promise<void> {
    const { error } = await supabase
      .from('vault_items')
      .update({ folder_id: folderId })
      .eq('id', itemId);
    
    if (error) logError("Move vault item error", error);
  },

  async updateVaultItem(itemId: string, updates: { content?: string; sourceContext?: string }): Promise<void> {
    const updateData: any = {};
    if (updates.content !== undefined) updateData.content = updates.content;
    if (updates.sourceContext !== undefined) updateData.source_context = updates.sourceContext;
    
    const { error } = await supabase
      .from('vault_items')
      .update(updateData)
      .eq('id', itemId);
    
    if (error) logError("Update vault item error", error);
  },

  async deleteVaultItem(itemId: string): Promise<void> {
    const { error } = await supabase.from('vault_items').delete().eq('id', itemId);
    if (error) logError("Delete vault item error", error);
  }
};
