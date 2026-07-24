import { NavLink } from 'react-router-dom';

const links = [
  { to: '/', label: 'Translator', end: true },
  { to: '/history', label: 'Translation History', end: false },
  { to: '/settings', label: 'Settings', end: false },
];

export function Header() {
  return (
    <header className="border-b border-[var(--color-line)]/80 bg-[color-mix(in_oklab,white_72%,transparent)] backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-5 py-4">
        <NavLink to="/" className="group flex items-center gap-3 no-underline">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-[var(--color-brand)] text-[var(--color-paper)] shadow-sm transition-transform duration-300 group-hover:scale-[1.03]">
            <svg width="22" height="22" viewBox="0 0 64 64" fill="none" aria-hidden>
              <path d="M16 40L28 18h8L24 40h-8zm20 0l12-22h8L44 40h-8z" fill="currentColor" />
              <circle cx="32" cy="48" r="3" fill="#C4A35A" />
            </svg>
          </span>
          <span>
            <span className="block font-[family-name:var(--font-display)] text-2xl leading-none tracking-tight text-[var(--color-brand)]">
              XLIFF AI Translator
            </span>
            <span className="mt-0.5 block text-xs tracking-wide text-[var(--color-ink-soft)]">
              English → Your Language
            </span>
          </span>
        </NavLink>

        <nav className="flex items-center gap-1 sm:gap-2">
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.end}
              className={({ isActive }) =>
                [
                  'rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-200 no-underline',
                  isActive
                    ? 'bg-[var(--color-brand)] text-white'
                    : 'text-[var(--color-ink-soft)] hover:bg-[var(--color-paper-2)] hover:text-[var(--color-ink)]',
                ].join(' ')
              }
            >
              {link.label}
            </NavLink>
          ))}
        </nav>
      </div>
    </header>
  );
}
