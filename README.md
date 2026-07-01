# LeadFlow AI 🚀

An enterprise-grade AI Sales Scavenger & Outreach Agent Platform designed to automate sales intelligence gathering, scraping, and AI-driven outreach.

## Repository Structure

The project is structured as a monorepo containing both the frontend and backend applications:

- **[backend/](file:///Users/amathziah/lead-flow/backend)**: Express server with TypeScript, Prisma ORM, Supabase integration, Playwright for web intelligence gathering, and Google Generative AI (Gemini).
- **[frontend/](file:///Users/amathziah/lead-flow/frontend)**: Modern React application with Vite, TypeScript, and Lucide React icons.

---

## Getting Started

### Prerequisites

Make sure you have the following installed on your machine:
- **Node.js** (v18 or higher recommended)
- **npm** (v9 or higher) or your preferred package manager (Yarn/pnpm)
- **Git**

---

### Backend Setup

1. Navigate to the backend directory:
   ```bash
   cd backend
   ```
2. Install the dependencies:
   ```bash
   npm install
   ```
3. Set up your environment variables:
   - Copy `.env.example` to `.env` and fill in the required keys (Supabase API keys, Database URL, Google Gemini API key, etc.).
4. Generate the Prisma Client:
   ```bash
   npm run prisma:generate
   ```
5. Run database migrations:
   ```bash
   npm run prisma:migrate
   ```
6. Start the backend development server:
   ```bash
   npm run dev
   ```

---

### Frontend Setup

1. Navigate to the frontend directory:
   ```bash
   cd frontend
   ```
2. Install the dependencies:
   ```bash
   npm install
   ```
3. Start the frontend development server:
   ```bash
   npm run dev
   ```
4. Access the web app at `http://localhost:5173`.

---

## Technology Stack

### Backend
- **Framework**: Express.js (TypeScript)
- **Database ORM**: Prisma
- **Auth & Database Provider**: Supabase
- **AI Engine**: Google Generative AI (Gemini API)
- **Scraper/Scavenger**: Playwright
- **Logger**: Winston
- **Validation**: Zod

### Frontend
- **Framework**: React 19 (TypeScript)
- **Bundler**: Vite
- **Icon Pack**: Lucide React
- **Styling**: Vanilla CSS

---

## License

This project is proprietary. All rights reserved.
