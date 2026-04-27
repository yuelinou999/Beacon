"use client";

import Link from "next/link";

interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface TopbarProps {
  title: string;
  subtitle?: string;
  breadcrumbs?: BreadcrumbItem[];
  rightContent?: React.ReactNode;
}

export default function Topbar({ title, subtitle, breadcrumbs, rightContent }: TopbarProps) {
  return (
    <header className="h-topbar flex items-center justify-between px-8 bg-card border-b border-border shrink-0">
      <div className="flex items-center gap-3">
        <div>
          {breadcrumbs && breadcrumbs.length > 0 ? (
            <div className="flex items-center gap-1.5 text-sm">
              {breadcrumbs.map((crumb, i) => (
                <span key={i} className="flex items-center gap-1.5">
                  {i > 0 && <span className="text-border">/</span>}
                  {crumb.href ? (
                    <Link href={crumb.href} className="text-muted hover:text-navy transition">
                      {crumb.label}
                    </Link>
                  ) : (
                    <span className="text-navy font-medium">{crumb.label}</span>
                  )}
                </span>
              ))}
            </div>
          ) : (
            <h2 className="text-sm font-medium text-navy">{title}</h2>
          )}
          {subtitle && <p className="text-xs text-muted">{subtitle}</p>}
        </div>
      </div>
      <div className="flex items-center gap-4">
        {rightContent}
      </div>
    </header>
  );
}
