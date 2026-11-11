import {betterAuth} from 'better-auth';
import {nextCookies} from 'better-auth/next-js';
import {pool} from './db';

const vercelOrigins=[process.env.VERCEL_URL,process.env.VERCEL_BRANCH_URL,process.env.VERCEL_PROJECT_PRODUCTION_URL]
  .filter((host):host is string=>!!host).map(host=>`https://${host}`);

export const auth=betterAuth({
  database:pool,
  emailAndPassword:{enabled:true,disableSignUp:true},
  trustedOrigins:vercelOrigins,
  plugins:[nextCookies()],
});
