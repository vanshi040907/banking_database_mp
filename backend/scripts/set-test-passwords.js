import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { prisma } from '../db.js';

const hash = await bcrypt.hash('Test@1234', 10);
await prisma.customer.updateMany({ data: { password_hash: hash } });
await prisma.employee.updateMany({ data: { password_hash: hash } });
console.log('All test users now have the password: Test@1234');
await prisma.$disconnect();