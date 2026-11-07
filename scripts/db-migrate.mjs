import {readFileSync} from 'node:fs';
import pg from 'pg';
// Applies db/schema.sql (idempotent). Usage: npm run db:migrate
const url=process.env.DATABASE_URL_UNPOOLED||process.env.DATABASE_URL;
if(!url){console.error('DATABASE_URL is not set. Run `vercel env pull .env.local` first.');process.exit(1);}
const client=new pg.Client({connectionString:url});
await client.connect();
try{await client.query(readFileSync(new URL('../db/schema.sql',import.meta.url),'utf8'));console.log('Project tables are up to date.');}
finally{await client.end();}
