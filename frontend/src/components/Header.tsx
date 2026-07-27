import { NavLink } from 'react-router-dom';

const links = [
  { to: '/', label: 'Translator', end: true },
  { to: '/history', label: 'History', end: false },
  { to: '/qa', label: 'QA Review', end: false },
  { to: '/settings', label: 'Settings', end: false },
];

export function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-[var(--color-line)]/60 bg-white/80 backdrop-blur-lg shadow-[0_1px_0_0_var(--color-line)/40]">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-5 py-3">
        <NavLink to="/" className="group flex items-center gap-3 no-underline">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-[var(--color-brand)] text-white shadow-sm ring-2 ring-[var(--color-brand)]/20 transition-all duration-200 group-hover:ring-4">
            <svg width="20" height="20" viewBox="0 0 64 64" fill="none" aria-hidden>
              <path d="M16 40L28 18h8L24 40h-8zm20 0l12-22h8L44 40h-8z" fill="currentColor" />
              <circle cx="32" cy="48" r="3" fill="#C4A35A" />
            </svg>
          </span>
          <div>
            <span className="block font-[family-name:var(--font-display)] text-xl leading-none tracking-tight text-[var(--color-brand)]">
              XLIFF AI
            </span>
            <span className="block text-[10px] tracking-widest text-[var(--color-ink-soft)] uppercase">
              Translator
            </span>
          </div>
        </NavLink>

        <nav className="flex items-center gap-1">
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.end}
              className={({ isActive }) =>
                [
                  'rounded-lg px-3.5 py-2 text-sm font-medium transition-all duration-150 no-underline',
                  isActive
                    ? 'bg-[var(--color-brand)] text-white shadow-sm'
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
