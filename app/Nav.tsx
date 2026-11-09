"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";

const SPEAKER = [
  { href: "/", label: "Mentor", ic: "◇" },
  { href: "/submit", label: "Submit a talk", ic: "✎" },
];

const COUNCIL = [{ href: "/review", label: "Review queue", ic: "▤" }];

function Item({ href, label, ic, path }: { href: string; label: string; ic: string; path: string }) {
  const on = href === "/" ? path === "/" : path.startsWith(href);
  return (
    <Link href={href} className={on ? "on" : ""}>
      <span className="ic">{ic}</span>
      {label}
    </Link>
  );
}

export function Sidebar() {
  const path = usePathname();
  return (
    <aside className="sidebar">
      <Link href="/" className="brand">
        <span className="name">Panchayat</span>
        <span className="sub">the council decides</span>
      </Link>

      <div className="navgroup">Speaker</div>
      <nav>
        {SPEAKER.map((l) => (
          <Item key={l.href} {...l} path={path} />
        ))}
      </nav>

      <div className="navgroup">Programme committee</div>
      <nav>
        {COUNCIL.map((l) => (
          <Item key={l.href} {...l} path={path} />
        ))}
      </nav>

      <div className="foot">
        <span className="tiny">3,436 prior talks indexed</span>
        <span className="tiny">KubeCon 2023 to 2026</span>
      </div>
    </aside>
  );
}
