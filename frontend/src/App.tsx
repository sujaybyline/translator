import { Outlet } from 'react-router-dom';
import { Header } from './components/Header';

export default function App() {
  return (
    <div className="min-h-screen">
      <Header />
      <main className="mx-auto max-w-6xl px-5 py-8 sm:py-10">
        <Outlet />
      </main>
      <footer className="border-t border-[var(--color-line)]/70 py-6 text-center text-xs text-[var(--color-ink-soft)]">
        XLIFF AI Translator · Preserves XLIFF structure for Text-to-Speech workflows
      </footer>
    </div>
  );
}
