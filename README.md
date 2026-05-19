This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
nvm use 20
npm install
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

restart ts server is prisma isnt updating:
cmd shift P > TypeScript: Restart Typescript Server

to migrate db to neon:
```
npx prisma migrate dev
```
if already migrated but updating, run 
```
npx prisma migrate deploy
```

Next.js App Router

Prisma 7

Node 20+

NextAuth V4

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Database in Dev and Prod
Dev → file:./dev.db → SQLite file stored locally in your project.

Prod → Switch your .env DATABASE_URL to something like PostgreSQL or MySQL (e.g. on Supabase, PlanetScale, Neon, or RDS).

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
