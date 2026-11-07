import {Pool} from 'pg';
// One pool per server instance, shared by Better Auth and the project store.
const globalPool=globalThis as typeof globalThis&{threadroomPool?:Pool};
export const pool=globalPool.threadroomPool??=new Pool({connectionString:process.env.DATABASE_URL});
