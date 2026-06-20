import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function ensureUser(email: string, username: string, displayName: string) {
  return prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, username, displayName },
  });
}

async function main() {
  const alice = await ensureUser('alice@demo.test', 'alice', 'Alice');
  const bob = await ensureUser('bob@demo.test', 'bob', 'Bob');
  const carol = await ensureUser('carol@demo.test', 'carol', 'Carol');

  // A demo room with all three as members (ownerless).
  let room = await prisma.room.findFirst({ where: { name: 'Movie Night' } });
  if (!room) {
    room = await prisma.room.create({
      data: { name: 'Movie Night', description: 'Our private watch room', createdById: alice.id },
    });
    await prisma.chatChannel.create({ data: { roomId: room.id } });
    for (const u of [alice, bob, carol]) {
      await prisma.roomMember.create({ data: { roomId: room.id, userId: u.id } });
    }
    const channel = await prisma.chatChannel.findUnique({ where: { roomId: room.id } });
    if (channel) {
      await prisma.chatMessage.create({
        data: { channelId: channel.id, authorUserId: alice.id, body: 'Welcome to Streamy! 🎬 Upload a video to get started.' },
      });
    }
  }

  console.log('\n[seed] Demo users ready. Log in with any of these on the dev-login screen:');
  console.log('       alice@demo.test  |  bob@demo.test  |  carol@demo.test');
  console.log('[seed] Shared room "Movie Night" contains all three members.\n');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
