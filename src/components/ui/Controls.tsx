'use client';

/** 세그먼트 컨트롤 · 탭 · 토글 — 키보드 조작과 스크린리더 라벨을 갖춘 최소 세트. */

import { useId, type ReactNode } from 'react';

export interface Option<T extends string> {
  value: T;
  label: ReactNode;
  /** 스크린리더용 전체 라벨 */
  srLabel?: string;
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  label,
  size = 'sm',
  full = false,
}: {
  options: Option<T>[];
  value: T;
  onChange: (v: T) => void;
  label: string;
  size?: 'xs' | 'sm';
  full?: boolean;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={`inline-flex rounded-lg border border-border bg-surface-2 p-0.5 ${full ? 'w-full' : ''}`}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={o.srLabel}
            onClick={() => onChange(o.value)}
            className={`${full ? 'flex-1' : ''} rounded-md font-semibold transition-colors ${
              size === 'xs' ? 'px-2 py-1 text-[12.5px]' : 'px-2.5 py-1.5 text-xs'
            } ${active ? 'text-fg-strong' : 'text-muted hover:text-fg'}`}
            style={active ? { background: 'var(--surface-3)' } : undefined}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Tabs<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: Option<T>[];
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="tablist" aria-label={label} className="flex gap-1 border-b border-border">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={`relative px-3 py-2.5 text-sm font-semibold transition-colors ${
              active ? 'text-fg-strong' : 'text-muted hover:text-fg'
            }`}
          >
            {o.label}
            {active ? (
              <span
                aria-hidden="true"
                className="absolute inset-x-2 -bottom-px h-0.5 rounded-full"
                style={{ background: 'var(--accent)' }}
              />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
}) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-3 py-2.5">
      <div className="min-w-0">
        <label htmlFor={id} className="block text-sm font-medium text-fg">
          {label}
        </label>
        {description ? <p className="mt-0.5 text-xs break-keep text-muted">{description}</p> : null}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className="relative mt-0.5 h-6 w-11 shrink-0 rounded-full border transition-colors"
        style={{
          background: checked ? 'var(--accent)' : 'var(--surface-3)',
          borderColor: checked ? 'var(--accent)' : 'var(--border-strong)',
        }}
      >
        <span className="sr-only">{checked ? '켜짐' : '꺼짐'}</span>
        <span
          aria-hidden="true"
          className="absolute top-0.5 h-4.5 w-4.5 rounded-full transition-all"
          style={{
            height: 18,
            width: 18,
            left: checked ? 22 : 3,
            background: checked ? 'var(--accent-fg)' : 'var(--muted-fg)',
          }}
        />
      </button>
    </div>
  );
}

export function IconButton({
  onClick,
  label,
  children,
  active = false,
}: {
  onClick: () => void;
  label: string;
  children: ReactNode;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      title={label}
      className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-sm transition-colors hover:bg-surface-3"
      style={{
        background: active ? 'var(--surface-3)' : 'var(--surface-2)',
        color: active ? 'var(--accent)' : 'var(--muted-fg)',
      }}
    >
      {children}
    </button>
  );
}
