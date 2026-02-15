This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Schedule Sync Automation

The project includes an automated script to sync the schedule from the client portal. This runs via GitHub Actions on a schedule (every 30 minutes) but can also be run locally.

### Prerequisites

- Node.js 20+
- Environment variables configured in `.env` (see `.env.example`).

### Running Locally

To run the sync script manually:

```bash
npx tsx scripts/sync-schedule.ts
```

### GitHub Actions

The workflow is defined in `.github/workflows/schedule-sync.yml`. It requires the following secrets to be set in the repository settings:

- `CLIENT_AGENCY`
- `CLIENT_USER`
- `CLIENT_PASS`
- `APP_URL`
- `APP_EMAIL` (User email to perform the upload)
- `APP_PASSWORD`
