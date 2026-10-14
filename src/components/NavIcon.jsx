// Line icons for the sidebar (refined interface): one 24px grid, 1.75 stroke, round joins.
const PATHS = {
  overview: (
    <>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
    </>
  ),
  nations: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17M12 3.5c2.6 2.4 3.9 5.2 3.9 8.5s-1.3 6.1-3.9 8.5c-2.6-2.4-3.9-5.2-3.9-8.5s1.3-6.1 3.9-8.5Z" />
    </>
  ),
  units: (
    <>
      <rect x="3" y="12" width="18" height="6" rx="3" />
      <path d="M7 12V9.5h7V12M14 10.5h7" />
    </>
  ),
  abilities: <path d="m12 3.5 2.3 5.2 5.7.6-4.3 3.8 1.2 5.6L12 15.8l-4.9 2.9 1.2-5.6L4 9.3l5.7-.6Z" />,
  voices: (
    <>
      <rect x="9" y="3.5" width="6" height="10.5" rx="3" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5v3" />
    </>
  ),
  divisions: <path d="m12 3.5 8.5 4.5-8.5 4.5L3.5 8Zm-8.5 9 8.5 4.5 8.5-4.5" />,
  balance: <path d="M12 4v16M8 20h8M5 7.5h14M7 7.5l-3 6.5a3 3 0 0 0 6 0Zm10 0-3 6.5a3 3 0 0 0 6 0Z" />,
  export: <path d="M12 3.5v11M7.5 10l4.5 4.5 4.5-4.5M4.5 19.5h15" />,
  gallery: (
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
      <circle cx="9" cy="10" r="1.75" />
      <path d="m20.5 15.5-4.5-4.5-8.5 8.5" />
    </>
  ),
};

export default function NavIcon({ name }) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {PATHS[name]}
    </svg>
  );
}
