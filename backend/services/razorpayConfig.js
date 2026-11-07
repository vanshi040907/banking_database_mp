import fs from 'node:fs';
import dotenv from 'dotenv';
const file = new URL('../.env.razorpay', import.meta.url);
if (fs.existsSync(file)) dotenv.config({path:file, quiet:true});
