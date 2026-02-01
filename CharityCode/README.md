# CharityCode - Student & Charity Marketplace

**Empowering Students, Supporting Charities.**  
*Built for IC Hack '26*

CharityCode is a specialized marketplace designed to bridge the gap between talented students looking for real-world experience and charities in need of technical support. Our platform facilitates a seamless exchange of skills: students contribute to meaningful social causes while building their professional portfolios, and charities receive high-quality technical assistance at no cost.

---

## 🌟 Key Features

### 🎓 For Students
- **Real-World Impact:** Apply your coding, design, and technical skills to projects that matter.
- **Skill Verification:** Gain experience that is validated by real organizations.
- **AI-Powered Feedback:** Receive instant, constructive feedback on your submissions through our integrated AI review system.
- **Portfolio Building:** Showcase completed tasks to potential employers.

### 🎗️ For Charities
- **Scalable Support:** Post technical tasks and connect with a pool of eager student talent.
- **Quality Assurance:** Leverage AI-driven code reviews to ensure student submissions meet high standards.
- **Efficient Management:** Easily track task progress, review submissions, and manage student collaborators through an intuitive dashboard.

### 🤖 Intelligent Features
- **AI Review System:** Our custom Supabase Edge Function automatically analyzes code submissions, providing immediate feedback and reducing the manual review burden on charity staff.
- **Dynamic Dashboard:** Role-based interfaces tailored for both students and charity administrators.
- **Secure Authentication:** Robust user management powered by Supabase Auth.

---

## 🛠️ Tech Stack

- **Frontend:** [React](https://react.dev/) + [Vite](https://vitejs.dev/) + [TypeScript](https://www.typescriptlang.org/)
- **Styling:** [Tailwind CSS](https://tailwindcss.com/) + [Radix UI](https://www.radix-ui.com/) + [Framer Motion](https://www.framer.com/motion/)
- **Backend/Database:** [Supabase](https://supabase.com/) (PostgreSQL, Auth, Edge Functions)
- **Deployment:** [Vercel](https://vercel.com/)
- **Icons:** [Lucide React](https://lucide.dev/)

---

## 🚀 Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) (v18 or higher)
- [npm](https://www.npmjs.com/) or [pnpm](https://pnpm.io/)
- [Supabase CLI](https://supabase.com/docs/guides/cli) (for local development)

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/your-username/CharityCode.git
   cd CharityCode
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Set up Environment Variables:**
   Create a `.env` file in the root directory and add your Supabase credentials:
   ```env
   VITE_SUPABASE_URL=your_supabase_project_url
   VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
   ```

4. **Start the development server:**
   ```bash
   npm run dev
   ```

---

## 📂 Project Structure

```text
CharityCode/
├── src/
│   ├── app/           # Main application components and pages
│   │   ├── components/ # Reusable UI components and page sections
│   │   └── App.tsx    # Root application logic and routing
│   ├── contexts/      # React contexts (Auth, etc.)
│   ├── lib/           # Utility functions and Supabase client
│   └── styles/        # Global styles and Tailwind configuration
├── supabase/
│   ├── functions/     # Supabase Edge Functions (AI Reviewer)
│   └── migrations/    # Database schema migrations
└── public/            # Static assets
```

---

## 🤝 Contributing

We welcome contributions! Whether it's fixing bugs, adding new features, or improving documentation, please feel free to:
1. Fork the repository.
2. Create a new branch (`git checkout -b feature-branch`).
3. Commit your changes (`git commit -m 'Add some feature'`).
4. Push to the branch (`git push origin feature-branch`).
5. Open a Pull Request.

---

## 📜 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

*Made with ❤️ at IC Hack '26*
