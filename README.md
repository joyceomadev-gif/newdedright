# School Management Portal

A web application for running a school: students, staff, classes, subjects, computer-based exams, results and report cards, finance records and more.

Built with TanStack Start (React), Tailwind CSS and Supabase (database, sign-in and file storage).

## Run it on your computer

1. Install Node.js 22, then run `npm install`.
2. Copy `.env.example` to `.env` and fill in the values from your Supabase project (Project Settings, then API).
3. Run `npm run dev` and open http://localhost:8080.

## Database

The database structure is in `supabase/migrations`. To build it in a new Supabase project:

1. `npx supabase login`
2. `npx supabase link --project-ref YOUR_PROJECT_REF`
3. `npx supabase db push --linked`

## School name and logo

Each school sets its own name and logo in Administration, then General. Nothing school-specific is written in the code.

## Publishing

The project builds with `npm run build` and deploys from GitHub to Vercel. Add the variables listed in `.env.example` in the host's environment settings, and keep secret keys out of the repository.