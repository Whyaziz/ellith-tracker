import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { users } from '../db/schema.js';
import { runMigrations } from '../db/migrate.js';

function parseArgs() {
  const args = process.argv.slice(2);
  let username = process.env.ADMIN_USERNAME || '';
  let password = process.env.ADMIN_PASSWORD || '';

  const positional: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--username' || arg === '-u') {
      username = args[++i] || '';
    } else if (arg.startsWith('--username=')) {
      username = arg.split('=')[1] || '';
    } else if (arg === '--password' || arg === '-p') {
      password = args[++i] || '';
    } else if (arg.startsWith('--password=')) {
      password = arg.split('=')[1] || '';
    } else if (!arg.startsWith('-')) {
      positional.push(arg);
    }
  }

  if (!username && positional.length > 0) {
    username = positional[0];
  }
  if (!password && positional.length > 1) {
    password = positional[1];
  }

  return { username: username.trim(), password: password.trim() };
}

async function seedAdmin() {
  // Ensure tables exist before seeding
  runMigrations();

  const { username, password } = parseArgs();

  const finalUsername = username || 'admin';
  const finalPassword = password || 'admin123';

  if (!username || !password) {
    console.log(
      `[seed:admin] Peringatan: Argumen tidak lengkap. Menggunakan kredensial default untuk inisialisasi awal:`
    );
    console.log(`  Username: ${finalUsername}`);
    console.log(`  Password: ${finalPassword}`);
    console.log(
      `  Tip: Anda dapat menentukan kredensial sendiri dengan: npm run seed:admin -- --username <user> --password <pass>`
    );
  }

  const saltRounds = 10;
  const passwordHash = await bcrypt.hash(finalPassword, saltRounds);

  const [existingUser] = await db
    .select()
    .from(users)
    .where(eq(users.username, finalUsername))
    .limit(1);

  if (existingUser) {
    await db
      .update(users)
      .set({
        password_hash: passwordHash,
        role: 'admin',
      })
      .where(eq(users.id, existingUser.id));

    console.log(
      `[seed:admin] User "${finalUsername}" sudah ada. Password dan role berhasil diperbarui menjadi ADMIN.`
    );
  } else {
    await db.insert(users).values({
      username: finalUsername,
      password_hash: passwordHash,
      role: 'admin',
      created_at: new Date().toISOString(),
    });

    console.log(
      `[seed:admin] Berhasil membuat user ADMIN baru: "${finalUsername}".`
    );
  }
}

seedAdmin()
  .then(() => {
    console.log('[seed:admin] Selesai.');
    process.exit(0);
  })
  .catch((err) => {
    console.error('[seed:admin] Terjadi kesalahan:', err);
    process.exit(1);
  });
