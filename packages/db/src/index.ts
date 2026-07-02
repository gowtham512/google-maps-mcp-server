export { prisma } from "./client";

export async function createThread(title?: string) {
  return prisma.thread.create({
    data: { title: title ?? "New chat" },
  });
}

export async function getThreads() {
  return prisma.thread.findMany({
    orderBy: { updatedAt: "desc" },
    include: {
      _count: { select: { messages: true } },
    },
  });
}

export async function getThread(id: string) {
  return prisma.thread.findUnique({
    where: { id },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });
}

export async function addMessage(
  threadId: string,
  role: "user" | "assistant" | "system" | "tool",
  content: string,
  toolCalls?: unknown[],
) {
  return prisma.message.create({
    data: {
      threadId,
      role,
      content,
      toolCalls: toolCalls ? JSON.stringify(toolCalls) : undefined,
    },
  });
}

export async function updateThreadTitle(id: string, title: string) {
  return prisma.thread.update({ where: { id }, data: { title } });
}

export async function deleteThread(id: string) {
  return prisma.thread.delete({ where: { id } });
}
