const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log("Fetching latest AI chat session...");
  const session = await prisma.aiChatSession.findFirst({
    orderBy: { updatedAt: 'desc' }
  });

  if (!session) {
    console.log("No sessions found.");
    return;
  }

  console.log("Session ID:", session.id);
  console.log("Session Title:", session.title);
  
  const messages = session.messages;
  console.log("\nTotal messages:", messages.length);

  // Print the last 10 messages
  const lastMessages = messages.slice(-10);
  lastMessages.forEach((msg, idx) => {
    console.log(`\n--- Message ${messages.length - 10 + idx + 1} [${msg.role}] ---`);
    console.log("Content:", msg.content);
    if (msg.toolExecuted) {
      console.log("Tool Executed:", msg.toolExecuted);
      console.log("Tool Data length/type:", Array.isArray(msg.toolData) ? msg.toolData.length : typeof msg.toolData);
      console.log("Tool Data sample:", JSON.stringify(msg.toolData).substring(0, 300));
    }
  });
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
