import { getDatabase } from "../db";

export interface AIMemory {
  id: string;
  content: string;
  created_at: string;
}

// 1. Get all saved long-term memories
export async function getAIMemories(): Promise<AIMemory[]> {
  try {
    const db = await getDatabase();
    return await db.select<AIMemory[]>("SELECT * FROM ai_memories ORDER BY created_at DESC");
  } catch (err) {
    console.error("Failed to get AI memories:", err);
    return [];
  }
}

// 2. Add a new long-term memory
export async function addAIMemory(content: string): Promise<void> {
  if (!content.trim()) return;
  try {
    const db = await getDatabase();
    const id = `mem-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    await db.execute(
      "INSERT INTO ai_memories (id, content, created_at) VALUES (?, ?, ?)",
      [id, content.trim(), new Date().toISOString()]
    );
  } catch (err) {
    console.error("Failed to add AI memory:", err);
  }
}

// 3. Delete a specific memory
export async function deleteAIMemory(id: string): Promise<void> {
  try {
    const db = await getDatabase();
    await db.execute("DELETE FROM ai_memories WHERE id = ?", [id]);
  } catch (err) {
    console.error("Failed to delete AI memory:", err);
  }
}
